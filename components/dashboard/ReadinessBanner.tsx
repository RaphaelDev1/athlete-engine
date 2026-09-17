import { Zap } from "lucide-react";
import { Card, Badge } from "@/components/ui";
import { AthleteState, STATE_BADGE, STATE_LABEL } from "@/lib/engine/labels";

interface ReadinessBannerProps {
  athleteState: AthleteState;
  loadMultiplier: number;
  reasons: string[];
}

export function ReadinessBanner({
  athleteState,
  loadMultiplier,
  reasons,
}: ReadinessBannerProps) {
  return (
    <Card padding="lg">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wide text-surface-500 mb-1.5 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-brand-500" />
            État du jour
          </p>
          <div className="flex items-center gap-2">
            <Badge variant={STATE_BADGE[athleteState]}>
              {STATE_LABEL[athleteState]}
            </Badge>
            <span className="text-xs text-surface-500">
              charge suggérée × {loadMultiplier}
            </span>
          </div>
        </div>
      </div>
      {reasons.length > 0 && (
        <ul className="mt-3 space-y-1">
          {reasons.map((reason) => (
            <li key={reason} className="text-xs text-surface-400">
              · {reason}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
