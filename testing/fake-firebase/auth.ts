// Test stand-in for "firebase/auth": each browser tab is a different player
export type Auth = object;
export type User = { uid: string };
export const getAuth = () => ({});
export const connectAuthEmulator = () => {};
function uid() {
  let id = sessionStorage.getItem("fake-uid");
  if (!id) {
    id = "u" + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem("fake-uid", id);
  }
  return id;
}
export function onAuthStateChanged(_a: Auth, cb: (u: User | null) => void) {
  setTimeout(() => cb({ uid: uid() }), 0);
  return () => {};
}
export async function signInAnonymously() {
  return { user: { uid: uid() } };
}
