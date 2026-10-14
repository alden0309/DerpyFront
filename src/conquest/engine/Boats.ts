// LIFE (r11): boats of your own. A canoe, a shallop, a sloop, a schooner, a
// brig or a ship, new from the yard or second-hand off the quay, each with
// its price, hold, speed, the crew it needs and its keep. A boat stays in
// the port where you left it: it never follows you. Sail in it and the
// passage costs nothing but your crew's wages and the boat's keep; it lands
// you where you're going and waits there. Bigger boats need a hired crew,
// paid every month; unpaid crews leave. Boats can fish, whale, trade,
// smuggle or (with a letter of marque in wartime) take prizes; and they
// can be battered, wrecked, taken by pirates or seized by the customs.

import { addHeat } from "./Crime";
import { lawAt } from "./CrimeQueries";
import { followerSkill, peopleOf } from "./Followers";
import type { ConquestGame } from "./Game";
import { setFlow, type FlowTag } from "./LedgerCore"; // LEDGER (r15)
import {
  addRenown,
  beginOutcome,
  earn,
  endOutcome,
  gainXp,
  journal,
  outcomeMeta,
  spend,
  touchLife,
} from "./LifeCore";
import {
  Check,
  hasPlace,
  isChildLife,
  lifeIsNative,
  meOf,
  no,
  purseWords,
  skillLevel,
  yes,
} from "./LifeQueries";
import { isWinter, type World } from "./Map";
import { wake } from "./Pace";
import { charName } from "./Queries";
import { Rng } from "./Rng";
import { ownBoatHopDays } from "./SeaSpeed"; // SEA (r15)
// SHIPS (r21): her company by name, who commands her, her own dice, beaching.
import {
  boardCrew,
  disbandShip,
  gunsOf,
  menWithHer,
  namedHands,
  passageOf,
  shipDice,
  shipFx,
  speedOf,
} from "./Ships";
import type {
  Boat,
  BoatKind,
  BoatUse,
  GameState,
  Life,
  LifeCommand,
  MapDef,
} from "./Types";

export interface BoatDef {
  name: string;
  text: string;
  price: number;
  /** Cargo, in loads (you carry 20 on your back). */
  loads: number;
  /** People besides the crew: you and those with you. */
  berths: number;
  /** Against a passage on someone else's ship (1 = the same). */
  speed: number;
  /** The longest leg it can sail between landfalls, in km. */
  reach: number;
  /** Hands it needs to sail. */
  crew: number;
  /** Coins a month to keep her up (besides the crew's wages). */
  upkeep: number;
  guns: number;
  uses: BoatUse[];
  /** Built by the native peoples (cheaper for them, sold anywhere on the coast). */
  native?: boolean;
}

export const BOATS: Record<BoatKind, BoatDef> = {
  canoe: {
    name: "Canoe",
    text: "Birch bark or a hollowed log: you and two more paddle it along the coast and up the rivers. No crew to pay.",
    price: 4,
    loads: 4,
    berths: 2,
    speed: 0.8,
    reach: 350,
    crew: 0,
    upkeep: 0.05,
    guns: 0,
    uses: ["idle", "fishing"],
    native: true,
  },
  shallop: {
    name: "Shallop",
    text: "An open boat with a lugsail and oars, for the bays and the coasting trade. One hand besides you.",
    price: 18,
    loads: 10,
    berths: 4,
    speed: 0.95,
    reach: 600,
    crew: 1,
    upkeep: 0.3,
    guns: 0,
    uses: ["idle", "fishing", "trading", "smuggling"],
  },
  sloop: {
    name: "Sloop",
    text: "A single mast and a great mainsail: quick, handy, the workhorse of the coast (and the pirates' favourite).",
    price: 70,
    loads: 40,
    berths: 8,
    speed: 1.25,
    reach: 1600,
    crew: 3,
    upkeep: 1,
    guns: 4,
    uses: [
      "idle",
      "fishing",
      "whaling",
      "trading",
      "smuggling",
      "privateering",
    ],
  },
  schooner: {
    name: "Schooner",
    text: "Two masts, fore-and-aft rigged, built in Marblehead and Gloucester: fast and weatherly.",
    price: 140,
    loads: 70,
    berths: 12,
    speed: 1.4,
    reach: 2000,
    crew: 6,
    upkeep: 2,
    guns: 6,
    uses: [
      "idle",
      "fishing",
      "whaling",
      "trading",
      "smuggling",
      "privateering",
    ],
  },
  brig: {
    name: "Brig",
    text: "Two square-rigged masts and a deep hold: an ocean trader, or with guns run out, a privateer.",
    price: 280,
    loads: 140,
    berths: 20,
    speed: 1.2,
    reach: 2600,
    crew: 12,
    upkeep: 3.5,
    guns: 12,
    uses: ["idle", "whaling", "trading", "smuggling", "privateering"],
  },
  ship: {
    name: "Ship",
    text: "Three masts, square-rigged: a full-rigged ship, the greatest a private fortune can own.",
    price: 600,
    loads: 300,
    berths: 36,
    speed: 1.1,
    reach: 3500,
    crew: 22,
    upkeep: 7,
    guns: 20,
    uses: ["idle", "whaling", "trading", "privateering"],
  },
};

