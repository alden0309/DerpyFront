// GOV (r21): expeditions, the bookkeeping. Where they live in the game
// (GameState.exped), the delta that carries them (nothing in it is secret:
// a party marching out of town is the talk of the town), the track's own
// dice, and every table the engine rolls from and the pages and the guide
// show: what each kind of expedition is for and what it takes, what a party
// costs, how long it's out, and its odds at the far end. What a player is
// told is what happens.
//
// The odds are one reckoning: the leader's skill in the kind's own trade
// (woodcraft to find the way, trade to deal, faith to preach, fighting to
// raid, leadership to build), helped by the best of the party and by its
// men, against the country's difficulty (how far, what land, what season,
// what welcome). `checkChance` turns the two into a chance, the same as any
// skill check in the game, and the far end's roll is exactly that.

import { dateOf } from "./Calendar";
import { Explain } from "./Explain";
import { FOLLOWER_KINDS, followerSkill, peopleOf } from "./Followers";
import type { ConquestGame } from "./Game";
import {
  Check,
  charSkill,
  isChildLife,
  lifeIsNative,
  lifeOfChar,
  lifeOfSeat,
  meOf,
  no,
  skillLevel,
  yes,
} from "./LifeQueries";
import { ROLES, SKILL_NAMES, checkChance } from "./LifeRules";
import { isFeverSeason, isWinter, kmBetween, type World } from "./Map";
import { isExplored, missionRoute } from "./Missions";
import type { OddsView } from "./Odds";
import {
  ageOf,
  atWar,
  charName,
  hasTrait,
  relationOf,
  treatyBetween,
  tribesfolk,
} from "./Queries";
import type { Rng } from "./Rng";
import { WARRIOR_SHARE } from "./Rules";
import type {
  Breakdown,
  Character,
  ExpedKind,
  ExpedState,
  Expedition,
  GameState,
  Life,
  MapDef,
  Skill,
} from "./Types";
import { worldRng } from "./WorldRng";

// ---------------------------------------------------------------- the state

const CHANGED = new WeakSet<ConquestGame>();

/** Something changed: it goes out with the next delta. */
export function expedChanged(g: ConquestGame): void {
  CHANGED.add(g);
}

const blank = (): ExpedState => ({
  list: [],
  past: [],
  asks: [],
  reprisals: [],
});

/** The state, made the first time it's needed (old saves have none). */
export function expedState(g: ConquestGame): ExpedState {
  const s = g.s;
  if (!s.exped) {
    s.exped = blank();
    expedChanged(g);
  }
  const x = s.exped;
  x.list ??= [];
  x.past ??= [];
  x.asks ??= [];
  x.reprisals ??= [];
  return x;
}

const EMPTY: ExpedState = blank();

/** Read-only: the state as it is (empty for an old save). */
export function expedOf(s: GameState): ExpedState {
  const x = s.exped;
  if (!x) return EMPTY;
  return {
    list: x.list ?? [],
    past: x.past ?? [],
    asks: x.asks ?? [],
    reprisals: x.reprisals ?? [],
  };
}

/** The state, when any of it changed since the last call (and clears it). */
export function takeExpedDelta(g: ConquestGame): ExpedState | undefined {
  if (!CHANGED.has(g) || !g.s.exped) return undefined;
  CHANGED.delete(g);
  return g.s.exped;
}

export function applyExpedDelta(s: GameState, d: ExpedState): void {
  s.exped = d;
}

/**
 * The track's own dice, from the seed, the day and a salt of its own: an
 * expedition's luck never moves the world's dice.
 */
export function edice(s: GameState, salt: number, ...xs: number[]): Rng {
  let k = salt | 0;
  for (const x of xs) k = (Math.imul(k, 31) + (x | 0)) | 0;
  return worldRng(s, 0x21c0000 + (k & 0xfffff));
}

// ---------------------------------------------------------------- the kinds

export interface KindDef {
  name: string;
  /** "an expedition of discovery to …" */
  phrase: string;
  /** What it's for, in a line. */
  text: string;
  /** What it brings if it goes well. */
  gives: string;
  /** The skill its work at the far end tests, and the country's own difficulty. */
  skill: Skill;
  dc: number;
  /** Coins to fit it out (tools, trade truck, arms, presents), before hands and food. */
  outfit: number;
  /** Days of work at the far end. */
  work: number;
  /** The least men it needs (hands, your people and the players with it). */
  minMen: number;
  /** A sensible party, for the planner to start from. */
  hands: number;
  /** Only from the treasury (a governor's, or with a grant). */
  treasury?: boolean;
}

