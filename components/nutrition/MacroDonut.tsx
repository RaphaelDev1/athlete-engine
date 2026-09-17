"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { MacroTargets } from "@/lib/engine/types";

const COLORS = {
  protein: "#3b82f6", // info-500
  carbs: "#f97316", // brand-500
  fat: "#fbbf24", // warning-400
};

interface MacroDonutProps {
  macros: MacroTargets;
}

export function MacroDonut({ macros }: MacroDonutProps) {
  const data = [
    { key: "protein", name: "Protéines", value: macros.protein * 4 },
    { key: "carbs", name: "Glucides", value: macros.carbs * 4 },
    { key: "fat", name: "Lipides", value: macros.fat * 4 },
  ];

  return (
    <div className="relative w-full h-48">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="65%"
            outerRadius="100%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((entry) => (
              <Cell key={entry.key} fill={COLORS[entry.key as keyof typeof COLORS]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-bold text-surface-100 tabular-nums">
          {macros.calories}
        </span>
        <span className="text-xs text-surface-500">kcal</span>
      </div>
    </div>
  );
}
