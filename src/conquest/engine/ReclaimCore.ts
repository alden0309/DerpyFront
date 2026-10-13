// WAR (r17): the bookkeeping of lost towns and towns under foreign rule.
// Where it lives in the game (GameState.reclaim), the delta that carries it
// to the players, the track's own dice (so the world's luck isn't shifted),
// and the rules every reckoning reads: a claim's weight and how it fades, a
// town's ferment and what moves it, a rising's first night and its odds.
// The engine rolls from these tables and the pages and the guide show them,
// so what a player is told is what happens.

import type { ConquestGame } from "./Game";
import { kmBetween, World } from "./Map";
import { hasTrait, holder, people, rulerOf, seatHolder } from "./Queries";
import type { Rng } from "./Rng";
import { DAYS_PER_YEAR } from "./Rules";
import type {
  Claim,
  GameState,
  Movement,
  Province,
  ReclaimPart,
  ReclaimState,
  TownRising,
  Yoke,
} from "./Types";
import { worldRng } from "./WorldRng";

// ---------------------------------------------------------------- the state

const CHANGED = new WeakSet<ConquestGame>();

/** Something changed: it goes out with the next delta. */
export function reclaimChanged(g: ConquestGame): void {
  CHANGED.add(g);
}

/** The state, made the first time it's needed (old saves have none). */
export function reclaimState(g: ConquestGame): ReclaimState {
  const s = g.s;
  if (!s.reclaim) {
    s.reclaim = { claims: [], yokes: [], held: {}, risings: [] };
    reclaimChanged(g);
  }
  s.reclaim.claims ??= [];
  s.reclaim.yokes ??= [];
  s.reclaim.held ??= {};
  s.reclaim.risings ??= [];
  return s.reclaim;
}

const EMPTY: ReclaimState = { claims: [], yokes: [], held: {}, risings: [] };

/** Read-only: the state as it is (empty for an old save). */
export function reclaimOf(s: GameState): ReclaimState {
  const r = s.reclaim;
  if (!r) return EMPTY;
  return {
    claims: r.claims ?? [],
    yokes: r.yokes ?? [],
    held: r.held ?? {},
    risings: r.risings ?? [],
  };
}

/** The state, when any of it changed since the last call (and clears it). */
export function takeReclaimDelta(g: ConquestGame): ReclaimState | undefined {
  if (!CHANGED.has(g) || !g.s.reclaim) return undefined;
  CHANGED.delete(g);
  return g.s.reclaim;
}

export function applyReclaimDelta(s: GameState, d: ReclaimState): void {
  s.reclaim = d;
}

// ---------------------------------------------------------------- the track's dice

/**
 * The track's own dice, from the seed, the day and a salt of its own: a
 * claim's war, a plot, a rising's first night never move the world's dice.
 */
export function rdice(g: ConquestGame, salt: number): Rng {
  return worldRng(g.s, 0x17a0000 + (salt | 0));
}

// ---------------------------------------------------------------- claims

/** How much a lost town is wanted back, and how it fades. */
export const CLAIM = {
  /** Its size: 10 points for each doubling past this many people, up to 30. */
  sizeStep: 250,
  sizePer: 10,
  sizeMax: 30,
  /** Their capital (counts whoever lives there now). */
  capital: 25,
  /** Each year it was theirs, up to 20 points (a town held since before the game counts in full). */
  perYear: 0.5,
  yearsMax: 20,
  /** Its people: size and years count in full when all of them are the claimant's own, a quarter when none are. */
  strangers: 0.25,
  /** The points come to at most 75; a claim is on a scale of 100. */
  scale: 100 / 75,
  /** Held less than this many years: no claim at all (a town taken back is no grievance). */
  minYears: 3,
  /** Smaller than this, not worth a claim. */
  minBase: 8,
  /** It keeps its strength this many years, then fades to nothing over the rest. */
  holdYears: 10,
  fadeYears: 30,
  /** A war for it that doesn't win it back halves it; after this many it's given up. */
  maxTries: 2,
  /** Worth a war at this, against a native nation (or by one); against another crown's colony, this. */
  war: 35,
  warPower: 50,
  /** Below this it's forgotten. */
  minLive: 5,
  /** A war's chance a month at a claim of 50 (against another power: this). */
  warChance: 0.06,
  warChancePower: 0.02,
  /** Stronger than the holder by this much in the field before they'll go to war for it. */
  edge: 1.4,
  /** While its own people hold it in a rising, the claim counts this much more. */
  risingBoost: 20,
  /** In a war its armies are drawn to a claimed town: the target counts (1 + its claim ÷ this). */
  pull: 40,
  /** At the peace it asks for a claimed town it holds once the war is going this well. */
  peaceScore: 10,
};

