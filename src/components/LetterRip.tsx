"use client";

import { useCallback, useEffect, useState } from "react";
import SoloGame, { type SoloResult } from "./SoloGame";
import Results from "./Results";
import LadderSolo, { type LadderSoloResult } from "./LadderSolo";
import LadderResults from "./LadderResults";
import LadderPuzzle, { PuzzleResults, type PuzzleOutcome } from "./LadderPuzzle";
import { dailyPuzzle, makePuzzle, type Puzzle } from "@/lib/puzzle";
import ChallengeCard from "./ChallengeCard";
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
import { dailyLadderStart, ladderSeconds, randomLadderStart } from "@/lib/ladder";
import {
  dailyStreak,
  getBest,
  getDaily,
  getPuzzleDaily,
  saveBest,
  saveDaily,
  savePuzzleDaily,
  type DailyResult,
  type Game,
  type PuzzleResult,
} from "@/lib/stats";

type Mode = "daily" | "quick" | "kids";

const RIP_MODES: Record<Mode, { title: string; seconds: number }> = {
  daily: { title: "Daily Rip", seconds: 120 },
  quick: { title: "Quick Rip", seconds: 120 },
  kids: { title: "Kids' Rip", seconds: 180 },
};
const LADDER_MODES: Record<Mode, { title: string }> = {
  daily: { title: "Daily Ladder" },
  quick: { title: "Quick Ladder" },
  kids: { title: "Kids' Ladder" },
};

type Screen =
  | { kind: "home" }
  | { kind: "playing"; mode: Mode; root: string; game: number }
  | { kind: "results"; mode: Mode; root: string; score: number; found: string[]; newBest: boolean }
  | { kind: "ladder"; mode: Mode; start: string; game: number }
  | { kind: "ladderResults"; mode: Mode; chain: string[]; ending: LadderSoloResult["ending"]; newBest: boolean }
  | { kind: "puzzle"; mode: Mode; puzzle: Puzzle; game: number }
  | { kind: "puzzleResults"; mode: Mode; puzzle: Puzzle; outcome: PuzzleOutcome };

const PUZZLE_TITLES: Record<Mode, string> = { daily: "Daily Puzzle", quick: "Puzzle", kids: "Kids' Puzzle" };

const GAME_KEY = "letter-rip-game";

