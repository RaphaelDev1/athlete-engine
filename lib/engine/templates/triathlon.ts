// Séance composite — jour de course triathlon sprint. Un BuiltSession ne
// représente qu'un seul sport ; ce résumé sert de repère jour-J avec les trois
// cibles temps, le détail par discipline est dans les séances de la semaine.

import { BuiltSession } from "../types";

export function buildTriathlonRaceDay(): BuiltSession {
  return {
    sport: "RUNNING",
    sessionType: "RACE",
    title: "Triathlon Sprint — Jour J",
    description: "750m nage · 20km vélo · 5km course à pied. Mise en application du plan d'allures.",
    duration: 75,
    targetDistance: null,
    targetPace: null,
    targetZone: null,
    targetRPE: 9,
    structure: [
      "Échauffement spécifique 20-30 min avant le départ (mobilité + quelques accélérations)",
      "Natation 750m — cible 12-14 min (~1:40-1:52/100m)",
      "T1 : transition rapide, enfiler chaussures/casque",
      "Vélo 20km — cible 35-40 min (30-34 km/h moyenne)",
      "T2 : transition rapide, chaussures de course",
      "Course à pied 5km — cible 20-23 min (4:00-4:36/km)",
      "Temps total visé : 1h07-1h17",
    ],
    exercises: null,
  };
}

function appendNote(session: BuiltSession, note: string): BuiltSession {
  return { ...session, structure: [...session.structure, note] };
}

/** Marque une séance comme faisant partie d'un enchaînement (brick) le même jour. */
export function markAsBrickLeg(session: BuiltSession, legLabel: "vélo" | "course"): BuiltSession {
  const note =
    legLabel === "vélo"
      ? "Brique : enchaîner immédiatement avec la course ci-dessous (T2 rapide, pas de pause)"
      : "Brique : enchaînée juste après le vélo — jambes lourdes au démarrage, c'est normal et c'est l'objectif de l'exercice";
  return { ...appendNote(session, note), isBrickLeg: true };
}
