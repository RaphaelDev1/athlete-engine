import { NextResponse } from "next/server";
import { isIntervalsConfigured } from "@/lib/intervals/config";
import { getDefaultUser } from "@/lib/garmin/user";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getDefaultUser();

  return NextResponse.json({
    configured: isIntervalsConfigured(),
    lastSyncAt: user.intervalsLastSyncAt,
    lastSyncStatus: user.intervalsLastSyncStatus,
    lastSyncError: user.intervalsLastSyncError,
  });
}
