import { prisma } from "@/lib/prisma";
import { DayAvailability, localDateKey } from "./dayPlanner";
import { getWorkSchedule, resolveWorkDay, isFirstRestDayAfterWork } from "./workSchedule";

function nextMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (8 - day) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

// Un seul point d'ancrage par utilisateur (V1 mono-utilisateur, même idiome
// que getDefaultUser()) — le plan lui-même reste calculé à la volée.
export async function getOrCreateSchedule(userId: string) {
  return prisma.trainingSchedule.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      goalType: "TRIATHLON",
      totalWeeks: 26,
      startDate: nextMonday(new Date()),
      availableDays: [0, 1, 2, 3, 4, 5, 6],
    },
  });
}

export function effectiveStartDate(schedule: { startDate: Date; shiftDays: number }): Date {
  const d = new Date(schedule.startDate);
  d.setDate(d.getDate() + schedule.shiftDays);
  return d;
}

// Report en cascade : décale d'un jour tout ce qu'il reste à faire, sans
// toucher aux séances déjà générées (rien n'est persisté à part ce compteur).
export async function postponeSchedule(userId: string) {
  await getOrCreateSchedule(userId);
  return prisma.trainingSchedule.update({
    where: { userId },
    data: { shiftDays: { increment: 1 } },
  });
}

// Minuit UTC du jour calendaire LOCAL — jamais setHours(0,0,0,0) ici : ça
// donnerait minuit LOCAL, qui pour un fuseau en avance sur UTC (Europe/Paris,
// UTC+1/+2) tombe 1-2h AVANT le TrainingWeek.startDate correspondant (lui
// ancré en minuit UTC via new Date("YYYY-MM-DD"), cf. lib/engine/periodization.ts).
// Comparer les deux avec .getTime() ferait alors passer le premier jour de
// chaque semaine pour "avant" la semaine elle-même — silencieusement exclu
// par lib/training/dayPlanner.ts::weekContaining. Même construction que
// toDbDateOnly() ci-dessous, dupliquée ici pour rester utilisable avant sa
// déclaration.
function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

// ScheduleDayChoice.date est une colonne @db.Date (jour calendaire pur, sans
// heure). Prisma sérialise une Date JS vers cette colonne en gardant son jour
// calendaire UTC — pas local (vérifié empiriquement). Sur ce serveur
// (Europe/Paris, UTC+1/+2), une "minuit locale" tombe la veille en UTC, donc
// l'écrire/la filtrer telle quelle stockerait le mauvais jour. On construit
// donc explicitement minuit UTC du jour calendaire LOCAL voulu.
function toDbDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/**
 * Disponibilité + capacité jour par jour sur [start, end] : une surcharge
 * explicite (ScheduleDayChoice, posée depuis le calendrier 2 semaines de
 * /training) à `available: false` force un jour entièrement off (cap 0) ;
 * sinon la capacité vient du cycle de travail (WorkSchedule, cf.
 * lib/training/workSchedule.ts) — 1 séance/jour travaillé (sommeil décalé),
 * 2 un jour de repos si `recoveryIsGood`, sinon 1, et 0 si c'est le tout
 * premier jour de repos après une série de jours travaillés ET qu'on est
 * "aujourd'hui" avec une récupération mauvaise (seul jour pour lequel on a
 * une mesure de fatigue réelle et à jour).
 */
export async function resolveDayAvailability(
  userId: string,
  start: Date,
  end: Date,
  opts?: { recoveryIsGood?: boolean }
): Promise<DayAvailability[]> {
  const recoveryIsGood = opts?.recoveryIsGood ?? true;
  const [choices, workSchedule] = await Promise.all([
    prisma.scheduleDayChoice.findMany({
      where: { userId, date: { gte: toDbDateOnly(start), lte: toDbDateOnly(end) } },
    }),
    getWorkSchedule(userId),
  ]);
  const overrides = new Map(choices.map((c) => [localDateKey(c.date), c.available]));
  const todayKey = localDateKey(startOfDay(new Date()));

  const result: DayAvailability[] = [];
  const cursor = startOfDay(start);
  const last = startOfDay(end);
  while (cursor.getTime() <= last.getTime()) {
    const date = new Date(cursor);
    const key = localDateKey(date);
    const override = overrides.get(key);

    let cap: number;
    if (override === false) {
      cap = 0;
    } else if (resolveWorkDay(workSchedule, date).isWorkDay) {
      cap = 1;
    } else if (
      override !== true &&
      key === todayKey &&
      !recoveryIsGood &&
      isFirstRestDayAfterWork(workSchedule, date)
    ) {
      cap = 0;
    } else {
      cap = recoveryIsGood ? 2 : 1;
    }

    result.push({ date, available: cap > 0, cap });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export { toDbDateOnly };
