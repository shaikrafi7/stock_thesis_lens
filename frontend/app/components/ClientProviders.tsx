"use client";

import { type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/app/context/AuthContext";
import { AssistantProvider } from "@/app/context/AssistantContext";
import { ThemeProvider } from "@/app/context/ThemeContext";
import { PortfolioProvider } from "@/app/context/PortfolioContext";
import AssistantPanel from "./AssistantPanel";
import AppShell from "./AppShell";
import { Loader2 } from "lucide-react";

function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = pathname === "/login" || pathname.startsWith("/share/");

  useEffect(() => {
    if (!loading && !user && !isPublic) {
      router.replace("/login");
    }
    if (!loading && user && pathname === "/login") {
      router.replace("/");
    }
  }, [loading, user, pathname, isPublic, router]);

  if (loading && !isPublic) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  // Public pages — render without shell or auth
  if (isPublic && pathname !== "/login") {
    return <>{children}</>;
  }

  // On login page, render without shell
  if (pathname === "/login") {
    return <>{children}</>;
  }

  // Not authenticated yet (redirect pending)
  if (!user) return null;

  // Authenticated — render full app
  return (
    <PortfolioProvider>
      <AssistantProvider>
        <AppShell>{children}</AppShell>
        <AssistantPanel />
      </AssistantProvider>
    </PortfolioProvider>
  );
}

export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthGate>{children}</AuthGate>
      </AuthProvider>
    </ThemeProvider>
  );
}