export const KINDS: Record<ExpedKind, KindDef> = {
  discover: {
    name: "Discovery",
    phrase: "an expedition of discovery to",
    text: "Into country your colony doesn't know: what the land yields, where the rivers run, and whether it's rich.",
    gives:
      "The colony learns the land round about (its maps show it to everyone of the colony), renown and the crown's favour, more for rich land found.",
    skill: "woodcraft",
    dc: 3,
    outfit: 6,
    work: 5,
    minMen: 1,
    hands: 4,
  },
  river: {
    name: "Mapping a river",
    phrase: "an expedition to map the river at",
    text: "Up (or down) a river by canoe, sounding it, sketching it, naming its falls and its forks.",
    gives:
      "The river's course for the colony, a line in the story with your name on it, renown and favour.",
    skill: "woodcraft",
    dc: 5,
    outfit: 8,
    work: 12,
    minMen: 3,
    hands: 5,
  },
  trade: {
    name: "Opening trade",
    phrase: "a trading expedition to",
    text: "Pack horses or canoes loaded with cloth, kettles, knives and beads, to a native town, for furs and deerskins and a path that stays open.",
    gives:
      "Furs and skins worth about twice the goods taken (on a good showing), their goodwill, and, for a governor's own, a treaty of trade if they'll make one.",
    skill: "trade",
    dc: 4,
    outfit: 6,
    work: 6,
    minMen: 2,
    hands: 4,
  },
  outpost: {
    name: "An outpost",
    phrase: "a party to raise an outpost at",
    text: "A palisade and a blockhouse on open country or a native nation's land: the colony's mark on the frontier.",
    gives:
      "An outpost of your colony (it keeps the country and feeds armies), renown and favour. On a native nation's land they take it ill.",
    skill: "leadership",
    dc: 5,
    outfit: 25,
    work: 20,
    minMen: 10,
    hands: 12,
  },
  mission: {
    name: "A mission",
    phrase: "a mission to",
    text: "A minister or a priest, a few companions and their goods, to preach and teach and stay a while in a native town.",
    gives:
      "A mission there for twenty years (a school, a chapel, a door open between the peoples), faith and renown. Some nations welcome it; some don't.",
    skill: "faith",
    dc: 5,
    outfit: 6,
    work: 14,
    minMen: 1,
    hands: 2,
  },
  raid: {
    name: "A raid",
    phrase: "a raid on",
    text: "Armed men falling on a native town at dawn: its stores carried off, its fields burned, its people scattered into the woods. The frontier's old way of war, and the cause of most of its wars.",
    gives:
      "Plunder (corn, furs, horses), the frontier's admiration, and the town laid waste for years. And the nation's anger: war, or a raid back on your frontier.",
    skill: "fighting",
    dc: 5,
    outfit: 8,
    work: 2,
    minMen: 8,
    hands: 14,
  },
  port: {
    name: "Founding a port",
    phrase: "an expedition to found a port at",
    text: "Carpenters, a wharf's timbers and a harbour master to a stretch of coast: a quay, a storehouse, a road to the landing.",
    gives:
      "A port for the colony (ships call, trade grows), and on open coast a little town of its own to go with it. Renown and favour.",
    skill: "leadership",
    dc: 5,
    outfit: 40,
    work: 25,
    minMen: 15,
    hands: 16,
    treasury: true,
  },
};

export const KIND_KEYS = Object.keys(KINDS) as ExpedKind[];

/** What it costs to take people along, and to feed them. */
export const PARTY = {
  /** A hand hired for the trip: a woodsman, a porter, a boatman. */
  hand: 1.5,
  /** A ranger for a raid. */
  ranger: 2,
  /** Food a man a day, there and back. */
  food: 0.04,
  /** Most hands one party takes. */
  maxHands: 40,
  /** A leader hired to go for you: a fee, and a little more for each level of skill. */
  fee: 4,
  feePer: 0.6,
  /** Trade goods for a trading expedition. */
  stakeMin: 10,
  stakeMax: 60,
  stake: 20,
  /** How far from where it sets out a party will go (km, as the crow flies). */
  range: 2200,
};

/** The work's difficulty. */
export const DC = {
  /** A level more for each full 800 km of the way. */
  perKm: 800,
  terrain: {
    mountains: 2,
    jungle: 2,
    tundra: 2,
    desert: 1,
    forest: 1,
    marsh: 1,
    hills: 1,
    plains: 0,
  } as Record<string, number>,
  winter: 2,
  fever: 1,
  /** A native nation's regard: a level a 20 points (trade and missions). */
  regardPer: 20,
  /** On a native nation's land (an outpost). */
  nativeLand: 2,
  /** A raid: a level for each half again the town's warriors against your men (and less for fewer). */
  raidMin: -3,
  raidMax: 5,
  /** Open coast (a port with a town to found too). */
  openCoast: 1,
};

