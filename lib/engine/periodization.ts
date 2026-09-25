// Génération d'un plan d'entraînement de X semaines à partir d'un ou plusieurs
// objectifs (course et/ou musculation).
//
// Course : modèle 80/20 polarisé (80% du temps à faible intensité, 20% en
// tempo/intervalles) avec une semaine de décharge toutes les 4 semaines, et un
// affûtage automatique si une date de course est fournie.
//
// Musculation : blocs hypertrophie → force → peaking sur le mésocycle, combinés
// à une ondulation quotidienne (DUP) lourd/modéré/léger au sein de chaque semaine.

import { ExperienceLevel, SessionType, Sport, WeekType } from "@/lib/types";
import { computeAthleteZones } from "./zones";
import {
  buildEasyRun,
  buildEnduranceRide,
  buildFtpTest,
  buildHomeBodyweightStrength,
  buildHomeCardioHIIT,
  buildHomeEasyCardio,
  buildIntervalRide,
  buildIntervals,
  buildLongRun,
  buildLucLegerSimulation,
  buildLucLegerTest,
  buildMobilitySession,
  buildOneRMTest,
  buildOpenWaterSwim,
  buildRaceSession,
  buildRecoveryRun,
  buildRestDay,
  buildStrengthSession,
  buildSwimEndurance,
  buildSwimRacePace,
  buildSwimTechnique,
  buildSwimTimeTrial,
  buildTempoRide,
  buildTempoRun,
  buildTriathlonRaceDay,
  markAsBrickLeg,
} from "./templates";
import {
  AthleteZones,
  BuiltSession,
  GeneratedPlan,
  GeneratedSession,
  GeneratedWeek,
  MacroPhase,
  OneRMs,
  PlanGoalType,
  StrengthDayVariant,
  StrengthFocus,
  StrengthPhase,
} from "./types";

// ─── Entrée du générateur ────────────────────────────────────────────────────

export interface PeriodizationProfile {
  weightKg: number | null;
  experienceLevel: ExperienceLevel | null;
  weeklyVolume: number | null; // km/semaine, course
  weeklyFrequency: number | null; // séances muscu/semaine
  restingHR: number | null;
  maxHR: number | null;
  vo2max: number | null;
  thresholdPace: number | null; // sec/km
  ftp: number | null; // watts
  prSquat: number | null;
  prBench: number | null;
  prDeadlift: number | null;
  prOHP: number | null;
}

export interface PeriodizationInput {
  planName: string;
  startDate: Date;
  totalWeeks: number;
  goalType: PlanGoalType;
  profile: PeriodizationProfile;
  raceDate?: Date | null;
  /** Pas de salle/piscine/home trainer — séances remplacées par des variantes home-made. */
  vacationMode?: boolean;
  /** 0 = lundi ... 6 = dimanche. Par défaut (absent ou 7 jours) : aucune contrainte. */
  availableDays?: number[];
  /** Budget de temps hebdomadaire (minutes) — les séances sont réduites proportionnellement si dépassé. */
  weeklyTimeBudgetMin?: number | null;
}

// ─── Utilitaires dates ───────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / (24 * 3600 * 1000));
}

function toGeneratedSession(
  built: BuiltSession,
  dayOfWeek: number,
  scheduledDate: Date
): GeneratedSession {
  return { ...built, id: crypto.randomUUID(), dayOfWeek, scheduledDate };
}

// ─── Séquence des types de semaine (décharge toutes les 4 semaines + taper) ──

function buildWeekTypeSequence(
  totalWeeks: number,
  startDate: Date,
  raceDate?: Date | null
): WeekType[] {
  const types: WeekType[] = [];
  for (let i = 0; i < totalWeeks; i++) {
    const weekNumber = i + 1;
    types.push(weekNumber % 4 === 0 ? "DELOAD" : "LOAD");
  }

  if (raceDate) {
    const raceWeekIndex = Math.floor(daysBetween(startDate, raceDate) / 7);
    if (raceWeekIndex >= 0 && raceWeekIndex < totalWeeks) {
      types[raceWeekIndex] = "TAPER";
      if (raceWeekIndex - 1 >= 0) types[raceWeekIndex - 1] = "TAPER";
    }
  }

  return types;
}

// ─── Séquence des blocs de musculation ───────────────────────────────────────

function buildPhaseSequence(totalWeeks: number): StrengthPhase[] {
  const hyperWeeks = Math.max(1, Math.round(totalWeeks * 0.4));
  const strengthWeeks = Math.max(1, Math.round(totalWeeks * 0.35));
  const peakWeeks = Math.max(1, totalWeeks - hyperWeeks - strengthWeeks);

  const seq: StrengthPhase[] = [
    ...Array(hyperWeeks).fill("HYPERTROPHY" as const),
    ...Array(strengthWeeks).fill("STRENGTH" as const),
    ...Array(peakWeeks).fill("PEAKING" as const),
  ];

  while (seq.length > totalWeeks) seq.pop();
  while (seq.length < totalWeeks) seq.push("PEAKING");

  return seq;
}

// ─── Progression du volume hebdomadaire (course) ─────────────────────────────

const LOAD_MULTIPLIERS = [1.0, 1.08, 1.15];

function computeVolumeProgression(
  totalWeeks: number,
  weekTypes: WeekType[],
  baseVolume: number
): number[] {
  const volumes: number[] = [];
  let cycleBase = baseVolume;
  let weekInCycle = 0;

  for (let i = 0; i < totalWeeks; i++) {
    const weekType = weekTypes[i];

    if (weekType === "TAPER") {
      const isRaceWeek = weekTypes[i + 1] !== "TAPER";
      volumes.push(cycleBase * (isRaceWeek ? 0.35 : 0.55));
      continue;
    }

    if (weekType === "DELOAD") {
      volumes.push(cycleBase * 0.6);
      cycleBase *= 1.03; // légère progression du niveau de base après chaque cycle
      weekInCycle = 0;
      continue;
    }

    const mult = LOAD_MULTIPLIERS[Math.min(weekInCycle, LOAD_MULTIPLIERS.length - 1)];
    volumes.push(cycleBase * mult);
    weekInCycle++;
  }

  return volumes.map((v) => Math.round(v * 10) / 10);
}

