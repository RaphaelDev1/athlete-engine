"use client";

import { useEffect, useMemo, useState } from "react";
import { Apple, Beef, Flame, Wheat, Droplet, Target, NotebookPen, Pizza, Activity as ActivityIcon } from "lucide-react";
import { Card, CardHeader, CardTitle, Badge, Select, StatCard, Textarea, Input } from "@/components/ui";
import {
  buildMealPlan,
  calculateDayNutrition,
  deriveWeightGoalAdjustment,
  BMRInput,
} from "@/lib/engine/nutrition";
import { GoalDirection } from "@/lib/engine/types";
import { MacroDonut } from "@/components/nutrition/MacroDonut";
import { SessionCard } from "@/components/training/SessionCard";
import { SessionCardData } from "@/components/training/sessionMeta";
import { ProfileFormValues } from "@/lib/validations/profile";
import { ActivityListItem } from "@/components/history/ActivityListItem";
import { byCategory } from "@/lib/training/activityDisplay";
import { HistoryDayActivity } from "@/app/api/history/route";

// Repli tant que le profil n'est pas encore renseigné dans /profil.
const FALLBACK_BIOMETRICS: BMRInput = {
  weightKg: 58,
  heightCm: 167,
  age: 25,
  sex: "MALE",
};

interface CompositionGoal {
  id: string;
  type: string;
  status: string;
  targetValue: number | null;
  deadline: string | null;
}

interface PlanWeekLite {
  startDate: string;
  endDate: string;
  sessions: SessionCardData[];
}

