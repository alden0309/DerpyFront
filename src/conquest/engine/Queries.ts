// Derpy Conquest: questions about a game state that both the server (to
// check commands) and players' browsers (to grey out buttons) ask. Nothing
// here changes the state.

import {
  BUILDINGS,
  BUY_MIN_OPINION,
  COLONIZE_SEA_KM,
  colonyDays,
  colonyGold,
  EMBARK_DAYS,
  GIFT_SIZES,
  GOOD_YIELD,
  LANDLOCKED_SALE,
  landPrice,
  MARCH_KM_PER_DAY,
  powerRules,
  REGIMENT_MEN,
  REGIMENTS,
  RIVER_CROSSING_DAYS,
  SEA_KM_PER_DAY,
  STRAIT_CROSSING_DAYS,
  TAX_PER_THOUSAND,
  TERRAIN,
  TRADE_GOLD_PER_SQRT,
  TRADE_MIN_OPINION,
} from "./Rules";
import {
  Army,
  BuildingKind,
  GameState,
  MapDef,
  Nation,
  RegType,
} from "./Types";

export type Check<T = object> = ({ ok: true } & T) | { ok: false; why: string };

const no = (why: string): { ok: false; why: string } => ({ ok: false, why });

// ---------------------------------------------------------------- relations

export function warBetween(s: GameState, a: number, b: number) {
  return s.wars.find(
    (w) => (w.a === a && w.b === b) || (w.a === b && w.b === a),
  );
}

export function atWar(s: GameState, a: number, b: number): boolean {
  return a !== b && warBetween(s, a, b) !== undefined;
}

export function truceUntil(s: GameState, a: number, b: number): number {
  const t = s.truces.find(
    (t) => (t.a === a && t.b === b) || (t.a === b && t.b === a),
  );
  return t && t.until > s.day ? t.until : -1;
}

export function dealBetween(s: GameState, power: number, native: number) {
  return s.deals.find((d) => d.power === power && d.native === native);
}

export function enemiesOf(s: GameState, n: number): number[] {
  const out: number[] = [];
  for (const w of s.wars) {
    if (w.a === n) out.push(w.b);
    else if (w.b === n) out.push(w.a);
  }
  return out;
}

// ---------------------------------------------------------------- land

export function provincesOf(s: GameState, n: number): number[] {
  const out: number[] = [];
  s.provinces.forEach((p, i) => {
    if (p.owner === n) out.push(i);
  });
  return out;
}

/** Whether nation `n`'s armies may go into province `p`. */
export function canEnter(s: GameState, n: number, p: number): boolean {
  const owner = s.provinces[p].owner;
  return owner === -1 || owner === n || atWar(s, n, owner);
}

/** Whether two provinces touch by land (or a short strait). */
export function landNeighbours(map: MapDef, a: number, b: number): boolean {
  return map.provinces[a].nb.some(([q]) => q === b);
}

/** Whether nation `n` holds a province next to (or a short sail from) `p`. */
export function bordersProvince(
  s: GameState,
  map: MapDef,
  n: number,
  p: number,
): boolean {
  const def = map.provinces[p];
  if (def.nb.some(([q]) => s.provinces[q].owner === n)) return true;
  return def.sea.some(
    ([q, km]) => km <= map.seaLaneKm && s.provinces[q].owner === n,
  );
}

/** Whether power `a` and nation `b` share a border anywhere. */
export function nationsBorder(
  s: GameState,
  map: MapDef,
  a: number,
  b: number,
): boolean {
  for (let p = 0; p < s.provinces.length; p++) {
    if (s.provinces[p].owner === b && bordersProvince(s, map, a, p))
      return true;
  }
  return false;
}

// ---------------------------------------------------------------- moving

export function armySpeed(a: Army): number {
  let speed = Infinity;
  for (const r of a.regs) speed = Math.min(speed, REGIMENTS[r.type].speed);
  return speed === Infinity ? 1 : speed;
}

