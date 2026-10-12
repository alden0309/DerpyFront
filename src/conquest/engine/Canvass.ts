// POLLS (r16): elections that can be lost.
//
// A candidate's standing at a poll is made of lines anyone can read: a name
// (renown counts, but lightly and only so far), address, the canvass, the
// treating, the county's regard, party, the governor's interest, the sheriff
// who runs the poll, a patron's interest, and the rest. The computer's
// candidates are made of the same lines: they canvass as the poll nears,
// treat with their own money, and many have a great man's interest behind
// them. Money can be laid out (treating, the sheriff's goodwill, a patron's
// price), and each says on its button what it costs and what it does to the
// canvass. Week by week the canvass is written down, so the office pages
// can show it move; the count says why it went the way it did.
//
// Polls with no player in them are counted as they always were.

import { memberFaction } from "./Assembly";
import { formatDate, pollDay } from "./Calendar";
import { makeCharacter } from "./Characters";
import { householdsOf } from "./Folk";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { withFlow } from "./LedgerCore";
import { journal, remembers, spend, touchLife } from "./LifeCore";
import {
  isPlayed,
  lifeOfChar,
  meOf,
  opinionOf,
  skillLevel,
  stationOf,
} from "./LifeQueries";
import { ROLES } from "./LifeRules";
import type { World } from "./Map";
import { OFFICES, officeTitle } from "./Offices";
import { holdsPost } from "./OneOffice";
import { swayOf } from "./PowerCore";
import { ageOf, charName, settlers, stat } from "./Queries";
import { Rng } from "./Rng";
import { hash01, officesIn } from "./SocietyCore";
import type {
  Canvass,
  Character,
  GameState,
  Life,
  LifeCommand,
  LocalOffice,
  PollLine,
  PollResult,
  PollsCommand,
} from "./Types";

// ---------------------------------------------------------------- the table

/** Every weight a poll is counted by: the count and the pages read these. */
export const POLL = {
  /** Your name on the list. */
  base: 5,
  /** Renown counts this much a point, and no more than `renownCap` in all. */
  renownPer: 0.12,
  renownCap: 10,
  /** Persuasion, a point for each two levels, up to `persuasionCap`. */
  persuasionPer: 0.5,
  persuasionCap: 8,
  /** The computer's people's address: their diplomacy × this. */
  addressPer: 0.8,
  /** Canvassing: `cap` × points ÷ (points + `half`); points fade a tenth a week. */
  canvassCap: 14,
  canvassHalf: 20,
  canvassFade: 0.9,
  /** Treating: the same, from what treating has bought; fades 1 in 20 a week. */
  treatCap: 8,
  treatHalf: 12,
  treatFade: 0.95,
  /** What one treating buys (in treating's points). */
  treatPoints: 6,
  /** The county's regard: its people's opinion of you ÷ 4, up to ±12. */
  regardDiv: 4,
  regardCap: 12,
  /** Your party and the county's lean: up to this, by how far it leans (± either way). */
  party: 5,
  /** The governor's friends: for a court man he likes, against the opposition. */
  govFor: 6,
  govAgainst: 8,
  /** The governor's friends for a computer candidate of the court party. */
  govNpc: 3,
  /** The sheriff runs the poll: his opinion ÷ 10, up to ±3; his goodwill bought, 4. */
  sheriffLean: 3,
  sheriffBought: 4,
  /** A patron of your own in the colony, 4; a great man's interest bought, 8. */
  patronOwn: 4,
  patronBought: 8,
  freeholder: 3,
  sitting: 5,
  away: -10,
  scandal: -10,
  /** The papers count up to this much either way. */
  swayCap: 12,
  /** Talked about in the town (a rumour against them), each. */
  rumour: -10,
  /** Luck at the count: each side's ± this (whole numbers). */
  luck: 4,
  /** A householder of the county (the computer's people have the same). */
  householder: 4,
  /** Your station, this much a step (labouring folk 0 to the great 4). */
  stationPer: 1.5,
  /** The computer's candidates canvass for the last half-year before a poll. */
  npcWeeks: 26,
  /**
   * A challenger for the house, put up against a player by the other
   * interest: he canvasses hard (vigour from `challengerVigour`), his backers
   * pay for his treating (`challengerTreat` of its cap at the least), and a
   * great man of his party always stands behind him.
   */
  challengerVigour: 0.65,
  challengerTreat: 0.45,
};

/** What treating the voters costs in a county (more in a big town). */
export function treatCost(s: GameState, p: number): number {
  const pr = s.provinces[p];
  return 3 + Math.min(6, Math.round((pr ? settlers(pr) : 0) / 1500));
}

/** What the sheriff's goodwill costs: a present by his station. */
export function sheriffCost(s: GameState, sheriff: Character): number {
  const status = sheriff.role ? ROLES[sheriff.role].status : 3;
  return 4 + status * 2;
}

/** A great man's price for his interest. */
export function patronPrice(s: GameState, c: Character): number {
  const status = c.role ? ROLES[c.role].status : 4;
  return 6 + status * 4;
}

/** Diminishing returns on canvass and treating points. */
export const canvassValue = (pts: number) =>
  pts <= 0 ? 0 : (POLL.canvassCap * pts) / (pts + POLL.canvassHalf);
export const treatValue = (pts: number) =>
  pts <= 0 ? 0 : (POLL.treatCap * pts) / (pts + POLL.treatHalf);

const r1 = (x: number) => Math.round(x * 10) / 10;

// ---------------------------------------------------------------- which poll

/** A poll: a county office's, or the colony's house. */
export type PollRef =
  | { kind: "local"; o: LocalOffice }
  | { kind: "assembly"; n: number };

/** Weeks before a poll a sitting member's canvass begins (they stand again). */
const SITTING_WEEKS = 26;

/**
 * The poll a player is in: standing, or sitting with the count near. Standing
 * for two at once (a county office and the house), the one counted first.
 */
export function pollOf(s: GameState, life: Life): PollRef | null {
  const me = meOf(s, life);
  if (!me || life.watching) return null;
  const standing: PollRef[] = [];
  for (const list of Object.values(s.society?.offices ?? {}))
    for (const o of list)
      if (o.candidates.some((y) => y.c === life.c))
        standing.push({ kind: "local", o });
  if (life.campaign)
    standing.push({ kind: "assembly", n: life.campaign.nation });
  if (standing.length) return firstCounted(s, standing);
  const near = (day: number) =>
    pollDay(day) - s.day <= SITTING_WEEKS * 7 && pollDay(day) >= s.day;
  const sitting: PollRef[] = [];
  for (const list of Object.values(s.society?.offices ?? {}))
    for (const o of list)
      if (
        o.holder === me.id &&
        OFFICES[o.key].how === "elected" &&
        near(o.election)
      )
        sitting.push({ kind: "local", o });
  const pol = s.polities[me.nation];
  if (pol?.assembly.includes(me.id) && near(pol.election))
    sitting.push({ kind: "assembly", n: me.nation });
  return sitting.length ? firstCounted(s, sitting) : null;
}

/** Of several polls, the one counted first (the earlier in the list on a tie). */
function firstCounted(s: GameState, refs: PollRef[]): PollRef {
  return refs.reduce((a, b) => (pollDayOf(s, b) < pollDayOf(s, a) ? b : a));
}

/** The day of a poll's count. */
export function pollDayOf(s: GameState, ref: PollRef): number {
  return pollDay(
    ref.kind === "local" ? ref.o.election : (s.polities[ref.n]?.election ?? 0),
  );
}

/** What the poll is for, in words. */
export function pollTitle(s: GameState, w: World, ref: PollRef): string {
  return ref.kind === "local"
    ? officeTitle(s, w, ref.o)
    : (s.polities[ref.n]?.name ?? "the assembly");
}

