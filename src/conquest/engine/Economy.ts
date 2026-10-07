// Making, buying and shipping things. Each colony has one market: its
// provinces' laborers grow food and work the land's resource, artisans
// turn timber and grain into tools, guns and cloth, and everyone buys what
// they need at prices set by supply and demand. Merchants ship what's
// cheap at home to Europe and bring back what's dear, on convoys that take
// weeks to cross. The treasury lives on taxes and customs.

import { dateOf } from "./Calendar";
import type { ConquestGame } from "./Game";
import {
  anchorPrice,
  armyMen,
  buildCheck,
  buildCost,
  classSize,
  colonizeCheck,
  crossing,
  emptyGoods,
  europePrice,
  foodOutput,
  priceFactor,
  provincesOf,
  resourceOutput,
  settlers,
  taxShare,
  yearOf,
} from "./Queries";
import {
  ARMY_FOOD,
  BUILDINGS,
  COLONY_GOLD,
  COLONY_SETTLERS,
  CONVOY_EVERY_DAYS,
  CUSTOMS,
  iceBound,
  INCOME_SHARE,
  NEEDS,
  POWER_RULES,
  PRICE_SPEED,
  REGIMENTS,
  RESERVE_MONTHS,
  SHIPPING_PER_UNIT,
  SPOILAGE,
  WORKSHOPS,
} from "./Rules";
import { settlerPops } from "./Setup";
import {
  BuildingKind,
  Command,
  Convoy,
  Good,
  GOODS,
  LedgerLine,
  Nation,
  Pop,
  PopClass,
} from "./Types";

/** Money that moved during the month, for the ledger. */
const tallies = new WeakMap<ConquestGame, Map<number, Map<string, number>>>();

export function tally(
  g: ConquestGame,
  n: number,
  label: string,
  gold: number,
): void {
  let byNation = tallies.get(g);
  if (!byNation) tallies.set(g, (byNation = new Map()));
  let lines = byNation.get(n);
  if (!lines) byNation.set(n, (lines = new Map()));
  lines.set(label, (lines.get(label) ?? 0) + gold);
}

function takeTallies(g: ConquestGame, n: number): Map<string, number> {
  const byNation = tallies.get(g);
  const lines = byNation?.get(n) ?? new Map();
  byNation?.delete(n);
  return lines;
}

// ---------------------------------------------------------------- monthly

export function economyMonthly(g: ConquestGame): void {
  const s = g.s;
  for (const n of s.nations) {
    if (!n.alive) continue;
    if (n.kind === "power") powerEconomy(g, n.id);
    else if (n.kind === "native") nativeEconomy(g, n.id);
  }
  // Europe forgets last year's gluts.
  for (const good of GOODS) {
    if (s.europe.glut[good] > 0) {
      s.europe.glut[good] =
        Math.round(s.europe.glut[good] * (11 / 12) * 10) / 10;
      s.europe.price[good] = europePrice(s, good).total;
    }
  }
  g.europeChanged();
}

