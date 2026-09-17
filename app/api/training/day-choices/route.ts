import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/garmin/user";
import { resolveDayAvailability, toDbDateOnly } from "@/lib/training/schedule";
import { materializePlan } from "@/lib/training/materialize";
import { localDateKey } from "@/lib/training/dayPlanner";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 14;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function buildAvailabilityResponse(userId: string, windowStart?: string | null) {
  // Fenêtre navigable : par défaut les 14 prochains jours, mais l'athlète peut
  // avancer (ou reculer) le point de départ pour planifier ses jours dispo
  // aussi loin à l'avance qu'il le souhaite — cf. le sélecteur +/- 14 jours de
  // app/training/page.tsx.
  const requestedStart = windowStart ? startOfDay(new Date(`${windowStart}T00:00:00`)) : null;
  const start = requestedStart ?? startOfDay(new Date());
  const end = addDays(start, WINDOW_DAYS - 1);

  const [availability, choices] = await Promise.all([
    resolveDayAvailability(userId, start, end),
    prisma.scheduleDayChoice.findMany({
      where: { userId, date: { gte: toDbDateOnly(start), lte: toDbDateOnly(end) } },
    }),
  ]);

  const overrideKeys = new Set(choices.map((c) => localDateKey(c.date)));

  return availability.map((a) => ({
    date: localDateKey(a.date),
    available: a.available,
    isOverride: overrideKeys.has(localDateKey(a.date)),
  }));
}

// Calendrier 2 semaines de /training (lib/training/dayPlanner.ts) : GET
// renvoie la disponibilité résolue jour par jour (surcharge explicite ou
// pattern hebdo par défaut), PUT pose/retire une surcharge pour une date.
export async function GET(request: NextRequest) {
  const user = await getDefaultUser();
  const start = request.nextUrl.searchParams.get("start");
  return NextResponse.json({ data: await buildAvailabilityResponse(user.id, start) });
}

const dayChoiceSchema = z.object({
  date: z.string(), // "YYYY-MM-DD"
  available: z.boolean().nullable(), // null = retire la surcharge (revient au pattern hebdo)
});

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = dayChoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { date, available } = parsed.data;
    const user = await getDefaultUser();
    const day = toDbDateOnly(startOfDay(new Date(date)));

    if (available === null) {
      await prisma.scheduleDayChoice.deleteMany({ where: { userId: user.id, date: day } });
    } else {
      await prisma.scheduleDayChoice.upsert({
        where: { userId_date: { userId: user.id, date: day } },
        update: { available },
        create: { userId: user.id, date: day, available },
      });
    }

    await materializePlan(user.id);

    const start = request.nextUrl.searchParams.get("start");
    return NextResponse.json({ data: await buildAvailabilityResponse(user.id, start) });
  } catch (err) {
    console.error("Erreur sauvegarde jour dispo:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
