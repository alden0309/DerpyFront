// CQ24 (r24): in "1776: The Revolution", history keeps its course unless
// players change it.
//
// The war's beats (Campaign1776.ts) and the years after it
// (Campaign1776Later.ts) are history's objectives, not a script that ignores
// the world. Each beat passes this module's gate first (R76_GATES), with its
// plan (PLANS): what it needs to have come before, the facts it needs on the
// ground, a town it takes, a battle where players may stand, a vote in
// Congress.
// - With nobody in the way, every beat comes as history had it: the
//   computer's armies, assemblies and governors are steered (the King's and
//   the Continental Army's main armies are moved by the beats, the
//   computer's members of Congress vote as their counterparts did, and the
//   computer's own generals keep out of the war's battles: Ai.ts, through
//   Campaign1776Core).
// - When players change the facts, the course follows them and says so (a
//   line of news beginning "History turns"):
//   - a battle where a player commands an army (the Continental Army's, a
//     detachment, the King's) is fought for real by the engine's own
//     battles, and its result stands, history's or not;
//   - an army of the war beaten or destroyed by players' armies is gone from
//     history's plans (Britain's will to fight goes with it; a great victory
//     brings France in);
//   - a town the King would take, defended by a player's army, has to be
//     fought for; a town players take or free is what it is;
//   - a vote in Congress (the Declaration, the Constitution, Jay's Treaty) is
//     divided for real: players in the house vote for themselves;
//   - a player who governs the United States decides where Congress sits;
//     a town held for the King by a player's army at the peace stays British.
// - Later history adapts: a beat that needed what didn't happen yields (the
//   British don't leave a city they never took), or waits (no French
//   alliance without a declaration and a victory; no federal government
//   without the Constitution), and comes later when it can. If there's no
//   Yorktown, the war goes on until Britain tires of it (a year at a time),
//   and the peace comes otherwise; if players beat the King's armies, it
//   comes sooner. If the Continental Army is lost and Congress's seat held
//   half a year, the rising is put down.
//
// The course rides on the United States (Nation.r76.course), so it goes out
// in the delta and survives a save. Its dice are the campaign's own
// (0x2d1c0000 up; the course's salts 0x60 up).

import { dateOf, dayOf, formatDate } from "./Calendar";
import {
  type Beat,
  beatDay,
  BEATS,
  britainOf,
  campaignOf,
  isCampaign,
  kingArmy,
  kingOf,
  mainArmy,
  playerLed,
  provNamed,
  R76_GATES,
  treatyOfParis,
  usOf,
} from "./Campaign1776";
import { cede, rebellionCrushed } from "./Crown";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { journal } from "./LifeCore";
import { lifeOfChar, meOf } from "./LifeQueries";
import { atWar, charName } from "./Queries";
import { REGIMENTS } from "./Rules";
import { rumour } from "./Rumours";
import type { Army, Course76, GameState } from "./Types";

/** Britain makes peace when its will to fight is this far spent. */
export const PEACE_AT = 0.6;

/** What spends Britain's will: its armies lost, history's great defeats, and each year of a war it can't end. */
export const WEARY = {
  mainDestroyed: 0.45,
  destroyed: 0.3,
  beaten: 0.1,
  saratoga: 0.2,
  yorktown: 0.5,
  year: 0.15,
};

/** The rising is put down when Congress's seat is held this long with no Continental Army; Congress raises another after this. */
export const CRUSH_DAYS = 180;
export const RAISE_DAYS = 90;

/** How long a battle or an assault players stand in may take to be fought. */
const BATTLE_DAYS = 6;
const TAKE_DAYS = 20;

// ---------------------------------------------------------------- the state

/** The course, made when first needed (an old save gets it the first time). */
export function course(g: ConquestGame): Course76 {
  const us = usOf(g.s);
  const r = (g.nation(us).r76 ??= { beats: {} });
  return (r.course ??= { turned: {} });
}

function courseNow(s: GameState): Course76 | undefined {
  return campaignOf(s)?.course;
}

/** Whether a beat has come (on its day or later), and not turned aside. */
export function came(s: GameState, key: string): boolean {
  const c = courseNow(s);
  if (key === "@peace") return c?.peace !== undefined;
  const r = campaignOf(s);
  if (r?.beats[key] === undefined) return false;
  if (c?.held?.[key] !== undefined) return false;
  if (c?.turned[key] !== undefined && c.late?.[key] === undefined) return false;
  return true;
}

/** Whether a beat came exactly as history had it (on its day, not turned). */
export function asHistory(s: GameState, key: string): boolean {
  const c = courseNow(s);
  return (
    campaignOf(s)?.beats[key] !== undefined &&
    c?.turned[key] === undefined &&
    c?.held?.[key] === undefined &&
    c?.pending?.[key] === undefined &&
    c?.late?.[key] === undefined
  );
}

/** The war's armies, by their tag ("main", "north"...): which tag an army has. */
function tagOf(s: GameState, id: number): string | undefined {
  const ids = campaignOf(s)?.armies ?? {};
  for (const [k, v] of Object.entries(ids)) if (v === id) return k;
  return undefined;
}

function armyOf(s: GameState, tag: string): Army | undefined {
  const id = campaignOf(s)?.armies?.[tag];
  return id === undefined ? undefined : s.armies.find((a) => a.id === id);
}

/** What the news calls each of the war's armies. */
function armyName(s: GameState, tag: string, owner: number): string {
  if (owner === usOf(s))
    return tag === "main" ? "the Continental Army" : "the northern army";
  if (tag === "confed") return "the warriors of the Western Confederacy";
  return (
    (
      {
        kingmain: "the King's main army",
        boston: "the King's army at Boston",
        north: "General Burgoyne's army",
        ny: "the New York garrison",
        newport: "the Newport garrison",
        jersey: "the Hessian posts in New Jersey",
        south: "the King's army in Georgia",
        carolina: "Lord Cornwallis's army",
        camden: "the post at Camden",
        virginia: "Lord Cornwallis's army",
      } as Record<string, string>
    )[tag] ?? "an army of the King's"
  );
}

