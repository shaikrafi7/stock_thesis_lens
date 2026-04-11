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
  /** ThesisManager registers a handler to open the add-form pre-filled with a statement. */
  registerPrefillThesisPoint: (cb: ((statement: string) => void) | null) => void;
  /** Called by StockNews to pipe a headline into ThesisManager's add form. */
  firePrefillThesisPoint: (statement: string) => void;
  /** AssistantPanel registers a handler to auto-send a message to the chat. */
  registerExplainThesisPoint: (cb: ((statement: string) => void) | null) => void;
  /** Called by ThesisManager ℹ button to open panel and explain a thesis point. */
  fireExplainThesisPoint: (statement: string) => void;
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
  registerPrefillThesisPoint: () => {},
  firePrefillThesisPoint: () => {},
  registerExplainThesisPoint: () => {},
  fireExplainThesisPoint: () => {},
});

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [ticker, setTicker] = useState<string | null>(null);
  const onThesisAddedRef = useRef<((t: Thesis) => void) | null>(null);
  const onEvalTriggeredRef = useRef<(() => Promise<Evaluation | null>) | null>(null);
  const onPrefillRef = useRef<((statement: string) => void) | null>(null);
  const onExplainRef = useRef<((statement: string) => void) | null>(null);

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

  const registerPrefillThesisPoint = useCallback((cb: ((statement: string) => void) | null) => {
    onPrefillRef.current = cb;
  }, []);

  const firePrefillThesisPoint = useCallback((statement: string) => {
    onPrefillRef.current?.(statement);
  }, []);

  const registerExplainThesisPoint = useCallback((cb: ((statement: string) => void) | null) => {
    onExplainRef.current = cb;
  }, []);

  const fireExplainThesisPoint = useCallback((statement: string) => {
    onExplainRef.current?.(statement);
  }, []);

  return (
    <AssistantContext.Provider
      value={{
        isOpen, togglePanel, ticker, setTicker,
        registerThesisAdded, fireThesisAdded,
        registerEvaluationTriggered, fireEvaluationTriggered,
        registerPrefillThesisPoint, firePrefillThesisPoint,
        registerExplainThesisPoint, fireExplainThesisPoint,
      }}
    >
      {children}
    </AssistantContext.Provider>
  );
}

export const useAssistant = () => useContext(AssistantContext);
