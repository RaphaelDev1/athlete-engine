// Volume hebdo course = somme des km réellement courus sur les 7 derniers
// jours (activités synchronisées depuis Intervals.icu, lib/intervals/pull.ts)
// — remplace l'ancienne saisie manuelle du "volume hebdo actuel", qui se
// figeait dès que l'athlète oubliait de la mettre à jour.

import { prisma } from "@/lib/prisma";

export async function computeWeeklyRunningVolumeKm(
  userId: string,
  asOf: Date = new Date()
): Promise<number | null> {
  const since = new Date(asOf);
  since.setDate(since.getDate() - 7);

  const activities = await prisma.activity.findMany({
    where: { userId, sport: "RUNNING", startDate: { gte: since, lte: asOf } },
    select: { distanceMeters: true },
  });

  if (activities.length === 0) return null;

  const totalMeters = activities.reduce((sum, a) => sum + (a.distanceMeters ?? 0), 0);
  return Math.round((totalMeters / 1000) * 10) / 10;
}
