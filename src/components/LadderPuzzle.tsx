"use client";

import { useCallback, useMemo, useState } from "react";
import type { Dictionary } from "@/lib/words";
import { checkLadder, LADDER_REASON } from "@/lib/ladder";
import { parName, shortestRoute, type Puzzle } from "@/lib/puzzle";
import LadderInput from "./LadderInput";
import { LadderTrail } from "./LadderSolo";
import type { Feedback } from "./TileInput";

export type PuzzleOutcome = { route: string[]; hints: number; solved: boolean };

type Props = {
  puzzle: Puzzle;
  dict: Dictionary;
  title: string;
  onFinish: (o: PuzzleOutcome) => void;
  onQuit: () => void;
};

const ORDINAL = ["1st", "2nd", "3rd", "4th"];

export default function LadderPuzzle({ puzzle, dict, title, onFinish, onQuit }: Props) {
  const { start, target, par } = puzzle;
  const [route, setRoute] = useState<string[]>([start]);
  const [hints, setHints] = useState(0);
  const [hint, setHint] = useState<{ at: string; text: string } | null>(null);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);

  const current = route[route.length - 1];
  const used = useMemo(() => new Set(route), [route]);
  const moves = route.length - 1;
  const strokes = moves + hints;

  const submit = useCallback(
    (raw: string): Feedback => {
      const res = checkLadder(raw, current, used, dict);
      if (!res.ok) {
        return { good: false, text: res.reason === "used" ? "You've been there already" : LADDER_REASON[res.reason] };
      }
      const next = [...route, res.word];
      setRoute(next);
      if (res.word === target) {
        setTimeout(() => onFinish({ route: next, hints, solved: true }), 900);
        return { good: true, text: "Got there!" };
      }
      return { good: true, text: `${next.length - 1 + hints} ${next.length - 1 + hints === 1 ? "stroke" : "strokes"}` };
    },
    [current, used, dict, route, target, hints, onFinish]
  );

  function back() {
    if (route.length > 1) setRoute(route.slice(0, -1));
  }

  function giveHint() {
    if (hint?.at === current) return;
    // Shortest way on from here, without going back over your own route
    const avoid = new Set(route.slice(0, -1));
    const way = shortestRoute(current, target, dict, avoid);
    if (!way || way.length < 2) {
      setHint({ at: current, text: "No way through from here. Try going back a step." });
      return;
    }
    const nextWord = way[1];
    const pos = [...nextWord].findIndex((ch, i) => ch !== current[i]);
    setHints((h) => h + 1);
    setHint({
      at: current,
      text: `Change the ${ORDINAL[pos]} letter. (${way.length - 1} more ${way.length === 2 ? "move" : "moves"} from here)`,
    });
  }

  const solved = current === target;

  return (
    <div className="flex flex-col flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-6 gap-4">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <button onClick={onQuit} aria-label="Quit puzzle" className="btn w-10 h-10 bg-ink-3 text-paper text-xl leading-none">
          ×
        </button>
        <div className="flex-1 text-xs text-muted font-medium uppercase tracking-wider">
          {title} · Par {par}
        </div>
        <div className="text-right min-w-14">
          <div className="text-[10px] uppercase tracking-wider text-muted">Strokes</div>
          <div className={`font-display text-2xl font-extrabold leading-none ${strokes > par ? "text-berry" : "text-sun"}`}>
            {strokes}
          </div>
        </div>
      </div>

      {/* Target: letters already in the right place turn green */}
      <div className="rounded-2xl bg-ink-2 border border-ink-3 p-3 text-center">
        <div className="text-xs uppercase tracking-wider text-muted mb-2">
          Get from <b className="text-paper">{start.toUpperCase()}</b> to
        </div>
        <div className="flex justify-center gap-1.5">
          {target.split("").map((ch, i) => {
            const match = current[i] === ch;
            return (
              <span
                key={i}
                className="w-11 h-12 rounded-lg flex items-center justify-center font-display font-extrabold text-2xl uppercase transition-colors"
                style={{
                  background: match ? "var(--mint)" : "var(--ink-3)",
                  color: match ? "var(--ink)" : "var(--paper)",
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>
      </div>

      <LadderInput key={current} word={current} disabled={solved} onSubmit={submit} />

      {hint?.at === current && <div className="text-center text-sm font-semibold text-sun -mt-1">{hint.text}</div>}

      <div className="grid grid-cols-3 gap-2">
        <button onClick={back} disabled={route.length < 2 || solved} className="btn h-11 bg-ink-3 text-paper text-sm">
          ← Back
        </button>
        <button onClick={giveHint} disabled={solved || hint?.at === current} className="btn h-11 bg-ink-3 text-paper text-sm">
          Hint (+1)
        </button>
        {confirmGiveUp ? (
          <button
            onClick={() => onFinish({ route, hints, solved: false })}
            className="btn h-11 bg-berry text-ink text-sm"
          >
            Sure?
          </button>
        ) : (
          <button onClick={() => setConfirmGiveUp(true)} disabled={solved} className="btn h-11 bg-ink-3 text-paper text-sm">
            Give up
          </button>
        )}
      </div>

      <LadderTrail chain={route} />
    </div>
  );
}

type ResultProps = {
  puzzle: Puzzle;
  outcome: PuzzleOutcome;
  dict: Dictionary;
  heading: string;
  shareText?: string;
  onAgain: () => void;
  againLabel: string;
  onHome: () => void;
};

export function PuzzleResults({ puzzle, outcome, dict, heading, shareText, onAgain, againLabel, onHome }: ResultProps) {
  const [copied, setCopied] = useState(false);
  const { start, target, par } = puzzle;
  const strokes = outcome.route.length - 1 + outcome.hints;
  const best = useMemo(() => shortestRoute(start, target, dict) ?? [start, target], [start, target, dict]);

  async function share() {
    if (!shareText) return;
    try {
      if (navigator.share) {
        await navigator.share({ text: shareText });
        return;
      }
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex flex-col w-full max-w-md mx-auto px-4 pt-8 pb-10 gap-6">
      <div className="text-center">
        <div className="text-xs uppercase tracking-[0.2em] text-muted">{heading}</div>
        <div className="font-display text-xl font-bold mt-2 uppercase tracking-wider">
          {start} <span className="text-muted">→</span> {target}
        </div>
      </div>

      <div className="rounded-3xl bg-ink-2 border border-ink-3 p-6 text-center">
        {outcome.solved ? (
          <>
            <div className="font-display text-7xl font-extrabold text-sun leading-none pop">{strokes}</div>
            <div className="text-muted text-sm mt-1">
              {strokes === 1 ? "stroke" : "strokes"} · par {par}
              {outcome.hints > 0 && ` · ${outcome.hints} ${outcome.hints === 1 ? "hint" : "hints"}`}
            </div>
            <div className="font-display text-3xl font-bold mt-4">{parName(strokes, par)}</div>
          </>
        ) : (
          <>
            <div className="font-display text-4xl font-extrabold text-berry">Gave up</div>
            <div className="text-muted text-sm mt-2">Par was {par}. Here&apos;s how:</div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {shareText && (
          <button onClick={share} className="btn h-14 bg-sun text-ink text-lg">
            {copied ? "Copied!" : "Share score"}
          </button>
        )}
        <button onClick={onAgain} className="btn h-14 bg-rip text-ink text-lg">
          {againLabel}
        </button>
        <button onClick={onHome} className="btn h-12 bg-ink-3 text-paper">
          Home
        </button>
      </div>

      {outcome.solved && (
        <section>
          <h2 className="font-display font-bold text-lg mb-2">Your route</h2>
          <Route words={outcome.route} />
        </section>
      )}
      <section>
        <h2 className="font-display font-bold text-lg mb-2">A shortest route ({best.length - 1} moves)</h2>
        <Route words={best} />
      </section>
    </div>
  );
}

function Route({ words }: { words: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {words.map((w, i) => (
        <span key={w + i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted">→</span>}
          <span
            className={`px-2.5 py-1 rounded-lg text-sm font-semibold uppercase ${
              i === 0 || i === words.length - 1 ? "bg-sun text-ink" : "bg-ink-3 text-paper"
            }`}
          >
            {w}
          </span>
        </span>
      ))}
    </div>
  );
}
