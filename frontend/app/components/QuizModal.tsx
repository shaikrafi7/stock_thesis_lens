"use client";

import { useEffect, useState, useCallback } from "react";
import { getQuizRound, type QuizRoundQuestion } from "@/lib/api";
import { Brain, X, CheckCircle, XCircle, Loader2, ChevronRight, RotateCcw } from "lucide-react";

const TYPE_LABEL: Record<QuizRoundQuestion["type"], string> = {
  thesis_to_stock: "Match the holding",
  point_to_category: "Which category?",
  signal_impact: "Confirmed or Flagged?",
  closed_outcome: "What outcome?",
};

interface Props {
  portfolioId?: number | null;
  onClose: () => void;
}

type Phase = "loading" | "playing" | "done" | "error";

export default function QuizModal({ portfolioId, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizRoundQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null>>([]);

  const loadRound = useCallback(async () => {
    setPhase("loading");
    setErrorMsg(null);
    setIdx(0);
    try {
      const round = await getQuizRound(portfolioId, 10);
      setQuestions(round.questions);
      setAnswers(new Array(round.questions.length).fill(null));
      setPhase(round.questions.length > 0 ? "playing" : "error");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load quiz.");
      setPhase("error");
    }
  }, [portfolioId]);

  useEffect(() => { loadRound(); }, [loadRound]);

  const current = questions[idx];
  const answered = current ? answers[idx] !== null : false;

  function handleAnswer(choiceIdx: number) {
    if (answered) return;
    setAnswers((prev) => {
      const next = prev.slice();
      next[idx] = choiceIdx;
      return next;
    });
  }

  function handleNext() {
    if (idx < questions.length - 1) {
      setIdx((i) => i + 1);
    } else {
      setPhase("done");
    }
  }

  const correctCount = answers.reduce<number>((acc, a, i) => {
    const q = questions[i];
    if (q && a !== null && a === q.correct_index) return acc + 1;
    return acc;
  }, 0);

  const answeredCount = answers.filter((a) => a !== null).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Know Your Thesis</h3>
          </div>
          <div className="flex items-center gap-3">
            {phase === "playing" && questions.length > 0 && (
              <span className="text-xs text-gray-400 dark:text-zinc-500">
                {idx + 1} / {questions.length}
              </span>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300" type="button" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {phase === "playing" && questions.length > 0 && (
          <div className="h-1 w-full rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${(answeredCount / questions.length) * 100}%` }}
            />
          </div>
        )}

        {phase === "loading" && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-accent" />
          </div>
        )}

        {phase === "error" && (
          <div className="text-sm text-gray-500 dark:text-zinc-400 text-center py-6 flex flex-col gap-3">
            <p>{errorMsg ?? "Need more thesis content to play."}</p>
            <button onClick={onClose} className="text-xs text-accent hover:text-accent-hover" type="button">Close</button>
          </div>
        )}

        {phase === "playing" && current && (
          <>
            <div className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-4 flex flex-col gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-zinc-500 font-semibold">
                {TYPE_LABEL[current.type]}
              </span>
              <p className="text-sm text-gray-800 dark:text-zinc-200 leading-snug whitespace-pre-line">
                {current.stem}
              </p>
            </div>

            <div className={`grid gap-2 ${current.choices.length > 4 ? "grid-cols-1" : "grid-cols-2"}`}>
              {current.choices.map((choice, ci) => {
                const isCorrect = ci === current.correct_index;
                const selected = answers[idx];
                const isSelected = selected === ci;
                let cls = "px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors text-left ";
                if (!answered) {
                  cls += "border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 hover:border-accent hover:bg-accent/5 cursor-pointer";
                } else if (isCorrect) {
                  cls += "border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400";
                } else if (isSelected) {
                  cls += "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400";
                } else {
                  cls += "border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/50 text-gray-400 dark:text-zinc-600 opacity-60";
                }
                return (
                  <button
                    key={`${current.id}-${ci}`}
                    onClick={() => handleAnswer(ci)}
                    className={cls}
                    disabled={answered}
                    type="button"
                  >
                    <span className="flex items-center gap-1.5">
                      {answered && isCorrect && <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                      {answered && isSelected && !isCorrect && <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                      <span>{choice}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {answered && (
              <div className={`text-xs rounded-lg px-3 py-2 ${
                answers[idx] === current.correct_index
                  ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                  : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
              }`}>
                {current.reveal}
              </div>
            )}

            <button
              onClick={handleNext}
              disabled={!answered}
              className="flex items-center justify-center gap-1.5 w-full px-4 py-2 text-xs bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
              type="button"
            >
              {idx < questions.length - 1 ? "Next question" : "See results"}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {phase === "done" && (
          <div className="flex flex-col gap-3">
            <div className="text-center py-4">
              <p className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-zinc-500 font-semibold mb-1">Round complete</p>
              <p className="text-4xl font-mono font-bold text-gray-900 dark:text-white">
                {correctCount}
                <span className="text-gray-400 dark:text-zinc-500 text-lg font-normal">/{questions.length}</span>
              </p>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
                {correctCount === questions.length
                  ? "Perfect. You know your book."
                  : correctCount >= questions.length * 0.7
                  ? "Strong recall."
                  : correctCount >= questions.length * 0.4
                  ? "Some holdings could use a re-read."
                  : "Time to revisit your thesis notes."}
              </p>
            </div>

            {questions.some((_, i) => answers[i] !== null && answers[i] !== questions[i].correct_index) && (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-zinc-500 font-semibold">You missed</p>
                {questions.map((q, i) => {
                  const a = answers[i];
                  if (a === null || a === q.correct_index) return null;
                  return (
                    <div key={q.id} className="rounded-lg border border-gray-200 dark:border-zinc-700 p-3 text-xs">
                      <p className="text-gray-700 dark:text-zinc-300 whitespace-pre-line mb-1.5">{q.stem}</p>
                      <p className="text-emerald-600 dark:text-emerald-400">
                        Answer: <strong>{q.choices[q.correct_index]}</strong>
                      </p>
                      <p className="text-gray-500 dark:text-zinc-400 mt-1">{q.reveal}</p>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={loadRound}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-xs bg-accent hover:bg-accent-hover text-white rounded-xl font-medium transition-colors"
                type="button"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Play again
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 text-xs text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200 border border-gray-200 dark:border-zinc-700 rounded-xl font-medium transition-colors"
                type="button"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