export const BOAT_KINDS = Object.keys(BOATS) as BoatKind[];

export const USE_NAMES: Record<BoatUse, string> = {
  idle: "Laid up",
  fishing: "Fishing",
  whaling: "Whaling",
  trading: "Coasting trade",
  smuggling: "Smuggling",
  privateering: "Privateering",
};

export const USE_TEXT: Record<BoatUse, string> = {
  idle: "Lies at her moorings: only her keep and her crew's wages.",
  fishing:
    "Fishes the banks and bays: steady, modest money, better where the fish are thick.",
  whaling:
    "Hunts whales out of the northern ports: rich voyages and stove boats.",
  trading:
    "Runs cargoes along the coast: profit by the size of her hold, and the skill of whoever sails her.",
  smuggling:
    "Runs goods past the customs: twice the profit, the law's heat, and the risk of seizure.",
  privateering:
    "With a letter of marque in wartime, takes enemy merchantmen as prizes. Without a war it's piracy.",
};

/** A seaman's wages a month. */
export const CREW_WAGE = 1.5;
/** Signing a hand. */
export const CREW_BOUNTY = 1;

export function boatsOf(life: Life): Boat[] {
  return life.boats ?? [];
}

export function boatAt(life: Life, p: number): Boat[] {
  return boatsOf(life).filter(
    (b) => b.prov === p && !b.away && life.travel?.boat !== b.id && !b.way, // SHIPS (r21): not at sea
  );
}

/** Where boats are sold: a port's docks, or (canoes) any shore with a village. */
export function boatyard(s: GameState, w: World, p: number): BoatKind[] {
  const out: BoatKind[] = [];
  if (!w.map.provinces[p]?.coastal) return out;
  if (hasPlace(s, w, p, "docks")) {
    out.push("canoe", "shallop", "sloop");
    const port = s.provinces[p].b.port ?? 0;
    if (port >= 1) out.push("schooner");
    if (port >= 2) out.push("brig", "ship");
    return out;
  }
  if (hasPlace(s, w, p, "village")) out.push("canoe");
  return out;
}

/** A boat's price new for you (shipwrights build their own cheaper; natives their canoes). */
export function boatPrice(s: GameState, life: Life, kind: BoatKind): number {
  let p = BOATS[kind].price;
  if (kind === "canoe" && lifeIsNative(s, life)) p = 1.5;
  if (life.job?.kind === "shipwright" && life.job.rank >= 1) p *= 0.75;
  return Math.round(p * 10) / 10;
}

export interface UsedBoat {
  slot: number;
  kind: BoatKind;
  condition: number;
  price: number;
  quirk: string;
  name: string;
}

const QUIRKS = [
  "leaks a little",
  "quick off the wind",
  "sound as a bell",
  "a foul bottom",
  "crank in a blow",
  "a lucky ship, they say",
];

const BOAT_NAMES = [
  "Mary",
  "Swallow",
  "Endeavour",
  "Providence",
  "Speedwell",
  "Hopewell",
  "Prosperous",
  "Dolphin",
  "Charming Polly",
  "Sea Flower",
  "Good Intent",
  "Two Brothers",
  "Adventure",
  "Hannah",
  "Expedition",
  "Liberty",
  "Fortune",
  "Diligence",
  "Industry",
  "Neptune",
  "Revenge",
  "Betsey",
  "Ranger",
  "Sally",
];

function hashOf(...xs: number[]): number {
  let h = 2166136261 | 0;
  for (const x of xs) {
    h = Math.imul(h ^ (x | 0), 16777619);
    h ^= h >>> 13;
  }
  return h | 0;
}

/** Boats for sale second-hand on the quay this month (the same for everyone). */
export function usedBoats(s: GameState, w: World, p: number): UsedBoat[] {
  const kinds = boatyard(s, w, p).filter((k) => k !== "canoe");
  if (!kinds.length) return [];
  const month = Math.floor(s.day / 30);
  const rng = new Rng({ rng: hashOf(s.settings.seed, p, month, 77) });
  const out: UsedBoat[] = [];
  const n = rng.int(0, 2);
  for (let slot = 0; slot < n; slot++) {
    const kind =
      kinds[
        Math.min(
          kinds.length - 1,
          Math.floor(rng.next() * rng.next() * kinds.length),
        )
      ];
    const condition = rng.int(45, 82);
    out.push({
      slot,
      kind,
      condition,
      price: Math.round(BOATS[kind].price * (0.35 + condition / 200) * 10) / 10,
      quirk: QUIRKS[rng.int(0, QUIRKS.length - 1)],
      name: BOAT_NAMES[rng.int(0, BOAT_NAMES.length - 1)],
    });
  }
  return out;
}