/** The people of a nation in a town: their share of everyone there. */
export function kinShare(s: GameState, pr: Province, n: number): number {
  const nation = s.nations[n];
  const all = people(pr);
  if (!nation || all <= 0) return 0;
  let kin = 0;
  for (const pop of pr.pops)
    if (pop.culture === nation.culture) kin += pop.size;
  return Math.min(1, kin / all);
}

/** What a lost town is worth to the nation that lost it (0 to 100), and why. */
export function claimParts(
  s: GameState,
  p: number,
  by: number,
  heldDays: number | undefined,
  wasCapital: boolean,
): { base: number; parts: ReclaimPart[] } {
  const pr = s.provinces[p];
  const folk = people(pr);
  const parts: ReclaimPart[] = [];
  const size = Math.min(
    CLAIM.sizeMax,
    Math.max(0, CLAIM.sizePer * Math.log2(1 + folk / CLAIM.sizeStep)),
  );
  const years =
    heldDays === undefined
      ? CLAIM.yearsMax
      : Math.min(CLAIM.yearsMax, (heldDays / DAYS_PER_YEAR) * CLAIM.perYear);
  const kin = kinShare(s, pr, by);
  const mul = CLAIM.strangers + (1 - CLAIM.strangers) * kin;
  parts.push({
    label: `Its size (${Math.round(folk)} people)`,
    value: r1(size * mul * CLAIM.scale),
  });
  parts.push({
    label:
      heldDays === undefined
        ? "Theirs since before anyone remembers"
        : `Theirs ${Math.round(heldDays / DAYS_PER_YEAR)} years`,
    value: r1(years * mul * CLAIM.scale),
  });
  if (wasCapital)
    parts.push({
      label: "Their capital",
      value: r1(CLAIM.capital * CLAIM.scale),
    });
  parts.push({
    label: `Its people: ${Math.round(kin * 100)} in 100 their own`,
    value: 0,
  });
  const tooNew =
    heldDays !== undefined && heldDays < CLAIM.minYears * DAYS_PER_YEAR;
  const base = tooNew
    ? 0
    : Math.min(100, r1(parts.reduce((m, x) => m + x.value, 0)));
  return { base, parts };
}

/** How strong a claim is today (0 to 100), and why. */
export function claimLive(
  s: GameState,
  c: Claim,
): { total: number; parts: ReclaimPart[] } {
  const parts: ReclaimPart[] = [{ label: "When it was lost", value: c.base }];
  const years = (s.day - c.day) / DAYS_PER_YEAR;
  let v = c.base;
  if (years > CLAIM.holdYears) {
    const f = Math.max(
      0,
      1 - (years - CLAIM.holdYears) / (CLAIM.fadeYears - CLAIM.holdYears),
    );
    parts.push({
      label: `Lost ${Math.floor(years)} years ago`,
      value: r1(v * f - v),
    });
    v *= f;
  }
  if (c.tries > 0) {
    const f = 0.5 ** c.tries;
    parts.push({
      label: `${c.tries} war${c.tries === 1 ? "" : "s"} for it lost`,
      value: r1(v * f - v),
    });
    v *= f;
  }
  if (!s.nations[c.by]?.alive) {
    parts.push({ label: "Their nation is no more", value: r1(-v) });
    v = 0;
  }
  return { total: r1(Math.max(0, v)), parts };
}

/** The day a claim fades to nothing, if nothing is done. */
export function claimEnds(c: Claim): number {
  return c.day + Math.round(CLAIM.fadeYears * DAYS_PER_YEAR);
}

