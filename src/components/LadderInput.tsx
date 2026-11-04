"use client";

// Word Ladder input: tap the letter you want to change, then tap its new letter.
// Give it key={word} so it resets for each new word.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Feedback } from "./TileInput";

type Props = {
  word: string;
  disabled?: boolean;
  placeholder?: string;
  onSubmit: (word: string) => Feedback | Promise<Feedback>;
};

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

export default function LadderInput({ word, disabled = false, placeholder, onSubmit }: Props) {
  const [sel, setSel] = useState<number | null>(null); // which letter is being changed
  const [draft, setDraft] = useState(word); // the word with (at most) one letter changed
  const [typed, setTyped] = useState(""); // physical keyboard: typing a whole word
  const [flash, setFlash] = useState<(Feedback & { id: number }) | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const busy = useRef(false);

  const shown = typed.length ? typed.padEnd(word.length, " ") : draft;
  const candidate = typed.length === word.length ? typed : draft;
  const changed = candidate !== word;

  const pick = useCallback(
    (i: number) => {
      if (disabled) return;
      setTyped("");
      setDraft(word); // only one letter may change, so start again from the real word
      setSel((s) => (s === i ? null : i));
    },
    [disabled, word],
  );

  const setLetter = useCallback(
    (ch: string) => {
      if (disabled || sel === null) return;
      setTyped("");
      setDraft(word.slice(0, sel) + ch + word.slice(sel + 1));
    },
    [disabled, sel, word],
  );

  const undo = useCallback(() => {
    setTyped("");
    setDraft(word);
  }, [word]);

  const submit = useCallback(async () => {
    if (disabled || busy.current || !changed || candidate.length !== word.length) return;
    busy.current = true;
    try {
      const fb = await onSubmit(candidate);
      setFlash({ ...fb, id: Date.now() + Math.random() });
      if (!fb.good) {
        setShakeKey((k) => k + 1);
        setTyped("");
        setDraft(word);
      }
    } catch {
      setFlash({ good: false, text: "Connection problem, try again", id: Date.now() });
    } finally {
      busy.current = false;
    }
  }, [disabled, changed, candidate, word, onSubmit]);

  // Physical keyboard: arrows choose the letter to change, or just type the whole new word
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "Enter") {
        e.preventDefault();
        return void submit();
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        if (typed) return setTyped((t) => t.slice(0, -1));
        return undo();
      }
      if (e.key === "Escape") {
        setSel(null);
        return undo();
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        setTyped("");
        setDraft(word);
        const d = e.key === "ArrowLeft" ? -1 : 1;
        return setSel((s) => ((s ?? (d > 0 ? -1 : word.length)) + d + word.length) % word.length);
      }
      const k = e.key.toLowerCase();
      if (!/^[a-z]$/.test(k)) return;
      if (sel !== null && !typed) return setLetter(k);
      setSel(null);
      setTyped((t) => (t.length >= word.length ? k : t + k));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, submit, undo, setLetter, sel, typed, word]);

  return (
    <div className="flex flex-col gap-4">
      {/* The word: tap a letter to change it */}
      <div className="relative">
        <div key={shakeKey} className={`flex justify-center gap-2 ${shakeKey ? "shake" : ""}`}>
          {shown.split("").map((ch, i) => {
            const isNew = ch !== " " && ch !== word[i];
            const isSel = sel === i && !typed;
            return (
              <button
                key={i}
                onClick={() => pick(i)}
                disabled={disabled}
                aria-label={`Change letter ${i + 1} (${word[i].toUpperCase()})`}
                className="tile flex items-center justify-center text-[clamp(2rem,11vw,3.2rem)]"
                style={{
                  width: "min(19vw, 78px)",
                  height: "min(23vw, 92px)",
                  background: isNew ? "var(--sun)" : undefined,
                  outline: isSel ? "4px solid var(--rip)" : undefined,
                  outlineOffset: 3,
                  opacity: disabled ? 0.6 : 1,
                  transform: "none",
                }}
              >
                {ch.trim()}
              </button>
            );
          })}
        </div>
        {flash && (
          <div
            key={flash.id}
            className={`rise absolute left-0 right-0 text-center top-full mt-1 font-display font-bold text-lg ${
              flash.good ? "text-mint" : "text-berry"
            }`}
          >
            {flash.text}
          </div>
        )}
      </div>

      <div className="text-center text-sm text-muted min-h-5 mt-2">
        {disabled
          ? (placeholder ?? "")
          : sel === null && !typed
            ? "Tap the letter you want to change"
            : changed
              ? "Happy? Press Enter"
              : "Now pick its new letter"}
      </div>

      {/* Letter keyboard */}
      <div className="flex flex-col gap-1.5 select-none">
        {ROWS.map((row) => (
          <div key={row} className="flex justify-center gap-1">
            {row.split("").map((ch) => {
              const isCurrent = sel !== null && word[sel] === ch;
              return (
                <button
                  key={ch}
                  onClick={() => setLetter(ch)}
                  disabled={disabled || sel === null || isCurrent}
                  className="btn flex-1 max-w-10 h-12 bg-ink-3 text-paper text-lg uppercase rounded-lg"
                  style={{
                    background: draft[sel ?? -1] === ch && !isCurrent ? "var(--sun)" : undefined,
                    color: draft[sel ?? -1] === ch && !isCurrent ? "var(--ink)" : undefined,
                  }}
                >
                  {ch}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <button onClick={undo} disabled={disabled || !changed} className="btn h-14 bg-ink-3 text-paper">
          Undo
        </button>
        <button
          onClick={() => void submit()}
          disabled={disabled || !changed || candidate.length !== word.length}
          className="btn h-14 bg-rip text-ink text-lg"
        >
          Enter
        </button>
      </div>
    </div>
  );
}
