// War: raising regiments from a province's people, marching them, feeding
// them (or not), fighting battles, besieging forts for months, and making
// peace. Holding a province isn't owning it; land changes hands only at a
// peace (or when the crowns make peace in Europe).

import { fightBattle } from "./Battle";
import { kill } from "./Characters";
import { cede } from "./Crown";
import { makeTributary } from "./Diplomacy";
import { merge, takeSettlers } from "./Economy";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { findPath, hopDays } from "./Paths";
import {
  ageOf,
  alliesOf,
  armiesIn,
  armyMen,
  armySpeed,
  atWar,
  attritionOf,
  canEnter,
  charName,
  holder,
  pairKey,
  peaceCheck,
  peaceWillingness,
  provincesOf,
  recruitCheck,
  settlers,
  siegeSpeed,
  supplyLimit,
  treatyBetween,
  tributariesOf,
  warBetween,
  warCheck,
} from "./Queries";
import { ADULT_AGE, DAYS_PER_YEAR, REGIMENTS } from "./Rules";
import { Army, Command, PeaceTerms, Pop, RegType } from "./Types";

// ---------------------------------------------------------------- wars

export function startWar(
  g: ConquestGame,
  a: number,
  b: number,
  why: string,
  europe: boolean,
): void {
  const s = g.s;
  if (atWar(s, a, b)) return;
  s.wars.push({
    a,
    b,
    by: a,
    start: s.day,
    why,
    won: [0, 0],
    lost: [0, 0],
    europe,
  });
  s.truces = s.truces.filter(
    (t) => !((t.a === a && t.b === b) || (t.a === b && t.b === a)),
  );
  const before = s.treaties.length;
  s.treaties = s.treaties.filter(
    (t) => !((t.a === a && t.b === b) || (t.a === b && t.b === a)),
  );
  if (s.treaties.length !== before) g.treatiesChanged();
  g.warsChanged();
  g.trucesChanged();
  g.event({ k: "war", day: s.day, n: a, on: b, why });
  // Allies of the defender answer the call.
  for (const ally of alliesOf(s, b)) {
    if (ally === a || atWar(s, ally, a)) continue;
    if (s.nations[ally].kind === "crown") continue;
    startWar(g, ally, a, `Defending ${s.nations[b].name}`, false);
  }
  // Tributaries follow their overlord to war.
  for (const t of tributariesOf(s, a)) {
    if (t === b || atWar(s, t, b) || alliesOf(s, b).includes(t)) continue;
    startWar(g, t, b, `Called to war by ${s.nations[a].name}`, false);
  }
}

/** End a war: occupied land goes back, and a five-year truce. */
export function endWar(
  g: ConquestGame,
  a: number,
  b: number,
  silent = false,
): void {
  const s = g.s;
  const war = warBetween(s, a, b);
  if (!war) return;
  s.wars = s.wars.filter((w) => w !== war);
  g.warsChanged();
  for (let p = 0; p < s.provinces.length; p++) {
    const pr = s.provinces[p];
    if (
      (pr.owner === a && pr.occupier === b) ||
      (pr.owner === b && pr.occupier === a)
    ) {
      const x = g.prov(p);
      x.occupier = -1;
      x.siege = null;
    } else if (
      pr.siege &&
      ((pr.siege.by === a && holder(pr) === b) ||
        (pr.siege.by === b && holder(pr) === a))
    ) {
      g.prov(p).siege = null;
    }
  }
  // Armies standing in land they may no longer enter go home.
  for (const army of s.armies) {
    if (
      (army.owner === a || army.owner === b) &&
      !canEnter(s, army.owner, army.prov)
    )
      sendHome(g, army);
  }
  s.offers = s.offers.filter(
    (o) => !((o.from === a && o.to === b) || (o.from === b && o.to === a)),
  );
  g.offersChanged();
  if (!silent) {
    s.truces.push({ a, b, until: s.day + 5 * DAYS_PER_YEAR });
    g.trucesChanged();
    g.event({ k: "peace", day: s.day, n: a, with: b });
  }
}

