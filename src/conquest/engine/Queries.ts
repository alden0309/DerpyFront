// Questions about a Derpy Conquest game, asked by the server and by every
// player's browser of its own copy of the state. Anything a player sees as
// a number is computed here as a Breakdown, so the tooltip shows exactly
// what the rules used.

import { dateOf } from "./Calendar";
import { Explain } from "./Explain";
import { isFeverSeason, isWinter, kmBetween, World } from "./Map";
import {
  ADULT_AGE,
  BIRTH_CHANCE_PER_YEAR,
  BUILDINGS,
  COASTAL_FISH,
  COLONIZE_SEA_KM,
  COLONY_GOLD,
  COLONY_MIN_SOURCE,
  COLONY_SETTLERS,
  COURTHOUSE_ADMIN,
  CUSTOMS,
  DAYS_PER_YEAR,
  deathRiskByAge,
  EUROPE_DEPTH,
  EUROPE_PRICE,
  FARM_CAPACITY_BONUS,
  FARM_FOOD_BONUS,
  FOOD_YIELD,
  INDEPENDENCE_AUTONOMY,
  MARCH_KM_PER_DAY,
  NEEDS,
  OUTPOST,
  POWER_RULES,
  REGIMENTS,
  RESOURCE_BUILDING,
  RESOURCE_BUILDING_BONUS,
  RESOURCE_YIELD,
  RICH_BONUS,
  SAIL_KM_PER_DAY,
  SEAT_STAT,
  SHIPPING_PER_UNIT,
  STAT_MAX,
  TAX_RATE,
  TAX_UNREST,
  TERRAIN,
  TRAITS,
  UNMET_UNREST,
  WARRIOR_SHARE,
} from "./Rules";
import {
  Army,
  Breakdown,
  BuildingKind,
  Character,
  GameState,
  Good,
  MapDef,
  Nation,
  PeaceTerms,
  PopClass,
  Province,
  RawGood,
  RegType,
  Seat,
  Stat,
  STATS,
  TraitId,
  Treaty,
  TreatyKind,
  War,
} from "./Types";

export type Check = { ok: true } | { ok: false; why: string };
const yes: Check = { ok: true };
const no = (why: string): Check => ({ ok: false, why });

// ---------------------------------------------------------------- basics

export const isPower = (s: GameState, n: number) =>
  s.nations[n]?.kind === "power";
export const isNative = (s: GameState, n: number) =>
  s.nations[n]?.kind === "native";

export function warBetween(
  s: GameState,
  a: number,
  b: number,
): War | undefined {
  return s.wars.find(
    (w) => (w.a === a && w.b === b) || (w.a === b && w.b === a),
  );
}

export function atWar(s: GameState, a: number, b: number): boolean {
  return warBetween(s, a, b) !== undefined;
}

export function truceUntil(s: GameState, a: number, b: number): number {
  let until = 0;
  for (const t of s.truces) {
    if ((t.a === a && t.b === b) || (t.a === b && t.b === a))
      until = Math.max(until, t.until);
  }
  return until;
}

export function treatyBetween(
  s: GameState,
  a: number,
  b: number,
  kind: TreatyKind,
): Treaty | undefined {
  return s.treaties.find(
    (t) =>
      t.kind === kind && ((t.a === a && t.b === b) || (t.a === b && t.b === a)),
  );
}

export function enemiesOf(s: GameState, n: number): number[] {
  const out: number[] = [];
  for (const w of s.wars) {
    if (w.a === n) out.push(w.b);
    else if (w.b === n) out.push(w.a);
  }
  return out;
}

export function alliesOf(s: GameState, n: number): number[] {
  const out: number[] = [];
  for (const t of s.treaties) {
    if (t.kind !== "alliance") continue;
    if (t.a === n) out.push(t.b);
    else if (t.b === n) out.push(t.a);
  }
  return out;
}

export function provincesOf(s: GameState, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.provinces.length; i++) {
    if (s.provinces[i].owner === n) out.push(i);
  }
  return out;
}

/** Who holds a province right now: its occupier, or its owner. */
export function holder(pr: Province): number {
  return pr.occupier >= 0 ? pr.occupier : pr.owner;
}

/** Settlers (everyone but tribes) in a province. */
export function settlers(pr: Province): number {
  let n = 0;
  for (const p of pr.pops) if (p.cls !== "tribe") n += p.size;
  return n;
}

export function tribesfolk(pr: Province): number {
  let n = 0;
  for (const p of pr.pops) if (p.cls === "tribe") n += p.size;
  return n;
}

export function people(pr: Province): number {
  let n = 0;
  for (const p of pr.pops) n += p.size;
  return n;
}

export function classSize(pr: Province, cls: PopClass): number {
  let n = 0;
  for (const p of pr.pops) if (p.cls === cls) n += p.size;
  return n;
}

export function nationPeople(s: GameState, n: number): number {
  let total = 0;
  for (const pr of s.provinces) if (pr.owner === n) total += people(pr);
  return total;
}

export function nationSettlers(s: GameState, n: number): number {
  let total = 0;
  for (const pr of s.provinces) if (pr.owner === n) total += settlers(pr);
  return total;
}

/** Whether nation `n`'s armies may go into province `p`. */
export function canEnter(s: GameState, n: number, p: number): boolean {
  const pr = s.provinces[p];
  const owner = pr.owner;
  if (owner === -1 || owner === n || pr.occupier === n) return true;
  if (atWar(s, n, owner)) return true;
  return (
    treatyBetween(s, n, owner, "access") !== undefined ||
    treatyBetween(s, n, owner, "alliance") !== undefined
  );
}

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

/** Whether nations `a` and `b` share a border anywhere. */
export function nationsBorder(
  s: GameState,
  map: MapDef,
  a: number,
  b: number,
): boolean {
  for (let p = 0; p < s.provinces.length; p++) {
    if (s.provinces[p].owner !== b) continue;
    if (map.provinces[p].nb.some(([q]) => s.provinces[q].owner === a))
      return true;
  }
  return false;
}

export function monthOf(s: GameState): number {
  return dateOf(s.day).month;
}

export function yearOf(s: GameState): number {
  return dateOf(s.day).year;
}

// ---------------------------------------------------------------- characters

export function charName(c: Character | undefined): string {
  if (!c) return "nobody";
  if (c.title) return c.title;
  return `${c.first} ${c.family}`;
}

export function ageOf(s: GameState, c: Character): number {
  return Math.floor((s.day - c.born) / DAYS_PER_YEAR);
}

export function hasTrait(c: Character | undefined, t: TraitId): boolean {
  return c !== undefined && c.traits.includes(t);
}

/** A character's stat with everything that changes it. */
export function statOf(s: GameState, c: Character, stat: Stat): Breakdown {
  const e = new Explain().add("Natural ability", c.stats[stat], true);
  for (const t of c.traits) {
    const v = TRAITS[t].stats[stat] ?? 0;
    e.add(TRAITS[t].name, v);
  }
  const age = ageOf(s, c);
  if (age < ADULT_AGE) e.mul(`Young (${age})`, Math.max(0.2, age / ADULT_AGE));
  else if (age >= 70) e.add(`Old age (${age})`, stat === "mar" ? -3 : -2);
  else if (age >= 60) e.add(`Old age (${age})`, stat === "mar" ? -2 : -1);
  return e.done(0, 0, STAT_MAX + 6);
}

export function stat(s: GameState, c: Character | undefined, st: Stat): number {
  return c ? statOf(s, c, st).total : 0;
}

export function rulerOf(s: GameState, n: number): Character | undefined {
  return s.chars[s.nations[n].ruler];
}

export function seatHolder(
  s: GameState,
  n: number,
  seat: Seat,
): Character | undefined {
  const id = s.nations[n].council[seat];
  const c = id >= 0 ? s.chars[id] : undefined;
  return c?.alive ? c : undefined;
}

