// Bilan de fin de semaine (Phase 3) : compare le prévu au réalisé pour décider
// si le volume/l'intensité des semaines *futures* doivent être resserrés ou
// relâchés. Module pur, même style que lib/engine/adaptation.ts — aucune
// dépendance Prisma ici ; la persistance et le déclenchement se font dans
// lib/training/materialize.ts.

export interface WeekReviewSessionInput {
  sport: string; // "REST" exclu du calcul de complétion
  status: "PLANNED" | "COMPLETED" | "PARTIAL" | "SKIPPED" | "RESCHEDULED";
  targetRPE: number | null;
  actualRPE: number | null;
}

export interface WeekReviewCheckInInput {
  energy: number; // 1-5
  stress: number; // 1-5
}

export interface WeekReviewResult {
  completionRate: number; // 0-1
  avgRpeDelta: number | null; // actualRPE - targetRPE, moyenne sur séances renseignées
  badDaysRatio: number; // proportion de check-ins signalant fatigue/stress
  volumeMultiplier: number;
  intensityMultiplier: number;
  adjusted: boolean; // false si aucun changement (semaine "dans la norme")
  reason: string;
}

const VOLUME_CAP = 1.3;
const VOLUME_FLOOR = 0.6;
const INTENSITY_FLOOR = 0.8;

/**
 * Règle bornée et transparente (cohérente avec le seuil ACWR déjà utilisé par
 * lib/engine/adaptation.ts) : une semaine "difficile" resserre le programme de
 * 10% (volume) et 5% (intensité), une semaine "bien maîtrisée" le relâche de
 * 5% — dans les bornes [0.6, 1.3] pour le volume et un plancher de 0.8 pour
 * l'intensité, afin qu'aucun ajustement isolé ne déstabilise toute la prépa.
 */
export function reviewWeek(
  sessions: WeekReviewSessionInput[],
  checkIns: WeekReviewCheckInInput[],
  currentVolumeMultiplier: number,
  currentIntensityMultiplier: number
): WeekReviewResult {
  const trainingSessions = sessions.filter((s) => s.sport !== "REST");
  const completionScore = trainingSessions.reduce((sum, s) => {
    if (s.status === "COMPLETED") return sum + 1;
    if (s.status === "PARTIAL") return sum + 0.5;
    return sum;
  }, 0);
  const completionRate = trainingSessions.length > 0 ? completionScore / trainingSessions.length : 1;

  const rpeDeltas = trainingSessions
    .filter((s) => s.actualRPE !== null && s.targetRPE !== null)
    .map((s) => (s.actualRPE as number) - (s.targetRPE as number));
  const avgRpeDelta =
    rpeDeltas.length > 0 ? rpeDeltas.reduce((a, b) => a + b, 0) / rpeDeltas.length : null;

  const badDays = checkIns.filter((c) => c.energy <= 2 || c.stress >= 4).length;
  const badDaysRatio = checkIns.length > 0 ? badDays / checkIns.length : 0;

  const strugglingWeek =
    completionRate < 0.6 || (avgRpeDelta !== null && avgRpeDelta >= 1.5) || badDaysRatio > 0.5;
  const thrivingWeek =
    completionRate >= 0.9 && (avgRpeDelta === null || avgRpeDelta <= 0) && badDaysRatio <= 0.15;

  let volumeMultiplier = currentVolumeMultiplier;
  let intensityMultiplier = currentIntensityMultiplier;
  let adjusted = false;
  let reason = "Semaine dans la norme — pas d'ajustement.";

  if (strugglingWeek) {
    volumeMultiplier = Math.max(VOLUME_FLOOR, currentVolumeMultiplier * 0.9);
    intensityMultiplier = Math.max(INTENSITY_FLOOR, currentIntensityMultiplier * 0.95);
    adjusted = volumeMultiplier !== currentVolumeMultiplier || intensityMultiplier !== currentIntensityMultiplier;
    reason = `Semaine difficile (complétion ${Math.round(completionRate * 100)}%${
      avgRpeDelta !== null ? `, RPE ressenti ${avgRpeDelta >= 0 ? "+" : ""}${avgRpeDelta.toFixed(1)} vs prévu` : ""
    }) — volume ajusté à ${Math.round(volumeMultiplier * 100)}% du niveau de référence.`;
  } else if (thrivingWeek) {
    volumeMultiplier = Math.min(VOLUME_CAP, currentVolumeMultiplier * 1.05);
    adjusted = volumeMultiplier !== currentVolumeMultiplier;
    reason = `Semaine bien maîtrisée (complétion ${Math.round(completionRate * 100)}%) — volume augmenté à ${Math.round(volumeMultiplier * 100)}% du niveau de référence.`;
  }

  return { completionRate, avgRpeDelta, badDaysRatio, volumeMultiplier, intensityMultiplier, adjusted, reason };
}

// ─── Effet immédiat au moment du log d'une séance ────────────────────────────

export interface SessionVigilanceInput {
  title: string;
  status: "COMPLETED" | "PARTIAL" | "SKIPPED";
  targetRPE: number | null;
  actualRPE: number | null;
}

/**
 * Signal de vigilance immédiat (sans attendre le bilan hebdo) : séance
 * ressentie nettement plus dure que prévu, ou séance ratée. Le vrai ajustement
 * du programme reste hebdomadaire (`reviewWeek`) — ceci ne fait qu'alerter.
 */
export function buildSessionVigilanceReason(input: SessionVigilanceInput): string | null {
  if (input.status === "SKIPPED") {
    return `Séance "${input.title}" marquée comme ratée.`;
  }
  if (input.targetRPE !== null && input.actualRPE !== null && input.actualRPE - input.targetRPE >= 3) {
    return `Séance "${input.title}" ressentie beaucoup plus dure que prévu (RPE ${input.actualRPE} vs ${input.targetRPE} prévu).`;
  }
  return null;
}
