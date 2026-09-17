// Normalisation des items de webhook Garmin vers les champs dénormalisés de
// GarminData (date + summaryValue), par type de donnée.

import { GarminDataType } from "@/lib/types";
import { GarminWebhookItem } from "./webhookTypes";

export function extractDate(item: GarminWebhookItem): Date {
  if (item.calendarDate) return new Date(item.calendarDate);
  if (item.startTimeInSeconds) return new Date(item.startTimeInSeconds * 1000);
  return new Date();
}

// Valeur "phare" affichée dans les listes / graphes sans avoir à reparser le
// JSON brut (ex: score de sommeil, HRV moyen, niveau de Body Battery...).
export function extractSummaryValue(
  dataType: GarminDataType,
  item: GarminWebhookItem
): number | null {
  switch (dataType) {
    case "SLEEP": {
      const s = item as { overallSleepScore?: { value: number } };
      return s.overallSleepScore?.value ?? null;
    }
    case "ACTIVITY": {
      const a = item as { activeKilocalories?: number };
      return a.activeKilocalories ?? null;
    }
    case "HRV": {
      const h = item as { lastNightAvg?: number };
      return h.lastNightAvg ?? null;
    }
    case "BODY_BATTERY": {
      const b = item as { bodyBatteryValuesArray?: [number, number][] };
      const values = b.bodyBatteryValuesArray;
      return values && values.length > 0 ? values[values.length - 1][1] : null;
    }
    case "STRESS": {
      const s = item as { avgStressLevel?: number };
      return s.avgStressLevel ?? null;
    }
    case "TRAINING_READINESS": {
      const t = item as { score?: number };
      return t.score ?? null;
    }
    case "TRAINING_STATUS": {
      const t = item as { loadRatio?: number };
      return t.loadRatio ?? null;
    }
    case "TRAINING_LOAD": {
      const t = item as { loadRatio?: number };
      return t.loadRatio ?? null;
    }
    case "VO2MAX": {
      const v = item as { vo2Max?: number };
      return v.vo2Max ?? null;
    }
    case "RESTING_HR": {
      const r = item as { restingHeartRate?: number };
      return r.restingHeartRate ?? null;
    }
    case "MAX_HR": {
      const r = item as { maxHeartRate?: number };
      return r.maxHeartRate ?? null;
    }
    default:
      return null;
  }
}