/** What the party itself adds to the work (levels). */
export const HELP = {
  /** A companion better than the leader at it: a third of the difference, up to this. */
  companionPer: 1 / 3,
  companionMax: 3,
  /** Men: a raid, an outpost, a port: a level for each 6 beyond 6. */
  menEvery: 6,
  menMax: 3,
  /** A trading party or a mission: armed men put people off (a level for each 10 beyond 12). */
  crowdEvery: 10,
  crowdFrom: 12,
  crowdMax: 2,
  /** Porters and canoemen for a discovery or a river (6 or more men). */
  porters: 1,
};

/** What each outcome brings: renown and favour to the leader (won, half). */
export const REWARD: Record<
  ExpedKind,
  { renown: [number, number]; favour: [number, number]; xp: [number, number] }
> = {
  discover: { renown: [4, 2], favour: [3, 1], xp: [30, 15] },
  river: { renown: [6, 3], favour: [4, 2], xp: [35, 18] },
  trade: { renown: [3, 1], favour: [1, 0], xp: [30, 15] },
  outpost: { renown: [6, 3], favour: [3, 1], xp: [30, 15] },
  mission: { renown: [4, 2], favour: [2, 1], xp: [30, 15] },
  raid: { renown: [5, 2], favour: [2, 0], xp: [25, 12] },
  port: { renown: [8, 4], favour: [5, 2], xp: [30, 15] },
};

/** Trade: what the goods fetch back, a multiple of the stake. */
export const TRADE_BACK = { won: 2.5, half: 1.4, failed: 0.4 };

/** A raid's plunder: a coin for so many of the town's people (and its limits). */
export const PLUNDER = { per: 40, min: 8, max: 60, half: 0.4 };

/** On a failure: the share of men lost, and the leader hurt (a player) or killed (one of the computer's). */
export const LOSS = {
  men: [0.2, 0.4] as [number, number],
  hurt: { raid: 0.3, other: 0.15 },
  hurtBy: [10, 25] as [number, number],
  npcDies: { raid: 0.1, other: 0.04 },
};

/** A raid's answer, and what it costs the colony. */
export const RAID = {
  /** The nation's regard of the colony: carried, beaten off. */
  regard: -40,
  regardHalf: -30,
  regardFailed: -20,
  years: 12,
  /** At peace, the chance they take up the hatchet at once: a base, more for a strong nation, less for a weak. */
  war: 0.35,
  warStrong: 0.2,
  /** Otherwise a war party falls on your frontier within these days. */
  reprisal: 0.75,
  reprisalDays: [30, 120] as [number, number],
  /** What a war party does to a county: ruin, unrest, settlers lost. */
  ruin: 0.25,
  unrest: 12,
  settlersLost: 0.02,
  /** Each ranging company on the frontier: a chance in four it's met and turned. */
  rangerTurns: 0.25,
  rangerMax: 0.6,
  /** The town raided: ruined, and a share of its people fled to their kin. */
  townRuin: 0.45,
  townFled: 0.12,
  /** A private raid at peace: the crown's favour and the law's heat. */
  privateFavour: -6,
  privateHeat: 20,
  /** Unrest on the colony's frontier for a year, while everyone waits for the answer. */
  fear: 3,
};

/** A mission stands this long. */
export const MISSION_YEARS = 20;

/** A port on open coast brings this many settlers to begin. */
export const PORT_SETTLERS = 70;

// ---------------------------------------------------------------- small words

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

export const kindName = (k: ExpedKind): string => KINDS[k]?.name ?? k;

/** "1 man", "3 men". */
export const menWords = (k: number): string =>
  `${k} ${k === 1 ? "man" : "men"}`;

/** "an expedition of discovery to the Ohio country". */
export function expedWords(
  map: MapDef,
  x: Pick<Expedition, "kind" | "target">,
): string {
  return `${KINDS[x.kind].phrase} ${map.provinces[x.target]?.name ?? "somewhere"}`;
}

// ---------------------------------------------------------------- where a party goes

/** A party's plan, before (or as) it's in the state: what the reckonings need. */
export interface ExpedDraft {
  kind: ExpedKind;
  n: number;
  from: number;
  target: number;
  /** The leader (a character), and whether they're a player. */
  leader: number;
  hands: number;
  /** Your own people going (follower ids of the organiser's), and players with it. */
  people: number[];
  members: number;
  stake?: number;
  /** The organiser (for their people), if a player. */
  by?: string;
  /** The players with it (their seats), for their help. */
  seats?: string[];
  /** Levels won or lost on the way. */
  edge?: number;
  /** Men now, if under way (losses on the way). */
  men?: number;
}

/** Men in the party: hands, your people, the leader and the players with it. */
export function menOf(d: ExpedDraft): number {
  return d.men ?? d.hands + d.people.length + 1 + d.members;
}