function sendHome(g: ConquestGame, army: Army): void {
  const s = g.s;
  const own = provincesOf(s, army.owner);
  if (own.length === 0) {
    g.removeArmy(army);
    return;
  }
  const a = g.touch(army);
  a.prov =
    s.nations[army.owner].capital >= 0 ? s.nations[army.owner].capital : own[0];
  a.path = [];
  a.depart = -1;
  a.retreating = false;
  a.arrived = s.day;
  a.from = -1;
}

function applyPeace(
  g: ConquestGame,
  from: number,
  to: number,
  terms: PeaceTerms,
): void {
  const s = g.s;
  for (const p of terms.take) {
    giveProvince(g, p, from);
    g.event({ k: "ceded", day: s.day, n: from, p, from: to });
  }
  for (const p of terms.give) {
    giveProvince(g, p, to);
    g.event({ k: "ceded", day: s.day, n: to, p, from });
  }
  if (terms.gold !== 0) {
    g.nation(to).gold -= terms.gold;
    g.nation(from).gold += terms.gold;
  }
  endWar(g, from, to);
  if (terms.subjugate) makeTributary(g, to, from);
  if (s.nations[from].kind === "power" && s.nations[to].kind === "power") {
    const k = pairKey(from, to);
    s.europe.tension[k] = Math.max(0, (s.europe.tension[k] ?? 0) - 15);
    g.europeChanged();
  }
}

/** Cede a province; settlers flee land handed to a native nation. */
function giveProvince(g: ConquestGame, p: number, to: number): void {
  const s = g.s;
  const pr = s.provinces[p];
  const from = pr.owner;
  if (s.nations[to].kind === "native" && from >= 0 && settlers(pr) > 0) {
    const refuge = provincesOf(s, from).find((q) => q !== p);
    const fleeing = pr.pops.filter((x) => x.cls !== "tribe");
    const x = g.prov(p);
    x.pops = x.pops.filter((pop) => pop.cls === "tribe");
    x.b = {};
    if (refuge !== undefined) {
      const dest = g.prov(refuge);
      for (const pop of fleeing)
        dest.pops.push({ ...pop, size: pop.size * 0.8 });
      merge(dest.pops);
    }
  }
  cede(g, p, to);
}

// ---------------------------------------------------------------- daily

export function warDaily(g: ConquestGame): void {
  recruitsDaily(g);
  moveArmies(g);
  fightBattles(g);
  sieges(g);
}

function recruitsDaily(g: ConquestGame): void {
  const s = g.s;
  for (let p = 0; p < s.provinces.length; p++) {
    const pr = s.provinces[p];
    if (pr.recruits.length === 0 || pr.recruits[0].done > s.day) continue;
    const x = g.prov(p);
    const done = x.recruits.filter((r) => r.done <= s.day);
    x.recruits = x.recruits.filter((r) => r.done > s.day);
    if (pr.owner < 0 || pr.occupier >= 0) continue;
    for (const r of done) {
      addRegiment(g, pr.owner, p, r.type);
      g.event({ k: "raised", day: s.day, n: pr.owner, p, t: r.type });
    }
  }
}

export function addRegiment(
  g: ConquestGame,
  n: number,
  p: number,
  type: RegType,
): Army {
  const s = g.s;
  const reg = { type, men: REGIMENTS[type].men, morale: 0.75, home: p };
  const here = s.armies.find(
    (a) => a.owner === n && a.prov === p && a.depart < 0 && !a.retreating,
  );
  if (here) {
    g.touch(here).regs.push(reg);
    return here;
  }
  return g.addArmy({
    id: g.nextId(),
    owner: n,
    prov: p,
    regs: [reg],
    path: [],
    depart: -1,
    arrive: -1,
    sea: false,
    retreating: false,
    arrived: s.day,
    from: -1,
    commander: -1,
    supply: 1,
  });
}