/** The King's side: his crown's army and British America. */
function kingSide(s: GameState, n: number): boolean {
  return n === kingOf(s) || n === britainOf(s);
}

/** The American side: the United States and their allies at war with Britain. */
function usSide(s: GameState, n: number): boolean {
  const us = usOf(s);
  if (n === us) return true;
  const br = britainOf(s);
  return (
    s.treaties.some(
      (t) =>
        t.kind === "alliance" &&
        ((t.a === us && t.b === n) || (t.b === us && t.a === n)),
    ) &&
    br >= 0 &&
    atWar(s, n, br)
  );
}

/** Who commands an army, for the news. */
function leader(s: GameState, a: Army): string {
  const c = s.chars[a.commander];
  return c ? charName(c) : "a player";
}

// ---------------------------------------------------------------- the news

function news(g: ConquestGame, text: string, at?: number): void {
  const s = g.s;
  g.event({
    k: "news",
    day: s.day,
    n: usOf(s),
    text,
    ...(at !== undefined && at >= 0 ? { p: at } : {}),
  });
  if (at !== undefined && at >= 0) rumour(g, at, text, -1, undefined, false);
}

/** A beat turned aside: recorded, and (unless it follows from a turn already told) in the news. */
export function turn(
  g: ConquestGame,
  key: string,
  why: string,
  quiet = false,
  at?: number,
): void {
  const c = course(g);
  if (c.turned[key]) return;
  c.turned[key] = { day: g.s.day, why, ...(quiet ? { quiet } : {}) };
  c.since ??= g.s.day;
  if (!quiet) news(g, `History turns. ${why}`, at);
}

/** A beat that waited (or was fought for), come now: what it does, and its news. */
function fireLate(g: ConquestGame, b: Beat, lead: string): void {
  const c = course(g);
  if (c.held) delete c.held[b.key];
  if (c.pending) delete c.pending[b.key];
  (c.late ??= {})[b.key] = g.s.day;
  b.fx?.(g);
  afterHistory(g, b);
  news(
    g,
    `${lead}${b.title}. ${b.text}`,
    b.at ? provNamed(g.map, b.at) : undefined,
  );
}

// ---------------------------------------------------------------- the plans

/** What a beat needs from history and the world. */
export interface Plan {
  /** Beats that must have come first ("@peace": the peace). */
  after?: string[];
  /** Tell the news when it yields for want of those (else it follows quietly from a turn already told). */
  loud?: string;
  /** Facts the world must still have: a reason (told), { quiet } (not told) or null. */
  facts?: (g: ConquestGame) => string | { quiet: string } | null;
  /** Wait for what it needs rather than yield, and come when it can. */
  wait?: boolean;
  /** A town the King's army (this tag) takes: fought for, when a player's army holds it. */
  take?: { at: string; tag: string };
  /** A division in Congress decides it. */
  vote?: VoteSpec;
  /** The war must be on (the rising neither won nor put down). */
  war?: boolean;
  /** The United States' own (nothing of it if the rising was put down). */
  us?: boolean;
}

/** A division in Congress. */
export interface VoteSpec {
  /** What the house divides on ("independence"). */
  motion: string;
  /** The day its debate opens (players in the house are asked from then). */
  debate: [number, number, number];
  /** The share of the computer's members who vote against, as their counterparts did. */
  dissent: number;
  /** Lost, it's put again after this many days (0: never). */
  revote: number;
  /** What aye and no mean, for the scene. */
  aye: string;
  no: string;
}

const P = (g: ConquestGame, name: string) => provNamed(g.map, name);

/** The King's army of this tag, alive, not a player's, with at least `min` regiments. */
function kingReady(g: ConquestGame, tag: string, min: number): string | null {
  const s = g.s;
  const a = armyOf(s, tag);
  const fate = courseNow(s)?.fates?.[tag];
  if (!a)
    return fate
      ? `${armyName(s, tag, kingOf(s)).replace(/^t/, "T")} is gone, beaten in the field`
      : `${armyName(s, tag, kingOf(s)).replace(/^t/, "T")} is gone`;
  if (playerLed(s, a)) return null;
  if (a.regs.length < min)
    return `${armyName(s, tag, kingOf(s)).replace(/^t/, "T")} is too weak after its losses`;
  return null;
}

/** A player's army (of the American side) standing in a town. */
function defended(g: ConquestGame, at: string): Army | undefined {
  const s = g.s;
  const p = P(g, at);
  return s.armies.find(
    (a) =>
      a.prov === p && playerLed(s, a) && usSide(s, a.owner) && !a.retreating,
  );
}

/** Whether a province is held by the King's side now. */
function kingHolds(g: ConquestGame, at: string): boolean {
  const pr = g.s.provinces[P(g, at)];
  const h = pr.occupier >= 0 ? pr.occupier : pr.owner;
  return kingSide(g.s, h);
}

const spainAtWar = (g: ConquestGame) => {
  const s = g.s;
  const sp = s.nations.findIndex((n) => n.key === "spain");
  return sp >= 0 && atWar(s, sp, britainOf(s))
    ? null
    : { quiet: "Spain isn't at war with Britain" };
};
const franceAtWar = (g: ConquestGame) => {
  const s = g.s;
  const fr = s.nations.findIndex((n) => n.key === "france");
  return fr >= 0 && atWar(s, fr, britainOf(s))
    ? null
    : { quiet: "France isn't at war with Britain" };
};

