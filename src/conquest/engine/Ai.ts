// The computer's nations. They play by the same rules as people: every
// decision goes through game.command(), with the same costs and checks.
// How they lean depends on their ruler's traits and the difficulty.

import { seatCandidates } from "./Characters";
import { mainPort } from "./Economy";
import type { ConquestGame } from "./Game";
import { skipped } from "./Hooks";
import { boomAt } from "./Leads";
import { kmBetween } from "./Map";
import {
  isExplored,
  leaderFlags,
  missionCheck,
  missionLeaders,
} from "./Missions";
import { rebelTarget } from "./Movements";
import { routeTree } from "./Paths";
import {
  adminCapacity,
  adminUsed,
  ageOf,
  armiesOf,
  armyMen,
  armySpeed,
  atWar,
  bordersProvince,
  buildCheck,
  buyCheck,
  colonizeCheck,
  enemiesOf,
  expectedRemit,
  hasTrait,
  holder,
  nationSettlers,
  nationsBorder,
  peaceWillingness,
  provinceValue,
  provincesOf,
  recruitCheck,
  regimentTypes,
  relationOf,
  rulerOf,
  settlers,
  treatyBetween,
  treatyCheck,
  tribesfolk,
  tributeCheck,
  warBetween,
  warCheck,
  warMonths,
  warScore,
} from "./Queries";
import { DIFFICULTY, REGIMENTS, WARRIOR_SHARE } from "./Rules";
import { orderQuote } from "./Trade";
import {
  Army,
  BuildingKind,
  Character,
  GameState,
  Good,
  PeaceTerms,
  RegType,
  SEATS,
} from "./Types";

export function runAi(g: ConquestGame, n: number): void {
  const nation = g.s.nations[n];
  if (nation.kind === "power") powerAi(g, n);
  else if (nation.kind === "native") nativeAi(g, n);
  else if (nation.kind === "rebels") rebelsAi(g, n);
  else crownAi(g, n);
}

/** A player governs (or leads) this nation: they keep its few levers. */
function governed(g: ConquestGame, n: number): boolean {
  return skipped(g, g.s.nations[n].ruler);
}

/** An army a player commands: the computer leaves it alone. */
function playerArmy(g: ConquestGame, a: Army): boolean {
  return a.commander >= 0 && skipped(g, a.commander);
}

function leans(g: ConquestGame, n: number) {
  const r = rulerOf(g.s, n);
  const t = (x: Parameters<typeof hasTrait>[1]) => hasTrait(r, x);
  const diff = DIFFICULTY[g.s.settings.difficulty];
  return {
    aggression:
      (t("ambitious") ? 1.4 : 1) *
      (t("cruel") ? 1.3 : 1) *
      (t("content") ? 0.6 : 1) *
      (t("craven") ? 0.6 : 1) *
      diff.aggression,
    loyal: t("content") || t("honest"),
    greedy: t("greedy"),
    generous: t("generous"),
  };
}

/** Men under arms and fighting value, near enough to matter. */
function strength(g: ConquestGame, n: number): number {
  return armiesOf(g.s, n).reduce((m, a) => m + armyMen(a), 0);
}

// ---------------------------------------------------------------- powers

function powerAi(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = s.nations[n];
  const l = leans(g, n);
  const ruled = governed(g, n);
  if (!ruled) g.command(n, { k: "tax", level: taxLevel(g, n) });
  const want = Math.max(
    0,
    expectedRemit(nation) +
      (l.loyal ? 0.05 : 0) -
      (l.greedy ? 0.03 : 0) +
      (nation.favor < 30 ? 0.05 : 0),
  );
  if (
    !ruled &&
    Math.abs(want - nation.remit) > 0.005 &&
    !nation.independent &&
    !nation.rebelling
  )
    g.command(n, { k: "remit", share: Math.min(0.5, want) });
  council(g, n);
  if (nation.demand?.key === "money")
    g.command(n, {
      k: "demand",
      pay: nation.gold >= nation.demand.amount * (l.loyal ? 1.2 : 2),
    });
  marriages(g, n);
  if (nation.gold > 45) colonize(g, n);
  if (nation.gold > 120) explore(g, n);
  supplies(g, n);
  if (nation.gold > 150 && s.day % 180 < 31) tribute(g, n);
  for (let i = 0; i < (nation.gold > 400 ? 3 : nation.gold > 150 ? 2 : 1); i++)
    if (g.s.nations[n].gold > 60) build(g, n);
  military(g, n);
  natives(g, n);
  peace(g, n);
  if (
    !ruled &&
    nation.autonomy >= 60 &&
    hasTrait(rulerOf(s, n), "ambitious") &&
    strength(g, n) > 1500 &&
    nation.favor < 40
  ) {
    g.command(n, { k: "independence" });
  }
}

