// BFIX (r23): how people move along a path. Round 22 walked them at a
// constant pace from point to point, snapped their heading round at each
// corner (turning on the spot), started and stopped dead. Now a path's
// corners are rounded where the floor allows, and a walker follows it:
// easing up to pace and down to a stop exactly at the end, turning at a
// limited rate (slowing while he's turned away from where he's going, so he
// steps round rather than sliding sideways), and turning to face what he
// walked to as he arrives. Pure and deterministic, so the tests can walk
// it; People.ts moves each person by it and plays their legs to its pace.

import type { P } from "./Nav";

export interface Gait {
  /** Pace, metres a second. */
  speed: number;
  /** Speeding up and slowing down, metres a second per second. */
  accel: number;
  decel: number;
  /** The fastest he turns while moving, radians a second. */
  turn: number;
  /** How far round a corner he looks ahead, metres. */
  ahead: number;
}

/** A tired man's walk, and a real run (r22 jogged at 2.6 m/s). */
export const WALK: Gait = {
  speed: 1.15,
  accel: 2.2,
  decel: 2.0,
  turn: 5.5,
  ahead: 0.3,
};
export const RUN: Gait = {
  speed: 5.2,
  accel: 6,
  decel: 7,
  turn: 7,
  ahead: 0.8,
};

/** Within this of the end, he's there. */
export const ARRIVE = 0.003;

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * A path with its corners rounded: each bend becomes a curve (a quadratic
 * Bézier between points a little before and after it) wherever `clear`
 * says the floor is free along it; where it isn't, the curve is tightened,
 * and at worst the corner is kept. Sampled about every `step` metres.
 */
export function roundCorners(
  pts: P[],
  clear: (a: P, b: P) => boolean,
  cut = 0.7,
  step = 0.08,
): P[] {
  if (pts.length <= 2) return pts.map((p) => [p[0], p[1]] as P);
  const out: P[] = [[pts[0][0], pts[0][1]]];
  for (let k = 1; k < pts.length - 1; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    const c = pts[k + 1];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const u: P = [(b[0] - a[0]) / l1, (b[1] - a[1]) / l1];
    const v: P = [(c[0] - b[0]) / l2, (c[1] - b[1]) / l2];
    const turn = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])));
    if (turn < 0.05) {
      out.push([b[0], b[1]]);
      continue;
    }
    let d = Math.min(cut, 0.45 * l1, 0.45 * l2);
    let curve: P[] | null = null;
    for (let tries = 0; tries < 4 && d > 0.04; tries++, d /= 2) {
      const t1: P = [b[0] - u[0] * d, b[1] - u[1] * d];
      const t2: P = [b[0] + v[0] * d, b[1] + v[1] * d];
      const n = Math.max(2, Math.ceil((2 * d) / step));
      const c2: P[] = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const s = 1 - t;
        c2.push([
          s * s * t1[0] + 2 * s * t * b[0] + t * t * t2[0],
          s * s * t1[1] + 2 * s * t * b[1] + t * t * t2[1],
        ]);
      }
      let ok = clear(out[out.length - 1], c2[0]);
      for (let i = 1; ok && i < c2.length; i++) ok = clear(c2[i - 1], c2[i]);
      if (ok) {
        curve = c2;
        break;
      }
    }
    if (curve) out.push(...curve);
    else out.push([b[0], b[1]]);
  }
  const last = pts[pts.length - 1];
  out.push([last[0], last[1]]);
  return out;
}

/** One person's movement along a path. */
export class Walker {
  /** Pace now, metres a second. */
  speed = 0;
  gait: Gait = WALK;
  private pts: P[] = [];
  private cum: number[] = [];
  private s = 0;
  /** The heading to finish facing, if any. */
  private face: number | null = null;

  constructor(
    public x = 0,
    public z = 0,
    /** Facing, radians (0 is +z, as the world's). */
    public heading = 0,
  ) {}

  get moving(): boolean {
    return this.pts.length > 0;
  }

  /** How far is left to go. */
  get remaining(): number {
    return this.moving ? this.cum[this.cum.length - 1] - this.s : 0;
  }

  /**
   * Sets off (or changes his mind, keeping his pace) along `pts`, from
   * where he is; `face` is the heading to end on.
   */
  go(pts: P[], gait: Gait = this.gait, face: number | null = null): void {
    const all: P[] = [[this.x, this.z]];
    for (const p of pts) {
      const q = all[all.length - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4) all.push([p[0], p[1]]);
    }
    this.gait = gait;
    this.face = face;
    if (all.length < 2) {
      this.pts = [];
      this.cum = [];
      this.speed = 0;
      return;
    }
    this.pts = all;
    this.cum = [0];
    for (let k = 1; k < all.length; k++) {
      this.cum.push(
        this.cum[k - 1] +
          Math.hypot(all[k][0] - all[k - 1][0], all[k][1] - all[k - 1][1]),
      );
    }
    this.s = 0;
  }

  /** Stops where he is. */
  stop(): void {
    this.pts = [];
    this.cum = [];
    this.speed = 0;
  }

  private at(s: number): P {
    const cum = this.cum;
    const pts = this.pts;
    if (s <= 0) return pts[0];
    const total = cum[cum.length - 1];
    if (s >= total) return pts[pts.length - 1];
    let k = 1;
    while (k < cum.length - 1 && cum[k] < s) k++;
    const seg = cum[k] - cum[k - 1] || 1;
    const t = (s - cum[k - 1]) / seg;
    const a = pts[k - 1];
    const b = pts[k];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  /** Moves him on by `dt` seconds; true on the step he arrives. */
  step(dt: number): boolean {
    if (!this.moving || dt <= 0) return false;
    const g = this.gait;
    const total = this.cum[this.cum.length - 1];
    const rem = total - this.s;
    // Where he's heading: a little way along the path.
    const ahead = this.at(Math.min(total, this.s + Math.max(0.05, g.ahead)));
    let want = this.heading;
    const dx = ahead[0] - this.x;
    const dz = ahead[1] - this.z;
    if (dx * dx + dz * dz > 1e-6) want = Math.atan2(dx, dz);
    // Arriving, he turns to what he came to.
    if (this.face !== null && rem < 0.5) {
      const k = 1 - rem / 0.5;
      want += wrap(this.face - want) * k * k;
    }
    const err = wrap(want - this.heading);
    const most = g.turn * dt;
    const dh = Math.sign(err) * Math.min(Math.abs(err), most, Math.abs(err) * Math.min(1, dt * 12));
    this.heading = wrap(this.heading + dh);
    // Pace: full when facing the way; slow while turned away (stepping
    // round, not sliding sideways); slowing to stop at the end.
    const off = Math.abs(wrap(want - this.heading));
    const facing = off > 1.75 ? 0.08 : 0.15 + 0.85 * Math.max(0, Math.cos(off)) ** 2;
    // (A crawl at the very end, so he gets there.)
    const stopAt = Math.max(0.04, Math.sqrt(2 * g.decel * Math.max(0, rem)));
    const target = Math.min(g.speed * facing, stopAt);
    if (target > this.speed) this.speed = Math.min(target, this.speed + g.accel * dt);
    else this.speed = Math.max(target, this.speed - g.decel * 1.6 * dt);
    this.s += this.speed * dt;
    if (this.s >= total - ARRIVE) {
      const end = this.pts[this.pts.length - 1];
      this.x = end[0];
      this.z = end[1];
      this.pts = [];
      this.cum = [];
      this.speed = 0;
      return true;
    }
    const p = this.at(this.s);
    this.x = p[0];
    this.z = p[1];
    return false;
  }
}
