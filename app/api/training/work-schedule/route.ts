import { NextResponse } from "next/server";
import { getDefaultUser } from "@/lib/garmin/user";
import { getWorkSchedule, saveWorkSchedule, WORK_CYCLE_LENGTH } from "@/lib/training/workSchedule";
import { materializePlan } from "@/lib/training/materialize";
import { workScheduleSchema } from "@/lib/validations/workSchedule";

export const dynamic = "force-dynamic";

function defaultPattern() {
  return Array.from({ length: WORK_CYCLE_LENGTH }, () => ({
    isWorkDay: false,
    startMin: null,
    endMin: null,
  }));
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET() {
  const user = await getDefaultUser();
  const schedule = await getWorkSchedule(user.id);
  if (!schedule) {
    return NextResponse.json({ data: { anchorDate: todayKey(), pattern: defaultPattern() } });
  }
  return NextResponse.json({
    data: {
      anchorDate: schedule.anchorDate.toISOString().split("T")[0],
      pattern: schedule.pattern,
    },
  });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const parsed = workScheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const user = await getDefaultUser();
    const saved = await saveWorkSchedule(user.id, {
      anchorDate: new Date(`${parsed.data.anchorDate}T00:00:00Z`),
      pattern: parsed.data.pattern,
    });

    await materializePlan(user.id);

    return NextResponse.json({
      data: { anchorDate: saved.anchorDate.toISOString().split("T")[0], pattern: saved.pattern },
    });
  } catch (err) {
    console.error("Erreur sauvegarde cycle de travail:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