/** The war's beats (1776 to 1783): what each needs. */
const WAR_PLANS: Record<string, Plan> = {
  boston: {
    war: true,
    facts: (g) =>
      kingHolds(g, "Massachusetts Bay")
        ? null
        : { quiet: "Boston was freed already" },
  },
  canada: {
    war: true,
    facts: (g) =>
      defended(g, "Hochelaga")
        ? `${leader(g.s, defended(g, "Hochelaga")!)}'s army holds Montreal: the Americans don't leave Canada`
        : null,
  },
  "staten-island": { war: true },
  declaration: {
    us: true,
    vote: {
      motion: "independence",
      debate: [1776, 6, 7],
      dissent: 0.1,
      revote: 120,
      aye: "for independence",
      no: "against: not yet, or not ever",
    },
  },
  "long-island": { war: true, after: ["staten-island"] },
  "new-york": {
    war: true,
    take: { at: "New Amsterdam", tag: "kingmain" },
    facts: (g) => kingReady(g, "kingmain", 10),
  },
  "ny-fire": { after: ["new-york"] },
  hale: { after: ["new-york"] },
  valcour: { war: true },
  "fort-washington": { war: true, after: ["new-york"] },
  newport: {
    war: true,
    after: ["new-york"],
    facts: (g) => {
      const r = kingReady(g, "kingmain", 10);
      if (r) return r;
      for (const at of ["Narragansett", "Raritan"]) {
        const d = defended(g, at);
        if (d)
          return `${leader(g.s, d)}'s army stands at ${at}: the British posts there are never made`;
      }
      return null;
    },
  },
  trenton: { war: true, after: ["newport"] },
  princeton: { war: true, after: ["trenton"] },
  "congress-back": { us: true, after: ["newport"] },
  flag: { us: true },
  ticonderoga: {
    war: true,
    facts: (g) => {
      const s = g.s;
      const q = s.provinces[P(g, "Quebec")];
      if (q.owner !== britainOf(s) || q.occupier >= 0)
        return "Quebec isn't the King's: no army comes down Lake Champlain from Canada";
      const d = defended(g, "Adirondack");
      if (d)
        return `${leader(s, d)}'s army holds Ticonderoga, and General Burgoyne turns back`;
      return null;
    },
  },
  oriskany: { war: true, after: ["ticonderoga"] },
  bennington: { war: true, after: ["ticonderoga"] },
  brandywine: {
    war: true,
    after: ["new-york"],
    facts: (g) => kingReady(g, "kingmain", 10),
  },
  philadelphia: {
    war: true,
    take: { at: "Fort Christina", tag: "kingmain" },
    facts: (g) => kingReady(g, "kingmain", 10),
  },
  germantown: { war: true, after: ["philadelphia"] },
  saratoga: {
    war: true,
    after: ["ticonderoga"],
    facts: (g) =>
      armyOf(g.s, "north")
        ? null
        : { quiet: "General Burgoyne's army is gone already" },
  },
  articles: { us: true },
  "valley-forge": { war: true, after: ["philadelphia"] },
  alliance: {
    war: true,
    wait: true,
    facts: (g) => {
      const s = g.s;
      const c = courseNow(s);
      if (!came(s, "declaration"))
        return "Congress hasn't declared independence: France won't treat with the King's own subjects";
      if (!came(s, "saratoga") && c?.victory === undefined)
        return "France waits for an American victory before it will commit";
      return null;
    },
  },
  drill: { war: true, after: ["valley-forge"] },
  "philadelphia-left": {
    war: true,
    after: ["philadelphia", "alliance"],
    loud: "With no French fleet to fear, the British stay in Philadelphia",
  },
  monmouth: { war: true, after: ["philadelphia-left"] },
  wyoming: { war: true },
  kaskaskia: { war: true },
  dominica: { war: true, after: ["alliance"], facts: franceAtWar },
  "st-lucia": { war: true, after: ["alliance"], facts: franceAtWar },
  savannah: {
    war: true,
    facts: (g) => {
      const r = kingReady(g, "kingmain", 8);
      if (r) return r;
      const d = defended(g, "Guale");
      return d
        ? `${leader(g.s, d)}'s army holds Savannah, and the expedition from New York turns back`
        : null;
    },
  },
  vincennes: { war: true },
  spain: { war: true, after: ["alliance"] },
  grenada: { war: true, after: ["alliance"], facts: franceAtWar },
  sullivan: { war: true },
  "baton-rouge": { war: true, facts: spainAtWar },
  flamborough: { war: true },
  "newport-left": { war: true, after: ["newport"] },
  mobile: { war: true, facts: spainAtWar },
  charleston: {
    war: true,
    take: { at: "Charles Town", tag: "carolina" },
    facts: (g) => kingReady(g, "kingmain", 8),
  },
  camden: { war: true, after: ["charleston"] },
  arnold: { war: true },
  "kings-mountain": { war: true, after: ["charleston"] },
  dutch: { war: true },
  cowpens: { war: true, after: ["charleston"] },
  "st-eustatius": { war: true },
  confederation: { us: true },
  guilford: { war: true, after: ["charleston"] },
  pensacola: { war: true, facts: spainAtWar },
  "camden-left": { war: true, after: ["camden"] },
  tobago: { war: true, after: ["alliance"], facts: franceAtWar },
  "yorktown-fortified": {
    war: true,
    after: ["charleston"],
    take: { at: "Jamestown", tag: "virginia" },
    facts: (g) => kingReady(g, "carolina", 4),
  },
  "march-south": { war: true, after: ["alliance", "yorktown-fortified"] },
  capes: {
    war: true,
    after: ["yorktown-fortified", "alliance"],
    loud: "No French fleet comes to the Virginia Capes, and Lord Cornwallis is not trapped",
  },
  yorktown: { war: true, after: ["capes"] },
  "st-kitts": { war: true, after: ["alliance"], facts: franceAtWar },
  saintes: { war: true, after: ["alliance"] },
  "savannah-left": { war: true, after: ["savannah", "yorktown"] },
  preliminaries: {
    war: true,
    facts: (g) =>
      (courseNow(g.s)?.weary ?? 0) >= PEACE_AT
        ? null
        : "No peace in sight: without a defeat like Yorktown, London fights on",
  },
  "charleston-left": { war: true, after: ["charleston", "preliminaries"] },
  ceasefire: { war: true, after: ["preliminaries"] },
  mutiny: { us: true, after: ["preliminaries"] },
  treaty: { war: true, after: ["preliminaries"] },
  evacuation: { after: ["treaty", "new-york"] },
  resignation: { us: true, wait: true, after: ["@peace"] },
};

