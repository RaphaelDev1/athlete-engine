// Orchestration de la persistance du plan (Phase 2) + déclenchement de la
// revue hebdomadaire (Phase 3).
//
// Le moteur (lib/engine/periodization.ts) reste un générateur pur. Ce module
// synchronise sa sortie avec les tables TrainingPlan/Week/Session/Exercise :
// - Un seul TrainingPlan actif par utilisateur.
// - Invariant central : une TrainingWeek qui contient une séance dont le
//   statut n'est plus PLANNED (COMPLETED/PARTIAL/SKIPPED/RESCHEDULED) n'est
//   plus jamais réécrite — l'historique réel est immuable.
// - Une semaine encore 100% PLANNED est régénérée seulement si son contenu a
//   changé (comparaison par signature) pour ne pas faire tourner des id de
//   séance à chaque appel.
// - Avant de régénérer, vérifie si la semaine précédente est terminée et pas
//   encore "reviewée" (lib/engine/weekReview.ts) — c'est ce qui fait vivre la
//   boucle d'adaptation progressive tout au long de la préparation.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateTrainingPlan } from "@/lib/engine/periodization";
import { GeneratedSession } from "@/lib/engine/types";
import { reviewWeek } from "@/lib/engine/weekReview";
import { persistNotifications } from "@/lib/notifications/store";
import { getOrCreateSchedule, effectiveStartDate, resolveDayAvailability } from "./schedule";
import { toPeriodizationProfile } from "./periodizationProfile";
import { applyAdaptation, getOrCreateAdaptationState, parseHistory } from "./adaptationState";
import { computeWeeklyRunningVolumeKm } from "./volume";
import { applySmartDayAssignment, localDateKey } from "./dayPlanner";
import { computeCurrentReadiness, allowsDoubleSession } from "./readinessGate";

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86400000);
}

// ─── Revue de la semaine précédente (Phase 3) ────────────────────────────────

async function maybeReviewPastWeek(
  userId: string,
  schedule: { startDate: Date; shiftDays: number },
  state: { volumeMultiplier: number; intensityMultiplier: number; lastReviewedWeekEnd: Date | null; history: unknown }
): Promise<{ volumeMultiplier: number; intensityMultiplier: number } | null> {
  const anchor = effectiveStartDate(schedule);
  const today = startOfDay(new Date());
  const daysSinceAnchor = daysBetween(anchor, today);
  if (daysSinceAnchor < 7) return null; // la première semaine n'est pas encore terminée

  const lastEndedWeekIndex = Math.floor(daysSinceAnchor / 7) - 1;
  const weekStart = addDays(anchor, lastEndedWeekIndex * 7);
  const weekEnd = addDays(weekStart, 6);
  if (state.lastReviewedWeekEnd && state.lastReviewedWeekEnd.getTime() >= weekEnd.getTime()) {
    return null; // déjà reviewée
  }

  const [sessions, checkIns] = await Promise.all([
    prisma.trainingSession.findMany({
      where: { week: { plan: { userId } }, scheduledDate: { gte: weekStart, lte: weekEnd } },
      select: { sport: true, status: true, targetRPE: true, actualRPE: true },
    }),
    prisma.dailyCheckIn.findMany({
      where: { userId, date: { gte: weekStart, lte: weekEnd } },
      select: { energy: true, stress: true },
    }),
  ]);

  if (sessions.length === 0) return null; // rien de matérialisé pour cette semaine — on ne review pas dans le vide

  const result = reviewWeek(sessions, checkIns, state.volumeMultiplier, state.intensityMultiplier);

  const history = parseHistory(state.history);
  history.push({
    date: new Date().toISOString(),
    reason: result.reason,
    volumeMultiplier: result.volumeMultiplier,
    intensityMultiplier: result.intensityMultiplier,
  });

  await prisma.planAdaptationState.update({
    where: { userId },
    data: {
      volumeMultiplier: result.volumeMultiplier,
      intensityMultiplier: result.intensityMultiplier,
      lastReviewedWeekEnd: weekEnd,
      history: history.slice(-52) as unknown as Prisma.InputJsonValue,
    },
  });

  if (result.adjusted) {
    await persistNotifications(userId, [
      {
        type: "PLAN_ADJUSTED",
        severity: result.volumeMultiplier < state.volumeMultiplier ? "WARNING" : "SUCCESS",
        title: "Plan ajusté suite au bilan de la semaine",
        message: result.reason,
        relatedEntityId: `week-review-${weekEnd.toISOString().slice(0, 10)}`,
      },
    ]);
  }

  return { volumeMultiplier: result.volumeMultiplier, intensityMultiplier: result.intensityMultiplier };
}

