import { z } from "zod";
import { profileSchema } from "./profile";

// FC repos/max, VO2max et volume hebdo ne se saisissent plus ici : ils
// viennent de Garmin/des activités réelles dès la première synchronisation
// (lib/garmin/profileSync.ts, lib/training/volume.ts) — avant ça, le moteur
// démarre sur FALLBACK_PERIODIZATION_PROFILE (lib/training/periodizationProfile.ts).
export const onboardingSchema = profileSchema.pick({
  height: true,
  weight: true,
  dateOfBirth: true,
  sex: true,
  experienceLevel: true,
  weeklyFrequency: true,
  ftp: true,
});

export type OnboardingFormValues = z.infer<typeof onboardingSchema>;

export const defaultOnboardingValues: OnboardingFormValues = {
  height: null,
  weight: null,
  dateOfBirth: null,
  sex: null,
  experienceLevel: null,
  weeklyFrequency: null,
  ftp: null,
};

export type AthleteFocus = "RUNNING" | "STRENGTH" | "CYCLING" | "MIXED";
