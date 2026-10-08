// Things that happen to a colony, each triggered by what's going on in the
// game (hunger, a corrupt treasury, a boom in tobacco, an heir coming of
// age), never at random out of nowhere. Where chance plays a part, the
// event says how much and why. Players choose; the computer picks the way
// its governor's personality leans; an unanswered event is decided by the
// council after a few weeks (the first choice).

import { dateOf } from "./Calendar";
import { remember, succession } from "./Characters";
import { merge } from "./Economy";
import type { ConquestGame } from "./Game";
import { isFeverSeason, isHurricaneSeason, isWinter } from "./Map";
import {
  ageOf,
  charName,
  corruption,
  hasTrait,
  opinionOfRuler,
  provincesOf,
  realmSkill,
  relationOf,
  rulerOf,
  settlers,
  treatyBetween,
  tribesfolk,
  yearOf,
} from "./Queries";
import { ADULT_AGE, DAYS_PER_YEAR, EUROPE_PRICE, EVENT_DAYS } from "./Rules";
import { settlerPops } from "./Setup";
import { Modifier, PendingEvent, TreatyKind } from "./Types";

export type Ctx = Record<string, number>;

export interface Choice {
  label: (g: ConquestGame, n: number, ctx: Ctx) => string;
  tip: (g: ConquestGame, n: number, ctx: Ctx) => string;
  apply: (g: ConquestGame, n: number, ctx: Ctx) => void;
  /** How much the computer likes it (higher is likelier). */
  ai: (g: ConquestGame, n: number, ctx: Ctx) => number;
  /** Can't be picked (e.g. no gold); says why. */
  blocked?: (g: ConquestGame, n: number, ctx: Ctx) => string | null;
}

export interface EventDef {
  key: string;
  /** Who it can happen to; "mission" events are raised by expeditions. */
  who: "power" | "native" | "mission";
  cooldown: number;
  when: (g: ConquestGame, n: number) => Ctx | null;
  title: (g: ConquestGame, n: number, ctx: Ctx) => string;
  body: (g: ConquestGame, n: number, ctx: Ctx) => string;
  choices: Choice[];
}

const name = (g: ConquestGame, p: number) => g.map.provinces[p].name;
const pay = (g: ConquestGame, n: number, gold: number) => {
  g.nation(n).gold -= gold;
};
const mod = (
  g: ConquestGame,
  n: number,
  key: string,
  label: string,
  years: number,
  fx: Fx,
) => {
  g.nation(n).mods.push({
    key,
    label,
    until: g.s.day + Math.round(years * DAYS_PER_YEAR),
    fx,
  });
};
const pmod = (
  g: ConquestGame,
  p: number,
  key: string,
  label: string,
  years: number,
  fx: Fx,
) => {
  g.prov(p).mods.push({
    key,
    label,
    until: g.s.day + Math.round(years * DAYS_PER_YEAR),
    fx,
  });
};
type Fx = Modifier["fx"];
const lacks = (gold: number) => (g: ConquestGame, n: number) =>
  g.s.nations[n].gold < gold ? `Needs ${gold} gold` : null;
const trait = (g: ConquestGame, n: number, t: Parameters<typeof hasTrait>[1]) =>
  hasTrait(rulerOf(g.s, n), t);
/** A d100 roll against a shown chance. */
const check = (g: ConquestGame, chance: number) => g.rng.next() < chance;

function capitalFoodMet(g: ConquestGame, n: number): number {
  const pr = g.s.provinces[g.s.nations[n].capital];
  const lab = pr?.pops.find((p) => p.cls === "laborers");
  return lab ? lab.met[0] : 1;
}

function bestProvince(
  g: ConquestGame,
  n: number,
  score: (p: number) => number,
): number {
  let best = -1;
  let bestScore = -Infinity;
  for (const p of provincesOf(g.s, n)) {
    const v = score(p);
    if (v > bestScore) {
      best = p;
      bestScore = v;
    }
  }
  return bestScore > -Infinity && bestScore > 0 ? best : -1;
}

function nativeNeighbours(g: ConquestGame, n: number): number[] {
  const s = g.s;
  const out = new Set<number>();
  for (const p of provincesOf(s, n)) {
    for (const [q] of g.map.provinces[p].nb) {
      const o = s.provinces[q].owner;
      if (o >= 0 && s.nations[o].kind === "native" && s.nations[o].alive)
        out.add(o);
    }
  }
  return [...out];
}

