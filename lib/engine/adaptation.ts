// Moteur d'adaptation (Phase 4) : combine les signaux Garmin
// (lib/engine/garminAdaptation.ts) avec le check-in matinal subjectif et la
// charge d'entraînement réelle pour produire l'état du jour et des actions
// d'adaptation proposées (report de séance, réduction de volume, recalcul de
// zones). Module pur — aucune requête Prisma ici, uniquement des fonctions de
// calcul consommées par les routes API.

import { ReadinessLevel, RecoveryStatus } from "./garminAdaptation";
import { Discipline, Sport, SessionType } from "@/lib/types";
import { isSmallSession } from "./flexibility";

// ─── Charge d'entraînement (ratio aigu/chronique) ────────────────────────────

export interface TrainingLoadSessionInput {
  date: Date;
  actualDuration: number | null; // minutes
  actualRPE: number | null; // 1-10
  targetRPE: number | null; // 1-10
}

export interface TrainingLoadResult {
  acute: number; // charge moyenne/jour sur 7j
  chronic: number; // charge moyenne/jour sur 28j
  ratio: number | null; // acute / chronic
}

const DEFAULT_RPE = 5;

/**
 * Charge journalière = durée × RPE (proxy simple de type "session-RPE").
 * Ratio charge aiguë (7j) / charge chronique (28j) — ACWR classique.
 */
export function computeTrainingLoad(
  sessions: TrainingLoadSessionInput[],
  now: Date = new Date()
): TrainingLoadResult {
  const acuteStart = new Date(now);
  acuteStart.setDate(acuteStart.getDate() - 7);
  const chronicStart = new Date(now);
  chronicStart.setDate(chronicStart.getDate() - 28);

  let acuteSum = 0;
  let chronicSum = 0;

  for (const session of sessions) {
    if (session.date < chronicStart || session.date > now) continue;
    const duration = session.actualDuration ?? 0;
    const rpe = session.actualRPE ?? session.targetRPE ?? DEFAULT_RPE;
    const load = duration * rpe;

    chronicSum += load;
    if (session.date >= acuteStart) acuteSum += load;
  }

  const acute = acuteSum / 7;
  const chronic = chronicSum / 28;

  return {
    acute: Math.round(acute),
    chronic: Math.round(chronic),
    ratio: chronic > 0 ? Math.round((acute / chronic) * 100) / 100 : null,
  };
}

// ─── Check-in subjectif ──────────────────────────────────────────────────────

export interface CheckInSignals {
  energy: number; // 1-5
  soreness: boolean;
  motivation: number; // 1-5
  stress: number; // 1-5
}

// ─── Fusion readiness Garmin + check-in + charge ────────────────────────────

const LEVEL_ORDER: ReadinessLevel[] = ["READY", "MAINTAIN", "CAUTION", "REST"];

export function blendReadiness(
  garminStatus: RecoveryStatus,
  checkIn: CheckInSignals | null,
  loadRatio: number | null
): RecoveryStatus {
  let level = garminStatus.level;
  const reasons = [...garminStatus.reasons];

  const worsen = (candidate: ReadinessLevel, reason: string) => {
    if (LEVEL_ORDER.indexOf(candidate) > LEVEL_ORDER.indexOf(level)) {
      level = candidate;
    }
    reasons.push(reason);
  };

  if (checkIn) {
    if (checkIn.energy <= 2) worsen("CAUTION", "Énergie ressentie basse au check-in");
    if (checkIn.stress >= 4) worsen("CAUTION", "Stress ressenti élevé au check-in");
    if (checkIn.soreness) worsen("CAUTION", "Douleurs musculaires signalées au check-in");
    if (checkIn.motivation <= 2 && checkIn.energy <= 2) {
      worsen("CAUTION", "Motivation et énergie faibles au check-in");
    }
  }

  if (loadRatio !== null && loadRatio > 1.5) {
    worsen("REST", "Charge aiguë/chronique très élevée (>1.5) — risque de surmenage");
  }

  const multiplier =
    level === "READY" ? 1.1 : level === "MAINTAIN" ? 1 : level === "CAUTION" ? 0.75 : 0.4;

  return { level, loadMultiplier: multiplier, reasons };
}

// ─── Détection de PR battu ───────────────────────────────────────────────────

export interface PersonalRecordInput {
  id: string;
  discipline: Discipline;
  exercise: string;
  value: number;
  unit: string;
  achievedAt: Date | null;
  createdAt: Date;
}

