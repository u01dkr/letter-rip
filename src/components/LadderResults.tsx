"use client";

import { useMemo, useState } from "react";
import type { Dictionary } from "@/lib/words";
import { movesFrom } from "@/lib/ladder";

type Props = {
  chain: string[];
  ending: "timeout" | "deadend";
  dict: Dictionary;
  heading: string;
  newBest?: boolean;
  shareText?: string;
  onAgain?: () => void;
  againLabel?: string;
  onHome: () => void;
};

function rank(rungs: number): string {
  if (rungs >= 30) return "Ladder Legend";
  if (rungs >= 20) return "High Climber";
  if (rungs >= 12) return "Steady Climber";
  if (rungs >= 6) return "On the ladder";
  return "First rungs";
}

export default function LadderResults({
  chain,
  ending,
  dict,
  heading,
  newBest,
  shareText,
  onAgain,
  againLabel = "Play again",
  onHome,
}: Props) {
  const [copied, setCopied] = useState(false);
  const rungs = chain.length - 1;
  const last = chain[chain.length - 1];
  const couldHave = useMemo(
    () => (ending === "timeout" ? movesFrom(last, new Set(chain), dict).slice(0, 12) : []),
    [ending, last, chain, dict]
  );

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
        <div className="font-display text-lg text-paper/80 mt-2">
          Started from <b className="uppercase tracking-wider text-paper">{chain[0]}</b>
        </div>
      </div>

      <div className="rounded-3xl bg-ink-2 border border-ink-3 p-6 text-center">
        <div className="font-display text-7xl font-extrabold text-sun leading-none pop">{rungs}</div>
        <div className="text-muted text-sm mt-1">{rungs === 1 ? "rung" : "rungs"}</div>
        {newBest && (
          <div className="inline-block mt-3 px-3 py-1 rounded-full bg-mint text-ink text-sm font-bold">
            New personal best!
          </div>
        )}
        <div className="font-display text-2xl font-bold mt-4">{rank(rungs)}</div>
        <div className="mt-2 text-sm text-paper/80">
          {ending === "deadend" ? (
            <>
              <b className="uppercase">{last}</b> was a dead end: no new words left from there.
            </>
          ) : (
            <>Ran out of time on <b className="uppercase">{last}</b>.</>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {shareText && (
          <button onClick={share} className="btn h-14 bg-sun text-ink text-lg">
            {copied ? "Copied!" : "Share score"}
          </button>
        )}
        {onAgain && (
          <button onClick={onAgain} className="btn h-14 bg-rip text-ink text-lg">
            {againLabel}
          </button>
        )}
        <button onClick={onHome} className="btn h-12 bg-ink-3 text-paper">
          Home
        </button>
      </div>

      {couldHave.length > 0 && (
        <section>
          <h2 className="font-display font-bold text-lg mb-2">
            From <span className="uppercase">{last}</span> you could have played
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {couldHave.map((w) => (
              <span key={w} className="px-2.5 py-1 rounded-lg text-sm font-semibold uppercase bg-ink-3 text-paper/80">
                {w}
              </span>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-display font-bold text-lg mb-2">Your ladder</h2>
        <div className="flex flex-wrap gap-1.5 items-center">
          {chain.map((w, i) => (
            <span key={w} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted">→</span>}
              <span
                className={`px-2.5 py-1 rounded-lg text-sm font-semibold uppercase ${
                  i === 0 ? "bg-ink-3 text-paper/70" : "bg-mint/90 text-ink"
                }`}
              >
                {w}
              </span>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
