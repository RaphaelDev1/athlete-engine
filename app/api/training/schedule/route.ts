import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/garmin/user";
import { getOrCreateSchedule } from "@/lib/training/schedule";
import { materializePlan } from "@/lib/training/materialize";
import { scheduleSchema } from "@/lib/validations/schedule";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getDefaultUser();
  const schedule = await getOrCreateSchedule(user.id);
  return NextResponse.json({ data: schedule });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const parsed = scheduleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const user = await getDefaultUser();
    const existing = await getOrCreateSchedule(user.id);

    const newStartDate = new Date(data.startDate);
    // Choisir une nouvelle date de début redéfinit l'ancrage du plan : les
    // reports en cascade précédents (shiftDays, posés via "Reporter les
    // séances du jour au lendemain") ne doivent pas continuer à s'appliquer
    // par-dessus une date que l'athlète vient de fixer explicitement.
    const startDateChanged = newStartDate.getTime() !== existing.startDate.getTime();

    const updated = await prisma.trainingSchedule.update({
      where: { userId: user.id },
      data: {
        goalType: data.goalType,
        totalWeeks: data.totalWeeks,
        startDate: newStartDate,
        raceDate: data.raceDate ? new Date(data.raceDate) : null,
        vacationMode: data.vacationMode,
        availableDays: data.availableDays,
        weeklyTimeBudgetMin: data.weeklyTimeBudgetMin,
        ...(startDateChanged ? { shiftDays: 0 } : {}),
      },
    });

    await materializePlan(user.id);

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("Erreur sauvegarde config du plan:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
