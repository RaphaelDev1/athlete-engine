"use client";

import { useState } from "react";
import { Scale, X, Save } from "lucide-react";
import { Card, Button, Input } from "@/components/ui";

interface WeighInPromptCardProps {
  /** Date de la dernière pesée connue — la carte s'affiche si absente ou > 7 jours. */
  lastWeightLogDate: string | null;
  onSaved: () => void;
}

const REMINDER_AFTER_DAYS = 7;

export function WeighInPromptCard({ lastWeightLogDate, onSaved }: WeighInPromptCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const [bodyFatPct, setBodyFatPct] = useState("");
  const [saving, setSaving] = useState(false);

  const daysSince = lastWeightLogDate
    ? Math.floor((Date.now() - new Date(lastWeightLogDate).getTime()) / 86400000)
    : null;
  const shouldPrompt = daysSince === null || daysSince >= REMINDER_AFTER_DAYS;

  if (!shouldPrompt) return null;

  async function submit() {
    if (!weight) return;
    setSaving(true);
    try {
      await fetch("/api/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weight: Number(weight),
          bodyFatPct: bodyFatPct ? Number(bodyFatPct) : null,
        }),
      });
      setModalOpen(false);
      setWeight("");
      setBodyFatPct("");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card padding="lg" className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-brand-500/10">
            <Scale className="w-5 h-5 text-brand-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-surface-100">
              {daysSince === null ? "Pas encore de pesée enregistrée" : "Pesée hebdomadaire à faire"}
            </p>
            <p className="text-xs text-surface-400 mt-0.5">
              {daysSince === null
                ? "Renseigne ton poids pour démarrer le suivi."
                : `Dernière pesée il y a ${daysSince} jours.`}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          Me peser
        </Button>
      </Card>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative bg-surface-900 border border-surface-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
              <h2 className="text-lg font-semibold text-surface-100">Pesée du jour</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <Input
                label="Poids"
                type="number"
                step="0.1"
                suffix="kg"
                autoFocus
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
              <Input
                label="Masse grasse (optionnel)"
                type="number"
                step="0.1"
                suffix="%"
                value={bodyFatPct}
                onChange={(e) => setBodyFatPct(e.target.value)}
              />
              <div className="flex justify-end gap-3 pt-2 border-t border-surface-700">
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  Annuler
                </Button>
                <Button loading={saving} disabled={!weight} onClick={submit}>
                  <Save className="w-4 h-4" />
                  Valider
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