/** The county a candidate is fought for in: the office's, or their home. */
function countyFor(s: GameState, ref: PollRef, c: number): number {
  if (ref.kind === "local") return ref.o.prov;
  const life = lifeOfChar(s, c);
  return life ? life.home : (s.chars[c]?.home ?? s.nations[ref.n]?.capital);
}

function nationOf(ref: PollRef): number {
  return ref.kind === "local" ? ref.o.nation : ref.n;
}

function isNativePoll(s: GameState, ref: PollRef): boolean {
  return s.nations[nationOf(ref)]?.kind === "native";
}

// ---------------------------------------------------------------- party, the county, the sheriff

/**
 * A character's party in the colony. CHAMBER's factions (r16) are the one
 * source at the merge; until then: the council's record of their votes, the
 * house's own count for the computer's people, and "court" for a player
 * received at court. A player with neither is of no party.
 */
export function partyOf(
  s: GameState,
  n: number,
  c: number,
): "court" | "country" | null {
  if (s.nations[n]?.kind !== "power") return null;
  const f = s.power?.cabinets[n]?.faction[c];
  if (f) return f;
  if (!isPlayed(s, c)) return memberFaction(s, n, c);
  if (s.nations[n]?.court.includes(c)) return "court";
  return null;
}

/**
 * How far a county leans, from −1 (the court's) to +1 (the country's): the
 * country party where it's restless, the court where it's quiet. Most
 * counties lean firmly one way; a county near the middle only a little, so
 * a small change in its temper moves a candidate's party line a little.
 */
export function countyLeanBy(s: GameState, p: number): number {
  const unrest = s.provinces[p]?.unrest ?? 0;
  const x =
    hash01(p, 911) * 0.7 + Math.min(0.3, Math.max(0, unrest) / 100) - 0.42;
  return Math.max(-1, Math.min(1, x / 0.2));
}

/** Which way a county leans, in a word. */
export function countyLean(s: GameState, p: number): "court" | "country" {
  return countyLeanBy(s, p) > 0 ? "country" : "court";
}

/** "leans country", or "leans a little to the court" near the middle. */
export function leanWords(s: GameState, p: number): string {
  const by = countyLeanBy(s, p);
  const side = by > 0 ? "country" : "court";
  return Math.abs(by) < 0.5 ? `leans a little to the ${side}` : `leans ${side}`;
}

/** A party's line in a county: + where the county leans its way, by how far. */
export function partyLine(
  s: GameState,
  p: number,
  party: "court" | "country",
): number {
  const by = countyLeanBy(s, p);
  return POLL.party * (party === "country" ? by : -by);
}

/** The county's sheriff (who runs its polls), if there is one. */
export function sheriffOf(s: GameState, p: number): Character | undefined {
  const o = officesIn(s, p).find((x) => x.key === "sheriff");
  const c = o ? s.chars[o.holder] : undefined;
  return c?.alive && !c.abroad ? c : undefined;
}

/** The great men whose interest a candidate might buy: the council's, and the county's best. */
export function patronsFor(
  s: GameState,
  ref: PollRef,
  life: Life,
): { c: Character; price: number; will: boolean; why: string }[] {
  const n = nationOf(ref);
  const nation = s.nations[n];
  if (!nation || nation.kind !== "power") return [];
  const out = new Map<number, Character>();
  for (const id of Object.values(nation.council) as number[]) {
    const c = s.chars[id];
    if (c?.alive && !c.abroad && !isPlayed(s, c.id)) out.set(c.id, c);
  }
  const p = countyFor(s, ref, life.c);
  for (const c of householdsOf(s, p)) {
    const st = c.role ? ROLES[c.role].status : 0;
    if (st >= 4 && !isPlayed(s, c.id) && ageOf(s, c) >= 30 && !c.female)
      out.set(c.id, c);
  }
  const rival = rivalFor(s, life, ref);
  return [...out.values()]
    .filter((c) => c.id !== life.c && c.id !== rival?.c)
    .map((c) => {
      const op = opinionOf(s, c, life).total;
      const will = op >= 10;
      return {
        c,
        price: patronPrice(s, c),
        will,
        why: will
          ? `thinks well enough of you (${op})`
          : `doesn't think well enough of you (${op} of 10)`,
      };
    })
    .sort((a, b) => Number(b.will) - Number(a.will) || a.price - b.price)
    .slice(0, 6);
}

// ---------------------------------------------------------------- a candidate's lines

export interface Standing {
  total: number;
  lines: PollLine[];
}

function done(lines: PollLine[]): Standing {
  const kept = lines.filter((l) => l.v !== 0 || l.k === "base");
  return {
    total: r1(kept.reduce((m, l) => m + l.v, 0)),
    lines: kept.map((l) => ({ ...l, v: r1(l.v) })),
  };
}

/** The governor's friends: for or against a player at this poll (+ for, − against, 0 neither). */
export function govInterest(s: GameState, ref: PollRef, life: Life): number {
  const n = nationOf(ref);
  const nation = s.nations[n];
  if (!nation || nation.kind !== "power") return 0;
  const gov = s.chars[nation.ruler];
  if (!gov?.alive || gov.id === life.c || isPlayed(s, gov.id)) return 0;
  const party = partyOf(s, n, life.c);
  const op = opinionOf(s, gov, life).total;
  if (party === "country" || op < 0) return -POLL.govAgainst;
  if (party === "court" && op >= 20) return POLL.govFor;
  return 0;
}

