// Écriture des activités Intervals.icu normalisées en base — même idiome
// d'upsert que lib/garmin/store.ts::upsertGarminData.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NormalizedActivity } from "./mapping";

export async function upsertActivity(userId: string, activity: NormalizedActivity) {
  await prisma.activity.upsert({
    where: { userId_externalId: { userId, externalId: activity.externalId } },
    update: {
      sport: activity.sport,
      name: activity.name,
      startDate: activity.startDate,
      movingTimeSec: activity.movingTimeSec,
      distanceMeters: activity.distanceMeters,
      avgPaceSecPerKm: activity.avgPaceSecPerKm,
      avgSpeedKph: activity.avgSpeedKph,
      avgHeartRate: activity.avgHeartRate,
      avgPower: activity.avgPower,
      elevationGain: activity.elevationGain,
      payload: activity.payload as unknown as Prisma.InputJsonValue,
    },
    create: {
      userId,
      externalId: activity.externalId,
      sport: activity.sport,
      name: activity.name,
      startDate: activity.startDate,
      movingTimeSec: activity.movingTimeSec,
      distanceMeters: activity.distanceMeters,
      avgPaceSecPerKm: activity.avgPaceSecPerKm,
      avgSpeedKph: activity.avgSpeedKph,
      avgHeartRate: activity.avgHeartRate,
      avgPower: activity.avgPower,
      elevationGain: activity.elevationGain,
      payload: activity.payload as unknown as Prisma.InputJsonValue,
    },
  });
}
