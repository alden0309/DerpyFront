// LABOUR2 (r21): a house in the intercolonial trade in people. The model its
// voyages are rolled from and its page shows: who its factor buys at one
// port (named people, some with a mother, a husband, a sister or a shipmate
// beside them), what the passage costs and takes (deaths, a rising aboard, a
// privateer in wartime), what they're sold for at the other end, the duty
// the colony lays on each, and who is parted from whom at the sale.
//
// Told as history, never as a cheerful profit dial: every voyage is a list of
// names, and the page shows what became of each before it shows the money.
// The odds shown come from these same functions (passageModel, saleModel).
//
// Sources (see also TradeLaw.ts):
// - Gregory E. O'Malley, Final Passages: The Intercolonial Slave Trade of
//   British America, 1619-1807 (2014), and his notes for the Intra-American
//   database (slavevoyages.org): more than 7,000 intercolonial voyages; as
//   many as a quarter of the Africans who reached the Americas were shipped
//   on again; about 5 in 100 died on an intra-American voyage on average (a
//   faster rate of dying, by the day, than the Atlantic crossing's), and
//   each sale parted more of them from shipmates, kin and countrymen.
//   Kingston and Bridgetown were the great hubs; most of Jamaica's
//   re-exports in the first half of the century went to Spanish America.
// - David Richardson, "Shipboard Revolts, African Authority, and the Atlantic
//   Slave Trade", William and Mary Quarterly 58 (2001): as many as 1 in 10
//   ships of the Atlantic trade saw a rising; an intercolonial passage was
//   shorter and its company smaller, so fewer here.
// - A factor's commission on selling people was 10 in 100 at Charles Town
//   (against 5 on other goods), as Austin & Laurens charged in the 1750s,
//   the largest such house in North America (it sold more than 8,000 people
//   in that decade); Henry Laurens gave the trade up in 1763-1764.
// - Barbados prices in 1753: "£33 to £56 per head in lots" (the Newport
//   brigantine Sanderson's consignees, in Du Bois, The Suppression of the
//   African Slave-Trade, ch. IV, note 8).

import {
  hashOf,
  mixFor,
  nameFor,
  pickWeighted,
  priceOf,
  r1,
  r2,
  skillsFor,
} from "./BondCore";
import { colonyOf, lawOf, saleChance, type Colony } from "./BondLaw";
import { dateOf } from "./Calendar";
import { voyageDays, warAtSea } from "./Company";
import type { World } from "./Map";
import type { OddsOutcome, OddsView } from "./Odds";
import { Rng } from "./Rng";
import { buyAt, dutyAt, sellAt, type HouseLaw } from "./TradeLaw";
import type {
  BondOrigin,
  GameState,
  MapDef,
  TradeHouse,
  TradeKin,
  TradePerson,
  TradeVoyage,
} from "./Types";

// ---------------------------------------------------------------- the numbers

