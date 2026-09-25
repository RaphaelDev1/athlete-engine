import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/garmin/user";
import { activityEditSchema } from "@/lib/validations/activity";
import { computePaceAndSpeed } from "@/lib/intervals/mapping";

// Édition manuelle d'une Activity synchronisée (Séances de la semaine /
// Historique) — sert surtout à compléter les activités importées via Strava,
// pour lesquelles l'API Intervals.icu ne renvoie ni type ni détails (voir
// lib/intervals/mapping.ts::normalizeActivity).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json();
  const parsed = activityEditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const user = await getDefaultUser();
  const activity = await prisma.activity.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!activity) {
    return NextResponse.json({ error: "Activité introuvable" }, { status: 404 });
  }

  const data = parsed.data;
  const distanceMeters = data.distanceKm !== null ? Math.round(data.distanceKm * 1000) : null;
  const movingTimeSec = data.durationMin !== null ? Math.round(data.durationMin * 60) : null;
  const { avgPaceSecPerKm, avgSpeedKph } = computePaceAndSpeed(data.sport, movingTimeSec, distanceMeters);

  const updated = await prisma.activity.update({
    where: { id: activity.id },
    data: {
      sport: data.sport,
      name: data.name,
      distanceMeters,
      movingTimeSec,
      avgPaceSecPerKm,
      avgSpeedKph,
      avgHeartRate: data.avgHeartRate,
      avgPower: data.avgPower,
      elevationGain: data.elevationGain,
      calories: data.calories,
      // Protège ces champs contre l'écrasement à la prochaine synchronisation
      // Intervals.icu (voir lib/intervals/store.ts::upsertActivity).
      manuallyEditedAt: new Date(),
    },
  });

  return NextResponse.json({ data: updated });
}
