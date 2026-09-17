// Écriture des données Garmin normalisées en base — même logique d'upsert que
// l'ancienne route webhook, réutilisée par la synchronisation par polling.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { GarminDataType } from "@/lib/types";
import { extractSummaryValue } from "./mapping";
import { GarminWebhookItem } from "./webhookTypes";

export async function upsertGarminData(
  userId: string,
  dataType: GarminDataType,
  date: Date,
  normalizedPayload: GarminWebhookItem
) {
  const summaryValue = extractSummaryValue(dataType, normalizedPayload);
  const payload = normalizedPayload as unknown as Prisma.InputJsonValue;

  await prisma.garminData.upsert({
    where: { userId_dataType_date: { userId, dataType, date } },
    update: { payload, summaryValue },
    create: { userId, dataType, date, payload, summaryValue },
  });
}
