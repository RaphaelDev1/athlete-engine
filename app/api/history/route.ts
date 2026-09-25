import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/garmin/user";

export const dynamic = "force-dynamic";

const DEFAULT_RANGE_DAYS = 30;

// Clé de date en calendrier LOCAL — surtout ne pas passer par toISOString()
// ici : pour un fuseau en avance sur UTC (ex. UTC+2), une date locale à
// minuit peut retomber sur la veille en UTC et décaler l'étiquette affichée.
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export interface HistoryDaySessionExercise {
  name: string;
  sets: number | null;
  reps: string | null;
  weight: number | null;
  actualSets: number | null;
  actualReps: number | null;
  actualWeight: number | null;
  actualRPE: number | null;
}

export interface HistoryDaySession {
  id: string;
  sport: string;
  sessionType: string;
  title: string;
  status: string;
  duration: number | null;
  actualDuration: number | null;
  targetDistance: number | null;
  targetRPE: number | null;
  actualRPE: number | null;
  // Détail exercice par exercice (musculation) — utile seulement pour les
  // séances STRENGTH loggées, cf. app/api/training/sessions/[id]/log.
  exercises: HistoryDaySessionExercise[];
}

export interface HistoryDayActivity {
  id: string;
  sport: string;
  name: string;
  distanceMeters: number | null;
  movingTimeSec: number | null;
  avgPaceSecPerKm: number | null;
  avgSpeedKph: number | null;
  avgHeartRate: number | null;
  avgPower: number | null;
  elevationGain: number | null;
  calories: number | null;
}

export interface HistoryDay {
  date: string;
  sessions: HistoryDaySession[];
  // Activités réelles importées d'Intervals.icu (lib/intervals/*) ce jour-là —
  // indépendantes du plan, pour comparer ce qui était prévu à ce qui a été fait.
  activities: HistoryDayActivity[];
  nutrition: { calories: number; protein: number; carbs: number; fat: number } | null;
  weight: number | null;
  checkIn: { energy: number; motivation: number; stress: number; soreness: boolean } | null;
  sleepScore: number | null;
  hrv: number | null;
}

// Vue d'ensemble jour par jour (Phase 6) — regroupe entraînement, nutrition,
// poids, check-in et récupération, désormais tous persistés (voir
// lib/training/materialize.ts pour les séances, app/api/nutrition/day pour la
// nutrition, app/api/weight pour le poids).
//
// Deux conventions d'ancrage de date coexistent dans le schéma existant :
// TrainingSchedule/TrainingSession dérivent d'un `new Date("YYYY-MM-DD")` brut
// (minuit UTC), tandis que WeightLog/DailyCheckIn/NutritionDay utilisent
// `today()` (minuit LOCAL). Plutôt que d'uniformiser tout le schéma (hors
// scope), on interroge avec une marge d'1 jour de chaque côté puis on filtre
// strictement sur la clé de date LOCALE calculée après coup — robuste aux deux
// conventions sans dépendre du fuseau du serveur.
export async function GET(request: NextRequest) {
  const user = await getDefaultUser();
  const params = request.nextUrl.searchParams;
  const to = params.get("to") ? new Date(params.get("to")!) : startOfDay(new Date());
  const from = params.get("from") ? new Date(params.get("from")!) : addDays(to, -(DEFAULT_RANGE_DAYS - 1));
  const fromKey = toDateKey(from);
  const toKey = toDateKey(to);
  const queryFrom = addDays(from, -1);
  const queryTo = addDays(to, 1);
  const sportFilter = params.get("sport");

  const [sessions, activities, nutritionDays, weightLogs, checkIns, sleepData, hrvData] = await Promise.all([
    prisma.trainingSession.findMany({
      where: {
        week: { plan: { userId: user.id } },
        scheduledDate: { gte: queryFrom, lte: queryTo },
        ...(sportFilter ? { sport: sportFilter as never } : {}),
      },
      orderBy: { scheduledDate: "asc" },
      select: {
        id: true,
        sport: true,
        sessionType: true,
        title: true,
        scheduledDate: true,
        duration: true,
        actualDuration: true,
        targetDistance: true,
        status: true,
        actualRPE: true,
        targetRPE: true,
        exercises: {
          orderBy: { orderIndex: "asc" },
          select: {
            name: true,
            sets: true,
            reps: true,
            weight: true,
            actualSets: true,
            actualReps: true,
            actualWeight: true,
            actualRPE: true,
          },
        },
      },
    }),
    prisma.activity.findMany({
      where: {
        userId: user.id,
        startDate: { gte: queryFrom, lte: queryTo },
        ...(sportFilter ? { sport: sportFilter as never } : {}),
      },
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
    prisma.nutritionDay.findMany({ where: { userId: user.id, date: { gte: queryFrom, lte: queryTo } } }),
    prisma.weightLog.findMany({ where: { userId: user.id, date: { gte: queryFrom, lte: queryTo } } }),
    prisma.dailyCheckIn.findMany({ where: { userId: user.id, date: { gte: queryFrom, lte: queryTo } } }),
    prisma.garminData.findMany({
      where: { userId: user.id, dataType: "SLEEP", date: { gte: queryFrom, lte: queryTo } },
    }),
    prisma.garminData.findMany({
      where: { userId: user.id, dataType: "HRV", date: { gte: queryFrom, lte: queryTo } },
    }),
  ]);

  const byDate = new Map<string, HistoryDay>();
  const bucket = (date: Date): HistoryDay => {
    const key = toDateKey(date);
    let day = byDate.get(key);
    if (!day) {
      day = {
        date: key,
        sessions: [],
        activities: [],
        nutrition: null,
        weight: null,
        checkIn: null,
        sleepScore: null,
        hrv: null,
      };
      byDate.set(key, day);
    }
    return day;
  };

  for (let d = new Date(from); toDateKey(d) <= toKey; d = addDays(d, 1)) bucket(d);

  for (const s of sessions) bucket(s.scheduledDate).sessions.push(s);
  for (const a of activities) {
    bucket(a.startDate).activities.push({
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
    });
  }
  for (const n of nutritionDays) {
    bucket(n.date).nutrition = {
      calories: n.calories,
      protein: n.protein,
      carbs: n.carbs,
      fat: n.fat,
    };
  }
  for (const w of weightLogs) bucket(w.date).weight = w.weight;
  for (const c of checkIns) {
    bucket(c.date).checkIn = {
      energy: c.energy,
      motivation: c.motivation,
      stress: c.stress,
      soreness: c.soreness,
    };
  }
  for (const s of sleepData) bucket(s.date).sleepScore = s.summaryValue;
  for (const h of hrvData) bucket(h.date).hrv = h.summaryValue;

  const days = Array.from(byDate.values())
    .filter((d) => d.date >= fromKey && d.date <= toKey)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return NextResponse.json({ data: { from: fromKey, to: toKey, days } });
}
