// CROWN (r18): the bookkeeping of the crowns' regiments in America. Where it
// lives in the game (GameState.crown), the delta that carries it (a
// petition is its own colony's secret until it sails), the track's own dice,
// and every table the engine rolls from and the pages and the guide show:
// what each crown could spare for America in each age, the stake a war has
// for it, the Spanish fortress garrisons, and a petition's odds. What a
// player is told is what happens.
//
// The game's armies run at about a tenth of the period's: a colony keeps
// five to twenty regiments of a hundred where the real colonies mustered
// thousands. So a regiment here stands for a battalion of the period (seven
// to eight hundred on paper: Braddock's 44th and 48th had 790 and 704 in
// 1755), and a garrison is reckoned by the town's own scale.

import { formatDate } from "./Calendar";
import { councillors } from "./Council";
import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import {
  Check,
  isChildLife,
  lifeIsNative,
  lifeOfChar,
  meOf,
  no,
  officesOf,
  skillLevel,
  yes,
} from "./LifeQueries";
import { checkChance } from "./LifeRules";
import { kmBetween, type World } from "./Map";
import { findPath } from "./Paths";
import {
  ageOf,
  armyMen,
  atWar,
  charName,
  holder,
  opinionOfRuler,
  pairKey,
  provincesOf,
  stat,
  treatyBetween,
  tribesfolk,
  truceUntil,
} from "./Queries";
import { CLAIM, claimLive, claimOf, reclaimOf } from "./ReclaimCore";
import type { Rng } from "./Rng";
import { DAYS_PER_YEAR, WARRIOR_SHARE } from "./Rules";
import type {
  Army,
  Breakdown,
  CrownAsk,
  CrownSent,
  CrownState,
  GameDelta,
  GameState,
  Life,
  MapDef,
  Nation,
  War,
} from "./Types";
import { worldRng } from "./WorldRng";

// ---------------------------------------------------------------- the state

const CHANGED = new WeakSet<ConquestGame>();

/** Something changed: it goes out with the next delta. */
export function crownChanged(g: ConquestGame): void {
  CHANGED.add(g);
}

const blank = (): CrownState => ({
  sailing: [],
  sent: {},
  forts: {},
  asks: [],
  past: [],
});

/** The state, made the first time it's needed (old saves have none). */
export function crownState(g: ConquestGame): CrownState {
  const s = g.s;
  if (!s.crown) {
    s.crown = blank();
    crownChanged(g);
  }
  const c = s.crown;
  c.sailing ??= [];
  c.sent ??= {};
  c.forts ??= {};
  c.asks ??= [];
  c.past ??= [];
  return c;
}

const EMPTY: CrownState = blank();

/** Read-only: the state as it is (empty for an old save). */
export function crownOf(s: GameState): CrownState {
  const c = s.crown;
  if (!c) return EMPTY;
  return {
    sailing: c.sailing ?? [],
    sent: c.sent ?? {},
    forts: c.forts ?? {},
    asks: c.asks ?? [],
    past: c.past ?? [],
  };
}

/** What a colony's crown has sent it (made the first time it's wanted). */
export function sentRecord(g: ConquestGame, n: number): CrownSent {
  const st = crownState(g);
  return (st.sent[n] ??= {
    total: 0,
    war: 0,
    since: g.s.day,
    landings: 0,
    home: 0,
    gold: 0,
    wars: [],
  });
}

/** The state, when any of it changed since the last call (and clears it). */
export function takeCrownDelta(g: ConquestGame): CrownState | undefined {
  if (!CHANGED.has(g) || !g.s.crown) return undefined;
  CHANGED.delete(g);
  return g.s.crown;
}

export function applyCrownDelta(s: GameState, d: CrownState): void {
  s.crown = d;
}

// ---------------------------------------------------------------- secrets

/** A petition is its own colony's business until the expedition sails. */
export function askSecret(a: CrownAsk): boolean {
  return (
    a.stage === "gathering" ||
    a.stage === "sent" ||
    a.stage === "refused" ||
    a.stage === "dropped"
  );
}

/** Whether a seat may see a petition: its colony's people always; others once it has sailed. */
export function seesAsk(
  s: GameState,
  a: CrownAsk,
  seat: string | null,
): boolean {
  if (!askSecret(a)) return true;
  if (seat === null) return false;
  const life = s.lives.find((l) => l.seat === seat);
  const me = life && life.c >= 0 ? s.chars[life.c] : undefined;
  return !!me && me.nation === a.n;
}

/** The state as one seat may see it. */
export function crownView(
  s: GameState,
  st: CrownState | undefined,
  seat: string | null,
): CrownState | undefined {
  if (!st) return st;
  return {
    ...st,
    asks: (st.asks ?? []).filter((a) => seesAsk(s, a, seat)),
    past: (st.past ?? []).filter((a) => seesAsk(s, a, seat)),
  };
}

/** A delta as one seat may see it. */
export function crownDeltaForSeat(
  s: GameState,
  d: GameDelta,
  seat: string | null,
): GameDelta {
  return d.crown ? { ...d, crown: crownView(s, d.crown, seat) } : d;
}

/** The whole game as one seat may see it (on joining, and on a resync). */
export function crownStateForSeat(
  s: GameState,
  seat: string | null,
): GameState {
  return s.crown ? { ...s, crown: crownView(s, s.crown, seat) } : s;
}

// ---------------------------------------------------------------- the track's dice

/**
 * The track's own dice, from the seed, the day and a salt of its own: what
 * the crowns send, a petition's answer and its checks never move the
 * world's dice.
 */
export function kdice(s: GameState, salt: number, ...xs: number[]): Rng {
  let k = salt | 0;
  for (const x of xs) k = (Math.imul(k, 31) + (x | 0)) | 0;
  return worldRng(s, 0x18c0000 + (k & 0xfffff));
}

// ---------------------------------------------------------------- what each crown could spare

