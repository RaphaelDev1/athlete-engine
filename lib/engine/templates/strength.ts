// Bibliothèque de séances types — musculation.
//
// Deux niveaux de périodisation combinés :
// - Blocs (mésocycle) : hypertrophie → force → peaking, qui font progressivement
//   monter la fourchette de %1RM travaillée au fil des semaines.
// - Ondulation quotidienne (DUP) : au sein d'une même semaine/phase, chaque
//   séance alterne lourd / modéré / léger (charge et répétitions différentes).

import {
  BuiltExercise,
  BuiltSession,
  OneRMs,
  StrengthBuildParams,
  StrengthDayVariant,
  StrengthFocus,
  StrengthPhase,
} from "../types";

interface VariantProfile {
  repsLabel: string;
  pctMin: number;
  pctMax: number;
  rpe: number;
  restSeconds: number;
}

const PHASE_SETS: Record<StrengthPhase, number> = {
  HYPERTROPHY: 4,
  STRENGTH: 5,
  PEAKING: 4,
};

const PHASE_VARIANTS: Record<StrengthPhase, Record<StrengthDayVariant, VariantProfile>> = {
  HYPERTROPHY: {
    HEAVY: { repsLabel: "6-8", pctMin: 0.72, pctMax: 0.78, rpe: 8, restSeconds: 90 },
    MODERATE: { repsLabel: "8-12", pctMin: 0.65, pctMax: 0.72, rpe: 7.5, restSeconds: 75 },
    LIGHT: { repsLabel: "12-15", pctMin: 0.55, pctMax: 0.62, rpe: 6.5, restSeconds: 60 },
  },
  STRENGTH: {
    HEAVY: { repsLabel: "2-4", pctMin: 0.85, pctMax: 0.92, rpe: 9, restSeconds: 180 },
    MODERATE: { repsLabel: "4-6", pctMin: 0.78, pctMax: 0.85, rpe: 8, restSeconds: 150 },
    LIGHT: { repsLabel: "6-8", pctMin: 0.7, pctMax: 0.76, rpe: 7, restSeconds: 120 },
  },
  PEAKING: {
    HEAVY: { repsLabel: "1-2", pctMin: 0.92, pctMax: 0.97, rpe: 9.5, restSeconds: 240 },
    MODERATE: { repsLabel: "2-3", pctMin: 0.87, pctMax: 0.92, rpe: 9, restSeconds: 210 },
    LIGHT: { repsLabel: "4-6", pctMin: 0.8, pctMax: 0.87, rpe: 8, restSeconds: 150 },
  },
};

const PHASE_LABELS: Record<StrengthPhase, string> = {
  HYPERTROPHY: "Hypertrophie",
  STRENGTH: "Force",
  PEAKING: "Peaking",
};

const VARIANT_LABELS: Record<StrengthDayVariant, string> = {
  HEAVY: "lourd",
  MODERATE: "modéré",
  LIGHT: "léger",
};

const FOCUS_LABELS: Record<StrengthFocus, string> = {
  FULL_BODY: "Full Body",
  UPPER_BODY: "Haut du corps",
  LOWER_BODY: "Bas du corps",
  PUSH: "Push",
  PULL: "Pull",
  LEGS: "Jambes",
};

function roundToPlate(weight: number): number {
  return Math.round(weight / 2.5) * 2.5;
}

function resolveProfile(
  phase: StrengthPhase,
  dayVariant: StrengthDayVariant,
  sets: number,
  weekType: StrengthBuildParams["weekType"]
): VariantProfile & { sets: number } {
  const base = PHASE_VARIANTS[phase][dayVariant];

  if (weekType !== "DELOAD") {
    return { ...base, sets };
  }

  // Semaine de décharge : on rogne charge, volume et RPE quelle que soit la variante du jour.
  return {
    ...base,
    pctMin: Math.max(0.4, base.pctMin - 0.1),
    pctMax: Math.max(0.45, base.pctMax - 0.1),
    rpe: Math.max(5, base.rpe - 2),
    sets: Math.max(2, sets - 1),
  };
}

function buildExercise(
  name: string,
  oneRM: number | null,
  profile: VariantProfile & { sets: number }
): BuiltExercise {
  const notes = oneRM
    ? `≈${roundToPlate(oneRM * ((profile.pctMin + profile.pctMax) / 2))} kg (${Math.round(
        profile.pctMin * 100
      )}-${Math.round(profile.pctMax * 100)}% 1RM)`
    : `RPE ${profile.rpe} — charge au ressenti (1RM inconnu)`;

  return {
    name,
    sets: profile.sets,
    reps: profile.repsLabel,
    targetRPE: profile.rpe,
    restSeconds: profile.restSeconds,
    notes,
  };
}

// Exercices accessoires : volume plus élevé, charge secondaire par rapport aux
// mouvements principaux, mais ils suivent la même ondulation lourd/léger.
function accessoryProfile(
  profile: VariantProfile & { sets: number }
): VariantProfile & { sets: number } {
  return { ...profile, repsLabel: "12-15", restSeconds: 60 };
}

const FOCUS_EXERCISES: Record<
  StrengthFocus,
  { name: string; oneRMKey: keyof OneRMs | null }[]
