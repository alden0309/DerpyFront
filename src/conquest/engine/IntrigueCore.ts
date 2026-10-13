// INTRIGUE (r15): what the hearts-and-schemes modules share. The state kept
// outside the lives (schemes, kept lovers, betrothals, guards), what changed
// for the players, the track's own dice, who counts as close kin and as grown,
// and the secrecy: each player is sent only their own schemes (and any aimed
// at them that they've found out), and another player's secrets (a plot's
// journal lines, its scenes, a private letter) are taken out of the copy of
// that life everyone else is sent.

import type { ConquestGame } from "./Game";
import { journal, touchLife } from "./LifeCore";
import { ROLES } from "./LifeRules";
import { booksForOthers, booksHaveLoans } from "./LoanCore"; // ECON (r17)
import { pollsForOthers, pollsHaveSecrets } from "./PollsSecret"; // POLLS (r16)
import { ageOf } from "./Queries";
import { Rng } from "./Rng";
import type {
  Betrothal,
  Character,
  GameDelta,
  GameState,
  IntrigueScheme,
  IntrigueState,
  Life,
} from "./Types";
import { SEATS } from "./Types";

/** Nothing of the heart (courting, seduction, marriage, a lover) under this age, on either side. */
export const ADULT_AGE = 18;

/** Whether someone is grown, for anything of the heart (and to be the target of a plot). */
export function grown(s: GameState, c: Character | undefined): boolean {
  return !!c && ageOf(s, c) >= ADULT_AGE;
}

/** Where someone stands, 1 (labourer) to 6 (a governor), as the card reckons it. */
export function standing(s: GameState, c: Character | undefined): number {
  if (!c) return 2;
  if (c.role) return ROLES[c.role].status;
  const n = s.nations[c.nation];
  if (n?.ruler === c.id) return 6;
  if (n && SEATS.some((st) => n.council[st] === c.id)) return 5;
  const parent = s.chars[c.father] ?? s.chars[c.mother];
  return parent?.role ? ROLES[parent.role].status : 2;
}

/** Someone's promise to marry, if they've made one (and it's not yet kept or broken). */
export function betrothalOf(s: GameState, c: number): Betrothal | undefined {
  return (s.intrigue?.betrothals ?? []).find(
    (b) =>
      (b.a === c || b.b === c) &&
      (b.status === "promised" || b.status === "planned"),
  );
}

/** The other of a betrothed pair. */
export function betrothedTo(b: Betrothal, c: number): number {
  return b.a === c ? b.b : b.a;
}

// ---------------------------------------------------------------- close kin

/** Parents and grandparents (ids). */
function forebears(s: GameState, c: Character): number[] {
  const out: number[] = [];
  for (const p of [c.father, c.mother]) {
    if (p < 0) continue;
    out.push(p);
    const pc = s.chars[p];
    if (pc) for (const gp of [pc.father, pc.mother]) if (gp >= 0) out.push(gp);
  }
  return out;
}

/**
 * Close kin, whom nobody courts, seduces or marries: parents and children,
 * grandparents and grandchildren, brothers and sisters (and half), uncles and
 * aunts, nephews and nieces, first cousins, and a step-parent or step-child.
 */
export function closeKin(
  s: GameState,
  a: Character | undefined,
  b: Character | undefined,
): boolean {
  if (!a || !b || a.id === b.id) return !!a && !!b;
  const fa = forebears(s, a);
  const fb = forebears(s, b);
  if (fa.includes(b.id) || fb.includes(a.id)) return true;
  // Sharing a parent or a grandparent: siblings, half-siblings, cousins,
  // and an uncle or aunt (whose parent is the other's grandparent).
  const pa = [a.father, a.mother].filter((x) => x >= 0);
  const pb = [b.father, b.mother].filter((x) => x >= 0);
  if (pa.some((x) => pb.includes(x))) return true;
  if (fa.some((x) => fb.includes(x))) return true;
  // Step: married to the other's parent.
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    const sp = s.chars[x.spouse];
    if (sp && (y.father === sp.id || y.mother === sp.id) && x.spouse >= 0)
      return true;
  }
  return false;
}

