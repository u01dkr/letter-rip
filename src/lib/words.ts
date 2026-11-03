// Word data and the core "can this word be made from the root?" logic.
// Shared by every game mode (solo now, challenge later).
import roots from "@/data/roots.json";

export type Level = "normal" | "easy";

export type Dictionary = {
  accepted: Set<string>; // every word a player may enter
  common: Set<string>; // everyday words: used for "words you missed"
};

let dictPromise: Promise<Dictionary> | null = null;

/** Loads the word list once (about 140 KB compressed) and caches it. */
export function loadDictionary(): Promise<Dictionary> {
  if (!dictPromise) {
    dictPromise = fetch("/dict.txt")
      .then((r) => {
        if (!r.ok) throw new Error("Could not load the word list");
        return r.text();
      })
      .then((text) => {
        const accepted = new Set<string>();
        const common = new Set<string>();
        for (const line of text.split("\n")) {
          if (!line) continue;
          if (line.endsWith("*")) {
            const w = line.slice(0, -1);
            accepted.add(w);
            common.add(w);
          } else {
            accepted.add(line);
          }
        }
        return { accepted, common };
      })
      .catch((e) => {
        dictPromise = null; // allow a retry
        throw e;
      });
  }
  return dictPromise;
}

function letterCounts(word: string): number[] {
  const c = new Array(26).fill(0);
  for (const ch of word) c[ch.charCodeAt(0) - 97]++;
  return c;
}

/** True if `word` uses only letters from `root`, each at most as often as it appears. */
export function canMake(word: string, root: string): boolean {
  const rc = letterCounts(root);
  const c = new Array(26).fill(0);
  for (const ch of word) {
    const i = ch.charCodeAt(0) - 97;
    if (i < 0 || i > 25) return false;
    if (++c[i] > rc[i]) return false;
  }
  return true;
}

/** Everyday words that can be made from the root (the "possible" list). */
export function findableWords(root: string, dict: Dictionary): string[] {
  const out: string[] = [];
  for (const w of dict.common) {
    if (w.length <= root.length && canMake(w, root)) out.push(w);
  }
  return out.sort((a, b) => b.length - a.length || a.localeCompare(b));
}

/** Points for a word: longer words are worth a lot more. */
export function wordPoints(word: string, root: string): number {
  const table: Record<number, number> = { 3: 1, 4: 2, 5: 3, 6: 5, 7: 8, 8: 12, 9: 16 };
  let pts = table[word.length] ?? 0;
  if (word.length === root.length) pts += 10; // used every letter: a "full rip"
  return pts;
}

export type GuessResult =
  | { ok: true; word: string; points: number; fullRip: boolean }
  | { ok: false; reason: "short" | "letters" | "used" | "unknown" };

export function checkGuess(
  raw: string,
  root: string,
  used: Set<string>,
  dict: Dictionary
): GuessResult {
  const word = raw.trim().toLowerCase();
  if (word.length < 3) return { ok: false, reason: "short" };
  if (!canMake(word, root)) return { ok: false, reason: "letters" };
  if (used.has(word)) return { ok: false, reason: "used" };
  if (!dict.accepted.has(word)) return { ok: false, reason: "unknown" };
  return {
    ok: true,
    word,
    points: wordPoints(word, root),
    fullRip: word.length === root.length,
  };
}

export const REASON_TEXT: Record<Exclude<GuessResult, { ok: true }>["reason"], string> = {
  short: "Three letters or more",
  letters: "Those letters aren't all there",
  used: "Already got that one",
  unknown: "Not in our dictionary",
};

export function randomRoot(level: Level, avoid?: string): string {
  const list = roots[level];
  let r = list[Math.floor(Math.random() * list.length)];
  if (r === avoid && list.length > 1) r = list[(list.indexOf(r) + 1) % list.length];
  return r;
}

/** Today's date in Ireland as YYYY-MM-DD, so everyone gets the same daily word. */
export function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Dublin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const DAILY_START = Date.UTC(2026, 10, 1); // 1 Nov 2026 = puzzle #1

export function dailyNumber(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - DAILY_START) / 86400000) + 1;
}

/** The same root for everyone on a given day. */
export function dailyRoot(key: string): string {
  const list = roots.normal;
  // Simple, stable hash so the order isn't alphabetical day to day
  let h = 2166136261;
  for (const ch of "letter-rip:" + key) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return list[(h >>> 0) % list.length];
}

/** Shuffle letters, making sure the result doesn't spell the root. */
export function scramble(root: string): string[] {
  const letters = root.split("");
  for (let tries = 0; tries < 10; tries++) {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    if (letters.join("") !== root) break;
  }
  return letters;
}
