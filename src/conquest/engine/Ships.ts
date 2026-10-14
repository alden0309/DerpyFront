// SHIPS (r21): ships worth owning, without being complicated.
//
// - Her company, by name (Hiring.ts's ladder: hand, bosun, surgeon,
//   navigator, mate, captain): the computer's seamen looking for a berth at
//   the quay, the town's own seamen, or other players, each at the role and
//   pay you set, promoted or demoted whenever you like. What each does for
//   her is in `shipFx`, from ShipsData's SHIP_FX: her captain commands her
//   (her takings ride on his seamanship), a bosun saves her wear, a
//   navigator makes her passages quicker and safer, a surgeon saves her men,
//   a mate commands when there's no captain and keeps their spirits up.
// - She keeps working without you. With nobody of yours aboard, her captain
//   or mate commands her; with neither, her senior hand. Her standing work
//   (fishing, the coasting trade...) goes on, and so do her charters.
// - Charters at the quay (`chartersAt`, the same for everyone each month):
//   freight, passengers, the coastal packet, the fishing grounds, a whaling
//   season, a smuggling run; or a venture of your own cargo. Each shows its
//   odds before you take it (`charterOdds`, from the tables the passage is
//   rolled from). She sails on the map (`Boat.way`), under her own master or
//   with you aboard commanding her, and the players of her company at her
//   port go with her. Delivered, she's paid; late, docked; her log and her
//   name on the waterfront remember it.
// - Refits (copper, sails, guns, cabins), and careening her on a beach.
// - Where there's no port she's beached (a small one) or anchors offshore (a
//   brig or a ship); you go ashore in her boat, and leave in her again.
// - A stay at a port on the way: her commander can lie over at the next port
//   as long as he likes, and resume the voyage if it's under two months.
//
// Every roll of hers is on her own dice (`shipDice`: the game's seed, the
// day, her id), so the world's dice are never moved by a ship of yours.

import {
  BOAT_WORK,
  boatRoute,
  BOATS,
  boatsOf,
  boatWinter,
  CREW_WAGE,
  loseBoat,
  repairCost,
  sail,
  sellPrice,
} from "./Boats";
import { dateOf } from "./Calendar";
import { addHeat } from "./Crime";
import { lawAt } from "./CrimeQueries";
import { followerSkill, peopleOf } from "./Followers";
import type { ConquestGame } from "./Game";
import {
  answerOffer,
  disband,
  dismiss,
  hire,
  type HireHost,
  offerPlace,
  payRoster,
  prospectOf,
  registerHost,
  roleOf,
  setPay,
  setRole,
  signOdds,
  withdrawOffer,
} from "./Hiring";
import { hooks } from "./Hooks";
import { withFlow } from "./LedgerCore";
import { earn, gainXp, hurt, journal, spend, touchLife } from "./LifeCore";
import {
  type Check,
  hasPlace,
  isChildLife,
  lifeOfSeat,
  meOf,
  no,
  npcSkill,
  skillLevel,
  yes,
} from "./LifeQueries";
import { SKILL_MAX } from "./LifeRules";
import type { World } from "./Map";
import { cutFor, hasMarket, marketMove, quoteCut, soldHere } from "./Markets";
import { NAMES } from "./Names";
import type { OddsOutcome, OddsView } from "./Odds";
import { wake } from "./Pace";
import { atWar, charName } from "./Queries";
import { Rng } from "./Rng";
import { ownBoatHopDays } from "./SeaSpeed";
import {
  BEACHED,
  CHARTER,
  CHARTER_NAMES,
  HANDS_ROOM,
  MOOR,
  PASSAGE_RISK,
  REFIT_FX,
  REFITS,
  REP,
  ROLE_ROOM,
  SHIP_FX,
  SHIP_LADDER,
  STAY_DAYS,
} from "./ShipsData";
import type {
  Boat,
  Character,
  Charter,
  CharterKind,
  GameState,
  Good,
  Hire,
  Life,
  LifeCommand,
  MapDef,
  Part,
  RefitKey,
  ShipJob,
  ShipWay,
} from "./Types";
import { GOODS } from "./Types";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- her own dice

function hashOf(...xs: number[]): number {
  let h = 2166136261 | 0;
  for (const x of xs) {
    h = Math.imul(h ^ (x | 0), 16777619);
    h ^= h >>> 13;
  }
  return h | 0;
}

/** A ship's own dice for a purpose on a day (the world's dice are never touched). */
export function shipDice(g: ConquestGame, id: number, salt: number): Rng {
  return new Rng({ rng: hashOf(g.s.settings.seed, g.s.day, id, salt, 0x5a1b) });
}

// ---------------------------------------------------------------- where she is

/** The province she's at now, or the one she sailed from last (under way). */
export function shipProv(b: Boat): number {
  return b.way ? b.way.prov : b.prov;
}

/** A player is aboard her, under way with her. */
export function aboardShip(l: Life, seat: string, b: Boat): boolean {
  const w = l.travel?.with;
  return !!w && w.boat === b.id && w.seat === seat;
}

/** A player is ashore where she lies (and she isn't under way). */
export function alongsideShip(l: Life, b: Boat): boolean {
  return !l.travel && !b.way && l.prov === b.prov;
}

/** The owner's boat of an id. */
export function boatOf(life: Life, id: number | undefined): Boat | undefined {
  return boatsOf(life).find((b) => b.id === id);
}

// ---------------------------------------------------------------- her company

/** Her company as an outfit people are taken on into (Hiring.ts). */
export function hostOfBoat(s: GameState, owner: Life, b: Boat): HireHost {
  return {
    kind: "ship",
    seat: owner.seat,
    id: b.id,
    name: `the ${b.name}`,
    owner,
    prov: shipProv(b),
    ladder: SHIP_LADDER,
    roster: b.roster ?? { hires: [] },
    own: (g) => {
      touchLife(g, owner);
      return (b.roster ??= { hires: [] });
    },
    rep: b.rep ?? REP.start,
    room: (role) =>
      role === "hand"
        ? Math.max(0, Math.ceil(BOATS[b.kind].crew * HANDS_ROOM) - b.crew)
        : (ROLE_ROOM[b.kind][role] ?? 0),
    atPost: (st, l) => aboardShip(l, owner.seat, b) || alongsideShip(l, b),
    flow: { key: `bh:${b.id}`, label: `The ${b.name}: her company's pay` },
    // A hand by name takes the place of one of her hands by the head, if she has her full crew.
    joined: (g, h) => {
      if (h.role !== "hand" || b.crew <= 0) return;
      if (b.crew + namedHands(b) - 1 < BOATS[b.kind].crew) return;
      b.crew--;
      logShip(
        g,
        owner,
        b,
        `${charName(g.s.chars[h.c])} takes the place of one of her hands, who's paid off.`,
      );
    },
  };
}

registerHost("ship", {
  find: (s, seat, id) => {
    const owner = lifeOfSeat(s, seat);
    const b = owner ? boatOf(owner, id) : undefined;
    return owner && b ? hostOfBoat(s, owner, b) : undefined;
  },
  all: (s) => {
    const out: HireHost[] = [];
    for (const l of s.lives)
      for (const b of l.boats ?? [])
        if (b.roster && (b.roster.hires.length || b.roster.offers?.length))
          out.push(hostOfBoat(s, l, b));
    return out;
  },
  gone: "now she's no longer her owner's",
});

/** Her named company. */
export function hiresAboard(b: Boat): Hire[] {
  return b.roster?.hires ?? [];
}

/** Whether one of her company is with her now (the computer's always; a player at their post). */
export function hireWithHer(
  s: GameState,
  owner: Life,
  b: Boat,
  h: Hire,
): boolean {
  if (!h.seat) return !!s.chars[h.c]?.alive;
  const l = lifeOfSeat(s, h.seat);
  if (!l || l.c !== h.c || l.crime?.jail) return false;
  return aboardShip(l, owner.seat, b) || alongsideShip(l, b);
}

/** Men with her now: her hands signed by the head, and her company by name who are with her. */
export function menWithHer(s: GameState, owner: Life, b: Boat): number {
  return (
    b.crew + hiresAboard(b).filter((h) => hireWithHer(s, owner, b, h)).length
  );
}

/** Named hands (not officers) on her roster. */
export function namedHands(b: Boat): number {
  return hiresAboard(b).filter((h) => h.role === "hand").length;
}

/** A skill of one of her company. */
export function hireSkill(
  s: GameState,
  h: Hire,
  sk:
    | "seamanship"
    | "leadership"
    | "letters"
    | "medicine"
    | "trade"
    | "stealth",
): number {
  const c = s.chars[h.c];
  if (!c) return 0;
  const l = h.seat ? lifeOfSeat(s, h.seat) : undefined;
  return l && l.c === h.c ? skillLevel(s, l, sk) : npcSkill(s, c, sk);
}

/** Her officer in a role, if one's with her (the best, if two). */
export function officer(
  s: GameState,
  owner: Life,
  b: Boat,
  role: string,
): Hire | undefined {
  return hiresAboard(b)
    .filter((h) => h.role === role && hireWithHer(s, owner, b, h))
    .sort(
      (a, z) => hireSkill(s, z, "seamanship") - hireSkill(s, a, "seamanship"),
    )[0];
}

/** Fitness for a role (the role's weighted skills). */
function fitOf(s: GameState, h: Hire, role: string): number {
  const def = roleOf(SHIP_LADDER, role);
  if (!def) return 0;
  let v = 0;
  for (const [sk, w] of Object.entries(def.skills))
    v += hireSkill(s, h, sk as "seamanship") * (w ?? 0);
  return v;
}

export type MasterKind = "captain" | "you" | "skipper" | "mate" | "hand";

