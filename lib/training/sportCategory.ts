import { Sport } from "@/lib/types";

// Regroupement visuel des sports par famille — le modèle Sport ne connaît que
// des catégories génériques (RUNNING/CYCLING/SWIMMING/STRENGTH/REST/MOBILITY/
// OTHER, cf. prisma/schema.prisma), donc tout ce qui n'y rentre pas (padel,
// tennis, squash, rando...) atterrit en OTHER avec juste un nom d'activité
// (lib/intervals/mapping.ts). Plutôt que d'étendre l'enum Sport (migration DB
// + resync complet), on affine OTHER par mots-clés sur le nom de l'activité —
// purement pour l'affichage/tri, jamais utilisé pour une décision du moteur.
export type SportCategory = "ENDURANCE" | "STRENGTH" | "RACQUET" | "OUTDOOR" | "RECOVERY" | "OTHER";

export const SPORT_CATEGORY_LABELS: Record<SportCategory, string> = {
  ENDURANCE: "Endurance",
  STRENGTH: "Musculation",
  RACQUET: "Sports de raquette",
  OUTDOOR: "Plein air",
  RECOVERY: "Récupération",
  OTHER: "Autre",
};

export const SPORT_CATEGORY_ORDER: SportCategory[] = [
  "ENDURANCE",
  "STRENGTH",
  "RACQUET",
  "OUTDOOR",
  "RECOVERY",
  "OTHER",
];

const RACQUET_KEYWORDS = [
  "padel",
  "tennis",
  "squash",
  "badminton",
  "pickleball",
  "ping-pong",
  "ping pong",
];
const OUTDOOR_KEYWORDS = [
  "rando",
  "randonnée",
  "hike",
  "hiking",
  "trek",
  "marche",
  "trail",
  "escalade",
  "climbing",
  "ski",
  "kayak",
  "canoë",
  "canoe",
  "surf",
  "vtt",
];

/**
 * `activityName` n'est utile que pour affiner un Sport.OTHER (nom
 * d'activité Intervals.icu/Strava) — ignoré pour tout autre sport, dont la
 * catégorie est déjà connue sans ambiguïté.
 */
export function categorizeSport(sport: Sport, activityName?: string | null): SportCategory {
  if (sport === "RUNNING" || sport === "CYCLING" || sport === "SWIMMING") return "ENDURANCE";
  if (sport === "STRENGTH") return "STRENGTH";
  if (sport === "REST" || sport === "MOBILITY") return "RECOVERY";

  const name = (activityName ?? "").toLowerCase();
  if (RACQUET_KEYWORDS.some((k) => name.includes(k))) return "RACQUET";
  if (OUTDOOR_KEYWORDS.some((k) => name.includes(k))) return "OUTDOOR";
  return "OTHER";
}