export interface CrownMeans {
  /** From this year. */
  from: number;
  /** The chance it sends at all when its colony's war begins (at a full stake), and each campaigning season after. */
  chance: number;
  /** Regiments when a war begins, and each spring after (at a full stake). */
  first: number;
  season: number;
  /** The most of its regiments it keeps in this colony at once. */
  max: number;
  /** What it sends on a petition granted: regiments of foot, and ships for a town on the coast. */
  exp: number;
  ships: number;
  /** Where the numbers come from. */
  note: string;
}

/**
 * What each crown could spare for America, by age, in the game's regiments
 * (a battalion of the period each). Britain sent regulars rarely before the
 * 1750s and then by the score; France kept its troupes de la marine in
 * Canada all along and sent line battalions from 1755; Spain kept its
 * fortress garrisons (below) and sent fleets of relief; the Dutch sent few;
 * Sweden none.
 */
export const MEANS: Record<string, CrownMeans[]> = {
  england: [
    {
      from: 0,
      chance: 0.05,
      first: 1,
      season: 0,
      max: 1,
      exp: 1,
      ships: 2,
      note: "No standing army: the colonies looked to their own militia.",
    },
    {
      from: 1655,
      chance: 0.3,
      first: 2,
      season: 1,
      max: 3,
      exp: 2,
      ships: 4,
      note: "Cromwell's Western Design took Jamaica (1655: 1,830 soldiers from England, 7,000 with the islands' recruits); Nicolls took New Amsterdam with four ships and about 300 soldiers (1664); a thousand redcoats came after Bacon's Rebellion (1676).",
    },
    {
      from: 1700,
      chance: 0.25,
      first: 4,
      season: 1,
      max: 6,
      exp: 5,
      ships: 6,
      note: "Rare, but large when they came: seven regiments, about 5,000 men, for Quebec (1711); Oglethorpe's regiment for Georgia (1738); two regiments and 6,000 marines for Cartagena (1741).",
    },
    {
      from: 1755,
      chance: 0.9,
      first: 2,
      season: 4,
      max: 24,
      exp: 8,
      ships: 10,
      note: "Braddock's two regiments (1755: 1,494 men), then twenty battalions and more: 11,000 regulars before Louisbourg alone (1758).",
    },
  ],
  france: [
    {
      from: 0,
      chance: 0.05,
      first: 1,
      season: 0,
      max: 1,
      exp: 1,
      ships: 2,
      note: "A few soldiers with the trading companies' ships.",
    },
    {
      from: 1665,
      chance: 0.4,
      first: 1,
      season: 0,
      max: 2,
      exp: 1,
      ships: 2,
      note: "The Carignan-Salières regiment against the Haudenosaunee (1665–68): twenty companies, about 1,100 men.",
    },
    {
      from: 1683,
      chance: 0.5,
      first: 1,
      season: 1,
      max: 3,
      exp: 2,
      ships: 3,
      note: "The troupes de la marine: 35 companies sent to Canada 1683–88 (1,418 soldiers there in 1688), kept at 28 companies until the Seven Years' War.",
    },
    {
      from: 1755,
      chance: 0.85,
      first: 3,
      season: 2,
      max: 12,
      exp: 4,
      ships: 6,
      note: "Line battalions from 1755: six under Dieskau, two more with Montcalm (1756), four at Louisbourg (1758); 40 companies of marines; about 10,000 regulars at the peak (1757).",
    },
  ],
  spain: [
    {
      from: 0,
      chance: 0.5,
      first: 2,
      season: 1,
      max: 5,
      exp: 3,
      ships: 4,
      note: "Fleets of relief from Spain and Havana: over 200 infantry to St. Augustine under siege (1702); nearly 1,900 men from 36 ships against Georgia (1742).",
    },
  ],
  netherlands: [
    {
      from: 0,
      chance: 0.2,
      first: 1,
      season: 0,
      max: 1,
      exp: 1,
      ships: 4,
      note: "Few: the West India Company's soldiers, and Evertsen's fleet of 600 marines and sailors that retook New York (1673).",
    },
  ],
};

/** What a colony's crown could spare in this year (none for a colony on its own). */
export function meansOf(s: GameState, n: number): CrownMeans | undefined {
  const nation = s.nations[n];
  if (!nation || nation.kind !== "power") return undefined;
  if (nation.independent || nation.rebelling || nation.gov) return undefined;
  const table = MEANS[nation.key];
  if (!table) return undefined;
  const year = Math.floor(s.day / DAYS_PER_YEAR) + 1607;
  let out: CrownMeans | undefined;
  for (const m of table) if (year >= m.from) out = m;
  return out;
}

/** The colony pays each regiment's passage and victuals when it lands (gold). */
export const PASSAGE = 15;

/** Days at sea from Europe (from the day they sail to the day they land). */
export const CROSSING = { min: 45, max: 75 };

/** When the spring's reinforcement sails (the month, 0 = January). */
export const SEASON_MONTH = 2;

/** What a war is to the crown: the stake its regiments are sent by. */
export const STAKE = {
  /** The crowns are at war in Europe. */
  europe: 1,
  /** A war to take back a town the colony lost. */
  claim: 0.8,
  /** A war with another crown's colony, not Europe's. */
  power: 0.5,
  /** A war with a native nation. */
  native: 0.35,
  /** An ally's war, or a tributary's. */
  ally: 0.3,
  /** The enemy holds the colony's own towns; its capital is besieged or held. */
  lost: 0.3,
  capital: 0.3,
  max: 1,
};

/** The colony's wars a crown might send for: against a colony or a native nation (not a rising, not its own crown). */
export function crownWars(s: GameState, n: number): War[] {
  return s.wars.filter((w) => {
    if (w.a !== n && w.b !== n) return false;
    const foe = s.nations[w.a === n ? w.b : w.a];
    return !!foe && (foe.kind === "power" || foe.kind === "native");
  });
}

/** A war's key, so each is answered once. */
export const warKey = (w: War): string => `${w.a}-${w.b}-${w.start}`;

