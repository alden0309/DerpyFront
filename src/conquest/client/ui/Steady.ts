// Lists that hold still. The world ticks many times a second at speed, and
// the people in a place come and go with it; a list redrawn from scratch each
// time jumps about under the pointer. A steady list keeps everyone where they
// first appeared. Someone who leaves stays in their place a moment, faded;
// the next to arrive takes that place (or joins at the end), so nobody below
// moves. With a mouse, a faded place nobody has taken folds away when you're
// not pointing into the list. On a phone (nothing hovers, so there's no
// telling when you're about to tap) it stays until someone takes it, or you
// come back to the place. Someone who steps out and back again within a
// moment never seems to have gone.

/** How long a leaver is kept as if still there (a day at speed, a Sunday). */
export const GRACE_MS = 700;
/** How long they show faded before their place can be taken. */
export const FADE_MS = 1300;
/** How long folding away takes (matches the CSS). */
export const FOLD_MS = 320;

export type SteadyState = "here" | "new" | "leaving" | "folding";

export interface SteadyItem<T> {
  key: number | string;
  item: T;
  state: SteadyState;
}

type Key = number | string;

interface Track<T> {
  scope: string;
  order: Key[];
  last: Map<Key, T>;
  /** When each one was first missed (performance.now()). */
  gone: Map<Key, number>;
  /** When each one first appeared (for the fade-in). */
  born: Map<Key, number>;
  /** When each faded place began folding away. */
  fold: Map<Key, number>;
}

const tracks = new Map<string, Track<unknown>>();
/** Lists the pointer is over just now. */
const held = new Set<string>();
let redraw: (() => void) | null = null;
let timer = 0;
let due = Infinity;
/** Touched with a finger: lists never close up under it. */
let touch = false;

/** What to call when a list needs drawing again (a leaver to fold away). */
export function setSteadyRedraw(fn: (() => void) | null): void {
  redraw = fn;
}

function later(ms: number): void {
  if (!redraw) return;
  const at = performance.now() + ms;
  if (timer && at >= due) return;
  clearTimeout(timer);
  due = at;
  timer = window.setTimeout(() => {
    timer = 0;
    due = Infinity;
    redraw?.();
  }, ms);
}

/** A finger touched the page (a phone has no pointer hovering to go by). */
export function touched(): void {
  touch = true;
}

/** The pointer went into (or out of) a list: hold it still meanwhile. */
export function holdList(list: string, on: boolean): void {
  if (on) {
    held.add(list);
    return;
  }
  if (held.delete(list)) later(30);
}

export function isHeld(list: string): boolean {
  return held.has(list);
}

/**
 * A list in a steady order. `scope` says what it's a list of (the tavern at
 * Jamestown, this visit): when it changes, the list starts afresh in the
 * order given. Otherwise those already shown keep their places, newcomers
 * take a faded place or go at the end, and faded places close up only when
 * nobody could be aiming at the list.
 */
export function steady<T>(
  list: string,
  scope: string,
  items: readonly T[],
  keyOf: (t: T) => Key,
  now: number = performance.now(),
): SteadyItem<T>[] {
  let t = tracks.get(list) as Track<T> | undefined;
  if (!t || t.scope !== scope) {
    t = {
      scope,
      order: items.map(keyOf),
      last: new Map(items.map((x) => [keyOf(x), x])),
      gone: new Map(),
      born: new Map(),
      fold: new Map(),
    };
    tracks.set(list, t as Track<unknown>);
    held.delete(list);
    return items.map((item) => ({ key: keyOf(item), item, state: "here" }));
  }
  const hold = held.has(list);
  const idle = !hold && !touch;
  const present = new Map(items.map((x) => [keyOf(x), x]));
  const slot = new Set(t.order);
  let wake = Infinity;
  // Who's back, who's gone.
  for (const k of t.order) {
    if (present.has(k)) {
      t.gone.delete(k);
      t.fold.delete(k);
    } else if (!t.gone.has(k)) t.gone.set(k, now);
  }
  const ageOf = (k: Key) => now - (t.gone.get(k) ?? now);
  // Newcomers take a place that's faded long enough (not while you point at
  // the list), or go at the end.
  for (const [k, x] of present) {
    t.last.set(k, x);
    if (slot.has(k)) continue;
    const j = hold
      ? -1
      : t.order.findIndex(
          (o) => !present.has(o) && ageOf(o) >= GRACE_MS + FADE_MS,
        );
    if (j >= 0) {
      const old = t.order[j];
      t.gone.delete(old);
      t.fold.delete(old);
      t.last.delete(old);
      t.order[j] = k;
    } else t.order.push(k);
    slot.add(k);
    t.born.set(k, now);
  }
  // When nobody could be aiming at the list, faded places at the very end
  // go at once (nothing below them moves), and the rest fold away.
  while (idle && t.order.length) {
    const k = t.order[t.order.length - 1];
    if (present.has(k) || ageOf(k) < GRACE_MS + FADE_MS) break;
    t.order.pop();
    t.gone.delete(k);
    t.fold.delete(k);
    t.last.delete(k);
  }
  const out: SteadyItem<T>[] = [];
  const keep: Key[] = [];
  for (const k of t.order) {
    const item = t.last.get(k) as T;
    if (present.has(k)) {
      keep.push(k);
      const born = t.born.get(k);
      const fresh = born !== undefined && now - born < 900;
      if (born !== undefined && !fresh) t.born.delete(k);
      out.push({ key: k, item, state: fresh ? "new" : "here" });
      continue;
    }
    const age = ageOf(k);
    if (age < GRACE_MS) {
      keep.push(k);
      out.push({ key: k, item, state: "here" });
      wake = Math.min(wake, GRACE_MS - age);
      continue;
    }
    let folding = t.fold.get(k);
    if (folding === undefined && idle && age >= GRACE_MS + FADE_MS) {
      folding = now;
      t.fold.set(k, now);
    }
    if (folding === undefined) {
      keep.push(k);
      out.push({ key: k, item, state: "leaving" });
      if (age < GRACE_MS + FADE_MS)
        wake = Math.min(wake, GRACE_MS + FADE_MS - age);
      continue;
    }
    // Folding (paused by the CSS while the pointer's in the list).
    if (hold || now - folding < FOLD_MS) {
      keep.push(k);
      out.push({ key: k, item, state: "folding" });
      if (!hold) wake = Math.min(wake, FOLD_MS - (now - folding));
      continue;
    }
    t.gone.delete(k);
    t.fold.delete(k);
    t.last.delete(k);
  }
  t.order = keep;
  if (wake < Infinity) later(Math.max(30, wake + 10));
  return out;
}

/**
 * A set of things (buttons) that only grows while you look: once shown in
 * this scope, it stays (greyed if it can't be done now), and new ones go at
 * the end. Returns the keys to show, in order.
 */
export function steadySet(
  list: string,
  scope: string,
  shown: readonly string[],
): string[] {
  let t = tracks.get(list) as Track<true> | undefined;
  if (!t || t.scope !== scope) {
    t = {
      scope,
      order: [...shown],
      last: new Map(),
      gone: new Map(),
      born: new Map(),
      fold: new Map(),
    };
    tracks.set(list, t as Track<unknown>);
    return [...shown];
  }
  for (const k of shown) if (!t.order.includes(k)) t.order.push(k);
  return t.order as string[];
}

/** Forget every list (a new game). */
export function forgetSteady(): void {
  tracks.clear();
  held.clear();
  clearTimeout(timer);
  timer = 0;
  due = Infinity;
}
