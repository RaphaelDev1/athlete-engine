import { Gauge } from "lucide-react";
import { Card, CardHeader, CardTitle, Badge, EmptyState } from "@/components/ui";

interface TrainingLoadCardProps {
  acute: number;
  chronic: number;
  ratio: number | null;
}

function ratioBadge(ratio: number): "info" | "success" | "warning" | "danger" {
  if (ratio < 0.8) return "info";
  if (ratio <= 1.3) return "success";
  if (ratio <= 1.5) return "warning";
  return "danger";
}

function ratioLabel(ratio: number): string {
  if (ratio < 0.8) return "Sous-charge";
  if (ratio <= 1.3) return "Optimal";
  if (ratio <= 1.5) return "Élevé";
  return "Risque de surcharge";
}

export function TrainingLoadCard({ acute, chronic, ratio }: TrainingLoadCardProps) {
  return (
    <Card padding="lg">
      <CardHeader>
        <CardTitle>Charge d&apos;entraînement</CardTitle>
        <Gauge className="w-4 h-4 text-brand-500" />
      </CardHeader>

      {ratio === null ? (
        <EmptyState
          icon={Gauge}
          title="Pas encore assez de données"
          description="Termine quelques séances pour voir apparaître ton ratio de charge aiguë/chronique."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-surface-100 tabular-nums">
              {ratio.toFixed(2)}
            </span>
            <Badge variant={ratioBadge(ratio)}>{ratioLabel(ratio)}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-surface-500 uppercase tracking-wider mb-1">
                Aiguë (7j)
              </p>
              <p className="font-semibold text-surface-100 tabular-nums">{acute}</p>
            </div>
            <div>
              <p className="text-xs text-surface-500 uppercase tracking-wider mb-1">
                Chronique (28j)
              </p>
              <p className="font-semibold text-surface-100 tabular-nums">{chronic}</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