/** The way a party goes there: as a nation's party does (on foot, by canoe across water). */
export function wayOf(map: MapDef, from: number, to: number) {
  return missionRoute(map, from, to, "explore");
}

/** Days out: the way, the leader's pace, and a big party's slowness. */
export function daysOut(s: GameState, map: MapDef, d: ExpedDraft): Breakdown {
  const e = new Explain();
  const way = wayOf(map, d.from, d.target);
  let land = 0;
  let water = 0;
  way.legs.forEach((v, i) => (way.sea[i] ? (water += v) : (land += v)));
  if (land > 0) e.add(`${Math.round(way.landKm)} km over land`, r1(land));
  if (water > 0)
    e.add(`${Math.round(way.seaKm)} km by canoe or boat`, r1(water));
  if (land + water < 3) e.add("Making ready", 3 - land - water);
  const c = s.chars[d.leader];
  const wood = c ? charSkill(s, c, "woodcraft") : 0;
  if (wood >= 10) e.mul(`A woodsman leads (woodcraft ${wood})`, 0.9);
  if (hasTrait(c, "diligent")) e.mul("Diligent", 0.9);
  if (hasTrait(c, "lazy")) e.mul("Lazy", 1.2);
  const men = menOf(d);
  if (men > 16)
    e.mul(`A big party (${men})`, 1 + Math.min(0.25, (men - 16) / 80));
  return e.done(0, 1);
}

/** Whether a province is good for this kind of expedition from this colony, or why not. */
export function targetCheck(
  s: GameState,
  w: World,
  kind: ExpedKind,
  n: number,
  p: number,
  from: number,
): Check {
  const pr = s.provinces[p];
  const def = w.map.provinces[p];
  if (!pr || !def) return no("No such place.");
  if (def.closed) return no("No way in.");
  if (from < 0) return no("Set out from a town of your colony.");
  if (p === from) return no("You're there already.");
  const km = kmBetween(w.map, from, p);
  if (km > PARTY.range)
    return no(
      `Too far: ${Math.round(km)} km (a party goes ${PARTY.range} km at most).`,
    );
  const owner = pr.owner;
  const native = owner >= 0 && s.nations[owner]?.kind === "native";
  const power = owner >= 0 && s.nations[owner]?.kind === "power";
  switch (kind) {
    case "discover":
      if (isExplored(s, n, p)) return no("Your colony knows this country.");
      if (power)
        return no("Another colony's land: they'd hardly call it discovery.");
      return yes;
    case "river":
      if (!def.nb.some(([, , river]) => river === 1))
        return no("No river to follow there.");
      if (owner === n)
        return no("Your own colony's river: its course is known.");
      if (power) return no("Another colony's river.");
      return yes;
    case "trade":
      if (!native) return no("A trading expedition goes to a native town.");
      if (atWar(s, owner, n)) return no("At war with them: no one trades.");
      return yes;
    case "mission":
      if (!native) return no("A mission goes to a native town.");
      if (atWar(s, owner, n)) return no("At war with them.");
      if (pr.mods.some((m) => m.key === "r21:mission" && m.until > s.day))
        return no("There's a mission there already.");
      return yes;
    case "outpost":
      if (pr.outpost) return no("There's an outpost there already.");
      if (power) return no("Another colony's land.");
      if (pr.colony) return no("Someone's settling it.");
      return yes;
    case "raid":
      if (!native) return no("A raid falls on a native town.");
      if (s.nations[owner].overlord === n)
        return no(
          "They pay your colony tribute: they're under its protection.",
        );
      if (tribesfolk(pr) < 40) return no("Nobody lives there to speak of.");
      return yes;
    case "port":
      if (!def.coastal) return no("It isn't on the coast.");
      if (owner === n) {
        if ((pr.b.port ?? 0) > 0) return no("It has a port already.");
        return yes;
      }
      if (owner >= 0) return no("Someone else's land.");
      if (pr.colony) return no("Someone's settling it.");
      return yes;
  }
}

/** Where a player's party sets out: where they are, if it's a town of their colony (or any settled town of theirs). */
export function startFor(s: GameState, life: Life): number {
  const me = meOf(s, life);
  if (!me || life.travel) return -1;
  const pr = s.provinces[life.prov];
  if (!pr || pr.owner !== me.nation) return -1;
  if (pr.occupier >= 0) return -1;
  return life.prov;
}

export interface TargetRow {
  p: number;
  km: number;
  days: number;
  why?: string;
}

