// SEA (r15): the hurricanes. They're born in their season (June to
// November, most in August and September) in the tropical Atlantic east of
// the Windward Islands, or early and late in the season in the western
// Caribbean and the Gulf. They run west and west-north-west at three to
// six hundred kilometres a day (so one takes days to cross the Caribbean),
// then most recurve north and north-east; some run on into the Gulf, a few
// up the coast. Over warm water they build; over land, and in the cold
// north, they blow themselves out.
//
// What they do: a day or two ahead, the period's signs warn whoever is in
// their way (a long swell, a falling glass, a red sky), and they can make
// ready. Where the eye passes, towns are struck (roofs, crops and ships in
// the harbour, some drowned, prices up after), and ships at sea (yours,
// your boats, cruises, voyages, the world's traders) are battered, blown
// off their course or lost; a scene if you're caught. The news and the
// talk carry it. The world's own dice are never touched: the sea's dice
// (sdice) decide everything here.

import { dateOf } from "./Calendar";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { journal, touchLife } from "./LifeCore";
import { shockMarket } from "./Markets";
import { wake } from "./Pace";
import { rumour } from "./Rumours";
import {
  headingTo,
  kmApart,
  moveAlong,
  sdice,
  seaChanged,
  seaOf,
  seaState,
  turnTo,
  wayAt,
} from "./SeaCore";
import type { GameState, Life, MapDef, Storm } from "./Types";

// ---------------------------------------------------------------- the numbers

/** Chance a day that a storm is born, by month (January 0): about five a year. */
export const STORM_BIRTH = [
  0, 0, 0, 0, 0, 0.006, 0.012, 0.05, 0.065, 0.035, 0.01, 0,
];
/** At most this many at once. */
export const MAX_STORMS = 3;
/** Km a day in the tropics, and the most after recurving (they quicken going north-east). */
export const STORM_KM: [number, number] = [300, 600];
export const STORM_KM_MAX = 600;
/** Degrees a day a storm can turn. */
export const STORM_TURN = 20;
/** Where its winds strike, from the eye (km): this, and so much more each step of force. */
export function stormReach(force: number): number {
  return 60 + 35 * force;
}
/** The signs come this far ahead of a storm heading your way (km). */
export const WARN_KM = 900;
/** Days an ended storm stays on the map, fading. */
export const FADE_DAYS = 2;
/** Points of the track kept. */
const TRACK = 16;

// ---------------------------------------------------------------- names

/** The saints whose days named the storms in the Spanish islands ([month, day, name]). */
const SAINTS: [number, number, string][] = [
  [5, 13, "San Antonio"],
  [5, 24, "San Juan"],
  [5, 29, "San Pedro"],
  [6, 2, "La Visitación"],
  [6, 16, "Nuestra Señora del Carmen"],
  [6, 22, "Santa Magdalena"],
  [6, 25, "Santiago"],
  [6, 26, "Santa Ana"],
  [6, 31, "San Ignacio"],
  [7, 4, "Santo Domingo"],
  [7, 10, "San Lorenzo"],
  [7, 15, "La Asunción"],
  [7, 16, "San Roque"],
  [7, 21, "San Ciriaco"],
  [7, 24, "San Bartolomé"],
  [7, 28, "San Agustín"],
  [7, 30, "Santa Rosa"],
  [8, 8, "La Natividad"],
  [8, 10, "San Nicolás"],
  [8, 14, "La Exaltación"],
  [8, 21, "San Mateo"],
  [8, 26, "San Cipriano"],
  [8, 29, "San Miguel"],
  [8, 30, "San Jerónimo"],
  [9, 4, "San Francisco"],
  [9, 15, "Santa Teresa"],
  [9, 18, "San Lucas"],
  [9, 24, "San Rafael"],
  [9, 28, "San Simón"],
  [10, 1, "Todos los Santos"],
  [10, 11, "San Martín"],
  [10, 25, "Santa Catalina"],
];

/** "San Mateo": the saint of the day (or the last before it). */
export function saintOf(month: number, day: number): string {
  let pick = SAINTS[0][2];
  for (const [m, d, n] of SAINTS)
    if (m < month || (m === month && d <= day)) pick = n;
  return pick;
}

/** A storm's name: the saint of the day, or the next saint's if that one's taken this season. */
function freshName(taken: string[], month: number, day: number): string {
  const first = saintOf(month, day);
  if (!taken.includes(first)) return first;
  const i = SAINTS.findIndex((x) => x[2] === first);
  for (let k = i + 1; k < SAINTS.length; k++)
    if (!taken.includes(SAINTS[k][2])) return SAINTS[k][2];
  return `${first} (${taken.filter((t) => t.startsWith(first)).length + 1})`;
}