// ─── Course à pied : répartition hebdomadaire (80/20) ────────────────────────

function inferRunFrequency(level: ExperienceLevel | null): number {
  switch (level) {
    case "BEGINNER":
      return 3;
    case "INTERMEDIATE":
      return 4;
    case "ADVANCED":
      return 5;
    default:
      return 3;
  }
}

// 0 = lundi ... 6 = dimanche. Le dernier jour est toujours la sortie longue.
const RUN_DAYS: Record<number, number[]> = {
  3: [1, 3, 6],
  4: [1, 2, 4, 6],
  5: [0, 1, 3, 4, 6],
  6: [0, 1, 2, 3, 4, 6],
};

function computeRunShares(n: number, weekType: WeekType): number[] {
  const hasQuality = weekType !== "DELOAD" && weekType !== "TAPER" && n >= 3;
  const longShare = 0.38;
  const qualityShare = hasQuality ? 0.16 : 0;
  const otherCount = n - 1 - (hasQuality ? 1 : 0);
  const remaining = 1 - longShare - qualityShare;
  const otherShare = otherCount > 0 ? remaining / otherCount : 0;

  const shares: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === n - 1) shares.push(longShare);
    else if (i === 0 && hasQuality) shares.push(qualityShare);
    else shares.push(otherShare);
  }
  return shares;
}

function estimateRunDuration(distanceKm: number, zones: AthleteZones): number {
  const easyZone = zones.pace?.find((p) => p.key === "EASY");
  const midPace = easyZone
    ? (easyZone.minPaceSecPerKm + easyZone.maxPaceSecPerKm) / 2
    : 330; // repli : 5:30/km
  return Math.max(15, Math.round((distanceKm * midPace) / 60));
}

function buildRunningWeekSessions(input: {
  weekNumber: number;
  weekType: WeekType;
  zones: AthleteZones;
  weekStart: Date;
  runFrequency: number;
  targetVolume: number;
}): GeneratedSession[] {
  const { weekNumber, weekType, zones, weekStart, targetVolume } = input;
  const freq = Math.min(Math.max(input.runFrequency, 3), 6);
  const days = RUN_DAYS[freq] ?? RUN_DAYS[3];
  const shares = computeRunShares(days.length, weekType);
  const hasQuality = weekType !== "DELOAD" && weekType !== "TAPER";

  return days.map((dayOfWeek, idx) => {
    const scheduledDate = addDays(weekStart, dayOfWeek);
    const distanceKm = Math.round(targetVolume * shares[idx] * 10) / 10;
    const durationMinutes = estimateRunDuration(distanceKm, zones);
    const params = { zones, weekType, durationMinutes, distanceKm };

    const isLast = idx === days.length - 1;
    const isFirst = idx === 0;
    const isRecoverySlot = idx === days.length - 2 && days.length >= 5;

    let built: BuiltSession;
    if (isLast) {
      built = buildLongRun(params);
    } else if (isFirst && hasQuality) {
      built = weekNumber % 2 === 0 ? buildTempoRun(params) : buildIntervals(params);
    } else if (isRecoverySlot) {
      built = buildRecoveryRun(params);
    } else {
      built = buildEasyRun(params);
    }

    return toGeneratedSession(built, dayOfWeek, scheduledDate);
  });
}

function applyRaceDay(
  sessions: GeneratedSession[],
  weekStart: Date,
  raceDate: Date,
  zones: AthleteZones,
  targetVolume: number
): void {
  const dayOfWeek = daysBetween(weekStart, raceDate);
  if (dayOfWeek < 0 || dayOfWeek > 6) return;

  const built = buildRaceSession({
    zones,
    weekType: "TAPER",
    durationMinutes: estimateRunDuration(targetVolume, zones),
    distanceKm: targetVolume,
  });
  const generated = toGeneratedSession(built, dayOfWeek, raceDate);

  const existingIdx = sessions.findIndex((s) => s.dayOfWeek === dayOfWeek);
  if (existingIdx >= 0) sessions[existingIdx] = generated;
  else sessions.push(generated);
}

// ─── Musculation : rotation des focus + ondulation quotidienne ──────────────

const FOCUS_ROTATIONS: Record<number, StrengthFocus[]> = {
  1: ["FULL_BODY"],
  2: ["UPPER_BODY", "LOWER_BODY"],
  3: ["FULL_BODY", "FULL_BODY", "FULL_BODY"],
  4: ["UPPER_BODY", "LOWER_BODY", "UPPER_BODY", "LOWER_BODY"],
  5: ["PUSH", "PULL", "LEGS", "UPPER_BODY", "LOWER_BODY"],
  6: ["PUSH", "PULL", "LEGS", "PUSH", "PULL", "LEGS"],
};

const VARIANT_ROTATION: StrengthDayVariant[] = ["HEAVY", "MODERATE", "LIGHT"];

// 0 = lundi ... 6 = dimanche. Le dimanche (6) reste libre pour la sortie longue.
const STRENGTH_DAYS: Record<number, number[]> = {
  1: [2],
  2: [1, 4],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
};