export function buyCheck(
  s: GameState,
  w: World,
  life: Life,
  kind: BoatKind,
  price: number,
): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (life.crime?.jail) return no("Not from a cell.");
  if (life.travel) return no("You're on the road.");
  if (!boatyard(s, w, life.prov).includes(kind))
    return no("None to be had here.");
  // SHIPS (r21): no cap on how many boats and ships you own.
  if (life.purse < price)
    return no(`Costs ${price} coins (${purseWords(life.purse)}).`);
  return yes;
}

function newName(g: ConquestGame, life: Life): string {
  const have = new Set(boatsOf(life).map((b) => b.name));
  const free = BOAT_NAMES.filter((n) => !have.has(n));
  return g.rng.pick(free.length ? free : BOAT_NAMES)!;
}

/** Buy a boat: new (slot -1) or second-hand off the quay. */
export function buyBoat(
  g: ConquestGame,
  life: Life,
  kind: BoatKind | undefined,
  slot: number,
): string | null {
  const s = g.s;
  let used: UsedBoat | undefined;
  if (slot >= 0) {
    used = usedBoats(s, g.w, life.prov).find((b) => b.slot === slot);
    if (!used) return "She's been sold.";
    if (
      life.cooldowns[`boat:used:${life.prov}:${Math.floor(s.day / 30)}:${slot}`]
    )
      return "You bought her already.";
  }
  const k = used?.kind ?? kind;
  if (!k || !BOATS[k]) return "No such boat.";
  const price = used?.price ?? boatPrice(s, life, k);
  const check = buyCheck(s, g.w, life, k, price);
  if (!check.ok) return check.why;
  spend(g, life, price);
  touchLife(g, life);
  life.boats ??= [];
  if (used)
    life.cooldowns[`boat:used:${life.prov}:${Math.floor(s.day / 30)}:${slot}`] =
      s.day + 40;
  const b: Boat = {
    id: g.nextId(),
    kind: k,
    name: used?.name ?? newName(g, life),
    prov: life.prov,
    condition: used?.condition ?? 100,
    crew: 0,
    morale: 70,
    use: "idle",
    bought: s.day,
    ...(used ? { quirk: used.quirk } : {}),
  };
  life.boats.push(b);
  journal(
    g,
    life,
    `You buy the ${BOATS[k].name.toLowerCase()} ${b.name}${used ? ` second-hand (${used.quirk})` : ", new from the yard"} for ${price} coins. She lies at ${g.map.provinces[life.prov].name}.${BOATS[k].crew ? ` She needs ${BOATS[k].crew} hand${BOATS[k].crew === 1 ? "" : "s"} to sail.` : ""}`,
    "good",
  );
  return null;
}

function mine(life: Life, id: number | undefined): Boat | undefined {
  return boatsOf(life).find((b) => b.id === id);
}

/** At the boat's port, ashore. */
function alongside(life: Life, b: Boat): string | null {
  if (life.travel) return "You're on the road.";
  if (b.away) return "She's away with her skipper.";
  if (b.way) return "She's at sea."; // SHIPS (r21)
  if (b.prov !== life.prov) return "She's not here: go to where she lies.";
  return null;
}

/** Set the crew to `n` hands (hiring at a coin a head, or paying some off). */
export function setCrew(
  g: ConquestGame,
  life: Life,
  id: number,
  n: number,
): string | null {
  const b = mine(life, id);
  if (!b) return "Not your boat.";
  const why = alongside(life, b);
  if (why) return why;
  const def = BOATS[b.kind];
  if (!def.crew) return "She needs no crew.";
  // SHIPS (r21): hands by name take the place of hands by the head.
  const room = Math.max(0, Math.ceil(def.crew * 1.5) - namedHands(b));
  const want = Math.max(0, Math.min(room, Math.round(n)));
  if (want > b.crew) {
    const cost = (want - b.crew) * CREW_BOUNTY;
    if (life.purse < cost)
      return `Signing ${want - b.crew} hands costs ${cost} coins.`;
    spend(g, life, cost);
  }
  touchLife(g, life);
  const was = b.crew;
  b.crew = want;
  b.owed = 0;
  if (want > was) b.morale = Math.min(100, b.morale + 5);
  journal(
    g,
    life,
    want > was
      ? `You sign on ${want - was} hands for the ${b.name}: ${want} aboard.`
      : `You pay off ${was - want} of the ${b.name}'s hands.`,
  );
  return null;
}