/** Every beat's plan: the war's, and the years after it (Campaign1776Later.ts adds its own). */
export const PLANS: Record<string, Plan> = { ...WAR_PLANS };

/** The years after the peace add their plans here. */
export function addPlans(plans: Record<string, Plan>): void {
  Object.assign(PLANS, plans);
}

/** Why a beat can't come as history had it now (null: it can). */
function blocker(
  g: ConquestGame,
  key: string,
  plan: Plan,
): { why: string; quiet: boolean } | null {
  const s = g.s;
  const c = course(g);
  if (plan.us && c.crushed !== undefined)
    return { why: "The rising was put down", quiet: true };
  if (plan.war && (c.peace !== undefined || c.crushed !== undefined))
    return { why: "The war is over", quiet: true };
  if (plan.war && !s.nations[usOf(s)]?.rebelling)
    return { why: "The war is over", quiet: true };
  for (const k of plan.after ?? [])
    if (!came(s, k))
      return {
        why: plan.loud ?? c.turned[k]?.why ?? `${k} hasn't come`,
        quiet: !plan.loud,
      };
  const f = plan.facts?.(g);
  if (f)
    return typeof f === "string"
      ? { why: f, quiet: false }
      : { why: f.quiet, quiet: true };
  return null;
}

// ---------------------------------------------------------------- the gate

R76_GATES.push((g, b0) => {
  const s = g.s;
  const b = b0 as Beat;
  const plan = PLANS[b.key];
  const c = course(g);
  if (!plan) {
    afterHistory(g, b);
    return false;
  }
  const blocked = blocker(g, b.key, plan);
  if (blocked) {
    if (plan.wait) {
      (c.held ??= {})[b.key] = s.day;
      if (!blocked.quiet)
        turn(g, `${b.key}`, blocked.why, false, b.at ? P(g, b.at) : undefined);
      return true;
    }
    turn(g, b.key, blocked.why, blocked.quiet, b.at ? P(g, b.at) : undefined);
    return true;
  }
  // A vote in Congress decides it.
  if (plan.vote) {
    const v = divide(g, b.key, plan.vote);
    if (!v.carried) {
      turn(
        g,
        b.key,
        `Congress divides on ${plan.vote.motion}, ${v.ayes} to ${v.noes}, and the motion is lost.`,
        false,
        b.at ? P(g, b.at) : undefined,
      );
      if (plan.vote.revote > 0)
        (c.revote ??= {})[b.key] = s.day + plan.vote.revote;
      return true;
    }
    news(
      g,
      `Congress divides on ${plan.vote.motion}: ${v.ayes} for, ${v.noes} against. Carried.`,
    );
  }
  // A battle where players stand: fought for real.
  if (b.battle) {
    const p = P(g, b.battle.at);
    const main = mainArmy(s);
    const theirs = s.armies.filter(
      (a) =>
        playerLed(s, a) && (a.prov === p || (b.battle!.main && a === main)),
    );
    if (theirs.length) {
      if (b.battle.main && main && playerLed(s, main) && main.prov !== p) {
        turn(
          g,
          b.key,
          `${b.title}: the Continental Army, under ${leader(s, main)}, isn't there, and the battle history had is never fought.`,
          false,
          p,
        );
        return true;
      }
      const foe = b.battle.king ? armyOf(s, b.battle.king) : undefined;
      if (foe && !playerLed(s, foe) && b.battle.king)
        kingArmy(g, b.battle.king, b.battle.at, 0);
      (c.pending ??= {})[b.key] = {
        p,
        until: s.day + BATTLE_DAYS,
        kind: "battle",
      };
      news(
        g,
        `${b.title}: the armies meet at ${g.map.provinces[p].name}, and ${theirs.map((a) => leader(s, a)).join(" and ")} ${theirs.length > 1 ? "are" : "is"} in the field. How it goes is anyone's guess.`,
        p,
      );
      return true;
    }
  }
  // A town the King's army takes: fought for, when a player's army holds it.
  if (plan.take) {
    const d = defended(g, plan.take.at);
    const a = armyOf(s, plan.take.tag);
    if (d && a && !playerLed(s, a)) {
      kingArmy(g, plan.take.tag, plan.take.at, 0);
      (c.pending ??= {})[b.key] = {
        p: P(g, plan.take.at),
        until: s.day + TAKE_DAYS,
        kind: "take",
        tag: plan.take.tag,
      };
      news(
        g,
        `${b.title}: ${armyName(s, plan.take.tag, kingOf(s))} moves on ${plan.take.at}, and finds ${leader(s, d)}'s army there to meet it.`,
        P(g, plan.take.at),
      );
      return true;
    }
  }
  beforeHistory(g, b);
  afterHistory(g, b);
  return false;
});

/** What a beat that comes as history did means for the course, before its own work. */
function beforeHistory(g: ConquestGame, b: Beat): void {
  const s = g.s;
  const c = course(g);
  if (b.key === "treaty") {
    c.peace = s.day;
    c.holds = loyalHolds(g);
  }
}