/** Who commands her and what her people do for her, as things stand. */
export interface ShipFx {
  master: { skill: number; kind: MasterKind; c?: number; who: string };
  /** × on what her work brings in. */
  knack: number;
  /** × on her wear a month. */
  wear: number;
  /** × on the chance she's lost on a passage, and that it runs late. */
  loss: number;
  late: number;
  /** × on men lost (a stove boat, a fight). */
  men: number;
  /** × on her speed. */
  speed: number;
  /** Spirits a month from her captain's or mate's leadership. */
  spirits: number;
  /** What changes it, in words (for the odds). */
  lines: string[];
}

/** The base knack for a master's seamanship (as Boats.ts's boatKnack: 0.7 with none, 1.5 at 20). */
function knackOf(skill: number): number {
  return 0.7 + Math.min(20, skill) * 0.04;
}

/** Who commands her, and what her people do for her. */
export function shipFx(s: GameState, owner: Life, b: Boat): ShipFx {
  const lines: string[] = [];
  const cap1 = (f: number) => Math.max(0, Math.min(1, f / SKILL_MAX));
  const captain = officer(s, owner, b, "captain");
  const mate = officer(s, owner, b, "mate");
  const youThere =
    aboardShip(owner, owner.seat, b) ||
    owner.travel?.boat === b.id ||
    (!owner.travel && owner.prov === b.prov && !b.way);
  const skipper = peopleOf(owner).find(
    (f) => f.task?.kind === "boat" && f.task.boat === b.id,
  );
  let master: ShipFx["master"];
  if (captain)
    master = {
      skill: hireSkill(s, captain, "seamanship"),
      kind: "captain",
      c: captain.c,
      who: `her captain, ${charName(s.chars[captain.c])}`,
    };
  else if (youThere)
    master = {
      skill: skillLevel(s, owner, "seamanship"),
      kind: "you",
      who: "you (you command her)",
    };
  else if (skipper)
    master = {
      skill: followerSkill(s, skipper),
      kind: "skipper",
      c: skipper.c,
      who: `her skipper, ${charName(s.chars[skipper.c])}`,
    };
  else if (mate)
    master = {
      skill: hireSkill(s, mate, "seamanship"),
      kind: "mate",
      c: mate.c,
      who: `her mate, ${charName(s.chars[mate.c])}`,
    };
  else {
    const best = hiresAboard(b)
      .filter((h) => hireWithHer(s, owner, b, h))
      .reduce((m, h) => Math.max(m, hireSkill(s, h, "seamanship")), 0);
    master = {
      skill: Math.max(SHIP_FX.seniorHand, best),
      kind: "hand",
      who: "her senior hand (nobody of yours commands her)",
    };
  }
  let knack = knackOf(master.skill);
  lines.push(
    `Her master: ${master.who}, seamanship ${master.skill}: ×${r2(knack)} on what she brings in.`,
  );
  // Named hands better than common ones make her a little better at everything.
  const def = BOATS[b.kind];
  const hands = hiresAboard(b).filter(
    (h) => h.role === "hand" && hireWithHer(s, owner, b, h),
  );
  if (hands.length && def.crew) {
    const over = hands.reduce(
      (m, h) => m + (hireSkill(s, h, "seamanship") - SHIP_FX.commonHand),
      0,
    );
    const x = Math.max(
      0.9,
      Math.min(1.1, 1 + (SHIP_FX.handsKnack * over) / Math.max(def.crew, 1)),
    );
    if (x !== 1) {
      knack *= x;
      lines.push(
        `Her hands by name: ×${r2(x)} (their seamanship against a common hand's).`,
      );
    }
  }
  if (b.morale < 30) {
    knack *= SHIP_FX.lowSpirits;
    lines.push(
      `Low spirits (${Math.round(b.morale)}): ×${SHIP_FX.lowSpirits}.`,
    );
  }
  let wear = 1;
  const bosun = officer(s, owner, b, "bosun");
  if (bosun) {
    const f = cap1(fitOf(s, bosun, "bosun"));
    wear *= 1 - SHIP_FX.bosunWear * f;
    lines.push(
      `Her bosun: ${Math.round(SHIP_FX.bosunWear * f * 100)}% less wear.`,
    );
  }
  if (b.refits?.includes("copper")) {
    wear *= REFIT_FX.copperWear;
    lines.push("Coppered: half the wear.");
  }
  let loss = 1;
  let late = 1;
  let speed = 1;
  const nav = officer(s, owner, b, "navigator");
  if (nav) {
    const f = cap1(fitOf(s, nav, "navigator"));
    loss *= 1 - SHIP_FX.navLoss * f;
    late *= 1 - SHIP_FX.navLate * f;
    speed *= 1 + SHIP_FX.navDays * f;
    lines.push(
      `Her navigator: ${Math.round(SHIP_FX.navLoss * f * 100)}% less likely lost, ${Math.round(SHIP_FX.navLate * f * 100)}% less likely late, ${Math.round(SHIP_FX.navDays * f * 100)}% quicker.`,
    );
  }
  if (b.refits?.includes("sails")) speed *= REFIT_FX.sailsSpeed;
  if (b.refits?.includes("copper")) speed *= REFIT_FX.copperSpeed;
  let men = 1;
  const surgeon = officer(s, owner, b, "surgeon");
  if (surgeon) {
    const f = cap1(fitOf(s, surgeon, "surgeon"));
    men *= 1 - SHIP_FX.surgeonMen * f;
    lines.push(
      `Her surgeon: ${Math.round(SHIP_FX.surgeonMen * f * 100)}% fewer men lost.`,
    );
  }
  const leader = [captain, mate]
    .filter((h): h is Hire => !!h)
    .reduce((m, h) => Math.max(m, hireSkill(s, h, "leadership")), 0);
  const spirits = r1(SHIP_FX.spirits * cap1(leader));
  if (spirits)
    lines.push(`Her officers' leadership: +${spirits} spirits a month.`);
  return {
    master,
    knack: r2(knack),
    wear: r2(wear),
    loss: r2(loss),
    late: r2(late),
    men: r2(men),
    speed: r2(speed),
    spirits,
    lines,
  };
}

/** Her guns, with the refit. */
export function gunsOf(b: Boat): number {
  const g = BOATS[b.kind].guns;
  return b.refits?.includes("guns") ? Math.round(g * REFIT_FX.guns) : g;
}

/** Her berths, with the refit. */
export function berthsOf(b: Boat): number {
  const n = BOATS[b.kind].berths;
  return b.refits?.includes("cabins") ? Math.round(n * REFIT_FX.cabins) : n;
}

/** Her speed (1 = a passage's), with her navigator and refits. */
export function speedOf(s: GameState, owner: Life, b: Boat): number {
  return r2(BOATS[b.kind].speed * shipFx(s, owner, b).speed);
}

// ---------------------------------------------------------------- her log and name

const LOG_MAX = 40;

export function logShip(
  g: ConquestGame,
  owner: Life,
  b: Boat,
  text: string,
): void {
  touchLife(g, owner);
  (b.log ??= []).push({ day: g.s.day, text });
  if (b.log.length > LOG_MAX) b.log.splice(0, b.log.length - LOG_MAX);
}

export function repOf(b: Boat): number {
  return b.rep ?? REP.start;
}

function addRep(b: Boat, n: number): void {
  b.rep = Math.max(0, Math.min(100, Math.round(repOf(b) + n)));
}

/** Her name in words. */
export function repWords(rep: number): string {
  if (rep >= 80) return "a famous ship: shippers ask for her by name";
  if (rep >= 65) return "a good name on the waterfront";
  if (rep >= 45) return "known on the waterfront";
  if (rep >= 30) return "a doubtful name: shippers ask questions";
  return "a bad name: shippers pass her by";
}

/** A good name pays more: ×0.85 to ×1.15. */
export function repPay(b: Boat): number {
  return r2(CHARTER.repPay + repOf(b) / 333);
}

// ---------------------------------------------------------------- the quay's charters

function portLevel(s: GameState, p: number): number {
  return s.provinces[p].b.port ?? 0;
}

/** Ports she can be chartered to: a lane from here, a quay there. */
function lanesTo(
  s: GameState,
  w: World,
  p: number,
  lo: number,
  hi: number,
): [number, number][] {
  // Not to a port of an enemy in wartime.
  const mine = s.provinces[p].owner;
  return w.map.provinces[p].sea.filter(
    ([q, km]) =>
      q !== p &&
      km >= lo &&
      km <= hi &&
      hasPlace(s, w, q, "docks") &&
      !(
        mine >= 0 &&
        s.provinces[q].owner >= 0 &&
        atWar(s, mine, s.provinces[q].owner)
      ),
  ) as [number, number][];
}

/** Days for a sloop over a lane, the measure a charter's time is allowed by. */
function sloopDays(km: number): number {
  return ownBoatHopDays(km, BOATS.sloop.speed);
}

function shipper(s: GameState, rng: Rng, p: number): string {
  const owner = s.provinces[p].owner;
  const culture = owner >= 0 ? s.nations[owner]?.culture : "english";
  const list = NAMES[culture ?? "english"] ?? NAMES.english;
  return `${rng.pick(["Mr.", "Mr.", "Mr.", "Mrs.", "Messrs."])} ${rng.pick(list.family)}`;
}

/** Goods to ship from a port: what the country makes, and what the colonies want from it. */
function freightGoods(w: World, p: number): Good[] {
  const raw = w.raw[p] as string;
  const out: Good[] = ["grain", "timber", "tools", "cloth"];
  if ((GOODS as readonly string[]).includes(raw))
    out.unshift(raw as Good, raw as Good);
  return out;
}

const LOADS = [10, 15, 20, 30, 40, 60, 90, 130, 200];

