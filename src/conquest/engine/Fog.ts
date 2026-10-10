// What a life knows of the map, and what it can see right now.
//
// Each line of characters carries its own map: the home colony and the
// country round it to begin with (and the sea lanes, for sailors and
// traders), then everywhere they go and everything they hear of. Known
// country shows its land, borders and towns as they were last seen; only
// what's near (a day or two's sight, further from high ground, the sea or a
// fort) shows what's moving there. A governor sees their whole colony; an
// officer, the country round the army; the marshal, round all of them.
// Someone watching the world sees everything.

import type { ConquestGame } from "./Game";
import { touchLife } from "./LifeCore";
import { meOf } from "./LifeQueries";
import type { World } from "./Map";
import type { GameState, Life, Terrain } from "./Types";

/** How far you can see from a province, in km, by its lie. */
export const SIGHT_KM: Record<Terrain, number> = {
  plains: 210,
  desert: 240,
  tundra: 220,
  hills: 260,
  mountains: 280,
  forest: 160,
  jungle: 130,
  marsh: 150,
};
/** Further from the shore (you see the sails), and from a fort's walls. */
export const SEA_SIGHT_KM = 150;
export const FORT_SIGHT_KM = 60;
/** The country round home known at the start, in marches. */
const HOME_HOPS = 2;
/** Sailors and traders know the sea lanes this far from home. */
const LANES_KM = 1200;

/**
 * Other things that let a life see: its followers, its boats (LIFE r11 can
 * register them here). Each returns provinces to see around.
 */
export const fogSources: ((s: GameState, life: Life) => number[])[] = [];

/** Add the provinces in sight of `p` to `out`. */
export function sightAround(
  s: GameState,
  w: World,
  p: number,
  out: Set<number>,
  extra = 0,
): void {
  const def = w.map.provinces[p];
  if (!def || def.closed) return;
  out.add(p);
  const pr = s.provinces[p];
  const km =
    SIGHT_KM[def.terrain] + extra + ((pr?.b.fort ?? 0) > 0 ? FORT_SIGHT_KM : 0);
  for (const [q, d] of def.nb) if (d <= km) out.add(q);
  if (def.coastal)
    for (const [q, d] of def.sea) {
      if (d > SEA_SIGHT_KM + extra) break;
      out.add(q);
    }
}

/** Is this life seeing the world through fog at all? */
export function fogged(life: Life | null | undefined): life is Life {
  return !!life && !life.watching && life.c >= 0;
}

/** Provinces this life can see right now. */
export function sightOf(s: GameState, w: World, life: Life): Set<number> {
  const out = new Set<number>();
  const me = meOf(s, life);
  if (!me) return out;
  // Where you are, or on the road between two places.
  if (life.travel && life.travel.path.length) {
    const atSea = life.travel.sea[0] ?? false;
    sightAround(s, w, life.prov, out, atSea ? 60 : 0);
    sightAround(s, w, life.travel.path[0], out, atSea ? 60 : 0);
  } else sightAround(s, w, life.prov, out);
  // A governor (or a sachem) hears from every corner of their land.
  for (const n of s.nations) {
    if (!n.alive || n.ruler !== me.id) continue;
    s.provinces.forEach((pr, p) => {
      if (pr.owner === n.id) out.add(p);
    });
  }
  // An officer sees round the army; the marshal round all of the nation's.
  const armies = s.armies.filter(
    (a) =>
      a.commander === me.id ||
      (life.job?.army !== undefined &&
        life.job.army >= 0 &&
        a.id === life.job.army &&
        life.job.rank >= 2) ||
      s.nations[a.owner]?.council.marshal === me.id,
  );
  for (const a of armies) {
    sightAround(s, w, a.prov, out);
    if (a.path.length) sightAround(s, w, a.path[0], out);
  }
  for (const f of fogSources)
    for (const p of f(s, life)) sightAround(s, w, p, out);
  return out;
}

/** What a life has explored: what it's been told of and where it has been. */
export function knownOf(life: Life): Set<number> {
  const out = new Set<number>(life.known ?? []);
  for (const p of life.visited) out.add(p);
  out.add(life.prov);
  return out;
}