/** Setting the house up: a counting room, its books, a factor's letters (as a trading company's). */
export const HOUSE_SETUP = 15;
/** People a voyage, and months between voyages, to choose from. */
export const SIZES = [6, 12, 24, 40];
export const EVERY = [2, 3, 6];
/** A ship's people bought by the lot from her factor, as the re-export merchants bought: under what a planter pays. */
export const LOT_PRICE = 0.85;
/** The factor's commission buying, and selling (10 in 100 on people, as at Charles Town). */
export const BUY_CUT = 0.025;
export const SELL_CUT = 0.1;
/** How they're kept on the passage: provisions a person a day, and what it does. */
export const FOOD = [
  { name: "Scant", day: 0.008, death: 1.5, rise: 1.3 },
  { name: "As the trade does", day: 0.012, death: 1, rise: 1 },
  { name: "Ample", day: 0.018, death: 0.7, rise: 0.85 },
] as const;
/** The vessel chartered for a passage: a sloop or a schooner, her master and crew. */
export const CHARTER = { fixed: 4, perDay: 0.3, perHeadDay: 0.004 };
/** The chance a day at sea of dying: about 4 in 100 over a month's passage at the trade's provisions, more for the weak and the scantly fed (O'Malley's average, about 5). */
export const DEATH_DAY = 0.0013;
/** A rising aboard, a voyage, at twelve aboard and three weeks out (most are put down). */
export const RISE_BASE = 0.03;
export const RISE_MOST = 0.12;
/** Of risings, how many get away (ashore, or with the vessel). */
export const RISE_AWAY = 0.25;
/** Lost when a rising is put down. */
export const RISE_KILLED = [1, 2] as const;
/** An enemy privateer, a voyage, in wartime. */
export const TAKEN_WAR = 0.06;
/** Days the sale takes at the far port; more for families sold together. */
export const SELL_DAYS = [15, 45] as const;
export const TOGETHER_DAYS = 10;
/** What a buyer pays: for those weak from the passage, and for a family sold as one lot. */
export const FRESH_PRICE = 0.95;
export const TOGETHER_PRICE = 0.95;
/** The chance a sale to whoever bids most parts someone from their kin aboard. */
export const PART: Record<TradeKin, number> = {
  mother: 0.3,
  child: 0.3,
  wife: 0.6,
  husband: 0.6,
  sister: 0.75,
  brother: 0.75,
  shipmate: 0.85,
};
/** An older child is parted from a mother this often. */
export const PART_OLDER = 0.6;
/** Too many sold at one port lowers the price there; it eases month by month. */
export const GLUT_K = 0.006;
export const GLUT_EASE = 0.85;

// ---------------------------------------------------------------- who is bought

/** The people a house's factor would buy at a port for a voyage (named, the same for everyone). */
export function manifestFor(
  s: GameState,
  map: MapDef,
  from: number,
  day: number,
  size: number,
  salt: number,
  /** Only those lately come from Africa (the far port taxes the seasoned heavily). */
  freshOnly = false,
): TradePerson[] {
  const rng = new Rng({
    rng: hashOf(s.settings.seed, from, day, size, salt, 0x7ade),
  });
  const year = dateOf(day).year;
  const col = colonyOf(map, from);
  const { law } = lawOf(s, from);
  const owner = s.nations[s.provinces[from]?.owner ?? -1];
  const culture = owner?.culture ?? "english";
  const mix = mixFor(col, law, year).filter(([o]) => o !== "creole");
  const out: TradePerson[] = [];
  const person = (
    origin: BondOrigin,
    female: boolean,
    age: number,
    fresh: boolean,
  ): number => {
    const n = nameFor(rng, origin, female, culture);
    const h = fresh ? 45 + rng.int(0, 25) : 60 + rng.int(0, 28);
    const cr = skillsFor(rng, origin, age).craft;
    const p: TradePerson = {
      n: n.first,
      ...(n.born && n.born !== n.first ? { born: n.born } : {}),
      f: female,
      a: age,
      o: origin,
      h,
      cr,
      fresh,
      paid: Math.round(
        priceOf(s, map, from, { age, female, health: h, craft: cr }, day) *
          (fresh ? LOT_PRICE : 1) *
          (1 + BUY_CUT),
      ),
    };
    out.push(p);
    return out.length - 1;
  };
  const link = (a: number, b: number, ra: TradeKin, rb: TradeKin) => {
    out[a].kin = b;
    out[a].rel = ra;
    out[b].kin = a;
    out[b].rel = rb;
  };
  while (out.length < size) {
    const estate = rng.chance(0.18) && !freshOnly;
    const origin: BondOrigin = estate ? "creole" : pickWeighted(rng, mix);
    const fresh = !estate;
    const two = out.length + 2 <= size;
    const shape = rng.next();
    if (two && shape < 0.18) {
      // A mother and her child.
      const m = person(origin, true, 18 + rng.int(0, 12), fresh);
      const k = person(origin, rng.chance(0.5), 1 + rng.int(0, 9), fresh);
      link(m, k, "child", "mother");
    } else if (two && shape < 0.27) {
      // A husband and wife (sold off an estate, mostly).
      const age = 20 + rng.int(0, 14);
      const a = person(origin, false, age, fresh);
      const b = person(origin, true, Math.max(17, age - rng.int(0, 6)), fresh);
      link(a, b, "wife", "husband");
    } else if (two && shape < 0.35) {
      // A sister and a brother, or two sisters.
      const a = person(origin, true, 14 + rng.int(0, 10), fresh);
      const bf = rng.chance(0.5);
      const b = person(origin, bf, 12 + rng.int(0, 12), fresh);
      link(a, b, bf ? "sister" : "brother", "sister");
    } else if (two && fresh && shape < 0.47) {
      // Shipmates: they crossed the sea in the same ship, and call each other kin.
      const fa = rng.chance(0.35);
      const a = person(origin, fa, 15 + rng.int(0, 15), fresh);
      const b = person(origin, fa, 15 + rng.int(0, 15), fresh);
      link(a, b, "shipmate", "shipmate");
    } else person(origin, rng.chance(0.35), 14 + rng.int(0, 21), fresh);
  }
  return out;
}

