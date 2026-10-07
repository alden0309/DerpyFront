// Derpy Conquest battles: resolved in one go when enemy armies meet, round
// by round with a die for each side, and written up as a report.

import { Rng } from "./Rng";
import {
  BATTLE_BREAK_MORALE,
  BATTLE_CASUALTIES,
  BATTLE_MAX_ROUNDS,
  CAVALRY_OPEN_BONUS,
  FORT_DEFENSE_PER_LEVEL,
  NATIVE_AMBUSH_BONUS,
  REGIMENTS,
  RIVER_PENALTY,
  TERRAIN,
  powerRules,
} from "./Rules";
import {
  Army,
  BattleReport,
  BattleSide,
  GameState,
  MapDef,
  Nation,
  RegType,
  Regiment,
  Terrain,
} from "./Types";

const OPEN: Terrain[] = ["plains", "desert"];
const ROUGH: Terrain[] = ["forest", "jungle", "marsh", "mountains"];
const AMBUSH: Terrain[] = ["forest", "jungle", "hills", "mountains", "marsh"];

function typeBonus(type: RegType, terrain: Terrain): number {
  let m = 1;
  if (type === "cav" || type === "horse") {
    if (OPEN.includes(terrain)) m *= 1 + CAVALRY_OPEN_BONUS;
    else if (ROUGH.includes(terrain)) m *= 1 - CAVALRY_OPEN_BONUS;
  }
  if ((type === "war" || type === "horse") && AMBUSH.includes(terrain)) {
    m *= 1 + NATIVE_AMBUSH_BONUS;
  }
  return m;
}

function nationDiscipline(n: Nation): number {
  if (n.kind === "power") return powerRules(n).discipline;
  return n.strong ? 1.15 : 1;
}

interface Fighter {
  reg: Regiment;
  power: number;
}

function sideOf(
  armies: Army[],
  s: GameState,
  terrain: Terrain,
  useDefense: boolean,
): Fighter[] {
  const out: Fighter[] = [];
  for (const a of armies) {
    const disc = nationDiscipline(s.nations[a.owner]);
    for (const reg of a.regs) {
      const rules = REGIMENTS[reg.type];
      out.push({
        reg,
        power:
          (useDefense ? rules.defense : rules.attack) *
          typeBonus(reg.type, terrain) *
          disc,
      });
    }
  }
  return out;
}

const men = (f: Fighter[]) => f.reduce((sum, x) => sum + x.reg.men, 0);
const morale = (f: Fighter[]) => {
  const m = men(f);
  return m > 0
    ? f.reduce((sum, x) => sum + x.reg.morale * x.reg.men, 0) / m
    : 0;
};
const firepower = (f: Fighter[]) =>
  f.reduce(
    (sum, x) => sum + (x.reg.men / 1000) * x.power * (0.5 + 0.5 * x.reg.morale),
    0,
  );

function takeLosses(f: Fighter[], losses: number): number {
  const total = men(f);
  if (total <= 0) return 0;
  let taken = 0;
  for (const x of f) {
    const l = Math.min(x.reg.men, Math.round((losses * x.reg.men) / total));
    x.reg.men -= l;
    taken += l;
  }
  const hit = Math.min(0.6, (taken / total) * 2.5 + 0.03);
  for (const x of f) x.reg.morale = Math.max(0, x.reg.morale - hit);
  return taken;
}

function regCounts(armies: Army[]): Partial<Record<RegType, number>> {
  const out: Partial<Record<RegType, number>> = {};
  for (const a of armies)
    for (const r of a.regs) out[r.type] = (out[r.type] ?? 0) + 1;
  return out;
}

const TERRAIN_WORDS: Record<Terrain, string> = {
  plains: "plains",
  forest: "forest",
  hills: "hills",
  mountains: "mountains",
  jungle: "jungle",
  desert: "desert",
  marsh: "marshes",
  tundra: "tundra",
};

/**
 * Fights it out in province `p`. Changes the regiments' men and morale;
 * the caller moves or removes the losers. `crossedRiver` is whether the
 * attackers came over a river to get here.
 */
