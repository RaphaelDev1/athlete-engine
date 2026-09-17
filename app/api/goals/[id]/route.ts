import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { goalSchema } from "@/lib/validations/goal";

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const parsed = goalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const goal = await prisma.goal.update({
      where: { id: params.id },
      data: {
        type: parsed.data.type,
        title: parsed.data.title,
        description: parsed.data.description || null,
        targetValue: parsed.data.targetValue,
        targetUnit: parsed.data.targetUnit || null,
        deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
        priority: parsed.data.priority,
      },
    });

    return NextResponse.json({ data: goal });
  } catch (err) {
    console.error("Erreur mise à jour objectif:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const status = body?.status;
    if (!["ACTIVE", "COMPLETED", "PAUSED", "CANCELLED"].includes(status)) {
      return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
    }

    const goal = await prisma.goal.update({
      where: { id: params.id },
      data: { status },
    });

    return NextResponse.json({ data: goal });
  } catch (err) {
    console.error("Erreur changement de statut:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.goal.delete({ where: { id: params.id } });
    return NextResponse.json({ message: `Objectif ${params.id} supprimé` });
  } catch (err) {
    console.error("Erreur suppression objectif:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