function taxLevel(g: ConquestGame, n: number): 0 | 1 | 2 {
  const s = g.s;
  const provs = provincesOf(s, n);
  const unrest =
    provs.reduce((m, p) => m + s.provinces[p].unrest, 0) /
    Math.max(1, provs.length);
  const nation = s.nations[n];
  if (unrest > 45) return 0;
  if (nation.gold < 40 && unrest < 20) return 2;
  return 1;
}

function council(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = s.nations[n];
  for (const seat of SEATS) {
    if (nation.council[seat] >= 0 && s.chars[nation.council[seat]]?.alive)
      continue;
    const pick = seatCandidates(s, n, seat).find(
      (c) =>
        !c.scheme &&
        !(Object.values(nation.council) as number[]).includes(c.id),
    );
    if (pick) g.command(n, { k: "appoint", seat, c: pick.id });
  }
  for (const id of [
    ...nation.court,
    ...(Object.values(nation.council) as number[]),
  ]) {
    const c = s.chars[id];
    if (c?.alive && c.scheme?.exposed) g.command(n, { k: "confront", c: id });
  }
}

function marriages(g: ConquestGame, n: number): void {
  const s = g.s;
  const ruler = rulerOf(s, n);
  if (!ruler) return;
  const family = [ruler, ...ruler.children.map((id) => s.chars[id])].filter(
    (c): c is Character =>
      !!c?.alive && c.spouse < 0 && ageOf(s, c) >= 18 && ageOf(s, c) < 45,
  );
  for (const c of family) {
    const match = s.nations[n].court
      .map((id) => s.chars[id])
      .find(
        (x) =>
          x?.alive &&
          x.spouse < 0 &&
          x.female !== c.female &&
          ageOf(s, x) >= 16 &&
          ageOf(s, x) < 45,
      );
    if (match) g.command(n, { k: "marry", a: c.id, b: match.id });
  }
}

/**
 * WORLD r11: days between a power's new settlements. A struggling colony
 * of a few hundred souls plants a new one every four years or so; a
 * populous, rich one every year or two, as the real colonies did.
 */
export function colonyGapDays(s: GameState, n: number): number {
  const nation = s.nations[n];
  const folk = nationSettlers(s, n);
  const years = Math.max(
    COLONY_GAP_YEARS.min,
    Math.min(
      COLONY_GAP_YEARS.max,
      COLONY_GAP_YEARS.base - folk / 3000 - Math.max(0, nation.gold) / 500,
    ),
  );
  return Math.round(years * 365);
}

export const COLONY_GAP_YEARS = { base: 4.5, min: 1.25, max: 6 };

/** WORLD r11: the day this power may next plant a settlement. */
export function nextColonyDay(s: GameState, n: number): number {
  const at = s.nations[n].cooldowns["colony"];
  // At the start, give the first one some time.
  return at ?? s.startDay + Math.round(colonyGapDays(s, n) * 0.5);
}