export function repairCost(b: Boat): number {
  return (
    Math.round((((100 - b.condition) * BOATS[b.kind].price) / 250) * 10) / 10
  );
}

export function repairBoat(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const b = mine(life, id);
  if (!b) return "Not your boat.";
  const why = alongside(life, b);
  if (why) return why;
  if (b.condition >= 98) return "She's sound.";
  if (!hasPlace(g.s, g.w, life.prov, "docks") && b.kind !== "canoe")
    return "Repairs need a port with a yard.";
  const cost = repairCost(b);
  if (life.purse < cost) return `Repairs cost ${cost} coins.`;
  spend(g, life, cost);
  touchLife(g, life);
  b.condition = 100;
  if (b.quirk === "leaks a little" || b.quirk === "a foul bottom")
    delete b.quirk;
  journal(
    g,
    life,
    `The ${b.name} is careened, scraped, caulked and painted: as good as new.`,
  );
  return null;
}

export function sellPrice(b: Boat): number {
  return Math.round(BOATS[b.kind].price * (b.condition / 100) * 0.6 * 10) / 10;
}

export function sellBoat(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const b = mine(life, id);
  if (!b) return "Not your boat.";
  const why = alongside(life, b);
  if (why) return why;
  const price = sellPrice(b);
  disbandShip(g, life, b, "is sold"); // SHIPS (r21): her company paid off
  earn(g, life, price);
  touchLife(g, life);
  life.boats = boatsOf(life).filter((x) => x !== b);
  for (const f of peopleOf(life))
    if (f.task?.kind === "boat" && f.task.boat === b.id) f.task = null;
  journal(g, life, `You sell the ${b.name} for ${price} coins.`);
  return null;
}

export function setUse(
  g: ConquestGame,
  life: Life,
  id: number,
  use: string,
): string | null {
  const b = mine(life, id);
  if (!b) return "Not your boat.";
  if (!(use in USE_NAMES)) return "No such use.";
  const u = use as BoatUse;
  if (!BOATS[b.kind].uses.includes(u))
    return `A ${BOATS[b.kind].name.toLowerCase()} can't be used for that.`;
  touchLife(g, life);
  b.use = u;
  return null;
}

/** Put one of your mates aboard as skipper: she works while you're elsewhere. */
export function setSkipper(
  g: ConquestGame,
  life: Life,
  id: number,
  fid: number,
): string | null {
  const b = mine(life, id);
  if (!b) return "Not your boat.";
  touchLife(g, life);
  if (fid < 0) {
    for (const f of peopleOf(life))
      if (f.task?.kind === "boat" && f.task.boat === b.id) f.task = null;
    b.away = null;
    return null;
  }
  const f = peopleOf(life).find((x) => x.id === fid);
  if (!f || f.kind !== "mate") return "Only a mate can skipper her.";
  if (f.task) return "They're busy.";
  if (b.prov !== life.prov || life.travel)
    return "Bring your mate to where she lies.";
  f.task = { kind: "boat", p: b.prov, back: g.s.day + 99999, boat: b.id };
  journal(
    g,
    life,
    `${charName(g.s.chars[f.c])} takes command of the ${b.name}.`,
  );
  return null;
}

export function renameBoat(
  g: ConquestGame,
  life: Life,
  id: number,
  name: string,
): string | null {
  const b = mine(life, id);
  if (!b) return "Not your boat.";
  const clean = name
    .replace(/[^\p{L}\p{M}' .-]/gu, "")
    .trim()
    .slice(0, 24);
  if (clean.length < 2) return "A name, please.";
  touchLife(g, life);
  b.name = clean;
  return null;
}

// ---------------------------------------------------------------- sailing your own

/** Days for a leg in your own boat: you sail when you're ready (one day to get away), at her speed. */
export function boatHopDays(
  map: MapDef,
  from: number,
  to: number,
  kind: BoatKind,
  /** SHIPS (r21): her own speed (a navigator, new sails, copper), else her kind's. */
  speed = BOATS[kind].speed,
): number {
  const lane = map.provinces[from].sea.find(([q]) => q === to);
  if (!lane) return -1;
  return ownBoatHopDays(lane[1], speed); // SEA (r15): 160 km a day
}

export interface BoatRoute {
  path: number[];
  legs: number[];
  days: number;
}

/** The way by sea in your own boat, landfall to landfall, within her reach. */
export function boatRoute(
  map: MapDef,
  from: number,
  to: number,
  kind: BoatKind,
): BoatRoute | null {
  if (from === to || !map.provinces[to]?.coastal) return null;
  const n = map.provinces.length;
  const days = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  days[from] = 0;
  const reach = BOATS[kind].reach;
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++)
      if (!done[i] && days[i] < best) {
        best = days[i];
        u = i;
      }
    if (u < 0 || u === to) break;
    done[u] = 1;
    for (const [q, km] of map.provinces[u].sea) {
      if (km > reach) break;
      if (done[q]) continue;
      const d = best + ownBoatHopDays(km, BOATS[kind].speed); // SEA (r15)
      if (d < days[q]) {
        days[q] = d;
        prev[q] = u;
      }
    }
  }
  if (!Number.isFinite(days[to])) return null;
  const path: number[] = [];
  for (let c = to; c !== from; c = prev[c]) path.push(c);
  path.reverse();
  const legs: number[] = [];
  let at = from;
  for (const q of path) {
    legs.push(boatHopDays(map, at, q, kind));
    at = q;
  }
  return { path, legs, days: legs.reduce((a, b) => a + b, 0) };
}

