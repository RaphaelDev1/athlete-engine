"use client";

import { Goal } from "@/lib/types";
import { Card, Badge } from "@/components/ui";
import { goalTypeLabels, goalPriorityLabels } from "@/lib/validations/goal";
import {
  Calendar,
  MoreVertical,
  Pencil,
  Trash2,
  CheckCircle2,
  Pause,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface GoalCardProps {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: Goal["status"]) => void;
}

export function GoalCard({
  goal,
  onEdit,
  onDelete,
  onStatusChange,
}: GoalCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const typeInfo = goalTypeLabels[goal.type] || {
    label: goal.type,
    emoji: "🎯",
  };
  const priorityInfo = goalPriorityLabels[goal.priority] || {
    label: goal.priority,
    variant: "default" as const,
  };

  const daysLeft = goal.deadline
    ? Math.ceil(
        (new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : null;

  const statusColors: Record<string, string> = {
    ACTIVE: "border-l-brand-500",
    COMPLETED: "border-l-success-500",
    PAUSED: "border-l-warning-500",
    CANCELLED: "border-l-surface-600",
  };

  return (
    <Card
      hover
      padding="none"
      className={`border-l-4 ${statusColors[goal.status] || "border-l-surface-600"}`}
    >
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-xl mt-0.5">{typeInfo.emoji}</span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-surface-100 truncate">
                {goal.title}
              </h3>
              {goal.description && (
                <p className="text-xs text-surface-400 mt-1 line-clamp-2">
                  {goal.description}
                </p>
              )}
            </div>
          </div>

          {/* Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1 rounded text-surface-500 hover:text-surface-300 hover:bg-surface-700 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-surface-800 border border-surface-700 rounded-lg shadow-xl z-10 py-1">
                <MenuItem
                  icon={Pencil}
                  label="Modifier"
                  onClick={() => {
                    onEdit(goal);
                    setMenuOpen(false);
                  }}
                />
                {goal.status === "ACTIVE" && (
                  <>
                    <MenuItem
                      icon={CheckCircle2}
                      label="Marquer terminé"
                      onClick={() => {
                        onStatusChange(goal.id, "COMPLETED");
                        setMenuOpen(false);
                      }}
                    />
                    <MenuItem
                      icon={Pause}
                      label="Mettre en pause"
                      onClick={() => {
                        onStatusChange(goal.id, "PAUSED");
                        setMenuOpen(false);
                      }}
                    />
                  </>
                )}
                {goal.status === "PAUSED" && (
                  <MenuItem
                    icon={CheckCircle2}
                    label="Reprendre"
                    onClick={() => {
                      onStatusChange(goal.id, "ACTIVE");
                      setMenuOpen(false);
                    }}
                  />
                )}
                <div className="border-t border-surface-700 my-1" />
                <MenuItem
                  icon={Trash2}
                  label="Supprimer"
                  danger
                  onClick={() => {
                    onDelete(goal.id);
                    setMenuOpen(false);
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <Badge variant={priorityInfo.variant}>{priorityInfo.label}</Badge>
          <Badge variant="default">{typeInfo.label}</Badge>
          {goal.targetValue && (
            <Badge variant="info">
              {goal.targetValue} {goal.targetUnit}
            </Badge>
          )}
          {daysLeft !== null && (
            <span className="flex items-center gap-1 text-xs text-surface-400">
              <Calendar className="w-3 h-3" />
              {daysLeft > 0
                ? `${daysLeft}j restants`
                : daysLeft === 0
                ? "Aujourd'hui"
                : `${Math.abs(daysLeft)}j dépassé`}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

function MenuItem({
  icon: Icon,
  label,
  danger = false,
  onClick,
}: {
  icon: typeof Pencil;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
        danger
          ? "text-danger-400 hover:bg-danger-500/10"
          : "text-surface-300 hover:bg-surface-700"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
