// Word Ladder puzzle: get from a start word to a target word in as few moves as possible.
// "Par" is the shortest possible route using any word the game accepts. Puzzles are only
// chosen when that route can also be done with everyday words, so par is always reachable
// and can't be beaten.
import roots from "@/data/roots.json";
import type { Dictionary, Level } from "./words";

export type Puzzle = { start: string; target: string; par: number };

function neighbours(word: string, pool: Set<string>): string[] {
  const out: string[] = [];
  for (let i = 0; i < word.length; i++) {
    for (let c = 97; c <= 122; c++) {
      const ch = String.fromCharCode(c);
      if (ch === word[i]) continue;
      const w = word.slice(0, i) + ch + word.slice(i + 1);
      if (pool.has(w)) out.push(w);
    }
  }
  return out;
}

const fourLetter = (words: Set<string>) => new Set([...words].filter((w) => w.length === 4));

let cache: { common: Set<string>; accepted: Set<string> } | null = null;
function pools(dict: Dictionary) {
  if (!cache) cache = { common: fourLetter(dict.common), accepted: fourLetter(dict.accepted) };
  return cache;
}

/** Distance from `from` to every reachable word (breadth-first search). */
function distances(from: string, pool: Set<string>, avoid?: Set<string>): Map<string, string | null> {
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  for (let q = 0; q < queue.length; q++) {
    const w = queue[q];
    for (const n of neighbours(w, pool)) {
      if (prev.has(n) || avoid?.has(n)) continue;
      prev.set(n, w);
      queue.push(n);
    }
  }
  return prev;
}

/** A shortest route from `from` to `to` (both included), or null if there isn't one. */
export function shortestRoute(
  from: string,
  to: string,
  dict: Dictionary,
  avoid?: Set<string>
): string[] | null {
  const { common, accepted } = pools(dict);
  // Prefer everyday words; fall back to the full dictionary
  for (const pool of [common, accepted]) {
    const p = new Set(pool);
    p.add(from);
    p.add(to);
    const prev = distances(from, p, avoid);
    if (!prev.has(to)) continue;
    const route: string[] = [];
    for (let w: string | null = to; w; w = prev.get(w) ?? null) route.unshift(w);
    return route;
  }
  return null;
}

// Small seeded random number generator, so the daily puzzle is the same for everyone
function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds a puzzle: everyday start and target words, `minPar`–`maxPar` moves apart. */
export function makePuzzle(dict: Dictionary, level: Level, seed?: string): Puzzle {
  const rand = seed ? seeded(seed) : Math.random;
  const { common } = pools(dict);
  const starts = roots.ladder[level];
  const targets = new Set([...roots.ladder.easy, ...roots.ladder.normal]);
  const [minPar, maxPar] = level === "easy" ? [3, 4] : [4, 6];

  const { accepted } = pools(dict);
  const depth = (prev: Map<string, string | null>, start: string) => {
    const dist = new Map<string, number>([[start, 0]]);
    for (const w of prev.keys()) {
      if (dist.has(w)) continue;
      let d = 0;
      for (let x: string | null = w; x && x !== start; x = prev.get(x) ?? null) d++;
      dist.set(w, d);
    }
    return dist;
  };

  for (let tries = 0; tries < 50; tries++) {
    const start = starts[Math.floor(rand() * starts.length)];
    const dist = depth(distances(start, common), start); // using everyday words
    const anyDist = depth(distances(start, accepted), start); // using any accepted word
    const options = [...dist.entries()]
      .filter(([w, d]) => d >= minPar && d <= maxPar && targets.has(w) && anyDist.get(w) === d)
      .map(([w]) => w)
      .sort();
    if (!options.length) continue;
    // Lean towards the longer puzzles in the range
    const longest = options.filter((w) => dist.get(w)! >= maxPar - 1);
    const pickFrom = longest.length && rand() < 0.6 ? longest : options;
    const target = pickFrom[Math.floor(rand() * pickFrom.length)];
    return { start, target, par: dist.get(target)! };
  }
  return { start: "cold", target: "warm", par: 4 }; // the classic, just in case
}

export const dailyPuzzle = (dict: Dictionary, key: string) => makePuzzle(dict, "normal", "ladder-puzzle:" + key);

/** Golf-style name for a score against par (par is the best possible). */
export function parName(moves: number, par: number): string {
  const d = moves - par;
  if (d <= 0) return "Par: perfect!";
  if (d === 1) return "Bogey";
  if (d === 2) return "Double bogey";
  return `${d} over par`;
}