/** A player's standing at a poll, line by line. */
export function playerStanding(
  s: GameState,
  life: Life,
  ref: PollRef,
): Standing {
  const me = meOf(s, life);
  if (!me) return { total: 0, lines: [] };
  const lines: PollLine[] = [];
  const add = (k: string, label: string, v: number) =>
    lines.push({ k, label, v });
  const native = isNativePoll(s, ref);
  const p = countyFor(s, ref, me.id);
  const n = nationOf(ref);
  add("base", "Your name on the list", POLL.base);
  add(
    "name",
    `Renown (${Math.floor(life.renown)}, counts to ${POLL.renownCap})`,
    Math.min(POLL.renownCap, life.renown * POLL.renownPer),
  );
  const st = stationOf(s, life);
  if (st.level)
    add(
      "station",
      `Your station (${st.name.toLowerCase()})`,
      st.level * POLL.stationPer,
    );
  if (life.home === p)
    add(
      "home",
      native ? "Of the town" : "A householder of the county",
      POLL.householder,
    );
  const pers = skillLevel(s, life, "persuasion");
  add(
    "skill",
    `Persuasion (${pers}, counts to ${POLL.persuasionCap})`,
    Math.min(POLL.persuasionCap, pers * POLL.persuasionPer),
  );
  const pts = canvassPoints(s, life, ref);
  add("canvass", `Canvassing (${Math.round(pts)} points)`, canvassValue(pts));
  const cv = life.polls?.canvass;
  const mine = cv && sameRef(cv, ref) ? cv : undefined;
  if (mine?.treat)
    add(
      "treat",
      native ? "Feasts for the town" : "Treating the voters",
      treatValue(mine.treat),
    );
  // The county's regard.
  const folk = householdsOf(s, p)
    .filter((c) => c.id !== me.id && ageOf(s, c) >= 18)
    .slice(0, 12);
  if (folk.length) {
    const avg =
      folk.reduce((m, c) => m + opinionOf(s, c, life).total, 0) / folk.length;
    add(
      "regard",
      native ? "The town's regard for you" : "The county's regard for you",
      Math.max(-POLL.regardCap, Math.min(POLL.regardCap, avg / POLL.regardDiv)),
    );
  }
  if (!native) {
    const party = partyOf(s, n, me.id);
    add(
      "party",
      party
        ? `The ${party} party: the county ${leanWords(s, p)}`
        : "No party: neither side's interest is yours",
      party ? partyLine(s, p, party) : 0,
    );
    const gi = govInterest(s, ref, life);
    if (gi)
      add(
        "gov",
        gi > 0
          ? "The governor's friends work for you"
          : "The governor's friends work against you",
        gi,
      );
    const sh = sheriffOf(s, p);
    if (sh && sh.id !== me.id) {
      const lean = Math.max(
        -POLL.sheriffLean,
        Math.min(
          POLL.sheriffLean,
          Math.round(opinionOf(s, sh, life).total / 10),
        ),
      );
      const bought = mine?.sheriff === sh.id ? POLL.sheriffBought : 0;
      add(
        "sheriff",
        `The sheriff, ${charName(sh)}${bought ? " (his goodwill bought)" : ""}`,
        lean + bought,
      );
    }
  }
  const own = s.chars[life.patron];
  const bought = mine && mine.patron >= 0 ? s.chars[mine.patron] : undefined;
  if (bought?.alive)
    add("patron", `${charName(bought)}'s interest`, POLL.patronBought);
  else if (own?.alive && !own.abroad && own.nation === n)
    add("patron", `Your patron, ${charName(own)}`, POLL.patronOwn);
  if (freeholder(s, life)) add("freehold", "A freeholder", POLL.freeholder);
  if (sittingFor(s, ref, me.id))
    add("sitting", "Sitting already", POLL.sitting);
  if (life.home !== p && ref.kind === "local")
    add("away", "You don't live in the county", POLL.away);
  if (life.scandal && life.scandal.until > s.day)
    add("scandal", "The scandal", POLL.scandal);
  const sway = swayOf(s, me.id);
  if (sway)
    add(
      "papers",
      sway > 0 ? "The papers speak for you" : "The papers against you",
      Math.max(-POLL.swayCap, Math.min(POLL.swayCap, sway)),
    );
  const puff = life.polls?.puff;
  if (puff && puff.until > s.day)
    add(
      "puff",
      puff.p === p
        ? "Your own paper's readers"
        : "Puffing yourself in your own paper: eyebrows raised",
      puff.p === p ? puff.v : -Math.min(4, puff.v / 3),
    );
  const rumours = me.memories.filter((m) => m.of === -2 && m.until > s.day);
  if (rumours.length)
    add("rumour", "Talked about in the town", rumours.length * POLL.rumour);
  return done(lines);
}

/** A candidate of the computer's (or anyone not played), line by line. */
export function npcStanding(
  s: GameState,
  ref: PollRef,
  c: number,
  opts: { sitting?: boolean; late?: boolean } = {},
): Standing {
  const ch = s.chars[c];
  if (!ch?.alive) return { total: -999, lines: [] };
  const lines: PollLine[] = [];
  const add = (k: string, label: string, v: number) =>
    lines.push({ k, label, v });
  const native = isNativePoll(s, ref);
  const n = nationOf(ref);
  const p = countyFor(s, ref, c);
  const status = ch.role ? ROLES[ch.role].status : 1;
  const salt = ref.kind === "local" ? ref.o.id : n * 7 + 3;
  const day = pollDayOf(s, ref);
  const h = (k: number) => hash01(c, salt, day, k);
  // The lesser offices aren't fought for as the house is.
  const stakes = pollStakes(ref);
  // Put up for the house against a player by the other interest: backed.
  const put =
    ref.kind === "assembly"
      ? s.polities[n]?.candidates.find((x) => x.c === c)
      : undefined;
  const challenger = !!put;
  add("base", "Name on the list", POLL.base);
  // The same scale as a player's (labouring folk 0 to the great 4).
  add("station", "His station", Math.max(0, status - 1) * POLL.stationPer);
  if (status >= 3 && !native) add("freehold", "A freeholder", POLL.freeholder);
  if (ch.home === p)
    add(
      "home",
      native ? "Of the town" : "A householder of the county",
      POLL.householder,
    );
  add(
    "skill",
    "Address",
    Math.min(POLL.persuasionCap, stat(s, ch, "dip") * POLL.addressPer),
  );
  // His friends and family, his dealings: the county thinks well of most of
  // its people of standing (less fought over for a lesser office).
  add(
    "regard",
    native ? "The town's regard for him" : "The county's regard for him",
    Math.max(
      -POLL.regardCap,
      Math.min(POLL.regardCap, ((status - 2) * 2 + h(7) * 8 - 2) * stakes),
    ),
  );
  // He canvasses for the last half-year before the poll, harder some than others.
  const weeksLeft = Math.max(0, (day - s.day) / 7);
  // A challenger's canvass builds from the day he was put up (a quarter at once).
  const since =
    put?.since !== undefined
      ? Math.max(0.25, (s.day - put.since) / 7 / (POLL.npcWeeks / 2))
      : 1;
  const ramp = opts.late
    ? 0.25
    : Math.max(
        0,
        Math.min(1, since, (POLL.npcWeeks - weeksLeft) / POLL.npcWeeks),
      );
  const vigour = challenger
    ? POLL.challengerVigour + h(1) * 0.3
    : 0.6 + h(1) * 0.5;
  add(
    "canvass",
    "His canvass",
    Math.min(POLL.canvassCap, POLL.canvassCap * vigour) * ramp * stakes,
  );
  const wealth = ch.role ? ROLES[ch.role].wealth : 5;
  const own = Math.min(POLL.treatCap - 2, (wealth / 10) * (0.4 + h(2) * 0.8));
  // A challenger's backers pay for his treating.
  const backed = challenger
    ? POLL.treatCap * (POLL.challengerTreat + h(2) * (1 - POLL.challengerTreat))
    : 0;
  add(
    "treat",
    native ? "His feasts" : "His treating",
    Math.max(own, backed) * ramp * stakes,
  );
  if (!native) {
    const party = partyOf(s, n, c) ?? memberFaction(s, n, c);
    add(
      "party",
      `The ${party} party: the county ${leanWords(s, p)}`,
      partyLine(s, p, party),
    );
    const nation = s.nations[n];
    const gov = s.chars[nation?.ruler ?? -1];
    if (party === "court" && gov?.alive && gov.id !== c && !isPlayed(s, gov.id))
      add("gov", "The governor's friends", Math.round(POLL.govNpc * stakes));
    const sh = sheriffOf(s, p);
    if (sh && sh.id !== c) {
      const kin =
        sh.spouse === c ||
        sh.children.includes(c) ||
        ch.children.includes(sh.id);
      add(
        "sheriff",
        `The sheriff, ${charName(sh)}`,
        kin ? POLL.sheriffLean : Math.round(h(3) * 4 - 2),
      );
    }
  }
  const patron = npcPatron(s, ref, c);
  if (patron >= 0)
    add(
      "patron",
      `${charName(s.chars[patron])}'s interest`,
      Math.round((POLL.patronBought - 2 + h(5) * 2) * (0.5 + stakes / 2)),
    );
  if (opts.sitting) add("sitting", "Sitting already", POLL.sitting);
  const sway = swayOf(s, c);
  if (sway)
    add(
      "papers",
      sway > 0 ? "The papers speak for him" : "The papers against him",
      Math.max(-POLL.swayCap, Math.min(POLL.swayCap, sway)),
    );
  const rumours = ch.memories.filter((m) => m.of === -2 && m.until > s.day);
  if (rumours.length)
    add("rumour", "Talked about in the town", rumours.length * POLL.rumour);
  if (ref.kind === "assembly") {
    const cand = s.polities[n]?.candidates.find((x) => x.c === c);
    if (cand && cand.points) add("talk", "Talked down", cand.points);
  }
  return done(lines);
}