// ─── Signature de séances (pour éviter de régénérer sans changement) ────────

function sessionSignature(s: {
  scheduledDate: Date;
  sport: string;
  sessionType: string;
  title: string;
  duration: number | null;
  targetDistance: number | null;
}): string {
  return [
    s.scheduledDate.toISOString().slice(0, 10),
    s.sport,
    s.sessionType,
    s.title,
    s.duration ?? "",
    s.targetDistance ?? "",
  ].join("|");
}

function weekSignature(sessions: { scheduledDate: Date; sport: string; sessionType: string; title: string; duration: number | null; targetDistance: number | null }[]): string {
  return sessions.map(sessionSignature).sort().join(";;");
}

async function createSessions(weekId: string, sessions: GeneratedSession[]): Promise<void> {
  for (const s of sessions) {
    const created = await prisma.trainingSession.create({
      data: {
        weekId,
        sport: s.sport,
        sessionType: s.sessionType,
        title: s.title,
        description: s.description,
        scheduledDate: s.scheduledDate,
        duration: s.duration,
        targetDistance: s.targetDistance,
        targetPace: s.targetPace,
        targetZone: s.targetZone,
        targetRPE: s.targetRPE,
        structure: (s.structure ?? []) as unknown as Prisma.InputJsonValue,
      },
    });

    if (s.exercises && s.exercises.length > 0) {
      await prisma.exercise.createMany({
        data: s.exercises.map((ex, idx) => ({
          sessionId: created.id,
          name: ex.name,
          orderIndex: idx,
          sets: ex.sets,
          reps: ex.reps,
          targetRPE: ex.targetRPE,
          restSeconds: ex.restSeconds,
          notes: ex.notes,
        })),
      });
    }
  }
}

// ─── Report des séances manquées ─────────────────────────────────────────────
//
// Une séance encore PLANNED dont la date est passée n'a pas été loggée (ni
// faite, ni ratée explicitement) — l'athlète l'a simplement manquée. Plutôt
// que de la laisser s'accumuler dans le passé, on la déplace sur le prochain
// jour d'entraînement disponible qui a encore de la place (même plafond
// 2/jour et même règle « jamais 2 fois le même sessionType le même jour » que
// lib/training/dayPlanner.ts, appliqués ici en glouton jour par jour puisqu'on
// traite des séances déjà persistées plutôt que le pool complet d'un régénérateur).
const MISSED_SESSION_SEARCH_HORIZON_DAYS = 60;

async function rescheduleMissedSessions(userId: string): Promise<void> {
  const plan = await prisma.trainingPlan.findFirst({ where: { userId, status: "ACTIVE" } });
  if (!plan) return;

  const today = startOfDay(new Date());
  const missed = await prisma.trainingSession.findMany({
    where: {
      week: { planId: plan.id },
      status: "PLANNED",
      sport: { not: "REST" },
      scheduledDate: { lt: today },
    },
    orderBy: { scheduledDate: "asc" },
  });
  if (missed.length === 0) return;

  const horizonEnd = addDays(today, MISSED_SESSION_SEARCH_HORIZON_DAYS);
  const readiness = await computeCurrentReadiness(userId);
  const [availability, futureSessions] = await Promise.all([
    resolveDayAvailability(userId, today, horizonEnd, { recoveryIsGood: allowsDoubleSession(readiness) }),
    prisma.trainingSession.findMany({
      where: {
        week: { planId: plan.id },
        status: "PLANNED",
        sport: { not: "REST" },
        scheduledDate: { gte: today },
      },
      select: { scheduledDate: true, sessionType: true },
    }),
  ]);

  const capByKey = new Map(availability.filter((a) => a.cap > 0).map((a) => [localDateKey(a.date), a.cap]));
  const availableDates = availability.filter((a) => a.cap > 0).map((a) => a.date);

  const occupancy = new Map<string, { count: number; types: Set<string> }>();
  for (const s of futureSessions) {
    const key = localDateKey(s.scheduledDate);
    const entry = occupancy.get(key) ?? { count: 0, types: new Set<string>() };
    entry.count += 1;
    entry.types.add(s.sessionType);
    occupancy.set(key, entry);
  }

  for (const session of missed) {
    let target: Date | null = null;
    for (const date of availableDates) {
      const key = localDateKey(date);
      const entry = occupancy.get(key) ?? { count: 0, types: new Set<string>() };
      if (entry.count < capByKey.get(key)! && !entry.types.has(session.sessionType)) {
        target = date;
        entry.count += 1;
        entry.types.add(session.sessionType);
        occupancy.set(key, entry);
        break;
      }
    }
    if (!target) continue; // pas de place dans l'horizon de recherche — laissée telle quelle

    const week = await prisma.trainingWeek.findFirst({
      where: { planId: plan.id, startDate: { lte: target }, endDate: { gte: target } },
    });
    if (!week) continue;

    await prisma.trainingSession.update({
      where: { id: session.id },
      data: { scheduledDate: target, weekId: week.id },
    });
  }
}