function startHop(g: ConquestGame, a: Army): void {
  const s = g.s;
  if (a.path.length === 0) {
    a.depart = -1;
    a.arrive = -1;
    a.sea = false;
    a.retreating = false;
    return;
  }
  const next = a.path[0];
  const speed = armySpeed(a);
  let days = hopDays(s, g.map, a.owner, a.prov, next, speed, false);
  let sea = false;
  if (days < 0) {
    days = hopDays(s, g.map, a.owner, a.prov, next, speed, true);
    sea = true;
  }
  if (days < 0 || (!canEnter(s, a.owner, next) && !a.retreating)) {
    a.path = [];
    a.depart = -1;
    a.arrive = -1;
    a.retreating = false;
    return;
  }
  a.depart = s.day;
  a.arrive = s.day + days;
  a.sea = sea;
}

function moveArmies(g: ConquestGame): void {
  const s = g.s;
  for (const army of [...s.armies]) {
    if (army.depart < 0 || army.arrive > s.day) continue;
    const a = g.touch(army);
    const next = a.path.shift()!;
    a.from = a.prov;
    a.prov = next;
    a.arrived = s.day;
    startHop(g, a);
  }
}

function fightBattles(g: ConquestGame): void {
  const s = g.s;
  const byProv = new Map<number, Army[]>();
  for (const a of s.armies) {
    if (a.depart >= 0 || armyMen(a) <= 0) continue;
    let list = byProv.get(a.prov);
    if (!list) byProv.set(a.prov, (list = []));
    list.push(a);
  }
  for (const [p, armies] of byProv) {
    if (armies.length < 2) continue;
    // Find two hostile groups.
    const fighting = armies.filter((a) => !a.retreating);
    for (const x of fighting) {
      const foes = fighting.filter(
        (y) => y.owner !== x.owner && atWar(s, x.owner, y.owner),
      );
      if (foes.length === 0) continue;
      // Defenders: whoever got here first (and their friends).
      const all = [x, ...foes];
      const first = all.reduce(
        (m, a) => (a.arrived < m.arrived ? a : m),
        all[0],
      );
      const defenders = fighting.filter(
        (a) =>
          a.owner === first.owner ||
          (!atWar(s, a.owner, first.owner) &&
            all.some((f) => atWar(s, f.owner, a.owner))),
      );
      const attackers = fighting.filter(
        (a) =>
          !defenders.includes(a) &&
          defenders.some((d) => atWar(s, d.owner, a.owner)),
      );
      if (attackers.length === 0 || defenders.length === 0) continue;
      battle(g, p, attackers, defenders);
      break;
    }
  }
}

function battle(
  g: ConquestGame,
  p: number,
  attackers: Army[],
  defenders: Army[],
): void {
  const s = g.s;
  for (const a of [...attackers, ...defenders]) g.touch(a);
  const { report, fallen } = fightBattle(g, p, attackers, defenders);
  const winners = report.winner === 0 ? attackers : defenders;
  const losers = report.winner === 0 ? defenders : attackers;
  // Book-keeping for war score and weariness.
  const w = warBetween(s, attackers[0].owner, defenders[0].owner);
  if (w) {
    const aSide = w.a === attackers[0].owner ? 0 : 1;
    const winSide = report.winner === 0 ? aSide : 1 - aSide;
    w.won[winSide]++;
    w.lost[aSide] += report.attacker.lost;
    w.lost[1 - aSide] += report.defender.lost;
    g.warsChanged();
  }
  for (const side of [report.attacker, report.defender]) {
    for (const n of side.nations) {
      const nation = g.nation(n);
      nation.warExhaustion = Math.min(
        50,
        nation.warExhaustion + side.lost / 400,
      );
    }
  }
  for (const n of new Set(winners.map((a) => a.owner)))
    g.nation(n).stats.battlesWon++;
  for (const n of new Set(losers.map((a) => a.owner)))
    g.nation(n).stats.battlesLost++;
  // Losers fall back, or are destroyed if broken and nowhere to go.
  let destroyed = false;
  for (const a of losers) {
    const keep = a.regs.filter((r) => r.men >= 10);
    a.regs = keep;
    if (keep.length === 0 || armyMen(a) < 30) {
      g.removeArmy(a);
      destroyed = true;
      continue;
    }
    if (!retreat(g, a)) {
      g.removeArmy(a);
      destroyed = true;
    }
  }
  for (const a of winners) {
    a.regs = a.regs.filter((r) => r.men >= 10);
    if (a.regs.length === 0) g.removeArmy(a);
  }
  if (destroyed && losers.every((a) => !s.armies.includes(a)))
    report.outcome = "destroyed";
  g.battle(report);
  g.event({
    k: "battle",
    day: s.day,
    id: report.id,
    p,
    a: report.attacker.nations,
    d: report.defender.nations,
    w: report.winner,
  });
  for (const id of fallen) {
    const c = s.chars[id];
    if (c?.alive) kill(g, c, `battle at ${g.map.provinces[p].name}`);
  }
  g.prov(p).devastation = Math.min(1, s.provinces[p].devastation + 0.1);
  for (const h of hooks.battle) h(g, report, attackers, defenders);
}

