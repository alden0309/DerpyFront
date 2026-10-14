// LABOUR2 (r21): a house in the intercolonial trade in people. Set it up
// with a route between two ports of your crown where people were sold, how
// many a voyage, how they're kept on the passage and whether families are
// sold together; its factor buys at the one port (named people, from a ship
// lately come or an estate's sale), a chartered sloop carries them, and they
// are sold at the other, where the colony's duty is paid on each. Deaths on
// the passage, a rising aboard, a privateer in wartime, a cargo turned away
// by a colony's ban; the sale, and who it parts from whom; what it all came
// to. Every voyage keeps its manifest: the names, and what became of each.
//
// The model and its odds are in TradeCore.ts, the law in TradeLaw.ts; the
// scenes (a family's plea at the sale, a rising, the period's voices) in
// Labour2Events.ts. Every roll is on the house's own dice, so the world's
// luck doesn't move; a game with no house rolls nothing new.

import { bdice, hashOf, seatSalt } from "./BondCore";
import { colonyOf, holdingLawful, lawOf } from "./BondLaw";
import { bondageFor } from "./Bondage";
import { formatDate } from "./Calendar";
import { makeCharacter } from "./Characters";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { affairNews } from "./Ledger";
import { withFlow } from "./LedgerCore";
import {
  addStress,
  earn,
  journal,
  milestone,
  spend,
  touchLife,
} from "./LifeCore";
import { isChildLife, lifeIsNative, meOf, no, yes, type Check } from "./LifeQueries";
import type { World } from "./Map";
import { Rng } from "./Rng";
import { DAYS_PER_YEAR } from "./Rules";
import {
  buyerAt,
  EVERY,
  GLUT_EASE,
  HOUSE_SETUP,
  manifestCost,
  manifestFor,
  netOf,
  passageCost,
  passageDays,
  passageModel,
  rollPassage,
  routeCheck,
  saleModel,
  SELL_CUT,
  SELL_DAYS,
  SIZES,
  TOGETHER_DAYS,
  tradeName,
  voiceFor,
  voyageOutlook,
  type TradeRoute,
} from "./TradeCore";
import { houseLawOf, housePorts, newOnly, sellAt } from "./TradeLaw";
import type {
  AffairItem,
  GameState,
  Labour2Command,
  Life,
  LifeCommand,
  Part,
  TradeHouse,
  TradePerson,
  TradeVoyage,
} from "./Types";

/** Voyages kept on the house's page. */
export const PAST_KEPT = 8;

/** The house's own dice for a voyage. */
function vdice(s: GameState, v: TradeVoyage, salt: number): Rng {
  return bdice(s, (0x22b0000 + hashOf(v.id, salt)) | 0);
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** A house still trading (not wound up). */
export function houseOf(life: Life): TradeHouse | undefined {
  const h = life.bondTrade;
  return h && h.closed === undefined ? h : undefined;
}

/** The route a house sails. */
export function routeOf(h: TradeHouse): TradeRoute {
  return {
    from: h.from,
    to: h.to,
    size: h.size,
    food: h.food,
    together: h.together,
  };
}

/** Who the house's factor would buy for its next voyage (the same named people the voyage will carry). */
export function nextManifest(
  s: GameState,
  w: World | { map: import("./Types").MapDef },
  life: Life,
  r: TradeRoute = houseOf(life) ? routeOf(houseOf(life)!) : ({} as TradeRoute),
): TradePerson[] {
  const h = houseOf(life);
  const day = Math.max(s.day, h?.next ?? s.day);
  return manifestFor(
    s,
    w.map,
    r.from,
    day,
    r.size,
    seatSalt(life.seat),
    newOnly(s, w.map, r.to, day),
  );
}

/** The odds of the house's next voyage as things stand. */
export function houseOutlook(
  s: GameState,
  w: World,
  life: Life,
  r?: TradeRoute,
  every?: number,
) {
  const h = houseOf(life);
  const route = r ?? (h ? routeOf(h) : undefined);
  if (!route) return undefined;
  return voyageOutlook(
    s,
    w,
    h,
    route,
    nextManifest(s, w, life, route),
    every ?? h?.every ?? 3,
  );
}

// ---------------------------------------------------------------- setting up

/** Whether you could set up a house in the trade on a route, and why not. */
export function foundCheck(
  s: GameState,
  w: World,
  life: Life,
  r: TradeRoute | undefined,
): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (lifeIsNative(s, life))
    return no("Your people's ways have nothing to do with this trade.");
  if (houseOf(life)) return no("You have a house in the trade already.");
  const law = houseLawOf(lawOf(s, life.home).law);
  if (!law)
    return no(
      "Only a subject of the English, French or Spanish crowns could keep such a house: the Dutch trade was the West India Company's.",
    );
  if (!r) return no("Choose a route.");
  const ok = routeCheck(s, w.map, law, r);
  if (!ok.ok) return no(ok.why);
  if (life.purse < HOUSE_SETUP)
    return no(`The counting room and its books: ${HOUSE_SETUP} coins.`);
  return yes;
}

