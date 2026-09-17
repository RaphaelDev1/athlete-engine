// Construction des notifications internes (Phase 4) à partir des signaux de
// récupération et des événements de PR. Module pur : produit des
// "brouillons" de notification, la persistance/dédoublonnage se fait côté
// route API (lib/engine/ n'a pas de dépendance Prisma).

import { NotificationSeverity, NotificationType } from "@prisma/client";
import { RecoveryStatus } from "./garminAdaptation";
import { PrEvent } from "./adaptation";

export interface NotificationDraft {
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  relatedEntityId?: string;
}

const RUNNING_UNIT_LABEL: Record<string, string> = {
  seconds: "s",
  kg: "kg",
  watts: "W",
};

function formatPrValue(value: number, unit: string): string {
  if (unit === "seconds") {
    const min = Math.floor(value / 60);
    const sec = Math.round(value % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }
  return `${value} ${RUNNING_UNIT_LABEL[unit] ?? unit}`;
}

export function buildPrNotifications(events: PrEvent[]): NotificationDraft[] {
  return events.map((event) => ({
    type: "PR_CELEBRATION",
    severity: "SUCCESS",
    title: "Nouveau record personnel 🎉",
    message: event.previousValue
      ? `${event.exercise} : ${formatPrValue(event.newValue, event.unit)} (précédent : ${formatPrValue(event.previousValue, event.unit)})`
      : `${event.exercise} : ${formatPrValue(event.newValue, event.unit)} — premier record enregistré`,
    relatedEntityId: event.recordId,
  }));
}

export function buildSleepAlert(
  sleepScore: number | null,
  sleep7dAvg: number | null
): NotificationDraft | null {
  if (sleepScore === null) return null;

  if (sleepScore < 60) {
    return {
      type: "SLEEP_ALERT",
      severity: "WARNING",
      title: "Sommeil en baisse",
      message: `Score de sommeil à ${sleepScore}/100 — pense à recaler ton rythme de sommeil ce soir.`,
    };
  }

  if (sleep7dAvg !== null && sleep7dAvg > 0 && sleepScore < sleep7dAvg * 0.85) {
    return {
      type: "SLEEP_ALERT",
      severity: "WARNING",
      title: "Chute du score de sommeil",
      message: `Score de sommeil en baisse de plus de 15% vs ta moyenne 7 jours (${sleepScore} vs ${Math.round(sleep7dAvg)}).`,
    };
  }

  return null;
}

export function buildOvertrainingAlert(
  status: RecoveryStatus,
  loadRatio: number | null
): NotificationDraft | null {
  if (status.level === "REST") {
    return {
      type: "OVERTRAINING_ALERT",
      severity: "DANGER",
      title: "Risque de surmenage",
      message: `Signaux de récupération très faibles (${status.reasons.join(", ")}). Repos conseillé.`,
    };
  }
  if (loadRatio !== null && loadRatio > 1.5) {
    return {
      type: "OVERTRAINING_ALERT",
      severity: "DANGER",
      title: "Charge d'entraînement élevée",
      message: `Ratio de charge aiguë/chronique à ${loadRatio} (>1.5) — risque de blessure/surmenage.`,
    };
  }
  if (status.level === "CAUTION") {
    return {
      type: "OVERTRAINING_ALERT",
      severity: "WARNING",
      title: "Récupération à surveiller",
      message: `${status.reasons.join(", ")} — allège ou reporte tes prochaines grosses séances si besoin.`,
    };
  }
  return null;
}
