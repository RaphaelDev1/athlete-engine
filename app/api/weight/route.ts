import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/garmin/user";

export const dynamic = "force-dynamic";

const weightSchema = z.object({
  weight: z.coerce.number().positive(),
  bodyFatPct: z.coerce.number().positive().nullable().optional(),
});

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Pesée rapide depuis la carte de rappel hebdo du Dashboard (Phase 5) — même
// upsert WeightLog + AthleteProfile.weight que app/api/profile/route.ts, mais
// sans repasser par tout le formulaire profil.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = weightSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const user = await getDefaultUser();
    const { weight, bodyFatPct } = parsed.data;
    const date = today();

    const [weightLog] = await Promise.all([
      prisma.weightLog.upsert({
        where: { userId_date: { userId: user.id, date } },
        update: { weight, bodyFatPct: bodyFatPct ?? undefined },
        create: { userId: user.id, date, weight, bodyFatPct: bodyFatPct ?? null },
      }),
      prisma.athleteProfile.upsert({
        where: { userId: user.id },
        update: { weight, bodyFatPct: bodyFatPct ?? undefined },
        create: { userId: user.id, weight, bodyFatPct: bodyFatPct ?? null },
      }),
    ]);

    return NextResponse.json({ data: weightLog }, { status: 201 });
  } catch (err) {
    console.error("Erreur enregistrement pesée:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
