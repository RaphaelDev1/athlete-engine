import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/garmin/user";

export const dynamic = "force-dynamic";

// "YYYY-MM-DD" explicite -> minuit UTC brut, cohérent avec la convention déjà
// utilisée pour TrainingSchedule/TrainingSession (voir
// app/api/training/schedule/route.ts) ; seul le repli "aujourd'hui" (pas de
// paramètre) a besoin d'un floor en heure LOCALE.
function parseDateParam(value: string | null): Date {
  if (value) return new Date(value);
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Historise la cible nutritionnelle du jour (Phase 4/6) — jusqu'ici purement
// calculée côté client (app/nutrition/page.tsx) et jamais persistée, ce qui
// rendait tout historique nutrition impossible (voir /api/history, Phase 6).
export async function GET(request: NextRequest) {
  const user = await getDefaultUser();
  const date = parseDateParam(request.nextUrl.searchParams.get("date"));

  const day = await prisma.nutritionDay.findUnique({
    where: { userId_date: { userId: user.id, date } },
  });

  return NextResponse.json({ data: day });
}

const nutritionDaySchema = z.object({
  date: z.string(),
  bmr: z.number(),
  tdee: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  calories: z.number(),
  isTrainingDay: z.boolean(),
  trainingType: z.string().nullable(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = nutritionDaySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const user = await getDefaultUser();
    const data = parsed.data;
    const date = parseDateParam(data.date);

    const day = await prisma.nutritionDay.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: {
        bmr: data.bmr,
        tdee: data.tdee,
        protein: data.protein,
        carbs: data.carbs,
        fat: data.fat,
        calories: data.calories,
        isTrainingDay: data.isTrainingDay,
        trainingType: data.trainingType,
      },
      create: {
        userId: user.id,
        date,
        bmr: data.bmr,
        tdee: data.tdee,
        protein: data.protein,
        carbs: data.carbs,
        fat: data.fat,
        calories: data.calories,
        isTrainingDay: data.isTrainingDay,
        trainingType: data.trainingType,
      },
    });

    return NextResponse.json({ data: day });
  } catch (err) {
    console.error("Erreur sauvegarde nutrition du jour:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
