// Types partagés du moteur d'entraînement et de nutrition (Phase 2).

import { ExperienceLevel, Sport, SessionType, WeekType } from "@/lib/types";

// ─── Zones ───────────────────────────────────────────────────────────────────

export interface HRZone {
  zone: number;
  name: string;
  minHR: number;
  maxHR: number;
  minPct: number;
  maxPct: number;
  description: string;
}

export type PaceZoneKey =
  | "EASY"
  | "MARATHON"
  | "THRESHOLD"
  | "INTERVAL"
  | "REPETITION";

export interface PaceZone {
  key: PaceZoneKey;
  name: string;
  code: string;
  minPaceSecPerKm: number; // allure la plus rapide de la zone
  maxPaceSecPerKm: number; // allure la plus lente de la zone
  description: string;
}

export interface PowerZone {
  zone: number;
  name: string;
  minWatts: number;
  maxWatts: number | null;
  minPct: number;
  maxPct: number | null;
  description: string;
}

export interface AthleteZones {
  hr: HRZone[] | null;
  pace: PaceZone[] | null;
  power: PowerZone[] | null;
  vdot: number | null;
}

// ─── Nutrition ───────────────────────────────────────────────────────────────

export type TrainingDayLoad = "REST" | "LIGHT" | "MODERATE" | "HARD" | "LONG";

export type GoalDirection = "DEFICIT" | "MAINTENANCE" | "SURPLUS";

export interface MacroTargets {
  calories: number;
  protein: number; // g
  carbs: number; // g
  fat: number; // g
}

export interface NutritionTarget extends MacroTargets {
  bmr: number;
  tdee: number;
  dayLoad: TrainingDayLoad;
  goalDirection: GoalDirection;
  /** true si le TDEE du jour vient des calories actives réelles Garmin plutôt que de l'estimation MET. */
  usedActualCalories: boolean;
}

export interface MealMacro {
  key: string;
  name: string;
  timing: string;
  pctOfDay: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

// ─── Templates de séances ────────────────────────────────────────────────────

export type StrengthPhase = "HYPERTROPHY" | "STRENGTH" | "PEAKING";

export type StrengthFocus =
  | "FULL_BODY"
  | "UPPER_BODY"
  | "LOWER_BODY"
  | "PUSH"
  | "PULL"
  | "LEGS";

/** Ondulation quotidienne (DUP) au sein d'une même semaine/phase. */
export type StrengthDayVariant = "HEAVY" | "MODERATE" | "LIGHT";

export interface OneRMs {
  squat: number | null;
  bench: number | null;
  deadlift: number | null;
  ohp: number | null;
}

export interface BuiltExercise {
  name: string;
  sets: number;
  reps: string;
  targetRPE: number | null;
  restSeconds: number | null;
  notes: string | null;
}

export interface BuiltSession {
  sport: Sport;
  sessionType: SessionType;
  title: string;
  description: string;
  duration: number | null; // minutes
  targetDistance: number | null; // km
  targetPace: number | null; // sec/km
  targetZone: number | null; // zone FC/watts 1-N
  targetRPE: number | null; // 1-10
  structure: string[]; // étapes de la séance (échauffement, corps, retour au calme)
  exercises: BuiltExercise[] | null;
  // Fait partie d'un enchaînement brick (vélo puis course le même jour) — les
  // deux jambes doivent rester groupées sur le même jour quand le générateur
  // remappe les séances sur les jours dispo (lib/engine/periodization.ts::
  // remapToAvailableDays), contrairement à deux séances qui partagent juste
  // le même jour d'origine par coïncidence du template.
  isBrickLeg?: boolean;
}

export interface RunningBuildParams {
  zones: AthleteZones;
  weekType: WeekType;
  durationMinutes: number;
  distanceKm: number;
}

export interface StrengthBuildParams {
  phase: StrengthPhase;
  focus: StrengthFocus;
  oneRMs: OneRMs;
  weekType: WeekType;
  experienceLevel: ExperienceLevel | null;
  dayVariant: StrengthDayVariant;
}

export interface CyclingBuildParams {
  zones: AthleteZones;
  weekType: WeekType;
  durationMinutes: number;
}

export interface SwimBuildParams {
  weekType: WeekType;
  durationMinutes: number;
  distanceM: number; // mètres
}

/** Ondulation lourd/modéré/léger appliquée à la variante bodyweight (vacances). */
export interface HomeStrengthBuildParams {
  weekType: WeekType;
  dayVariant: StrengthDayVariant;
}

// ─── Plan d'entraînement généré ──────────────────────────────────────────────

export interface GeneratedSession extends BuiltSession {
  id: string;
  dayOfWeek: number; // 0 = lundi ... 6 = dimanche
  scheduledDate: Date;
}

/** Grandes phases du mésocycle triathlon (distinctes des blocs muscu HYPERTROPHY/STRENGTH/PEAKING). */
export type MacroPhase =
  | "RECONDITIONING"
  | "DEVELOPMENT"
  | "INTENSIFICATION"
  | "PEAKING";

export interface GeneratedWeek {
  id: string;
  weekNumber: number;
  weekType: WeekType;
  phase: StrengthPhase | null;
  macroPhase: MacroPhase | null;
  plannedTests: string[];
  startDate: Date;
  endDate: Date;
  targetVolume: number | null; // km (course) — indicatif
  sessions: GeneratedSession[];
}

export type PlanGoalType = "RUNNING" | "STRENGTH" | "MIXED" | "TRIATHLON";

export interface GeneratedPlan {
  name: string;
  goalType: PlanGoalType;
  startDate: Date;
  endDate: Date;
  totalWeeks: number;
  weeks: GeneratedWeek[];
}
