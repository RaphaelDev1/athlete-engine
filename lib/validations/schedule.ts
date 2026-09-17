import { z } from "zod";

export const scheduleSchema = z.object({
  goalType: z.enum(["RUNNING", "STRENGTH", "MIXED", "TRIATHLON"]),
  // Plafonné à 2 ans plutôt qu'illimité — le moteur (lib/engine/periodization.ts)
  // matérialise toutes les semaines à chaque appel, un plan sans borne
  // dégraderait les temps de réponse pour un bénéfice pratique nul.
  totalWeeks: z.coerce.number().int().min(4).max(104),
  startDate: z.string(),
  raceDate: z.string().nullable(),
  vacationMode: z.boolean(),
  // 0 = lundi ... 6 = dimanche — jours où l'athlète peut s'entraîner (Phase 1).
  availableDays: z.array(z.number().int().min(0).max(6)).min(1),
  weeklyTimeBudgetMin: z.coerce.number().int().positive().nullable(),
});

export type ScheduleFormValues = z.infer<typeof scheduleSchema>;