/** Days to march from `from` to the neighbour described by `nb`. */
export function landHopDays(
  map: MapDef,
  to: number,
  km: number,
  river: number,
  strait: number,
  speed: number,
): number {
  const terrain = TERRAIN[map.provinces[to].terrain];
  return Math.max(
    2,
    Math.ceil(km / (MARCH_KM_PER_DAY * terrain.speed * speed)) +
      (river ? RIVER_CROSSING_DAYS : 0) +
      (strait ? STRAIT_CROSSING_DAYS : 0),
  );
}

export function seaHopDays(km: number): number {
  return EMBARK_DAYS + Math.ceil(km / SEA_KM_PER_DAY);
}

/** Whether an army of `n` may set sail from `p` (its own coast). */
export function canSailFrom(s: GameState, map: MapDef, n: number, p: number) {
  return map.provinces[p].coastal && s.provinces[p].owner === n;
}

export interface PathResult {
  path: number[];
  days: number;
  /** For each step, whether it's by sea. */
  sea: boolean[];
}

export interface RouteTree {
  /** Days to each province (Infinity if unreachable). */
  days: Float64Array;
  prev: Int32Array;
  bySea: Uint8Array;
}

/**
 * Quickest routes from `from` to everywhere nation `n`'s army (marching at
 * `speed`) can go: over land it may enter, sailing only from its own
 * coasts. Stops early once `to` is settled, if given.
 */
export function routeTree(
  s: GameState,
  map: MapDef,
  n: number,
  from: number,
  speed: number,
  to = -1,
): RouteTree {
  const count = map.provinces.length;
  const days = new Float64Array(count).fill(Infinity);
  const prev = new Int32Array(count).fill(-1);
  const bySea = new Uint8Array(count);
  const done = new Uint8Array(count);
  // Binary heap of [days, province].
  const heapD: number[] = [];
  const heapP: number[] = [];
  const push = (d: number, p: number) => {
    let i = heapD.length;
    heapD.push(d);
    heapP.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heapD[parent] <= d) break;
      heapD[i] = heapD[parent];
      heapP[i] = heapP[parent];
      i = parent;
    }
    heapD[i] = d;
    heapP[i] = p;
  };
  const pop = (): number => {
    const top = heapP[0];
    const lastD = heapD.pop()!;
    const lastP = heapP.pop()!;
    if (heapD.length > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= heapD.length) break;
        if (c + 1 < heapD.length && heapD[c + 1] < heapD[c]) c++;
        if (heapD[c] >= lastD) break;
        heapD[i] = heapD[c];
        heapP[i] = heapP[c];
        i = c;
      }
      heapD[i] = lastD;
      heapP[i] = lastP;
    }
    return top;
  };
  days[from] = 0;
  push(0, from);
  while (heapD.length > 0) {
    const u = pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === to) break;
    const base = days[u];
    for (const [q, km, river, strait] of map.provinces[u].nb) {
      if (done[q] || !canEnter(s, n, q)) continue;
      const d = base + landHopDays(map, q, km, river, strait, speed);
      if (d < days[q]) {
        days[q] = d;
        prev[q] = u;
        bySea[q] = 0;
        push(d, q);
      }
    }
    if (canSailFrom(s, map, n, u)) {
      for (const [q, km] of map.provinces[u].sea) {
        if (km > map.seaLaneKm) break;
        if (done[q] || !canEnter(s, n, q)) continue;
        const d = base + seaHopDays(km);
        if (d < days[q]) {
          days[q] = d;
          prev[q] = u;
          bySea[q] = 1;
          push(d, q);
        }
      }
    }
  }
  return { days, prev, bySea };
}

/** The path from a route tree's start to `to`, or null if unreachable. */
export function pathTo(
  tree: RouteTree,
  from: number,
  to: number,
): PathResult | null {
  if (from === to) return { path: [], days: 0, sea: [] };
  if (tree.days[to] === Infinity) return null;
  const path: number[] = [];
  const sea: boolean[] = [];
  for (let c = to; c !== from; c = tree.prev[c]) {
    path.push(c);
    sea.push(tree.bySea[c] === 1);
  }
  path.reverse();
  sea.reverse();
  return { path, days: tree.days[to], sea };
}

