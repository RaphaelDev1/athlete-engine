import { ClipboardCheck, Battery, Sparkles, Flame, Frown, Pizza } from "lucide-react";
import { Card, Button } from "@/components/ui";

interface CheckIn {
  energy: number;
  motivation: number;
  stress: number;
  soreness: boolean;
  badEating: boolean;
}

interface CheckInPromptCardProps {
  checkIn: CheckIn | null;
  onOpen: () => void;
}

export function CheckInPromptCard({ checkIn, onOpen }: CheckInPromptCardProps) {
  if (!checkIn) {
    return (
      <Card padding="lg" className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-brand-500/10">
            <ClipboardCheck className="w-5 h-5 text-brand-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-surface-100">
              Check-in du jour pas encore rempli
            </p>
            <p className="text-xs text-surface-400 mt-0.5">
              Énergie, douleurs, motivation, stress — 30 secondes.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={onOpen}>
          Faire le check-in
        </Button>
      </Card>
    );
  }

  return (
    <Card padding="lg">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-5 flex-wrap">
          <MiniStat icon={Battery} label="Énergie" value={`${checkIn.energy}/5`} />
          <MiniStat icon={Sparkles} label="Motivation" value={`${checkIn.motivation}/5`} />
          <MiniStat icon={Flame} label="Stress" value={`${checkIn.stress}/5`} />
          <MiniStat
            icon={Frown}
            label="Douleurs"
            value={checkIn.soreness ? "Oui" : "Non"}
          />
          <MiniStat
            icon={Pizza}
            label="Écart alim."
            value={checkIn.badEating ? "Oui" : "Non"}
          />
        </div>
        <Button size="sm" variant="ghost" onClick={onOpen}>
          Modifier
        </Button>
      </div>
    </Card>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Battery;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-surface-500" />
      <div>
        <p className="text-[11px] text-surface-500 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium text-surface-200">{value}</p>
      </div>
    </div>
  );
}
