"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { doc, getDocFromServer, onSnapshot } from "firebase/firestore";
import { ensureSignedIn, firebaseReady, getDb } from "@/lib/firebase";
import { serverNow, syncClock } from "@/lib/clock";
import { checkGuess, loadDictionary, REASON_TEXT, type Dictionary } from "@/lib/words";
import {
  MAX_STRIKES,
  ROOMS,
  playerColour,
  playersByJoin,
  standings,
  type Room,
  type RoomEvent,
} from "@/lib/challenge";
import {
  ackTurn,
  joinRoom,
  leaveLobby,
  playAgain,
  setLevel,
  startGame,
  strikeAt,
  submitWord,
  timeoutTurn,
} from "@/lib/challengeActions";
import { cleanName, loadName, saveName } from "@/lib/profile";
import TileInput, { type Feedback } from "./TileInput";

type Status = "connecting" | "ready" | "missing" | "error";

export default function ChallengeRoom({ code }: { code: string }) {
  const [uid, setUid] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [error, setError] = useState("");

  // Sign in, sync the clock, then watch the game
  useEffect(() => {
    if (!firebaseReady) return;
    let unsub = () => {};
    let poll: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    let latestRev = -1;
    let playing = false;
    const ref = doc(getDb(), ROOMS, code);

    // Only ever move forwards: ignore data older than what we already have
    const apply = (data: Room) => {
      const rev = data.rev ?? 0;
      if (rev < latestRev) return;
      latestRev = rev;
      playing = data.phase === "playing";
      setRoom(data);
      setStatus("ready");
    };

    // Safety net: iPhones can quietly stop getting live updates (screen dims, app switch).
    // So during a game, and whenever the page comes back into view, ask the server directly.
    const check = () => {
      if (cancelled) return;
      getDocFromServer(ref)
        .then((snap) => snap.exists() && apply(snap.data() as Room))
        .catch(() => {});
    };
    const onVisible = () => document.visibilityState === "visible" && check();

    ensureSignedIn()
      .then(async (user) => {
        if (cancelled) return;
        setUid(user.uid);
        await syncClock(code, user.uid);
        if (cancelled) return;
        unsub = onSnapshot(
          ref,
          (snap) => {
            if (!snap.exists()) return setStatus("missing");
            apply(snap.data() as Room);
          },
          () => setStatus("error")
        );
        poll = setInterval(() => playing && document.visibilityState === "visible" && check(), 3000);
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("online", check);
        window.addEventListener("focus", check);
      })
      .catch(() => setStatus("error"));
    loadDictionary().then(setDict, () => setError("Couldn't load the word list. Refresh to try again."));
    return () => {
      cancelled = true;
      unsub();
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", check);
      window.removeEventListener("focus", check);
    };
  }, [code]);

  if (!firebaseReady) return <Centered>Challenge mode needs Firebase setting up first (see the README).</Centered>;
  if (status === "missing")
    return (
      <Centered>
        <p className="font-display text-2xl font-bold">No game called {code}</p>
        <p className="text-muted mt-2">Check the code, or start a new game.</p>
        <HomeLink />
      </Centered>
    );
  if (status === "error")
    return (
      <Centered>
        <p className="font-display text-2xl font-bold">Couldn&apos;t connect</p>
        <p className="text-muted mt-2">Check your connection and refresh the page.</p>
        <HomeLink />
      </Centered>
    );
  if (!room || !uid || !dict)
    return <Centered>{error || <span className="text-muted">Connecting…</span>}</Centered>;

  const me = room.players[uid];
  if (!me) return <JoinScreen code={code} room={room} uid={uid} />;
  if (room.phase === "lobby") return <Lobby code={code} room={room} uid={uid} />;
  if (room.phase === "playing") return <Game code={code} room={room} uid={uid} dict={dict} />;
  return <GameOver code={code} room={room} uid={uid} />;
}

/* ---------- small pieces ---------- */

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-col flex-1 items-center justify-center text-center px-6 py-16 max-w-md mx-auto">
      {children}
    </main>
  );
}