/** What buying a manifest costs (the people, by the lot, with the factor's commission). */
export function manifestCost(people: TradePerson[]): number {
  return Math.round(people.reduce((m, x) => m + x.paid, 0));
}

// ---------------------------------------------------------------- the passage

/** A route as planned: where from and to, how many, how they're kept. */
export interface TradeRoute {
  from: number;
  to: number;
  size: number;
  food: 0 | 1 | 2;
  together: boolean;
}

/** Days at sea between two ports (along the coasts, a third longer than the crow flies). */
export function passageDays(
  s: GameState,
  w: World,
  from: number,
  to: number,
): number {
  return Math.max(3, Math.round(voyageDays(s, w, { from, to })));
}

/** What fitting out a passage costs: the vessel chartered, and provisions. */
export function passageCost(
  days: number,
  size: number,
  food: 0 | 1 | 2,
): number {
  return r2(
    CHARTER.fixed +
      days * CHARTER.perDay +
      days * size * CHARTER.perHeadDay +
      days * size * FOOD[food].day,
  );
}

/** One person's chance of dying on a passage, by the days, their state, the crowding and the provisions. */
export function deathOnPassage(
  p: TradePerson,
  days: number,
  size: number,
  food: 0 | 1 | 2,
): number {
  let q = DEATH_DAY * FOOD[food].death;
  if (size >= 40) q *= 1.5;
  else if (size >= 24) q *= 1.25;
  if (p.fresh) q *= 1.3;
  if (p.h < 55) q *= 1.6;
  if (p.a < 10) q *= 1.3;
  if (p.a > 45) q *= 1.4;
  return Math.min(0.6, 1 - Math.pow(1 - q, days));
}

/** Everything a passage is rolled from. */
export interface PassageModel {
  days: number;
  /** Each person's chance of dying on the way. */
  q: number[];
  /** A rising aboard, and (if one) that they get away. */
  rise: number;
  away: number;
  /** Taken by an enemy privateer (wartime only). */
  taken: number;
  war: boolean;
}

export function passageModel(
  s: GameState,
  w: World,
  r: TradeRoute,
  people: TradePerson[],
): PassageModel {
  const days = passageDays(s, w, r.from, r.to);
  const fresh = people.length
    ? people.filter((x) => x.fresh).length / people.length
    : 0;
  const rise = Math.min(
    RISE_MOST,
    RISE_BASE *
      Math.sqrt(Math.max(1, people.length) / 12) *
      Math.sqrt(days / 21) *
      FOOD[r.food].rise *
      (1 + 0.5 * fresh),
  );
  const war = warAtSea(s, r);
  return {
    days,
    q: people.map((p) => deathOnPassage(p, days, people.length, r.food)),
    rise: r4(rise),
    away: RISE_AWAY,
    taken: war ? TAKEN_WAR : 0,
    war,
  };
}

