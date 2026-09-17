"use client";

import { useState } from "react";
import { CalendarClock, TrendingDown, RefreshCw, Check, X, Ban } from "lucide-react";
import { Card, CardHeader, CardTitle, Button } from "@/components/ui";

export interface AdaptationActionView {
  type: "POSTPONE_SESSION" | "REDUCE_VOLUME" | "CANCEL_SESSION" | "RECALC_ZONES";
  reason: string;
  sessionId?: string;
  sessionTitle?: string;
  multiplier?: number;
}

const ACTION_ICON = {
  POSTPONE_SESSION: CalendarClock,
  REDUCE_VOLUME: TrendingDown,
  CANCEL_SESSION: Ban,
  RECALC_ZONES: RefreshCw,
} as const;

const ACTION_LABEL: Record<AdaptationActionView["type"], string> = {
  POSTPONE_SESSION: "Reporter la séance",
  REDUCE_VOLUME: "Alléger la séance",
  CANCEL_SESSION: "Annuler la séance — trop risqué",
  RECALC_ZONES: "Recalculer les zones",
};

interface AdaptationActionsCardProps {
  actions: AdaptationActionView[];
  onApplied: () => void;
}

export function AdaptationActionsCard({ actions, onApplied }: AdaptationActionsCardProps) {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState<number | null>(null);

  const visible = actions.filter((_, i) => !dismissed.has(i));
  if (visible.length === 0) return null;

  async function apply(action: AdaptationActionView, index: number) {
    setApplying(index);
    try {
      await fetch("/api/adaptation/apply-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: action.type,
          sessionId: action.sessionId,
          multiplier: action.multiplier,
        }),
      });
      setDismissed((prev) => new Set(prev).add(index));
      onApplied();
    } finally {
      setApplying(null);
    }
  }

  return (
    <Card padding="lg">
      <CardHeader>
        <CardTitle>Actions d&apos;adaptation proposées</CardTitle>
      </CardHeader>
      <div className="space-y-3">
        {actions.map((action, i) => {
          if (dismissed.has(i)) return null;
          const Icon = ACTION_ICON[action.type];
          return (
            <div
              key={i}
              className="flex items-start justify-between gap-4 p-3 rounded-lg bg-surface-850 border border-surface-700/50"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-brand-500/10 flex-shrink-0">
                  <Icon className="w-4 h-4 text-brand-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-surface-100">
                    {ACTION_LABEL[action.type]}
                    {action.sessionTitle ? ` — ${action.sessionTitle}` : ""}
                  </p>
                  <p className="text-xs text-surface-400 mt-0.5">{action.reason}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setDismissed((prev) => new Set(prev).add(i))}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  loading={applying === i}
                  onClick={() => apply(action, i)}
                >
                  <Check className="w-3.5 h-3.5" />
                  Appliquer
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
