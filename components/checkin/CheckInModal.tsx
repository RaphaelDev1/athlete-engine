"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { X, Save, Battery, Frown, Sparkles, Flame, Pizza } from "lucide-react";
import {
  checkInSchema,
  CheckInFormValues,
  defaultCheckInValues,
} from "@/lib/validations/checkin";
import { Button, Textarea, Input } from "@/components/ui";

interface CheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CheckInFormValues) => Promise<void>;
}

function ScaleField({
  label,
  icon: Icon,
  value,
  onChange,
}: {
  label: string;
  icon: typeof Battery;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-brand-500" />
        <span className="label !mb-0">{label}</span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`h-9 rounded-lg text-sm font-medium transition-colors ${
              value === n
                ? "bg-brand-500 text-white"
                : "bg-surface-850 text-surface-400 border border-surface-700 hover:border-surface-600"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CheckInModal({ isOpen, onClose, onSave }: CheckInModalProps) {
  const [saving, setSaving] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
  } = useForm<CheckInFormValues>({
    resolver: zodResolver(checkInSchema),
    defaultValues: defaultCheckInValues,
  });

  if (!isOpen) return null;

  const soreness = watch("soreness");
  const badEating = watch("badEating");

  const onSubmit = async (data: CheckInFormValues) => {
    setSaving(true);
    try {
      await onSave(data);
      reset(defaultCheckInValues);
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
          <h2 className="text-lg font-semibold text-surface-100">
            Check-in du jour
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
          <ScaleField
            label="Énergie"
            icon={Battery}
            value={watch("energy")}
            onChange={(v) => setValue("energy", v, { shouldDirty: true })}
          />
          <ScaleField
            label="Motivation"
            icon={Sparkles}
            value={watch("motivation")}
            onChange={(v) => setValue("motivation", v, { shouldDirty: true })}
          />
          <ScaleField
            label="Stress"
            icon={Flame}
            value={watch("stress")}
            onChange={(v) => setValue("stress", v, { shouldDirty: true })}
          />

          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Frown className="w-4 h-4 text-brand-500" />
                <span className="label !mb-0">Douleurs musculaires</span>
              </div>
              <button
                type="button"
                onClick={() => setValue("soreness", !soreness, { shouldDirty: true })}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  soreness ? "bg-brand-500" : "bg-surface-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    soreness ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
            {soreness && (
              <div className="mt-3">
                <Input
                  placeholder="Où ? (mollets, dos, épaules...)"
                  {...register("sorenessLocation")}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Pizza className="w-4 h-4 text-brand-500" />
              <span className="label !mb-0">Écart alimentaire (fast food...)</span>
            </div>
            <button
              type="button"
              onClick={() => setValue("badEating", !badEating, { shouldDirty: true })}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                badEating ? "bg-brand-500" : "bg-surface-700"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  badEating ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>

          <Textarea
            label="Notes (optionnel)"
            placeholder="Autre chose à noter ?"
            rows={2}
            {...register("notes")}
          />

          <div className="flex justify-end gap-3 pt-2 border-t border-surface-700">
            <Button variant="ghost" type="button" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={saving}>
              <Save className="w-4 h-4" />
              Valider
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