/** Fall back one province to friendly ground. False if there's nowhere. */
function retreat(g: ConquestGame, a: Army): boolean {
  const s = g.s;
  const options = g.map.provinces[a.prov].nb
    .map(([q]) => q)
    .filter(
      (q) =>
        canEnter(s, a.owner, q) &&
        !armiesIn(s, q).some((x) => atWar(s, x.owner, a.owner)),
    );
  options.sort(
    (x, y) => friendliness(g, a.owner, y) - friendliness(g, a.owner, x),
  );
  const to = options[0];
  if (to === undefined) return false;
  a.path = [to];
  a.retreating = true;
  startHop(g, a);
  if (a.depart < 0) return false;
  for (const r of a.regs) r.morale = Math.max(0.05, r.morale);
  return true;
}

function friendliness(g: ConquestGame, n: number, p: number): number {
  const pr = g.s.provinces[p];
  if (pr.owner === n && pr.occupier < 0) return 3;
  if (pr.occupier === n) return 2;
  if (pr.owner === -1) return 1;
  return 0;
}

function sieges(g: ConquestGame): void {
  const s = g.s;
  // Start sieges where an army stands in enemy-held land.
  for (const a of s.armies) {
    if (a.depart >= 0 || a.retreating) continue;
    const pr = s.provinces[a.prov];
    if (pr.owner < 0) continue;
    const h = holder(pr);
    if (h === a.owner || !atWar(s, a.owner, h)) continue;
    // An ally's siege already under way carries on.
    if (pr.siege && atWar(s, pr.siege.by, h)) continue;
    if (
      armiesIn(s, a.prov).some(
        (x) => x.owner === h || (atWar(s, x.owner, a.owner) && !x.retreating),
      )
    )
      continue;
    g.prov(a.prov).siege = { by: a.owner, start: s.day, progress: 0 };
    g.event({ k: "siege", day: s.day, n: a.owner, p: a.prov, from: h });
  }
  for (let p = 0; p < s.provinces.length; p++) {
    const pr = s.provinces[p];
    if (!pr.siege) continue;
    const by = pr.siege.by;
    const h = holder(pr);
    const present = armiesIn(s, p).some(
      (a) =>
        !a.retreating &&
        (a.owner === by || (a.owner !== h && atWar(s, a.owner, h))),
    );
    const blocked = armiesIn(s, p).some(
      (a) => atWar(s, a.owner, by) && !a.retreating,
    );
    if (!present || h === by || !atWar(s, by, h)) {
      g.prov(p).siege = null;
      continue;
    }
    if (blocked) continue;
    const x = g.prov(p);
    x.siege!.progress = Math.min(
      100,
      Math.round((x.siege!.progress + siegeSpeed(s, g.w, p, by).total) * 100) /
        100,
    );
    if (x.siege!.progress < 100) continue;
    x.siege = null;
    if (by === pr.owner) {
      x.occupier = -1;
      g.event({ k: "freed", day: s.day, n: by, p });
    } else {
      x.occupier = by;
      x.recruits = [];
      x.build = null;
      g.event({ k: "occupied", day: s.day, n: by, p, from: pr.owner });
      if (
        s.nations[by].kind === "native" &&
        s.nations[pr.owner].kind === "power" &&
        settlers(pr) > 0
      )
        raze(g, p, by);
    }
  }
}

