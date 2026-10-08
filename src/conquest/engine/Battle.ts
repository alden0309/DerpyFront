// A battle, fought day by day until one side breaks or the attacker gives
// up. No single number decides it: numbers, morale, discipline, ground,
// rivers, forts, supplies, commanders and weather all count, and the report
// lists each. The only luck is named luck: the weather on the day, and the
// moments a commander gets right or wrong, with the roll shown.

import type { ConquestGame } from "./Game";
import { isWinter } from "./Map";
import {
  armyMen,
  charName,
  countRegs,
  hasTrait,
  monthOf,
  stat,
} from "./Queries";
import {
  BATTLE_MAX_DAYS,
  BREAK_MORALE,
  DAILY_LOSS,
  MORALE_SHOCK,
  OUTPOST,
  POWER_RULES,
  REGIMENTS,
  TERRAIN,
} from "./Rules";
import {
  Army,
  BattleFactor,
  BattleReport,
  BattleSide,
  Character,
  RegType,
  Terrain,
} from "./Types";

const OPEN: Terrain[] = ["plains", "desert"];
const COVER: Terrain[] = ["forest", "jungle", "hills", "marsh", "mountains"];

interface Side {
  armies: Army[];
  nations: number[];
  commander: Character | undefined;
  factors: BattleFactor[];
  mult: number;
  startMen: number;
  startPower: number;
}

export type Weather = { key: string; text: string };

/** The weather on a battle's first day, from the season and the place. */
export function battleWeather(g: ConquestGame, p: number): Weather {
  const def = g.map.provinces[p];
  const month = monthOf(g.s);
  const winter = isWinter(def.lat, month);
  const tropical = g.w.tropical[p];
  const summer =
    def.lat >= 0 ? month >= 5 && month <= 8 : month >= 11 || month <= 2;
  const options: [Weather, number][] = [
    [{ key: "clear", text: "Clear skies" }, 5],
    [
      { key: "rain", text: "Heavy rain: damp powder, muskets misfire" },
      tropical ? 3 : 2,
    ],
    [
      { key: "fog", text: "Morning fog: the attackers stumble in blind" },
      def.terrain === "marsh" || def.coastal ? 2 : 1,
    ],
  ];
  if (winter) options.push([{ key: "snow", text: "Snow on the ground" }, 4]);
  if (summer && tropical)
    options.push([
      { key: "heat", text: "Crushing heat: heavy troops wilt" },
      3,
    ]);
  const total = options.reduce((m, [, w]) => m + w, 0);
  let roll = g.rng.next() * total;
  for (const [weather, w] of options) {
    roll -= w;
    if (roll <= 0) return weather;
  }
  return options[0][0];
}

function sideMen(side: Side): number {
  return side.armies.reduce((m, a) => m + armyMen(a), 0);
}

function sideMorale(side: Side): number {
  const men = sideMen(side);
  if (men <= 0) return 0;
  let m = 0;
  for (const a of side.armies) for (const r of a.regs) m += r.morale * r.men;
  return m / men;
}

function typeShare(side: Side, types: RegType[]): number {
  const men = sideMen(side);
  if (men <= 0) return 0;
  let n = 0;
  for (const a of side.armies)
    for (const r of a.regs) if (types.includes(r.type)) n += r.men;
  return n / men;
}

/** Fighting power before the day's luck. */
function power(side: Side): number {
  let p = 0;
  for (const a of side.armies) {
    for (const r of a.regs)
      p += r.men * REGIMENTS[r.type].fight * (0.5 + 0.5 * r.morale);
  }
  return p * side.mult;
}

function addFactor(side: Side, label: string, value: number): void {
  if (Math.abs(value - 1) < 0.005) return;
  side.factors.push({ label, value: Math.round(value * 100) / 100 });
  side.mult *= value;
}

function bestCommander(g: ConquestGame, armies: Army[]): Character | undefined {
  let best: Character | undefined;
  for (const a of armies) {
    const c = g.s.chars[a.commander];
    if (c?.alive && (!best || stat(g.s, c, "mar") > stat(g.s, best, "mar")))
      best = c;
  }
  return best;
}

export interface BattleResult {
  report: BattleReport;
  /** Commanders killed in the fighting. */
  fallen: number[];
}

