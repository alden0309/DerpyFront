// Derpy Conquest: the computer players. Colonial powers settle, build,
// trade, raise armies and pick fights they can win; native nations raise
// warriors, defend their land and raid colonists they've come to hate.
// Each runs every five days, issuing the same commands a player would.

import type { ConquestGame } from "./Game";
import {
  armiesOf,
  armySpeed,
  armyStrength,
  atWar,
  bordersProvince,
  buildCheck,
  buyCheck,
  colonizeCheck,
  dealBetween,
  enemiesOf,
  giftCheck,
  nationsBorder,
  pathTo,
  portConnected,
  provincesOf,
  recruitCheck,
  regimentTypes,
  routeTree,
  tradeCheck,
  truceUntil,
  warBetween,
  warCheck,
} from "./Queries";
import {
  DIFFICULTY,
  GOOD_BASE_PRICE,
  GOOD_YIELD,
  provinceCapacity,
  RAID_OPINION,
  REGIMENTS,
} from "./Rules";
import { Army, GameState, RegType } from "./Types";

export function runAi(game: ConquestGame, n: number): void {
  const nation = game.state.nations[n];
  if (!nation.alive || game.state.over) return;
  if (nation.kind === "power") powerAi(game, n);
  else nativeAi(game, n);
}

function strengthOf(s: GameState, n: number): number {
  let total = 0;
  for (const a of s.armies) if (a.owner === n) total += armyStrength(a);
  return total;
}

function regimentCount(s: GameState, n: number): number {
  let count = 0;
  for (const a of s.armies) if (a.owner === n) count += a.regs.length;
  for (const p of s.provinces) if (p.owner === n) count += p.recruits.length;
  return count;
}

function provinceValue(game: ConquestGame, p: number): number {
  const def = game.map.provinces[p];
  const prov = game.state.provinces[p];
  return (
    GOOD_BASE_PRICE[def.good] * GOOD_YIELD[def.good] +
    provinceCapacity(def.terrain, def.areaKm2) / 2500 +
    (def.coastal ? 2 : 0) +
    (prov.pop + prov.natives * 0.2) / 2000
  );
}

// ---------------------------------------------------------------- peace

/** Whether the computer playing `ai` would make peace with `other` now. */
export function aiWantsPeace(
  game: ConquestGame,
  ai: number,
  other: number,
): boolean {
  const s = game.state;
  const war = warBetween(s, ai, other);
  if (!war) return true;
  const months = (s.day - war.start) / 30;
  if (months < 2) return false;
  const mine = s.armies
    .filter((a) => a.owner === ai)
    .reduce((sum, a) => sum + armyStrength(a), 0);
  const theirs = s.armies
    .filter((a) => a.owner === other)
    .reduce((sum, a) => sum + armyStrength(a), 0);
  const myGains = war.gains[war.a === ai ? 0 : 1];
  const theirGains = war.gains[war.a === ai ? 1 : 0];
  if (s.nations[ai].kind === "native") {
    if (months >= 12) return true;
    return months >= 4 && (mine < theirs || theirGains > myGains);
  }
  if (months >= 24) return true;
  return months >= 6 && (mine < theirs * 0.8 || theirGains > myGains);
}

function handlePeace(game: ConquestGame, n: number): void {
  const s = game.state;
  for (const other of enemiesOf(s, n)) {
    if (!aiWantsPeace(game, n, other)) continue;
    const them = s.nations[other];
    if (them.player === null) {
      if (aiWantsPeace(game, other, n)) game.makePeace(n, other);
    } else if (game.rng.chance(0.15)) {
      game.command(n, { k: "peace", n: other });
    }
  }
}

// ---------------------------------------------------------------- powers

