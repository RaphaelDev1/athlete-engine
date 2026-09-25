import { formatSecondsToTime } from "@/lib/utils/time";
import { categorizeSport, SPORT_CATEGORY_LABELS, SPORT_CATEGORY_ORDER } from "@/lib/training/sportCategory";
import { SPORT_LABEL } from "@/components/training/sessionMeta";
import { Sport } from "@/lib/types";

interface ActivityLike {
  sport: string;
  name?: string | null;
  distanceMeters: number | null;
  avgPaceSecPerKm: number | null;
  avgSpeedKph: number | null;
}

// Étiquette affichée pour une activité : le nom du sport s'il est connu
// (RUNNING/CYCLING/...), sinon la catégorie déduite du nom de l'activité
// (padel/tennis -> "Sports de raquette", rando/ski -> "Plein air"...) plutôt
// que le générique "Autre" — cf. lib/training/sportCategory.ts.
export function activityLabel(sport: string, name?: string | null): string {
  if (sport !== "OTHER") return SPORT_LABEL[sport as keyof typeof SPORT_LABEL] ?? sport;
  return SPORT_CATEGORY_LABELS[categorizeSport(sport as Sport, name)];
}

export function formatActivityPace(a: ActivityLike): string {
  if (a.sport === "SWIMMING" && a.avgPaceSecPerKm) {
    return `${formatSecondsToTime(a.avgPaceSecPerKm / 10)} /100m`;
  }
  if (a.avgPaceSecPerKm) return `${formatSecondsToTime(a.avgPaceSecPerKm)} /km`;
  if (a.avgSpeedKph) return `${a.avgSpeedKph.toFixed(1)} km/h`;
  return "—";
}

export function byCategory<T extends { sport: string }>(items: T[]): T[] {
  const nameOf = (item: T) => ("name" in item ? (item as { name?: string | null }).name : undefined);
  return [...items].sort(
    (a, b) =>
      SPORT_CATEGORY_ORDER.indexOf(categorizeSport(a.sport as Sport, nameOf(a))) -
      SPORT_CATEGORY_ORDER.indexOf(categorizeSport(b.sport as Sport, nameOf(b)))
  );
}