/** The charters on offer at a quay this month (the same for everyone). */
export function chartersAt(s: GameState, w: World, p: number): Charter[] {
  if (!w.map.provinces[p]?.coastal || !hasPlace(s, w, p, "docks")) return [];
  const level = Math.min(2, portLevel(s, p));
  const month = Math.floor(s.day / 30);
  const rng = new Rng({ rng: hashOf(s.settings.seed, p, month, 191) });
  const n = CHARTER.offers[level];
  const F = CHARTER.freight;
  const lanes = lanesTo(s, w, p, F.minKm, F.maxKm);
  const packetLanes = lanesTo(
    s,
    w,
    p,
    CHARTER.packet.minKm,
    CHARTER.packet.maxKm,
  );
  const grounds = (w.map.provinces[p].sea as [number, number][]).filter(
    ([q, km]) =>
      q !== p && km <= CHARTER.fishing.maxKm && (w.raw[q] as string) === "fish",
  );
  const whales = (w.map.provinces[p].sea as [number, number][]).filter(
    ([q, km]) =>
      q !== p &&
      km <= CHARTER.whaling.maxKm &&
      w.map.provinces[q].lat >= BOAT_WORK.whaling.minLat + 1.5,
  );
  const out: Charter[] = [];
  const kinds: [CharterKind, number][] = [
    ["freight", lanes.length ? 4 : 0],
    ["passengers", lanes.length ? 3 : 0],
    ["packet", packetLanes.length ? 1.2 : 0],
    ["fishing", grounds.length ? 1 : 0],
    ["whaling", whales.length && w.map.provinces[p].lat >= 38 ? 1 : 0],
    ["smuggling", lanes.length ? 0.8 : 0],
  ];
  const total = kinds.reduce((m, k) => m + k[1], 0);
  if (total <= 0) return out;
  // Nearer ports come up more often.
  const near = (list: [number, number][]) =>
    list.length
      ? list[
          Math.min(
            list.length - 1,
            Math.floor(rng.next() * rng.next() * list.length),
          )
        ]
      : undefined;
  // A great port has a great lading every month, for a far port: work for a brig or a ship.
  const far = lanes.filter(([, km]) => km >= CHARTER.great.minKm);
  for (let slot = 0; slot < n; slot++) {
    let roll = rng.next() * total;
    let kind: CharterKind = "freight";
    for (const [k, wgt] of kinds) {
      roll -= wgt;
      if (roll <= 0) {
        kind = k;
        break;
      }
    }
    const great = slot === 0 && level >= 2 && far.length > 0;
    const before = out.length;
    if (great) kind = "freight";
    const key = `${p}:${month}:${slot}`;
    const by = shipper(s, rng, p);
    if (kind === "freight" || kind === "smuggling") {
      const lane = great ? far[rng.int(0, far.length - 1)] : near(lanes)!;
      const goods =
        kind === "smuggling"
          ? (["sugar", "cloth", "tools", "guns"] as Good[])
          : freightGoods(w, p);
      const good = goods[rng.int(0, goods.length - 1)];
      const loads = great
        ? CHARTER.great.loads[rng.int(0, CHARTER.great.loads.length - 1)]
        : LOADS[Math.min(LOADS.length - 1, rng.int(0, 4 + level * 2))];
      const base = loads * (F.perLoad + (F.per100 * lane[1]) / 100);
      out.push({
        key,
        kind,
        from: p,
        to: lane[0],
        good,
        loads,
        pay: r1(kind === "smuggling" ? base * CHARTER.smuggling.pay : base),
        days: Math.ceil(sloopDays(lane[1]) * CHARTER.dueMul) + CHARTER.dueAdd,
        by,
      });
    } else if (kind === "passengers") {
      const lane = near(lanes)!;
      const heads = rng.int(2, 6 + level * 5);
      const P = CHARTER.passengers;
      out.push({
        key,
        kind,
        from: p,
        to: lane[0],
        heads,
        pay: r1(heads * (P.perHead + (P.per100 * lane[1]) / 100)),
        days: Math.ceil(sloopDays(lane[1]) * CHARTER.dueMul) + CHARTER.dueAdd,
        by,
      });
    } else if (kind === "packet") {
      const lane = near(packetLanes)!;
      out.push({
        key,
        kind,
        from: p,
        to: lane[0],
        pay: CHARTER.packet.pay.sloop,
        months: CHARTER.packet.months,
        days: CHARTER.packet.months * 30,
        by: "The colony's post office",
      });
    } else if (kind === "fishing") {
      const lane = near(grounds)!;
      out.push({
        key,
        kind,
        from: p,
        to: lane[0],
        pay: 0,
        months: CHARTER.fishing.months,
        days: CHARTER.fishing.months * 30,
        by: "Her own catch",
      });
    } else {
      const lane = near(whales)!;
      out.push({
        key,
        kind,
        from: p,
        to: lane[0],
        pay: 0,
        months: CHARTER.whaling.months,
        days: CHARTER.whaling.months * 30,
        by: "Her own catch",
      });
    }
    // The same thing twice in a month is one offer.
    const last = out[out.length - 1];
    if (
      out.length > before &&
      out
        .slice(0, -1)
        .some(
          (x) =>
            x.kind === last.kind && x.to === last.to && x.good === last.good,
        )
    )
      out.pop();
  }
  return out;
}

/** What a charter's lading is, in words. */
export function ladingWords(map: MapDef, c: Charter): string {
  const to = map.provinces[c.to]?.name ?? "somewhere";
  switch (c.kind) {
    case "freight":
      return `${c.loads} loads of ${c.good} for ${to}`;
    case "smuggling":
      return `${c.loads} loads of ${c.good}, run into ${to} past the customs`;
    case "venture":
      return `${c.loads} loads of ${c.good} of your own, to sell at ${to}`;
    case "passengers":
      return `${c.heads} passengers for ${to}`;
    case "packet":
      return `the post and passengers between ${map.provinces[c.from]?.name ?? "here"} and ${to}, ${c.months} months`;
    case "fishing":
      return `a season on the grounds off ${to}, ${c.months} months`;
    case "whaling":
      return `a whaling season off ${to}, ${c.months} months`;
  }
}

/** A charter's pay for her (her kind and her name). */
export function charterPay(b: Boat, c: Charter): number {
  if (c.kind === "packet") return CHARTER.packet.pay[b.kind];
  if (c.kind === "venture" || c.kind === "fishing" || c.kind === "whaling")
    return c.pay;
  const cabins =
    c.kind === "passengers" && b.refits?.includes("cabins")
      ? REFIT_FX.cabinsPay
      : 1;
  return r1(c.pay * repPay(b) * cabins);
}

/** Whether she can take a charter now, and how (with her owner aboard, or under her own master). */
export function charterCheck(
  s: GameState,
  w: World,
  owner: Life,
  b: Boat | undefined,
  c: Charter | undefined,
  aboard: boolean,
): Check {
  if (!meOf(s, owner)) return no("You're watching.");
  if (!b) return no("Not your boat.");
  if (!c) return no("That charter's gone.");
  if (isChildLife(s, owner)) return no("Not as a child.");
  if (b.way) return no("She's at sea.");
  if (b.charter) return no("She's on a charter already.");
  if (b.stay)
    return no("She's lying over on a voyage: resume it, or end it, first.");
  if (b.prov !== c.from) return no("That's offered at another port.");
  if (owner.cooldowns[`ch:${c.key}`]) return no("You've taken it.");
  const def = BOATS[b.kind];
  const here = !owner.travel && owner.prov === b.prov;
  const captain =
    officer(s, owner, b, "captain") ?? officer(s, owner, b, "mate");
  if (!here && !captain)
    return no(
      "Be where she lies, or have a captain or mate of hers to send word to.",
    );
  if (aboard) {
    if (!here) return no("You'd have to be where she lies to sail in her.");
    if (owner.crime?.jail) return no("Not from a cell.");
    if ((owner.job?.army ?? -1) >= 0) return no("You march with your army.");
  }
  if (menWithHer(s, owner, b) < def.crew)
    return no(
      `She needs ${def.crew} men to sail (she has ${menWithHer(s, owner, b)}).`,
    );
  if (b.condition < 40)
    return no("She's not fit for a charter: repair her first.");
  switch (c.kind) {
    case "freight":
    case "smuggling":
    case "venture":
      if ((c.loads ?? 0) > def.loads)
        return no(`Her hold takes ${def.loads} loads; it's ${c.loads}.`);
      break;
    case "passengers":
      if ((c.heads ?? 0) > berthsOf(b))
        return no(`She has ${berthsOf(b)} berths; it's ${c.heads} passengers.`);
      break;
    case "packet":
      if (!CHARTER.packet.pay[b.kind])
        return no(`The post wants a shallop, a sloop, a schooner or a brig.`);
      break;
    case "fishing":
      if (!BOAT_WORK.fishing.base[b.kind]) return no("She's no fishing boat.");
      break;
    case "whaling":
      if (!BOAT_WORK.whaling.base[b.kind])
        return no("A sloop or bigger for whaling.");
      break;
  }
  if (!boatRoute(w.map, b.prov, c.to, b.kind))
    return no(
      `Too far for a ${def.name.toLowerCase()} (${def.reach} km between landfalls).`,
    );
  if (c.kind === "venture" && owner.purse < ventureCost(s, w, owner, c))
    return no(`The cargo costs ${ventureCost(s, w, owner, c)} coins.`);
  return yes;
}

/** A venture's cost here, at your merchant's cut. */
export function ventureCost(
  s: GameState,
  w: World,
  owner: Life,
  c: Charter,
): number {
  return quoteCut(s, w, c.from, c.good as Good, c.loads ?? 0, cutFor(s, owner))
    .total;
}

/** What a venture's cargo would fetch there today. */
export function ventureSale(
  s: GameState,
  w: World,
  owner: Life,
  c: Charter,
): number {
  return quoteCut(s, w, c.to, c.good as Good, -(c.loads ?? 0), cutFor(s, owner))
    .total;
}