function powerEconomy(g: ConquestGame, n: number): void {
  const s = g.s;
  const w = g.w;
  const nation = g.nation(n);
  const m = nation.market;
  const provs = provincesOf(s, n);
  const made = emptyGoods();
  const workshopIn = emptyGoods();

  // Who earns what this month, by province and class.
  for (const p of provs) {
    const pr = g.prov(p);
    for (const pop of pr.pops) pop.income = 0;
    pr.made = {};
    if (pr.occupier >= 0) continue;
    const food = foodOutput(s, w, p).total;
    // Natives living in the province feed themselves off the land around.
    const tribeFolk = classSize(pr, "tribe");
    if (tribeFolk > 0) {
      const crowd = Math.min(
        1,
        w.capacity[p] / Math.max(1, settlers(pr) + tribeFolk),
      );
      const met = Math.round(Math.min(1, 0.6 + 0.5 * crowd) * 100) / 100;
      for (const pop of pr.pops) if (pop.cls === "tribe") pop.met = [met, 1, 1];
    }
    const marketFood = food;
    const coastal = w.map.provinces[p].coastal;
    const fish = coastal ? marketFood * 0.2 : 0;
    const res = resourceOutput(s, w, p).total;
    const here: Partial<Record<Good, number>> = {};
    const add = (good: Good, v: number) => {
      if (v <= 0) return;
      here[good] = (here[good] ?? 0) + v;
    };
    add("grain", marketFood - fish);
    add("fish", fish);
    add(w.raw[p], res);
    // Workshops.
    const artisans = classSize(pr, "artisans");
    let free = artisans;
    let workshopValue = 0;
    for (const kind of ["smithy", "gunsmith", "weaver"] as BuildingKind[]) {
      const lvl = pr.b[kind] ?? 0;
      const shop = WORKSHOPS[kind];
      if (!lvl || !shop || free <= 0) continue;
      const staff = Math.min(free, lvl * 1000);
      free -= staff;
      let out = (staff / 1000) * shop.per;
      // Short of inputs: make what the warehouses allow.
      for (const [good, per] of Object.entries(shop.inputs) as [
        Good,
        number,
      ][]) {
        const need = (out / shop.per) * per;
        const have =
          m.stock[good] + made[good] + (here[good] ?? 0) - workshopIn[good];
        if (need > have) out *= Math.max(0, have / need);
      }
      for (const [good, per] of Object.entries(shop.inputs) as [
        Good,
        number,
      ][]) {
        workshopIn[good] += (out / shop.per) * per;
        workshopValue -= (out / shop.per) * per * m.price[good];
      }
      add(shop.out, out);
      workshopValue += out * m.price[shop.out];
    }
    for (const [good, v] of Object.entries(here) as [Good, number][])
      made[good] += v;
    pr.made = Object.fromEntries(
      Object.entries(here).map(([k, v]) => [k, Math.round((v ?? 0) * 10) / 10]),
    );
    // Shares of the land's output; missing classes' shares go to laborers.
    let landValue = 0;
    for (const [good, v] of Object.entries(here) as [Good, number][]) {
      if (good === "tools" || good === "guns" || good === "cloth") continue;
      landValue += v * m.price[good];
    }
    // Artisans with no workshop to work in take odd jobs alongside laborers.
    const idle = Math.max(0, free);
    const workers = classSize(pr, "laborers") + idle;
    const shares: Partial<Record<PopClass, number>> = {};
    let leftover = 0;
    for (const [cls, share] of Object.entries(INCOME_SHARE) as [
      PopClass,
      number,
    ][]) {
      if (classSize(pr, cls) > 0 || (cls === "laborers" && workers > 0))
        shares[cls] = share;
      else leftover += share;
    }
    shares.laborers = (shares.laborers ?? 0) + leftover;
    const laborPay = landValue * (shares.laborers ?? 0);
    for (const pop of pr.pops) {
      if (pop.cls === "tribe") continue;
      const size = classSize(pr, pop.cls);
      if (size <= 0) continue;
      let income: number;
      if (pop.cls === "laborers")
        income = (laborPay * pop.size) / Math.max(1, workers);
      else if (pop.cls === "artisans") {
        const share = pop.size / Math.max(1, artisans);
        income =
          Math.max(0, workshopValue) * share +
          (laborPay * idle * share) / Math.max(1, workers);
      } else income = (landValue * (shares[pop.cls] ?? 0) * pop.size) / size;
      pop.income = income;
    }
  }

  // Charter supply ships in the early years.
  const rules = POWER_RULES[nation.key];
  const year = yearOf(s);
  if (rules && year < rules.charterUntil && !nation.independent)
    made.grain += 6;

  // Demand: people, workshops (already counted as inputs) and soldiers.
  const demand = emptyGoods();
  const pops: Pop[] = [];
  for (const p of provs) {
    const pr = s.provinces[p];
    if (pr.occupier >= 0) continue;
    for (const pop of pr.pops) {
      if (pop.cls === "tribe") continue;
      pops.push(pop);
      for (const tier of NEEDS[pop.cls]) {
        for (const [good, per] of Object.entries(tier) as [Good, number][])
          demand[good] += (pop.size / 1000) * per;
      }
    }
  }
  let soldiers = 0;
  for (const a of s.armies) if (a.owner === n) soldiers += armyMen(a);
  const armyFood = (soldiers / 1000) * ARMY_FOOD;
  demand.grain += armyFood;
  for (const good of GOODS) demand[good] += workshopIn[good];

  // Supply on hand; food can be grain or fish.
  const supply = emptyGoods();
  for (const good of GOODS) supply[good] = m.stock[good] + made[good];
  const foodSupply = supply.grain + supply.fish - workshopIn.grain;
  const foodDemand = demand.grain - workshopIn.grain;
  const fill = emptyGoods();
  for (const good of GOODS) {
    const avail = supply[good] - workshopIn[good];
    fill[good] =
      demand[good] - workshopIn[good] > 0
        ? Math.max(0, Math.min(1, avail / (demand[good] - workshopIn[good])))
        : 1;
  }
  const foodFill =
    foodDemand > 0 ? Math.max(0, Math.min(1, foodSupply / foodDemand)) : 1;
  fill.grain = foodFill;
  fill.fish = foodFill;
  // Soldiers eat first.
  const armyFed = armyFood > 0 ? foodFill : 1;

  // Each pop pays for what it can: food first, then everyday goods, then luxuries.
  const tax = taxShare(s, w, n).total;
  const consumed = emptyGoods();
  let taxes = 0;
  const foodPrice = (m.price.grain + m.price.fish) / 2;
  for (const pop of pops) {
    const afterTax = pop.income * (1 - tax);
    taxes += pop.income * tax;
    let budget = afterTax + pop.wealth * 0.25;
    let spent = 0;
    const met: [number, number, number] = [1, 1, 1];
    NEEDS[pop.cls].forEach((tier, i) => {
      let cost = 0;
      let wantTotal = 0;
      let fillSum = 0;
      for (const [good, per] of Object.entries(tier) as [Good, number][]) {
        const want = (pop.size / 1000) * per;
        const f = fill[good];
        cost += want * f * (good === "grain" ? foodPrice : m.price[good]);
        wantTotal += want;
        fillSum += want * f;
      }
      const avail = wantTotal > 0 ? fillSum / wantTotal : 1;
      const afford = cost > 0 ? Math.min(1, Math.max(0, budget) / cost) : 1;
      met[i] = Math.round(avail * afford * 100) / 100;
      const pay = cost * afford;
      budget -= pay;
      spent += pay;
      for (const [good, per] of Object.entries(tier) as [Good, number][]) {
        consumed[good] += (pop.size / 1000) * per * fill[good] * afford;
      }
    });
    pop.met = met;
    pop.wealth = Math.max(0, pop.wealth + afterTax - spent);
  }
  consumed.grain += armyFood * armyFed;

  // Warehouses: what's left over, less spoilage. Fish is eaten before grain.
  const foodEaten = consumed.grain;
  const fishEaten = Math.min(supply.fish, foodEaten);
  consumed.fish = fishEaten;
  consumed.grain = foodEaten - fishEaten;
  // Merchants buying surplus for Europe hold prices up to a little under
  // what it fetches there, less freight.
  const freight = shipping(nation);
  const exportFloor = emptyGoods();
  for (const good of GOODS) {
    if (nation.noExport.includes(good) || nation.rebelling) continue;
    const parity = europePrice(s, good).total - freight;
    if (parity < 0.4 || supply[good] <= demand[good]) continue;
    exportFloor[good] = parity * 0.85;
  }
  for (const good of GOODS) {
    let left = supply[good] - consumed[good] - workshopIn[good];
    if (good === "grain" || good === "fish") left *= 1 - SPOILAGE;
    m.stock[good] = Math.max(0, Math.round(left * 10) / 10);
    m.supply[good] = Math.round(supply[good] * 10) / 10;
    m.demand[good] = Math.round(demand[good] * 10) / 10;
    const target = Math.max(
      exportFloor[good],
      anchorPrice(s, n, good) *
        priceFactor(
          supply[good] - workshopIn[good],
          demand[good] - workshopIn[good],
        ),
    );
    m.price[good] =
      Math.round(
        (m.price[good] + (target - m.price[good]) * PRICE_SPEED) * 100,
      ) / 100;
  }

  // The treasury.
  const lines = takeTallies(g, n);
  const income: LedgerLine[] = [];
  const spending: LedgerLine[] = [];
  income.push({
    label: `Taxes (${Math.round(tax * 100)}% of incomes)`,
    value: taxes,
  });
  for (const [label, v] of lines) if (v > 0) income.push({ label, value: v });
  if (rules && year < rules.charterUntil && !nation.independent)
    income.push({
      label: `The charter (until ${rules.charterUntil})`,
      value: rules.charterGold,
    });
  for (const mod of nation.mods) {
    if (mod.key === "crown-grant" && mod.until > s.day)
      income.push({ label: mod.label, value: 15 });
  }
  const gross = income.reduce((a, l) => a + l.value, 0);
  if (!nation.independent && !nation.rebelling && nation.remit > 0)
    spending.push({
      label: `Sent to the crown (${Math.round(nation.remit * 100)}%)`,
      value: gross * nation.remit,
    });
  let upkeep = 0;
  for (const a of s.armies) {
    if (a.owner !== n) continue;
    for (const r of a.regs)
      upkeep += REGIMENTS[r.type].upkeep * (r.men / REGIMENTS[r.type].men);
  }
  if (upkeep > 0) spending.push({ label: "Soldiers' pay", value: upkeep });
  let buildingUpkeep = 0;
  for (const p of provs) {
    for (const [k, lvl] of Object.entries(s.provinces[p].b) as [
      BuildingKind,
      number,
    ][]) {
      buildingUpkeep += BUILDINGS[k].upkeep * lvl;
    }
  }
  if (buildingUpkeep > 0)
    spending.push({ label: "Keeping up buildings", value: buildingUpkeep });
  const seats = Object.values(nation.council).filter((c) => c >= 0).length;
  if (seats > 0)
    spending.push({ label: `Council salaries (${seats})`, value: seats * 0.8 });
  spending.push({
    label: `Officials in ${provs.length} provinces`,
    value: provs.length * 0.25,
  });
  for (const [label, v] of lines)
    if (v < 0) spending.push({ label, value: -v });
  const round = (l: LedgerLine) => ({
    label: l.label,
    value: Math.round(l.value * 10) / 10,
  });
  const totalIn = income.reduce((a, l) => a + l.value, 0);
  const totalOut = spending.reduce((a, l) => a + l.value, 0);
  const net = totalIn - totalOut;
  nation.ledger = {
    income: income.map(round),
    spending: spending.map(round),
    net: Math.round(net * 10) / 10,
  };
  nation.gold = Math.round((nation.gold + net) * 10) / 10;
  nation.stats.goldEarned += Math.max(0, totalIn);
  const remitted = spending.find((l) =>
    l.label.startsWith("Sent to the crown"),
  );
  if (remitted) nation.stats.remitted += remitted.value;
}