function buildStrengthWeekSessions(input: {
  weekType: WeekType;
  phase: StrengthPhase;
  weekStart: Date;
  frequency: number;
  oneRMs: OneRMs;
  experienceLevel: ExperienceLevel | null;
  vacationMode?: boolean;
}): GeneratedSession[] {
  const freq = Math.min(Math.max(input.frequency, 1), 6);
  const days = STRENGTH_DAYS[freq] ?? STRENGTH_DAYS[3];
  const focusRotation = FOCUS_ROTATIONS[freq] ?? FOCUS_ROTATIONS[3];

  return days.map((dayOfWeek, idx) => {
    const scheduledDate = addDays(input.weekStart, dayOfWeek);
    const dayVariant = VARIANT_ROTATION[idx % VARIANT_ROTATION.length];
    const built = input.vacationMode
      ? buildHomeBodyweightStrength({ weekType: input.weekType, dayVariant })
      : buildStrengthSession({
          phase: input.phase,
          focus: focusRotation[idx % focusRotation.length],
          oneRMs: input.oneRMs,
          weekType: input.weekType,
          experienceLevel: input.experienceLevel,
          dayVariant,
        });
    return toGeneratedSession(built, dayOfWeek, scheduledDate);
  });
}

// ─── Disponibilités (Phase 1) : remap des jours + budget de temps ───────────
//
// Une séance est jugée "exigeante" (grosse séance à bien espacer) si son
// intensité prévue est élevée (RPE ≥ 7 — seuil/intervalles/tests/course) ou si
// sa nature la rend coûteuse en fatigue/récupération même à intensité modérée
// (sortie longue, course, natation en eau libre, test de forme) ou si sa durée
// dépasse 75 min.
const HIGH_DEMAND_SESSION_TYPES = new Set<SessionType>([
  "LONG_RUN",
  "RACE",
  "FITNESS_TEST",
  "OPEN_WATER",
  "BRICK",
]);

function isDemandingSession(session: GeneratedSession): boolean {
  if (HIGH_DEMAND_SESSION_TYPES.has(session.sessionType)) return true;
  if ((session.targetRPE ?? 0) >= 7) return true;
  if ((session.duration ?? 0) >= 75) return true;
  return false;
}

// Remappe les jours réellement utilisés vers les jours choisis par l'athlète.
// Quand il y a moins de jours dispo que de jours utilisés, plusieurs jours
// d'origine doivent fusionner sur le même jour dispo : bin-packing glouton
// par groupe (poids = nb de séances du groupe), les groupes exigeants et les
// plus lourds d'abord, chacun placé sur le bucket dispo le moins chargé qui
// respecte la capacité (jamais plus de 2 séances/jour) et n'a pas déjà de
// séance exigeante — même style de scorer que lib/training/dayPlanner.ts::
// pickBestDay, qui applique la même règle sur l'horizon proche. Un
// rebalancement répare ensuite les résidus laissés par l'ordre glouton
// (groupe déplacé vers un bucket moins chargé si possible). En dernier
// recours (plus de séances que de place), on prend le moins pire plutôt que
// de perdre une séance.
//
// Seul un vrai enchaînement brick (vélo+course, BuiltSession.isBrickLeg)
// reste groupé de force sur le même jour — deux séances qui partagent
// simplement leur jour d'origine par artefact du template (ex. muscu+course
// le même jour dans un plan à 7 jours dispo) sont traitées comme des unités
// indépendantes, ce qui donne beaucoup plus de marge au bin-packing quand la
// fusion stricte ne rentrerait pas dans la capacité disponible.
const MAX_SESSIONS_PER_DAY = 2;

interface RemapGroup {
  sessions: GeneratedSession[];
  weight: number;
  demanding: boolean;
  bucket: number;
}

function remapToAvailableDays(sessions: GeneratedSession[], weekStart: Date, sorted: number[]): void {
  const usedDays = Array.from(new Set(sessions.map((s) => s.dayOfWeek))).sort((a, b) => a - b);
  if (usedDays.length === 0 || sorted.length === 0) return;

  const groups: RemapGroup[] = [];
  for (const day of usedDays) {
    const daySessions = sessions.filter((s) => s.dayOfWeek === day);
    if (daySessions.length > 1 && !daySessions.some((s) => s.isBrickLeg)) {
      for (const s of daySessions) {
        groups.push({ sessions: [s], weight: 1, demanding: isDemandingSession(s), bucket: sorted[0] });
      }
    } else {
      groups.push({
        sessions: daySessions,
        weight: daySessions.length,
        demanding: daySessions.some((s) => isDemandingSession(s)),
        bucket: sorted[0],
      });
    }
  }

  // Groupes exigeants d'abord (et les plus lourds), pour qu'ils aient le
  // premier choix des buckets les moins chargés.
  groups.sort((a, b) => Number(b.demanding) - Number(a.demanding) || b.weight - a.weight);

  const bucketLoad = new Map<number, number>(sorted.map((b) => [b, 0]));
  const bucketHasDemanding = new Map<number, boolean>(sorted.map((b) => [b, false]));

  for (const group of groups) {
    let bestBucket = sorted[0];
    let bestScore = -Infinity;

    for (const bucket of sorted) {
      const load = bucketLoad.get(bucket)!;
      const hasDemanding = bucketHasDemanding.get(bucket)!;

      let score = 0;
      if (load + group.weight <= MAX_SESSIONS_PER_DAY) score += 100;
      else score -= 1000;
      if (group.demanding && hasDemanding) score -= 1000;
      score -= load;

      if (score > bestScore) {
        bestScore = score;
        bestBucket = bucket;
      }
    }

    group.bucket = bestBucket;
    bucketLoad.set(bestBucket, bucketLoad.get(bestBucket)! + group.weight);
    if (group.demanding) bucketHasDemanding.set(bestBucket, true);
  }

  // Rebalancement : l'ordre glouton peut laisser un bucket en surcapacité
  // alors qu'un autre a de la place (ex. plusieurs groupes légers placés tour
  // à tour sur le même bucket avant que le suivant ne le voie plein) — on
  // déplace un groupe non exigeant du bucket le plus chargé vers le moins
  // chargé qui a de la place, tant que c'est possible.
  let movedSomething = true;
  while (movedSomething) {
    movedSomething = false;
    const overloaded = sorted.filter((b) => bucketLoad.get(b)! > MAX_SESSIONS_PER_DAY);
    for (const bucket of overloaded) {
      const groupsHere = groups
        .filter((g) => g.bucket === bucket && !g.demanding)
        .sort((a, b) => a.weight - b.weight);
      if (groupsHere.length === 0) continue;
      const group = groupsHere[0];

      let target: number | null = null;
      let targetLoad = Infinity;
      for (const cand of sorted) {
        if (cand === bucket) continue;
        const load = bucketLoad.get(cand)!;
        if (load + group.weight > MAX_SESSIONS_PER_DAY) continue;
        if (load < targetLoad) {
          targetLoad = load;
          target = cand;
        }
      }
      if (target !== null) {
        bucketLoad.set(bucket, bucketLoad.get(bucket)! - group.weight);
        bucketLoad.set(target, bucketLoad.get(target)! + group.weight);
        group.bucket = target;
        movedSomething = true;
      }
    }
  }

  for (const group of groups) {
    if (group.bucket === group.sessions[0].dayOfWeek) continue;
    for (const s of group.sessions) {
      s.dayOfWeek = group.bucket;
      s.scheduledDate = addDays(weekStart, group.bucket);
    }
  }
}