/** The council's skill at a seat (0 if it's empty). */
export function seatSkill(s: GameState, n: number, seat: Seat): number {
  return stat(s, seatHolder(s, n, seat), SEAT_STAT[seat]);
}

/** The ruler's stat plus half the matching councillor's. */
export function realmSkill(s: GameState, n: number, st: Stat): Breakdown {
  const ruler = rulerOf(s, n);
  const seat = (Object.keys(SEAT_STAT) as Seat[]).find(
    (k) => SEAT_STAT[k] === st,
  )!;
  const holder = seatHolder(s, n, seat);
  const e = new Explain();
  e.add(`${charName(ruler)} (ruler)`, stat(s, ruler, st), true);
  if (holder)
    e.add(`${charName(holder)} (${seat}) ×½`, stat(s, holder, st) / 2);
  const spouse = ruler && ruler.spouse >= 0 ? s.chars[ruler.spouse] : undefined;
  if (spouse?.alive && (st === "dip" || st === "ste"))
    e.add(`${charName(spouse)} (spouse) ×¼`, stat(s, spouse, st) / 4);
  return e.done(1);
}

/** How a character feels about their nation's ruler. */
export function opinionOfRuler(s: GameState, c: Character): Breakdown {
  const n = s.nations[c.nation];
  const ruler = s.chars[n.ruler];
  const e = new Explain();
  if (!ruler || ruler.id === c.id) return e.done(0);
  if (ruler.spouse === c.id) e.add("Married to them", 30);
  if (c.father === ruler.id || c.mother === ruler.id) e.add("Their child", 25);
  for (const t of c.traits) {
    if (ruler.traits.includes(t) && TRAITS[t].opposite)
      e.add(`Both ${TRAITS[t].name.toLowerCase()}`, 8);
    const opp = TRAITS[t].opposite;
    if (opp && ruler.traits.includes(opp))
      e.add(`${TRAITS[t].name} vs ${TRAITS[opp].name.toLowerCase()}`, -8);
  }
  const dip = stat(s, ruler, "dip");
  e.add(`Ruler's diplomacy (${dip})`, Math.round((dip - 5) * 1.5));
  if (hasTrait(ruler, "charming")) e.add("Charming ruler", 5);
  if (hasTrait(ruler, "generous")) e.add("Generous ruler", 10);
  if (hasTrait(ruler, "cruel")) e.add("Cruel ruler", -10);
  e.add(
    c.religion === ruler.religion ? "Same faith" : "Different faith",
    c.religion === ruler.religion ? 5 : -10,
  );
  if ((Object.values(n.council) as number[]).includes(c.id))
    e.add("Sits on the council", 10);
  if (c.ambition === "governorship") e.add("Wants the governorship", -15);
  if (hasTrait(ruler, "ambitious") && c.ambition === "governorship")
    e.add("Two ambitious people", -10);
  for (const m of c.memories) {
    if (m.of === -1 || m.of === ruler.id) e.add(m.why, m.value);
  }
  return e.done(0, -100, 100);
}

/** Yearly chance a character dies, as a share. */
export function deathRisk(s: GameState, w: World, c: Character): Breakdown {
  const age = ageOf(s, c);
  const e = new Explain().add(`Age ${age}`, deathRiskByAge(age), true);
  if (hasTrait(c, "sickly")) e.mul("Sickly", 2);
  if (hasTrait(c, "robust")) e.mul("Robust", 0.5);
  const n = s.nations[c.nation];
  if (n && n.capital >= 0 && w.tropical[n.capital])
    e.mul("Fevers where they live", 1.5);
  const lea = stat(s, seatHolder(s, c.nation, "chaplain"), "lea");
  if (lea > 8) e.mul(`Physician-chaplain (learning ${lea})`, 0.85);
  for (const m of n?.mods ?? []) {
    if (m.fx.disease) e.mul(m.label, 1 + m.fx.disease);
  }
  return e.done(3, 0, 1);
}

export function canHaveChildren(s: GameState, c: Character): boolean {
  if (!c.alive || c.spouse < 0) return false;
  const sp = s.chars[c.spouse];
  if (!sp?.alive) return false;
  const mother = c.female ? c : sp;
  const age = ageOf(s, mother);
  return age >= ADULT_AGE && age <= 42;
}

/** Yearly chance a couple has a child. */
export function birthChance(s: GameState, c: Character): Breakdown {
  const e = new Explain();
  if (!canHaveChildren(s, c)) return e.done();
  const sp = s.chars[c.spouse];
  const mother = c.female ? c : sp;
  e.add("Married couple", BIRTH_CHANCE_PER_YEAR, true);
  const age = ageOf(s, mother);
  if (age > 35) e.mul(`Mother is ${age}`, 0.5);
  if (c.children.length >= 4)
    e.mul(`${c.children.length} children already`, 0.6);
  if (hasTrait(c, "sickly") || hasTrait(sp, "sickly"))
    e.mul("Sickly parent", 0.7);
  return e.done(3, 0, 1);
}

/** Chance each month the spymaster uncovers a plot by this schemer. */
export function discoveryChance(s: GameState, schemer: Character): Breakdown {
  const n = schemer.nation;
  const spy = seatHolder(s, n, "spymaster");
  const ruler = rulerOf(s, n);
  const e = new Explain().add("Base", 0.08, true);
  if (spy)
    e.add(
      `Spymaster ${charName(spy)} (intrigue ${stat(s, spy, "int")})`,
      stat(s, spy, "int") * 0.025,
    );
  else e.add("No spymaster", -0.04);
  e.add(
    `Ruler's intrigue (${stat(s, ruler, "int")})`,
    stat(s, ruler, "int") * 0.01,
  );
  e.add(
    `Schemer's intrigue (${stat(s, schemer, "int")})`,
    -stat(s, schemer, "int") * 0.02,
  );
  return e.done(2, 0.02, 0.75);
}

/** How far a scheme gets each month (out of 100). */
export function schemeSpeed(s: GameState, schemer: Character): Breakdown {
  const spy = seatHolder(s, schemer.nation, "spymaster");
  const e = new Explain().add("Base", 3, true);
  e.add(
    `Schemer's intrigue (${stat(s, schemer, "int")})`,
    stat(s, schemer, "int") * 0.6,
  );
  if (spy) e.add(`Spymaster's counter-plots`, -stat(s, spy, "int") * 0.3);
  return e.done(1, 1, 20);
}

/** The heir: eldest living child of age, else eldest child, else -1. */
export function findHeir(s: GameState, ruler: Character): number {
  const kids = ruler.children
    .map((id) => s.chars[id])
    .filter((c) => c?.alive)
    .sort((a, b) => a.born - b.born);
  return kids.length > 0 ? kids[0].id : -1;
}

// ---------------------------------------------------------------- administration

export function provinceAdminCost(
  s: GameState,
  w: World,
  n: number,
  p: number,
): Breakdown {
  const nation = s.nations[n];
  const pr = s.provinces[p];
  const folk = settlers(pr);
  const small = nation.kind === "power" && folk < 1000;
  const e = new Explain().add(
    small ? `Governing it (${Math.round(folk)} settlers)` : "Governing it",
    nation.kind === "native" ? 0.6 : small ? 0.5 + 0.5 * (folk / 1000) : 1,
    true,
  );
  if (nation.capital >= 0 && nation.capital !== p) {
    const km = kmBetween(w.map, nation.capital, p);
    e.add(
      `${km} km from the capital`,
      Math.min(
        1.5,
        Math.round((km / (nation.kind === "native" ? 1200 : 1000)) * 10) / 10,
      ),
    );
  }
  const majority = majorityCulture(pr);
  if (majority !== null && majority !== nation.culture && settlers(pr) > 0)
    e.add("Foreign-speaking settlers", 0.5);
  if (pr.integrate > s.day) e.add("Still being integrated", 1);
  return e.done(1);
}

