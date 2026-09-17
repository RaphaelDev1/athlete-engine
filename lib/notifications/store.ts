// Persistance des notifications avec dédoublonnage simple (pas de contrainte
// unique DB — volume faible, mono-utilisateur). Consommé par les routes API
// qui déclenchent le moteur d'adaptation (checkin, dashboard, profile).

import { prisma } from "@/lib/prisma";
import { NotificationDraft } from "@/lib/engine/notifications";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Persiste une notification si elle n'existe pas déjà :
 * - PR_CELEBRATION : dédoublonnée par `relatedEntityId` (un seul PR = une notif).
 * - autres types : au plus une par jour et par type.
 */
export async function persistNotification(
  userId: string,
  draft: NotificationDraft
): Promise<void> {
  const existing = draft.relatedEntityId
    ? await prisma.notification.findFirst({
        where: {
          userId,
          type: draft.type,
          relatedEntityId: draft.relatedEntityId,
        },
      })
    : await prisma.notification.findFirst({
        where: {
          userId,
          type: draft.type,
          createdAt: { gte: startOfToday() },
        },
      });

  if (existing) return;

  await prisma.notification.create({
    data: {
      userId,
      type: draft.type,
      severity: draft.severity,
      title: draft.title,
      message: draft.message,
      relatedEntityId: draft.relatedEntityId,
    },
  });
}

export async function persistNotifications(
  userId: string,
  drafts: NotificationDraft[]
): Promise<void> {
  for (const draft of drafts) {
    await persistNotification(userId, draft);
  }
}
