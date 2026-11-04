// Everything that changes a challenge game in the database lives here.
// Turn changes use transactions, so two phones can never act on the same turn.
import { doc, getDoc, setDoc, runTransaction, deleteField } from "firebase/firestore";
import { getDb } from "./firebase";
import { serverNow } from "./clock";
import { randomRoot, type Level } from "./words";
import { oneLetterApart, randomLadderStart } from "./ladder";
import type { Game } from "./stats";
import {
  ROOMS,
  MAX_PLAYERS,
  MAX_STRIKES,
  PAUSE_MS,
  UNSEEN_GRACE_MS,
  makeCode,
  nextAlive,
  alivePlayers,
  turnSeconds,
  type Player,
  type Room,
  type RoomEvent,
} from "./challenge";

const roomRef = (code: string) => doc(getDb(), ROOMS, code);

const newPlayer = (name: string): Player => ({
  name,
  joinedAt: Date.now(),
  strikes: 0,
  out: false,
  words: 0,
  fullRips: 0,
});

const gameOf = (room: Pick<Room, "game">): Game => room.game ?? "rip";

function pickRoot(game: Game, level: Level, usedRoots: string[]): string {
  if (game === "ladder") return randomLadderStart(level, usedRoots);
  for (let i = 0; i < 20; i++) {
    const r = randomRoot(level);
    if (!usedRoots.includes(r)) return r;
  }
  return randomRoot(level);
}

/** Words already played on a new root. Word Ladder counts the start word as used. */
const freshUsed = (game: Game, root: string) => (game === "ladder" ? [{ w: root, by: "start" }] : []);

export async function createRoom(uid: string, name: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = makeCode();
    const snap = await getDoc(roomRef(code));
    // Reuse codes from games more than a day old
    if (snap.exists() && Date.now() - (snap.data() as Room).createdAt < 86400000) continue;
    const room: Partial<Room> = {
      hostId: uid,
      phase: "lobby",
      game: "rip",
      level: "normal",
      createdAt: Date.now(),
      players: { [uid]: newPlayer(name) },
      order: [],
      usedRoots: [],
      used: [],
      outOrder: [],
      winner: null,
      turnSeenAt: null,
      rev: 1,
    };
    await setDoc(roomRef(code), room);
    return code;
  }
  throw new Error("Couldn't make a game code. Please try again.");
}

export async function joinRoom(code: string, uid: string, name: string) {
  await runTransaction(getDb(), async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists()) throw new Error(`No game found with code ${code}.`);
    const room = snap.data() as Room;
    if (room.players[uid]) {
      tx.update(roomRef(code), { [`players.${uid}.name`]: name, rev: (room.rev ?? 0) + 1 });
      return;
    }
    if (room.phase !== "lobby") throw new Error("That game has already started. Wait for the next one.");
    if (Object.keys(room.players).length >= MAX_PLAYERS)
      throw new Error(`That game is full (${MAX_PLAYERS} players max).`);
    tx.update(roomRef(code), { [`players.${uid}`]: newPlayer(name), rev: (room.rev ?? 0) + 1 });
  });
}

export async function leaveLobby(code: string, uid: string) {
  await runTransaction(getDb(), async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists()) return;
    const room = snap.data() as Room;
    if (room.phase !== "lobby" || !room.players[uid]) return;
    const others = Object.entries(room.players)
      .filter(([id]) => id !== uid)
      .sort((a, b) => a[1].joinedAt - b[1].joinedAt);
    const update: Record<string, unknown> = { [`players.${uid}`]: deleteField(), rev: (room.rev ?? 0) + 1 };
    if (room.hostId === uid && others.length) update.hostId = others[0][0];
    tx.update(roomRef(code), update);
  });
}

export async function setLevel(code: string, level: Level) {
  await runTransaction(getDb(), async (tx) => {
    const snap = await tx.get(roomRef(code));
    const room = snap.data() as Room;
    if (!room || room.phase !== "lobby") return;
    tx.update(roomRef(code), { level, rev: (room.rev ?? 0) + 1 });
  });
}

export async function setGame(code: string, game: Game) {
  await runTransaction(getDb(), async (tx) => {
    const snap = await tx.get(roomRef(code));
    const room = snap.data() as Room;
    if (!room || room.phase !== "lobby") return;
    tx.update(roomRef(code), { game, rev: (room.rev ?? 0) + 1 });
  });
}

