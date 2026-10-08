// The crowns back in Europe: how much they trust each governor, what they
// demand, the honours they hand out, the wars they start with each other
// (which drag the colonies in), and what they do to a colony that declares
// independence.

import { dateOf, dayOf } from "./Calendar";
import { kill } from "./Characters";
import { mainPort } from "./Economy";
import type { ConquestGame } from "./Game";
import {
  atWar,
  autonomyTarget,
  charName,
  favorTarget,
  independenceCheck,
  pairKey,
  provincesOf,
  rulerOf,
  warBetween,
} from "./Queries";
import {
  AUTONOMY_SPEED,
  DAYS_PER_YEAR,
  EUROPE_WAR_MIN_DAYS,
  EXPEDITION_EVERY_DAYS,
  FAVOR_SPEED,
  INTEGRATE_DAYS,
  REBELLION_WIN_DAYS,
  REGIMENTS,
  RIVALRY,
  TITLE_NAMES,
} from "./Rules";
import { Army, Command, Nation, Regiment } from "./Types";
import { endWar, startWar } from "./War";

/** Wars the crowns fought in Europe, by year. Colonies are dragged in. */
export const HISTORY: {
  a: string;
  b: string;
  from: [number, number];
  to: [number, number];
  name: string;
}[] = [
  {
    a: "netherlands",
    b: "spain",
    from: [1607, 0],
    to: [1609, 3],
    name: "The Eighty Years' War",
  },
  {
    a: "netherlands",
    b: "spain",
    from: [1621, 3],
    to: [1648, 0],
    name: "The Eighty Years' War",
  },
  {
    a: "england",
    b: "spain",
    from: [1625, 8],
    to: [1630, 10],
    name: "The Anglo-Spanish War",
  },
  {
    a: "england",
    b: "france",
    from: [1627, 5],
    to: [1629, 3],
    name: "The Anglo-French War",
  },
  {
    a: "france",
    b: "spain",
    from: [1635, 4],
    to: [1659, 10],
    name: "The Franco-Spanish War",
  },
  {
    a: "england",
    b: "netherlands",
    from: [1652, 6],
    to: [1654, 3],
    name: "The First Anglo-Dutch War",
  },
  {
    a: "england",
    b: "spain",
    from: [1655, 9],
    to: [1660, 8],
    name: "The Anglo-Spanish War",
  },
  {
    a: "england",
    b: "netherlands",
    from: [1665, 2],
    to: [1667, 6],
    name: "The Second Anglo-Dutch War",
  },
  {
    a: "england",
    b: "netherlands",
    from: [1672, 2],
    to: [1674, 1],
    name: "The Third Anglo-Dutch War",
  },
  {
    a: "france",
    b: "netherlands",
    from: [1672, 3],
    to: [1678, 7],
    name: "The Franco-Dutch War",
  },
  {
    a: "france",
    b: "england",
    from: [1689, 4],
    to: [1697, 8],
    name: "The Nine Years' War",
  },
  {
    a: "france",
    b: "netherlands",
    from: [1689, 4],
    to: [1697, 8],
    name: "The Nine Years' War",
  },
  {
    a: "france",
    b: "spain",
    from: [1689, 4],
    to: [1697, 8],
    name: "The Nine Years' War",
  },
  {
    a: "england",
    b: "france",
    from: [1702, 4],
    to: [1713, 3],
    name: "The War of the Spanish Succession",
  },
  {
    a: "netherlands",
    b: "france",
    from: [1702, 4],
    to: [1713, 3],
    name: "The War of the Spanish Succession",
  },
  {
    a: "england",
    b: "spain",
    from: [1702, 4],
    to: [1713, 3],
    name: "The War of the Spanish Succession",
  },
];

// ---------------------------------------------------------------- europe