/** The quickest way for nation `n`'s army from `from` to `to`. */
export function findPath(
  s: GameState,
  map: MapDef,
  n: number,
  from: number,
  to: number,
  speed: number,
): PathResult | null {
  if (from === to) return { path: [], days: 0, sea: [] };
  if (!canEnter(s, n, to)) return null;
  return pathTo(routeTree(s, map, n, from, speed, to), from, to);
}

/** Days for one hop, land or sea, or -1 if the two don't connect. */
export function hopDays(
  s: GameState,
  map: MapDef,
  n: number,
  from: number,
  to: number,
  speed: number,
  bySea: boolean,
): number {
  if (!bySea) {
    const nb = map.provinces[from].nb.find(([q]) => q === to);
    if (nb) return landHopDays(map, to, nb[1], nb[2], nb[3], speed);
    return -1;
  }
  const lane = map.provinces[from].sea.find(([q]) => q === to);
  if (!lane || lane[1] > map.seaLaneKm || !canSailFrom(s, map, n, from)) {
    return -1;
  }
  return seaHopDays(lane[1]);
}

// ---------------------------------------------------------------- armies

export function armyMen(a: Army): number {
  let men = 0;
  for (const r of a.regs) men += r.men;
  return men;
}

export function armyMorale(a: Army): number {
  let men = 0;
  let m = 0;
  for (const r of a.regs) {
    men += r.men;
    m += r.morale * r.men;
  }
  return men > 0 ? m / men : 0;
}

/** Rough fighting strength, for the computer's plans and for players. */
export function armyStrength(a: Army): number {
  let s = 0;
  for (const r of a.regs) {
    const rules = REGIMENTS[r.type];
    s +=
      (r.men / REGIMENT_MEN) *
      ((rules.attack + rules.defense) / 2) *
      (0.4 + 0.6 * r.morale);
  }
  return s;
}

export function armiesOf(s: GameState, n: number): Army[] {
  return s.armies.filter((a) => a.owner === n);
}

export function armiesIn(s: GameState, p: number): Army[] {
  return s.armies.filter((a) => a.prov === p);
}

export function countRegs(a: Army): Partial<Record<RegType, number>> {
  const out: Partial<Record<RegType, number>> = {};
  for (const r of a.regs) out[r.type] = (out[r.type] ?? 0) + 1;
  return out;
}

// ---------------------------------------------------------------- economy

/**
 * Provinces of `n` whose goods reach a port overland (through its own
 * provinces), so they sell at full price.
 */
export function portConnected(
  s: GameState,
  map: MapDef,
  n: number,
): Set<number> {
  const out = new Set<number>();
  const stack: number[] = [];
  s.provinces.forEach((p, i) => {
    if (p.owner === n && p.port > 0) {
      out.add(i);
      stack.push(i);
    }
  });
  while (stack.length) {
    const u = stack.pop()!;
    for (const [q] of map.provinces[u].nb) {
      if (!out.has(q) && s.provinces[q].owner === n) {
        out.add(q);
        stack.push(q);
      }
    }
  }
  return out;
}

export interface ProvinceIncome {
  units: number;
  goods: number;
  tax: number;
}

export function provinceIncome(
  s: GameState,
  map: MapDef,
  nation: Nation,
  p: number,
  connected: Set<number>,
): ProvinceIncome {
  const prov = s.provinces[p];
  const def = map.provinces[p];
  const units = (prov.pop / 1000) * GOOD_YIELD[def.good];
  const rules = powerRules(nation);
  const goods =
    units *
    s.prices[def.good] *
    (connected.has(p) ? 1 : LANDLOCKED_SALE) *
    rules.trade *
    (rules.goodBonus[def.good] ?? 1);
  return { units, goods, tax: (prov.pop / 1000) * TAX_PER_THOUSAND };
}

// ---------------------------------------------------------------- checks