/** A computer candidate's patron, if he has one: a councillor, or the county's justice. */
export function npcPatron(s: GameState, ref: PollRef, c: number): number {
  const ch = s.chars[c];
  const nation = s.nations[nationOf(ref)];
  if (!ch || !nation) return -1;
  const status = ch.role ? ROLES[ch.role].status : 1;
  const salt = ref.kind === "local" ? ref.o.id : nation.id * 7 + 3;
  // A challenger for the house always has a great man behind him.
  const challenger =
    ref.kind === "assembly" &&
    !!s.polities[ref.n]?.candidates.some((x) => x.c === c);
  if (!challenger && hash01(c, salt, 17) > (status >= 4 ? 0.55 : 0.2))
    return -1;
  const council = (Object.values(nation.council) as number[]).filter(
    (x) => s.chars[x]?.alive && !isPlayed(s, x) && x !== c,
  );
  const p = countyFor(s, ref, c);
  const justice = officesIn(s, p).find((o) => o.key === "justice")?.holder;
  const pool = [...council];
  if (
    justice !== undefined &&
    s.chars[justice]?.alive &&
    justice !== c &&
    !isPlayed(s, justice)
  )
    pool.push(justice);
  // His own party's men first (POLLS r16).
  const party = challenger ? partyOf(s, nation.id, c) : null;
  const ours = party
    ? pool.filter((x) => partyOf(s, nation.id, x) === party)
    : [];
  const from = ours.length ? ours : pool;
  if (!from.length) return -1;
  return from[Math.floor(hash01(c, salt, 19) * from.length)];
}

/** How hard the computer's people fight a poll: the house 1, a county's great office 0.8, a lesser one 0.5. */
export function pollStakes(ref: PollRef): number {
  if (ref.kind === "assembly") return 1;
  return OFFICES[ref.o.key].level >= 1 ? 0.8 : 0.5;
}

function sittingFor(s: GameState, ref: PollRef, c: number): boolean {
  return ref.kind === "local"
    ? ref.o.holder === c
    : !!s.polities[ref.n]?.assembly.includes(c);
}

function freeholder(s: GameState, life: Life): boolean {
  if ((life.property ?? []).length > 0) return true;
  if (life.job?.own) return true;
  if (life.background === "gentry") return true;
  return life.purse >= 40;
}

/** Canvass points a player has at this poll (their own, or the campaign's; a sitting member's in the canvass). */
export function canvassPoints(s: GameState, life: Life, ref: PollRef): number {
  const sat = canvassOf(life, ref)?.pts ?? 0;
  if (ref.kind === "local")
    return ref.o.candidates.find((x) => x.c === life.c)?.points ?? sat;
  return life.campaign?.nation === ref.n ? life.campaign.points : sat;
}

/**
 * A sitting member (or a county office's holder) canvassing for the count
 * ahead (Politics.ts campaignBoost): the points go to their canvass. False
 * when they're not sitting with a count near (or are standing as a candidate,
 * whose points are the campaign's).
 */
export function sittingCanvass(
  g: ConquestGame,
  life: Life,
  points: number,
): boolean {
  const ref = pollOf(g.s, life);
  if (!ref) return false;
  if (ref.kind === "assembly" && life.campaign) return false;
  if (ref.kind === "local" && ref.o.candidates.some((x) => x.c === life.c))
    return false;
  const cv = ensureCanvass(g, life, ref);
  touchLife(g, life);
  cv.pts = r1((cv.pts ?? 0) + points);
  return true;
}

/** Whether a life is sitting with a count near (and may canvass for it). */
export function canvassingSeat(s: GameState, life: Life): boolean {
  const ref = pollOf(s, life);
  if (!ref) return false;
  return ref.kind === "assembly"
    ? !life.campaign
    : !ref.o.candidates.some((x) => x.c === life.c);
}

function sameRef(cv: Canvass, ref: PollRef): boolean {
  return ref.kind === "local"
    ? cv.kind === "local" && cv.id === ref.o.id
    : cv.kind === "assembly" && cv.id === ref.n;
}

// ---------------------------------------------------------------- the field and the rival

export interface Contender {
  c: number;
  st: Standing;
  player: boolean;
}

/** The computer's people who'd stand at a county poll (the sitting holder, and the county's best). */
function localField(s: GameState, o: LocalOffice): Contender[] {
  const ref: PollRef = { kind: "local", o };
  const out: Contender[] = [];
  const sitting = s.chars[o.holder];
  if (sitting?.alive && !sitting.abroad && !lifeOfChar(s, sitting.id))
    out.push({
      c: sitting.id,
      st: npcStanding(s, ref, sitting.id, { sitting: true }),
      player: false,
    });
  const pool = householdsOf(s, o.prov)
    .filter(
      (c) =>
        npcCanStand(s, c, o) &&
        c.id !== o.holder &&
        !out.some((x) => x.c === c.id) &&
        !holdsPost(s, c.id),
    )
    .map((c) => ({ c: c.id, st: npcStanding(s, ref, c.id), player: false }))
    .sort((a, b) => b.st.total - a.st.total || a.c - b.c)
    .slice(0, 2);
  out.push(...pool);
  return out;
}

/** Can someone not played stand for a county office (as Offices.ts reckons it). */
function npcCanStand(s: GameState, c: Character, o: LocalOffice): boolean {
  const def = OFFICES[o.key];
  if (!c.alive || c.abroad || lifeOfChar(s, c.id)) return false;
  if (c.nation !== o.nation && s.nations[c.nation]?.kind !== "native")
    return false;
  if (def.native !== (s.nations[c.nation]?.kind === "native")) return false;
  if (def.sex === "men" && c.female) return false;
  if (def.sex === "women" && !c.female) return false;
  if (def.church && c.religion === "native") return false;
  if (ageOf(s, c) < Math.max(21, def.minAge)) return false;
  const status = c.role ? ROLES[c.role].status : 1;
  if (def.level >= 1 && status < 2 && !c.female) return false;
  return true;
}

/** Everyone at a poll (players by their standing, the rest by theirs). */
export function fieldAt(s: GameState, ref: PollRef): Contender[] {
  const out: Contender[] = [];
  if (ref.kind === "local") {
    out.push(...localField(s, ref.o));
    for (const x of ref.o.candidates) {
      const l = lifeOfChar(s, x.c);
      if (l) out.push({ c: x.c, st: playerStanding(s, l, ref), player: true });
    }
    const sl = lifeOfChar(s, ref.o.holder);
    if (sl && !out.some((x) => x.c === sl.c))
      out.push({ c: sl.c, st: playerStanding(s, sl, ref), player: true });
    return out;
  }
  const pol = s.polities[ref.n];
  if (!pol) return out;
  for (const c of pol.assembly) {
    const l = lifeOfChar(s, c);
    if (l) out.push({ c, st: playerStanding(s, l, ref), player: true });
    else if (s.chars[c]?.alive && !s.chars[c].abroad)
      out.push({
        c,
        st: npcStanding(s, ref, c, { sitting: true }),
        player: false,
      });
  }
  for (const x of pol.candidates)
    if (!out.some((y) => y.c === x.c) && s.chars[x.c]?.alive)
      out.push({ c: x.c, st: npcStanding(s, ref, x.c), player: false });
  for (const l of s.lives)
    if (
      l.campaign?.nation === ref.n &&
      l.c >= 0 &&
      !out.some((y) => y.c === l.c)
    )
      out.push({ c: l.c, st: playerStanding(s, l, ref), player: true });
  return out;
}

/**
 * Who you have to beat: at a county poll the strongest other candidate; at
 * the assembly, whoever would take the last seat if you weren't there.
 */
