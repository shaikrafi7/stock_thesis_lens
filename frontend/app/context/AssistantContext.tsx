"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import type { Thesis } from "@/lib/api";

interface AssistantContextValue {
  isOpen: boolean;
  togglePanel: () => void;
  ticker: string | null;
  setTicker: (t: string | null) => void;
  /** ThesisManager registers a callback so the panel can push new thesis points into the list. */
  registerThesisAdded: (cb: ((t: Thesis) => void) | null) => void;
  /** Called by AssistantPanel after a suggestion is saved to the DB. */
  fireThesisAdded: (t: Thesis) => void;
}

const AssistantContext = createContext<AssistantContextValue>({
  isOpen: false,
  togglePanel: () => {},
  ticker: null,
  setTicker: () => {},
  registerThesisAdded: () => {},
  fireThesisAdded: () => {},
});

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [ticker, setTicker] = useState<string | null>(null);
  const onThesisAddedRef = useRef<((t: Thesis) => void) | null>(null);

  const togglePanel = useCallback(() => setIsOpen((p) => !p), []);

  const registerThesisAdded = useCallback(
    (cb: ((t: Thesis) => void) | null) => {
      onThesisAddedRef.current = cb;
    },
    []
  );

  const fireThesisAdded = useCallback((t: Thesis) => {
    onThesisAddedRef.current?.(t);
  }, []);

  return (
    <AssistantContext.Provider
      value={{ isOpen, togglePanel, ticker, setTicker, registerThesisAdded, fireThesisAdded }}
    >
      {children}
    </AssistantContext.Provider>
  );
}

export const useAssistant = () => useContext(AssistantContext);
