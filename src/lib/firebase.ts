// Connects the app to Firebase (the same project as Acro Party is fine).
// The values come from Vercel "Environment Variables" (see README).
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  connectAuthEmulator,
  type Auth,
  type User,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** False until the Firebase settings have been added in Vercel. */
export const firebaseReady = !!(config.apiKey && config.projectId);

let cached: { app: FirebaseApp; auth: Auth; db: Firestore } | null = null;

function fb() {
  if (!cached) {
    const app = getApps().length ? getApps()[0] : initializeApp(config);
    const auth = getAuth(app);
    const db = getFirestore(app);
    // Local testing only
    if (process.env.NEXT_PUBLIC_USE_EMULATOR === "1") {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
    }
    cached = { app, auth, db };
  }
  return cached;
}

export const getDb = () => fb().db;

/** Every player gets a hidden anonymous ID, so no sign-up is needed.
 *  The browser remembers it, so refreshing the page rejoins the game. */
export function ensureSignedIn(): Promise<User> {
  const { auth } = fb();
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if (user) return resolve(user);
      try {
        const cred = await signInAnonymously(auth);
        resolve(cred.user);
      } catch (e) {
        reject(e);
      }
    });
  });
}