export function fightBattle(
  s: GameState,
  map: MapDef,
  rng: Rng,
  id: number,
  p: number,
  attackers: Army[],
  defenders: Army[],
  crossedRiver: boolean,
): BattleReport {
  const def = map.provinces[p];
  const terrain = def.terrain;
  const prov = s.provinces[p];
  const notes: string[] = [];

  const att = sideOf(attackers, s, terrain, false);
  const dfn = sideOf(defenders, s, terrain, true);

  let defBonus = TERRAIN[terrain].defense;
  if (defBonus > 0) {
    notes.push(
      `Defenders hold the ${TERRAIN_WORDS[terrain]} (+${Math.round(defBonus * 100)}%)`,
    );
  }
  const defenderOwnsIt = defenders.some((a) => a.owner === prov.owner);
  if (defenderOwnsIt && prov.fort > 0) {
    const fortBonus = FORT_DEFENSE_PER_LEVEL * prov.fort;
    defBonus += fortBonus;
    notes.push(
      `A level ${prov.fort} fort shelters the defenders (+${Math.round(fortBonus * 100)}%)`,
    );
    // Cannon earn their keep against walls.
    for (const x of att) if (x.reg.type === "art") x.power *= 1.3;
    if (att.some((x) => x.reg.type === "art"))
      notes.push("Attacking artillery pounds the fort");
  }
  let attMult = 1;
  if (crossedRiver) {
    attMult -= RIVER_PENALTY;
    notes.push(
      `Attackers crossed a river under fire (-${Math.round(RIVER_PENALTY * 100)}%)`,
    );
  }
  const anyCav = (f: Fighter[]) =>
    f.some((x) => x.reg.type === "cav" || x.reg.type === "horse");
  if (OPEN.includes(terrain) && (anyCav(att) || anyCav(dfn))) {
    notes.push("Cavalry charge across open ground (+25%)");
  } else if (ROUGH.includes(terrain) && (anyCav(att) || anyCav(dfn))) {
    notes.push(`Cavalry struggle in the ${TERRAIN_WORDS[terrain]} (-25%)`);
  }
  const anyNative = (f: Fighter[]) =>
    f.some((x) => x.reg.type === "war" || x.reg.type === "horse");
  if (AMBUSH.includes(terrain) && (anyNative(att) || anyNative(dfn))) {
    notes.push(
      `Warriors who know the ${TERRAIN_WORDS[terrain]} fight from ambush (+25%)`,
    );
  }

  const startMen: [number, number] = [men(att), men(dfn)];
  const rounds: BattleReport["rounds"] = [];
  let winner: 0 | 1 = 1;
  for (let r = 0; r < BATTLE_MAX_ROUNDS; r++) {
    const rollA = rng.int(1, 6);
    const rollD = rng.int(1, 6);
    const hitD =
      firepower(att) * attMult * (0.55 + 0.15 * rollA) * BATTLE_CASUALTIES;
    const hitA =
      firepower(dfn) *
      (1 + defBonus) *
      (0.55 + 0.15 * rollD) *
      BATTLE_CASUALTIES;
    const lostD = takeLosses(dfn, hitD);
    const lostA = takeLosses(att, hitA);
    rounds.push({ rolls: [rollA, rollD], lost: [lostA, lostD] });
    const breakA =
      morale(att) < BATTLE_BREAK_MORALE || men(att) < startMen[0] * 0.25;
    const breakD =
      morale(dfn) < BATTLE_BREAK_MORALE || men(dfn) < startMen[1] * 0.25;
    if (breakA || breakD) {
      if (breakA && breakD) winner = morale(att) > morale(dfn) ? 0 : 1;
      else winner = breakD ? 0 : 1;
      break;
    }
  }

  const side = (armies: Army[], f: Fighter[], start: number): BattleSide => ({
    nations: [...new Set(armies.map((a) => a.owner))],
    regs: regCounts(armies),
    men: start,
    lost: start - men(f),
    moraleEnd: Math.round(morale(f) * 100) / 100,
  });
  const attackerSide = side(attackers, att, startMen[0]);
  const defenderSide = side(defenders, dfn, startMen[1]);
  // Restore the counts from before the battle for the report.
  attackerSide.regs = regCounts(attackers);
  defenderSide.regs = regCounts(defenders);
  const losers = winner === 0 ? defenderSide : attackerSide;
  const destroyed = losers.men - losers.lost < losers.men * 0.25;
  return {
    id,
    day: s.day,
    prov: p,
    attacker: attackerSide,
    defender: defenderSide,
    rounds,
    winner,
    notes,
    outcome: destroyed ? "destroyed" : "retreated",
  };
}