export const EVENTS: EventDef[] = [
  {
    key: "starving",
    who: "power",
    cooldown: DAYS_PER_YEAR,
    when: (g, n) => {
      const met = capitalFoodMet(g, n);
      return met < 0.75 ? { met: Math.round(met * 100) } : null;
    },
    title: () => "The starving time",
    body: (g, n, c) =>
      `Only ${c.met}% of what the people of ${name(g, g.s.nations[n].capital)} need to eat reaches their tables. Graves are being dug faster than houses are built.`,
    choices: [
      {
        label: () => "Buy corn from the natives",
        tip: () =>
          "−30 gold, +60 grain in the warehouses; natives nearby think better of you (+5).",
        blocked: lacks(30),
        apply: (g, n) => {
          pay(g, n, 30);
          g.nation(n).market.stock.grain += 60;
          for (const x of nativeNeighbours(g, n))
            (g.nation(x).relations[n] ??= []).push({
              of: -1,
              why: "Bought our corn",
              value: 5,
              until: g.s.day + 3 * DAYS_PER_YEAR,
            });
        },
        ai: (g, n) => (g.s.nations[n].gold >= 30 ? 3 : 0),
      },
      {
        label: () => "Send men to fish and forage",
        tip: () =>
          "+35 grain and fish now; everything else produced falls 15% for three months.",
        apply: (g, n) => {
          g.nation(n).market.stock.fish += 35;
          mod(g, n, "forage", "Men away foraging", 0.25, { production: -0.15 });
        },
        ai: () => 2,
      },
      {
        label: () => "Ration what we have",
        tip: () => "Nothing changes now; +10 unrest everywhere for six months.",
        apply: (g, n) =>
          mod(g, n, "rationing", "Rationing", 0.5, { unrest: 10 }),
        ai: (g, n) => (trait(g, n, "greedy") ? 3 : 1),
      },
    ],
  },
  {
    key: "inspector",
    who: "power",
    cooldown: 4 * DAYS_PER_YEAR,
    when: (g, n) => {
      const corr = corruption(g.s, g.w, n).total;
      const favor = g.s.nations[n].favor;
      return (corr >= 0.12 || favor < 40) && yearOf(g.s) >= 1612
        ? { corr: Math.round(corr * 100) }
        : null;
    },
    title: () => "A royal inspector arrives",
    body: (g, n, c) =>
      `The crown has sent an inspector to look at the colony's books${c.corr > 0 ? `, where ${c.corr}% of the taxes go astray` : ""}. He is thorough, and he writes long letters home.`,
    choices: [
      {
        label: () => "Open the books to him",
        tip: () => "−20 gold in back payments; +8 crown favor for two years.",
        apply: (g, n) => {
          pay(g, n, 20);
          mod(g, n, "inspected", "Cooperated with the inspector", 2, {
            favor: 8,
          });
        },
        ai: (g, n) => (trait(g, n, "honest") || trait(g, n, "just") ? 4 : 2),
      },
      {
        label: (g, n) => `Bribe him (${bribeChance(g, n)}% to work)`,
        tip: (g, n) =>
          `−40 gold. Works ${bribeChance(g, n)}% of the time (5% for each point of your intrigue, ${Math.round(realmSkill(g.s, n, "int").total)}): then +5 favor. If he refuses: −15 favor.`,
        blocked: lacks(40),
        apply: (g, n) => {
          pay(g, n, 40);
          if (check(g, bribeChance(g, n) / 100))
            mod(g, n, "bribed", "A friendly report to the crown", 2, {
              favor: 5,
            });
          else
            mod(g, n, "bribe-failed", "Tried to bribe the inspector", 3, {
              favor: -15,
            });
        },
        ai: (g, n) => (trait(g, n, "deceitful") ? 4 : 1),
      },
      {
        label: () => "Send him home",
        tip: () => "−15 crown favor for three years; +5 autonomy.",
        apply: (g, n) =>
          mod(g, n, "expelled-inspector", "Expelled the inspector", 3, {
            favor: -15,
            autonomy: 5,
          }),
        ai: (g, n) => (trait(g, n, "ambitious") ? 2 : 0.5),
      },
    ],
  },
  {
    key: "boom",
    who: "power",
    cooldown: 6 * DAYS_PER_YEAR,
    when: (g, n) => {
      const s = g.s;
      for (const good of ["tobacco", "sugar", "furs"] as const) {
        const made = provincesOf(s, n).reduce(
          (m, p) => m + (s.provinces[p].made[good] ?? 0),
          0,
        );
        if (made >= 12 && s.europe.price[good] >= EUROPE_PRICE[good] * 0.85)
          return {
            good: ["tobacco", "sugar", "furs"].indexOf(good),
            made: Math.round(made),
          };
      }
      return null;
    },
    title: (_g, _n, c) => `${["Tobacco", "Sugar", "Furs"][c.good]} fever`,
    body: (_g, _n, c) =>
      `Europe can't get enough of our ${["tobacco", "sugar", "furs"][c.good]}: ${c.made} loads a month and every ship sells out. The planters and merchants are getting rich, and they know it.`,
    choices: [
      {
        label: () => "Tax the boom",
        tip: (_g, _n, c) =>
          `+${c.made * 3} gold now; gentry and merchants resent it (+5 unrest for a year).`,
        apply: (g, n, c) => {
          g.nation(n).gold += c.made * 3;
          mod(g, n, "boom-tax", "Taxed the boom", 1, { unrest: 5 });
        },
        ai: (g, n) => (trait(g, n, "greedy") ? 4 : 2),
      },
      {
        label: () => "Let them grow rich",
        tip: () =>
          "+10% production for two years; +5 autonomy (rich colonists want a say).",
        apply: (g, n) =>
          mod(g, n, "boom", "Boom times", 2, { production: 0.1, autonomy: 5 }),
        ai: () => 2,
      },
    ],
  },
  {
    key: "dissenters",
    who: "power",
    cooldown: 60 * DAYS_PER_YEAR,
    when: (g, n) => {
      const nation = g.s.nations[n];
      return nation.key === "england" &&
        yearOf(g.s) >= 1620 &&
        !nation.independent
        ? {}
        : null;
    },
    title: () => "Puritans ask for passage",
    body: () =>
      "Thousands of Puritans, out of favor with the Church of England, want to sail for the colonies and build a godly commonwealth of their own.",
    choices: [
      {
        label: () => "Welcome them",
        tip: () =>
          "+80% settlers from home for ten years, many of them Puritans (other-faith unrest where they settle). −5 crown favor for five years.",
        apply: (g, n) => {
          mod(g, n, "great-migration", "The Great Migration", 10, {
            colonists: 0.8,
          });
          mod(g, n, "puritans", "Welcomed the Puritans", 5, { favor: -5 });
        },
        ai: () => 3,
      },
      {
        label: () => "Turn them away",
        tip: () => "+5 crown favor for five years. Fewer settlers.",
        apply: (g, n) =>
          mod(g, n, "no-puritans", "Turned away the Puritans", 5, { favor: 5 }),
        ai: (g, n) => (trait(g, n, "zealous") ? 3 : 1),
      },
    ],
  },
  {
    key: "heir",
    who: "power",
    cooldown: 200,
    when: (g, n) => {
      const s = g.s;
      const ruler = rulerOf(s, n);
      if (!ruler) return null;
      for (const id of ruler.children) {
        const c = s.chars[id];
        if (!c?.alive) continue;
        const age = (s.day - c.born) / DAYS_PER_YEAR;
        if (age >= ADULT_AGE && age < ADULT_AGE + 31 / DAYS_PER_YEAR)
          return { c: id };
      }
      return null;
    },
    title: (g, _n, c) => `${charName(g.s.chars[c.c])} comes of age`,
    body: (g, _n, c) =>
      `${charName(g.s.chars[c.c])} is sixteen. How should they be prepared for the life ahead?`,
    choices: [
      {
        label: () => "Teach them to govern",
        tip: () => "+2 Stewardship, +1 Diplomacy.",
        apply: (g, _n, c) => {
          const ch = g.char(c.c);
          ch.stats.ste += 2;
          ch.stats.dip += 1;
        },
        ai: () => 2,
      },
      {
        label: () => "Send them to the militia",
        tip: () => "+3 Martial.",
        apply: (g, _n, c) => {
          g.char(c.c).stats.mar += 3;
        },
        ai: (g, n) => (trait(g, n, "brave") ? 3 : 1),
      },
      {
        label: () => "Send them to study in Europe",
        tip: () =>
          "−25 gold. +2 Learning, +1 Intrigue, and may come back Educated.",
        blocked: lacks(25),
        apply: (g, n, c) => {
          pay(g, n, 25);
          const ch = g.char(c.c);
          ch.stats.lea += 2;
          ch.stats.int += 1;
          if (!ch.traits.includes("educated") && ch.traits.length < 4)
            ch.traits.push("educated");
        },
        ai: (g, n) => (g.s.nations[n].gold > 100 ? 2 : 0),
      },
    ],
  },
  {
    key: "proposal",
    who: "power",
    cooldown: 3 * DAYS_PER_YEAR,
    when: (g, n) => {
      const s = g.s;
      const ruler = rulerOf(s, n);
      if (!ruler) return null;
      const single = [ruler, ...ruler.children.map((id) => s.chars[id])].find(
        (c) =>
          c?.alive &&
          c.spouse < 0 &&
          ageOf(s, c) >= ADULT_AGE &&
          ageOf(s, c) < 45,
      );
      if (!single) return null;
      for (const other of s.nations) {
        if (other.kind !== "power" || other.id === n || !other.alive) continue;
        if (relationOf(s, g.w, other.id, n).total < 0) continue;
        const theirRuler = rulerOf(s, other.id);
        const match = [
          theirRuler,
          ...(theirRuler?.children ?? []).map((id) => s.chars[id]),
        ].find(
          (c) =>
            c?.alive &&
            c.spouse < 0 &&
            c.female !== single.female &&
            ageOf(s, c) >= ADULT_AGE &&
            ageOf(s, c) < 45 &&
            c.id !== theirRuler?.id,
        );
        if (match) return { a: single.id, b: match.id, from: other.id };
      }
      return null;
    },
    title: (g, _n, c) => `A match from ${g.s.nations[c.from].name}`,
    body: (g, _n, c) =>
      `The governor of ${g.s.nations[c.from].name} proposes a marriage between ${charName(g.s.chars[c.a])} and ${charName(g.s.chars[c.b])}.`,
    choices: [
      {
        label: () => "Accept the match",
        tip: (g, _n, c) =>
          `They marry; both colonies think better of each other (+20 for twenty years). ${charName(g.s.chars[c.b])} joins your family.`,
        apply: (g, n, c) => {
          const a = g.char(c.a);
          const b = g.char(c.b);
          if (!a.alive || !b.alive || a.spouse >= 0 || b.spouse >= 0) return;
          a.spouse = b.id;
          b.spouse = a.id;
          if (b.female) b.family = a.family;
          b.nation = n;
          const mine = g.nation(n);
          const theirs = g.nation(c.from);
          (mine.relations[c.from] ??= []).push({
            of: -1,
            why: "Marriage ties",
            value: 20,
            until: g.s.day + 20 * DAYS_PER_YEAR,
          });
          (theirs.relations[n] ??= []).push({
            of: -1,
            why: "Marriage ties",
            value: 20,
            until: g.s.day + 20 * DAYS_PER_YEAR,
          });
          g.event({ k: "married", day: g.s.day, n, a: a.id, b: b.id });
        },
        ai: () => 3,
      },
      {
        label: () => "Decline politely",
        tip: (g, _n, c) =>
          `${g.s.nations[c.from].name} is a little offended (−5 for three years).`,
        apply: (g, n, c) => {
          (g.nation(c.from).relations[n] ??= []).push({
            of: -1,
            why: "Refused our marriage offer",
            value: -5,
            until: g.s.day + 3 * DAYS_PER_YEAR,
          });
        },
        ai: () => 1,
      },
    ],
  },
  {
    key: "hurricane",
    who: "power",
    cooldown: 300,
    when: (g, n) => {
      const s = g.s;
      const month = dateOf(s.day).month;
      const coast = provincesOf(s, n).filter((p) => {
        const d = g.map.provinces[p];
        return d.coastal && isHurricaneSeason(d.lat, d.lon, month);
      });
      if (coast.length === 0) return null;
      // Hurricane season: about one strike in four months on these coasts.
      if (!check(g, 0.25)) return null;
      return { p: coast[g.rng.int(0, coast.length - 1)] };
    },
    title: (g, _n, c) => `A hurricane hits ${name(g, c.p)}`,
    body: (g, _n, c) =>
      `It's hurricane season (August to October), when about one month in four brings a storm to the Caribbean and Gulf coasts. This one tore through ${name(g, c.p)}: roofs gone, fields flattened, ships wrecked in the harbour.`,
    choices: [
      {
        label: () => "Rebuild at once",
        tip: () => "−30 gold; the damage is mostly repaired.",
        blocked: lacks(30),
        apply: (g, n, c) => {
          pay(g, n, 30);
          g.prov(c.p).devastation = Math.max(
            g.s.provinces[c.p].devastation,
            0.1,
          );
        },
        ai: (g, n) => (g.s.nations[n].gold > 80 ? 3 : 0),
      },
      {
        label: () => "Let them rebuild themselves",
        tip: () =>
          "40% war-like damage to the province's output (heals slowly); +10 unrest there for a year.",
        apply: (g, _n, c) => {
          g.prov(c.p).devastation = Math.max(
            g.s.provinces[c.p].devastation,
            0.4,
          );
          pmod(g, c.p, "hurricane", "Left to rebuild after the hurricane", 1, {
            unrest: 10,
          });
        },
        ai: () => 1,
      },
    ],
  },
  {
    key: "winter",
    who: "power",
    cooldown: DAYS_PER_YEAR,
    when: (g, n) => {
      const s = g.s;
      const month = dateOf(s.day).month;
      const nation = s.nations[n];
      const north = provincesOf(s, n).filter(
        (p) => isWinter(g.map.provinces[p].lat, month) && g.w.northern[p],
      );
      if (north.length === 0) return null;
      if (
        nation.market.stock.grain + nation.market.stock.fish >
        nation.market.demand.grain * 1.5
      )
        return null;
      return { p: north[0] };
    },
    title: () => "A hard winter",
    body: (g, _n, c) =>
      `Snow lies deep around ${name(g, c.p)} and the warehouses hold less than two months' food. Families are burning their fences for warmth.`,
    choices: [
      {
        label: () => "Open the warehouses",
        tip: () =>
          "Share out the stores: −25% of the grain stock, −5 unrest for six months.",
        apply: (g, n) => {
          const m = g.nation(n).market;
          m.stock.grain *= 0.75;
          mod(g, n, "shared", "Shared the winter stores", 0.5, { unrest: -5 });
        },
        ai: (g, n) => (trait(g, n, "generous") ? 4 : 2),
      },
      {
        label: () => "Every family for itself",
        tip: () => "3% of the laborers in the north die of cold and hunger.",
        apply: (g, n) => {
          for (const p of provincesOf(g.s, n)) {
            if (!g.w.northern[p]) continue;
            for (const pop of g.prov(p).pops)
              if (pop.cls === "laborers") pop.size *= 0.97;
          }
        },
        ai: (g, n) => (trait(g, n, "greedy") || trait(g, n, "cruel") ? 3 : 1),
      },
    ],
  },
  {
    key: "embassy",
    who: "power",
    cooldown: 4 * DAYS_PER_YEAR,
    when: (g, n) => {
      for (const x of nativeNeighbours(g, n)) {
        if (
          relationOf(g.s, g.w, x, n).total >= 40 &&
          !treatyBetween(g.s, n, x, "alliance")
        )
          return { x };
      }
      return null;
    },
    title: (g, _n, c) => `An embassy from the ${g.s.nations[c.x].name}`,
    body: (g, _n, c) =>
      `${charName(rulerOf(g.s, c.x))} sends speakers bearing wampum and furs. They speak of friendship, and of enemies you might share.`,
    choices: [
      {
        label: () => "Swear an alliance",
        tip: () => "An alliance: each of you joins the other's defensive wars.",
        apply: (g, n, c) => {
          if (!treatyBetween(g.s, n, c.x, "alliance")) {
            g.s.treaties.push({
              kind: "alliance",
              a: n,
              b: c.x,
              since: g.s.day,
            });
            g.treatiesChanged();
            g.event({ k: "treaty", day: g.s.day, n, with: c.x, t: "alliance" });
          }
        },
        ai: (g, n) =>
          trait(g, n, "tolerant") || trait(g, n, "honest") ? 3 : 1,
      },
      {
        label: () => "Exchange gifts",
        tip: () => "−15 gold; they think better of you (+15 for three years).",
        blocked: lacks(15),
        apply: (g, n, c) => {
          pay(g, n, 15);
          (g.nation(c.x).relations[n] ??= []).push({
            of: -1,
            why: "Exchanged gifts",
            value: 15,
            until: g.s.day + 3 * DAYS_PER_YEAR,
          });
        },
        ai: () => 2,
      },
      {
        label: () => "Send them away politely",
        tip: () => "Nothing changes.",
        apply: () => {},
        ai: (g, n) => (trait(g, n, "zealous") ? 3 : 0.5),
      },
    ],
  },
  {
    key: "resigns",
    who: "power",
    cooldown: DAYS_PER_YEAR,
    when: (g, n) => {
      const s = g.s;
      const nation = s.nations[n];
      for (const seat of Object.keys(
        nation.council,
      ) as (keyof typeof nation.council)[]) {
        const c = s.chars[nation.council[seat]];
        if (c?.alive && !c.scheme && opinion(g, c.id) < -40) return { c: c.id };
      }
      return null;
    },
    title: (g, _n, c) => `${charName(g.s.chars[c.c])} threatens to resign`,
    body: (g, _n, c) =>
      `${charName(g.s.chars[c.c])} has had enough of serving you (opinion ${opinion(g, c.c)}) and says so to anyone who will listen.`,
    choices: [
      {
        label: () => "Promise them land",
        tip: () => "−25 gold; their opinion of you +30 for five years.",
        blocked: lacks(25),
        apply: (g, n, c) => {
          pay(g, n, 25);
          remember(g, g.char(c.c), {
            of: -1,
            why: "Promised land",
            value: 30,
            years: 5,
          });
        },
        ai: (g, n) => (g.s.nations[n].gold > 60 ? 2 : 0),
      },
      {
        label: () => "Let them go",
        tip: () => "Their seat on the council is empty until you fill it.",
        apply: (g, n, c) => {
          const nation = g.nation(n);
          for (const seat of Object.keys(
            nation.council,
          ) as (keyof typeof nation.council)[])
            if (nation.council[seat] === c.c) nation.council[seat] = -1;
          if (!nation.court.includes(c.c)) nation.court.push(c.c);
        },
        ai: () => 1,
      },
    ],
  },
  {
    key: "privateers",
    who: "power",
    cooldown: 2 * DAYS_PER_YEAR,
    when: (g, n) => {
      const s = g.s;
      const atWarInEurope = Object.keys(s.europe.wars).some((k) =>
        k.split("-").map(Number).includes(n),
      );
      return atWarInEurope && s.nations[n].convoys.length > 0 ? {} : null;
    },
    title: () => "Privateers on the sea lanes",
    body: () =>
      "With the crowns at war, enemy privateers prowl the routes our convoys sail. The merchants want protection.",
    choices: [
      {
        label: () => "Pay for armed escorts",
        tip: () => "−25 gold.",
        blocked: lacks(25),
        apply: (g, n) => pay(g, n, 25),
        ai: (g, n) => (g.s.nations[n].gold > 50 ? 3 : 0),
      },
      {
        label: () => "Let the merchants take their chances",
        tip: () =>
          "Merchants lose a fifth of their savings to captured ships; +5 unrest for a year.",
        apply: (g, n) => {
          for (const p of provincesOf(g.s, n))
            for (const pop of g.prov(p).pops)
              if (pop.cls === "merchants") pop.wealth *= 0.8;
          mod(g, n, "privateers", "Ships lost to privateers", 1, { unrest: 5 });
        },
        ai: () => 1,
      },
    ],
  },
  {
    key: "mission",
    who: "power",
    cooldown: 8 * DAYS_PER_YEAR,
    when: (g, n) => {
      const s = g.s;
      const nation = s.nations[n];
      if (nation.religion !== "catholic") return null;
      const p = bestProvince(g, n, (q) =>
        tribesfolk(s.provinces[q]) > 500 && !(s.provinces[q].b.church ?? 0)
          ? tribesfolk(s.provinces[q])
          : 0,
      );
      return p >= 0 ? { p } : null;
    },
    title: () => "Missionaries ask leave to preach",
    body: (g, _n, c) =>
      `Friars want to build a mission among the native people living at ${name(g, c.p)}.`,
    choices: [
      {
        label: () => "Grant it",
        tip: () =>
          "A church is built there free; a fifth of the natives there take up the faith. Native nations nearby are wary (−5). +5 crown favor.",
        apply: (g, n, c) => {
          const pr = g.prov(c.p);
          pr.b.church = Math.max(1, pr.b.church ?? 0);
          for (const pop of [...pr.pops]) {
            if (pop.cls !== "tribe" || pop.religion !== "native") continue;
            const converts = pop.size * 0.2;
            pop.size -= converts;
            pr.pops.push({
              ...pop,
              religion: g.s.nations[n].religion,
              size: converts,
              met: [...pop.met] as typeof pop.met,
            });
          }
          merge(pr.pops);
          for (const x of nativeNeighbours(g, n))
            (g.nation(x).relations[n] ??= []).push({
              of: -1,
              why: "Missionaries among our people",
              value: -5,
              until: g.s.day + 5 * DAYS_PER_YEAR,
            });
          mod(g, n, "missions", "Spread the faith", 3, { favor: 5 });
        },
        ai: (g, n) => (trait(g, n, "zealous") ? 5 : 2),
      },
      {
        label: () => "Refuse",
        tip: () => "−5 crown favor for three years.",
        apply: (g, n) =>
          mod(g, n, "no-missions", "Refused the missionaries", 3, {
            favor: -5,
          }),
        ai: (g, n) => (trait(g, n, "tolerant") ? 3 : 0.5),
      },
    ],
  },
  {
    key: "silver",
    who: "power",
    cooldown: 15 * DAYS_PER_YEAR,
    when: (g, n) => {
      const p = bestProvince(g, n, (q) =>
        g.w.raw[q] === "silver" && (g.s.provinces[q].b.mine ?? 0) > 0
          ? 1 + settlers(g.s.provinces[q])
          : 0,
      );
      return p >= 0 ? { p } : null;
    },
    title: (g, _n, c) => `A rich vein at ${name(g, c.p)}`,
    body: () =>
      "The miners have struck a vein of silver richer than anything yet found.",
    choices: [
      {
        label: () => "Work it day and night",
        tip: () =>
          "+40% output in that province for three years; +12 unrest there.",
        apply: (g, _n, c) =>
          pmod(g, c.p, "silver-rush", "Silver rush", 3, {
            production: 0.4,
            unrest: 12,
          }),
        ai: (g, n) =>
          trait(g, n, "greedy") || trait(g, n, "ambitious") ? 4 : 2,
      },
      {
        label: () => "Mine it at a steady pace",
        tip: () => "+20% output there for six years.",
        apply: (g, _n, c) =>
          pmod(g, c.p, "silver-vein", "A rich silver vein", 6, {
            production: 0.2,
          }),
        ai: () => 2,
      },
    ],
  },
  {
    key: "furs-gone",
    who: "power",
    cooldown: 5 * DAYS_PER_YEAR,
    when: (g, n) => {
      const p = bestProvince(g, n, (q) =>
        g.s.provinces[q].depletion > 0.5 ? g.s.provinces[q].depletion : 0,
      );
      return p >= 0 ? { p } : null;
    },
    title: (g, _n, c) => `The beaver are gone from ${name(g, c.p)}`,
    body: (g, _n, c) =>
      `Years of trapping have emptied the streams around ${name(g, c.p)} (${Math.round(g.s.provinces[c.p].depletion * 100)}% trapped out). The trappers want to push into native hunting grounds.`,
    choices: [
      {
        label: () => "Push the trappers west",
        tip: () =>
          "The grounds recover by a quarter; native nations nearby resent it (−10 for five years).",
        apply: (g, n, c) => {
          g.prov(c.p).depletion = Math.max(
            0,
            g.s.provinces[c.p].depletion - 0.25,
          );
          for (const x of nativeNeighbours(g, n))
            (g.nation(x).relations[n] ??= []).push({
              of: -1,
              why: "Trappers on our hunting grounds",
              value: -10,
              until: g.s.day + 5 * DAYS_PER_YEAR,
            });
        },
        ai: (g, n) => (trait(g, n, "greedy") ? 3 : 1),
      },
      {
        label: () => "Let the grounds rest",
        tip: () => "Nothing changes; the grounds recover slowly.",
        apply: () => {},
        ai: () => 2,
      },
    ],
  },
  {
    key: "ship",
    who: "power",
    cooldown: 3 * DAYS_PER_YEAR,
    when: (g, n) =>
      g.s.nations[n].favor >= 60 && !g.s.nations[n].independent ? {} : null,
    title: () => "A shipload of settlers",
    body: () =>
      "Pleased with the colony, the crown has paid passage for two hundred settlers. Where should they go?",
    choices: [
      {
        label: () => "To the capital",
        tip: (g, n) => `+200 settlers at ${name(g, g.s.nations[n].capital)}.`,
        apply: (g, n) => addSettlers(g, n, g.s.nations[n].capital, 200),
        ai: () => 1,
      },
      {
        label: () => "To the frontier",
        tip: (g, n) => {
          const p = frontier(g, n);
          return p >= 0
            ? `+200 settlers at ${name(g, p)}, the province with the most room.`
            : "+200 settlers where there's most room.";
        },
        apply: (g, n) => addSettlers(g, n, frontier(g, n), 200),
        ai: () => 2,
      },
    ],
  },
  {
    key: "assembly",
    who: "power",
    cooldown: 80 * DAYS_PER_YEAR,
    when: (g, n) => {
      const s = g.s;
      const folk = provincesOf(s, n).reduce(
        (m, p) => m + settlers(s.provinces[p]),
        0,
      );
      return yearOf(s) >= 1619 && folk >= 2000 && !s.nations[n].independent
        ? { folk: Math.round(folk) }
        : null;
    },
    title: () => "The settlers want an assembly",
    body: (_g, _n, c) =>
      `${c.folk.toLocaleString("en-US")} settlers now live in the colony, and the leading men want a say in its laws, as Englishmen have at home.`,
    choices: [
      {
        label: () => "Grant an assembly",
        tip: () => "−5 unrest everywhere for good; +10 autonomy for good.",
        apply: (g, n) =>
          mod(g, n, "assembly", "An elected assembly", 200, {
            unrest: -5,
            autonomy: 10,
          }),
        ai: (g, n) => (trait(g, n, "just") || trait(g, n, "content") ? 3 : 1.5),
      },
      {
        label: () => "Rule by decree",
        tip: () => "+8 unrest for five years; +5 crown favor for five years.",
        apply: (g, n) =>
          mod(g, n, "decree", "Rule by decree", 5, { unrest: 8, favor: 5 }),
        ai: (g, n) =>
          trait(g, n, "ambitious") || trait(g, n, "cruel") ? 3 : 1,
      },
    ],
  },
  {
    key: "charter-review",
    who: "power",
    cooldown: 5 * DAYS_PER_YEAR,
    when: (g, n) => {
      const nation = g.s.nations[n];
      return nation.favor < 15 && !nation.independent && !nation.rebelling
        ? {}
        : null;
    },
    title: () => "Summoned to court",
    body: (g, n) =>
      `The crown has lost patience. ${charName(rulerOf(g.s, n))} is summoned home to explain the colony's failings; the charter itself is in question.`,
    choices: [
      {
        label: (g, n) => `Plead in person (${pleadChance(g, n)}% to succeed)`,
        tip: (g, n) =>
          `−40 gold for the voyage. Succeeds ${pleadChance(g, n)}% of the time (6% for each point of diplomacy, ${Math.round(realmSkill(g.s, n, "dip").total)}): +25 favor. Fails: the crown names a new governor.`,
        blocked: lacks(40),
        apply: (g, n) => {
          pay(g, n, 40);
          if (check(g, pleadChance(g, n) / 100))
            mod(g, n, "pleaded", "Won back the crown's trust", 3, {
              favor: 25,
            });
          else recall(g, n);
        },
        ai: (g, n) => (g.s.nations[n].gold >= 40 ? 3 : 0),
      },
      {
        label: () => "Bribe the courtiers",
        tip: () => "−100 gold; +15 favor for three years.",
        blocked: lacks(100),
        apply: (g, n) => {
          pay(g, n, 100);
          mod(g, n, "bribed-court", "Friends at court", 3, { favor: 15 });
        },
        ai: (g, n) => (g.s.nations[n].gold >= 100 ? 2 : 0),
      },
      {
        label: () => "Ignore the summons",
        tip: () =>
          "The crown names a new governor from your council. You carry on as them.",
        apply: (g, n) => recall(g, n),
        ai: () => 0.2,
      },
    ],
  },
  {
    key: "frontier",
    who: "power",
    cooldown: 3 * DAYS_PER_YEAR,
    when: (g, n) => {
      for (const x of nativeNeighbours(g, n)) {
        const r = relationOf(g.s, g.w, x, n).total;
        if (r <= -40) return { x, r };
      }
      return null;
    },
    title: (g, _n, c) => `Trouble with the ${g.s.nations[c.x].name}`,
    body: (g, _n, c) =>
      `Traders bring warnings: the ${g.s.nations[c.x].name} are angry (opinion ${c.r}) and their young men talk of war. Settlers on the frontier are afraid.`,
    choices: [
      {
        label: () => "Send gifts and talk",
        tip: () => "−25 gold; their opinion of you +20 for three years.",
        blocked: lacks(25),
        apply: (g, n, c) => {
          pay(g, n, 25);
          (g.nation(c.x).relations[n] ??= []).push({
            of: -1,
            why: "Gifts to keep the peace",
            value: 20,
            until: g.s.day + 3 * DAYS_PER_YEAR,
          });
        },
        ai: (g, n) => (g.s.nations[n].gold > 50 ? 3 : 0.5),
      },
      {
        label: () => "Arm the frontier",
        tip: () =>
          "−15 gold; −10 unrest on the frontier for a year. They'll take it as a threat (−10).",
        blocked: lacks(15),
        apply: (g, n, c) => {
          pay(g, n, 15);
          mod(g, n, "armed-frontier", "An armed frontier", 1, { unrest: -10 });
          (g.nation(c.x).relations[n] ??= []).push({
            of: -1,
            why: "Armed settlers on our border",
            value: -10,
            until: g.s.day + 3 * DAYS_PER_YEAR,
          });
        },
        ai: (g, n) => (trait(g, n, "brave") || trait(g, n, "cruel") ? 3 : 1),
      },
    ],
  },
  {
    key: "fever",
    who: "power",
    cooldown: 2 * DAYS_PER_YEAR,
    when: (g, n) => {
      const s = g.s;
      const month = dateOf(s.day).month;
      const p = bestProvince(g, n, (q) =>
        g.w.tropical[q] &&
        isFeverSeason(g.map.provinces[q].lat, month) &&
        settlers(s.provinces[q]) > 2500 &&
        (s.provinces[q].b.port ?? 0) > 0
          ? settlers(s.provinces[q])
          : 0,
      );
      return p >= 0 ? { p } : null;
    },
    title: (g, _n, c) => `Yellow fever at ${name(g, c.p)}`,
    body: (g, _n, c) =>
      `Ships from the fever coasts have brought yellow fever to ${name(g, c.p)}'s crowded harbour in the wet season.`,
    choices: [
      {
        label: () => "Quarantine the port",
        tip: () =>
          "The province's output falls 25% for four months; the fever stays small.",
        apply: (g, _n, c) => {
          pmod(g, c.p, "quarantine", "Quarantine", 1 / 3, {
            production: -0.25,
          });
          pmod(g, c.p, "fever", "Yellow fever (quarantined)", 1 / 3, {
            disease: 0.02,
          });
        },
        ai: (g, n) => (realmSkill(g.s, n, "lea").total >= 8 ? 3 : 1),
      },
      {
        label: () => "Keep the port open",
        tip: () =>
          "Trade carries on; the fever spreads (about three times the deaths, for four months).",
        apply: (g, _n, c) =>
          pmod(g, c.p, "fever", "Yellow fever", 1 / 3, { disease: 0.06 }),
        ai: (g, n) => (trait(g, n, "greedy") ? 3 : 1),
      },
    ],
  },
  {
    key: "smallpox",
    who: "native",
    cooldown: 25 * DAYS_PER_YEAR,
    when: (g, n) => {
      const s = g.s;
      // Carried in by trade or by crowded colonies next door.
      for (const t of s.treaties) {
        if (t.kind === "trade" && (t.a === n || t.b === n))
          return { via: t.a === n ? t.b : t.a, trade: 1 };
      }
      for (const p of provincesOf(s, n)) {
        for (const [q] of g.map.provinces[p].nb) {
          const o = s.provinces[q].owner;
          if (
            o >= 0 &&
            s.nations[o].kind === "power" &&
            settlers(s.provinces[q]) > 1500
          )
            return { via: o, trade: 0 };
        }
      }
      return null;
    },
    title: (g, n) => `Smallpox among the ${g.s.nations[n].name}`,
    body: (g, n, c) =>
      `Smallpox, carried ${c.trade ? "along the trade routes" : "from the crowded settlements"} of ${g.s.nations[c.via].name}, is sweeping through the ${g.s.nations[n].name}.`,
    choices: [
      {
        label: () => "Endure",
        tip: () => "A heavy toll for a year.",
        apply: (g, n, c) => {
          for (const p of provincesOf(g.s, n))
            pmod(
              g,
              p,
              "smallpox",
              `Smallpox (from ${g.s.nations[c.via].name})`,
              1,
              { disease: 0.025 },
            );
          g.event({
            k: "story",
            day: g.s.day,
            n: c.via,
            title: `Smallpox among the ${g.s.nations[n].name}`,
            text: `Smallpox spread from our people to the ${g.s.nations[n].name}. Their villages are emptying.`,
          });
        },
        ai: () => 1,
      },
    ],
  },
];

