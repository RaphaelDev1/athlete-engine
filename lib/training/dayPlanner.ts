// Replace, sur un horizon court (le calendrier 2 semaines de /training), les
// séances générées par lib/engine/periodization.ts sur les jours choisis
// explicitement par l'athlète (ScheduleDayChoice + WorkSchedule) plutôt que
// sur le pattern hebdomadaire générique (TrainingSchedule.availableDays).
//
// Règles appliquées (au mieux — solveur glouton, pas de backtracking complet) :
// - plafond DUR de `cap` séances/jour (porté par chaque DayAvailability, cf.
//   lib/training/schedule.ts::resolveDayAvailability : 1 un jour travaillé au
//   sens de WorkSchedule, 2 un jour de repos si la récupération du moment est
//   bonne, sinon 1, 0 un jour forcé off) — jamais dépassé tant qu'il reste de
//   la place ailleurs dans `availability` (qui peut couvrir un horizon plus
//   large que [windowStart, windowEnd], justement pour absorber ce débordement
//   plutôt que d'empiler plusieurs séances sur un jour déjà plein) ;
// - si 2 séances le même jour : une "grosse" (tout ce qui n'est pas dans
//   SMALL_SESSION_TYPES, cf. lib/engine/flexibility.ts) + une "petite" —
//   jamais 2 grosses ensemble ; règle souple, dernier recours si aucun jour de
//   tout l'horizon n'a de place ;
// - on évite autant que possible de répéter le même sessionType (donc le même
//   groupe musculaire pour la muscu, puisque UPPER_BODY/LOWER_BODY/PUSH/PULL/
//   LEGS/FULL_BODY sont des SessionType à part entière) sur deux jours dispo
//   qui se suivent.
//
// Seules les semaines qui chevauchent [windowStart, windowEnd] perdent leurs
// séances à replacer ; mais le placement peut atterrir sur n'importe quelle
// semaine présente dans `weeks` si `availability` s'étend au-delà de
// windowEnd (mutation en place de `weeks` dans les deux cas).

import { GeneratedSession, GeneratedWeek } from "@/lib/engine/types";
import { SessionType } from "@/lib/types";
import { isSmallSession } from "@/lib/engine/flexibility";
import { buildRestDay } from "@/lib/engine/templates/common";

export interface DayAvailability {
  date: Date;
  available: boolean;
  /** Séances max ce jour-là : 0 = off forcé, 1 = jour travaillé, 2 = repos avec bonne récup. */
  cap: number;
}

export interface SmartDayAssignmentInput {
  weeks: GeneratedWeek[];
  windowStart: Date;
  windowEnd: Date;
  // Peut couvrir un horizon plus large que [windowStart, windowEnd] : sert
  // alors de réservoir de jours de repli quand la fenêtre stricte n'a pas
  // assez de capacité pour tout le pool de séances à replacer.
  availability: DayAvailability[];
}

// Clé "YYYY-MM-DD" en calendrier LOCAL — jamais .toISOString() ici : ce
// serveur tourne en Europe/Paris (UTC+1/+2), et toISOString() convertit en
// UTC, ce qui fait apparaître minuit local comme la veille (confirmé : Prisma
// tronque aussi les colonnes @db.Date sur le jour calendaire UTC, cf.
// lib/training/schedule.ts::toDbDateOnly). Les getters locaux (getFullYear/
// getMonth/getDate) redonnent toujours le bon jour, que la Date d'origine
// soit "minuit local" ou "minuit UTC du même jour local".
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateKey(d: Date): string {
  return localDateKey(d);
}

function isInWindow(date: Date, start: Date, end: Date): boolean {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function daysBetween(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86400000);
}