function nativeEconomy(g: ConquestGame, n: number): void {
  const s = g.s;
  const w = g.w;
  const nation = g.nation(n);
  const m = nation.market;
  const provs = provincesOf(s, n);
  let folk = 0;
  for (const p of provs) {
    const pr = g.prov(p);
    const food = foodOutput(s, w, p).total * (m.stock.tools > 0 ? 1.1 : 1);
    const people = classSize(pr, "tribe");
    folk += people;
    const need = (people / 1000) * 10;
    const met = need > 0 ? Math.min(1, food / need) : 1;
    // A surplus from the land to trade: furs above all.
    const raw = w.raw[p];
    const surplus = resourceOutput(s, w, p).total;
    const traded =
      raw === "furs"
        ? surplus * 0.8
        : raw === "grain" || raw === "fish"
          ? 0
          : surplus * 0.25;
    m.stock[raw] = Math.round((m.stock[raw] + traded) * 10) / 10;
    pr.made = { [raw]: Math.round(traded * 10) / 10 };
    for (const pop of pr.pops)
      if (pop.cls === "tribe")
        pop.met = [Math.round(met * 100) / 100, pop.met[1], pop.met[2]];
  }
  // Tools and cloth wear out; guns last longer.
  const everyday = (folk / 1000) * 0.4;
  m.stock.tools = Math.max(
    0,
    Math.round((m.stock.tools - everyday * 0.5) * 10) / 10,
  );
  m.stock.cloth = Math.max(
    0,
    Math.round((m.stock.cloth - everyday * 0.5) * 10) / 10,
  );
  m.stock.guns = Math.max(0, Math.round(m.stock.guns * 0.98 * 10) / 10);
  const everydayMet =
    everyday > 0
      ? Math.min(1, (m.stock.tools + m.stock.cloth) / (everyday * 2))
      : 1;
  for (const p of provs) {
    for (const pop of g.prov(p).pops)
      if (pop.cls === "tribe")
        pop.met = [pop.met[0], Math.round(everydayMet * 100) / 100, 1];
  }

  // Trade with colonies they have treaties with.
  for (const t of s.treaties) {
    if (t.kind !== "trade" || (t.a !== n && t.b !== n)) continue;
    const power = t.a === n ? t.b : t.a;
    if (s.nations[power]?.kind !== "power") continue;
    tradeWithNatives(g, power, n);
  }
}

