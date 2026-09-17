"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  goalSchema,
  GoalFormValues,
  defaultGoalValues,
} from "@/lib/validations/goal";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { X, Save } from "lucide-react";
import { Goal } from "@/lib/types";
import { useEffect } from "react";

interface GoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: GoalFormValues) => Promise<void>;
  goal?: Goal | null;
  loading?: boolean;
}

export function GoalModal({
  isOpen,
  onClose,
  onSave,
  goal,
  loading = false,
}: GoalModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GoalFormValues>({
    resolver: zodResolver(goalSchema),
    defaultValues: defaultGoalValues,
  });

  useEffect(() => {
    if (goal) {
      reset({
        type: goal.type,
        title: goal.title,
        description: goal.description || "",
        targetValue: goal.targetValue,
        targetUnit: goal.targetUnit || "",
        deadline: goal.deadline
          ? new Date(goal.deadline).toISOString().split("T")[0]
          : "",
        priority: goal.priority,
      });
    } else {
      reset(defaultGoalValues);
    }
  }, [goal, reset]);

  if (!isOpen) return null;

  const onSubmit = async (data: GoalFormValues) => {
    await onSave(data);
    reset(defaultGoalValues);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-surface-900 border border-surface-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
          <h2 className="text-lg font-semibold text-surface-100">
            {goal ? "Modifier l'objectif" : "Nouvel objectif"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Type"
              options={[
                { value: "RUNNING", label: "🏃 Course" },
                { value: "STRENGTH", label: "🏋️ Force" },
                { value: "COMPOSITION", label: "⚖️ Composition" },
                { value: "MIXED", label: "🔄 Mixte" },
                { value: "FREE", label: "🎯 Libre" },
              ]}
              error={errors.type?.message}
              {...register("type")}
            />
            <Select
              label="Priorité"
              options={[
                { value: "PRIMARY", label: "Principal" },
                { value: "SECONDARY", label: "Secondaire" },
                { value: "MAINTENANCE", label: "Maintenance" },
              ]}
              error={errors.priority?.message}
              {...register("priority")}
            />
          </div>

          <Input
            label="Titre"
            placeholder="Courir un semi en 1h30"
            error={errors.title?.message}
            {...register("title")}
          />

          <Textarea
            label="Description"
            placeholder="Détails de l'objectif..."
            rows={2}
            error={errors.description?.message}
            {...register("description")}
          />

          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Valeur cible"
              type="number"
              step="0.1"
              placeholder="90"
              error={errors.targetValue?.message}
              {...register("targetValue")}
            />
            <Input
              label="Unité"
              placeholder="min, kg, km..."
              error={errors.targetUnit?.message}
              {...register("targetUnit")}
            />
            <Input
              label="Échéance"
              type="date"
              error={errors.deadline?.message}
              {...register("deadline")}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-surface-700">
            <Button variant="ghost" type="button" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={loading}>
              <Save className="w-4 h-4" />
              {goal ? "Mettre à jour" : "Créer"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
