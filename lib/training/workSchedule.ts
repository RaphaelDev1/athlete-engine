// Cycle de travail répétitif (ex. rythme de nuit) : l'athlète déclare une
// seule fois un pattern sur 14 jours (jour 0 = anchorDate), qui se répète
// indéfiniment. Consommé par lib/training/schedule.ts::resolveDayAvailability
// pour plafonner les séances à 1/jour un jour travaillé (sommeil décalé) au
// lieu de 2 un jour de repos, et par lib/training/materialize.ts pour sauter
// l'entraînement du premier jour de repos si la récup du moment est mauvaise.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const WORK_CYCLE_LENGTH = 14;

export interface WorkCycleDay {
  isWorkDay: boolean;
  startMin: number | null; // minutes depuis minuit, null si repos
  endMin: number | null;
}

export interface WorkScheduleData {
  anchorDate: Date;
  pattern: WorkCycleDay[];
}

function defaultPattern(): WorkCycleDay[] {
  return Array.from({ length: WORK_CYCLE_LENGTH }, () => ({
    isWorkDay: false,
    startMin: null,
    endMin: null,
  }));
}

// Minuit UTC du jour calendaire LOCAL — jamais setHours(0,0,0,0) ici : ça
// donnerait minuit LOCAL, qui pour un fuseau en avance sur UTC (Europe/Paris,
// UTC+1/+2) tombe 1-2h AVANT l'instant reçu si celui-ci est déjà minuit UTC
// (cas de l'anchorDate envoyée par l'API, cf. route.ts), le faisant router
// vers la veille une fois tronqué par Prisma sur la colonne @db.Date. Même
// construction que lib/training/schedule.ts::toDbDateOnly.
function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function daysBetween(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86400000);
}

function isValidCycleDay(v: unknown): v is WorkCycleDay {
  if (!v || typeof v !== "object") return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.isWorkDay === "boolean" &&
    (d.startMin === null || typeof d.startMin === "number") &&
    (d.endMin === null || typeof d.endMin === "number")
  );
}

function parsePattern(raw: unknown): WorkCycleDay[] {
  if (!Array.isArray(raw) || raw.length !== WORK_CYCLE_LENGTH || !raw.every(isValidCycleDay)) {
    return defaultPattern();
  }
  return raw as WorkCycleDay[];
}

export async function getWorkSchedule(userId: string): Promise<WorkScheduleData | null> {
  const row = await prisma.workSchedule.findUnique({ where: { userId } });
  if (!row) return null;
  return { anchorDate: row.anchorDate, pattern: parsePattern(row.pattern) };
}

export async function saveWorkSchedule(
  userId: string,
  data: { anchorDate: Date; pattern: WorkCycleDay[] }
): Promise<WorkScheduleData> {
  const anchorDate = startOfDay(data.anchorDate);
  const pattern = (data.pattern.length === WORK_CYCLE_LENGTH
    ? data.pattern
    : defaultPattern()) as unknown as Prisma.InputJsonValue;
  const row = await prisma.workSchedule.upsert({
    where: { userId },
    update: { anchorDate, pattern },
    create: { userId, anchorDate, pattern },
  });
  return { anchorDate: row.anchorDate, pattern: parsePattern(row.pattern) };
}

/** Position d'une date dans le cycle de 14 jours — toujours 0..13, même pour une date avant anchorDate. */
export function cycleDayIndex(anchorDate: Date, date: Date): number {
  const diff = daysBetween(startOfDay(anchorDate), startOfDay(date));
  return ((diff % WORK_CYCLE_LENGTH) + WORK_CYCLE_LENGTH) % WORK_CYCLE_LENGTH;
}

export function resolveWorkDay(schedule: WorkScheduleData | null, date: Date): WorkCycleDay {
  if (!schedule) return { isWorkDay: false, startMin: null, endMin: null };
  return schedule.pattern[cycleDayIndex(schedule.anchorDate, date)];
}

/** Jour de repos qui suit directement un jour travaillé — c'est le seul où la fatigue du moment peut annuler la séance. */
export function isFirstRestDayAfterWork(schedule: WorkScheduleData | null, date: Date): boolean {
  if (!schedule) return false;
  const today = resolveWorkDay(schedule, date);
  if (today.isWorkDay) return false;
  const yesterday = resolveWorkDay(schedule, new Date(startOfDay(date).getTime() - 86400000));
  return yesterday.isWorkDay;
}
