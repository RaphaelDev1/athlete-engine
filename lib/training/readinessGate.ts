// Readiness du jour (Garmin + check-in + charge), factorisée ici pour être
// consommée à la fois par app/api/dashboard/route.ts (affichage) et
// lib/training/dayPlanner.ts via materialize.ts (autorise ou non 2 séances/jour).

import { prisma } from "@/lib/prisma";
import { getGarminSummary } from "@/lib/garmin/summary";
import { computeRecoveryStatus, RecoveryStatus } from "@/lib/engine/garminAdaptation";
import { blendReadiness, computeTrainingLoad } from "@/lib/engine/adaptation";

const LOAD_WINDOW_DAYS = 28;

export async function computeCurrentReadiness(userId: string): Promise<RecoveryStatus> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const loadSince = new Date();
  loadSince.setDate(loadSince.getDate() - LOAD_WINDOW_DAYS);

  const [garmin, checkInToday, loadSessions] = await Promise.all([
    getGarminSummary(userId, 7),
    prisma.dailyCheckIn.findUnique({ where: { userId_date: { userId, date: today } } }),
    prisma.trainingSession.findMany({
      where: {
        week: { plan: { userId } },
        status: "COMPLETED",
        scheduledDate: { gte: loadSince },
      },
      select: { scheduledDate: true, actualDuration: true, actualRPE: true, targetRPE: true },
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

  return blendReadiness(
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
}

/** 2 séances/jour (1 petite + 1 grosse) autorisées uniquement si la récup est bonne. */
export function allowsDoubleSession(readiness: RecoveryStatus): boolean {
  return readiness.level === "READY" || readiness.level === "MAINTAIN";
}
