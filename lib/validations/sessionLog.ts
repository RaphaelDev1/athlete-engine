import { z } from "zod";

// Résultat chiffré d'une séance FITNESS_TEST (voir lib/profile/records.ts::TEST_RESULT_FIELDS
// pour la correspondance clé → discipline/exercice/unité) — toutes les clés
// sont optionnelles, seule celle du test concerné est envoyée.
export const testResultSchema = z
  .object({
    vmaLucLeger: z.coerce.number().positive(),
    prSquat: z.coerce.number().positive(),
    prBench: z.coerce.number().positive(),
    prDeadlift: z.coerce.number().positive(),
    prOHP: z.coerce.number().positive(),
    ftp: z.coerce.number().int().positive(),
    swim400m: z.coerce.number().positive(), // secondes
  })
  .partial();

// Formulaire "Marquer la séance" (SessionDetailModal, Phase 2) — RPE ressenti
// et durée réelle alimentent lib/engine/weekReview.ts pour la revue hebdo.
export const sessionLogSchema = z.object({
  status: z.enum(["COMPLETED", "PARTIAL", "SKIPPED"]),
  actualDuration: z.coerce.number().int().positive().nullable(),
  actualRPE: z.coerce.number().min(1).max(10).nullable(),
  notes: z.string().max(1000).nullable(),
  testResult: testResultSchema.nullable().optional(),
});

export type SessionLogFormValues = z.infer<typeof sessionLogSchema>;