/** A month of trade between a colony and a native nation. */
function tradeWithNatives(
  g: ConquestGame,
  power: number,
  native: number,
): void {
  const P = g.nation(power);
  const N = g.nation(native);
  let sold = 0;
  for (const good of [
    "furs",
    "tobacco",
    "sugar",
    "silver",
    "timber",
  ] as Good[]) {
    const qty = N.market.stock[good];
    if (qty < 0.5) continue;
    const value = qty * P.market.price[good];
    P.market.stock[good] = Math.round((P.market.stock[good] + qty) * 10) / 10;
    N.market.stock[good] = 0;
    N.gold = Math.round((N.gold + value * 0.6) * 10) / 10;
    sold += value;
  }
  // Natives buy tools, cloth and guns.
  let bought = 0;
  const folk = provincesOf(g.s, native).reduce(
    (m, p) => m + classSize(g.s.provinces[p], "tribe"),
    0,
  );
  for (const good of ["tools", "cloth", "guns"] as Good[]) {
    const want =
      (folk / 1000) * (good === "guns" ? 0.4 : 1.2) - N.market.stock[good];
    if (want <= 0) continue;
    const price = P.market.price[good] * 1.2;
    const afford = Math.max(0, (N.gold * 0.4) / price);
    const qty = Math.min(
      want,
      afford,
      Math.max(0, P.market.stock[good] - P.market.demand[good]),
    );
    if (qty < 0.5) continue;
    P.market.stock[good] = Math.round((P.market.stock[good] - qty) * 10) / 10;
    N.market.stock[good] = Math.round((N.market.stock[good] + qty) * 10) / 10;
    N.gold = Math.round((N.gold - qty * price) * 10) / 10;
    bought += qty * price;
  }
  const profit = sold * 0.4 + bought * 0.2;
  if (profit > 0) {
    payClass(g, power, "merchants", profit * 0.7);
    tally(g, power, `Trade with the ${N.name}`, profit * 0.3);
  }
}

