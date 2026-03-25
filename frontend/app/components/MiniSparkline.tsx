"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";

interface Props {
  scores: number[];
}

export default function MiniSparkline({ scores }: Props) {
  if (scores.length < 2) return null;

  const data = scores.map((score, i) => ({ i, score }));
  const latest = scores[scores.length - 1];
  const first = scores[0];
  const color = latest >= first ? "#22c55e" : "#ef4444";

  return (
    <div className="w-20 h-6 min-w-0 overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="score"
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
