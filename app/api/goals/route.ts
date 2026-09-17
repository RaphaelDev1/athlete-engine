import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/garmin/user";
import { goalSchema } from "@/lib/validations/goal";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getDefaultUser();
  const goals = await prisma.goal.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data: goals });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = goalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const user = await getDefaultUser();
    const goal = await prisma.goal.create({
      data: {
        userId: user.id,
        type: parsed.data.type,
        title: parsed.data.title,
        description: parsed.data.description || null,
        targetValue: parsed.data.targetValue,
        targetUnit: parsed.data.targetUnit || null,
        deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
        priority: parsed.data.priority,
      },
    });

    return NextResponse.json({ data: goal }, { status: 201 });
  } catch (err) {
    console.error("Erreur création objectif:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