/** Set up a house in the trade. */
function foundHouse(
  g: ConquestGame,
  life: Life,
  r: Labour2Command["route"],
): string | null {
  const s = g.s;
  const route = r ? normal(r) : undefined;
  const check = foundCheck(s, g.w, life, route);
  if (!check.ok) return check.why;
  const me = meOf(s, life)!;
  const law = houseLawOf(lawOf(s, life.home).law)!;
  withFlow(g, { key: "bond:trade", label: "A house in the trade: its counting room" }, () =>
    spend(g, life, HOUSE_SETUP),
  );
  const old = life.bondTrade;
  touchLife(g, life).bondTrade = {
    name: `${me.family} & ${law === "french" ? "Compagnie" : law === "spanish" ? "Compañía" : "Company"}`,
    founded: s.day,
    law,
    col: colonyOf(g.map, life.home),
    ...route!,
    every: r!.every,
    on: true,
    next: s.day,
    voyage: null,
    past: old?.past ?? [],
    totals: old?.totals ?? {
      voyages: 0,
      carried: 0,
      died: 0,
      sold: 0,
      parted: 0,
      free: 0,
      rose: 0,
      taken: 0,
      net: 0,
    },
  };
  const h = life.bondTrade!;
  journal(
    g,
    life,
    `You set up ${h.name}, a house in the trade in people: its factor is to buy ${h.size} at a time at ${g.map.provinces[h.from].name} and sell them at ${g.map.provinces[h.to].name}, a voyage every ${h.every} months.`,
  );
  milestone(g, life, "business", `Set up ${h.name}, a house in the trade in people`, h.from);
  return null;
}

/** A route as the command gave it, made sane. */
function normal(r: NonNullable<Labour2Command["route"]>): TradeRoute & { every: number } {
  return {
    from: r.from | 0,
    to: r.to | 0,
    size: SIZES.includes(r.size) ? r.size : SIZES[1],
    food: r.food === 0 || r.food === 2 ? r.food : 1,
    together: !!r.together,
    every: EVERY.includes(r.every) ? r.every : EVERY[1],
  };
}

/** Change the house's route and rules (from the next voyage). */
function changeRoute(
  g: ConquestGame,
  life: Life,
  r: Labour2Command["route"],
): string | null {
  const h = houseOf(life);
  if (!h) return "You have no house in the trade.";
  if (!r) return "Choose a route.";
  const route = normal(r);
  const ok = routeCheck(g.s, g.map, h.law, route);
  if (!ok.ok) return ok.why;
  touchLife(g, life);
  Object.assign(h, route);
  return null;
}

/** Send voyages, or stop sending them. */
function setOn(g: ConquestGame, life: Life, on: boolean): string | null {
  const h = houseOf(life);
  if (!h) return "You have no house in the trade.";
  touchLife(g, life);
  h.on = on;
  if (on && h.next < g.s.day) h.next = g.s.day;
  return null;
}

