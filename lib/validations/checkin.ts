import { z } from "zod";

export const checkInSchema = z.object({
  energy: z.coerce.number().int().min(1).max(5),
  soreness: z.boolean().default(false),
  sorenessLocation: z.string().max(200).nullable().default(null),
  motivation: z.coerce.number().int().min(1).max(5),
  stress: z.coerce.number().int().min(1).max(5),
  badEating: z.boolean().default(false),
  notes: z.string().max(500).nullable().default(null),
});

export type CheckInFormValues = z.input<typeof checkInSchema>;

export const defaultCheckInValues: CheckInFormValues = {
  energy: 3,
  soreness: false,
  sorenessLocation: null,
  motivation: 3,
  stress: 3,
  badEating: false,
  notes: null,
};
