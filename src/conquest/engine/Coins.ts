// Derp Coins for a line of lives in Derpy Conquest. The server pays this and
// the end screen shows it, so it's the whole rulebook. Totals land where the
// old governor's game did (it was deliberately tuned down): a short life
// pays a handful, a dynasty that rose high pays a few dozen. SITE (r19): a
// fifth more on every line (LIFE_COINS), each line rounded down.
//
// LEGACY (r21): Conquest pays about what DerpyFront does for an hour's play.
// Time at the table pays as you go (PLAY_PAY.perHour), the line's coins
// are paid as each is reached rather than only at the end, and both are
// counted in real minutes, so pausing, skipping ahead or starting game
// after game earns nothing extra. The server keeps the clock
// (server/conquest/ConquestPay.ts); these are the rules it reads.

import { LIFE_COINS, PLAY_PAY } from "./LifeRules";
import type { Life } from "./Types";

export interface CoinResult {
  total: number;
  lines: { line: string; coins: number }[];
}

/** What a seat's line earned. `reached1776`: a character still living at the end. */
export function lifeCoins(life: Life, reached1776: boolean): CoinResult {
  const c = LIFE_COINS;
  const t = life.tally;
  if (t.days < c.minDays) return { total: 0, lines: [] };
  const lines = [
    { line: "Lived a life", coins: c.played },
    {
      line: `${Math.floor(t.days / 365)} years lived`,
      coins: Math.min(c.maxYears, Math.floor((t.days / 3650) * c.perTenYears)),
    },
    {
      line: "Rose in a trade",
      coins: Math.min(c.maxRank, Math.floor(t.topRank * c.perRank)),
    },
    {
      line:
        t.topOffice >= 3
          ? "Governed"
          : t.topOffice === 2
            ? "Sat on a council"
            : "Sat in an assembly",
      coins: c.office[Math.min(3, t.topOffice)] ?? 0,
    },
    {
      line: "Renown",
      coins: Math.min(
        c.maxRenown,
        Math.floor((t.peakRenown / 10) * c.perTenRenown),
      ),
    },
    {
      line: `${t.generations} generation${t.generations === 1 ? "" : "s"}`,
      coins: Math.min(c.maxGenerations, (t.generations - 1) * c.perGeneration),
    },
    {
      line: `${t.children} children`,
      coins: Math.min(c.maxChildren, Math.floor(t.children * c.perChild)),
    },
    {
      line: "Battles won",
      coins: Math.min(c.maxBattles, Math.floor(t.battlesWon * c.perBattleWon)),
    },
    { line: "A rising that won", coins: t.risingsWon > 0 ? c.risingWon : 0 },
    { line: "Went to Europe", coins: t.europe ? c.europe : 0 },
    { line: "Lived to see 1776", coins: reached1776 ? c.reached1776 : 0 },
  ].filter((l) => l.coins > 0);
  return { total: lines.reduce((n, l) => n + l.coins, 0), lines };
}

// ---------------------------------------------------------------- LEGACY (r21): pay as you play

/** Coins for time at the table (unrounded): `secs` seconds that counted. */
export function timeCoins(secs: number): number {
  return (Math.max(0, secs) / 3600) * PLAY_PAY.perHour; // CQACH (r22)
}

/** CQACH (r22): the time pay a minute, in words: "3⅓" (200 an hour). */
export function perMinuteWords(perHour: number = PLAY_PAY.perHour): string {
  const m = perHour / 60;
  const whole = Math.floor(m);
  const frac = m - whole;
  if (frac < 0.001) return `${whole}`;
  const part =
    Math.abs(frac - 1 / 3) < 0.001
      ? "⅓"
      : Math.abs(frac - 2 / 3) < 0.001
        ? "⅔"
        : Math.abs(frac - 0.5) < 0.001
          ? "½"
          : null;
  return part ? `${whole}${part}` : m.toFixed(1);
}

/**
 * CQACH (r22): a game's coins for time at the table once `total` seconds
 * have counted, `was` paid for its first `wasSecs`. Each second from
 * `wasSecs` on pays at today's rate (whole coins, worked out on the game's
 * whole time so nothing is lost to rounding); what was paid before stands,
 * so a game begun at the old rate isn't paid again for its past.
 */
export function playCoinsAfter(
  was: number,
  wasSecs: number,
  total: number,
): number {
  const whole = (secs: number) =>
    Math.floor((Math.max(0, secs) * PLAY_PAY.perHour) / 3600);
  return was + Math.max(0, whole(total) - whole(wasSecs));
}

/**
 * The most a line's coins may come to in a game after `secs` seconds at the
 * table in it: so a game begun and ended again and again pays only for the
 * time it was played.
 */
export function lineCap(secs: number): number {
  return Math.floor((Math.max(0, secs) / 3600) * PLAY_PAY.linesPerHour);
}

/** Where a seat stands with its line's coins in a game. */
export interface LinesDue {
  /** The line's coins as they stand (every line, rounded down). */
  total: number;
  /** The most its time at the table allows. */
  cap: number;
  /** Paid already in this game. */
  paid: number;
  /** To pay now: what's earned, up to the cap, less what's been paid. */
  due: number;
  /** Earned but waiting on more time at the table. */
  held: number;
}

/**
 * The line's coins due: during play every line but living to see 1776
 * (`reached1776` false); at the end, all of them. Never negative.
 */
export function linesDue(
  life: Life,
  secs: number,
  paid: number,
  reached1776 = false,
): LinesDue {
  const total = lifeCoins(life, reached1776).total;
  const cap = lineCap(secs);
  const allowed = Math.min(total, cap);
  return {
    total,
    cap,
    paid,
    due: Math.max(0, allowed - paid),
    held: Math.max(0, total - Math.max(allowed, paid)),
  };
}

/** What the server knows of a seat at a moment, to say whether that moment at the table counts. */
export interface TableMoment {
  /** Living a life (not watching, not between lives), in a game not yet over. */
  living: boolean;
  /** Milliseconds since this account's last choice in this seat (Infinity: none). */
  sinceChoice: number;
  /** The clock is stopped, and for how long (milliseconds). */
  paused: boolean;
  pausedFor: number;
}

/**
 * Whether a moment at the table counts toward pay: you're living a life,
 * you've made a choice lately, and the clock is running (or skipping ahead),
 * or stopped for no longer than PLAY_PAY.pausedMinutes so far.
 */
export function countsAtTable(m: TableMoment): boolean {
  if (!m.living) return false;
  if (!(m.sinceChoice <= PLAY_PAY.idleMinutes * 60_000)) return false;
  if (m.paused && m.pausedFor > PLAY_PAY.pausedMinutes * 60_000) return false;
  return true;
}
