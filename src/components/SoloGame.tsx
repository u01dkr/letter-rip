"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { checkGuess, REASON_TEXT, type Dictionary } from "@/lib/words";
import TileInput, { type Feedback } from "./TileInput";

export type SoloResult = {
  root: string;
  score: number;
  found: string[];
};

type Props = {
  root: string;
  seconds: number;
  dict: Dictionary;
  title: string;
  onFinish: (result: SoloResult) => void;
  onQuit: () => void;
};

export default function SoloGame({ root, seconds, dict, title, onFinish, onQuit }: Props) {
  const [found, setFound] = useState<string[]>([]); // newest first
  const [score, setScore] = useState(0);
  const [endAt] = useState(() => Date.now() + seconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  const finished = useRef(false);

  const used = useMemo(() => new Set(found), [found]);
  const remaining = Math.max(0, endAt - now);
  const secsLeft = Math.ceil(remaining / 1000);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (remaining <= 0 && !finished.current) {
      finished.current = true;
      onFinish({ root, score, found: [...found].reverse() });
    }
  }, [remaining, root, score, found, onFinish]);

  const submit = useCallback(
    (word: string): Feedback => {
      if (finished.current) return { good: false, text: "Time's up!" };
      const res = checkGuess(word, root, used, dict);
      if (!res.ok) return { good: false, text: REASON_TEXT[res.reason] };
      setFound((f) => [res.word, ...f]);
      setScore((s) => s + res.points);
      return { good: true, text: res.fullRip ? `FULL RIP! +${res.points}` : `+${res.points}` };
    },
    [root, used, dict]
  );

  const pct = remaining / (seconds * 1000);
  const hurry = secsLeft <= 10;
  const timeLabel = `${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-col flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-6 gap-5">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={onQuit}
          aria-label="Quit game"
          className="btn w-10 h-10 bg-ink-3 text-paper text-xl leading-none"
        >
          ×
        </button>
        <div className="flex-1">
          <div className="flex justify-between text-xs text-muted mb-1 font-medium uppercase tracking-wider">
            <span>{title}</span>
            <span className={hurry ? "hurry font-bold" : ""}>{timeLabel}</span>
          </div>
          <div className="h-2.5 rounded-full bg-ink-3 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-100 ease-linear"
              style={{
                width: `${pct * 100}%`,
                background: hurry ? "var(--berry)" : "linear-gradient(90deg, var(--rip), var(--sun))",
              }}
            />
          </div>
        </div>
        <div className="text-right min-w-14">
          <div className="text-[10px] uppercase tracking-wider text-muted">Score</div>
          <div className="font-display text-2xl font-extrabold leading-none text-sun">{score}</div>
        </div>
      </div>

      <TileInput root={root} disabled={remaining <= 0} onSubmit={submit} />

      {/* Found words */}
      <div className="flex-1 rounded-2xl bg-ink-2/70 border border-ink-3 p-3">
        <div className="text-xs uppercase tracking-wider text-muted mb-2">
          {found.length} {found.length === 1 ? "word" : "words"}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {found.map((w) => (
            <span
              key={w}
              className={`pop px-2.5 py-1 rounded-lg text-sm font-semibold uppercase tracking-wide ${
                w.length === root.length ? "bg-sun text-ink" : "bg-ink-3 text-paper"
              }`}
            >
              {w}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
