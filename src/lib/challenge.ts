// Challenge mode rules. Settings are at the top so they're easy to tweak.
import type { Level } from "./words";

export const ROOMS = "letterRip"; // Firestore collection (separate from Acro Party's "games")
export const MAX_PLAYERS = 8;
export const MAX_STRIKES = 3;
export const PAUSE_MS = 3500; // breather before each new word
// A turn's clock only starts once that player's phone shows it's their turn.
// If their phone never confirms (lost signal), they still get the strike after this extra time.
export const UNSEEN_GRACE_MS = 8000;

/** Seconds per turn: the clock shrinks as the easy words get used up. */
export function turnSeconds(level: Level, wordsUsed: number): number {
  const times = level === "easy" ? [30, 25, 20] : [20, 15, 10];
  if (wordsUsed < 6) return times[0];
  if (wordsUsed < 12) return times[1];
  return times[2];
}

export type Player = {
  name: string;
  joinedAt: number;
  strikes: number;
  out: boolean;
  words: number; // words played this game
  fullRips: number;
};

export type UsedWord = { w: string; by: string };

export type RoomEvent =
  | { id: number; kind: "start" }
  | { id: number; kind: "word"; uid: string; word: string }
  | { id: number; kind: "fullrip"; uid: string; word: string; savedStrike: boolean }
  | { id: number; kind: "strike"; uid: string; strikes: number }
  | { id: number; kind: "out"; uid: string };

export type Room = {
  hostId: string;
  phase: "lobby" | "playing" | "over";
  level: Level;
  createdAt: number;
  players: Record<string, Player>;
  order: string[]; // turn order, fixed for the game
  root: string;
  usedRoots: string[];
  used: UsedWord[];
  turn: string; // uid of the player whose turn it is
  turnNo: number; // goes up every turn; stops two phones acting on the same turn
  pauseUntil: number; // server time the current turn really starts
  turnEndsAt: number; // server time the current turn ends
  turnSeenAt: number | null; // when the player's phone confirmed it's their turn
  rev: number; // goes up on every change, so phones can tell old data from new
  last: RoomEvent;
  outOrder: string[]; // who went out, in order
  winner: string | null;
};

export function makeCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O (look like 1 and 0)
  let code = "";
  for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
  return code;
}

/** The next player still in the game after `uid`, in turn order. */
export function nextAlive(room: Pick<Room, "order" | "players">, uid: string): string {
  const { order, players } = room;
  const start = order.indexOf(uid);
  for (let step = 1; step <= order.length; step++) {
    const id = order[(start + step) % order.length];
    if (players[id] && !players[id].out) return id;
  }
  return uid;
}

export function alivePlayers(room: Pick<Room, "order" | "players">): string[] {
  return room.order.filter((id) => room.players[id] && !room.players[id].out);
}

/** Final places: winner first, then whoever went out last, and so on. */
export function standings(room: Room): string[] {
  const out = [...room.outOrder].reverse();
  const rest = room.order.filter((id) => !room.outOrder.includes(id));
  return [...rest, ...out];
}

export function playersByJoin(room: Room): [string, Player][] {
  return Object.entries(room.players).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
}

// Each player gets a colour so they're easy to tell apart
const COLOURS = ["#ff5d2e", "#ffd23f", "#3ddc97", "#5cc8ff", "#ff7ad9", "#b48cff", "#ffa94d", "#9be15d"];
export function playerColour(room: Room, uid: string): string {
  const ids = playersByJoin(room).map(([id]) => id);
  const i = ids.indexOf(uid);
  return COLOURS[(i < 0 ? 0 : i) % COLOURS.length];
}