/** How a passage went. */
export interface PassageRoll {
  dead: boolean[];
  rose: boolean;
  away: boolean;
  taken: boolean;
  /** Those lost when a rising was put down. */
  killed: number[];
}

/** Roll a passage from its model, on the house's own dice. */
export function rollPassage(rng: Rng, m: PassageModel): PassageRoll {
  const taken = rng.chance(m.taken);
  const dead = m.q.map((q) => rng.chance(q));
  const rose = !taken && rng.chance(m.rise);
  const away = rose && rng.chance(m.away);
  const killed: number[] = [];
  if (rose && !away) {
    const alive = dead.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
    const n = Math.min(alive.length, rng.int(RISE_KILLED[0], RISE_KILLED[1]));
    for (let k = 0; k < n; k++) {
      const i = alive.splice(rng.int(0, alive.length - 1), 1)[0];
      killed.push(i);
    }
  }
  return { dead, rose, away, taken, killed };
}

// ---------------------------------------------------------------- the sale

/** What the house's sale at a port is reckoned from: each person's price, the duty and the parting. */
export interface SaleModel {
  /** Each one's gross price at the sale, and the duty on them. */
  price: number[];
  duty: number[];
  /** The colony's duty, in words (each act). */
  dutyLaws: string[];
  prohibitive: boolean;
  /** Each one's chance of being parted from their kin aboard, if sold to whoever bids most. */
  part: number[];
  /** The price fall from the house's own sales here lately. */
  glut: number;
}

/** How much the house's recent sales at a port lower the price there. */
export function glutFactor(
  s: GameState,
  map: MapDef,
  house: Pick<TradeHouse, "glut"> | undefined,
  to: number,
): number {
  const g = house?.glut?.[to] ?? 0;
  const depth = 1 + 3 * saleChance(s, map, to);
  return 1 / (1 + (GLUT_K * g) / depth);
}

export function saleModel(
  s: GameState,
  map: MapDef,
  house: Pick<TradeHouse, "glut"> | undefined,
  r: TradeRoute,
  people: TradePerson[],
  day: number = s.day,
): SaleModel {
  const glut = glutFactor(s, map, house, r.to);
  const price: number[] = [];
  const duty: number[] = [];
  const laws = new Set<string>();
  let prohibitive = false;
  for (const p of people) {
    const v =
      priceOf(
        s,
        map,
        r.to,
        { age: p.a, female: p.f, health: p.h, craft: p.cr },
        day,
      ) *
      (p.fresh ? FRESH_PRICE : 1) *
      glut *
      (r.together && p.kin !== undefined ? TOGETHER_PRICE : 1);
    price.push(r2(v));
    const d = dutyAt(s, map, r.to, { price: v, fresh: p.fresh, age: p.a }, day);
    duty.push(d.coins);
    for (const x of d.parts) laws.add(x.law);
    if (d.prohibitive) prohibitive = true;
  }
  const part = people.map((p) => {
    if (r.together || p.kin === undefined || !p.rel) return 0;
    const other = people[p.kin];
    if ((p.rel === "mother" || p.rel === "child") && other) {
      const kid = p.rel === "mother" ? p : other;
      return kid.a >= 8 ? PART_OLDER : PART[p.rel];
    }
    return PART[p.rel];
  });
  return {
    price,
    duty,
    dutyLaws: [...laws],
    prohibitive,
    part,
    glut: r2(glut),
  };
}

/** What a sale brings for someone, net of the factor's commission and the duty. */
export function netOf(m: SaleModel, i: number): number {
  return r2(m.price[i] * (1 - SELL_CUT) - m.duty[i]);
}