/** Wind the house up (once nobody's at sea or waiting to be sold). */
export function closeHouse(g: ConquestGame, life: Life, why = ""): string | null {
  const h = houseOf(life);
  if (!h) return "You have no house in the trade.";
  if (h.voyage) return "Not while a voyage is at sea or its people unsold.";
  touchLife(g, life);
  h.on = false;
  h.closed = g.s.day;
  journal(
    g,
    life,
    `You wind up ${h.name}${why}. In ${plural(h.totals.voyages, "voyage")} it carried ${plural(h.totals.carried, "person", "people")}: ${h.totals.died} died on the passage, ${h.totals.sold} were sold, ${h.totals.parted} were parted from their kin at the sale, and ${h.totals.free} got free.`,
  );
  return null;
}

// ---------------------------------------------------------------- a voyage

/** The house's month at sea: send a voyage when it's due, land it, sell its people. */
function houseDaily(g: ConquestGame, life: Life): void {
  const h = houseOf(life);
  if (!h || life.watching) return;
  const s = g.s;
  const v = h.voyage;
  if (!v) {
    if (h.on && s.day >= h.next) sail(g, life, h);
    return;
  }
  if (v.landed === undefined && s.day >= v.due) arrive(g, life, h, v);
  else if (v.landed !== undefined && s.day >= (v.sells ?? v.landed)) sell(g, life, h, v);
}

hooks.lifeDaily.push(houseDaily);

function sail(g: ConquestGame, life: Life, h: TradeHouse): void {
  const s = g.s;
  const map = g.map;
  const ok = routeCheck(s, map, h.law, routeOf(h));
  if (!ok.ok) {
    touchLife(g, life);
    h.on = false;
    affairNews(g, life, "company", `${h.name} sends no voyage: ${ok.why}`, "bad");
    return;
  }
  const people = nextManifest(s, g.w, life);
  const days = passageDays(s, g.w, h.from, h.to);
  const cost = Math.round(manifestCost(people) + passageCost(days, people.length, h.food));
  if (life.purse < cost) {
    touchLife(g, life);
    h.next = s.day + 30;
    affairNews(
      g,
      life,
      "company",
      `${h.name}'s factor at ${map.provinces[h.from].name} waits: the voyage needs ${cost} coins in hand.`,
    );
    return;
  }
  touchLife(g, life);
  withFlow(
    g,
    {
      key: "bond:trade",
      label: `${h.name}: ${people.length} bought at ${map.provinces[h.from].name}, and the passage`,
      chance: true,
      aff: "company",
    },
    () => spend(g, life, cost),
  );
  const v: TradeVoyage = {
    id: g.nextId(),
    from: h.from,
    to: h.to,
    sailed: s.day,
    due: s.day + days,
    people,
    cost,
    food: h.food,
    together: h.together,
    log: [
      {
        day: s.day,
        t: `Sailed from ${map.provinces[h.from].name} for ${map.provinces[h.to].name} with ${people.length} aboard: ${people.map((p) => tradeName(p)).join(", ")}.`,
      },
    ],
  };
  h.voyage = v;
  h.totals.voyages++;
  h.totals.carried += people.length;
  affairNews(
    g,
    life,
    "company",
    `${h.name}'s sloop sails from ${map.provinces[h.from].name} for ${map.provinces[h.to].name} with ${people.length} people aboard, bought for ${cost} coins with the passage: ${people
      .slice(0, 5)
      .map((p) => p.n)
      .join(", ")}${people.length > 5 ? `, and ${people.length - 5} more` : ""}.`,
  );
}

const CAUSES = [
  "a fever",
  "the flux",
  "weakness after the crossing",
  "a fever, on the eleventh day",
];

