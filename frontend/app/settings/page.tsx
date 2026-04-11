"use client";

import { useAuth } from "@/app/context/AuthContext";
import { useTheme } from "@/app/context/ThemeContext";
import { Sun, Moon, LogOut, User, Mail } from "lucide-react";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="max-w-lg mx-auto px-6 py-8">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100 mb-6">Settings</h1>

      {/* Account */}
      <section className="mb-6">
        <h2 className="text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500 font-semibold mb-3">Account</h2>
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl divide-y divide-gray-100 dark:divide-zinc-800">
          <div className="flex items-center gap-3 px-4 py-3">
            <User className="w-4 h-4 text-gray-400 dark:text-zinc-500 shrink-0" />
            <div>
              <p className="text-xs text-gray-400 dark:text-zinc-500">Username</p>
              <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">{user?.username ?? "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <Mail className="w-4 h-4 text-gray-400 dark:text-zinc-500 shrink-0" />
            <div>
              <p className="text-xs text-gray-400 dark:text-zinc-500">Email</p>
              <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">{user?.email ?? "—"}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Appearance */}
      <section className="mb-6">
        <h2 className="text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500 font-semibold mb-3">Appearance</h2>
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              {theme === "light" ? (
                <Sun className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
              ) : (
                <Moon className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
              )}
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">Theme</p>
                <p className="text-xs text-gray-400 dark:text-zinc-500 capitalize">{theme} mode</p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className="relative w-10 h-5 rounded-full transition-colors bg-gray-200 dark:bg-indigo-600"
            >
              <span
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  theme === "dark" ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Sign out */}
      <section>
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 w-full text-left text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium">Sign out</span>
          </button>
        </div>
      </section>
    </div>
  );
}