/** Places a party could go from here, nearest first (the ones it can't, with why, at the end). */
export function targetsFor(
  s: GameState,
  w: World,
  kind: ExpedKind,
  n: number,
  from: number,
  max = 30,
): TargetRow[] {
  if (from < 0) return [];
  const out: TargetRow[] = [];
  for (let p = 0; p < s.provinces.length; p++) {
    if (p === from) continue;
    const km = kmBetween(w.map, from, p);
    if (km > PARTY.range) continue;
    const ok = targetCheck(s, w, kind, n, p, from);
    if (!ok.ok) continue;
    out.push({ p, km: Math.round(km), days: 0 });
  }
  out.sort((a, b) => a.km - b.km || a.p - b.p);
  const top = out.slice(0, max);
  for (const t of top) {
    const way = wayOf(w.map, from, t.p);
    t.days = Math.max(1, Math.round(way.legs.reduce((a, b) => a + b, 0)));
  }
  return top.sort((a, b) => a.days - b.days || a.p - b.p);
}

// ---------------------------------------------------------------- who leads

/** A character's skill for the kind's work. */
export function leadSkill(
  s: GameState,
  c: Character | undefined,
  sk: Skill,
): number {
  return c ? charSkill(s, c, sk) : 0;
}

/** A leader's skill: a player's from their sheet (posts and kit too), anyone else's by nature. */
export function leaderLevel(
  s: GameState,
  c: Character | undefined,
  sk: Skill,
): number {
  if (!c) return 0;
  const l = lifeOfChar(s, c.id);
  return l ? skillLevel(s, l, sk) : charSkill(s, c, sk);
}

/** What a leader hired to go for you asks. */
export function leaderFee(s: GameState, c: Character, kind: ExpedKind): number {
  return Math.round(
    PARTY.fee + PARTY.feePer * leadSkill(s, c, KINDS[kind].skill),
  );
}

/** People here who'd lead an expedition for you: your own people, and men of the town who know the country. */
export function hirelings(
  s: GameState,
  life: Life,
  kind: ExpedKind,
  max = 8,
): { c: Character; skill: number; fee: number; yours: boolean }[] {
  const me = meOf(s, life);
  if (!me) return [];
  const sk = KINDS[kind].skill;
  const seen = new Set<number>([me.id]);
  const out: { c: Character; skill: number; fee: number; yours: boolean }[] =
    [];
  for (const f of peopleOf(life)) {
    const c = s.chars[f.c];
    if (!c?.alive || f.task || seen.has(c.id)) continue;
    if (
      !["guide", "sword", "officer", "mate", "interpreter", "clerk"].includes(
        f.kind,
      )
    )
      continue;
    seen.add(c.id);
    const skill = Math.max(followerSkill(s, f, sk), leadSkill(s, c, sk));
    out.push({ c, skill, fee: 0, yours: true });
  }
  const fits = new Set([
    "hunter",
    "trader",
    "soldier",
    "sergeant",
    "captain",
    "merchant",
    "preacher",
    "sailor",
    "maker",
  ]);
  for (const id of s.locals[life.prov] ?? []) {
    const c = s.chars[id];
    if (!c?.alive || c.abroad || seen.has(id) || lifeOfChar(s, id)) continue;
    if (!c.role || !fits.has(c.role)) continue;
    const age = ageOf(s, c);
    if (age < 20 || age > 58) continue;
    if (c.nation !== me.nation) continue;
    if (busyLeading(s, id, myForming(s, life.seat)?.id)) continue;
    seen.add(id);
    out.push({
      c,
      skill: leadSkill(s, c, sk),
      fee: leaderFee(s, c, kind),
      yours: false,
    });
  }
  return out.sort((a, b) => b.skill - a.skill || a.c.id - b.c.id).slice(0, max);
}

/** Someone already leading (or with) a party (other than the one excepted: yours, being got up). */
export function busyLeading(s: GameState, c: number, except = -1): boolean {
  return expedOf(s).list.some(
    (x) =>
      x.id !== except && (x.leader === c || x.members.some((m) => m.c === c)),
  );
}

/** The role's words for a hired leader ("a hunter", "an old soldier"). */
export function hirelingWords(c: Character): string {
  const r = c.role ? ROLES[c.role] : undefined;
  return r ? r.title.toLowerCase() : "a man of the town";
}

// ---------------------------------------------------------------- the odds

