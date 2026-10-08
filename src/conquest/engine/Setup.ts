// A new Derpy Conquest game: 1 January 1607. Five colonial powers with their
// first settlements and governors, dozens of native nations, the open
// country between them, and the crowns back in Europe.

import { dayOf } from "./Calendar";
import {
  governorFromPlan,
  makeCharacter,
  makeFamily,
  makeNotable,
  randomGovernor,
  randomStats,
} from "./Characters";
import { worldOf } from "./Map";
import { nativeTitle } from "./Names";
import {
  anchorPrice,
  emptyGoods,
  nationDemand,
  pairKey,
  provincesOf,
} from "./Queries";
import { Rng } from "./Rng";
import {
  DIFFICULTY,
  EUROPE_PRICE,
  NATIVE_DENSITY_OWNED,
  NATIVE_DENSITY_WILD,
  NATIVE_STRONG_FACTOR,
  POWER_RULES,
  RICH_SHARE,
  RIVALRY,
  SEEN_BY_SEA_KM,
  SETTLER_MIX,
} from "./Rules";
import {
  GameSettings,
  GameState,
  GOODS,
  MapDef,
  Nation,
  PlayerSeat,
  Pop,
  PopClass,
  Province,
  SEATS,
} from "./Types";

/** Saves from another version can't be loaded: bump it when the state's shape changes. */
export const STATE_VERSION = 3;