> = {
  FULL_BODY: [
    { name: "Squat", oneRMKey: "squat" },
    { name: "Développé couché", oneRMKey: "bench" },
    { name: "Tirage horizontal", oneRMKey: null },
    { name: "Gainage", oneRMKey: null },
  ],
  UPPER_BODY: [
    { name: "Développé couché", oneRMKey: "bench" },
    { name: "Développé militaire", oneRMKey: "ohp" },
    { name: "Tirage horizontal", oneRMKey: null },
    { name: "Curl biceps", oneRMKey: null },
    { name: "Extension triceps", oneRMKey: null },
  ],
  LOWER_BODY: [
    { name: "Squat", oneRMKey: "squat" },
    { name: "Soulevé de terre roumain", oneRMKey: "deadlift" },
    { name: "Fentes bulgares", oneRMKey: null },
    { name: "Mollets debout", oneRMKey: null },
    { name: "Gainage", oneRMKey: null },
  ],
  PUSH: [
    { name: "Développé couché", oneRMKey: "bench" },
    { name: "Développé militaire", oneRMKey: "ohp" },
    { name: "Dips", oneRMKey: null },
    { name: "Extension triceps", oneRMKey: null },
  ],
  PULL: [
    { name: "Soulevé de terre", oneRMKey: "deadlift" },
    { name: "Tirage horizontal", oneRMKey: null },
    { name: "Rowing haltère", oneRMKey: null },
    { name: "Curl biceps", oneRMKey: null },
  ],
  LEGS: [
    { name: "Squat", oneRMKey: "squat" },
    { name: "Soulevé de terre roumain", oneRMKey: "deadlift" },
    { name: "Fentes bulgares", oneRMKey: null },
    { name: "Mollets debout", oneRMKey: null },
  ],
};

const SESSION_TYPE_BY_FOCUS: Record<StrengthFocus, BuiltSession["sessionType"]> = {
  FULL_BODY: "FULL_BODY",
  UPPER_BODY: "UPPER_BODY",
  LOWER_BODY: "LOWER_BODY",
  PUSH: "PUSH",
  PULL: "PULL",
  LEGS: "LEGS",
};

export function buildOneRMTest(oneRMs: OneRMs): BuiltSession {
  const known = (["squat", "bench", "deadlift"] as const).filter((k) => oneRMs[k]);
  return {
    sport: "STRENGTH",
    sessionType: "FITNESS_TEST",
    title: "Test 1RM estimé",
    description: "Calibration des charges via un set proche du maximum (formule d'Epley).",
    duration: 60,
    targetDistance: null,
    targetPace: null,
    targetZone: null,
    targetRPE: 9,
    structure: [
      "Échauffement complet et progressif",
      "Squat, développé couché, soulevé de terre : monter progressivement jusqu'à un set de 3-5 reps au RPE 9 (1 rep en réserve)",
      "1RM estimé = poids × (1 + reps/30)",
      known.length > 0
        ? `Dernières valeurs connues : ${known.map((k) => `${k} ${oneRMs[k]}kg`).join(", ")}`
        : "Aucune valeur de départ enregistrée — ce test sert de référence",
    ],
    exercises: null,
  };
}

export function buildStrengthSession(params: StrengthBuildParams): BuiltSession {
  const { phase, focus, oneRMs, weekType, dayVariant } = params;
  const baseProfile = resolveProfile(phase, dayVariant, PHASE_SETS[phase], weekType);

  const definitions = FOCUS_EXERCISES[focus];
  const exercises: BuiltExercise[] = definitions.map((def, idx) => {
    // Les 1-2 premiers exercices (mouvements principaux) suivent le %1RM de la
    // variante du jour ; les suivants sont des accessoires à volume plus élevé.
    const isPrimary = idx < 2;
    const profile = isPrimary ? baseProfile : accessoryProfile(baseProfile);
    const oneRM = def.oneRMKey ? oneRMs[def.oneRMKey] : null;
    return buildExercise(def.name, oneRM, profile);
  });

  const totalMinutes = exercises.reduce(
    (sum, ex) => sum + ex.sets * (1.5 + (ex.restSeconds ?? 0) / 60),
    15 // échauffement + transitions
  );

  return {
    sport: "STRENGTH",
    sessionType: SESSION_TYPE_BY_FOCUS[focus],
    title: `${FOCUS_LABELS[focus]} — ${VARIANT_LABELS[dayVariant]}`,
    description: `Bloc ${PHASE_LABELS[phase].toLowerCase()}, jour ${VARIANT_LABELS[dayVariant]}${
      weekType === "DELOAD" ? " — semaine de décharge (volume et charge réduits)" : ""
    }.`,
    duration: Math.round(totalMinutes),
    targetDistance: null,
    targetPace: null,
    targetZone: null,
    targetRPE: baseProfile.rpe,
    structure: [
      "Échauffement général 10 min + activation spécifique",
      ...exercises.map(
        (ex) => `${ex.name} : ${ex.sets} × ${ex.reps} — ${ex.notes} — repos ${ex.restSeconds ?? 0}s`
      ),
    ],
    exercises,
  };
}