export function rivalFor(
  s: GameState,
  life: Life,
  ref: PollRef,
): Contender | null {
  const others = fieldAt(s, ref)
    .filter((x) => x.c !== life.c)
    .sort((a, b) => b.st.total - a.st.total || a.c - b.c);
  if (!others.length) return null;
  if (ref.kind === "local") return others[0];
  // The house: your seat is fought in your county, against the strongest of
  // those put up against you there; with nobody, against the last seat.
  const ch = others.find((x) => isChallenger(s, ref.n, x.c, life.home));
  if (ch) return ch;
  const seats = s.polities[ref.n]?.seats ?? 6;
  return others[Math.min(seats, others.length) - 1];
}

/** One of the computer's people put up for the house in this county during a canvass. */
function isChallenger(s: GameState, n: number, c: number, p: number): boolean {
  return (
    !lifeOfChar(s, c) &&
    s.chars[c]?.home === p &&
    !!s.polities[n]?.candidates.some((x) => x.c === c)
  );
}

/** Whether a living challenger stands for the house in this county. */
function hasChallenger(s: GameState, n: number, p: number): boolean {
  return !!s.polities[n]?.candidates.some(
    (x) =>
      s.chars[x.c]?.alive && !s.chars[x.c].abroad && isChallenger(s, n, x.c, p),
  );
}

/**
 * Who takes the house's seats (Politics.ts holdElection, with a player in
 * it): a player's seat is fought in their county, so a player beaten by the
 * strongest challenger put up there loses, and that challenger sits; a player
 * who beats him sits. The rest of the seats go by the count, as ever.
 */
export function assemblyWinners(
  s: GameState,
  n: number,
  ranked: { c: number; score: number }[],
  seats: number,
): number[] {
  const sure: number[] = [];
  const out = new Set<number>();
  for (const x of ranked) {
    const life = lifeOfChar(s, x.c);
    if (!life) continue;
    const ch = ranked.find(
      (y) =>
        y.c !== x.c &&
        !sure.includes(y.c) &&
        isChallenger(s, n, y.c, life.home),
    );
    if (ch && ch.score > x.score) {
      out.add(x.c);
      sure.push(ch.c);
    } else sure.push(x.c);
  }
  const rest = ranked
    .filter((y) => !sure.includes(y.c) && !out.has(y.c))
    .map((y) => y.c);
  return [...sure, ...rest].slice(0, seats);
}

/** Your chance at the count, from the gap and the luck at the count (each side ± POLL.luck). */
export function winChance(gap: number): number {
  const L = POLL.luck;
  let win = 0;
  let all = 0;
  for (let a = -L; a <= L; a++)
    for (let b = -L; b <= L; b++) {
      all++;
      const d = gap + a - b;
      if (d > 0) win++;
      else if (d === 0) win += 0.5;
    }
  return win / all;
}

// ---------------------------------------------------------------- the canvass, week by week

function pdiceOf(g: ConquestGame): Rng {
  const s = g.s;
  return new Rng({
    rng:
      (Math.imul(s.settings.seed | 0, 0x3c6ef372) ^
        Math.imul(s.day + 6151, 0x2545f491) ^
        0x1b873593) |
      0,
  });
}

function newCanvass(g: ConquestGame, life: Life, ref: PollRef): Canvass {
  const s = g.s;
  return {
    kind: ref.kind,
    id: ref.kind === "local" ? ref.o.id : ref.n,
    p: countyFor(s, ref, life.c),
    poll: pollDayOf(s, ref),
    since: s.day,
    rival: -1,
    weeks: [],
    moved: [],
    lastMe: {},
    lastThem: {},
    spent: {},
    treat: 0,
    sheriff: -1,
    patron: -1,
  };
}

/** The canvass a life has for this poll, if it's begun. */
export function canvassOf(life: Life, ref: PollRef): Canvass | undefined {
  const cv = life.polls?.canvass;
  return cv && sameRef(cv, ref) ? cv : undefined;
}

/** The canvass for this poll, begun now if it hasn't been (its first week written). */
function ensureCanvass(g: ConquestGame, life: Life, ref: PollRef): Canvass {
  const have = canvassOf(life, ref);
  if (have) return have;
  const fresh = newCanvass(g, life, ref);
  (touchLife(g, life).polls ??= {}).canvass = fresh;
  if (ref.kind === "assembly") assemblyChallengers(g, life, ref.n);
  week(g, life, ref, fresh);
  return fresh;
}

/** Find the poll this life is in, start (or drop) its canvass, and write the week. */
function canvassDaily(g: ConquestGame, life: Life): void {
  const s = g.s;
  const ref = pollOf(s, life);
  const cv = life.polls?.canvass;
  if (!ref) {
    if (cv) touchLife(g, life).polls!.canvass = null;
    return;
  }
  if (!cv || !sameRef(cv, ref)) {
    ensureCanvass(g, life, ref);
    return;
  }
  if ((s.day - cv.since) % 7 === 0 && s.day !== cv.since)
    week(g, life, ref, cv);
}

/** A week of the canvass: points fade, the standing is written down, and what moved it. */
function week(g: ConquestGame, life: Life, ref: PollRef, cv: Canvass): void {
  const s = g.s;
  touchLife(g, life);
  // A challenger who has died or gone abroad is replaced.
  if (
    ref.kind === "assembly" &&
    cv.weeks.length &&
    !hasChallenger(s, ref.n, life.home)
  )
    assemblyChallengers(g, life, ref.n);
  if (cv.weeks.length) {
    // Voters forget: canvassing and treating fade unless kept up.
    if (ref.kind === "local") {
      const x = ref.o.candidates.find((y) => y.c === life.c);
      if (x) {
        x.points = r1(x.points * POLL.canvassFade);
        g.societyChanged(`o${ref.o.prov}`);
      }
    } else if (life.campaign)
      life.campaign.points = r1(life.campaign.points * POLL.canvassFade);
    if (cv.pts) cv.pts = r1(cv.pts * POLL.canvassFade);
    cv.treat = r1(cv.treat * POLL.treatFade);
  }
  const me = playerStanding(s, life, ref);
  const rival = rivalFor(s, life, ref);
  cv.poll = pollDayOf(s, ref);
  cv.p = countyFor(s, ref, life.c);
  const them = rival?.st ?? { total: 0, lines: [] };
  const byKey = (st: { lines: PollLine[] }) =>
    Object.fromEntries(st.lines.map((l) => [l.k, l.v]));
  const meK = byKey(me);
  const themK = byKey(them);
  if (cv.weeks.length) {
    const moved: { label: string; v: number }[] = [];
    const keys = new Set([...Object.keys(meK), ...Object.keys(cv.lastMe)]);
    for (const k of keys) {
      const d = (meK[k] ?? 0) - (cv.lastMe[k] ?? 0);
      if (Math.abs(d) >= 0.25)
        moved.push({
          label: me.lines.find((l) => l.k === k)?.label ?? LINE_NAMES[k] ?? k,
          v: r1(d),
        });
    }
    if (rival && rival.c === cv.rival) {
      const tkeys = new Set([
        ...Object.keys(themK),
        ...Object.keys(cv.lastThem),
      ]);
      const rn = s.chars[rival.c]?.first ?? "the rival";
      for (const k of tkeys) {
        const d = (themK[k] ?? 0) - (cv.lastThem[k] ?? 0);
        if (Math.abs(d) >= 0.25)
          moved.push({
            label: `${rn}: ${(them.lines.find((l) => l.k === k)?.label ?? LINE_NAMES[k] ?? k).replace(/^(His|Name on the list)/, (m) => m.toLowerCase())}`,
            v: r1(-d),
          });
      }
    } else if (rival && s.chars[rival.c])
      moved.push({
        label: `${charName(s.chars[rival.c])} is the one to beat now`,
        v: r1((cv.weeks[cv.weeks.length - 1]?.them ?? 0) - them.total),
      });
    cv.moved = moved.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 4);
  } else cv.moved = [];
  cv.rival = rival?.c ?? -1;
  cv.lastMe = meK;
  cv.lastThem = themK;
  cv.weeks.push({ d: s.day, me: me.total, them: them.total });
  if (cv.weeks.length > 30) cv.weeks.splice(0, cv.weeks.length - 30);
  // The governor's friends take a side, once: the opposition is told.
  const gi = govInterest(s, ref, life);
  if (gi < 0 && cv.gov !== -1) {
    cv.gov = -1;
    journal(
      g,
      life,
      `The governor's friends are working against you for ${pollTitle(s, g.w, ref)}${rival && s.chars[rival.c] ? `: they back ${charName(s.chars[rival.c])}` : ""}. (The canvass is on Society › Office.)`,
      "bad",
    );
  } else if (gi > 0 && cv.gov !== 1) {
    cv.gov = 1;
    journal(
      g,
      life,
      `The governor's friends will work for you for ${pollTitle(s, g.w, ref)}.`,
      "good",
    );
  }
}