function opinion(g: ConquestGame, c: number): number {
  const ch = g.s.chars[c];
  return ch ? opinionOfRuler(g.s, ch).total : 0;
}

function bribeChance(g: ConquestGame, n: number): number {
  return Math.max(
    5,
    Math.min(90, Math.round(realmSkill(g.s, n, "int").total * 5)),
  );
}

function pleadChance(g: ConquestGame, n: number): number {
  return Math.max(
    5,
    Math.min(90, Math.round(realmSkill(g.s, n, "dip").total * 6)),
  );
}

function recall(g: ConquestGame, n: number): void {
  const s = g.s;
  const ruler = rulerOf(s, n);
  g.event({
    k: "crown",
    day: s.day,
    n,
    text: `${charName(ruler)} has been recalled to Europe in disgrace.`,
  });
  if (ruler) {
    const r = g.touchChar(ruler);
    r.alive = false;
    r.died = { day: s.day, cause: "recalled to Europe in disgrace" };
  }
  succession(g, n, "appointed by the crown after the recall");
  mod(g, n, "recalled", "A fresh start with the crown", 2, { favor: 20 });
}

function frontier(g: ConquestGame, n: number): number {
  const s = g.s;
  let best = s.nations[n].capital;
  let room = -Infinity;
  for (const p of provincesOf(s, n)) {
    const r = g.w.capacity[p] - settlers(s.provinces[p]);
    if (r > room && s.provinces[p].occupier < 0) {
      room = r;
      best = p;
    }
  }
  return best;
}