/** Who bought them, in words, by the colony. */
const BUYERS: Partial<Record<Colony, string[]>> = {
  virginia: [
    "a tobacco planter on the York",
    "a planter of the Northern Neck",
    "a merchant of Norfolk",
    "a planter on the Rappahannock",
  ],
  maryland: [
    "a planter of Prince George's County",
    "an ironmaster at the Patapsco works",
    "a planter on the Eastern Shore",
  ],
  southcarolina: [
    "a rice planter on the Cooper River",
    "a planter at Winyah",
    "a merchant of the town",
    "a planter on the Santee",
  ],
  georgia: ["a rice planter on the Savannah", "a planter at Ebenezer"],
  northcarolina: [
    "a naval-stores man on the Cape Fear",
    "a planter at Edenton",
  ],
  islands: [
    "a sugar estate in St. Philip's parish",
    "an estate in the windward parishes",
    "a merchant of the town",
  ],
  jamaica: [
    "a sugar estate in St. Thomas in the East",
    "a pen-keeper in St. Ann",
    "an estate in Clarendon",
  ],
  hispaniola: [
    "a sugar estate on the plain of the Cap",
    "an indigo planter at Léogâne",
  ],
  cuba: [
    "a sugar mill near the city",
    "the king's works at the fortifications",
  ],
  newspain: ["a merchant of the city", "a hacienda inland"],
  mainland: ["a merchant of the town", "a hacienda inland"],
  louisiana: [
    "an indigo planter below the town",
    "a planter at the German Coast",
  ],
  newyork: [
    "a merchant of the town",
    "a farmer up the North River",
    "a ship's carpenter",
  ],
  newjersey: ["a farmer of Bergen County", "a merchant at Perth Amboy"],
  pennsylvania: ["a merchant of the town", "an ironmaster up the Schuylkill"],
  massachusetts: ["a merchant of the town", "a minister's household"],
  rhodeisland: ["a Narragansett planter", "a merchant of Newport"],
};

/** A buyer's words for a sale at a port. */
export function buyerAt(map: MapDef, p: number, rng: Rng): string {
  const list = BUYERS[colonyOf(map, p)] ?? ["a buyer from up the country"];
  return list[rng.int(0, list.length - 1)];
}

// ---------------------------------------------------------------- their own words

/**
 * What those carried said, in their own words: on the passage, and at the
 * sale. Restrained; the page shows each beside the name of who said it.
 */
export const VOICES: {
  when: "aboard" | "sale";
  rel?: TradeKin;
  text: string;
}[] = [
  {
    when: "aboard",
    text: "asked where the ship was going, and whether it was far",
  },
  {
    when: "aboard",
    rel: "child",
    text: "asked the mate for water for the child, and then for more",
  },
  {
    when: "aboard",
    rel: "shipmate",
    text: "said nothing for days, then asked for a shipmate by name",
  },
  {
    when: "aboard",
    text: "told the master, in a little English, that he was a smith at home and could work iron",
  },
  { when: "aboard", text: "kept count of the days with knots in a string" },
  {
    when: "aboard",
    text: "sang in the evenings, low, and the others answered",
  },
  {
    when: "sale",
    rel: "child",
    text: 'said to the factor, again and again: "Not my child."',
  },
  {
    when: "sale",
    rel: "wife",
    text: 'told the buyer: "We are married, in our own country and here."',
  },
  {
    when: "sale",
    rel: "husband",
    text: 'told the buyer: "We are married, in our own country and here."',
  },
  {
    when: "sale",
    rel: "sister",
    text: 'said: "She is my sister." It was all the English she had.',
  },
  {
    when: "sale",
    rel: "brother",
    text: "held on to his sister's sleeve until he was made to let go",
  },
  {
    when: "sale",
    rel: "shipmate",
    text: 'said: "We crossed the sea together. He is my brother now."',
  },
  {
    when: "sale",
    rel: "mother",
    text: "looked back for his mother all the way down the street",
  },
];