export interface ColonizeInfo {
  gold: number;
  days: number;
  seaKm: number;
}

/** Whether power `n` can found a colony in `p`, and what it costs. */
export function colonizeCheck(
  s: GameState,
  map: MapDef,
  n: number,
  p: number,
): Check<ColonizeInfo> {
  const nation = s.nations[n];
  const prov = s.provinces[p];
  const def = map.provinces[p];
  if (nation.kind !== "power")
    return no("Only colonial powers found colonies.");
  if (prov.owner !== -1) return no("This land already belongs to someone.");
  if (prov.colony) {
    return no(
      prov.colony.by === n
        ? "Your colonists are already on their way."
        : `${s.nations[prov.colony.by].name} is already settling here.`,
    );
  }
  let seaKm = Infinity;
  if (def.nb.some(([q]) => s.provinces[q].owner === n)) seaKm = 0;
  else if (def.coastal) {
    for (const [q, km] of def.sea) {
      if (km > COLONIZE_SEA_KM) break;
      if (s.provinces[q].owner === n && km < seaKm) seaKm = km;
    }
  }
  if (seaKm === Infinity) {
    return no(
      "Too far: it must border your land or be a short sail from your coast.",
    );
  }
  const gold = colonyGold(def.terrain, provincesOf(s, n).length);
  const days = colonyDays(def.terrain, seaKm);
  if (nation.colonists < 1) return no("You have no colonists waiting.");
  if (nation.gold < gold)
    return no(`Founding a colony here costs ${gold} gold.`);
  return { ok: true, gold, days, seaKm };
}

export function buildCheck(
  s: GameState,
  map: MapDef,
  n: number,
  p: number,
  kind: BuildingKind,
): Check<{ gold: number; days: number; level: number }> {
  const nation = s.nations[n];
  const prov = s.provinces[p];
  if (nation.kind !== "power") return no("Only colonial powers build.");
  if (prov.owner !== n) return no("You don't own this province.");
  if (prov.build) return no("Something is already being built here.");
  if (prov.siege) return no("Not while it's under siege.");
  const rules = BUILDINGS[kind];
  const level = prov[kind];
  if (level >= rules.max) return no("Already as big as it gets.");
  if (kind === "port" && !map.provinces[p].coastal)
    return no("Ports need a coast.");
  const gold = rules.gold[level];
  if (nation.gold < gold) return no(`Costs ${gold} gold.`);
  return { ok: true, gold, days: rules.days[level], level: level + 1 };
}

/** Regiment types nation `n` can raise. */
export function regimentTypes(nation: Nation): RegType[] {
  if (nation.kind === "native")
    return nation.horse ? ["war", "horse"] : ["war"];
  return ["inf", "cav", "art"];
}

export const MAX_RECRUITS_PER_PROVINCE = 2;

export function recruitCheck(
  s: GameState,
  map: MapDef,
  n: number,
  p: number,
  type: RegType,
): Check<{ gold: number; days: number }> {
  const nation = s.nations[n];
  const prov = s.provinces[p];
  if (prov.owner !== n) return no("You don't own this province.");
  if (!regimentTypes(nation).includes(type))
    return no("You can't raise those.");
  if (prov.siege) return no("Not while it's under siege.");
  if (nation.kind === "power" && prov.pop < 200) {
    return no("Needs at least 200 settlers to raise troops.");
  }
  if (type === "art" && prov.port === 0 && prov.fort === 0) {
    return no("Cannons come by sea: artillery needs a port or a fort here.");
  }
  if (prov.recruits.length >= MAX_RECRUITS_PER_PROVINCE) {
    return no("Already raising as many regiments as it can here.");
  }
  const rules = REGIMENTS[type];
  if (nation.manpower < REGIMENT_MEN)
    return no(`Needs ${REGIMENT_MEN} manpower.`);
  if (nation.gold < rules.gold) return no(`Costs ${rules.gold} gold.`);
  return { ok: true, gold: rules.gold, days: rules.days };
}

