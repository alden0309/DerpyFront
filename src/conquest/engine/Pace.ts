// The pace of a life: a day every three seconds at 1×, and a skip ahead
// through the quiet stretches that stops the moment something needs you
// (a letter, an arrival, a matter at work, news of your people or your
// boats). The engine only keeps count of what woke each life; the server
// runs the clock and decides when to stop.

import type { ConquestGame } from "./Game";
import { touchLife } from "./LifeCore";
import type { GameState, Life } from "./Types";

/** Game days a real second while skipping ahead. */
export const SKIP_DAYS_PER_SECOND = 20;
/** A skip never runs longer than this many game days without stopping. */
export const SKIP_MAX_DAYS = 365;

/** Something needs this life: a skip ahead stops for it. */
export function wake(g: ConquestGame, life: Life, why: string): void {
  if (life.watching || life.c < 0) return;
  touchLife(g, life);
  life.wake = (life.wake ?? 0) + 1;
  life.wakeWhy = why;
}

function living(s: GameState): Life[] {
  return s.lives.filter((l) => !l.watching && l.c >= 0);
}

/**
 * A fingerprint of everything that would stop a skip: each living life's
 * wake count and its waiting letters. When it changes, someone is needed.
 */
export function attentionMark(s: GameState): string {
  return living(s)
    .map(
      (l) => `${l.seat}:${l.wake ?? 0}:${l.events.map((e) => e.id).join(",")}`,
    )
    .join("|");
}

/** Why a skip can't start: letters already waiting, or nobody alive to play. */
export function skipBlocker(s: GameState): string | null {
  if (s.over) return "The world has reached 1776.";
  const lives = living(s);
  if (!lives.length) return "Nobody is living a life to skip ahead with.";
  const waiting = lives.find((l) => l.events.length > 0);
  if (waiting)
    return lives.length > 1
      ? `${waiting.name} has letters waiting for an answer.`
      : "Answer the letters waiting for you first.";
  return null;
}

/** What stopped a skip, in words, comparing against the mark it began with. */
export function whyWoken(s: GameState, before: string): string {
  const was = new Map(
    before
      .split("|")
      .filter(Boolean)
      .map((part) => {
        const [seat, n, ids] = part.split(":");
        return [seat, { n: Number(n), ids: ids ? ids.split(",") : [] }];
      }),
  );
  const many = living(s).length > 1;
  for (const l of living(s)) {
    const w = was.get(l.seat);
    const fresh = l.events.find((e) => !w?.ids.includes(String(e.id)));
    const who = many ? `${l.name}: ` : "";
    if (fresh) return `${who}${fresh.title}.`;
    if (!w || (l.wake ?? 0) !== w.n)
      return `${who}${l.wakeWhy ?? "Something needs you."}`;
  }
  return "Something needs you.";
}