// ─── Montée en charge du nombre de séances/semaine ───────────────────────────
//
// Reprise prudente : peu importe le nombre de séances que le template du
// goalType/macroPhase voudrait poser cette semaine-là, on démarre à 3
// séances/semaine et on augmente d'une séance tous les
// SESSION_RAMP_STEP_WEEKS, jusqu'à un plafond. Indépendant d'availableDays
// (lib/training/materialize.ts appelle toujours generateTrainingPlan avec les
// 7 jours ouverts — la vraie contrainte de jours dispo/travail vit dans
// WorkSchedule + lib/training/dayPlanner.ts) : ce plafond porte uniquement sur
// le VOLUME de séances produit, pas sur leur placement.
const SESSION_RAMP_START = 3;
const SESSION_RAMP_STEP_WEEKS = 3;
const SESSION_RAMP_MAX = 6;

function computeWeeklySessionTarget(weekNumber: number): number {
  return Math.min(
    SESSION_RAMP_MAX,
    SESSION_RAMP_START + Math.floor((weekNumber - 1) / SESSION_RAMP_STEP_WEEKS)
  );
}

// Rang indicatif d'une séance dans l'arbitrage de capWeeklySessions — les
// tests de forme et la séance clé de la semaine (sortie longue, course,
// brick) doivent survivre au cap avant les séances de fond/technique.
const SESSION_PRIORITY: Partial<Record<SessionType, number>> = {
  RACE: 100,
  FITNESS_TEST: 95,
  BRICK: 90,
  LONG_RUN: 85,
  INTERVALS: 75,
  TEMPO: 75,
  INTERVAL_RIDE: 75,
  TEMPO_RIDE: 75,
  SWIM_RACE_PACE: 70,
  OPEN_WATER: 70,
  ENDURANCE_RIDE: 60,
  SWIM_ENDURANCE: 60,
  FULL_BODY: 55,
  UPPER_BODY: 55,
  LOWER_BODY: 55,
  PUSH: 55,
  PULL: 55,
  LEGS: 55,
  HILLS: 50,
  FARTLEK: 50,
  HOME_CIRCUIT: 45,
  EASY_RUN: 40,
  RECOVERY_RUN: 35,
  SWIM_TECHNIQUE: 35,
  CUSTOM: 30,
};

function sessionPriority(session: GeneratedSession): number {
  return SESSION_PRIORITY[session.sessionType] ?? 30;
}

/**
 * Réduit `sessions` à `target` séances en mutant le tableau en place. Garde
 * d'abord la meilleure séance de chaque sport représenté (diversité — un cap
 * serré à 3 ne doit pas ne garder que de la muscu), puis complète avec les
 * séances restantes les plus prioritaires. Un enchaînement brick (deux
 * séances, `isBrickLeg`) est traité comme un seul bloc indivisible.
 */
function capWeeklySessions(sessions: GeneratedSession[], target: number): void {
  if (target <= 0 || sessions.length <= target) return;

  const groups = new Map<string, GeneratedSession[]>();
  for (const s of sessions) {
    const key = s.isBrickLeg ? `brick-${s.dayOfWeek}` : s.id;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }
  const groupList = Array.from(groups.values());
  const groupPriority = (g: GeneratedSession[]) => Math.max(...g.map(sessionPriority));

  const bestBySport = new Map<Sport, GeneratedSession[]>();
  for (const group of groupList) {
    const sport = group[0].sport;
    const current = bestBySport.get(sport);
    if (!current || groupPriority(group) > groupPriority(current)) bestBySport.set(sport, group);
  }

  const picked = new Set<GeneratedSession[]>();
  const kept: GeneratedSession[] = [];
  const diverse = Array.from(bestBySport.values()).sort(
    (a, b) => groupPriority(b) - groupPriority(a)
  );
  for (const group of diverse) {
    if (kept.length >= target) break;
    picked.add(group);
    kept.push(...group);
  }

  const rest = groupList
    .filter((g) => !picked.has(g))
    .sort((a, b) => groupPriority(b) - groupPriority(a));
  for (const group of rest) {
    if (kept.length >= target) break;
    kept.push(...group);
  }

  sessions.length = 0;
  sessions.push(...kept);
}

