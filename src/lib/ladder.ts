// Word Ladder rules: change one letter at a time to make a new word.
// Shared by solo and challenge games.
import roots from "@/data/roots.json";
import type { Dictionary, Level } from "./words";

export const LADDER_LEN = 4;

/** Seconds per move. */
export const ladderSeconds = (level: Level) => (level === "easy" ? 25 : 15);

/** True if the two words are the same length and differ in exactly one position. */
export function oneLetterApart(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++diff > 1) return false;
  return diff === 1;
}

/** Every unused word one letter away from `word`. Common words come first. */
export function movesFrom(word: string, used: Set<string>, dict: Dictionary): string[] {
  const common: string[] = [];
  const rare: string[] = [];
  for (let i = 0; i < word.length; i++) {
    for (let c = 97; c <= 122; c++) {
      const ch = String.fromCharCode(c);
      if (ch === word[i]) continue;
      const w = word.slice(0, i) + ch + word.slice(i + 1);
      if (used.has(w) || !dict.accepted.has(w)) continue;
      (dict.common.has(w) ? common : rare).push(w);
    }
  }
  return [...common, ...rare];
}

export const isDeadEnd = (word: string, used: Set<string>, dict: Dictionary) =>
  movesFrom(word, used, dict).length === 0;

export type LadderResult =
  | { ok: true; word: string }
  | { ok: false; reason: "length" | "same" | "oneLetter" | "used" | "unknown" };

export function checkLadder(raw: string, current: string, used: Set<string>, dict: Dictionary): LadderResult {
  const word = raw.trim().toLowerCase();
  if (word.length !== current.length) return { ok: false, reason: "length" };
  if (word === current) return { ok: false, reason: "same" };
  if (!oneLetterApart(word, current)) return { ok: false, reason: "oneLetter" };
  if (used.has(word)) return { ok: false, reason: "used" };
  if (!dict.accepted.has(word)) return { ok: false, reason: "unknown" };
  return { ok: true, word };
}

export const LADDER_REASON: Record<Exclude<LadderResult, { ok: true }>["reason"], string> = {
  length: "Four letters, please",
  same: "Change one letter",
  oneLetter: "Only change one letter",
  used: "Already used",
  unknown: "Not in our dictionary",
};

export function randomLadderStart(level: Level, avoid: string[] = []): string {
  const list = roots.ladder[level];
  for (let i = 0; i < 20; i++) {
    const w = list[Math.floor(Math.random() * list.length)];
    if (!avoid.includes(w)) return w;
  }
  return list[Math.floor(Math.random() * list.length)];
}

/** The same start word for everyone on a given day. */
export function dailyLadderStart(key: string): string {
  const list = roots.ladder.normal;
  let h = 2166136261;
  for (const ch of "word-ladder:" + key) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return list[(h >>> 0) % list.length];
}
