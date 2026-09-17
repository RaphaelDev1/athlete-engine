// Bibliothèque de séances types — course à pied.
// Chaque builder transforme un volume/durée cible + les zones de l'athlète
// en séance concrète (allures, zone FC, structure détaillée).

import { formatPace } from "../zones";
import { AthleteZones, BuiltSession, PaceZoneKey, RunningBuildParams } from "../types";

function paceZoneRange(zones: AthleteZones, key: PaceZoneKey): string {
  const z = zones.pace?.find((p) => p.key === key);
  if (!z) return "allure non calculable (VO2max/allure seuil manquants)";
  return `${formatPace(z.minPaceSecPerKm)} à ${formatPace(z.maxPaceSecPerKm)}`;
}

function paceZoneMid(zones: AthleteZones, key: PaceZoneKey): number | null {
  const z = zones.pace?.find((p) => p.key === key);
  return z ? Math.round((z.minPaceSecPerKm + z.maxPaceSecPerKm) / 2) : null;
}

function hrZoneRange(zones: AthleteZones, zoneNum: number): string {
  const z = zones.hr?.find((h) => h.zone === zoneNum);
  if (!z) return "zone FC non calculable (FC repos/max manquantes)";
  return `${z.minHR}-${z.maxHR} bpm`;
}

export function buildLongRun(params: RunningBuildParams): BuiltSession {
  const { zones, weekType, durationMinutes, distanceKm } = params;
  const pace = paceZoneMid(zones, "EASY");

  return {
    sport: "RUNNING",
    sessionType: "LONG_RUN",
    title: "Sortie longue",
    description:
      "Développement de l'endurance fondamentale — volume principal de la semaine (modèle 80/20).",
    duration: durationMinutes,
    targetDistance: distanceKm,
    targetPace: pace,
    targetZone: 2,
    targetRPE: weekType === "DELOAD" ? 3 : 4,
    structure: [
      "Échauffement : 10 min en Z1, marche/trot très facile",
      `Corps de séance : ${distanceKm} km en endurance fondamentale, Z2 (${hrZoneRange(
        zones,
        2
      )}), allure ${paceZoneRange(zones, "EASY")}`,
      "Retour au calme : 5-10 min en Z1 + étirements légers",
    ],
    exercises: null,
  };
}

export function buildEasyRun(params: RunningBuildParams): BuiltSession {
  const { zones, durationMinutes, distanceKm } = params;
  const pace = paceZoneMid(zones, "EASY");

  return {
    sport: "RUNNING",
    sessionType: "EASY_RUN",
    title: "Footing facile",
    description: "Course facile — les 80% du volume à faible intensité (polarisation).",
    duration: durationMinutes,
    targetDistance: distanceKm,
    targetPace: pace,
    targetZone: 2,
    targetRPE: 3,
    structure: [
      `${distanceKm} km en continu, Z1-Z2 (${hrZoneRange(zones, 2)}), allure ${paceZoneRange(
        zones,
        "EASY"
      )}`,
      "Rester en aisance respiratoire du début à la fin",
    ],
    exercises: null,
  };
}

export function buildRecoveryRun(params: RunningBuildParams): BuiltSession {
  const { zones, durationMinutes, distanceKm } = params;

  return {
    sport: "RUNNING",
    sessionType: "RECOVERY_RUN",
    title: "Footing de récupération",
    description: "Séance très facile pour favoriser la récupération active.",
    duration: durationMinutes,
    targetDistance: distanceKm,
    targetPace: paceZoneMid(zones, "EASY"),
    targetZone: 1,
    targetRPE: 2,
    structure: [
      `${distanceKm} km très facile, Z1 (${hrZoneRange(zones, 1)})`,
      "Aucune sensation d'effort — s'arrêter plus tôt si fatigue",
    ],
    exercises: null,
  };
}

export function buildTempoRun(params: RunningBuildParams): BuiltSession {
  const { zones, weekType, durationMinutes, distanceKm } = params;
  const workMinutes = weekType === "DELOAD" ? 15 : 25;
  const warmup = Math.max(10, Math.round((durationMinutes - workMinutes) / 2));
  const cooldown = Math.max(5, durationMinutes - workMinutes - warmup);

  return {
    sport: "RUNNING",
    sessionType: "TEMPO",
    title: "Tempo / Seuil",
    description: "Effort « confortablement dur » au seuil lactique — les 20% intenses du 80/20.",
    duration: durationMinutes,
    targetDistance: distanceKm,
    targetPace: paceZoneMid(zones, "THRESHOLD"),
    targetZone: 4,
    targetRPE: 7,
    structure: [
      `Échauffement : ${warmup} min progressif Z1→Z2`,
      `Corps de séance : ${workMinutes} min continues au seuil (T), Z4 (${hrZoneRange(
        zones,
        4
      )}), allure ${paceZoneRange(zones, "THRESHOLD")}`,
      `Retour au calme : ${cooldown} min en Z1`,
    ],
    exercises: null,
  };
}

