"use client";

import { type ReactNode } from "react";
import { AssistantProvider, useAssistant } from "@/app/context/AssistantContext";
import AssistantPanel from "./AssistantPanel";

function ContentWrapper({ children }: { children: ReactNode }) {
  const { isOpen } = useAssistant();
  return (
    <div className="flex">
      <div className="flex-1 min-w-0">{children}</div>
      <div className={`shrink-0 transition-all duration-200 ${isOpen ? "w-96" : "w-0"}`} />
    </div>
  );
}

export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <AssistantProvider>
      <ContentWrapper>{children}</ContentWrapper>
      <AssistantPanel />
    </AssistantProvider>
  );
}