function ageFromDateOfBirth(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

function toBiometrics(form: ProfileFormValues | null): BMRInput {
  if (!form) return FALLBACK_BIOMETRICS;
  return {
    weightKg: form.weight ?? FALLBACK_BIOMETRICS.weightKg,
    heightCm: form.height ?? FALLBACK_BIOMETRICS.heightCm,
    age: ageFromDateOfBirth(form.dateOfBirth) ?? FALLBACK_BIOMETRICS.age,
    sex: form.sex ?? FALLBACK_BIOMETRICS.sex,
  };
}

const GOAL_OPTIONS: { value: GoalDirection; label: string }[] = [
  { value: "DEFICIT", label: "Perte de poids (déficit)" },
  { value: "MAINTENANCE", label: "Maintien" },
  { value: "SURPLUS", label: "Prise de masse (surplus)" },
];

const DAY_LOAD_LABELS: Record<string, { label: string; variant: "default" | "brand" | "warning" | "success" }> = {
  REST: { label: "Repos", variant: "default" },
  LIGHT: { label: "Légère", variant: "success" },
  MODERATE: { label: "Modérée", variant: "brand" },
  HARD: { label: "Intense", variant: "warning" },
  LONG: { label: "Longue", variant: "warning" },
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Calendrier LOCAL, pas toISOString() — voir app/api/history/route.ts pour le
// même correctif (décalage possible dans un fuseau en avance sur UTC).
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDayButton(date: Date): { weekday: string; dayMonth: string } {
  const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(date).replace(".", "");
  const dayMonth = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(date);
  return { weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1), dayMonth };
}

function formatFullDate(date: Date): string {
  const label = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// 14 jours, dates réelles : les 7 premiers = la semaine passée, les 7
// suivants commencent au jour présent (index 7 = aujourd'hui) — remplace
// l'ancien sélecteur à 7 boutons "Lundi..Dimanche" qui ne couvrait que la
// semaine du plan actuellement affichée.
const DAY_WINDOW_BEFORE = 7;
const DAY_WINDOW_TOTAL = 14;
const TODAY_INDEX = DAY_WINDOW_BEFORE;

export default function NutritionPage() {
  const [manualGoalDirection, setManualGoalDirection] = useState<GoalDirection>("MAINTENANCE");
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(TODAY_INDEX);
  const [profileForm, setProfileForm] = useState<ProfileFormValues | null>(null);
  const [compositionGoal, setCompositionGoal] = useState<CompositionGoal | null>(null);
  const [weeks, setWeeks] = useState<PlanWeekLite[]>([]);
  const [actualActiveKcal, setActualActiveKcal] = useState<number | null>(null);
  const [intakeNotes, setIntakeNotes] = useState("");
  const [intakeNotesSaving, setIntakeNotesSaving] = useState(false);
  const [actualCalories, setActualCalories] = useState("");
  const [actualCaloriesSaving, setActualCaloriesSaving] = useState(false);
  const [badEating, setBadEating] = useState(false);
  const [dayActivities, setDayActivities] = useState<HistoryDayActivity[]>([]);

  const days = useMemo(() => {
    const today = startOfToday();
    return Array.from({ length: DAY_WINDOW_TOTAL }, (_, i) => addDays(today, i - DAY_WINDOW_BEFORE));
  }, []);

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => res.json())
      .then(({ data }) => {
        setProfileForm(data ?? null);
        // Objectif de poids choisi sur le profil (perte/maintien/prise) —
        // sert de repli par défaut tant qu'aucun objectif de composition
        // corporelle actif ne prend le relais (cf. goalDirection ci-dessous).
        if (data?.weightGoalDirection) setManualGoalDirection(data.weightGoalDirection);
      })
      .catch(() => setProfileForm(null));

    fetch("/api/goals")
      .then((res) => res.json())
      .then(({ data }: { data: CompositionGoal[] }) => {
        const goal = (data ?? []).find((g) => g.type === "COMPOSITION" && g.status === "ACTIVE");
        setCompositionGoal(goal ?? null);
      })
      .catch(() => setCompositionGoal(null));

    fetch("/api/training/plan")
      .then((res) => res.json())
      .then(({ data }) => setWeeks(data?.weeks ?? []))
      .catch(() => setWeeks([]));
  }, []);

  const biometrics = useMemo(() => toBiometrics(profileForm), [profileForm]);

  const weightGoal = useMemo(() => {
    if (!compositionGoal?.targetValue || !profileForm?.weight) return null;
    return deriveWeightGoalAdjustment(
      profileForm.weight,
      compositionGoal.targetValue,
      compositionGoal.deadline ? new Date(compositionGoal.deadline) : null
    );
  }, [compositionGoal, profileForm]);

  const goalDirection = weightGoal?.direction ?? manualGoalDirection;

  // Toutes les séances du plan (toutes semaines confondues), pour matcher par
  // date calendaire réelle plutôt que par index de jour — un session.dayOfWeek
  // n'est fiable que si week.startDate tombe un lundi, ce qui casse dès qu'un
  // report de plan (shiftDays) s'accumule (cf. app/training/page.tsx).
  const allSessions = useMemo(
    () => weeks.flatMap((w) => w.sessions.map((s) => ({ ...s, scheduledDate: new Date(s.scheduledDate) }))),
    [weeks]
  );

  const selectedDayDate = days[selectedDayIndex];

  const daySessions = useMemo(
    () => allSessions.filter((s) => toDateKey(s.scheduledDate) === toDateKey(selectedDayDate)),
    [allSessions, selectedDayDate]
  );

  // Calories actives réelles remontées par la montre pour le jour affiché
  // (GET /api/garmin/activity-calories) — recale le TDEE sur le réel quand
  // dispo (jour passé/aujourd'hui déjà synchronisé), sinon calculateDayNutrition
  // retombe sur l'estimation MET des séances planifiées.
  useEffect(() => {
    setActualActiveKcal(null);
    if (!selectedDayDate) return;
    const key = toDateKey(selectedDayDate);
    fetch(`/api/garmin/activity-calories?date=${key}`)
      .then((res) => res.json())
      .then(({ activeCalories }) => setActualActiveKcal(activeCalories ?? null))
      .catch(() => setActualActiveKcal(null));
  }, [selectedDayDate]);

  // Note libre "qu'est-ce que j'ai mangé en gros" + calories réellement
  // consommées du jour affiché — chargées depuis la sauvegarde précédente
  // (jamais recalculées comme les cibles macros).
  useEffect(() => {
    setIntakeNotes("");
    setActualCalories("");
    setBadEating(false);
    setDayActivities([]);
    if (!selectedDayDate) return;
    const key = toDateKey(selectedDayDate);
    fetch(`/api/nutrition/day?date=${key}`)
      .then((res) => res.json())
      .then(({ data, activities }) => {
        setIntakeNotes(data?.actualIntakeNotes ?? "");
        setActualCalories(data?.actualCalories != null ? String(data.actualCalories) : "");
        setBadEating(data?.badEating ?? false);
        setDayActivities(activities ?? []);
      })
      .catch(() => {
        setIntakeNotes("");
        setActualCalories("");
        setBadEating(false);
        setDayActivities([]);
      });
  }, [selectedDayDate]);

  const nutrition = useMemo(
    () =>
      calculateDayNutrition({
        bmrInput: biometrics,
        sessions: daySessions.map((s) => ({
          sport: s.sport,
          duration: s.duration,
          targetRPE: s.targetRPE,
        })),
        goalDirection,
        calorieAdjustmentOverride: weightGoal?.calorieAdjustment,
        actualActiveKcal,
      }),
    [daySessions, goalDirection, biometrics, weightGoal, actualActiveKcal]
  );

  const mealPlan = useMemo(() => buildMealPlan(nutrition, nutrition.dayLoad), [nutrition]);

  // Historise la cible du jour affiché (Phase 4/6) — jusqu'ici jamais persistée.
  // Attend que le plan soit chargé (weeks.length > 0) pour ne pas écraser la
  // cible avec un isTrainingDay/trainingType calculé sur une liste de séances
  // encore vide pendant le chargement initial.
  useEffect(() => {
    if (weeks.length === 0 || !selectedDayDate) return;
    const dayDate = selectedDayDate;
    fetch("/api/nutrition/day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: toDateKey(dayDate),
        bmr: nutrition.bmr,
        tdee: nutrition.tdee,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        calories: nutrition.calories,
        isTrainingDay: daySessions.some((s) => s.sport !== "REST"),
        trainingType: nutrition.dayLoad,
      }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks, selectedDayIndex, nutrition.calories]);

  function saveIntakeNotes() {
    if (!selectedDayDate) return;
    setIntakeNotesSaving(true);
    fetch("/api/nutrition/day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: toDateKey(selectedDayDate),
        bmr: nutrition.bmr,
        tdee: nutrition.tdee,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        calories: nutrition.calories,
        isTrainingDay: daySessions.some((s) => s.sport !== "REST"),
        trainingType: nutrition.dayLoad,
        actualIntakeNotes: intakeNotes.trim() || null,
      }),
    })
      .catch(() => {})
      .finally(() => setIntakeNotesSaving(false));
  }

  function toggleBadEating() {
    if (!selectedDayDate) return;
    const next = !badEating;
    setBadEating(next);
    fetch("/api/nutrition/day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: toDateKey(selectedDayDate),
        bmr: nutrition.bmr,
        tdee: nutrition.tdee,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        calories: nutrition.calories,
        isTrainingDay: daySessions.some((s) => s.sport !== "REST"),
        trainingType: nutrition.dayLoad,
        badEating: next,
      }),
    }).catch(() => {});
  }

  function saveActualCalories() {
    if (!selectedDayDate) return;
    setActualCaloriesSaving(true);
    fetch("/api/nutrition/day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: toDateKey(selectedDayDate),
        bmr: nutrition.bmr,
        tdee: nutrition.tdee,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        calories: nutrition.calories,
        isTrainingDay: daySessions.some((s) => s.sport !== "REST"),
        trainingType: nutrition.dayLoad,
        actualCalories: actualCalories.trim() === "" ? null : Number(actualCalories),
      }),
    })
      .catch(() => {})
      .finally(() => setActualCaloriesSaving(false));
  }

  const dayLoadInfo = DAY_LOAD_LABELS[nutrition.dayLoad];
  const proteinPerKg = Math.round((nutrition.protein / biometrics.weightKg) * 10) / 10;
  // Écart réel vs objectif du jour — négatif = mangé moins que la cible
  // (déficit), positif = surplus. Répond directement à "suis-je en déficit
  // ou non aujourd'hui ?".
  const actualCaloriesNumber = actualCalories.trim() === "" ? null : Number(actualCalories);
  const calorieDelta =
    actualCaloriesNumber !== null && !Number.isNaN(actualCaloriesNumber)
      ? Math.round(actualCaloriesNumber - nutrition.calories)
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-100">Nutrition</h1>
        <p className="text-sm text-surface-400 mt-1">
          Macros et répartition par repas — ajustées à la charge d&apos;entraînement du jour
        </p>
      </div>

      {weightGoal && compositionGoal ? (
        <Card padding="lg" className="flex items-center gap-4 flex-wrap">
          <div className="p-2.5 rounded-lg bg-brand-500/10">
            <Target className="w-5 h-5 text-brand-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-surface-100">
              {profileForm?.weight} kg → {compositionGoal.targetValue} kg
              {compositionGoal.deadline &&
                ` d'ici le ${new Date(compositionGoal.deadline).toLocaleDateString("fr-FR")}`}
            </p>
            <p className="text-xs text-surface-400 mt-0.5">
              Rythme visé : {weightGoal.weeklyRateKg > 0 ? "+" : ""}
              {weightGoal.weeklyRateKg} kg/semaine — ajustement de{" "}
              {weightGoal.calorieAdjustment > 0 ? "+" : ""}
              {weightGoal.calorieAdjustment} kcal/jour calculé automatiquement depuis ton objectif.
            </p>
          </div>
        </Card>
      ) : null}

      {/* Sélection du jour + objectif */}
      <Card padding="lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Apple className="w-5 h-5 text-brand-500" />
            <div>
              <CardTitle>Journée</CardTitle>
              <p className="text-xs text-surface-500 mt-0.5">{formatFullDate(selectedDayDate)}</p>
            </div>
          </div>
          {!weightGoal && (
            <div className="w-64">
              <Select
                value={manualGoalDirection}
                onChange={(e) => setManualGoalDirection(e.target.value as GoalDirection)}
                options={GOAL_OPTIONS}
              />
            </div>
          )}
        </CardHeader>

        <div className="space-y-3">
          <div>
            <p className="text-[11px] text-surface-500 uppercase tracking-wider mb-1.5">
              Semaine dernière
            </p>
            <div className="grid grid-cols-7 gap-2">
              {days.slice(0, DAY_WINDOW_BEFORE).map((date, i) => (
                <DayButton
                  key={toDateKey(date)}
                  date={date}
                  isActive={i === selectedDayIndex}
                  hasSession={allSessions.some(
                    (s) => toDateKey(s.scheduledDate) === toDateKey(date) && s.sport !== "REST"
                  )}
                  onSelect={() => setSelectedDayIndex(i)}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] text-surface-500 uppercase tracking-wider mb-1.5">
              Cette semaine
            </p>
            <div className="grid grid-cols-7 gap-2">
              {days.slice(DAY_WINDOW_BEFORE).map((date, i) => {
                const index = i + DAY_WINDOW_BEFORE;
                return (
                  <DayButton
                    key={toDateKey(date)}
                    date={date}
                    isActive={index === selectedDayIndex}
                    isToday={index === TODAY_INDEX}
                    hasSession={allSessions.some(
                      (s) => toDateKey(s.scheduledDate) === toDateKey(date) && s.sport !== "REST"
                    )}
                    onSelect={() => setSelectedDayIndex(index)}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {daySessions.filter((s) => s.sport !== "REST").length > 0 && (
          <div className="mt-4 pt-4 border-t border-surface-700 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {daySessions
              .filter((s) => s.sport !== "REST")
              .map((s) => (
                <SessionCard key={s.id} session={s} onSelect={() => {}} />
              ))}
          </div>
        )}
      </Card>

      {/* Activités réellement faites ce jour-là (Intervals.icu/Garmin) — tout
          ce qui a été pratiqué, pas seulement ce qui était planifié (ex. padel
          non prévu au programme). */}
      {dayActivities.length > 0 && (
        <Card padding="lg">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ActivityIcon className="w-5 h-5 text-brand-500" />
              <CardTitle>Activités de la journée</CardTitle>
            </div>
          </CardHeader>
          <div className="space-y-1.5">
            {byCategory(dayActivities).map((a) => (
              <ActivityListItem key={a.id} activity={a} />
            ))}
          </div>
        </Card>
      )}

      {/* Ce qui a été mangé, en gros */}
      <Card padding="lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <NotebookPen className="w-5 h-5 text-brand-500" />
            <CardTitle>Qu&apos;as-tu mangé ce jour-là ?</CardTitle>
          </div>
          {intakeNotesSaving && <span className="text-xs text-surface-500">Enregistrement…</span>}
        </CardHeader>
        <Textarea
          placeholder="En gros : riz, poulet, légumes, un yaourt le soir..."
          rows={3}
          value={intakeNotes}
          onChange={(e) => setIntakeNotes(e.target.value)}
          onBlur={saveIntakeNotes}
        />
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-surface-700">
          <div className="flex items-center gap-2">
            <Pizza className="w-4 h-4 text-brand-500" />
            <span className="label !mb-0">Écart alimentaire (fast food...)</span>
          </div>
          <button
            type="button"
            onClick={toggleBadEating}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              badEating ? "bg-brand-500" : "bg-surface-700"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                badEating ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>
      </Card>

      {/* Stats principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="BMR" value={nutrition.bmr} unit="kcal" icon={Flame} />
        <Card hover>
          <div className="flex items-start justify-between">
            <div>
              <p className="stat-label">TDEE du jour</p>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="stat-value">{nutrition.tdee}</span>
                <span className="text-sm text-surface-400">kcal</span>
              </div>
              <div className="mt-1.5">
                <Badge variant={nutrition.usedActualCalories ? "success" : "default"}>
                  {nutrition.usedActualCalories ? "Réel (montre)" : "Estimation"}
                </Badge>
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-brand-500/10">
              <Flame className="w-5 h-5 text-brand-500" />
            </div>
          </div>
        </Card>
        <StatCard label="Objectif calorique" value={nutrition.calories} unit="kcal" icon={Apple} />
        <Card hover>
          <p className="stat-label">Charge du jour</p>
          <div className="mt-2">
            <Badge variant={dayLoadInfo.variant}>{dayLoadInfo.label}</Badge>
          </div>
        </Card>
      </div>

      {/* Calories réellement consommées — saisie manuelle comparée à
          l'objectif calculé ci-dessus, pour savoir si la journée est
          effectivement en déficit/surplus plutôt que théorique. */}
      <Card padding="lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-brand-500" />
            <CardTitle>Calories réellement consommées</CardTitle>
          </div>
          {actualCaloriesSaving && <span className="text-xs text-surface-500">Enregistrement…</span>}
        </CardHeader>
        <div className="flex flex-wrap items-end gap-6">
          <div className="w-44">
            <Input
              label="Consommées ce jour-là"
              type="number"
              min={0}
              step={10}
              suffix="kcal"
              value={actualCalories}
              onChange={(e) => setActualCalories(e.target.value)}
              onBlur={saveActualCalories}
            />
          </div>
          {calorieDelta !== null && (
            <div>
              <p className="stat-label">Écart vs objectif ({nutrition.calories} kcal)</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span
                  className={`text-lg font-semibold tabular-nums ${
                    calorieDelta > 0 ? "text-warning-400" : "text-success-400"
                  }`}
                >
                  {calorieDelta > 0 ? "+" : ""}
                  {calorieDelta} kcal
                </span>
                <Badge variant={calorieDelta > 0 ? "warning" : "success"}>
                  {calorieDelta > 0
                    ? "Au-dessus de l'objectif"
                    : calorieDelta < 0
                      ? "En déficit vs objectif"
                      : "Pile à l'objectif"}
                </Badge>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Répartition macros */}
      <Card padding="lg">
        <CardHeader>
          <CardTitle>Macronutriments</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
          <MacroDonut macros={nutrition} />
          <div className="space-y-3">
            <MacroRow
              icon={Beef}
              color="text-info-400"
              label="Protéines"
              grams={nutrition.protein}
              kcal={nutrition.protein * 4}
              totalKcal={nutrition.calories}
              detail={`${proteinPerKg} g/kg`}
            />
            <MacroRow
              icon={Wheat}
              color="text-brand-400"
              label="Glucides"
              grams={nutrition.carbs}
              kcal={nutrition.carbs * 4}
              totalKcal={nutrition.calories}
              detail="périodisés selon la charge du jour"
            />
            <MacroRow
              icon={Droplet}
              color="text-warning-400"
              label="Lipides"
              grams={nutrition.fat}
              kcal={nutrition.fat * 9}
              totalKcal={nutrition.calories}
              detail="en complément des calories restantes"
            />
          </div>
        </div>
      </Card>

      {/* Répartition par repas */}
      <Card padding="lg">
        <CardHeader>
          <CardTitle>Répartition par repas</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {mealPlan.map((meal) => (
            <div
              key={meal.key}
              className="bg-surface-850 rounded-lg p-4 border border-surface-700/50"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-surface-100">{meal.name}</p>
                <span className="text-[11px] text-surface-500">{meal.timing}</span>
              </div>
              <p className="text-xl font-bold text-brand-500 mt-2 tabular-nums">
                {meal.calories}
                <span className="text-xs text-surface-400 font-normal ml-1">kcal</span>
              </p>
              <div className="flex gap-3 mt-2 text-xs text-surface-400">
                <span>P {meal.protein}g</span>
                <span>G {meal.carbs}g</span>
                <span>L {meal.fat}g</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function DayButton({
  date,
  isActive,
  isToday,
  hasSession,
  onSelect,
}: {
  date: Date;
  isActive: boolean;
  isToday?: boolean;
  hasSession: boolean;
  onSelect: () => void;
}) {
  const { weekday, dayMonth } = formatDayButton(date);
  return (
    <button
      onClick={onSelect}
      className={`relative flex flex-col items-center gap-1 py-2.5 rounded-lg border transition-colors ${
        isActive
          ? "border-brand-500 bg-brand-500/10 text-brand-400"
          : "border-surface-700 bg-surface-850 text-surface-400 hover:text-surface-200 hover:border-surface-600"
      }`}
    >
      {isToday && (
        <span className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-brand-500" title="Aujourd'hui" />
      )}
      <span className="text-xs font-medium">{weekday}</span>
      <span className="text-[10px] text-surface-500">{dayMonth}</span>
      <span
        className="w-1.5 h-1.5 rounded-full bg-current opacity-0 data-[has-session=true]:opacity-100"
        data-has-session={hasSession}
      />
    </button>
  );
}

function MacroRow({
  icon: Icon,
  color,
  label,
  grams,
  kcal,
  totalKcal,
  detail,
}: {
  icon: typeof Beef;
  color: string;
  label: string;
  grams: number;
  kcal: number;
  totalKcal: number;
  detail: string;
}) {
  const pct = totalKcal > 0 ? Math.round((kcal / totalKcal) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${color}`} />
          <span className="text-sm font-medium text-surface-200">{label}</span>
        </div>
        <span className="text-sm font-semibold text-surface-100 tabular-nums">
          {grams}g <span className="text-surface-500 font-normal">({pct}%)</span>
        </span>
      </div>
      <p className="text-xs text-surface-500 pl-6">{detail}</p>
    </div>
  );
}