export function majorityCulture(pr: Province): string | null {
  const by = new Map<string, number>();
  for (const p of pr.pops) {
    if (p.cls === "tribe") continue;
    by.set(p.culture, (by.get(p.culture) ?? 0) + p.size);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [k, v] of by) {
    if (v > bestN) {
      best = k;
      bestN = v;
    }
  }
  return best;
}

export function adminCapacity(s: GameState, n: number): Breakdown {
  const nation = s.nations[n];
  const e = new Explain();
  if (nation.kind === "power") {
    e.add(
      nation.independent ? "Self-government" : "The crown's charter",
      (POWER_RULES[nation.key]?.admin ?? 6) + (nation.independent ? 3 : 0),
      true,
    );
    const folk = nationSettlers(s, n);
    if (folk >= 5000)
      e.add("Local officials (1 per 5,000 settlers)", Math.floor(folk / 5000));
  } else {
    e.add("Council of elders", nation.strong ? 6 : 4, true);
  }
  const ruler = rulerOf(s, n);
  const ste = stat(s, ruler, "ste");
  e.add(`${charName(ruler)}'s stewardship (${ste}) ×½`, ste / 2);
  const tr = seatHolder(s, n, "treasurer");
  if (tr) e.add(`${charName(tr)} (treasurer) ×¼`, stat(s, tr, "ste") / 4);
  let courts = 0;
  for (const pr of s.provinces)
    if (pr.owner === n) courts += pr.b.courthouse ?? 0;
  e.add(
    `${courts} courthouse${courts === 1 ? "" : "s"}`,
    courts * COURTHOUSE_ADMIN,
  );
  if (nation.title > 0) e.add("Royal honours", nation.title);
  for (const m of nation.mods) if (m.fx.admin) e.add(m.label, m.fx.admin);
  if (hasTrait(ruler, "diligent")) e.mul("Diligent", 1.15);
  if (hasTrait(ruler, "lazy")) e.mul("Lazy", 0.85);
  return e.done(1, 1);
}

export function adminUsed(s: GameState, w: World, n: number): Breakdown {
  let base = 0;
  let distance = 0;
  let foreign = 0;
  let integrating = 0;
  for (let p = 0; p < s.provinces.length; p++) {
    if (s.provinces[p].owner !== n) continue;
    for (const part of provinceAdminCost(s, w, n, p).parts) {
      if (part.label.startsWith("Governing it")) base += part.value;
      else if (part.label.endsWith("from the capital")) distance += part.value;
      else if (part.label === "Foreign-speaking settlers")
        foreign += part.value;
      else integrating += part.value;
    }
  }
  return new Explain()
    .add("Provinces", base, true)
    .add("Distance from the capital", distance)
    .add("Foreign-speaking settlers", foreign)
    .add("Newly won land", integrating)
    .done(1);
}

/** How far over its administration a realm is: 0 = fine, 0.5 = 50% over. */
export function overextension(s: GameState, w: World, n: number): number {
  const cap = adminCapacity(s, n).total;
  const used = adminUsed(s, w, n).total;
  return Math.max(0, used / cap - 1);
}

/** Share of taxes lost before they reach the treasury. */
export function corruption(s: GameState, w: World, n: number): Breakdown {
  const ruler = rulerOf(s, n);
  const e = new Explain();
  const over = overextension(s, w, n);
  e.add(`Overextended ${Math.round(over * 100)}%`, over * 0.4);
  const ste = stat(s, ruler, "ste");
  if (ste < 5) e.add(`Weak stewardship (${ste})`, (5 - ste) * 0.03);
  if (hasTrait(ruler, "just")) e.mul("Just ruler", 0.5);
  return e.done(2, 0, 0.6);
}

// ---------------------------------------------------------------- production

export function farmLevel(pr: Province): number {
  return pr.b.farm ?? 0;
}

/** Settlers a province can hold. */
export function capacityOf(s: GameState, w: World, p: number): Breakdown {
  const pr = s.provinces[p];
  const def = w.map.provinces[p];
  return new Explain()
    .add(
      `${def.terrain[0].toUpperCase()}${def.terrain.slice(1)}, ${Math.round(def.areaKm2 / 1000)}k km²`,
      w.capacity[p],
      true,
    )
    .mul(
      `Farms (level ${farmLevel(pr)})`,
      1 + farmLevel(pr) * FARM_CAPACITY_BONUS,
    )
    .done(0);
}

/** The share of normal output a province manages this month. */
export function workFactor(s: GameState, w: World, p: number): Breakdown {
  const pr = s.provinces[p];
  const e = new Explain(1);
  if (pr.devastation > 0)
    e.mul(
      `War damage ${Math.round(pr.devastation * 100)}%`,
      1 - pr.devastation,
    );
  if (pr.unrest > 50)
    e.mul(`Unrest ${Math.round(pr.unrest)}`, 1 - (pr.unrest - 50) / 100);
  if (pr.occupier >= 0) e.mul("Occupied by the enemy", 0.5);
  for (const m of [
    ...pr.mods,
    ...(pr.owner >= 0 ? s.nations[pr.owner].mods : []),
  ]) {
    if (m.fx.production) e.mul(m.label, 1 + m.fx.production);
  }
  return e.done(2, 0);
}

/** Grain (and fish) a province's laborers grow this month. */
export function foodOutput(s: GameState, w: World, p: number): Breakdown {
  const pr = s.provinces[p];
  const def = w.map.provinces[p];
  const colony = pr.owner >= 0 && s.nations[pr.owner].kind === "power";
  // In a colony, natives living there hunt and farm for themselves.
  const lab = classSize(pr, "laborers") + (colony ? 0 : classSize(pr, "tribe"));
  const e = new Explain().add(
    `${Math.round(lab)} people working the land`,
    (lab / 1000) * FOOD_YIELD[def.terrain],
    true,
  );
  if (def.coastal) e.add("Coastal fishing", (lab / 1000) * COASTAL_FISH);
  e.mul(`Farms (level ${farmLevel(pr)})`, 1 + farmLevel(pr) * FARM_FOOD_BONUS);
  const month = monthOf(s);
  if (isWinter(def.lat, month)) {
    const n = pr.owner >= 0 ? s.nations[pr.owner] : undefined;
    e.mul("Winter", n?.key === "sweden" ? 0.45 : 0.3);
  }
  for (const part of workFactor(s, w, p).parts) e.mul(part.label, part.value);
  return e.done(2, 0);
}

/** The province's resource, from its laborers. */
export function resourceOutput(s: GameState, w: World, p: number): Breakdown {
  const pr = s.provinces[p];
  const raw = w.raw[p];
  const lab = classSize(pr, "laborers");
  const e = new Explain().add(
    `${Math.round(lab)} laborers`,
    (lab / 1000) * RESOURCE_YIELD[raw],
    true,
  );
  const bk = RESOURCE_BUILDING[raw];
  const lvl = pr.b[bk] ?? 0;
  if (raw !== "grain")
    e.mul(
      `${BUILDING_NAMES[bk]} (level ${lvl})`,
      1 + lvl * RESOURCE_BUILDING_BONUS,
    );
  if (raw === "furs" && pr.depletion > 0)
    e.mul(`Trapped out ${Math.round(pr.depletion * 100)}%`, 1 - pr.depletion);
  if (pr.rich) e.mul(`Rich ${RICH_WORD[raw]}`, 1 + RICH_BONUS);
  for (const part of workFactor(s, w, p).parts) e.mul(part.label, part.value);
  return e.done(2, 0);
}

export const BUILDING_NAMES: Record<BuildingKind, string> = {
  farm: "Farms",
  plantation: "Plantations",
  tradingpost: "Trading post",
  mine: "Silver mine",
  lumbercamp: "Lumber camp",
  port: "Port",
  fort: "Fort",
  smithy: "Smithy",
  gunsmith: "Gunsmith",
  weaver: "Weavers",
  church: "Church",
  courthouse: "Courthouse",
};

// ---------------------------------------------------------------- markets

