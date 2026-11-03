// Builds the game's word data from the SCOWL word lists (wordlist-english).
// Run with: npm run words
// Outputs:
//   public/dict.txt      every accepted word, one per line; common words end in "*"
//   src/data/roots.json  root words for normal and easy games
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const BASE = "wordlist-english/";
const VARIANTS = ["english", "british"]; // British spellings for Irish players

// Words that badwords-list flags but are harmless in a word game
const ALLOW = new Set(["balls", "bloody", "breasts", "bum", "hell", "screw", "sex"]);
// A few extra words to keep out
const EXTRA_BLOCK = ["shag", "slag", "wank", "feck", "cunts", "pikey", "tinker"];

const blocked = new Set(
  [...require("badwords-list").array, ...EXTRA_BLOCK]
    .map((w) => w.toLowerCase())
    .filter((w) => /^[a-z]+$/.test(w) && !ALLOW.has(w))
);

function wordsUpTo(level) {
  const set = new Set();
  for (const l of [10, 20, 35, 40, 50, 55, 60, 70]) {
    if (l > level) break;
    for (const v of VARIANTS) {
      for (const w of require(`${BASE}${v}-words-${l}.json`)) {
        if (/^[a-z]{3,9}$/.test(w) && !blocked.has(w)) set.add(w);
      }
    }
  }
  return set;
}

const accepted = wordsUpTo(60); // what players may enter
const common = wordsUpTo(35); // what we count as "findable" and show as missed
const easyCommon = wordsUpTo(20); // for the kids' level

function counts(w) {
  const c = new Array(26).fill(0);
  for (const ch of w) c[ch.charCodeAt(0) - 97]++;
  return c;
}
function fits(word, rootCounts) {
  const c = new Array(26).fill(0);
  for (const ch of word) {
    const i = ch.charCodeAt(0) - 97;
    if (++c[i] > rootCounts[i]) return false;
  }
  return true;
}

const commonArr = [...common];
const easyArr = [...easyCommon];
// Roots must be everyday words, and not plurals or -s verb forms ("destroys")
const notPlural = (w) => !/[^s]s$/.test(w);
const normalPool = [...wordsUpTo(20)].filter(notPlural);
const easyPool = [...wordsUpTo(10)].filter(notPlural);

function pickRoots(pool, findable, minLen, maxLen, minSub) {
  const out = [];
  for (const root of pool) {
    if (root.length < minLen || root.length > maxLen) continue;
    const rc = counts(root);
    let n = 0;
    for (const w of findable) {
      if (w !== root && w.length <= root.length && fits(w, rc)) n++;
    }
    if (n >= minSub) out.push(root);
  }
  return out.sort();
}

const normal = pickRoots(normalPool, commonArr, 7, 9, 30);
const easy = pickRoots(easyPool, easyArr, 6, 7, 12);

mkdirSync("src/data", { recursive: true });
writeFileSync("src/data/roots.json", JSON.stringify({ normal, easy }));
const dict = [...accepted].sort().map((w) => (common.has(w) ? w + "*" : w));
writeFileSync("public/dict.txt", dict.join("\n"));

console.log(`accepted ${accepted.size}, common ${common.size}`);
console.log(`roots: normal ${normal.length}, easy ${easy.length}`);
console.log("sample normal:", normal.filter((_, i) => i % 40 === 0).join(" "));
console.log("sample easy:", easy.filter((_, i) => i % 8 === 0).join(" "));
