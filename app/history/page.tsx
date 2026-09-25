"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, History as HistoryIcon, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle, Badge, Select, Input, EmptyState, Button } from "@/components/ui";
import { SPORT_LABEL, STATUS_LABELS, formatDuration } from "@/components/training/sessionMeta";
import { HistoryDay, HistoryDayActivity, HistoryDaySession } from "@/app/api/history/route";
import { ActivityEditModal } from "@/components/history/ActivityEditModal";
import { ActivityListItem } from "@/components/history/ActivityListItem";
import { ActivityEditFormValues } from "@/lib/validations/activity";
import { activityLabel, byCategory } from "@/lib/training/activityDisplay";

interface IntervalsStatus {
  configured: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

const SPORT_FILTER_OPTIONS = [
  { value: "", label: "Tous les sports" },
  { value: "RUNNING", label: "Course" },
  { value: "CYCLING", label: "Vélo" },
  { value: "SWIMMING", label: "Natation" },
  { value: "STRENGTH", label: "Musculation" },
  { value: "OTHER", label: "Autre" },
];

function toInputDate(dateKey: string): string {
  return dateKey;
}

function daysSince(dateKey: string): number {
  const from = new Date(`${dateKey}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((today.getTime() - from.getTime()) / 86400000) + 1);
}

function defaultSyncSince(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export default function HistoryPage() {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [sport, setSport] = useState<string>("");
  const [days, setDays] = useState<HistoryDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [intervalsStatus, setIntervalsStatus] = useState<IntervalsStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  // Import historique : par défaut les 30 derniers jours (cf.
  // app/api/intervals/sync/route.ts), mais l'athlète peut reculer cette date
  // pour rapatrier des mois plus anciens (ex. reprise après une longue coupure).
  const [syncSince, setSyncSince] = useState<string>(defaultSyncSince());
  const [editingActivity, setEditingActivity] = useState<HistoryDayActivity | null>(null);

  async function load(params?: { from?: string; to?: string; sport?: string }) {
    setLoading(true);
    const search = new URLSearchParams();
    if (params?.from) search.set("from", params.from);
    if (params?.to) search.set("to", params.to);
    if (params?.sport) search.set("sport", params.sport);
    const res = await fetch(`/api/history?${search.toString()}`);
    const { data } = await res.json();
    setDays(data.days);
    setFrom(data.from);
    setTo(data.to);
    setLoading(false);
  }

  async function loadIntervalsStatus() {
    const res = await fetch("/api/intervals/status");
    setIntervalsStatus(await res.json());
  }

  useEffect(() => {
    load();
    loadIntervalsStatus();
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    const res = await fetch(`/api/intervals/sync?days=${daysSince(syncSince)}`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setSyncError(body?.error ?? "La synchronisation a échoué.");
    }
    await Promise.all([load({ from, to, sport }), loadIntervalsStatus()]);
    setSyncing(false);
  }

  async function handleSaveActivity(id: string, data: ActivityEditFormValues) {
    const res = await fetch(`/api/activities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? "La mise à jour a échoué.");
    }
    await load({ from, to, sport });
  }

  function applyFilters(nextFrom: string, nextTo: string, nextSport: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    setSport(nextSport);
    load({ from: nextFrom, to: nextTo, sport: nextSport });
  }

  const toggle = (date: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const daysWithData = useMemo(
    () =>
      days.filter(
        (d) =>
          d.sessions.length > 0 ||
          d.activities.length > 0 ||
          d.nutrition ||
          d.weight !== null ||
          d.checkIn ||
          d.sleepScore !== null
      ),
    [days]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-surface-100">Historique</h1>
          <p className="text-sm text-surface-400 mt-1">
            Entraînement, nutrition et récupération, jour par jour — prévu (plan) vs réalisé
            (Intervals.icu)
          </p>
        </div>
        {intervalsStatus?.configured && (
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={syncSince}
                onChange={(e) => setSyncSince(e.target.value)}
                title="Importer les activités Intervals.icu depuis cette date — recule-la pour rapatrier une reprise après une longue coupure (ex. janvier/février)."
                className="px-2 py-1.5 rounded-lg text-xs bg-surface-850 border border-surface-700 text-surface-200"
              />
              <Button variant="secondary" size="sm" onClick={handleSync} disabled={syncing}>
                <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                Synchroniser depuis cette date
              </Button>
            </div>
            {intervalsStatus.lastSyncAt && (
              <span className="text-xs text-surface-500">
                Dernière sync : {new Date(intervalsStatus.lastSyncAt).toLocaleString("fr-FR")}
              </span>
            )}
          </div>
        )}
      </div>

      {(syncError || intervalsStatus?.lastSyncError) && (
        <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm text-danger-400">
          {syncError ?? intervalsStatus?.lastSyncError}
        </div>
      )}

      <Card padding="lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <HistoryIcon className="w-5 h-5 text-brand-500" />
            <CardTitle>Filtres</CardTitle>
          </div>
        </CardHeader>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label="Du"
            type="date"
            value={toInputDate(from)}
            onChange={(e) => applyFilters(e.target.value, to, sport)}
          />
          <Input
            label="Au"
            type="date"
            value={toInputDate(to)}
            onChange={(e) => applyFilters(from, e.target.value, sport)}
          />
          <Select
            label="Sport"
            value={sport}
            onChange={(e) => applyFilters(from, to, e.target.value)}
            options={SPORT_FILTER_OPTIONS}
          />
        </div>
      </Card>

      <Card padding="lg">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-surface-800/60 animate-pulse" />
            ))}
          </div>
        ) : daysWithData.length === 0 ? (
          <EmptyState
            icon={HistoryIcon}
            title="Rien à afficher sur cette période"
            description="Complète des check-ins, séances ou pesées pour voir l'historique se remplir."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-surface-500 uppercase tracking-wider border-b border-surface-800">
                  <th className="py-2 pr-3 font-medium w-6" />
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Prévu (plan)</th>
                  <th className="py-2 pr-3 font-medium">Réalisé (Intervals.icu)</th>
                  <th className="py-2 pr-3 font-medium">Nutrition</th>
                  <th className="py-2 pr-3 font-medium">Poids</th>
                  <th className="py-2 pr-3 font-medium">Sommeil</th>
                  <th className="py-2 pr-3 font-medium">HRV</th>
                  <th className="py-2 pr-3 font-medium">Check-in</th>
                </tr>
              </thead>
              <tbody>
                {daysWithData.map((day) => {
                  const isOpen = expanded.has(day.date);
                  return (
                    <Fragment key={day.date}>
                      <tr
                        onClick={() => toggle(day.date)}
                        className="border-b border-surface-800/60 hover:bg-surface-850 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 pr-3 text-surface-500">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="py-2.5 pr-3 font-medium text-surface-200 whitespace-nowrap">
                          {formatDateLabel(day.date)}
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex flex-wrap gap-1">
                            {day.sessions.length === 0 ? (
                              <span className="text-surface-600">—</span>
                            ) : (
                              byCategory(day.sessions).map((s) => (
                                <Badge key={s.id} variant={STATUS_LABELS[s.status]?.variant ?? "default"}>
                                  {SPORT_LABEL[s.sport as keyof typeof SPORT_LABEL] ?? s.sport}
                                </Badge>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex flex-wrap gap-1">
                            {day.activities.length === 0 ? (
                              <span className="text-surface-600">—</span>
                            ) : (
                              byCategory(day.activities).map((a) => (
                                <Badge key={a.id} variant="success">
                                  {activityLabel(a.sport, a.name)}
                                </Badge>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-surface-300 whitespace-nowrap">
                          {day.nutrition ? `${day.nutrition.calories} kcal` : "—"}
                        </td>
                        <td className="py-2.5 pr-3 text-surface-300 whitespace-nowrap">
                          {day.weight !== null ? `${day.weight} kg` : "—"}
                        </td>
                        <td className="py-2.5 pr-3 text-surface-300 whitespace-nowrap">
                          {day.sleepScore !== null ? `${day.sleepScore}/100` : "—"}
                        </td>
                        <td className="py-2.5 pr-3 text-surface-300 whitespace-nowrap">
                          {day.hrv !== null ? `${day.hrv} ms` : "—"}
                        </td>
                        <td className="py-2.5 pr-3 text-surface-300 whitespace-nowrap">
                          {day.checkIn
                            ? `E ${day.checkIn.energy}/5 · S ${day.checkIn.stress}/5`
                            : "—"}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-surface-850/50">
                          <td />
                          <td colSpan={8} className="py-3 pr-3">
                            <DayDetail day={day} onEditActivity={setEditingActivity} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ActivityEditModal
        activity={editingActivity}
        onClose={() => setEditingActivity(null)}
        onSave={handleSaveActivity}
      />
    </div>
  );
}

function DayDetail({
  day,
  onEditActivity,
}: {
  day: HistoryDay;
  onEditActivity: (activity: HistoryDayActivity) => void;
}) {
  return (
    <div className="space-y-3">
      {day.sessions.length > 0 && (
        <div className="space-y-1.5">
          {byCategory(day.sessions).map((s: HistoryDaySession) => {
            const loggedExercises = s.exercises.filter(
              (e) => e.actualSets !== null || e.actualReps !== null || e.actualWeight !== null
            );
            return (
              <div
                key={s.id}
                className="text-xs bg-surface-900 rounded-lg px-3 py-2 border border-surface-800"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={STATUS_LABELS[s.status]?.variant ?? "default"}>
                      {STATUS_LABELS[s.status]?.label ?? s.status}
                    </Badge>
                    <span className="text-surface-200 truncate">{s.title}</span>
                  </div>
                  <div className="text-surface-500 whitespace-nowrap">
                    {formatDuration(s.actualDuration ?? s.duration)}
                    {s.duration && s.actualDuration && s.actualDuration !== s.duration
                      ? ` (prévu ${formatDuration(s.duration)})`
                      : ""}
                    {s.actualRPE !== null
                      ? ` · RPE ${s.actualRPE}`
                      : s.targetRPE
                      ? ` · RPE prévu ${s.targetRPE}`
                      : ""}
                  </div>
                </div>
                {loggedExercises.length > 0 && (
                  <ul className="mt-1.5 pl-1 space-y-0.5">
                    {loggedExercises.map((e, i) => (
                      <li key={i} className="text-surface-400 flex justify-between gap-3">
                        <span className="truncate">{e.name}</span>
                        <span className="text-surface-500 whitespace-nowrap">
                          {e.actualSets ?? e.sets ?? "—"} × {e.actualReps ?? e.reps ?? "—"}
                          {e.actualWeight ? ` · ${e.actualWeight} kg` : ""}
                          {e.actualRPE ? ` · RPE ${e.actualRPE}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
      {day.activities.length > 0 && (
        <div className="space-y-1.5">
          {byCategory(day.activities).map((a) => (
            <ActivityListItem key={a.id} activity={a} onEdit={onEditActivity} />
          ))}
        </div>
      )}
      {day.nutrition && (
        <p className="text-xs text-surface-400">
          Nutrition : {day.nutrition.calories} kcal — P {day.nutrition.protein}g · G {day.nutrition.carbs}g · L{" "}
          {day.nutrition.fat}g
        </p>
      )}
      {day.checkIn && (
        <p className="text-xs text-surface-400">
          Check-in : énergie {day.checkIn.energy}/5 · motivation {day.checkIn.motivation}/5 · stress{" "}
          {day.checkIn.stress}/5{day.checkIn.soreness ? " · douleurs signalées" : ""}
        </p>
      )}
      {day.sessions.length === 0 && day.activities.length === 0 && !day.nutrition && !day.checkIn && (
        <p className="text-xs text-surface-500">Aucun détail supplémentaire pour ce jour.</p>
      )}
    </div>
  );
}
