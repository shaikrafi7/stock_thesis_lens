"use client";

import { useEffect, useState } from "react";
import { getStreak, type StreakInfo } from "@/lib/api";
import { Flame } from "lucide-react";

export default function StreakBadge() {
  const [streak, setStreak] = useState<StreakInfo | null>(null);

  useEffect(() => {
    getStreak().then(setStreak).catch(() => {});
  }, []);

  if (!streak || streak.current_streak === 0) return null;

  const isHot = streak.current_streak >= 7;
  const isMilestone = streak.current_streak >= 30;

  return (
    <div
      title={`${streak.current_streak}-day review streak • Longest: ${streak.longest_streak} days`}
      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
        isMilestone
          ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800"
          : isHot
          ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
          : "bg-gray-50 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 border border-gray-200 dark:border-zinc-700"
      }`}
    >
      <Flame className={`w-3 h-3 ${isHot ? "text-orange-500" : "text-gray-400 dark:text-zinc-500"}`} />
      {streak.current_streak}d
    </div>
  );
}
