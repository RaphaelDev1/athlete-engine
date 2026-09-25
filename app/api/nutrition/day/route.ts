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

// Clé de date en calendrier LOCAL — même correctif que app/api/history/route.ts :
// Activity.startDate est l'horodatage réel Intervals.icu/Garmin (pas un minuit
// UTC brut comme `date` ci-dessus), donc jamais toISOString() ici.
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Historise la cible nutritionnelle du jour (Phase 4/6) — jusqu'ici purement
// calculée côté client (app/nutrition/page.tsx) et jamais persistée, ce qui
// rendait tout historique nutrition impossible (voir /api/history, Phase 6).
//
// `days` renvoie l'historique des N derniers jours (badEating notamment,
// utilisé par /recovery pour la corrélation sommeil/stress/écarts
// alimentaires) plutôt qu'un seul jour ciblé par `date`.
export async function GET(request: NextRequest) {
  const user = await getDefaultUser();
  const daysParam = request.nextUrl.searchParams.get("days");

  if (daysParam) {
    const since = new Date();
    since.setDate(since.getDate() - Number(daysParam));
    const history = await prisma.nutritionDay.findMany({
      where: { userId: user.id, date: { gte: since } },
      orderBy: { date: "asc" },
    });
    return NextResponse.json({ history });
  }

  const date = parseDateParam(request.nextUrl.searchParams.get("date"));
  const dateKey = toDateKey(date);
  const queryFrom = new Date(date);
  queryFrom.setDate(queryFrom.getDate() - 1);
  const queryTo = new Date(date);
  queryTo.setDate(queryTo.getDate() + 1);

  const [day, activitiesRaw] = await Promise.all([
    prisma.nutritionDay.findUnique({
      where: { userId_date: { userId: user.id, date } },
    }),
    // Activités réelles (Intervals.icu/Garmin) du jour affiché — pour montrer
    // tout ce qui a été fait ce jour-là (y compris hors plan, ex. padel), pas
    // seulement les séances planifiées. Marge d'1 jour de chaque côté puis
    // filtre sur la clé de date LOCALE, cf. toDateKey ci-dessus.
    prisma.activity.findMany({
      where: { userId: user.id, startDate: { gte: queryFrom, lte: queryTo } },
      orderBy: { startDate: "asc" },
      select: {
        id: true,
        sport: true,
        name: true,
        startDate: true,
        distanceMeters: true,
        movingTimeSec: true,
        avgPaceSecPerKm: true,
        avgSpeedKph: true,
        avgHeartRate: true,
        avgPower: true,
        elevationGain: true,
        calories: true,
      },
    }),
  ]);

  const activities = activitiesRaw
    .filter((a) => toDateKey(a.startDate) === dateKey)
    .map((a) => ({
      id: a.id,
      sport: a.sport,
      name: a.name,
      distanceMeters: a.distanceMeters,
      movingTimeSec: a.movingTimeSec,
      avgPaceSecPerKm: a.avgPaceSecPerKm,
      avgSpeedKph: a.avgSpeedKph,
      avgHeartRate: a.avgHeartRate,
      avgPower: a.avgPower,
      elevationGain: a.elevationGain,
      calories: a.calories,
    }));

  return NextResponse.json({ data: day, activities });
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
  actualIntakeNotes: z.string().max(1000).nullable().optional(),
  actualCalories: z.number().min(0).max(20000).nullable().optional(),
  badEating: z.boolean().optional(),
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
        // undefined (champ omis par l'appelant) laisse la valeur existante
        // intacte — permet à la sauvegarde auto des cibles macros de ne pas
        // écraser une note ou des calories déjà saisies par l'athlète, cf.
        // app/nutrition/page.tsx.
        actualIntakeNotes: data.actualIntakeNotes,
        actualCalories: data.actualCalories,
        badEating: data.badEating,
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
        actualIntakeNotes: data.actualIntakeNotes ?? null,
        actualCalories: data.actualCalories ?? null,
        badEating: data.badEating ?? false,
      },
    });

    return NextResponse.json({ data: day });
  } catch (err) {
    console.error("Erreur sauvegarde nutrition du jour:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