function arrive(g: ConquestGame, life: Life, h: TradeHouse, v: TradeVoyage): void {
  const s = g.s;
  const map = g.map;
  touchLife(g, life);
  const aboard = v.people.filter((p) => !p.fate);
  const idx = v.people.map((p, i) => (p.fate ? -1 : i)).filter((i) => i >= 0);
  const pm = passageModel(s, g.w, { ...routeOf(h), from: v.from, to: v.to, food: v.food }, aboard);
  const rng = vdice(s, v, v.due);
  const roll = rollPassage(rng, pm);
  const to = map.provinces[v.to].name;
  if (roll.taken) {
    for (const i of idx) v.people[i].fate = "taken";
    h.totals.taken += idx.length;
    v.log.push({
      day: s.day,
      t: `Taken by an enemy privateer before ${to}: everyone aboard was carried off, to be sold by the captors.`,
    });
    finish(g, life, h, v, 0, 0);
    affairNews(
      g,
      life,
      "company",
      `${h.name}'s sloop is taken by an enemy privateer before ${to}. Those aboard are carried off to be sold by her captors; the house loses what it paid (${v.cost}).`,
      "bad",
    );
    return;
  }
  const died: string[] = [];
  roll.dead.forEach((d, k) => {
    if (!d) return;
    const p = v.people[idx[k]];
    p.fate = "died";
    const cause = CAUSES[rng.int(0, CAUSES.length - 1)];
    died.push(p.n);
    v.log.push({ day: s.day, t: `${tradeName(p)}, ${p.a}, died on the passage: ${cause}.` });
  });
  h.totals.died += died.length;
  if (roll.rose) {
    h.totals.rose++;
    if (roll.away) {
      const gone: string[] = [];
      for (const i of idx)
        if (!v.people[i].fate) {
          v.people[i].fate = "free";
          gone.push(v.people[i].n);
        }
      h.totals.free += gone.length;
      v.rose = "away";
      v.log.push({
        day: s.day,
        t: `They rose before the vessel made ${to}, overpowered the crew and took her boat ashore by night: ${gone.join(", ")}. None were taken again.`,
      });
      finish(g, life, h, v, 0, 0);
      affairNews(
        g,
        life,
        "company",
        `Those aboard ${h.name}'s sloop rose before ${to} and got ashore: ${plural(gone.length, "person", "people")} free. The house loses what it paid (${v.cost}).`,
        "bad",
      );
      raiseEvent(g, life, "bond-tr-rising", { v: v.id, k: 1, n: gone.length });
      return;
    }
    v.rose = "down";
    const lost: string[] = [];
    for (const k of roll.killed) {
      const p = v.people[idx[k]];
      if (p.fate) continue;
      p.fate = "died";
      lost.push(p.n);
      h.totals.died++;
    }
    v.log.push({
      day: s.day,
      t: `They rose on the passage; the crew put it down. ${lost.length ? `${lost.join(" and ")} lost ${lost.length === 1 ? "a life" : "their lives"} in it.` : "Nobody was killed."}`,
    });
    raiseEvent(g, life, "bond-tr-rising", { v: v.id, k: 0, n: lost.length });
  }
  // Their own words on the way.
  for (const i of idx) {
    const p = v.people[i];
    if (p.fate || p.said !== undefined || !rng.chance(0.25)) continue;
    const said = voiceFor(p, "aboard", rng);
    if (said !== undefined) p.said = said;
  }
  // A colony's ban may turn the cargo away (the Association, Rhode Island, Connecticut).
  const can = sellAt(s, map, h.law, v.to);
  if (!can.ok) {
    const alt = housePorts(s, map, h.law, "sell")
      .filter((p) => p !== v.to)
      .sort((a, b) => passageDays(s, g.w, v.to, a) - passageDays(s, g.w, v.to, b))[0];
    const next = alt ?? v.from;
    v.log.push({
      day: s.day,
      t: `Turned away at ${to}: ${can.why} The master sails on for ${map.provinces[next].name}.`,
    });
    v.from = v.to;
    v.to = next;
    v.due = s.day + passageDays(s, g.w, v.from, next);
    affairNews(
      g,
      life,
      "company",
      `${h.name}'s cargo is turned away at ${to}: ${can.why} The sloop sails on for ${map.provinces[next].name}.`,
      "bad",
    );
    return;
  }
  v.landed = s.day;
  v.sells =
    s.day +
    rng.int(SELL_DAYS[0], SELL_DAYS[1]) +
    (v.together ? TOGETHER_DAYS : 0);
  const left = v.people.filter((p) => !p.fate).length;
  v.log.push({
    day: s.day,
    t: `Landed at ${to} with ${left} of ${v.people.length}${died.length ? ` (${died.join(", ")} died on the way)` : ""}. The factor advertises the sale.`,
  });
  affairNews(
    g,
    life,
    "company",
    `${h.name}'s sloop is in at ${to} with ${left} of the ${v.people.length} put aboard${died.length ? `; ${died.join(", ")} died on the passage` : ""}. The sale is advertised.`,
    died.length ? "bad" : undefined,
  );
  addStress(g, life, Math.min(4, died.length));
  // A family to be parted pleads with you first (unless the house sells families together).
  if (!v.together) {
    const i = v.people.findIndex(
      (p) => !p.fate && p.kin !== undefined && !v.people[p.kin].fate && p.rel !== "shipmate",
    );
    if (i >= 0) raiseEvent(g, life, "bond-tr-plea", { v: v.id, i, j: v.people[i].kin! });
  }
}

