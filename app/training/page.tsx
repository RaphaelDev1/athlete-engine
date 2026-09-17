"use client";

import { useEffect, useState } from "react";
import { PlanGoalType } from "@/lib/engine/types";
import { WeekType } from "@/lib/types";
import { Card, CardHeader, CardTitle, Badge, Select, Input } from "@/components/ui";
import { SessionCard } from "@/components/training/SessionCard";
import { SessionDetailModal } from "@/components/training/SessionDetailModal";
import { ReadinessBanner } from "@/components/dashboard/ReadinessBanner";
import { OvertrainingWarning } from "@/components/dashboard/OvertrainingWarning";
import { AthleteState } from "@/lib/engine/labels";
import {
  DAY_LABELS,
  MACRO_PHASE_LABELS,
  PHASE_LABELS,
  SessionCardData,
  WEEK_TYPE_LABELS,
} from "@/components/training/sessionMeta";
import {
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Palmtree,
  FlaskConical,
  CalendarClock,
  CalendarDays,
} from "lucide-react";

interface WorkCycleDay {
  isWorkDay: boolean;
  startMin: number | null; // minutes depuis minuit
  endMin: number | null;
}

interface WorkScheduleData {
  anchorDate: string; // "YYYY-MM-DD" — date du jour 0 du cycle
  pattern: WorkCycleDay[]; // 14 entrées, se répète indéfiniment
}

interface ReadinessData {
  athleteState: AthleteState;
  loadMultiplier: number;
  reasons: string[];
}

interface ScheduleData {
  goalType: PlanGoalType;
  totalWeeks: number;
  startDate: string;
  raceDate: string | null;
  vacationMode: boolean;
  shiftDays: number;
  availableDays: number[];
  weeklyTimeBudgetMin: number | null;
}

interface PlanWeek {
  id: string;
  weekNumber: number;
  weekType: WeekType;
  targetVolume: number | null;
  startDate: Date;
  endDate: Date;
  phase: string | null;
  macroPhase: string | null;
  plannedTests: string[];
  sessions: SessionCardData[];
}

interface PlanData {
  plan: { id: string; name: string; startDate: Date; endDate: Date; totalWeeks: number; goalType: PlanGoalType };
  weeks: PlanWeek[];
}

function hasProfileHint(profileMissing: boolean, vacationMode: boolean): string | false {
  if (vacationMode) return false;
  return (
    profileMissing &&
    "Profil non renseigné — plan basé sur des valeurs de départ génériques, complète ton profil pour des zones précises."
  );
}

function toInputDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

// Date réelle du jour N (0-13) du cycle de travail, pour l'afficher en regard
// de chaque case — jamais .toISOString() ici, mêmes raisons qu'ailleurs dans
// ce fichier (fuseau en avance sur UTC).
function cycleDayDate(anchorDate: string, index: number): Date {
  const d = new Date(`${anchorDate}T00:00:00`);
  d.setDate(d.getDate() + index);
  return d;
}

