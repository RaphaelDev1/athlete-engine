import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/garmin/user";
import { materializePlan } from "@/lib/training/materialize";

export const dynamic = "force-dynamic";

function daysBetween(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86400000);
}

// Lit le plan persisté (lib/training/materialize.ts) — plus aucune génération
// côté client depuis cette route : les séances ont un vrai id DB, modifiable
// via PATCH /api/training/sessions/[id].
export async function GET() {
  const user = await getDefaultUser();
  const { plan, generated } = await materializePlan(user.id);

  const weeks = await prisma.trainingWeek.findMany({
    where: { planId: plan.id },
    orderBy: { weekNumber: "asc" },
    include: {
      sessions: {
        orderBy: { scheduledDate: "asc" },
        include: { exercises: { orderBy: { orderIndex: "asc" } } },
      },
    },
  });

  // macroPhase/phase/plannedTests ne sont pas persistés (dérivables uniquement
  // de weekNumber + totalWeeks + goalType) — on les récupère depuis la
  // régénération pure faite par materializePlan, indexée par numéro de semaine.
  const metaByWeekNumber = new Map(generated.weeks.map((w) => [w.weekNumber, w]));

  return NextResponse.json({
    data: {
      plan: {
        id: plan.id,
        name: plan.name,
        startDate: plan.startDate,
        endDate: plan.endDate,
        totalWeeks: generated.totalWeeks,
        goalType: generated.goalType,
      },
      weeks: weeks.map((week) => {
        const meta = metaByWeekNumber.get(week.weekNumber);
        return {
          id: week.id,
          weekNumber: week.weekNumber,
          weekType: week.weekType,
          targetVolume: week.targetVolume,
          startDate: week.startDate,
          endDate: week.endDate,
          phase: meta?.phase ?? null,
          macroPhase: meta?.macroPhase ?? null,
          plannedTests: meta?.plannedTests ?? [],
          sessions: week.sessions.map((s) => ({
            id: s.id,
            sport: s.sport,
            sessionType: s.sessionType,
            title: s.title,
            description: s.description,
            scheduledDate: s.scheduledDate,
            dayOfWeek: daysBetween(week.startDate, s.scheduledDate),
            duration: s.duration,
            actualDuration: s.actualDuration,
            targetDistance: s.targetDistance,
            targetPace: s.targetPace,
            targetZone: s.targetZone,
            targetRPE: s.targetRPE,
            actualRPE: s.actualRPE,
            status: s.status,
            notes: s.notes,
            structure: (s.structure as string[] | null) ?? [],
            exercises: s.exercises.map((ex) => ({
              name: ex.name,
              sets: ex.sets,
              reps: ex.reps,
              targetRPE: ex.targetRPE,
              restSeconds: ex.restSeconds,
              notes: ex.notes,
            })),
          })),
        };
      }),
    },
  });
}