/** And after it: Britain's will, France's war, the peace's loose ends. */
function afterHistory(g: ConquestGame, b: Beat): void {
  const s = g.s;
  const c = course(g);
  if (b.key === "saratoga") {
    c.weary = (c.weary ?? 0) + WEARY.saratoga;
    c.victory ??= s.day;
  }
  if (b.key === "yorktown") c.weary = (c.weary ?? 0) + WEARY.yorktown;
  if (b.key === "alliance") {
    const france = Math.max(dayOf(1778, 5, 1), s.day + 115);
    c.europe = { ...(c.europe ?? {}), france, spain: france + 395 };
  }
}

// ---------------------------------------------------------------- votes in Congress

const VOTE_KEYS = () => Object.keys(PLANS).filter((k) => PLANS[k].vote);

/** The vote scenes' keys, by their index (the scene carries the index). */
export function voteKey(i: number): string | undefined {
  return VOTE_KEYS()[i];
}

export function voteIndex(key: string): number {
  return VOTE_KEYS().indexOf(key);
}

/** The house divides: the computer's members as their counterparts did, players for themselves. */
export function division(
  s: GameState,
  key: string,
  spec: VoteSpec,
): { ayes: number; noes: number; abstain: number; carried: boolean } {
  const us = usOf(s);
  const ballots = courseNow(s)?.ballots?.[key] ?? {};
  let ayes = 0;
  let noes = 0;
  let abstain = 0;
  let computer = 0;
  for (const c of s.polities[us]?.assembly ?? []) {
    if (!s.chars[c]?.alive) continue;
    const life = lifeOfChar(s, c);
    if (life) {
      const v = ballots[life.seat] ?? 0;
      if (v > 0) ayes++;
      else if (v < 0) noes++;
      else abstain++;
      continue;
    }
    computer++;
  }
  // The computer's members are steered to divide as history's did: the
  // dissent its counterparts showed, never enough to carry it alone.
  const against = Math.floor(spec.dissent * computer);
  noes += against;
  ayes += computer - against;
  // Nobody against (an empty house, or players keeping their seats): carried.
  return { ayes, noes, abstain, carried: noes === 0 || ayes > noes };
}

function divide(g: ConquestGame, key: string, spec: VoteSpec) {
  const s = g.s;
  const v = division(s, key, spec);
  const c = course(g);
  (c.votes ??= {})[key] = {
    day: s.day,
    ayes: v.ayes,
    noes: v.noes,
    carried: v.carried,
  };
  if (c.ballots) delete c.ballots[key];
  return v;
}

/** A player in the house casts their vote (the scene). */
export function castVote(
  g: ConquestGame,
  seat: string,
  key: string,
  vote: number,
): void {
  const c = course(g);
  ((c.ballots ??= {})[key] ??= {})[seat] = Math.sign(vote);
}

/** Players sitting in Congress are asked to vote, from the debate's opening to the division. */
function askVotes(g: ConquestGame): void {
  const s = g.s;
  const c = course(g);
  const us = usOf(s);
  const members = s.polities[us]?.assembly ?? [];
  for (const key of VOTE_KEYS()) {
    const spec = PLANS[key].vote!;
    const b = BEATS.find((x) => x.key === key);
    if (!b) continue;
    const due = c.revote?.[key] ?? beatDay(b);
    const opens =
      c.revote?.[key] !== undefined
        ? due - 30
        : dayOf(spec.debate[0], spec.debate[1] - 1, spec.debate[2]);
    if (s.day < opens || s.day >= due) continue;
    if (c.votes?.[key]?.carried) continue;
    if (s.day !== opens && dateOf(s.day).day !== 1) continue;
    for (const m of members) {
      const life = lifeOfChar(s, m);
      if (!life || life.watching) continue;
      if (c.ballots?.[key]?.[life.seat] !== undefined) continue;
      if (life.events.some((e) => e.key === "r76-vote")) continue;
      raiseEvent(g, life, "r76-vote", { v: voteIndex(key), due });
    }
  }
}

// ---------------------------------------------------------------- what players do in the field

hooks.battle.push((g, r, attackers, defenders) => {
  const s = g.s;
  if (!isCampaign(s)) return;
  const all = [...attackers, ...defenders];
  if (!all.some((a) => playerLed(s, a))) return;
  const c = course(g);
  const winners = r.winner === 0 ? attackers : defenders;
  const losers = r.winner === 0 ? defenders : attackers;
  const usWon = winners.some((a) => usSide(s, a.owner));
  // A battle a beat brought, fought for real.
  for (const [key, pd] of Object.entries(c.pending ?? {}))
    if (pd.kind === "battle" && pd.p === r.prov)
      (c.fought ??= {})[key] = usWon ? "us" : "them";
  // The war's armies beaten or lost.
  const at = g.map.provinces[r.prov]?.name ?? "the field";
  const by = winners.filter((a) => playerLed(s, a)).map((a) => leader(s, a));
  for (const a of losers) {
    const tag = tagOf(s, a.id);
    if (!tag) continue;
    const gone = !s.armies.includes(a);
    const was = (c.fates ??= {})[tag];
    if (was?.how === "destroyed") continue;
    c.fates[tag] = { day: s.day, how: gone ? "destroyed" : "beaten" };
    const name = armyName(s, tag, a.owner);
    const winnerWords = by.length
      ? `an army under ${by.join(" and ")}`
      : "its enemies";
    turn(
      g,
      `field:${tag}:${s.day}`,
      `At ${at}, ${winnerWords} ${gone ? "destroys" : "beats"} ${name}.`,
      false,
      r.prov,
    );
    if (kingSide(s, a.owner)) {
      const w = gone
        ? tag === "kingmain"
          ? WEARY.mainDestroyed
          : WEARY.destroyed
        : was
          ? 0
          : WEARY.beaten;
      c.weary = (c.weary ?? 0) + w;
      c.wearyBy = (c.wearyBy ?? 0) + w;
      if (gone || a.regs.length >= 8) c.victory ??= s.day;
    }
    if (a.owner === usOf(s) && tag === "main" && gone) c.armyLost = s.day;
  }
});

