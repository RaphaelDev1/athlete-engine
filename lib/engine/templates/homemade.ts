// Bibliothèque de séances types — mode vacances (sans salle, piscine ni home
// trainer). Musculation au poids du corps + cardio home-made, ondulation
// lourd/modéré/léger conservée via la charge perçue (RPE) plutôt que le %1RM.

import { BuiltExercise, BuiltSession, HomeStrengthBuildParams } from "../types";

const VARIANT_LABEL: Record<HomeStrengthBuildParams["dayVariant"], string> = {
  HEAVY: "lesté / tempo lent",
  MODERATE: "standard",
  LIGHT: "léger",
};

interface HomeExerciseDef {
  name: string;
  repsHeavy: string;
  repsModerate: string;
  repsLight: string;
}

const HOME_EXERCISES: HomeExerciseDef[] = [
  { name: "Pompes (surélevées/diamant/déclinées)", repsHeavy: "5×max", repsModerate: "4×max", repsLight: "3×12-15" },
  { name: "Tractions ou rowing sac à dos lesté", repsHeavy: "5×max", repsModerate: "4×max", repsLight: "3×10-12" },
  { name: "Squats bulgares (pied surélevé)", repsHeavy: "4×12/jambe", repsModerate: "3×12/jambe", repsLight: "3×10/jambe" },
  { name: "Dips sur chaises", repsHeavy: "4×max", repsModerate: "3×max", repsLight: "3×10-12" },
  { name: "Pont fessier unilatéral", repsHeavy: "4×15/jambe", repsModerate: "3×15/jambe", repsLight: "3×12/jambe" },
  { name: "Planche + mountain climbers", repsHeavy: "4×45s+20", repsModerate: "3×30s+15", repsLight: "3×20s+10" },
];

function repsFor(def: HomeExerciseDef, variant: HomeStrengthBuildParams["dayVariant"]): string {
  if (variant === "HEAVY") return def.repsHeavy;
  if (variant === "LIGHT") return def.repsLight;
  return def.repsModerate;
}

export function buildHomeBodyweightStrength(params: HomeStrengthBuildParams): BuiltSession {
  const { weekType, dayVariant } = params;
  const rpe = dayVariant === "HEAVY" ? 8 : dayVariant === "LIGHT" ? 5.5 : 7;
  const restSeconds = dayVariant === "HEAVY" ? 90 : dayVariant === "LIGHT" ? 45 : 60;

  const exercises: BuiltExercise[] = HOME_EXERCISES.map((def) => ({
    name: def.name,
    sets: Number(repsFor(def, dayVariant).split("×")[0]),
    reps: repsFor(def, dayVariant).split("×")[1],
    targetRPE: rpe,
    restSeconds,
    notes: "Sac à dos rempli de bouteilles d'eau = lest improvisé si besoin",
  }));

  return {
    sport: "STRENGTH",
    sessionType: "FULL_BODY",
    title: `Full Body maison — ${VARIANT_LABEL[dayVariant]}`,
    description: `Séance poids du corps sans matériel${
      weekType === "DELOAD" ? " — semaine de décharge (moins de volume)" : ""
    }.`,
    duration: 35,
    targetDistance: null,
    targetPace: null,
    targetZone: null,
    targetRPE: rpe,
    structure: [
      "Échauffement articulaire 5-8 min",
      ...exercises.map((ex) => `${ex.name} : ${ex.sets} × ${ex.reps} — repos ${ex.restSeconds}s`),
      "Étirements légers",
    ],
    exercises,
  };
}

export function buildHomeCardioHIIT(): BuiltSession {
  return {
    sport: "RUNNING",
    sessionType: "HOME_CIRCUIT",
    title: "Circuit HIIT sans matériel",
    description: "Cardio intense à domicile — 4 tours, aucun équipement nécessaire.",
    duration: 20,
    targetDistance: null,
    targetPace: null,
    targetZone: 4,
    targetRPE: 7,
    structure: [
      "Échauffement 5 min : rotations articulaires + jumping jacks légers",
      "4 tours de : 30s burpees, 30s mountain climbers, 30s squat jumps, 30s pompes, 1 min repos",
      "Retour au calme + étirements 5 min",
    ],
    exercises: null,
  };
}

export function buildHomeEasyCardio(durationMinutes = 35): BuiltSession {
  return {
    sport: "RUNNING",
    sessionType: "EASY_RUN",
    title: "Footing / marche active vacances",
    description: "Cardio facile en extérieur — terrain varié bienvenu (sable, collines).",
    duration: durationMinutes,
    targetDistance: null,
    targetPace: null,
    targetZone: 2,
    targetRPE: 3,
    structure: [
      `${durationMinutes} min en aisance respiratoire totale`,
      "Terrain varié = bonus proprioceptif (sable mou, sentiers, collines)",
      "Aucune pression de performance — l'objectif est de bouger",
    ],
    exercises: null,
  };
}