export function buildIntervals(params: RunningBuildParams): BuiltSession {
  const { zones, weekType, durationMinutes, distanceKm } = params;
  const workMinutes = Math.max(weekType === "DELOAD" ? 10 : 20, durationMinutes - 20);

  const iPaceMid = paceZoneMid(zones, "INTERVAL"); // sec/km
  const repDistanceKm = 1; // répétitions de 1000m
  const repWorkMinutes = iPaceMid ? (iPaceMid * repDistanceKm) / 60 : 4;
  const recoveryMinutes = 2.5; // trot de récupération ~400m
  const reps = Math.max(3, Math.round(workMinutes / (repWorkMinutes + recoveryMinutes)));

  return {
    sport: "RUNNING",
    sessionType: "INTERVALS",
    title: `Intervalles ${reps}×${repDistanceKm}km`,
    description: "Développement de la VO2max — fraction haute intensité du 80/20.",
    duration: durationMinutes,
    targetDistance: distanceKm,
    targetPace: iPaceMid,
    targetZone: 5,
    targetRPE: 8.5,
    structure: [
      "Échauffement : 15 min progressif Z1→Z2 + 3 lignes droites accélérées",
      `Corps de séance : ${reps} × ${repDistanceKm} km à allure I (${paceZoneRange(
        zones,
        "INTERVAL"
      )}), Z5 (${hrZoneRange(zones, 5)}), récupération trot ${recoveryMinutes} min entre les répétitions`,
      "Retour au calme : 10 min en Z1",
    ],
    exercises: null,
  };
}

export function buildFartlek(params: RunningBuildParams): BuiltSession {
  const { zones, durationMinutes, distanceKm } = params;

  return {
    sport: "RUNNING",
    sessionType: "FARTLEK",
    title: "Fartlek",
    description: "Jeu d'allures — alternance libre entre endurance et allures soutenues.",
    duration: durationMinutes,
    targetDistance: distanceKm,
    targetPace: paceZoneMid(zones, "EASY"),
    targetZone: 3,
    targetRPE: 6,
    structure: [
      "Échauffement : 10 min en Z1",
      `Corps de séance : alternance 3-5 min allure M/T (${paceZoneRange(
        zones,
        "MARATHON"
      )}) / 2-3 min récupération Z1-Z2, sur ${Math.max(
        durationMinutes - 20,
        20
      )} min`,
      "Retour au calme : 10 min en Z1",
    ],
    exercises: null,
  };
}

export function buildHills(params: RunningBuildParams): BuiltSession {
  const { zones, durationMinutes, distanceKm } = params;

  return {
    sport: "RUNNING",
    sessionType: "HILLS",
    title: "Côtes",
    description: "Renforcement spécifique et puissance — répétitions en côte.",
    duration: durationMinutes,
    targetDistance: distanceKm,
    targetPace: null,
    targetZone: 5,
    targetRPE: 8,
    structure: [
      "Échauffement : 15 min en Z1-Z2",
      `Corps de séance : 8-10 × 60-90s en côte à effort soutenu (Z4-Z5, ${hrZoneRange(
        zones,
        4
      )}), retour en trot facile`,
      "Retour au calme : 10 min en Z1",
    ],
    exercises: null,
  };
}

/** Test navette 20m (protocole Luc Léger) — établit/valide le palier de VMA. */
export function buildLucLegerTest(): BuiltSession {
  return {
    sport: "RUNNING",
    sessionType: "FITNESS_TEST",
    title: "Test Luc Léger (navette 20m)",
    description: "Test de terrain pour mesurer le palier de VMA atteint.",
    duration: 30,
    targetDistance: null,
    targetPace: null,
    targetZone: 5,
    targetRPE: 9.5,
    structure: [
      "Échauffement complet 15 min : footing progressif + lignes droites accélérées",
      "Test navette 20m : suivre le bip jusqu'à l'échec (2 échecs consécutifs sur la même navette)",
      "Noter le dernier palier validé — objectif palier 12 (14.0 km/h)",
      "Retour au calme : 10 min marche + footing très facile",
    ],
    exercises: null,
  };
}

/** Simulation du test Luc Léger sur piste/route quand la navette n'est pas disponible. */
export function buildLucLegerSimulation(params: RunningBuildParams): BuiltSession {
  const { zones } = params;
  return {
    sport: "RUNNING",
    sessionType: "INTERVALS",
    title: "Simulation Luc Léger",
    description: "Paliers progressifs simulant le test navette — préparation spécifique.",
    duration: 35,
    targetDistance: null,
    targetPace: paceZoneMid(zones, "INTERVAL"),
    targetZone: 5,
    targetRPE: 8.5,
    structure: [
      "Échauffement : 15 min progressif Z1→Z2",
      "Paliers de 1 min avec vitesse croissante (+0.5 km/h par palier) jusqu'à l'allure cible palier 12 (14.0 km/h), sur piste ou tapis si possible",
      "Tenir le palier cible le plus longtemps possible une fois atteint",
      "Retour au calme : 10 min en Z1",
    ],
    exercises: null,
  };
}

export function buildRaceSession(params: RunningBuildParams): BuiltSession {
  const { distanceKm, durationMinutes, zones } = params;

  return {
    sport: "RUNNING",
    sessionType: "RACE",
    title: "Course objectif",
    description: "Jour J — mise en application du plan d'allures.",
    duration: durationMinutes,
    targetDistance: distanceKm,
    targetPace: paceZoneMid(zones, "MARATHON"),
    targetZone: 4,
    targetRPE: 9,
    structure: [
      "Échauffement spécifique 15-20 min",
      `${distanceKm} km à allure objectif`,
      "Retour au calme et étirements",
    ],
    exercises: null,
  };
}