export default function LetterRip() {
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [dictError, setDictError] = useState(false);
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const [game, setGame] = useState<Game>("rip");
  const [today, setToday] = useState<string>("");
  const [todayResult, setTodayResult] = useState<DailyResult | null>(null);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState({ quick: 0, kids: 0 });
  const [showRules, setShowRules] = useState(false);
  const [puzzleToday, setPuzzleToday] = useState<PuzzleResult | null>(null);

  const fetchDict = useCallback(() => {
    setDictError(false);
    loadDictionary().then(setDict, () => setDictError(true));
  }, []);

  const refreshStats = useCallback((g: Game) => {
    const key = todayKey();
    setToday(key);
    setTodayResult(getDaily(g, key));
    setStreak(dailyStreak(g, key));
    setBest({ quick: getBest(g, "quick"), kids: getBest(g, "kids") });
    setPuzzleToday(getPuzzleDaily(key));
  }, []);

  useEffect(() => {
    loadDictionary().then(setDict, () => setDictError(true));
    // Saved scores and the last game picked live in the browser, so read them after the first render
    const t = setTimeout(() => {
      let g: Game = "rip";
      try {
        if (localStorage.getItem(GAME_KEY) === "ladder") g = "ladder";
      } catch {
        /* ignore */
      }
      setGame(g);
      refreshStats(g);
    }, 0);
    return () => clearTimeout(t);
  }, [refreshStats]);

  function switchGame(g: Game) {
    setGame(g);
    setShowRules(false);
    refreshStats(g);
    try {
      localStorage.setItem(GAME_KEY, g);
    } catch {
      /* ignore */
    }
  }

  // Jump back to the top whenever the screen changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen.kind]);

  function start(mode: Mode) {
    if (game === "ladder") {
      const s = mode === "daily" ? dailyLadderStart(todayKey()) : randomLadderStart(mode === "kids" ? "easy" : "normal");
      setScreen({ kind: "ladder", mode, start: s, game: Date.now() });
      return;
    }
    const root = mode === "daily" ? dailyRoot(todayKey()) : randomRoot(mode === "kids" ? "easy" : "normal");
    setScreen({ kind: "playing", mode, root, game: Date.now() });
  }

  const finishRip = useCallback(
    (mode: Mode) => (r: SoloResult) => {
      let newBest = false;
      if (mode === "daily") {
        const possible = dict ? findableWords(r.root, dict).length : 0;
        saveDaily("rip", todayKey(), { score: r.score, words: r.found, possible });
      } else {
        newBest = saveBest("rip", mode, r.score);
      }
      refreshStats("rip");
      setScreen({ kind: "results", mode, root: r.root, score: r.score, found: r.found, newBest });
    },
    [dict, refreshStats]
  );

  function startPuzzle(mode: Mode) {
    if (!dict) return;
    const puzzle =
      mode === "daily" ? dailyPuzzle(dict, todayKey()) : makePuzzle(dict, mode === "kids" ? "easy" : "normal");
    setScreen({ kind: "puzzle", mode, puzzle, game: Date.now() });
  }

  const finishPuzzle = useCallback(
    (mode: Mode, puzzle: Puzzle) => (outcome: PuzzleOutcome) => {
      if (mode === "daily") {
        savePuzzleDaily(todayKey(), { ...outcome, par: puzzle.par, target: puzzle.target });
        refreshStats("ladder");
      }
      setScreen({ kind: "puzzleResults", mode, puzzle, outcome });
    },
    [refreshStats]
  );

  function showPuzzleToday() {
    if (!puzzleToday) return;
    const { route, hints, solved, par, target } = puzzleToday;
    setScreen({
      kind: "puzzleResults",
      mode: "daily",
      puzzle: { start: route[0], target, par },
      outcome: { route, hints, solved },
    });
  }

  const finishLadder = useCallback(
    (mode: Mode) => (r: LadderSoloResult) => {
      const rungs = r.chain.length - 1;
      let newBest = false;
      if (mode === "daily") {
        saveDaily("ladder", todayKey(), { score: rungs, words: r.chain, possible: r.ending === "deadend" ? 1 : 0 });
      } else {
        newBest = saveBest("ladder", mode, rungs);
      }
      refreshStats("ladder");
      setScreen({ kind: "ladderResults", mode, chain: r.chain, ending: r.ending, newBest });
    },
    [refreshStats]
  );

  function showTodayResults() {
    if (!todayResult) return;
    if (game === "ladder") {
      setScreen({
        kind: "ladderResults",
        mode: "daily",
        chain: todayResult.words,
        ending: todayResult.possible ? "deadend" : "timeout",
        newBest: false,
      });
      return;
    }
    setScreen({
      kind: "results",
      mode: "daily",
      root: dailyRoot(today),
      score: todayResult.score,
      found: todayResult.words,
      newBest: false,
    });
  }

  const home = () => setScreen({ kind: "home" });
  const origin = typeof window !== "undefined" ? `\n${window.location.origin}` : "";

  if (screen.kind === "playing" && dict) {
    return (
      <SoloGame
        key={screen.game}
        root={screen.root}
        seconds={RIP_MODES[screen.mode].seconds}
        dict={dict}
        title={RIP_MODES[screen.mode].title}
        onFinish={finishRip(screen.mode)}
        onQuit={home}
      />
    );
  }

  if (screen.kind === "ladder" && dict) {
    return (
      <LadderSolo
        key={screen.game}
        start={screen.start}
        seconds={ladderSeconds(screen.mode === "kids" ? "easy" : "normal")}
        dict={dict}
        title={LADDER_MODES[screen.mode].title}
        onFinish={finishLadder(screen.mode)}
        onQuit={home}
      />
    );
  }

  if (screen.kind === "puzzle" && dict) {
    return (
      <LadderPuzzle
        key={screen.game}
        puzzle={screen.puzzle}
        dict={dict}
        title={PUZZLE_TITLES[screen.mode]}
        onFinish={finishPuzzle(screen.mode, screen.puzzle)}
        onQuit={home}
      />
    );
  }

  if (screen.kind === "puzzleResults" && dict) {
    const { mode, puzzle, outcome } = screen;
    const strokes = outcome.route.length - 1 + outcome.hints;
    const shareText =
      mode === "daily"
        ? `Word Ladder Puzzle #${dailyNumber(today)} ⛳\n${puzzle.start.toUpperCase()} → ${puzzle.target.toUpperCase()}: ` +
          (outcome.solved ? `${strokes} (par ${puzzle.par})` : "gave up!") +
          origin
        : undefined;
    return (
      <PuzzleResults
        puzzle={puzzle}
        outcome={outcome}
        dict={dict}
        heading={mode === "daily" ? `Daily Puzzle #${dailyNumber(today)}` : PUZZLE_TITLES[mode]}
        shareText={shareText}
        onAgain={() => startPuzzle(mode === "daily" ? "quick" : mode)}
        againLabel={mode === "daily" ? "Try a random puzzle" : "Another puzzle"}
        onHome={home}
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
          origin
        : undefined;
    return (
      <Results
        root={root}
        score={score}
        found={found}
        possible={findableWords(root, dict)}
        heading={mode === "daily" ? `Daily Rip #${num}` : RIP_MODES[mode].title}
        newBest={screen.newBest}
        shareText={shareText}
        onAgain={mode === "daily" ? () => start("quick") : () => start(mode)}
        againLabel={mode === "daily" ? "Play a Quick Rip" : "Play again"}
        onHome={home}
      />
    );
  }

  if (screen.kind === "ladderResults" && dict) {
    const { mode, chain, ending } = screen;
    const num = dailyNumber(today);
    const rungs = chain.length - 1;
    const shareText =
      mode === "daily"
        ? `Word Ladder #${num} 🪜\n${rungs} ${rungs === 1 ? "rung" : "rungs"} from ${chain[0].toUpperCase()}` + origin
        : undefined;
    return (
      <LadderResults
        chain={chain}
        ending={ending}
        dict={dict}
        heading={mode === "daily" ? `Daily Ladder #${num}` : LADDER_MODES[mode].title}
        newBest={screen.newBest}
        shareText={shareText}
        onAgain={mode === "daily" ? () => start("quick") : () => start(mode)}
        againLabel={mode === "daily" ? "Play a Quick Ladder" : "Play again"}
        onHome={home}
      />
    );
  }

  // Home
  const ready = !!dict;
  const isLadder = game === "ladder";
  const name = isLadder ? "Ladder" : "Rip";
  return (
    <main className="flex flex-col w-full max-w-md mx-auto px-4 pt-10 pb-10 gap-6">
      <header className="text-center">
        <div className="font-display font-bold text-muted tracking-[0.35em] uppercase text-sm">Letter</div>
        <h1 className="font-display font-extrabold text-[5.5rem] leading-[0.85] text-rip -rotate-3 drop-shadow-[0_6px_0_rgba(0,0,0,0.35)]">
          RIP!
        </h1>
      </header>

      {/* Game switch */}
      <div className="grid grid-cols-2 p-1 rounded-2xl bg-ink-2 border border-ink-3" role="tablist">
        {(["rip", "ladder"] as const).map((g) => (
          <button
            key={g}
            role="tab"
            aria-selected={game === g}
            onClick={() => switchGame(g)}
            className={`btn h-11 rounded-xl ${game === g ? "bg-paper text-ink" : "text-paper/70"}`}
          >
            {g === "rip" ? "Letter Rip" : "Word Ladder"}
          </button>
        ))}
      </div>
      <p className="-mt-2 text-center text-paper/80">
        {isLadder
          ? "Change one letter at a time. How high can you climb?"
          : "How many words can you rip out of one big word?"}
      </p>

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
              <div className="font-display text-2xl font-extrabold">Daily {name}</div>
              <div className="text-sm text-ink/70">
                Same {isLadder ? "start word" : "word"} for everyone today{today ? ` · #${dailyNumber(today)}` : ""}
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
              Done today: {todayResult.score} {isLadder ? "rungs" : "pts"} · See results
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
            <div className="font-display text-xl font-extrabold">Quick {name}</div>
            <div className="text-sm text-ink/75 font-sans font-medium">
              {isLadder ? "Random word · 15s a go" : "Random word · 2 min"}
            </div>
            {best.quick > 0 && <div className="text-xs mt-2 font-sans font-semibold">Best: {best.quick}</div>}
          </button>
          <button
            onClick={() => start("kids")}
            disabled={!ready}
            className="btn text-left rounded-3xl bg-mint text-ink p-4 shadow-[0_6px_0_#1f9a66]"
          >
            <div className="font-display text-xl font-extrabold">Kids&apos; {name}</div>
            <div className="text-sm text-ink/75 font-sans font-medium">
              {isLadder ? "Easier word · 25s a go" : "Easier word · 3 min"}
            </div>
            {best.kids > 0 && <div className="text-xs mt-2 font-sans font-semibold">Best: {best.kids}</div>}
          </button>
        </div>

        {isLadder && (
          <div className="rounded-3xl bg-[#5cc8ff] text-ink p-5 shadow-[0_6px_0_#2a8ab8]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-display text-2xl font-extrabold">Ladder Puzzle ⛳</div>
                <div className="text-sm text-ink/75">Get from one word to another in as few moves as you can</div>
              </div>
            </div>
            {puzzleToday ? (
              <button onClick={showPuzzleToday} disabled={!ready} className="btn mt-4 w-full h-12 bg-ink text-[#5cc8ff]">
                {puzzleToday.solved
                  ? `Today's: ${puzzleToday.route.length - 1 + puzzleToday.hints} (par ${puzzleToday.par}) · See results`
                  : "Today's: gave up · See results"}
              </button>
            ) : (
              <button
                onClick={() => startPuzzle("daily")}
                disabled={!ready}
                className="btn mt-4 w-full h-12 bg-ink text-[#5cc8ff] text-lg"
              >
                {ready ? "Today's puzzle" : "Loading…"}
              </button>
            )}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button onClick={() => startPuzzle("quick")} disabled={!ready} className="btn h-11 bg-ink/15 text-ink">
                Random
              </button>
              <button onClick={() => startPuzzle("kids")} disabled={!ready} className="btn h-11 bg-ink/15 text-ink">
                Kids&apos;
              </button>
            </div>
          </div>
        )}

        <ChallengeCard />
      </section>

      <section className="rounded-2xl bg-ink-2/70 border border-ink-3">
        <button
          onClick={() => setShowRules((s) => !s)}
          className="w-full flex justify-between items-center p-4 font-display font-bold"
          aria-expanded={showRules}
        >
          How to play {isLadder ? "Word Ladder" : "Letter Rip"} <span className="text-muted">{showRules ? "−" : "+"}</span>
        </button>
        {showRules &&
          (isLadder ? (
            <div className="px-4 pb-4 text-sm text-paper/85 space-y-2">
              <p>
                You get a four-letter word. Change <b>one</b> letter to make a new word, then change one letter of
                that, and so on: LOVE → MOVE → MODE → MADE → FADE…
              </p>
              <p>No word can be used twice. You get 15 seconds for each move (25 in Kids&apos;).</p>
              <p>
                Your score is how many rungs you climb. Watch out for <b>dead ends</b>: words with nowhere left to
                go. Keep your options open!
              </p>
              <p>
                <b>Ladder Puzzle:</b> get from the start word to the target word, one letter at a time, in as few
                moves as you can. Par is the shortest route. No clock, but each hint costs a stroke.
              </p>
              <p className="text-muted">On a keyboard: just type the new word and press Enter.</p>
            </div>
          ) : (
            <div className="px-4 pb-4 text-sm text-paper/85 space-y-2">
              <p>
                You get a big word. Make new words of three letters or more from its letters. Each letter can be
                used once, and the big word itself doesn&apos;t count.
              </p>
              <p>
                Longer words score more:{" "}
                {[3, 4, 5, 6, 7, 8, 9].map((n) => `${n}→${wordPoints("x".repeat(n), "x".repeat(10))}`).join(", ")}.
              </p>
              <p>
                Find a <b>different</b> word that uses every letter for a{" "}
                <span className="text-sun font-bold">Full Rip</span>: +10 bonus.
              </p>
              <p className="text-muted">On a keyboard: type letters, Enter to submit, Space to shuffle.</p>
            </div>
          ))}
      </section>
    </main>
  );
}