/** A venture of your own: a good sold here, to a port with a market. */
export function ventureCharter(
  s: GameState,
  w: World,
  b: Boat,
  good: string,
  to: number,
  loads: number,
): Charter | undefined {
  if (!(GOODS as readonly string[]).includes(good)) return undefined;
  if (!w.map.provinces[to]?.coastal || !hasMarket(s, w, to)) return undefined;
  if (!soldHere(s, w, b.prov, good as Good)) return undefined;
  const route = boatRoute(w.map, b.prov, to, b.kind);
  if (!route) return undefined;
  const n = Math.max(1, Math.min(BOATS[b.kind].loads, Math.round(loads)));
  return {
    key: `own:${good}:${to}:${s.day}`,
    kind: "venture",
    from: b.prov,
    to,
    good,
    loads: n,
    pay: 0,
    days: Math.ceil(route.days * CHARTER.dueMul) + CHARTER.dueAdd,
    by: "Your own",
  };
}

// ---------------------------------------------------------------- a passage's odds

/** The way to a port for her, and the km and days of it. */
export function passageOf(
  s: GameState,
  map: MapDef,
  owner: Life,
  b: Boat,
  to: number,
): { path: number[]; legs: number[]; days: number; km: number } | null {
  const route = boatRoute(map, shipProv(b), to, b.kind);
  if (!route) return null;
  const fx = shipFx(s, owner, b);
  let at = shipProv(b);
  let km = 0;
  const legs: number[] = [];
  for (const q of route.path) {
    const lane = map.provinces[at].sea.find(([x]) => x === q);
    const d = lane ? lane[1] : 0;
    km += d;
    legs.push(ownBoatHopDays(d, BOATS[b.kind].speed * fx.speed));
    at = q;
  }
  if (b.moor === "beach" && legs.length) legs[0] += MOOR.floatDays;
  return { path: route.path, legs, days: legs.reduce((a, z) => a + z, 0), km };
}

/** The chances of a passage of `km` for her: lost, late, battered. */
export function passageChances(
  s: GameState,
  owner: Life,
  b: Boat,
  km: number,
): { lost: number; late: number; damage: number } {
  const fx = shipFx(s, owner, b);
  const worn = b.condition < PASSAGE_RISK.worn ? 1.5 : 1;
  const per = PASSAGE_RISK.lostPer1000 * fx.loss * worn;
  return {
    lost: r2(1 - Math.pow(1 - per, km / 1000)) || (km > 0 ? 0.001 : 0),
    late: r2(PASSAGE_RISK.late * fx.late),
    damage: PASSAGE_RISK.damage.p,
  };
}

/** What she'd earn a month on the grounds (expected, and the range), from BOAT_WORK's tables. */
function seasonMonth(
  s: GameState,
  w: World,
  owner: Life,
  b: Boat,
  c: Charter,
): { exp: number; lo: number; hi: number } {
  const knack = shipFx(s, owner, b).knack;
  if (c.kind === "fishing") {
    const F = BOAT_WORK.fishing;
    const a = F.base[b.kind] * CHARTER.fishing.grounds * knack;
    return {
      exp: r1(a * (F.spread[0] + F.spread[1] / 2)),
      lo: r1(a * F.spread[0]),
      hi: r1(a * (F.spread[0] + F.spread[1])),
    };
  }
  const W = BOAT_WORK.whaling;
  const a = W.base[b.kind] * knack;
  return {
    exp: r1((1 - W.empty) * a * (W.luck[0] + W.luck[1] / 2)),
    lo: 0,
    hi: r1(a * (W.luck[0] + W.luck[1])),
  };
}

/** Risk and reward of a charter for her, before she takes it: from the same tables she's rolled by. */
export function charterOdds(
  s: GameState,
  w: World,
  owner: Life,
  b: Boat,
  c: Charter,
  aboard = false,
): OddsView {
  const def = BOATS[b.kind];
  const fx = shipFx(s, owner, b);
  const route = passageOf(s, w.map, owner, b, c.to);
  const check = charterCheck(s, w, owner, b, c, aboard);
  const km = route?.km ?? 0;
  const ch = passageChances(s, owner, b, km);
  const pay = charterPay(b, c);
  const costMonth = r1(
    def.upkeep +
      b.crew * CREW_WAGE +
      hiresAboard(b).reduce((m, h) => m + h.pay, 0),
  );
  const view: OddsView = {
    title: `${CHARTER_NAMES[c.kind]}: ${ladingWords(w.map, c)}`,
    ok: check.ok,
    ...(check.ok ? {} : { why: check.why }),
    costNow: 0,
    costMonth,
    per: "trip",
    days: route
      ? [
          route.days,
          route.days + Math.ceil(route.days * PASSAGE_RISK.lateShare[1]),
        ]
      : undefined,
    outcomes: [],
    expected: 0,
    lo: 0,
    hi: 0,
    net: 0,
    risks: [],
    factors: [...fx.lines],
  };
  const worth = sellPrice(b);
  const lostO: OddsOutcome = {
    label: "lost at sea with her cargo",
    p: ch.lost,
    lo: 0,
    hi: 0,
    note: `she's gone (her worth, ${worth})`,
    bad: true,
  };
  view.risks.push(
    {
      label: `Lost at sea (${km} km of sea, her soundness ${Math.round(b.condition)}%)`,
      p: ch.lost,
    },
    {
      label: `Battered by the sea: −${PASSAGE_RISK.damage.hull[0]} to −${PASSAGE_RISK.damage.hull[1]} to her soundness`,
      p: ch.damage,
    },
    {
      label: `Wear: −${r1((km / 500) * PASSAGE_RISK.wear)} to her soundness`,
      p: 1,
    },
  );
  if (aboard)
    view.factors.push(
      "You sail with her, commanding her: the sea's dangers come to you as scenes as well (storms, pirates).",
    );
  const kept = 1 - ch.lost;
  switch (c.kind) {
    case "freight":
    case "passengers":
    case "smuggling": {
      const seized = c.kind === "smuggling" ? smuggleSeized(s, owner, b) : 0;
      const ok = kept * (1 - seized);
      view.outcomes = [
        {
          label: "delivered in time",
          p: r2(ok * (1 - ch.late)),
          lo: pay,
          hi: pay,
        },
        {
          label: "delivered late (a quarter docked)",
          p: r2(ok * ch.late),
          lo: r1(pay * CHARTER.latePay),
          hi: r1(pay * CHARTER.latePay),
        },
        ...(seized
          ? [
              {
                label: "seized by the customs",
                p: r2(kept * seized),
                lo: 0,
                hi: 0,
                note: `she's gone, and +${CHARTER.smuggling.seizedHeat} heat`,
                bad: true,
              },
            ]
          : []),
        lostO,
      ];
      const exp = ok * pay * (1 - ch.late * (1 - CHARTER.latePay));
      view.expected = r1(exp);
      view.lo = 0;
      view.hi = pay;
      if (c.kind === "smuggling")
        view.risks.push({
          label: `The law's heat: +${CHARTER.smuggling.heat} on landing`,
          p: 1 - seized,
        });
      view.factors.push(
        `Her name: ${repWords(repOf(b))} (×${repPay(b)} on the pay).`,
        `Time allowed: ${c.days} days; her passage about ${route?.days ?? "?"}.`,
      );
      break;
    }
    case "venture": {
      const cost = ventureCost(s, w, owner, c);
      const sale = ventureSale(s, w, owner, c);
      view.costNow = cost;
      view.outcomes = [
        {
          label: "sold there at today's prices",
          p: r2(kept),
          lo: sale,
          hi: sale,
        },
        lostO,
      ];
      view.expected = r1(kept * sale);
      view.lo = 0;
      view.hi = sale;
      view.factors.push(
        `The cargo: ${cost} here, about ${sale} there at today's prices (your buying makes it dearer here, your selling cheaper there, and prices move while she sails).`,
      );
      break;
    }
    case "packet": {
      const months = c.months ?? CHARTER.packet.months;
      view.per = "month";
      view.outcomes = [
        { label: "a month on the packet", p: 1, lo: pay, hi: pay },
      ];
      view.expected = pay;
      view.lo = pay;
      view.hi = pay;
      view.factors.push(
        `The post office pays ${pay} a month for ${months} months; she runs back and forth, ${CHARTER.packet.turn} days in port at each end.`,
      );
      break;
    }
    case "fishing":
    case "whaling": {
      const m = seasonMonth(s, w, owner, b, c);
      view.per = "month";
      view.outcomes = [
        {
          label: c.kind === "fishing" ? "a month's catch" : "a month's whaling",
          p: 1,
          lo: m.lo,
          hi: m.hi,
        },
      ];
      view.expected = m.exp;
      view.lo = m.lo;
      view.hi = m.hi;
      view.factors.push(
        c.kind === "fishing"
          ? `The grounds: ×${CHARTER.fishing.grounds} of her fishing at home, for ${c.months} months, then home.`
          : `The whaling grounds, for ${c.months} months (some voyages find nothing), then home.`,
      );
      break;
    }
  }
  // A month's worth, all told: a trip's takings spread over its days (and two in port), less her keep.
  view.net =
    view.per === "month"
      ? r1(view.expected - costMonth)
      : r1(
          ((view.expected - view.costNow) * 30) /
            Math.max(1, (route?.days ?? 1) + 2) -
            costMonth,
        );
  return view;
}

/** The chance a smuggling run is seized at the far port: less with a sly master. */
export function smuggleSeized(s: GameState, owner: Life, b: Boat): number {
  const fx = shipFx(s, owner, b);
  const cap1 =
    fx.master.kind === "you"
      ? skillLevel(s, owner, "stealth")
      : fx.master.c !== undefined && s.chars[fx.master.c]
        ? npcSkill(s, s.chars[fx.master.c], "stealth")
        : 0;
  return r2(
    CHARTER.smuggling.seized * (1 - 0.5 * Math.min(1, cap1 / SKILL_MAX)),
  );
}

// ---------------------------------------------------------------- sailing on her own