/** Claims on a town, strongest first. */
export function claimsOn(s: GameState, p: number): Claim[] {
  return reclaimOf(s)
    .claims.filter((c) => c.p === p)
    .sort((a, b) => claimLive(s, b).total - claimLive(s, a).total);
}

/** A nation's claim on a town, if it has one. */
export function claimOf(s: GameState, n: number, p: number): Claim | undefined {
  return reclaimOf(s).claims.find((c) => c.by === n && c.p === p);
}

/**
 * How much a nation's armies are drawn to a town it claims, and how much
 * sooner it asks for it at the peace: its claim ÷ 40 (0 if it has none
 * worth the name, or the town isn't someone else's).
 */
export function claimPull(s: GameState, n: number, p: number): number {
  const pr = s.provinces[p];
  if (!pr || pr.owner < 0 || pr.owner === n) return 0;
  const c = claimOf(s, n, p);
  if (!c) return 0;
  const live = claimLive(s, c).total;
  return live >= CLAIM.minLive ? live / CLAIM.pull : 0;
}

// ---------------------------------------------------------------- the ferment

/** What moves a town under foreign rule towards a rising (points of its target, 0 to 100). */
export const FERMENT = {
  /** All of its people of another tongue than its rulers (so much for each share). */
  tongue: 20,
  /** All of them of another faith. */
  faith: 15,
  /** The faith counts this much more under a zealous ruler, this much less under a tolerant one. */
  zealous: 1.5,
  tolerant: 0.5,
  /** A tolerant ruler, besides. */
  tolerance: -6,
  /** No soldiers of its rulers in the town. */
  noGarrison: 8,
  /** Soldiers enough (one in 15 of its people, at least 100): −15, and down to −30 at twice that. */
  garrison: -15,
  garrisonPer: 15,
  garrisonMin: 100,
  /** Harsh rule: high taxes (a colony's), a cruel or greedy ruler; a just one eases it. */
  highTax: 8,
  cruel: 8,
  greedy: 4,
  just: -5,
  /** Hunger: so much for all of its food wanting. */
  hunger: 30,
  /** The first years are the angriest. */
  fresh: 8,
  freshYears: 3,
  /** Then they get used to it: a point a year from the fifth, up to 20. */
  usedFrom: 5,
  usedPerYear: -1,
  usedMax: -20,
  /** An army of the old owner within this many km. */
  oldArmy: 15,
  oldArmyKm: 300,
  /** The old owner at war with its rulers. */
  oldAtWar: 12,
  /** After a rising is crushed or found out: cowed for 5 years, and no other plot. */
  cowed: -30,
  cowedYears: 5,
  /** The ferment moves this share of the way to its target each month. */
  step: 0.12,
  /** A plot can form from here: a chance a month for each point above `plotFrom`. */
  plot: 70,
  plotFrom: 65,
  plotPer: 1 / 40,
  /** A player stirring the town: this much more (half on a poor showing), worked in over the months. */
  stir: 6,
  stirPoor: 2,
  stirDays: 30,
  /** A plot's people: at least this share of the town the claimant's own. */
  kin: 0.25,
};

/** Soldiers of a nation standing in a town (not marching through). */
export function garrisonOf(s: GameState, p: number, n: number): number {
  let men = 0;
  for (const a of s.armies)
    if (a.prov === p && a.owner === n && a.depart < 0)
      for (const r of a.regs) men += r.men;
  return Math.round(men);
}

/** Soldiers enough to hold a town quiet: one in 15 of its people, at least 100. */
export function garrisonNeed(pr: Province): number {
  return Math.max(
    FERMENT.garrisonMin,
    Math.round(people(pr) / FERMENT.garrisonPer),
  );
}

