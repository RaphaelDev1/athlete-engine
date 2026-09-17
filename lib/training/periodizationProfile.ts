// Conversion AthleteProfile (Prisma) -> PeriodizationProfile (moteur de
// génération) — factorisé ici car consommé à la fois par la matérialisation
// du plan (lib/training/materialize.ts) et par l'API dashboard.

import { AthleteProfile, PersonalRecord } from "@prisma/client";
import { PeriodizationProfile } from "@/lib/engine/periodization";
import { STRENGTH_PR_FIELDS, latestRecord } from "@/lib/profile/records";

// Utilisé tant que le profil n'a pas été renseigné — reflète le point de
// départ réel (reprise après 6 mois d'arrêt, pas encore de PRs).
export const FALLBACK_PERIODIZATION_PROFILE: PeriodizationProfile = {
  weightKg: 58,
  experienceLevel: "INTERMEDIATE",
  weeklyVolume: 15,
  weeklyFrequency: 3,
  restingHR: null,
  maxHR: null,
  vo2max: null,
  thresholdPace: null,
  ftp: null,
  prSquat: null,
  prBench: null,
  prDeadlift: null,
  prOHP: null,
};

export function toPeriodizationProfile(
  profile: (AthleteProfile & { personalRecords: PersonalRecord[] }) | null
): PeriodizationProfile {
  if (!profile) return FALLBACK_PERIODIZATION_PROFILE;
  const pr = (exercise: string) =>
    latestRecord(profile.personalRecords, "STRENGTH", exercise)?.value ?? null;

  return {
    weightKg: profile.weight ?? FALLBACK_PERIODIZATION_PROFILE.weightKg,
    experienceLevel: profile.experienceLevel ?? FALLBACK_PERIODIZATION_PROFILE.experienceLevel,
    weeklyVolume: profile.weeklyVolume,
    weeklyFrequency: profile.weeklyFrequency ?? FALLBACK_PERIODIZATION_PROFILE.weeklyFrequency,
    restingHR: profile.restingHR,
    maxHR: profile.maxHR,
    vo2max: profile.vo2max,
    thresholdPace: profile.thresholdPace,
    ftp: profile.ftp,
    prSquat: pr(STRENGTH_PR_FIELDS.prSquat),
    prBench: pr(STRENGTH_PR_FIELDS.prBench),
    prDeadlift: pr(STRENGTH_PR_FIELDS.prDeadlift),
    prOHP: pr(STRENGTH_PR_FIELDS.prOHP),
  };
}