function powerAi(game: ConquestGame, n: number): void {
  const s = game.state;
  const me = s.nations[n];
  const rng = game.rng;
  const diff = DIFFICULTY[s.settings.difficulty];
  const owned = provincesOf(s, n);
  const atWarNow = enemiesOf(s, n).length > 0;

  handlePeace(game, n);

  // Colonies: the best open land in reach, while colonists last.
  while (me.colonists >= 1 && me.gold >= 45) {
    let best = -1;
    let bestScore = -Infinity;
    for (let p = 0; p < s.provinces.length; p++) {
      if (s.provinces[p].owner !== -1 || s.provinces[p].colony) continue;
      const ok = colonizeCheck(s, game.map, n, p);
      if (!ok.ok) continue;
      const def = game.map.provinces[p];
      let score = provinceValue(game, p) * 2 - ok.seaKm / 150 - ok.days / 40;
      if (def.nb.some(([q]) => s.provinces[q].owner === n)) score += 4;
      for (const [q] of def.nb) {
        const o = s.provinces[q].owner;
        if (o >= 0 && s.nations[o].kind === "native" && atWar(s, n, o))
          score -= 8;
      }
      score += rng.next() * 3;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best < 0 || game.command(n, { k: "colonize", p: best }) !== null) break;
  }

  // Buildings: ports first (they double what goods sell for), then farms
  // and forts once there's money to spare.
  const byPop = [...owned].sort(
    (a, b) => s.provinces[b].pop - s.provinces[a].pop || a - b,
  );
  if (me.gold >= 130) {
    const connected = portConnected(s, game.map, n);
    const port = byPop.find(
      (p) =>
        game.map.provinces[p].coastal &&
        s.provinces[p].port === 0 &&
        !connected.has(p) &&
        s.provinces[p].pop >= 350,
    );
    if (port !== undefined && buildCheck(s, game.map, n, port, "port").ok) {
      game.command(n, { k: "build", p: port, b: "port" });
    }
  }
  for (let i = 0; i < (me.gold > 1500 ? 3 : 1) && me.gold >= 220; i++) {
    const farm = byPop.find(
      (p) =>
        s.provinces[p].farm < 3 &&
        !s.provinces[p].build &&
        s.provinces[p].pop >= 500,
    );
    if (
      farm === undefined ||
      game.command(n, { k: "build", p: farm, b: "farm" }) !== null
    )
      break;
  }
  if (me.gold >= 320 && (atWarNow || me.gold > 1000 || rng.chance(0.2))) {
    const exposed = byPop.find(
      (p) =>
        s.provinces[p].fort < (p === me.capital ? 2 : 1) &&
        !s.provinces[p].build &&
        game.map.provinces[p].nb.some(([q]) => {
          const o = s.provinces[q].owner;
          return (
            o >= 0 &&
            o !== n &&
            (atWar(s, n, o) || s.nations[o].kind === "power")
          );
        }),
    );
    if (exposed !== undefined)
      game.command(n, { k: "build", p: exposed, b: "fort" });
  }

  // Armies: enough to hold what it has, more in wartime.
  // Rich computers spend: more regiments while gold piles up.
  const richBonus = Math.min(12, Math.floor(Math.max(0, me.gold - 400) / 300));
  const wanted = Math.round(
    (2 + owned.length / 4 + (atWarNow ? 3 : 0) + richBonus) *
      (diff.aggression >= 0.2 ? 1.3 : 1),
  );
  if (regimentCount(s, n) < wanted && me.gold >= 100) {
    const where = [me.capital, ...byPop].find(
      (p) => s.provinces[p]?.owner === n && s.provinces[p].pop >= 200,
    );
    if (where !== undefined) {
      const roll = rng.next();
      const prefer: RegType[] =
        roll < 0.15 ? ["art", "inf"] : roll < 0.4 ? ["cav", "inf"] : ["inf"];
      for (const t of prefer) {
        if (recruitCheck(s, game.map, n, where, t).ok) {
          game.command(n, { k: "recruit", p: where, t });
          break;
        }
      }
    }
  }

  // Natives: trade with whoever will, sweeten the angry ones, buy land.
  let gifted = false;
  for (const nat of s.nations) {
    if (nat.kind !== "native" || !nat.alive || atWar(s, n, nat.id)) continue;
    if (!dealBetween(s, n, nat.id) && tradeCheck(s, game.map, n, nat.id).ok) {
      game.command(n, { k: "trade", n: nat.id });
      continue;
    }
    if (
      !gifted &&
      nat.opinion[n] < -40 &&
      me.gold > 300 &&
      !atWarNow &&
      rng.chance(0.2) &&
      nationsBorder(s, game.map, n, nat.id)
    ) {
      if (giftCheck(s, n, nat.id, 50).ok) {
        game.command(n, { k: "gift", n: nat.id, gold: 50 });
        gifted = true;
      }
    }
  }
  if (me.gold > 380 && rng.chance(0.25)) {
    let best = -1;
    let bestScore = -Infinity;
    for (let p = 0; p < s.provinces.length; p++) {
      const o = s.provinces[p].owner;
      if (o < 0 || s.nations[o].kind !== "native") continue;
      const ok = buyCheck(s, game.map, n, p);
      if (!ok.ok) continue;
      const score = provinceValue(game, p) * 30 - ok.gold;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best >= 0) game.command(n, { k: "buy", p: best });
  }

  // Wars: only ones it expects to win, and not too often.
  if (!atWarNow && rng.chance(diff.aggression / 6)) {
    const mine = strengthOf(s, n);
    let target = -1;
    let bestScore = -Infinity;
    for (const o of s.nations) {
      if (!o.alive || o.id === n || !warCheck(s, n, o.id).ok) continue;
      if (o.kind === "power" && diff.aggression < 0.2) continue;
      const theirs = strengthOf(s, o.id);
      const margin = o.kind === "power" ? 2.5 : 1.8;
      if (mine < theirs * margin + 1) continue;
      if (!nationsBorder(s, game.map, n, o.id)) continue;
      let value = 0;
      for (const p of provincesOf(s, o.id))
        if (bordersProvince(s, game.map, n, p)) value += provinceValue(game, p);
      // Natives you trade with are worth more as friends.
      if (dealBetween(s, n, o.id)) value *= 0.3;
      const score = value - theirs * 2;
      if (score > bestScore) {
        bestScore = score;
        target = o.id;
      }
    }
    if (target >= 0) game.command(n, { k: "war", n: target });
  }

  moveArmies(game, n);
}