/** Where a town's ferment is heading under its rulers, and why. */
export function fermentTarget(
  s: GameState,
  w: World,
  p: number,
  ruler: number,
  old: number,
  rest = 0,
): { total: number; parts: ReclaimPart[] } {
  const pr = s.provinces[p];
  const R = s.nations[ruler];
  const parts: ReclaimPart[] = [];
  const add = (label: string, value: number) => {
    if (Math.abs(value) >= 0.05) parts.push({ label, value: r1(value) });
  };
  const all = people(pr);
  if (!R || all <= 0) return { total: 0, parts };
  let tongue = 0;
  let faith = 0;
  let unfed = 0;
  for (const pop of pr.pops) {
    if (pop.culture !== R.culture) tongue += pop.size;
    if (pop.religion !== R.religion) faith += pop.size;
    unfed += (1 - (pop.met?.[0] ?? 1)) * pop.size;
  }
  tongue /= all;
  faith /= all;
  unfed /= all;
  const gov = rulerOf(s, ruler);
  add(
    `${Math.round(tongue * 100)} in 100 of another tongue than the ${R.adjective}`,
    tongue * FERMENT.tongue,
  );
  const faithMul = hasTrait(gov, "tolerant")
    ? FERMENT.tolerant
    : hasTrait(gov, "zealous")
      ? FERMENT.zealous
      : 1;
  add(
    `${Math.round(faith * 100)} in 100 of another faith${faithMul > 1 ? " (a zealous ruler)" : faithMul < 1 ? " (a tolerant ruler)" : ""}`,
    faith * FERMENT.faith * faithMul,
  );
  if (hasTrait(gov, "tolerant")) add("A tolerant ruler", FERMENT.tolerance);
  const men = garrisonOf(s, p, ruler);
  const need = garrisonNeed(pr);
  const ratio = men / need;
  if (men <= 0) add("No soldiers of theirs in the town", FERMENT.noGarrison);
  else if (ratio < 1)
    add(
      `A small garrison (${men} soldiers; ${need} would hold it)`,
      FERMENT.noGarrison - (FERMENT.noGarrison - FERMENT.garrison) * ratio,
    );
  else
    add(`A garrison of ${men} soldiers`, FERMENT.garrison * Math.min(2, ratio));
  if (R.kind === "power" && R.tax === 2) add("High taxes", FERMENT.highTax);
  if (hasTrait(gov, "cruel")) add("A cruel ruler", FERMENT.cruel);
  if (hasTrait(gov, "greedy")) add("A greedy ruler", FERMENT.greedy);
  if (hasTrait(gov, "just")) add("A just ruler", FERMENT.just);
  if (unfed > 0.02) add("Hunger", unfed * FERMENT.hunger);
  const since = reclaimOf(s).held[p];
  const years = since === undefined ? 99 : (s.day - since) / DAYS_PER_YEAR;
  if (years < FERMENT.freshYears) add("Newly taken", FERMENT.fresh);
  else if (years > FERMENT.usedFrom)
    add(
      since === undefined
        ? "Long used to it"
        : `Used to it after ${Math.floor(years)} years`,
      Math.max(
        FERMENT.usedMax,
        (years - FERMENT.usedFrom) * FERMENT.usedPerYear,
      ),
    );
  const O = s.nations[old];
  if (O?.alive && old !== ruler) {
    const near = s.armies.some(
      (a) =>
        a.owner === old && kmBetween(w.map, a.prov, p) <= FERMENT.oldArmyKm,
    );
    if (near) add(`A ${O.adjective} army near`, FERMENT.oldArmy);
    if (
      s.wars.some(
        (x) => (x.a === old && x.b === ruler) || (x.b === old && x.a === ruler),
      )
    )
      add(`${nm(O.name)} at war with them`, FERMENT.oldAtWar);
  }
  if (rest > s.day) add("Cowed after the last rising", FERMENT.cowed);
  const total = Math.max(
    0,
    Math.min(100, r1(parts.reduce((m, x) => m + x.value, 0))),
  );
  return { total, parts };
}

/** The town's ferment, if it's under foreign rule. */
export function yokeOf(s: GameState, p: number): Yoke | undefined {
  return reclaimOf(s).yokes.find((y) => y.p === p);
}

/** A movement's town rising, if it's one. */
export function townRisingOf(
  s: GameState,
  m: Movement | number,
): TownRising | undefined {
  const id = typeof m === "number" ? m : m.id;
  return reclaimOf(s).risings.find((r) => r.m === id);
}

