"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface HrvTrendChartProps {
  data: { date: string; value: number | null }[];
}

export function HrvTrendChart({ data }: HrvTrendChartProps) {
  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
    }),
    value: d.value,
  }));

  return (
    <div className="w-full h-40">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={["dataMin - 5", "dataMax + 5"]}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#94a3b8" }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3, fill: "#3b82f6" }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
