"use client";

import { formatPace } from "@/lib/engine/zones";
import { Badge } from "@/components/ui";
import { formatDuration, SessionCardData, SPORT_COLOR, SPORT_ICON, STATUS_LABELS } from "./sessionMeta";

interface SessionCardProps<T extends SessionCardData> {
  session: T;
  onSelect: (session: T) => void;
  draggable?: boolean;
  onDragStart?: (session: T) => void;
  onDragEnd?: () => void;
}

export function SessionCard<T extends SessionCardData>({
  session,
  onSelect,
  draggable = false,
  onDragStart,
  onDragEnd,
}: SessionCardProps<T>) {
  const Icon = SPORT_ICON[session.sport];
  const isOffDay = session.sport === "REST";

  return (
    <button
      onClick={() => onSelect(session)}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.(session);
      }}
      onDragEnd={onDragEnd}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${
        isOffDay
          ? "border-surface-800 bg-surface-850/50 hover:bg-surface-850"
          : "border-surface-700 bg-surface-850 hover:bg-surface-800 hover:border-surface-600"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className={`p-1.5 rounded-md ${SPORT_COLOR[session.sport]}/15 flex-shrink-0`}>
          <Icon className="w-3.5 h-3.5 text-surface-100" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-surface-100 truncate">
              {session.title}
            </p>
            {session.status && session.status !== "PLANNED" && (
              <Badge variant={STATUS_LABELS[session.status]?.variant ?? "default"}>
                {STATUS_LABELS[session.status]?.label ?? session.status}
              </Badge>
            )}
          </div>
          <p className="text-xs text-surface-500 mt-0.5">
            {formatDuration(session.duration)}
            {session.targetDistance ? ` · ${session.targetDistance} km` : ""}
            {session.targetPace ? ` · ${formatPace(session.targetPace)}` : ""}
          </p>
        </div>
      </div>
    </button>
  );
}