/** The price a good settles around in a colony before supply and demand. */
export function anchorPrice(s: GameState, n: number, g: Good): number {
  const nation = s.nations[n];
  const eu = europePrice(s, g).total;
  const ship =
    SHIPPING_PER_UNIT * (1 - (POWER_RULES[nation.key]?.shipping ?? 0));
  if (g === "tools" || g === "guns" || g === "cloth") return eu + ship;
  if (g === "grain" || g === "fish" || g === "timber") return eu;
  return Math.max(0.3, eu - ship);
}

export function europePrice(s: GameState, g: Good): Breakdown {
  const e = new Explain().add("Base price in Europe", EUROPE_PRICE[g], true);
  const glut = s.europe.glut[g] ?? 0;
  if (glut > 0)
    e.mul(
      `${Math.round(glut)} units landed this year`,
      1 / (1 + glut / EUROPE_DEPTH[g]),
    );
  return e.done(2);
}

/** Why a good costs what it does in a colony. */
export function priceWhy(s: GameState, n: number, g: Good): Breakdown {
  const m = s.nations[n].market;
  const e = new Explain().add(
    "Price at the docks (European price ± freight)",
    anchorPrice(s, n, g),
    true,
  );
  const supply = m.supply[g];
  const demand = m.demand[g];
  e.mul(
    `Supply ${Math.round(supply)} vs demand ${Math.round(demand)}`,
    priceFactor(supply, demand),
  );
  if (supply > demand && !s.nations[n].noExport.includes(g)) {
    const floor =
      (europePrice(s, g).total -
        SHIPPING_PER_UNIT *
          (1 - (POWER_RULES[s.nations[n].key]?.shipping ?? 0))) *
      0.85;
    if (floor > e.total)
      e.add("Merchants buying for Europe hold it up", floor - e.total);
  }
  return { total: m.price[g], parts: e.parts };
}

export function priceFactor(supply: number, demand: number): number {
  if (demand <= 0 && supply <= 0) return 1;
  const ratio = (demand + 1) / (supply + 1);
  return (
    Math.round(Math.max(0.35, Math.min(3, Math.pow(ratio, 0.6))) * 100) / 100
  );
}

/** Units a month the whole colony wants of each good. */
export function nationDemand(s: GameState, n: number): Record<Good, number> {
  const out = emptyGoods();
  for (const pr of s.provinces) {
    if (pr.owner !== n) continue;
    for (const pop of pr.pops) {
      if (pop.cls === "tribe" && s.nations[n].kind === "power") continue;
      for (const tier of NEEDS[pop.cls]) {
        for (const [g, per] of Object.entries(tier) as [Good, number][]) {
          out[g] += (pop.size / 1000) * per;
        }
      }
    }
  }
  return out;
}

export function emptyGoods(): Record<Good, number> {
  return {
    grain: 0,
    fish: 0,
    furs: 0,
    tobacco: 0,
    sugar: 0,
    timber: 0,
    silver: 0,
    tools: 0,
    guns: 0,
    cloth: 0,
  };
}

/** Days a convoy takes to cross from `port` to Europe or back. */
export function crossing(
  s: GameState,
  w: World,
  port: number,
  departDay: number,
): Breakdown {
  const def = w.map.provinces[port];
  const month = (departDay >= 0 ? dateOf(departDay) : dateOf(s.day)).month;
  const e = new Explain().add(
    "Atlantic crossing",
    baseCrossing(def.lat, def.lon),
    true,
  );
  if (month >= 10 || month <= 1) e.add("Winter storms", 18);
  return e.done(0);
}

function baseCrossing(lat: number, lon: number): number {
  if (lat < 0) return 55;
  if (lat < 25) return 50;
  if (lon < -85) return 70;
  return 58;
}

/** Taxes the treasury takes, as a share of incomes. */
export function taxShare(s: GameState, w: World, n: number): Breakdown {
  const nation = s.nations[n];
  const ruler = rulerOf(s, n);
  const e = new Explain().add(
    `${["Low", "Normal", "High"][nation.tax]} taxes`,
    TAX_RATE[nation.tax],
    true,
  );
  const ste = realmSkill(s, n, "ste").total;
  e.mul(`Stewardship ${Math.round(ste)}`, 1 + (ste - 5) * 0.02);
  if (hasTrait(ruler, "greedy")) e.mul("Greedy ruler", 1.1);
  if (hasTrait(ruler, "generous")) e.mul("Generous ruler", 0.95);
  const corr = corruption(s, w, n).total;
  if (corr > 0) e.mul(`Corruption ${Math.round(corr * 100)}%`, 1 - corr);
  for (const m of nation.mods) if (m.fx.tax) e.mul(m.label, 1 + m.fx.tax);
  return e.done(3, 0);
}

export { CUSTOMS };

// ---------------------------------------------------------------- unrest

export function unrestOf(s: GameState, w: World, p: number): Breakdown {
  const pr = s.provinces[p];
  const e = new Explain();
  if (pr.owner < 0) return e.done(0);
  const nation = s.nations[pr.owner];
  const ruler = rulerOf(s, pr.owner);
  const total = people(pr);
  if (total <= 0) return e.done(0);
  let unmet = [0, 0, 0];
  let weight = 0;
  let otherFaith = 0;
  let otherCulture = 0;
  let tribe = 0;
  for (const pop of pr.pops) {
    weight += pop.size;
    unmet = unmet.map(
      (u, i) =>
        u +
        (1 - pop.met[i]) *
          pop.size *
          (i === 2 && pop.cls !== "gentry" && pop.cls !== "merchants"
            ? 0.3
            : 1),
    );
    if (pop.religion !== nation.religion) otherFaith += pop.size;
    if (pop.cls === "tribe") tribe += pop.size;
    else if (pop.culture !== nation.culture) otherCulture += pop.size;
  }
  const names = ["Not enough food", "Short of cloth and tools", "No luxuries"];
  for (let i = 0; i < 3; i++)
    e.add(names[i], (unmet[i] / weight) * UNMET_UNREST[i]);
  if (nation.kind === "power") {
    e.add(
      `${["Low", "Normal", "High"][nation.tax]} taxes`,
      TAX_UNREST[nation.tax],
    );
    if (hasTrait(ruler, "greedy")) e.add("Greedy ruler", 5);
    if (hasTrait(ruler, "just")) e.add("Just ruler", -5);
    const faith = otherFaith / total;
    if (faith > 0 && !hasTrait(ruler, "tolerant")) {
      const church = pr.b.church ?? 0;
      e.add(
        `${Math.round(faith * 100)}% of another faith`,
        faith * 20 * (hasTrait(ruler, "zealous") ? 1.5 : 1) - church * 4,
      );
    }
    if (otherCulture > 0)
      e.add("Foreign settlers", (otherCulture / total) * 10);
    if (tribe > 0) e.add("Natives under colonial rule", (tribe / total) * 15);
    const over = overextension(s, w, pr.owner);
    if (over > 0) e.add(`Overextended ${Math.round(over * 100)}%`, over * 20);
    if (nation.warExhaustion > 0)
      e.add("War weariness", nation.warExhaustion / 4);
  }
  if (pr.occupier >= 0) e.add("Enemy occupation", 25);
  if (pr.integrate > s.day) e.add("New to the realm", 15);
  if (pr.devastation > 0.05) e.add("War damage", pr.devastation * 20);
  const garrison = s.armies
    .filter((a) => a.prov === p && a.owner === pr.owner && a.depart < 0)
    .reduce((m, a) => m + armyMen(a), 0);
  if (garrison > 0)
    e.add(`${garrison} soldiers keep order`, -Math.min(15, garrison / 100));
  for (const m of [...pr.mods, ...nation.mods])
    if (m.fx.unrest) e.add(m.label, m.fx.unrest);
  return e.done(0, 0, 100);
}

// ---------------------------------------------------------------- crown

export function expectedRemit(n: Nation): number {
  return POWER_RULES[n.key]?.expectedRemit ?? 0.1;
}

