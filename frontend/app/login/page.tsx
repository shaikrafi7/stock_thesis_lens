"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";
import { LogIn, UserPlus, Loader2 } from "lucide-react";
import BrandLogo from "@/app/components/BrandLogo";

export default function LoginPage() {
  const router = useRouter();
  const { login, register, loading } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, username, password);
      }
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dot-grid px-4 relative overflow-hidden">
      {/* Gradient fade over dot grid */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-gray-50/60 to-gray-50" />

      {/* Indigo glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 50% 40% at 50% 40%, rgba(99,102,241,0.08) 0%, transparent 70%)",
        }}
      />

      <div className="w-full max-w-sm relative animate-fade-up">
        {/* Branding */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-3">
            <BrandLogo size="lg" showTagline />
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
          {/* Tab toggle */}
          <div className="flex mb-6 bg-gray-100 rounded-xl p-1 gap-1">
            <button
              onClick={() => { setMode("login"); setError(""); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${
                mode === "login"
                  ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode("register"); setError(""); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${
                mode === "register"
                  ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-150"
                placeholder="you@example.com"
              />
            </div>

            {mode === "register" && (
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-150"
                  placeholder="Choose a username"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={6}
                className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-150"
                placeholder={mode === "register" ? "At least 6 characters" : "Your password"}
              />
            </div>

            {error && (
              <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-all duration-150 mt-2"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === "login" ? (
                <LogIn className="w-4 h-4" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              {submitting ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