/** "the San Mateo hurricane". */
export function stormName(st: Pick<Storm, "name">): string {
  return `the ${st.name} hurricane`;
}

// ---------------------------------------------------------------- the land

interface LandPt {
  p: number;
  lat: number;
  lon: number;
  big: boolean;
}
const LAND = new WeakMap<MapDef, LandPt[]>();

function landOf(map: MapDef): LandPt[] {
  let pts = LAND.get(map);
  if (!pts) {
    pts = map.provinces
      .map((d, p) => ({
        p,
        lat: d.lat,
        lon: d.lon,
        // Small islands don't slow a storm; Cuba, Hispaniola and the mainland do.
        big: d.areaKm2 > 7000,
        closed: !!d.closed,
      }))
      .filter((x) => !x.closed && x.lat > 5 && x.lat < 50 && x.lon > -105)
      .map(({ p, lat, lon, big }) => ({ p, lat, lon, big }));
    LAND.set(map, pts);
  }
  return pts;
}

/** Whether a storm's eye is over land (a big island or the mainland) here. */
export function overLand(map: MapDef, lat: number, lon: number): boolean {
  for (const x of landOf(map)) {
    if (!x.big) continue;
    if (Math.abs(x.lat - lat) > 1.2 || Math.abs(x.lon - lon) > 1.4) continue;
    if (kmApart(lat, lon, x.lat, x.lon) < 75) return true;
  }
  return false;
}

// ---------------------------------------------------------------- birth

/** A storm born on this day, or null (most days, and out of season). */
export function maybeBorn(g: ConquestGame): Storm | null {
  const s = g.s;
  const month = dateOf(s.day).month;
  const p = STORM_BIRTH[month] ?? 0;
  if (p <= 0) return null;
  const sea = seaState(g);
  if (sea.storms.filter((x) => x.ended === undefined).length >= MAX_STORMS)
    return null;
  const r = sdice(g);
  if (!r.chance(p)) return null;
  // Where: the long-track storms east of the islands in the heart of the
  // season; early and late, the western Caribbean and the Gulf.
  const heart = month === 7 || month === 8;
  const shoulder = month === 6 || month === 9;
  const zone = heart
    ? r.chance(0.75)
      ? "east"
      : r.chance(0.6)
        ? "west"
        : "gulf"
    : shoulder
      ? r.chance(0.4)
        ? "east"
        : r.chance(0.6)
          ? "west"
          : "gulf"
      : r.chance(0.6)
        ? "west"
        : "gulf";
  let lat: number;
  let lon: number;
  let dir: number;
  let km: number;
  let bent: Storm["bent"];
  if (zone === "east") {
    lat = 11 + r.next() * 6;
    lon = -49 - r.next() * 7;
    dir = 280 + r.next() * 12;
    km = 330 + r.next() * 170;
    const b = r.next();
    bent = b < 0.5 ? "recurve" : b < 0.8 ? "gulf" : "coast";
  } else if (zone === "west") {
    lat = 13 + r.next() * 5;
    lon = -78 - r.next() * 6;
    dir = 320 + r.next() * 25;
    km = STORM_KM[0] + r.next() * 100;
    const b = r.next();
    bent = b < 0.3 ? "gulf" : b < 0.7 ? "recurve" : "coast";
  } else {
    lat = 22 + r.next() * 4;
    lon = -86 - r.next() * 6;
    dir = 340 + r.next() * 40;
    km = STORM_KM[0] + r.next() * 80;
    bent = r.chance(0.5) ? "coast" : "gulf";
  }
  const turn =
    bent === "recurve"
      ? 21 + r.next() * 6
      : bent === "coast"
        ? 27 + r.next() * 4
        : 99;
  const peak = 2 + Math.floor(r.next() * r.next() * 4.2);
  const date = dateOf(s.day);
  const st: Storm = {
    id: g.nextId(),
    name: freshName(
      sea.storms.filter((x) => s.day - x.born < 200).map((x) => x.name),
      date.month,
      date.day,
    ),
    born: s.day,
    lat: Math.round(lat * 1000) / 1000,
    lon: Math.round(lon * 1000) / 1000,
    dir: Math.round(dir % 360),
    km: Math.round(km),
    force: 1,
    peak: Math.min(5, peak),
    track: [],
    bent,
    turn: Math.round(turn * 10) / 10,
    struck: [],
    warned: [],
  };
  sea.storms.push(st);
  seaChanged(g);
  return st;
}

// ---------------------------------------------------------------- a day's run

