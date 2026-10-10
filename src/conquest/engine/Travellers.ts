// People on the road. Merchants with their wagons, native traders with
// pack trains and canoes, preachers riding circuit, pedlars, drovers with
// cattle, a councillor on the governor's business, and messengers carrying
// letters to players. They're real people of the world (the merchant of
// Boston, the trader of the Mohawk town), they walk real roads a hop at a
// time, stop a few days where a player is (you'll find them at the tavern,
// the market or the church), and go home again.

import { reveal } from "./Fog"; // WORLD r11
import { seedLocals } from "./Folk";
import type { ConquestGame } from "./Game";
import { hopDaysFor, isNativeChar, travelRoute } from "./LifeQueries";
import { ROLES } from "./LifeRules";
import { settlers } from "./Queries";
import type {
  Character,
  GameState,
  Life,
  RoleId,
  Traveller,
  TravellerKind,
  TravelMode,
} from "./Types";

/** At most this many on the roads at once, and near any one player. */
const MAX_TRAVELLERS = 32;
const NEAR_PLAYER = 4;

/** Who goes travelling, and as what. */
const TRAVELLING: Partial<Record<RoleId, TravellerKind>> = {
  merchant: "merchant",
  captain: "merchant",
  trader: "trader",
  hunter: "trader",
  maker: "trader",
  preacher: "preacher",
  printer: "pedlar",
  planter: "drover",
  lawyer: "official",
  official: "official",
  physician: "family",
  sachem: "envoy",
};

/** How long they stop where they're going. */
const STAY: Record<TravellerKind, [number, number]> = {
  merchant: [4, 10],
  trader: [3, 8],
  preacher: [5, 12],
  pedlar: [2, 5],
  official: [4, 9],
  messenger: [1, 2],
  family: [3, 7],
  drover: [2, 5],
  envoy: [5, 10],
};

/** How fast each goes, against a walker. */
const PACE: Record<TravelMode, number> = {
  foot: 1,
  wagon: 1.3,
  pack: 1.15,
  horse: 0.7,
  ship: 1,
  canoe: 1,
};

function list(s: GameState): Traveller[] {
  s.travellers ??= [];
  return s.travellers;
}

function busy(s: GameState, c: number): boolean {
  if (list(s).some((t) => t.c === c)) return true;
  // Players, and those who employ or work for one, stay put.
  for (const l of s.lives) {
    if (l.c === c) return true;
    if (l.job && l.job.employer === c) return true;
    for (const pr of l.property ?? []) if (pr.hands.includes(c)) return true;
    if (l.ties[c] === "mentor") return true;
  }
  return s.nations.some((n) => n.ruler === c);
}

function modeFor(
  kind: TravellerKind,
  native: boolean,
  sea: boolean,
): TravelMode {
  if (sea) return native ? "canoe" : "ship";
  if (native) return kind === "trader" ? "pack" : "foot";
  switch (kind) {
    case "merchant":
      return "wagon";
    case "trader":
      return "pack";
    case "preacher":
    case "official":
    case "messenger":
      return "horse";
    default:
      return "foot";
  }
}

function hopDays(g: ConquestGame, t: Traveller): number {
  const d = hopDaysFor(g.map, t.prov, t.path[0], t.sea[0]);
  return Math.max(1, Math.round((d < 0 ? 3 : d) * PACE[t.mode]));
}

/** Set someone on the road from where they are to `to`. */
function setOff(
  g: ConquestGame,
  c: Character,
  from: number,
  to: number,
  kind: TravellerKind,
  letter?: Traveller["letter"],
): Traveller | null {
  const s = g.s;
  const native = isNativeChar(s, c);
  const coast = g.map.provinces[from].coastal && g.map.provinces[to].coastal;
  const route = travelRoute(s, g.map, from, to, coast, native, true);
  if (!route || route.path.length === 0 || route.path.length > 14) return null;
  const sea = route.sea.some(Boolean);
  const t: Traveller = {
    id: g.nextId(),
    c: c.id,
    kind,
    mode: modeFor(kind, native, sea),
    home: from,
    prov: from,
    path: route.path,
    sea: route.sea,
    depart: s.day,
    arrive: s.day,
    until: -1,
    dest: to,
    back: false,
    ...(letter ? { letter } : {}),
  };
  t.arrive = s.day + hopDays(g, t);
  list(s).push(t);
  g.travellersChanged();
  return t;
}

