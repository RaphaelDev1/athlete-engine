// Calcul nutritionnel :
// - BMR via Mifflin-St Jeor
// - TDEE ajusté au jour en fonction des séances réellement planifiées
// - Macros : protéines fixes (g/kg), glucides périodisés selon la charge du jour,
//   lipides en complément des calories restantes

import { Sex, Sport } from "@/lib/types";
import {
  GoalDirection,
  MacroTargets,
  MealMacro,
  NutritionTarget,
  TrainingDayLoad,
} from "./types";

// ─── BMR ─────────────────────────────────────────────────────────────────────

export interface BMRInput {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
}

/** Métabolisme de base (Mifflin-St Jeor). */
export function calculateBMR({ weightKg, heightCm, age, sex }: BMRInput): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === "MALE" ? base + 5 : base - 161);
}

// ─── TDEE ajusté par jour ────────────────────────────────────────────────────

// NEAT / activité de vie courante au-delà du métabolisme de base (hors séance).
const BASE_ACTIVITY_FACTOR = 1.2;

// MET approximatifs par sport, modulés par l'intensité perçue (RPE 1-10).
const MET_BY_SPORT: Record<Sport, (rpe: number) => number> = {
  RUNNING: (rpe) => 7 + rpe * 0.7,
  CYCLING: (rpe) => 5 + rpe * 0.6,
  SWIMMING: (rpe) => 6 + rpe * 0.5,
  STRENGTH: () => 5,
  MOBILITY: () => 2.5,
  REST: () => 0,
  OTHER: () => 4, // jamais planifié — valeur médiane pour ne pas fausser le TDEE si jamais utilisé
};

export interface DaySessionLoad {
  sport: Sport;
  duration: number | null; // minutes
  targetRPE: number | null;
}

/** Estimation des calories brûlées pour une séance donnée. */
export function estimateSessionBurn(
  session: DaySessionLoad,
  weightKg: number
): number {
  const durationMinutes = session.duration ?? 0;
  const rpe = session.targetRPE ?? 5;
  const met = MET_BY_SPORT[session.sport](rpe);
  return Math.round(met * weightKg * (durationMinutes / 60));
}

/** Détermine la charge du jour à partir des séances planifiées (pour périodiser les glucides). */
export function classifyDayLoad(sessions: DaySessionLoad[]): TrainingDayLoad {
  if (sessions.length === 0) return "REST";

  const totalMinutes = sessions.reduce((sum, s) => sum + (s.duration ?? 0), 0);
  const maxRPE = Math.max(...sessions.map((s) => s.targetRPE ?? 5));
  const hasLongRun = sessions.some(
    (s) => s.sport === "RUNNING" && (s.duration ?? 0) >= 90
  );

  if (hasLongRun || totalMinutes >= 120) return "LONG";
  if (maxRPE >= 7.5 || totalMinutes >= 75) return "HARD";
  if (totalMinutes >= 40) return "MODERATE";
  return "LIGHT";
}

/**
 * TDEE du jour = BMR + NEAT quotidien + dépense des séances planifiées ce jour-là.
 * C'est cet ajustement séance-par-séance qui rend le TDEE variable au jour le jour.
 *
 * `actualActiveKcal` (calories actives réelles remontées par la montre pour ce
 * jour, cf. GET /api/garmin/activity-calories) remplace, quand connu, la
 * somme estimée `estimateSessionBurn` — la nutrition colle alors à l'effort
 * réel plutôt qu'à la séance planifiée. `null`/`undefined` (pas encore de
 * donnée synchronisée, typiquement un jour futur) retombe sur l'estimation.
 */
export function calculateDailyTDEE(
  bmr: number,
  sessions: DaySessionLoad[],
  weightKg: number,
  actualActiveKcal?: number | null
): number {
  const neat = Math.round(bmr * (BASE_ACTIVITY_FACTOR - 1));
  const trainingKcal =
    actualActiveKcal ??
    sessions.reduce((sum, s) => sum + estimateSessionBurn(s, weightKg), 0);
  return Math.round(bmr + neat + trainingKcal);
}

