"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchInvestorProfile, updateInvestorProfile, type InvestorProfile, type InvestorProfileCreateRequest } from "@/lib/api";
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
      <span className="text-xs text-zinc-400 w-36 shrink-0">{BIAS_LABELS[name] ?? name}</span>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${BIAS_COLORS[name] ?? "bg-zinc-500"}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs text-zinc-500 w-6 text-right">{score}</span>
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<InvestorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditWizard, setShowEditWizard] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchInvestorProfile()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
        Loading profile...
      </div>
    );
  }

  if (!profile || !profile.wizard_completed) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-zinc-400 text-sm mb-4">
          You haven&apos;t completed your investor profile yet.
        </p>
        <button
          onClick={() => setShowEditWizard(true)}
          className="px-5 py-2 bg-accent text-black text-sm font-semibold rounded-lg hover:bg-accent/90 transition-colors"
        >
          Set up profile
        </button>
        {showEditWizard && (
          <ProfileWizard
            onComplete={(p) => {
              setProfile(p);
              setShowEditWizard(false);
            }}
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
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Investor Profile</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Your behavioral fingerprint — how you think and act as an investor</p>
        </div>
        <button
          onClick={() => setShowEditWizard(true)}
          className="text-xs px-3 py-1.5 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
        >
          Edit
        </button>
      </div>

      {/* Archetype card */}
      <div className="bg-zinc-900 border border-zinc-700/60 rounded-2xl p-6">
        <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Your archetype</p>
        <h2 className="text-xl font-bold text-white mb-3">{profile.archetype_label}</h2>
        {profile.behavioral_summary && (
          <p className="text-sm text-zinc-400 leading-relaxed">{profile.behavioral_summary}</p>
        )}

        {/* Quick stats */}
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { label: "Style", value: profile.investment_style },
            { label: "Horizon", value: profile.time_horizon },
            { label: "Risk capacity", value: profile.risk_capacity },
            { label: "Loss aversion", value: profile.loss_aversion },
            { label: "Experience", value: profile.experience_level },
          ].filter((s) => s.value).map((stat) => (
            <div key={stat.label} className="px-3 py-1.5 bg-zinc-800 rounded-lg">
              <span className="text-[10px] text-zinc-600 block">{stat.label}</span>
              <span className="text-xs font-medium text-zinc-300 capitalize">{stat.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scenario predictions */}
      {scenarios.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-3">How you&apos;ll likely behave</p>
          <div className="space-y-3">
            {scenarios.map((s, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs font-semibold text-zinc-300 mb-2">{s.situation}</p>
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <span className="text-[10px] text-zinc-600 w-20 shrink-0 pt-0.5">Likely action</span>
                    <span className="text-xs text-zinc-400">{s.likely_action}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[10px] text-amber-600 w-20 shrink-0 pt-0.5">Watch out</span>
                    <span className="text-xs text-amber-500/80">{s.watch_out_for}</span>
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
          <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-3">Bias fingerprint</p>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
            {biasOrder.filter((k) => k in fingerprint).map((key) => (
              <BiasBar key={key} name={key} score={fingerprint[key]} />
            ))}
          </div>
          <p className="text-[10px] text-zinc-600 mt-2">
            Higher scores indicate stronger influence on your decision-making. Awareness is the first step.
          </p>
        </div>
      )}

      {/* Edit wizard */}
      {showEditWizard && (
        <ProfileWizard
          onComplete={(p) => {
            setProfile(p);
            setShowEditWizard(false);
          }}
          onSkip={() => setShowEditWizard(false)}
        />
      )}
    </div>
  );
}