function applyAvailability(
  sessions: GeneratedSession[],
  weekStart: Date,
  availableDays: number[] | undefined,
  weeklyTimeBudgetMin: number | null | undefined
): void {
  const sorted = availableDays ? Array.from(new Set(availableDays)).sort((a, b) => a - b) : [];

  if (sorted.length > 0 && sorted.length < 7) {
    remapToAvailableDays(sessions, weekStart, sorted);
  }

  if (weeklyTimeBudgetMin && weeklyTimeBudgetMin > 0) {
    const totalMinutes = sessions.reduce((sum, s) => sum + (s.duration ?? 0), 0);
    if (totalMinutes > weeklyTimeBudgetMin) {
      const factor = weeklyTimeBudgetMin / totalMinutes;
      for (const session of sessions) {
        if (session.sport === "REST") continue;
        if (session.duration !== null) {
          session.duration = Math.max(10, Math.round(session.duration * factor));
        }
        if (session.targetDistance !== null) {
          session.targetDistance = Math.round(session.targetDistance * factor * 10) / 10;
        }
      }
    }
  }
}

// ─── Jours libres : mobilité / repos ─────────────────────────────────────────

function fillRemainingDays(sessions: GeneratedSession[], weekStart: Date): void {
  const occupied = new Set(sessions.map((s) => s.dayOfWeek));
  const freeDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !occupied.has(d));

  freeDays.forEach((dayOfWeek, idx) => {
    const scheduledDate = addDays(weekStart, dayOfWeek);
    const built = idx === 0 ? buildMobilitySession() : buildRestDay();
    sessions.push(toGeneratedSession(built, dayOfWeek, scheduledDate));
  });
}

// ─── Triathlon : macro-phases, protocole de tests, semaine combinée ─────────
//
// 4 grandes phases (proportions calquées sur un mésocycle de référence à 26
// semaines) : Reconditionnement → Développement → Intensification → Peaking.
// Chaque semaine combine muscu + course + vélo + natation, avec des jours fixes
// (lundi muscu, mardi natation, mercredi course, vendredi vélo) pour pouvoir
// injecter les tests de manière prévisible et respecter la règle « jamais de
// séance jambes lourdes le jour d'un travail de VMA ».

type RunSlotKind = "EASY" | "LONG" | "VMA" | "TEMPO" | "LUC_LEGER_SIM";
type SwimSlotKind = "TECHNIQUE" | "ENDURANCE" | "RACE_PACE" | "OPEN_WATER";
type BikeSlotKind = "ENDURANCE" | "TEMPO" | "INTERVAL";
type TestKind = "LUC_LEGER" | "ONE_RM" | "SWIM_400" | "FTP" | "TRI_SIM";

const TEST_LABELS: Record<TestKind, string> = {
  LUC_LEGER: "Test Luc Léger (VMA)",
  ONE_RM: "Test 1RM (squat / bench / deadlift)",
  SWIM_400: "Test natation 400m chronométré",
  FTP: "Test FTP vélo (20 min)",
  TRI_SIM: "Simulation triathlon complète",
};

const REFERENCE_WEEKS = 26;

function buildMacroPhaseSequence(totalWeeks: number): MacroPhase[] {
  const reconWeeks = Math.max(1, Math.round((totalWeeks * 6) / REFERENCE_WEEKS));
  const devWeeks = Math.max(1, Math.round((totalWeeks * 8) / REFERENCE_WEEKS));
  const intensWeeks = Math.max(1, Math.round((totalWeeks * 6) / REFERENCE_WEEKS));
  const peakWeeks = Math.max(1, totalWeeks - reconWeeks - devWeeks - intensWeeks);

  const seq: MacroPhase[] = [
    ...Array(reconWeeks).fill("RECONDITIONING" as const),
    ...Array(devWeeks).fill("DEVELOPMENT" as const),
    ...Array(intensWeeks).fill("INTENSIFICATION" as const),
    ...Array(peakWeeks).fill("PEAKING" as const),
  ];
  while (seq.length > totalWeeks) seq.pop();
  while (seq.length < totalWeeks) seq.push("PEAKING");
  return seq;
}

/** Convertit une semaine de référence (sur 26) en index 0-based pour `totalWeeks`. */
function scaledWeekIndex(totalWeeks: number, referenceWeek: number): number {
  if (totalWeeks <= 1) return 0;
  const idx = Math.round(((referenceWeek - 1) / (REFERENCE_WEEKS - 1)) * (totalWeeks - 1));
  return Math.min(totalWeeks - 1, Math.max(0, idx));
}

function buildTestSchedule(totalWeeks: number): Map<number, TestKind[]> {
  const schedule = new Map<number, TestKind[]>();
  const add = (referenceWeek: number, kind: TestKind) => {
    const idx = scaledWeekIndex(totalWeeks, referenceWeek);
    const list = schedule.get(idx) ?? [];
    if (!list.includes(kind)) list.push(kind);
    schedule.set(idx, list);
  };
  add(7, "LUC_LEGER"); // baseline — jamais avant S6 (Phase 1 = zéro test)
  add(7, "ONE_RM");
  add(8, "SWIM_400");
  add(14, "LUC_LEGER"); // intermédiaire
  add(14, "FTP");
  add(20, "LUC_LEGER"); // avancé
  add(22, "TRI_SIM");
  add(24, "LUC_LEGER"); // final
  return schedule;
}

const STRENGTH_PHASE_BY_MACRO: Record<MacroPhase, StrengthPhase> = {
  RECONDITIONING: "HYPERTROPHY",
  DEVELOPMENT: "HYPERTROPHY",
  INTENSIFICATION: "STRENGTH",
  PEAKING: "PEAKING",
};

function scaleForWeekType(minutes: number, weekType: WeekType): number {
  if (weekType === "TAPER") return Math.round(minutes * 0.5);
  if (weekType === "DELOAD") return Math.round(minutes * 0.65);
  return minutes;
}

function estimateRunDistance(durationMinutes: number, zones: AthleteZones): number {
  const easyZone = zones.pace?.find((p) => p.key === "EASY");
  const midPace = easyZone ? (easyZone.minPaceSecPerKm + easyZone.maxPaceSecPerKm) / 2 : 330;
  return Math.round(((durationMinutes * 60) / midPace) * 10) / 10;
}

