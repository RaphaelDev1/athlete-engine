// Types miroir du schéma Prisma — utilisés tant que prisma generate
// ne peut pas tourner dans cet environnement.
// En production, remplacer par les types générés de @prisma/client.

// ─── Enums ───────────────────────────────────────────────────────────────────

export type Sex = "MALE" | "FEMALE";

export type ExperienceLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

export type Discipline = "RUNNING" | "STRENGTH" | "CYCLING" | "SWIMMING";

export type GoalType =
  | "RUNNING"
  | "STRENGTH"
  | "COMPOSITION"
  | "MIXED"
  | "FREE";

export type GoalPriority = "PRIMARY" | "SECONDARY" | "MAINTENANCE";

export type GoalStatus = "ACTIVE" | "COMPLETED" | "PAUSED" | "CANCELLED";

export type PlanStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export type WeekType = "LOAD" | "DELOAD" | "TAPER" | "RECOVERY" | "TEST";

export type Sport =
  | "RUNNING"
  | "STRENGTH"
  | "CYCLING"
  | "SWIMMING"
  | "REST"
  | "MOBILITY";

export type SessionType =
  | "LONG_RUN"
  | "TEMPO"
  | "INTERVALS"
  | "RECOVERY_RUN"
  | "FARTLEK"
  | "HILLS"
  | "EASY_RUN"
  | "RACE"
  | "FULL_BODY"
  | "UPPER_BODY"
  | "LOWER_BODY"
  | "PUSH"
  | "PULL"
  | "LEGS"
  | "ENDURANCE_RIDE"
  | "TEMPO_RIDE"
  | "INTERVAL_RIDE"
  | "SWIM_TECHNIQUE"
  | "SWIM_ENDURANCE"
  | "SWIM_RACE_PACE"
  | "OPEN_WATER"
  | "BRICK"
  | "FITNESS_TEST"
  | "HOME_CIRCUIT"
  | "REST_DAY"
  | "MOBILITY_SESSION"
  | "CUSTOM";

export type SessionStatus =
  | "PLANNED"
  | "COMPLETED"
  | "PARTIAL"
  | "SKIPPED"
  | "RESCHEDULED";

export type GarminDataType =
  | "SLEEP"
  | "ACTIVITY"
  | "HRV"
  | "BODY_BATTERY"
  | "TRAINING_READINESS"
  | "TRAINING_STATUS"
  | "TRAINING_LOAD"
  | "STRESS"
  | "VO2MAX"
  | "RESTING_HR"
  | "MAX_HR";

// ─── Models ──────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
  garminLastSyncAt: Date | null;
  garminLastSyncStatus: string | null;
  garminLastSyncError: string | null;
}

export interface AthleteProfile {
  id: string;
  userId: string;

  // Biométrie
  height: number | null;
  weight: number | null;
  dateOfBirth: Date | null;
  sex: Sex | null;
  bodyFatPct: number | null;

  // Cardio
  restingHR: number | null;
  maxHR: number | null;

  // Course
  vo2max: number | null;
  thresholdPace: number | null;
  weeklyVolume: number | null;

  // Musculation
  experienceLevel: ExperienceLevel | null;
  weeklyFrequency: number | null;

  // Vélo
  ftp: number | null;
  wattsPerKg: number | null;
  preferredCadence: number | null;

  createdAt: Date;
  updatedAt: Date;

  personalRecords?: PersonalRecord[];
}

export interface PersonalRecord {
  id: string;
  profileId: string;
  discipline: Discipline;
  exercise: string;
  value: number;
  unit: string;
  achievedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Goal {
  id: string;
  userId: string;
  type: GoalType;
  title: string;
  description: string | null;
  targetValue: number | null;
  targetUnit: string | null;
  deadline: Date | null;
  priority: GoalPriority;
  status: GoalStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrainingPlan {
  id: string;
  userId: string;
  goalId: string | null;
  name: string;
  startDate: Date;
  endDate: Date;
  status: PlanStatus;
  createdAt: Date;
  updatedAt: Date;
  weeks?: TrainingWeek[];
}

export interface TrainingWeek {
  id: string;
  planId: string;
  weekNumber: number;
  weekType: WeekType;
  targetVolume: number | null;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
  sessions?: TrainingSession[];
}

export interface TrainingSession {
  id: string;
  weekId: string;
  sport: Sport;
  sessionType: SessionType;
  title: string;
  description: string | null;
  scheduledDate: Date;
  scheduledTime: string | null;
  duration: number | null;
  actualDuration: number | null;
  targetDistance: number | null;
  targetPace: number | null;
  targetZone: number | null;
  targetRPE: number | null;
  actualRPE: number | null;
  status: SessionStatus;
  notes: string | null;
  structure: string[] | null;
  createdAt: Date;
  updatedAt: Date;
  exercises?: Exercise[];
}

export interface Exercise {
  id: string;
  sessionId: string;
  name: string;
  orderIndex: number;
  sets: number | null;
  reps: string | null;
  weight: number | null;
  targetRPE: number | null;
  restSeconds: number | null;
  notes: string | null;
  actualSets: number | null;
  actualReps: number | null;
  actualWeight: number | null;
  actualRPE: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NutritionDay {
  id: string;
  userId: string;
  date: Date;
  bmr: number;
  tdee: number;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  isTrainingDay: boolean;
  trainingType: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GarminData {
  id: string;
  userId: string;
  dataType: GarminDataType;
  date: Date;
  payload: Record<string, unknown>;
  summaryValue: number | null;
  createdAt: Date;
}

export interface DailyCheckIn {
  id: string;
  userId: string;
  date: Date;
  energy: number;
  soreness: boolean;
  sorenessLocation: string | null;
  motivation: number;
  stress: number;
  notes: string | null;
  createdAt: Date;
}

// ─── Form schemas (pour React Hook Form + Zod) ──────────────────────────────

export interface ProfileFormData {
  // Biométrie
  height: number | null;
  weight: number | null;
  dateOfBirth: string | null;
  sex: Sex | null;
  bodyFatPct: number | null;
  restingHR: number | null;
  maxHR: number | null;

  // Course
  vo2max: number | null;
  thresholdPace: string | null; // "MM:SS" format
  weeklyVolume: number | null;

  // Musculation
  experienceLevel: ExperienceLevel | null;
  weeklyFrequency: number | null;

  // PRs course (en secondes)
  pr5k: string | null;
  pr10k: string | null;
  prHalf: string | null;
  prMarathon: string | null;

  // PRs muscu (kg)
  prSquat: number | null;
  prBench: number | null;
  prDeadlift: number | null;
  prOHP: number | null;

  // Vélo
  ftp: number | null;
  wattsPerKg: number | null;
  preferredCadence: number | null;
}

export interface GoalFormData {
  type: GoalType;
  title: string;
  description: string;
  targetValue: number | null;
  targetUnit: string;
  deadline: string;
  priority: GoalPriority;
}