/** The chance a month that a plot forms, at this ferment. */
export function plotChance(ferment: number): number {
  return ferment < FERMENT.plot
    ? 0
    : Math.min(1, (ferment - FERMENT.plotFrom) * FERMENT.plotPer);
}

// ---------------------------------------------------------------- a rising's first night

/** How a town's rising goes on its first night: found out, beaten in the streets, or the town taken. */
export const RISING = {
  /** Found out before it begins: to begin with. */
  found: 0.12,
  /** Its rulers have a spymaster on the council. */
  spymaster: 0.08,
  /** A garrison enough to hold the town (less for less). */
  garrisonFound: 0.12,
  /** Each sworn past three: more mouths. */
  member: 0.02,
  foundMin: 0.05,
  foundMax: 0.5,
  /** In the streets the garrison counts this much more, man for man. */
  garrisonEdge: 1.5,
  seizeMin: 0.1,
  seizeMax: 0.95,
  /** Holding the town this many months wins it. */
  holdMonths: 6,
  /** Reach of the rulers' armies that could come to retake it (km). */
  reliefKm: 400,
};

/** Regiments of a hundred a rising puts in the field: from its support, sworn members and arms. */
export function hostRegiments(m: {
  support: number;
  members: number[];
  arms: number;
}): number {
  return Math.max(
    2,
    Math.min(
      10,
      2 +
        Math.floor(m.support / 20) +
        Math.floor(m.members.length / 2) +
        Math.floor(m.arms / 10),
    ),
  );
}

export interface RisingOdds {
  /** Found out before it begins. */
  found: number;
  /** Takes the town (not found out, and wins in the streets). */
  seize: number;
  /** Beaten in the streets. */
  beaten: number;
  /** Its men, and the garrison's. */
  men: number;
  garrison: number;
  /** Its rulers' soldiers within reach who'd come to take the town back. */
  relief: number;
  parts: ReclaimPart[];
}

/** A town rising's odds on its first night: exactly what's rolled. */
export function risingOdds(s: GameState, w: World, m: Movement): RisingOdds {
  const p = m.region[0];
  const pr = s.provinces[p];
  const ruler = m.against;
  const parts: ReclaimPart[] = [];
  let found = RISING.found;
  parts.push({ label: "Found out, to begin with", value: RISING.found });
  if (seatHolder(s, ruler, "spymaster")) {
    found += RISING.spymaster;
    parts.push({ label: "Their spymaster", value: RISING.spymaster });
  }
  const garrison = pr ? garrisonOf(s, p, ruler) : 0;
  const need = pr ? garrisonNeed(pr) : 100;
  if (garrison > 0) {
    const v = RISING.garrisonFound * Math.min(1, garrison / need);
    found += v;
    parts.push({ label: `A garrison of ${garrison}`, value: r2(v) });
  }
  const sworn = m.members.length + 1;
  if (sworn > 3) {
    const v = (sworn - 3) * RISING.member;
    found += v;
    parts.push({ label: `${sworn} sworn: more mouths`, value: r2(v) });
  }
  found = Math.max(RISING.foundMin, Math.min(RISING.foundMax, found));
  const men = hostRegiments(m) * 100;
  const seizeIf = Math.max(
    RISING.seizeMin,
    Math.min(RISING.seizeMax, men / (men + garrison * RISING.garrisonEdge)),
  );
  let relief = 0;
  if (pr)
    for (const a of s.armies)
      if (a.owner === ruler && kmBetween(w.map, a.prov, p) <= RISING.reliefKm)
        for (const r of a.regs) relief += r.men;
  return {
    found: r2(found),
    seize: r2((1 - found) * seizeIf),
    beaten: r2((1 - found) * (1 - seizeIf)),
    men,
    garrison,
    relief: Math.round(relief),
    parts,
  };
}

/** Who holds the town now (the rising, its rulers, or someone else). */
export function townHolder(s: GameState, p: number): number {
  return holder(s.provinces[p]);
}

// ---------------------------------------------------------------- small things

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}
function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
/** A nation's name without its article, capitalised: "England", "The Muscogee". */
export function nm(name: string): string {
  return name.replace(/^the /, "The ");
}
