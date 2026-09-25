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
import { computeNapAdvice, NapSessionAdvice, ReadinessLevel } from "@/lib/engine/garminAdaptation";

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
      napDurationInSeconds?: number;
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

const NAP_SESSION_LABEL: Record<NapSessionAdvice, string> = {
  NORMAL_SESSION: "Séance normale possible",
  SMALL_SESSION_OK: "Petite séance possible après la sieste",
  REST_ONLY: "Pas de séance aujourd'hui",
};

const NAP_SESSION_BADGE: Record<NapSessionAdvice, "success" | "info" | "warning" | "danger"> = {
  NORMAL_SESSION: "success",
  SMALL_SESSION_OK: "info",
  REST_ONLY: "warning",
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

interface NapEntry {
  date: string;
  minutes: number | null;
  source: "garmin" | "declaree";
}

function RecoveryContent() {
  const [status, setStatus] = useState<GarminStatus | null>(null);
  const [summary, setSummary] = useState<GarminSummary | null>(null);
  const [correlation, setCorrelation] = useState<SleepCorrelationPoint[]>([]);
  const [naps, setNaps] = useState<NapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    const [statusRes, summaryRes, sleep30Res, checkinRes, nutrition30Res] = await Promise.all([
      fetch("/api/garmin/status"),
      fetch("/api/garmin/summary"),
      fetch("/api/garmin/summary?days=30"),
      fetch("/api/checkin"),
      fetch("/api/nutrition/day?days=30"),
    ]);
    setStatus(await statusRes.json());
    setSummary(await summaryRes.json());

    const sleep30: {
      sleepTrend?: { date: string; value: number | null; napMinutes: number | null }[];
      stressTrend?: { date: string; value: number | null }[];
    } = await sleep30Res.json();
    const checkin: {
      history?: {
        date: string;
        stress: number;
        sleepQuality: number | null;
        napTaken: boolean;
        napDurationMin: number | null;
      }[];
    } = await checkinRes.json();
    const nutrition30: {
      history?: { date: string; badEating: boolean }[];
    } = await nutrition30Res.json();

    const sleepByDate = new Map((sleep30.sleepTrend ?? []).map((d) => [dbDateKey(d.date), d]));
    const stressByDate = new Map((sleep30.stressTrend ?? []).map((d) => [dbDateKey(d.date), d]));
    const checkinByDate = new Map((checkin.history ?? []).map((c) => [dbDateKey(c.date), c]));
    const badEatingByDate = new Map(
      (nutrition30.history ?? []).map((n) => [dbDateKey(n.date), n.badEating])
    );
    const dates = Array.from(
      new Set([
        ...Array.from(sleepByDate.keys()),
        ...Array.from(stressByDate.keys()),
        ...Array.from(checkinByDate.keys()),
        ...Array.from(badEatingByDate.keys()),
      ])
    ).sort();

    // Une sieste peut venir de Garmin (napMinutes) ou d'une déclaration
    // manuelle au check-in (napTaken/napDurationMin) — les deux sont
    // indépendantes (Garmin peut manquer une sieste hors capteur), donc on
    // les additionne plutôt que de n'en garder qu'une.
    const napEntries: NapEntry[] = [];
    setCorrelation(
      dates.map((date) => {
        const garminDay = sleepByDate.get(date);
        const checkinDay = checkinByDate.get(date);
        const garminNap = garminDay?.napMinutes ?? null;
        const declaredNap = checkinDay?.napTaken ? checkinDay.napDurationMin ?? 0 : null;
        if (garminNap) napEntries.push({ date, minutes: garminNap, source: "garmin" });
        if (declaredNap !== null) napEntries.push({ date, minutes: declaredNap || null, source: "declaree" });
        const napMinutes = (garminNap ?? 0) + (declaredNap ?? 0);

        return {
          date,
          sleepScore: garminDay?.value ?? null,
          napMinutes: napMinutes > 0 ? napMinutes : null,
          stressScore: stressByDate.get(date)?.value ?? null,
          badEating: badEatingByDate.get(date) ?? false,
        };
      })
    );
    setNaps(napEntries.sort((a, b) => (a.date < b.date ? 1 : -1)));

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
          {correlation.some(
            (d) => d.sleepScore !== null || d.stressScore !== null
          ) ? (
            <SleepCorrelationChart data={correlation} />
          ) : (
            <p className="text-sm text-surface-500">
              Pas encore assez de données — synchronise Garmin et fais tes check-ins quotidiens
              pour voir apparaître les liens entre sommeil, stress et alimentation.
            </p>
          )}
        </Card>
      )}

      {!loading && naps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Siestes — 30 jours</CardTitle>
          </CardHeader>
          <p className="text-xs text-surface-500 mb-3">
            {naps.length} sieste{naps.length > 1 ? "s" : ""} · total{" "}
            {formatDuration(naps.reduce((sum, n) => sum + (n.minutes ?? 0) * 60, 0))}
          </p>
          <ul className="space-y-1.5">
            {naps.map((nap, i) => (
              <li
                key={`${nap.date}-${nap.source}-${i}`}
                className="flex items-center justify-end gap-2 text-sm"
              >
                <span className="text-surface-100 tabular-nums">
                  {nap.minutes != null ? `${nap.minutes} min` : "—"}
                </span>
                <Badge variant={nap.source === "garmin" ? "info" : "success"}>
                  {nap.source === "garmin" ? "Garmin" : "Déclarée"}
                </Badge>
              </li>
            ))}
          </ul>
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
            {(() => {
              const durationSec = summary.sleep?.payload.durationInSeconds;
              const napAdvice = computeNapAdvice({
                sleepDurationMin: durationSec ? Math.round(durationSec / 60) : null,
                bodyBattery: summary.bodyBattery?.value ?? null,
                recoveryLevel: summary.recoveryStatus.level,
              });
              return (
                <div className="mt-3 pt-3 border-t border-surface-800 flex items-start gap-2.5">
                  <Moon className="w-4 h-4 text-brand-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-surface-300">{napAdvice.message}</p>
                    <Badge
                      variant={NAP_SESSION_BADGE[napAdvice.sessionAdvice]}
                      className="mt-1.5"
                    >
                      {NAP_SESSION_LABEL[napAdvice.sessionAdvice]}
                    </Badge>
                  </div>
                </div>
              );
            })()}
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
                  {(summary.sleep?.payload.napDurationInSeconds ?? 0) > 0 && (
                    <div className="pt-2 mt-2 border-t border-surface-800">
                      <div className="flex justify-between text-xs text-surface-400 mb-1">
                        <span>Sieste</span>
                        <span>{formatDuration(summary.sleep?.payload.napDurationInSeconds)}</span>
                      </div>
                    </div>
                  )}
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
