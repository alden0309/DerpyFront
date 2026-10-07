// People: settlers arriving from Europe, families growing (or starving),
// fevers in the hot lowlands, crowded provinces sending people on, laborers
// becoming artisans where there are workshops, and unrest boiling over
// into revolt.

import { dateOf } from "./Calendar";
import { mainPort, merge } from "./Economy";
import type { ConquestGame } from "./Game";
import { isFeverSeason, kmBetween } from "./Map";
import {
  armyMen,
  capacityOf,
  charName,
  classSize,
  emigration,
  hasTrait,
  overextension,
  people,
  provincesOf,
  realmSkill,
  rulerOf,
  settlers,
  tribesfolk,
  unrestOf,
} from "./Queries";
import {
  GROWTH_PER_YEAR,
  NATIVE_DENSITY_OWNED,
  NATIVE_DENSITY_WILD,
  NATIVE_STRONG_FACTOR,
  STARVATION,
  TROPICAL_DEATHS,
} from "./Rules";
import { settlerPops } from "./Setup";
import { Pop, PopClass, Province } from "./Types";

export function popsMonthly(g: ConquestGame): void {
  const s = g.s;
  immigration(g);
  for (let p = 0; p < s.provinces.length; p++) {
    const pr = s.provinces[p];
    if (pr.pops.length === 0) continue;
    // Open country only goes out to players when its people really change.
    const before = pr.owner < 0 ? Math.round(people(pr) / 50) : -1;
    grow(g, p);
    if (pr.owner >= 0 && s.nations[pr.owner].kind === "power") {
      drift(pr);
      overflow(g, p);
    }
    wearOut(g, p);
    pr.pops = pr.pops.filter((x) => x.size >= 1);
    for (const pop of pr.pops) {
      pop.size = Math.round(pop.size * 10) / 10;
      pop.wealth = Math.round(pop.wealth * 10) / 10;
      pop.income = Math.round(pop.income * 100) / 100;
    }
    if (pr.owner >= 0) {
      g.prov(p);
      pr.unrest = unrestOf(s, g.w, p).total;
      revolt(g, p);
    } else {
      pr.unrest = 0;
      if (Math.round(people(pr) / 50) !== before) g.prov(p);
    }
  }
  for (const n of s.nations) {
    if (n.kind !== "power" || !n.alive) continue;
    const provs = provincesOf(s, n.id).length;
    const folk = provincesOf(s, n.id).reduce(
      (m, p) => m + settlers(s.provinces[p]),
      0,
    );
    if (provs > n.stats.peakProvinces || folk > n.stats.peakPeople) {
      const nn = g.nation(n.id);
      nn.stats.peakProvinces = Math.max(nn.stats.peakProvinces, provs);
      nn.stats.peakPeople = Math.round(Math.max(nn.stats.peakPeople, folk));
    }
  }
}

function immigration(g: ConquestGame): void {
  const s = g.s;
  for (const n of s.nations) {
    if (n.kind !== "power" || !n.alive) continue;
    const count = emigration(s, n.id).total;
    if (count <= 0) continue;
    const port = mainPort(g, n.id);
    const to = port >= 0 ? port : n.capital;
    if (to < 0 || s.provinces[to].owner !== n.id) continue;
    const pr = g.prov(to);
    pr.pops.push(...settlerPops(n.culture, n.religion, count));
    merge(pr.pops);
    g.nation(n.id).colonists += count;
    g.event({ k: "colonists", day: s.day, n: n.id, count: Math.round(count) });
  }
}

