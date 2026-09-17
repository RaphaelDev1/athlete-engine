// Écrit dans AthleteProfile les métriques que l'athlète ne doit plus jamais
// saisir à la main (FC repos, FC max, VO2max, allure seuil) — appelé à chaque
// synchronisation Garmin (app/api/garmin/sync/route.ts) pour que le dashboard,
// le profil et le moteur de périodisation lisent tous la même valeur fraîche
// sans logique de repli dispersée dans chaque endpoint.
//
// Le volume hebdo (course réelle) n'est PAS géré ici : il vient des activités
// synchronisées (lib/training/volume.ts), pas de Garmin.

import { prisma } from "@/lib/prisma";
import { computePaceZones } from "@/lib/engine/zones";

// FC max : une seule journée peut être un jour de repos (pas représentative).
// On retient donc le plus haut relevé sur une fenêtre glissante plutôt que la
// dernière valeur — la vraie FC max ne redescend pas d'un jour à l'autre.
const MAX_HR_WINDOW_DAYS = 365;

async function latestSummaryValue(userId: string, dataType: "VO2MAX" | "RESTING_HR") {
  const entry = await prisma.garminData.findFirst({
    where: { userId, dataType },
    orderBy: { date: "desc" },
  });
  return entry?.summaryValue ?? null;
}

async function highestSummaryValueSince(userId: string, dataType: "MAX_HR", sinceDate: Date) {
  const result = await prisma.garminData.aggregate({
    where: { userId, dataType, date: { gte: sinceDate } },
    _max: { summaryValue: true },
  });
  return result._max.summaryValue ?? null;
}

/** Allure seuil (sec/km) estimée depuis le VO2max — cf. lib/engine/zones.ts (VDOT/Daniels). */
function estimateThresholdPaceFromVo2max(vo2max: number): number {
  const zones = computePaceZones(vo2max);
  const threshold = zones.find((z) => z.key === "THRESHOLD");
  if (!threshold) return NaN;
  return Math.round((threshold.minPaceSecPerKm + threshold.maxPaceSecPerKm) / 2);
}

/**
 * Met à jour AthleteProfile avec les dernières valeurs Garmin disponibles.
 * N'écrase jamais un champ pour lequel Garmin n'a rien remonté (ex: jamais
 * synchronisé) — pas de régression vers une valeur vide.
 */
export async function syncAthleteProfileFromGarmin(userId: string): Promise<void> {
  const since = new Date();
  since.setDate(since.getDate() - MAX_HR_WINDOW_DAYS);

  const [vo2max, restingHR, maxHR] = await Promise.all([
    latestSummaryValue(userId, "VO2MAX"),
    latestSummaryValue(userId, "RESTING_HR"),
    highestSummaryValueSince(userId, "MAX_HR", since),
  ]);

  const thresholdPace =
    vo2max !== null && Number.isFinite(estimateThresholdPaceFromVo2max(vo2max))
      ? estimateThresholdPaceFromVo2max(vo2max)
      : null;

  const update: {
    vo2max?: number;
    restingHR?: number;
    maxHR?: number;
    thresholdPace?: number;
  } = {};
  if (vo2max !== null) update.vo2max = vo2max;
  if (restingHR !== null) update.restingHR = Math.round(restingHR);
  if (maxHR !== null) update.maxHR = Math.round(maxHR);
  if (thresholdPace !== null) update.thresholdPace = thresholdPace;

  if (Object.keys(update).length === 0) return;

  await prisma.athleteProfile.upsert({
    where: { userId },
    update,
    create: { userId, ...update },
  });
}