/** Send her to a port under her own master (or with her owner aboard), rolling her luck now. */
export function launch(
  g: ConquestGame,
  owner: Life,
  b: Boat,
  to: number,
  ownerAboard: boolean,
): string | null {
  const s = g.s;
  const route = passageOf(s, g.map, owner, b, to);
  if (!route) return "There's no way there for her.";
  const ch = passageChances(s, owner, b, route.km);
  const r = shipDice(g, b.id, 7);
  const way: ShipWay = {
    prov: b.prov,
    path: [...route.path],
    sea: route.path.map(() => true),
    depart: s.day,
    arrive: s.day + Math.max(1, route.legs[0]),
    dest: to,
    hop: 0,
    km: route.km,
    ...(ownerAboard ? { owner: true } : {}),
  };
  if (r.next() < ch.lost)
    way.lost = Math.min(
      route.path.length - 1,
      Math.floor(r.next() * route.path.length),
    );
  else r.next();
  if (r.next() < ch.late) {
    const [a, z] = PASSAGE_RISK.lateShare;
    way.late = Math.max(1, Math.ceil(route.days * (a + r.next() * (z - a))));
    way.arrive += way.late;
  } else r.next();
  if (r.next() < ch.damage) {
    const [a, z] = PASSAGE_RISK.damage.hull;
    way.dmg = a + Math.floor(r.next() * (z - a + 1));
  }
  touchLife(g, owner);
  b.way = way;
  delete b.moor;
  // Her people at her port come aboard; her owner too, if he sails in her.
  for (const l of s.lives) {
    if (l.c < 0 || l.watching || l.travel || l.prov !== b.prov) continue;
    const mine =
      l.seat === owner.seat
        ? ownerAboard
        : l.job?.berth?.kind === "ship" &&
          l.job.berth.seat === owner.seat &&
          l.job.berth.id === b.id;
    if (!mine || l.crime?.jail) continue;
    board(g, l, owner, b);
  }
  return null;
}

/** Take a life aboard her as she sails: they go where she goes. */
export function board(g: ConquestGame, l: Life, owner: Life, b: Boat): void {
  const wy = b.way;
  if (!wy) return;
  touchLife(g, l).travel = {
    dest: wy.dest,
    path: [...wy.path],
    sea: [...wy.sea],
    depart: wy.depart,
    arrive: wy.arrive,
    cost: 0,
    with: { seat: owner.seat, boat: b.id },
  };
  if (l !== owner)
    journal(
      g,
      l,
      `You go aboard the ${b.name}, bound for ${g.map.provinces[wy.dest].name}.`,
    );
}

/** Her owner sails her himself: the players of her company at the quay go with her. */
export function boardCrew(g: ConquestGame, owner: Life, b: Boat): void {
  const t = owner.travel;
  if (!t || t.boat !== b.id) return;
  for (const l of g.s.lives) {
    const bb = l.job?.berth;
    if (
      l === owner ||
      l.c < 0 ||
      l.watching ||
      l.travel ||
      l.prov !== owner.prov
    )
      continue;
    if (
      !bb ||
      bb.kind !== "ship" ||
      bb.seat !== owner.seat ||
      bb.id !== b.id ||
      l.crime?.jail
    )
      continue;
    touchLife(g, l).travel = {
      dest: t.dest,
      path: [...t.path],
      sea: [...t.sea],
      depart: t.depart,
      arrive: t.arrive,
      cost: 0,
      with: { seat: owner.seat, boat: b.id },
    };
    journal(
      g,
      l,
      `You go aboard the ${b.name} with her owner, bound for ${g.map.provinces[t.dest].name}.`,
    );
  }
}

/** She's gone from her owner (sold, lost): her company paid off, her charter and stay ended, anyone aboard ashore. */
export function disbandShip(
  g: ConquestGame,
  owner: Life,
  b: Boat,
  why: string,
): void {
  const s = g.s;
  if (b.roster && (b.roster.hires.length || b.roster.offers?.length))
    disband(g, hostOfBoat(s, owner, b), why);
  for (const l of s.lives) {
    if (l === owner || !aboardShip(l, owner.seat, b)) continue;
    touchLife(g, l).travel = null;
    l.prov = shipProv(b);
  }
  b.charter = null;
  b.stay = null;
  b.way = null;
}

/** Each day: her passage on, a hop at a time; a stay that's run too long ends. */
function stepShip(g: ConquestGame, owner: Life, b: Boat): void {
  const s = g.s;
  if (b.stay && b.stay.since >= 0 && s.day - b.stay.since >= STAY_DAYS)
    endStay(g, owner, b);
  const wy = b.way;
  if (wy) {
    if (s.day < wy.arrive) return;
    const next = wy.path.shift()!;
    wy.sea.shift();
    const from = wy.prov;
    wy.prov = next;
    touchLife(g, owner);
    const hop = wy.hop++;
    if (wy.lost === hop) return shipLost(g, owner, b, next, from);
    if (!wy.path.length) return arrive(g, owner, b, next);
    const lane = g.map.provinces[next].sea.find(([q]) => q === wy.path[0]);
    wy.depart = s.day;
    wy.arrive =
      s.day +
      Math.max(1, ownBoatHopDays(lane ? lane[1] : 160, speedOf(s, owner, b)));
    return;
  }
  // The packet runs back and forth; a season's done, she comes home.
  const job = b.charter;
  if (!job || job.phase !== "there") return;
  if (job.c.kind === "packet") {
    if (s.day >= job.due)
      return endCharter(
        g,
        owner,
        b,
        `The packet's term is up: ${job.runs} runs.`,
      );
    if (s.day - (job.inAt ?? s.day) >= CHARTER.packet.turn) {
      const other = b.prov === job.c.to ? job.c.from : job.c.to;
      job.runs++;
      delete job.inAt;
      if (launch(g, owner, b, other, false)) job.inAt = s.day;
    }
  } else if (s.day >= job.due) {
    job.phase = "home";
    logShip(
      g,
      owner,
      b,
      `The season's done: ${r1(job.earned)} coins of it. She makes for home.`,
    );
    if (b.prov === job.home)
      return endCharter(g, owner, b, "Home from the grounds.");
    launch(g, owner, b, job.home, false);
  }
}

/** She's in: paid, her name, her log; she lies where she came in (beached or at anchor where there's no port). */
function arrive(g: ConquestGame, owner: Life, b: Boat, p: number): void {
  const s = g.s;
  const wy = b.way!;
  b.way = null;
  b.prov = p;
  b.voyages = (b.voyages ?? 0) + 1;
  b.condition = Math.max(
    1,
    r1(b.condition - (wy.km / 500) * PASSAGE_RISK.wear - (wy.dmg ?? 0)),
  );
  moorAt(g, owner, b, p);
  const name = g.map.provinces[p].name;
  if (b.stay && b.stay.since < 0 && b.stay.at === p) {
    b.stay.since = s.day;
    logShip(
      g,
      owner,
      b,
      `In at ${name}, lying over on the way to ${g.map.provinces[b.stay.dest].name}${wy.dmg ? ` (battered by the sea, −${wy.dmg})` : ""}.`,
    );
    return;
  }
  const job = b.charter;
  if (!job) {
    logShip(
      g,
      owner,
      b,
      `In at ${name}${wy.late ? `, ${wy.late} days lost to the weather` : ""}${wy.dmg ? `, battered by the sea (−${wy.dmg})` : ""}.`,
    );
    journal(g, owner, `The ${b.name} is in at ${name}.`);
    return;
  }
  const c = job.c;
  if (job.phase === "home" && p === job.home)
    return endCharter(
      g,
      owner,
      b,
      `Home from the ${c.kind === "whaling" ? "whaling grounds" : "fishing grounds"} with ${r1(job.earned)} coins of it.`,
    );
  if (job.phase !== "out" || p !== c.to) {
    if (c.kind === "packet" && job.phase === "there") {
      if (s.day >= job.due)
        return endCharter(
          g,
          owner,
          b,
          `The packet's term is up: ${job.runs} runs.`,
        );
      job.inAt = s.day; // she sails again after her turn in port
      logShip(g, owner, b, `The packet in at ${name}.`);
    } else logShip(g, owner, b, `In at ${name}.`);
    return;
  }
  const late = s.day > job.due;
  const forfeit = s.day > job.due + CHARTER.forfeitDays;
  const flow = {
    key: `bc:${b.id}`,
    label: `The ${b.name}: charters`,
    chance: true,
    aff: "boat" as const,
  };
  switch (c.kind) {
    case "freight":
    case "passengers":
    case "smuggling": {
      if (c.kind === "smuggling") {
        const seized =
          shipDice(g, b.id, 11).next() < smuggleSeized(s, owner, b);
        const nation = lawAt(s, p);
        if (seized) {
          addHeat(g, owner, nation, CHARTER.smuggling.seizedHeat);
          addRep(b, REP.seized);
          shipGone(
            g,
            owner,
            b,
            `The customs officers at ${name} seized the ${b.name}, cargo and all.`,
          );
          return;
        }
        addHeat(g, owner, nation, CHARTER.smuggling.heat);
      }
      const pay = forfeit
        ? 0
        : r1(charterPay(b, c) * (late ? CHARTER.latePay : 1));
      if (pay) withFlow(g, flow, () => earn(g, owner, pay));
      addRep(b, forfeit ? REP.forfeit : late ? REP.late : REP.delivered);
      const what = ladingWords(g.map, c);
      const text = forfeit
        ? `The ${b.name} came in at ${name} so late the charter was void (${what}): nothing paid.`
        : `The ${b.name} delivered ${what}${late ? ", late: a quarter docked" : ""}: ${pay} coins.`;
      logShip(g, owner, b, text);
      withFlow(g, flow, () =>
        journal(g, owner, text, forfeit || late ? "bad" : "good"),
      );
      b.charter = null;
      return;
    }
    case "venture": {
      const sale = quoteCut(
        s,
        g.w,
        p,
        c.good as Good,
        -(c.loads ?? 0),
        cutFor(s, owner),
      ).total;
      marketMove(g, p, c.good as Good, -(c.loads ?? 0));
      withFlow(g, flow, () => earn(g, owner, sale));
      gainXp(g, owner, "trade", 4);
      const cost = job.cost ?? 0;
      const text = `The ${b.name} sold her ${c.loads} loads of ${c.good} at ${name} for ${sale} coins (they cost ${cost}): ${sale >= cost ? "+" : ""}${r1(sale - cost)}.`;
      logShip(g, owner, b, text);
      withFlow(g, flow, () =>
        journal(g, owner, text, sale >= cost ? "good" : "bad"),
      );
      addRep(b, 1);
      b.charter = null;
      return;
    }
    case "packet":
      job.phase = "there";
      job.inAt = s.day;
      logShip(
        g,
        owner,
        b,
        `On the packet between ${g.map.provinces[c.from].name} and ${name}.`,
      );
      return;
    case "fishing":
    case "whaling":
      job.phase = "there";
      job.due = Math.max(job.due, s.day + (c.months ?? 3) * 30);
      logShip(
        g,
        owner,
        b,
        `On the ${c.kind === "fishing" ? "fishing" : "whaling"} grounds off ${name}.`,
      );
      return;
  }
}