function runDuration(phase: MacroPhase, kind: RunSlotKind): number {
  switch (phase) {
    case "RECONDITIONING":
      return kind === "LONG" ? 30 : 22;
    case "DEVELOPMENT":
      return kind === "LONG" ? 45 : kind === "EASY" ? 30 : 35;
    case "INTENSIFICATION":
      return kind === "LONG" ? 55 : kind === "EASY" ? 30 : 40;
    case "PEAKING":
      return kind === "LONG" ? 40 : kind === "EASY" ? 25 : 30;
  }
}

function swimDuration(phase: MacroPhase): number {
  switch (phase) {
    case "RECONDITIONING":
      return 40;
    case "DEVELOPMENT":
      return 50;
    case "INTENSIFICATION":
      return 50;
    case "PEAKING":
      return 45;
  }
}

function swimDistance(phase: MacroPhase): number {
  switch (phase) {
    case "RECONDITIONING":
      return 1200;
    case "DEVELOPMENT":
      return 2200;
    case "INTENSIFICATION":
      return 2700;
    case "PEAKING":
      return 2200;
  }
}

function bikeDuration(phase: MacroPhase, kind: BikeSlotKind): number {
  switch (phase) {
    case "RECONDITIONING":
      return 40;
    case "DEVELOPMENT":
      return kind === "ENDURANCE" ? 50 : 45;
    case "INTENSIFICATION":
      return kind === "ENDURANCE" ? 55 : 60;
    case "PEAKING":
      return kind === "ENDURANCE" ? 45 : 50;
  }
}

interface TriathlonWeekInput {
  weekNumber: number;
  weekType: WeekType;
  macroPhase: MacroPhase;
  zones: AthleteZones;
  weekStart: Date;
  oneRMs: OneRMs;
  experienceLevel: ExperienceLevel | null;
  vacationMode: boolean;
  tests: TestKind[];
}