/** Where the crown's favor is heading, and why. */
export function favorTarget(s: GameState, w: World, n: number): Breakdown {
  const nation = s.nations[n];
  const ruler = rulerOf(s, n);
  const e = new Explain().add("The crown's starting trust", 50, true);
  if (nation.independent)
    return new Explain().add("Independent", 0, true).done(0);
  if (nation.rebelling)
    return new Explain().add("In open rebellion", 0, true).done(0);
  const expected = expectedRemit(nation);
  const diff = nation.remit - expected;
  e.add(
    `Sending ${Math.round(nation.remit * 100)}% of income home (expects ${Math.round(expected * 100)}%)`,
    Math.max(-30, Math.min(30, Math.round(diff * 150))),
  );
  if (hasTrait(ruler, "ambitious")) e.add("Ambitious governor", -5);
  if (hasTrait(ruler, "content")) e.add("Content governor", 5);
  if (hasTrait(ruler, "honest")) e.add("Honest governor", 5);
  if (hasTrait(ruler, "tolerant")) e.add("Tolerant governor", -3);
  if (nation.demand && nation.demand.due < s.day)
    e.add(`Ignored: ${nation.demand.label}`, -15);
  e.add("Colony's autonomy", -Math.round(nation.autonomy / 3));
  const over = overextension(s, w, n);
  if (over > 0.2) e.add("Colony slipping out of hand", -Math.round(over * 15));
  const gained = nation.stats.coloniesFounded + nation.stats.provincesConquered;
  if (gained > 0) e.add("New land for the crown", Math.min(15, gained * 2));
  for (const m of nation.mods) if (m.fx.favor) e.add(m.label, m.fx.favor);
  return e.done(0, 0, 100);
}

export function autonomyTarget(s: GameState, w: World, n: number): Breakdown {
  const nation = s.nations[n];
  if (nation.independent)
    return new Explain().add("Independent", 100, true).done(0);
  const e = new Explain();
  const people = nationSettlers(s, n);
  e.add(
    `${Math.round(people).toLocaleString("en-US")} settlers`,
    Math.min(20, people / 4000),
  );
  const years = yearOf(s) - 1607;
  e.add(`${years} years since 1607`, Math.min(20, years / 3));
  e.add("Wealth in the treasury", Math.min(10, Math.max(0, nation.gold) / 150));
  const expected = expectedRemit(nation);
  if (nation.remit < expected)
    e.add(
      "Keeping money at home",
      Math.min(15, (expected - nation.remit) * 100),
    );
  if (nation.favor < 50)
    e.add("Little love for the crown", (50 - nation.favor) / 5);
  if (nation.favor > 70) e.add("Loyal to the crown", -10);
  for (const m of nation.mods) if (m.fx.autonomy) e.add(m.label, m.fx.autonomy);
  return e.done(0, 0, 100);
}

export function independenceCheck(s: GameState, n: number): Check {
  const nation = s.nations[n];
  if (nation.kind !== "power")
    return no("Only colonies can declare independence.");
  if (nation.independent) return no("Already independent.");
  if (nation.rebelling) return no("The war for independence is already on.");
  if (nation.autonomy < INDEPENDENCE_AUTONOMY)
    return no(
      `Needs ${INDEPENDENCE_AUTONOMY} autonomy (now ${Math.round(nation.autonomy)}).`,
    );
  return yes;
}

/** Settlers sailing from home each month. */
export function emigration(s: GameState, n: number): Breakdown {
  const nation = s.nations[n];
  const rules = POWER_RULES[nation.key];
  const e = new Explain();
  if (!rules) return e.done(0);
  e.add(`Emigration from ${nation.name}`, rules.emigration, true);
  if (nation.independent) e.mul("Independent: fewer come", 0.4);
  else if (nation.rebelling) e.mul("At war with the crown", 0);
  else
    e.mul(`Crown favor ${Math.round(nation.favor)}`, 0.5 + nation.favor / 100);
  const pair = Object.keys(s.europe.wars).some((k) =>
    k.split("-").includes(String(n)),
  );
  if (pair) e.mul("War in Europe", 0.7);
  for (const m of nation.mods)
    if (m.fx.colonists) e.mul(m.label, 1 + m.fx.colonists);
  return e.done(0, 0);
}

// ---------------------------------------------------------------- relations

/** How nation `a` feels about nation `b`. */
export function relationOf(
  s: GameState,
  w: World,
  a: number,
  b: number,
): Breakdown {
  const A = s.nations[a];
  const B = s.nations[b];
  const e = new Explain();
  if (A.kind === "native" && B.kind === "power") {
    e.add(`${B.adjective} manners`, POWER_RULES[B.key]?.nativeOpinion ?? 0);
    const ruler = rulerOf(s, b);
    const dip = stat(s, ruler, "dip");
    e.add(`Governor's diplomacy (${dip})`, (dip - 5) * 2);
    const envoy = seatHolder(s, b, "envoy");
    if (envoy) e.add(`Envoy ${charName(envoy)}`, stat(s, envoy, "dip") / 2);
    const traitFx: Partial<Record<TraitId, number>> = {
      honest: 10,
      deceitful: -10,
      tolerant: 10,
      zealous: -10,
      generous: 10,
      cruel: -10,
      charming: 5,
    };
    for (const t of ruler?.traits ?? []) {
      if (traitFx[t]) e.add(`${TRAITS[t].name} governor`, traitFx[t]!);
    }
    let border = 0;
    for (let p = 0; p < s.provinces.length; p++) {
      if (s.provinces[p].owner !== b) continue;
      if (w.map.provinces[p].nb.some(([q]) => s.provinces[q].owner === a))
        border++;
    }
    if (border > 0)
      e.add(
        `Settlers on our borders (${border} provinces)`,
        -Math.min(40, border * 6),
      );
  } else if (A.kind === "power" && B.kind === "native") {
    e.add("Neighbors", 0, true);
  } else if (A.kind === "power" && B.kind === "power") {
    const t = s.europe.tension[pairKey(a, b)] ?? 0;
    e.add("Old rivalry", -10);
    if (t > 0)
      e.add(`Tension in Europe (${Math.round(t)})`, -Math.round(t / 4));
  } else {
    if (nationsBorder(s, w.map, a, b)) e.add("Neighbors", -5);
  }
  if (treatyBetween(s, a, b, "trade")) e.add("Trading partners", 10);
  if (treatyBetween(s, a, b, "alliance")) e.add("Allies", 25);
  if (atWar(s, a, b)) e.add("At war", -40);
  for (const m of A.relations[b] ?? []) e.add(m.why, m.value);
  return e.done(0, -100, 100);
}

export function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

// ---------------------------------------------------------------- armies

export function armyMen(a: Army): number {
  let men = 0;
  for (const r of a.regs) men += r.men;
  return men;
}

export function armyMorale(a: Army): number {
  const men = armyMen(a);
  if (men <= 0) return 0;
  let m = 0;
  for (const r of a.regs) m += r.morale * r.men;
  return m / men;
}

export function armiesOf(s: GameState, n: number): Army[] {
  return s.armies.filter((a) => a.owner === n);
}

export function armiesIn(s: GameState, p: number): Army[] {
  return s.armies.filter((a) => a.prov === p && a.depart < 0);
}

export function countRegs(a: Army[] | Army): Partial<Record<RegType, number>> {
  const out: Partial<Record<RegType, number>> = {};
  for (const army of Array.isArray(a) ? a : [a]) {
    for (const r of army.regs) out[r.type] = (out[r.type] ?? 0) + 1;
  }
  return out;
}

export function armySpeed(a: Army): number {
  let speed = Infinity;
  for (const r of a.regs) speed = Math.min(speed, REGIMENTS[r.type].speed);
  return speed === Infinity ? 1 : speed;
}

