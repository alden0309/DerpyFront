// Fitting a saved world to the map as it is now (WORLD r11): provinces
// added since (Aruba and Bonaire) are filled in, and land closed since
// (Alaska) is emptied, with anyone there moved out. Nothing changes for a
// world made on this map. Safe to run more than once.

import { kmBetween } from "./Map";
import { settlerPops, tribe } from "./Setup";
import type { GameState, MapDef, Province } from "./Types";

function blankProvince(owner: number): Province {
  return {
    owner,
    occupier: -1,
    pops: [],
    b: {},
    build: null,
    colony: null,
    recruits: [],
    siege: null,
    unrest: 0,
    devastation: 0,
    integrate: 0,
    depletion: 0,
    outpost: null,
    rich: false,
    made: {},
    mods: [],
  };
}

/** The nearest open province to a closed one (over the map, by distance). */
function nearestOpen(map: MapDef, p: number): number {
  let best = -1;
  let bestKm = Infinity;
  map.provinces.forEach((def, q) => {
    if (def.closed || q === p) return;
    const km = kmBetween(map, p, q);
    if (km < bestKm) {
      bestKm = km;
      best = q;
    }
  });
  return best;
}

export function fitStateToMap(s: GameState, map: MapDef): void {
  s.markets ??= {};
  s.leads ??= [];
  // New provinces: an island goes with its neighbour (Aruba and Bonaire
  // with Curaçao), or stays open country.
  for (let p = s.provinces.length; p < map.provinces.length; p++) {
    const def = map.provinces[p];
    const near = def.sea[0]?.[0] ?? -1;
    const by =
      near >= 0 && near < s.provinces.length ? s.provinces[near].owner : -1;
    const owner = by >= 0 && s.nations[by]?.kind === "power" ? by : -1;
    const pr = blankProvince(owner);
    if (owner >= 0) {
      const n = s.nations[owner];
      pr.pops.push(...settlerPops(n.culture, n.religion, 180));
      if (def.coastal) pr.b.port = 1;
    }
    pr.pops.push(tribe("local", 60));
    s.provinces.push(pr);
  }
  // Closed land: nobody holds it, lives there or marches through it.
  const closed = map.provinces.flatMap((def, p) => (def.closed ? [p] : []));
  if (!closed.length) return;
  const shut = new Set(closed);
  for (const p of closed) {
    const pr = s.provinces[p];
    if (!pr) continue;
    if (
      pr.owner === -1 &&
      pr.pops.length === 0 &&
      !pr.colony &&
      !pr.outpost &&
      pr.mods.length === 0
    )
      continue;
    s.provinces[p] = blankProvince(-1);
  }
  for (const a of s.armies) {
    if (shut.has(a.prov)) {
      a.prov = nearestOpen(map, a.prov);
      a.path = [];
      a.depart = -1;
      a.arrive = -1;
    }
    if (a.path.some((q) => shut.has(q))) {
      a.path = [];
      a.depart = -1;
      a.arrive = -1;
    }
  }
  for (const n of s.nations) {
    if (n.capital >= 0 && shut.has(n.capital)) {
      const own = s.provinces.findIndex((pr) => pr.owner === n.id);
      n.capital = own;
      if (own < 0 && n.kind !== "crown" && n.kind !== "rebels") n.alive = false;
    }
    n.explored = n.explored.filter((p) => !shut.has(p));
    n.missions = n.missions.filter(
      (m) => !shut.has(m.target) && !(m.route ?? []).some((q) => shut.has(q)),
    );
  }
  if (s.travellers)
    s.travellers = s.travellers.filter(
      (t) =>
        !shut.has(t.prov) &&
        !shut.has(t.home) &&
        !t.path.some((q) => shut.has(q)),
    );
  for (const life of s.lives) {
    if (
      shut.has(life.prov) ||
      (life.travel && life.travel.path.some((q) => shut.has(q)))
    ) {
      life.prov = shut.has(life.prov) ? nearestOpen(map, life.prov) : life.prov;
      life.travel = null;
    }
    if (shut.has(life.home)) life.home = life.prov;
    if (life.known) life.known = life.known.filter((p) => !shut.has(p));
  }
  for (const c of Object.values(s.chars))
    if (c.home !== undefined && shut.has(c.home))
      c.home = nearestOpen(map, c.home);
  for (const p of closed) delete s.locals[p];
}
