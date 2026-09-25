import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/garmin/user";
import { getGarminSummary } from "@/lib/garmin/summary";
import { computeAthleteZones } from "@/lib/engine/zones";
import { computeRecoveryStatus } from "@/lib/engine/garminAdaptation";
import {
  blendReadiness,
  buildAdaptationActions,
  computeTrainingLoad,
} from "@/lib/engine/adaptation";
import { buildOvertrainingAlert, buildSleepAlert } from "@/lib/engine/notifications";
import { persistNotifications } from "@/lib/notifications/store";
import { readinessToAthleteState } from "@/lib/engine/labels";
import { materializePlan } from "@/lib/training/materialize";
import { getOrCreateSchedule } from "@/lib/training/schedule";
import { isIntervalsConfigured } from "@/lib/intervals/config";
import { isGarminConfigured } from "@/lib/garmin/client";
import { latestRecord, SWIMMING_PR_FIELDS } from "@/lib/profile/records";
import { categorizeSport } from "@/lib/training/sportCategory";
import { Sport } from "@/lib/types";
import {
  predict5kFromVdot,
  predictSwim750m,
  predictBikeTime20km,
  projectStrengthPR,
  StrengthProjection,
} from "@/lib/engine/predictions";

export const dynamic = "force-dynamic";

const TREND_DAYS = 30;
const LOAD_WINDOW_DAYS = 28;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Lundi 00:00 de la semaine en cours — même convention jour-de-semaine que
// lib/training/schedule.ts (0 = lundi).
function startOfWeek(date: Date): Date {
  const d = startOfToday();
  d.setTime(date.getTime());
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day + 6) % 7; // lundi = 0
  d.setDate(d.getDate() - diff);
  return d;
}

interface ActivitySportSummary {
  sport: string;
  sessions: number;
  totalDistanceKm: number | null;
  totalDurationMin: number | null;
  avgPaceSecPerKm: number | null;
  avgSpeedKph: number | null;
}

function summarizeActivitiesBySport(
  activities: {
    sport: string;
    movingTimeSec: number | null;
    distanceMeters: number | null;
  }[]
): ActivitySportSummary[] {
  const groups = new Map<string, typeof activities>();
  for (const a of activities) {
    const list = groups.get(a.sport) ?? [];
    list.push(a);
    groups.set(a.sport, list);
  }

  return Array.from(groups.entries()).map(([sport, list]) => {
    const totalDistanceMeters = list.reduce((sum, a) => sum + (a.distanceMeters ?? 0), 0);
    const totalTimeSec = list.reduce((sum, a) => sum + (a.movingTimeSec ?? 0), 0);
    const totalDistanceKm = totalDistanceMeters > 0 ? totalDistanceMeters / 1000 : null;

    const isPaceSport = sport === "RUNNING" || sport === "SWIMMING";
    const avgPaceSecPerKm =
      isPaceSport && totalDistanceKm && totalTimeSec > 0 ? totalTimeSec / totalDistanceKm : null;
    const avgSpeedKph =
      sport === "CYCLING" && totalDistanceKm && totalTimeSec > 0
        ? totalDistanceKm / (totalTimeSec / 3600)
        : null;

    return {
      sport,
      sessions: list.length,
      totalDistanceKm,
      totalDurationMin: totalTimeSec > 0 ? Math.round(totalTimeSec / 60) : null,
      avgPaceSecPerKm,
      avgSpeedKph,
    };
  });
}

// Catégories affichées dans "Activités récentes" — plus fines que
// SportCategory (lib/training/sportCategory.ts), qui regroupe course/vélo/
// natation sous un même "ENDURANCE" : ici on les sépare pour le volume
// hebdo/l'historique par sport demandés sur le dashboard.
type DashboardActivityCategory =
  | "RUNNING"
  | "CYCLING"
  | "SWIMMING"
  | "RACQUET"
  | "STRENGTH"
  | "OUTDOOR"
  | "OTHER";

const DASHBOARD_CATEGORY_LABELS: Record<DashboardActivityCategory, string> = {
  RUNNING: "Course",
  CYCLING: "Vélo",
  SWIMMING: "Natation",
  RACQUET: "Sports de raquette",
  STRENGTH: "Musculation",
  OUTDOOR: "Plein air",
  OTHER: "Autre",
};