/** Add (or take) gold to every pop of a class in a nation, by size. */
export function payClass(
  g: ConquestGame,
  n: number,
  cls: PopClass,
  gold: number,
): void {
  const s = g.s;
  let total = 0;
  for (const p of provincesOf(s, n)) total += classSize(s.provinces[p], cls);
  if (total <= 0) return;
  for (const p of provincesOf(s, n)) {
    const pr = s.provinces[p];
    if (classSize(pr, cls) <= 0) continue;
    g.prov(p);
    for (const pop of pr.pops) {
      if (pop.cls === cls)
        pop.wealth = Math.max(0, pop.wealth + (gold * pop.size) / total);
    }
  }
}

function classWealth(g: ConquestGame, n: number, cls: PopClass): number {
  let total = 0;
  for (const p of provincesOf(g.s, n)) {
    for (const pop of g.s.provinces[p].pops)
      if (pop.cls === cls) total += pop.wealth;
  }
  return total;
}

// ---------------------------------------------------------------- shipping

/** The colony's main harbour: the capital if it has a port, else the best one. */
export function mainPort(g: ConquestGame, n: number): number {
  const s = g.s;
  const nation = s.nations[n];
  const ok = (p: number) => {
    const pr = s.provinces[p];
    return (
      pr.owner === n &&
      pr.occupier < 0 &&
      (pr.b.port ?? 0) > 0 &&
      g.map.provinces[p].coastal
    );
  };
  if (nation.capital >= 0 && ok(nation.capital)) return nation.capital;
  let best = -1;
  let bestLvl = 0;
  for (const p of provincesOf(s, n)) {
    if (!ok(p)) continue;
    const lvl = (s.provinces[p].b.port ?? 0) * 10000 + settlers(s.provinces[p]);
    if (lvl > bestLvl) {
      best = p;
      bestLvl = lvl;
    }
  }
  return best;
}

