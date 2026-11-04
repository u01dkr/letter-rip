// A backup way to read the game that doesn't use Firebase's live connection.
//
// On iPhones, Firebase's live connection can quietly get stuck. When it does, everything that
// goes through it (including "fetch the latest from the server") is stuck too. This reads the
// game over Firebase's plain web address instead, so it still works when the live
// connection doesn't.
import { getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

type Value = {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  stringValue?: string;
  timestampValue?: string;
  arrayValue?: { values?: Value[] };
  mapValue?: { fields?: Record<string, Value> };
};

/** Turns Firebase's web format ({ integerValue: "3" } and so on) into plain values. */
export function fromFirestore(v: Value): unknown {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return Date.parse(v.timestampValue!);
  if ("arrayValue" in v) return (v.arrayValue?.values ?? []).map(fromFirestore);
  if ("mapValue" in v) return fieldsToObject(v.mapValue?.fields ?? {});
  return undefined;
}

export function fieldsToObject(fields: Record<string, Value>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromFirestore(v);
  return out;
}

/**
 * Reads one document directly. Returns the data, `null` if it doesn't exist,
 * or `undefined` if the read couldn't be done (offline, not signed in, etc.).
 */
export async function readDirect(path: string): Promise<Record<string, unknown> | null | undefined> {
  try {
    const user = getAuth().currentUser;
    const { projectId, apiKey } = getApp().options;
    if (!user || !projectId) return undefined;
    const token = await user.getIdToken();
    const url =
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/` +
      path.split("/").map(encodeURIComponent).join("/") +
      (apiKey ? `?key=${encodeURIComponent(apiKey)}` : "");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.status === 404) return null;
    if (!res.ok) return undefined;
    const doc = (await res.json()) as { fields?: Record<string, Value> };
    return fieldsToObject(doc.fields ?? {});
  } catch {
    return undefined;
  }
}
