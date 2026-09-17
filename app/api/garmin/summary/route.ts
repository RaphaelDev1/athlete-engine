import { NextRequest, NextResponse } from "next/server";
import { getDefaultUser } from "@/lib/garmin/user";
import { getGarminSummary } from "@/lib/garmin/summary";

export const dynamic = "force-dynamic";

const DEFAULT_TREND_DAYS = 7;

export async function GET(request: NextRequest) {
  const user = await getDefaultUser();
  const daysParam = request.nextUrl.searchParams.get("days");
  const days = daysParam ? Number(daysParam) : DEFAULT_TREND_DAYS;

  const summary = await getGarminSummary(user.id, Number.isFinite(days) ? days : DEFAULT_TREND_DAYS);
  return NextResponse.json(summary);
}