function grow(g: ConquestGame, p: number): void {
  const s = g.s;
  const w = g.w;
  const pr = s.provinces[p];
  const def = w.map.provinces[p];
  const owner = pr.owner >= 0 ? s.nations[pr.owner] : undefined;
  const month = dateOf(s.day).month;
  const cap = capacityOf(s, w, p).total;
  const folk = settlers(pr);
  const tribeCap =
    w.capacity[p] *
    (owner?.kind === "native"
      ? NATIVE_DENSITY_OWNED * (owner.strong ? NATIVE_STRONG_FACTOR : 1)
      : NATIVE_DENSITY_WILD);
  const tribe = tribesfolk(pr);
  let disease = 0;
  for (const m of [...pr.mods, ...(owner?.mods ?? [])])
    if (m.fx.disease) disease += m.fx.disease;
  for (const pop of pr.pops) {
    if (pop.cls === "tribe") {
      const room = Math.max(-0.5, 1 - tribe / Math.max(1, tribeCap));
      let rate = (0.01 / 12) * room * pop.met[0];
      if (pop.met[0] < 0.9) rate -= STARVATION * (1 - pop.met[0]) * 0.5;
      if (disease > 0) rate -= disease * 0.15;
      pop.size = Math.max(0, pop.size * (1 + rate));
      continue;
    }
    const room = Math.max(-0.5, 1 - folk / Math.max(1, cap));
    let rate = (GROWTH_PER_YEAR / 12) * pop.met[0] * room;
    if (pop.met[0] < 0.9) rate -= STARVATION * (1 - pop.met[0]);
    if (w.tropical[p] && isFeverSeason(def.lat, month)) {
      const lea = owner ? realmSkill(s, owner.id, "lea").total : 5;
      const educated =
        owner && hasTrait(rulerOf(s, owner.id), "educated") ? 0.75 : 1;
      rate -=
        ((TROPICAL_DEATHS * 12) / 5 / 12) *
        Math.max(0.3, 1 - (lea - 5) * 0.05) *
        educated;
    }
    if (disease > 0) rate -= disease * 0.08;
    pop.size = Math.max(0, pop.size * (1 + rate));
  }
}

/** Laborers take up trades where there are workshops, ports and churches. */
function drift(pr: Province): void {
  const total = settlers(pr);
  if (total < 200) return;
  const shops = (pr.b.smithy ?? 0) + (pr.b.gunsmith ?? 0) + (pr.b.weaver ?? 0);
  const targets: Partial<Record<PopClass, number>> = {
    artisans: Math.min(0.3, 0.06 + (shops * 1000) / total),
    merchants: 0.04 + (pr.b.port ?? 0) * 0.02 + (pr.b.tradingpost ?? 0) * 0.01,
    gentry: 0.05 + (pr.b.plantation ?? 0) * 0.02,
    clergy: 0.03 + (pr.b.church ?? 0) * 0.01,
  };
  const laborers = pr.pops.find((x) => x.cls === "laborers");
  if (!laborers) return;
  for (const [cls, share] of Object.entries(targets) as [PopClass, number][]) {
    const have = classSize(pr, cls);
    const want = total * share;
    const step = (want - have) * 0.03;
    if (Math.abs(step) < 0.5) continue;
    let pop = pr.pops.find(
      (x) =>
        x.cls === cls &&
        x.culture === laborers.culture &&
        x.religion === laborers.religion,
    );
    if (!pop) {
      if (step < 0) continue;
      pop = {
        cls,
        culture: laborers.culture,
        religion: laborers.religion,
        size: 0,
        wealth: 0,
        met: [...laborers.met] as Pop["met"],
        income: 0,
      };
      pr.pops.push(pop);
    }
    const move =
      step > 0 ? Math.min(step, laborers.size - 50) : Math.max(step, -pop.size);
    if (move === 0 || (step > 0 && move <= 0)) continue;
    pop.size += move;
    laborers.size -= move;
  }
}

