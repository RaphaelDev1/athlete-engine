"use client";

import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui";
import { formatDuration } from "@/components/training/sessionMeta";
import { activityLabel, formatActivityPace } from "@/lib/training/activityDisplay";
import { HistoryDayActivity } from "@/app/api/history/route";

interface ActivityListItemProps {
  activity: HistoryDayActivity;
  onEdit?: (activity: HistoryDayActivity) => void;
}

// Rendu d'une activité réelle (Intervals.icu/Garmin) — partagé entre
// l'historique (app/history/page.tsx) et la vue "jour" de la nutrition
// (app/nutrition/page.tsx), pour ne pas dupliquer ce formatage.
export function ActivityListItem({ activity: a, onEdit }: ActivityListItemProps) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs bg-surface-900 rounded-lg px-3 py-2 border border-surface-800">
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <Badge variant="success">{activityLabel(a.sport, a.name)}</Badge>
        <div className="min-w-0">
          <span className="text-surface-200 truncate block">{a.name}</span>
          <span className="text-surface-500">
            {a.distanceMeters ? `${(a.distanceMeters / 1000).toFixed(1)} km` : "—"}
            {a.movingTimeSec ? ` · ${formatDuration(Math.round(a.movingTimeSec / 60))}` : ""}
            {a.avgPaceSecPerKm || a.avgSpeedKph ? ` · ${formatActivityPace(a)}` : ""}
          </span>
          {(a.avgHeartRate || a.avgPower || a.elevationGain || a.calories) && (
            <span className="text-surface-500 block mt-0.5">
              {a.avgHeartRate ? `❤ ${a.avgHeartRate} bpm moy.` : ""}
              {a.avgPower ? `${a.avgHeartRate ? " · " : ""}⚡ ${a.avgPower} W moy.` : ""}
              {a.elevationGain
                ? `${a.avgHeartRate || a.avgPower ? " · " : ""}⛰ ${Math.round(a.elevationGain)} m D+`
                : ""}
              {a.calories
                ? `${a.avgHeartRate || a.avgPower || a.elevationGain ? " · " : ""}🔥 ${a.calories} kcal`
                : ""}
            </span>
          )}
        </div>
      </div>
      {onEdit && (
        <button
          onClick={() => onEdit(a)}
          title="Modifier cette activité"
          className="p-1 rounded text-surface-500 hover:text-surface-100 hover:bg-surface-800 transition-colors flex-shrink-0"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
