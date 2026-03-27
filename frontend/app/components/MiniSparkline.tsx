"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";

interface Props {
  values: number[];
}

export default function MiniSparkline({ values }: Props) {
  if (values.length < 2) return null;

  const data = values.map((v, i) => ({ i, v }));
  const latest = values[values.length - 1];
  const first = values[0];
  const color = latest >= first ? "#22c55e" : "#ef4444";

  return (
    <div className="w-16 h-6 min-w-0 overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