export interface PrEvent {
  recordId: string;
  discipline: Discipline;
  exercise: string;
  previousValue: number | null;
  newValue: number;
  unit: string;
}

// La direction d'amélioration dépend de l'unité, pas de la discipline : une
// RUNNING peut être un temps de course (secondes, plus petit = meilleur) ou
// une VMA (km/h, plus grand = meilleur) — voir lib/profile/records.ts::TEST_RESULT_FIELDS.
export function isImprovement(unit: string, previous: number, next: number): boolean {
  return unit === "seconds" ? next < previous : next > previous;
}

/**
 * Compare, pour chaque exercice, la dernière ligne à l'avant-dernière et
 * retourne les progressions. `records` doit être trié par exercice puis par
 * date croissante (achievedAt ?? createdAt).
 */
export function detectPrEvents(records: PersonalRecordInput[]): PrEvent[] {
  const byExercise = new Map<string, PersonalRecordInput[]>();
  for (const record of records) {
    const key = `${record.discipline}:${record.exercise}`;
    const list = byExercise.get(key) ?? [];
    list.push(record);
    byExercise.set(key, list);
  }

  const events: PrEvent[] = [];
  for (const list of Array.from(byExercise.values())) {
    const sorted = [...list].sort(
      (a, b) => (a.achievedAt ?? a.createdAt).getTime() - (b.achievedAt ?? b.createdAt).getTime()
    );
    const latest = sorted[sorted.length - 1];
    const previous = sorted[sorted.length - 2] ?? null;
    if (!latest) continue;
    if (!previous || isImprovement(latest.unit, previous.value, latest.value)) {
      events.push({
        recordId: latest.id,
        discipline: latest.discipline,
        exercise: latest.exercise,
        previousValue: previous?.value ?? null,
        newValue: latest.value,
        unit: latest.unit,
      });
    }
  }
  return events;
}

// ─── Actions d'adaptation proposées ──────────────────────────────────────────

export type AdaptationActionType =
  | "POSTPONE_SESSION"
  | "REDUCE_VOLUME"
  | "CANCEL_SESSION"
  | "RECALC_ZONES";

export interface AdaptationAction {
  type: AdaptationActionType;
  reason: string;
  sessionId?: string;
  sessionTitle?: string;
  multiplier?: number;
}

export interface TodaySessionInput {
  id: string;
  sport: Sport;
  sessionType: SessionType;
  title: string;
}

/**
 * Propose des actions à partir de l'état du jour — ne mute rien : c'est à
 * l'appelant (route API) de les appliquer si l'utilisateur confirme.
 *
 * `todaySessions` : séances persistées (lib/training/materialize.ts) dont la
 * date correspond à aujourd'hui — un vrai `id` DB est nécessaire pour que
 * REDUCE_VOLUME/CANCEL_SESSION puissent modifier la séance
 * (app/api/adaptation/apply-action/route.ts). Readiness REST → la séance est
 * trop risquée, on propose de l'annuler ; CAUTION → on propose de l'alléger.
 * Ni l'un ni l'autre n'est proposé pour une séance "petite"
 * (lib/engine/flexibility.ts) : une sortie facile/récup/mobilité/technique
 * peut être maintenue même en cas de mauvaise récupération.
 */
export function buildAdaptationActions(
  status: RecoveryStatus,
  todaySessions: TodaySessionInput[],
  hasPrEvents: boolean
): AdaptationAction[] {
  const actions: AdaptationAction[] = [];
  const reportable = todaySessions.filter(
    (s) => s.sport !== "REST" && !isSmallSession(s.sessionType)
  );

  if (status.level === "REST") {
    for (const s of reportable) {
      actions.push({
        type: "CANCEL_SESSION",
        reason: "Signaux de récupération très faibles — séance trop risquée aujourd'hui.",
        sessionId: s.id,
        sessionTitle: s.title,
      });
    }
  } else if (status.level === "CAUTION") {
    for (const s of reportable) {
      actions.push({
        type: "REDUCE_VOLUME",
        reason: "Signaux de fatigue détectés — séance allégée conseillée.",
        sessionId: s.id,
        sessionTitle: s.title,
        multiplier: 0.75,
      });
    }
  }

  if (hasPrEvents) {
    actions.push({
      type: "RECALC_ZONES",
      reason: "Nouveau record personnel — les zones d'entraînement peuvent être recalculées",
    });
  }

  return actions;
}
