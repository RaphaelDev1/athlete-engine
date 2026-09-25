import { z } from "zod";

// Sports assignables à la main sur une Activity — sous-ensemble de Sport
// (lib/types/index.ts) qui exclut REST/MOBILITY, propres au plan d'entraînement.
export const ACTIVITY_EDIT_SPORTS = ["RUNNING", "CYCLING", "SWIMMING", "STRENGTH", "OTHER"] as const;

// Champ numérique optionnel — un champ vidé dans le formulaire (input number
// vide, valeur "") doit redevenir `null`, pas `0` (z.coerce.number() ferait
// Number("") === 0 sinon).
function optionalNumber(max: number, { int = false } = {}) {
  const base = int ? z.coerce.number().int() : z.coerce.number();
  return z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? null : val),
    base.min(0).max(max).nullable()
  ).default(null);
}

export const activityEditSchema = z.object({
  sport: z.enum(ACTIVITY_EDIT_SPORTS),
  name: z.string().trim().min(1).max(200),
  distanceKm: optionalNumber(1000),
  durationMin: optionalNumber(1440),
  avgHeartRate: optionalNumber(250, { int: true }),
  avgPower: optionalNumber(3000, { int: true }),
  elevationGain: optionalNumber(20000),
  calories: optionalNumber(10000, { int: true }),
});

export type ActivityEditFormValues = z.input<typeof activityEditSchema>;