/** Whether you can sail in this boat now, and where. */
export function sailCheck(
  s: GameState,
  map: MapDef,
  life: Life,
  b: Boat | undefined,
  to: number,
): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (!b) return no("Not your boat.");
  if (life.crime?.jail) return no("Not from a cell.");
  if (life.travel) return no("You're on the road already.");
  if (b.away) return no("She's away with her skipper.");
  // SHIPS (r21): at sea under her own master, or on a charter.
  if (b.way) return no("She's at sea.");
  if (b.charter)
    return no("She's on a charter: it's her work till it's done (or given up).");
  if (b.prov !== life.prov)
    return no(`She lies at ${map.provinces[b.prov].name}.`);
  if ((life.job?.army ?? -1) >= 0) return no("You march with your army.");
  if (s.armies.some((a) => a.commander === me.id))
    return no("You command an army.");
  if (life.job?.kind === "servant" && (life.job.until ?? 0) > s.day)
    return no("Servants don't come and go as they please.");
  // SHIPS (r21): her company by name who are with her count among her men.
  const men = menWithHer(s, life, b);
  if (men < BOATS[b.kind].crew)
    return no(`She needs ${BOATS[b.kind].crew} hands (she has ${men}).`);
  if (b.condition < 25) return no("She's not fit for sea: repair her first.");
  if (!map.provinces[to]?.coastal)
    return no("She can only take you to the coast.");
  if (to === life.prov) return no("You're here.");
  if (!boatRoute(map, life.prov, to, b.kind))
    return no(
      `Too far for a ${BOATS[b.kind].name.toLowerCase()} (she can sail ${BOATS[b.kind].reach} km between landfalls).`,
    );
  return yes;
}

/** Set sail in your own boat. */
export function sail(
  g: ConquestGame,
  life: Life,
  boatId: number,
  to: number,
): string | null {
  const s = g.s;
  const b = mine(life, boatId);
  const check = sailCheck(s, g.map, life, b, to);
  if (!check.ok) return check.why;
  // SHIPS (r21): at her own speed, a day more to float her off a beach.
  const route = passageOf(s, g.map, life, b!, to) ?? boatRoute(g.map, life.prov, to, b!.kind)!;
  b!.stay = null;
  delete b!.moor;
  touchLife(g, life).travel = {
    dest: to,
    path: route.path,
    sea: route.path.map(() => true),
    depart: s.day,
    arrive: s.day + route.legs[0],
    cost: 0,
    boat: b!.id,
  };
  journal(
    g,
    life,
    `You sail in the ${b!.name} for ${g.map.provinces[to].name}: about ${Math.ceil(route.days)} days, no fare to pay.`,
  );
  boardCrew(g, life, b!); // SHIPS (r21): her company at the quay come with her
  return null;
}

/** Arrived: your boat lies where you landed. */
export function landBoat(
  g: ConquestGame,
  life: Life,
  id: number,
  p: number,
): void {
  const b = mine(life, id);
  if (!b) return;
  touchLife(g, life);
  b.prov = p;
  b.condition = Math.max(0, b.condition - 1);
  gainXp(g, life, "seamanship", 3);
}

/** On a voyage in your own boat, the next leg's days. */
export function nextLegDays(
  g: ConquestGame,
  life: Life,
  from: number,
  to: number,
): number {
  const t = life.travel;
  const b = t?.boat !== undefined ? mine(life, t.boat) : undefined;
  if (!b) return -1;
  return Math.max(
    1,
    boatHopDays(g.map, from, to, b.kind, speedOf(g.s, life, b)), // SHIPS (r21)
  );
}