/** Provinces within a few hops of p, nearest first (by land). */
function around(g: ConquestGame, p: number, maxHops: number): number[] {
  const seen = new Set([p]);
  const out: number[] = [];
  let ring = [p];
  for (let hop = 0; hop < maxHops && ring.length; hop++) {
    const next: number[] = [];
    for (const q of ring)
      for (const [r] of g.map.provinces[q].nb) {
        if (seen.has(r)) continue;
        seen.add(r);
        next.push(r);
        if (hop >= 1) out.push(r);
      }
    ring = next;
  }
  return out;
}

/** Someone from a few days away comes to where a player is. */
export function spawnToward(g: ConquestGame, p: number): Traveller | null {
  const s = g.s;
  const near = around(g, p, 7);
  // Towns whose people we know; failing that, wake one up.
  let sources = near.filter((q) => (s.locals[q]?.length ?? 0) > 0);
  if (sources.length < 2) {
    const town = near.find(
      (q) =>
        s.locals[q] === undefined &&
        s.provinces[q].owner >= 0 &&
        (s.nations[s.provinces[q].owner].kind === "native" ||
          settlers(s.provinces[q]) >= 200),
    );
    if (town !== undefined) {
      seedLocals(g, town);
      sources = [...sources, town];
    }
  }
  for (let tries = 0; tries < 4 && sources.length; tries++) {
    const q = g.rng.pick(sources)!;
    const folk = (s.locals[q] ?? [])
      .map((id) => s.chars[id])
      .filter(
        (c): c is Character =>
          !!c?.alive &&
          !c.abroad &&
          !!c.role &&
          !!TRAVELLING[c.role] &&
          !busy(s, c.id),
      );
    // Grown sons and daughters go visiting too.
    const kin = (s.locals[q] ?? [])
      .flatMap((id) => s.chars[id]?.children ?? [])
      .map((id) => s.chars[id])
      .filter(
        (c): c is Character =>
          !!c?.alive &&
          !c.abroad &&
          !c.role &&
          (s.day - c.born) / 365 >= 18 &&
          !busy(s, c.id),
      );
    const pool = [...folk, ...folk, ...kin];
    const c = g.rng.pick(pool);
    if (!c) continue;
    const kind = c.role
      ? TRAVELLING[c.role]!
      : g.rng.chance(0.5)
        ? "pedlar"
        : "family";
    const t = setOff(g, c, q, p, kind);
    if (t) return t;
  }
  return null;
}

/** A councillor or courtier of the colony comes on the governor's business. */
function spawnOfficial(g: ConquestGame, life: Life): Traveller | null {
  const s = g.s;
  const owner = s.provinces[life.prov].owner;
  const n = s.nations[owner];
  if (!n?.alive || n.capital < 0 || n.capital === life.prov) return null;
  const pool = [...Object.values(n.council).filter((id) => id >= 0), ...n.court]
    .map((id) => s.chars[id])
    .filter((c): c is Character => !!c?.alive && !c.abroad && !busy(s, c.id));
  const c = g.rng.pick(pool);
  if (!c) return null;
  return setOff(
    g,
    c,
    n.capital,
    life.prov,
    n.kind === "native" ? "envoy" : "official",
  );
}

/**
 * A letter for a player, carried by hand: a messenger sets out from the
 * writer's town; the letter is read when they arrive. Close by (or with no
 * road), it comes at once.
 */
export function sendLetter(
  g: ConquestGame,
  life: Life,
  key: string,
  from: Character,
  raise: () => void,
): void {
  const s = g.s;
  const origin = from.home ?? s.nations[from.nation]?.capital ?? -1;
  if (origin < 0 || origin === life.prov || life.travel) return raise();
  // A boy from the writer's household, or one of the locals, carries it.
  const carrier =
    (s.locals[origin] ?? [])
      .flatMap((id) => [id, ...(s.chars[id]?.children ?? [])])
      .map((id) => s.chars[id])
      .find(
        (c) =>
          !!c?.alive &&
          !c.abroad &&
          c.id !== from.id &&
          (s.day - c.born) / 365 >= 14 &&
          !busy(s, c.id),
      ) ?? undefined;
  if (!carrier) return raise();
  const t = setOff(g, carrier, origin, life.prov, "messenger", {
    seat: life.seat,
    key,
    from: from.id,
  });
  if (!t) raise();
}