function addSettlers(
  g: ConquestGame,
  n: number,
  p: number,
  count: number,
): void {
  if (p < 0) return;
  const nation = g.s.nations[n];
  const pr = g.prov(p);
  pr.pops.push(...settlerPops(nation.culture, nation.religion, count));
  merge(pr.pops);
}

// ---------------------------------------------------------------- running them

export function eventsMonthly(g: ConquestGame): void {
  const s = g.s;
  for (const nation of s.nations) {
    if (!nation.alive || nation.kind === "crown") continue;
    if (nation.events.length >= 3) continue;
    // One new event a month at most, checked in a rotating order.
    const start = (dateOf(s.day).month + nation.id) % EVENTS.length;
    for (let i = 0; i < EVENTS.length; i++) {
      const def = EVENTS[(start + i) % EVENTS.length];
      if (def.who !== nation.kind) continue;
      if ((nation.cooldowns[def.key] ?? 0) > s.day) continue;
      const ctx = def.when(g, nation.id);
      if (!ctx) continue;
      g.nation(nation.id).cooldowns[def.key] = s.day + def.cooldown;
      fire(g, nation.id, def, ctx);
      break;
    }
  }
}

/** Events added by other modules (expeditions), looked up like the rest. */
export function registerEvents(defs: EventDef[]): void {
  for (const d of defs)
    if (!EVENTS.some((e) => e.key === d.key)) EVENTS.push(d);
}

