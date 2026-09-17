import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AdaptationActionType } from "@/lib/engine/adaptation";
import { getDefaultUser } from "@/lib/garmin/user";
import { postponeSchedule } from "@/lib/training/schedule";

interface ApplyActionBody {
  type: AdaptationActionType;
  sessionId?: string;
  multiplier?: number;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ApplyActionBody;

    if (body.type === "POSTPONE_SESSION") {
      // Report en cascade : décale tout le reste du plan d'un jour (voir
      // lib/training/schedule.ts) — le plan étant calculé à la volée, il n'y
      // a pas de séance individuelle à mettre à jour en base.
      const user = await getDefaultUser();
      const schedule = await postponeSchedule(user.id);
      return NextResponse.json({ data: schedule });
    }

    if (body.type === "REDUCE_VOLUME") {
      if (!body.sessionId) {
        return NextResponse.json({ error: "sessionId requis" }, { status: 400 });
      }
      const session = await prisma.trainingSession.findUnique({
        where: { id: body.sessionId },
      });
      if (!session) {
        return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
      }
      const multiplier = body.multiplier ?? 0.75;
      const updated = await prisma.trainingSession.update({
        where: { id: body.sessionId },
        data: {
          duration: session.duration ? Math.round(session.duration * multiplier) : null,
          targetDistance: session.targetDistance
            ? Math.round(session.targetDistance * multiplier * 10) / 10
            : null,
          notes: [session.notes, `Volume réduit (×${multiplier}) — signaux de fatigue`]
            .filter(Boolean)
            .join(" — "),
        },
      });
      return NextResponse.json({ data: updated });
    }

    if (body.type === "CANCEL_SESSION") {
      if (!body.sessionId) {
        return NextResponse.json({ error: "sessionId requis" }, { status: 400 });
      }
      const session = await prisma.trainingSession.findUnique({
        where: { id: body.sessionId },
      });
      if (!session) {
        return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
      }
      const updated = await prisma.trainingSession.update({
        where: { id: body.sessionId },
        data: {
          status: "SKIPPED",
          notes: [session.notes, "Annulée — signaux de récupération trop faibles"]
            .filter(Boolean)
            .join(" — "),
        },
      });
      return NextResponse.json({ data: updated });
    }

    if (body.type === "RECALC_ZONES") {
      // Les zones sont recalculées à la volée depuis le profil (computeAthleteZones) —
      // rien à persister, l'action confirme simplement la prise en compte du PR.
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Type d'action inconnu" }, { status: 400 });
  } catch (err) {
    console.error("Erreur application action d'adaptation:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