/** Men an army can feed off the land here, in thousands. */
export function supplyLimit(
  s: GameState,
  w: World,
  n: number,
  p: number,
): Breakdown {
  const pr = s.provinces[p];
  const def = w.map.provinces[p];
  const e = new Explain().add(
    `${def.terrain[0].toUpperCase()}${def.terrain.slice(1)}`,
    TERRAIN[def.terrain].supply,
    true,
  );
  const folk = people(pr);
  if (folk > 0) e.add(`${Math.round(folk)} people`, (folk / 1000) * 1.2);
  if (farmLevel(pr) > 0) e.add("Farms", farmLevel(pr) * 0.5);
  if (pr.owner === n) e.add("Our own land", 1);
  if (pr.outpost?.by === n) e.add("Our outpost's stores", OUTPOST.supply);
  if (isWinter(def.lat, monthOf(s))) e.mul("Winter", 0.5);
  if (
    pr.owner !== n &&
    pr.owner >= 0 &&
    !treatyBetween(s, n, pr.owner, "alliance")
  )
    e.mul("Foreign land", 0.7);
  if (pr.devastation > 0) e.mul("Stripped by war", 1 - pr.devastation * 0.6);
  return e.done(1, 0.3);
}

/** Share of an army's men lost a month to hardship, cold and fever. */
export function attritionOf(s: GameState, w: World, a: Army): Breakdown {
  const def = w.map.provinces[a.prov];
  const pr = s.provinces[a.prov];
  const month = monthOf(s);
  const e = new Explain();
  e.add(
    `${def.terrain[0].toUpperCase()}${def.terrain.slice(1)}`,
    TERRAIN[def.terrain].attrition / 1000,
  );
  if (isWinter(def.lat, month)) {
    const sweden = s.nations[a.owner].key === "sweden";
    const native = s.nations[a.owner].kind === "native";
    e.add(
      sweden
        ? "Winter (Swedes bear it)"
        : native
          ? "Winter (used to it)"
          : "Winter cold",
      sweden || native ? 0.015 : 0.03,
    );
  }
  if (w.tropical[a.prov] && isFeverSeason(def.lat, month)) {
    const native = s.nations[a.owner].kind === "native";
    const lea = realmSkill(s, a.owner, "lea").total;
    e.add(
      native
        ? "Fever season (resistant)"
        : `Fever season (learning ${Math.round(lea)})`,
      native ? 0.008 : Math.max(0.01, 0.045 - lea * 0.002),
    );
  }
  const limit = supplyLimit(s, w, a.owner, a.prov).total * 1000;
  const here = s.armies
    .filter((x) => x.prov === a.prov && x.owner === a.owner)
    .reduce((m, x) => m + armyMen(x), 0);
  if (here > limit)
    e.add(
      `${here} men, land feeds ${Math.round(limit)}`,
      Math.min(0.15, (here / limit - 1) * 0.06),
    );
  if (a.supply < 0.6)
    e.add(`Supplies ${Math.round(a.supply * 100)}%`, (0.6 - a.supply) * 0.12);
  if (pr.siege && pr.siege.by === a.owner) e.add("Siege camp sickness", 0.01);
  return e.done(3, 0);
}

/** Siege progress (out of 100) a day for nation `by` at province `p`. */
export function siegeSpeed(
  s: GameState,
  w: World,
  p: number,
  by: number,
): Breakdown {
  const pr = s.provinces[p];
  const fort = pr.b.fort ?? 0;
  const besiegers = armiesIn(s, p).filter((a) => a.owner === by);
  const men = besiegers.reduce((m, a) => m + armyMen(a), 0);
  const e = new Explain();
  if (fort === 0) {
    e.add("Taking control (no fort)", 100 / 20, true);
    if (men < 100) e.mul("Too few men", men / 100);
    return e.done(2, 0);
  }
  e.add("Siege works", 2.4, true);
  const garrison = fort * 300 + 200;
  e.mul(
    `${men} besiegers vs a ${garrison}-man garrison`,
    Math.round(Math.min(2.5, Math.sqrt(men / garrison)) * 100) / 100,
  );
  e.mul(`Fort level ${fort}`, 1 / (fort + 1));
  const guns = besiegers.reduce(
    (m, a) => m + a.regs.filter((r) => r.type === "artillery").length,
    0,
  );
  if (guns > 0) e.mul(`${guns} artillery`, 1 + Math.min(4, guns) * 0.5);
  const cmd = besiegers.map((a) => s.chars[a.commander]).find((c) => c?.alive);
  if (cmd)
    e.mul(
      `${charName(cmd)}'s martial (${stat(s, cmd, "mar")})`,
      1 + (stat(s, cmd, "mar") - 5) * 0.03,
    );
  if (pr.siege && s.day - pr.siege.start > 90)
    e.mul("Hunger inside the walls", 1.5);
  return e.done(2, 0);
}

// ---------------------------------------------------------------- war and peace

export function provinceValue(s: GameState, p: number): number {
  const pr = s.provinces[p];
  let v = 1 + settlers(pr) / 1000 + tribesfolk(pr) / 3000;
  for (const lvl of Object.values(pr.b)) v += (lvl ?? 0) * 0.5;
  if (pr.owner >= 0 && s.nations[pr.owner].capital === p) v += 3;
  return Math.round(v * 10) / 10;
}

export function nationValue(s: GameState, n: number): number {
  let v = 0;
  for (let p = 0; p < s.provinces.length; p++)
    if (s.provinces[p].owner === n) v += provinceValue(s, p);
  return v;
}

/** How the war is going for `side` (+100: total victory, −100: total defeat). */
export function warScore(s: GameState, war: War, side: number): Breakdown {
  const other = side === war.a ? war.b : war.a;
  const e = new Explain();
  let took = 0;
  let lost = 0;
  for (let p = 0; p < s.provinces.length; p++) {
    const pr = s.provinces[p];
    if (pr.owner === other && pr.occupier === side) took += provinceValue(s, p);
    if (pr.owner === side && pr.occupier === other) lost += provinceValue(s, p);
  }
  const otherValue = Math.max(1, nationValue(s, other));
  const sideValue = Math.max(1, nationValue(s, side));
  if (took > 0)
    e.add("Their land we hold", Math.min(70, (took / otherValue) * 80));
  if (lost > 0)
    e.add("Our land they hold", -Math.min(70, (lost / sideValue) * 80));
  const i = side === war.a ? 0 : 1;
  const battles = war.won[i] - war.won[1 - i];
  if (battles !== 0)
    e.add(
      `Battles (${war.won[i]} won, ${war.won[1 - i]} lost)`,
      Math.max(-25, Math.min(25, battles * 5)),
    );
  const ourLoss = war.lost[i];
  const theirLoss = war.lost[1 - i];
  if (ourLoss + theirLoss > 0)
    e.add(
      `Men lost (${ourLoss} ours, ${theirLoss} theirs)`,
      ((theirLoss - ourLoss) / (ourLoss + theirLoss)) * 15,
    );
  return e.done(0, -100, 100);
}

export function warMonths(s: GameState, war: War): number {
  return Math.floor((s.day - war.start) / 30);
}

