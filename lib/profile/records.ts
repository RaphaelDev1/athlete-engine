import { Discipline, PersonalRecord } from "@prisma/client";

// Noms d'exercice canoniques stockés dans PersonalRecord.exercise — partagés
// entre la sauvegarde du profil (app/api/profile/route.ts) et tout ce qui a
// besoin des 1RM/PRs pour construire un plan (app/api/dashboard/route.ts).
export const RUNNING_PR_FIELDS = {
  pr5k: "5K",
  pr10k: "10K",
  prHalf: "Semi-marathon",
  prMarathon: "Marathon",
} as const;

export const STRENGTH_PR_FIELDS = {
  prSquat: "Squat",
  prBench: "Bench Press",
  prDeadlift: "Deadlift",
  prOHP: "OHP",
} as const;

export const SWIMMING_PR_FIELDS = {
  pr400mSwim: "400m",
} as const;

export const CYCLING_PR_FIELDS = {
  ftp: "FTP",
} as const;

// Résultats des séances FITNESS_TEST (lib/engine/templates/{running,strength,cycling,swimming}.ts)
// — saisis depuis SessionDetailModal et enregistrés comme PersonalRecord au
// même titre que les PR du profil, pour tracer l'évolution dans le temps
// (app/api/training/sessions/[id]/route.ts).
export interface TestResultField {
  discipline: Discipline;
  exercise: string;
  unit: string;
}

export const TEST_RESULT_FIELDS: Record<string, TestResultField> = {
  vmaLucLeger: { discipline: "RUNNING", exercise: "VMA (Luc Léger)", unit: "km/h" },
  prSquat: { discipline: "STRENGTH", exercise: STRENGTH_PR_FIELDS.prSquat, unit: "kg" },
  prBench: { discipline: "STRENGTH", exercise: STRENGTH_PR_FIELDS.prBench, unit: "kg" },
  prDeadlift: { discipline: "STRENGTH", exercise: STRENGTH_PR_FIELDS.prDeadlift, unit: "kg" },
  prOHP: { discipline: "STRENGTH", exercise: STRENGTH_PR_FIELDS.prOHP, unit: "kg" },
  ftp: { discipline: "CYCLING", exercise: "FTP", unit: "watts" },
  swim400m: { discipline: "SWIMMING", exercise: SWIMMING_PR_FIELDS.pr400mSwim, unit: "seconds" },
};

export function latestRecord(
  records: PersonalRecord[],
  discipline: Discipline,
  exercise: string
): PersonalRecord | null {
  const matching = records
    .filter((r) => r.discipline === discipline && r.exercise === exercise)
    .sort(
      (a, b) =>
        (a.achievedAt ?? a.createdAt).getTime() - (b.achievedAt ?? b.createdAt).getTime()
    );
  return matching[matching.length - 1] ?? null;
}