/** Plain names of the lines, for what moved a week. */
export const LINE_NAMES: Record<string, string> = {
  base: "Name on the list",
  name: "Renown",
  station: "Station",
  home: "A householder of the county",
  skill: "Persuasion",
  canvass: "Canvassing",
  treat: "Treating",
  regard: "The county's regard",
  party: "Party",
  gov: "The governor's friends",
  sheriff: "The sheriff",
  patron: "A patron's interest",
  freehold: "A freeholder",
  sitting: "Sitting already",
  away: "Living out of the county",
  scandal: "The scandal",
  papers: "The papers",
  puff: "Your own paper",
  rumour: "Talk in the town",
  talk: "Talked down",
  luck: "Luck at the count",
};

/**
 * The computer's real challengers for the house: when a player's canvass for
 * the assembly begins, one or two of the county's people of standing put up
 * against them (each with his own interest and money, by the lines above).
 */
function assemblyChallengers(
  g: ConquestGame,
  life: Life,
  n: number,
  late = false,
): void {
  const s = g.s;
  const pol = s.polities[n];
  const nation = s.nations[n];
  if (!pol || nation?.kind !== "power") return;
  const ref: PollRef = { kind: "assembly", n };
  const p = life.home;
  // The other interest puts him up: the other party's man if the county has
  // one (a player of no party faces the county's own lean).
  const mine = partyOf(s, n, life.c);
  const theirs =
    mine === "court" ? "country" : mine === "country" ? "court" : null;
  const wanted = theirs ?? countyLean(s, p);
  const pool = householdsOf(s, p)
    .filter((c) => {
      const st = c.role ? ROLES[c.role].status : 1;
      return (
        st >= 3 &&
        !c.female &&
        c.nation === n &&
        ageOf(s, c) >= 25 &&
        !isPlayed(s, c.id) &&
        !pol.assembly.includes(c.id) &&
        !pol.candidates.some((x) => x.c === c.id) &&
        !holdsPost(s, c.id)
      );
    })
    .map((c) => ({ c, v: npcStanding(s, ref, c.id).total }))
    .sort(
      (a, b) =>
        Number(partyOf(s, n, b.c.id) === wanted) -
          Number(partyOf(s, n, a.c.id) === wanted) ||
        b.v - a.v ||
        a.c.id - b.c.id,
    )
    .map((x) => x.c);
  const dice = pdiceOf(g);
  const want = dice.chance(0.5) ? 2 : 1;
  const picked = pool.slice(0, want);
  // Nobody free in the county: a man of standing comes forward (a planter,
  // a merchant or a lawyer lately settled there), on POLLS' own dice.
  if (
    !picked.length &&
    !hasChallenger(s, n, p) &&
    s.provinces[p]?.owner === n
  ) {
    const c = makeCharacter(s, dice, {
      nation: n,
      culture: nation.culture,
      religion: nation.religion,
      female: false,
      age: dice.int(30, 55),
    });
    c.home = p;
    c.role = dice.pick(["planter", "merchant", "lawyer"] as const)!;
    g.touchChar(c);
    picked.push(c);
  }
  if (!picked.length) return;
  for (const c of picked)
    pol.candidates.push({ c: c.id, points: 0, since: s.day });
  g.politiesChanged(n);
  const first = picked[0];
  const pat = npcPatron(s, ref, first.id);
  journal(
    g,
    life,
    `${charName(first)}${first.role ? `, ${ROLES[first.role].title.toLowerCase()} of ${g.map.provinces[p]?.name}` : ""}, ${late ? "stands against you at the last moment for" : "means to stand for"} ${pol.name}${pat >= 0 ? `, with ${charName(s.chars[pat])}'s interest behind him` : ""}.${picked[1] ? ` So does ${charName(picked[1])}.` : ""}`,
  );
}

/**
 * At the count for the house (Politics.ts holdElection): every player in it
 * faces a challenger in their county. One who never canvassed for it (they
 * stood days before, or canvassed for a county office first) meets one put up
 * at the last moment, with a quarter of a canvass.
 */
export function challengersAtCount(g: ConquestGame, n: number): void {
  const s = g.s;
  const pol = s.polities[n];
  if (!pol || s.nations[n]?.kind !== "power") return;
  for (const life of s.lives) {
    if (life.c < 0 || life.watching || !s.chars[life.c]?.alive) continue;
    const inIt = life.campaign?.nation === n || pol.assembly.includes(life.c);
    if (inIt && !hasChallenger(s, n, life.home))
      assemblyChallengers(g, life, n, true);
  }
}

// ---------------------------------------------------------------- money laid out on a poll

export interface LeverView {
  ok: boolean;
  why: string;
  cost: number;
  /** What it does to your standing now. */
  gain: number;
  /** For the sheriff: the chance he takes it amiss. */
  risk?: number;
}

/** Treat the voters: a barrel of punch at the hustings, a dinner for the freeholders. */
export function treatView(s: GameState, life: Life): LeverView {
  const ref = pollOf(s, life);
  const cost = ref ? treatCost(s, countyFor(s, ref, life.c)) : 0;
  const cv = ref ? canvassOf(life, ref) : undefined;
  const t = cv?.treat ?? 0;
  const gain = r1(treatValue(t + POLL.treatPoints) - treatValue(t));
  const no = (why: string): LeverView => ({ ok: false, why, cost, gain });
  if (!ref) return no("You're not standing for anything.");
  if (life.travel) return no("You're on the road.");
  const p = countyFor(s, ref, life.c);
  if (life.prov !== p) return no("Treating is done in the county.");
  const left = (life.cooldowns["polls:treat"] ?? 0) - s.day;
  if (left > 0) return no(`Again in ${left} days.`);
  if (life.purse < cost) return no(`It costs ${cost} coins.`);
  return { ok: true, why: "", cost, gain };
}

/** The sheriff's goodwill: a present for the man who opens and closes the poll. */
export function sheriffView(s: GameState, life: Life): LeverView {
  const ref = pollOf(s, life);
  const cv = ref ? canvassOf(life, ref) : undefined;
  const p = ref ? countyFor(s, ref, life.c) : life.home;
  const sh = sheriffOf(s, p);
  const cost = sh ? sheriffCost(s, sh) : 0;
  const no = (why: string): LeverView => ({
    ok: false,
    why,
    cost,
    gain: POLL.sheriffBought,
  });
  if (!ref) return no("You're not standing for anything.");
  if (isNativePoll(s, ref))
    return no("There's no sheriff at the council fire.");
  if (!sh) return no("The county has no sheriff just now.");
  if (sh.id === life.c) return no("You are the sheriff.");
  if (cv?.sheriff === sh.id) return no("He's yours already.");
  if (cv?.spent.sheriff) return no("He sent your last present back.");
  if (life.travel) return no("You're on the road.");
  if (life.prov !== p) return no("It's done in the county.");
  if (life.purse < cost) return no(`It costs ${cost} coins.`);
  return {
    ok: true,
    why: "",
    cost,
    gain: POLL.sheriffBought,
    risk: sheriffRisk(sh),
  };
}