function eachDate(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function weekContaining(weeks: GeneratedWeek[], date: Date): GeneratedWeek | undefined {
  return weeks.find((w) => date.getTime() >= w.startDate.getTime() && date.getTime() <= w.endDate.getTime());
}

function neighborTypes(
  dateIdx: number,
  availableDates: Date[],
  slots: Map<string, GeneratedSession[]>
): Set<SessionType> {
  const types = new Set<SessionType>();
  const prev = availableDates[dateIdx - 1];
  const next = availableDates[dateIdx + 1];
  if (prev) slots.get(dateKey(prev))?.forEach((s) => types.add(s.sessionType));
  if (next) slots.get(dateKey(next))?.forEach((s) => types.add(s.sessionType));
  return types;
}

export function applySmartDayAssignment(input: SmartDayAssignmentInput): void {
  const { weeks, windowStart, windowEnd, availability } = input;

  const sessionsInWindow: GeneratedSession[] = [];
  for (const week of weeks) {
    for (const session of week.sessions) {
      if (isInWindow(session.scheduledDate, windowStart, windowEnd)) {
        sessionsInWindow.push(session);
      }
    }
  }
  if (sessionsInWindow.length === 0) return;

  // Retire les séances de la fenêtre de leurs semaines — replacées après assignation.
  for (const week of weeks) {
    week.sessions = week.sessions.filter((s) => !isInWindow(s.scheduledDate, windowStart, windowEnd));
  }

  const availableDates = availability
    .filter((a) => a.cap > 0)
    .map((a) => a.date)
    .sort((a, b) => a.getTime() - b.getTime());

  if (availableDates.length === 0) {
    // Aucun jour choisi dans tout l'horizon : on replace tel quel, impossible de faire mieux.
    for (const session of sessionsInWindow) {
      weekContaining(weeks, session.scheduledDate)?.sessions.push(session);
    }
    return;
  }

  const capByKey = new Map(availability.filter((a) => a.cap > 0).map((a) => [dateKey(a.date), a.cap]));
  const slots = new Map<string, GeneratedSession[]>();
  availableDates.forEach((d) => slots.set(dateKey(d), []));

  // Repos/mobilité générés par le moteur : pas des "séances d'entraînement" au
  // sens des règles de variété — écartées du pool à replacer, les jours non
  // choisis récupèrent un repos explicite en fin de fonction.
  const trainingSessions = sessionsInWindow.filter((s) => s.sport !== "REST");
  const big = trainingSessions.filter((s) => !isSmallSession(s.sessionType));
  const small = trainingSessions.filter((s) => isSmallSession(s.sessionType));

  const nSlots = availableDates.length;

  function scoreCandidate(idx: number, session: GeneratedSession, isBig: boolean): number {
    const day = slots.get(dateKey(availableDates[idx]))!;
    const sameTypeOnDay = day.some((s) => s.sessionType === session.sessionType);
    const hasBigAlready = day.some((s) => !isSmallSession(s.sessionType));
    const conflictsWithNeighbor = neighborTypes(idx, availableDates, slots).has(session.sessionType);

    let score = 0;
    // Règles dures de variété — ne jamais dupliquer un sessionType sur un même
    // jour, ni poser 2 grosses séances ensemble : très fortement pénalisées,
    // mais pas interdites en tout dernier recours (on ne supprime jamais une
    // séance). Le plafond de séances/jour, lui, est une vraie limite dure
    // appliquée en amont par le filtre de candidats ci-dessous — jamais
    // dépassée tant qu'il reste de la place ailleurs dans l'horizon.
    if (sameTypeOnDay) score -= 1000;
    if (isBig && hasBigAlready) score -= 1000;
    if (day.length === 0) score += 20;
    if (!conflictsWithNeighbor) score += 10;
    score -= day.length; // départage : le moins chargé d'abord
    return score;
  }

  // Choisit le meilleur jour pour une séance — d'abord uniquement parmi ceux
  // qui ont encore de la place sous leur plafond (cap dur, cf. DayAvailability
  // et l'en-tête de fichier) ; seulement si TOUT l'horizon élargi est déjà
  // saturé, on retombe sur l'ancien comportement (moins pire plutôt que de
  // perdre la séance) plutôt que de planter.
  function pickBestDay(session: GeneratedSession, isBig: boolean): number {
    const withRoom: number[] = [];
    for (let idx = 0; idx < nSlots; idx++) {
      const day = slots.get(dateKey(availableDates[idx]))!;
      const cap = capByKey.get(dateKey(availableDates[idx]))!;
      if (day.length < cap) withRoom.push(idx);
    }
    const candidates = withRoom.length > 0 ? withRoom : Array.from({ length: nSlots }, (_, i) => i);

    let bestIdx = candidates[0];
    let bestScore = -Infinity;
    for (const idx of candidates) {
      const score = scoreCandidate(idx, session, isBig);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    }
    return bestIdx;
  }

  // ─── Grosses séances d'abord : espacées le plus possible, jamais 2 le même jour ───
  for (const session of big) {
    const idx = pickBestDay(session, true);
    slots.get(dateKey(availableDates[idx]))!.push(session);
  }

  // ─── Petites séances : comblent les jours vides puis les jours restants ───
  for (const session of small) {
    const idx = pickBestDay(session, false);
    slots.get(dateKey(availableDates[idx]))!.push(session);
  }

  // ─── Réinjection dans les bonnes semaines avec le bon dayOfWeek ───
  for (const date of availableDates) {
    for (const session of slots.get(dateKey(date))!) {
      const week = weekContaining(weeks, date);
      if (!week) continue;
      session.scheduledDate = date;
      session.dayOfWeek = daysBetween(week.startDate, date);
      week.sessions.push(session);
    }
  }

  // ─── Jours de la fenêtre non choisis : repos explicite ───
  const availableKeys = new Set(availableDates.map(dateKey));
  for (const date of eachDate(windowStart, windowEnd)) {
    if (availableKeys.has(dateKey(date))) continue;
    const week = weekContaining(weeks, date);
    if (!week) continue;
    week.sessions.push({
      ...buildRestDay(),
      id: crypto.randomUUID(),
      dayOfWeek: daysBetween(week.startDate, date),
      scheduledDate: date,
    });
  }

  for (const week of weeks) {
    week.sessions.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  }
}