/** What a war is to the colony's crown (0 to 1), and why. */
export function warStake(s: GameState, n: number, w: War): Breakdown {
  const foe = s.nations[w.a === n ? w.b : w.a];
  const e = new Explain();
  if (!foe) return e.done(2, 0, 1);
  const europe = w.europe || s.europe.wars[pairKey(n, foe.id)] !== undefined;
  if (europe) e.add(`The crowns at war in Europe`, STAKE.europe);
  else if (/^To take back/.test(w.why))
    e.add(w.why.replace(/^To/, "A war to"), STAKE.claim);
  else if (/^Defending|^Called to war/.test(w.why))
    e.add(`${w.why}: an ally's war`, STAKE.ally);
  else if (foe.kind === "native")
    e.add(`A war with ${foe.name.replace(/^the /, "the ")}`, STAKE.native);
  else e.add(`A quarrel with ${foe.name}, not Europe's`, STAKE.power);
  const held = s.provinces.filter(
    (pr) => pr.owner === n && pr.occupier === foe.id,
  ).length;
  if (held) e.add(`They hold ${held} of the colony's towns`, STAKE.lost);
  const cap = s.provinces[s.nations[n].capital];
  if (cap && (cap.occupier === foe.id || cap.siege?.by === foe.id))
    e.add("The capital besieged or held", STAKE.capital);
  return e.done(2, 0, STAKE.max);
}

/** The colony's greatest stake in its wars now, and the war it's for. */
export function stakeOf(
  s: GameState,
  n: number,
): { stake: Breakdown; war?: War } {
  let best: { stake: Breakdown; war?: War } = {
    stake: { total: 0, parts: [] },
  };
  for (const w of crownWars(s, n)) {
    const b = warStake(s, n, w);
    if (b.total > best.stake.total) best = { stake: b, war: w };
  }
  return best;
}

/** The chance the crown sends regiments for a stake, and how many (before the purse and the cap). */
export function sendOdds(
  m: CrownMeans,
  stake: number,
  first: boolean,
): { chance: number; regs: number } {
  const per = first ? m.first : m.season;
  if (per <= 0 || stake <= 0) return { chance: 0, regs: 0 };
  const regs = Math.max(first ? 1 : 0, Math.round(per * stake));
  if (regs <= 0) return { chance: 0, regs: 0 };
  return { chance: Math.round(m.chance * stake * 1000) / 1000, regs };
}

// ---------------------------------------------------------------- the fortress garrisons

/**
 * The crowns' standing garrisons, renewed from Europe every year while the
 * crown holds the town: Spain's fortress ports (the situado from Mexico paid
 * them, and the fleet brought the men), and France's troupes de la marine,
 * sent to Canada from 1683 and kept there all along. Men by the town's own
 * scale in the game (St. Augustine has some 850 settlers here, 1,500 to
 * 1,700 in life, and kept 200 to 750 soldiers). Cartagena, the greatest of
 * Spain's, lies off this map.
 */
export const FORTS: {
  name: string;
  key: string;
  men: number;
  from: number;
  note: string;
}[] = [
  {
    name: "Havana",
    key: "spain",
    men: 200,
    from: 1589,
    note: "El Morro and La Punta, built 1589–1630; 1,900 regulars before the British siege of 1762, after the fevers.",
  },
  {
    name: "St. Augustine",
    key: "spain",
    men: 100,
    from: 1607,
    note: "Two companies after 1587 and three from 1687; 174 regulars and 14 gunners under Moore's siege (1702), 750 under Oglethorpe's (1740); the Castillo de San Marcos, 1672–95.",
  },
  {
    name: "Veracruz",
    key: "spain",
    men: 100,
    from: 1607,
    note: "San Juan de Ulúa, the treasure fleet's harbour.",
  },
  {
    name: "San Juan",
    key: "spain",
    men: 100,
    from: 1607,
    note: "El Morro of San Juan.",
  },
  {
    name: "Portobelo",
    key: "spain",
    men: 100,
    from: 1607,
    note: "San Felipe and Santiago, the forts of the fair.",
  },
  {
    name: "Santo Domingo",
    key: "spain",
    men: 50,
    from: 1607,
    note: "The Fortaleza Ozama.",
  },
  {
    name: "Campeche",
    key: "spain",
    men: 50,
    from: 1686,
    note: "Walled from 1686 against the buccaneers.",
  },
  {
    name: "Pensacola",
    key: "spain",
    men: 50,
    from: 1698,
    note: "Santa María de Galve (1698): two companies.",
  },
  {
    name: "Quebec",
    key: "france",
    men: 100,
    from: 1683,
    note: "The troupes de la marine: 35 companies sent 1683–88, 1,418 soldiers in Canada in 1688, 28 companies kept until the Seven Years' War.",
  },
  {
    name: "Hochelaga",
    key: "france",
    men: 50,
    from: 1683,
    note: "Montreal's companies of the marine, at the head of the fur trade.",
  },
  {
    name: "Île Royale",
    key: "france",
    men: 100,
    from: 1720,
    note: "Louisbourg, built from 1720: twenty companies of the marine in the Seven Years' War.",
  },
  {
    name: "Mobile",
    key: "france",
    men: 50,
    from: 1702,
    note: "Louisiana's companies of the marine, at Mobile from 1702.",
  },
];

/** When the yearly draft for the garrisons sails with the fleet (the month). */
export const FORT_MONTH = 4;

/** The fortress ports on this map, and their province. */
export function fortPorts(map: MapDef): { p: number; f: (typeof FORTS)[0] }[] {
  const out: { p: number; f: (typeof FORTS)[0] }[] = [];
  for (const f of FORTS) {
    const p = map.provinces.findIndex((x) => x.name === f.name);
    if (p >= 0) out.push({ p, f });
  }
  return out;
}

/** Whether an army is a fortress's garrison (the computer never marches it off). */
export function isGarrison(s: GameState, a: Army): boolean {
  const f = crownOf(s).forts[a.prov];
  return !!f && f.army === a.id && a.owner === f.n;
}