/** Warriors burn a colony they take: people die or flee, buildings burn. */
function raze(g: ConquestGame, p: number, by: number): void {
  const s = g.s;
  const pr = g.prov(p);
  for (const pop of pr.pops) if (pop.cls !== "tribe") pop.size *= 0.7;
  for (const k of Object.keys(pr.b) as (keyof typeof pr.b)[])
    pr.b[k] = Math.max(0, (pr.b[k] ?? 0) - 1);
  pr.devastation = Math.max(pr.devastation, 0.7);
  g.event({ k: "razed", day: s.day, n: by, p, from: pr.owner });
}

// ---------------------------------------------------------------- monthly

export function warMonthly(g: ConquestGame): void {
  const s = g.s;
  const w = g.w;
  for (const army of [...s.armies]) {
    const a = g.touch(army);
    const pr = s.provinces[a.prov];
    const nation = s.nations[a.owner];
    // Food: from home markets on our own (or allied) ground, else off the land.
    const friendly =
      pr.owner === a.owner ||
      (pr.owner >= 0 &&
        treatyBetween(s, a.owner, pr.owner, "alliance") !== undefined);
    if (friendly && pr.occupier < 0 && nation.kind === "power") {
      const m = nation.market;
      const food = m.supply.grain + m.supply.fish;
      a.supply =
        Math.round(
          Math.min(1, m.demand.grain > 0 ? food / m.demand.grain : 1) * 100,
        ) / 100;
    } else if (friendly || nation.kind !== "power") {
      const limit = supplyLimit(s, w, a.owner, a.prov).total * 1000;
      a.supply =
        Math.round(
          Math.min(
            1,
            a.supply * 0.4 + Math.min(1, limit / Math.max(1, armyMen(a))) * 0.6,
          ) * 100,
        ) / 100;
    } else {
      const limit = supplyLimit(s, w, a.owner, a.prov).total * 1000;
      a.supply =
        Math.round(
          Math.min(
            1,
            a.supply * 0.5 +
              Math.min(1, limit / Math.max(1, armyMen(a))) * 0.5 -
              0.05,
          ) * 100,
        ) / 100;
      a.supply = Math.max(0, a.supply);
    }
    // Losses to cold, fever, hunger and crowding.
    const rate = attritionOf(s, w, a).total;
    let lost = 0;
    for (const r of a.regs) {
      const l = r.men * rate;
      r.men = Math.max(0, Math.round((r.men - l) * 10) / 10);
      lost += l;
    }
    a.regs = a.regs.filter((r) => r.men >= 5);
    if (lost > 0 && s.wars.some((x) => x.a === a.owner || x.b === a.owner)) {
      const n = g.nation(a.owner);
      n.warExhaustion = Math.min(50, n.warExhaustion + lost / 800);
    }
    // Morale comes back with rest and food (and pay).
    const cap = 0.4 + 0.6 * a.supply;
    const paid = nation.kind !== "power" || nation.gold >= 0;
    for (const r of a.regs) {
      const gain = a.depart < 0 ? (friendly ? 0.15 : 0.07) : 0.03;
      r.morale =
        Math.round(Math.min(cap, r.morale + (paid ? gain : -0.1)) * 100) / 100;
      r.morale = Math.max(0, r.morale);
    }
    if (a.regs.length === 0) {
      g.removeArmy(army);
      continue;
    }
    // Armies living off enemy land strip it.
    if (pr.owner >= 0 && pr.owner !== a.owner && atWar(s, a.owner, pr.owner))
      g.prov(a.prov).devastation = Math.min(1, pr.devastation + 0.04);
    if (a.commander >= 0 && !s.chars[a.commander]?.alive) a.commander = -1;
  }
  // War weariness.
  for (const n of s.nations) {
    if (!n.alive) continue;
    const fighting = s.wars.some((x) => x.a === n.id || x.b === n.id);
    const next = fighting
      ? n.warExhaustion + 0.5
      : Math.max(0, n.warExhaustion - 1.5);
    if (Math.abs(next - n.warExhaustion) > 0.001)
      g.nation(n.id).warExhaustion = Math.round(Math.min(50, next) * 10) / 10;
  }
  // Offers expire.
  const before = s.offers.length;
  s.offers = s.offers.filter((o) => s.day - o.day < 30);
  if (s.offers.length !== before) g.offersChanged();
}