function buildTriathlonWeekSessions(input: TriathlonWeekInput): GeneratedSession[] {
  const {
    weekNumber,
    weekType,
    macroPhase,
    zones,
    weekStart,
    oneRMs,
    experienceLevel,
    vacationMode,
    tests,
  } = input;

  const sessions: GeneratedSession[] = [];
  const push = (built: BuiltSession, dayOfWeek: number) =>
    sessions.push(toGeneratedSession(built, dayOfWeek, addDays(weekStart, dayOfWeek)));
  const scale = (m: number) => scaleForWeekType(m, weekType);
  const hasTest = (k: TestKind) => tests.includes(k);
  const isDeloadish = weekType === "DELOAD" || weekType === "TAPER";
  const strengthPhase = STRENGTH_PHASE_BY_MACRO[macroPhase];

  if (vacationMode) {
    // Pas de salle/piscine/home trainer — que du poids du corps et du cardio libre.
    push(buildHomeBodyweightStrength({ weekType, dayVariant: "HEAVY" }), 0);
    push(buildHomeEasyCardio(scale(35)), 1);
    push(isDeloadish ? buildHomeEasyCardio(scale(25)) : buildHomeCardioHIIT(), 2);
    push(buildHomeBodyweightStrength({ weekType, dayVariant: "MODERATE" }), 3);
    push(buildHomeBodyweightStrength({ weekType, dayVariant: "LIGHT" }), 5);
    push(buildHomeEasyCardio(scale(40)), 5);
    return sessions;
  }

  // Reconditionnement : poids du corps à la maison le premier mois (S1-S4),
  // passage en salle à partir de S5 (voir programme 6 mois, Phase 1).
  const isEarlyRecon = macroPhase === "RECONDITIONING" && weekNumber <= 4;

  let strengthDayCount = 0;
  const strengthDay = (
    focus: StrengthFocus,
    dayOfWeek: number,
    opts: { isTest?: boolean } = {}
  ) => {
    const dayVariant = VARIANT_ROTATION[strengthDayCount % VARIANT_ROTATION.length];
    const built =
      opts.isTest && hasTest("ONE_RM")
        ? buildOneRMTest(oneRMs)
        : isEarlyRecon
        ? buildHomeBodyweightStrength({ weekType, dayVariant })
        : buildStrengthSession({
            phase: strengthPhase,
            focus,
            oneRMs,
            weekType,
            experienceLevel,
            dayVariant,
          });
    strengthDayCount++;
    push(built, dayOfWeek);
  };

  const swimDay = (
    kind: SwimSlotKind,
    dayOfWeek: number,
    opts: { isTest?: boolean } = {}
  ) => {
    if (opts.isTest && hasTest("SWIM_400")) {
      push(buildSwimTimeTrial(), dayOfWeek);
      return;
    }
    const durationMinutes = scale(swimDuration(macroPhase));
    const distanceM = swimDistance(macroPhase);
    const params = { weekType, durationMinutes, distanceM };
    const built =
      kind === "TECHNIQUE"
        ? buildSwimTechnique(params)
        : kind === "ENDURANCE"
        ? buildSwimEndurance(params)
        : kind === "RACE_PACE"
        ? buildSwimRacePace(params)
        : buildOpenWaterSwim(durationMinutes);
    push(built, dayOfWeek);
  };

  const runDay = (
    kind: RunSlotKind,
    dayOfWeek: number,
    opts: { isTest?: boolean; transform?: (b: BuiltSession) => BuiltSession } = {}
  ) => {
    if (opts.isTest && hasTest("LUC_LEGER")) {
      push(buildLucLegerTest(), dayOfWeek);
      return;
    }
    const durationMinutes = scale(runDuration(macroPhase, kind));
    const distanceKm = estimateRunDistance(durationMinutes, zones);
    const params = { zones, weekType, durationMinutes, distanceKm };
    let built =
      kind === "EASY"
        ? buildEasyRun(params)
        : kind === "LONG"
        ? buildLongRun(params)
        : kind === "VMA"
        ? isDeloadish
          ? buildEasyRun(params)
          : buildIntervals(params)
        : kind === "TEMPO"
        ? isDeloadish
          ? buildEasyRun(params)
          : buildTempoRun(params)
        : isDeloadish
        ? buildEasyRun(params)
        : buildLucLegerSimulation(params);
    if (opts.transform) built = opts.transform(built);
    push(built, dayOfWeek);
  };

  const bikeDay = (
    kind: BikeSlotKind,
    dayOfWeek: number,
    opts: { isTest?: boolean; transform?: (b: BuiltSession) => BuiltSession } = {}
  ) => {
    if (opts.isTest && hasTest("FTP")) {
      push(buildFtpTest(), dayOfWeek);
      return;
    }
    const durationMinutes = scale(bikeDuration(macroPhase, kind));
    const params = { zones, weekType, durationMinutes };
    let built =
      kind === "ENDURANCE"
        ? buildEnduranceRide(params)
        : kind === "TEMPO"
        ? isDeloadish
          ? buildEnduranceRide(params)
          : buildTempoRide(params)
        : isDeloadish
        ? buildEnduranceRide(params)
        : buildIntervalRide(params);
    if (opts.transform) built = opts.transform(built);
    push(built, dayOfWeek);
  };

  if (macroPhase === "RECONDITIONING") {
    strengthDay("FULL_BODY", 0);
    swimDay("TECHNIQUE", 1, { isTest: true });
    runDay("EASY", 2, { isTest: true });
    strengthDay("FULL_BODY", 3, { isTest: true });
    bikeDay("ENDURANCE", 4, { isTest: true });
    strengthDay("FULL_BODY", 5);
    runDay("EASY", 5);
    swimDay("TECHNIQUE", 6);
  } else if (macroPhase === "DEVELOPMENT") {
    strengthDay("UPPER_BODY", 0);
    swimDay("ENDURANCE", 1, { isTest: true });
    runDay(weekNumber % 2 === 0 ? "TEMPO" : "VMA", 2, { isTest: true });
    strengthDay("LOWER_BODY", 3, { isTest: true });
    swimDay("TECHNIQUE", 3);
    bikeDay("ENDURANCE", 4, { isTest: true });
    strengthDay("UPPER_BODY", 5);
    strengthDay("LOWER_BODY", 6);
    runDay("LONG", 6);
  } else if (macroPhase === "INTENSIFICATION") {
    const brickWeek = (weekNumber % 2 === 0 || hasTest("TRI_SIM")) && !isDeloadish;

    strengthDay("UPPER_BODY", 0, { isTest: true });
    swimDay(hasTest("TRI_SIM") ? "OPEN_WATER" : "RACE_PACE", 1, { isTest: true });
    runDay(weekNumber % 2 === 0 ? "LUC_LEGER_SIM" : "VMA", 2, { isTest: true });
    strengthDay("LOWER_BODY", 3);
    if (brickWeek) {
      bikeDay("ENDURANCE", 5, {
        transform: (b) =>
          markAsBrickLeg({ ...b, duration: Math.round((b.duration ?? 40) * 0.7) }, "vélo"),
      });
      runDay("TEMPO", 5, {
        transform: (b) =>
          markAsBrickLeg({ ...b, duration: Math.round((b.duration ?? 30) * 0.5) }, "course"),
      });
    } else {
      bikeDay("TEMPO", 4, { isTest: true });
    }
    runDay("LONG", 6);
    swimDay("TECHNIQUE", 6);
  } else {
    // PEAKING
    const brickWeek = !isDeloadish;

    strengthDay("FULL_BODY", 0, { isTest: true });
    swimDay("RACE_PACE", 1, { isTest: true });
    runDay(isDeloadish ? "EASY" : "VMA", 2, { isTest: true });
    if (weekType !== "TAPER") strengthDay("FULL_BODY", 3);
    if (brickWeek) {
      bikeDay("TEMPO", 5, {
        transform: (b) =>
          markAsBrickLeg({ ...b, duration: Math.round((b.duration ?? 40) * 0.6) }, "vélo"),
      });
      runDay("TEMPO", 5, {
        transform: (b) =>
          markAsBrickLeg({ ...b, duration: Math.round((b.duration ?? 30) * 0.5) }, "course"),
      });
    } else {
      bikeDay("ENDURANCE", 4);
    }
    runDay("EASY", 6);
    swimDay("TECHNIQUE", 6);
  }

  return sessions;
}

function applyTriathlonRaceDay(
  sessions: GeneratedSession[],
  weekStart: Date,
  raceDate: Date
): void {
  const dayOfWeek = daysBetween(weekStart, raceDate);
  if (dayOfWeek < 0 || dayOfWeek > 6) return;

  const generated = toGeneratedSession(buildTriathlonRaceDay(), dayOfWeek, raceDate);
  const filtered = sessions.filter((s) => s.dayOfWeek !== dayOfWeek);
  filtered.push(generated);
  sessions.length = 0;
  sessions.push(...filtered);
}