/** Why the receiver of a peace offer would (≥ 0) or wouldn't take it. */
export function peaceWillingness(
  s: GameState,
  from: number,
  to: number,
  terms: PeaceTerms,
): Breakdown {
  const war = warBetween(s, from, to);
  const e = new Explain();
  if (!war) return e.add("Not at war", -100, true).done(0);
  const score = warScore(s, war, to).total;
  e.add(`The war for them (${score > 0 ? "+" : ""}${score})`, -score * 1.2);
  const nation = s.nations[to];
  if (nation.warExhaustion > 0)
    e.add("War weariness", nation.warExhaustion * 0.5);
  e.add(
    `${warMonths(s, war)} months of war`,
    Math.min(20, warMonths(s, war) * 0.5),
  );
  const value = Math.max(1, nationValue(s, to));
  const took = terms.take.reduce((m, p) => m + provinceValue(s, p), 0);
  const gave = terms.give.reduce((m, p) => m + provinceValue(s, p), 0);
  if (took > 0) e.add("Land they'd lose", -(took / value) * 100);
  if (gave > 0)
    e.add(
      "Land they'd get back",
      (gave / Math.max(1, nationValue(s, from))) * 60,
    );
  if (terms.gold > 0)
    e.add(
      `Paying ${terms.gold} gold`,
      -Math.min(40, (terms.gold / Math.max(50, nation.gold + 50)) * 25),
    );
  if (terms.gold < 0)
    e.add(`Getting ${-terms.gold} gold`, Math.min(30, (-terms.gold / 50) * 5));
  if (
    war.europe &&
    nation.kind === "power" &&
    s.europe.wars[pairKey(from, to)] !== undefined
  )
    e.add("Their crown is still at war in Europe", -25);
  return e.done(0);
}

export function peaceCheck(
  s: GameState,
  from: number,
  to: number,
  terms: PeaceTerms,
): Check {
  if (!atWar(s, from, to)) return no("You're not at war with them.");
  for (const p of terms.take) {
    const pr = s.provinces[p];
    if (!pr || pr.owner !== to || pr.occupier !== from)
      return no("You can only demand their land you hold.");
    if (s.nations[to].capital === p && provincesOf(s, to).length > 1)
      return no("They won't give up their capital while they have other land.");
  }
  for (const p of terms.give) {
    const pr = s.provinces[p];
    if (!pr || pr.owner !== from)
      return no("You can only give back your own land.");
  }
  if (terms.gold < 0 && s.nations[from].gold < -terms.gold)
    return no("You don't have that much gold.");
  if (terms.gold > 0 && s.nations[to].gold < terms.gold)
    return no(`They only have ${Math.floor(s.nations[to].gold)} gold.`);
  return yes;
}

export function warCheck(s: GameState, n: number, target: number): Check {
  if (n === target) return no("That's you.");
  const t = s.nations[target];
  if (!t?.alive) return no("They're gone.");
  if (t.kind === "crown")
    return no("To fight your own crown, declare independence.");
  if (atWar(s, n, target)) return no("Already at war.");
  if (truceUntil(s, n, target) > s.day) return no("A truce holds.");
  if (treatyBetween(s, n, target, "alliance"))
    return no("You're allies; break the alliance first.");
  return yes;
}

// ---------------------------------------------------------------- actions

export function colonizeCheck(
  s: GameState,
  w: World,
  n: number,
  p: number,
): Check & { source?: number; days?: number } {
  const nation = s.nations[n];
  const pr = s.provinces[p];
  if (nation.kind !== "power")
    return no("Only colonial powers found colonies.");
  if (pr.owner !== -1) return no("Someone already owns it.");
  if (pr.colony) return no("A colony is already being founded there.");
  if (nation.gold < COLONY_GOLD) return no(`Needs ${COLONY_GOLD} gold.`);
  const source = colonySource(s, w, n, p);
  if (source < 0)
    return no(
      `Needs a colony of ${COLONY_MIN_SOURCE}+ settlers next door, or a port within ${COLONIZE_SEA_KM} km by sea.`,
    );
  if (
    s.armies.some(
      (a) =>
        a.prov === p &&
        a.owner !== n &&
        s.nations[a.owner].kind !== "power" &&
        atWar(s, a.owner, n),
    )
  )
    return no("Hostile warriors are there.");
  const days = colonyDays(w, p, source);
  return {
    ok: true,
    source,
    // Your outpost's men have the ground cleared already.
    days: pr.outpost?.by === n ? Math.round(days * 0.6) : days,
  };
}

/** The province settlers would come from for a new colony at `p`. */
export function colonySource(
  s: GameState,
  w: World,
  n: number,
  p: number,
): number {
  let best = -1;
  let bestPop = 0;
  const def = w.map.provinces[p];
  for (const [q] of def.nb) {
    const pr = s.provinces[q];
    if (
      pr.owner === n &&
      pr.occupier < 0 &&
      settlers(pr) >= COLONY_MIN_SOURCE &&
      settlers(pr) > bestPop
    ) {
      best = q;
      bestPop = settlers(pr);
    }
  }
  if (best >= 0 || !def.coastal) return best;
  for (const [q, km] of def.sea) {
    if (km > COLONIZE_SEA_KM) break;
    const pr = s.provinces[q];
    if (
      pr.owner === n &&
      pr.occupier < 0 &&
      (pr.b.port ?? 0) > 0 &&
      settlers(pr) >= COLONY_MIN_SOURCE
    )
      return q;
  }
  return -1;
}

export function colonyDays(w: World, p: number, source: number): number {
  const def = w.map.provinces[p];
  const km = kmBetween(w.map, p, source);
  return 60 + TERRAIN[def.terrain].colonizeDays + Math.round(km / 40);
}

export { COLONY_SETTLERS };

export function buildCost(kind: BuildingKind, level: number) {
  const r = BUILDINGS[kind];
  const mult = 1 + level * 0.5;
  return {
    gold: Math.round(r.gold * mult),
    days: r.days,
    goods: Object.fromEntries(
      Object.entries(r.goods).map(([g, v]) => [g, Math.round((v ?? 0) * mult)]),
    ) as Partial<Record<Good, number>>,
  };
}

export function buildCheck(
  s: GameState,
  w: World,
  n: number,
  p: number,
  kind: BuildingKind,
): Check {
  const pr = s.provinces[p];
  const nation = s.nations[n];
  if (pr.owner !== n) return no("Not your province.");
  if (nation.kind !== "power") return no("Only colonies build.");
  if (pr.occupier >= 0) return no("The enemy holds it.");
  if (pr.build) return no("Something is already being built here.");
  const lvl = pr.b[kind] ?? 0;
  if (lvl >= BUILDINGS[kind].max) return no("Already at its highest level.");
  const raw = w.raw[p];
  if (kind === "port" && !w.map.provinces[p].coastal)
    return no("Needs a coast.");
  if (kind === "plantation" && raw !== "tobacco" && raw !== "sugar")
    return no("Only on tobacco or sugar land.");
  if (kind === "tradingpost" && raw !== "furs")
    return no("Only in fur country.");
  if (kind === "mine" && raw !== "silver")
    return no("Only where there's silver.");
  if (kind === "lumbercamp" && raw !== "timber")
    return no("Only in timber country.");
  if (settlers(pr) < 100) return no("Needs at least 100 settlers.");
  const cost = buildCost(kind, lvl);
  if (nation.gold < cost.gold) return no(`Needs ${cost.gold} gold.`);
  for (const [g, v] of Object.entries(cost.goods) as [Good, number][]) {
    if (nation.market.stock[g] < v)
      return no(
        `Needs ${v} ${g} in the warehouses (have ${Math.floor(nation.market.stock[g])}).`,
      );
  }
  return yes;
}

export function regimentTypes(nation: Nation): RegType[] {
  if (nation.kind === "native")
    return nation.horse ? ["warriors", "riders"] : ["warriors"];
  return ["militia", "regulars", "dragoons", "artillery"];
}

export function recruitCheck(
  s: GameState,
  n: number,
  p: number,
  t: RegType,
): Check {
  const pr = s.provinces[p];
  const nation = s.nations[n];
  const r = REGIMENTS[t];
  if (pr.owner !== n || pr.occupier >= 0) return no("Not a province you hold.");
  if (!regimentTypes(nation).includes(t)) return no("You can't raise those.");
  if (pr.recruits.length >= 2) return no("Already raising two regiments here.");
  if (nation.gold < r.gold) return no(`Needs ${r.gold} gold.`);
  if (r.natives) {
    const pool = tribesfolk(pr) * WARRIOR_SHARE - drafted(s, n, p);
    if (pool < r.men)
      return no(
        `Only ${Math.max(0, Math.floor(pool))} warriors left to call here.`,
      );
  } else {
    const lab = classSize(pr, "laborers");
    if (lab - r.men < 100)
      return no(`Needs ${r.men + 100} laborers here (has ${Math.floor(lab)}).`);
  }
  for (const [g, v] of Object.entries(r.goods) as [Good, number][]) {
    if (nation.market.stock[g] < v)
      return no(
        `Needs ${v} ${g} in the warehouses (have ${Math.floor(nation.market.stock[g])}).`,
      );
  }
  return yes;
}