export function newGameState(
  map: MapDef,
  settings: GameSettings,
  seats: PlayerSeat[],
): GameState {
  const w = worldOf(map);
  const state: GameState = {
    version: STATE_VERSION,
    settings,
    day: 0,
    endDay: dayOf(settings.endYear),
    rng: settings.seed | 0,
    nextId: 1,
    provinces: [],
    nations: [],
    chars: {},
    armies: [],
    wars: [],
    truces: [],
    treaties: [],
    offers: [],
    europe: {
      price: { ...EUROPE_PRICE },
      glut: emptyGoods(),
      tension: {},
      wars: {},
    },
    battles: [],
    over: false,
    winner: -1,
  };
  const rng = new Rng(state);
  const keyIndex = new Map<string, number>();

  for (const def of map.powers) {
    const rules = POWER_RULES[def.id];
    const seat = seats.find((x) => x.power === def.id);
    const id = state.nations.length;
    keyIndex.set(def.id, id);
    state.nations.push(
      blankNation(id, def.id, "power", def.name, def.adjective, def.color, {
        culture: rules.culture,
        religion: rules.religion,
        capital:
          def.provinces[rules.startPop.indexOf(Math.max(...rules.startPop))] ??
          def.provinces[0],
        gold: Math.round(
          rules.startGold * (seat ? 1 : DIFFICULTY[settings.difficulty].aiGold),
        ),
        player: seat?.seat ?? null,
        playerName: seat?.name ?? null,
      }),
    );
  }
  for (const def of map.natives) {
    const id = state.nations.length;
    keyIndex.set(def.id, id);
    state.nations.push(
      blankNation(id, def.id, "native", def.name, def.name, def.color, {
        culture: def.id,
        religion: "native",
        capital: def.provinces[0],
        gold: def.strong ? 60 : 15,
        player: null,
        playerName: null,
        horse: def.horse,
        strong: def.strong,
      }),
    );
  }
  for (const def of map.powers) {
    const id = state.nations.length;
    const n = blankNation(
      id,
      `crown-${def.id}`,
      "crown",
      `the ${def.adjective} crown`,
      def.adjective,
      darken(def.color),
      {
        culture: POWER_RULES[def.id].culture,
        religion: POWER_RULES[def.id].religion,
        capital: -1,
        gold: 0,
        player: null,
        playerName: null,
      },
    );
    n.colony = keyIndex.get(def.id)!;
    state.nations.push(n);
  }

  // Who's nearest to each wild province, to name the people living there.
  const nearest = nearestNative(map, keyIndex);

  for (let p = 0; p < map.provinces.length; p++) {
    const def = map.provinces[p];
    const owner = def.owner === null ? -1 : (keyIndex.get(def.owner) ?? -1);
    const n = owner >= 0 ? state.nations[owner] : null;
    const cap = w.capacity[p];
    const pops: Pop[] = [];
    const wobble = 0.85 + 0.3 * rng.next();
    if (n?.kind === "native") {
      const size = Math.round(
        cap *
          NATIVE_DENSITY_OWNED *
          (n.strong ? NATIVE_STRONG_FACTOR : 1) *
          wobble,
      );
      pops.push(tribe(n.culture, size));
    } else if (n?.kind === "power") {
      const rules = POWER_RULES[n.key];
      const at = map.powers.find((x) => x.id === n.key)!.provinces.indexOf(p);
      const settlersHere = rules.startPop[at] ?? 100;
      pops.push(...settlerPops(n.culture, n.religion, settlersHere));
      const locals = Math.round(cap * NATIVE_DENSITY_WILD * 0.3 * wobble);
      if (locals > 50) pops.push(tribe(nearest[p] ?? "local", locals));
    } else {
      const size = Math.round(cap * NATIVE_DENSITY_WILD * wobble);
      if (size > 30) pops.push(tribe(nearest[p] ?? "local", size));
    }
    const pr: Province = {
      owner,
      occupier: -1,
      pops,
      b: {},
      build: null,
      colony: null,
      recruits: [],
      siege: null,
      unrest: 0,
      devastation: 0,
      integrate: 0,
      depletion: 0,
      outpost: null,
      rich: rng.chance(RICH_SHARE),
      made: {},
      mods: [],
    };
    if (n?.kind === "power") {
      if (def.coastal) pr.b.port = 1;
      if (n.capital === p) pr.b.fort = 1;
      const big =
        (POWER_RULES[n.key].startPop[
          map.powers.find((x) => x.id === n.key)!.provinces.indexOf(p)
        ] ?? 0) >= 2000;
      if (big) {
        pr.b.farm = 1;
        pr.b.church = 1;
        if (w.raw[p] === "sugar" || w.raw[p] === "tobacco") pr.b.plantation = 1;
        pr.b.fort = Math.max(pr.b.fort ?? 0, 1);
      }
    }
    state.provinces.push(pr);
  }

  // People: governors and their families, councils, native leaders.
  for (const n of state.nations) {
    if (n.kind === "crown") continue;
    if (n.kind === "power") {
      const seat = seats.find((x) => x.power === n.key);
      const gov = seat?.governor
        ? governorFromPlan(state, rng, n.id, seat.governor)
        : randomGovernor(state, rng, n.id);
      n.ruler = gov.id;
      makeFamily(state, rng, gov);
      for (const s of SEATS) n.council[s] = makeNotable(state, rng, n.id, s).id;
      n.court = [
        makeNotable(state, rng, n.id).id,
        makeNotable(state, rng, n.id).id,
      ];
      const heir = gov.children
        .map((id) => state.chars[id])
        .sort((a, b) => a.born - b.born)[0];
      n.heir = heir ? heir.id : -1;
    } else {
      const chief = makeCharacter(state, rng, {
        nation: n.id,
        culture: n.culture,
        religion: n.religion,
        female: false,
        age: rng.int(32, 55),
        title: `${nativeTitle(n.key)} of the ${n.name}`,
        stats: randomStats(rng, rng.pick(["dip", "mar", "ste"] as const)),
      });
      n.ruler = chief.id;
      n.council.marshal = makeNotable(state, rng, n.id, "marshal").id;
      n.council.envoy = makeNotable(state, rng, n.id, "envoy").id;
    }
  }

  // Markets: today's prices, and a few months' food in the warehouses.
  for (const n of state.nations) {
    if (n.kind !== "power") continue;
    const want = nationDemand(state, n.id);
    for (const g of GOODS) {
      n.market.price[g] = Math.round(anchorPrice(state, n.id, g) * 100) / 100;
      n.market.demand[g] = want[g];
    }
    n.market.stock.grain = Math.round(want.grain * 4);
    n.market.stock.tools = 25;
    n.market.stock.cloth = 15;
    n.market.stock.guns = 20;
    n.market.stock.timber = 40;
    n.nextColonist = 30;
    n.explored = surveyedAround(map, provincesOf(state, n.id));
  }

  // Europe: old rivalries, and the Dutch already fighting Spain.
  const powers = state.nations.filter((n) => n.kind === "power");
  for (const a of powers) {
    for (const b of powers) {
      if (a.id >= b.id) continue;
      const k = [a.key, b.key].sort().join("-");
      state.europe.tension[pairKey(a.id, b.id)] = Math.round(
        (RIVALRY[k] ?? 0.1) * 60,
      );
    }
  }
  const nl = keyIndex.get("netherlands");
  const es = keyIndex.get("spain");
  if (nl !== undefined && es !== undefined) {
    state.europe.wars[pairKey(nl, es)] = 0;
    state.europe.tension[pairKey(nl, es)] = 90;
    state.wars.push({
      a: nl,
      b: es,
      by: nl,
      start: 0,
      why: "The Eighty Years' War",
      won: [0, 0],
      lost: [0, 0],
      europe: true,
    });
  }
  return state;
}