/** The garrison standing in a fortress now, if any. */
export function garrisonArmy(s: GameState, p: number): Army | undefined {
  const f = crownOf(s).forts[p];
  if (f?.army === undefined) return undefined;
  return s.armies.find((a) => a.id === f.army && a.owner === f.n);
}

// ---------------------------------------------------------------- the crown's regiments in America

/** The crown's regiments a colony has in America (of a kind, or all). */
export function crownRegs(
  s: GameState,
  n: number,
  kind?: "war" | "fort",
): number {
  let k = 0;
  for (const a of s.armies)
    if (a.owner === n)
      for (const r of a.regs) if (r.crown && (!kind || r.crown === kind)) k++;
  return k;
}

/** The crown's men a colony has in America (of a kind, or all). */
export function crownMen(
  s: GameState,
  n: number,
  kind?: "war" | "fort",
): number {
  let m = 0;
  for (const a of s.armies)
    if (a.owner === n)
      for (const r of a.regs)
        if (r.crown && (!kind || r.crown === kind)) m += r.men;
  return Math.round(m);
}

/** Whether an army is mostly the crown's men from Europe (sent for a war). */
export function crownArmy(a: Army): boolean {
  let mine = 0;
  for (const r of a.regs) if (r.crown === "war") mine += r.men;
  return mine > 0 && mine * 2 >= armyMen(a);
}

/** The expedition an army is, if it's one under way. */
export function expeditionOfArmy(s: GameState, a: Army): CrownAsk | undefined {
  return crownOf(s).asks.find((x) => x.army === a.id && x.stage === "landed");
}

/**
 * Where the crown's regiments go first, for the war's aims: an expedition's
 * town; then a town of the colony's own the enemy holds; then a town it
 * lost and claims, held by an enemy it's at war with (the strongest claim).
 */
export function crownAim(s: GameState, n: number): number {
  let best = -1;
  let bestV = 0;
  for (let p = 0; p < s.provinces.length; p++) {
    const pr = s.provinces[p];
    if (pr.owner === n && pr.occupier >= 0 && atWar(s, n, pr.occupier)) {
      const v = 100 + (s.nations[n].capital === p ? 50 : 0);
      if (v > bestV) {
        best = p;
        bestV = v;
      }
      continue;
    }
    if (pr.owner < 0 || pr.owner === n) continue;
    const h = holder(pr);
    if (h === n || !atWar(s, n, h)) continue;
    const c = claimOf(s, n, p);
    if (!c) continue;
    const v = claimLive(s, c).total;
    if (v >= CLAIM.minLive && v > bestV) {
      best = p;
      bestV = v;
    }
  }
  return best;
}

/**
 * Where regiments sent to a colony land: its own port nearest the aim from
 * which they can march there (or its main port, with no aim), or, holding
 * no such port, a landing in force on the coast nearest the aim that has a
 * way to it (the aim itself, if it's on the coast).
 */
export function landingFor(
  s: GameState,
  map: MapDef,
  n: number,
  aim: number,
): { port: number; force: boolean } | null {
  const own = provincesOf(s, n).filter(
    (p) =>
      s.provinces[p].occupier < 0 &&
      (s.provinces[p].b.port ?? 0) > 0 &&
      map.provinces[p].coastal,
  );
  const at = aim >= 0 ? aim : s.nations[n].capital;
  const near = (a: number, b: number) =>
    kmBetween(map, a, at) - kmBetween(map, b, at) || a - b;
  if (at < 0) return own.length ? { port: own[0], force: false } : null;
  own.sort(near);
  if (aim < 0) return own.length ? { port: own[0], force: false } : null;
  // A port within a march of the aim (an island's port won't do for the mainland).
  for (const p of own.slice(0, 4))
    if (p === aim || findPath(s, map, n, p, aim, 1))
      return { port: p, force: false };
  if (map.provinces[aim].coastal) return { port: aim, force: true };
  const coast: number[] = [];
  for (let p = 0; p < map.provinces.length; p++)
    if (map.provinces[p].coastal) coast.push(p);
  coast.sort(near);
  for (const p of coast.slice(0, 6))
    if (findPath(s, map, n, p, aim, 1)) return { port: p, force: true };
  return own.length ? { port: own[0], force: false } : null;
}

// ---------------------------------------------------------------- a petition for an expedition

