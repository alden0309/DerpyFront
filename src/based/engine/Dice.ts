// Mr. Based's skill checks (r21), in the manner of Disco Elysium: two six-
// sided dice plus the skill (and any modifiers) against a difficulty. Double
// six always succeeds, double one always fails. A passive check has no roll:
// the skill plus six against the difficulty.
//
// Rolls come from a seed kept in the save, the check's id and how many times
// it has been tried, so loading a save never rerolls a check, and the same
// save always plays out the same way. Pure: no clock, no Math.random.

/** The named difficulties, easiest first. */
export const TIERS: readonly { id: string; name: string; diff: number }[] = [
  { id: "trivial", name: "Trivial", diff: 6 },
  { id: "easy", name: "Easy", diff: 8 },
  { id: "medium", name: "Medium", diff: 9 },
  { id: "challenging", name: "Challenging", diff: 10 },
  { id: "formidable", name: "Formidable", diff: 11 },
  { id: "legendary", name: "Legendary", diff: 12 },
  { id: "heroic", name: "Heroic", diff: 13 },
  { id: "godly", name: "Godly", diff: 14 },
  { id: "impossible", name: "Impossible", diff: 15 },
];

/** What a passive check adds instead of dice. */
export const PASSIVE = 6;

/** "challenging" or "10": the number, or null if it's neither. */
export function parseDifficulty(word: string): number | null {
  const t = TIERS.find((x) => x.id === word.toLowerCase());
  if (t) return t.diff;
  if (/^\d{1,2}$/.test(word)) {
    const n = Number(word);
    return n >= 2 && n <= 20 ? n : null;
  }
  return null;
}

/** The tier's name for a difficulty: the hardest tier at or below it. */
export function tierName(diff: number): string {
  let name = TIERS[0].name;
  for (const t of TIERS) if (t.diff <= diff) name = t.name;
  return name;
}

/**
 * The chance (0 to 1) that 2d6 + bonus reaches diff, with double six always
 * a success and double one always a failure. Exact, over all 36 throws.
 */
export function chance(bonus: number, diff: number): number {
  let hits = 0;
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) {
      if (passes(a, b, bonus, diff)) hits++;
    }
  }
  return hits / 36;
}

/** As a whole percent, the way the column shows it. */
export function percent(bonus: number, diff: number): number {
  return Math.round(chance(bonus, diff) * 100);
}

export function passes(a: number, b: number, bonus: number, diff: number) {
  if (a === 6 && b === 6) return true;
  if (a === 1 && b === 1) return false;
  return a + b + bonus >= diff;
}

export function passive(skill: number, diff: number): boolean {
  return skill + PASSIVE >= diff;
}

/** FNV-1a over a string, for mixing a check's id into the seed. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small, well-mixed 32-bit generator. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The two dice for a check's `attempt`th try (0 first) under a seed. */
export function rollDice(
  seed: number,
  checkId: string,
  attempt: number,
): [number, number] {
  const next = mulberry((seed ^ hash(`${checkId}#${attempt}`)) >>> 0);
  next(); // the first output is the least mixed
  const a = 1 + Math.floor(next() * 6);
  const b = 1 + Math.floor(next() * 6);
  return [a, b];
}

/** A fresh seed for a new run, from something the caller supplies. */
export function seedFrom(text: string): number {
  return hash(text) || 1;
}