/**
 * Puts an event to a nation: a player gets a letter; the computer picks the
 * way its governor leans.
 */
export function raiseEvent(
  g: ConquestGame,
  n: number,
  def: EventDef,
  ctx: Ctx,
): void {
  fire(g, n, def, ctx);
}

function fire(g: ConquestGame, n: number, def: EventDef, ctx: Ctx): void {
  const s = g.s;
  const nation = g.nation(n);
  if (nation.player === null) {
    const options = def.choices.map((c, i) => ({
      i,
      w: c.blocked?.(g, n, ctx) ? 0 : Math.max(0, c.ai(g, n, ctx)),
    }));
    const total = options.reduce((m, o) => m + o.w, 0);
    let pick = options.find((o) => o.w > 0)?.i ?? 0;
    if (total > 0) {
      let roll = g.rng.next() * total;
      for (const o of options) {
        roll -= o.w;
        if (roll <= 0) {
          pick = o.i;
          break;
        }
      }
    }
    def.choices[pick].apply(g, n, ctx);
    return;
  }
  const ev: PendingEvent = {
    id: g.nextId(),
    key: def.key,
    day: s.day,
    // Players' letters are timed by the server in real time; this is only a
    // backstop for games run without one.
    expires: s.day + EVENT_DAYS,
    title: def.title(g, n, ctx),
    body: def.body(g, n, ctx),
    choices: def.choices.map((c) => {
      const why = c.blocked?.(g, n, ctx) ?? null;
      return {
        label: c.label(g, n, ctx),
        tip: why ? `${c.tip(g, n, ctx)} (${why}.)` : c.tip(g, n, ctx),
      };
    }),
    ctx,
  };
  nation.events.push(ev);
}