/** Goods you can carry: on your back (20), your hands' backs, and your boat's hold where she lies. */
export function boatHold(life: Life, p: number): number {
  return boatAt(life, p).reduce((m, b) => m + BOATS[b.kind].loads, 0);
}

// ---------------------------------------------------------------- the months

/**
 * LEDGER (r15): what each kind of work can bring, and its dangers: the one
 * table the month's work is rolled from and the odds shown before you put
 * her to it are reckoned from (Odds.ts). Spreads are [least, width]: the
 * month's luck is least + a roll × width.
 */
export const BOAT_WORK = {
  fishing: {
    base: {
      canoe: 1.2,
      shallop: 3.5,
      sloop: 7,
      schooner: 10,
      brig: 0,
      ship: 0,
    },
    /** Where the fish are thick (a province whose good is fish). */
    grounds: 1.5,
    /** In a northern winter. */
    winter: 0.4,
    spread: [0.7, 0.6],
    squall: { p: 0.015, damage: 15 },
  },
  whaling: {
    /** No whales south of this. */
    minLat: 39.5,
    base: { canoe: 0, shallop: 0, sloop: 14, schooner: 20, brig: 30, ship: 45 },
    /** A voyage that finds nothing. */
    empty: 0.35,
    luck: [0.6, 1.6],
    stove: { p: 0.04, damage: 20, men: 1 },
  },
  trading: {
    perLoad: 0.14,
    spread: [0.4, 1.2],
    /** Lost with her cargo. */
    lost: 0.012,
  },
  smuggling: {
    perLoad: 0.26,
    spread: [0.5, 1],
    heat: 4,
    /** Seized by the customs, cargo and all. */
    seized: 0.035,
    seizedHeat: 20,
  },
  privateering: {
    prize: 0.35,
    perGun: 4,
    spread: [0.5, 1],
    /** With no war on it's piracy: the law's heat, every month. */
    pirateHeat: 10,
    fight: { p: 0.06, damage: 25, crew: 0.2 },
    /** Taken by a frigate. */
    taken: 0.012,
  },
} as const;

/** LEDGER (r15): what a month wears off her, laid up or at work (more if she leaks). */
export const BOAT_WEAR = { idle: 0.5, work: 2, leak: 0.5 };

/** LEDGER (r15): her master's skill, as a multiplier on what she brings in. */
export function boatKnack(skill: number): number {
  return 0.7 + Math.min(20, skill) * 0.04;
}

/** LEDGER (r15): whether it's winter at her port (fishing's poor), on a day. */
export function boatWinter(map: MapDef, p: number, day: number): boolean {
  const month = Math.floor((day % 365) / 30.5);
  return isWinter(map.provinces[p].lat, month);
}

/** A boat's month: keep, wages, morale, and whatever she's used for. */
export function boatsMonthly(g: ConquestGame, life: Life): void {
  const was = setFlow(g, null); // LEDGER (r15)
  for (const b of [...boatsOf(life)]) {
    touchLife(g, life);
    // LEDGER (r15): her crew's wages and keep, in the month's books.
    setFlow(g, boatFlow(b, false));
    const def = BOATS[b.kind];
    const wages = Math.round((def.upkeep + b.crew * CREW_WAGE) * 10) / 10;
    if (life.purse >= wages) {
      spend(g, life, wages);
      b.owed = 0;
      b.morale = Math.min(100, b.morale + 3);
    } else {
      spend(g, life, Math.max(0, Math.min(life.purse, def.upkeep)));
      b.owed = (b.owed ?? 0) + 1;
      b.morale = Math.max(0, b.morale - 20);
      if (b.crew && ((b.owed ?? 0) >= 2 || b.morale < 20)) {
        journal(
          g,
          life,
          `The ${b.name}'s crew, unpaid, have gone ashore for good.`,
          "bad",
        );
        wake(g, life, `The ${b.name}'s crew have deserted.`);
        b.crew = 0;
        b.use = "idle";
        setSkipper(g, life, b.id, -1);
      } else if (b.crew)
        journal(
          g,
          life,
          `You couldn't pay the ${b.name}'s crew. They're muttering.`,
          "bad",
        );
    }
    // SHIPS (r21): a bosun and copper save her wear; at sea on a charter her
    // passages wear her (Ships.ts), and her standing work waits.
    const busy = !!(b.charter || b.way || b.stay);
    b.condition = Math.max(
      0,
      b.condition -
        (b.use === "idle" || busy ? BOAT_WEAR.idle : BOAT_WEAR.work) *
          shipFx(g.s, life, b).wear -
        (b.quirk === "leaks a little" ? BOAT_WEAR.leak : 0),
    );
    if (b.condition <= 0) {
      lose(g, life, b, `The ${b.name} rotted at her moorings and sank.`);
      continue;
    }
    setFlow(g, boatFlow(b, true)); // LEDGER (r15): what her work brings
    if (b.use !== "idle" && !busy) work(g, life, b);
  }
  setFlow(g, was);
}