// ---------------------------------------------------------------- commands

function ownArmy(g: ConquestGame, n: number, id: unknown): Army | null {
  const a = g.s.armies.find((x) => x.id === id);
  return a && a.owner === n ? a : null;
}

export function militaryCommand(
  g: ConquestGame,
  n: number,
  c: Command,
): string | null {
  const s = g.s;
  switch (c.k) {
    case "recruit": {
      if (!(c.t in REGIMENTS)) return "No such regiment.";
      const check = recruitCheck(s, n, c.p, c.t);
      if (!check.ok) return check.why;
      const r = REGIMENTS[c.t];
      const nation = g.nation(n);
      nation.gold -= r.gold;
      for (const [good, v] of Object.entries(r.goods) as [
        keyof typeof nation.market.stock,
        number,
      ][])
        nation.market.stock[good] -= v;
      if (!r.natives) takeLaborers(g, c.p, r.men);
      g.prov(c.p).recruits.push({
        type: c.t,
        start: s.day,
        done: s.day + r.days,
      });
      return null;
    }
    case "move": {
      const a = ownArmy(g, n, c.a);
      if (!a) return "Not your army.";
      if (a.retreating) return "They're retreating.";
      if (typeof c.to !== "number" || !s.provinces[c.to])
        return "No such place.";
      if (c.to === a.prov && a.depart < 0) return null;
      const start = a.depart >= 0 && a.path.length > 0 ? a.path[0] : a.prov;
      const route = findPath(s, g.map, n, start, c.to, armySpeed(a));
      if (!route) return "They can't get there.";
      const x = g.touch(a);
      if (a.depart >= 0) {
        x.path = [a.path[0], ...route.path];
      } else {
        x.path = route.path;
        startHop(g, x);
      }
      return null;
    }
    case "stop": {
      const a = ownArmy(g, n, c.a);
      if (!a) return "Not your army.";
      if (a.retreating) return "They're retreating.";
      const x = g.touch(a);
      x.path = a.depart >= 0 ? [a.path[0]] : [];
      return null;
    }
    case "split": {
      const a = ownArmy(g, n, c.a);
      if (!a) return "Not your army.";
      if (a.depart >= 0) return "Not while marching.";
      if (a.regs.length < 2) return "It's a single regiment.";
      const x = g.touch(a);
      const half = x.regs.splice(Math.ceil(x.regs.length / 2));
      g.addArmy({ ...x, id: g.nextId(), regs: half, path: [], commander: -1 });
      return null;
    }
    case "merge": {
      const a = ownArmy(g, n, c.a);
      const b = ownArmy(g, n, c.b);
      if (!a || !b || a === b) return "Pick two of your armies.";
      if (a.prov !== b.prov || a.depart >= 0 || b.depart >= 0)
        return "They must stand in the same place.";
      g.touch(a).regs.push(...b.regs);
      if (a.commander < 0) a.commander = b.commander;
      g.removeArmy(b);
      return null;
    }
    case "disband": {
      const a = ownArmy(g, n, c.a);
      if (!a) return "Not your army.";
      for (const r of a.regs) {
        const home = s.provinces[r.home];
        if (!home || home.owner !== n) continue;
        const x = g.prov(r.home);
        const cls = REGIMENTS[r.type].natives ? "tribe" : "laborers";
        const pop = x.pops.find((p) => p.cls === cls);
        if (pop) pop.size += r.men;
        else if (cls === "laborers") {
          const nation = s.nations[n];
          x.pops.push({
            cls,
            culture: nation.culture,
            religion: nation.religion,
            size: r.men,
            wealth: 0,
            met: [1, 1, 1],
            income: 0,
          } as Pop);
        }
      }
      g.removeArmy(a);
      return null;
    }
    case "lead": {
      const a = ownArmy(g, n, c.a);
      if (!a) return "Not your army.";
      if (c.c === -1) {
        g.touch(a).commander = -1;
        return null;
      }
      const ch = s.chars[c.c];
      if (!ch?.alive || ch.nation !== n) return "They're not one of yours.";
      if (ageOf(s, ch) < ADULT_AGE) return "Too young to command.";
      if (s.armies.some((x) => x.commander === ch.id && x !== a))
        return `${charName(ch)} already leads an army.`;
      g.touch(a).commander = ch.id;
      return null;
    }
    case "war": {
      const check = warCheck(s, n, c.n);
      if (!check.ok) return check.why;
      declareWar(g, n, c.n);
      return null;
    }
    case "peace": {
      if (
        !c.terms ||
        !Array.isArray(c.terms.take) ||
        !Array.isArray(c.terms.give) ||
        typeof c.terms.gold !== "number"
      )
        return "Bad terms.";
      const terms: PeaceTerms = {
        take: [...new Set(c.terms.take)],
        give: [...new Set(c.terms.give)],
        gold: Math.round(c.terms.gold),
        ...(c.terms.subjugate === true ? { subjugate: true } : {}),
      };
      const check = peaceCheck(s, n, c.n, terms);
      if (!check.ok) return check.why;
      const target = s.nations[c.n];
      if (target.player === null) {
        if (peaceWillingness(s, n, c.n, terms).total >= 0)
          applyPeace(g, n, c.n, terms);
        else g.event({ k: "refused", day: s.day, n, by: c.n });
        return null;
      }
      s.offers = s.offers.filter((o) => !(o.from === n && o.to === c.n));
      s.offers.push({ id: g.nextId(), from: n, to: c.n, day: s.day, terms });
      g.offersChanged();
      g.event({ k: "offer", day: s.day, n, to: c.n });
      return null;
    }
    case "answer": {
      const offer = s.offers.find((o) => o.id === c.offer && o.to === n);
      if (!offer) return "That offer is gone.";
      s.offers = s.offers.filter((o) => o !== offer);
      g.offersChanged();
      if (!c.yes) {
        g.event({ k: "refused", day: s.day, n: offer.from, by: n });
        return null;
      }
      const check = peaceCheck(s, offer.from, n, offer.terms);
      if (!check.ok) return check.why;
      applyPeace(g, offer.from, n, offer.terms);
      return null;
    }
    default:
      return "Unknown command.";
  }
}

