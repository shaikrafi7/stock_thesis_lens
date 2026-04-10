"use client";

import { useEffect, useState } from "react";
import { fetchInvestorProfile, type InvestorProfile } from "@/lib/api";
import ProfileWizard from "@/app/components/ProfileWizard";

const BIAS_LABELS: Record<string, string> = {
  anchoring: "Anchoring Bias",
  recency: "Recency Bias",
  overconfidence: "Overconfidence",
  loss_aversion: "Loss Aversion",
  herd: "Herd Mentality",
};

const BIAS_COLORS: Record<string, string> = {
  anchoring: "bg-blue-500",
  recency: "bg-purple-500",
  overconfidence: "bg-amber-500",
  loss_aversion: "bg-red-500",
  herd: "bg-teal-500",
};

function BiasBar({ name, score }: { name: string; score: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 dark:text-zinc-400 w-36 shrink-0">{BIAS_LABELS[name] ?? name}</span>
      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${BIAS_COLORS[name] ?? "bg-gray-400"}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-gray-400 dark:text-zinc-500 w-6 text-right tabular">{score}</span>
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<InvestorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditWizard, setShowEditWizard] = useState(false);

  useEffect(() => {
    fetchInvestorProfile()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 dark:text-zinc-500 text-sm">
        Loading profile…
      </div>
    );
  }

  if (!profile || !profile.wizard_completed) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-gray-400 dark:text-zinc-400 text-sm mb-4">
          You haven&apos;t completed your investor profile yet.
        </p>
        <button
          onClick={() => setShowEditWizard(true)}
          className="px-5 py-2 bg-accent text-white text-sm font-semibold rounded-xl hover:bg-accent-hover transition-all duration-150"
        >
          Set up profile
        </button>
        {showEditWizard && (
          <ProfileWizard
            onComplete={(p) => { setProfile(p); setShowEditWizard(false); }}
            onSkip={() => setShowEditWizard(false)}
          />
        )}
      </div>
    );
  }

  const scenarios = profile.scenario_predictions ?? [];
  const fingerprint = profile.bias_fingerprint ?? {};
  const biasOrder = ["anchoring", "recency", "overconfidence", "loss_aversion", "herd"];

  return (
    <div className="min-h-full">
      {/* Archetype hero banner */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-6 py-6">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 mb-1">Your Archetype</p>
            <h1 className="text-2xl font-serif italic text-gray-900 dark:text-white" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>
              {profile.archetype_label}
            </h1>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">Your behavioral fingerprint — how you think and act as an investor</p>
          </div>
          <button
            onClick={() => setShowEditWizard(true)}
            className="text-xs px-3 py-1.5 border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200 hover:border-gray-400 dark:hover:border-zinc-500 transition-colors shrink-0"
          >
            Edit
          </button>
        </div>
      </div>

    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">

      {/* Archetype card */}
      <div className="bg-white dark:bg-zinc-800/60 rounded-2xl p-6 card-border">
        {profile.behavioral_summary && (
          <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed">{profile.behavioral_summary}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { label: "Style", value: profile.investment_style },
            { label: "Horizon", value: profile.time_horizon },
            { label: "Risk capacity", value: profile.risk_capacity },
            { label: "Loss aversion", value: profile.loss_aversion },
            { label: "Experience", value: profile.experience_level },
          ].filter((s) => s.value).map((stat) => (
            <div key={stat.label} className="px-3 py-1.5 bg-gray-50 dark:bg-zinc-700/60 rounded-lg border border-gray-100 dark:border-zinc-700">
              <span className="text-[10px] text-gray-400 dark:text-zinc-500 block">{stat.label}</span>
              <span className="text-xs font-medium text-gray-700 dark:text-zinc-300 capitalize">{stat.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scenario predictions */}
      {scenarios.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 mb-3">How you&apos;ll likely behave</p>
          <div className="space-y-3">
            {scenarios.map((s, i) => (
              <div key={i} className="bg-white dark:bg-zinc-800/60 rounded-xl p-4 card-border">
                <p className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-2">{s.situation}</p>
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <span className="text-[10px] text-gray-400 dark:text-zinc-600 w-20 shrink-0 pt-0.5">Likely action</span>
                    <span className="text-xs text-gray-500 dark:text-zinc-400">{s.likely_action}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[10px] text-amber-600 w-20 shrink-0 pt-0.5">Watch out</span>
                    <span className="text-xs text-amber-600 dark:text-amber-500/80">{s.watch_out_for}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bias fingerprint */}
      {Object.keys(fingerprint).length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 mb-3">Bias fingerprint</p>
          <div className="bg-white dark:bg-zinc-800/60 rounded-xl p-5 space-y-3 card-border">
            {biasOrder.filter((k) => k in fingerprint).map((key) => (
              <BiasBar key={key} name={key} score={fingerprint[key]} />
            ))}
          </div>
          <p className="text-[10px] text-gray-400 dark:text-zinc-600 mt-2">
            Higher scores indicate stronger influence on your decision-making. Awareness is the first step.
          </p>
        </div>
      )}

      {showEditWizard && (
        <ProfileWizard
          onComplete={(p) => { setProfile(p); setShowEditWizard(false); }}
          onSkip={() => setShowEditWizard(false)}
        />
      )}
    </div>
    </div>
  );
}
