"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { X, Save } from "lucide-react";
import {
  activityEditSchema,
  ActivityEditFormValues,
  ACTIVITY_EDIT_SPORTS,
} from "@/lib/validations/activity";
import { SPORT_LABEL } from "@/components/training/sessionMeta";
import { Button, Input, Select } from "@/components/ui";
import { HistoryDayActivity } from "@/app/api/history/route";

interface ActivityEditModalProps {
  activity: HistoryDayActivity | null;
  onClose: () => void;
  onSave: (id: string, data: ActivityEditFormValues) => Promise<void>;
}

const SPORT_OPTIONS = ACTIVITY_EDIT_SPORTS.map((value) => ({
  value,
  label: SPORT_LABEL[value],
}));

function toFormValues(activity: HistoryDayActivity): ActivityEditFormValues {
  return {
    sport: (ACTIVITY_EDIT_SPORTS as readonly string[]).includes(activity.sport)
      ? (activity.sport as ActivityEditFormValues["sport"])
      : "OTHER",
    name: activity.name,
    distanceKm: activity.distanceMeters !== null ? Math.round(activity.distanceMeters) / 1000 : null,
    durationMin: activity.movingTimeSec !== null ? Math.round(activity.movingTimeSec / 60) : null,
    avgHeartRate: activity.avgHeartRate,
    avgPower: activity.avgPower,
    elevationGain: activity.elevationGain,
    calories: activity.calories,
  };
}

export function ActivityEditModal({ activity, onClose, onSave }: ActivityEditModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset } = useForm<ActivityEditFormValues>({
    resolver: zodResolver(activityEditSchema),
  });

  // Repeuple le formulaire à chaque changement d'activité éditée — la modale
  // reste montée (pas de remount clé-par-id) pour garder l'animation d'ouverture.
  useEffect(() => {
    if (activity) {
      reset(toFormValues(activity));
      setError(null);
    }
  }, [activity, reset]);

  if (!activity) return null;

  const onSubmit = async (data: ActivityEditFormValues) => {
    setSaving(true);
    setError(null);
    try {
      await onSave(activity.id, data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "La mise à jour a échoué.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      <div className="relative bg-surface-900 border border-surface-700 rounded-xl w-full max-w-md mx-4 shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
          <h2 className="text-lg font-semibold text-surface-100">Modifier l&apos;activité</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <Select label="Sport" options={SPORT_OPTIONS} {...register("sport")} />
          <Input label="Nom" {...register("name")} />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Distance"
              type="number"
              step="0.01"
              min={0}
              suffix="km"
              {...register("distanceKm")}
            />
            <Input
              label="Durée"
              type="number"
              step="1"
              min={0}
              suffix="min"
              {...register("durationMin")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="FC moy."
              type="number"
              step="1"
              min={0}
              suffix="bpm"
              {...register("avgHeartRate")}
            />
            <Input
              label="Puissance"
              type="number"
              step="1"
              min={0}
              suffix="W"
              {...register("avgPower")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="D+"
              type="number"
              step="1"
              min={0}
              suffix="m"
              {...register("elevationGain")}
            />
            <Input
              label="Calories"
              type="number"
              step="1"
              min={0}
              suffix="kcal"
              {...register("calories")}
            />
          </div>

          <p className="text-xs text-surface-500">
            L&apos;allure ou la vitesse moyenne est recalculée automatiquement à partir de la
            distance et de la durée.
          </p>

          {error && (
            <p className="text-sm text-danger-400 bg-danger-500/10 border border-danger-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-surface-700">
            <Button variant="ghost" type="button" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={saving}>
              <Save className="w-4 h-4" />
              Enregistrer
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
