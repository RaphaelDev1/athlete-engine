import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GarminDataType } from "@/lib/types";
import { getDefaultUser } from "@/lib/garmin/user";
import { getGarminClient } from "@/lib/garmin/client";
import { upsertGarminData } from "@/lib/garmin/store";
import { syncAthleteProfileFromGarmin } from "@/lib/garmin/profileSync";
import {
  fetchActiveCalories,
  fetchBodyBattery,
  fetchHrv,
  fetchRestingHr,
  fetchSleep,
  fetchStress,
  fetchTrainingReadiness,
  fetchTrainingStatus,
  fetchVo2max,
} from "@/lib/garmin/pull";
import { GarminWebhookItem } from "@/lib/garmin/webhookTypes";
import { GarminConnect } from "garmin-connect";

export const maxDuration = 30;

const FETCHERS: {
  dataType: GarminDataType;
  fetch: (client: GarminConnect, date: Date) => Promise<GarminWebhookItem | null>;
}[] = [
  { dataType: "SLEEP", fetch: fetchSleep },
  { dataType: "ACTIVITY", fetch: fetchActiveCalories },
  { dataType: "HRV", fetch: fetchHrv },
  { dataType: "BODY_BATTERY", fetch: fetchBodyBattery },
  { dataType: "STRESS", fetch: fetchStress },
  { dataType: "TRAINING_READINESS", fetch: fetchTrainingReadiness },
  { dataType: "TRAINING_STATUS", fetch: fetchTrainingStatus },
  { dataType: "VO2MAX", fetch: fetchVo2max },
  { dataType: "RESTING_HR", fetch: fetchRestingHr },
];

// Déclenché manuellement depuis le bouton "Synchroniser" de /recovery (pas de
// cron en V1). Se logue à Garmin Connect puis récupère/upsert les N derniers
// jours pour chaque type de donnée suivi.
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const days = Math.max(1, Number(url.searchParams.get("days") ?? "7"));

  const user = await getDefaultUser();

  let client: GarminConnect;
  try {
    client = await getGarminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login Garmin échoué";
    await prisma.user.update({
      where: { id: user.id },
      data: { garminLastSyncStatus: "error", garminLastSyncError: message },
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  const now = new Date();
  const synced: { date: string; types: GarminDataType[] }[] = [];
  let lastError: string | null = null;

  for (let i = 0; i < days; i++) {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)
    );

    const results = await Promise.all(
      FETCHERS.map(async ({ dataType, fetch }) => ({
        dataType,
        item: await fetch(client, date),
      }))
    );

    const types: GarminDataType[] = [];
    for (const { dataType, item } of results) {
      if (!item) continue;
      try {
        await upsertGarminData(user.id, dataType, date, item);
        types.push(dataType);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.error(`Garmin upsert failed (${dataType})`, err);
      }
    }

    // La FC max du jour vient du même appel que la FC repos (dailyHeartRate) —
    // pas d'appel réseau supplémentaire, voir GarminRestingHrItem.maxHeartRate.
    const restingHrResult = results.find((r) => r.dataType === "RESTING_HR");
    const maxHeartRate = (restingHrResult?.item as { maxHeartRate?: number } | null)
      ?.maxHeartRate;
    if (restingHrResult?.item && maxHeartRate != null) {
      try {
        await upsertGarminData(user.id, "MAX_HR", date, restingHrResult.item);
        types.push("MAX_HR");
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.error("Garmin upsert failed (MAX_HR)", err);
      }
    }

    if (types.length > 0) {
      synced.push({ date: date.toISOString().slice(0, 10), types });
    }
  }

  await syncAthleteProfileFromGarmin(user.id);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      garminLastSyncAt: now,
      garminLastSyncStatus: lastError ? "error" : "ok",
      garminLastSyncError: lastError,
    },
  });

  return NextResponse.json({ ok: true, synced });
}
