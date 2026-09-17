// Bibliothèque de séances types — vélo (zones de puissance % FTP, repli sur FC).

import { AthleteZones, BuiltSession, CyclingBuildParams } from "../types";

function powerZoneRange(zones: AthleteZones, zoneNum: number): string {
  const z = zones.power?.find((p) => p.zone === zoneNum);
  if (!z) return "puissance non calculable (FTP manquante)";
  return z.maxWatts ? `${z.minWatts}-${z.maxWatts} W` : `>${z.minWatts} W`;
}

function hrZoneRange(zones: AthleteZones, zoneNum: number): string {
  const z = zones.hr?.find((h) => h.zone === zoneNum);
  if (!z) return "zone FC non calculable";
  return `${z.minHR}-${z.maxHR} bpm`;
}

export function buildEnduranceRide(params: CyclingBuildParams): BuiltSession {
  const { zones, durationMinutes } = params;
  return {
    sport: "CYCLING",
    sessionType: "ENDURANCE_RIDE",
    title: "Sortie endurance",
    description: "Endurance fondamentale à faible intensité (Z2).",
    duration: durationMinutes,
    targetDistance: null,
    targetPace: null,
    targetZone: 2,
    targetRPE: 4,
    structure: [
      "Échauffement : 10 min progressif",
      `Corps de séance : ${Math.max(
        durationMinutes - 20,
        20
      )} min en Z2, ${powerZoneRange(zones, 2)} (${hrZoneRange(zones, 2)})`,
      "Retour au calme : 10 min",
    ],
    exercises: null,
  };
}

export function buildTempoRide(params: CyclingBuildParams): BuiltSession {
  const { zones, weekType, durationMinutes } = params;
  const workMinutes = weekType === "DELOAD" ? 15 : 30;

  return {
    sport: "CYCLING",
    sessionType: "TEMPO_RIDE",
    title: "Sortie tempo",
    description: "Effort soutenu au tempo/seuil, Z3-Z4.",
    duration: durationMinutes,
    targetDistance: null,
    targetPace: null,
    targetZone: 4,
    targetRPE: 7,
    structure: [
      "Échauffement : 15 min progressif",
      `Corps de séance : ${workMinutes} min en Z3-Z4, ${powerZoneRange(
        zones,
        4
      )} (${hrZoneRange(zones, 4)})`,
      "Retour au calme : 10 min",
    ],
    exercises: null,
  };
}

export function buildFtpTest(): BuiltSession {
  return {
    sport: "CYCLING",
    sessionType: "FITNESS_TEST",
    title: "Test FTP (20 min)",
    description: "Test de référence pour calibrer les zones de puissance.",
    duration: 60,
    targetDistance: null,
    targetPace: null,
    targetZone: 4,
    targetRPE: 9,
    structure: [
      "Échauffement : 10 min progressif",
      "5 min à fond pour vider les stocks, puis 5 min très facile",
      "20 min à l'effort maximal soutenable, chronométré (puissance moyenne)",
      "Retour au calme : 10 min",
      "FTP estimée = puissance moyenne des 20 min × 0.95",
    ],
    exercises: null,
  };
}

export function buildIntervalRide(params: CyclingBuildParams): BuiltSession {
  const { zones, weekType, durationMinutes } = params;
  const reps = weekType === "DELOAD" ? 4 : 6;

  return {
    sport: "CYCLING",
    sessionType: "INTERVAL_RIDE",
    title: `Intervalles ${reps}×4min`,
    description: "Développement VO2max à haute puissance.",
    duration: durationMinutes,
    targetDistance: null,
    targetPace: null,
    targetZone: 5,
    targetRPE: 8.5,
    structure: [
      "Échauffement : 15 min progressif + 2 accélérations",
      `Corps de séance : ${reps} × 4 min en Z5, ${powerZoneRange(
        zones,
        5
      )} (${hrZoneRange(zones, 5)}), récupération 3 min entre les répétitions`,
      "Retour au calme : 10 min",
    ],
    exercises: null,
  };
}
