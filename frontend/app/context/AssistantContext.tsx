"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import type { Thesis, Evaluation } from "@/lib/api";

interface AssistantContextValue {
  isOpen: boolean;
  togglePanel: () => void;
  ticker: string | null;
  setTicker: (t: string | null) => void;
  /** ThesisManager registers a callback so the panel can push new thesis points into the list. */
  registerThesisAdded: (cb: ((t: Thesis) => void) | null) => void;
  /** Called by AssistantPanel after a suggestion is saved to the DB. */
  fireThesisAdded: (t: Thesis) => void;
  /** ThesisManager registers a callback so the panel can trigger evaluation and receive the result. */
  registerEvaluationTriggered: (cb: (() => Promise<Evaluation | null>) | null) => void;
  /** Called by AssistantPanel when chat triggers an evaluation. */
  fireEvaluationTriggered: () => Promise<Evaluation | null>;
}

const AssistantContext = createContext<AssistantContextValue>({
  isOpen: false,
  togglePanel: () => {},
  ticker: null,
  setTicker: () => {},
  registerThesisAdded: () => {},
  fireThesisAdded: () => {},
  registerEvaluationTriggered: () => {},
  fireEvaluationTriggered: async () => null,
});

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [ticker, setTicker] = useState<string | null>(null);
  const onThesisAddedRef = useRef<((t: Thesis) => void) | null>(null);
  const onEvalTriggeredRef = useRef<(() => Promise<Evaluation | null>) | null>(null);

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

  const registerEvaluationTriggered = useCallback(
    (cb: (() => Promise<Evaluation | null>) | null) => {
      onEvalTriggeredRef.current = cb;
    },
    []
  );

  const fireEvaluationTriggered = useCallback(async (): Promise<Evaluation | null> => {
    if (onEvalTriggeredRef.current) {
      return onEvalTriggeredRef.current();
    }
    return null;
  }, []);

  return (
    <AssistantContext.Provider
      value={{
        isOpen, togglePanel, ticker, setTicker,
        registerThesisAdded, fireThesisAdded,
        registerEvaluationTriggered, fireEvaluationTriggered,
      }}
    >
      {children}
    </AssistantContext.Provider>
  );
}

export const useAssistant = () => useContext(AssistantContext);
