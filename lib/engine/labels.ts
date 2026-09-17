// Libellés partagés pour le niveau de récupération/adaptation — utilisés par
// /recovery et le dashboard pour éviter de dupliquer les mêmes mappings.

import { ReadinessLevel } from "./garminAdaptation";

export const LEVEL_BADGE: Record<
  ReadinessLevel,
  "success" | "info" | "warning" | "danger"
> = {
  READY: "success",
  MAINTAIN: "info",
  CAUTION: "warning",
  REST: "danger",
};

export const LEVEL_LABEL: Record<ReadinessLevel, string> = {
  READY: "Prêt à pousser",
  MAINTAIN: "Maintenir le plan",
  CAUTION: "Prudence",
  REST: "Repos conseillé",
};

/** État simplifié affiché sur le dashboard : prêt / fatigué / en surmenage. */
export type AthleteState = "READY" | "TIRED" | "OVERTRAINED";

export const STATE_LABEL: Record<AthleteState, string> = {
  READY: "Prêt",
  TIRED: "Fatigué",
  OVERTRAINED: "En surmenage",
};

export const STATE_BADGE: Record<
  AthleteState,
  "success" | "warning" | "danger"
> = {
  READY: "success",
  TIRED: "warning",
  OVERTRAINED: "danger",
};

export function readinessToAthleteState(level: ReadinessLevel): AthleteState {
  if (level === "REST") return "OVERTRAINED";
  if (level === "CAUTION") return "TIRED";
  return "READY";
}
