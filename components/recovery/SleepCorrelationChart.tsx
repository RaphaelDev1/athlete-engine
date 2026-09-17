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

export interface SleepCorrelationPoint {
  date: string | Date;
  sleepScore: number | null;
  stress: number | null; // 1-5, check-in
  badEating: boolean;
}

interface SleepCorrelationChartProps {
  data: SleepCorrelationPoint[];
  height?: number;
}

// Superpose score de sommeil (Garmin), stress ressenti (check-in) et jours
// d'écart alimentaire — pour repérer si un mauvais sommeil suit plutôt un
// pic de stress ou un écart alimentaire (fast food...) la veille.
export function SleepCorrelationChart({ data, height = 220 }: SleepCorrelationChartProps) {
  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
    sleepScore: d.sleepScore,
    stress: d.stress,
    // Marqueur affiché tout en bas de l'axe stress (jamais atteint par de
    // vraies valeurs de stress 1-5) — visuellement distinct de la ligne stress.
    badEatingMarker: d.badEating ? 0.3 : null,
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
            domain={[0, 5]}
            tick={{ fill: "#f97316", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip
            contentStyle={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#94a3b8" }}
            formatter={(value, name) => {
              if (name === "badEatingMarker") return [value ? "Oui" : "", "Écart alimentaire"];
              if (name === "sleepScore") return [`${value}/100`, "Sommeil"];
              if (name === "stress") return [`${value}/5`, "Stress"];
              return [value, name];
            }}
          />
          <Legend
            formatter={(value) =>
              value === "sleepScore"
                ? "Sommeil"
                : value === "stress"
                ? "Stress"
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
            dataKey="stress"
            stroke="#f97316"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={{ r: 2.5, fill: "#f97316" }}
            connectNulls
          />
          <Scatter yAxisId="stress" dataKey="badEatingMarker" fill="#ef4444" shape="diamond" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