function deliver(
  g: ConquestGame,
  t: Traveller,
  raise: (life: Life, key: string, ctx: Record<string, number>) => void,
): void {
  const letter = t.letter!;
  const life = g.s.lives.find((l) => l.seat === letter.seat);
  delete t.letter;
  if (!life || life.watching || life.c < 0) return;
  // WORLD r11: a letter tells you of the place it was written.
  reveal(g, life, [t.home]);
  raise(life, letter.key, { c: letter.from, by: t.c });
}

/** Each day: the road. */
export function travellersDaily(
  g: ConquestGame,
  raise: (life: Life, key: string, ctx: Record<string, number>) => void,
): void {
  const s = g.s;
  const all = s.travellers;
  if (!all?.length) return;
  const gone: number[] = [];
  for (const t of all) {
    const c = s.chars[t.c];
    if (!c?.alive || c.abroad) {
      gone.push(t.id);
      continue;
    }
    if (t.depart >= 0) {
      if (s.day < t.arrive) continue;
      t.prov = t.path.shift()!;
      t.sea.shift();
      g.travellersChanged();
      if (t.path.length) {
        t.depart = s.day;
        t.arrive = s.day + hopDays(g, t);
        continue;
      }
      // There.
      t.depart = -1;
      t.arrive = -1;
      const [lo, hi] = STAY[t.kind];
      t.until = s.day + g.rng.int(lo, hi);
      if (t.letter) {
        const life = s.lives.find((l) => l.seat === t.letter!.seat);
        if (life && !life.travel && life.prov !== t.prov && !t.back) {
          // They've moved on: follow them.
          const route = travelRoute(
            s,
            g.map,
            t.prov,
            life.prov,
            false,
            isNativeChar(s, c),
            true,
          );
          if (route && route.path.length) {
            t.path = route.path;
            t.sea = route.sea;
            t.dest = life.prov;
            t.depart = s.day;
            t.arrive = s.day + hopDays(g, t);
            t.back = true;
            continue;
          }
        }
        deliver(g, t, raise);
      }
      continue;
    }
    if (s.day < t.until) continue;
    if (t.back || t.prov === t.home) {
      gone.push(t.id);
      continue;
    }
    // Home again.
    const native = isNativeChar(s, c);
    const coast =
      g.map.provinces[t.prov].coastal && g.map.provinces[t.home].coastal;
    const route = travelRoute(s, g.map, t.prov, t.home, coast, native, true);
    if (!route || !route.path.length) {
      gone.push(t.id);
      continue;
    }
    t.path = route.path;
    t.sea = route.sea;
    t.dest = t.home;
    t.back = true;
    t.depart = s.day;
    t.arrive = s.day + hopDays(g, t);
    g.travellersChanged();
  }
  if (gone.length) {
    s.travellers = all.filter((t) => !gone.includes(t.id));
    g.travellersChanged();
  }
}

/** Each month: new faces set out toward the players. */
export function travellersMonthly(g: ConquestGame): void {
  const s = g.s;
  for (const life of s.lives) {
    if (life.watching || life.c < 0 || life.travel) continue;
    if (list(s).length >= MAX_TRAVELLERS) return;
    const near = list(s).filter(
      (t) =>
        t.dest === life.prov ||
        t.prov === life.prov ||
        t.path.includes(life.prov),
    ).length;
    // Two or three set out most months, so the roads are seldom empty.
    let coming = near;
    for (const odds of [0.9, 0.7, 0.45])
      if (
        coming < NEAR_PLAYER &&
        g.rng.chance(odds) &&
        spawnToward(g, life.prov)
      )
        coming++;
    if (g.rng.chance(0.12)) spawnOfficial(g, life);
  }
  void ROLES;
}
