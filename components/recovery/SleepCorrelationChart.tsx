"use client";

import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface CorrelationChartRow {
  date: string;
  sleepScore: number | null;
  stressScore: number | null;
  badEatingMarker: number | null;
  napMarker: number | null;
  napMinutes: number | null;
}

// Tooltip custom : le composant Tooltip par défaut de recharts perd les
// dataKey "badEatingMarker"/"napMarker" quand leur valeur est null (point
// sans marqueur ce jour-là) et retombe sur le premier champ de la ligne
// (date) — d'où une date qui apparaissait en double dans le tooltip
// automatique. On ne dépend donc plus de son rendu par défaut, et on
// n'affiche plus la date (déjà visible sur l'axe X).
function CorrelationTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: CorrelationChartRow }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div
      style={{
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: 8,
        fontSize: 12,
        padding: 10,
      }}
    >
      {point.sleepScore !== null && (
        <p style={{ color: "#8b5cf6", margin: 0, padding: "2px 0" }}>
          Sommeil (Garmin) : {point.sleepScore}/100
        </p>
      )}
      {point.stressScore !== null && (
        <p style={{ color: "#f97316", margin: 0, padding: "2px 0" }}>
          Stress (Garmin) : {point.stressScore}/100
        </p>
      )}
      {point.napMinutes ? (
        <p style={{ color: "#38bdf8", margin: 0, padding: "2px 0" }}>
          Sieste : {point.napMinutes} min
        </p>
      ) : null}
      {point.badEatingMarker ? (
        <p style={{ color: "#ef4444", margin: 0, padding: "2px 0" }}>Écart alimentaire</p>
      ) : null}
    </div>
  );
}

export interface SleepCorrelationPoint {
  date: string | Date;
  sleepScore: number | null;
  napMinutes: number | null; // sieste Garmin ou déclarée, en minutes
  // Stress objectif Garmin (avgStressLevel, 0-100).
  stressScore: number | null;
  badEating: boolean;
}

interface SleepCorrelationChartProps {
  data: SleepCorrelationPoint[];
  height?: number;
}

// Superpose score de sommeil (Garmin), siestes, stress objectif (Garmin) et
// jours d'écart alimentaire — pour repérer si un mauvais sommeil suit plutôt
// un pic de stress ou un écart alimentaire (fast food...) la veille.
export function SleepCorrelationChart({ data, height = 220 }: SleepCorrelationChartProps) {
  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
    sleepScore: d.sleepScore,
    stressScore: d.stressScore,
    // Marqueurs affichés tout en bas de l'axe stress (0-100) — sous les
    // valeurs réelles de stress, jamais confondus avec elles.
    badEatingMarker: d.badEating ? 2 : null,
    napMarker: d.napMinutes ? 5 : null,
    napMinutes: d.napMinutes,
  }));

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="sleep"
            domain={[0, 100]}
            tick={{ fill: "#8b5cf6", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <YAxis
            yAxisId="stress"
            orientation="right"
            domain={[0, 100]}
            tick={{ fill: "#f97316", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip content={<CorrelationTooltip />} />
          <Legend
            formatter={(value) =>
              value === "sleepScore"
                ? "Sommeil (Garmin)"
                : value === "stressScore"
                ? "Stress (Garmin)"
                : value === "napMarker"
                ? "Sieste"
                : "Écart alimentaire"
            }
            wrapperStyle={{ fontSize: 11, color: "#94a3b8" }}
          />
          <Line
            yAxisId="sleep"
            type="monotone"
            dataKey="sleepScore"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={{ r: 2.5, fill: "#8b5cf6" }}
            connectNulls
          />
          <Line
            yAxisId="stress"
            type="monotone"
            dataKey="stressScore"
            stroke="#f97316"
            strokeWidth={2}
            dot={{ r: 2.5, fill: "#f97316" }}
            connectNulls
          />
          <Scatter yAxisId="stress" dataKey="badEatingMarker" fill="#ef4444" shape="diamond" />
          <Scatter yAxisId="stress" dataKey="napMarker" fill="#38bdf8" shape="circle" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
