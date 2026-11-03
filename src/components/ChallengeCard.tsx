"use client";

// Home-page card for starting or joining a challenge game
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { firebaseReady, ensureSignedIn } from "@/lib/firebase";
import { createRoom } from "@/lib/challengeActions";
import { cleanName, loadName, saveName } from "@/lib/profile";

export default function ChallengeCard() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setName(loadName()), 0);
    return () => clearTimeout(t);
  }, []);

  if (!firebaseReady) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-ink-3 p-4">
        <div className="font-display text-xl font-extrabold text-paper/90">Challenge</div>
        <div className="text-sm text-muted">
          Needs the Firebase settings adding in Vercel (see the README).
        </div>
      </div>
    );
  }

  const n = cleanName(name);
  const c = code.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);

  function needName() {
    if (n) return false;
    setError("Pop your name in first");
    return true;
  }

  async function create() {
    if (needName()) return;
    setBusy(true);
    setError("");
    try {
      saveName(n);
      const user = await ensureSignedIn();
      const room = await createRoom(user.uid, n);
      router.push(`/c/${room}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  function join() {
    if (needName()) return;
    if (c.length !== 4) return setError("Game codes are 4 letters");
    saveName(n);
    router.push(`/c/${c}`);
  }

  return (
    <div className="rounded-3xl bg-ink-2 border-2 border-ink-3 p-5">
      <div className="font-display text-2xl font-extrabold">Challenge</div>
      <div className="text-sm text-muted">2–8 players on their own phones · three strikes and you&apos;re out</div>

      <label className="block mt-4 text-xs uppercase tracking-wider text-muted" htmlFor="rip-name">
        Your name
      </label>
      <input
        id="rip-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={16}
        autoComplete="nickname"
        placeholder="e.g. Aoife"
        className="mt-1 w-full h-12 rounded-xl bg-ink px-4 text-lg text-paper placeholder:text-muted/60 outline-none border-2 border-ink-3 focus:border-sun"
      />

      <button onClick={create} disabled={busy} className="btn mt-3 w-full h-12 bg-paper text-ink text-lg">
        {busy ? "Creating…" : "Create a game"}
      </button>

      <div className="flex gap-2 mt-3">
        <input
          value={c}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && join()}
          placeholder="CODE"
          aria-label="Game code"
          autoCapitalize="characters"
          className="w-0 flex-1 h-12 rounded-xl bg-ink px-4 text-lg font-display font-bold tracking-[0.3em] uppercase text-paper placeholder:text-muted/50 placeholder:tracking-[0.3em] outline-none border-2 border-ink-3 focus:border-sun"
        />
        <button onClick={join} className="btn h-12 px-6 bg-ink-3 text-paper">
          Join
        </button>
      </div>

      {error && <div className="mt-3 text-sm text-berry font-semibold">{error}</div>}
    </div>
  );
}