hooks.gameEvent.push((g, e) => {
  const s = g.s;
  if (!isCampaign(s) || (e.k !== "occupied" && e.k !== "freed")) return;
  if (!s.nations[usOf(s)]?.rebelling) return;
  const p = e.p;
  const theirs = s.armies.filter(
    (a) => a.prov === p && playerLed(s, a) && !a.retreating,
  );
  if (!theirs.length) return;
  const pr = s.provinces[p];
  if (!kingSide(s, pr.owner) && pr.owner !== usOf(s)) return;
  const holder = pr.occupier >= 0 ? pr.occupier : pr.owner;
  const c = course(g);
  const by = theirs.map((a) => leader(s, a)).join(" and ");
  (c.towns ??= {})[p] = { day: s.day, holder, by };
  const name = g.map.provinces[p].name;
  turn(
    g,
    `town:${p}:${s.day}`,
    e.k === "freed"
      ? `${by}'s army frees ${name}.`
      : `${by}'s army takes ${name} for ${s.nations[holder]?.name ?? "its side"}.`,
    false,
    p,
  );
});

// ---------------------------------------------------------------- each day

hooks.daily.push((g) => {
  const s = g.s;
  if (!isCampaign(s) || !campaignOf(s)) return;
  const c = course(g);
  // Battles and assaults players stood in, decided.
  for (const [key, pd] of Object.entries(c.pending ?? {})) {
    const b = BEATS.find((x) => x.key === key);
    if (!b) continue;
    if (pd.kind === "battle") {
      const won = c.fought?.[key];
      if (won === undefined && s.day < pd.until) continue;
      const history = b.battle?.us ?? "lost";
      if (won === undefined) {
        delete c.pending![key];
        turn(
          g,
          key,
          `${b.title}: no battle is fought at ${g.map.provinces[pd.p].name} after all.`,
          false,
          pd.p,
        );
      } else if (history === "drawn" || (history === "won") === (won === "us"))
        fireLate(g, b, "");
      else {
        delete c.pending![key];
        turn(
          g,
          key,
          `${b.title}: the battle at ${g.map.provinces[pd.p].name} goes the other way: ${won === "us" ? "the Americans carry the day" : "the King's army carries the day"}.`,
          false,
          pd.p,
        );
      }
    } else {
      const a = pd.tag ? armyOf(s, pd.tag) : undefined;
      const foes = s.armies.filter(
        (x) => x.prov === pd.p && usSide(s, x.owner) && !x.retreating,
      );
      if (a && a.prov === pd.p && !foes.length && a.depart < 0)
        fireLate(g, b, "After a fight: ");
      else if (!a || a.prov !== pd.p || s.day >= pd.until) {
        delete c.pending![key];
        turn(
          g,
          key,
          `${b.title}: ${g.map.provinces[pd.p].name} holds out, and the King's army falls back.`,
          false,
          pd.p,
        );
      }
    }
  }
  // Beats that waited, come when they can.
  for (const key of Object.keys(c.held ?? {})) {
    const b = BEATS.find((x) => x.key === key);
    const plan = PLANS[key];
    if (!b || !plan) continue;
    const blocked = blocker(g, key, { ...plan, wait: false });
    if (blocked) {
      if (
        blocked.quiet &&
        (plan.us || plan.war) &&
        blocked.why.startsWith("The ")
      ) {
        // The rising put down or the war over: it never comes.
        delete c.held![key];
        c.turned[key] ??= { day: s.day, why: blocked.why, quiet: true };
      }
      continue;
    }
    fireLate(g, b, "Later than history had it: ");
  }
  // Divisions lost, put again.
  for (const [key, day] of Object.entries(c.revote ?? {})) {
    if (day > s.day) continue;
    const b = BEATS.find((x) => x.key === key);
    const spec = PLANS[key]?.vote;
    if (!b || !spec) continue;
    const v = divide(g, key, spec);
    if (v.carried) {
      delete c.revote![key];
      news(
        g,
        `Congress divides again on ${spec.motion}: ${v.ayes} for, ${v.noes} against. Carried.`,
      );
      fireLate(g, b, "Later than history had it: ");
    } else {
      c.revote![key] = s.day + spec.revote;
      news(
        g,
        `Congress divides again on ${spec.motion}: ${v.ayes} for, ${v.noes} against. Lost again.`,
      );
    }
  }
  askVotes(g);
  // The peace's loose ends: towns held for the King by players stay British.
  if (c.holds?.length) {
    const br = britainOf(s);
    for (const p of c.holds)
      if (br >= 0 && s.provinces[p].owner !== br) {
        cede(g, p, br);
        news(
          g,
          `History turns. ${g.map.provinces[p].name}, held for the King when the peace came, stays British.`,
          p,
        );
      }
    c.holds = [];
  }
  warOnOrOver(g);
});

/** Towns held for the King by players' armies (they stay British at the peace). */
function loyalHolds(g: ConquestGame): number[] {
  const s = g.s;
  const us = usOf(s);
  const out: number[] = [];
  for (let p = 0; p < s.provinces.length; p++) {
    const pr = s.provinces[p];
    if (pr.owner !== us || !kingSide(s, pr.occupier)) continue;
    if (
      s.armies.some(
        (a) => a.prov === p && playerLed(s, a) && kingSide(s, a.owner),
      )
    )
      out.push(p);
  }
  return out;
}