export function europeMonthly(g: ConquestGame): void {
  const s = g.s;
  const powers = s.nations.filter(
    (n) => n.kind === "power" && n.alive && !n.independent,
  );
  const byKey = new Map(powers.map((n) => [n.key, n]));
  const today = s.day;
  // Scripted history first.
  const scripted = new Set<string>();
  for (const h of HISTORY) {
    const a = byKey.get(h.a);
    const b = byKey.get(h.b);
    if (!a || !b) continue;
    const k = pairKey(a.id, b.id);
    const from = dayOf(h.from[0], h.from[1]);
    const to = dayOf(h.to[0], h.to[1]);
    if (today >= from && today < to) {
      scripted.add(k);
      if (s.europe.wars[k] === undefined) europeWar(g, a, b, h.name);
    } else if (
      today >= to &&
      today < to + 31 &&
      s.europe.wars[k] !== undefined &&
      s.europe.wars[k] <= to
    ) {
      europePeace(g, a, b);
    }
  }
  // Tension rises with old rivalries and colonial fighting, and boils over.
  for (const a of powers) {
    for (const b of powers) {
      if (a.id >= b.id) continue;
      const k = pairKey(a.id, b.id);
      const rivalry = RIVALRY[[a.key, b.key].sort().join("-")] ?? 0.1;
      let t = s.europe.tension[k] ?? 0;
      const atWarHere = atWar(s, a.id, b.id);
      if (s.europe.wars[k] !== undefined) t -= 2.5;
      else t += rivalry + (atWarHere ? 1 : 0) - 0.3;
      t = Math.max(0, Math.min(100, Math.round(t * 10) / 10));
      s.europe.tension[k] = t;
      if (scripted.has(k)) continue;
      const started = s.europe.wars[k];
      if (started === undefined && t >= 100)
        europeWar(g, a, b, `War between ${a.name} and ${b.name}`);
      else if (
        started !== undefined &&
        today - started >= EUROPE_WAR_MIN_DAYS &&
        t < 30 &&
        !isScriptedSpan(a.key, b.key, today)
      )
        europePeace(g, a, b);
    }
  }
  g.europeChanged();
}

function isScriptedSpan(a: string, b: string, day: number): boolean {
  return HISTORY.some(
    (h) =>
      ((h.a === a && h.b === b) || (h.a === b && h.b === a)) &&
      day >= dayOf(h.from[0], h.from[1]) &&
      day < dayOf(h.to[0], h.to[1]) + 31,
  );
}

function europeWar(g: ConquestGame, a: Nation, b: Nation, name: string): void {
  const s = g.s;
  s.europe.wars[pairKey(a.id, b.id)] = s.day;
  s.europe.tension[pairKey(a.id, b.id)] = Math.max(
    s.europe.tension[pairKey(a.id, b.id)] ?? 0,
    80,
  );
  g.event({ k: "europe", day: s.day, a: a.id, b: b.id, war: true });
  if (!atWar(s, a.id, b.id))
    startWar(g, a.id, b.id, `${name} (in Europe)`, true);
  else {
    const w = warBetween(s, a.id, b.id)!;
    w.europe = true;
    g.warsChanged();
  }
  for (const [me, foe] of [
    [a, b],
    [b, a],
  ] as const) {
    if (me.rebelling) continue;
    const n = g.nation(me.id);
    n.demand = {
      key: "war",
      label: `Take a ${foe.adjective} province`,
      amount: 0,
      target: foe.id,
      made: s.day,
      due: s.day + 2 * DAYS_PER_YEAR,
    };
  }
}

/**
 * Peace in Europe. Whatever each side holds in the colonies, it keeps
 * ("as you possess"), as at Breda in 1667.
 */
function europePeace(g: ConquestGame, a: Nation, b: Nation): void {
  const s = g.s;
  delete s.europe.wars[pairKey(a.id, b.id)];
  s.europe.tension[pairKey(a.id, b.id)] = Math.min(
    s.europe.tension[pairKey(a.id, b.id)] ?? 0,
    20,
  );
  g.event({ k: "europe", day: s.day, a: a.id, b: b.id, war: false });
  const war = warBetween(s, a.id, b.id);
  if (war?.europe) {
    const keep: number[] = [];
    for (let p = 0; p < s.provinces.length; p++) {
      const pr = s.provinces[p];
      if (
        (pr.owner === a.id && pr.occupier === b.id) ||
        (pr.owner === b.id && pr.occupier === a.id)
      )
        keep.push(p);
    }
    for (const p of keep) {
      const pr = g.prov(p);
      const from = pr.owner;
      const to = pr.occupier;
      cede(g, p, to);
      g.event({ k: "ceded", day: s.day, n: to, p, from });
    }
    endWar(g, a.id, b.id);
  }
  for (const n of [a, b]) {
    if (n.demand?.key === "war") g.nation(n.id).demand = null;
  }
}

