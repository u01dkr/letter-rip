"use client";

import { useMemo, useState } from "react";

type Props = {
  root: string;
  score: number;
  found: string[];
  possible: string[]; // everyday words that could be made
  heading: string;
  newBest?: boolean;
  shareText?: string;
  onAgain?: () => void;
  againLabel?: string;
  onHome: () => void;
};

function rank(foundCount: number, possibleCount: number): string {
  const p = possibleCount ? foundCount / possibleCount : 0;
  if (p >= 0.6) return "Word Wizard";
  if (p >= 0.4) return "Letter Ripper";
  if (p >= 0.25) return "Sharp";
  if (p >= 0.12) return "Getting going";
  return "Warming up";
}

export default function Results({
  root,
  score,
  found,
  possible,
  heading,
  newBest,
  shareText,
  onAgain,
  againLabel = "Play again",
  onHome,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);

  const foundSet = useMemo(() => new Set(found), [found]);
  const missed = useMemo(() => possible.filter((w) => !foundSet.has(w)), [possible, foundSet]);
  const longest = useMemo(
    () => found.reduce((a, w) => (w.length > a.length ? w : a), ""),
    [found]
  );
  // Found words can include rarer words not in the "possible" list, so cap the count
  const totalPossible = Math.max(possible.length, found.length);
  const shownMissed = showAll ? missed : missed.slice(0, 24);

  async function share() {
    if (!shareText) return;
    try {
      if (navigator.share) {
        await navigator.share({ text: shareText });
        return;
      }
    } catch {
      return; // user closed the share sheet
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
        <div className="flex justify-center gap-1 mt-3 flex-wrap">
          {root.split("").map((ch, i) => (
            <span
              key={i}
              className="tile w-9 h-11 flex items-center justify-center text-xl"
            >
              {ch}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-3xl bg-ink-2 border border-ink-3 p-6 text-center">
        <div className="font-display text-7xl font-extrabold text-sun leading-none pop">{score}</div>
        <div className="text-muted text-sm mt-1">points</div>
        {newBest && (
          <div className="inline-block mt-3 px-3 py-1 rounded-full bg-mint text-ink text-sm font-bold">
            New personal best!
          </div>
        )}
        <div className="font-display text-2xl font-bold mt-4">{rank(found.length, totalPossible)}</div>
        <div className="grid grid-cols-2 gap-3 mt-5 text-left">
          <div className="rounded-2xl bg-ink-3/60 p-3">
            <div className="text-xs text-muted uppercase tracking-wider">Words</div>
            <div className="font-display text-xl font-bold">
              {found.length} <span className="text-muted text-base font-medium">of {totalPossible}</span>
            </div>
          </div>
          <div className="rounded-2xl bg-ink-3/60 p-3">
            <div className="text-xs text-muted uppercase tracking-wider">Longest</div>
            <div className="font-display text-xl font-bold uppercase truncate">{longest || "—"}</div>
          </div>
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

      {found.length > 0 && (
        <section>
          <h2 className="font-display font-bold text-lg mb-2">You found</h2>
          <div className="flex flex-wrap gap-1.5">
            {[...found]
              .sort((a, b) => b.length - a.length || a.localeCompare(b))
              .map((w) => (
                <span
                  key={w}
                  className="px-2.5 py-1 rounded-lg text-sm font-semibold uppercase bg-mint/90 text-ink"
                >
                  {w}
                </span>
              ))}
          </div>
        </section>
      )}

      {missed.length > 0 && (
        <section>
          <h2 className="font-display font-bold text-lg mb-2">
            You missed <span className="text-muted font-medium text-base">({missed.length})</span>
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {shownMissed.map((w) => (
              <span
                key={w}
                className={`px-2.5 py-1 rounded-lg text-sm font-semibold uppercase ${
                  w.length === root.length ? "bg-sun text-ink" : "bg-ink-3 text-paper/80"
                }`}
              >
                {w}
              </span>
            ))}
          </div>
          {missed.length > shownMissed.length && (
            <button onClick={() => setShowAll(true)} className="mt-3 text-sun font-semibold text-sm underline">
              Show all {missed.length}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
