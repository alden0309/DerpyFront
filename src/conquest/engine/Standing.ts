// POLLS (r16): renown and favour on a curve. Below about 60 they work as they
// always did; above it each gain counts for less, and they fade faster the
// higher they stand (the great are forgotten fast). Favour in a seat held
// year after year slips unless something is delivered from it (a law, a
// work, a power carried, a measure through the council).
//
// One table of numbers (RENOWN_CURVE, FAVOUR_CURVE) drives the engine and
// what the pages say about it, so the tooltips can't disagree with the game.

import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { journal, touchLife } from "./LifeCore";
import { meOf, officesOf } from "./LifeQueries";
import { DAYS_PER_YEAR } from "./Rules";
import {
  afterGain,
  FAVOUR_CURVE,
  gainFactor,
  monthlyFade,
  RENOWN_CURVE,
} from "./StandingCurve";
import type { Life, PollsLife } from "./Types";

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Add favour (or take it away): gains on the curve, never below 0 or above 100. */
export function addFavor(g: ConquestGame, life: Life, n: number): void {
  if (!n) return;
  touchLife(g, life);
  const next = n > 0 ? afterGain(FAVOUR_CURVE, life.favor, n) : life.favor + n;
  life.favor = Math.max(0, Math.min(FAVOUR_CURVE.max, r1(next)));
}

/**
 * The month's fading, in place of the old flat 2% (Life.ts calls it): the
 * same below the knee to the tenth, faster above it.
 */
export function standingMonth(life: Life): void {
  if (life.renown > RENOWN_CURVE.floor)
    life.renown = r1(life.renown - monthlyFade(RENOWN_CURVE, life.renown));
  if (life.favor > 0)
    life.favor =
      life.favor <= FAVOUR_CURVE.knee
        ? r1(life.favor * (1 - FAVOUR_CURVE.fade))
        : r1(life.favor - monthlyFade(FAVOUR_CURVE, life.favor));
}

/** For the pages: what a gain counts for now, what a month takes, where it settles. */
export interface CurveView {
  value: number;
  /** What one point gained counts for now (1 below the knee). */
  factor: number;
  /** What a month takes away now. */
  fade: number;
  knee: number;
}

export function renownView(life: Life): CurveView {
  return {
    value: life.renown,
    factor: gainFactor(RENOWN_CURVE, life.renown),
    fade: monthlyFade(RENOWN_CURVE, life.renown),
    knee: RENOWN_CURVE.knee,
  };
}

export function favourView(life: Life): CurveView {
  return {
    value: life.favor,
    factor: gainFactor(FAVOUR_CURVE, life.favor),
    fade:
      life.favor <= FAVOUR_CURVE.knee
        ? life.favor * FAVOUR_CURVE.fade
        : monthlyFade(FAVOUR_CURVE, life.favor),
    knee: FAVOUR_CURVE.knee,
  };
}

// ---------------------------------------------------------------- a seat held year after year

/** Favour lost after a year in the same seat with nothing delivered: 4, then 6, 8, 10. */
export function seatSlip(idleYears: number): number {
  return Math.min(10, 2 + 2 * Math.max(1, idleYears));
}

/** The seat that counts: the highest post held, by a key that changes when the seat does. */
export function seatOf(
  s: import("./Types").GameState,
  c: number,
): { key: string; label: string } | null {
  const posts = officesOf(s, c);
  if (!posts.length) return null;
  const top = [...posts].sort((a, b) => b.level - a.level)[0];
  return { key: `${top.kind}:${top.nation}:${top.label}`, label: top.label };
}

function pollsOf(g: ConquestGame, life: Life): PollsLife {
  touchLife(g, life);
  return (life.polls ??= {});
}

/** Something delivered from a seat (a law, a work, a power carried): favour holds this year. */
export function delivered(g: ConquestGame, life: Life, what: string): void {
  if (life.watching || life.c < 0) return;
  const p = pollsOf(g, life);
  p.delivered = g.s.day;
  p.deliveredWhat = what;
}

/** A month: has a year gone by in the same seat, and was anything delivered? */
function seatMonth(g: ConquestGame, life: Life): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me?.alive || life.watching) return;
  const seat = seatOf(s, me.id);
  const p = life.polls;
  if (!seat) {
    if (p?.seat) {
      const q = pollsOf(g, life);
      delete q.seat;
      delete q.seatSince;
      delete q.reckoned;
      q.idle = 0;
    }
    return;
  }
  if (p?.seat !== seat.key) {
    const q = pollsOf(g, life);
    q.seat = seat.key;
    q.seatSince = s.day;
    q.reckoned = s.day;
    q.idle = 0;
    return;
  }
  if (s.day - (p.reckoned ?? p.seatSince ?? s.day) < DAYS_PER_YEAR) return;
  const q = pollsOf(g, life);
  q.reckoned = s.day;
  const did = (q.delivered ?? -Infinity) > s.day - DAYS_PER_YEAR;
  if (did) {
    q.idle = 0;
    journal(
      g,
      life,
      `Another year as ${seat.label}, and your record speaks for you at home (${q.deliveredWhat ?? "what you did"}): your favour holds.`,
      "good",
    );
    return;
  }
  q.idle = (q.idle ?? 0) + 1;
  if (life.favor <= 0) return;
  const loss = Math.min(life.favor, seatSlip(q.idle));
  addFavor(g, life, -loss);
  journal(
    g,
    life,
    `Another year as ${seat.label} with nothing to show for it: favour at home slips (−${Math.round(loss)}). A law, a work, a power or a measure carried would have held it.`,
    "bad",
  );
}

hooks.lifeMonthly.push(seatMonth);