/** A petition to the crown for an expedition to retake a town (EXPEDITION's odds read every figure here). */
export const EXPEDITION = {
  /** An agent's fee in London (or Paris, Madrid, The Hague) to begin, and his retainer a month while it runs. */
  fee: 6,
  retainer: 1,
  /** Days it gathers support, then days at sea and before the crown's ministers. */
  gather: 120,
  voyage: 60,
  /** After one is refused or fails, the colony waits this long before another. */
  rest: 2 * DAYS_PER_YEAR,
  /** The governor's own asking: letters from the council and the house (persuasion), friends at court (letters). */
  lettersEvery: 21,
  lettersDc: 7,
  courtEvery: 45,
  courtDc: 8,
  postage: 2,
  maxCourt: 3,
  /** A councillor or member who's a player adds his own letter; anyone of standing can write to court for it. */
  courtRenown: 20,
  /** The crown is slow to send its regiments across the sea. */
  base: -0.1,
  /** The claim's weight: a point of it in 250 (a claim of 50 is +20 in 100). */
  claimPer: 1 / 250,
  /** At war with the town's holder already; more, if the crowns are at war in Europe. */
  atWar: 0.25,
  europe: 0.1,
  /** In peace against another crown's colony, it would mean war between the crowns... */
  peacePower: -0.3,
  /** ...unless they're near war already: tension in Europe, a point in 400. */
  tensionPer: 1 / 400,
  /** Against a native nation, in peace, the crown asks only whether it's worth it. */
  peaceNative: 0,
  /** Busy elsewhere: each war its crown fights in Europe with another. */
  busy: -0.1,
  busyMax: -0.2,
  /** The colony's favour with the crown: 50 counts for nothing. */
  trustMid: 50,
  trustPer: 1 / 200,
  trustMax: 0.2,
  /** The governor's own favour at home (a player's), or the computer governor's friends at home. */
  favorPer: 1 / 800,
  favorMax: 0.1,
  npcMax: 0.08,
  /** His case (CHAIR's reckoning: renown, favour, offices, skill), a point in 2,000. */
  casePer: 1 / 2000,
  caseMax: 0.06,
  /** The colony's offer: each regiment it raises; each 25 gold voted (or coins paid in). */
  men: 0.04,
  menMax: 0.16,
  goldPer: 1 / 2500,
  goldMax: 0.12,
  /** Letters for it: each councillor's, each member's; each friend at court. */
  council: 0.04,
  councilMax: 0.12,
  house: 0.02,
  houseMax: 0.08,
  court: 0.04,
  /** The holder's men within this reach of the town (km), against what would sail: past this share, a point in 100 for each... */
  reach: 500,
  oddsFrom: 0.7,
  oddsPer: 0.3,
  oddsMax: 0.4,
  /** Never likelier than this, nor less likely than 3 in 100. */
  min: 0.03,
  max: 0.8,
  /** The most a colony can offer: regiments, and gold. */
  offerMen: 4,
  offerGold: 300,
  /** Granted: the crown's general gives up a year and a half after landing if the town isn't taken. */
  campaignDays: 540,
  /** Held, it waits on the peace; but the crown recalls it this long after it landed, held or not. */
  recallDays: 3 * DAYS_PER_YEAR,
  /** Taken back: renown and favour; failed: favour lost (and the claim halved); refused: a little, or a little gained. */
  wonRenown: 10,
  wonFavour: 6,
  failedFavour: -6,
  refusedFavour: -2,
  modestFavour: 2,
  /** A rider's renown when the town is taken. */
  riderRenown: 5,
  /** The colony's favour: a town retaken, an expedition lost. */
  colonyWon: 8,
  colonyFailed: -8,
};

/** The odds a computer governor wants before he petitions (lower when a player has asked him). */
export const NPC_ASK = {
  min: 0.3,
  asked: 0.2,
  chance: 0.2,
  /** The support he reckons on gathering in the four months (two letters from each, a friend at court). */
  expect: { council: [-1, -2], house: [-1, -2], court: 1 },
};

/** The house's mind on the colony's offer (offerOdds reads every figure here). */
export const OFFER = {
  /** A house votes men and money for its own towns as often as not. */
  base: 0.6,
  /** Each regiment asked of the colony; each 100 gold, as a share of the treasury. */
  perMan: -0.07,
  treasuryPer: -0.6,
  /** Its own people there: the claim's weight helps. */
  claimPer: 1 / 300,
  /** War weariness, a point in 100; grievances against the governor. */
  weary: -0.01,
  grievance: -0.08,
  min: 0.05,
  max: 0.95,
  /** A house that turned it down won't hear it again for this long. */
  again: 30,
};

/** A claimed town a colony could petition for: held by another (a colony or a native nation). */
export interface ClaimedTown {
  p: number;
  holder: number;
  claim: number;
}

/** Towns a colony claims, held by others: what it could ask the crown to take back. */
export function claimedTowns(s: GameState, n: number): ClaimedTown[] {
  const out: ClaimedTown[] = [];
  for (const c of reclaimOf(s).claims) {
    if (c.by !== n) continue;
    const pr = s.provinces[c.p];
    if (!pr || pr.owner < 0 || pr.owner === n) continue;
    const H = s.nations[pr.owner];
    if (!H?.alive || (H.kind !== "power" && H.kind !== "native")) continue;
    const claim = claimLive(s, c).total;
    if (claim < CLAIM.minLive) continue;
    out.push({ p: c.p, holder: pr.owner, claim });
  }
  return out.sort((a, b) => b.claim - a.claim || a.p - b.p);
}

/** The colony's petition or expedition under way, if any (one at a time). */
export function askOf(s: GameState, n: number): CrownAsk | undefined {
  return crownOf(s).asks.find((a) => a.n === n);
}

/** The last one done for a colony (the most recent first). */
export function lastAsk(s: GameState, n: number): CrownAsk | undefined {
  const past = crownOf(s).past.filter((a) => a.n === n);
  return past[past.length - 1];
}

/** Coins paid in by players. */
export const paidIn = (a: { paid: Record<string, number> }): number =>
  Object.values(a.paid).reduce((m, v) => m + v, 0);

/** The governor of a colony, if there is one alive. */
function governorOf(s: GameState, n: number) {
  const c = s.chars[s.nations[n]?.ruler ?? -1];
  return c?.alive ? c : undefined;
}

/**
 * The chance the crown grants a petition for an expedition to take back
 * town `p`, as it stands: the claim's weight, the crown's war footing with
 * the town's holder, whether it's busy elsewhere, the colony's favour and
 * the governor's own, the colony's offer, letters from the council and the
 * house, and friends at court. The answer rolls exactly this.
 */
