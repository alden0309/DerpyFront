// GOV (r21): a petition to the governor for a grant toward an expedition.
// A player getting one up asks the colony's governor for gold from the
// treasury: in person at the capital (an answer in a few days) or by letter
// (two or three weeks, and a little less likely). The computer's governor
// answers at the odds shown, from one reckoning (`grantOdds`); a player who
// governs is asked in a scene and answers for himself. A grant is the
// governor's leave too (a raid with a grant is a raid by commission).

import { formatDate } from "./Calendar";
import {
  costOf,
  draftOf,
  edice,
  expedChanged,
  expedOf,
  expedState,
  expedWords,
  KINDS,
  myForming,
  workChance,
} from "./ExpedCore";
import { raiseScene } from "./ExpedEvents";
import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import { journal, touchLife } from "./LifeCore";
import {
  Check,
  lifeOfChar,
  lifeOfSeat,
  meOf,
  no,
  opinionOf,
  yes,
} from "./LifeQueries";
import type { World } from "./Map";
import { atWar, charName, hasTrait, treatyBetween } from "./Queries";
import type { Breakdown, Expedition, GameState, GrantAsk, Life } from "./Types";

/** The reckoning a governor answers a petition for a grant by. */
export const GRANT = {
  base: 0.3,
  /** What each kind is worth to the colony, as a governor sees it. */
  worth: {
    discover: 0.1,
    river: 0.1,
    trade: 0.05,
    outpost: 0.1,
    mission: 0,
    raid: 0,
    port: 0.15,
  } as Record<string, number>,
  zealousMission: 0.15,
  /** A raid: at war with them, or in peace (and a treaty in the way), and a hard man's view. */
  raidWar: 0.15,
  raidPeace: -0.35,
  raidTreaty: -0.15,
  raidHard: 0.15,
  /** The treasury: deep (four times the ask), or thin (under twice). */
  deep: 0.1,
  thin: -0.1,
  /** The governor's opinion of you (a point in 200), your renown and favour. */
  opinionPer: 1 / 200,
  renownPer: 1 / 300,
  renownMax: 0.15,
  favourPer: 1 / 300,
  favourMax: 0.1,
  /** The party's odds at the work: a little for each 10 in 100 above or below even. */
  oddsPer: 0.2,
  oddsMax: 0.1,
  /** Asked by letter, not in person. */
  letter: -0.05,
  /** A big ask: less for each 10 gold over 40. */
  bigFrom: 40,
  bigPer: 0.025,
  bigMax: 0.15,
  min: 0.03,
  max: 0.9,
  /** Days for an answer: in person, by letter. */
  inPerson: 3,
  byLetter: 16,
  /** Turned down: not again for this long. */
  rest: 60,
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** The colony's governor, and whether he's a player. */
export function governorFor(
  s: GameState,
  n: number,
): { c: number; life?: Life } | null {
  const nation = s.nations[n];
  const c = nation?.ruler ?? -1;
  if (!nation?.alive || c < 0 || !s.chars[c]?.alive) return null;
  return { c, life: lifeOfChar(s, c) };
}

/** Would the governor grant it: the reckoning, from 0 to 1. */
export function grantOdds(
  s: GameState,
  w: World,
  life: Life,
  x: Expedition,
  gold: number,
  byLetter: boolean,
): Breakdown {
  const e = new Explain().add(
    "A governor is careful with the treasury",
    GRANT.base,
    true,
  );
  const gov = governorFor(s, x.n);
  const nation = s.nations[x.n];
  if (!gov || !nation) return e.done(2, 0, 0);
  const govC = s.chars[gov.c];
  if (nation.gold < gold) {
    e.add(`The treasury holds only ${Math.floor(nation.gold)} gold`, -1);
    return e.done(2, 0, 1);
  }
  if (nation.gold >= gold * 4) e.add("A full treasury", GRANT.deep);
  else if (nation.gold < gold * 2) e.add("A thin treasury", GRANT.thin);
  const k = KINDS[x.kind];
  const worth = GRANT.worth[x.kind] ?? 0;
  if (worth) e.add(`${k.name}: worth it to the colony`, worth);
  if (x.kind === "mission" && hasTrait(govC, "zealous"))
    e.add("A zealous governor", GRANT.zealousMission);
  if (x.kind === "raid") {
    const owner = s.provinces[x.target]?.owner ?? -1;
    if (owner >= 0 && atWar(s, owner, x.n))
      e.add("At war with them", GRANT.raidWar);
    else {
      e.add("A raid in peacetime", GRANT.raidPeace);
      if (
        owner >= 0 &&
        (treatyBetween(s, owner, x.n, "trade") ||
          treatyBetween(s, owner, x.n, "alliance"))
      )
        e.add("A treaty with them", GRANT.raidTreaty);
    }
    if (hasTrait(govC, "cruel") || hasTrait(govC, "ambitious"))
      e.add("A hard man", GRANT.raidHard);
    if (hasTrait(govC, "just") || hasTrait(govC, "tolerant"))
      e.add("A just man", -GRANT.raidHard);
  }
  if (govC) {
    const op = opinionOf(s, govC, life).total;
    e.add(
      `What ${govC.first} thinks of you (${op})`,
      Math.round(op * GRANT.opinionPer * 100) / 100,
    );
  }
  const ren = Math.min(GRANT.renownMax, life.renown * GRANT.renownPer);
  if (ren >= 0.01)
    e.add(
      `Your renown (${Math.floor(life.renown)})`,
      Math.round(ren * 100) / 100,
    );
  const fav = Math.min(
    GRANT.favourMax,
    Math.max(0, life.favor) * GRANT.favourPer,
  );
  if (fav >= 0.01) e.add("Your favour at home", Math.round(fav * 100) / 100);
  const ch = workChance(s, w, draftOf(x), s.day).p;
  const v = clamp(
    (ch - 0.5) * GRANT.oddsPer * 2,
    -GRANT.oddsMax,
    GRANT.oddsMax,
  );
  if (Math.abs(v) >= 0.01)
    e.add(
      `The party's odds at the work (${Math.round(ch * 100)} in 100)`,
      Math.round(v * 100) / 100,
    );
  if (byLetter) e.add("Asked by letter", GRANT.letter);
  if (gold > GRANT.bigFrom)
    e.add(
      `A big ask (${gold} gold)`,
      -Math.min(
        GRANT.bigMax,
        Math.round(((gold - GRANT.bigFrom) / 10) * GRANT.bigPer * 100) / 100,
      ),
    );
  return e.done(2, GRANT.min, GRANT.max);
}

/** Whether you can ask the governor for a grant now, or why not. */
export function askCheck(s: GameState, life: Life, gold: number): Check {
  const x = myForming(s, life.seat);
  if (!x) return no("Get an expedition up first (Work › Expeditions).");
  const me = meOf(s, life);
  if (!me) return no("Watching.");
  const gov = governorFor(s, x.n);
  if (!gov) return no("The colony has no governor to ask.");
  if (gov.c === me.id)
    return no("You govern: send it at the treasury's charge.");
  if (x.grant !== undefined) return no("You have a grant.");
  const st = expedOf(s);
  if (st.asks.some((a) => a.x === x.id && a.stage === "asked"))
    return no("Your petition is before the governor.");
  const last = st.asks
    .filter((a) => a.seat === life.seat && a.stage === "refused")
    .reduce((m, a) => Math.max(m, a.answer), -Infinity);
  if (last + GRANT.rest > s.day)
    return no(`Refused lately: not before ${formatDate(last + GRANT.rest)}.`);
  if (!(gold >= 1)) return no("Ask for something.");
  return yes;
}

/** The most worth asking: the whole cost. */
export function askMost(s: GameState, w: World, life: Life): number {
  const x = myForming(s, life.seat);
  if (!x) return 0;
  const me = meOf(s, life);
  return costOf(
    s,
    w.map,
    draftOf(x),
    !!me && x.leader !== me.id && !lifeOfChar(s, x.leader),
  ).total;
}

/** Ask the governor for a grant (in person at the capital, or by letter from anywhere). */
export function askGrant(
  g: ConquestGame,
  life: Life,
  gold: number,
): string | null {
  const s = g.s;
  const most = askMost(s, g.w, life);
  const want = Math.max(1, Math.min(most, Math.round(gold || most)));
  const ok = askCheck(s, life, want);
  if (!ok.ok) return ok.why;
  const x = myForming(s, life.seat)!;
  const me = meOf(s, life)!;
  const nation = s.nations[x.n];
  const inPerson = life.prov === nation.capital && !life.travel;
  const gov = governorFor(s, x.n)!;
  const a: GrantAsk = {
    id: g.nextId(),
    seat: life.seat,
    c: me.id,
    n: x.n,
    x: x.id,
    kind: x.kind,
    target: x.target,
    gold: want,
    day: s.day,
    answer: s.day + (inPerson ? GRANT.inPerson : GRANT.byLetter),
    stage: "asked",
    ...(inPerson ? {} : { byLetter: true }),
  };
  expedState(g).asks.push(a);
  expedChanged(g);
  journal(
    g,
    life,
    `You ${inPerson ? "put your case to" : "write to"} ${charName(s.chars[gov.c])} for a grant of ${want} gold toward ${expedWords(g.map, x)}${gov.life ? "" : `: an answer about ${formatDate(a.answer)}`}.`,
  );
  if (gov.life) raiseScene(g, gov.life, "exped-grant", null, { a: a.id });
  return null;
}

/** A grant given: the gold goes into the expedition's chest, and it's the governor's leave. */
function give(g: ConquestGame, a: GrantAsk, gold: number): void {
  const s = g.s;
  const x = expedOf(s).list.find((y) => y.id === a.x && y.stage === "forming");
  const life = lifeOfSeat(s, a.seat);
  if (!x || !life) {
    a.stage = "refused";
    return;
  }
  const n = g.nation(a.n);
  const given = Math.min(gold, Math.floor(n.gold));
  if (given <= 0) {
    a.stage = "refused";
    journal(
      g,
      life,
      "The governor would have granted it, but the treasury is empty.",
      "bad",
    );
    return;
  }
  n.gold -= given;
  a.stage = "granted";
  a.given = given;
  x.grant = a.id;
  x.treasury = given;
  x.leave = true;
  touchLife(g, life);
  journal(
    g,
    life,
    `The governor grants ${given} gold from the treasury toward ${expedWords(g.map, x)}${x.kind === "raid" ? ", and his commission for it" : ""}.`,
    "good",
  );
}

/** A player who governs answers a petition: all of it, half, or none. */
export function answerGrant(
  g: ConquestGame,
  life: Life,
  id: number,
  how: string,
): string | null {
  const s = g.s;
  const a = expedState(g).asks.find((y) => y.id === id);
  if (!a || a.stage !== "asked") return "That's been answered.";
  const me = meOf(s, life);
  if (!me || s.nations[a.n]?.ruler !== me.id) return "It isn't yours to grant.";
  const asker = lifeOfSeat(s, a.seat);
  if (how === "all" || how === "half") {
    give(g, a, how === "all" ? a.gold : Math.ceil(a.gold / 2));
    journal(
      g,
      life,
      `You grant ${a.given ?? 0} gold from the treasury toward ${charName(s.chars[a.c])}'s expedition.`,
    );
  } else {
    a.stage = "refused";
    a.answer = s.day;
    if (asker)
      journal(
        g,
        asker,
        `${charName(me)} won't grant it: the treasury has other uses.`,
        "bad",
      );
  }
  expedChanged(g);
  return null;
}

/** Each day: the computer's governors answer the petitions that are due. */
export function grantsDaily(g: ConquestGame): void {
  const s = g.s;
  const st = expedState(g);
  for (const a of st.asks) {
    if (a.stage !== "asked" || a.answer > s.day) continue;
    const gov = governorFor(s, a.n);
    const life = lifeOfSeat(s, a.seat);
    const x = st.list.find((y) => y.id === a.x && y.stage === "forming");
    if (!gov || !life || !x) {
      a.stage = "refused";
      expedChanged(g);
      continue;
    }
    if (gov.life) continue; // a player governor answers for himself
    const p = grantOdds(s, g.w, life, x, a.gold, !!a.byLetter).total;
    if (edice(s, 0x80, a.id).chance(p)) give(g, a, a.gold);
    else {
      a.stage = "refused";
      journal(
        g,
        life,
        `${charName(s.chars[gov.c])} won't grant it${a.byLetter ? " (by return of post)" : ""}.`,
        "bad",
      );
    }
    expedChanged(g);
  }
  // Old answers are forgotten after a year.
  const keep = st.asks.filter(
    (a) => a.stage === "asked" || s.day - a.answer < 365,
  );
  if (keep.length !== st.asks.length) {
    st.asks = keep;
    expedChanged(g);
  }
}
