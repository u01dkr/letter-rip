// Scores saved on this device (no account needed).

export type Game = "rip" | "ladder";
export type DailyResult = { score: number; words: string[]; possible: number };
/** Word Ladder puzzle: the route taken, hints used, par, and whether it was solved. */
export type PuzzleResult = { route: string[]; hints: number; par: number; target: string; solved: boolean };

type Stats = {
  daily: Record<string, DailyResult>; // Letter Rip, keyed by YYYY-MM-DD
  bestQuick: number;
  bestKids: number;
  ladderDaily: Record<string, DailyResult>; // Word Ladder
  ladderBestQuick: number;
  ladderBestKids: number;
  puzzleDaily: Record<string, PuzzleResult>;
};

const KEY = "letter-rip-stats-v1";
const EMPTY: Stats = {
  daily: {},
  bestQuick: 0,
  bestKids: 0,
  ladderDaily: {},
  ladderBestQuick: 0,
  ladderBestKids: 0,
  puzzleDaily: {},
};

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

function save(stats: Stats) {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    // private browsing or storage full: the game still works, it just won't remember
  }
}

const dailyField = (game: Game) => (game === "rip" ? "daily" : "ladderDaily");

export function getDaily(game: Game, key: string): DailyResult | null {
  return loadStats()[dailyField(game)][key] ?? null;
}

export function saveDaily(game: Game, key: string, result: DailyResult) {
  const s = loadStats();
  const f = dailyField(game);
  if (!s[f][key]) {
    s[f][key] = result; // only the first attempt counts
    save(s);
  }
}

function bestField(game: Game, mode: "quick" | "kids") {
  if (game === "rip") return mode === "quick" ? "bestQuick" : "bestKids";
  return mode === "quick" ? "ladderBestQuick" : "ladderBestKids";
}

export function getBest(game: Game, mode: "quick" | "kids"): number {
  return loadStats()[bestField(game, mode)];
}

/** Saves a best score and returns true if it's a new record. */
export function saveBest(game: Game, mode: "quick" | "kids", score: number): boolean {
  const s = loadStats();
  const field = bestField(game, mode);
  if (score > s[field]) {
    s[field] = score;
    save(s);
    return true;
  }
  return false;
}

/** Consecutive days with a daily result, counting back from today. */
export function dailyStreak(game: Game, todayKey: string): number {
  const daily = loadStats()[dailyField(game)];
  let streak = 0;
  const d = new Date(todayKey + "T12:00:00Z");
  while (daily[d.toISOString().slice(0, 10)]) {
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}

export const getPuzzleDaily = (key: string): PuzzleResult | null => loadStats().puzzleDaily[key] ?? null;

export function savePuzzleDaily(key: string, result: PuzzleResult) {
  const s = loadStats();
  if (!s.puzzleDaily[key]) {
    s.puzzleDaily[key] = result; // only the first attempt counts
    save(s);
  }
}
