import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/garmin/user";
import { materializePlan } from "@/lib/training/materialize";

export const dynamic = "force-dynamic";

function daysBetween(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86400000);
}

// Clé de date en calendrier LOCAL — même correctif que app/api/history/route.ts :
// TrainingSession.scheduledDate dérive d'un minuit UTC alors qu'Activity.startDate
// est l'horodatage réel Intervals.icu/Garmin, donc jamais toISOString() ici.
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

interface MatchedActivity {
  name: string;
  movingTimeSec: number | null;
  avgHeartRate: number | null;
  calories: number | null;
  distanceMeters: number | null;
}

// Rattache à chaque séance planifiée l'activité réelle (Intervals.icu/Garmin)
// du même jour et du même sport — pas de lien persisté en base entre
// TrainingSession et Activity, donc on matche ici par (date locale, sport). Une
// activité n'est associée qu'à une seule séance (FIFO par clé) pour éviter
// qu'un doublon de sport le même jour ne soit compté deux fois.
async function matchSessionActivities(
  userId: string,
  sessions: { id: string; sport: string; scheduledDate: Date }[]
): Promise<Map<string, MatchedActivity>> {
  const result = new Map<string, MatchedActivity>();
  if (sessions.length === 0) return result;

  const dates = sessions.map((s) => s.scheduledDate.getTime());
  const from = addDays(new Date(Math.min(...dates)), -1);
  const to = addDays(new Date(Math.max(...dates)), 1);

  const activities = await prisma.activity.findMany({
    where: { userId, startDate: { gte: from, lte: to } },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      sport: true,
      name: true,
      startDate: true,
      movingTimeSec: true,
      avgHeartRate: true,
      calories: true,
      distanceMeters: true,
    },
  });

  const pools = new Map<string, MatchedActivity[]>();
  for (const a of activities) {
    const key = `${toDateKey(a.startDate)}|${a.sport}`;
    const pool = pools.get(key) ?? [];
    pool.push({
      name: a.name,
      movingTimeSec: a.movingTimeSec,
      avgHeartRate: a.avgHeartRate,
      calories: a.calories,
      distanceMeters: a.distanceMeters,
    });
    pools.set(key, pool);
  }

  for (const s of sessions) {
    if (s.sport === "REST") continue;
    const key = `${toDateKey(s.scheduledDate)}|${s.sport}`;
    const pool = pools.get(key);
    const match = pool?.shift();
    if (match) result.set(s.id, match);
  }

  return result;
}

// Lit le plan persisté (lib/training/materialize.ts) — plus aucune génération
// côté client depuis cette route : les séances ont un vrai id DB, modifiable
// via PATCH /api/training/sessions/[id].
export async function GET() {
  const user = await getDefaultUser();
  const { plan, generated } = await materializePlan(user.id);

  const weeks = await prisma.trainingWeek.findMany({
    where: { planId: plan.id },
    orderBy: { weekNumber: "asc" },
    include: {
      sessions: {
        orderBy: { scheduledDate: "asc" },
        include: { exercises: { orderBy: { orderIndex: "asc" } } },
      },
    },
  });

  // macroPhase/phase/plannedTests ne sont pas persistés (dérivables uniquement
  // de weekNumber + totalWeeks + goalType) — on les récupère depuis la
  // régénération pure faite par materializePlan, indexée par numéro de semaine.
  const metaByWeekNumber = new Map(generated.weeks.map((w) => [w.weekNumber, w]));

  const allSessions = weeks.flatMap((w) => w.sessions);
  const activityBySessionId = await matchSessionActivities(user.id, allSessions);

  return NextResponse.json({
    data: {
      plan: {
        id: plan.id,
        name: plan.name,
        startDate: plan.startDate,
        endDate: plan.endDate,
        totalWeeks: generated.totalWeeks,
        goalType: generated.goalType,
      },
      weeks: weeks.map((week) => {
        const meta = metaByWeekNumber.get(week.weekNumber);
        return {
          id: week.id,
          weekNumber: week.weekNumber,
          weekType: week.weekType,
          targetVolume: week.targetVolume,
          startDate: week.startDate,
          endDate: week.endDate,
          phase: meta?.phase ?? null,
          macroPhase: meta?.macroPhase ?? null,
          plannedTests: meta?.plannedTests ?? [],
          sessions: week.sessions.map((s) => ({
            id: s.id,
            sport: s.sport,
            sessionType: s.sessionType,
            title: s.title,
            description: s.description,
            scheduledDate: s.scheduledDate,
            dayOfWeek: daysBetween(week.startDate, s.scheduledDate),
            duration: s.duration,
            actualDuration: s.actualDuration,
            targetDistance: s.targetDistance,
            targetPace: s.targetPace,
            targetZone: s.targetZone,
            targetRPE: s.targetRPE,
            actualRPE: s.actualRPE,
            status: s.status,
            isPinned: s.isPinned,
            activity: activityBySessionId.get(s.id) ?? null,
            notes: s.notes,
            structure: (s.structure as string[] | null) ?? [],
            exercises: s.exercises.map((ex) => ({
              name: ex.name,
              sets: ex.sets,
              reps: ex.reps,
              targetRPE: ex.targetRPE,
              restSeconds: ex.restSeconds,
              notes: ex.notes,
            })),
          })),
        };
      }),
    },
  });
}