/** A voice fit for someone, at a moment (or none), chosen on the house's dice. */
export function voiceFor(
  p: TradePerson,
  when: "aboard" | "sale",
  rng: Rng,
): number | undefined {
  const fit = VOICES.map((v, i) => ({ v, i })).filter(
    (x) =>
      x.v.when === when &&
      (x.v.rel ? p.rel === x.v.rel : true) &&
      // A child doesn't plead in a man's words.
      !(p.a < 12 && !x.v.rel),
  );
  if (!fit.length) return undefined;
  const pick = fit[rng.int(0, fit.length - 1)];
  return pick.i;
}

// ---------------------------------------------------------------- the odds, before you send a voyage

/** A voyage's expected human cost and money, from the same models it's rolled from. */
export interface VoyageOutlook {
  days: number;
  sellDays: [number, number];
  cost: number;
  /** What the people cost to buy, and the passage. */
  buy: number;
  passage: number;
  /** Expected deaths on the passage; families likely parted at the sale. */
  deaths: number;
  parted: number;
  rise: number;
  away: number;
  taken: number;
  /** What the sale would bring, all alive, net of commission and duty. */
  full: number;
  duty: number;
  dutyLaws: string[];
  prohibitive: boolean;
  /** Expected net a voyage, and the months a cycle takes. */
  expected: number;
  months: number;
  view: OddsView;
}