/** LEDGER (r15): the name a boat's money goes under in the month's books. */
export function boatFlow(b: Boat, job: boolean): FlowTag {
  return job
    ? {
        key: `bj:${b.id}`,
        label: `The ${b.name}, ${USE_NAMES[b.use].toLowerCase()}`,
        chance: true,
        aff: "boat",
      }
    : {
        key: `b:${b.id}`,
        label: `The ${b.name}: crew and keep`,
        aff: "boat",
      };
}

function lose(g: ConquestGame, life: Life, b: Boat, text: string): void {
  touchLife(g, life);
  disbandShip(g, life, b, "is lost"); // SHIPS (r21): her company paid off
  life.boats = boatsOf(life).filter((x) => x !== b);
  for (const f of peopleOf(life))
    if (f.task?.kind === "boat" && f.task.boat === b.id) f.task = null;
  if (life.travel?.boat === b.id) delete life.travel.boat;
  journal(g, life, text, "bad");
  wake(g, life, text);
}

/**
 * Who's in command of her this month. LEDGER (r15): exported, for the odds.
 * SHIPS (r21): her captain, you if you're with her, your mate as her skipper,
 * her mate, or (with nobody of yours) her senior hand: she always works.
 */
export function boatMaster(
  s: GameState,
  life: Life,
  b: Boat,
): { skill: number; you: boolean; c?: number; who: string; kind: string } {
  const m = shipFx(s, life, b).master;
  return { skill: m.skill, you: m.kind === "you", c: m.c, who: m.who, kind: m.kind };
}

/** Exported for SHIPS (r21): a boat is gone (lost, seized, taken). */
export const loseBoat = (g: ConquestGame, life: Life, b: Boat, text: string) =>
  lose(g, life, b, text);

function work(g: ConquestGame, life: Life, b: Boat): void {
  const s = g.s;
  const def = BOATS[b.kind];
  // SHIPS (r21): who commands her and what her people do for her. With you
  // or your skipper aboard she works as she always did (the world's dice);
  // without (her captain, her mate, her senior hand), on her own dice.
  const fx = shipFx(s, life, b);
  const m = fx.master;
  if (menWithHer(s, life, b) < def.crew) return;
  const rng =
    m.kind === "you" || m.kind === "skipper" ? g.rng : shipDice(g, b.id, 3);
  const p = b.prov;
  const map = g.map.provinces[p];
  const winter = boatWinter(g.map, p, s.day);
  const knack = fx.knack;
  const name = b.name;
  let got = 0;
  switch (b.use) {
    case "fishing": {
      const F = BOAT_WORK.fishing;
      const base = F.base[b.kind];
      const fishy = g.w.raw[p] === "fish" ? F.grounds : 1;
      got =
        base *
        fishy *
        knack *
        (winter ? F.winter : 1) *
        (F.spread[0] + rng.next() * F.spread[1]);
      if (rng.chance(F.squall.p)) {
        b.condition = Math.max(0, b.condition - F.squall.damage);
        journal(
          g,
          life,
          `A squall caught the ${name} on the banks: damaged, but home.`,
          "bad",
        );
      }
      break;
    }
    case "whaling": {
      const W = BOAT_WORK.whaling;
      if (map.lat < W.minLat) {
        journal(g, life, `No whales off ${map.name}: the ${name} lies idle.`);
        b.use = "idle";
        return;
      }
      const base = W.base[b.kind];
      const luck =
        rng.next() < W.empty ? 0 : W.luck[0] + rng.next() * W.luck[1];
      got = base * luck * knack;
      if (rng.chance(W.stove.p)) {
        b.condition = Math.max(0, b.condition - W.stove.damage);
        b.crew = Math.max(0, b.crew - Math.round(W.stove.men * fx.men)); // SHIPS (r21): her surgeon
        journal(
          g,
          life,
          `A whale stove in one of the ${name}'s boats. A man was lost.`,
          "bad",
        );
      }
      break;
    }
    case "trading": {
      const T = BOAT_WORK.trading;
      got =
        def.loads *
        T.perLoad *
        knack *
        (T.spread[0] + rng.next() * T.spread[1]);
      if (rng.chance(T.lost * fx.loss)) {
        lose(
          g,
          life,
          b,
          `The ${name} was lost with her cargo off ${map.name}.`,
        );
        return;
      }
      break;
    }
    case "smuggling": {
      const S = BOAT_WORK.smuggling;
      got =
        def.loads *
        S.perLoad *
        knack *
        (S.spread[0] + rng.next() * S.spread[1]);
      const nation = lawAt(s, p);
      addHeat(g, life, nation, S.heat);
      if (rng.chance(S.seized)) {
        lose(
          g,
          life,
          b,
          `Customs officers seized the ${name} at ${map.name}, cargo and all.`,
        );
        addHeat(g, life, nation, S.seizedHeat);
        return;
      }
      break;
    }
    case "privateering": {
      const P = BOAT_WORK.privateering;
      const me = meOf(s, life);
      const at = me
        ? s.wars.filter((w) => w.a === me.nation || w.b === me.nation)
        : [];
      const pirate = !at.length;
      if (rng.chance(P.prize)) {
        got =
          gunsOf(b) * // SHIPS (r21): more guns refitted
          P.perGun *
          (P.spread[0] + rng.next() * P.spread[1]) *
          knack;
        journal(
          g,
          life,
          `The ${name} took a prize${pirate ? " (with no war on, that's piracy)" : ""}: ${Math.round(got)} coins of it yours.`,
          "good",
        );
        addRenown(g, life, pirate ? 0 : 1);
      }
      if (pirate) addHeat(g, life, lawAt(s, p), P.pirateHeat);
      if (rng.chance(P.fight.p)) {
        b.condition = Math.max(0, b.condition - P.fight.damage);
        b.crew = Math.max(0, b.crew - Math.ceil(b.crew * P.fight.crew * fx.men)); // SHIPS (r21)
        journal(
          g,
          life,
          `The ${name} fought a merchantman that fought back: battered and short-handed.`,
          "bad",
        );
      }
      if (rng.chance(P.taken)) {
        lose(
          g,
          life,
          b,
          `The ${name} was taken by a ${pirate ? "navy" : "enemy"} frigate.`,
        );
        return;
      }
      break;
    }
  }
  got = Math.round(got * 10) / 10;
  if (got > 0 && b.use !== "privateering") {
    earn(g, life, got);
    journal(
      g,
      life,
      `The ${name} (${USE_NAMES[b.use].toLowerCase()}) brought in ${got} coins this month.`,
    );
  } else if (got > 0) earn(g, life, got);
  if (got > 0) b.morale = Math.min(100, b.morale + 4);
  if (m.kind === "you") gainXp(g, life, "seamanship", 4);
}

