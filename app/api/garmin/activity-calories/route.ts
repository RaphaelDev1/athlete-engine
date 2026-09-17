import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/garmin/user";

export const dynamic = "force-dynamic";

// Calories actives réelles du jour (dataType ACTIVITY, cf. lib/garmin/pull.ts
// ::fetchActiveCalories) — consommé par /nutrition pour recaler le TDEE sur
// le réel quand la donnée est disponible (repli sur l'estimation sinon).
export async function GET(request: NextRequest) {
  const user = await getDefaultUser();
  const dateParam = request.nextUrl.searchParams.get("date");
  if (!dateParam) {
    return NextResponse.json({ error: "date requise" }, { status: 400 });
  }
  const date = new Date(dateParam);

  const row = await prisma.garminData.findUnique({
    where: { userId_dataType_date: { userId: user.id, dataType: "ACTIVITY", date } },
  });

  return NextResponse.json({ activeCalories: row?.summaryValue ?? null });
}