/** The country's difficulty for the work at the far end: the reckoning, in levels. */
export function workDc(
  s: GameState,
  w: World,
  d: ExpedDraft,
  arriveDay: number,
): Breakdown {
  const def = KINDS[d.kind];
  const map = w.map;
  const pr = s.provinces[d.target];
  const pd = map.provinces[d.target];
  const e = new Explain().add(`${def.name}: the work itself`, def.dc, true);
  const way = wayOf(map, d.from, d.target);
  const km = way.landKm + way.seaKm;
  const far = Math.floor(km / DC.perKm);
  if (far) e.add(`${Math.round(km)} km from home`, far);
  const t = DC.terrain[pd.terrain] ?? 0;
  if (t) e.add(`The country: ${pd.terrain}`, t);
  const month = dateOf(arriveDay).month;
  if (isWinter(pd.lat, month))
    e.add("Winter when they get there", d.kind === "raid" ? 1 : DC.winter);
  else if (
    w.tropical[d.target] ||
    (isFeverSeason(pd.lat, month) && pd.terrain === "marsh")
  )
    e.add("Fever country", DC.fever);
  const owner = pr?.owner ?? -1;
  const native = owner >= 0 && s.nations[owner]?.kind === "native";
  if (native && (d.kind === "trade" || d.kind === "mission")) {
    const rel = relationOf(s, w, owner, d.n).total;
    const v = -Math.round(rel / DC.regardPer);
    if (v)
      e.add(
        `The ${s.nations[owner].name}'s regard for your colony (${rel})`,
        v,
      );
    if (treatyBetween(s, owner, d.n, "trade") && d.kind === "trade")
      e.add("A treaty of trade", -1);
  }
  if (d.kind === "outpost" && native)
    e.add(`The ${s.nations[owner].name}'s own land`, DC.nativeLand);
  if (d.kind === "outpost" && !native && pr && tribesfolk(pr) > 0)
    e.add("People live there", 1);
  if (d.kind === "raid" && pr) {
    const warriors = Math.round(tribesfolk(pr) * WARRIOR_SHARE);
    const men = Math.max(1, menOf(d));
    const v = clamp(
      Math.round((warriors / (men * 5) - 1) * 2),
      DC.raidMin,
      DC.raidMax,
    );
    e.add(`About ${warriors} warriors at the town, against your ${men}`, v);
  }
  if (d.kind === "port" && owner < 0)
    e.add("Open coast: the town to make as well", DC.openCoast);
  return e.done(0);
}

/** The party's skill at the work: the leader's, the best of the party's help, and its men. */
export function workSkill(s: GameState, d: ExpedDraft): Breakdown {
  const def = KINDS[d.kind];
  const sk = def.skill;
  const leader = s.chars[d.leader];
  const base = leaderLevel(s, leader, sk);
  const e = new Explain().add(
    `${leader ? charName(leader) : "The leader"}'s ${SKILL_NAMES[sk].toLowerCase()}`,
    base,
    true,
  );
  // The best of the rest at it.
  let best = 0;
  let who = "";
  const org = d.by ? lifeOfSeat(s, d.by) : undefined;
  for (const id of d.people) {
    const f = org ? peopleOf(org).find((x) => x.id === id) : undefined;
    if (!f) continue;
    const v = followerSkill(s, f, sk);
    if (v > best) {
      best = v;
      who = `${charName(s.chars[f.c])} (${FOLLOWER_KINDS[f.kind].name.toLowerCase()})`;
    }
  }
  for (const seat of d.seats ?? []) {
    const l = lifeOfSeat(s, seat);
    if (!l || l.c < 0 || l.c === d.leader) continue;
    const v = skillLevel(s, l, sk);
    if (v > best) {
      best = v;
      who = charName(s.chars[l.c]);
    }
  }
  const help = Math.min(
    HELP.companionMax,
    Math.floor((best - base) * HELP.companionPer),
  );
  if (help > 0) e.add(`${who}: ${SKILL_NAMES[sk].toLowerCase()} ${best}`, help);
  const men = menOf(d);
  if (d.kind === "raid" || d.kind === "outpost" || d.kind === "port") {
    const v = Math.min(
      HELP.menMax,
      Math.floor(Math.max(0, men - HELP.menEvery) / HELP.menEvery),
    );
    if (v) e.add(`${men} men`, v);
  } else if (d.kind === "trade" || d.kind === "mission") {
    const v = -Math.min(
      HELP.crowdMax,
      Math.floor(Math.max(0, men - HELP.crowdFrom) / HELP.crowdEvery) +
        (men > HELP.crowdFrom ? 1 : 0),
    );
    if (v) e.add(`${men} men: armed men put people off`, v);
  } else if (men >= 6) e.add(`Porters and canoemen (${men} men)`, HELP.porters);
  if (d.edge) e.add("What happened on the way", d.edge);
  return e.done(0, 0);
}

/** The work's chance, from the party's skill against the country (the same as any skill check). */
export function workChance(
  s: GameState,
  w: World,
  d: ExpedDraft,
  arriveDay: number,
): { p: number; skill: Breakdown; dc: Breakdown } {
  const skill = workSkill(s, d);
  const dc = workDc(s, w, d, arriveDay);
  return { p: checkChance(skill.total, dc.total), skill, dc };
}

/** The outcomes at the far end: won, half, failed (the roll's three bands). */
export function outcomeBands(p: number): {
  won: number;
  half: number;
  failed: number;
} {
  const half = (1 - p) / 2;
  return { won: p, half, failed: 1 - p - half };
}

