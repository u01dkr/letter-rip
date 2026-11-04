"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dictionary } from "@/lib/words";
import { checkLadder, isDeadEnd, LADDER_REASON } from "@/lib/ladder";
import LadderInput from "./LadderInput";
import type { Feedback } from "./TileInput";

export type LadderSoloResult = {
  chain: string[]; // start word first
  ending: "timeout" | "deadend";
};

type Props = {
  start: string;
  seconds: number; // per move
  dict: Dictionary;
  title: string;
  onFinish: (result: LadderSoloResult) => void;
  onQuit: () => void;
};

export default function LadderSolo({ start, seconds, dict, title, onFinish, onQuit }: Props) {
  const [chain, setChain] = useState<string[]>([start]);
  const [moveEndsAt, setMoveEndsAt] = useState(() => Date.now() + seconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  const finished = useRef(false);
  const [over, setOver] = useState(false); // same as `finished`, but for drawing the screen

  const current = chain[chain.length - 1];
  const used = useMemo(() => new Set(chain), [chain]);
  const leftMs = Math.max(0, moveEndsAt - now);
  const secs = Math.ceil(leftMs / 1000);
  const hurry = secs <= 5;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (leftMs <= 0 && !finished.current) {
      finished.current = true;
      onFinish({ chain, ending: "timeout" });
    }
  }, [leftMs, chain, onFinish]);

  const submit = useCallback(
    (raw: string): Feedback => {
      if (finished.current) return { good: false, text: "Time's up!" };
      const res = checkLadder(raw, current, used, dict);
      if (!res.ok) return { good: false, text: LADDER_REASON[res.reason] };
      const next = [...chain, res.word];
      setChain(next);
      setMoveEndsAt(Date.now() + seconds * 1000);
      if (isDeadEnd(res.word, new Set(next), dict)) {
        finished.current = true;
        setOver(true);
        // A short beat so you see your last word land before the results
        setTimeout(() => onFinish({ chain: next, ending: "deadend" }), 900);
        return { good: true, text: "Dead end!" };
      }
      return { good: true, text: `${next.length - 1} ${next.length === 2 ? "rung" : "rungs"}` };
    },
    [current, used, dict, chain, seconds, onFinish]
  );

  const rungs = chain.length - 1;

  return (
    <div className="flex flex-col flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-6 gap-5">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <button onClick={onQuit} aria-label="Quit game" className="btn w-10 h-10 bg-ink-3 text-paper text-xl leading-none">
          ×
        </button>
        <div className="flex-1">
          <div className="flex justify-between text-xs text-muted mb-1 font-medium uppercase tracking-wider">
            <span>{title}</span>
            <span className={hurry ? "hurry font-bold" : ""}>{secs}s</span>
          </div>
          <div className="h-2.5 rounded-full bg-ink-3 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-100 ease-linear"
              style={{
                width: `${(leftMs / (seconds * 1000)) * 100}%`,
                background: hurry ? "var(--berry)" : "linear-gradient(90deg, var(--mint), var(--sun))",
              }}
            />
          </div>
        </div>
        <div className="text-right min-w-14">
          <div className="text-[10px] uppercase tracking-wider text-muted">Rungs</div>
          <div className="font-display text-2xl font-extrabold leading-none text-sun">{rungs}</div>
        </div>
      </div>

      <div className="mt-4">
        <LadderInput key={current} word={current} disabled={over || leftMs <= 0} onSubmit={submit} />
      </div>

      <LadderTrail chain={chain} />
    </div>
  );
}

/** The words so far, newest first, stacked like the rungs of a ladder. */
export function LadderTrail({ chain, colours }: { chain: string[]; colours?: (i: number) => string | undefined }) {
  const rows = chain.map((w, i) => ({ w, i, prev: chain[i - 1] })).reverse();
  return (
    <div className="flex-1 rounded-2xl bg-ink-2/70 border border-ink-3 p-3">
      <div className="text-xs uppercase tracking-wider text-muted mb-2">The ladder</div>
      <ol className="flex flex-col items-center gap-1">
        {rows.map(({ w, i, prev }) => (
          <li
            key={w}
            className={`pop flex gap-0.5 font-display font-bold uppercase tracking-[0.2em] text-lg rounded-lg px-3 py-0.5 ${
              i === 0 ? "text-muted" : ""
            }`}
            style={colours?.(i) ? { borderLeft: `4px solid ${colours(i)}` } : undefined}
          >
            {w.split("").map((ch, j) => (
              <span key={j} className={prev && prev[j] !== ch ? "text-sun" : undefined}>
                {ch}
              </span>
            ))}
          </li>
        ))}
      </ol>
    </div>
  );
}