/** Hand a province over: occupation ends, the new owner integrates it. */
export function cede(g: ConquestGame, p: number, to: number): void {
  const s = g.s;
  const pr = g.prov(p);
  const from = pr.owner;
  if (from >= 0) {
    const n = g.nation(from);
    n.stats.provincesLost++;
    if (n.capital === p) {
      const left = provincesOf(s, from).filter((q) => q !== p);
      n.capital = left.length > 0 ? left[0] : -1;
    }
  }
  pr.owner = to;
  pr.occupier = -1;
  pr.siege = null;
  pr.integrate = s.day + INTEGRATE_DAYS;
  pr.build = null;
  pr.recruits = [];
  g.nation(to).stats.provincesConquered++;
  if (from >= 0 && provincesOf(s, from).length === 0) fall(g, from, to);
}

/** A nation with no land left is gone. */
export function fall(g: ConquestGame, n: number, by: number): void {
  const s = g.s;
  const nation = g.nation(n);
  nation.alive = false;
  for (const a of [...s.armies]) if (a.owner === n) g.removeArmy(a);
  for (const w of [...s.wars])
    if (w.a === n || w.b === n) endWar(g, w.a, w.b, true);
  s.treaties = s.treaties.filter((t) => t.a !== n && t.b !== n);
  g.treatiesChanged();
  g.event({ k: "fallen", day: s.day, n, by });
}

// ---------------------------------------------------------------- the crown

export function crownMonthly(g: ConquestGame): void {
  const s = g.s;
  for (const nation of s.nations) {
    if (nation.kind !== "power" || !nation.alive) continue;
    const n = g.nation(nation.id);
    n.mods = n.mods.filter((m) => m.until > s.day);
    const ft = favorTarget(s, g.w, n.id).total;
    n.favor = Math.round((n.favor + (ft - n.favor) * FAVOR_SPEED) * 10) / 10;
    const at = autonomyTarget(s, g.w, n.id).total;
    n.autonomy =
      Math.round((n.autonomy + (at - n.autonomy) * AUTONOMY_SPEED) * 10) / 10;
    if (n.rebelling) {
      rebellionMonthly(g, n.id);
      continue;
    }
    if (n.independent) continue;
    honours(g, n);
    demands(g, n);
    lowFavor(g, n);
  }
}

const TITLE_REMITTED = [0, 150, 500, 1200, 2500];

function honours(g: ConquestGame, n: Nation): void {
  const s = g.s;
  const next = n.title + 1;
  if (next >= TITLE_NAMES.length) return;
  if (n.favor < 75 || n.stats.remitted < TITLE_REMITTED[next]) return;
  if ((n.cooldowns.title ?? 0) > s.day) return;
  n.title = next;
  n.cooldowns.title = s.day + 4 * DAYS_PER_YEAR;
  g.event({
    k: "crown",
    day: s.day,
    n: n.id,
    text: `For loyal service the crown has made ${charName(rulerOf(s, n.id))} a ${TITLE_NAMES[next]}.`,
  });
  if (n.favor >= 85) {
    n.mods.push({
      key: "crown-grant",
      label: "A grant from the crown",
      until: s.day + DAYS_PER_YEAR,
      fx: {},
    });
  }
}

function demands(g: ConquestGame, n: Nation): void {
  const s = g.s;
  const d = n.demand;
  if (d) {
    if (d.key === "war" && warDemandMet(g, n.id, d.target)) {
      n.mods.push({
        key: "obeyed",
        label: "Took the fight to the crown's enemies",
        until: s.day + 3 * DAYS_PER_YEAR,
        fx: { favor: 15 },
      });
      g.event({
        k: "crown",
        day: s.day,
        n: n.id,
        text: "The crown is pleased with your victories.",
      });
      n.demand = null;
    } else if (d.due < s.day) {
      n.mods.push({
        key: "defied",
        label: `Failed the crown: ${d.label.toLowerCase()}`,
        until: s.day + 2 * DAYS_PER_YEAR,
        fx: { favor: -12 },
      });
      n.demand = null;
    }
    return;
  }
  if ((n.cooldowns.demand ?? 0) > s.day) return;
  const atWarInEurope = Object.keys(s.europe.wars).some((k) =>
    k.split("-").map(Number).includes(n.id),
  );
  if ((atWarInEurope || n.favor < 45) && n.gold > 80) {
    const amount = Math.round(
      Math.min(n.gold * 0.3, 60 + n.stats.peakPeople / 100),
    );
    n.demand = {
      key: "money",
      label: `Send ${amount} gold for the crown's ${atWarInEurope ? "war" : "debts"}`,
      amount,
      target: -1,
      made: s.day,
      due: s.day + 120,
    };
    n.cooldowns.demand = s.day + 3 * DAYS_PER_YEAR;
    g.event({
      k: "crown",
      day: s.day,
      n: n.id,
      text: `A letter from court: ${n.demand.label.toLowerCase()}.`,
    });
  }
}

