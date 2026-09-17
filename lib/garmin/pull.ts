// Récupération des données Garmin par polling (au lieu des anciens webhooks
// push) et normalisation vers les formes attendues par lib/garmin/mapping.ts
// (voir lib/garmin/webhookTypes.ts pour le contrat de forme cible).
//
// Le sommeil passe par le wrapper `getSleepData` de la librairie
// garmin-connect. HRV, Body Battery, stress, training readiness, training
// status et VO2max n'ont pas de wrapper dans la librairie : on appelle
// directement les endpoints internes de Garmin Connect (mêmes endpoints que
// ceux utilisés par la référence publique python-garminconnect/GarminDB pour
// un usage personnel) via `client.get()`.
//
// ⚠️ Ces endpoints ne sont pas documentés officiellement : leurs chemins et
// la forme exacte des réponses ont été vérifiés en conditions réelles au
// moment de l'implémentation, mais Garmin peut les faire évoluer sans préavis.
// Si un type de donnée cesse de remonter, vérifier ici en premier.

import { GarminConnect } from "garmin-connect";
import { GARMIN_CONNECT_API_BASE } from "./config";
import {
  GarminActivityItem,
  GarminBodyBatteryItem,
  GarminHrvItem,
  GarminRestingHrItem,
  GarminSleepItem,
  GarminStressItem,
  GarminTrainingReadinessItem,
  GarminTrainingStatusItem,
  GarminVo2MaxItem,
} from "./webhookTypes";

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function safe<T>(label: string, fn: () => Promise<T | null>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`Garmin pull failed (${label})`, err);
    return null;
  }
}

export function fetchSleep(
  client: GarminConnect,
  date: Date
): Promise<GarminSleepItem | null> {
  return safe("sleep", async () => {
    const data = await client.getSleepData(date);
    const dto = data?.dailySleepDTO;
    if (!dto) return null;
    return {
      userId: "",
      calendarDate: toDateString(date),
      overallSleepScore: { value: dto.sleepScores?.overall?.value ?? 0 },
      durationInSeconds: dto.sleepTimeSeconds,
      deepSleepDurationInSeconds: dto.deepSleepSeconds,
      lightSleepDurationInSeconds: dto.lightSleepSeconds,
      remSleepInSeconds: dto.remSleepSeconds,
      awakeDurationInSeconds: dto.awakeSleepSeconds,
    };
  });
}

export function fetchHrv(
  client: GarminConnect,
  date: Date
): Promise<GarminHrvItem | null> {
  const dateStr = toDateString(date);
  return safe("hrv", async () => {
    const raw = await client.get<unknown>(
      `${GARMIN_CONNECT_API_BASE}/hrv-service/hrv/${dateStr}`
    );
    if (process.env.GARMIN_DEBUG_RAW) {
      console.log("[garmin-debug] hrv raw:", JSON.stringify(raw));
    }
    const r = raw as {
      hrvSummary?: { lastNightAvg?: number };
      lastNightAvg?: number;
    };
    const lastNightAvg = r?.hrvSummary?.lastNightAvg ?? r?.lastNightAvg;
    if (lastNightAvg == null) return null;
    return { userId: "", calendarDate: dateStr, lastNightAvg };
  });
}

export function fetchBodyBattery(
  client: GarminConnect,
  date: Date
): Promise<GarminBodyBatteryItem | null> {
  const dateStr = toDateString(date);
  return safe("bodyBattery", async () => {
    const raw = await client.get<
      { bodyBatteryValuesArray?: [number, number][] }[]
    >(`${GARMIN_CONNECT_API_BASE}/wellness-service/wellness/bodyBattery/reports/daily`, {
      params: { startDate: dateStr, endDate: dateStr },
    });
    const entry = Array.isArray(raw) ? raw[0] : undefined;
    if (!entry?.bodyBatteryValuesArray?.length) return null;
    return {
      userId: "",
      calendarDate: dateStr,
      bodyBatteryValuesArray: entry.bodyBatteryValuesArray,
    };
  });
}

export function fetchStress(
  client: GarminConnect,
  date: Date
): Promise<GarminStressItem | null> {
  const dateStr = toDateString(date);
  return safe("stress", async () => {
    const raw = await client.get<{ avgStressLevel?: number }>(
      `${GARMIN_CONNECT_API_BASE}/wellness-service/wellness/dailyStress/${dateStr}`
    );
    if (raw?.avgStressLevel == null) return null;
    return { userId: "", calendarDate: dateStr, avgStressLevel: raw.avgStressLevel };
  });
}

export function fetchTrainingReadiness(
  client: GarminConnect,
  date: Date
): Promise<GarminTrainingReadinessItem | null> {
  const dateStr = toDateString(date);
  return safe("trainingReadiness", async () => {
    const raw = await client.get<GarminTrainingReadinessItem[]>(
      `${GARMIN_CONNECT_API_BASE}/metrics-service/metrics/trainingreadiness/${dateStr}`
    );
    const entry = Array.isArray(raw) ? raw[0] : undefined;
    if (!entry) return null;
    return { ...entry, userId: "", calendarDate: dateStr };
  });
}

