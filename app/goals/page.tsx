"use client";

import { useEffect, useState } from "react";
import { Goal } from "@/lib/types";
import { GoalFormValues } from "@/lib/validations/goal";
import { GoalModal } from "@/components/goals/GoalModal";
import { GoalCard } from "@/components/goals/GoalCard";
import { Button, EmptyState } from "@/components/ui";
import { Plus, Target } from "lucide-react";

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "completed" | "paused">(
    "all"
  );

  async function loadGoals() {
    setLoading(true);
    const res = await fetch("/api/goals");
    const { data } = await res.json();
    setGoals(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadGoals();
  }, []);

  const filteredGoals = goals.filter((g) => {
    if (filter === "all") return true;
    return g.status === filter.toUpperCase();
  });

  const handleSave = async (data: GoalFormValues) => {
    setSaving(true);
    try {
      if (editingGoal) {
        await fetch(`/api/goals/${editingGoal.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } else {
        await fetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      }
      await loadGoals();
      setModalOpen(false);
      setEditingGoal(null);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
    await fetch(`/api/goals/${id}`, { method: "DELETE" });
  };

  const handleStatusChange = async (id: string, status: Goal["status"]) => {
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, status, updatedAt: new Date() } : g))
    );
    await fetch(`/api/goals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  };

  const activeCount = goals.filter((g) => g.status === "ACTIVE").length;
  const completedCount = goals.filter((g) => g.status === "COMPLETED").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-100">Objectifs</h1>
          <p className="text-sm text-surface-400 mt-1">
            {activeCount} actif{activeCount > 1 ? "s" : ""} · {completedCount}{" "}
            terminé{completedCount > 1 ? "s" : ""}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingGoal(null);
            setModalOpen(true);
          }}
        >
          <Plus className="w-4 h-4" />
          Nouvel objectif
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-surface-800 rounded-lg p-1 w-fit">
        {(
          [
            { key: "all", label: "Tous" },
            { key: "active", label: "Actifs" },
            { key: "completed", label: "Terminés" },
            { key: "paused", label: "En pause" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === tab.key
                ? "bg-surface-700 text-surface-100"
                : "text-surface-400 hover:text-surface-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Goals list */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-32 rounded-xl bg-surface-800/60 animate-pulse"
            />
          ))}
        </div>
      ) : filteredGoals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Aucun objectif"
          description={
            filter === "all"
              ? "Définis ton premier objectif pour que le moteur puisse construire ton plan."
              : `Aucun objectif ${filter === "active" ? "actif" : filter === "completed" ? "terminé" : "en pause"}.`
          }
          action={
            filter === "all" ? (
              <Button
                onClick={() => {
                  setEditingGoal(null);
                  setModalOpen(true);
                }}
              >
                <Plus className="w-4 h-4" />
                Créer un objectif
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      <GoalModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingGoal(null);
        }}
        onSave={handleSave}
        goal={editingGoal}
        loading={saving}
      />
    </div>
  );
}
