"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface User {
  id: number;
  email: string;
  username: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    loading: true,
  });

  // On mount, check for stored token
  useEffect(() => {
    const token = localStorage.getItem("thesisarc_token");
    if (!token) {
      setState({ user: null, token: null, loading: false });
      return;
    }

    // Validate token by calling /auth/me
    fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Invalid token");
        return res.json();
      })
      .then((user: User) => {
        setState({ user, token, loading: false });
      })
      .catch(() => {
        localStorage.removeItem("thesisarc_token");
        setState({ user: null, token: null, loading: false });
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail ?? "Login failed");
    }
    const data = await res.json();
    localStorage.setItem("thesisarc_token", data.access_token);
    setState({ user: data.user, token: data.access_token, loading: false });
  }, []);

  const register = useCallback(
    async (email: string, username: string, password: string) => {
      const res = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { detail?: string }).detail ?? "Registration failed"
        );
      }
      const data = await res.json();
      localStorage.setItem("thesisarc_token", data.access_token);
      setState({ user: data.user, token: data.access_token, loading: false });
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem("thesisarc_token");
    setState({ user: null, token: null, loading: false });
  }, []);

  // Listen for 401s from apiFetch — clears auth state so AuthGate redirects to /login
  useEffect(() => {
    window.addEventListener("thesisarc:unauthorized", logout);
    return () => window.removeEventListener("thesisarc:unauthorized", logout);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