function warDemandMet(g: ConquestGame, n: number, foe: number): boolean {
  return g.s.provinces.some((pr) => pr.owner === foe && pr.occupier === n);
}

function lowFavor(g: ConquestGame, n: Nation): void {
  const s = g.s;
  const has = n.mods.find((m) => m.key === "out-of-favor");
  if (n.favor < 25 && !has) {
    n.mods.push({
      key: "out-of-favor",
      label: "Out of the crown's favor",
      until: s.day + 10 * DAYS_PER_YEAR,
      fx: { colonists: -0.4, admin: -2 },
    });
    g.event({
      k: "crown",
      day: s.day,
      n: n.id,
      text: "Word from court: the crown no longer trusts you. Fewer settlers will sail, and your officials answer to London's men.",
    });
  } else if (n.favor >= 35 && has) {
    n.mods = n.mods.filter((m) => m !== has);
  }
}

// ---------------------------------------------------------------- independence

function crownOf(g: ConquestGame, n: number): number {
  return g.s.nations.findIndex((x) => x.kind === "crown" && x.colony === n);
}

function declareIndependence(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = g.nation(n);
  const crown = crownOf(g, n);
  nation.rebelling = true;
  nation.rebellion = {
    since: s.day,
    expeditions: 0,
    beaten: 0,
    capitalLost: -1,
  };
  nation.favor = 0;
  nation.demand = null;
  nation.remit = 0;
  for (const k of Object.keys(s.europe.wars)) {
    const [a, b] = k.split("-").map(Number);
    if (a === n || b === n) delete s.europe.wars[k];
  }
  if (crown >= 0) startWar(g, crown, n, "The War of Independence", false);
  g.event({ k: "independence", day: s.day, n, won: null });
}

function rebellionMonthly(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = g.nation(n);
  const r = nation.rebellion!;
  const crown = crownOf(g, n);
  // Count expeditions destroyed.
  const crownArmies = s.armies.filter((a) => a.owner === crown).length;
  if (r.expeditions > 0 && crownArmies === 0 && r.beaten < r.expeditions)
    r.beaten = r.expeditions;
  // The crown holds the capital?
  const cap = s.provinces[nation.capital];
  if (cap && cap.occupier === crown) {
    if (r.capitalLost < 0) r.capitalLost = s.day;
  } else r.capitalLost = -1;
  if (r.capitalLost >= 0 && s.day - r.capitalLost >= 180) {
    crushed(g, n);
    return;
  }
  if (s.day - r.since >= REBELLION_WIN_DAYS || r.beaten >= 3) {
    won(g, n);
    return;
  }
  const lastSent = r.since + r.expeditions * EXPEDITION_EVERY_DAYS;
  if (
    s.day - lastSent >=
    EXPEDITION_EVERY_DAYS - (r.expeditions === 0 ? 180 : 0)
  )
    sendExpedition(g, n);
}