export function eventsDaily(g: ConquestGame): void {
  const s = g.s;
  for (const nation of s.nations) {
    if (nation.events.length === 0) continue;
    for (const ev of [...nation.events]) {
      if (ev.expires > s.day) continue;
      answer(g, nation.id, ev, firstAllowed(g, nation.id, ev));
    }
  }
}

/** The council answers for a player who didn't: the first course it can take. */
export function autoAnswer(g: ConquestGame, n: number, id: number): void {
  const ev = g.s.nations[n]?.events.find((e) => e.id === id);
  if (ev) answer(g, n, ev, firstAllowed(g, n, ev));
}

function firstAllowed(g: ConquestGame, n: number, ev: PendingEvent): number {
  if (ev.key === "treaty-proposal") return 1;
  const def = EVENTS.find((d) => d.key === ev.key);
  if (!def) return 0;
  const i = def.choices.findIndex((c) => !c.blocked?.(g, n, ev.ctx));
  return i >= 0 ? i : 0;
}

export function answerEvent(
  g: ConquestGame,
  n: number,
  id: number,
  choice: number,
): string | null {
  const ev = g.s.nations[n].events.find((e) => e.id === id);
  if (!ev) return "That decision has already been made.";
  if (!Number.isInteger(choice) || choice < 0 || choice >= ev.choices.length)
    return "No such choice.";
  if (ev.key === "treaty-proposal") {
    answer(g, n, ev, choice);
    return null;
  }
  const def = EVENTS.find((d) => d.key === ev.key);
  const why = def?.choices[choice].blocked?.(g, n, ev.ctx);
  if (why) return `${why}.`;
  answer(g, n, ev, choice);
  return null;
}