export async function startGame(code: string, uid: string) {
  await runTransaction(getDb(), async (tx) => {
    const snap = await tx.get(roomRef(code));
    const room = snap.data() as Room;
    if (!room || room.phase !== "lobby" || room.hostId !== uid) return;
    const ids = Object.keys(room.players);
    if (ids.length < 2) throw new Error("You need at least two players.");
    const order = [...ids].sort(() => Math.random() - 0.5);
    const players: Record<string, Player> = {};
    for (const id of ids) players[id] = { ...newPlayer(room.players[id].name), joinedAt: room.players[id].joinedAt };
    const game = gameOf(room);
    const root = pickRoot(game, room.level, room.usedRoots ?? []);
    const pauseUntil = serverNow() + PAUSE_MS;
    tx.update(roomRef(code), {
      phase: "playing",
      players,
      order,
      root,
      usedRoots: [...(room.usedRoots ?? []), root].slice(-200),
      used: freshUsed(game, root),
      turn: order[0],
      turnNo: 1,
      pauseUntil,
      turnEndsAt: pauseUntil + turnSeconds(room.level, 0, game) * 1000,
      turnSeenAt: null,
      last: { id: 1, kind: "start" },
      outOrder: [],
      winner: null,
      rev: (room.rev ?? 0) + 1,
    });
  });
}

const SUBMIT_GRACE_MS = 1500; // allows for a slow connection on the last second
export const TIMEOUT_GRACE_MS = 2000; // a strike is only given a little after the clock hits zero

/** When a strike can be given for the current turn. A phone that never showed the turn gets extra time. */
export function strikeAt(room: Pick<Room, "turnEndsAt" | "turnSeenAt">): number {
  return room.turnEndsAt + TIMEOUT_GRACE_MS + (room.turnSeenAt ? 0 : UNSEEN_GRACE_MS);
}

/** The player's phone confirms it's showing their turn. Their full time starts now. */
export async function ackTurn(code: string, uid: string, turnNo: number) {
  await runTransaction(getDb(), async (tx) => {
    const snap = await tx.get(roomRef(code));
    const room = snap.data() as Room;
    if (!room || room.phase !== "playing" || room.turn !== uid || room.turnNo !== turnNo || room.turnSeenAt) return;
    const now = serverNow();
    const start = Math.max(now, room.pauseUntil);
    tx.update(roomRef(code), {
      turnSeenAt: now,
      pauseUntil: start,
      turnEndsAt: start + turnSeconds(room.level, room.used.length, gameOf(room)) * 1000,
      rev: (room.rev ?? 0) + 1,
    });
  });
}

/**
 * Gives `uid` a strike and deals a fresh word (or ends the game if only one player is left).
 * `players` may already include other changes from the same move.
 */
function strikeUpdate(
  room: Room,
  players: Record<string, Player>,
  uid: string,
  event: (strikes: number, out: boolean, id: number) => RoomEvent
): Record<string, unknown> {
  const strikes = players[uid].strikes + 1;
  const out = strikes >= MAX_STRIKES;
  const after = { ...players, [uid]: { ...players[uid], strikes, out } };
  const outOrder = out ? [...room.outOrder, uid] : room.outOrder;
  const alive = alivePlayers({ order: room.order, players: after });
  const id = room.turnNo + 1;

  if (alive.length <= 1) {
    return {
      phase: "over",
      players: after,
      outOrder,
      winner: alive[0] ?? uid,
      turnNo: id,
      rev: (room.rev ?? 0) + 1,
      last: event(strikes, out, id),
    };
  }

  // Fresh word; the next player still in starts
  const game = gameOf(room);
  const root = pickRoot(game, room.level, room.usedRoots ?? []);
  const next = nextAlive({ order: room.order, players: after }, uid);
  const pauseUntil = serverNow() + PAUSE_MS;
  return {
    players: after,
    outOrder,
    root,
    usedRoots: [...(room.usedRoots ?? []), root].slice(-200),
    used: freshUsed(game, root),
    turn: next,
    turnNo: id,
    pauseUntil,
    turnEndsAt: pauseUntil + turnSeconds(room.level, 0, game) * 1000,
    turnSeenAt: null,
    rev: (room.rev ?? 0) + 1,
    last: event(strikes, out, id),
  };
}