/** Which band a roll falls in. */
export function bandOf(p: number, u: number): "won" | "half" | "failed" {
  const b = outcomeBands(p);
  if (u < b.won) return "won";
  if (u < b.won + b.half) return "half";
  return "failed";
}

// ---------------------------------------------------------------- the costs

export interface ExpedCost {
  outfit: number;
  hands: number;
  food: number;
  fee: number;
  stake: number;
  total: number;
  days: number;
}

/** What it costs to send this party: fitting out, the hands, food for there and back, a hired leader, trade goods. */
export function costOf(
  s: GameState,
  map: MapDef,
  d: ExpedDraft,
  hired: boolean,
): ExpedCost {
  const def = KINDS[d.kind];
  const days = daysOut(s, map, d).total;
  const men = menOf(d);
  const hands =
    Math.round(d.hands * (d.kind === "raid" ? PARTY.ranger : PARTY.hand) * 10) /
    10;
  const food = Math.ceil(men * (days * 2 + def.work) * PARTY.food);
  const c = s.chars[d.leader];
  const fee = hired && c ? leaderFee(s, c, d.kind) : 0;
  const stake = d.kind === "trade" ? (d.stake ?? PARTY.stake) : 0;
  const outfit = def.outfit;
  return {
    outfit,
    hands,
    food,
    fee,
    stake,
    total: Math.ceil(outfit + hands + food + fee + stake),
    days,
  };
}

// ---------------------------------------------------------------- risk and reward, shown before

/** Rough plunder from a town of this size. */
export function plunderOf(s: GameState, p: number): number {
  const pr = s.provinces[p];
  return clamp(
    Math.round((pr ? tribesfolk(pr) : 0) / PLUNDER.per),
    PLUNDER.min,
    PLUNDER.max,
  );
}

/** Risk and reward, before you commit (CONVENTIONS #6): from the same reckoning the far end rolls. */
export function expedOdds(
  s: GameState,
  w: World,
  d: ExpedDraft,
  hired: boolean,
  ok: Check = yes,
): OddsView {
  const def = KINDS[d.kind];
  const cost = costOf(s, w.map, d, hired);
  const arrive = s.day + cost.days;
  const ch = workChance(s, w, d, arrive);
  const b = outcomeBands(ch.p);
  const back = (k: "won" | "half" | "failed"): [number, number] => {
    if (d.kind === "trade") {
      const st = cost.stake;
      return [Math.round(st * TRADE_BACK[k]), Math.round(st * TRADE_BACK[k])];
    }
    if (d.kind === "raid") {
      const pl = plunderOf(s, d.target);
      if (k === "won") return [pl, pl];
      if (k === "half")
        return [Math.round(pl * PLUNDER.half), Math.round(pl * PLUNDER.half)];
      return [0, 0];
    }
    return [0, 0];
  };
  const r = REWARD[d.kind];
  const won = back("won");
  const half = back("half");
  const failed = back("failed");
  const outcomes = [
    {
      label: `It goes well (renown +${r.renown[0]}, favour +${r.favour[0]})`,
      p: b.won,
      lo: won[0],
      hi: won[1],
      note: def.gives,
    },
    {
      label: `A poor showing (renown +${r.renown[1]}, favour +${r.favour[1]})`,
      p: b.half,
      lo: half[0],
      hi: half[1],
      note: "Half of what a good showing brings.",
    },
    {
      label: "It fails",
      p: b.failed,
      lo: failed[0],
      hi: failed[1],
      note: `A fifth to two fifths of the men lost; the leader may be hurt.`,
      bad: true,
    },
  ];
  const expected = Math.round(
    (b.won * (won[0] + won[1])) / 2 +
      (b.half * (half[0] + half[1])) / 2 +
      (b.failed * (failed[0] + failed[1])) / 2,
  );
  const hurt = d.kind === "raid" ? LOSS.hurt.raid : LOSS.hurt.other;
  const risks = [
    {
      label: "The leader hurt (if it fails)",
      p: Math.round(b.failed * hurt * 1000) / 1000,
      note: `${LOSS.hurtBy[0]} to ${LOSS.hurtBy[1]} health (more under strain); one of the computer's leaders may die of it.`,
    },
  ];
  if (d.kind === "raid") {
    // The far end's answer to a town fallen on (Expeditions.queueAnswer).
    const owner = s.provinces[d.target]?.owner ?? -1;
    const nat = s.nations[owner];
    if (nat && !atWar(s, owner, d.n)) {
      const pWar = Math.min(0.9, RAID.war + (nat.strong ? RAID.warStrong : 0));
      risks.push(
        {
          label: `War with the ${nat.name} at once`,
          p: Math.round(pWar * 1000) / 1000,
          note: "Revenge: they take up the hatchet against the colony.",
        },
        {
          label: "Else a war party on your frontier, months after",
          p: Math.round((1 - pWar) * RAID.reprisal * 1000) / 1000,
          note: "Farms burned and families fled in the county nearest; rangers may turn it.",
        },
      );
    }
  }
  const factors = [
    ...ch.skill.parts.map(
      (x) =>
        `${x.label}: ${x.value > 0 && x.label !== ch.skill.parts[0].label ? "+" : ""}${x.value}`,
    ),
    `Against: ${ch.dc.parts.map((x) => `${x.label} ${x.value > 0 ? "+" : ""}${x.value}`).join(", ")}`,
    `${ch.skill.total} against ${ch.dc.total}: ${Math.round(ch.p * 100)} in 100 it goes well.`,
  ];
  return {
    title: `${def.name}: ${w.map.provinces[d.target]?.name ?? "?"}`,
    ok: ok.ok,
    why: ok.ok ? undefined : ok.why,
    costNow: cost.total,
    costMonth: 0,
    per: "trip",
    days: [cost.days * 2 + def.work, Math.round(cost.days * 2.4 + def.work)],
    outcomes,
    expected,
    lo: Math.min(...outcomes.map((o) => o.lo)),
    hi: Math.max(...outcomes.map((o) => o.hi)),
    // An expedition is reckoned once, not by the month: what's expected back
    // less what it costs, for the whole trip (the planner shows it so).
    net: expected - cost.total,
    risks,
    factors,
  };
}

