// Normalisation d'une activité brute Intervals.icu vers la forme stockée en
// base (voir prisma/schema.prisma::Activity). Champs bruts d'intérêt tels
// que documentés par l'API Intervals.icu (https://intervals.icu/api-docs.html) ;
// non exhaustif, `payload` conserve la réponse complète pour référence.

import { Sport } from "@/lib/types";

export interface IntervalsRawActivity {
  id: string;
  // `name`/`type` absents pour les activités importées via Strava : l'API
  // Intervals.icu ne les redistribue pas (restriction des CGU Strava), elle
  // ne renvoie que id/athlete/date/source pour ces activités-là.
  name?: string;
  type?: string;
  source?: string;
  start_date_local: string;
  moving_time?: number | null; // secondes
  distance?: number | null; // mètres
  average_speed?: number | null; // m/s
  icu_average_watts?: number | null;
  average_watts?: number | null;
  average_heartrate?: number | null;
  total_elevation_gain?: number | null;
  calories?: number | null;
  [key: string]: unknown;
}

const SPORT_BY_TYPE: Record<string, Sport> = {
  Run: "RUNNING",
  VirtualRun: "RUNNING",
  TrailRun: "RUNNING",
  Ride: "CYCLING",
  VirtualRide: "CYCLING",
  GravelRide: "CYCLING",
  MountainBikeRide: "CYCLING",
  EBikeRide: "CYCLING",
  Swim: "SWIMMING",
  OpenWaterSwim: "SWIMMING",
  WeightTraining: "STRENGTH",
  Workout: "STRENGTH",
};

// Sports où l'allure (sec/km) a du sens ; les autres (vélo) utilisent la vitesse.
const PACE_SPORTS: Sport[] = ["RUNNING", "SWIMMING"];

/** Dérive allure/vitesse moyenne à partir de la distance et de la durée — utilisé au pull et à l'édition manuelle (app/api/activities/[id]). */
export function computePaceAndSpeed(
  sport: Sport,
  movingTimeSec: number | null,
  distanceMeters: number | null
): { avgPaceSecPerKm: number | null; avgSpeedKph: number | null } {
  if (!movingTimeSec || !distanceMeters || distanceMeters <= 0) {
    return { avgPaceSecPerKm: null, avgSpeedKph: null };
  }
  if (PACE_SPORTS.includes(sport)) {
    return { avgPaceSecPerKm: movingTimeSec / (distanceMeters / 1000), avgSpeedKph: null };
  }
  return { avgPaceSecPerKm: null, avgSpeedKph: (distanceMeters / 1000) / (movingTimeSec / 3600) };
}

export interface NormalizedActivity {
  externalId: string;
  sport: Sport;
  name: string;
  startDate: Date;
  movingTimeSec: number | null;
  distanceMeters: number | null;
  avgPaceSecPerKm: number | null;
  avgSpeedKph: number | null;
  avgHeartRate: number | null;
  avgPower: number | null;
  elevationGain: number | null;
  calories: number | null;
  payload: IntervalsRawActivity;
}

/**
 * Ne retourne jamais `null` : une activité sans `type` reconnu (ou sans type
 * du tout — cas des activités importées via Strava, que l'API Intervals.icu
 * renvoie quasi vides, voir `source`/`_note` dans le payload brut) est quand
 * même importée avec le sport "OTHER" et les champs disponibles ; le reste
 * est à compléter manuellement.
 */
export function normalizeActivity(raw: IntervalsRawActivity): NormalizedActivity {
  const sport = (raw.type && SPORT_BY_TYPE[raw.type]) || "OTHER";

  const movingTimeSec = raw.moving_time ?? null;
  const distanceMeters = raw.distance ?? null;

  const { avgPaceSecPerKm, avgSpeedKph: computedSpeedKph } = computePaceAndSpeed(
    sport,
    movingTimeSec,
    distanceMeters
  );
  // Quand Intervals.icu fournit une vitesse moyenne GPS mesurée (average_speed),
  // elle est plus fidèle que distance/temps (arrêts, drift GPS) : on la préfère
  // — uniquement pour les sports "vitesse" (course/nage affichent une allure, pas
  // une vitesse, cf. PACE_SPORTS).
  const avgSpeedKph =
    !PACE_SPORTS.includes(sport) && raw.average_speed ? raw.average_speed * 3.6 : computedSpeedKph;

  return {
    externalId: raw.id,
    sport,
    name: raw.name || `Activité${raw.source ? ` ${raw.source}` : ""} à compléter`,
    startDate: new Date(raw.start_date_local),
    movingTimeSec,
    distanceMeters,
    avgPaceSecPerKm,
    avgSpeedKph,
    avgHeartRate: raw.average_heartrate ?? null,
    avgPower: raw.icu_average_watts ?? raw.average_watts ?? null,
    elevationGain: raw.total_elevation_gain ?? null,
    calories: raw.calories ?? null,
    payload: raw,
  };
}
