import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/garmin/user";

export const dynamic = "force-dynamic";

const placeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // "YYYY-MM-DD"
});

// Place manuellement une séance sur une date choisie par l'athlète (tableau
// de /training, drag & drop du backlog vers un jour) — même convention de
// date que app/api/training/schedule/route.ts (new Date("YYYY-MM-DD"),
// comparable telle quelle aux bornes de TrainingWeek qui suivent la même
// construction, cf. lib/engine/periodization.ts).
//
// Marque la séance isPinned=true : lib/training/materialize.ts protège alors
// toute la semaine qui la contient contre la régénération automatique, au
// même titre qu'une semaine qui contient une séance déjà loggée.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const parsed = placeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const user = await getDefaultUser();
    const session = await prisma.trainingSession.findFirst({
      where: { id: params.id, week: { plan: { userId: user.id } } },
      include: { week: true },
    });
    if (!session) {
      return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
    }
    if (session.status !== "PLANNED") {
      return NextResponse.json(
        { error: "Impossible de déplacer une séance déjà loggée" },
        { status: 400 }
      );
    }

    const target = new Date(parsed.data.date);
    const targetWeek = await prisma.trainingWeek.findFirst({
      where: { planId: session.week.planId, startDate: { lte: target }, endDate: { gte: target } },
    });
    if (!targetWeek) {
      return NextResponse.json(
        { error: "Cette date est en dehors des semaines du plan" },
        { status: 400 }
      );
    }

    const updated = await prisma.trainingSession.update({
      where: { id: session.id },
      data: { scheduledDate: target, weekId: targetWeek.id, isPinned: true },
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("Erreur placement de séance:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