function HomeLink({ className = "mt-6" }: { className?: string }) {
  return (
    <Link href="/" className={`btn ${className} inline-flex items-center justify-center h-12 px-6 bg-ink-3 text-paper`}>
      Home
    </Link>
  );
}

function Strikes({ count, size = 10 }: { count: number; size?: number }) {
  return (
    <span className="inline-flex gap-1" aria-label={`${count} of ${MAX_STRIKES} strikes`}>
      {Array.from({ length: MAX_STRIKES }, (_, i) => (
        <span
          key={i}
          className="rounded-full"
          style={{
            width: size,
            height: size,
            background: i < count ? "var(--berry)" : "transparent",
            border: `2px solid ${i < count ? "var(--berry)" : "rgba(183, 168, 214, 0.45)"}`,
          }}
        />
      ))}
    </span>
  );
}

/* ---------- joining from a shared link ---------- */

function JoinScreen({ code, room, uid }: { code: string; room: Room; uid: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tried = useRef(false);

  const join = useCallback(
    async (n: string) => {
      setBusy(true);
      setError("");
      try {
        saveName(n);
        await joinRoom(code, uid, n);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't join");
        setBusy(false);
      }
    },
    [code, uid]
  );

  // If we already know your name, join straight away
  useEffect(() => {
    if (tried.current || room.phase !== "lobby") return;
    tried.current = true;
    const saved = cleanName(loadName());
    const t = setTimeout(() => (saved ? join(saved) : setName("")), 0);
    return () => clearTimeout(t);
  }, [room.phase, join]);

  if (room.phase !== "lobby")
    return (
      <Centered>
        <p className="font-display text-2xl font-bold">Game {code} is underway</p>
        <p className="text-muted mt-2">Stay on this page. You can join as soon as it finishes.</p>
        <HomeLink />
      </Centered>
    );

  const n = cleanName(name);
  return (
    <Centered>
      <div className="text-xs uppercase tracking-[0.25em] text-muted">Join game</div>
      <div className="font-display text-6xl font-extrabold tracking-[0.15em] text-sun mt-1">{code}</div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && n && join(n)}
        maxLength={16}
        placeholder="Your name"
        autoFocus
        className="mt-6 w-full h-14 rounded-xl bg-ink-2 px-4 text-xl text-center text-paper placeholder:text-muted/60 outline-none border-2 border-ink-3 focus:border-sun"
      />
      <button
        onClick={() => join(n)}
        disabled={!n || busy}
        className="btn mt-3 w-full h-14 bg-rip text-ink text-lg"
      >
        {busy ? "Joining…" : "Join"}
      </button>
      {error && <p className="mt-3 text-berry font-semibold text-sm">{error}</p>}
    </Centered>
  );
}

/* ---------- lobby ---------- */

