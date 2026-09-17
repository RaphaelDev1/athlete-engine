import { Card } from "./Card";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    positive: boolean;
  };
  className?: string;
}

export function StatCard({
  label,
  value,
  unit,
  icon: Icon,
  trend,
  className = "",
}: StatCardProps) {
  return (
    <Card hover className={className}>
      <div className="flex items-start justify-between">
        <div>
          <p className="stat-label">{label}</p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="stat-value">{value}</span>
            {unit && (
              <span className="text-sm text-surface-400">{unit}</span>
            )}
          </div>
          {trend && (
            <p
              className={`mt-1.5 text-xs font-medium ${
                trend.positive ? "text-success-400" : "text-danger-400"
              }`}
            >
              {trend.positive ? "+" : ""}
              {trend.value}%
            </p>
          )}
        </div>
        {Icon && (
          <div className="p-2.5 rounded-lg bg-brand-500/10">
            <Icon className="w-5 h-5 text-brand-500" />
          </div>
        )}
      </div>
    </Card>
  );
}
