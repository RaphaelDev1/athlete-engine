// Volume hebdo = somme des km réellement parcourus sur les 7 derniers jours
// (activités synchronisées depuis Intervals.icu, lib/intervals/pull.ts) —
// remplace l'ancienne saisie manuelle du "volume hebdo actuel", qui se
// figeait dès que l'athlète oubliait de la mettre à jour. Calculé séparément
// par sport (course/vélo/natation) : additionner les trois n'aurait aucun
// sens (unités/allures différentes), cf. demande explicite de volumes distincts
// sur le profil.

import { prisma } from "@/lib/prisma";
import { Sport } from "@/lib/types";

export async function computeWeeklyVolumeKm(
  userId: string,
  sport: Extract<Sport, "RUNNING" | "CYCLING" | "SWIMMING">,
  asOf: Date = new Date()
): Promise<number | null> {
  const since = new Date(asOf);
  since.setDate(since.getDate() - 7);

  const activities = await prisma.activity.findMany({
    where: { userId, sport, startDate: { gte: since, lte: asOf } },
    select: { distanceMeters: true },
  });

  if (activities.length === 0) return null;

  const totalMeters = activities.reduce((sum, a) => sum + (a.distanceMeters ?? 0), 0);
  return Math.round((totalMeters / 1000) * 10) / 10;
}

export async function computeWeeklyRunningVolumeKm(
  userId: string,
  asOf: Date = new Date()
): Promise<number | null> {
  return computeWeeklyVolumeKm(userId, "RUNNING", asOf);
}

export interface WeeklyVolumesBySport {
  running: number | null;
  cycling: number | null;
  swimming: number | null;
}

export async function computeWeeklyVolumesBySport(
  userId: string,
  asOf: Date = new Date()
): Promise<WeeklyVolumesBySport> {
  const [running, cycling, swimming] = await Promise.all([
    computeWeeklyVolumeKm(userId, "RUNNING", asOf),
    computeWeeklyVolumeKm(userId, "CYCLING", asOf),
    computeWeeklyVolumeKm(userId, "SWIMMING", asOf),
  ]);
  return { running, cycling, swimming };
}
