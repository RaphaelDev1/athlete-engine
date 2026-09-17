import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/garmin/user";
import { checkInSchema } from "@/lib/validations/checkin";

export const dynamic = "force-dynamic";

const HISTORY_DAYS = 30;

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET() {
  const user = await getDefaultUser();
  const since = new Date();
  since.setDate(since.getDate() - HISTORY_DAYS);

  const [checkInToday, history] = await Promise.all([
    prisma.dailyCheckIn.findUnique({
      where: { userId_date: { userId: user.id, date: today() } },
    }),
    prisma.dailyCheckIn.findMany({
      where: { userId: user.id, date: { gte: since } },
      orderBy: { date: "asc" },
    }),
  ]);

  return NextResponse.json({ data: checkInToday, history });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = checkInSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const user = await getDefaultUser();
    const data = parsed.data;

    const checkIn = await prisma.dailyCheckIn.upsert({
      where: { userId_date: { userId: user.id, date: today() } },
      update: {
        energy: data.energy,
        soreness: data.soreness,
        sorenessLocation: data.sorenessLocation,
        motivation: data.motivation,
        stress: data.stress,
        badEating: data.badEating,
        notes: data.notes,
      },
      create: {
        userId: user.id,
        date: today(),
        energy: data.energy,
        soreness: data.soreness,
        sorenessLocation: data.sorenessLocation,
        motivation: data.motivation,
        stress: data.stress,
        badEating: data.badEating,
        notes: data.notes,
      },
    });

    return NextResponse.json({ data: checkIn }, { status: 201 });
  } catch (err) {
    console.error("Erreur enregistrement check-in:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
