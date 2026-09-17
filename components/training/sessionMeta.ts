import {
  Bike,
  Dumbbell,
  Footprints,
  LucideIcon,
  Moon,
  Sparkles,
  Waves,
} from "lucide-react";
import { SessionStatus, SessionType, Sport } from "@/lib/types";

// Forme minimale partagée par SessionCard/SessionDetailModal — satisfaite à la
// fois par GeneratedSession (génération pure, encore utilisée par
// app/nutrition/page.tsx) et par les séances persistées lues depuis
// /api/training/plan (avec un vrai statut/id DB).
export interface SessionCardData {
  id: string;
  sport: Sport;
  sessionType: SessionType;
  title: string;
  dayOfWeek: number;
  scheduledDate: Date;
  description: string | null;
  duration: number | null;
  targetDistance: number | null;
  targetPace: number | null;
  targetZone: number | null;
  targetRPE: number | null;
  structure: string[];
  exercises: { name: string; sets: number | null; reps: string | null; notes: string | null }[] | null;
  status?: SessionStatus;
  actualRPE?: number | null;
  actualDuration?: number | null;
}

export const STATUS_LABELS: Record<
  string,
  { label: string; variant: "success" | "brand" | "warning" | "default" }
> = {
  COMPLETED: { label: "Fait", variant: "success" },
  PLANNED: { label: "Planifié", variant: "brand" },
  PARTIAL: { label: "Partiel", variant: "warning" },
  SKIPPED: { label: "Raté", variant: "default" },
  RESCHEDULED: { label: "Reporté", variant: "warning" },
};

export const SPORT_ICON: Record<Sport, LucideIcon> = {
  RUNNING: Footprints,
  STRENGTH: Dumbbell,
  CYCLING: Bike,
  SWIMMING: Waves,
  REST: Moon,
  MOBILITY: Sparkles,
};

export const SPORT_LABEL: Record<Sport, string> = {
  RUNNING: "Course",
  STRENGTH: "Musculation",
  CYCLING: "Vélo",
  SWIMMING: "Natation",
  REST: "Repos",
  MOBILITY: "Mobilité",
};

export const SPORT_COLOR: Record<Sport, string> = {
  RUNNING: "bg-brand-500",
  STRENGTH: "bg-info-500",
  CYCLING: "bg-success-500",
  SWIMMING: "bg-info-500",
  REST: "bg-surface-600",
  MOBILITY: "bg-warning-500",
};

export const DAY_LABELS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

export const WEEK_TYPE_LABELS: Record<string, { label: string; variant: "brand" | "warning" | "info" | "success" | "default" }> = {
  LOAD: { label: "Charge", variant: "brand" },
  DELOAD: { label: "Décharge", variant: "info" },
  TAPER: { label: "Affûtage", variant: "warning" },
  RECOVERY: { label: "Récupération", variant: "success" },
  TEST: { label: "Test", variant: "default" },
};

export const PHASE_LABELS: Record<string, string> = {
  HYPERTROPHY: "Hypertrophie",
  STRENGTH: "Force",
  PEAKING: "Peaking",
};

export const MACRO_PHASE_LABELS: Record<string, string> = {
  RECONDITIONING: "Reconditionnement",
  DEVELOPMENT: "Développement",
  INTENSIFICATION: "Intensification",
  PEAKING: "Peaking",
};

export function formatDuration(minutes: number | null): string {
  if (!minutes) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, "0")}`;
}