function sell(g: ConquestGame, life: Life, h: TradeHouse, v: TradeVoyage): void {
  const s = g.s;
  const map = g.map;
  touchLife(g, life);
  const rng = vdice(s, v, v.sells ?? s.day);
  const left = v.people
    .map((p, i) => ({ p, i }))
    .filter((x) => !x.p.fate);
  const route: TradeRoute = { ...routeOf(h), from: v.from, to: v.to, food: v.food, together: v.together };
  const sm = saleModel(s, map, h, route, left.map((x) => x.p));
  let gross = 0;
  let duty = 0;
  const buyerOf = new Map<number, string>();
  left.forEach((x, k) => {
    const p = x.p;
    p.fate = "sold";
    const kin = p.kin !== undefined ? v.people[p.kin] : undefined;
    const kinK = kin ? left.findIndex((y) => y.i === p.kin) : -1;
    let to = buyerOf.get(x.i);
    if (!to) {
      to = buyerAt(map, v.to, rng);
      buyerOf.set(x.i, to);
      // Their kin go with them, or (sold to whoever bids most) apart.
      if (kin && kinK >= 0 && !kin.fate) {
        const part = Math.max(sm.part[k], sm.part[kinK]);
        if (!v.together && rng.chance(part)) {
          p.parted = true;
          kin.parted = true;
          let other = buyerAt(map, v.to, rng);
          for (let t = 0; t < 4 && other === to; t++) other = buyerAt(map, v.to, rng);
          buyerOf.set(p.kin!, other === to ? `${other}, another` : other);
          h.totals.parted += 2;
        } else buyerOf.set(p.kin!, to);
      }
    }
    p.to = to;
    p.got = Math.round(sm.price[k] * (1 - SELL_CUT));
    gross += sm.price[k] * (1 - SELL_CUT);
    duty += sm.duty[k];
    if (p.parted && p.said === undefined && rng.chance(0.7)) {
      const said = voiceFor(p, "sale", rng);
      if (said !== undefined) p.said = said;
    }
  });
  gross = Math.round(gross * 100) / 100;
  duty = Math.round(duty * 100) / 100;
  const net = Math.round((gross - duty) * 100) / 100;
  withFlow(
    g,
    {
      key: "bond:trade",
      label: `${h.name}: ${left.length} sold at ${map.provinces[v.to].name}, less the factor's commission and the duty`,
      chance: true,
      aff: "company",
    },
    () => {
      earn(g, life, gross);
      if (duty > 0) spend(g, life, duty);
    },
  );
  for (const x of left) {
    const p = x.p;
    v.log.push({
      day: s.day,
      t: `${tradeName(p)}, ${p.a}: sold to ${p.to}, ${p.got} coins${p.parted && p.kin !== undefined ? `, apart from ${p.rel === "child" ? "her child" : p.rel === "mother" ? "his mother" : p.rel === "wife" ? "his wife" : p.rel === "husband" ? "her husband" : p.rel === "shipmate" ? "a shipmate" : p.f ? "her kin" : "his kin"} ${v.people[p.kin].n}` : ""}.`,
    });
  }
  h.totals.sold += left.length;
  h.glut = { ...(h.glut ?? {}), [v.to]: (h.glut?.[v.to] ?? 0) + left.length };
  v.duty = duty;
  v.got = Math.round(gross);
  finish(g, life, h, v, net, left.length);
  const parted = left.filter((x) => x.p.parted).length;
  affairNews(
    g,
    life,
    "company",
    `${h.name} sells ${plural(left.length, "person", "people")} at ${map.provinces[v.to].name}: ${Math.round(net)} coins after the factor's commission and the duty (${Math.round(duty)})${parted ? `; ${parted} parted from their kin at the sale` : ""}. The voyage: ${net - v.cost >= 0 ? "+" : "−"}${Math.abs(Math.round(net - v.cost))}.`,
    net - v.cost >= 0 ? undefined : "bad",
  );
  if (parted) addStress(g, life, Math.min(3, parted));
}

