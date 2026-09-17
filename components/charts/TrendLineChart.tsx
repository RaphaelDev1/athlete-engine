"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface TrendPoint {
  date: string | Date;
  value: number | null;
}

interface TrendLineChartProps {
  data: TrendPoint[];
  color?: string;
  unit?: string;
  height?: number;
  formatValue?: (value: number) => string;
}

export function TrendLineChart({
  data,
  color = "#f97316",
  unit,
  height = 160,
  formatValue,
}: TrendLineChartProps) {
  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
    }),
    value: d.value,
  }));

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={["dataMin - 1", "dataMax + 1"]}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#94a3b8" }}
            formatter={(value) => {
              const num = typeof value === "number" ? value : Number(value);
              return [
                formatValue ? formatValue(num) : `${num}${unit ? ` ${unit}` : ""}`,
                "",
              ];
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
