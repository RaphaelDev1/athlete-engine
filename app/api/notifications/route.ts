import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/garmin/user";

export const dynamic = "force-dynamic";

const LIMIT = 20;

export async function GET() {
  const user = await getDefaultUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: [{ read: "asc" }, { createdAt: "desc" }],
    take: LIMIT,
  });
  const unreadCount = await prisma.notification.count({
    where: { userId: user.id, read: false },
  });

  return NextResponse.json({ data: notifications, unreadCount });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body?.all !== true) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const user = await getDefaultUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });

  return NextResponse.json({ ok: true });
}
