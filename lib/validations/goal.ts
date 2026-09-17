import { z } from "zod";

export const goalSchema = z.object({
  type: z.enum(["RUNNING", "STRENGTH", "COMPOSITION", "MIXED", "FREE"]),
  title: z.string().min(3, "Minimum 3 caractères").max(100),
  description: z.string().max(500).default(""),
  targetValue: z.coerce.number().positive().nullable(),
  targetUnit: z.string().default(""),
  deadline: z.string().min(1, "Date requise"),
  priority: z.enum(["PRIMARY", "SECONDARY", "MAINTENANCE"]),
});

export type GoalFormValues = z.input<typeof goalSchema>;

export const defaultGoalValues: GoalFormValues = {
  type: "RUNNING",
  title: "",
  description: "",
  targetValue: null,
  targetUnit: "",
  deadline: "",
  priority: "SECONDARY",
};

export const goalTypeLabels: Record<string, { label: string; emoji: string }> = {
  RUNNING: { label: "Course", emoji: "🏃" },
  STRENGTH: { label: "Force", emoji: "🏋️" },
  COMPOSITION: { label: "Composition", emoji: "⚖️" },
  MIXED: { label: "Mixte", emoji: "🔄" },
  FREE: { label: "Libre", emoji: "🎯" },
};

export const goalPriorityLabels: Record<
  string,
  { label: string; variant: "brand" | "info" | "default" }
> = {
  PRIMARY: { label: "Principal", variant: "brand" },
  SECONDARY: { label: "Secondaire", variant: "info" },
  MAINTENANCE: { label: "Maintenance", variant: "default" },
};