// ─── Macros ──────────────────────────────────────────────────────────────────

const GOAL_CALORIE_ADJUSTMENT: Record<GoalDirection, number> = {
  DEFICIT: -400,
  MAINTENANCE: 0,
  SURPLUS: 250,
};

// Glucides périodisés (g/kg de poids de corps) selon la charge du jour.
const CARBS_PER_KG_BY_LOAD: Record<TrainingDayLoad, number> = {
  REST: 3,
  LIGHT: 4,
  MODERATE: 5.5,
  HARD: 6.5,
  LONG: 8,
};

const MIN_FAT_PER_KG = 0.7;

export interface MacroInput {
  tdee: number;
  weightKg: number;
  dayLoad: TrainingDayLoad;
  goalDirection: GoalDirection;
  proteinPerKg?: number; // défaut 1.8 g/kg
  /** Ajustement calorique/jour calculé depuis un poids visé (deriveWeightGoalAdjustment) — prioritaire sur GOAL_CALORIE_ADJUSTMENT[goalDirection]. */
  calorieAdjustmentOverride?: number;
}

/**
 * Macros du jour : protéines fixes, glucides périodisés selon la charge du jour,
 * lipides en complément des calories restantes (avec un plancher de sécurité).
 */
export function calculateMacros({
  tdee,
  weightKg,
  dayLoad,
  goalDirection,
  proteinPerKg = 1.8,
  calorieAdjustmentOverride,
}: MacroInput): MacroTargets {
  const adjustment = calorieAdjustmentOverride ?? GOAL_CALORIE_ADJUSTMENT[goalDirection];
  const calorieTarget = Math.round(tdee + adjustment);

  const protein = Math.round(proteinPerKg * weightKg);
  let carbs = Math.round(CARBS_PER_KG_BY_LOAD[dayLoad] * weightKg);

  const proteinKcal = protein * 4;
  const minFat = Math.round(MIN_FAT_PER_KG * weightKg);

  const remainingForFat = calorieTarget - proteinKcal - carbs * 4;
  let fat = Math.round(remainingForFat / 9);

  if (fat < minFat) {
    // Pas assez de marge : on rogne les glucides pour garantir le plancher lipidique.
    fat = minFat;
    const remainingForCarbs = calorieTarget - proteinKcal - fat * 9;
    carbs = Math.max(0, Math.round(remainingForCarbs / 4));
  }

  const calories = proteinKcal + carbs * 4 + fat * 9;

  return { calories: Math.round(calories), protein, carbs, fat };
}

export interface NutritionTargetInput {
  bmrInput: BMRInput;
  sessions: DaySessionLoad[];
  goalDirection: GoalDirection;
  proteinPerKg?: number;
  calorieAdjustmentOverride?: number;
  /** Calories actives réelles du jour (montre) — voir calculateDailyTDEE. */
  actualActiveKcal?: number | null;
}

/** Calcule la cible nutritionnelle complète d'un jour donné. */
export function calculateDayNutrition({
  bmrInput,
  sessions,
  goalDirection,
  proteinPerKg,
  calorieAdjustmentOverride,
  actualActiveKcal,
}: NutritionTargetInput): NutritionTarget {
  const bmr = calculateBMR(bmrInput);
  const tdee = calculateDailyTDEE(bmr, sessions, bmrInput.weightKg, actualActiveKcal);
  const dayLoad = classifyDayLoad(sessions);
  const macros = calculateMacros({
    tdee,
    weightKg: bmrInput.weightKg,
    dayLoad,
    goalDirection,
    proteinPerKg,
    calorieAdjustmentOverride,
  });

  return {
    ...macros,
    bmr,
    tdee,
    dayLoad,
    goalDirection,
    usedActualCalories: actualActiveKcal != null,
  };
}