/** A charter's done (or given up). */
function endCharter(g: ConquestGame, owner: Life, b: Boat, text: string): void {
  touchLife(g, owner);
  logShip(g, owner, b, text);
  withFlow(g, { key: "news", label: "", aff: "boat" }, () =>
    journal(g, owner, `The ${b.name}: ${text}`),
  );
  b.charter = null;
}

/** She's lost: those aboard come ashore on a spar; her company by name are lost or scatter. */
function shipLost(
  g: ConquestGame,
  owner: Life,
  b: Boat,
  at: number,
  from: number,
): void {
  const name = g.map.provinces[at]?.name ?? "the coast";
  void from;
  shipGone(
    g,
    owner,
    b,
    `The ${b.name} was lost at sea off ${name}${b.charter ? " with her cargo" : ""}.`,
  );
}

/** She's gone (lost, seized): everyone aboard ashore where she went, and her owner told. */
function shipGone(g: ConquestGame, owner: Life, b: Boat, text: string): void {
  const s = g.s;
  const at = shipProv(b);
  logShip(g, owner, b, text);
  for (const l of s.lives) {
    if (!aboardShip(l, owner.seat, b)) continue;
    touchLife(g, l).travel = null;
    l.prov = at;
    journal(
      g,
      l,
      `${text} You came ashore at ${g.map.provinces[at].name} on a spar.`,
      "bad",
    );
    hurt(g, l, 8, "drowned");
    wake(g, l, text);
  }
  disband(g, hostOfBoat(s, owner, b), "is lost");
  b.charter = null;
  b.way = null;
  loseBoat(g, owner, b, text);
}

/** Where there's no port she's beached (a small one) or anchors offshore; a quay clears it. */
export function moorAt(g: ConquestGame, owner: Life, b: Boat, p: number): void {
  touchLife(g, owner);
  if (hasPlace(g.s, g.w, p, "docks")) {
    delete b.moor;
    return;
  }
  const how = BEACHED.includes(b.kind) ? "beach" : "anchor";
  if (b.moor === how) return;
  b.moor = how;
  logShip(
    g,
    owner,
    b,
    how === "beach"
      ? `Run up on the strand at ${g.map.provinces[p].name}: no quay, so she's beached. A day to float her off on the tide when she sails.`
      : `Anchored off ${g.map.provinces[p].name}: no quay, so she rides to her anchors offshore and her boat takes you in and out.`,
  );
}

// ---------------------------------------------------------------- a stay on the way

/** Who can give her orders on a voyage: her owner (aboard, or where she lies), or a player who's her captain and with her. */
export function canCommand(
  s: GameState,
  life: Life,
  owner: Life,
  b: Boat,
): boolean {
  if (life.seat === owner.seat)
    return (
      aboardShip(owner, owner.seat, b) ||
      owner.travel?.boat === b.id ||
      alongsideShip(owner, b)
    );
  const h = hiresAboard(b).find((x) => x.seat === life.seat);
  return !!h && h.role === "captain" && hireWithHer(s, owner, b, h);
}

/** Where she'd stop if she lay over: the next port on her way, if it isn't the last. */
export function nextStop(owner: Life, b: Boat): number | undefined {
  if (b.way) return b.way.path.length > 1 ? b.way.path[0] : undefined;
  const t = owner.travel;
  if (t?.boat === b.id && t.path.length > 1) return t.path[0];
  return undefined;
}

/** Lie over at the next port on her way, for as long as you like (the voyage resumes within two months). */
export function stayAt(
  g: ConquestGame,
  life: Life,
  owner: Life,
  b: Boat,
): string | null {
  const s = g.s;
  if (!canCommand(s, life, owner, b))
    return "Only her commander can say where she stops.";
  const at = nextStop(owner, b);
  if (at === undefined) return "She's making for her last port.";
  touchLife(g, owner);
  if (b.way) {
    b.stay = { dest: b.way.dest, at, since: -1 };
    b.way.path = [at];
    b.way.sea = [true];
    b.way.dest = at;
  } else {
    const t = owner.travel!;
    b.stay = { dest: t.dest, at, since: -1, own: true };
    t.path = [at];
    t.sea = [t.sea[0]];
    t.dest = at;
  }
  // Everyone aboard stops there too.
  for (const l of s.lives)
    if (
      l.travel?.with?.seat === owner.seat &&
      l.travel.with.boat === b.id &&
      l.travel.path.length
    ) {
      touchLife(g, l);
      l.travel.path = [at];
      l.travel.sea = [true];
      l.travel.dest = at;
    }
  const where = g.map.provinces[at].name;
  journal(
    g,
    life,
    `The ${b.name} will lie over at ${where}. The voyage to ${g.map.provinces[b.stay.dest].name} can go on if she sails again within ${STAY_DAYS} days of coming in.`,
  );
  return null;
}

/** Resume a voyage after a stay: on to where she was going. */
export function resumeVoyage(
  g: ConquestGame,
  life: Life,
  owner: Life,
  b: Boat,
): string | null {
  const s = g.s;
  const st = b.stay;
  if (!st) return "She isn't lying over.";
  if (st.since < 0) return "She hasn't come in yet.";
  if (s.day - st.since >= STAY_DAYS) return "Too long: the voyage is over.";
  if (!canCommand(s, life, owner, b))
    return "Only her commander can sail her on.";
  if (b.prov !== st.at || b.way) return "She isn't where she lay over.";
  if (menWithHer(s, owner, b) < BOATS[b.kind].crew)
    return `She needs ${BOATS[b.kind].crew} men to sail.`;
  const dest = st.dest;
  if (st.own) {
    b.stay = null;
    const err = sail(g, owner, b.id, dest);
    if (err) {
      b.stay = st;
      return err;
    }
    journal(
      g,
      owner,
      `The ${b.name} sails on for ${g.map.provinces[dest].name}.`,
    );
    return null;
  }
  b.stay = null;
  const aboard =
    life.seat === owner.seat && !owner.travel && owner.prov === b.prov;
  const err = launch(g, owner, b, dest, aboard);
  if (err) {
    b.stay = st;
    return err;
  }
  logShip(
    g,
    owner,
    b,
    `Sails on from ${g.map.provinces[b.prov].name} for ${g.map.provinces[dest].name}.`,
  );
  // A player captain who isn't her owner sails with her.
  if (life.seat !== owner.seat && !life.travel && life.prov === b.prov)
    board(g, life, owner, b);
  return null;
}

/** Two months at a port on the way: the voyage is over (a charter's forfeit). */
function endStay(g: ConquestGame, owner: Life, b: Boat): void {
  const st = b.stay!;
  b.stay = null;
  touchLife(g, owner);
  const where = g.map.provinces[st.at].name;
  let text = `The ${b.name} lay over at ${where} two months: the voyage to ${g.map.provinces[st.dest].name} is over.`;
  if (b.charter && b.charter.phase === "out") {
    addRep(b, REP.forfeit);
    text += ` The charter (${ladingWords(g.map, b.charter.c)}) is forfeit.`;
    b.charter = null;
  }
  logShip(g, owner, b, text);
  journal(g, owner, text, "bad");
}

// ---------------------------------------------------------------- taking a charter

/** Take a charter at her port: she sails under her own master, or with you aboard commanding her. */
export function takeCharter(
  g: ConquestGame,
  owner: Life,
  b: Boat | undefined,
  c: Charter | undefined,
  aboard: boolean,
): string | null {
  const s = g.s;
  const check = charterCheck(s, g.w, owner, b, c, aboard);
  if (!check.ok) return check.why;
  const ship = b!;
  const ch = c!;
  const route = passageOf(s, g.map, owner, ship, ch.to)!;
  const job: ShipJob = {
    c: ch,
    taken: s.day,
    due:
      ch.kind === "fishing" || ch.kind === "whaling"
        ? s.day + route.days + (ch.months ?? 3) * 30
        : s.day + ch.days,
    phase: "out",
    home: ship.prov,
    earned: 0,
    runs: 0,
  };
  touchLife(g, owner);
  if (ch.kind === "venture") {
    const cost = ventureCost(s, g.w, owner, ch);
    withFlow(
      g,
      {
        key: `bc:${ship.id}`,
        label: `The ${ship.name}: charters`,
        chance: true,
        aff: "boat",
      },
      () => spend(g, owner, cost),
    );
    marketMove(g, ch.from, ch.good as Good, ch.loads ?? 0);
    job.cost = cost;
  } else owner.cooldowns[`ch:${ch.key}`] = s.day + 40;
  ship.charter = job;
  const err = launch(g, owner, ship, ch.to, aboard);
  if (err) {
    ship.charter = null;
    return err;
  }
  const text = `The ${ship.name} takes a charter: ${ladingWords(g.map, ch)} (${ch.by}).${aboard ? " You sail in her, commanding her." : ""}`;
  logShip(g, owner, ship, text.replace(/^The .*? takes/, "Took"));
  journal(g, owner, text);
  return null;
}

