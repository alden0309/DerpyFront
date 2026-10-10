// A new Derpy Conquest game: 1 January 1607, 1650 or 1700. The colonial
// powers with their settlements and governors, dozens of native nations, the
// open country between them, and the crowns back in Europe.

import { dayOf } from "./Calendar";
import {
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
  regimentTypes,
} from "./Queries";
import { Rng } from "./Rng";
import {
  DIFFICULTY,
  EUROPE_PRICE,
  NATIVE_DENSITY_OWNED,
  NATIVE_DENSITY_WILD,
  NATIVE_STRONG_FACTOR,
  POWER_RULES,
  REGIMENTS,
  RICH_SHARE,
  RIVALRY,
  SEEN_BY_SEA_KM,
  SETTLER_MIX,
} from "./Rules";
import { DEVELOPMENT_SETTLERS, START_GOLD_FACTOR, STARTS } from "./Starts";
import {
  GameSettings,
  GameState,
  GOODS,
  MapDef,
  Nation,
  Pop,
  PopClass,
  Province,
  RegType,
  SEATS,
} from "./Types";

/** Saves from another version can't be loaded: bump it when the state's shape changes. */
export const STATE_VERSION = 5;

/** The world at the start date, every nation run by the computer. Players' lives are added by the game. */
export function newGameState(map: MapDef, settings: GameSettings): GameState {
  const w = worldOf(map);
  const start = settings.start ?? 1607;
  const era = STARTS[start];
  const startDay = start === 1607 ? 0 : dayOf(start);
  const state: GameState = {
    version: STATE_VERSION,
    settings,
    day: startDay,
    startDay,
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
    deals: [],
    europe: {
      price: { ...EUROPE_PRICE },
      glut: emptyGoods(),
      tension: {},
      wars: {},
    },
    battles: [],
    over: false,
    winner: -1,
    lives: [],
    locals: {},
    movements: [],
    polities: {},
    // WORLD r11: province markets and the stories going round.
    markets: {},
    leads: [],
  };
  const rng = new Rng(state);
  const keyIndex = new Map<string, number>();
  const byName = new Map(map.provinces.map((p, i) => [p.name, i]));
  /** Who holds each province at this start: a nation key, or null. */
  const ownerKey = map.provinces.map((def) =>
    def.closed ? null : era ? (era.owners[def.name] ?? null) : def.owner,
  );
  const startProvinces = (key: string) =>
    ownerKey.flatMap((k, i) => (k === key ? [i] : []));
  const development = (p: number) =>
    era?.development[map.provinces[p].name] ?? 0;

  for (const def of map.powers) {
    const rules = POWER_RULES[def.id];
    const id = state.nations.length;
    keyIndex.set(def.id, id);
    const own = startProvinces(def.id);
    const capital = era
      ? (byName.get(era.capitals[def.id] ?? "") ?? own[0] ?? -1)
      : (def.provinces[rules.startPop.indexOf(Math.max(...rules.startPop))] ??
        def.provinces[0]);
    const n = blankNation(
      id,
      def.id,
      "power",
      def.name,
      def.adjective,
      def.color,
      {
        culture: rules.culture,
        religion: rules.religion,
        capital,
        gold: Math.round(
          rules.startGold *
            START_GOLD_FACTOR[start] *
            DIFFICULTY[settings.difficulty].aiGold,
        ),
        player: null,
        playerName: null,
      },
    );
    if (own.length === 0) n.alive = false;
    state.nations.push(n);
  }
  for (const def of map.natives) {
    const id = state.nations.length;
    keyIndex.set(def.id, id);
    const own = startProvinces(def.id);
    const n = blankNation(id, def.id, "native", def.name, def.name, def.color, {
      culture: def.id,
      religion: "native",
      capital: def.provinces.find((p) => own.includes(p)) ?? own[0] ?? -1,
      gold: def.strong ? 60 : 15,
      player: null,
      playerName: null,
      horse: def.horse,
      strong: def.strong,
    });
    if (own.length === 0) n.alive = false;
    state.nations.push(n);
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
    const key = ownerKey[p];
    const owner = key === null ? -1 : (keyIndex.get(key) ?? -1);
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
      const settlersHere = era
        ? Math.round(DEVELOPMENT_SETTLERS[development(p) || 1] * wobble)
        : (rules.startPop[at] ?? 100);
      pops.push(...settlerPops(n.culture, n.religion, settlersHere));
      const locals = Math.round(cap * NATIVE_DENSITY_WILD * 0.3 * wobble);
      if (locals > 50) pops.push(tribe(nearest[p] ?? "local", locals));
    } else if (!def.closed) {
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
      const level = era
        ? development(p)
        : (POWER_RULES[n.key].startPop[
              map.powers.find((x) => x.id === n.key)!.provinces.indexOf(p)
            ] ?? 0) >= 2000
          ? 3
          : 1;
      if (level >= 2) pr.b.farm = 1;
      if (level >= 3) {
        pr.b.church = 1;
        if (w.raw[p] === "sugar" || w.raw[p] === "tobacco") pr.b.plantation = 1;
        if (w.raw[p] === "furs") pr.b.tradingpost = 1;
        if (w.raw[p] === "timber") pr.b.lumbercamp = 1;
        pr.b.fort = Math.max(pr.b.fort ?? 0, 1);
      }
      if (level >= 4) {
        pr.b.farm = 2;
        pr.b.courthouse = 1;
        pr.b.smithy = 1;
        if (def.coastal) pr.b.port = 2;
      }
    }
    state.provinces.push(pr);
  }

  // People: governors and their families, councils, native leaders.
  for (const n of state.nations) {
    if (n.kind === "crown") continue;
    if (n.kind === "power") {
      const gov = randomGovernor(state, rng, n.id);
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
    n.nextColonist = 30;
    const own = provincesOf(state, n.id);
    // An older colony has stores to match.
    const scale = Math.max(1, own.length / 2);
    n.market.stock.grain = Math.round(want.grain * 4);
    n.market.stock.tools = Math.round(25 * scale);
    n.market.stock.cloth = Math.round(15 * scale);
    n.market.stock.guns = Math.round(20 * scale);
    n.market.stock.timber = Math.round(40 * scale);
    n.explored = surveyedAround(
      map,
      own,
      start === 1607 ? 2 : start === 1650 ? 3 : 4,
    );
  }
  // A later start finds the colonies with their militia already mustered,
  // and the bigger ones with a regiment of regulars.
  if (era)
    for (const n of state.nations) {
      if (n.kind !== "power" || !n.alive || n.capital < 0) continue;
      const own = provincesOf(state, n.id).length;
      const types: RegType[] = [];
      const militia = Math.max(1, Math.min(4, Math.round(own / 6)));
      for (let i = 0; i < militia; i++) types.push("militia");
      if (own >= 12 && regimentTypes(n).includes("regulars"))
        types.push("regulars");
      const cap = state.provinces[n.capital];
      const laborers = cap.pops.find((x) => x.cls === "laborers");
      const regs = types.map((type) => ({
        type,
        men: REGIMENTS[type].men,
        morale: 0.8,
        home: n.capital,
      }));
      if (laborers)
        laborers.size = Math.max(
          100,
          laborers.size - regs.reduce((m, r) => m + r.men, 0),
        );
      state.armies.push({
        id: state.nextId++,
        owner: n.id,
        prov: n.capital,
        regs,
        path: [],
        depart: -1,
        arrive: -1,
        sea: false,
        retreating: false,
        arrived: startDay,
        from: -1,
        commander: -1,
        supply: 1,
      });
    }

  for (const n of state.nations) {
    n.stats.startProvinces = provincesOf(state, n.id).length;
    // A small colony in a later year still has its company paying the bills.
    if (era && n.kind === "power" && n.alive && n.stats.startProvinces <= 6)
      n.mods.push({
        key: "crown-grant",
        label: "The company's subsidy",
        until: startDay + 15 * 365,
        fx: {},
      });
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
  if (start === 1607 && nl !== undefined && es !== undefined) {
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

export function blankNation(
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
      flow: {
        made: emptyGoods(),
        used: emptyGoods(),
        came: emptyGoods(),
        went: emptyGoods(),
      },
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
    overlord: -1,
    milestones: [],
    yearly: [],
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
      startProvinces: 0,
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
export function surveyedAround(
  map: MapDef,
  from: number[],
  hops = 2,
): number[] {
  const known = new Set(from);
  let ring = [...from];
  for (let hop = 0; hop < hops; hop++) {
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