// Toujours affichées même sans activité récente (demandées explicitement) ;
// les autres catégories n'apparaissent que si elles ont au moins une activité.
const DASHBOARD_CATEGORY_ALWAYS_SHOWN: DashboardActivityCategory[] = [
  "RUNNING",
  "CYCLING",
  "SWIMMING",
  "RACQUET",
];

function dashboardActivityCategory(sport: string, name?: string | null): DashboardActivityCategory {
  if (sport === "RUNNING" || sport === "CYCLING" || sport === "SWIMMING" || sport === "STRENGTH") {
    return sport;
  }
  const category = categorizeSport(sport as Sport, name);
  if (category === "RACQUET" || category === "OUTDOOR") return category;
  return "OTHER";
}

interface RecentActivity {
  id: string;
  sport: string;
  name: string | null;
  startDate: Date;
  distanceMeters: number | null;
  movingTimeSec: number | null;
  avgPaceSecPerKm: number | null;
  avgSpeedKph: number | null;
  avgHeartRate: number | null;
  avgPower: number | null;
  elevationGain: number | null;
  calories: number | null;
}

function groupByExercise(
  records: { exercise: string; achievedAt: Date | null; createdAt: Date; value: number }[]
): Map<string, { achievedAt: Date; value: number }[]> {
  const groups = new Map<string, { achievedAt: Date; value: number }[]>();
  for (const r of records) {
    const list = groups.get(r.exercise) ?? [];
    list.push({ achievedAt: r.achievedAt ?? r.createdAt, value: r.value });
    groups.set(r.exercise, list);
  }
  return groups;
}

function sevenDayAvg(trend: { date: Date; value: number | null }[]): number | null {
  const last7 = trend.slice(-7).filter((d) => d.value !== null);
  if (last7.length === 0) return null;
  return last7.reduce((sum, d) => sum + (d.value ?? 0), 0) / last7.length;
}

// Clé "année-semaine ISO" — dédoublonne le rappel de pesée à une fois par
// semaine (lib/notifications/store.ts dédoublonne par relatedEntityId).
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
}