function blankNation(
  id: number,
  key: string,
  kind: Nation["kind"],
  name: string,
  adjective: string,
  color: string,
  o: {
    culture: string;
    religion: Nation["religion"];
    capital: number;
    gold: number;
    player: string | null;
    playerName: string | null;
    horse?: boolean;
    strong?: boolean;
  },
): Nation {
  const council = Object.fromEntries(
    SEATS.map((s) => [s, -1]),
  ) as Nation["council"];
  return {
    id,
    key,
    kind,
    name,
    adjective,
    color,
    alive: true,
    colony: -1,
    player: o.player,
    playerName: o.playerName,
    culture: o.culture,
    religion: o.religion,
    ruler: -1,
    heir: -1,
    council,
    court: [],
    gold: o.gold,
    capital: o.capital,
    horse: o.horse ?? false,
    strong: o.strong ?? false,
    favor: 55,
    autonomy: 0,
    remit: kind === "power" ? (POWER_RULES[key]?.expectedRemit ?? 0.1) : 0,
    independent: false,
    rebelling: false,
    rebellion: null,
    title: 0,
    tax: 1,
    noExport: [],
    noImport: [],
    market: {
      price: emptyGoods(),
      stock: emptyGoods(),
      supply: emptyGoods(),
      demand: emptyGoods(),
    },
    convoys: [],
    lastConvoy: -999,
    colonists: 0,
    nextColonist: 0,
    demand: null,
    warExhaustion: 0,
    relations: {},
    mods: [],
    events: [],
    explored: [],
    missions: [],
    cooldowns: {},
    ledger: { income: [], spending: [], net: 0 },
    stats: {
      coloniesFounded: 0,
      battlesWon: 0,
      battlesLost: 0,
      provincesConquered: 0,
      provincesLost: 0,
      goldEarned: 0,
      remitted: 0,
      peakProvinces: 0,
      peakPeople: 0,
      landBought: 0,
    },
    score: 0,
  };
}

export function tribe(culture: string, size: number): Pop {
  return {
    cls: "tribe",
    culture,
    religion: "native",
    size,
    wealth: 0,
    met: [1, 1, 1],
    income: 0,
  };
}

export function settlerPops(
  culture: string,
  religion: Pop["religion"],
  total: number,
): Pop[] {
  const out: Pop[] = [];
  for (const [cls, share] of Object.entries(SETTLER_MIX) as [
    PopClass,
    number,
  ][]) {
    const size = Math.round(total * share);
    if (size <= 0) continue;
    out.push({
      cls,
      culture,
      religion,
      size,
      wealth:
        size * (cls === "gentry" ? 0.6 : cls === "merchants" ? 0.4 : 0.08),
      met: [1, 1, 1],
      income: 0,
    });
  }
  return out;
}

/** The native nation nearest each province over land (by hops). */
function nearestNative(
  map: MapDef,
  keyIndex: Map<string, number>,
): (string | null)[] {
  const out: (string | null)[] = map.provinces.map(() => null);
  const queue: number[] = [];
  map.provinces.forEach((p, i) => {
    if (p.owner && map.natives.some((n) => n.id === p.owner)) {
      out[i] = p.owner;
      queue.push(i);
    }
  });
  for (let h = 0; h < queue.length; h++) {
    const u = queue[h];
    for (const [q] of map.provinces[u].nb) {
      if (out[q] === null) {
        out[q] = out[u];
        queue.push(q);
      }
    }
  }
  void keyIndex;
  return out;
}

function darken(hex: string): string {
  const v = parseInt(hex.slice(1), 16);
  const r = Math.round(((v >> 16) & 255) * 0.6);
  const g = Math.round(((v >> 8) & 255) * 0.6);
  const b = Math.round((v & 255) * 0.6);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * What a colony knows at the start: its own land, the country two marches
 * around it, and the coasts its ships have seen.
 */
export function surveyedAround(map: MapDef, from: number[]): number[] {
  const known = new Set(from);
  let ring = [...from];
  for (let hop = 0; hop < 2; hop++) {
    const next: number[] = [];
    for (const p of ring)
      for (const [q] of map.provinces[p].nb)
        if (!known.has(q)) {
          known.add(q);
          next.push(q);
        }
    ring = next;
  }
  for (const p of from)
    for (const [q, km] of map.provinces[p].sea)
      if (km <= SEEN_BY_SEA_KM) known.add(q);
  return [...known].sort((a, b) => a - b);
}