/** The war goes on past history's peace, comes to a peace sooner, or is lost. */
function warOnOrOver(g: ConquestGame): void {
  const s = g.s;
  const c = course(g);
  const us = usOf(s);
  const nation = s.nations[us];
  if (!nation?.rebelling || c.peace !== undefined || c.crushed !== undefined)
    return;
  const date = dateOf(s.day);
  // Each new year past history's peace spends more of Britain's will.
  if (
    date.month === 0 &&
    date.day === 1 &&
    c.turned.treaty !== undefined &&
    date.year >= 1784
  )
    c.weary = (c.weary ?? 0) + WEARY.year;
  // An early peace, won by players' victories; or a late one, the war dragging on.
  if (c.peaceDue === undefined) {
    if (
      (c.wearyBy ?? 0) >= PEACE_AT &&
      campaignOf(s)?.beats.treaty === undefined
    ) {
      c.peaceDue = s.day + 180;
      news(
        g,
        "History turns. Its armies beaten in America, the King's government falls, and London sends to Paris to talk of peace.",
      );
    } else if (c.turned.treaty !== undefined && (c.weary ?? 0) >= PEACE_AT) {
      c.peaceDue = s.day + 120;
      news(
        g,
        "History turns. Worn out by a war it can't end, Britain sends to Paris to talk of peace at last.",
      );
    }
  } else if (s.day >= c.peaceDue) {
    peaceOtherwise(g);
    return;
  }
  // The Continental Army lost: Congress raises another, unless its seat is held.
  const cap = s.provinces[nation.capital];
  const capHeld = cap ? kingSide(s, cap.occupier) : false;
  if (capHeld) c.capLost ??= s.day;
  else delete c.capLost;
  if (c.armyLost !== undefined && !mainArmy(s)) {
    if (c.capLost !== undefined && s.day - c.capLost >= CRUSH_DAYS) {
      c.crushed = s.day;
      rebellionCrushed(g, us);
      news(
        g,
        "History turns. With the Continental Army gone and Congress's seat in the King's hands half a year, the rising is put down. The colonies are the King's again.",
      );
      return;
    }
    if (!capHeld && s.day - c.armyLost >= RAISE_DAYS) raiseArmy(g);
  }
}

/** Congress raises a new Continental Army at its seat. */
function raiseArmy(g: ConquestGame): void {
  const s = g.s;
  const us = usOf(s);
  const at = s.nations[us].capital;
  const regs = [
    ...Array.from({ length: 5 }, () => ({
      type: "regulars" as const,
      men: 100,
      morale: 0.7,
      home: -1,
    })),
    ...Array.from({ length: 2 }, () => ({
      type: "militia" as const,
      men: REGIMENTS.militia.men,
      morale: 0.7,
      home: -1,
    })),
  ];
  const a = g.addArmy({
    id: g.nextId(),
    owner: us,
    prov: at,
    regs,
    path: [],
    depart: -1,
    arrive: -1,
    sea: false,
    retreating: false,
    arrived: s.day,
    from: -1,
    commander: -1,
    supply: 1,
  });
  g.nation(us).r76!.armies = {
    ...(g.nation(us).r76!.armies ?? {}),
    main: a.id,
  };
  delete course(g).armyLost;
  news(
    g,
    `Congress raises a new Continental Army at ${g.map.provinces[at].name}.`,
    at,
  );
}

/** The peace, when it comes otherwise than in 1783: the treaty's terms, as the war left things. */
function peaceOtherwise(g: ConquestGame): void {
  const s = g.s;
  const c = course(g);
  const holds = loyalHolds(g);
  c.peace = s.day;
  delete c.peaceDue;
  (campaignOf(s)!.beats as Record<string, number>).treaty ??= s.day;
  treatyOfParis(g);
  c.holds = holds;
  news(
    g,
    `The peace, otherwise than history had it. At Paris, Britain recognises the independence of the United States (${formatDate(s.day)}). The Floridas go to Spain, the west to the Mississippi to the Americans, and the war is over.`,
  );
  for (const life of s.lives) {
    const me = meOf(s, life);
    if (me?.nation === usOf(s))
      journal(g, life, "The war is over: Britain has made peace.", "good");
  }
}

// ---------------------------------------------------------------- an old save

/** The campaign runs to the end of 1800 (1 January 1801). */
export const CAMPAIGN_END = 1801;

/**
 * A save of the campaign as it was (to 1784) carries on to 1800: its end
 * moved, what lasted to its end lasting to the new one, and its course
 * made from what history did in it (Game.ts calls this on every load).
 */
export function extendCampaign(s: GameState): void {
  if (!isCampaign(s) || s.settings.endYear >= CAMPAIGN_END) return;
  const oldEnd = s.endDay;
  s.settings.endYear = CAMPAIGN_END;
  s.endDay = dayOf(CAMPAIGN_END);
  for (const n of s.nations)
    for (const m of n.mods) if (m.until >= oldEnd) m.until = s.endDay + 1;
  const r = s.nations[usOf(s)]?.r76;
  if (!r) return;
  const c = (r.course ??= { turned: {} });
  if (r.beats.alliance !== undefined)
    c.europe ??= { france: dayOf(1778, 5, 1), spain: dayOf(1779, 6, 1) };
  if (r.beats.saratoga !== undefined)
    c.weary ??=
      WEARY.saratoga + (r.beats.yorktown !== undefined ? WEARY.yorktown : 0);
  if (r.beats.treaty !== undefined) c.peace ??= r.beats.treaty;
  // The King's main army, which the old campaign never really made (its
  // tag was the Continental Army's): where the war had it now.
  const ids = (r.armies ??= {});
  if (
    r.beats["staten-island"] !== undefined &&
    r.beats.treaty === undefined &&
    ids.kingmain === undefined
  ) {
    const king = kingOf(s);
    const name =
      r.beats.philadelphia !== undefined &&
      r.beats["philadelphia-left"] === undefined
        ? "Fort Christina"
        : r.beats["new-york"] !== undefined
          ? "New Amsterdam"
          : "Paumanok";
    pendingKingMain.set(s, { king, at: name });
  }
}

