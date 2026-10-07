// Every number a player sees comes with its causes. A Breakdown is a total
// built from labelled parts; the client shows the parts in a tooltip.

import { Breakdown, Part } from "./Types";

export class Explain {
  readonly parts: Part[] = [];

  constructor(private base = 0) {}

  /** Add an amount, if it isn't zero (or `always`). */
  add(label: string, value: number, always = false): this {
    if (value !== 0 || always) this.parts.push({ label, value });
    return this;
  }

  /** Multiply the running total, if the factor isn't 1. */
  mul(label: string, factor: number): this {
    if (factor !== 1) this.parts.push({ label, value: factor, mul: true });
    return this;
  }

  get total(): number {
    let t = this.base;
    for (const p of this.parts) t = p.mul ? t * p.value : t + p.value;
    return t;
  }

  done(round = 2, min = -Infinity, max = Infinity): Breakdown {
    const f = 10 ** round;
    const total = Math.round(Math.max(min, Math.min(max, this.total)) * f) / f;
    return { total, parts: this.parts };
  }
}

export function sumOf(b: Breakdown[]): number {
  return b.reduce((s, x) => s + x.total, 0);
}

export const fixed = (value: number, label: string): Breakdown => ({
  total: value,
  parts: [{ label, value }],
});