/** Units a convoy can carry each way. */
export function convoyCapacity(g: ConquestGame, n: number): number {
  const s = g.s;
  let ports = 0;
  let merchants = 0;
  for (const p of provincesOf(s, n)) {
    ports += s.provinces[p].b.port ?? 0;
    merchants += classSize(s.provinces[p], "merchants");
  }
  return Math.round(60 + ports * 50 + merchants / 25);
}

export function convoysDaily(g: ConquestGame): void {
  const s = g.s;
  for (const nation of s.nations) {
    if (nation.kind !== "power" || !nation.alive) continue;
    for (const c of [...nation.convoys]) {
      if (c.arrive > s.day) continue;
      if (c.out) sellInEurope(g, nation.id, c);
      else landCargo(g, nation.id, c);
    }
    if (
      !nation.rebelling &&
      !nation.convoys.some((c) => c.out) &&
      s.day - nation.lastConvoy >= CONVOY_EVERY_DAYS
    ) {
      sailForEurope(g, nation.id);
    }
  }
}

function shipping(nation: Nation): number {
  return SHIPPING_PER_UNIT * (1 - (POWER_RULES[nation.key]?.shipping ?? 0));
}

function sailForEurope(g: ConquestGame, n: number): void {
  const s = g.s;
  const port = mainPort(g, n);
  if (port < 0) return;
  const def = g.map.provinces[port];
  if (iceBound(def.lat, def.lon, dateOf(s.day).month)) return;
  const nation = g.nation(n);
  const m = nation.market;
  const cap = convoyCapacity(g, n);
  const freight = shipping(nation);
  // Exports, most profitable first.
  const options = GOODS.filter((good) => !nation.noExport.includes(good))
    .map((good) => {
      const reserve = m.demand[good] * RESERVE_MONTHS;
      const spare = Math.max(0, m.stock[good] - reserve);
      const margin = europePrice(s, good).total - freight - m.price[good];
      return { good, spare, margin };
    })
    .filter((o) => o.spare >= 1 && o.margin > 0.15)
    .sort((a, b) => b.margin - a.margin);
  const cargo: Partial<Record<Good, number>> = {};
  let room = cap;
  let paid = 0;
  for (const o of options) {
    if (room <= 0) break;
    const qty = Math.floor(Math.min(o.spare, room));
    if (qty <= 0) continue;
    cargo[o.good] = qty;
    m.stock[o.good] = Math.round((m.stock[o.good] - qty) * 10) / 10;
    paid += qty * m.price[o.good];
    room -= qty;
  }
  // Imports to order: what's short, or dearer here than in Europe.
  const orders: Partial<Record<Good, number>> = {};
  let orderRoom = cap;
  const wants = GOODS.filter((good) => !nation.noImport.includes(good))
    .map((good) => {
      const cost = europePrice(s, good).total + freight;
      const short = Math.max(
        0,
        m.demand[good] * 3 -
          m.stock[good] -
          Math.max(0, m.supply[good] - m.stock[good]) * 2,
      );
      const margin = m.price[good] - cost;
      return { good, short, margin };
    })
    .filter((o) => o.short > 1 && o.margin > -0.2)
    .sort((a, b) => b.margin - a.margin);
  for (const o of wants) {
    if (orderRoom <= 0) break;
    const qty = Math.floor(Math.min(o.short, orderRoom));
    if (qty <= 0) continue;
    orders[o.good] = qty;
    orderRoom -= qty;
  }
  if (Object.keys(cargo).length === 0 && Object.keys(orders).length === 0)
    return;
  // Merchants pay for the cargo; the treasury takes its customs.
  payClass(g, n, "merchants", -paid);
  const duty = paid * CUSTOMS;
  if (duty > 0) tally(g, n, "Customs on exports", duty);
  const days = crossing(s, g.w, port, s.day).total;
  const convoy: Convoy = {
    id: g.nextId(),
    port,
    out: true,
    departed: s.day,
    arrive: s.day + days,
    cargo,
    paid,
    orders,
  };
  nation.convoys.push(convoy);
  nation.lastConvoy = s.day;
}