export async function GET() {
  const user = await getDefaultUser();

  // Matérialise/synchronise le plan persisté (lib/training/materialize.ts) —
  // c'est aussi ce qui déclenche la revue hebdomadaire de la boucle
  // d'adaptation progressive (lib/engine/weekReview.ts) quand une semaine
  // vient de se terminer.
  await materializePlan(user.id);

  const profile = await prisma.athleteProfile.findUnique({
    where: { userId: user.id },
    include: { personalRecords: true },
  });

  const loadSince = new Date();
  loadSince.setDate(loadSince.getDate() - LOAD_WINDOW_DAYS);
  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekStart = startOfWeek(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [
    weightHistory,
    vo2maxHistory,
    restingHrHistory,
    checkInToday,
    garmin,
    loadSessions,
    recentSessions,
    todaySessions,
    nextSession,
    weekActivities,
    recentActivitiesRaw,
  ] = await Promise.all([
    prisma.weightLog.findMany({
      where: { userId: user.id, date: { gte: new Date(Date.now() - 90 * 86400000) } },
      orderBy: { date: "asc" },
    }),
    prisma.garminData.findMany({
      where: {
        userId: user.id,
        dataType: "VO2MAX",
        date: { gte: new Date(Date.now() - 90 * 86400000) },
      },
      orderBy: { date: "asc" },
    }),
    prisma.garminData.findMany({
      where: {
        userId: user.id,
        dataType: "RESTING_HR",
        date: { gte: new Date(Date.now() - 90 * 86400000) },
      },
      orderBy: { date: "asc" },
    }),
    prisma.dailyCheckIn.findUnique({
      where: { userId_date: { userId: user.id, date: today } },
    }),
    getGarminSummary(user.id, TREND_DAYS),
    prisma.trainingSession.findMany({
      where: {
        week: { plan: { userId: user.id } },
        status: "COMPLETED",
        scheduledDate: { gte: loadSince },
      },
      select: { scheduledDate: true, actualDuration: true, actualRPE: true, targetRPE: true },
    }),
    prisma.trainingSession.findMany({
      where: {
        week: { plan: { userId: user.id } },
        status: { in: ["COMPLETED", "SKIPPED", "PARTIAL"] },
      },
      orderBy: { scheduledDate: "desc" },
      take: 5,
    }),
    prisma.trainingSession.findMany({
      where: {
        week: { plan: { userId: user.id } },
        status: "PLANNED",
        scheduledDate: { gte: today, lt: tomorrow },
      },
      select: { id: true, sport: true, sessionType: true, title: true },
    }),
    prisma.trainingSession.findFirst({
      where: {
        week: { plan: { userId: user.id } },
        status: "PLANNED",
        sport: { not: "REST" },
        scheduledDate: { gte: today },
      },
      orderBy: { scheduledDate: "asc" },
      select: { id: true, title: true, sport: true, scheduledDate: true, duration: true, targetDistance: true },
    }),
    prisma.activity.findMany({
      where: { userId: user.id, startDate: { gte: weekStart, lt: weekEnd } },
      select: { sport: true, movingTimeSec: true, distanceMeters: true },
    }),
    prisma.activity.findMany({
      where: { userId: user.id },
      orderBy: { startDate: "desc" },
      take: 300,
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

  const trainingLoad = computeTrainingLoad(
    loadSessions.map((s) => ({
      date: s.scheduledDate,
      actualDuration: s.actualDuration,
      actualRPE: s.actualRPE,
      targetRPE: s.targetRPE,
    }))
  );

  const baseGarminStatus =
    "recoveryStatus" in garmin
      ? garmin.recoveryStatus
      : computeRecoveryStatus({
          trainingReadinessScore: null,
          sleepScore: null,
          hrvLastNight: null,
          hrv7dAvg: null,
          bodyBattery: null,
          stressAvg: null,
          loadRatio: null,
        });

  const readiness = blendReadiness(
    baseGarminStatus,
    checkInToday
      ? {
          energy: checkInToday.energy,
          soreness: checkInToday.soreness,
          motivation: checkInToday.motivation,
          stress: checkInToday.stress,
          sleepQuality: checkInToday.sleepQuality,
          napTaken: checkInToday.napTaken,
        }
      : null,
    trainingLoad.ratio
  );

  const recentPr = profile?.personalRecords.some(
    (r) => r.achievedAt && Date.now() - r.achievedAt.getTime() < 7 * 86400000
  ) ?? false;

  const adaptationActions = buildAdaptationActions(readiness, todaySessions, recentPr);

  // Génère les notifications (sommeil / surmenage) — la célébration de PR est
  // déjà générée au moment de la sauvegarde du profil (app/api/profile/route.ts).
  if ("sleepTrend" in garmin) {
    const sleepAlert = buildSleepAlert(garmin.sleep?.score ?? null, sevenDayAvg(garmin.sleepTrend));
    if (sleepAlert) await persistNotifications(user.id, [sleepAlert]);
  }
  const overtrainingAlert = buildOvertrainingAlert(readiness, trainingLoad.ratio);
  if (overtrainingAlert) await persistNotifications(user.id, [overtrainingAlert]);

  const lastWeightLogDate = weightHistory.length > 0 ? weightHistory[weightHistory.length - 1].date : null;
  const daysSinceLastWeighIn = lastWeightLogDate
    ? Math.floor((today.getTime() - lastWeightLogDate.getTime()) / 86400000)
    : null;
  if (daysSinceLastWeighIn === null || daysSinceLastWeighIn >= 7) {
    await persistNotifications(user.id, [
      {
        type: "WEIGH_IN_REMINDER",
        severity: "INFO",
        title: "Pesée hebdomadaire",
        message: "Ça fait une semaine (ou plus) — pense à te peser pour garder le suivi à jour.",
        relatedEntityId: `weigh-in-${isoWeekKey(today)}`,
      },
    ]);
  }

  const zones = profile
    ? computeAthleteZones({
        restingHR: profile.restingHR,
        maxHR: profile.maxHR,
        vo2max: profile.vo2max,
        thresholdPace: profile.thresholdPace,
        ftp: profile.ftp,
      })
    : null;

  // Repli Garmin : si le profil n'a pas été renseigné à la main, on affiche la
  // dernière valeur synchronisée plutôt qu'un tiret (VO2max était déjà
  // synchronisé mais jamais utilisé comme repli ; la FC repos n'était même pas
  // récupérée depuis Garmin — voir lib/garmin/pull.ts::fetchRestingHr).
  const garminVo2max = "vo2max" in garmin ? garmin.vo2max?.value ?? null : null;
  const garminRestingHR = "restingHR" in garmin ? garmin.restingHR?.value ?? null : null;

  // Horizon de projection des PR potentiels : jusqu'à la course visée si elle
  // est définie, sinon un mésocycle standard (8 semaines).
  const schedule = await getOrCreateSchedule(user.id);
  const horizonDays = schedule.raceDate
    ? Math.max(14, Math.round((schedule.raceDate.getTime() - today.getTime()) / 86400000))
    : 56;

  const swim400mSec = profile
    ? latestRecord(profile.personalRecords, "SWIMMING", SWIMMING_PR_FIELDS.pr400mSwim)?.value ?? null
    : null;

  const strengthRecords = profile?.personalRecords.filter((r) => r.discipline === "STRENGTH") ?? [];
  const strengthProjections: StrengthProjection[] = Array.from(
    groupByExercise(strengthRecords).entries()
  )
    .map(([exercise, points]) => projectStrengthPR(exercise, points, horizonDays))
    .filter((p): p is StrengthProjection => p !== null);

  const predictions = {
    horizonDays,
    run5kSec: predict5kFromVdot(zones?.vdot ?? null),
    swim750mSec: predictSwim750m(profile?.swimPace100m ?? null, swim400mSec),
    bike20kSec: predictBikeTime20km(profile?.ftp ?? null, profile?.weight ?? null),
    strength: strengthProjections,
  };

  const recentActivities: RecentActivity[] = recentActivitiesRaw as RecentActivity[];

  const activitiesByCategory = new Map<DashboardActivityCategory, RecentActivity[]>();
  for (const activity of recentActivities) {
    const category = dashboardActivityCategory(activity.sport, activity.name);
    const list = activitiesByCategory.get(category) ?? [];
    if (list.length < 5) list.push(activity);
    activitiesByCategory.set(category, list);
  }
  const categoryOrder: DashboardActivityCategory[] = [
    "RUNNING",
    "CYCLING",
    "SWIMMING",
    "RACQUET",
    "STRENGTH",
    "OUTDOOR",
    "OTHER",
  ];
  const recentActivitiesByCategory = categoryOrder
    .filter(
      (category) =>
        DASHBOARD_CATEGORY_ALWAYS_SHOWN.includes(category) ||
        (activitiesByCategory.get(category)?.length ?? 0) > 0
    )
    .map((category) => ({
      category,
      label: DASHBOARD_CATEGORY_LABELS[category],
      activities: activitiesByCategory.get(category) ?? [],
    }));

  return NextResponse.json({
    profile: profile
      ? {
          weight: profile.weight,
          vo2max: profile.vo2max ?? garminVo2max,
          restingHR: profile.restingHR ?? garminRestingHR,
          weeklyVolume: profile.weeklyVolume,
        }
      : { weight: null, vo2max: garminVo2max, restingHR: garminRestingHR, weeklyVolume: null },
    zones,
    weightHistory: weightHistory.map((w) => ({ date: w.date, value: w.weight })),
    vo2maxHistory: vo2maxHistory.map((v) => ({ date: v.date, value: v.summaryValue })),
    restingHrHistory: restingHrHistory.map((v) => ({ date: v.date, value: v.summaryValue })),
    personalRecords: profile?.personalRecords ?? [],
    garmin,
    trainingLoad,
    readiness: {
      level: readiness.level,
      athleteState: readinessToAthleteState(readiness.level),
      loadMultiplier: readiness.loadMultiplier,
      reasons: readiness.reasons,
    },
    checkInToday,
    adaptationActions,
    predictions,
    nextSession: nextSession ? { ...nextSession, status: "PLANNED" as const } : null,
    recentSessions,
    lastWeightLogDate,
    activitiesThisWeek: summarizeActivitiesBySport(weekActivities),
    recentActivities: recentActivities.slice(0, 5),
    // Tableau complet pour la carte "Séances de la semaine" — contrairement à
    // activitiesThisWeek (agrégat, vide sans activité cette semaine),
    // toujours peuplé dès qu'il existe un historique, avec un filtre par
    // sport côté client (cf. components/dashboard/DashboardContent.tsx).
    recentActivitiesTable: recentActivities.slice(0, 25),
    recentActivitiesByCategory,
    intervals: {
      configured: isIntervalsConfigured(),
      lastSyncAt: user.intervalsLastSyncAt,
      lastSyncStatus: user.intervalsLastSyncStatus,
      lastSyncError: user.intervalsLastSyncError,
    },
    garminStatus: {
      configured: isGarminConfigured(),
      lastSyncAt: user.garminLastSyncAt,
      lastSyncStatus: user.garminLastSyncStatus,
      lastSyncError: user.garminLastSyncError,
    },
  });
}