/** Give up a charter (forfeit; her name suffers); a venture's cargo stays aboard to sell where she is. */
export function dropCharter(
  g: ConquestGame,
  owner: Life,
  b: Boat,
): string | null {
  const job = b.charter;
  if (!job) return "She has no charter.";
  touchLife(g, owner);
  if (job.c.kind !== "venture" && job.phase === "out") addRep(b, REP.forfeit);
  endCharter(
    g,
    owner,
    b,
    `Gave up the charter (${ladingWords(g.map, job.c)}).`,
  );
  return null;
}

/** Send her to a port with no charter (to bring her home, or to where the charters are). */
export function sendShip(
  g: ConquestGame,
  owner: Life,
  b: Boat,
  to: number,
): string | null {
  const s = g.s;
  if (b.way) return "She's at sea.";
  if (b.charter) return "She's on a charter.";
  if (to === b.prov) return "She's there.";
  if (!g.map.provinces[to]?.coastal) return "She can only sail to the coast.";
  const here = !owner.travel && owner.prov === b.prov;
  if (
    !here &&
    !officer(s, owner, b, "captain") &&
    !officer(s, owner, b, "mate")
  )
    return "With nobody to command her, be where she lies (or hire her a captain or mate).";
  if (menWithHer(s, owner, b) < BOATS[b.kind].crew)
    return `She needs ${BOATS[b.kind].crew} men to sail.`;
  if (b.condition < 25) return "She's not fit for sea: repair her first.";
  b.stay = null;
  const err = launch(g, owner, b, to, false);
  if (err) return err;
  logShip(
    g,
    owner,
    b,
    `Sent to ${g.map.provinces[to].name} under her own master.`,
  );
  journal(
    g,
    owner,
    `You send the ${b.name} to ${g.map.provinces[to].name} under her own master.`,
  );
  return null;
}

// ---------------------------------------------------------------- refits and careening

export function refitCost(b: Boat, key: RefitKey): number {
  return r1(BOATS[b.kind].price * REFITS[key].cost);
}

export function refitCheck(
  s: GameState,
  w: World,
  owner: Life,
  b: Boat,
  key: RefitKey,
): Check {
  const def = REFITS[key];
  if (!def) return no("No such refit.");
  if (b.refits?.includes(key)) return no("Done already.");
  if (def.kinds && !def.kinds.includes(b.kind))
    return no(`Not for a ${BOATS[b.kind].name.toLowerCase()}.`);
  if (def.since && worldYear(s) < def.since)
    return no(`Not before ${def.since}: nobody coppers a ship's bottom yet.`);
  if (!alongsideShip(owner, b)) return no("Be where she lies.");
  if (!hasPlace(s, w, b.prov, "docks"))
    return no("A refit needs a port with a yard.");
  if (owner.purse < refitCost(b, key))
    return no(`Costs ${refitCost(b, key)} coins.`);
  return yes;
}

function worldYear(s: GameState): number {
  return dateOf(s.day).year;
}

export function refit(
  g: ConquestGame,
  owner: Life,
  b: Boat,
  key: RefitKey,
): string | null {
  const check = refitCheck(g.s, g.w, owner, b, key);
  if (!check.ok) return check.why;
  const cost = refitCost(b, key);
  spend(g, owner, cost);
  touchLife(g, owner);
  (b.refits ??= []).push(key);
  logShip(g, owner, b, `Refitted: ${REFITS[key].name.toLowerCase()}.`);
  journal(
    g,
    owner,
    `The ${b.name} is refitted: ${REFITS[key].name.toLowerCase()}, for ${cost} coins.`,
  );
  return null;
}

/** Careening her on a beach yourself, where there's no yard: cheaper, and not as good. */
export function careenCost(b: Boat): number {
  return r1(repairCost(b) * MOOR.careenCost);
}

export function careenCheck(s: GameState, owner: Life, b: Boat): Check {
  if (b.moor !== "beach") return no("Only on a beach.");
  if (!alongsideShip(owner, b)) return no("Be where she lies.");
  if (b.condition >= MOOR.careenTo)
    return no(`A beach can't make her better than ${MOOR.careenTo}%.`);
  if (owner.purse < careenCost(b)) return no(`Costs ${careenCost(b)} coins.`);
  return yes;
}

export function careen(g: ConquestGame, owner: Life, b: Boat): string | null {
  const check = careenCheck(g.s, owner, b);
  if (!check.ok) return check.why;
  spend(g, owner, careenCost(b));
  touchLife(g, owner);
  b.condition = MOOR.careenTo;
  logShip(
    g,
    owner,
    b,
    `Careened on the beach: hove down, scraped and payed (${MOOR.careenTo}%).`,
  );
  gainXp(g, owner, "seamanship", 2);
  return null;
}

// ---------------------------------------------------------------- people looking for a berth

/** Someone at the quay looking for a berth this month (the same for everyone). */
export interface Seeker {
  slot: number;
  first: string;
  family: string;
  female: boolean;
  age: number;
  born: number;
  stats: Character["stats"];
  /** Their trade (a seaman, or a surgeon: a physician's skill). */
  trade: "sailor" | "physician";
  /** What they'd look for: the role they're best fit for. */
  note: string;
}

const SEEKER_NOTES = {
  sailor: [
    "twenty years before the mast",
    "lately of a Salem schooner",
    "can hand, reef and steer",
    "knows the coast like his hand",
    "a Bristol man, paid off last week",
    "an old man-of-war's man",
    "sober, they say",
    "can work a lunar, he claims",
  ],
  physician: [
    "a barber-surgeon",
    "lately surgeon of a slaver, and sick of it",
    "a surgeon's mate from the navy",
  ],
};

/** The people looking for a berth at a quay this month. */
export function seekersAt(s: GameState, w: World, p: number): Seeker[] {
  if (!hasPlace(s, w, p, "docks")) return [];
  const pr = s.provinces[p];
  const owner = pr.owner >= 0 ? s.nations[pr.owner] : undefined;
  if (!owner || owner.kind === "native") return [];
  const month = Math.floor(s.day / 30);
  const rng = new Rng({ rng: hashOf(s.settings.seed, p, month, 313) });
  const names = NAMES[owner.culture] ?? NAMES.english;
  const n = 3 + Math.min(2, portLevel(s, p)) + rng.int(0, 1);
  const out: Seeker[] = [];
  for (let slot = 0; slot < n; slot++) {
    const trade = slot === n - 1 && rng.chance(0.5) ? "physician" : "sailor";
    const female = trade === "physician" ? rng.chance(0.05) : rng.chance(0.03);
    const age = rng.int(17, 50);
    const stats = {
      dip: rng.int(2, 7),
      mar: rng.int(3, 7),
      ste: rng.int(2, 7),
      int: rng.int(2, 7),
      lea: rng.int(2, 7),
    };
    // Some are better than the common run: an old hand, a mate between ships.
    const better = rng.next();
    if (trade === "sailor")
      stats.mar = Math.min(
        13,
        stats.mar + (better > 0.85 ? 5 : better > 0.6 ? 3 : 0),
      );
    if (better > 0.75) stats.lea = Math.min(12, stats.lea + 3);
    if (trade === "physician") stats.lea = Math.min(12, stats.lea + 2);
    out.push({
      slot,
      first: rng.pick(female ? names.female : names.male)!,
      family: rng.pick(names.family)!,
      female,
      age,
      born: s.day - age * 365 - rng.int(0, 364),
      stats,
      trade,
      note: rng.pick(SEEKER_NOTES[trade])!,
    });
  }
  return out;
}

/** A seeker as a character (not yet in the game: for their skills and the odds). */
export function seekerChar(s: GameState, p: number, k: Seeker): Character {
  const pr = s.provinces[p];
  const owner = s.nations[pr.owner >= 0 ? pr.owner : 0];
  return {
    id: -1,
    first: k.first,
    family: k.family,
    title: null,
    female: k.female,
    born: k.born,
    nation: owner.id,
    culture: owner.culture,
    religion: owner.religion,
    stats: k.stats,
    traits: [],
    alive: true,
    died: null,
    spouse: -1,
    father: -1,
    mother: -1,
    children: [],
    ambition: null,
    scheme: null,
    memories: [],
    lastBirth: -9999,
    made: false,
    role: k.trade,
  };
}

/** Seamen of the town (no other post) who might sign. */
export function townSeamen(s: GameState, p: number): Character[] {
  return (s.locals[p] ?? [])
    .map((id) => s.chars[id])
    .filter(
      (c): c is Character =>
        !!c?.alive &&
        !c.abroad &&
        c.role === "sailor" &&
        !s.lives.some((l) => l.c === c.id),
    )
    .slice(0, 6);
}

/** Take on someone from the quay: they become a character of the game, then sign as any other. */
function hireSeeker(
  g: ConquestGame,
  owner: Life,
  b: Boat,
  slot: number,
  role: string,
  pay: number,
): string | null {
  const s = g.s;
  const k = seekersAt(s, g.w, b.prov).find((x) => x.slot === slot);
  if (!k) return "They've found another berth.";
  const key = `seek:${b.prov}:${Math.floor(s.day / 30)}:${slot}`;
  if (s.lives.some((l) => l.cooldowns[key]))
    return "They've found another berth.";
  if (!alongsideShip(owner, b)) return "Be where she lies to sign them.";
  if (!roleOf(SHIP_LADDER, role)) return "No such place.";
  // Would they? Asked before they're made, so a refusal leaves nothing behind.
  const host = hostOfBoat(s, owner, b);
  const fake = seekerChar(s, b.prov, k);
  if (hireOdds(s, host, fake, role, pay) <= 0)
    return `${k.first} ${k.family} won't sign at that.`;
  const c: Character = { ...fake, id: s.nextId++, home: b.prov };
  s.chars[c.id] = c;
  g.touchChar(c);
  const err = hire(g, host, c, role, pay);
  if (err) return err;
  touchLife(g, owner).cooldowns[key] = s.day + 40;
  return null;
}