/** Where a storm wants to head, as it stands: west in the tropics, then north and north-east. */
export function wantHeading(st: Storm): number {
  if (st.bent === "gulf") {
    if (st.lon < -89) return 320;
    return st.lat < 19 ? 285 : 298;
  }
  if (st.lat < st.turn) return st.lat < 17 ? 285 : 300;
  return st.bent === "recurve" ? 45 : 22;
}

/** Move a storm a day along its way; true while it lives. */
export function stepStorm(map: MapDef, st: Storm, wobble: number): boolean {
  st.track.push([st.lat, st.lon]);
  if (st.track.length > TRACK) st.track.splice(0, st.track.length - TRACK);
  const want = wantHeading(st);
  const t = turnTo(st.dir, want);
  st.dir = Math.round(
    (((st.dir + Math.max(-STORM_TURN, Math.min(STORM_TURN, t)) + wobble) %
      360) +
      360) %
      360,
  );
  // Recurved, it quickens north-east.
  if (st.lat >= st.turn && st.bent !== "gulf")
    st.km = Math.min(STORM_KM_MAX, Math.round(st.km * 1.08));
  [st.lat, st.lon] = moveAlong(st.lat, st.lon, st.dir, st.km);
  // It builds over warm water and blows out over land and in the north.
  const land = overLand(map, st.lat, st.lon);
  if (land) st.force -= 1.5;
  else if (st.lat > 35) st.force -= 0.8;
  else if (st.force < st.peak) st.force += 1;
  st.force = Math.round(Math.max(0, Math.min(5, st.force)) * 10) / 10;
  return !(
    st.force < 0.5 ||
    st.lat > 43 ||
    st.lat < 6 ||
    st.lon > -44 ||
    st.lon < -101
  );
}

// ---------------------------------------------------------------- what it strikes

/**
 * Who answers for a life caught at sea by a storm: a cruise or a voyage
 * (Cruises.ts, Voyages.ts) takes it and returns true; a passage on someone
 * else's ship, or in your own boat, falls to the last (the old scene).
 */
export const STORM_AT_SEA: ((
  g: ConquestGame,
  life: Life,
  st: Storm,
) => boolean)[] = [];

/** The places a storm strikes this day: coastal country within its reach (and a little inland). */
export function inReach(
  map: MapDef,
  st: Pick<Storm, "lat" | "lon" | "force">,
): { p: number; km: number }[] {
  const reach = stormReach(st.force);
  const out: { p: number; km: number }[] = [];
  map.provinces.forEach((d, p) => {
    if (d.closed) return;
    if (Math.abs(d.lat - st.lat) > 3 || Math.abs(d.lon - st.lon) > 4) return;
    const km = kmApart(st.lat, st.lon, d.lat, d.lon);
    if (km <= (d.coastal ? reach : reach * 0.6)) out.push({ p, km });
  });
  return out;
}

/** How hard a place is struck, 0 to 5: the storm's force, less towards the edge. */
export function strikeForce(force: number, km: number): number {
  return Math.max(0, force * (1 - (0.5 * km) / stormReach(force)));
}

/** A storm near a point, heading its way: the closest such, with its distance. */
export function stormBearingDown(
  s: GameState,
  lat: number,
  lon: number,
  within = WARN_KM,
): { st: Storm; km: number } | null {
  let best: { st: Storm; km: number } | null = null;
  for (const st of seaOf(s).storms) {
    if (st.ended !== undefined || st.force < 1) continue;
    const km = kmApart(st.lat, st.lon, lat, lon);
    if (km > within) continue;
    const toward = Math.abs(
      turnTo(st.dir, headingTo(st.lat, st.lon, lat, lon)),
    );
    if (km > stormReach(st.force) && toward > 65) continue;
    if (!best || km < best.km) best = { st, km };
  }
  return best;
}

/** Where a life is on the globe now: its town, or its ship between two. */
export function lifeSpot(
  g: ConquestGame,
  life: Life,
): { lat: number; lon: number; sea: boolean } {
  const t = life.travel;
  if (t && t.path.length && t.sea[0]) {
    const at = wayAt(
      g.map,
      {
        prov: life.prov,
        path: t.path,
        sea: t.sea,
        depart: t.depart,
        arrive: t.arrive,
      },
      life.prov,
      g.s.day,
    );
    return { ...at, sea: true };
  }
  const d = g.map.provinces[life.prov];
  return { lat: d.lat, lon: d.lon, sea: false };
}

/** A storm's hold on a life this year: battened down (or run for shelter) against it. */
export function madeReady(life: Life, st: Storm): boolean {
  return life.cooldowns[`storm:${st.id}`] === 1;
}