const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** The odds of a voyage on a route with these people, shown as the Odds panel shows any venture. */
export function voyageOutlook(
  s: GameState,
  w: World,
  house: Pick<TradeHouse, "glut" | "every"> | undefined,
  r: TradeRoute,
  people: TradePerson[],
  every: number,
): VoyageOutlook {
  const pm = passageModel(s, w, r, people);
  const sm = saleModel(s, w.map, house, r, people);
  const buy = manifestCost(people);
  const passage = passageCost(pm.days, people.length, r.food);
  const cost = r2(buy + passage);
  const nets = people.map((_, i) => netOf(sm, i));
  const full = r2(nets.reduce((m, v) => m + v, 0));
  const duty = r2(sm.duty.reduce((m, v) => m + v, 0));
  const alive = nets.reduce((m, v, i) => m + v * (1 - pm.q[i]), 0);
  const deaths = pm.q.reduce((m, q) => m + q, 0);
  const avg = people.length
    ? alive / Math.max(0.01, people.length - deaths)
    : 0;
  const killed = (RISE_KILLED[0] + RISE_KILLED[1]) / 2;
  const ok = (1 - pm.taken) * (1 - pm.rise);
  const down = (1 - pm.taken) * pm.rise * (1 - pm.away);
  const away = (1 - pm.taken) * pm.rise * pm.away;
  const expected = r2(
    ok * alive + down * Math.max(0, alive - killed * avg) - cost,
  );
  // Pairs likely parted: each pair counted once.
  let parted = 0;
  people.forEach((p, i) => {
    if (p.kin !== undefined && p.kin > i)
      parted +=
        Math.max(sm.part[i], sm.part[p.kin]) *
        (1 - pm.q[i]) *
        (1 - pm.q[p.kin]);
  });
  const none = pm.q.reduce((m, q) => m * (1 - q), 1);
  const sellDays: [number, number] = [
    SELL_DAYS[0] + (r.together ? TOGETHER_DAYS : 0),
    SELL_DAYS[1] + (r.together ? TOGETHER_DAYS : 0),
  ];
  const months = Math.max(
    every,
    Math.ceil((pm.days + (sellDays[0] + sellDays[1]) / 2) / 30),
  );
  const outcomes: OddsOutcome[] = [
    {
      label: "The passage made with nobody lost, and all sold",
      p: r4(ok * none),
      lo: r1(full - cost),
      hi: r1(full - cost),
    },
    {
      label: "Deaths on the passage; the rest sold",
      p: r4(ok * (1 - none)),
      lo: r1(full - cost - 3 * avg),
      hi: r1(full - cost - avg),
      bad: true,
    },
    {
      label: "A rising aboard, put down",
      p: r4(down),
      lo: r1(full - cost - (killed + 2) * avg),
      hi: r1(full - cost - killed * avg),
      bad: true,
    },
    {
      label: "A rising aboard: they get away",
      p: r4(away),
      lo: r1(-cost),
      hi: r1(-cost),
      bad: true,
    },
    ...(pm.taken
      ? [
          {
            label: "Taken by an enemy privateer",
            p: r4(pm.taken),
            lo: r1(-cost),
            hi: r1(-cost),
            bad: true,
          },
        ]
      : []),
  ];
  const view: OddsView = {
    title: `A voyage: ${people.length} people from ${w.map.provinces[r.from]?.name ?? "?"} to ${w.map.provinces[r.to]?.name ?? "?"}`,
    ok: true,
    costNow: cost,
    costMonth: 0,
    per: "trip",
    days: [pm.days + sellDays[0], pm.days + sellDays[1]],
    outcomes,
    expected,
    lo: r1(-cost),
    hi: r1(full - cost),
    net: r2(expected / months),
    risks: [
      {
        label: `Deaths on the passage: about ${r1(deaths)} of ${people.length}`,
        p: r4(1 - none),
      },
      {
        label: r.together
          ? "Families sold together, as one lot"
          : `Families and shipmates parted at the sale: about ${r1(parted)} of the pairs aboard`,
        p: r.together ? 0 : r4(Math.min(1, parted)),
      },
    ],
    factors: [
      "On the passage: the days at sea, how many are crowded aboard, and the provisions. Those weak from the Atlantic crossing and the youngest die most.",
      "A rising is likelier with more aboard, a longer passage, and scant provisions; most are put down.",
      sm.dutyLaws.length
        ? `The duty at ${w.map.provinces[r.to]?.name ?? "the far port"}: ${sm.dutyLaws.join("; ")}.`
        : `No colony's duty at ${w.map.provinces[r.to]?.name ?? "the far port"} in the game's sources.`,
      `The factor's commission: ${Math.round(BUY_CUT * 100)} in 100 buying, ${Math.round(SELL_CUT * 100)} in 100 selling.`,
      sm.glut < 1
        ? `Your house's own sales there lately have lowered the price (×${sm.glut}).`
        : "Selling many at one port lowers the price there for a while.",
      r.together
        ? "Families sold together fetch a little less, and take longer to sell."
        : "Sold to whoever bids most, families and shipmates are often parted.",
      pm.war ? "At war: an enemy privateer may take the vessel." : "",
    ].filter(Boolean),
  };
  return {
    days: pm.days,
    sellDays,
    cost,
    buy,
    passage,
    deaths: r1(deaths),
    parted: r1(parted),
    rise: pm.rise,
    away: pm.away,
    taken: pm.taken,
    full,
    duty,
    dutyLaws: sm.dutyLaws,
    prohibitive: sm.prohibitive,
    expected,
    months,
    view,
  };
}

/** Whether a route can be sailed, and why not (both ends' law, the crown's ports). */
export function routeCheck(
  s: GameState,
  map: MapDef,
  law: HouseLaw,
  r: Pick<TradeRoute, "from" | "to" | "size">,
): { ok: boolean; why: string } {
  if (r.from === r.to)
    return { ok: false, why: "Buy at one port and sell at another." };
  if (!SIZES.includes(r.size)) return { ok: false, why: "Choose how many." };
  const b = buyAt(s, map, law, r.from);
  if (!b.ok) return b;
  return sellAt(s, map, law, r.to);
}

/** A voyage's people still aboard or ashore unsold (not dead, free, taken or kept). */
export function stillHeld(v: TradeVoyage): TradePerson[] {
  return v.people.filter((p) => !p.fate || p.fate === "sold");
}

/** How a voyage's people fared, counted. */
export function fates(v: TradeVoyage): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of v.people) {
    const k = p.fate ?? "aboard";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Someone's name on a manifest, with their own if they gave it. */
export function tradeName(p: TradePerson): string {
  return p.born ? `${p.n} (born ${p.born})` : p.n;
}
