"use client";

import { useEffect, useMemo, useState } from "react";
import { Apple, Beef, Flame, Wheat, Droplet, Target } from "lucide-react";
import { Card, CardHeader, CardTitle, Badge, Select, StatCard } from "@/components/ui";
import {
  buildMealPlan,
  calculateDayNutrition,
  deriveWeightGoalAdjustment,
  BMRInput,
} from "@/lib/engine/nutrition";
import { GoalDirection } from "@/lib/engine/types";
import { MacroDonut } from "@/components/nutrition/MacroDonut";
import { SessionCard } from "@/components/training/SessionCard";
import { DAY_LABELS, SessionCardData } from "@/components/training/sessionMeta";
import { ProfileFormValues } from "@/lib/validations/profile";

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

function currentDayOfWeek(): number {
  const jsDay = new Date().getDay(); // 0 = dimanche
  return jsDay === 0 ? 6 : jsDay - 1;
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

export default function NutritionPage() {
  const [manualGoalDirection, setManualGoalDirection] = useState<GoalDirection>("MAINTENANCE");
  const [selectedDay, setSelectedDay] = useState<number>(() => currentDayOfWeek());
  const [profileForm, setProfileForm] = useState<ProfileFormValues | null>(null);
  const [compositionGoal, setCompositionGoal] = useState<CompositionGoal | null>(null);
  const [week, setWeek] = useState<PlanWeekLite | null>(null);
  const [actualActiveKcal, setActualActiveKcal] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => res.json())
      .then(({ data }) => setProfileForm(data ?? null))
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
      .then(({ data }) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const current =
          (data?.weeks ?? []).find(
            (w: PlanWeekLite) => new Date(w.startDate) <= today && today <= new Date(w.endDate)
          ) ?? data?.weeks?.[0] ?? null;
        setWeek(current);
      })
      .catch(() => setWeek(null));
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
  const daySessions = useMemo(
    () => (week ? week.sessions.filter((s) => s.dayOfWeek === selectedDay) : []),
    [week, selectedDay]
  );

  const selectedDayDate = useMemo(
    () => (week ? addDays(new Date(week.startDate), selectedDay) : null),
    [week, selectedDay]
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
  useEffect(() => {
    if (!week || !selectedDayDate) return;
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
  }, [week, selectedDay, nutrition.calories]);

  const dayLoadInfo = DAY_LOAD_LABELS[nutrition.dayLoad];
  const proteinPerKg = Math.round((nutrition.protein / biometrics.weightKg) * 10) / 10;

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
            <CardTitle>Journée</CardTitle>
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

        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {DAY_LABELS.map((label, dayOfWeek) => {
            const isActive = dayOfWeek === selectedDay;
            const sessionsCount =
              week?.sessions.filter((s) => s.dayOfWeek === dayOfWeek && s.sport !== "REST").length ?? 0;
            return (
              <button
                key={dayOfWeek}
                onClick={() => setSelectedDay(dayOfWeek)}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border transition-colors ${
                  isActive
                    ? "border-brand-500 bg-brand-500/10 text-brand-400"
                    : "border-surface-700 bg-surface-850 text-surface-400 hover:text-surface-200 hover:border-surface-600"
                }`}
              >
                <span className="text-xs font-medium">{label.slice(0, 3)}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-0 data-[has-session=true]:opacity-100" data-has-session={sessionsCount > 0} />
              </button>
            );
          })}
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