function answer(
  g: ConquestGame,
  n: number,
  ev: PendingEvent,
  choice: number,
): void {
  const nation = g.nation(n);
  nation.events = nation.events.filter((e) => e.id !== ev.id);
  if (ev.key === "treaty-proposal") {
    if (choice === 0) acceptTreaty(g, ev.ctx.from, n, KINDS[ev.ctx.kind]);
    else g.event({ k: "refused", day: g.s.day, n: ev.ctx.from, by: n });
    return;
  }
  const def = EVENTS.find((d) => d.key === ev.key);
  def?.choices[choice]?.apply(g, n, ev.ctx);
}

// ---------------------------------------------------------------- treaties between players

const KINDS: TreatyKind[] = ["trade", "alliance", "access"];

/** Ask a player's nation to sign a treaty; they decide in an event. */
export function proposeTreaty(
  g: ConquestGame,
  from: number,
  to: number,
  kind: TreatyKind,
): void {
  const s = g.s;
  const target = g.nation(to);
  const names: Record<TreatyKind, string> = {
    trade: "a trade treaty",
    alliance: "an alliance",
    access: "right of passage for their armies",
  };
  target.events.push({
    id: g.nextId(),
    key: "treaty-proposal",
    day: s.day,
    expires: s.day + EVENT_DAYS,
    title: `${s.nations[from].name} proposes ${names[kind]}`,
    body: `${charName(rulerOf(s, from))} of ${s.nations[from].name} asks for ${names[kind]}.`,
    choices: [
      { label: "Agree", tip: "Sign it." },
      { label: "Refuse", tip: "Nothing changes." },
    ],
    ctx: { from, kind: KINDS.indexOf(kind) },
  });
}

function acceptTreaty(
  g: ConquestGame,
  a: number,
  b: number,
  kind: TreatyKind,
): void {
  const s = g.s;
  if (
    treatyBetween(s, a, b, kind) ||
    s.wars.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a))
  )
    return;
  s.treaties.push({ kind, a, b, since: s.day });
  g.treatiesChanged();
  g.event({ k: "treaty", day: s.day, n: a, with: b, t: kind });
}