function colonize(g: ConquestGame, n: number): void {
  const s = g.s;
  if (s.provinces.some((pr) => pr.colony?.by === n)) return;
  // WORLD r11: settlements come every few years, not every few months.
  if (s.day < nextColonyDay(s, n)) return;
  // Only as fast as the colony can govern it.
  if (adminUsed(s, g.w, n).total + 1.2 > adminCapacity(s, n).total) return;
  let best = -1;
  let bestScore = 0;
  for (let p = 0; p < s.provinces.length; p++) {
    if (s.provinces[p].owner !== -1 || s.provinces[p].colony) continue;
    if (!bordersProvince(s, g.map, n, p) && !g.map.provinces[p].coastal)
      continue;
    const check = colonizeCheck(s, g.w, n, p);
    if (!check.ok) continue;
    // Same knowledge as a player: unsurveyed land is a guess.
    const known = isExplored(s, n, p);
    const raw = g.w.raw[p];
    const value = !known
      ? 1.6
      : {
          tobacco: 3,
          sugar: 3.2,
          furs: 2.2,
          silver: 3.5,
          grain: 2,
          fish: 1.8,
          timber: 1.4,
        }[raw] * (s.provinces[p].rich ? 1.5 : 1);
    // Wary of angering strong natives nearby.
    let anger = 0;
    for (const [q] of g.map.provinces[p].nb) {
      const o = s.provinces[q].owner;
      if (o >= 0 && s.nations[o].kind === "native")
        anger += relationOf(s, g.w, o, n).total < -20 ? 2 : 0.3;
    }
    // A strike nearby makes empty land worth settling.
    const boom = boomAt(s, p) ? 3 : 1;
    const score =
      (boom * value * g.w.capacity[p]) / 1000 / (1 + check.days! / 120) - anger;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  if (best >= 0 && g.command(n, { k: "colonize", p: best }) === null)
    g.nation(n).cooldowns["colony"] = s.day + colonyGapDays(s, n);
}

function build(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = s.nations[n];
  const m = nation.market;
  const options: { p: number; b: BuildingKind; score: number }[] = [];
  const foodShort = m.supply.grain + m.supply.fish < m.demand.grain * 1.1;
  for (const p of provincesOf(s, n)) {
    const pr = s.provinces[p];
    if (pr.build || pr.occupier >= 0) continue;
    const folk = settlers(pr);
    const raw = g.w.raw[p];
    const consider = (b: BuildingKind, score: number) => {
      if (score > 0 && buildCheck(s, g.w, n, p, b).ok)
        options.push({ p, b, score });
    };
    consider("farm", (foodShort ? 3 : 1) * (folk / 1000));
    if (raw === "tobacco" || raw === "sugar")
      consider("plantation", (folk / 1000) * 2.5);
    if (raw === "furs") consider("tradingpost", (folk / 1000) * 1.8 + 0.5);
    if (raw === "silver") consider("mine", (folk / 1000) * 3);
    if (raw === "timber") consider("lumbercamp", (folk / 1000) * 1.2);
    if (p === nation.capital || folk > 2000) consider("port", 1.5);
    if (m.price.tools > 5 && m.stock.timber > 10)
      consider("smithy", (folk / 1000) * 1.2);
    if (m.price.cloth > 4.5) consider("weaver", (folk / 1000) * 1);
    if (m.price.guns > 10 && (pr.b.smithy ?? 0) > 0)
      consider("gunsmith", (folk / 1000) * 0.8);
    if (pr.unrest > 30) consider("church", pr.unrest / 30);
    if (provincesOf(s, n).length > 5 && p === nation.capital)
      consider("courthouse", 2);
    if (p === nation.capital && enemiesOf(s, n).length > 0) consider("fort", 2);
  }
  options.sort((a, b) => b.score - a.score);
  const top = options[0];
  if (top && nation.gold > 60) g.command(n, { k: "build", p: top.p, b: top.b });
}

/** Short of timber or tools to build with: buy some from Europe. */
function supplies(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = s.nations[n];
  const m = nation.market;
  if (nation.gold < 150 || nation.rebelling) return;
  if (nation.convoys.some((c) => c.ordered)) return;
  const goods: Partial<Record<Good, number>> = {};
  if (m.stock.timber < 20) goods.timber = 30;
  if (m.stock.tools < 10) goods.tools = 15;
  if (Object.keys(goods).length === 0) return;
  const port = mainPort(g, n);
  if (port < 0) return;
  const q = orderQuote(g, n, goods, port);
  if (q.gold < nation.gold * 0.4) g.command(n, { k: "order", goods });
}

/** Lean on a weak native neighbour to pay tribute. */
function tribute(g: ConquestGame, n: number): void {
  const s = g.s;
  for (const t of s.nations) {
    if (t.kind !== "native" || !t.alive || t.overlord >= 0) continue;
    const check = tributeCheck(s, g.w, n, t.id);
    if (check.ok) {
      g.command(n, { k: "tribute", n: t.id });
      return;
    }
  }
}

// ---------------------------------------------------------------- armies

function military(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = s.nations[n];
  const enemies = enemiesOf(s, n);
  const folk = provincesOf(s, n).reduce(
    (m, p) => m + settlers(s.provinces[p]),
    0,
  );
  const want = Math.floor(folk / 1800) + 1 + (enemies.length > 0 ? 3 : 0);
  const have =
    armiesOf(s, n).reduce((m, a) => m + a.regs.length, 0) +
    provincesOf(s, n).reduce((m, p) => m + s.provinces[p].recruits.length, 0);
  const batches = Math.min(want - have, nation.gold > 300 ? 3 : 1);
  for (let i = 0; i < batches && s.nations[n].gold > 40; i++) {
    const rich = s.nations[n].gold > 120;
    const type: RegType =
      rich &&
      s.nations[n].market.stock.tools >= 10 &&
      s.nations[n].market.stock.guns >= 12 &&
      i === 2
        ? "artillery"
        : s.nations[n].market.stock.guns >= 10 && s.nations[n].gold > 80
          ? "regulars"
          : "militia";
    const where = provincesOf(s, n)
      .filter((p) => recruitCheck(s, n, p, type).ok)
      .sort((a, b) => settlers(s.provinces[b]) - settlers(s.provinces[a]))[0];
    if (where !== undefined) g.command(n, { k: "recruit", p: where, t: type });
  }
  commanders(g, n);
  if (enemies.length > 0) campaign(g, n);
  else gather(g, n);
}

function commanders(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = s.nations[n];
  const armies = armiesOf(s, n).sort((a, b) => armyMen(b) - armyMen(a));
  const marshal = s.chars[nation.council.marshal];
  if (
    marshal?.alive &&
    armies[0] &&
    armies[0].commander < 0 &&
    !s.armies.some((a) => a.commander === marshal.id)
  )
    g.command(n, { k: "lead", a: armies[0].id, c: marshal.id });
}

/** At peace: armies merge and wait at the capital. */
function gather(g: ConquestGame, n: number): void {
  const s = g.s;
  const home = s.nations[n].capital;
  if (home < 0) return;
  for (const a of armiesOf(s, n)) {
    if (a.depart >= 0 || a.retreating || playerArmy(g, a)) continue;
    if (a.prov !== home) g.command(n, { k: "move", a: a.id, to: home });
  }
  const here = armiesOf(s, n).filter(
    (a) => a.prov === home && a.depart < 0 && !playerArmy(g, a),
  );
  for (let i = 1; i < here.length; i++)
    g.command(n, { k: "merge", a: here[0].id, b: here[i].id });
}

/** At war: defend what's attacked, then take what's weakly held. */
function campaign(g: ConquestGame, n: number): void {
  const s = g.s;
  const l = leans(g, n);
  for (const a of armiesOf(s, n)) {
    if (a.retreating || armyMen(a) <= 0 || playerArmy(g, a)) continue;
    if (a.depart >= 0) continue;
    // Busy besieging? keep at it.
    const pr = s.provinces[a.prov];
    if (pr.siege?.by === n) continue;
    const target = pickTarget(g, n, a, l.aggression);
    if (target >= 0 && target !== a.prov)
      g.command(n, { k: "move", a: a.id, to: target });
  }
}

function pickTarget(
  g: ConquestGame,
  n: number,
  a: Army,
  aggression: number,
): number {
  const s = g.s;
  const tree = routeTree(s, g.map, n, a.prov, armySpeed(a));
  const men = armyMen(a);
  let best = -1;
  let bestScore = 0;
  for (let p = 0; p < s.provinces.length; p++) {
    const days = tree.days[p];
    if (!Number.isFinite(days) || days > 90) continue;
    const pr = s.provinces[p];
    const h = pr.owner >= 0 ? holder(pr) : -1;
    const enemyMen = s.armies
      .filter((x) => x.prov === p && atWar(s, x.owner, n))
      .reduce((m, x) => m + armyMen(x), 0);
    let score = 0;
    if (pr.owner === n && pr.occupier >= 0)
      score = provinceValue(s, p) * 3; // take it back
    else if (h >= 0 && atWar(s, h, n))
      score = provinceValue(s, p) * (1 + (pr.b.fort ?? 0) * -0.25);
    else if (enemyMen > 0) score = 2;
    if (score <= 0) continue;
    if (enemyMen > men * (0.6 + 0.4 / aggression)) continue;
    score = score / (1 + days / 20);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

// ---------------------------------------------------------------- diplomacy

function natives(g: ConquestGame, n: number): void {
  const s = g.s;
  const l = leans(g, n);
  const nation = s.nations[n];
  for (const other of s.nations) {
    if (other.kind !== "native" || !other.alive) continue;
    if (
      !nationsBorder(s, g.map, n, other.id) &&
      !nationsBorder(s, g.map, other.id, n)
    )
      continue;
    if (
      !treatyBetween(s, n, other.id, "trade") &&
      treatyCheck(s, g.w, n, other.id, "trade").ok
    )
      g.command(n, { k: "treaty", n: other.id, t: "trade" });
    const opinion = relationOf(s, g.w, other.id, n).total;
    if (opinion < -30 && nation.gold > 120 && !atWar(s, n, other.id))
      g.command(n, { k: "gift", n: other.id, gold: 25 });
    // Land: buy what's for sale, or (if aggressive and much stronger) take it.
    for (const p of provincesOf(s, other.id)) {
      if (nation.gold > 200 && buyCheck(s, g.w, n, p).ok) {
        g.command(n, { k: "buy", p });
        break;
      }
    }
    const mine = strength(g, n);
    const theirs =
      strength(g, other.id) +
      provincesOf(s, other.id).reduce(
        (m, p) => m + tribesfolk(s.provinces[p]) * WARRIOR_SHARE * 0.3,
        0,
      );
    if (
      !governed(g, n) &&
      l.aggression > 1 &&
      mine > theirs * 2 &&
      opinion < 0 &&
      warCheck(s, n, other.id).ok &&
      enemiesOf(s, n).length === 0 &&
      g.rng.chance(0.04 * l.aggression)
    ) {
      g.command(n, { k: "war", n: other.id });
    }
  }
}

function peace(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = s.nations[n];
  for (const enemy of enemiesOf(s, n)) {
    const war = warBetween(s, n, enemy)!;
    if (s.nations[enemy].kind === "crown" || s.nations[enemy].kind === "rebels")
      continue;
    if (warMonths(s, war) < 6) continue;
    const score = warScore(s, war, n).total;
    const europeWar =
      war.europe &&
      s.europe.wars[[n, enemy].sort((a, b) => a - b).join("-")] !== undefined;
    if (europeWar && score > -40) continue;
    const held = s.provinces
      .map((pr, p) => (pr.owner === enemy && pr.occupier === n ? p : -1))
      .filter((p) => p >= 0);
    let terms: PeaceTerms = { take: [], give: [], gold: 0 };
    if (score >= 25 && held.length > 0) {
      terms = { take: held.slice(0, 2), give: [], gold: 0 };
      if (peaceWillingness(s, n, enemy, terms).total < 0)
        terms = { take: held.slice(0, 1), give: [], gold: 0 };
    }
    // A beaten native nation is made to pay tribute.
    const foe = s.nations[enemy];
    if (
      score >= 45 &&
      nation.kind === "power" &&
      foe.kind === "native" &&
      foe.overlord < 0
    ) {
      const harsh = { ...terms, subjugate: true };
      if (peaceWillingness(s, n, enemy, harsh).total >= 0) terms = harsh;
    }
    if (
      score >= 25 ||
      score <= -15 ||
      nation.warExhaustion > 20 ||
      warMonths(s, war) > 36
    ) {
      if (
        peaceWillingness(s, n, enemy, terms).total >= 0 ||
        s.nations[enemy].player !== null
      )
        g.command(n, { k: "peace", n: enemy, terms });
    }
  }
  // Answer players' offers.
  for (const o of s.offers.filter((x) => x.to === n)) {
    g.command(n, {
      k: "answer",
      offer: o.id,
      yes: peaceWillingness(s, o.from, n, o.terms).total >= 0,
    });
  }
}

// ---------------------------------------------------------------- natives

function nativeAi(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = s.nations[n];
  const diff = DIFFICULTY[s.settings.difficulty];
  const enemies = enemiesOf(s, n);
  // Call up warriors when there's fighting to do.
  const types = regimentTypes(nation);
  const pool = provincesOf(s, n).reduce(
    (m, p) => m + tribesfolk(s.provinces[p]) * WARRIOR_SHARE,
    0,
  );
  const under = armiesOf(s, n).reduce((m, a) => m + armyMen(a), 0);
  const want = enemies.length > 0 ? pool * 0.7 : Math.min(pool * 0.06, 600);
  if (under < want) {
    for (const p of provincesOf(s, n)) {
      const t: RegType =
        types.includes("riders") && g.rng.chance(0.5) ? "riders" : "warriors";
      if (recruitCheck(s, n, p, t).ok) {
        g.command(n, { k: "recruit", p, t });
        break;
      }
    }
  }
  if (enemies.length > 0) campaign(g, n);
  else gather(g, n);
  // War on settlers who've pushed them too far.
  if (enemies.length === 0 && !governed(g, n)) {
    for (const other of s.nations) {
      if (other.kind !== "power" || !other.alive) continue;
      if (
        !nationsBorder(s, g.map, other.id, n) &&
        !nationsBorder(s, g.map, n, other.id)
      )
        continue;
      const opinion = relationOf(s, g.w, n, other.id).total;
      if (opinion > -30 / diff.nativeAnger) continue;
      const theirs = strength(g, other.id) + 200;
      if (pool * 0.6 < theirs * 0.6) continue;
      // The angrier they are, the sooner the council agrees to fight.
      if (!g.rng.chance(Math.min(0.5, (-opinion - 20) / 60))) continue;
      if (warCheck(s, n, other.id).ok) {
        g.command(n, { k: "war", n: other.id });
        break;
      }
    }
  }
  // Trade with colonies they like; peace when it's going badly or long.
  for (const other of s.nations) {
    if (other.kind !== "power" || !other.alive) continue;
    if (
      relationOf(s, g.w, n, other.id).total >= 10 &&
      treatyCheck(s, g.w, n, other.id, "trade").ok
    )
      g.command(n, { k: "treaty", n: other.id, t: "trade" });
  }
  for (const enemy of enemies) {
    const war = warBetween(s, n, enemy)!;
    if (s.nations[enemy].kind === "rebels") continue;
    if (warMonths(s, war) < 4) continue;
    const score = warScore(s, war, n).total;
    // WORLD r11: a native nation takes back its own country, not new land.
    const held = s.provinces
      .map((pr, p) => (pr.owner === enemy && pr.occupier === n ? p : -1))
      .filter((p) => p >= 0 && g.w.startOwner[p] === nation.key);
    const terms: PeaceTerms =
      score >= 30 && held.length > 0
        ? { take: held.slice(0, 1), give: [], gold: 0 }
        : { take: [], give: [], gold: 0 };
    if (score >= 30 || score <= -20 || nation.warExhaustion > 15) {
      if (
        peaceWillingness(s, n, enemy, terms).total >= 0 ||
        s.nations[enemy].player !== null
      )
        g.command(n, { k: "peace", n: enemy, terms });
    }
  }
  for (const o of s.offers.filter((x) => x.to === n)) {
    g.command(n, {
      k: "answer",
      offer: o.id,
      yes: peaceWillingness(s, o.from, n, o.terms).total >= 0,
    });
  }
  void REGIMENTS;
}

// ---------------------------------------------------------------- rebels

/** A rising's host marches on its target (unless a player leads it). */
function rebelsAi(g: ConquestGame, n: number): void {
  const s = g.s;
  const target = rebelTarget(g, n);
  for (const a of armiesOf(s, n)) {
    if (a.depart >= 0 || a.retreating || playerArmy(g, a)) continue;
    if (s.provinces[a.prov].siege?.by === n) continue;
    if (target >= 0 && a.prov !== target)
      g.command(n, { k: "move", a: a.id, to: target });
  }
}

// ---------------------------------------------------------------- crowns

function crownAi(g: ConquestGame, n: number): void {
  const s = g.s;
  // Expeditions march on the rebel capital and take it.
  const colony = s.nations[n].colony;
  const target = s.nations[colony]?.capital ?? -1;
  for (const a of armiesOf(s, n)) {
    if (a.depart >= 0 || a.retreating) continue;
    if (s.provinces[a.prov].siege?.by === n) continue;
    if (target >= 0 && a.prov !== target)
      g.command(n, { k: "move", a: a.id, to: target });
  }
}

/** Now and then, send the best-suited courtier to survey nearby land. */
function explore(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = s.nations[n];
  if (nation.missions.length > 0 || s.day % 90 > 30) return;
  const leaders = missionLeaders(s, n)
    .map((c) => ({
      c,
      score: leaderFlags(s, c).reduce((m, f) => m + (f.good ? 1 : -1), 0),
    }))
    .sort((a, b) => b.score - a.score);
  const leader = leaders[0]?.c;
  if (!leader) return;
  const capital = nation.capital;
  let best = -1;
  let bestKm = Infinity;
  for (let p = 0; p < s.provinces.length; p++) {
    if (isExplored(s, n, p) || s.provinces[p].owner >= 0) continue;
    const km = kmBetween(g.map, capital, p);
    if (km < bestKm && missionCheck(s, g.w, n, leader.id, p, "explore").ok) {
      bestKm = km;
      best = p;
    }
  }
  if (best >= 0) g.command(n, { k: "expedition", c: leader.id, p: best });
}
