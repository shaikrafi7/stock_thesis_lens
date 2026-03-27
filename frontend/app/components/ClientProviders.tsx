"use client";

import { type ReactNode } from "react";
import { AssistantProvider } from "@/app/context/AssistantContext";
import AssistantPanel from "./AssistantPanel";
import AppShell from "./AppShell";

export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <AssistantProvider>
      <AppShell>{children}</AppShell>
      <AssistantPanel />
    </AssistantProvider>
  );
}