/** The chance a sheriff takes a present amiss: an honest man sends it back. */
export function sheriffRisk(sh: Character): number {
  return sh.traits.includes("honest") ? 0.85 : 0.15;
}

/** A great man's interest for a price. */
export function patronView(s: GameState, life: Life, c: number): LeverView {
  const ref = pollOf(s, life);
  const cv = ref ? canvassOf(life, ref) : undefined;
  const ch = s.chars[c];
  const cost = ch ? patronPrice(s, ch) : 0;
  const no = (why: string): LeverView => ({
    ok: false,
    why,
    cost,
    gain: POLL.patronBought,
  });
  if (!ref) return no("You're not standing for anything.");
  if ((cv?.patron ?? -1) >= 0)
    return no("You have a great man's interest already.");
  const pick = patronsFor(s, ref, life).find((x) => x.c.id === c);
  if (!pick) return no("He won't be asked.");
  if (!pick.will) return no(`${ch!.first} ${pick.why}.`);
  if (life.purse < cost) return no(`It costs ${cost} coins.`);
  const own = s.chars[life.patron];
  const gain =
    own?.alive && own.nation === nationOf(ref)
      ? POLL.patronBought - POLL.patronOwn
      : POLL.patronBought;
  return { ok: true, why: "", cost, gain };
}

function pollFlow(s: GameState, w: World, ref: PollRef, what: string) {
  return {
    key: `polls:${ref.kind}:${ref.kind === "local" ? ref.o.id : ref.n}`,
    label: `The poll for ${pollTitle(s, w, ref)}: ${what}`,
  };
}

function pollsCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "polls") return undefined;
  const cmd = c as PollsCommand;
  const s = g.s;
  const ref = pollOf(s, life);
  if (!ref) return "You're not standing for anything.";
  const cv = ensureCanvass(g, life, ref);
  const native = isNativePoll(s, ref);
  switch (cmd.act) {
    case "treat": {
      const v = treatView(s, life);
      if (!v.ok) return v.why;
      withFlow(g, pollFlow(s, g.w, ref, "treating"), () =>
        spend(g, life, v.cost),
      );
      touchLife(g, life);
      cv.treat = r1(cv.treat + POLL.treatPoints);
      cv.spent.treat = (cv.spent.treat ?? 0) + v.cost;
      life.cooldowns["polls:treat"] = s.day + 7;
      for (const x of householdsOf(s, cv.p).slice(0, 8))
        remembers(g, life, g.char(x.id), "Treated us at the poll", 3, 1);
      journal(
        g,
        life,
        native
          ? `A feast for the town: venison, corn and talk late into the night (+${v.gain} to your standing).`
          : `Punch at the hustings and a dinner for the freeholders, at your charge (+${v.gain} to your standing).`,
      );
      return null;
    }
    case "sheriff": {
      const v = sheriffView(s, life);
      if (!v.ok) return v.why;
      const sh = sheriffOf(s, cv.p)!;
      touchLife(g, life);
      cv.spent.sheriff = v.cost;
      if (pdiceOf(g).chance(v.risk ?? 0)) {
        remembers(
          g,
          life,
          g.char(sh.id),
          "Tried to buy me at the poll",
          -12,
          3,
        );
        journal(
          g,
          life,
          `${charName(sh)} sends your present back with a cold note: the sheriff isn't to be bought. He'll remember it at the poll.`,
          "bad",
        );
        return null;
      }
      withFlow(g, pollFlow(s, g.w, ref, "a present for the sheriff"), () =>
        spend(g, life, v.cost),
      );
      cv.sheriff = sh.id;
      remembers(g, life, g.char(sh.id), "A handsome present", 6, 2);
      journal(
        g,
        life,
        `A handsome present for ${charName(sh)}. He'll open the poll when your freeholders are in town, and close it before the other side's are (+${POLL.sheriffBought} to your standing).`,
      );
      return null;
    }
    case "patron": {
      const v = patronView(s, life, cmd.c ?? -1);
      if (!v.ok) return v.why;
      const ch = s.chars[cmd.c!];
      withFlow(g, pollFlow(s, g.w, ref, `${charName(ch)}'s price`), () =>
        spend(g, life, v.cost),
      );
      touchLife(g, life);
      cv.patron = ch.id;
      cv.spent.patron = v.cost;
      remembers(g, life, g.char(ch.id), "Paid for my interest", 5, 2);
      journal(
        g,
        life,
        `${charName(ch)} names his price, and you pay it: his tenants and his friends will vote as he does (+${v.gain} to your standing).`,
      );
      return null;
    }
  }
  return "Unknown order.";
}

// ---------------------------------------------------------------- the count

/** Whether a county poll has a player in it (then it's counted by these lines). */
export function localHasPlayer(s: GameState, o: LocalOffice): boolean {
  return (
    o.candidates.some((x) => !!lifeOfChar(s, x.c)) || !!lifeOfChar(s, o.holder)
  );
}

/** Whether an election to the house has a player in it. */
export function assemblyHasPlayer(s: GameState, n: number): boolean {
  return (
    s.lives.some((l) => l.campaign?.nation === n && l.c >= 0) ||
    !!s.polities[n]?.assembly.some((c) => !!lifeOfChar(s, c))
  );
}

/**
 * A county poll's field as it's counted (Offices.ts holdPoll): the sitting
 * holder, the two strongest of the county by these lines, and the players
 * (Offices.ts checks they may still hold it).
 */
export function localCountField(
  s: GameState,
  o: LocalOffice,
): { c: number; score: number }[] {
  return fieldAt(s, { kind: "local", o }).map((x) => ({
    c: x.c,
    score: x.st.total,
  }));
}

/** Scores for an election to the house (Politics.ts holdElection), by these lines. */
export function assemblyScore(
  s: GameState,
  n: number,
  c: number,
  late = false,
): number {
  const ref: PollRef = { kind: "assembly", n };
  const l = lifeOfChar(s, c);
  if (l) return playerStanding(s, l, ref).total;
  const sitting = !!s.polities[n]?.assembly.includes(c);
  return npcStanding(s, ref, c, { sitting, late }).total;
}

/** Luck at the count, on POLLS' own dice: each side's ± POLL.luck. */
export function countLuck(g: ConquestGame, c: number): number {
  const r = new Rng({
    rng:
      (Math.imul(g.s.settings.seed | 0, 0x68e31da4) ^
        Math.imul(g.s.day + 3301, 0x1b56c4e9) ^
        Math.imul(c + 17, 0x85ebca6b)) |
      0,
  });
  return r.int(-POLL.luck, POLL.luck);
}

/** A player's result, worked out before the count changes anything, told after. */
export interface PendingResult {
  life: Life;
  res: PollResult;
}

/**
 * After a count with players in it: each player who stood is told how it
 * went and why (their lines against whoever beat them, or came nearest).
 * Worked out before the office or the house changes hands (call
 * `tellResults` after).
 */
