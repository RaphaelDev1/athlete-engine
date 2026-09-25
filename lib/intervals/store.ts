// Écriture des activités Intervals.icu normalisées en base — même idiome
// d'upsert que lib/garmin/store.ts::upsertGarminData.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NormalizedActivity } from "./mapping";

export async function upsertActivity(userId: string, activity: NormalizedActivity) {
  const existing = await prisma.activity.findUnique({
    where: { userId_externalId: { userId, externalId: activity.externalId } },
    select: { manuallyEditedAt: true },
  });

  // Une activité corrigée à la main (app/api/activities/[id]) garde les
  // valeurs saisies par l'athlète — sinon la resynchronisation suivante les
  // écrase (ex. sport remis à "Autre" pour une activité importée via Strava,
  // voir lib/intervals/mapping.ts::normalizeActivity). startDate/payload
  // restent rafraîchis : ce ne sont pas des champs éditables manuellement.
  const editableFields = existing?.manuallyEditedAt
    ? {}
    : {
        sport: activity.sport,
        name: activity.name,
        movingTimeSec: activity.movingTimeSec,
        distanceMeters: activity.distanceMeters,
        avgPaceSecPerKm: activity.avgPaceSecPerKm,
        avgSpeedKph: activity.avgSpeedKph,
        avgHeartRate: activity.avgHeartRate,
        avgPower: activity.avgPower,
        elevationGain: activity.elevationGain,
        calories: activity.calories,
      };

  await prisma.activity.upsert({
    where: { userId_externalId: { userId, externalId: activity.externalId } },
    update: {
      ...editableFields,
      startDate: activity.startDate,
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
      calories: activity.calories,
      payload: activity.payload as unknown as Prisma.InputJsonValue,
    },
  });
}