export function declareWar(g: ConquestGame, n: number, target: number): void {
  const s = g.s;
  const attacker = s.nations[n];
  const victim = s.nations[target];
  startWar(
    g,
    n,
    target,
    victim.kind === "native" && attacker.kind === "power"
      ? "Conquest"
      : attacker.kind === "native"
        ? "Land encroachment"
        : "A colonial quarrel",
    false,
  );
  const t = g.nation(target);
  (t.relations[n] ??= []).push({
    of: -1,
    why: "They attacked us",
    value: -30,
    until: s.day + 10 * DAYS_PER_YEAR,
  });
  if (attacker.kind === "power" && victim.kind === "power") {
    const k = pairKey(n, target);
    s.europe.tension[k] = Math.min(100, (s.europe.tension[k] ?? 0) + 20);
    g.europeChanged();
    if (
      s.europe.wars[k] === undefined &&
      !attacker.rebelling &&
      !attacker.independent
    ) {
      g.nation(n).mods.push({
        key: "unsanctioned-war",
        label: "Started a war the crown didn't want",
        until: s.day + 2 * DAYS_PER_YEAR,
        fx: { favor: -10 },
      });
    }
  }
}

/** Draft laborers into a regiment. */
function takeLaborers(g: ConquestGame, p: number, men: number): void {
  const pr = g.prov(p);
  let left = men;
  for (const pop of pr.pops) {
    if (pop.cls !== "laborers" || left <= 0) continue;
    const take = Math.min(pop.size, left);
    pop.size -= take;
    left -= take;
  }
  if (left > 0) takeSettlers(g, p, left);
}