// ---------------------------------------------------------------- at sea in your own boat

/** A storm, a pirate, a reef: what the road at sea does to your own boat. */
export function batterBoat(
  g: ConquestGame,
  life: Life,
  n: number,
): string | null {
  const id = life.travel?.boat;
  const b = id !== undefined ? mine(life, id) : undefined;
  if (!b) return null;
  touchLife(g, life);
  b.condition = Math.max(0, b.condition - n);
  if (b.condition <= 0) {
    const name = b.name;
    lose(
      g,
      life,
      b,
      `The ${name} went down under you. You came ashore on a spar.`,
    );
    return name;
  }
  return b.name;
}

/** Pirates take your boat (you're put ashore). */
export function takeBoat(g: ConquestGame, life: Life, text: string): void {
  const id = life.travel?.boat;
  const b = id !== undefined ? mine(life, id) : undefined;
  if (b) lose(g, life, b, text);
}

export function sailingOwn(life: Life): Boat | undefined {
  const id = life.travel?.boat;
  return id !== undefined ? mine(life, id) : undefined;
}

// ---------------------------------------------------------------- commands

export function boatCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k === "sail") return sail(g, life, c.boat, c.to);
  if (c.k !== "boat") return undefined;
  if (isChildLife(g.s, life)) return "Not as a child.";
  switch (c.act) {
    case "buy": {
      beginOutcome(g, life);
      let err: string | null = null;
      try {
        outcomeMeta(g, life, {
          key: "boat-buy",
          title: "A boat of your own",
          scene: "docks",
          c: -1,
          ok: null,
        });
        err = buyBoat(g, life, c.kind as BoatKind | undefined, c.arg ?? -1);
      } finally {
        endOutcome(g, life, "act", err !== null);
      }
      return err;
    }
    case "crew":
      return setCrew(g, life, c.id ?? -1, c.arg ?? 0);
    case "repair":
      return repairBoat(g, life, c.id ?? -1);
    case "sell":
      return sellBoat(g, life, c.id ?? -1);
    case "use":
      return setUse(g, life, c.id ?? -1, c.use ?? "idle");
    case "skipper":
      return setSkipper(g, life, c.id ?? -1, c.arg ?? -1);
    case "name":
      return renameBoat(g, life, c.id ?? -1, c.name ?? "");
    default:
      return "Unknown.";
  }
}
