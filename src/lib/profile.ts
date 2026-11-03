// Remembers your player name on this device
const KEY = "letter-rip-name";

export function loadName(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    /* ignore */
  }
}

export const cleanName = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, 16);
