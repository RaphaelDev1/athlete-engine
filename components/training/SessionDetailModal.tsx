"use client";

import { useEffect, useState } from "react";
import { formatPace } from "@/lib/engine/zones";
import { parseTimeToSeconds, formatSecondsToTime } from "@/lib/utils/time";
import { Badge, Button, Input, Select, Textarea } from "@/components/ui";
import { X, Clock, Ruler, Gauge, HeartPulse, ListChecks, CheckCircle2, TrendingUp, TrendingDown, Zap, Mountain, Activity as ActivityIcon } from "lucide-react";
import { formatDuration, SessionCardData, SPORT_ICON, SPORT_LABEL } from "./sessionMeta";

// Détection du test à partir du titre — un seul endroit les génère
// (lib/engine/templates/{running,strength,cycling,swimming}.ts), le titre
// exact est donc un identifiant stable.
type TestKind = "LUC_LEGER" | "ONE_RM" | "FTP" | "SWIM_400" | null;

// Dérivé de session.scheduledDate plutôt que DAY_LABELS[session.dayOfWeek] :
// dayOfWeek n'est qu'un index synthétique dans la semaine générée, plus
// forcément aligné sur le vrai jour calendaire une fois le plan reporté (cf.
// app/training/page.tsx::weekdayLabel).
function weekdayLabel(date: Date): string {
  const label = new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function detectTestKind(title: string): TestKind {
  if (title.includes("Luc Léger")) return "LUC_LEGER";
  if (title.includes("1RM")) return "ONE_RM";
  if (title.includes("FTP")) return "FTP";
  if (title.includes("400m chronométré")) return "SWIM_400";
  return null;
}

interface RealizedActivity {
  id: string;
  sport: string;
  name: string;
  startDate: string;
  movingTimeSec: number | null;
  distanceMeters: number | null;
  avgPaceSecPerKm: number | null;
  avgSpeedKph: number | null;
  avgHeartRate: number | null;
  avgPower: number | null;
  elevationGain: number | null;
}

function formatActivityPaceOrSpeed(a: RealizedActivity): string | null {
  if (a.sport === "SWIMMING" && a.avgPaceSecPerKm) {
    return `${formatSecondsToTime(a.avgPaceSecPerKm / 10)}/100m`;
  }
  if (a.avgPaceSecPerKm) return `${formatSecondsToTime(a.avgPaceSecPerKm)}/km`;
  if (a.avgSpeedKph) return `${a.avgSpeedKph.toFixed(1)} km/h`;
  return null;
}

interface TestResultDelta {
  exercise: string;
  unit: string;
  previousValue: number | null;
  newValue: number;
  improved: boolean;
}

function formatTestValue(value: number, unit: string): string {
  return unit === "seconds" ? formatSecondsToTime(value) ?? `${value}` : `${value} ${unit}`;
}

interface SessionDetailModalProps<T extends SessionCardData> {
  session: T | null;
  onClose: () => void;
  /** Appelé après un log réussi (PATCH /api/training/sessions/[id]) — absent si la séance n'est pas persistée (ex. semaine de référence nutrition). */
  onLogged?: () => void;
}

const LOG_STATUS_OPTIONS = [
  { value: "COMPLETED", label: "Fait" },
  { value: "PARTIAL", label: "Partiel" },
  { value: "SKIPPED", label: "Raté" },
];

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function SessionDetailModal<T extends SessionCardData>({
  session,
  onClose,
  onLogged,
}: SessionDetailModalProps<T>) {
  const [logStatus, setLogStatus] = useState<"COMPLETED" | "PARTIAL" | "SKIPPED">("COMPLETED");
  const [actualDuration, setActualDuration] = useState<string>("");
  const [actualRPE, setActualRPE] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [testValues, setTestValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testDeltas, setTestDeltas] = useState<TestResultDelta[]>([]);
  const [realizedActivities, setRealizedActivities] = useState<RealizedActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  useEffect(() => {
    if (!session) return;
    setLogStatus("COMPLETED");
    setActualDuration(session.duration ? String(session.duration) : "");
    setActualRPE("");
    setNotes("");
    setTestValues({});
    setSaved(false);
    setTestDeltas([]);
    setRealizedActivities([]);

    // Activités Intervals.icu du même jour (cf. GET /api/training/sessions/[id])
    // — n'existe que pour une séance réellement persistée (id de plan réel),
    // absent pour les séances de référence non sauvegardées (ex. nutrition).
    setLoadingActivities(true);
    fetch(`/api/training/sessions/${session.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => setRealizedActivities(body?.activities ?? []))
      .catch(() => setRealizedActivities([]))
      .finally(() => setLoadingActivities(false));
  }, [session]);

  if (!session) return null;
  const Icon = SPORT_ICON[session.sport];
  const testKind = session.sessionType === "FITNESS_TEST" ? detectTestKind(session.title) : null;

  const canLog =
    onLogged !== undefined && session.status === "PLANNED" && session.scheduledDate <= startOfToday();

  async function submitLog() {
    if (!session) return;
    setSaving(true);
    try {
      const testResult: Record<string, number> = {};
      if (testKind === "LUC_LEGER" && testValues.vmaLucLeger) {
        testResult.vmaLucLeger = Number(testValues.vmaLucLeger);
      }
      if (testKind === "ONE_RM") {
        for (const key of ["prSquat", "prBench", "prDeadlift", "prOHP"] as const) {
          if (testValues[key]) testResult[key] = Number(testValues[key]);
        }
      }
      if (testKind === "FTP" && testValues.ftp) {
        testResult.ftp = Number(testValues.ftp);
      }
      if (testKind === "SWIM_400" && testValues.swim400m) {
        const seconds = parseTimeToSeconds(testValues.swim400m);
        if (seconds) testResult.swim400m = seconds;
      }

      const res = await fetch(`/api/training/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: logStatus,
          actualDuration: actualDuration ? Number(actualDuration) : null,
          actualRPE: actualRPE ? Number(actualRPE) : null,
          notes: notes || null,
          testResult: Object.keys(testResult).length > 0 ? testResult : null,
        }),
      });
      const body = await res.json().catch(() => null);
      setTestDeltas(body?.testDeltas ?? []);
      setSaved(true);
      onLogged?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-surface-900 border border-surface-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700 sticky top-0 bg-surface-900">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-brand-500/10 flex-shrink-0">
              <Icon className="w-4 h-4 text-brand-500" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-surface-100 truncate">
                {session.title}
              </h2>
              <p className="text-xs text-surface-500">
                {weekdayLabel(session.scheduledDate)} · {SPORT_LABEL[session.sport]}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-sm text-surface-400">{session.description}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetaStat icon={Clock} label="Durée" value={formatDuration(session.duration)} />
            <MetaStat
              icon={Ruler}
              label="Distance"
              value={session.targetDistance ? `${session.targetDistance} km` : "—"}
            />
            <MetaStat
              icon={Gauge}
              label="Allure"
              value={session.targetPace ? formatPace(session.targetPace) : "—"}
            />
            <MetaStat
              icon={HeartPulse}
              label="Zone / RPE"
              value={
                session.targetZone
                  ? `Z${session.targetZone}${session.targetRPE ? ` · RPE ${session.targetRPE}` : ""}`
                  : session.targetRPE
                  ? `RPE ${session.targetRPE}`
                  : "—"
              }
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <ListChecks className="w-4 h-4 text-brand-500" />
              <h3 className="text-sm font-semibold text-surface-200">Déroulé</h3>
            </div>
            <ul className="space-y-2">
              {session.structure.map((step, idx) => (
                <li
                  key={idx}
                  className="text-sm text-surface-300 bg-surface-850 rounded-lg p-3 border border-surface-700/50"
                >
                  {step}
                </li>
              ))}
            </ul>
          </div>

          {session.exercises && session.exercises.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-surface-200 mb-2">Exercices</h3>
              <div className="space-y-2">
                {session.exercises.map((ex, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-lg bg-surface-850 border border-surface-700/50"
                  >
                    <div>
                      <p className="text-sm font-medium text-surface-100">{ex.name}</p>
                      <p className="text-xs text-surface-500 mt-0.5">{ex.notes}</p>
                    </div>
                    <Badge variant="default">
                      {ex.sets} × {ex.reps}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loadingActivities && realizedActivities.length > 0 && (
            <div className="pt-4 border-t border-surface-700/60">
              <div className="flex items-center gap-2 mb-2">
                <ActivityIcon className="w-4 h-4 text-success-400" />
                <h3 className="text-sm font-semibold text-surface-200">Réalisé (Intervals.icu)</h3>
              </div>
              <div className="space-y-2">
                {realizedActivities.map((a) => (
                  <div
                    key={a.id}
                    className="p-3 rounded-lg bg-surface-850 border border-surface-700/50 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-surface-100 truncate">{a.name}</span>
                      <Badge variant="success">
                        {new Date(a.startDate).toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs">
                      {a.distanceMeters !== null && (
                        <MetaStat icon={Ruler} label="Distance" value={`${(a.distanceMeters / 1000).toFixed(2)} km`} />
                      )}
                      {a.movingTimeSec !== null && (
                        <MetaStat icon={Clock} label="Durée" value={formatSecondsToTime(a.movingTimeSec) ?? "—"} />
                      )}
                      {formatActivityPaceOrSpeed(a) && (
                        <MetaStat icon={Gauge} label="Allure/vitesse" value={formatActivityPaceOrSpeed(a)!} />
                      )}
                      {a.avgHeartRate !== null && (
                        <MetaStat icon={HeartPulse} label="FC moy." value={`${a.avgHeartRate} bpm`} />
                      )}
                      {a.avgPower !== null && (
                        <MetaStat icon={Zap} label="Puissance moy." value={`${a.avgPower} W`} />
                      )}
                      {a.elevationGain !== null && (
                        <MetaStat icon={Mountain} label="D+" value={`${Math.round(a.elevationGain)} m`} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {canLog && (
            <div className="pt-4 border-t border-surface-700/60">
              {saved ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-success-400">
                    <CheckCircle2 className="w-4 h-4" />
                    Séance enregistrée.
                  </div>
                  {testDeltas.map((delta) => (
                    <div
                      key={delta.exercise}
                      className="flex items-center gap-2 text-sm bg-surface-850 rounded-lg px-3 py-2 border border-surface-700/50"
                    >
                      {delta.previousValue === null ? (
                        <span className="text-surface-300">
                          {delta.exercise} : {formatTestValue(delta.newValue, delta.unit)} — premier
                          test enregistré
                        </span>
                      ) : (
                        <>
                          {delta.improved ? (
                            <TrendingUp className="w-4 h-4 text-success-400 flex-shrink-0" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-warning-400 flex-shrink-0" />
                          )}
                          <span className="text-surface-300">
                            {delta.exercise} : {formatTestValue(delta.newValue, delta.unit)} (vs
                            dernier test : {formatTestValue(delta.previousValue, delta.unit)})
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <h3 className="text-sm font-semibold text-surface-200 mb-3">Marquer la séance</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Select
                      label="Résultat"
                      value={logStatus}
                      onChange={(e) => setLogStatus(e.target.value as typeof logStatus)}
                      options={LOG_STATUS_OPTIONS}
                    />
                    <Input
                      label="Durée réelle"
                      type="number"
                      min={0}
                      suffix="min"
                      value={actualDuration}
                      onChange={(e) => setActualDuration(e.target.value)}
                    />
                    <Input
                      label="RPE ressenti"
                      type="number"
                      min={1}
                      max={10}
                      hint="1 (facile) — 10 (max)"
                      value={actualRPE}
                      onChange={(e) => setActualRPE(e.target.value)}
                    />
                  </div>

                  {testKind && (
                    <div className="mt-3 p-3 rounded-lg bg-brand-500/5 border border-brand-500/20">
                      <p className="text-xs font-medium text-brand-400 mb-2">Résultat du test</p>
                      {testKind === "LUC_LEGER" && (
                        <Input
                          label="VMA atteinte"
                          type="number"
                          step="0.1"
                          min={0}
                          suffix="km/h"
                          placeholder="14.0"
                          value={testValues.vmaLucLeger ?? ""}
                          onChange={(e) =>
                            setTestValues((v) => ({ ...v, vmaLucLeger: e.target.value }))
                          }
                        />
                      )}
                      {testKind === "ONE_RM" && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {(
                            [
                              ["prSquat", "Squat"],
                              ["prBench", "Bench Press"],
                              ["prDeadlift", "Deadlift"],
                              ["prOHP", "OHP"],
                            ] as const
                          ).map(([key, label]) => (
                            <Input
                              key={key}
                              label={label}
                              type="number"
                              step="0.5"
                              min={0}
                              suffix="kg"
                              value={testValues[key] ?? ""}
                              onChange={(e) =>
                                setTestValues((v) => ({ ...v, [key]: e.target.value }))
                              }
                            />
                          ))}
                        </div>
                      )}
                      {testKind === "FTP" && (
                        <Input
                          label="FTP mesurée"
                          type="number"
                          min={0}
                          suffix="watts"
                          placeholder="250"
                          value={testValues.ftp ?? ""}
                          onChange={(e) => setTestValues((v) => ({ ...v, ftp: e.target.value }))}
                        />
                      )}
                      {testKind === "SWIM_400" && (
                        <Input
                          label="Temps"
                          type="text"
                          placeholder="7:30"
                          hint="MM:SS"
                          value={testValues.swim400m ?? ""}
                          onChange={(e) =>
                            setTestValues((v) => ({ ...v, swim400m: e.target.value }))
                          }
                        />
                      )}
                    </div>
                  )}

                  <div className="mt-3">
                    <Textarea
                      label="Note (optionnel)"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <Button className="mt-3" loading={saving} onClick={submitLog}>
                    Enregistrer
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-surface-850 rounded-lg p-3 border border-surface-700/50">
      <div className="flex items-center gap-1.5 text-surface-500 mb-1">
        <Icon className="w-3 h-3" />
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-medium text-surface-100">{value}</p>
    </div>
  );
}
