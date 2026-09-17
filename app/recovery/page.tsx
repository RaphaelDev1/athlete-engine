"use client";

import { Suspense, useEffect, useState } from "react";
import {
  Moon,
  Battery,
  HeartPulse,
  Gauge,
  Activity,
  Wind,
  RefreshCw,
} from "lucide-react";
import { Card, CardHeader, CardTitle, Badge, Button, EmptyState } from "@/components/ui";
import { HrvTrendChart } from "@/components/recovery/HrvTrendChart";
import { SleepCorrelationChart, SleepCorrelationPoint } from "@/components/recovery/SleepCorrelationChart";
import { ReadinessLevel } from "@/lib/engine/garminAdaptation";

interface GarminSummary {
  connected: boolean;
  sleep: {
    score: number | null;
    date: string;
    payload: {
      deepSleepDurationInSeconds?: number;
      lightSleepDurationInSeconds?: number;
      remSleepInSeconds?: number;
      awakeDurationInSeconds?: number;
      durationInSeconds?: number;
    };
  } | null;
  hrv: {
    latest: number | null;
    sevenDayAvg: number | null;
    trend: { date: string; value: number | null }[];
  };
  bodyBattery: { value: number | null; date: string } | null;
  trainingReadiness: {
    score: number | null;
    level: string | null;
    feedback: string | null;
    date: string;
  } | null;
  stress: { value: number | null; date: string } | null;
  vo2max: { value: number | null; date: string } | null;
  recoveryStatus: {
    level: ReadinessLevel;
    loadMultiplier: number;
    reasons: string[];
  };
}