export function expeditionOdds(
  s: GameState,
  map: MapDef,
  n: number,
  p: number,
  ask: Pick<
    CrownAsk,
    "men" | "gold" | "paid" | "council" | "house" | "court"
  > | null,
  by: number,
): Breakdown {
  const e = new Explain();
  const nation = s.nations[n];
  const pr = s.provinces[p];
  const h = pr ? pr.owner : -1;
  const H = s.nations[h];
  const X = EXPEDITION;
  if (!nation || !H || h === n || !meansOf(s, n)) return e.done(3, 0, 0);
  const war = atWar(s, n, h);
  if (!war && truceUntil(s, n, h) > s.day) {
    e.add(
      `A truce holds with ${H.name.replace(/^the /, "the ")}: the crown won't break it`,
      -1,
      true,
    );
    return e.done(3, 0, 0);
  }
  if (!war && treatyBetween(s, n, h, "alliance")) {
    e.add("They're your allies: the crown won't make war on them", -1, true);
    return e.done(3, 0, 0);
  }
  e.add("The crown is slow to send its regiments across the sea", X.base, true);
  const c = claimOf(s, n, p);
  const claim = c ? claimLive(s, c).total : 0;
  e.add(`The claim (${Math.round(claim)})`, pct(claim * X.claimPer));
  // Whether it could be done: the holder's men near the town against what would sail.
  const near = menNear(s, map, h, p);
  const size = expeditionSize(s, map, n, p);
  const force =
    (size.regs + size.guns + squadronGuns(size.ships) + (ask?.men ?? 0)) * 100;
  const ratio = near / Math.max(100, force);
  if (ratio > X.oddsFrom)
    e.add(
      `${Math.round(near)} of theirs near ${map.provinces[p].name}, against ${force} who'd sail`,
      pct(-Math.min(X.oddsMax, (ratio - X.oddsFrom) * X.oddsPer)),
    );
  if (war) {
    e.add(`At war with ${H.name.replace(/^the /, "the ")} already`, X.atWar);
    if (s.europe.wars[pairKey(n, h)] !== undefined)
      e.add("The crowns at war in Europe", X.europe);
  } else if (H.kind === "power") {
    e.add(
      `In peace with ${H.name}: it would mean war between the crowns`,
      X.peacePower,
    );
    const t = s.europe.tension[pairKey(n, h)] ?? 0;
    if (t > 0)
      e.add(
        `The crowns near war (tension ${Math.round(t)})`,
        pct(t * X.tensionPer),
      );
  } else if (X.peaceNative)
    e.add(`In peace with ${H.name.replace(/^the /, "the ")}`, X.peaceNative);
  let busy = 0;
  for (const k of Object.keys(s.europe.wars)) {
    const [a, b] = k.split("-").map(Number);
    if ((a === n || b === n) && a !== h && b !== h) busy++;
  }
  if (busy)
    e.add(
      `The crown busy with ${busy === 1 ? "another war" : `${busy} other wars`} in Europe`,
      Math.max(X.busyMax, busy * X.busy),
    );
  e.add(
    `The crown's trust in the colony (favour ${Math.round(nation.favor)})`,
    pct(
      clamp((nation.favor - X.trustMid) * X.trustPer, -X.trustMax, X.trustMax),
    ),
  );
  const life = lifeOfChar(s, by);
  const gov = s.chars[by];
  if (life) {
    if (life.favor > 0)
      e.add(
        `Your favour at home (${Math.round(life.favor)})`,
        pct(Math.min(X.favorMax, life.favor * X.favorPer)),
      );
    const kase = caseOf(s, life);
    if (kase > 0)
      e.add(
        `Your case with the crown (${Math.round(kase)})`,
        pct(Math.min(X.caseMax, kase * X.casePer)),
      );
  } else if (gov)
    e.add(
      `${charName(gov)}'s friends at home`,
      pct(
        Math.min(X.npcMax, (stat(s, gov, "dip") + stat(s, gov, "ste")) / 180),
      ),
    );
  if (ask) {
    if (ask.men > 0)
      e.add(
        `The colony raises ${ask.men} regiment${ask.men === 1 ? "" : "s"}`,
        pct(Math.min(X.menMax, ask.men * X.men)),
      );
    const money = ask.gold + paidIn(ask);
    if (money > 0)
      e.add(
        `The colony pays ${Math.round(money)} toward it`,
        pct(Math.min(X.goldMax, money * X.goldPer)),
      );
    if (ask.council.length)
      e.add(
        `Councillors' letters (${ask.council.length})`,
        pct(Math.min(X.councilMax, ask.council.length * X.council)),
      );
    if (ask.house.length)
      e.add(
        `Members' letters (${ask.house.length})`,
        pct(Math.min(X.houseMax, ask.house.length * X.house)),
      );
    if (ask.court)
      e.add(
        `Friends at court who'll speak for it (${ask.court})`,
        pct(ask.court * X.court),
      );
  }
  return e.done(3, X.min, X.max);
}

/** CHAIR's case for the chair, by its own reckoning (renown, favour, offices, skill). */
function caseOf(s: GameState, life: Life): number {
  const me = meOf(s, life);
  if (!me) return 0;
  const offices = officesOf(s, me.id);
  return (
    life.renown +
    life.favor * 1.5 +
    (offices.some((o) => o.kind === "council") ? 25 : 0) +
    stat(s, me, "dip") +
    stat(s, me, "ste")
  );
}

/** The house's chance to vote the colony's offer: men and money for the expedition. */
export function offerOdds(
  s: GameState,
  n: number,
  p: number,
  men: number,
  gold: number,
): Breakdown {
  const e = new Explain();
  const nation = s.nations[n];
  if (!nation) return e.done(3, 0, 0);
  const O = OFFER;
  e.add("A house votes for its own towns as often as not", O.base, true);
  if (men > 0)
    e.add(
      `${men} regiment${men === 1 ? "" : "s"} raised in the colony`,
      pct(men * O.perMan),
    );
  if (gold > 0)
    e.add(
      `${Math.round(gold)} gold of the treasury's ${Math.round(Math.max(0, nation.gold))}`,
      pct(Math.max(-0.5, (gold / Math.max(50, nation.gold)) * O.treasuryPer)),
    );
  const c = claimOf(s, n, p);
  if (c) {
    const v = claimLive(s, c).total;
    e.add(
      `Their own town, wanted back (claim ${Math.round(v)})`,
      pct(v * O.claimPer),
    );
  }
  if (nation.warExhaustion > 0)
    e.add(
      `War weariness (${Math.round(nation.warExhaustion)})`,
      pct(nation.warExhaustion * O.weary),
    );
  const griev = nation.chair?.grievances ?? 0;
  if (griev)
    e.add(
      `Grievances against the governor (${griev})`,
      pct(griev * O.grievance),
    );
  return e.done(3, O.min, O.max);
}