/** Old saves' King's main army, made once the game has its map (Game.ts's constructor). */
const pendingKingMain = new WeakMap<GameState, { king: number; at: string }>();

/** Make the King's main army an old save was missing (after `extendCampaign`). */
export function mendOldCampaign(g: ConquestGame): void {
  const want = pendingKingMain.get(g.s);
  if (!want) return;
  pendingKingMain.delete(g.s);
  if (want.king < 0) return;
  kingArmy(g, "kingmain", want.at, 20, 3);
}

// ---------------------------------------------------------------- measuring it

/** History's marks: what a game left to itself should show on each date. */
export interface HistoryMark {
  label: string;
  on: [number, number, number];
  check: (g: ConquestGame) => boolean;
}

const holds = (g: ConquestGame, at: string, who: "king" | "us") => {
  const s = g.s;
  const pr = s.provinces[P(g, at)];
  const h = pr.occupier >= 0 ? pr.occupier : pr.owner;
  return who === "king" ? kingSide(s, h) : h === usOf(s);
};

export const HISTORY_MARKS: HistoryMark[] = [
  {
    label: "Boston evacuated",
    on: [1776, 3, 18],
    check: (g) => holds(g, "Massachusetts Bay", "us"),
  },
  {
    label: "The United States declared",
    on: [1776, 7, 5],
    check: (g) => g.s.nations[usOf(g.s)].name === "the United States",
  },
  {
    label: "New York taken",
    on: [1776, 9, 16],
    check: (g) => holds(g, "New Amsterdam", "king"),
  },
  {
    label: "Philadelphia taken",
    on: [1777, 9, 27],
    check: (g) => holds(g, "Fort Christina", "king"),
  },
  {
    label: "Saratoga",
    on: [1777, 10, 18],
    check: (g) => asHistory(g.s, "saratoga") && !armyOf(g.s, "north"),
  },
  {
    label: "The French alliance",
    on: [1778, 2, 7],
    check: (g) => asHistory(g.s, "alliance"),
  },
  {
    label: "Philadelphia given up",
    on: [1778, 6, 19],
    check: (g) => holds(g, "Fort Christina", "us"),
  },
  {
    label: "France at war with Britain",
    on: [1778, 6, 2],
    check: (g) => !franceAtWar(g),
  },
  {
    label: "Charleston taken",
    on: [1780, 5, 13],
    check: (g) => holds(g, "Charles Town", "king"),
  },
  {
    label: "Yorktown",
    on: [1781, 10, 20],
    check: (g) => asHistory(g.s, "yorktown") && holds(g, "Jamestown", "us"),
  },
  {
    label: "The Treaty of Paris",
    on: [1783, 9, 4],
    check: (g) =>
      !!g.s.nations[usOf(g.s)].independent && asHistory(g.s, "treaty"),
  },
  {
    label: "New York given up",
    on: [1783, 11, 26],
    check: (g) => holds(g, "New Amsterdam", "us"),
  },
  {
    label: "The Constitution ratified",
    on: [1788, 6, 22],
    check: (g) => asHistory(g.s, "ratification"),
  },
  {
    label: "Washington inaugurated",
    on: [1789, 5, 1],
    check: (g) => asHistory(g.s, "inauguration"),
  },
  {
    label: "Congress at Philadelphia",
    on: [1790, 12, 7],
    check: (g) => g.s.nations[usOf(g.s)].capital === P(g, "Fort Christina"),
  },
  {
    label: "St. Clair's defeat",
    on: [1791, 11, 5],
    check: (g) => asHistory(g.s, "st-clair"),
  },
  {
    label: "Fallen Timbers",
    on: [1794, 8, 21],
    check: (g) => asHistory(g.s, "fallen-timbers"),
  },
  {
    label: "The Treaty of Greenville",
    on: [1795, 8, 4],
    check: (g) => asHistory(g.s, "greenville") && holds(g, "Scioto", "us"),
  },
  {
    label: "Détroit handed over",
    on: [1796, 7, 12],
    check: (g) => holds(g, "Détroit", "us"),
  },
  {
    label: "Natchez handed over",
    on: [1798, 3, 31],
    check: (g) => holds(g, "Natchez", "us"),
  },
  {
    label: "Congress at Washington",
    on: [1800, 11, 18],
    check: (g) => g.s.nations[usOf(g.s)].capital === P(g, "Piscataway"),
  },
  {
    label: "No turn of history",
    on: [1800, 12, 31],
    check: (g) => Object.keys(course(g).turned).length === 0,
  },
];

/** The marks a game has hit and missed so far (checked on their days by `trackHistory`). */
export function markDays(): { mark: HistoryMark; day: number }[] {
  return HISTORY_MARKS.map((mark) => ({
    mark,
    day: dayOf(mark.on[0], mark.on[1] - 1, mark.on[2]),
  }));
}

/** For the war's page: where history turned, newest first (`all`: with what followed quietly). */
export function turns(
  s: GameState,
  all = true,
): { key: string; day: number; why: string; quiet: boolean }[] {
  const c = courseNow(s);
  return Object.entries(c?.turned ?? {})
    .filter(([, t]) => all || !t.quiet)
    .map(([key, t]) => ({ key, day: t.day, why: t.why, quiet: !!t.quiet }))
    .sort((a, b) => b.day - a.day);
}

/** For the scene: what a division is on, and how it stands. */
export function voteView(
  s: GameState,
  key: string,
): { spec: VoteSpec; due: number; beat: Beat } | undefined {
  const spec = PLANS[key]?.vote;
  const beat = BEATS.find((b) => b.key === key);
  if (!spec || !beat) return undefined;
  return { spec, beat, due: courseNow(s)?.revote?.[key] ?? beatDay(beat) };
}
