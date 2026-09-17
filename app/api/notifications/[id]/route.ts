import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const notification = await prisma.notification.update({
      where: { id: params.id },
      data: { read: true },
    });
    return NextResponse.json({ data: notification });
  } catch (err) {
    console.error("Erreur marquage notification:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