// ---------------------------------------------------------------- natives

function nativeAi(game: ConquestGame, n: number): void {
  const s = game.state;
  const me = s.nations[n];
  const rng = game.rng;
  const owned = provincesOf(s, n);
  if (owned.length === 0) return;
  const atWarNow = enemiesOf(s, n).length > 0;

  handlePeace(game, n);

  const wanted = owned.length * (me.strong ? 2 : 1) + (atWarNow ? 2 : 0) + 1;
  if (regimentCount(s, n) < wanted) {
    const types = regimentTypes(me);
    const t = types[types.length > 1 && rng.chance(0.5) ? 1 : 0];
    const where = rng.pick(owned)!;
    if (recruitCheck(s, game.map, n, where, t).ok)
      game.command(n, { k: "recruit", p: where, t });
  }

  // Raids on powers they've come to hate.
  if (!atWarNow) {
    for (const pw of s.nations) {
      if (pw.kind !== "power" || !pw.alive) continue;
      if (me.opinion[pw.id] > RAID_OPINION || truceUntil(s, n, pw.id) >= 0)
        continue;
      if (!nationsBorder(s, game.map, n, pw.id)) continue;
      if (strengthOf(s, n) < strengthOf(s, pw.id) * 0.8) continue;
      if (rng.chance(0.02) && warCheck(s, n, pw.id).ok) {
        game.command(n, { k: "war", n: pw.id });
        break;
      }
    }
  }

  moveArmies(game, n);
}

// ---------------------------------------------------------------- armies