/** What an expedition granted would bring: the crown's regiments, guns, ships. */
export function expeditionSize(
  s: GameState,
  map: MapDef,
  n: number,
  p: number,
): { regs: number; guns: number; ships: number } {
  const m = meansOf(s, n);
  if (!m) return { regs: 0, guns: 0, ships: 0 };
  // Enough, with the colony's share, to outnumber the holder's men near the town by half again.
  const h = s.provinces[p]?.owner ?? -1;
  const want = Math.ceil((menNear(s, map, h, p) * 1.5) / 100);
  const regs = Math.max(m.exp, Math.min(m.exp * 2, want));
  const guns = Math.max(1, Math.round(regs / 4));
  const ships = map.provinces[p]?.coastal ? m.ships : 0;
  return { regs, guns, ships };
}

/** A native nation at war calls up this share of its warriors (as its own council does: Ai.ts). */
export const NATIVE_CALL = 0.7;

/**
 * The holder's men who could stand against an expedition at a town: its
 * armies within reach, and for a native nation the warriors its towns near
 * would call up at war.
 */
export function menNear(
  s: GameState,
  map: MapDef,
  h: number,
  p: number,
): number {
  if (h < 0) return 0;
  let men = 0;
  for (const a of s.armies)
    if (a.owner === h && kmBetween(map, a.prov, p) <= EXPEDITION.reach)
      men += armyMen(a);
  if (s.nations[h]?.kind === "native")
    for (const q of provincesOf(s, h))
      if (kmBetween(map, q, p) <= EXPEDITION.reach)
        men += tribesfolk(s.provinces[q]) * WARRIOR_SHARE * NATIVE_CALL;
  return Math.round(men);
}

/** The squadron's guns, landed for the siege: a regiment of guns for every three ships. */
export const squadronGuns = (ships: number): number => Math.floor(ships / 3);

// ---------------------------------------------------------------- who can do what

/** The governor of the colony, a player: can he begin a petition for this town now. */
export function beginCheck(s: GameState, life: Life, p: number): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're grown.");
  if (lifeIsNative(s, life)) return no("Your people answer to no crown.");
  const n = me.nation;
  const nation = s.nations[n];
  if (!meansOf(s, n))
    return no("Only a crown's colony can ask its crown for regiments.");
  if (nation.ruler !== me.id)
    return no(
      "Only the governor petitions the crown for an expedition: ask him.",
    );
  const town = claimedTowns(s, n).find((x) => x.p === p);
  if (!town) return no("Your colony has no claim on that town.");
  const cur = askOf(s, n);
  if (cur)
    return no(
      cur.p === p
        ? "Your petition for it is under way."
        : "One expedition at a time: a petition is under way already.",
    );
  const last = lastAsk(s, n);
  if (
    last &&
    (last.stage === "refused" || last.stage === "failed") &&
    s.day - (last.ended ?? last.answer) < EXPEDITION.rest
  )
    return no(
      `The crown won't hear another so soon (from ${formatDate(
        (last.ended ?? last.answer) + EXPEDITION.rest,
      )}).`,
    );
  const h = town.holder;
  if (!atWar(s, n, h) && truceUntil(s, n, h) > s.day)
    return no("A truce holds with them: the crown won't break it.");
  if (!atWar(s, n, h) && treatyBetween(s, n, h, "alliance"))
    return no("They're your allies.");
  if (life.purse < EXPEDITION.fee)
    return no(`An agent at court wants ${EXPEDITION.fee} coins to begin.`);
  return yes;
}

/** The petition a player, of the colony, could help with now (gathering or sent). */
export function helpable(s: GameState, life: Life): CrownAsk | undefined {
  const me = meOf(s, life);
  if (!me) return undefined;
  const a = askOf(s, me.nation);
  return a && (a.stage === "gathering" || a.stage === "sent") ? a : undefined;
}

/** Can you pay into the colony's share now. */
export function pledgeCheck(s: GameState, life: Life, coins: number): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're grown.");
  const a = helpable(s, life);
  if (!a) return no("There's no petition under way.");
  if (a.stage !== "gathering") return no("It has sailed.");
  if (!(coins > 0)) return no("How much?");
  if (life.purse < coins) return no(`You haven't ${coins} coins.`);
  return yes;
}

/** Can you ask the governor to petition for this town. */
export function askGovCheck(s: GameState, life: Life, p: number): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're grown.");
  if (lifeIsNative(s, life)) return no("Your people answer to no crown.");
  const n = me.nation;
  if (!meansOf(s, n)) return no("Your colony has no crown to ask.");
  if (s.nations[n].ruler === me.id)
    return no("You govern: petition the crown yourself.");
  if (!claimedTowns(s, n).some((x) => x.p === p))
    return no("Your colony has no claim on that town.");
  if (askOf(s, n)) return no("A petition is under way already.");
  if (ageOf(s, me) < 21) return no("Not before 21.");
  const left = (life.cooldowns["crown:ask"] ?? 0) - s.day;
  if (left > 0) return no(`You asked lately: again in ${left} days.`);
  return yes;
}

/** Can you write to friends at court for the petition now (the governor, or anyone of standing). */
export function courtCheck(s: GameState, life: Life): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  const a = helpable(s, life);
  if (!a) return no("There's no petition under way.");
  if (a.stage !== "gathering") return no("It has sailed.");
  if (a.court >= EXPEDITION.maxCourt)
    return no("Friends at court are all writing for it.");
  if (me.id !== a.by && life.renown < EXPEDITION.courtRenown)
    return no(
      `The court hears a name it knows (renown ${EXPEDITION.courtRenown}).`,
    );
  const left = (life.cooldowns["crown:court"] ?? 0) - s.day;
  if (left > 0) return no(`Again in ${left} day${left === 1 ? "" : "s"}.`);
  if (life.purse < EXPEDITION.postage)
    return no(`Postage: ${EXPEDITION.postage} coins.`);
  return yes;
}