/** Strike a town: roofs and crops, ships in the harbour, the drowned, dear prices; and tell of it. */
function strikeTown(g: ConquestGame, st: Storm, p: number, km: number): void {
  const s = g.s;
  const r = sdice(g);
  const d = g.map.provinces[p];
  const pr = s.provinces[p];
  const sev = strikeForce(st.force, km);
  if (sev < 0.6) return;
  st.struck.push(p);
  seaChanged(g);
  const town = d.name;
  const settled = pr.owner >= 0 && pr.pops.length > 0;
  // The country: roofs, fields and the harbour (the war's damage heals the same way).
  if (settled) {
    const pv = g.prov(p);
    // A colony's governor decides how it's rebuilt (Events.ts: "A hurricane
    // hits"); the native peoples' towns take the damage as it falls.
    if (s.nations[pr.owner]?.kind !== "power")
      pv.devastation = Math.min(
        0.5,
        Math.max(pv.devastation, Math.round((0.06 + 0.07 * sev) * 100) / 100),
      );
    pv.mods.push({
      key: "hurricane",
      label: `Struck by ${stormName(st)}`,
      until: s.day + 240,
      fx: { unrest: Math.round(2 + sev * 2), production: -Math.round(4 * sev) },
    });
    // Some drowned, the poorest first.
    const lost = 0.002 + 0.004 * sev;
    for (const pop of pv.pops)
      pop.size = Math.max(0, Math.round(pop.size * (1 - lost)));
    // Dear after: sugar where the cane was flattened, bread everywhere.
    shockMarket(g, p, {
      item: g.w.raw[p] === "sugar" ? "sugar" : "food",
      mul: Math.round((1.15 + 0.07 * sev) * 100) / 100,
      until: s.day + 60 + Math.round(15 * sev),
      why: stormName(st),
    });
    g.marketsChanged(p);
  }
  const words =
    sev >= 3.5
      ? "a great storm: houses flattened, the harbour full of wrecks, and many drowned"
      : sev >= 2
        ? "roofs gone, the crops flattened and ships driven ashore"
        : "a hard blow: trees down and a ship or two aground";
  const text = `${cap(stormName(st))} struck ${town}: ${words}.`;
  if (settled) {
    g.event({ k: "news", day: s.day, n: pr.owner, text, p });
    rumour(g, p, text, -1, "bad");
  }
  // The players here (ashore), their boats in the harbour and their houses.
  for (const life of s.lives) {
    if (life.watching || life.c < 0) continue;
    const ready = madeReady(life, st);
    for (const b of [...(life.boats ?? [])]) {
      if (b.prov !== p || life.travel?.boat === b.id) continue;
      const hit = Math.round(sev * (6 + r.next() * 10) * (ready ? 0.4 : 1));
      if (hit <= 0) continue;
      touchLife(g, life);
      b.condition = Math.max(0, b.condition - hit);
      if (b.condition <= 0) {
        life.boats = (life.boats ?? []).filter((x) => x !== b);
        for (const f of life.people ?? [])
          if (f.task?.kind === "boat" && f.task.boat === b.id) f.task = null;
        journal(
          g,
          life,
          `${cap(stormName(st))} drove the ${b.name} ashore at ${town}: she's a wreck.`,
          "bad",
        );
        wake(g, life, `The ${b.name} is wrecked.`);
      } else
        journal(
          g,
          life,
          `${cap(stormName(st))} battered the ${b.name} at her moorings at ${town}${ready ? " (well secured, she rode it out)" : ""}: her hull is at ${Math.round(b.condition)}.`,
          "bad",
        );
    }
    // It has found you: no signs after it.
    if (
      life.prov === p &&
      !life.travel &&
      !st.warned.includes(`w:${life.seat}`)
    )
      st.warned.push(`w:${life.seat}`);
    if (life.prov === p && !life.travel && sev >= 1)
      raiseEvent(g, life, "sea-storm-town", {
        st: st.id,
        f: Math.round(sev * 10) / 10,
      });
  }
}

/** Ships at sea in its path: the players aboard (a scene), the world's traders (a delay). */
function strikeShips(g: ConquestGame, st: Storm): void {
  const s = g.s;
  const reach = stormReach(st.force) + 60;
  for (const life of s.lives) {
    if (life.watching || life.c < 0 || !life.travel) continue;
    const spot = lifeSpot(g, life);
    if (!spot.sea) continue;
    if (kmApart(spot.lat, spot.lon, st.lat, st.lon) > reach) continue;
    const key = `m:${life.seat}`;
    if (st.warned.includes(key)) continue;
    st.warned.push(key);
    seaChanged(g);
    for (const h of STORM_AT_SEA) if (h(g, life, st)) break;
  }
  // The world's own ships on passage: blown off course, a few days lost.
  const r = sdice(g);
  let moved = false;
  for (const t of s.travellers ?? []) {
    if (!t.path.length || !t.sea[0] || t.depart < 0) continue;
    const a = g.map.provinces[t.prov];
    if (kmApart(a.lat, a.lon, st.lat, st.lon) > reach) continue;
    t.arrive += 2 + r.int(0, 3);
    moved = true;
  }
  if (moved) g.travellersChanged();
}

