// Normalisation d'une activité brute Intervals.icu vers la forme stockée en
// base (voir prisma/schema.prisma::Activity). Champs bruts d'intérêt tels
// que documentés par l'API Intervals.icu (https://intervals.icu/api-docs.html) ;
// non exhaustif, `payload` conserve la réponse complète pour référence.

import { Sport } from "@/lib/types";

export interface IntervalsRawActivity {
  id: string;
  name: string;
  type: string;
  start_date_local: string;
  moving_time?: number | null; // secondes
  distance?: number | null; // mètres
  average_speed?: number | null; // m/s
  icu_average_watts?: number | null;
  average_watts?: number | null;
  average_heartrate?: number | null;
  total_elevation_gain?: number | null;
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
  payload: IntervalsRawActivity;
}

/** Retourne `null` si le type d'activité n'a pas d'équivalent dans notre `Sport` (ignoré au pull). */
export function normalizeActivity(raw: IntervalsRawActivity): NormalizedActivity | null {
  const sport = SPORT_BY_TYPE[raw.type];
  if (!sport) return null;

  const movingTimeSec = raw.moving_time ?? null;
  const distanceMeters = raw.distance ?? null;

  let avgPaceSecPerKm: number | null = null;
  let avgSpeedKph: number | null = null;

  if (movingTimeSec && distanceMeters && distanceMeters > 0) {
    if (PACE_SPORTS.includes(sport)) {
      avgPaceSecPerKm = movingTimeSec / (distanceMeters / 1000);
    } else {
      avgSpeedKph = raw.average_speed
        ? raw.average_speed * 3.6
        : (distanceMeters / 1000) / (movingTimeSec / 3600);
    }
  }

  return {
    externalId: raw.id,
    sport,
    name: raw.name,
    startDate: new Date(raw.start_date_local),
    movingTimeSec,
    distanceMeters,
    avgPaceSecPerKm,
    avgSpeedKph,
    avgHeartRate: raw.average_heartrate ?? null,
    avgPower: raw.icu_average_watts ?? raw.average_watts ?? null,
    elevationGain: raw.total_elevation_gain ?? null,
    payload: raw,
  };
}
