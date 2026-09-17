import { z } from "zod";
import { WORK_CYCLE_LENGTH } from "@/lib/training/workSchedule";

const cycleDaySchema = z
  .object({
    isWorkDay: z.boolean(),
    // Minutes depuis minuit (0-1439) — null si repos. endMin < startMin est
    // valide (poste de nuit traversant minuit, ex. 22h→6h) : c'est une donnée
    // d'affichage/contexte, jamais utilisée pour un calcul de durée.
    startMin: z.number().int().min(0).max(1439).nullable(),
    endMin: z.number().int().min(0).max(1439).nullable(),
  })
  .refine((d) => !d.isWorkDay || (d.startMin !== null && d.endMin !== null), {
    message: "Un jour travaillé doit avoir une heure de début et de fin",
  });

export const workScheduleSchema = z.object({
  anchorDate: z.string(), // "YYYY-MM-DD" — date du jour 0 du cycle
  pattern: z.array(cycleDaySchema).length(WORK_CYCLE_LENGTH),
});

export type WorkScheduleFormValues = z.infer<typeof workScheduleSchema>;