/** Sends armies where they're needed: defend, attack, or go home. */
function moveArmies(game: ConquestGame, n: number): void {
  const s = game.state;
  const me = s.nations[n];
  const enemies = enemiesOf(s, n);
  let armies = armiesOf(s, n).filter((a) => !a.retreating);
  if (armies.length === 0) return;

  // Merge halted armies sharing a province.
  for (const a of armies) {
    if (a.path.length > 0 || !s.armies.includes(a)) continue;
    for (const b of armies) {
      if (
        b !== a &&
        b.prov === a.prov &&
        b.path.length === 0 &&
        s.armies.includes(b)
      ) {
        game.command(n, { k: "merge", a: a.id, b: b.id });
      }
    }
  }
  armies = armiesOf(s, n).filter((a) => !a.retreating);

  if (enemies.length === 0) {
    // Peacetime: armies abroad come home.
    for (const a of armies) {
      if (a.path.length > 0 || s.provinces[a.prov].owner === n) continue;
      const home =
        s.provinces[me.capital]?.owner === n
          ? me.capital
          : provincesOf(s, n)[0];
      if (home !== undefined) game.command(n, { k: "move", a: a.id, to: home });
    }
    return;
  }

  const enemyArmies = s.armies.filter((a) => enemies.includes(a.owner));
  const strengthAt = (p: number) =>
    enemyArmies
      .filter((a) => a.prov === p || a.path[0] === p)
      .reduce((sum, a) => sum + armyStrength(a), 0);

  // Threats: enemies in or besieging our land.
  const threatened = new Set<number>();
  for (const a of enemyArmies) {
    if (s.provinces[a.prov].owner === n) threatened.add(a.prov);
    if (a.path.length > 0 && s.provinces[a.path[0]].owner === n)
      threatened.add(a.path[0]);
  }
  const busy = new Set<number>();
  for (const p of [...threatened].sort((x, y) => x - y)) {
    const threat = strengthAt(p);
    let best: Army | null = null;
    let bestDays = Infinity;
    for (const a of armies) {
      if (busy.has(a.id) || armyStrength(a) < threat * 0.8) continue;
      if (a.prov === p || a.path[a.path.length - 1] === p) {
        best = a;
        break;
      }
      const tree = routeTree(s, game.map, n, a.prov, armySpeed(a), p);
      if (tree.days[p] < bestDays && tree.days[p] < 60) {
        bestDays = tree.days[p];
        best = a;
      }
    }
    if (best) {
      busy.add(best.id);
      if (best.prov !== p && best.path[best.path.length - 1] !== p)
        game.command(n, { k: "move", a: best.id, to: p });
    }
  }

  // Attack: idle armies go for the best enemy province within reach.
  for (const a of armies) {
    if (busy.has(a.id) || a.path.length > 0) continue;
    // Already besieging something? Keep at it.
    const here = s.provinces[a.prov];
    if (here.owner >= 0 && enemies.includes(here.owner)) continue;
    const mine = armyStrength(a);
    const tree = routeTree(s, game.map, n, a.prov, armySpeed(a));
    let target = -1;
    let bestScore = -Infinity;
    for (let p = 0; p < s.provinces.length; p++) {
      const o = s.provinces[p].owner;
      if (o < 0 || !enemies.includes(o) || tree.days[p] === Infinity) continue;
      const defenders = strengthAt(p);
      if (mine < defenders * 1.25 + 0.5) continue;
      if (
        s.provinces[p].fort * 1000 >
        a.regs.reduce((sum, r) => sum + r.men, 0)
      )
        continue;
      const score =
        provinceValue(game, p) * 3 -
        tree.days[p] / 3 -
        s.provinces[p].fort * 15;
      if (score > bestScore) {
        bestScore = score;
        target = p;
      }
    }
    if (target >= 0) {
      const path = pathTo(tree, a.prov, target);
      if (path && path.days < 120)
        game.command(n, { k: "move", a: a.id, to: target });
    } else if (s.provinces[a.prov].owner !== n) {
      const home =
        s.provinces[me.capital]?.owner === n
          ? me.capital
          : provincesOf(s, n)[0];
      if (home !== undefined) game.command(n, { k: "move", a: a.id, to: home });
    }
  }
}

/** Exposed for tests: how much regiments of a type cost. */
export function regimentGold(t: RegType): number {
  return REGIMENTS[t].gold;
}