/**
 * Who answers the signs for a life at sea: a cruise asks only whoever
 * decides for her and tells the rest (Cruises.ts), returning true.
 */
export const STORM_SIGNS: ((
  g: ConquestGame,
  life: Life,
  st: Storm,
  days: number,
) => boolean)[] = [];

/** The signs, a day or two ahead: to whoever's in its way, once. */
function warnLives(g: ConquestGame): void {
  const s = g.s;
  for (const life of s.lives) {
    if (life.watching || life.c < 0) continue;
    const spot = lifeSpot(g, life);
    if (!spot.sea && !g.map.provinces[life.prov]?.coastal) continue;
    const near = stormBearingDown(s, spot.lat, spot.lon);
    if (!near) continue;
    const key = `w:${life.seat}`;
    // Warned once; and not at all once it has found you.
    if (
      near.st.warned.includes(key) ||
      near.st.warned.includes(`m:${life.seat}`)
    )
      continue;
    near.st.warned.push(key);
    seaChanged(g);
    const days = Math.max(1, Math.round(near.km / Math.max(200, near.st.km)));
    if (spot.sea && STORM_SIGNS.some((h) => h(g, life, near.st, days)))
      continue;
    raiseEvent(g, life, spot.sea ? "sea-storm-signs-ship" : "sea-storm-signs", {
      st: near.st.id,
      d: days,
    });
    wake(g, life, `${cap(stormName(near.st))} is coming.`);
  }
}

/** Each day: storms born, moved, striking; the signs ahead of them. */
export function stormsDaily(g: ConquestGame): void {
  const s = g.s;
  if (!s.sea?.storms.length && (STORM_BIRTH[dateOf(s.day).month] ?? 0) <= 0)
    return;
  const sea = seaState(g);
  // The ended fade from the map.
  const before = sea.storms.length;
  sea.storms = sea.storms.filter(
    (x) => x.ended === undefined || s.day - x.ended <= FADE_DAYS,
  );
  if (sea.storms.length !== before) seaChanged(g);
  maybeBorn(g);
  const r = sdice(g);
  for (const st of sea.storms) {
    if (st.ended !== undefined) continue;
    const alive = stepStorm(g.map, st, (r.next() - 0.5) * 10);
    seaChanged(g);
    if (!alive) {
      st.ended = s.day;
      st.force = 0;
      continue;
    }
    if (st.force >= 1) {
      for (const { p, km } of inReach(g.map, st))
        if (!st.struck.includes(p)) strikeTown(g, st, p, km);
      strikeShips(g, st);
    }
  }
  warnLives(g);
}

/** A storm by id, if it's still about. */
export function stormById(s: GameState, id: number): Storm | undefined {
  return seaOf(s).storms.find((x) => x.id === id);
}

/** The province of nation `n` a storm struck lately that its governor hasn't seen to, or -1. */
export function struckLately(s: GameState, n: number, days = 30): number {
  for (const st of seaOf(s).storms)
    for (const p of st.struck)
      if (s.provinces[p]?.owner === n && s.day - st.born <= days) return p;
  return -1;
}

const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

// SEA (r15): this module's hooks, registered by Sea.ts once every sea module
// has loaded (they import each other, so nothing is pushed while one of them
// is still half-loaded).
const LATER: (() => void)[] = [];
const later = (f: () => unknown): void => void LATER.push(() => void f());
/** Register this module's hooks (Sea.ts calls it, once). */
export function registerStorms(): void {
  for (const f of LATER.splice(0)) f();
}

// A passage, or your own boat: the hurricane's scene at sea (unless you made port).
later(() =>
  STORM_AT_SEA.push((g, life, st) => {
    if (life.travel?.ship !== undefined) return false;
    if (madeReady(life, st)) {
      journal(
        g,
        life,
        `You lay snug in harbour while ${stormName(st)} blew itself out to seaward.`,
        "good",
      );
      return true;
    }
    raiseEvent(g, life, "trv-hurricane", { st: st.id });
    return true;
  }),
);

later(() => hooks.daily.push(stormsDaily));