// ─── Poids visé (Phase 4) ─────────────────────────────────────────────────────

const KCAL_PER_KG = 7700;
const MAX_LOSS_RATE_KG_PER_WEEK = 0.75;
const MAX_GAIN_RATE_KG_PER_WEEK = 0.3;
const DEFAULT_HORIZON_WEEKS = 12; // repli si l'objectif n'a pas d'échéance

export interface WeightGoalAdjustment {
  direction: GoalDirection;
  weeklyRateKg: number; // signé : négatif = perte, positif = prise
  calorieAdjustment: number; // kcal/jour, signé
}

/**
 * Traduit un objectif de poids (Goal type COMPOSITION) en direction + ajustement
 * calorique/jour, à un rythme hebdomadaire sûr (borné à -0.75/+0.3 kg/semaine)
 * plutôt que le -400/+250 kcal fixe de GOAL_CALORIE_ADJUSTMENT.
 */
export function deriveWeightGoalAdjustment(
  currentWeightKg: number,
  targetWeightKg: number,
  deadline: Date | null,
  today: Date = new Date()
): WeightGoalAdjustment {
  const delta = targetWeightKg - currentWeightKg; // > 0 = prise de masse
  if (Math.abs(delta) < 0.5) {
    return { direction: "MAINTENANCE", weeklyRateKg: 0, calorieAdjustment: 0 };
  }

  const weeksRemaining = deadline
    ? Math.max(1, Math.round((deadline.getTime() - today.getTime()) / (7 * 86400000)))
    : DEFAULT_HORIZON_WEEKS;

  let weeklyRateKg = delta / weeksRemaining;
  weeklyRateKg =
    delta < 0
      ? Math.max(weeklyRateKg, -MAX_LOSS_RATE_KG_PER_WEEK)
      : Math.min(weeklyRateKg, MAX_GAIN_RATE_KG_PER_WEEK);

  return {
    direction: delta < 0 ? "DEFICIT" : "SURPLUS",
    weeklyRateKg: Math.round(weeklyRateKg * 100) / 100,
    calorieAdjustment: Math.round((weeklyRateKg * KCAL_PER_KG) / 7),
  };
}

// ─── Répartition par repas ───────────────────────────────────────────────────

interface MealDef {
  key: string;
  name: string;
  timing: string;
  pct: number;
}

const STANDARD_MEALS: MealDef[] = [
  { key: "breakfast", name: "Petit-déjeuner", timing: "07h00", pct: 0.25 },
  { key: "lunch", name: "Déjeuner", timing: "12h30", pct: 0.3 },
  { key: "snack", name: "Collation", timing: "16h30", pct: 0.15 },
  { key: "dinner", name: "Dîner", timing: "19h30", pct: 0.3 },
];

const RECOVERY_MEALS: MealDef[] = [
  { key: "breakfast", name: "Petit-déjeuner", timing: "07h00", pct: 0.22 },
  { key: "lunch", name: "Déjeuner", timing: "12h30", pct: 0.25 },
  { key: "recovery", name: "Collation post-effort", timing: "à J+30min", pct: 0.2 },
  { key: "dinner", name: "Dîner", timing: "19h30", pct: 0.33 },
];

/** Répartit les macros du jour sur les repas ; ajoute une collation de récup les jours de charge. */
export function buildMealPlan(
  macros: MacroTargets,
  dayLoad: TrainingDayLoad
): MealMacro[] {
  const meals = dayLoad === "HARD" || dayLoad === "LONG" ? RECOVERY_MEALS : STANDARD_MEALS;

  return meals.map((meal) => ({
    key: meal.key,
    name: meal.name,
    timing: meal.timing,
    pctOfDay: Math.round(meal.pct * 100),
    calories: Math.round(macros.calories * meal.pct),
    protein: Math.round(macros.protein * meal.pct),
    carbs: Math.round(macros.carbs * meal.pct),
    fat: Math.round(macros.fat * meal.pct),
  }));
}