function sellInEurope(g: ConquestGame, n: number, c: Convoy): void {
  const s = g.s;
  const nation = g.nation(n);
  const freight = shipping(nation);
  let proceeds = 0;
  for (const [good, qty] of Object.entries(c.cargo) as [Good, number][]) {
    const price = europePrice(s, good).total;
    proceeds += qty * (price - freight);
    s.europe.glut[good] += qty;
    s.europe.price[good] = europePrice(s, good).total;
  }
  g.europeChanged();
  const profit = proceeds - c.paid;
  payClass(g, n, "merchants", proceeds);
  // Buy the orders with what the merchants have.
  const budget = classWealth(g, n, "merchants") * 0.8;
  let cost = 0;
  for (const [good, qty] of Object.entries(c.orders) as [Good, number][])
    cost += qty * europePrice(s, good).total;
  const scale = cost > budget && cost > 0 ? Math.max(0, budget / cost) : 1;
  const cargo: Partial<Record<Good, number>> = {};
  let paid = 0;
  for (const [good, qty] of Object.entries(c.orders) as [Good, number][]) {
    const q = Math.floor(qty * scale);
    if (q <= 0) continue;
    cargo[good] = q;
    paid += q * europePrice(s, good).total;
  }
  payClass(g, n, "merchants", -paid);
  nation.convoys = nation.convoys.filter((x) => x.id !== c.id);
  g.event({ k: "convoy", day: s.day, n, out: true, gold: Math.round(profit) });
  if (Object.keys(cargo).length > 0) {
    const days = crossing(s, g.w, c.port, s.day).total;
    nation.convoys.push({
      id: g.nextId(),
      port: c.port,
      out: false,
      departed: s.day,
      arrive: s.day + days,
      cargo,
      paid,
      orders: {},
    });
  }
}

function landCargo(g: ConquestGame, n: number, c: Convoy): void {
  const s = g.s;
  const nation = g.nation(n);
  nation.convoys = nation.convoys.filter((x) => x.id !== c.id);
  const pr = s.provinces[c.port];
  if (pr.owner !== n || pr.occupier >= 0) {
    g.event({
      k: "story",
      day: s.day,
      n,
      title: "Convoy turned away",
      text: "Our harbour was in enemy hands; the ships sold their cargo elsewhere at a loss.",
    });
    return;
  }
  let value = 0;
  for (const [good, qty] of Object.entries(c.cargo) as [Good, number][]) {
    nation.market.stock[good] =
      Math.round((nation.market.stock[good] + qty) * 10) / 10;
    value += qty * nation.market.price[good];
  }
  payClass(g, n, "merchants", value);
  tally(g, n, "Customs on imports", value * CUSTOMS);
  g.event({
    k: "convoy",
    day: s.day,
    n,
    out: false,
    gold: Math.round(value - c.paid),
  });
}

// ---------------------------------------------------------------- building

export function worksDaily(g: ConquestGame): void {
  const s = g.s;
  for (let p = 0; p < s.provinces.length; p++) {
    const pr = s.provinces[p];
    if (pr.build && pr.build.done <= s.day) {
      const b = g.prov(p).build!;
      if (pr.owner >= 0 && pr.occupier < 0) {
        pr.b[b.kind] = (pr.b[b.kind] ?? 0) + 1;
        g.event({
          k: "built",
          day: s.day,
          n: pr.owner,
          p,
          b: b.kind,
          lvl: pr.b[b.kind]!,
        });
      }
      pr.build = null;
    }
    if (pr.colony && pr.colony.done <= s.day) foundColony(g, p);
  }
}

