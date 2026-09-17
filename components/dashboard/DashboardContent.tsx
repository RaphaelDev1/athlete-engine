"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Heart,
  TrendingUp,
  Dumbbell,
  Timer,
  Calendar,
  ArrowRight,
  RefreshCw,
  Waves,
  Bike,
  Footprints,
  Sparkles,
} from "lucide-react";
import { Card, CardHeader, CardTitle, StatCard, Badge, EmptyState, Button } from "@/components/ui";
import { TrendLineChart } from "@/components/charts/TrendLineChart";
import { ReadinessBanner } from "./ReadinessBanner";
import { OvertrainingWarning } from "./OvertrainingWarning";
import { TrainingLoadCard } from "./TrainingLoadCard";
import { AdaptationActionsCard, AdaptationActionView } from "./AdaptationActionsCard";
import { CheckInPromptCard } from "@/components/checkin/CheckInPromptCard";
import { WeighInPromptCard } from "./WeighInPromptCard";
import { CheckInModal } from "@/components/checkin/CheckInModal";
import { CheckInFormValues } from "@/lib/validations/checkin";
import { formatSecondsToTime } from "@/lib/utils/time";
import { SPORT_COLOR, SPORT_ICON, SPORT_LABEL, STATUS_LABELS, formatDuration } from "@/components/training/sessionMeta";
import { AthleteState } from "@/lib/engine/labels";
import Link from "next/link";

interface PersonalRecordRow {
  id: string;
  discipline: "RUNNING" | "STRENGTH" | "CYCLING" | "SWIMMING";
  exercise: string;
  value: number;
  unit: string;
  achievedAt: string | null;
}

interface SessionRow {
  id: string;
  title: string;
  sport: keyof typeof SPORT_ICON;
  status: "PLANNED" | "COMPLETED" | "PARTIAL" | "SKIPPED" | "RESCHEDULED";
  scheduledDate: string;
  duration: number | null;
  targetDistance: number | null;
}

interface DashboardData {
  profile: {
    weight: number | null;
    vo2max: number | null;
    restingHR: number | null;
    weeklyVolume: number | null;
  } | null;
  weightHistory: { date: string; value: number }[];
  vo2maxHistory: { date: string; value: number | null }[];
  restingHrHistory: { date: string; value: number | null }[];
  personalRecords: PersonalRecordRow[];
  garmin:
    | { connected: false }
    | {
        connected: true;
        sleep: { score: number | null } | null;
        sleepTrend: { date: string; value: number | null }[];
        hrv: {
          latest: number | null;
          sevenDayAvg: number | null;
          trend: { date: string; value: number | null }[];
        };
        bodyBattery: { value: number | null } | null;
      };
  trainingLoad: { acute: number; chronic: number; ratio: number | null };
  readiness: {
    athleteState: AthleteState;
    loadMultiplier: number;
    reasons: string[];
  };
  checkInToday: {
    energy: number;
    soreness: boolean;
    motivation: number;
    stress: number;
    badEating: boolean;
  } | null;
  adaptationActions: AdaptationActionView[];
  predictions: PredictionsData;
  nextSession: SessionRow | null;
  recentSessions: SessionRow[];
  lastWeightLogDate: string | null;
  activitiesThisWeek: ActivitySportSummary[];
  intervals: {
    configured: boolean;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
  };
  garminStatus: {
    configured: boolean;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
  };
}

interface StrengthProjection {
  exercise: string;
  currentValue: number;
  currentAchievedAt: string;
  projectedValue: number;
  projectedDate: string;
  weeklyRateKg: number;
}

interface PredictionsData {
  horizonDays: number;
  run5kSec: number | null;
  swim750mSec: number | null;
  bike20kSec: number | null;
  strength: StrengthProjection[];
}

interface ActivitySportSummary {
  sport: "RUNNING" | "CYCLING" | "SWIMMING" | "STRENGTH";
  sessions: number;
  totalDistanceKm: number | null;
  totalDurationMin: number | null;
  avgPaceSecPerKm: number | null;
  avgSpeedKph: number | null;
}

