import { SessionType } from "@/lib/types";

// Séances jugées assez légères pour être maintenues même en cas de mauvaise
// récupération — tout le reste (sortie longue, fractionné, tempo, muscu,
// vélo/nage intenses, brick, tests) est proposé au report automatique.
const SMALL_SESSION_TYPES: SessionType[] = [
  "EASY_RUN",
  "RECOVERY_RUN",
  "MOBILITY_SESSION",
  "SWIM_TECHNIQUE",
  "REST_DAY",
];

export function isSmallSession(sessionType: SessionType): boolean {
  return SMALL_SESSION_TYPES.includes(sessionType);
}