interface GarminStatus {
  configured: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

const LEVEL_BADGE: Record<ReadinessLevel, "success" | "info" | "warning" | "danger"> = {
  READY: "success",
  MAINTAIN: "info",
  CAUTION: "warning",
  REST: "danger",
};

const LEVEL_LABEL: Record<ReadinessLevel, string> = {
  READY: "Prêt à pousser",
  MAINTAIN: "Maintenir le plan",
  CAUTION: "Prudence",
  REST: "Repos conseillé",
};

function formatDuration(seconds?: number): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}min`;
}

export default function RecoveryPage() {
  return (
    <Suspense fallback={<p className="text-sm text-surface-500">Chargement…</p>}>
      <RecoveryContent />
    </Suspense>
  );
}

// "YYYY-MM-DD" à partir d'une date @db.Date sérialisée en JSON (toujours
// minuit UTC côté Prisma) — un simple slice évite tout souci de fuseau,
// contrairement à une reconstruction via new Date(...).getDate() côté client.
function dbDateKey(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

function RecoveryContent() {
  const [status, setStatus] = useState<GarminStatus | null>(null);
  const [summary, setSummary] = useState<GarminSummary | null>(null);
  const [correlation, setCorrelation] = useState<SleepCorrelationPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    const [statusRes, summaryRes, sleep30Res, checkinRes] = await Promise.all([
      fetch("/api/garmin/status"),
      fetch("/api/garmin/summary"),
      fetch("/api/garmin/summary?days=30"),
      fetch("/api/checkin"),
    ]);
    setStatus(await statusRes.json());
    setSummary(await summaryRes.json());

    const sleep30: { sleepTrend?: { date: string; value: number | null }[] } = await sleep30Res.json();
    const checkin: {
      history?: { date: string; stress: number; badEating: boolean }[];
    } = await checkinRes.json();

    const sleepByDate = new Map((sleep30.sleepTrend ?? []).map((d) => [dbDateKey(d.date), d.value]));
    const checkinByDate = new Map((checkin.history ?? []).map((c) => [dbDateKey(c.date), c]));
    const dates = Array.from(
      new Set([...Array.from(sleepByDate.keys()), ...Array.from(checkinByDate.keys())])
    ).sort();

    setCorrelation(
      dates.map((date) => ({
        date,
        sleepScore: sleepByDate.get(date) ?? null,
        stress: checkinByDate.get(date)?.stress ?? null,
        badEating: checkinByDate.get(date)?.badEating ?? false,
      }))
    );

    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    const res = await fetch("/api/garmin/sync", { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setSyncError(body?.error ?? "La synchronisation a échoué.");
    }
    await loadData();
    setSyncing(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-100">Récupération</h1>
          <p className="text-sm text-surface-400 mt-1">
            Sommeil, HRV, Body Battery et Training Readiness
          </p>
        </div>
        {status?.configured && (
          <div className="flex flex-col items-end gap-1">
            <Button variant="secondary" size="sm" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              Synchroniser
            </Button>
            {status.lastSyncAt && (
              <span className="text-xs text-surface-500">
                Dernière sync : {new Date(status.lastSyncAt).toLocaleString("fr-FR")}
              </span>
            )}
          </div>
        )}
      </div>

      {(syncError || status?.lastSyncError) && (
        <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm text-danger-400">
          {syncError ?? status?.lastSyncError}
        </div>
      )}

      {loading && (
        <p className="text-sm text-surface-500">Chargement…</p>
      )}

      {!loading && !status?.configured && (
        <EmptyState
          icon={Moon}
          title="Garmin non configuré"
          description="Renseigne GARMIN_USERNAME et GARMIN_PASSWORD dans la configuration serveur pour activer la synchronisation."
        />
      )}

      {!loading && status?.configured && !summary?.connected && (
        <EmptyState
          icon={Moon}
          title="Pas encore de données"
          description="Clique sur Synchroniser pour récupérer ton sommeil, ton HRV, ta Body Battery et ta Training Readiness."
          action={
            <Button onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              Synchroniser
            </Button>
          }
        />
      )}

      {!loading && (
        <Card>
          <CardHeader>
            <CardTitle>Sommeil vs stress vs écarts alimentaires — 30 jours</CardTitle>
          </CardHeader>
          {correlation.some((d) => d.sleepScore !== null || d.stress !== null) ? (
            <SleepCorrelationChart data={correlation} />
          ) : (
            <p className="text-sm text-surface-500">
              Pas encore assez de données — synchronise Garmin et fais tes check-ins quotidiens
              pour voir apparaître les liens entre sommeil, stress et alimentation.
            </p>
          )}
        </Card>
      )}

      {!loading && summary?.connected && (
        <>
          {/* Recommandation du jour */}
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-surface-500 mb-1">
                  Recommandation du jour
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant={LEVEL_BADGE[summary.recoveryStatus.level]}>
                    {LEVEL_LABEL[summary.recoveryStatus.level]}
                  </Badge>
                  <span className="text-xs text-surface-500">
                    charge suggérée × {summary.recoveryStatus.loadMultiplier}
                  </span>
                </div>
              </div>
            </div>
            <ul className="mt-3 space-y-1">
              {summary.recoveryStatus.reasons.map((reason) => (
                <li key={reason} className="text-xs text-surface-400">
                  · {reason}
                </li>
              ))}
            </ul>
          </Card>

          {/* Stats principales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card hover>
              <div className="flex items-start justify-between">
                <div>
                  <p className="stat-label">Sommeil</p>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="stat-value">{summary.sleep?.score ?? "—"}</span>
                    <span className="text-sm text-surface-400">/100</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-brand-500/10">
                  <Moon className="w-5 h-5 text-brand-500" />
                </div>
              </div>
            </Card>

            <Card hover>
              <div className="flex items-start justify-between">
                <div>
                  <p className="stat-label">Body Battery</p>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="stat-value">{summary.bodyBattery?.value ?? "—"}</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-success-500/10">
                  <Battery className="w-5 h-5 text-success-500" />
                </div>
              </div>
            </Card>

            <Card hover>
              <div className="flex items-start justify-between">
                <div>
                  <p className="stat-label">Training Readiness</p>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="stat-value">
                      {summary.trainingReadiness?.score ?? "—"}
                    </span>
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-info-500/10">
                  <Gauge className="w-5 h-5 text-info-500" />
                </div>
              </div>
            </Card>

            <Card hover>
              <div className="flex items-start justify-between">
                <div>
                  <p className="stat-label">VO2max</p>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="stat-value">{summary.vo2max?.value ?? "—"}</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-warning-500/10">
                  <Activity className="w-5 h-5 text-warning-500" />
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Phases de sommeil */}
            <Card>
              <CardHeader>
                <CardTitle>Phases de sommeil</CardTitle>
              </CardHeader>
              {summary.sleep ? (
                <div className="space-y-2">
                  {[
                    { label: "Profond", key: "deepSleepDurationInSeconds", color: "bg-info-500" },
                    { label: "Léger", key: "lightSleepDurationInSeconds", color: "bg-info-400" },
                    { label: "Paradoxal (REM)", key: "remSleepInSeconds", color: "bg-brand-500" },
                    { label: "Éveil", key: "awakeDurationInSeconds", color: "bg-surface-600" },
                  ].map((phase) => {
                    const seconds = summary.sleep?.payload[
                      phase.key as keyof typeof summary.sleep.payload
                    ] as number | undefined;
                    const total = summary.sleep?.payload.durationInSeconds ?? 1;
                    const pct = seconds ? Math.round((seconds / total) * 100) : 0;
                    return (
                      <div key={phase.key}>
                        <div className="flex justify-between text-xs text-surface-400 mb-1">
                          <span>{phase.label}</span>
                          <span>{formatDuration(seconds)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-surface-800 overflow-hidden">
                          <div
                            className={`h-full ${phase.color}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-surface-500">Pas encore de donnée de sommeil.</p>
              )}
            </Card>

            {/* HRV */}
            <Card>
              <CardHeader>
                <CardTitle>HRV — tendance 7 jours</CardTitle>
              </CardHeader>
              {summary.hrv.trend.length > 0 ? (
                <>
                  <div className="flex items-baseline gap-4 mb-2">
                    <div>
                      <span className="text-2xl font-bold text-surface-100 tabular-nums">
                        {summary.hrv.latest ?? "—"}
                      </span>
                      <span className="text-xs text-surface-500 ml-1">ms dernière nuit</span>
                    </div>
                    <div className="text-xs text-surface-500">
                      moy. 7j : {summary.hrv.sevenDayAvg?.toFixed(0) ?? "—"} ms
                    </div>
                  </div>
                  <HrvTrendChart data={summary.hrv.trend} />
                </>
              ) : (
                <p className="text-sm text-surface-500">Pas encore de donnée HRV.</p>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Stress moyen</CardTitle>
              </CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-warning-500/10">
                  <Wind className="w-5 h-5 text-warning-500" />
                </div>
                <span className="text-2xl font-bold text-surface-100 tabular-nums">
                  {summary.stress?.value ?? "—"}
                </span>
                <span className="text-xs text-surface-500">/100</span>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Training Readiness — détail</CardTitle>
              </CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-info-500/10">
                  <HeartPulse className="w-5 h-5 text-info-500" />
                </div>
                <div>
                  <p className="text-sm text-surface-200">
                    {summary.trainingReadiness?.level ?? "Pas de donnée"}
                  </p>
                  {summary.trainingReadiness?.feedback && (
                    <p className="text-xs text-surface-500 mt-0.5">
                      {summary.trainingReadiness.feedback}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