/** Whether someone would sign at this role and pay (above nothing, they do). */
export function hireOdds(
  s: GameState,
  host: HireHost,
  c: Character,
  role: string,
  pay: number,
): number {
  const def = roleOf(SHIP_LADDER, role);
  if (!def) return -100;
  return signOdds(host, prospectOf(s, host.owner, c, SHIP_LADDER), def, pay)
    .total;
}

// ---------------------------------------------------------------- the month

/** Her month: the company's pay, her officers' leadership, a charter's month, the wear of an open road. */
export function shipsMonthly(g: ConquestGame, owner: Life): void {
  const s = g.s;
  for (const b of [...boatsOf(owner)]) {
    const host = hostOfBoat(s, owner, b);
    if (b.roster?.hires.length) payRoster(g, host);
    const fx = shipFx(s, owner, b);
    if (fx.spirits) b.morale = Math.min(100, b.morale + fx.spirits);
    if (b.moor === "anchor")
      b.condition = Math.max(1, r1(b.condition - MOOR.anchorWear));
    const job = b.charter;
    if (!job) continue;
    touchLife(g, owner);
    const flow = {
      key: `bc:${b.id}`,
      label: `The ${b.name}: charters`,
      chance: true,
      aff: "boat" as const,
    };
    if (job.c.kind === "packet" && job.phase !== "home") {
      const pay = charterPay(b, job.c);
      withFlow(g, { ...flow, chance: false }, () => earn(g, owner, pay));
      job.earned = r1(job.earned + pay);
    } else if (
      (job.c.kind === "fishing" || job.c.kind === "whaling") &&
      job.phase === "there" &&
      !b.way &&
      b.prov === job.c.to
    ) {
      const got = seasonCatch(g, owner, b, job.c);
      job.runs++;
      if (got > 0) {
        withFlow(g, flow, () => earn(g, owner, got));
        job.earned = r1(job.earned + got);
      }
      logShip(
        g,
        owner,
        b,
        got > 0
          ? `A month on the grounds: ${got} coins.`
          : "A month on the grounds, and nothing to show.",
      );
    }
  }
}

/** A month's catch on the grounds, on her own dice, from BOAT_WORK's tables. */
function seasonCatch(
  g: ConquestGame,
  owner: Life,
  b: Boat,
  c: Charter,
): number {
  const s = g.s;
  const r = shipDice(g, b.id, 23);
  const fx = shipFx(s, owner, b);
  if (c.kind === "fishing") {
    const F = BOAT_WORK.fishing;
    const winter = boatWinter(g.map, b.prov, s.day);
    const got =
      F.base[b.kind] *
      CHARTER.fishing.grounds *
      fx.knack *
      (winter ? F.winter : 1) *
      (F.spread[0] + r.next() * F.spread[1]);
    if (r.chance(F.squall.p))
      b.condition = Math.max(1, b.condition - F.squall.damage);
    return r1(got);
  }
  const W = BOAT_WORK.whaling;
  const luck = r.next() < W.empty ? 0 : W.luck[0] + r.next() * W.luck[1];
  if (r.chance(W.stove.p)) {
    b.condition = Math.max(1, b.condition - W.stove.damage);
    b.crew = Math.max(0, b.crew - Math.round(W.stove.men * fx.men));
  }
  return r1(W.base[b.kind] * luck * fx.knack);
}

/** Each day: every ship on her way, and her stays. */
export function shipsDaily(g: ConquestGame): void {
  for (const owner of g.s.lives)
    for (const b of [...(owner.boats ?? [])]) stepShip(g, owner, b);
}

hooks.daily.push(shipsDaily);
hooks.lifeMonthly.push(shipsMonthly);

// Your own boat lands where there's no port: beached or at anchor. A stay
// begun on your own voyage starts its clock when she comes in.
hooks.landed.push((g, life, p, sea, boat) => {
  if (boat === undefined) return;
  const b = boatOf(life, boat);
  if (!b) return;
  moorAt(g, life, b, p);
  if (b.stay && b.stay.own && b.stay.since < 0 && b.stay.at === p) {
    touchLife(g, life);
    b.stay.since = g.s.day;
    logShip(
      g,
      life,
      b,
      `In at ${g.map.provinces[p].name}, lying over on the way to ${g.map.provinces[b.stay.dest].name}.`,
    );
  }
  void sea;
});

// The month's figure: her company's pay, and a charter's month.
hooks.forecast.push((s, life, w) => {
  const out: Part[] = [];
  if (life.c < 0 || life.watching) return out;
  for (const b of life.boats ?? []) {
    const pay = r1(hiresAboard(b).reduce((m, h) => m + h.pay, 0));
    if (pay)
      out.push({
        key: `bh:${b.id}`,
        label: `The ${b.name}: her company's pay`,
        value: -pay,
      });
    const job = b.charter;
    if (job && w) {
      if (job.c.kind === "packet" && job.phase !== "home")
        out.push({
          key: `bc:${b.id}`,
          label: `The ${b.name}: the packet`,
          value: charterPay(b, job.c),
        });
      else if (
        (job.c.kind === "fishing" || job.c.kind === "whaling") &&
        job.phase === "there"
      ) {
        const m = seasonMonth(s, w, life, b, job.c);
        out.push({
          key: `bc:${b.id}`,
          label: `The ${b.name}: on the grounds`,
          value: m.exp,
          chance: [m.lo, m.hi],
        });
      }
    }
  }
  return out;
});

// The tracker (Estate › Ledger): ships at sea, on a charter, lying over.
hooks.affairs.push((s, w, life) => {
  const out: import("./Types").AffairItem[] = [];
  for (const b of life.boats ?? []) {
    const job = b.charter;
    if (!job && !b.way && !b.stay) continue;
    const where = w.map.provinces[shipProv(b)]?.name ?? "?";
    const status = b.stay
      ? "lying over"
      : b.way
        ? "at sea"
        : job?.phase === "there"
          ? "at work"
          : "in port";
    const what = job
      ? `${CHARTER_NAMES[job.c.kind].toLowerCase()}: ${ladingWords(w.map, job.c)}`
      : b.way
        ? `bound for ${w.map.provinces[b.way.dest].name}`
        : `lying over at ${where}`;
    const pay =
      job && ["freight", "passengers", "smuggling"].includes(job.c.kind)
        ? charterPay(b, job.c)
        : 0;
    out.push({
      kind: "boat",
      id: `ship:${b.id}`,
      title: `The ${b.name}`,
      what,
      status,
      p: shipProv(b),
      ...(b.way ? { due: b.way.arrive } : job ? { due: job.due } : {}),
      ...(pay
        ? { expected: { value: pay, lo: 0, hi: pay, per: "trip" as const } }
        : {}),
      go: { tab: "estate", sub: "boats" },
    });
  }
  return out;
});

// ---------------------------------------------------------------- commands

/** A ship's company, charters, refits, her stays. */
export function shipCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "ship") return undefined;
  const s = g.s;
  if (isChildLife(s, life)) return "Not as a child.";
  // A player captain's orders on a voyage: her owner is named by her id among the lives.
  if (c.act === "stay" || c.act === "resume") {
    const owner = boatOf(life, c.id)
      ? life
      : s.lives.find(
          (l) =>
            boatOf(l, c.id) &&
            hiresAboard(boatOf(l, c.id)!).some((h) => h.seat === life.seat),
        );
    const b = owner ? boatOf(owner, c.id) : undefined;
    if (!owner || !b) return "No such ship.";
    return c.act === "stay"
      ? stayAt(g, life, owner, b)
      : resumeVoyage(g, life, owner, b);
  }
  if (c.act === "answer")
    return answerOffer(g, life, c.hire ?? -1, (c.arg ?? 0) > 0);
  const b = boatOf(life, c.id);
  if (!b) return "Not your boat.";
  const host = hostOfBoat(s, life, b);
  switch (c.act) {
    case "hire": {
      // One of the town's seamen (c), or someone at the quay looking for a berth (arg: their slot).
      const role = c.role ?? "hand";
      const pay = c.pay ?? roleOf(SHIP_LADDER, role)?.pay ?? 1.5;
      if (c.c !== undefined && c.c >= 0) {
        const who = s.chars[c.c];
        if (!who) return "No such person.";
        if (
          !alongsideShip(life, b) ||
          !(s.locals[b.prov] ?? []).includes(who.id)
        )
          return "Be where she lies, and they there.";
        return hire(g, host, who, role, pay);
      }
      return hireSeeker(g, life, b, c.arg ?? -1, role, pay);
    }
    case "offer": {
      const them = s.lives.find((l) => l.c === c.c);
      if (!them) return "Not a player.";
      return offerPlace(g, host, them, c.role ?? "hand", c.pay ?? 1.5);
    }
    case "unoffer":
      return withdrawOffer(g, host, c.hire ?? -1);
    case "role":
      return setRole(g, host, c.hire ?? -1, c.role ?? "");
    case "pay":
      return setPay(g, host, c.hire ?? -1, c.pay ?? 0);
    case "dismiss":
      return dismiss(g, host, c.hire ?? -1);
    case "charter": {
      const ch = chartersAt(s, g.w, b.prov).find((x) => x.key === c.key);
      return takeCharter(g, life, b, ch, (c.arg ?? 0) > 0);
    }
    case "venture": {
      const ch = ventureCharter(s, g.w, b, c.key ?? "", c.to ?? -1, c.pay ?? 0);
      if (!ch)
        return "No such venture: a good sold here, for a port with a market she can reach.";
      return takeCharter(g, life, b, ch, (c.arg ?? 0) > 0);
    }
    case "drop":
      return dropCharter(g, life, b);
    case "send":
      return sendShip(g, life, b, c.to ?? -1);
    case "refit":
      return refit(g, life, b, c.key as RefitKey);
    case "careen":
      return careen(g, life, b);
    default:
      return "Unknown.";
  }
}

hooks.command.push(shipCommand);