/**
 * Plays a word. The word has already been checked against the dictionary on the player's phone.
 * Word Ladder: `deadEnd` is true if the word leaves the next player with no possible move,
 * in which case they're left holding the can and get a strike straight away.
 */
export async function submitWord(code: string, uid: string, turnNo: number, word: string, deadEnd = false) {
  return runTransaction(getDb(), async (tx) => {
    const snap = await tx.get(roomRef(code));
    const room = snap.data() as Room;
    if (!room || room.phase !== "playing") return { ok: false as const, reason: "over" };
    if (room.turn !== uid || room.turnNo !== turnNo) return { ok: false as const, reason: "notYourTurn" };
    if (serverNow() > room.turnEndsAt + SUBMIT_GRACE_MS) return { ok: false as const, reason: "late" };
    if (room.used.some((u) => u.w === word)) return { ok: false as const, reason: "used" };

    const game = gameOf(room);
    const me = room.players[uid];
    const next = nextAlive(room, uid);

    if (game === "ladder") {
      if (!oneLetterApart(word, room.root)) return { ok: false as const, reason: "moved" };
      const players = { ...room.players, [uid]: { ...me, words: me.words + 1 } };
      if (deadEnd && next !== uid) {
        tx.update(
          roomRef(code),
          strikeUpdate(room, players, next, (strikes, out, id) => ({
            id,
            kind: "deadend",
            uid: next,
            by: uid,
            word,
            strikes,
            out,
          }))
        );
        return { ok: true as const, fullRip: false, savedStrike: false, deadEnd: true };
      }
      const now = serverNow();
      tx.update(roomRef(code), {
        root: word,
        used: [...room.used, { w: word, by: uid }],
        players,
        turn: next,
        turnNo: room.turnNo + 1,
        pauseUntil: now,
        turnEndsAt: now + turnSeconds(room.level, 0, game) * 1000,
        turnSeenAt: null,
        rev: (room.rev ?? 0) + 1,
        last: { id: room.turnNo + 1, kind: "word", uid, word },
      });
      return { ok: true as const, fullRip: false, savedStrike: false, deadEnd: false };
    }

    const fullRip = word.length === room.root.length && word !== room.root;
    const savedStrike = fullRip && me.strikes > 0;
    const used = [...room.used, { w: word, by: uid }];
    const now = serverNow();
    tx.update(roomRef(code), {
      used,
      [`players.${uid}.words`]: me.words + 1,
      [`players.${uid}.fullRips`]: me.fullRips + (fullRip ? 1 : 0),
      [`players.${uid}.strikes`]: savedStrike ? me.strikes - 1 : me.strikes,
      turn: next,
      turnNo: room.turnNo + 1,
      pauseUntil: now,
      turnEndsAt: now + turnSeconds(room.level, used.length) * 1000,
      turnSeenAt: null,
      rev: (room.rev ?? 0) + 1,
      last: fullRip
        ? { id: room.turnNo + 1, kind: "fullrip", uid, word, savedStrike }
        : { id: room.turnNo + 1, kind: "word", uid, word },
    });
    return { ok: true as const, fullRip, savedStrike, deadEnd: false };
  });
}

/** Called by any phone once a turn's clock has run out. Only the first call counts. */
export async function timeoutTurn(code: string, turnNo: number) {
  await runTransaction(getDb(), async (tx) => {
    const snap = await tx.get(roomRef(code));
    const room = snap.data() as Room;
    if (!room || room.phase !== "playing" || room.turnNo !== turnNo) return;
    if (serverNow() < strikeAt(room) - 500) return; // too early
    const uid = room.turn;
    tx.update(
      roomRef(code),
      strikeUpdate(room, room.players, uid, (strikes, out, id) =>
        out ? { id, kind: "out", uid } : { id, kind: "strike", uid, strikes }
      )
    );
  });
}

/** Back to the lobby with the same players. Anyone can press it. */
export async function playAgain(code: string) {
  await runTransaction(getDb(), async (tx) => {
    const snap = await tx.get(roomRef(code));
    const room = snap.data() as Room;
    if (!room || room.phase !== "over") return;
    tx.update(roomRef(code), { phase: "lobby", winner: null, used: [], outOrder: [], rev: (room.rev ?? 0) + 1 });
  });
}