// ---------------------------------------------------------------- the state

const CHANGED = new WeakSet<ConquestGame>();

export function intrigueChanged(g: ConquestGame): void {
  CHANGED.add(g);
}

/** The state, made the first time it's needed. */
export function intrigue(g: ConquestGame): IntrigueState {
  const s = g.s;
  if (!s.intrigue) {
    s.intrigue = { schemes: [], kept: [], betrothals: [], guards: {} };
    intrigueChanged(g);
  }
  return s.intrigue;
}

/** Read-only, for queries (and the browser). */
export function intrigueOf(s: GameState): IntrigueState {
  return s.intrigue ?? { schemes: [], kept: [], betrothals: [], guards: {} };
}

/** What changed since the last call (the whole of it: it's small), and clears it. */
export function takeIntrigueDelta(g: ConquestGame): IntrigueState | undefined {
  if (!CHANGED.has(g) || !g.s.intrigue) return undefined;
  CHANGED.delete(g);
  return g.s.intrigue;
}

export function applyIntrigueDelta(s: GameState, d: IntrigueState): void {
  s.intrigue = d;
}

/** Drop what's long settled, so the state stays small. */
export function tidyIntrigue(g: ConquestGame): void {
  const st = g.s.intrigue;
  if (!st) return;
  const day = g.s.day;
  const old = (end?: number) => end !== undefined && day - end > 730;
  const n = st.schemes.length + st.betrothals.length;
  st.schemes = st.schemes.filter((x) => !old(x.ended));
  st.betrothals = st.betrothals.filter((x) => !old(x.ended));
  for (const [c, until] of Object.entries(st.guards))
    if (until < day) delete st.guards[Number(c)];
  if (st.schemes.length + st.betrothals.length !== n) intrigueChanged(g);
}

// ---------------------------------------------------------------- the track's dice

const DICE = new WeakMap<ConquestGame, { day: number; rng: number }>();

/**
 * The track's own dice: seeded afresh each day from the game's seed with a
 * salt of its own, so schemes and weddings never disturb the world's dice
 * (or anyone else's), and nothing extra needs saving.
 */
export function idice(g: ConquestGame): Rng {
  const s = g.s;
  let d = DICE.get(g);
  if (!d || d.day !== s.day) {
    d = {
      day: s.day,
      rng:
        (Math.imul(s.settings.seed | 0, 0x2c1b3c6d) ^
          Math.imul(s.day + 1291, 0x297a2d39) ^
          0x5a17c0de) |
        0,
    };
    DICE.set(g, d);
  }
  return new Rng(d);
}

// ---------------------------------------------------------------- secrets

/** A journal line only this life's own player is sent (a plot, a private letter). */
export function secretNote(
  g: ConquestGame,
  life: Life,
  text: string,
  tone?: "good" | "bad",
): void {
  journal(g, life, text, tone, false);
  const last = life.journal[life.journal.length - 1];
  if (last && last.text === text) last.sec = true;
  touchLife(g, life);
}

/** Keys of the scenes and cooldowns that are a player's own secret business. */
export function secretKey(key: string): boolean {
  return (
    key.startsWith("intr-") ||
    key.startsWith("p2p-intr-") ||
    key.startsWith("loan-") // ECON (r17): a bond's scenes, its parties' business only
  );
}

/** A scheme a seat may know of: its own, or one aimed at it that it's found out. */
export function seesScheme(
  s: GameState,
  x: IntrigueScheme,
  seat: string | null,
): boolean {
  if (seat === null) return false;
  if (x.seat === seat) return true;
  const life = s.lives.find((l) => l.seat === seat);
  return !!life && life.c >= 0 && x.target === life.c && !!x.knows;
}