// ---------------------------------------------------------------- who can

/** Whether a player can get up an expedition now (any kind), or why not. */
export function canPlan(s: GameState, life: Life): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're grown.");
  if (lifeIsNative(s, life))
    return no(
      "Your people's journeys are made in their own way, at the council fire.",
    );
  if (s.nations[me.nation]?.kind !== "power")
    return no("Expeditions go out from a colony.");
  if (life.crime?.jail) return no("In a cell.");
  if ((life.job?.army ?? -1) >= 0) return no("You march with the army.");
  if (life.job?.kind === "servant" && (life.job.until ?? 0) > s.day)
    return no("A servant goes where the master says.");
  return yes;
}

/** Your expedition (getting up, or under way), if any: one at a time. */
export function myExped(s: GameState, seat: string): Expedition | undefined {
  return expedOf(s).list.find(
    (x) =>
      x.by === seat ||
      x.lseat === seat ||
      x.members.some((m) => m.seat === seat),
  );
}

/** The expedition you're getting up (not yet set out). */
export function myForming(s: GameState, seat: string): Expedition | undefined {
  return expedOf(s).list.find((x) => x.by === seat && x.stage === "forming");
}

/** An expedition by id. */
export function expedById(s: GameState, id: number): Expedition | undefined {
  return expedOf(s).list.find((x) => x.id === id);
}

/** The draft an expedition record is (for the reckonings). */
export function draftOf(x: Expedition): ExpedDraft {
  return {
    kind: x.kind,
    n: x.n,
    from: x.from,
    target: x.target,
    leader: x.leader,
    hands: x.hands,
    people: x.people,
    members: x.members.length,
    stake: x.stake,
    by: x.by || undefined,
    seats: [...(x.lseat ? [x.lseat] : []), ...x.members.map((m) => m.seat)],
    edge: x.edge,
    men: x.stage === "forming" ? undefined : x.men,
  };
}

/** The players in a party now (the leader if a player, and the members). */
export function partyLives(s: GameState, x: Expedition): Life[] {
  const seats = [
    ...(x.lseat ? [x.lseat] : []),
    ...x.members.map((m) => m.seat),
  ];
  return seats
    .map((seat) => lifeOfSeat(s, seat))
    .filter((l): l is Life => !!l && l.c >= 0 && !l.watching);
}

/** Whether a player is out with this party now (carried by it). */
export function withParty(s: GameState, life: Life, x: Expedition): boolean {
  return life.travel?.exped === x.id;
}

/** A skill's odds on a scene's button: the leader's, helped by the party. */
export function partySkill(s: GameState, x: Expedition, sk: Skill): number {
  const own = leaderLevel(s, s.chars[x.leader], sk);
  const org = x.by ? lifeOfSeat(s, x.by) : undefined;
  let best = own;
  for (const id of x.people) {
    const f = org ? peopleOf(org).find((y) => y.id === id) : undefined;
    if (f) best = Math.max(best, followerSkill(s, f, sk));
  }
  for (const l of partyLives(s, x))
    if (l.c !== x.leader) best = Math.max(best, skillLevel(s, l, sk));
  const help = Math.min(
    HELP.companionMax,
    Math.floor((best - own) * HELP.companionPer),
  );
  return own + Math.max(0, help);
}