function Lobby({ code, room, uid }: { code: string; room: Room; uid: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const isHost = room.hostId === uid;
  const players = playersByJoin(room);

  async function invite() {
    const url = `${window.location.origin}/c/${code}`;
    const text = `Join my Letter Rip game! Code ${code}`;
    try {
      if (navigator.share) return await navigator.share({ text, url });
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function start() {
    setError("");
    try {
      await startGame(code, uid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start");
    }
  }

  return (
    <main className="flex flex-col w-full max-w-md mx-auto px-4 pt-8 pb-10 gap-6">
      <div className="text-center">
        <div className="text-xs uppercase tracking-[0.25em] text-muted">Game code</div>
        <div className="font-display text-7xl font-extrabold tracking-[0.15em] text-sun leading-none mt-1">{code}</div>
        <button onClick={invite} className="btn mt-4 h-11 px-5 bg-ink-3 text-paper">
          {copied ? "Link copied!" : "Invite friends"}
        </button>
      </div>

      <section className="rounded-3xl bg-ink-2 border border-ink-3 p-4">
        <div className="flex justify-between items-baseline mb-3">
          <h2 className="font-display font-bold text-lg">Players</h2>
          <span className="text-sm text-muted">{players.length} / 8</span>
        </div>
        <ul className="flex flex-col gap-2">
          {players.map(([id, p]) => (
            <li key={id} className="flex items-center gap-3 rounded-xl bg-ink-3/50 px-3 py-2.5">
              <span className="w-3 h-3 rounded-full" style={{ background: playerColour(room, id) }} />
              <span className="font-semibold flex-1 truncate">
                {p.name}
                {id === uid && <span className="text-muted font-normal"> (you)</span>}
              </span>
              {id === room.hostId && <span className="text-xs text-sun font-bold uppercase tracking-wider">Host</span>}
            </li>
          ))}
        </ul>
        {players.length < 2 && (
          <p className="text-sm text-muted mt-3">Waiting for at least one more player…</p>
        )}
      </section>

      <section className="rounded-3xl bg-ink-2 border border-ink-3 p-4">
        <h2 className="font-display font-bold text-lg mb-3">Words</h2>
        <div className="grid grid-cols-2 gap-2">
          {(["normal", "easy"] as const).map((lvl) => (
            <button
              key={lvl}
              disabled={!isHost}
              onClick={() => setLevel(code, lvl)}
              className={`btn h-14 text-left px-3 border-2 ${
                room.level === lvl ? "bg-sun text-ink border-sun" : "bg-transparent text-paper border-ink-3"
              }`}
              style={!isHost ? { opacity: room.level === lvl ? 1 : 0.4 } : undefined}
            >
              <div>{lvl === "normal" ? "Normal" : "Kids"}</div>
              <div className="text-xs font-sans font-medium opacity-75">
                {lvl === "normal" ? "7–9 letters · 20s turns" : "6–7 letters · 30s turns"}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="text-sm text-paper/80 space-y-1.5 px-1">
        <p>Take turns making a word from the big word. No repeats!</p>
        <p>Run out of time and you get a strike. Three strikes and you&apos;re out.</p>
        <p>
          Use <b>every</b> letter in a different word for a <span className="text-sun font-bold">Full Rip</span>: it
          wipes off a strike.
        </p>
      </section>

      <div className="flex flex-col gap-2">
        {isHost ? (
          <button onClick={start} disabled={players.length < 2} className="btn h-14 bg-rip text-ink text-lg">
            Start game
          </button>
        ) : (
          <div className="text-center text-muted py-3">
            Waiting for {room.players[room.hostId]?.name ?? "the host"} to start…
          </div>
        )}
        {error && <p className="text-berry text-sm font-semibold text-center">{error}</p>}
        <Link
          href="/"
          onClick={() => void leaveLobby(code, uid)}
          className="btn h-12 flex items-center justify-center bg-ink-3 text-paper"
        >
          Leave
        </Link>
      </div>
    </main>
  );
}

/* ---------- the game ---------- */

function eventText(e: RoomEvent | undefined, room: Room, uid: string): { text: string; tone: "good" | "bad" | "info" } | null {
  if (!e) return null;
  const who = (id: string) => (id === uid ? "You" : room.players[id]?.name ?? "Someone");
  switch (e.kind) {
    case "start":
      return { text: "Here we go!", tone: "info" };
    case "word":
      return { text: `${who(e.uid)} played ${e.word.toUpperCase()}`, tone: "info" };
    case "fullrip":
      return {
        text: `FULL RIP! ${who(e.uid)} played ${e.word.toUpperCase()}${e.savedStrike ? " and wiped a strike" : ""}`,
        tone: "good",
      };
    case "strike":
      return { text: `${who(e.uid)} ran out of time: strike ${e.strikes}!`, tone: "bad" };
    case "out":
      return { text: `${who(e.uid)} ${e.uid === uid ? "are" : "is"} out!`, tone: "bad" };
  }
}

const SUBMIT_TEXT: Record<string, string> = {
  used: "Someone's already had that",
  late: "Too late!",
  notYourTurn: "Not your turn",
  over: "Game over",
};

function Game({ code, room, uid, dict }: { code: string; room: Room; uid: string; dict: Dictionary }) {
  const [now, setNow] = useState(() => serverNow());
  const asked = useRef(0); // turnNo we've already asked to time out

  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 100);
    return () => clearInterval(t);
  }, []);

  const myTurn = room.turn === uid;
  const paused = now < room.pauseUntil;
  const totalMs = room.turnEndsAt - room.pauseUntil;
  const leftMs = Math.max(0, room.turnEndsAt - Math.max(now, room.pauseUntil));
  const secs = Math.ceil(leftMs / 1000);
  const hurry = !paused && secs <= 5;

  // As soon as this phone is showing your turn, tell the game. Your full time starts then,
  // so a slow connection can never cost you a strike you couldn't see coming.
  const acked = useRef(0);
  useEffect(() => {
    if (!myTurn || room.turnSeenAt || acked.current === room.turnNo) return;
    if (document.visibilityState !== "visible") return;
    acked.current = room.turnNo;
    ackTurn(code, uid, room.turnNo).catch(() => {
      acked.current = 0; // try again on the next tick
    });
  }, [myTurn, room.turnSeenAt, room.turnNo, code, uid, now]);

  // When a clock runs out, any phone can hand out the strike (the first one counts).
  // The player whose turn it is goes first; the others wait a moment longer as backup.
  useEffect(() => {
    const at = strikeAt(room) + (myTurn ? 0 : 700);
    if (now > at && asked.current !== room.turnNo) {
      asked.current = room.turnNo;
      timeoutTurn(code, room.turnNo).catch(() => {
        asked.current = 0; // try again on the next tick
      });
    }
  }, [now, room, myTurn, code]);

  // Buzz the phone when it becomes your turn
  useEffect(() => {
    if (myTurn) navigator.vibrate?.(120);
  }, [myTurn, room.turnNo]);

  const usedSet = useMemo(() => new Set(room.used.map((u) => u.w)), [room.used]);

  const submit = useCallback(
    async (word: string): Promise<Feedback> => {
      const check = checkGuess(word, room.root, usedSet, dict);
      if (!check.ok) {
        return {
          good: false,
          text: check.reason === "used" ? SUBMIT_TEXT.used : REASON_TEXT[check.reason],
        };
      }
      const res = await submitWord(code, uid, room.turnNo, check.word);
      if (!res.ok) return { good: false, text: SUBMIT_TEXT[res.reason] ?? "Try again" };
      return { good: true, text: res.fullRip ? "FULL RIP!" : "Nice!" };
    },
    [room.root, room.turnNo, usedSet, dict, code, uid]
  );

  const ev = eventText(room.last, room, uid);
  const turnName = room.players[room.turn]?.name ?? "";
  const me = room.players[uid];

  return (
    <main className="flex flex-col flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-6 gap-4">
      {/* Players */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
        {room.order.map((id) => {
          const p = room.players[id];
          if (!p) return null;
          const active = id === room.turn;
          return (
            <div
              key={id}
              className={`shrink-0 rounded-2xl px-3 py-2 border-2 transition-colors ${
                active ? "bg-ink-3" : "bg-ink-2/70"
              } ${p.out ? "opacity-35" : ""}`}
              style={{ borderColor: active ? playerColour(room, id) : "transparent" }}
            >
              <div className={`text-sm font-bold max-w-24 truncate ${p.out ? "line-through" : ""}`}>
                <span style={{ color: playerColour(room, id) }}>●</span> {id === uid ? "You" : p.name}
              </div>
              <div className="mt-1">
                <Strikes count={p.strikes} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Turn banner and clock */}
      <div className="rounded-3xl bg-ink-2 border border-ink-3 p-4 text-center">
        {paused ? (
          <>
            <div className="font-display text-3xl font-extrabold text-sun pop" key={room.root}>
              New word!
            </div>
            <div className="text-muted mt-1">
              {myTurn ? "You start" : `${turnName} starts`} in {Math.ceil((room.pauseUntil - now) / 1000)}…
            </div>
          </>
        ) : (
          <>
            <div
              className="font-display text-3xl font-extrabold"
              style={{ color: myTurn ? "var(--rip)" : playerColour(room, room.turn) }}
              key={room.turnNo}
            >
              <span className="pop inline-block">{myTurn ? "YOUR TURN!" : `${turnName}'s turn`}</span>
            </div>
            {!myTurn && !room.turnSeenAt && leftMs <= 0 && (
              <div className="text-muted text-sm mt-1">Waiting for {turnName}&apos;s phone…</div>
            )}
            <div className="flex items-center gap-3 mt-3">
              <div className="h-3 flex-1 rounded-full bg-ink-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-100 ease-linear"
                  style={{
                    width: `${totalMs > 0 ? (leftMs / totalMs) * 100 : 0}%`,
                    background: hurry ? "var(--berry)" : "linear-gradient(90deg, var(--rip), var(--sun))",
                  }}
                />
              </div>
              <span className={`font-display font-bold text-xl w-8 text-right ${hurry ? "hurry" : ""}`}>{secs}</span>
            </div>
          </>
        )}
        {ev && (
          <div
            key={room.last.id}
            className={`pop mt-3 text-sm font-semibold ${
              ev.tone === "good" ? "text-mint" : ev.tone === "bad" ? "text-berry" : "text-paper/80"
            }`}
          >
            {ev.text}
          </div>
        )}
      </div>

      {/* Tiles: only live on your turn, but everyone can see (and shuffle) them */}
      <TileInput
        key={room.root}
        root={room.root}
        disabled={!myTurn || paused || leftMs <= 0 || me.out}
        placeholder={
          me.out ? "You're out. Watch the others battle it out!" : myTurn ? undefined : "Get your next word ready…"
        }
        onSubmit={submit}
      />

      {/* Words played on this root */}
      <div className="flex-1 rounded-2xl bg-ink-2/70 border border-ink-3 p-3">
        <div className="text-xs uppercase tracking-wider text-muted mb-2">
          Used · {room.used.length} {room.used.length === 1 ? "word" : "words"}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[...room.used].reverse().map((u) => (
            <span
              key={u.w}
              className="pop px-2.5 py-1 rounded-lg text-sm font-semibold uppercase tracking-wide bg-ink-3 text-paper border-l-4"
              style={{ borderLeftColor: playerColour(room, u.by) }}
            >
              {u.w}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}

/* ---------- game over ---------- */

function GameOver({ code, room, uid }: { code: string; room: Room; uid: string }) {
  const order = standings(room);
  const winner = room.winner ?? order[0];
  const winnerName = winner === uid ? "You" : room.players[winner]?.name ?? "Someone";
  const ev = eventText(room.last, room, uid);

  return (
    <main className="flex flex-col w-full max-w-md mx-auto px-4 pt-10 pb-10 gap-6">
      <div className="text-center">
        {ev && <div className="text-berry text-sm font-semibold">{ev.text}</div>}
        <div className="font-display text-5xl font-extrabold text-sun mt-3 pop leading-tight">
          {winnerName} {winner === uid ? "have" : "has"} the Last Word!
        </div>
      </div>

      <section className="rounded-3xl bg-ink-2 border border-ink-3 p-4">
        <ol className="flex flex-col gap-2">
          {order.map((id, i) => {
            const p = room.players[id];
            if (!p) return null;
            return (
              <li key={id} className="flex items-center gap-3 rounded-xl bg-ink-3/50 px-3 py-2.5">
                <span className="font-display font-extrabold text-xl w-6 text-muted">{i + 1}</span>
                <span className="w-3 h-3 rounded-full" style={{ background: playerColour(room, id) }} />
                <span className="font-semibold flex-1 truncate">
                  {id === uid ? "You" : p.name}
                  <span className="block text-xs text-muted font-normal">
                    {p.words} {p.words === 1 ? "word" : "words"}
                    {p.fullRips > 0 && ` · ${p.fullRips} full rip${p.fullRips > 1 ? "s" : ""}`}
                  </span>
                </span>
                <Strikes count={p.strikes} />
              </li>
            );
          })}
        </ol>
      </section>

      <div className="flex flex-col gap-2">
        <button onClick={() => void playAgain(code)} className="btn h-14 bg-rip text-ink text-lg">
          Play again
        </button>
        <HomeLink className="" />
      </div>
    </main>
  );
}
