import { z } from "zod";

// FC repos, FC max, VO2max, allure seuil et volume hebdo course ne sont plus
// saisissables à la main : ils viennent exclusivement de Garmin (sync) et des
// activités réelles synchronisées (lib/garmin/profileSync.ts,
// lib/training/volume.ts) — voir GarminDerivedMetrics dans app/api/profile/route.ts
// pour leur exposition en lecture seule.
export const profileSchema = z.object({
  // Biométrie
  height: z.coerce.number().min(100).max(250).nullable(),
  weight: z.coerce.number().min(30).max(200).nullable(),
  dateOfBirth: z.string().nullable(),
  sex: z.enum(["MALE", "FEMALE"]).nullable(),
  bodyFatPct: z.coerce.number().min(3).max(60).nullable(),

  // Objectif de poids — maintien, perte (déficit) ou prise (surplus).
  weightGoalDirection: z.enum(["DEFICIT", "MAINTENANCE", "SURPLUS"]),

  // Musculation
  experienceLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).nullable(),
  weeklyFrequency: z.coerce.number().int().min(1).max(7).nullable(),

  // PRs course (format "HH:MM:SS" ou "MM:SS")
  pr5k: z.string().nullable(),
  pr10k: z.string().nullable(),
  prHalf: z.string().nullable(),
  prMarathon: z.string().nullable(),

  // PRs muscu (kg)
  prSquat: z.coerce.number().min(0).max(500).nullable(),
  prBench: z.coerce.number().min(0).max(400).nullable(),
  prDeadlift: z.coerce.number().min(0).max(500).nullable(),
  prOHP: z.coerce.number().min(0).max(200).nullable(),

  // Vélo
  ftp: z.coerce.number().int().min(50).max(500).nullable(),
  wattsPerKg: z.coerce.number().min(0.5).max(8).nullable(),
  preferredCadence: z.coerce.number().int().min(50).max(130).nullable(),

  // Natation
  swimPace100m: z.string().nullable(), // "MM:SS"
  weeklySwimVolume: z.coerce.number().min(0).max(50).nullable(),
  pr400mSwim: z.string().nullable(), // "MM:SS"
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

export const defaultProfileValues: ProfileFormValues = {
  height: null,
  weight: null,
  dateOfBirth: null,
  sex: null,
  bodyFatPct: null,
  weightGoalDirection: "MAINTENANCE",
  experienceLevel: null,
  weeklyFrequency: null,
  pr5k: null,
  pr10k: null,
  prHalf: null,
  prMarathon: null,
  prSquat: null,
  prBench: null,
  prDeadlift: null,
  prOHP: null,
  ftp: null,
  wattsPerKg: null,
  preferredCadence: null,
  swimPace100m: null,
  weeklySwimVolume: null,
  pr400mSwim: null,
};
