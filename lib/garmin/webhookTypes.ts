// Formes (partielles) des payloads Garmin normalisés par lib/garmin/pull.ts.
// Ces interfaces définissaient à l'origine les payloads reçus via les
// webhooks push de l'API officielle ; elles servent maintenant de contrat de
// forme cible pour les données récupérées par polling, afin que le reste de
// l'app (mapping.ts, summary.ts, l'UI recovery) n'ait pas à changer.
//
// On ne type que les champs qu'on exploite réellement ; le reste du payload
// est conservé tel quel dans GarminData.payload pour ne rien perdre.

export interface GarminWebhookItemBase {
  userId: string; // identifiant Garmin de l'utilisateur (≠ notre User.id)
  summaryId?: string;
  calendarDate?: string; // "YYYY-MM-DD"
  startTimeInSeconds?: number;
  [key: string]: unknown;
}

export interface GarminSleepItem extends GarminWebhookItemBase {
  overallSleepScore?: { value: number; qualifierKey?: string };
  durationInSeconds?: number;
  deepSleepDurationInSeconds?: number;
  lightSleepDurationInSeconds?: number;
  remSleepInSeconds?: number;
  awakeDurationInSeconds?: number;
}

export interface GarminActivityItem extends GarminWebhookItemBase {
  activityType?: string;
  durationInSeconds?: number;
  distanceInMeters?: number;
  averageHeartRateInBeatsPerMinute?: number;
  activeKilocalories?: number;
}

export interface GarminHrvItem extends GarminWebhookItemBase {
  lastNightAvg?: number; // ms
  lastNight5MinHigh?: number;
}

export interface GarminBodyBatteryItem extends GarminWebhookItemBase {
  bodyBatteryValuesArray?: [number, number][]; // [timestamp, level]
  charged?: number;
  drained?: number;
}

export interface GarminStressItem extends GarminWebhookItemBase {
  avgStressLevel?: number;
  maxStressLevel?: number;
}

export interface GarminTrainingReadinessItem extends GarminWebhookItemBase {
  score?: number;
  level?: string; // "LOW" | "MODERATE" | "HIGH"...
  feedbackLong?: string;
  sleepScore?: number;
  hrvWeeklyAverage?: number;
  recoveryTime?: number;
}

export interface GarminTrainingStatusItem extends GarminWebhookItemBase {
  trainingStatus?: string; // "PRODUCTIVE" | "OVERREACHING" | "DETRAINING"...
  loadRatio?: number;
}

export interface GarminTrainingLoadItem extends GarminWebhookItemBase {
  acuteLoad?: number;
  chronicLoad?: number;
  loadRatio?: number;
}

export interface GarminVo2MaxItem extends GarminWebhookItemBase {
  vo2Max?: number;
  fitnessAge?: number;
}

export interface GarminRestingHrItem extends GarminWebhookItemBase {
  restingHeartRate?: number;
  // FC max observée ce jour-là (même endpoint) — pas un "HRmax" configuré,
  // mais la meilleure approximation dispo sans endpoint dédié fiable ; voir
  // lib/garmin/profileSync.ts qui retient le maximum sur une fenêtre glissante
  // plutôt qu'une seule journée.
  maxHeartRate?: number;
}

export type GarminWebhookItem =
  | GarminSleepItem
  | GarminActivityItem
  | GarminHrvItem
  | GarminBodyBatteryItem
  | GarminStressItem
  | GarminTrainingReadinessItem
  | GarminTrainingStatusItem
  | GarminTrainingLoadItem
  | GarminVo2MaxItem
  | GarminRestingHrItem;