function minutesToTimeInput(min: number | null): string {
  if (min === null) return "";
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function timeInputToMinutes(value: string): number | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function formatDateRange(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
  return `${fmt.format(start)} — ${fmt.format(end)}`;
}

// Nom du jour dérivé de la date réelle — jamais DAY_LABELS[dayOfWeek], qui
// suppose que week.startDate tombe un lundi. Ce n'est plus garanti une fois
// que schedule.shiftDays s'est accumulé (report en cascade, cf.
// lib/training/schedule.ts::postponeSchedule) : week.startDate peut alors
// tomber n'importe quel jour, et DAY_LABELS[0] afficherait "Lundi" sur une
// date qui n'en est pas un.
function weekdayLabel(date: Date): string {
  const label = new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Reconstruit un PlanWeek/SessionCardData typé Date à partir du JSON de
// /api/training/plan (dates sérialisées en string).
function parsePlanResponse(raw: {
  plan: PlanData["plan"];
  weeks: (Omit<PlanWeek, "startDate" | "endDate" | "sessions"> & {
    startDate: string;
    endDate: string;
    sessions: (Omit<SessionCardData, "scheduledDate"> & { scheduledDate: string })[];
  })[];
}): PlanData {
  return {
    plan: {
      ...raw.plan,
      startDate: new Date(raw.plan.startDate),
      endDate: new Date(raw.plan.endDate),
    },
    weeks: raw.weeks.map((w) => ({
      ...w,
      startDate: new Date(w.startDate),
      endDate: new Date(w.endDate),
      sessions: w.sessions.map((s) => ({ ...s, scheduledDate: new Date(s.scheduledDate) })),
    })),
  };
}

export default function TrainingPage() {
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [weekIndex, setWeekIndex] = useState(0);
  const [selectedSession, setSelectedSession] = useState<SessionCardData | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [draggedSession, setDraggedSession] = useState<SessionCardData | null>(null);
  const [postponing, setPostponing] = useState(false);
  const [readiness, setReadiness] = useState<ReadinessData | null>(null);
  const [workSchedule, setWorkSchedule] = useState<WorkScheduleData | null>(null);

  async function loadSchedule() {
    const res = await fetch("/api/training/schedule");
    const { data } = await res.json();
    setSchedule({
      goalType: data.goalType,
      totalWeeks: data.totalWeeks,
      startDate: data.startDate,
      raceDate: data.raceDate,
      vacationMode: data.vacationMode,
      shiftDays: data.shiftDays,
      availableDays: data.availableDays,
      weeklyTimeBudgetMin: data.weeklyTimeBudgetMin,
    });
  }

  async function loadPlan() {
    const res = await fetch("/api/training/plan");
    const { data } = await res.json();
    setPlanData(parsePlanResponse(data));
  }

  async function loadWorkSchedule() {
    const res = await fetch("/api/training/work-schedule");
    const { data } = await res.json();
    setWorkSchedule(data);
  }

  async function saveWorkSchedule(next: WorkScheduleData) {
    setWorkSchedule(next);
    await fetch("/api/training/work-schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    await loadPlan();
  }

  function updateCycleDay(index: number, patch: Partial<WorkCycleDay>) {
    if (!workSchedule) return;
    const pattern = workSchedule.pattern.map((d, i) => (i === index ? { ...d, ...patch } : d));
    saveWorkSchedule({ ...workSchedule, pattern });
  }

  function toggleWorkDay(index: number) {
    if (!workSchedule) return;
    const day = workSchedule.pattern[index];
    updateCycleDay(index, day.isWorkDay
      ? { isWorkDay: false, startMin: null, endMin: null }
      : { isWorkDay: true, startMin: day.startMin ?? 22 * 60, endMin: day.endMin ?? 6 * 60 }
    );
  }

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => res.json())
      .then(({ data }) => setProfileMissing(!data))
      .catch(() => setProfileMissing(false));
    // Réutilise le calcul de récupération/charge du dashboard (sommeil, HRV,
    // check-in, ratio de charge) pour prévenir ici même si les facteurs de
    // repos ne sont pas bons pendant qu'on planifie les jours dispo.
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((data) => setReadiness(data.readiness))
      .catch(() => setReadiness(null));
    loadSchedule();
    loadPlan();
    loadWorkSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveSchedule(next: ScheduleData) {
    setSchedule(next);
    await fetch("/api/training/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goalType: next.goalType,
        totalWeeks: next.totalWeeks,
        startDate: next.startDate,
        raceDate: next.raceDate,
        vacationMode: next.vacationMode,
        availableDays: next.availableDays,
        weeklyTimeBudgetMin: next.weeklyTimeBudgetMin,
      }),
    });
    await loadPlan();
  }

  async function postpone() {
    if (!schedule) return;
    setPostponing(true);
    try {
      const res = await fetch("/api/training/postpone", { method: "POST" });
      const { data } = await res.json();
      setSchedule({ ...schedule, shiftDays: data.shiftDays });
      await loadPlan();
    } finally {
      setPostponing(false);
      setDraggedSession(null);
    }
  }

  useEffect(() => {
    if (planData) setWeekIndex((i) => Math.min(i, planData.weeks.length - 1));
  }, [planData]);

  if (!schedule || !planData || planData.weeks.length === 0) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 bg-surface-800/60 rounded animate-pulse" />
        <div className="h-40 rounded-xl bg-surface-800/60 animate-pulse" />
      </div>
    );
  }

  const startDate = new Date(schedule.startDate);
  const raceDate = schedule.raceDate ? new Date(schedule.raceDate) : null;
  const { plan, weeks } = planData;
  const week = weeks[Math.min(weekIndex, weeks.length - 1)];
  const weekTypeInfo = WEEK_TYPE_LABELS[week.weekType] ?? WEEK_TYPE_LABELS.LOAD;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const hint = hasProfileHint(profileMissing, schedule.vacationMode);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-100">Entraînement</h1>
        <p className="text-sm text-surface-400 mt-1">
          Programme et séances de la semaine
        </p>
      </div>

      {readiness && (
        <ReadinessBanner
          athleteState={readiness.athleteState}
          loadMultiplier={readiness.loadMultiplier}
          reasons={readiness.reasons}
        />
      )}

      {readiness && (
        <OvertrainingWarning
          athleteState={readiness.athleteState}
          reasons={readiness.reasons}
          onPostpone={postpone}
          postponing={postponing}
        />
      )}

      {/* Configuration du plan */}
      <Card padding="lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-brand-500" />
            <CardTitle>Paramètres du plan</CardTitle>
          </div>
          <Badge variant="brand">
            {formatDateRange(plan.startDate, plan.endDate)}
          </Badge>
        </CardHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Select
            label="Objectif"
            value={schedule.goalType}
            onChange={(e) => {
              const next = e.target.value as PlanGoalType;
              saveSchedule({
                ...schedule,
                goalType: next,
                totalWeeks: next === "TRIATHLON" ? 26 : schedule.totalWeeks,
              });
            }}
            options={[
              { value: "TRIATHLON", label: "Triathlon Sprint + Musculation" },
              { value: "RUNNING", label: "Course seule" },
              { value: "STRENGTH", label: "Musculation seule" },
              { value: "MIXED", label: "Course + Musculation" },
            ]}
          />
          <Input
            label="Durée du plan"
            type="number"
            min={4}
            max={104}
            suffix="semaines"
            value={schedule.totalWeeks}
            onChange={(e) =>
              saveSchedule({
                ...schedule,
                totalWeeks: Math.min(104, Math.max(4, Number(e.target.value) || 4)),
              })
            }
          />
          <Input
            label="Date de début"
            type="date"
            value={toInputDate(startDate)}
            onChange={(e) =>
              e.target.value && saveSchedule({ ...schedule, startDate: e.target.value })
            }
          />
          <Input
            label={schedule.goalType === "TRIATHLON" ? "Jour J triathlon" : "Course visée"}
            type="date"
            hint="Optionnel — déclenche l'affûtage automatique"
            value={raceDate ? toInputDate(raceDate) : ""}
            onChange={(e) =>
              saveSchedule({ ...schedule, raceDate: e.target.value || null })
            }
          />
        </div>

        <div className="mt-4 pt-4 border-t border-surface-700/60 flex items-center justify-between flex-wrap gap-2">
          <button
            type="button"
            onClick={() => saveSchedule({ ...schedule, vacationMode: !schedule.vacationMode })}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              schedule.vacationMode
                ? "border-warning-500 bg-warning-500/10 text-warning-400"
                : "border-surface-700 text-surface-400 hover:border-surface-600 hover:text-surface-200"
            }`}
          >
            <Palmtree className="w-4 h-4" />
            Mode vacances {schedule.vacationMode ? "activé" : "désactivé"}
          </button>
          {hint && <p className="text-xs text-surface-500">{hint}</p>}
          {schedule.vacationMode && (
            <p className="text-xs text-surface-500">
              Pas de salle, piscine ni home trainer — séances au poids du corps et cardio libre.
            </p>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-surface-700/60">
          <div className="max-w-xs">
            <Input
              label="Temps disponible cette semaine"
              type="number"
              min={0}
              suffix="minutes"
              hint="Optionnel — les séances sont réduites proportionnellement si dépassé"
              value={schedule.weeklyTimeBudgetMin ?? ""}
              onChange={(e) =>
                saveSchedule({
                  ...schedule,
                  weeklyTimeBudgetMin: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </div>
        </div>

        {schedule.shiftDays > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-warning-400 bg-warning-500/10 border border-warning-500/20 rounded-lg px-3 py-2">
            <CalendarClock className="w-3.5 h-3.5 flex-shrink-0" />
            Plan décalé de {schedule.shiftDays} jour{schedule.shiftDays > 1 ? "s" : ""} par rapport
            à la date de début initiale ({toInputDate(startDate)}).
          </div>
        )}
      </Card>

      {/* Cycle de travail répétitif (ex. rythme de nuit) : déclaré une fois sur
          14 jours, appliqué indéfiniment à partir de anchorDate. Un jour
          travaillé plafonne le plan à 1 séance (sommeil décalé) ; le tout
          premier jour de repos après une série de jours travaillés saute
          l'entraînement si la récupération du moment est mauvaise. */}
      <Card padding="lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-brand-500" />
            <CardTitle>Ton rythme de travail</CardTitle>
          </div>
        </CardHeader>
        <p className="text-xs text-surface-500 mb-3">
          Cycle de 14 jours qui se répète indéfiniment. Un jour marqué «&nbsp;Travail&nbsp;»
          (sommeil décalé) est plafonné à 1 séance ; les jours de repos peuvent en recevoir 2 si ta
          récupération est bonne. Si tu es trop fatigué le premier jour de repos qui suit une série
          de jours travaillés, la séance est automatiquement annulée ce jour-là.
        </p>
        {workSchedule ? (
          <>
            <div className="max-w-xs mb-4">
              <Input
                label="Jour 1 du cycle"
                type="date"
                hint="Point de départ des 14 jours — le cycle se répète ensuite tout seul"
                value={workSchedule.anchorDate}
                onChange={(e) =>
                  e.target.value && saveWorkSchedule({ ...workSchedule, anchorDate: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {workSchedule.pattern.map((day, index) => {
                const date = cycleDayDate(workSchedule.anchorDate, index);
                return (
                  <div
                    key={index}
                    className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                      day.isWorkDay
                        ? "border-brand-500 bg-brand-500/10 text-brand-400"
                        : "border-surface-700 text-surface-500"
                    }`}
                  >
                    <div className="text-center mb-1.5">
                      <div className="uppercase tracking-wide text-[10px]">Jour {index + 1}</div>
                      <div className="text-[10px] text-surface-500">
                        {new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric" }).format(date)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleWorkDay(index)}
                      className={`w-full rounded-md py-1 text-[11px] font-medium border transition-colors ${
                        day.isWorkDay
                          ? "border-brand-500/50 bg-brand-500/20 text-brand-300"
                          : "border-surface-700 hover:border-surface-600 text-surface-300"
                      }`}
                    >
                      {day.isWorkDay ? "Travail" : "Repos"}
                    </button>
                    {day.isWorkDay && (
                      <div className="mt-1.5 flex items-center gap-1">
                        <input
                          type="time"
                          value={minutesToTimeInput(day.startMin)}
                          onChange={(e) =>
                            updateCycleDay(index, { startMin: timeInputToMinutes(e.target.value) })
                          }
                          className="w-full min-w-0 rounded-md bg-surface-850 border border-surface-700 text-surface-200 text-[11px] px-1 py-1"
                        />
                        <input
                          type="time"
                          value={minutesToTimeInput(day.endMin)}
                          onChange={(e) =>
                            updateCycleDay(index, { endMin: timeInputToMinutes(e.target.value) })
                          }
                          className="w-full min-w-0 rounded-md bg-surface-850 border border-surface-700 text-surface-200 text-[11px] px-1 py-1"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="h-32 rounded-lg bg-surface-800/60 animate-pulse" />
        )}
      </Card>

      {/* Navigation semaine */}
      <Card padding="lg">
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => setWeekIndex((i) => Math.max(0, i - 1))}
            disabled={weekIndex === 0}
            className="p-2 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-lg font-semibold text-surface-100">
                Semaine {week.weekNumber} / {plan.totalWeeks}
              </h2>
              <Badge variant={weekTypeInfo.variant}>{weekTypeInfo.label}</Badge>
              {week.macroPhase ? (
                <Badge variant="default">{MACRO_PHASE_LABELS[week.macroPhase]}</Badge>
              ) : (
                week.phase && <Badge variant="default">{PHASE_LABELS[week.phase]}</Badge>
              )}
            </div>
            <p className="text-xs text-surface-500 mt-1">
              {formatDateRange(week.startDate, week.endDate)}
              {week.targetVolume !== null && ` · ${week.targetVolume} km visés`}
            </p>
            {week.plannedTests.length > 0 && (
              <div className="flex items-center justify-center gap-1.5 mt-2 flex-wrap">
                {week.plannedTests.map((test) => (
                  <span
                    key={test}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-info-500/15 text-info-400"
                  >
                    <FlaskConical className="w-3 h-3" />
                    {test}
                  </span>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setWeekIndex((i) => Math.min(weeks.length - 1, i + 1))}
            disabled={weekIndex === weeks.length - 1}
            className="p-2 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-surface-500 mb-3">
          Glisse une séance sur le jour suivant pour la reporter — toute la suite du plan
          glissera d&apos;un jour avec elle.
        </p>

        {/* Grille des jours */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {DAY_LABELS.map((_, dayOfWeek) => {
            const daySessions = week.sessions.filter((s) => s.dayOfWeek === dayOfWeek);
            const date = new Date(week.startDate);
            date.setDate(date.getDate() + dayOfWeek);
            const isToday = isSameDay(date, today);
            const isValidDropTarget =
              draggedSession !== null && isSameDay(date, addDays(draggedSession.scheduledDate, 1));

            return (
              <div
                key={dayOfWeek}
                onDragOver={(e) => {
                  if (isValidDropTarget) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (isValidDropTarget) postpone();
                }}
                className={`space-y-2 rounded-lg transition-colors ${
                  isValidDropTarget ? "bg-brand-500/10 ring-2 ring-brand-500/40" : ""
                }`}
              >
                <div className="px-1 flex items-center gap-1.5">
                  <p
                    className={`text-xs font-semibold uppercase tracking-wider ${
                      isToday ? "text-brand-500" : "text-surface-300"
                    }`}
                  >
                    {weekdayLabel(date)}
                  </p>
                  {isToday && (
                    <button
                      onClick={postpone}
                      disabled={postponing}
                      title="Reporter les séances du jour au lendemain"
                      className="text-surface-500 hover:text-brand-500 disabled:opacity-40 transition-colors"
                    >
                      <CalendarClock className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="px-1">
                  <p className="text-[11px] text-surface-500">
                    {new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(
                      date
                    )}
                  </p>
                </div>
                <div className="space-y-2">
                  {daySessions.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onSelect={setSelectedSession}
                      draggable
                      onDragStart={setDraggedSession}
                      onDragEnd={() => setDraggedSession(null)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <SessionDetailModal
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
        onLogged={loadPlan}
      />
    </div>
  );
}
