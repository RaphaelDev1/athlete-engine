// Bibliothèque de séances types — natation.
//
// Pas de zones d'allure natation calculées (aucun test CSS/400m modélisé dans
// le profil pour l'instant) : les séances sont structurées en distance/RPE,
// avec une indication d'allure descriptive quand pertinent.

import { BuiltSession, SwimBuildParams } from "../types";

function roundTo25(distanceM: number): number {
  return Math.max(25, Math.round(distanceM / 25) * 25);
}

export function buildSwimTechnique(params: SwimBuildParams): BuiltSession {
  const { durationMinutes, distanceM } = params;
  const drillM = roundTo25(distanceM * 0.4);
  const mainM = roundTo25(distanceM * 0.6);

  return {
    sport: "SWIMMING",
    sessionType: "SWIM_TECHNIQUE",
    title: "Natation technique",
    description: "Travail technique — éducatifs et correction de la nage.",
    duration: durationMinutes,
    targetDistance: Math.round((drillM + mainM)) / 1000,
    targetPace: null,
    targetZone: null,
    targetRPE: 4,
    structure: [
      "Échauffement : 200-300m souple, alternance crawl/dos",
      `Éducatifs (${drillM}m) : catch-up, doigts traînants, respiration bilatérale 3-3-3, jambes avec planche`,
      `Corps de séance (${mainM}m) : par blocs de 100-200m à allure aisée, focus sur l'amplitude et le placement de tête`,
      "Retour au calme : 100-150m très facile",
    ],
    exercises: null,
  };
}

export function buildSwimEndurance(params: SwimBuildParams): BuiltSession {
  const { weekType, durationMinutes, distanceM } = params;
  const mainM = roundTo25(weekType === "DELOAD" ? distanceM * 0.7 : distanceM);
  const reps = Math.max(3, Math.round(mainM / 300));
  const repDistance = roundTo25(mainM / reps);

  return {
    sport: "SWIMMING",
    sessionType: "SWIM_ENDURANCE",
    title: "Natation endurance",
    description: "Développement de l'endurance aérobie spécifique nage.",
    duration: durationMinutes,
    targetDistance: Math.round(mainM + 300) / 1000,
    targetPace: null,
    targetZone: null,
    targetRPE: 5,
    structure: [
      "Échauffement : 200-300m progressif",
      `Corps de séance : ${reps} × ${repDistance}m à allure soutenue mais contrôlée, 20-30s de récupération entre les répétitions`,
      "Retour au calme : 100-150m souple",
    ],
    exercises: null,
  };
}

export function buildSwimRacePace(params: SwimBuildParams): BuiltSession {
  const { weekType, durationMinutes, distanceM } = params;
  const reps = weekType === "DELOAD" ? 6 : 10;
  const repDistance = 100;

  return {
    sport: "SWIMMING",
    sessionType: "SWIM_RACE_PACE",
    title: `Allure course ${reps}×${repDistance}m`,
    description: "Intervalles à allure course triathlon (750m) — développement de la vitesse spécifique.",
    duration: durationMinutes,
    targetDistance: Math.round(distanceM) / 1000,
    targetPace: null,
    targetZone: null,
    targetRPE: 7,
    structure: [
      "Échauffement : 300-400m progressif + 4×25m accélérations",
      `Corps de séance : ${reps} × ${repDistance}m à allure course (départ toutes les 2:00-2:15), viser une régularité des temps entre répétitions`,
      "Retour au calme : 150-200m souple",
    ],
    exercises: null,
  };
}

export function buildOpenWaterSwim(durationMinutes = 30): BuiltSession {
  return {
    sport: "SWIMMING",
    sessionType: "OPEN_WATER",
    title: "Eau libre / sighting",
    description: "Spécifique course : navigation, départ groupé, sortie d'eau.",
    duration: durationMinutes,
    targetDistance: null,
    targetPace: null,
    targetZone: null,
    targetRPE: 6,
    structure: [
      "Échauffement : 5 min nage facile",
      "Pratique du sighting : lever la tête tous les 6-8 mouvements pour viser un repère",
      "Simulation départ groupé : 2-3 accélérations de 20-30s depuis l'arrêt",
      "Sortie d'eau rapide + 200-300m à allure course",
    ],
    exercises: null,
  };
}

export function buildSwimTimeTrial(): BuiltSession {
  return {
    sport: "SWIMMING",
    sessionType: "FITNESS_TEST",
    title: "Test 400m chronométré",
    description: "Test de référence pour calibrer l'allure course natation.",
    duration: 30,
    targetDistance: 0.4,
    targetPace: null,
    targetZone: null,
    targetRPE: 9,
    structure: [
      "Échauffement complet : 400-500m progressif + éducatifs",
      "400m départ arrêté à allure maximale soutenable, chronométré",
      "Retour au calme : 200m très facile",
      "Noter le temps — il sert de référence pour les séances allure course",
    ],
    exercises: null,
  };
}
