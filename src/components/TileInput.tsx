"use client";

// The letter tiles, the word being built, and the Shuffle / Delete / Enter buttons.
// Used by both solo and challenge games. Give it key={root} so it resets for a new word.
import { useCallback, useEffect, useRef, useState } from "react";
import { scramble } from "@/lib/words";

export type Feedback = { good: boolean; text: string };

type Props = {
  root: string;
  disabled?: boolean;
  placeholder?: string;
  onSubmit: (word: string) => Feedback | Promise<Feedback>;
};

type Flash = Feedback & { id: number };

export default function TileInput({ root, disabled = false, placeholder, onSubmit }: Props) {
  const [letters, setLetters] = useState(() => root.split("")); // show the real word first
  const [picked, setPicked] = useState<number[]>([]); // tile indices, in order
  const [flash, setFlash] = useState<Flash | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const busy = useRef(false);

  const word = picked.map((i) => letters[i]).join("");

  const addTile = useCallback(
    (i: number) => setPicked((p) => (p.includes(i) ? p : [...p, i])),
    []
  );
  const backspace = useCallback(() => setPicked((p) => p.slice(0, -1)), []);
  const clear = useCallback(() => setPicked([]), []);
  const shuffle = useCallback(() => {
    setLetters((l) => scramble(l.join("")));
    setPicked([]);
  }, []);

  const submit = useCallback(async () => {
    if (disabled || busy.current || word.length < 3) return;
    busy.current = true;
    setPicked([]);
    try {
      const fb = await onSubmit(word);
      setFlash({ ...fb, id: Date.now() + Math.random() });
      if (!fb.good) setShakeKey((k) => k + 1);
    } catch {
      setFlash({ good: false, text: "Connection problem, try again", id: Date.now() });
    } finally {
      busy.current = false;
    }
  }, [disabled, word, onSubmit]);

  // Physical keyboard support
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement) return;
      // preventDefault stops a focused button also "clicking" on Enter
      if (e.key === "Enter") {
        e.preventDefault();
        return void submit();
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
  }, [disabled, letters, picked, submit, backspace, clear, shuffle, addTile]);

  return (
    <div className="flex flex-col gap-5">
      {/* Word being built */}
      <div className="relative flex flex-col items-center justify-center min-h-24 mb-2">
        <div key={shakeKey} className={`flex gap-1.5 min-h-14 items-end ${shakeKey ? "shake" : ""}`}>
          {word ? (
            word.split("").map((ch, i) => (
              <span key={i} className="pop font-display font-extrabold text-4xl sm:text-5xl uppercase text-paper">
                {ch}
              </span>
            ))
          ) : (
            <span className="text-muted text-base pb-2 text-center">
              {placeholder ?? "Tap letters to make a word"}
            </span>
          )}
        </div>
        <div className="h-1 w-48 rounded-full bg-ink-3 mt-2" />
        {flash && (
          <div
            key={flash.id}
            className={`rise absolute top-full -mt-2 font-display font-bold text-lg whitespace-nowrap ${
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
            disabled={disabled || picked.includes(i)}
            className="tile aspect-[5/6] text-[clamp(1.3rem,6.5vw,2rem)]"
            style={disabled ? { opacity: 0.55, transform: "none", boxShadow: "0 5px 0 var(--paper-edge)" } : undefined}
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
        <button onClick={backspace} disabled={disabled || !word} className="btn h-14 bg-ink-3 text-paper">
          Delete
        </button>
        <button
          onClick={() => void submit()}
          disabled={disabled || word.length < 3}
          className="btn h-14 bg-rip text-ink text-lg"
        >
          Enter
        </button>
      </div>
    </div>
  );
}
