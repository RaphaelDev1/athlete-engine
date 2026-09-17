import { NextResponse } from "next/server";
import { isGarminConfigured } from "@/lib/garmin/client";
import { getDefaultUser } from "@/lib/garmin/user";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getDefaultUser();

  return NextResponse.json({
    configured: isGarminConfigured(),
    lastSyncAt: user.garminLastSyncAt,
    lastSyncStatus: user.garminLastSyncStatus,
    lastSyncError: user.garminLastSyncError,
  });
}