export function fetchTrainingStatus(
  client: GarminConnect,
  date: Date
): Promise<GarminTrainingStatusItem | null> {
  const dateStr = toDateString(date);
  return safe("trainingStatus", async () => {
    const raw = await client.get<{
      mostRecentTrainingStatus?: {
        latestTrainingStatusData?: Record<string, { trainingStatus?: string }>;
      };
      mostRecentTrainingLoadBalance?: {
        metricsTrainingLoadBalanceDTOMap?: Record<string, { acwrPercent?: number }>;
      };
    }>(`${GARMIN_CONNECT_API_BASE}/metrics-service/metrics/trainingstatus/aggregated/${dateStr}`);

    if (process.env.GARMIN_DEBUG_RAW) {
      console.log("[garmin-debug] trainingStatus raw:", JSON.stringify(raw));
    }

    const statusMap = raw?.mostRecentTrainingStatus?.latestTrainingStatusData;
    const firstStatus = statusMap ? Object.values(statusMap)[0] : undefined;
    const loadBalanceMap =
      raw?.mostRecentTrainingLoadBalance?.metricsTrainingLoadBalanceDTOMap;
    const firstLoadBalance = loadBalanceMap ? Object.values(loadBalanceMap)[0] : undefined;

    if (!firstStatus && !firstLoadBalance) return null;

    return {
      userId: "",
      calendarDate: dateStr,
      trainingStatus: firstStatus?.trainingStatus,
      loadRatio: firstLoadBalance?.acwrPercent
        ? firstLoadBalance.acwrPercent / 100
        : undefined,
    };
  });
}

export function fetchVo2max(
  client: GarminConnect,
  date: Date
): Promise<GarminVo2MaxItem | null> {
  const dateStr = toDateString(date);
  return safe("vo2max", async () => {
    const raw = await client.get<unknown>(
      `${GARMIN_CONNECT_API_BASE}/metrics-service/metrics/maxmet/daily/${dateStr}/${dateStr}`
    );
    if (process.env.GARMIN_DEBUG_RAW) {
      console.log("[garmin-debug] vo2max raw:", JSON.stringify(raw));
    }
    const list = raw as
      | { generic?: { vo2MaxPreciseValue?: number; vo2MaxValue?: number; fitnessAge?: number } }[]
      | undefined;
    const entry = Array.isArray(list) ? list[0] : undefined;
    const vo2Max = entry?.generic?.vo2MaxPreciseValue ?? entry?.generic?.vo2MaxValue;
    if (vo2Max == null) return null;
    return {
      userId: "",
      calendarDate: dateStr,
      vo2Max,
      fitnessAge: entry?.generic?.fitnessAge,
    };
  });
}

// Calories actives/totales du jour — pas de wrapper dans la lib garmin-connect,
// endpoint interne de la même famille que dailyStress/dailyHeartRate ci-dessus
// (résumé quotidien "usersummary"). Vérifié en conditions réelles : la date
// doit être un paramètre de requête (`?calendarDate=`), pas un segment de
// chemin — même piège que dailyHeartRate ci-dessous (403 sinon).
export function fetchActiveCalories(
  client: GarminConnect,
  date: Date
): Promise<GarminActivityItem | null> {
  const dateStr = toDateString(date);
  return safe("activeCalories", async () => {
    const raw = await client.get<unknown>(
      `${GARMIN_CONNECT_API_BASE}/usersummary-service/usersummary/daily`,
      { params: { calendarDate: dateStr } }
    );
    if (process.env.GARMIN_DEBUG_RAW) {
      console.log("[garmin-debug] activeCalories raw:", JSON.stringify(raw));
    }
    const r = raw as { activeKilocalories?: number; totalKilocalories?: number };
    if (r?.activeKilocalories == null) return null;
    return {
      userId: "",
      calendarDate: dateStr,
      activeKilocalories: r.activeKilocalories,
    };
  });
}

export function fetchRestingHr(
  client: GarminConnect,
  date: Date
): Promise<GarminRestingHrItem | null> {
  const dateStr = toDateString(date);
  return safe("restingHr", async () => {
    // Le date doit être un paramètre de requête, pas un segment de chemin —
    // `/dailyHeartRate/{date}` renvoie 403 Forbidden (confirmé en debug) alors
    // que `/dailyHeartRate?date=...` (utilisé par le wrapper getHeartRate() de
    // la lib garmin-connect) répond normalement.
    const raw = await client.get<unknown>(
      `${GARMIN_CONNECT_API_BASE}/wellness-service/wellness/dailyHeartRate`,
      { params: { date: dateStr } }
    );
    if (process.env.GARMIN_DEBUG_RAW) {
      console.log("[garmin-debug] restingHr raw:", JSON.stringify(raw));
    }
    const r = raw as { restingHeartRate?: number; maxHeartRate?: number };
    if (r?.restingHeartRate == null) return null;
    return {
      userId: "",
      calendarDate: dateStr,
      restingHeartRate: r.restingHeartRate,
      maxHeartRate: r.maxHeartRate,
    };
  });
}
