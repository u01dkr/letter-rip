// Scores saved on this device (no account needed).

export type DailyResult = { score: number; words: string[]; possible: number };

type Stats = {
  daily: Record<string, DailyResult>; // keyed by YYYY-MM-DD
  bestQuick: number;
  bestKids: number;
};

const KEY = "letter-rip-stats-v1";
const EMPTY: Stats = { daily: {}, bestQuick: 0, bestKids: 0 };

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

export function saveDaily(key: string, result: DailyResult) {
  const s = loadStats();
  if (!s.daily[key]) {
    s.daily[key] = result; // only the first attempt counts
    save(s);
  }
}

/** Saves a best score and returns true if it's a new record. */
export function saveBest(mode: "quick" | "kids", score: number): boolean {
  const s = loadStats();
  const field = mode === "quick" ? "bestQuick" : "bestKids";
  if (score > s[field]) {
    s[field] = score;
    save(s);
    return true;
  }
  return false;
}

/** Consecutive days with a daily result, counting back from today. */
export function dailyStreak(todayKey: string): number {
  const s = loadStats();
  let streak = 0;
  const d = new Date(todayKey + "T12:00:00Z");
  while (s.daily[d.toISOString().slice(0, 10)]) {
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}
