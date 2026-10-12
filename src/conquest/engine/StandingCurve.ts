// POLLS (r16): the curve renown and favour are gained and lost on. Below
// about 60 they work as they always did; above it each gain counts for less,
// and they fade faster the higher they stand. Pure numbers, no imports, so
// LifeCore can use them; the engine and the pages read the same table.

export interface Curve {
  /** Gains count in full up to here. */
  knee: number;
  /** Above the knee a gain counts 1 / (1 + (v − knee) / soft). */
  soft: number;
  /** What's above `floor` fades by `fade` a month... */
  floor: number;
  fade: number;
  /** ...and by `high` more for each point above the knee. */
  high: number;
  /** Never above this. */
  max: number;
}

/** Renown: 60 gained at full weight; at 100 a gain counts 1 in 2, at 140 1 in 3. */
export const RENOWN_CURVE: Curve = {
  knee: 60,
  soft: 40,
  floor: 15,
  fade: 0.02,
  high: 0.0002,
  max: Infinity,
};

/** Favour: 60 at full weight; at 85 a gain counts 1 in 2; it never passes 100. */
export const FAVOUR_CURVE: Curve = {
  knee: 60,
  soft: 25,
  floor: 0,
  fade: 0.02,
  high: 0.0004,
  max: 100,
};

/** What one point gained counts for at this height (1 below the knee). */
export function gainFactor(c: Curve, v: number): number {
  return v <= c.knee ? 1 : 1 / (1 + (v - c.knee) / c.soft);
}

/** Where a gain of n takes you from v (worked out a half point at a time). */
export function afterGain(c: Curve, v: number, n: number): number {
  if (n <= 0) return v + n;
  let left = n;
  let x = v;
  // Below the knee it's all at full weight.
  if (x < c.knee) {
    const full = Math.min(left, c.knee - x);
    x += full;
    left -= full;
  }
  while (left > 1e-9) {
    const step = Math.min(0.5, left);
    x += step * gainFactor(c, x);
    left -= step;
  }
  return Math.min(c.max, x);
}

/** What a month takes away at this height. */
export function monthlyFade(c: Curve, v: number): number {
  if (v <= c.floor) return 0;
  const rate = c.fade + c.high * Math.max(0, v - c.knee);
  return (v - c.floor) * rate;
}

/** Where a steady gain a month settles (for the guide's table). */
export function settlesAt(c: Curve, perMonth: number, years = 30): number {
  let v = c.floor > 0 ? 10 : 0;
  for (let m = 0; m < years * 12; m++) {
    v = afterGain(c, v, perMonth);
    v -= monthlyFade(c, v);
  }
  return Math.round(v);
}