// Allure/vitesse dans l'unité qui a du sens par sport — natation en /100m
// (convention du milieu), course en /km, vélo en km/h.
function formatActivityPace(summary: ActivitySportSummary): string {
  if (summary.sport === "SWIMMING" && summary.avgPaceSecPerKm) {
    return `${formatSecondsToTime(summary.avgPaceSecPerKm / 10)} /100m`;
  }
  if (summary.avgPaceSecPerKm) {
    return `${formatSecondsToTime(summary.avgPaceSecPerKm)} /km`;
  }
  if (summary.avgSpeedKph) {
    return `${summary.avgSpeedKph.toFixed(1)} km/h`;
  }
  return "—";
}

function formatKm(value: number | null): string {
  return value !== null ? `${value.toFixed(1)} km` : "—";
}

function groupRecordsByExercise(records: PersonalRecordRow[]) {
  const groups = new Map<string, PersonalRecordRow[]>();
  for (const r of records) {
    const key = `${r.discipline}:${r.exercise}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  return Array.from(groups.entries()).map(([key, list]) => ({
    key,
    exercise: list[0].exercise,
    discipline: list[0].discipline,
    unit: list[0].unit,
    points: list
      .slice()
      .sort((a, b) => new Date(a.achievedAt ?? 0).getTime() - new Date(b.achievedAt ?? 0).getTime()),
  }));
}

// La direction d'amélioration dépend de l'unité (même règle que
// lib/engine/adaptation.ts::isImprovement, dupliquée ici côté client pour
// éviter d'exposer un module serveur au bundle client) : secondes = plus
// petit est meilleur (temps), tout le reste = plus grand est meilleur.
function DeltaBadge({ unit, points }: { unit: string; points: { value: number }[] }) {
  if (points.length < 2) return null;
  const previous = points[points.length - 2].value;
  const latest = points[points.length - 1].value;
  const improved = unit === "seconds" ? latest < previous : latest > previous;
  const diff = latest - previous;
  const diffLabel = unit === "seconds" ? `${diff > 0 ? "+" : ""}${Math.round(diff)}s` : `${diff > 0 ? "+" : ""}${diff}`;
  return (
    <span className={`text-xs font-medium ${improved ? "text-success-400" : "text-warning-400"}`}>
      {diffLabel} vs précédent
    </span>
  );
}

export function DashboardContent() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [postponing, setPostponing] = useState(false);

  async function load() {
    const res = await fetch("/api/dashboard");
    setData(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Un seul bouton "Synchroniser" déclenche Garmin Connect et Intervals.icu
  // en parallèle puis recharge /api/dashboard : toutes les rubriques (recup,
  // séances, charge d'entraînement...) se mettent à jour d'un coup, plutôt
  // que d'obliger l'utilisateur à synchroniser chaque source séparément.
  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    const requests: Promise<Response>[] = [];
    if (data?.garminStatus.configured) {
      requests.push(fetch("/api/garmin/sync", { method: "POST" }));
    }
    if (data?.intervals.configured) {
      requests.push(fetch("/api/intervals/sync", { method: "POST" }));
    }
    try {
      const results = await Promise.all(requests);
      const failed = results.some((res) => !res.ok);
      if (failed) setSyncError("Une des synchronisations a échoué.");
    } catch {
      setSyncError("La synchronisation a échoué.");
    }
    await load();
    setSyncing(false);
  }

  async function handlePostpone() {
    setPostponing(true);
    try {
      await fetch("/api/training/postpone", { method: "POST" });
      await load();
    } finally {
      setPostponing(false);
    }
  }

  async function handleCheckInSave(values: CheckInFormValues) {
    await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setCheckInModalOpen(false);
    await load();
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-surface-800/60 rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-surface-800/60 animate-pulse" />
          ))}
        </div>
        <div className="h-40 rounded-xl bg-surface-800/60 animate-pulse" />
      </div>
    );
  }

  const strengthGroups = groupRecordsByExercise(
    data.personalRecords.filter((r) => r.discipline === "STRENGTH")
  );
  const runningGroups = groupRecordsByExercise(
    data.personalRecords.filter((r) => r.discipline === "RUNNING")
  );
  const cyclingGroups = groupRecordsByExercise(
    data.personalRecords.filter((r) => r.discipline === "CYCLING")
  );
  const swimmingGroups = groupRecordsByExercise(
    data.personalRecords.filter((r) => r.discipline === "SWIMMING")
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-100">Dashboard</h1>
          <p className="text-sm text-surface-400 mt-1">
            Vue d&apos;ensemble de tes performances et métriques
          </p>
        </div>
        {(data.garminStatus.configured || data.intervals.configured) && (
          <div className="flex flex-col items-end gap-1">
            <Button variant="secondary" size="sm" onClick={handleSync} loading={syncing}>
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              Synchroniser
            </Button>
            {(data.garminStatus.lastSyncAt || data.intervals.lastSyncAt) && (
              <span className="text-xs text-surface-500">
                Dernière sync :{" "}
                {new Date(
                  [data.garminStatus.lastSyncAt, data.intervals.lastSyncAt]
                    .filter((d): d is string => Boolean(d))
                    .sort()
                    .at(-1)!
                ).toLocaleString("fr-FR")}
              </span>
            )}
          </div>
        )}
      </div>

      {(syncError || data.garminStatus.lastSyncError || data.intervals.lastSyncError) && (
        <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm text-danger-400">
          {syncError ?? data.garminStatus.lastSyncError ?? data.intervals.lastSyncError}
        </div>
      )}

      <ReadinessBanner
        athleteState={data.readiness.athleteState}
        loadMultiplier={data.readiness.loadMultiplier}
        reasons={data.readiness.reasons}
      />

      <OvertrainingWarning
        athleteState={data.readiness.athleteState}
        reasons={data.readiness.reasons}
        onPostpone={handlePostpone}
        postponing={postponing}
      />

      <CheckInPromptCard
        checkIn={data.checkInToday}
        onOpen={() => setCheckInModalOpen(true)}
      />

      <WeighInPromptCard lastWeightLogDate={data.lastWeightLogDate} onSaved={load} />

      <AdaptationActionsCard actions={data.adaptationActions} onApplied={load} />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="VO2max"
          value={data.profile?.vo2max ?? "—"}
          unit="ml/kg/min"
          icon={Activity}
        />
        <StatCard
          label="FC repos"
          value={data.profile?.restingHR ?? "—"}
          unit="bpm"
          icon={Heart}
        />
        <StatCard
          label="Volume hebdo"
          value={data.profile?.weeklyVolume ?? "—"}
          unit="km"
          icon={TrendingUp}
        />
        <StatCard
          label="Poids"
          value={data.profile?.weight ?? "—"}
          unit="kg"
          icon={Dumbbell}
        />
      </div>

      {/* Prédictions de performance — VDOT (course), CSS (natation), physique
          FTP (vélo), régression sur l'historique (muscu). Cf. lib/engine/predictions.ts */}
      <Card padding="lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-500" />
            <CardTitle>Prédictions</CardTitle>
          </div>
        </CardHeader>

        {!data.predictions.run5kSec &&
        !data.predictions.swim750mSec &&
        !data.predictions.bike20kSec &&
        data.predictions.strength.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Pas encore assez de données"
            description="Renseigne ton VO2max/allure seuil, ta FTP, ton allure 100m et au moins deux PR de musculation dans ton profil pour débloquer les prédictions."
            action={
              <Link href="/profile">
                <Button size="sm">Compléter mon profil</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <PredictionTile
              icon={Footprints}
              label="5 km course"
              value={data.predictions.run5kSec ? formatSecondsToTime(data.predictions.run5kSec) : null}
              sub={
                data.predictions.run5kSec
                  ? `${formatSecondsToTime(data.predictions.run5kSec / 5)}/km`
                  : "VO2max ou allure seuil manquants"
              }
            />
            <PredictionTile
              icon={Waves}
              label="750 m natation"
              value={data.predictions.swim750mSec ? formatSecondsToTime(data.predictions.swim750mSec) : null}
              sub={
                data.predictions.swim750mSec
                  ? `${formatSecondsToTime((data.predictions.swim750mSec / 750) * 100)}/100m`
                  : "Allure 100m ou PR 400m manquants"
              }
            />
            <PredictionTile
              icon={Bike}
              label="20 km vélo"
              value={data.predictions.bike20kSec ? formatSecondsToTime(data.predictions.bike20kSec) : null}
              sub={
                data.predictions.bike20kSec
                  ? `${(20 / (data.predictions.bike20kSec / 3600)).toFixed(1)} km/h moy.`
                  : "FTP manquante"
              }
            />
          </div>
        )}

        {data.predictions.strength.length > 0 && (
          <div className="mt-4 pt-4 border-t border-surface-700/60">
            <p className="text-xs font-medium text-surface-400 mb-2">
              PR potentiels d&apos;ici {data.predictions.horizonDays} jours (à rythme de progression
              constant)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.predictions.strength.map((p) => (
                <div
                  key={p.exercise}
                  className="flex items-center justify-between p-3 rounded-lg bg-surface-850 border border-surface-700/50"
                >
                  <div>
                    <p className="text-sm font-medium text-surface-100">{p.exercise}</p>
                    <p className="text-xs text-surface-500">
                      Actuel : {p.currentValue} kg
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-brand-400">{p.projectedValue} kg</p>
                    <p className="text-xs text-surface-500">
                      {p.weeklyRateKg > 0 ? `+${p.weeklyRateKg}` : p.weeklyRateKg} kg/sem.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Séances de la semaine par sport (Intervals.icu) — vue façon Strava */}
      <Card padding="lg">
        <CardHeader>
          <CardTitle>Séances de la semaine</CardTitle>
          <div className="flex items-center gap-2">
            {data.intervals.lastSyncAt && (
              <span className="text-xs text-surface-500">
                Sync {new Date(data.intervals.lastSyncAt).toLocaleString("fr-FR")}
              </span>
            )}
            {data.intervals.configured && (
              <button
                onClick={handleSync}
                disabled={syncing}
                title="Synchroniser"
                className="p-1.5 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800 disabled:opacity-40 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              </button>
            )}
          </div>
        </CardHeader>

        {!data.intervals.configured ? (
          <EmptyState
            icon={Activity}
            title="Intervals.icu non connecté"
            description="Renseigne les identifiants Intervals.icu dans la configuration serveur pour importer tes activités réelles."
          />
        ) : data.activitiesThisWeek.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="Pas encore d'activité cette semaine"
            description="Synchronise Intervals.icu pour voir tes séances vélo/natation/course/muscu, comme sur Strava."
            action={
              <Button size="sm" onClick={handleSync} loading={syncing}>
                <RefreshCw className="w-4 h-4" />
                Synchroniser
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-surface-500 uppercase tracking-wider border-b border-surface-800">
                  <th className="py-2 pr-3 font-medium">Sport</th>
                  <th className="py-2 pr-3 font-medium">Séances</th>
                  <th className="py-2 pr-3 font-medium">Distance</th>
                  <th className="py-2 pr-3 font-medium">Durée</th>
                  <th className="py-2 pr-3 font-medium">Allure / vitesse moy.</th>
                </tr>
              </thead>
              <tbody>
                {data.activitiesThisWeek.map((summary) => {
                  const Icon = SPORT_ICON[summary.sport];
                  return (
                    <tr
                      key={summary.sport}
                      className="border-b border-surface-800/60 last:border-b-0"
                    >
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-6 rounded-full ${SPORT_COLOR[summary.sport]}`} />
                          <Icon className="w-4 h-4 text-surface-400" />
                          <span className="text-surface-200">{SPORT_LABEL[summary.sport]}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-surface-300">{summary.sessions}</td>
                      <td className="py-2.5 pr-3 text-surface-300 whitespace-nowrap">
                        {formatKm(summary.totalDistanceKm)}
                      </td>
                      <td className="py-2.5 pr-3 text-surface-300 whitespace-nowrap">
                        {formatDuration(summary.totalDurationMin)}
                      </td>
                      <td className="py-2.5 pr-3 text-surface-300 whitespace-nowrap">
                        {formatActivityPace(summary)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Training load + next session */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TrainingLoadCard {...data.trainingLoad} />

        <Card padding="lg" className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Prochaine séance</CardTitle>
            {data.nextSession && <Badge variant="brand">À venir</Badge>}
          </CardHeader>

          {!data.nextSession ? (
            <EmptyState
              icon={Calendar}
              title="Aucune séance planifiée"
              description="Génère un plan d'entraînement depuis un objectif pour voir apparaître ta prochaine séance ici."
            />
          ) : (
            <div className="bg-surface-850 rounded-lg p-5 border border-surface-700/50">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-lg font-semibold text-surface-100">
                    {data.nextSession.title}
                  </h4>
                </div>
                <div className="p-3 rounded-lg bg-brand-500/10">
                  <Dumbbell className="w-6 h-6 text-brand-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5">
                <MiniStat
                  icon={Timer}
                  label="Durée"
                  value={formatDuration(data.nextSession.duration)}
                />
                <MiniStat
                  icon={Activity}
                  label="Distance"
                  value={data.nextSession.targetDistance ? `${data.nextSession.targetDistance} km` : "—"}
                />
                <MiniStat
                  icon={Calendar}
                  label="Date"
                  value={new Date(data.nextSession.scheduledDate).toLocaleDateString("fr-FR", {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                  })}
                />
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Progression charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card padding="lg">
          <CardHeader>
            <CardTitle>Poids — 90 jours</CardTitle>
          </CardHeader>
          {data.weightHistory.length > 0 ? (
            <TrendLineChart data={data.weightHistory} unit="kg" color="#22c55e" />
          ) : (
            <EmptyState
              icon={TrendingUp}
              title="Pas encore de données"
              description="Renseigne ton poids dans ton profil pour suivre sa progression."
            />
          )}
        </Card>

        <Card padding="lg">
          <CardHeader>
            <CardTitle>VO2max — 90 jours</CardTitle>
          </CardHeader>
          {data.vo2maxHistory.filter((d) => d.value !== null).length > 0 ? (
            <TrendLineChart data={data.vo2maxHistory} unit="ml/kg/min" color="#3b82f6" />
          ) : (
            <EmptyState
              icon={Activity}
              title="Pas encore de données"
              description="Connecte Garmin pour suivre ta VO2max au fil du temps."
            />
          )}
        </Card>

        <Card padding="lg">
          <CardHeader>
            <CardTitle>FC repos — 90 jours</CardTitle>
          </CardHeader>
          {data.restingHrHistory.filter((d) => d.value !== null).length > 0 ? (
            <TrendLineChart data={data.restingHrHistory} unit="bpm" color="#ef4444" />
          ) : (
            <EmptyState
              icon={Heart}
              title="Pas encore de données"
              description="Connecte Garmin pour suivre ta FC repos au fil du temps."
            />
          )}
        </Card>
      </div>

      {(strengthGroups.length > 0 ||
        runningGroups.length > 0 ||
        cyclingGroups.length > 0 ||
        swimmingGroups.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {strengthGroups.map((group) => (
            <Card padding="lg" key={group.key}>
              <CardHeader>
                <CardTitle>{group.exercise} — 1RM</CardTitle>
                <DeltaBadge unit={group.unit} points={group.points} />
              </CardHeader>
              <TrendLineChart
                data={group.points.map((p) => ({ date: p.achievedAt ?? "", value: p.value }))}
                unit="kg"
                color="#f97316"
              />
            </Card>
          ))}
          {runningGroups.map((group) => (
            <Card padding="lg" key={group.key}>
              <CardHeader>
                <CardTitle>
                  {group.exercise} — {group.unit === "seconds" ? "allure" : "vitesse"}
                </CardTitle>
                <DeltaBadge unit={group.unit} points={group.points} />
              </CardHeader>
              <TrendLineChart
                data={group.points.map((p) => ({ date: p.achievedAt ?? "", value: p.value }))}
                formatValue={
                  group.unit === "seconds"
                    ? (v) => formatSecondsToTime(v) ?? `${v}`
                    : (v) => `${v} km/h`
                }
                color="#eab308"
              />
            </Card>
          ))}
          {cyclingGroups.map((group) => (
            <Card padding="lg" key={group.key}>
              <CardHeader>
                <CardTitle>{group.exercise}</CardTitle>
                <DeltaBadge unit={group.unit} points={group.points} />
              </CardHeader>
              <TrendLineChart
                data={group.points.map((p) => ({ date: p.achievedAt ?? "", value: p.value }))}
                unit="watts"
                color="#22c55e"
              />
            </Card>
          ))}
          {swimmingGroups.map((group) => (
            <Card padding="lg" key={group.key}>
              <CardHeader>
                <CardTitle>{group.exercise} — natation</CardTitle>
                <DeltaBadge unit={group.unit} points={group.points} />
              </CardHeader>
              <TrendLineChart
                data={group.points.map((p) => ({ date: p.achievedAt ?? "", value: p.value }))}
                formatValue={(v) => formatSecondsToTime(v) ?? `${v}`}
                color="#06b6d4"
              />
            </Card>
          ))}
        </div>
      )}

      {/* Sommeil / HRV 30j */}
      {data.garmin.connected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card padding="lg">
            <CardHeader>
              <CardTitle>Sommeil — 30 jours</CardTitle>
            </CardHeader>
            {data.garmin.sleepTrend.length > 0 ? (
              <TrendLineChart data={data.garmin.sleepTrend} unit="/100" color="#8b5cf6" />
            ) : (
              <p className="text-sm text-surface-500">Pas encore de donnée de sommeil.</p>
            )}
          </Card>
          <Card padding="lg">
            <CardHeader>
              <CardTitle>HRV — 30 jours</CardTitle>
            </CardHeader>
            {data.garmin.hrv.trend.length > 0 ? (
              <TrendLineChart data={data.garmin.hrv.trend} unit="ms" color="#06b6d4" />
            ) : (
              <p className="text-sm text-surface-500">Pas encore de donnée HRV.</p>
            )}
          </Card>
        </div>
      )}

      {/* Recent sessions */}
      <Card padding="lg">
        <CardHeader>
          <CardTitle>Séances récentes</CardTitle>
          <Link
            href="/training"
            className="text-sm text-brand-500 hover:text-brand-400 flex items-center gap-1 transition-colors"
          >
            Voir tout
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>

        {data.recentSessions.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="Pas encore de séance complétée"
            description="Tes séances terminées apparaîtront ici une fois ton plan d'entraînement en cours."
          />
        ) : (
          <div className="space-y-2">
            {data.recentSessions.map((session) => {
              const status = STATUS_LABELS[session.status] || STATUS_LABELS.PLANNED;
              return (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-surface-850 hover:bg-surface-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-1 h-10 rounded-full ${SPORT_COLOR[session.sport]}`} />
                    <div>
                      <p className="text-sm font-medium text-surface-100">{session.title}</p>
                      <p className="text-xs text-surface-500">
                        {new Date(session.scheduledDate).toLocaleDateString("fr-FR")} ·{" "}
                        {formatDuration(session.duration)}
                      </p>
                    </div>
                  </div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <QuickLink href="/profile" icon={Heart} title="Profil" description="Biométrie, PRs, zones" />
        <QuickLink href="/goals" icon={Activity} title="Objectifs" description="Gérer tes objectifs" />
        <QuickLink
          href="/recovery"
          icon={Calendar}
          title="Récupération"
          description="Sommeil, HRV, Battery"
        />
      </div>

      <CheckInModal
        isOpen={checkInModalOpen}
        onClose={() => setCheckInModalOpen(false)}
        onSave={handleCheckInSave}
      />
    </div>
  );
}

function PredictionTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Waves;
  label: string;
  value: string | null;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-850 border border-surface-700/50">
      <div className="p-2 rounded-lg bg-brand-500/10 flex-shrink-0">
        <Icon className="w-4 h-4 text-brand-500" />
      </div>
      <div>
        <p className="text-xs text-surface-500">{label}</p>
        <p className="text-lg font-semibold text-surface-100">{value ?? "—"}</p>
        <p className="text-xs text-surface-500">{sub}</p>
      </div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Timer;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="w-4 h-4 text-surface-500 flex-shrink-0" />
      <div>
        <p className="text-[11px] text-surface-500 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium text-surface-200">{value}</p>
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof Heart;
  title: string;
  description: string;
}) {
  return (
    <Link href={href}>
      <Card hover padding="md" className="group cursor-pointer">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-500/10 group-hover:bg-brand-500/20 transition-colors">
            <Icon className="w-4 h-4 text-brand-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-surface-100">{title}</p>
            <p className="text-xs text-surface-500">{description}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