export function fightBattle(
  g: ConquestGame,
  p: number,
  attackers: Army[],
  defenders: Army[],
): BattleResult {
  const s = g.s;
  const def = g.map.provinces[p];
  const pr = s.provinces[p];
  const terrain = def.terrain;
  const mk = (armies: Army[]): Side => ({
    armies,
    nations: [...new Set(armies.map((a) => a.owner))],
    commander: bestCommander(g, armies),
    factors: [],
    mult: 1,
    startMen: armies.reduce((m, a) => m + armyMen(a), 0),
    startPower: 0,
  });
  const A = mk(attackers);
  const D = mk(defenders);

  // Ground and works.
  addFactor(D, `Defending the ${terrain}`, 1 + TERRAIN[terrain].defense);
  const fort = pr.b.fort ?? 0;
  if (pr.outpost && D.nations.includes(pr.outpost.by))
    addFactor(D, "Behind the outpost's palisade", 1 + OUTPOST.defense);
  if (fort > 0 && D.nations.includes(pr.owner) && pr.occupier < 0)
    addFactor(D, `Fort (level ${fort})`, 1 + fort * 0.15);
  const river = attackers.some(
    (a) =>
      a.from >= 0 &&
      g.map.provinces[a.from].nb.some(([q, , r]) => q === p && r === 1),
  );
  if (river) addFactor(A, "Attacking across a river", 0.75);

  for (const side of [A, D]) {
    const cmd = side.commander;
    if (cmd) {
      const mar = stat(s, cmd, "mar");
      addFactor(
        side,
        `${charName(cmd)} commands (martial ${mar})`,
        1 + (mar - 5) * 0.03,
      );
      if (hasTrait(cmd, "brave"))
        addFactor(side, "Brave commander leads from the front", 1.05);
      if (hasTrait(cmd, "craven"))
        addFactor(side, "Craven commander hangs back", 0.92);
    } else addFactor(side, "No commander", 0.92);
    const nation = s.nations[side.nations[0]];
    const disc = POWER_RULES[nation.key]?.discipline ?? 1;
    const regulars = typeShare(side, ["regulars"]);
    if (disc !== 1 && regulars > 0)
      addFactor(side, `${nation.adjective} drill`, 1 + (disc - 1) * regulars);
    const supply =
      side.armies.reduce((m, a) => m + a.supply * armyMen(a), 0) /
      Math.max(1, sideMen(side));
    if (supply < 0.95)
      addFactor(
        side,
        `Supplies ${Math.round(supply * 100)}%`,
        0.7 + 0.3 * supply,
      );
    const horse = typeShare(side, ["dragoons", "riders"]);
    if (horse > 0 && OPEN.includes(terrain))
      addFactor(side, "Horsemen on open ground", 1 + 0.25 * horse);
    if (
      horse > 0 &&
      (terrain === "forest" || terrain === "jungle" || terrain === "marsh")
    )
      addFactor(side, "Horses tangled in the woods", 1 - 0.25 * horse);
    const warriors = typeShare(side, ["warriors", "riders"]);
    if (warriors > 0 && COVER.includes(terrain))
      addFactor(side, "Warriors who know this country", 1 + 0.18 * warriors);
    if (warriors > 0 && nation.kind === "native") {
      const guns = nation.market.stock.guns;
      const armed = Math.min(1, (guns * 10) / Math.max(1, sideMen(side)));
      if (armed > 0.05)
        addFactor(
          side,
          `Traded muskets (${Math.round(armed * 100)}% armed)`,
          1 + 0.25 * armed,
        );
    }
    const guns = typeShare(side, ["artillery"]);
    if (guns > 0)
      addFactor(
        side,
        OPEN.includes(terrain)
          ? "Cannon on open ground"
          : "Cannon in rough country",
        OPEN.includes(terrain) ? 1 + guns * 2 : 1 + guns * 0.6,
      );
  }

  // Warriors who had never faced a cavalry charge or a cannonade.
  for (const [side, other] of [
    [A, D],
    [D, A],
  ] as const) {
    if (s.nations[side.nations[0]].kind !== "native") continue;
    const shockTroops = typeShare(other, ["dragoons", "artillery"]);
    if (shockTroops > 0)
      addFactor(
        side,
        "Facing horse and cannon",
        1 - 0.5 * Math.min(1, shockTroops * 1.5),
      );
  }

  // The weather, the same for both.
  const weather = battleWeather(g, p);
  const luck: string[] = [weather.text];
  if (weather.key === "rain") {
    for (const side of [A, D]) {
      const gunmen = typeShare(side, ["regulars", "dragoons", "artillery"]);
      if (gunmen > 0)
        addFactor(side, "Rain soaks the powder", 1 - 0.2 * gunmen);
    }
  } else if (weather.key === "fog") addFactor(A, "Fog: lost their way in", 0.9);
  else if (weather.key === "snow") {
    for (const side of [A, D]) {
      const n = s.nations[side.nations[0]];
      if (n.kind === "native" || n.key === "sweden")
        addFactor(side, "At home in the snow", 1.1);
      else addFactor(side, "Floundering in snow", 0.93);
    }
  } else if (weather.key === "heat") {
    for (const side of [A, D]) {
      const heavy = typeShare(side, ["regulars", "artillery"]);
      if (heavy > 0) addFactor(side, "Wool coats in the heat", 1 - 0.1 * heavy);
    }
  }

  A.startPower = power(A);
  D.startPower = power(D);
  const rounds: BattleReport["rounds"] = [];
  let winner: 0 | 1 = 1;
  for (let day = 1; day <= BATTLE_MAX_DAYS; day++) {
    // Commanders' moments: a d20 roll plus martial, against 15.
    const dayMult = [1, 1];
    let note: string | null = null;
    [A, D].forEach((side, i) => {
      const cmd = side.commander;
      if (!cmd) return;
      const roll = g.rng.int(1, 20);
      const mar = stat(s, cmd, "mar");
      if (roll + mar >= 24) {
        dayMult[i] = 1.2;
        const text = `Day ${day}: ${charName(cmd)}'s flank march (rolled ${roll} + ${mar} martial)`;
        luck.push(text);
        note = text;
      } else if (roll <= 2) {
        dayMult[i] = 0.85;
        const text = `Day ${day}: ${charName(cmd)} misjudged the ground (rolled ${roll})`;
        luck.push(text);
        note = text;
      }
    });
    const pa = power(A) * dayMult[0];
    const pd = power(D) * dayMult[1];
    const shockA = sideMorale(D) < 0.5 ? 1 + shock(A) : 1;
    const shockD = sideMorale(A) < 0.5 ? 1 + shock(D) : 1;
    const lossD = Math.min(sideMen(D), pa * DAILY_LOSS * shockA);
    const lossA = Math.min(sideMen(A), pd * DAILY_LOSS * shockD);
    const shareA = sideMen(A) > 0 ? lossA / sideMen(A) : 1;
    const shareD = sideMen(D) > 0 ? lossD / sideMen(D) : 1;
    takeLosses(A, lossA, shareA * MORALE_SHOCK);
    takeLosses(D, lossD, shareD * MORALE_SHOCK);
    rounds.push({ lost: [Math.round(lossA), Math.round(lossD)], note });
    const mA = sideMorale(A);
    const mD = sideMorale(D);
    if (mD < BREAK_MORALE || sideMen(D) < 1) {
      winner = 0;
      break;
    }
    if (mA < BREAK_MORALE || sideMen(A) < 1) {
      winner = 1;
      break;
    }
    if (day === BATTLE_MAX_DAYS) winner = mA > mD + 0.25 ? 0 : 1;
  }

  // A brave commander who leads from the front may fall.
  const fallen: number[] = [];
  for (const side of [A, D]) {
    const cmd = side.commander;
    if (cmd && hasTrait(cmd, "brave") && g.rng.chance(0.04)) {
      luck.push(
        `${charName(cmd)} fell leading a charge (brave commanders risk it: 4%)`,
      );
      side.armies.forEach((a) => {
        if (a.commander === cmd.id) g.touch(a).commander = -1;
      });
      side.commander = undefined;
      fallen.push(cmd.id);
    }
  }

  const report: BattleReport = {
    id: g.nextId(),
    day: s.day,
    prov: p,
    attacker: summary(A),
    defender: summary(D),
    rounds,
    winner,
    luck,
    outcome: "retreated",
  };
  return { report, fallen };
}

function shock(side: Side): number {
  const men = sideMen(side);
  if (men <= 0) return 0;
  let n = 0;
  for (const a of side.armies)
    for (const r of a.regs) n += r.men * (REGIMENTS[r.type].shock - 0.5);
  return Math.max(0, n / men);
}

function takeLosses(side: Side, losses: number, moraleHit: number): void {
  const men = sideMen(side);
  if (men <= 0) return;
  for (const a of side.armies) {
    for (const r of a.regs) {
      const lost = (losses * r.men) / men;
      r.men = Math.max(0, Math.round((r.men - lost) * 10) / 10);
      r.morale = Math.max(0, Math.round((r.morale - moraleHit) * 100) / 100);
    }
  }
}

function summary(side: Side): BattleSide {
  const men = sideMen(side);
  return {
    nations: side.nations,
    commander: side.commander ? charName(side.commander) : null,
    regs: countRegs(side.armies),
    men: Math.round(side.startMen),
    lost: Math.round(side.startMen - men),
    moraleEnd: Math.round(sideMorale(side) * 100) / 100,
    power: Math.round(side.startPower),
    factors: side.factors,
  };
}