/** Can the governor go round the council and the house for letters now. */
export function lettersCheck(s: GameState, life: Life): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  const a = helpable(s, life);
  if (!a || a.by !== me.id) return no("You have no petition under way.");
  if (a.stage !== "gathering") return no("It has sailed.");
  const left = (life.cooldowns["crown:letters"] ?? 0) - s.day;
  if (left > 0) return no(`Again in ${left} day${left === 1 ? "" : "s"}.`);
  const asked = new Set([...a.council, ...a.house, ...a.refused]);
  if (!letterPool(s, a.n, me.id).some((c) => !asked.has(c)))
    return no("Everyone at the table and in the house has been asked.");
  return yes;
}

/** Can a councillor or member who's a player put his own letter to it. */
export function writeCheck(s: GameState, life: Life): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  const a = helpable(s, life);
  if (!a) return no("There's no petition under way.");
  if (a.stage !== "gathering") return no("It has sailed.");
  if (a.by === me.id) return no("It's yours.");
  if ([...a.council, ...a.house].includes(me.id))
    return no("Your letter is with it.");
  const offices = officesOf(s, me.id);
  if (!offices.some((o) => o.kind === "council" || o.kind === "assembly"))
    return no("A councillor's or a member's letter: you sit in neither.");
  return yes;
}

/** Can the governor put the colony's offer to the house. */
export function offerCheck(
  s: GameState,
  life: Life,
  men: number,
  gold: number,
): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  const a = helpable(s, life);
  if (!a || a.by !== me.id) return no("You have no petition under way.");
  if (a.stage !== "gathering") return no("It has sailed.");
  if (!Number.isInteger(men) || men < 0 || men > EXPEDITION.offerMen)
    return no(`Between none and ${EXPEDITION.offerMen} regiments.`);
  if (!Number.isFinite(gold) || gold < 0 || gold > EXPEDITION.offerGold)
    return no(`Between none and ${EXPEDITION.offerGold} gold.`);
  if (men === 0 && gold === 0) return no("Offer something.");
  if (gold > Math.max(0, s.nations[a.n].gold))
    return no(
      `The treasury has ${Math.floor(Math.max(0, s.nations[a.n].gold))} gold.`,
    );
  if (a.balked !== undefined && s.day - a.balked < OFFER.again)
    return no(
      `The house turned it down lately: again in ${OFFER.again - (s.day - a.balked)} days.`,
    );
  return yes;
}

/** Can you ride with the expedition now: it's landed, and you're where its army stands. */
export function rideCheck(s: GameState, life: Life): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're grown.");
  const a = askOf(s, me.nation);
  if (!a || (a.stage !== "landed" && a.stage !== "granted"))
    return no("No expedition of your colony is in the field.");
  if (a.riders.includes(life.seat)) return no("You ride with it.");
  if (a.stage !== "landed") return no("It hasn't landed yet.");
  const army = s.armies.find((x) => x.id === a.army);
  if (!army) return no("Its army is no more.");
  if (army.commander === me.id) return no("You command it.");
  if (life.travel || life.prov !== army.prov)
    return no("Go where its army is to join it.");
  if (life.job?.army !== undefined && life.job.army >= 0)
    return no("You march with an army already.");
  return yes;
}

/** Councillors and members of the house a petition could ask for letters. */
export function letterPool(s: GameState, n: number, by: number): number[] {
  const ids = new Set<number>();
  for (const x of councillors(s, n)) ids.add(x.c);
  for (const c of s.polities[n]?.assembly ?? []) ids.add(c);
  ids.delete(by);
  return [...ids]
    .filter(
      (c) =>
        s.chars[c]?.alive &&
        !s.chars[c].abroad &&
        s.chars[c].nation === n &&
        !lifeOfChar(s, c),
    )
    .sort((a, b) => a - b);
}

/** Whether one of the computer's people would write for the expedition (he likes the governor, or likes a fight). */
export function wouldWrite(s: GameState, n: number, c: number): boolean {
  const ch = s.chars[c];
  if (!ch?.alive || ch.nation !== n) return false;
  const op = opinionOfRuler(s, ch).total;
  const bold = ch.traits.includes("brave") || ch.traits.includes("ambitious");
  return op >= 10 || (bold && op > -20);
}

/** Whether someone sits on the council (not just in the house). */
export function onCouncil(s: GameState, n: number, c: number): boolean {
  return councillors(s, n).some((x) => x.c === c);
}

/** A colony whose governor is a player. */
export function playerGoverns(s: GameState, n: number): Life | undefined {
  const gov = governorOf(s, n);
  return gov ? lifeOfChar(s, gov.id) : undefined;
}

// ---------------------------------------------------------------- words

const WORDS = [
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
];
/** "Two", "Fourteen" (a number in words, capitalised, for the news). */
export const inWords = (k: number): string => WORDS[k] ?? String(k);

/** "Two regiments of English foot and one of guns". */
export function regimentsWords(
  adjective: string,
  foot: number,
  guns: number,
): string {
  const f = `${inWords(foot)} regiment${foot === 1 ? "" : "s"} of ${adjective} foot`;
  return guns > 0
    ? `${f} and ${inWords(guns).toLowerCase()} of guns`
    : foot > 0
      ? f
      : `${inWords(guns)} regiment${guns === 1 ? "" : "s"} of ${adjective} guns`;
}

/** The odds of a skill check, as the track rolls it (the same formula every act shows). */
export function skillOdds(
  s: GameState,
  life: Life,
  sk: "persuasion" | "letters",
  dc: number,
): number {
  return checkChance(skillLevel(s, life, sk), dc);
}

// ---------------------------------------------------------------- small things

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const pct = (v: number) => Math.round(v * 1000) / 1000;

/** A nation's name without its article, capitalised: "England", "The Muscogee". */
export const nm = (x: Nation | undefined): string =>
  (x?.name ?? "someone").replace(/^the /, "The ");

/** World passes through (the client imports this file without it). */
export type { World };