/** A voyage done: on the house's record, the next one's day set. */
function finish(
  g: ConquestGame,
  life: Life,
  h: TradeHouse,
  v: TradeVoyage,
  net: number,
  sold: number,
): void {
  void sold;
  h.totals.net = Math.round((h.totals.net + net - v.cost) * 100) / 100;
  h.past = [...h.past, v].slice(-PAST_KEPT);
  h.voyage = null;
  h.next = Math.max(v.sailed + h.every * 30, g.s.day + 1);
}

// ---------------------------------------------------------------- at the sale: a family's plea answered

/** The voyage whose people are being sold now, by id. */
export function voyageById(life: Life, id: number): TradeVoyage | undefined {
  const v = life.bondTrade?.voyage;
  return v && v.id === id ? v : undefined;
}

/** Sell a voyage's families together, as one lot each: a little less, a little longer. */
export function sellTogether(g: ConquestGame, life: Life, id: number): void {
  const v = voyageById(life, id);
  if (!v || v.together) return;
  touchLife(g, life);
  v.together = true;
  v.sells = (v.sells ?? g.s.day) + TOGETHER_DAYS;
  v.log.push({ day: g.s.day, t: "You tell the factor: families are to be sold together, as one lot each." });
}

/** Whether a voyage's people could be taken into your own household instead of sold. */
export function keepCheck(s: GameState, map: import("./Types").MapDef, life: Life): Check {
  const home = life.bondage?.home ?? life.home;
  if (!holdingLawful(s, map, home))
    return no(`The law at your home (${map.provinces[home]?.name ?? "home"}) doesn't allow anyone to be held.`);
  return yes;
}

/**
 * Take people from a voyage into your own household (a family kept
 * together): they become your household's, held as LABOUR r15's are, at
 * your home. No money changes hands; what they'd have fetched is forgone.
 */
export function keepPeople(
  g: ConquestGame,
  life: Life,
  id: number,
  idx: number[],
): string | null {
  const s = g.s;
  const v = voyageById(life, id);
  if (!v) return "They've been sold.";
  const ok = keepCheck(s, g.map, life);
  if (!ok.ok) return ok.why;
  const b = bondageFor(g, life);
  const owner = s.nations[s.provinces[b.home]?.owner ?? -1] ?? s.nations[0];
  const rng = vdice(s, v, 0x6ee9);
  const made = new Map<number, import("./Types").Character>();
  for (const i of idx) {
    const p = v.people[i];
    if (!p || p.fate) continue;
    const c = makeCharacter(s, rng, {
      nation: owner.id,
      culture: owner.culture,
      religion: owner.religion,
      female: p.f,
      age: p.a,
      first: p.n,
      family: "",
    });
    c.bond = {
      status: "held",
      seat: life.seat,
      at: b.home,
      origin: p.o,
      faith: "own",
      health: p.h,
      mood: 30,
      sk: { field: 3, house: 2, craft: p.cr },
      work: p.a < 12 ? "rest" : "fields",
      since: s.day,
      paid: p.paid,
      ...(p.born ? { born: p.born } : {}),
    };
    g.touchChar(c);
    b.people.push(c.id);
    made.set(i, c);
    p.fate = "kept";
    p.to = "your own household";
  }
  // Kin stay kin.
  for (const [i, c] of made) {
    const p = v.people[i];
    const k = p.kin !== undefined ? made.get(p.kin) : undefined;
    if (!k) continue;
    if (p.rel === "wife" || p.rel === "husband") c.spouse = k.id;
    if (p.rel === "child") {
      k.mother = c.id;
      if (!c.children.includes(k.id)) c.children.push(k.id);
    }
  }
  touchLife(g, life);
  const names = [...made.values()].map((c) => c.first).join(" and ");
  v.log.push({ day: s.day, t: `${names}: not sold; taken into your own household, together.` });
  journal(
    g,
    life,
    `You have ${names} taken into your own household at ${g.map.provinces[b.home].name}, together, rather than sold apart.`,
  );
  return null;
}

