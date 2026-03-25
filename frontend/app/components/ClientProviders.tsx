"use client";

import { type ReactNode } from "react";
import { AssistantProvider, useAssistant } from "@/app/context/AssistantContext";
import AssistantPanel from "./AssistantPanel";

function ContentWrapper({ children }: { children: ReactNode }) {
  const { isOpen } = useAssistant();
  return (
    <div className={`transition-all duration-200 ${isOpen ? "mr-96" : ""}`}>
      {children}
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
