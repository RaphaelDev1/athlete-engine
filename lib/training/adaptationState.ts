// État de la boucle d'adaptation progressive (Phase 3) — un seul enregistrement
// par utilisateur (même idiome que lib/training/schedule.ts), ajusté par
// lib/engine/weekReview.ts et consommé par lib/training/materialize.ts pour
// moduler le profil avant de régénérer les semaines futures.

import { prisma } from "@/lib/prisma";
import { PeriodizationProfile } from "@/lib/engine/periodization";

export async function getOrCreateAdaptationState(userId: string) {
  return prisma.planAdaptationState.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

export interface AdaptationHistoryEntry {
  date: string; // ISO
  reason: string;
  volumeMultiplier: number;
  intensityMultiplier: number;
}

export function parseHistory(history: unknown): AdaptationHistoryEntry[] {
  return Array.isArray(history) ? (history as AdaptationHistoryEntry[]) : [];
}

/**
 * Applique le multiplicateur de volume au profil avant génération — c'est le
 * levier principal de la boucle d'adaptation (Phase 3). `intensityMultiplier`
 * est calculé et historisé par lib/engine/weekReview.ts mais pas encore
 * branché sur le contenu des séances (RPE/allures cibles) : ça demanderait de
 * faire descendre le multiplicateur jusque dans lib/engine/templates/*, hors
 * scope V1. Il reste disponible pour une itération future.
 */
export function applyAdaptation(
  profile: PeriodizationProfile,
  state: { volumeMultiplier: number }
): PeriodizationProfile {
  return {
    ...profile,
    weeklyVolume: profile.weeklyVolume !== null ? profile.weeklyVolume * state.volumeMultiplier : null,
  };
}