export function warCheck(s: GameState, n: number, target: number): Check {
  if (n === target) return no("That's you.");
  const t = s.nations[target];
  if (!t?.alive) return no("They're gone.");
  if (atWar(s, n, target)) return no("Already at war.");
  const until = truceUntil(s, n, target);
  if (until >= 0) return no("You signed a truce with them; it hasn't run out.");
  return { ok: true };
}

export function peaceCheck(s: GameState, n: number, target: number): Check {
  if (!atWar(s, n, target)) return no("You're not at war with them.");
  if (s.offers.some((o) => o.from === n && o.to === target)) {
    return no("You've already offered peace; they haven't answered.");
  }
  return { ok: true };
}

/** Opinion a native nation needs of `power` to trade, after its bonus. */
function tradeBar(s: GameState, power: number): number {
  return TRADE_MIN_OPINION - powerRules(s.nations[power]).diplomacy;
}

export function tradeCheck(
  s: GameState,
  map: MapDef,
  n: number,
  native: number,
): Check<{ gold: number }> {
  const nat = s.nations[native];
  if (s.nations[n].kind !== "power" || nat.kind !== "native") {
    return no("Trade deals are between a colonial power and a native nation.");
  }
  if (atWar(s, n, native)) return no("Not while you're at war.");
  if (dealBetween(s, n, native)) return no("You already trade with them.");
  if (!nationsBorder(s, map, n, native))
    return no("You need to border them first.");
  if (nat.opinion[n] < tradeBar(s, n))
    return no(
      `They don't trust you enough (opinion ${Math.round(nat.opinion[n])}).`,
    );
  return { ok: true, gold: nativeTradeGold(s, map, native) };
}

/** Gold a month a trade deal with `native` makes. */
export function nativeTradeGold(
  s: GameState,
  map: MapDef,
  native: number,
): number {
  let gold = 2;
  s.provinces.forEach((p, i) => {
    if (p.owner !== native) return;
    const good = map.provinces[i].good;
    gold +=
      Math.sqrt(p.natives / 1000) * TRADE_GOLD_PER_SQRT * (s.prices[good] / 3);
  });
  return Math.round(gold * 10) / 10;
}

export function giftCheck(
  s: GameState,
  n: number,
  native: number,
  gold: number,
): Check {
  const nat = s.nations[native];
  if (nat?.kind !== "native" || s.nations[n].kind !== "power")
    return no("Gifts go to native nations.");
  if (!GIFT_SIZES.includes(gold)) return no("Pick a gift size.");
  if (atWar(s, n, native)) return no("Not while you're at war.");
  if (s.nations[n].gold < gold) return no(`You don't have ${gold} gold.`);
  return { ok: true };
}

export function buyCheck(
  s: GameState,
  map: MapDef,
  n: number,
  p: number,
): Check<{ gold: number }> {
  const prov = s.provinces[p];
  const owner = s.nations[prov.owner];
  if (s.nations[n].kind !== "power")
    return no("Only colonial powers buy land.");
  if (!owner || owner.kind !== "native")
    return no("Only native land is for sale.");
  if (atWar(s, n, prov.owner)) return no("Not while you're at war with them.");
  if (!bordersProvince(s, map, n, p)) return no("It must border your land.");
  if (provincesOf(s, prov.owner).length <= 1)
    return no("They won't sell their last home.");
  if (p === owner.capital) return no("They won't sell their capital.");
  const bar = BUY_MIN_OPINION - powerRules(s.nations[n]).diplomacy / 2;
  if (owner.opinion[n] < bar) {
    return no(
      `They'd need to like you more (opinion ${Math.round(owner.opinion[n])} of ${Math.round(bar)}).`,
    );
  }
  const gold = landPrice(prov.natives, map.provinces[p].areaKm2);
  if (s.nations[n].gold < gold) return no(`They want ${gold} gold.`);
  return { ok: true, gold };
}

/** Which nations' armies may share a province without fighting. */
export function hostile(s: GameState, a: number, b: number): boolean {
  return atWar(s, a, b);
}