// ─── Matérialisation principale ──────────────────────────────────────────────

export async function materializePlan(userId: string) {
  const schedule = await getOrCreateSchedule(userId);

  // Volume hebdo course = donnée réelle (activités synchronisées), jamais
  // saisie à la main — recalculé à chaque appel, c'est une agrégation locale
  // bon marché (pas d'appel Garmin), donc toujours à jour sans job séparé.
  const weeklyVolumeKm = await computeWeeklyRunningVolumeKm(userId);
  if (weeklyVolumeKm !== null) {
    await prisma.athleteProfile.upsert({
      where: { userId },
      update: { weeklyVolume: weeklyVolumeKm },
      create: { userId, weeklyVolume: weeklyVolumeKm },
    });
  }

  const profileRow = await prisma.athleteProfile.findUnique({
    where: { userId },
    include: { personalRecords: true },
  });
  let adaptationState = await getOrCreateAdaptationState(userId);

  const reviewOutcome = await maybeReviewPastWeek(userId, schedule, adaptationState);
  if (reviewOutcome) {
    adaptationState = { ...adaptationState, ...reviewOutcome };
  }

  const baseProfile = toPeriodizationProfile(profileRow);
  const effectiveProfile = applyAdaptation(baseProfile, adaptationState);

  const generated = generateTrainingPlan({
    planName: "Plan généré",
    startDate: effectiveStartDate(schedule),
    totalWeeks: schedule.totalWeeks,
    goalType: schedule.goalType,
    profile: effectiveProfile,
    raceDate: schedule.raceDate,
    vacationMode: schedule.vacationMode,
    // Toujours "tous les jours" ici, jamais schedule.availableDays (champ
    // conservé en base mais plus modifiable depuis l'UI, cf. app/training/
    // page.tsx) : avec un pattern hebdo restreint, applyAvailability()
    // (lib/engine/periodization.ts) remappait tout le volume sur ces quelques
    // jours avec un plafond souple de 2/jour — exactement le mécanisme
    // derrière "toujours 3-4 séances par jour". La vraie contrainte de
    // capacité (cap dur, jour travaillé vs repos) vit maintenant entièrement
    // dans WorkSchedule + applySmartDayAssignment ci-dessous.
    availableDays: [0, 1, 2, 3, 4, 5, 6],
    weeklyTimeBudgetMin: schedule.weeklyTimeBudgetMin,
  });

  // Calendrier 2 semaines (lib/training/dayPlanner.ts) : sur l'horizon proche,
  // remplace le placement générique par les jours choisis explicitement par
  // l'athlète (ScheduleDayChoice + WorkSchedule), en respectant le plafond dur
  // de séances/jour (1 un jour travaillé, 2 un jour de repos si la récup est
  // bonne, sinon 1, 0 le premier jour de repos si trop fatigué) et en limitant
  // la répétition de sessionType sur des jours qui se suivent. Le reste du
  // plan (au-delà de la fenêtre) n'est pas touché.
  //
  // Fenêtre de SÉLECTION (quelles séances sont replacées) volontairement plus
  // large que les 14 jours éditables par le calendrier (app/api/training/
  // day-choices) : avec peu de jours dispo par semaine (ex. rythme de nuit,
  // 1 séance/jour travaillé), le volume hebdo du moteur ne tient pas dans 2
  // semaines — sans marge, le solveur devrait soit dépasser le plafond soit
  // supprimer des séances.
  //
  // Horizon de PLACEMENT (où une séance peut atterrir) encore plus large que
  // la fenêtre de sélection, jusqu'à 90 jours — un vrai réservoir de jours de
  // repli pour que le surplus s'étale sur les prochaines occurrences des
  // jours dispo au lieu de s'empiler sur un jour déjà plein (cap dur, cf.
  // lib/training/dayPlanner.ts).
  const today = startOfDay(new Date());
  const windowStart = today.getTime() > generated.startDate.getTime() ? today : startOfDay(generated.startDate);
  const windowEndCandidate = addDays(windowStart, 27);
  const windowEnd =
    windowEndCandidate.getTime() < generated.endDate.getTime() ? windowEndCandidate : generated.endDate;
  const placementEndCandidate = addDays(windowStart, 89);
  const placementEnd =
    placementEndCandidate.getTime() < generated.endDate.getTime() ? placementEndCandidate : generated.endDate;

  if (windowStart.getTime() <= windowEnd.getTime()) {
    const readiness = await computeCurrentReadiness(userId);
    const availability = await resolveDayAvailability(userId, windowStart, placementEnd, {
      recoveryIsGood: allowsDoubleSession(readiness),
    });
    applySmartDayAssignment({
      weeks: generated.weeks,
      windowStart,
      windowEnd,
      availability,
    });
  }

  let plan = await prisma.trainingPlan.findFirst({ where: { userId, status: "ACTIVE" } });
  if (!plan) {
    plan = await prisma.trainingPlan.create({
      data: {
        userId,
        name: generated.name,
        startDate: generated.startDate,
        endDate: generated.endDate,
        status: "ACTIVE",
      },
    });
  } else if (
    plan.startDate.getTime() !== generated.startDate.getTime() ||
    plan.endDate.getTime() !== generated.endDate.getTime()
  ) {
    plan = await prisma.trainingPlan.update({
      where: { id: plan.id },
      data: { startDate: generated.startDate, endDate: generated.endDate, name: generated.name },
    });
  }

  const existingWeeks = await prisma.trainingWeek.findMany({
    where: { planId: plan.id },
    include: {
      sessions: {
        select: {
          id: true,
          status: true,
          scheduledDate: true,
          sport: true,
          sessionType: true,
          title: true,
          duration: true,
          targetDistance: true,
        },
      },
    },
  });
  const existingByNumber = new Map(existingWeeks.map((w) => [w.weekNumber, w]));

  for (const week of generated.weeks) {
    const existing = existingByNumber.get(week.weekNumber);

    if (!existing) {
      const createdWeek = await prisma.trainingWeek.create({
        data: {
          planId: plan.id,
          weekNumber: week.weekNumber,
          weekType: week.weekType,
          targetVolume: week.targetVolume,
          startDate: week.startDate,
          endDate: week.endDate,
        },
      });
      await createSessions(createdWeek.id, week.sessions);
      continue;
    }

    const hasHistory = existing.sessions.some((s) => s.status !== "PLANNED");
    if (hasHistory) continue; // séance déjà loggée cette semaine — on ne touche plus rien

    const currentSignature = weekSignature(existing.sessions);
    const nextSignature = weekSignature(
      week.sessions.map((s) => ({
        scheduledDate: s.scheduledDate,
        sport: s.sport,
        sessionType: s.sessionType,
        title: s.title,
        duration: s.duration,
        targetDistance: s.targetDistance,
      }))
    );
    if (currentSignature === nextSignature) continue; // rien n'a changé, on ne réécrit pas

    await prisma.trainingSession.deleteMany({ where: { weekId: existing.id, status: "PLANNED" } });
    await prisma.trainingWeek.update({
      where: { id: existing.id },
      data: {
        weekType: week.weekType,
        targetVolume: week.targetVolume,
        startDate: week.startDate,
        endDate: week.endDate,
      },
    });
    await createSessions(existing.id, week.sessions);
  }

  await rescheduleMissedSessions(userId);

  return { plan, generated };
}