function foundColony(g: ConquestGame, p: number): void {
  const s = g.s;
  const pr = g.prov(p);
  const by = pr.colony!.by;
  pr.colony = null;
  const nation = s.nations[by];
  if (!nation?.alive || pr.owner !== -1) {
    g.event({
      k: "story",
      day: s.day,
      n: by,
      title: "Colony lost",
      text: `The settlers bound for ${g.map.provinces[p].name} never made it.`,
    });
    return;
  }
  pr.owner = by;
  pr.integrate = 0;
  pr.pops.push(
    ...settlerPops(nation.culture, nation.religion, COLONY_SETTLERS),
  );
  merge(pr.pops);
  const n = g.nation(by);
  n.stats.coloniesFounded++;
  g.event({ k: "colony", day: s.day, n: by, p });
  // Natives nearby notice.
  const seen = new Set<number>();
  for (const [q] of g.map.provinces[p].nb) {
    const owner = s.provinces[q].owner;
    if (owner >= 0 && s.nations[owner].kind === "native" && !seen.has(owner)) {
      seen.add(owner);
      const native = g.nation(owner);
      (native.relations[by] ??= []).push({
        of: -1,
        why: `Settlers took ${g.map.provinces[p].name}`,
        value: -12,
        until: s.day + 365 * 15,
      });
    }
  }
}

/** Fold pops of the same class, culture and faith together. */
export function merge(pops: Pop[]): void {
  for (let i = 0; i < pops.length; i++) {
    for (let j = pops.length - 1; j > i; j--) {
      const a = pops[i];
      const b = pops[j];
      if (
        a.cls === b.cls &&
        a.culture === b.culture &&
        a.religion === b.religion
      ) {
        const total = a.size + b.size;
        a.met = a.met.map((x, k) =>
          total > 0 ? (x * a.size + b.met[k] * b.size) / total : x,
        ) as Pop["met"];
        a.size = total;
        a.wealth += b.wealth;
        a.income += b.income;
        pops.splice(j, 1);
      }
    }
  }
}

/** Take `count` settlers out of a province, laborers first. */
export function takeSettlers(g: ConquestGame, p: number, count: number): void {
  const pr = g.prov(p);
  const total = settlers(pr);
  if (total <= 0) return;
  const share = Math.min(1, count / total);
  for (const pop of pr.pops) {
    if (pop.cls === "tribe") continue;
    const take = Math.round(pop.size * share);
    pop.wealth = pop.wealth * (1 - take / Math.max(1, pop.size));
    pop.size -= take;
  }
  pr.pops = pr.pops.filter((x) => x.size > 0);
}

export function economyCommand(
  g: ConquestGame,
  n: number,
  c: Command,
): string | null {
  const s = g.s;
  switch (c.k) {
    case "colonize": {
      const check = colonizeCheck(s, g.w, n, c.p);
      if (!check.ok) return check.why;
      const nation = g.nation(n);
      nation.gold -= COLONY_GOLD;
      takeSettlers(g, check.source!, COLONY_SETTLERS);
      g.prov(c.p).colony = { by: n, start: s.day, done: s.day + check.days! };
      return null;
    }
    case "build": {
      const check = buildCheck(s, g.w, n, c.p, c.b);
      if (!check.ok) return check.why;
      const pr = g.prov(c.p);
      const cost = buildCost(c.b, pr.b[c.b] ?? 0);
      const nation = g.nation(n);
      nation.gold -= cost.gold;
      for (const [good, v] of Object.entries(cost.goods) as [Good, number][])
        nation.market.stock[good] -= v;
      pr.build = { kind: c.b, start: s.day, done: s.day + cost.days };
      return null;
    }
    case "tax": {
      if (![0, 1, 2].includes(c.level)) return "No such tax level.";
      if (s.nations[n].kind !== "power") return "Only colonies set taxes.";
      g.nation(n).tax = c.level;
      return null;
    }
    case "ban": {
      if (!GOODS.includes(c.good)) return "No such good.";
      const nation = g.nation(n);
      const list = c.export ? nation.noExport : nation.noImport;
      const has = list.includes(c.good);
      if (c.on && !has) list.push(c.good);
      if (!c.on && has) list.splice(list.indexOf(c.good), 1);
      return null;
    }
    default:
      return "Unknown command.";
  }
}
