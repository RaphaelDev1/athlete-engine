import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/garmin/user";
import { fetchActivities } from "@/lib/intervals/pull";
import { upsertActivity } from "@/lib/intervals/store";

export const maxDuration = 30;

// Déclenché manuellement depuis le bouton "Synchroniser" du Dashboard (même
// esprit que /api/garmin/sync) — récupère les activités des N derniers jours
// et les upsert.
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const days = Math.max(1, Number(url.searchParams.get("days") ?? "30"));

  const user = await getDefaultUser();
  const newest = new Date();
  const oldest = new Date();
  oldest.setDate(oldest.getDate() - days);

  try {
    const activities = await fetchActivities(oldest, newest);
    for (const activity of activities) {
      await upsertActivity(user.id, activity);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { intervalsLastSyncAt: new Date(), intervalsLastSyncStatus: "ok", intervalsLastSyncError: null },
    });

    return NextResponse.json({ ok: true, synced: activities.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Synchronisation Intervals.icu échouée";
    await prisma.user.update({
      where: { id: user.id },
      data: { intervalsLastSyncStatus: "error", intervalsLastSyncError: message },
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
