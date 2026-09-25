// Agrégation des données Garmin (sommeil, HRV, Body Battery, Training
// Readiness, stress, VO2max) — extrait de app/api/garmin/summary/route.ts
// pour être réutilisé tel quel par l'endpoint dashboard (Phase 4), qui a
// besoin d'une fenêtre de tendance plus large (30j) que /recovery (7j).

import { GarminData } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeRecoveryStatus } from "@/lib/engine/garminAdaptation";
import { GarminDataType } from "@/lib/types";

async function latestByType(userId: string, dataType: GarminDataType) {
  return prisma.garminData.findFirst({
    where: { userId, dataType },
    orderBy: { date: "desc" },
  });
}

export interface GarminSummary {
  connected: boolean;
  sleep: {
    score: number | null;
    date: Date;
    payload: Record<string, unknown>;
  } | null;
  hrv: {
    latest: number | null;
    sevenDayAvg: number | null;
    trend: { date: Date; value: number | null }[];
  };
  sleepTrend: { date: Date; value: number | null; napMinutes: number | null }[];
  stressTrend: { date: Date; value: number | null }[];
  bodyBattery: { value: number | null; date: Date } | null;
  trainingReadiness: {
    score: number | null;
    level: string | null;
    feedback: string | null;
    date: Date;
  } | null;
  stress: { value: number | null; date: Date } | null;
  vo2max: { value: number | null; date: Date } | null;
  restingHR: { value: number | null; date: Date } | null;
  recoveryStatus: ReturnType<typeof computeRecoveryStatus>;
}

/** `trendDays` contrôle la fenêtre des tendances HRV/sommeil (7j pour /recovery, 30j pour le dashboard). */
export async function getGarminSummary(
  userId: string,
  trendDays: number = 7
): Promise<GarminSummary | { connected: false }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.garminLastSyncAt) {
    return { connected: false };
  }

  const since = new Date();
  since.setDate(since.getDate() - trendDays);

  const [
    sleep,
    hrvLatest,
    hrvTrend,
    sleepTrend,
    stressTrend,
    bodyBattery,
    trainingReadiness,
    stress,
    vo2max,
    restingHR,
  ] = await Promise.all([
      latestByType(userId, "SLEEP"),
      latestByType(userId, "HRV"),
      prisma.garminData.findMany({
        where: { userId, dataType: "HRV", date: { gte: since } },
        orderBy: { date: "asc" },
      }),
      prisma.garminData.findMany({
        where: { userId, dataType: "SLEEP", date: { gte: since } },
        orderBy: { date: "asc" },
      }),
      prisma.garminData.findMany({
        where: { userId, dataType: "STRESS", date: { gte: since } },
        orderBy: { date: "asc" },
      }),
      latestByType(userId, "BODY_BATTERY"),
      latestByType(userId, "TRAINING_READINESS"),
      latestByType(userId, "STRESS"),
      latestByType(userId, "VO2MAX"),
      latestByType(userId, "RESTING_HR"),
    ]);

  const hrv7dAvg =
    hrvTrend.length > 0
      ? hrvTrend.reduce((sum: number, d: GarminData) => sum + (d.summaryValue ?? 0), 0) /
        hrvTrend.length
      : null;

  const readinessPayload = trainingReadiness?.payload as
    | { level?: string; feedbackLong?: string }
    | null
    | undefined;

  const recoveryStatus = computeRecoveryStatus({
    trainingReadinessScore: trainingReadiness?.summaryValue ?? null,
    sleepScore: sleep?.summaryValue ?? null,
    hrvLastNight: hrvLatest?.summaryValue ?? null,
    hrv7dAvg,
    bodyBattery: bodyBattery?.summaryValue ?? null,
    stressAvg: stress?.summaryValue ?? null,
    loadRatio: null,
  });

  return {
    connected: true,
    sleep: sleep
      ? {
          score: sleep.summaryValue,
          date: sleep.date,
          payload: sleep.payload as Record<string, unknown>,
        }
      : null,
    hrv: {
      latest: hrvLatest?.summaryValue ?? null,
      sevenDayAvg: hrv7dAvg,
      trend: hrvTrend.map((d: GarminData) => ({ date: d.date, value: d.summaryValue })),
    },
    sleepTrend: sleepTrend.map((d: GarminData) => {
      const napSeconds = (d.payload as { napDurationInSeconds?: number } | null)
        ?.napDurationInSeconds;
      return {
        date: d.date,
        value: d.summaryValue,
        napMinutes: napSeconds ? Math.round(napSeconds / 60) : null,
      };
    }),
    stressTrend: stressTrend.map((d: GarminData) => ({ date: d.date, value: d.summaryValue })),
    bodyBattery: bodyBattery
      ? { value: bodyBattery.summaryValue, date: bodyBattery.date }
      : null,
    trainingReadiness: trainingReadiness
      ? {
          score: trainingReadiness.summaryValue,
          level: readinessPayload?.level ?? null,
          feedback: readinessPayload?.feedbackLong ?? null,
          date: trainingReadiness.date,
        }
      : null,
    stress: stress ? { value: stress.summaryValue, date: stress.date } : null,
    vo2max: vo2max ? { value: vo2max.summaryValue, date: vo2max.date } : null,
    restingHR: restingHR ? { value: restingHR.summaryValue, date: restingHR.date } : null,
    recoveryStatus,
  };
}