function sendExpedition(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = g.nation(n);
  const r = nation.rebellion!;
  const crown = crownOf(g, n);
  if (crown < 0) return;
  let land = mainPort(g, n);
  if (land < 0)
    land = provincesOf(s, n).find((p) => g.map.provinces[p].coastal) ?? -1;
  if (land < 0) return;
  r.expeditions++;
  const regulars = 4 + r.expeditions * 2;
  const regs: Regiment[] = Array.from({ length: regulars }, () => ({
    type: "regulars",
    men: 100,
    morale: 0.9,
    home: -1,
  }));
  for (let i = 0; i < Math.ceil(r.expeditions / 2); i++)
    regs.push({
      type: "artillery",
      men: REGIMENTS.artillery.men,
      morale: 0.9,
      home: -1,
    });
  const army: Army = {
    id: g.nextId(),
    owner: crown,
    prov: land,
    regs,
    path: [],
    depart: -1,
    arrive: -1,
    sea: false,
    retreating: false,
    arrived: s.day,
    from: -1,
    commander: -1,
    supply: 1,
  };
  g.addArmy(army);
  g.event({
    k: "story",
    day: s.day,
    n,
    title: "The crown's army lands",
    text: `${regs.length} regiments of the crown's soldiers have landed at ${g.map.provinces[land].name} to end the rebellion.`,
  });
}

function won(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = g.nation(n);
  const crown = crownOf(g, n);
  for (const a of [...s.armies]) if (a.owner === crown) g.removeArmy(a);
  if (crown >= 0) endWar(g, crown, n, true);
  for (const pr of s.provinces) {
    if (pr.occupier === crown) pr.occupier = -1;
  }
  nation.rebelling = false;
  nation.rebellion = null;
  nation.independent = true;
  nation.autonomy = 100;
  nation.title = 0;
  g.event({ k: "independence", day: s.day, n, won: true });
}

function crushed(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = g.nation(n);
  const crown = crownOf(g, n);
  for (const a of [...s.armies]) if (a.owner === crown) g.removeArmy(a);
  if (crown >= 0) endWar(g, crown, n, true);
  for (let p = 0; p < s.provinces.length; p++) {
    if (s.provinces[p].occupier === crown) g.prov(p).occupier = -1;
  }
  nation.rebelling = false;
  nation.rebellion = null;
  nation.favor = 15;
  nation.autonomy = 0;
  nation.mods.push({
    key: "crushed-rebellion",
    label: "A crushed rebellion",
    until: s.day + 10 * DAYS_PER_YEAR,
    fx: { autonomy: -40, favor: -10 },
  });
  g.event({ k: "independence", day: s.day, n, won: false });
  const ruler = rulerOf(s, n);
  if (ruler) kill(g, ruler, "the hangman, for treason");
}

// ---------------------------------------------------------------- commands

export function crownCommand(
  g: ConquestGame,
  n: number,
  c: Command,
): string | null {
  const s = g.s;
  const nation = s.nations[n];
  if (nation.kind !== "power") return "Only colonies answer to a crown.";
  switch (c.k) {
    case "remit": {
      if (typeof c.share !== "number" || !(c.share >= 0 && c.share <= 0.5))
        return "Between 0% and 50%.";
      if (nation.independent || nation.rebelling)
        return "You owe the crown nothing now.";
      g.nation(n).remit = Math.round(c.share * 100) / 100;
      return null;
    }
    case "demand": {
      const d = nation.demand;
      if (!d) return "The crown wants nothing right now.";
      const n2 = g.nation(n);
      if (d.key === "money") {
        if (c.pay) {
          if (nation.gold < d.amount)
            return `You only have ${Math.floor(nation.gold)} gold.`;
          n2.gold -= d.amount;
          n2.stats.remitted += d.amount;
          n2.mods.push({
            key: "obeyed",
            label: "Paid the crown's request",
            until: s.day + 2 * DAYS_PER_YEAR,
            fx: { favor: 10 },
          });
        } else {
          n2.mods.push({
            key: "defied",
            label: "Refused the crown's request",
            until: s.day + 2 * DAYS_PER_YEAR,
            fx: { favor: -15, autonomy: 5 },
          });
        }
        n2.demand = null;
        return null;
      }
      if (!c.pay) {
        n2.mods.push({
          key: "defied",
          label: `Refused: ${d.label.toLowerCase()}`,
          until: s.day + 2 * DAYS_PER_YEAR,
          fx: { favor: -15, autonomy: 5 },
        });
        n2.demand = null;
        return null;
      }
      return "Do what the crown asks, and it will notice.";
    }
    case "independence": {
      const check = independenceCheck(s, n);
      if (!check.ok) return check.why;
      declareIndependence(g, n);
      return null;
    }
    default:
      return "Unknown command.";
  }
}

export { dateOf };
