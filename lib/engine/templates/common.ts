// Séances types génériques — repos et mobilité.

import { BuiltSession } from "../types";

export function buildRestDay(): BuiltSession {
  return {
    sport: "REST",
    sessionType: "REST_DAY",
    title: "Repos",
    description: "Jour de repos complet — pas d'entraînement structuré.",
    duration: null,
    targetDistance: null,
    targetPace: null,
    targetZone: null,
    targetRPE: null,
    structure: ["Repos complet ou activité libre très légère (marche, étirements)"],
    exercises: null,
  };
}

export function buildMobilitySession(durationMinutes = 20): BuiltSession {
  return {
    sport: "MOBILITY",
    sessionType: "MOBILITY_SESSION",
    title: "Mobilité",
    description: "Travail de mobilité et de prévention des blessures.",
    duration: durationMinutes,
    targetDistance: null,
    targetPace: null,
    targetZone: null,
    targetRPE: 2,
    structure: [
      "Mobilité hanches, chevilles, épaules — 3 tours",
      "Gainage et activation posturale",
      "Étirements dynamiques",
    ],
    exercises: null,
  };
}