function generateTriathlonWeeks(input: PeriodizationInput, zones: AthleteZones): GeneratedWeek[] {
  const { profile } = input;
  const vacationMode = input.vacationMode ?? false;

  const weekTypes = buildWeekTypeSequence(input.totalWeeks, input.startDate, input.raceDate);
  const macroPhases = buildMacroPhaseSequence(input.totalWeeks);
  const testSchedule = buildTestSchedule(input.totalWeeks);
  const weeklyVolumes = computeVolumeProgression(
    input.totalWeeks,
    weekTypes,
    profile.weeklyVolume ?? 20
  );

  const oneRMs: OneRMs = {
    squat: profile.prSquat,
    bench: profile.prBench,
    deadlift: profile.prDeadlift,
    ohp: profile.prOHP,
  };

  const weeks: GeneratedWeek[] = [];

  for (let i = 0; i < input.totalWeeks; i++) {
    const weekNumber = i + 1;
    const weekType = weekTypes[i];
    const macroPhase = macroPhases[i];
    const weekStart = addDays(input.startDate, i * 7);
    const weekEnd = addDays(weekStart, 6);
    const tests = testSchedule.get(i) ?? [];

    const sessions = buildTriathlonWeekSessions({
      weekNumber,
      weekType,
      macroPhase,
      zones,
      weekStart,
      oneRMs,
      experienceLevel: profile.experienceLevel,
      vacationMode,
      tests,
    });

    // Phase 1 (Reconditionnement) : jamais plus de 4 séances/semaine, même si
    // la montée en charge globale (computeWeeklySessionTarget) autoriserait
    // plus — le corps a besoin de temps pour se réadapter après une coupure.
    const sessionTarget =
      macroPhase === "RECONDITIONING"
        ? Math.min(4, computeWeeklySessionTarget(weekNumber))
        : computeWeeklySessionTarget(weekNumber);
    capWeeklySessions(sessions, sessionTarget);
    applyAvailability(sessions, weekStart, input.availableDays, input.weeklyTimeBudgetMin);

    if (input.raceDate) {
      applyTriathlonRaceDay(sessions, weekStart, input.raceDate);
    }

    fillRemainingDays(sessions, weekStart);
    sessions.sort((a, b) => a.dayOfWeek - b.dayOfWeek);

    weeks.push({
      id: crypto.randomUUID(),
      weekNumber,
      weekType,
      phase: STRENGTH_PHASE_BY_MACRO[macroPhase],
      macroPhase,
      plannedTests: tests.map((t) => TEST_LABELS[t]),
      startDate: weekStart,
      endDate: weekEnd,
      targetVolume: Math.round(weeklyVolumes[i] * 10) / 10,
      sessions,
    });
  }

  return weeks;
}

// ─── Générateur principal ────────────────────────────────────────────────────

export function generateTrainingPlan(input: PeriodizationInput): GeneratedPlan {
  const { profile } = input;

  const zones = computeAthleteZones({
    restingHR: profile.restingHR,
    maxHR: profile.maxHR,
    vo2max: profile.vo2max,
    thresholdPace: profile.thresholdPace,
    ftp: profile.ftp,
  });

  if (input.goalType === "TRIATHLON") {
    const weeks = generateTriathlonWeeks(input, zones);
    return {
      name: input.planName,
      goalType: input.goalType,
      startDate: input.startDate,
      endDate: addDays(input.startDate, input.totalWeeks * 7 - 1),
      totalWeeks: input.totalWeeks,
      weeks,
    };
  }

  const includesRunning = input.goalType !== "STRENGTH";
  const includesStrength = input.goalType !== "RUNNING";

  const weekTypes = buildWeekTypeSequence(input.totalWeeks, input.startDate, input.raceDate);
  const phases = includesStrength ? buildPhaseSequence(input.totalWeeks) : null;

  const runFrequency = includesRunning ? inferRunFrequency(profile.experienceLevel) : 0;
  const strengthFrequency = includesStrength ? profile.weeklyFrequency ?? 3 : 0;

  const weeklyVolumes = includesRunning
    ? computeVolumeProgression(input.totalWeeks, weekTypes, profile.weeklyVolume ?? 30)
    : null;

  const oneRMs: OneRMs = {
    squat: profile.prSquat,
    bench: profile.prBench,
    deadlift: profile.prDeadlift,
    ohp: profile.prOHP,
  };

  const weeks: GeneratedWeek[] = [];
  let cursor = new Date(input.startDate);

  for (let i = 0; i < input.totalWeeks; i++) {
    const weekNumber = i + 1;
    const weekType = weekTypes[i];
    const phase = phases ? phases[i] : null;
    const weekStart = new Date(cursor);
    const weekEnd = addDays(weekStart, 6);
    const targetVolume = weeklyVolumes ? weeklyVolumes[i] : null;

    const sessions: GeneratedSession[] = [];

    if (runFrequency > 0 && targetVolume !== null) {
      sessions.push(
        ...buildRunningWeekSessions({
          weekNumber,
          weekType,
          zones,
          weekStart,
          runFrequency,
          targetVolume,
        })
      );
    }

    if (strengthFrequency > 0 && phase) {
      sessions.push(
        ...buildStrengthWeekSessions({
          weekType,
          phase,
          weekStart,
          frequency: strengthFrequency,
          oneRMs,
          experienceLevel: profile.experienceLevel,
          vacationMode: input.vacationMode ?? false,
        })
      );
    }

    capWeeklySessions(sessions, computeWeeklySessionTarget(weekNumber));
    applyAvailability(sessions, weekStart, input.availableDays, input.weeklyTimeBudgetMin);

    if (input.raceDate && targetVolume !== null) {
      applyRaceDay(sessions, weekStart, input.raceDate, zones, targetVolume);
    }

    fillRemainingDays(sessions, weekStart);
    sessions.sort((a, b) => a.dayOfWeek - b.dayOfWeek);

    weeks.push({
      id: crypto.randomUUID(),
      weekNumber,
      weekType,
      phase,
      macroPhase: null,
      plannedTests: [],
      startDate: weekStart,
      endDate: weekEnd,
      targetVolume: targetVolume !== null ? Math.round(targetVolume * 10) / 10 : null,
      sessions,
    });

    cursor = addDays(cursor, 7);
  }

  return {
    name: input.planName,
    goalType: input.goalType,
    startDate: input.startDate,
    endDate: addDays(cursor, -1),
    totalWeeks: input.totalWeeks,
    weeks,
  };
}