/** The country a new life starts out knowing. */
export function startingKnowledge(
  s: GameState,
  w: World,
  life: Life,
): number[] {
  const me = meOf(s, life);
  const out = new Set<number>();
  const home = life.home >= 0 ? life.home : life.prov;
  const nation = me ? s.nations[me.nation] : undefined;
  // Your own colony (or your people's land).
  if (nation)
    s.provinces.forEach((pr, p) => {
      if (pr.owner === nation.id) out.add(p);
    });
  // The country round home.
  let ring = [home, life.prov];
  for (const p of ring) out.add(p);
  for (let hop = 0; hop < HOME_HOPS; hop++) {
    const next: number[] = [];
    for (const p of ring)
      for (const [q] of w.map.provinces[p]?.nb ?? [])
        if (!out.has(q)) {
          out.add(q);
          next.push(q);
        }
    ring = next;
  }
  // Sailors and traders know the sea lanes from home.
  const job = life.job?.kind;
  const seafaring =
    job === "sailor" ||
    job === "trader" ||
    life.background === "sailor" ||
    life.background === "trader";
  if (seafaring) {
    const ports = [...out].filter((p) => w.map.provinces[p]?.coastal);
    for (const p of ports)
      for (const [q, km] of w.map.provinces[p].sea)
        if (km <= LANES_KM) out.add(q);
  }
  return [...out]
    .filter((p) => !w.map.provinces[p]?.closed)
    .sort((a, b) => a - b);
}

/** Learn of a place: a letter, a rumour, a lead, a map bought in a tavern. */
export function reveal(g: ConquestGame, life: Life, provs: number[]): boolean {
  const known = knownOf(life);
  const fresh = provs.filter(
    (p) => !known.has(p) && !g.map.provinces[p]?.closed,
  );
  if (!fresh.length) return false;
  touchLife(g, life);
  life.known = [...new Set([...(life.known ?? []), ...fresh])].sort(
    (a, b) => a - b,
  );
  for (const p of fresh) {
    life.seenOwner ??= {};
    life.seenOwner[p] = g.s.provinces[p].owner;
  }
  return true;
}

/**
 * Each day: what each life can see joins what it knows, and the owners of
 * what it sees are noted (that's how the map shows them when it can't).
 */
export function fogDaily(g: ConquestGame): void {
  const s = g.s;
  for (const life of s.lives) {
    if (!fogged(life)) continue;
    if (!life.known) {
      touchLife(g, life);
      life.known = startingKnowledge(s, g.w, life);
      life.seenOwner = {};
      for (const p of life.known) life.seenOwner[p] = s.provinces[p].owner;
    }
    const seen = sightOf(s, g.w, life);
    const known = knownOf(life);
    let grew: number[] | null = null;
    for (const p of seen) {
      const owner = s.provinces[p].owner;
      if (!known.has(p)) (grew ??= []).push(p);
      const was = life.seenOwner?.[p];
      if (was !== owner) {
        touchLife(g, life);
        (life.seenOwner ??= {})[p] = owner;
      }
    }
    if (grew) {
      touchLife(g, life);
      life.known = [...new Set([...(life.known ?? []), ...grew])].sort(
        (a, b) => a - b,
      );
    }
  }
}

/** Who held a province as far as this life knows (-1 open, null unknown). */
export function ownerAsKnown(
  s: GameState,
  life: Life,
  p: number,
  seen: Set<number>,
  known: Set<number>,
): number | null {
  if (seen.has(p)) return s.provinces[p].owner;
  if (!known.has(p)) return null;
  return life.seenOwner?.[p] ?? s.provinces[p].owner;
}

/** A life's view of the map, for drawing and for the panels. */
export interface FogView {
  known: Set<number>;
  seen: Set<number>;
  owner: (p: number) => number | null;
}

export function fogView(s: GameState, w: World, life: Life): FogView {
  const known = knownOf(life);
  const seen = sightOf(s, w, life);
  for (const p of seen) known.add(p);
  return {
    known,
    seen,
    owner: (p) => ownerAsKnown(s, life, p, seen, known),
  };
}
