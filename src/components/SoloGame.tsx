"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  checkGuess,
  REASON_TEXT,
  scramble,
  type Dictionary,
} from "@/lib/words";

export type SoloResult = {
  root: string;
  score: number;
  found: string[];
};

type Props = {
  root: string;
  seconds: number;
  dict: Dictionary;
  title: string;
  onFinish: (result: SoloResult) => void;
  onQuit: () => void;
};

type Flash = { id: number; text: string; good: boolean };

export default function SoloGame({ root, seconds, dict, title, onFinish, onQuit }: Props) {
  const [letters, setLetters] = useState(() => scramble(root));
  const [picked, setPicked] = useState<number[]>([]); // tile indices, in order
  const [found, setFound] = useState<string[]>([]); // newest first
  const [score, setScore] = useState(0);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [endAt] = useState(() => Date.now() + seconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  const finished = useRef(false);

  const used = useMemo(() => new Set(found), [found]);
  const remaining = Math.max(0, endAt - now);
  const secsLeft = Math.ceil(remaining / 1000);
  const word = picked.map((i) => letters[i]).join("");

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (remaining <= 0 && !finished.current) {
      finished.current = true;
      onFinish({ root, score, found: [...found].reverse() });
    }
  }, [remaining, root, score, found, onFinish]);

  const showFlash = (text: string, good: boolean) =>
    setFlash({ id: Date.now() + Math.random(), text, good });

  const addTile = useCallback(
    (i: number) => setPicked((p) => (p.includes(i) ? p : [...p, i])),
    []
  );
  const backspace = useCallback(() => setPicked((p) => p.slice(0, -1)), []);
  const clear = useCallback(() => setPicked([]), []);

  const submit = useCallback(() => {
    if (finished.current || !word) return;
    const res = checkGuess(word, root, used, dict);
    if (res.ok) {
      setFound((f) => [res.word, ...f]);
      setScore((s) => s + res.points);
      showFlash(res.fullRip ? `FULL RIP! +${res.points}` : `+${res.points}`, true);
    } else {
      showFlash(REASON_TEXT[res.reason], false);
      setShakeKey((k) => k + 1);
    }
    setPicked([]);
  }, [word, root, used, dict]);

  const shuffle = useCallback(() => {
    setLetters((l) => scramble(l.join("")));
    setPicked([]);
  }, []);

  // Physical keyboard support
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // preventDefault stops a focused button also "clicking" on Enter
      if (e.key === "Enter") {
        e.preventDefault();
        return submit();
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        return backspace();
      }
      if (e.key === "Escape") return clear();
      if (e.key === " ") {
        e.preventDefault();
        return shuffle();
      }
      const k = e.key.toLowerCase();
      if (/^[a-z]$/.test(k)) {
        const i = letters.findIndex((ch, idx) => ch === k && !picked.includes(idx));
        if (i >= 0) addTile(i);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [letters, picked, submit, backspace, clear, shuffle, addTile]);

  const pct = remaining / (seconds * 1000);
  const hurry = secsLeft <= 10;
  const timeLabel = `${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-col flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-6 gap-5">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={onQuit}
          aria-label="Quit game"
          className="btn w-10 h-10 bg-ink-3 text-paper text-xl leading-none"
        >
          ×
        </button>
        <div className="flex-1">
          <div className="flex justify-between text-xs text-muted mb-1 font-medium uppercase tracking-wider">
            <span>{title}</span>
            <span className={hurry ? "hurry font-bold" : ""}>{timeLabel}</span>
          </div>
          <div className="h-2.5 rounded-full bg-ink-3 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-100 ease-linear"
              style={{
                width: `${pct * 100}%`,
                background: hurry ? "var(--berry)" : "linear-gradient(90deg, var(--rip), var(--sun))",
              }}
            />
          </div>
        </div>
        <div className="text-right min-w-14">
          <div className="text-[10px] uppercase tracking-wider text-muted">Score</div>
          <div className="font-display text-2xl font-extrabold leading-none text-sun">{score}</div>
        </div>
      </div>

      {/* Word being built */}
      <div className="relative flex flex-col items-center justify-center min-h-28 mb-2">
        <div
          key={shakeKey}
          className={`flex gap-1.5 min-h-14 items-end ${shakeKey ? "shake" : ""}`}
        >
          {word ? (
            word.split("").map((ch, i) => (
              <span
                key={i}
                className="pop font-display font-extrabold text-4xl sm:text-5xl uppercase text-paper"
              >
                {ch}
              </span>
            ))
          ) : (
            <span className="text-muted text-base pb-2">Tap letters to make a word</span>
          )}
        </div>
        <div className="h-1 w-48 rounded-full bg-ink-3 mt-2" />
        {flash && (
          <div
            key={flash.id}
            className={`rise absolute top-full -mt-2 font-display font-bold text-lg ${
              flash.good ? "text-mint" : "text-berry"
            }`}
          >
            {flash.text}
          </div>
        )}
      </div>

      {/* Tiles */}
      <div
        className="grid justify-center gap-1.5"
        style={{ gridTemplateColumns: `repeat(${letters.length}, minmax(0, 52px))` }}
      >
        {letters.map((ch, i) => (
          <button
            key={i}
            onClick={() => addTile(i)}
            disabled={picked.includes(i)}
            className="tile aspect-[5/6] text-[clamp(1.3rem,6.5vw,2rem)]"
            aria-label={`Letter ${ch.toUpperCase()}`}
          >
            {ch}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="grid grid-cols-[1fr_1fr_2fr] gap-2">
        <button onClick={shuffle} className="btn h-14 bg-ink-3 text-paper">
          Shuffle
        </button>
        <button onClick={backspace} disabled={!word} className="btn h-14 bg-ink-3 text-paper">
          Delete
        </button>
        <button
          onClick={submit}
          disabled={word.length < 3}
          className="btn h-14 bg-rip text-ink text-lg"
        >
          Enter
        </button>
      </div>

      {/* Found words */}
      <div className="flex-1 rounded-2xl bg-ink-2/70 border border-ink-3 p-3">
        <div className="text-xs uppercase tracking-wider text-muted mb-2">
          {found.length} {found.length === 1 ? "word" : "words"}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {found.map((w) => (
            <span
              key={w}
              className={`pop px-2.5 py-1 rounded-lg text-sm font-semibold uppercase tracking-wide ${
                w.length === root.length ? "bg-sun text-ink" : "bg-ink-3 text-paper"
              }`}
            >
              {w}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