export function countReasons(
  s: GameState,
  ref: PollRef,
  title: string,
  ranked: { c: number; score: number }[],
  winners: number[],
): PendingResult[] {
  const out: PendingResult[] = [];
  for (const x of ranked) {
    const life = lifeOfChar(s, x.c);
    if (!life) continue;
    const won = winners.includes(x.c);
    const others = ranked.filter((y) => y.c !== x.c);
    // Who beat you, or who came nearest: for the house, your county's
    // challenger if there was one; else the first loser, or the last winner.
    const county =
      ref.kind === "assembly"
        ? others.find((y) => isChallenger(s, ref.n, y.c, life.home))
        : undefined;
    const rival =
      county ??
      (won
        ? (others.find((y) => !winners.includes(y.c)) ?? null)
        : (others
            .filter((y) => winners.includes(y.c))
            .sort((a, b) => a.score - b.score)[0] ?? null));
    const me = playerStanding(s, life, ref);
    const rl = rival ? lifeOfChar(s, rival.c) : undefined;
    const them = rival
      ? rl
        ? playerStanding(s, rl, ref)
        : npcStanding(s, ref, rival.c, {
            sitting: sittingFor(s, ref, rival.c),
          })
      : null;
    const why = reasons(s, me, them, won, rival?.c ?? -1);
    const myLuck = r1(x.score - me.total);
    const theirLuck = rival && them ? r1(rival.score - them.total) : 0;
    if (Math.abs(myLuck - theirLuck) >= 2)
      why.push(
        myLuck > theirLuck
          ? "luck at the count was with you"
          : "luck at the count was against you",
      );
    out.push({
      life,
      res: {
        day: s.day,
        kind: ref.kind,
        title,
        won,
        me: Math.round(x.score),
        them: Math.round(rival?.score ?? 0),
        rival: rival?.c ?? -1,
        why,
      },
    });
  }
  return out;
}

/** A player who stood but couldn't be counted at the count (no longer eligible), and why. */
export function refusedResult(
  s: GameState,
  life: Life,
  ref: PollRef,
  title: string,
  why: string,
): PendingResult {
  return {
    life,
    res: {
      day: s.day,
      kind: ref.kind,
      title,
      won: false,
      me: 0,
      them: 0,
      rival: -1,
      why: [
        `your name was struck off the list: ${why.replace(/\.$/, "").toLowerCase()}`,
      ],
    },
  };
}

/** Tell each player how their poll went, and why (after the count's own lines). */
export function tellResults(g: ConquestGame, list: PendingResult[]): void {
  for (const { life, res } of list) {
    const p = (touchLife(g, life).polls ??= {});
    p.last = res;
    if (p.canvass) p.canvass = null;
    if (res.why.length)
      journal(
        g,
        life,
        `${res.won ? "Why you won" : "Why you lost"} the poll for ${res.title} (${res.me} to ${res.them}): ${res.why.join("; ")}.`,
        res.won ? "good" : "bad",
      );
  }
}

/** The lines that made the difference, biggest first, in words. */
function reasons(
  s: GameState,
  me: Standing,
  them: Standing | null,
  won: boolean,
  rival: number,
): string[] {
  const mine = Object.fromEntries(me.lines.map((l) => [l.k, l]));
  const theirs = Object.fromEntries((them?.lines ?? []).map((l) => [l.k, l]));
  const keys = new Set([...Object.keys(mine), ...Object.keys(theirs)]);
  keys.delete("base");
  const rn = s.chars[rival]?.first ?? "the other side";
  const diffs = [...keys]
    .map((k) => ({
      k,
      d: (mine[k]?.v ?? 0) - (theirs[k]?.v ?? 0),
      a: mine[k]?.v ?? 0,
      b: theirs[k]?.v ?? 0,
    }))
    .filter((x) => (won ? x.d >= 1 : x.d <= -1))
    .sort((a, b) => (won ? b.d - a.d : a.d - b.d))
    .slice(0, 3);
  return diffs.map(({ k, a, b }) => {
    const name = (LINE_NAMES[k] ?? k).toLowerCase();
    if (k === "gov")
      return a < 0
        ? "the governor's friends worked against you"
        : a > 0
          ? "the governor's friends worked for you"
          : `the governor's friends worked for ${rn}`;
    if (k === "sheriff")
      return won
        ? `the sheriff leaned your way (${fmt(a)} to ${fmt(b)})`
        : `the sheriff leaned ${rn}'s way (${fmt(b)} to your ${fmt(a)})`;
    if (k === "patron")
      return a > b
        ? `${mine[k]!.label.replace(/'s interest$/, "")}'s interest (${fmt(a)})`
        : `${theirs[k]!.label.replace(/'s interest$/, "")}'s interest behind ${rn} (${fmt(b)})`;
    if (k === "scandal" || k === "away" || k === "rumour")
      return `${name} (${fmt(a)})`;
    if (k === "regard")
      return won
        ? `the county thought better of you (${fmt(a)} to ${rn}'s ${fmt(b)})`
        : `the county thought better of ${rn} (${fmt(b)} to your ${fmt(a)})`;
    if (k === "party")
      return won
        ? a > 0
          ? `your party suits the county (${fmt(a)} to ${fmt(b)})`
          : `${rn}'s party doesn't suit the county (${fmt(b)})`
        : b > 0
          ? `${rn}'s party suits the county (${fmt(b)} to your ${fmt(a)})`
          : `your party doesn't suit the county (${fmt(a)})`;
    if (k === "papers" || k === "puff")
      return `the papers (${fmt(a)} to ${fmt(b)})`;
    if (k === "sitting") return a > b ? "you sat already" : `${rn} sat already`;
    if (k === "home")
      return a > b
        ? "you live in the county"
        : `${rn} lives in the county, and you don't`;
    const yours = REASON_NAMES[k] ?? name;
    return won
      ? `your ${yours} (${fmt(a)} to ${rn}'s ${fmt(b)})`
      : `${rn}'s ${yours} (${fmt(b)} to your ${fmt(a)})`;
  });
}

const fmt = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}`;

/** A line's name after "your" or "Edward's" in a reason. */
const REASON_NAMES: Record<string, string> = {
  name: "renown",
  station: "station",
  skill: "address",
  canvass: "canvass",
  treat: "treating",
  freehold: "freehold",
  talk: "standing after the talk",
};

/** For the pages: the canvass as it stands now, with the rival and the chance. */
export function canvassNow(
  s: GameState,
  life: Life,
): {
  ref: PollRef;
  me: Standing;
  rival: Contender | null;
  chance: number;
  day: number;
} | null {
  const ref = pollOf(s, life);
  if (!ref) return null;
  const me = playerStanding(s, life, ref);
  const rival = rivalFor(s, life, ref);
  return {
    ref,
    me,
    rival,
    chance: rival ? winChance(me.total - rival.st.total) : 1,
    day: pollDayOf(s, ref),
  };
}

/** For the County offices row: your standing at an office's poll, and the strongest rival there. */
export function localView(
  s: GameState,
  life: Life,
  o: LocalOffice,
): { me: Standing; rival: Contender | null; chance: number } {
  const ref: PollRef = { kind: "local", o };
  const me = playerStanding(s, life, ref);
  const rival = rivalFor(s, life, ref);
  return {
    me,
    rival,
    chance: rival ? winChance(me.total - rival.st.total) : 1,
  };
}

/** The canvass for the house, for a player not yet standing (Standing, the stand button). */
export function assemblyView(
  s: GameState,
  life: Life,
  n: number,
): { me: Standing; rival: Contender | null; chance: number } {
  const ref: PollRef = { kind: "assembly", n };
  const me = playerStanding(s, life, ref);
  const rival = rivalFor(s, life, ref);
  return {
    me,
    rival,
    chance: rival ? winChance(me.total - rival.st.total) : 1,
  };
}

/** The date of the count, in words, for journal lines. */
export const countDate = (s: GameState, ref: PollRef) =>
  formatDate(pollDayOf(s, ref));

hooks.command.push(pollsCommand);
hooks.lifeDaily.push(canvassDaily);
