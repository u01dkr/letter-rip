"use client";

import { useCallback, useEffect, useState } from "react";
import SoloGame, { type SoloResult } from "./SoloGame";
import Results from "./Results";
import {
  dailyNumber,
  dailyRoot,
  findableWords,
  loadDictionary,
  randomRoot,
  todayKey,
  wordPoints,
  type Dictionary,
} from "@/lib/words";
import { dailyStreak, loadStats, saveBest, saveDaily, type DailyResult } from "@/lib/stats";

type Mode = "daily" | "quick" | "kids";

const MODES: Record<Mode, { title: string; seconds: number }> = {
  daily: { title: "Daily Rip", seconds: 120 },
  quick: { title: "Quick Rip", seconds: 120 },
  kids: { title: "Kids' Rip", seconds: 180 },
};

type Screen =
  | { kind: "home" }
  | { kind: "playing"; mode: Mode; root: string; game: number }
  | { kind: "results"; mode: Mode; root: string; score: number; found: string[]; newBest: boolean };

export default function LetterRip() {
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [dictError, setDictError] = useState(false);
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const [today, setToday] = useState<string>("");
  const [todayResult, setTodayResult] = useState<DailyResult | null>(null);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState({ quick: 0, kids: 0 });
  const [showRules, setShowRules] = useState(false);

  const fetchDict = useCallback(() => {
    setDictError(false);
    loadDictionary().then(setDict, () => setDictError(true));
  }, []);

  const refreshStats = useCallback(() => {
    const key = todayKey();
    const s = loadStats();
    setToday(key);
    setTodayResult(s.daily[key] ?? null);
    setStreak(dailyStreak(key));
    setBest({ quick: s.bestQuick, kids: s.bestKids });
  }, []);

  useEffect(() => {
    loadDictionary().then(setDict, () => setDictError(true));
    // Saved scores live in the browser, so read them after the first render
    const t = setTimeout(refreshStats, 0);
    return () => clearTimeout(t);
  }, [refreshStats]);

  // Jump back to the top whenever the screen changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen.kind]);

  function start(mode: Mode) {
    const root =
      mode === "daily" ? dailyRoot(todayKey()) : randomRoot(mode === "kids" ? "easy" : "normal");
    setScreen({ kind: "playing", mode, root, game: Date.now() });
  }

  const finish = useCallback(
    (mode: Mode) => (r: SoloResult) => {
      let newBest = false;
      if (mode === "daily") {
        const possible = dict ? findableWords(r.root, dict).length : 0;
        saveDaily(todayKey(), { score: r.score, words: r.found, possible });
      } else {
        newBest = saveBest(mode, r.score);
      }
      refreshStats();
      setScreen({ kind: "results", mode, root: r.root, score: r.score, found: r.found, newBest });
    },
    [dict, refreshStats]
  );

  function showTodayResults() {
    if (!todayResult) return;
    setScreen({
      kind: "results",
      mode: "daily",
      root: dailyRoot(today),
      score: todayResult.score,
      found: todayResult.words,
      newBest: false,
    });
  }

  if (screen.kind === "playing" && dict) {
    return (
      <SoloGame
        key={screen.game}
        root={screen.root}
        seconds={MODES[screen.mode].seconds}
        dict={dict}
        title={MODES[screen.mode].title}
        onFinish={finish(screen.mode)}
        onQuit={() => setScreen({ kind: "home" })}
      />
    );
  }

  if (screen.kind === "results" && dict) {
    const { mode, root, score, found } = screen;
    const num = dailyNumber(today);
    const shareText =
      mode === "daily"
        ? `Letter Rip #${num} 🔤\n${score} points · ${found.length} words` +
          (found.some((w) => w.length === root.length) ? " · FULL RIP! 🎉" : "") +
          (typeof window !== "undefined" ? `\n${window.location.origin}` : "")
        : undefined;
    return (
      <Results
        root={root}
        score={score}
        found={found}
        possible={findableWords(root, dict)}
        heading={mode === "daily" ? `Daily Rip #${num}` : MODES[mode].title}
        newBest={screen.newBest}
        shareText={shareText}
        onAgain={mode === "daily" ? () => start("quick") : () => start(mode)}
        againLabel={mode === "daily" ? "Play a Quick Rip" : "Play again"}
        onHome={() => setScreen({ kind: "home" })}
      />
    );
  }

  // Home
  const ready = !!dict;
  return (
    <main className="flex flex-col w-full max-w-md mx-auto px-4 pt-10 pb-10 gap-7">
      <header className="text-center">
        <div className="font-display font-bold text-muted tracking-[0.35em] uppercase text-sm">Letter</div>
        <h1 className="font-display font-extrabold text-[5.5rem] leading-[0.85] text-rip -rotate-3 drop-shadow-[0_6px_0_rgba(0,0,0,0.35)]">
          RIP!
        </h1>
        <p className="mt-4 text-paper/80">How many words can you rip out of one big word?</p>
      </header>

      {dictError && (
        <div className="rounded-2xl bg-berry/20 border border-berry p-4 text-sm">
          Couldn&apos;t load the word list. Check your connection.{" "}
          <button onClick={fetchDict} className="underline font-semibold">
            Try again
          </button>
        </div>
      )}

      <section className="flex flex-col gap-3">
        {/* Daily */}
        <div className="rounded-3xl bg-sun text-ink p-5 shadow-[0_6px_0_#b8901c]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-display text-2xl font-extrabold">Daily Rip</div>
              <div className="text-sm text-ink/70">
                Same word for everyone today{today ? ` · #${dailyNumber(today)}` : ""}
              </div>
            </div>
            {streak > 0 && (
              <div className="text-right shrink-0">
                <div className="font-display text-2xl font-extrabold leading-none">{streak}🔥</div>
                <div className="text-[10px] uppercase tracking-wider">day streak</div>
              </div>
            )}
          </div>
          {todayResult ? (
            <button onClick={showTodayResults} disabled={!ready} className="btn mt-4 w-full h-12 bg-ink text-sun">
              Done today: {todayResult.score} pts · See results
            </button>
          ) : (
            <button onClick={() => start("daily")} disabled={!ready} className="btn mt-4 w-full h-12 bg-ink text-sun text-lg">
              {ready ? "Play today's word" : "Loading…"}
            </button>
          )}
        </div>

        {/* Quick + Kids */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => start("quick")}
            disabled={!ready}
            className="btn text-left rounded-3xl bg-rip text-ink p-4 shadow-[0_6px_0_#b23a17]"
          >
            <div className="font-display text-xl font-extrabold">Quick Rip</div>
            <div className="text-sm text-ink/75 font-sans font-medium">Random word · 2 min</div>
            {best.quick > 0 && <div className="text-xs mt-2 font-sans font-semibold">Best: {best.quick}</div>}
          </button>
          <button
            onClick={() => start("kids")}
            disabled={!ready}
            className="btn text-left rounded-3xl bg-mint text-ink p-4 shadow-[0_6px_0_#1f9a66]"
          >
            <div className="font-display text-xl font-extrabold">Kids&apos; Rip</div>
            <div className="text-sm text-ink/75 font-sans font-medium">Easier word · 3 min</div>
            {best.kids > 0 && <div className="text-xs mt-2 font-sans font-semibold">Best: {best.kids}</div>}
          </button>
        </div>

        {/* Challenge (next stage) */}
        <div className="rounded-3xl border-2 border-dashed border-ink-3 p-4 flex items-center justify-between">
          <div>
            <div className="font-display text-xl font-extrabold text-paper/90">Challenge</div>
            <div className="text-sm text-muted">2+ players · three strikes and you&apos;re out</div>
          </div>
          <span className="text-xs font-bold uppercase tracking-wider bg-ink-3 text-muted px-2.5 py-1 rounded-full">
            Soon
          </span>
        </div>
      </section>

      <section className="rounded-2xl bg-ink-2/70 border border-ink-3">
        <button
          onClick={() => setShowRules((s) => !s)}
          className="w-full flex justify-between items-center p-4 font-display font-bold"
          aria-expanded={showRules}
        >
          How to play <span className="text-muted">{showRules ? "−" : "+"}</span>
        </button>
        {showRules && (
          <div className="px-4 pb-4 text-sm text-paper/85 space-y-2">
            <p>Make words of three letters or more from the big word. Each letter can be used once.</p>
            <p>
              Longer words score more:{" "}
              {[3, 4, 5, 6, 7, 8, 9].map((n) => `${n}→${wordPoints("x".repeat(n), "x".repeat(10))}`).join(", ")}.
            </p>
            <p>
              Use <b>every</b> letter for a <span className="text-sun font-bold">Full Rip</span>: +10 bonus.
            </p>
            <p className="text-muted">On a keyboard: type letters, Enter to submit, Space to shuffle.</p>
          </div>
        )}
      </section>
    </main>
  );
}
