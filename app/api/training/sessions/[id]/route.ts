import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/garmin/user";
import { sessionLogSchema } from "@/lib/validations/sessionLog";
import { buildSessionVigilanceReason } from "@/lib/engine/weekReview";
import { persistNotifications } from "@/lib/notifications/store";
import { isImprovement, PrEvent } from "@/lib/engine/adaptation";
import { buildPrNotifications } from "@/lib/engine/notifications";
import { latestRecord, TEST_RESULT_FIELDS } from "@/lib/profile/records";

export interface TestResultDelta {
  exercise: string;
  unit: string;
  previousValue: number | null;
  newValue: number;
  improved: boolean;
}

// Enregistre le résultat chiffré d'un test (lib/profile/records.ts::TEST_RESULT_FIELDS)
// comme PersonalRecord — toujours créé (même en cas de contre-performance,
// pour tracer l'évolution réelle), avec notification de PR uniquement si
// c'est une amélioration vs le dernier test du même exercice.
async function recordTestResults(
  userId: string,
  sessionScheduledDate: Date,
  testResult: Record<string, number>
): Promise<TestResultDelta[]> {
  const profile = await prisma.athleteProfile.findUnique({
    where: { userId },
    include: { personalRecords: true },
  });
  if (!profile) return [];

  const deltas: TestResultDelta[] = [];
  const prEvents: PrEvent[] = [];

  for (const [key, value] of Object.entries(testResult)) {
    const field = TEST_RESULT_FIELDS[key];
    if (!field || value === undefined) continue;

    const previous = latestRecord(profile.personalRecords, field.discipline, field.exercise);
    const created = await prisma.personalRecord.create({
      data: {
        profileId: profile.id,
        discipline: field.discipline,
        exercise: field.exercise,
        value,
        unit: field.unit,
        achievedAt: sessionScheduledDate,
      },
    });

    const improved = !previous || isImprovement(field.unit, previous.value, value);
    deltas.push({
      exercise: field.exercise,
      unit: field.unit,
      previousValue: previous?.value ?? null,
      newValue: value,
      improved,
    });
    if (improved) {
      prEvents.push({
        recordId: created.id,
        discipline: field.discipline,
        exercise: field.exercise,
        previousValue: previous?.value ?? null,
        newValue: value,
        unit: field.unit,
      });
    }

    if (key === "ftp") {
      await prisma.athleteProfile.update({
        where: { id: profile.id },
        data: { ftp: Math.round(value) },
      });
    }
  }

  if (prEvents.length > 0) {
    await persistNotifications(userId, buildPrNotifications(prEvents));
  }

  return deltas;
}

export const dynamic = "force-dynamic";

// Clé de date en calendrier LOCAL — même convention que app/api/history/route.ts
// (jamais toISOString() ici, cf. son commentaire pour le pourquoi).
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Détail d'une séance persistée, enrichi des activités Intervals.icu réelles
// du même jour (même sport en priorité, sinon toutes celles du jour — utile
// pour les brick ou les écarts de mapping sport) — cf. bouton "voir sur
// Intervals.icu" de SessionDetailModal.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getDefaultUser();
  const session = await prisma.trainingSession.findFirst({
    where: { id: params.id, week: { plan: { userId: user.id } } },
    include: { exercises: { orderBy: { orderIndex: "asc" } } },
  });
  if (!session) {
    return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
  }

  const dayBefore = new Date(session.scheduledDate);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const dayAfter = new Date(session.scheduledDate);
  dayAfter.setDate(dayAfter.getDate() + 2);
  const targetKey = toDateKey(session.scheduledDate);

  const sameDayActivities = await prisma.activity.findMany({
    where: { userId: user.id, startDate: { gte: dayBefore, lt: dayAfter } },
    orderBy: { startDate: "asc" },
  });
  const activitiesThatDay = sameDayActivities.filter((a) => toDateKey(a.startDate) === targetKey);
  const sportMatches = activitiesThatDay.filter((a) => a.sport === session.sport);

  return NextResponse.json({
    data: session,
    activities: sportMatches.length > 0 ? sportMatches : activitiesThatDay,
  });
}

// Marquer une séance persistée (Phase 2) — Fait / Partiel / Raté, avec RPE
// ressenti et durée réelle. C'est ce qui rend l'historique et la boucle
// d'adaptation (lib/engine/weekReview.ts, déclenchée depuis
// lib/training/materialize.ts) possibles : avant cette route, aucune séance
// n'était jamais persistée (voir lib/training/materialize.ts pour le contexte).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const parsed = sessionLogSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const user = await getDefaultUser();
    const data = parsed.data;

    const session = await prisma.trainingSession.findFirst({
      where: { id: params.id, week: { plan: { userId: user.id } } },
    });
    if (!session) {
      return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
    }

    const updated = await prisma.trainingSession.update({
      where: { id: session.id },
      data: {
        status: data.status,
        actualDuration: data.actualDuration,
        actualRPE: data.actualRPE,
        notes: data.notes,
      },
    });

    const vigilanceReason = buildSessionVigilanceReason({
      title: session.title,
      status: data.status,
      targetRPE: session.targetRPE,
      actualRPE: data.actualRPE,
    });
    if (vigilanceReason) {
      await persistNotifications(user.id, [
        {
          type: "OVERTRAINING_ALERT",
          severity: "WARNING",
          title: "Vigilance sur la séance loggée",
          message: vigilanceReason,
          relatedEntityId: `session-vigilance-${session.id}`,
        },
      ]);
    }

    const testDeltas =
      data.testResult && Object.keys(data.testResult).length > 0
        ? await recordTestResults(user.id, session.scheduledDate, data.testResult)
        : [];

    return NextResponse.json({ data: updated, testDeltas });
  } catch (err) {
    console.error("Erreur log de séance:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