/** Warriors from province `p` already under arms. */
export function drafted(s: GameState, n: number, p: number): number {
  let men = 0;
  for (const a of s.armies) {
    if (a.owner !== n) continue;
    for (const r of a.regs) if (r.home === p) men += r.men;
  }
  for (const r of s.provinces[p].recruits) men += REGIMENTS[r.type].men;
  return men;
}

export function treatyCheck(
  s: GameState,
  w: World,
  n: number,
  target: number,
  kind: TreatyKind,
): Check & { willing?: Breakdown } {
  if (n === target) return no("That's you.");
  const t = s.nations[target];
  if (!t?.alive) return no("They're gone.");
  if (atWar(s, n, target)) return no("You're at war.");
  if (treatyBetween(s, n, target, kind)) return no("You already have one.");
  if (kind === "trade" && s.nations[n].kind === t.kind)
    return no("Trade treaties are between colonies and native nations.");
  if (
    kind === "trade" &&
    !nationsBorder(s, w.map, n, target) &&
    !nationsBorder(s, w.map, target, n)
  )
    return no("You need to share a border to trade.");
  const willing = treatyWillingness(s, w, n, target, kind);
  if (willing.total < 0)
    return { ok: false, why: "They won't agree yet.", willing };
  return { ok: true, willing };
}

/** Why the other side would (≥ 0) sign a treaty. */
export function treatyWillingness(
  s: GameState,
  w: World,
  n: number,
  target: number,
  kind: TreatyKind,
): Breakdown {
  const opinion = relationOf(s, w, target, n).total;
  const e = new Explain().add(
    `What they think of you (${opinion})`,
    opinion,
    true,
  );
  e.add(
    kind === "trade"
      ? "Trade is good for both"
      : kind === "access"
        ? "Letting armies pass"
        : "Fighting each other's wars",
    kind === "trade" ? 10 : kind === "access" ? -10 : -30,
  );
  if (kind === "alliance") {
    const common = enemiesOf(s, n).filter((x) =>
      enemiesOf(s, target).includes(x),
    );
    if (common.length > 0) e.add("A common enemy", 30);
  }
  return e.done(0);
}

export function giftCheck(
  s: GameState,
  n: number,
  target: number,
  gold: number,
): Check {
  if (n === target) return no("That's you.");
  if (!s.nations[target]?.alive) return no("They're gone.");
  if (gold < 10) return no("A gift needs at least 10 gold.");
  if (s.nations[n].gold < gold) return no("You don't have that much.");
  return yes;
}

export function buyPrice(s: GameState, p: number): number {
  return Math.round(provinceValue(s, p) * 25 + 40);
}

export function buyCheck(
  s: GameState,
  w: World,
  n: number,
  p: number,
): Check & { price?: number } {
  const pr = s.provinces[p];
  const nation = s.nations[n];
  if (nation.kind !== "power") return no("Only colonies buy land.");
  if (pr.owner < 0 || s.nations[pr.owner].kind !== "native")
    return no("Only native land can be bought.");
  if (atWar(s, n, pr.owner)) return no("Not while you're at war with them.");
  if (s.nations[pr.owner].capital === p)
    return no("They won't sell their heartland.");
  if (provincesOf(s, pr.owner).length <= 1)
    return no("It's all the land they have left.");
  if (!bordersProvince(s, w.map, n, p))
    return no("It has to border your land.");
  const opinion = relationOf(s, w, pr.owner, n).total;
  if (opinion < 25)
    return no(`They'd need to like you more (opinion ${opinion}, needs 25).`);
  const price = buyPrice(s, p);
  if (nation.gold < price) return no(`Costs ${price} gold.`);
  return { ok: true, price };
}

export function marryCheck(
  s: GameState,
  n: number,
  a: number,
  b: number,
): Check {
  const A = s.chars[a];
  const B = s.chars[b];
  if (!A?.alive || !B?.alive) return no("Both must be alive.");
  if (A.spouse >= 0 || B.spouse >= 0)
    return no("One of them is already married.");
  if (A.female === B.female)
    return no("The church only marries a man and a woman in this century.");
  if (ageOf(s, A) < ADULT_AGE || ageOf(s, B) < ADULT_AGE)
    return no(`Both must be at least ${ADULT_AGE}.`);
  const ruler = s.chars[s.nations[n].ruler];
  const family = (c: Character) =>
    c.id === ruler?.id || c.father === ruler?.id || c.mother === ruler?.id;
  if (!family(A))
    return no("You can only arrange marriages for your own family.");
  if (B.nation !== n && s.nations[B.nation]?.kind === "power") {
    const opinion =
      s.nations[B.nation].relations[n]?.reduce((m, x) => m + x.value, 0) ?? 0;
    if (opinion < 10)
      return no(
        `${s.nations[B.nation].name} won't agree (they'd need to like you).`,
      );
  }
  if (A.father >= 0 && (A.father === B.father || A.mother === B.mother))
    return no("They're siblings.");
  return yes;
}

export function appointCheck(
  s: GameState,
  n: number,
  seat: Seat,
  c: number,
): Check {
  const ch = s.chars[c];
  const nation = s.nations[n];
  if (!ch?.alive || ch.nation !== n) return no("They're not at your court.");
  if (ch.id === nation.ruler) return no("You can't sit on your own council.");
  if (ageOf(s, ch) < ADULT_AGE) return no("Too young.");
  if ((Object.values(nation.council) as number[]).includes(c))
    return no("Already on the council.");
  if (ch.scheme?.exposed) return no("Caught plotting against you.");
  return yes;
}

export function allStats(s: GameState, c: Character): Record<Stat, number> {
  const out = {} as Record<Stat, number>;
  for (const st of STATS) out[st] = stat(s, c, st);
  return out;
}

// ---------------------------------------------------------------- scores

/** Victory points for a nation now. */
export function scoreOf(s: GameState, w: World, n: number): Breakdown {
  const nation = s.nations[n];
  const e = new Explain();
  const folk = nationSettlers(s, n);
  const provs = provincesOf(s, n).length;
  e.add(`${provs} provinces`, provs * 6);
  e.add(
    `${Math.round(folk).toLocaleString("en-US")} settlers`,
    Math.round(folk / 250),
  );
  if (nation.kind === "power") {
    e.add("Wealth", Math.round(Math.max(0, nation.gold) / 40));
    e.add("Sent home to the crown", Math.round(nation.stats.remitted / 30));
    if (nation.title > 0) e.add("Royal honours", nation.title * 25);
    if (nation.independent) e.add("Independence", 150);
    e.add("Battles won", nation.stats.battlesWon * 2);
  } else {
    e.add(
      `${Math.round(nationPeople(s, n)).toLocaleString("en-US")} people`,
      Math.round(nationPeople(s, n) / 600),
    );
  }
  return e.done(0, 0);
}

export function dayLabel(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

export function travelDays(km: number, speed: number, sea: boolean): number {
  return sea
    ? 3 + Math.ceil(km / SAIL_KM_PER_DAY)
    : Math.max(2, Math.ceil(km / (MARCH_KM_PER_DAY * speed)));
}

export const CUSTOMS_RATE = CUSTOMS;

/** What makes each kind of land rich. */
export const RICH_WORD: Record<RawGood, string> = {
  grain: "soil",
  fish: "fishing banks",
  furs: "beaver country",
  tobacco: "tobacco soil",
  sugar: "cane soil",
  timber: "stands of timber",
  silver: "silver seam",
};