/** The intrigue state as one seat may see it. */
export function intrigueView(
  s: GameState,
  st: IntrigueState | undefined,
  seat: string | null,
): IntrigueState | undefined {
  if (!st) return st;
  const me = seat ? s.lives.find((l) => l.seat === seat) : undefined;
  const guards: Record<number, number> = {};
  if (me && me.c >= 0 && st.guards[me.c] !== undefined)
    guards[me.c] = st.guards[me.c];
  return {
    schemes: st.schemes.filter((x) => seesScheme(s, x, seat)),
    kept: st.kept.filter(
      (x) => x.seat === seat || (!!me && me.c >= 0 && x.c === me.c),
    ),
    betrothals: st.betrothals,
    guards,
  };
}

/**
 * A cooldown or a count of showings that gives a secret away: a scheme's own
 * ("intr:..."), or the rest after a secret scene ("ev:intr-warn" would say a
 * warning came; "ev:p2p-intr-seduce" that someone made advances).
 */
function secretMark(k: string): boolean {
  return k.startsWith("intr") || secretKey(k.replace(/^ev:/, ""));
}

/** Whether anything in this (whole or patched) life is another player's secret. */
function lifeHasSecrets(l: Partial<Life>): boolean {
  if (l.journal?.some((j) => j.sec)) return true;
  if (l.events?.some((e) => secretKey(e.key))) return true;
  if (l.post?.some((x) => x.kind === "personal")) return true;
  if (l.outcome && secretKey(l.outcome.key)) return true;
  if (l.cooldowns && Object.keys(l.cooldowns).some(secretMark)) return true;
  if (l.evSeen && Object.keys(l.evSeen).some(secretMark)) return true;
  if (pollsHaveSecrets(l.polls)) return true; // POLLS (r16): the sheriff's present, the canvass's book
  if (booksHaveLoans(l)) return true; // ECON (r17): a bond's money in the books
  return false;
}

/** Another player's life with their secrets taken out (a copy where anything goes). */
export function lifeForOthers<T extends Partial<Life>>(l: T): T {
  if (!lifeHasSecrets(l)) return l;
  const out: T = { ...l };
  if (l.journal) out.journal = l.journal.filter((j) => !j.sec);
  if (l.events) out.events = l.events.filter((e) => !secretKey(e.key));
  if (l.post) out.post = l.post.filter((x) => x.kind !== "personal");
  if (l.outcome && secretKey(l.outcome.key)) out.outcome = null;
  if (l.cooldowns)
    out.cooldowns = Object.fromEntries(
      Object.entries(l.cooldowns).filter(([k]) => !secretMark(k)),
    );
  if (l.evSeen)
    out.evSeen = Object.fromEntries(
      Object.entries(l.evSeen).filter(([k]) => !secretMark(k)),
    );
  if (l.polls) out.polls = pollsForOthers(l.polls); // POLLS (r16)
  booksForOthers(l, out); // ECON (r17)
  return out;
}

/** Whether a delta has anything in it that must be sent differently to each seat. */
export function deltaHasSecrets(d: GameDelta): boolean {
  if (d.intrigue) return true;
  for (const l of Object.values(d.lives ?? {}))
    if (lifeHasSecrets(l)) return true;
  for (const l of Object.values(d.lifePatch ?? {}))
    if (lifeHasSecrets(l)) return true;
  return false;
}

/** A delta as one seat may see it. */
export function deltaForSeat(
  s: GameState,
  d: GameDelta,
  seat: string | null,
): GameDelta {
  const out: GameDelta = { ...d };
  if (d.intrigue) out.intrigue = intrigueView(s, d.intrigue, seat);
  if (d.lives)
    out.lives = Object.fromEntries(
      Object.entries(d.lives).map(([k, l]) => [
        k,
        k === seat ? l : lifeForOthers(l),
      ]),
    );
  if (d.lifePatch)
    out.lifePatch = Object.fromEntries(
      Object.entries(d.lifePatch).map(([k, l]) => [
        k,
        k === seat ? l : lifeForOthers(l),
      ]),
    );
  return out;
}

/** The whole game as one seat may see it (on joining, and on a resync). */
export function stateForIntrigue(s: GameState, seat: string | null): GameState {
  return {
    ...s,
    lives: s.lives.map((l) => (l.seat === seat ? l : lifeForOthers(l))),
    ...(s.intrigue ? { intrigue: intrigueView(s, s.intrigue, seat) } : {}),
  };
}
