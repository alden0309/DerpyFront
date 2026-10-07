// A small seeded random number generator (mulberry32). Its whole state is
// one 32-bit number, kept in the game state so saved games carry on the
// same way.

export function nextRandom(state: number): [value: number, state: number] {
  const s = (state + 0x6d2b79f5) | 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

/** A random source that reads and writes the state through `holder`. */
export class Rng {
  constructor(private holder: { rng: number }) {}

  /** A number in [0, 1). */
  next(): number {
    const [v, s] = nextRandom(this.holder.rng);
    this.holder.rng = s;
    return v;
  }

  /** An integer in [lo, hi]. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T | undefined {
    return items.length === 0
      ? undefined
      : items[this.int(0, items.length - 1)];
  }
}