// ---------------------------------------------------------------- the month

hooks.lifeMonthly.push((g, life) => {
  const h = life.bondTrade;
  if (!h?.glut) return;
  touchLife(g, life);
  const next: Record<number, number> = {};
  for (const [k, v] of Object.entries(h.glut)) {
    const x = Math.round(v * GLUT_EASE * 100) / 100;
    if (x >= 0.5) next[Number(k)] = x;
  }
  h.glut = next;
});

// ---------------------------------------------------------------- the command

function tradeCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "bond2") return undefined;
  const cmd = c as Labour2Command;
  switch (cmd.act) {
    case "found":
      return foundHouse(g, life, cmd.route);
    case "route":
      return changeRoute(g, life, cmd.route);
    case "on":
      return setOn(g, life, true);
    case "off":
      return setOn(g, life, false);
    case "close":
      return closeHouse(g, life);
    default:
      return undefined;
  }
}

hooks.command.push(tradeCommand);

// ---------------------------------------------------------------- the ledger

hooks.forecast.push((s: GameState, life: Life, w?: World): Part[] => {
  const h = houseOf(life);
  if (!h?.on || !w || life.c < 0) return [];
  const o = houseOutlook(s, w, life);
  if (!o) return [];
  const lo = Math.min(...o.view.outcomes.filter((x) => x.p > 0).map((x) => x.lo));
  const hi = Math.max(...o.view.outcomes.filter((x) => x.p > 0).map((x) => x.hi));
  return [
    {
      key: "bond:trade",
      label: `${h.name}: a voyage every ${o.months} months, on average`,
      value: Math.round((o.expected / o.months) * 100) / 100,
      chance: [
        Math.round((lo / o.months) * 100) / 100,
        Math.round((hi / o.months) * 100) / 100,
      ],
    },
  ];
});

hooks.affairs.push((s: GameState, w: World, life: Life): AffairItem[] => {
  const h = houseOf(life);
  if (!h || life.c < 0 || life.watching) return [];
  const v = h.voyage;
  const name = (p: number) => w.map.provinces[p]?.name ?? "?";
  const o = h.on && !v ? houseOutlook(s, w, life) : undefined;
  return [
    {
      kind: "company",
      id: "bondtrade",
      title: h.name,
      what: v
        ? v.landed !== undefined
          ? `selling ${v.people.filter((p) => !p.fate).length} people at ${name(v.to)}`
          : `carrying ${v.people.length} people from ${name(v.from)} to ${name(v.to)}`
        : h.on
          ? `the next voyage from ${name(h.from)} to ${name(h.to)}, ${formatDate(h.next)}`
          : "sends no voyages",
      status: v ? (v.landed !== undefined ? "selling" : "at sea") : h.on ? "in port" : "stopped",
      p: v ? (v.landed !== undefined ? v.to : v.from) : h.from,
      ...(v ? { due: v.landed !== undefined ? v.sells : v.due } : {}),
      ...(o
        ? {
            expected: {
              value: o.expected,
              lo: o.view.lo,
              hi: o.view.hi,
              per: "trip" as const,
            },
          }
        : {}),
      go: { tab: "estate", sub: "bondage" },
    },
  ];
});

/** Years since the house was set up (for the page). */
export function houseYears(s: GameState, h: TradeHouse): number {
  return Math.floor((s.day - h.founded) / DAYS_PER_YEAR);
}