/** Crowded provinces send people to emptier ones next door. */
function overflow(g: ConquestGame, p: number): void {
  const s = g.s;
  const pr = s.provinces[p];
  const cap = capacityOf(s, g.w, p).total;
  const folk = settlers(pr);
  if (folk <= cap * 0.9) return;
  let best = -1;
  let bestRoom = 0;
  for (const [q] of g.map.provinces[p].nb) {
    const other = s.provinces[q];
    if (other.owner !== pr.owner || other.occupier >= 0) continue;
    const room = capacityOf(s, g.w, q).total - settlers(other);
    if (room > bestRoom) {
      best = q;
      bestRoom = room;
    }
  }
  if (best < 0) return;
  const move = Math.min(bestRoom * 0.5, (folk - cap * 0.9) * 0.1 + 5);
  const laborers = pr.pops.find((x) => x.cls === "laborers");
  if (!laborers || move < 1) return;
  laborers.size -= move;
  const dest = g.prov(best);
  dest.pops.push({
    ...laborers,
    size: move,
    wealth: 0,
    income: 0,
    met: [...laborers.met] as Pop["met"],
  });
  merge(dest.pops);
}

/** Furs get trapped out; war damage heals. */
function wearOut(g: ConquestGame, p: number): void {
  const pr = g.s.provinces[p];
  if (pr.devastation > 0)
    pr.devastation = Math.max(
      0,
      Math.round((pr.devastation - 0.03) * 100) / 100,
    );
  if (g.w.raw[p] === "furs") {
    const trappers =
      classSize(pr, "laborers") +
      (pr.owner >= 0 && g.s.nations[pr.owner].kind === "native"
        ? classSize(pr, "tribe") * 0.2
        : 0);
    const posts = pr.b.tradingpost ?? 0;
    const wear = (trappers / 1000) * 0.006 * (1 + posts * 0.5) - 0.002;
    pr.depletion = Math.max(
      0,
      Math.min(0.8, Math.round((pr.depletion + wear) * 1000) / 1000),
    );
  }
  pr.mods = pr.mods.filter((m) => m.until > g.s.day);
}

function revolt(g: ConquestGame, p: number): void {
  const s = g.s;
  const pr = s.provinces[p];
  const inRevolt = pr.mods.find((m) => m.key === "revolt");
  const garrison = s.armies
    .filter((a) => a.prov === p && a.owner === pr.owner && a.depart < 0)
    .reduce((m, a) => m + armyMen(a), 0);
  if (!inRevolt) {
    if (pr.unrest < 100 || s.nations[pr.owner].kind !== "power") return;
    pr.mods.push({
      key: "revolt",
      label: "In open revolt",
      until: s.day + 365 * 5,
      fx: { production: -0.5, tax: 0 },
    });
    g.event({ k: "revolt", day: s.day, n: pr.owner, p });
    return;
  }
  if (garrison >= Math.max(100, (settlers(pr) + tribesfolk(pr)) / 20)) {
    pr.mods = pr.mods.filter((m) => m !== inRevolt);
    const ruler = rulerOf(s, pr.owner);
    const cruel = hasTrait(ruler, "cruel");
    for (const pop of pr.pops) pop.size *= cruel ? 0.94 : 0.97;
    pr.mods.push({
      key: "crushed",
      label: cruel ? "Revolt crushed without mercy" : "Revolt put down",
      until: s.day + 365,
      fx: { unrest: cruel ? -35 : -20 },
    });
    g.event({
      k: "story",
      day: s.day,
      n: pr.owner,
      title: "Revolt put down",
      text: `${charName(ruler)}'s soldiers restored order in ${g.map.provinces[p].name}.`,
    });
    return;
  }
  // A long revolt far from the capital, in an overstretched colony: it breaks away.
  const months = (s.day - (inRevolt.until - 365 * 5)) / 30;
  const nation = s.nations[pr.owner];
  const far = nation.capital < 0 || kmBetween(g.map, nation.capital, p) > 500;
  if (
    months >= 18 &&
    far &&
    pr.unrest >= 90 &&
    overextension(s, g.w, pr.owner) > 0.25
  ) {
    const from = pr.owner;
    g.nation(from).stats.provincesLost++;
    pr.owner = -1;
    pr.mods = pr.mods.filter((m) => m.key !== "revolt");
    pr.b = {};
    g.event({
      k: "story",
      day: s.day,
      n: from,
      title: "Breakaway",
      text: `${g.map.provinces[p].name} threw off our rule. Its settlers govern themselves now; anyone may claim it.`,
    });
  }
}
