// Test stand-in for "firebase/firestore": a tiny database in localStorage,
// shared between tabs of the same browser, with live updates via BroadcastChannel.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Firestore = object;
type Ref = { path: string };
const DELETE = { __delete: true };
const STAMP = { __stamp: true };
const chan = typeof window !== "undefined" ? new BroadcastChannel("fake-fs") : null;
const listeners = new Map<string, Set<() => void>>();

export class Timestamp {
  constructor(private ms: number) {}
  toMillis() { return this.ms; }
}
export const getFirestore = () => ({});
export const initializeFirestore = () => ({});
export const disableNetwork = async () => {};
export const enableNetwork = async () => {};
export const connectFirestoreEmulator = () => {};
export const doc = (_db: unknown, ...parts: string[]): Ref => ({ path: parts.join("/") });
export const deleteField = () => DELETE;
export const serverTimestamp = () => STAMP;

const key = (r: Ref) => "fs:" + r.path;
// Newest copy of each document seen by this tab (localStorage can lag behind between tabs)
const latest = new Map<string, string>();
function read(r: Ref): any {
  const raw = latest.get(r.path) ?? localStorage.getItem(key(r));
  if (!raw) return undefined;
  return JSON.parse(raw, (_k, v) => (v && v.__ts ? new Timestamp(v.__ts) : v));
}
function fill(v: any): any {
  if (v === STAMP) return { __ts: Date.now() };
  if (Array.isArray(v)) return v.map(fill);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
  return v;
}
function write(r: Ref, data: any) {
  const raw = JSON.stringify(fill(data));
  localStorage.setItem(key(r), raw);
  latest.set(r.path, raw);
  notify(r.path);
  chan?.postMessage({ path: r.path, raw });
}
// Tests can set window.__dropLive = true to mimic a phone whose live updates have stalled
function notify(path: string) {
  if ((globalThis as any).__dropLive) return;
  listeners.get(path)?.forEach((f) => setTimeout(f, 0));
}
if (chan)
  chan.onmessage = (e) => {
    latest.set(e.data.path, e.data.raw);
    notify(e.data.path);
  };

function applyUpdate(cur: any, upd: Record<string, any>) {
  const next = structuredClone(cur ?? {});
  for (const [p, v] of Object.entries(upd)) {
    const parts = p.split(".");
    let o = next;
    for (const k of parts.slice(0, -1)) o = o[k] ??= {};
    if (v === DELETE) delete o[parts.at(-1)!];
    else o[parts.at(-1)!] = structuredClone(v);
  }
  return next;
}
const snap = (r: Ref) => {
  const d = read(r);
  return { exists: () => d !== undefined, data: () => d };
};
const lag = () => new Promise((res) => setTimeout(res, 30 + Math.random() * 60)); // pretend network

export async function getDoc(r: Ref) { await lag(); return snap(r); }
// With __dropLive set, mimic a completely stuck connection: server fetches never come back
export async function getDocFromServer(r: Ref) {
  if ((globalThis as any).__dropLive) return new Promise<never>(() => {});
  return getDoc(r);
}
export async function setDoc(r: Ref, data: any) { await lag(); write(r, data); }
export async function updateDoc(r: Ref, upd: any) {
  await lag();
  if (read(r) === undefined) throw new Error("No document");
  write(r, applyUpdate(read(r), upd));
}
export async function runTransaction<T>(_db: unknown, fn: (tx: any) => Promise<T>): Promise<T> {
  await lag();
  const pending: [Ref, any][] = [];
  const tx = {
    get: async (r: Ref) => snap(r),
    update: (r: Ref, u: any) => pending.push([r, (cur: any) => applyUpdate(cur, u)]),
    set: (r: Ref, d: any) => pending.push([r, () => d]),
  };
  const out = await fn(tx);
  for (const [r, f] of pending) write(r, f(read(r)));
  return out;
}
export function onSnapshot(r: Ref, cb: (s: any) => void) {
  const f = () => cb(snap(r));
  if (!listeners.has(r.path)) listeners.set(r.path, new Set());
  listeners.get(r.path)!.add(f);
  setTimeout(f, 0);
  return () => listeners.get(r.path)!.delete(f);
}
