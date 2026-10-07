// Derpy Conquest: the game itself. Holds the state, advances it a day at a
// time, carries out players' commands, and keeps track of what changed so
// the server only sends players the difference.

import { aiWantsPeace, runAi } from "./Ai";
import { fightBattle } from "./Battle";
import { dateOf, dayOf, isMonthStart } from "./Calendar";
import {
  armyMen,
  armySpeed,
  atWar,
  buildCheck,
  buyCheck,
  canEnter,
  colonizeCheck,
  dealBetween,
  findPath,
  giftCheck,
  hopDays,
  nativeTradeGold,
  peaceCheck,
  portConnected,
  provinceIncome,
  provincesOf,
  recruitCheck,
  tradeCheck,
  warBetween,
  warCheck,
} from "./Queries";
import { Rng } from "./Rng";
import {
  ANGRY_OPINION,
  ATTRITION_AWAY,
  BORDER_PRESSURE,
  CAPACITY_PER_FARM,
  COLONY_START_POP,
  CROWN_SUBSIDY,
  DIFFICULTY,
  GIFT_OPINION,
  GOOD_YIELD,
  MANPOWER_BASE_MONTHLY,
  MANPOWER_PER_POP,
  marketPrice,
  MAX_BORDER_PRESSURE,
  MAX_COLONISTS,
  MIN_ARMY_MEN,
  MORALE_RECOVERY_AWAY,
  MORALE_RECOVERY_HOME,
  NATIVE_GROWTH,
  NATIVE_MANPOWER_CAP,
  NATIVE_MANPOWER_PER_POP,
  NATIVES_OWNED,
  NATIVES_WILD,
  POP_GROWTH,
  POP_GROWTH_PER_FARM,
  POWER_RULES,
  powerRules,
  provinceCapacity,
  REGIMENT_MEN,
  REINFORCE_PER_MONTH,
  scoreOf,
  SIEGE_DAYS,
  SIEGE_MEN_PER_FORT,
  START_GOLD,
  START_MANPOWER,
  START_REGIMENTS,
  TERRAIN,
  TRADE_OPINION_PER_MONTH,
  TRUCE_DAYS,
} from "./Rules";
import {
  Army,
  BattleReport,
  Command,
  GameDelta,
  GameEvent,
  GameSettings,
  GameState,
  Good,
  GOODS,
  MapDef,
  Nation,
  Province,
  RegType,
  Seat,
} from "./Types";

export const STATE_VERSION = 1;
const MAX_BATTLES_KEPT = 40;

function emptyStats(): Nation["stats"] {
  return {
    coloniesFounded: 0,
    battlesWon: 0,
    battlesLost: 0,
    provincesConquered: 0,
    provincesLost: 0,
    goldEarned: 0,
    peakProvinces: 0,
    landBought: 0,
  };
}

function emptyLedger(): Nation["ledger"] {
  return { goods: 0, tax: 0, trade: 0, crown: 0, upkeep: 0, total: 0 };
}

export class ConquestGame {
  readonly rng: Rng;
  private dirtyProv = new Set<number>();
  private dirtyArmy = new Set<number>();
  private dirtyNation = new Set<number>();
  private dirtyRelations = false;
  private dirtyPrices = false;
  private newBattles: BattleReport[] = [];
  private newEvents: GameEvent[] = [];
  private justEnded = false;

  constructor(
    readonly map: MapDef,
    readonly state: GameState,
  ) {
    this.rng = new Rng(state);
  }

  // ---------------------------------------------------------------- setup

  static create(
    map: MapDef,
    settings: GameSettings,
    seats: Seat[],
  ): ConquestGame {
    const nations: Nation[] = [];
    const keyIndex = new Map<string, number>();
    for (const pw of map.powers) {
      const seat = seats.find((s) => s.power === pw.id);
      keyIndex.set(pw.id, nations.length);
      nations.push({
        id: nations.length,
        key: pw.id,
        kind: "power",
        name: pw.name,
        adjective: pw.adjective,
        color: pw.color,
        alive: true,
        player: seat?.seat ?? null,
        playerName: seat?.name ?? null,
        gold: START_GOLD,
        manpower: START_MANPOWER,
        colonists: 1,
        nextColonist: POWER_RULES[pw.id]?.colonistDays ?? 120,
        capital: pw.provinces[0],
        opinion: [],
        horse: false,
        strong: false,
        stats: emptyStats(),
        ledger: emptyLedger(),
        score: 0,
      });
    }
    for (const nat of map.natives) {
      keyIndex.set(nat.id, nations.length);
      nations.push({
        id: nations.length,
        key: nat.id,
        kind: "native",
        name: nat.name,
        adjective: nat.name,
        color: nat.color,
        alive: true,
        player: null,
        playerName: null,
        gold: 50,
        manpower: 0,
        colonists: 0,
        nextColonist: -1,
        capital: nat.provinces[0],
        opinion: [],
        horse: nat.horse,
        strong: nat.strong,
        stats: emptyStats(),
        ledger: emptyLedger(),
        score: 0,
      });
    }
    const state: GameState = {
      version: STATE_VERSION,
      settings,
      day: 0,
      endDay: dayOf(settings.endYear),
      rng: settings.seed | 0,
      nextId: 1,
      provinces: [],
      nations,
      armies: [],
      wars: [],
      truces: [],
      deals: [],
      offers: [],
      prices: Object.fromEntries(GOODS.map((g) => [g, 0])) as Record<
        Good,
        number
      >,
      battles: [],
      over: false,
      winner: -1,
    };
    const game = new ConquestGame(map, state);
    const rng = game.rng;

    // Provinces: owners, settlers and the natives who live there.
    for (const def of map.provinces) {
      const owner = def.owner === null ? -1 : (keyIndex.get(def.owner) ?? -1);
      const cap = provinceCapacity(def.terrain, def.areaKm2);
      const ownerNation = owner >= 0 ? nations[owner] : null;
      let natives: number;
      if (ownerNation?.kind === "native") {
        natives = cap * NATIVES_OWNED * (ownerNation.strong ? 1.8 : 1);
      } else if (ownerNation?.kind === "power") {
        natives = cap * NATIVES_WILD * 0.4;
      } else {
        natives = cap * NATIVES_WILD;
      }
      natives = Math.round(natives * (0.8 + 0.4 * rng.next()));
      const isPower = ownerNation?.kind === "power";
      state.provinces.push({
        owner,
        pop: isPower ? (POWER_RULES[ownerNation!.key]?.startPop ?? 800) : 0,
        natives,
        farm: 0,
        port: isPower && def.coastal ? 1 : 0,
        fort:
          isPower && ownerNation!.capital === state.provinces.length ? 1 : 0,
        build: null,
        colony: null,
        recruits: [],
        siege: null,
      });
    }

    // Opinions: every native nation starts unsure of every power. Powers
    // come first, so a power's id indexes these.
    for (const n of nations) {
      n.opinion =
        n.kind === "native" ? map.powers.map(() => rng.int(-10, 10)) : [];
    }

    // Starting armies.
    const diff = DIFFICULTY[settings.difficulty];
    for (const n of nations) {
      if (n.kind === "power") {
        for (let i = 0; i < START_REGIMENTS; i++)
          game.addRegiment(n.id, n.capital, "inf");
      } else {
        const owned = provincesOf(state, n.id);
        const totalNatives = owned.reduce(
          (sum, p) => sum + state.provinces[p].natives,
          0,
        );
        n.manpower = Math.round(totalNatives * NATIVE_MANPOWER_CAP * 0.4);
        const regs = Math.max(
          1,
          Math.round(owned.length * (n.strong ? 2 : 1) * diff.nativeArmies),
        );
        for (let i = 0; i < regs; i++) {
          game.addRegiment(
            n.id,
            owned[i % owned.length],
            n.horse && i % 2 === 1 ? "horse" : "war",
          );
        }
      }
    }
    game.updatePrices();
    game.updateScores();
    // Show what a month will bring before the first month has passed.
    for (const n of nations) {
      if (n.kind === "power")
        n.ledger = game.powerLedger(
          n,
          provincesOf(state, n.id),
          new Map(),
        ).ledger;
    }
    game.takeDelta();
    return game;
  }

  // ---------------------------------------------------------------- deltas

  /** Everything that changed since the last call. */
  takeDelta(): GameDelta {
    const s = this.state;
    const d: GameDelta = { day: s.day };
    if (this.dirtyProv.size) {
      d.prov = {};
      for (const p of this.dirtyProv) d.prov[p] = s.provinces[p];
    }
    if (this.dirtyArmy.size) {
      d.armies = {};
      const byId = new Map(s.armies.map((a) => [a.id, a]));
      for (const id of this.dirtyArmy) d.armies[id] = byId.get(id) ?? null;
    }
    if (this.dirtyNation.size) {
      d.nations = {};
      for (const n of this.dirtyNation) d.nations[n] = s.nations[n];
    }
    if (this.dirtyRelations) {
      d.wars = s.wars;
      d.truces = s.truces;
      d.deals = s.deals;
      d.offers = s.offers;
    }
    if (this.dirtyPrices) d.prices = s.prices;
    if (this.newBattles.length) d.battles = this.newBattles;
    if (this.newEvents.length) d.events = this.newEvents;
    if (this.justEnded) d.over = { winner: s.winner };
    this.dirtyProv = new Set();
    this.dirtyArmy = new Set();
    this.dirtyNation = new Set();
    this.dirtyRelations = false;
    this.dirtyPrices = false;
    this.newBattles = [];
    this.newEvents = [];
    this.justEnded = false;
    return d;
  }

  private prov(p: number): Province {
    this.dirtyProv.add(p);
    return this.state.provinces[p];
  }

  private nation(n: number): Nation {
    this.dirtyNation.add(n);
    return this.state.nations[n];
  }

  private touch(a: Army): Army {
    this.dirtyArmy.add(a.id);
    return a;
  }

  private event(e: GameEvent): void {
    this.newEvents.push(e);
  }

  private relationsChanged(): void {
    this.dirtyRelations = true;
  }

  nationOfSeat(seat: string): number {
    return this.state.nations.findIndex((n) => n.player === seat);
  }

  // ---------------------------------------------------------------- armies

  private addRegiment(n: number, p: number, type: RegType): Army {
    const s = this.state;
    const host = s.armies.find(
      (a) => a.owner === n && a.prov === p && a.depart < 0 && !a.retreating,
    );
    const reg = { type, men: REGIMENT_MEN, morale: 1 };
    if (host) {
      host.regs.push(reg);
      return this.touch(host);
    }
    const army: Army = {
      id: s.nextId++,
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
    };
    s.armies.push(army);
    return this.touch(army);
  }

  private removeArmy(a: Army): void {
    const s = this.state;
    const i = s.armies.indexOf(a);
    if (i >= 0) s.armies.splice(i, 1);
    this.dirtyArmy.add(a.id);
  }

  /** Starts the next hop of an army's path, or stops it if it can't go. */
  private startHop(a: Army): void {
    const s = this.state;
    this.touch(a);
    a.depart = -1;
    a.arrive = -1;
    a.sea = false;
    while (a.path.length > 0) {
      const next = a.path[0];
      if (!canEnter(s, a.owner, next)) break;
      const speed = armySpeed(a);
      let days = hopDays(s, this.map, a.owner, a.prov, next, speed, false);
      let sea = false;
      if (days < 0) {
        days = hopDays(s, this.map, a.owner, a.prov, next, speed, true);
        sea = true;
      }
      if (days < 0) break;
      a.depart = s.day;
      a.arrive = s.day + days;
      a.sea = sea;
      return;
    }
    a.path = [];
    a.retreating = false;
  }

  private moveArmies(): void {
    const s = this.state;
    for (const a of [...s.armies]) {
      if (a.path.length === 0) continue;
      if (a.depart < 0) {
        this.startHop(a);
        continue;
      }
      if (s.day < a.arrive) continue;
      const next = a.path[0];
      this.touch(a);
      if (!canEnter(s, a.owner, next)) {
        // Peace broke out on the way: stay put.
        a.path = [];
        a.depart = -1;
        a.retreating = false;
        continue;
      }
      a.path.shift();
      a.from = a.prov;
      a.prov = next;
      a.arrived = s.day;
      a.depart = -1;
      if (a.path.length === 0) {
        a.retreating = false;
        // Join up with friends who are already here and staying.
        const friend = s.armies.find(
          (b) =>
            b !== a &&
            b.owner === a.owner &&
            b.prov === a.prov &&
            b.path.length === 0 &&
            !b.retreating,
        );
        if (friend) {
          friend.regs.push(...a.regs);
          this.touch(friend);
          this.removeArmy(a);
        }
      } else {
        this.startHop(a);
      }
    }
  }

  // ---------------------------------------------------------------- battles

  private fightBattles(): void {
    const s = this.state;
    const byProv = new Map<number, Army[]>();
    for (const a of s.armies) {
      if (a.retreating) continue;
      let list = byProv.get(a.prov);
      if (!list) byProv.set(a.prov, (list = []));
      list.push(a);
    }
    for (const [p, armies] of byProv) {
      const owners = [...new Set(armies.map((a) => a.owner))];
      if (owners.length < 2) continue;
      // Who defends: the province's owner if present, else whoever got
      // here first.
      const provOwner = s.provinces[p].owner;
      let defNation = owners.includes(provOwner) ? provOwner : -1;
      if (defNation < 0) {
        defNation = [...armies].sort(
          (x, y) => x.arrived - y.arrived || x.id - y.id,
        )[0].owner;
      }
      const attackers = armies.filter((a) => atWar(s, a.owner, defNation));
      if (attackers.length === 0) {
        // Maybe two others here are at war with each other.
        const pair = owners.find((o) => owners.some((q) => atWar(s, o, q)));
        if (pair === undefined) continue;
        defNation = pair;
      }
      const att = armies.filter((a) => atWar(s, a.owner, defNation));
      const dfn = armies.filter((a) => a.owner === defNation);
      if (att.length === 0 || dfn.length === 0) continue;
      const crossedRiver = att.every((a) => {
        if (a.from < 0) return false;
        const nb = this.map.provinces[a.from].nb.find(([q]) => q === p);
        return !!nb && nb[2] === 1;
      });
      const report = fightBattle(
        s,
        this.map,
        this.rng,
        s.nextId++,
        p,
        att,
        dfn,
        crossedRiver,
      );
      s.battles.push(report);
      if (s.battles.length > MAX_BATTLES_KEPT) s.battles.shift();
      this.newBattles.push(report);
      const winners = report.winner === 0 ? att : dfn;
      const losers = report.winner === 0 ? dfn : att;
      for (const a of [...att, ...dfn]) {
        this.touch(a);
        a.regs = a.regs.filter((r) => r.men > 0);
      }
      for (const n of new Set(winners.map((a) => a.owner)))
        this.nation(n).stats.battlesWon++;
      for (const n of new Set(losers.map((a) => a.owner)))
        this.nation(n).stats.battlesLost++;
      for (const a of winners)
        if (armyMen(a) < MIN_ARMY_MEN) this.removeArmy(a);
      for (const a of losers) {
        if (report.outcome === "destroyed" || armyMen(a) < MIN_ARMY_MEN) {
          this.removeArmy(a);
          continue;
        }
        this.retreat(a);
      }
      this.event({
        k: "battle",
        day: s.day,
        id: report.id,
        p,
        a: report.attacker.nations,
        d: report.defender.nations,
        w: report.winner,
      });
    }
  }

  /** Sends a beaten army to a safe neighbouring province, or ends it. */
  private retreat(a: Army): void {
    const s = this.state;
    const options = this.map.provinces[a.prov].nb
      .map(([q]) => q)
      .filter(
        (q) =>
          canEnter(s, a.owner, q) &&
          !s.armies.some((b) => b.prov === q && atWar(s, a.owner, b.owner)),
      )
      .sort((x, y) => {
        const rank = (q: number) =>
          s.provinces[q].owner === a.owner
            ? 0
            : s.provinces[q].owner === -1
              ? 1
              : 2;
        return rank(x) - rank(y) || x - y;
      });
    if (options.length === 0) {
      this.removeArmy(a);
      return;
    }
    a.path = [options[0]];
    a.retreating = true;
    this.startHop(a);
    if (a.path.length === 0) this.removeArmy(a);
  }

  // ---------------------------------------------------------------- sieges

  private runSieges(): void {
    const s = this.state;
    const here = new Map<number, Army[]>();
    for (const a of s.armies) {
      let list = here.get(a.prov);
      if (!list) here.set(a.prov, (list = []));
      list.push(a);
    }
    for (let p = 0; p < s.provinces.length; p++) {
      const prov = s.provinces[p];
      const owner = prov.owner;
      const armies = here.get(p) ?? [];
      let by = -1;
      let men = 0;
      let art = 0;
      if (owner >= 0) {
        const defended = armies.some((a) => a.owner === owner && !a.retreating);
        const besiegers = armies.filter(
          (a) =>
            !a.retreating && a.path.length === 0 && atWar(s, a.owner, owner),
        );
        if (!defended && besiegers.length > 0) {
          by =
            prov.siege && besiegers.some((a) => a.owner === prov.siege!.by)
              ? prov.siege.by
              : besiegers[0].owner;
          for (const a of besiegers) {
            if (a.owner !== by) continue;
            men += armyMen(a);
            art += a.regs.filter((r) => r.type === "art").length;
          }
          if (men < SIEGE_MEN_PER_FORT * prov.fort) by = -1;
        }
      }
      if (by < 0) {
        if (prov.siege) this.prov(p).siege = null;
        continue;
      }
      if (!prov.siege || prov.siege.by !== by) {
        const days = Math.round(
          SIEGE_DAYS[Math.min(prov.fort, SIEGE_DAYS.length - 1)] /
            Math.min(2, 1 + 0.25 * art),
        );
        this.prov(p).siege = { by, start: s.day, done: s.day + days };
        this.event({ k: "siege", day: s.day, n: by, p, from: owner });
        continue;
      }
      if (s.day >= prov.siege.done) this.capture(p, by);
    }
  }

  private capture(p: number, by: number): void {
    const s = this.state;
    const prov = this.prov(p);
    const from = prov.owner;
    const taker = s.nations[by];
    const loser = from >= 0 ? s.nations[from] : null;
    // Natives don't hold colonies they take: they burn them and the land
    // goes back to the wild.
    const razed = taker.kind === "native" && loser?.kind === "power";
    if (razed) {
      prov.natives += Math.round(prov.pop * 0.1) + 200;
      prov.owner = -1;
    } else if (taker.kind === "power") {
      if (loser?.kind === "native") {
        prov.pop = Math.round(200 + prov.natives * 0.05);
        prov.natives = Math.round(prov.natives * 0.5);
      } else {
        prov.pop = Math.round(prov.pop * 0.85);
      }
      prov.owner = by;
    } else {
      prov.owner = by;
    }
    if (razed || taker.kind === "native") {
      prov.pop = 0;
      prov.farm = 0;
      prov.port = 0;
      prov.fort = 0;
    }
    prov.build = null;
    prov.colony = null;
    prov.recruits = [];
    prov.siege = null;
    this.nation(by).stats.provincesConquered++;
    if (loser) this.nation(from).stats.provincesLost++;
    const war = warBetween(s, by, from);
    if (war) {
      war.gains[war.a === by ? 0 : 1]++;
      this.relationsChanged();
    }
    this.event(
      razed
        ? { k: "razed", day: s.day, n: by, p, from }
        : { k: "captured", day: s.day, n: by, p, from },
    );
    if (loser) {
      const left = provincesOf(s, from);
      if (left.length === 0) this.eliminate(from, by);
      else if (loser.capital === p) {
        this.nation(from).capital = left.reduce((best, q) =>
          s.provinces[q].pop + s.provinces[q].natives >
          s.provinces[best].pop + s.provinces[best].natives
            ? q
            : best,
        );
      }
    }
  }

  private eliminate(n: number, by: number): void {
    const s = this.state;
    const nation = this.nation(n);
    nation.alive = false;
    for (const a of [...s.armies]) if (a.owner === n) this.removeArmy(a);
    s.wars = s.wars.filter((w) => w.a !== n && w.b !== n);
    s.deals = s.deals.filter((d) => d.power !== n && d.native !== n);
    s.offers = s.offers.filter((o) => o.from !== n && o.to !== n);
    this.relationsChanged();
    s.provinces.forEach((prov, p) => {
      if (prov.colony?.by === n) this.prov(p).colony = null;
    });
    this.event({ k: "fallen", day: s.day, n, by });
  }

  // ---------------------------------------------------------------- daily

  /** Advances the game one day. */
  tick(): void {
    const s = this.state;
    if (s.over) return;
    s.day++;
    this.completeWork();
    this.colonistsArrive();
    this.moveArmies();
    this.fightBattles();
    this.runSieges();
    if (s.day % 5 === 0) this.recoverMorale();
    if (isMonthStart(s.day)) this.month();
    for (const n of s.nations) {
      if (n.alive && n.player === null && (s.day + n.id) % 5 === 0)
        runAi(this, n.id);
    }
    this.checkEnd();
  }

  private completeWork(): void {
    const s = this.state;
    s.provinces.forEach((prov, p) => {
      if (prov.colony && s.day >= prov.colony.done) {
        const by = prov.colony.by;
        const pr = this.prov(p);
        pr.colony = null;
        if (pr.owner === -1 && s.nations[by].alive) {
          pr.owner = by;
          pr.pop = COLONY_START_POP;
          pr.natives = Math.round(pr.natives * 0.8);
          this.nation(by).stats.coloniesFounded++;
          this.event({ k: "colony", day: s.day, n: by, p });
          // Neighbouring natives notice the newcomers.
          for (const [q] of this.map.provinces[p].nb) {
            const o = s.provinces[q].owner;
            if (o >= 0 && s.nations[o].kind === "native") {
              this.nation(o).opinion[by] = Math.max(
                -100,
                s.nations[o].opinion[by] - 3,
              );
            }
          }
        }
      }
      if (prov.build && s.day >= prov.build.done) {
        const pr = this.prov(p);
        const kind = pr.build!.kind;
        pr[kind]++;
        pr.build = null;
        this.event({
          k: "built",
          day: s.day,
          n: pr.owner,
          p,
          b: kind,
          lvl: pr[kind],
        });
      }
      if (prov.recruits.length && prov.recruits.some((r) => s.day >= r.done)) {
        const pr = this.prov(p);
        const ready = pr.recruits.filter((r) => s.day >= r.done);
        pr.recruits = pr.recruits.filter((r) => s.day < r.done);
        for (const r of ready) {
          this.addRegiment(pr.owner, p, r.type);
          this.event({ k: "raised", day: s.day, n: pr.owner, p, t: r.type });
        }
      }
    });
  }

  private colonistsArrive(): void {
    const s = this.state;
    for (const n of s.nations) {
      if (n.kind !== "power" || !n.alive || s.day < n.nextColonist) continue;
      const nation = this.nation(n.id);
      const pop = provincesOf(s, n.id).reduce(
        (sum, p) => sum + s.provinces[p].pop,
        0,
      );
      const days = Math.round(
        powerRules(n).colonistDays * Math.max(0.45, 1 - pop / 120_000),
      );
      nation.nextColonist = s.day + days;
      if (nation.colonists < MAX_COLONISTS) {
        nation.colonists++;
        this.event({ k: "colonist", day: s.day, n: n.id });
      }
    }
  }

  private recoverMorale(): void {
    const s = this.state;
    for (const a of s.armies) {
      if (a.retreating) continue;
      const home = s.provinces[a.prov].owner === a.owner;
      const gain = home ? MORALE_RECOVERY_HOME : MORALE_RECOVERY_AWAY;
      let changed = false;
      for (const r of a.regs) {
        if (r.morale < 1) {
          r.morale = Math.min(1, Math.round((r.morale + gain) * 100) / 100);
          changed = true;
        }
      }
      if (changed) this.touch(a);
    }
  }

  // ---------------------------------------------------------------- monthly

  private month(): void {
    const s = this.state;
    const supply = Object.fromEntries(GOODS.map((g) => [g, 0])) as Record<
      Good,
      number
    >;

    // Natives' trade deals pay both sides.
    const dealGold = new Map<number, number>();
    for (const d of s.deals) {
      if (!dealGold.has(d.native))
        dealGold.set(d.native, nativeTradeGold(s, this.map, d.native));
    }

    for (const n of s.nations) {
      if (!n.alive) continue;
      const nation = this.nation(n.id);
      const owned = provincesOf(s, n.id);
      if (n.kind === "power") {
        const { ledger, earned, totalPop } = this.powerLedger(
          n,
          owned,
          dealGold,
          supply,
        );
        nation.ledger = ledger;
        nation.gold =
          Math.round((nation.gold + earned - ledger.upkeep) * 10) / 10;
        nation.stats.goldEarned = Math.round(nation.stats.goldEarned + earned);
        nation.manpower = Math.min(
          3000 + totalPop * 0.25,
          Math.round(
            nation.manpower +
              MANPOWER_BASE_MONTHLY +
              totalPop * MANPOWER_PER_POP,
          ),
        );
        if (nation.gold < 0) {
          this.event({ k: "broke", day: s.day, n: n.id });
          for (const a of s.armies) {
            if (a.owner !== n.id) continue;
            for (const r of a.regs) r.morale = Math.max(0, r.morale - 0.1);
            this.touch(a);
          }
        }
        this.growSettlers(n, owned);
      } else {
        let natives = 0;
        for (const p of owned) natives += s.provinces[p].natives;
        let trade = 0;
        for (const d of s.deals)
          if (d.native === n.id) trade += (dealGold.get(n.id) ?? 0) * 0.5;
        for (const p of owned) {
          const good = this.map.provinces[p].good;
          if (s.deals.some((d) => d.native === n.id)) {
            supply[good] +=
              (s.provinces[p].natives / 1000) * 0.35 * GOOD_YIELD[good];
          }
        }
        nation.gold =
          Math.round((nation.gold + natives / 5000 + trade) * 10) / 10;
        nation.manpower = Math.min(
          natives * NATIVE_MANPOWER_CAP + 1000,
          Math.round(nation.manpower + 100 + natives * NATIVE_MANPOWER_PER_POP),
        );
        this.updateOpinions(n, owned);
      }
    }

    // Natives everywhere slowly grow back towards what the land holds.
    if (dateOf(s.day).month === 0)
      s.provinces.forEach((prov, p) => {
        const def = this.map.provinces[p];
        const owner = prov.owner >= 0 ? s.nations[prov.owner] : null;
        const cap =
          provinceCapacity(def.terrain, def.areaKm2) *
          (owner?.kind === "native"
            ? NATIVES_OWNED * (owner.strong ? 1.8 : 1)
            : owner
              ? 0.2
              : NATIVES_WILD);
        if (prov.natives < cap) {
          const grown = Math.min(
            cap,
            prov.natives * (1 + NATIVE_GROWTH * 12) + 12,
          );
          if (Math.round(grown) !== prov.natives)
            this.prov(p).natives = Math.round(grown);
        }
      });

    this.armiesMonthly();
    s.truces = s.truces.filter((t) => t.until > s.day);
    s.offers = s.offers.filter((o) => s.day - o.day <= 60);
    this.relationsChanged();
    this.updatePrices(supply);
    this.updateScores();
  }

  /** What a power earns and spends in a month, as things stand. */
  private powerLedger(
    n: Nation,
    owned: number[],
    dealGold: Map<number, number>,
    supply?: Record<Good, number>,
  ): { ledger: Nation["ledger"]; earned: number; totalPop: number } {
    const s = this.state;
    const diff = DIFFICULTY[s.settings.difficulty];
    const rules = powerRules(n);
    const connected = portConnected(s, this.map, n.id);
    const ledger = {
      goods: 0,
      tax: 0,
      trade: 0,
      crown: CROWN_SUBSIDY,
      upkeep: 0,
      total: 0,
    };
    let totalPop = 0;
    for (const p of owned) {
      const inc = provinceIncome(s, this.map, n, p, connected);
      ledger.goods += inc.goods;
      ledger.tax += inc.tax;
      if (supply) supply[this.map.provinces[p].good] += inc.units;
      totalPop += s.provinces[p].pop;
      ledger.upkeep += s.provinces[p].fort;
    }
    for (const d of s.deals) {
      if (d.power !== n.id) continue;
      if (!dealGold.has(d.native))
        dealGold.set(d.native, nativeTradeGold(s, this.map, d.native));
      ledger.trade +=
        (dealGold.get(d.native) ?? 0) * (1 + rules.diplomacy / 100);
    }
    for (const a of s.armies) {
      if (a.owner !== n.id) continue;
      for (const r of a.regs) ledger.upkeep += regUpkeep(r.type);
    }
    const earned =
      (ledger.goods + ledger.tax + ledger.trade + ledger.crown) *
      (n.player === null ? diff.income : 1);
    ledger.total = earned - ledger.upkeep;
    for (const k of Object.keys(ledger) as (keyof typeof ledger)[]) {
      ledger[k] = Math.round(ledger[k] * 10) / 10;
    }
    return { ledger, earned, totalPop };
  }

  private growSettlers(n: Nation, owned: number[]): void {
    const s = this.state;
    const rules = powerRules(n);
    const caps = owned.map((p) => {
      const def = this.map.provinces[p];
      return (
        provinceCapacity(def.terrain, def.areaKm2) *
        (1 + CAPACITY_PER_FARM * s.provinces[p].farm)
      );
    });
    // Newcomers from home head for ports first.
    const weights: number[] = owned.map((p, i) =>
      s.provinces[p].pop < caps[i] ? (s.provinces[p].port ? 3 : 1) : 0,
    );
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    owned.forEach((p, i) => {
      const prov = s.provinces[p];
      const growth = prov.pop * (POP_GROWTH + POP_GROWTH_PER_FARM * prov.farm);
      const arrivals =
        totalWeight > 0 ? (rules.immigrants * weights[i]) / totalWeight : 0;
      const pop = Math.round(
        Math.min(Math.max(caps[i], prov.pop), prov.pop + growth + arrivals),
      );
      if (pop !== prov.pop) this.prov(p).pop = pop;
    });
  }

  private updateOpinions(native: Nation, owned: number[]): void {
    const s = this.state;
    const nation = this.nation(native.id);
    const ownedSet = new Set(owned);
    for (const pw of s.nations) {
      if (pw.kind !== "power" || !pw.alive) continue;
      let o = nation.opinion[pw.id];
      if (atWar(s, native.id, pw.id)) {
        nation.opinion[pw.id] = -100;
        continue;
      }
      // Drift back towards indifference.
      o += o > 0 ? -1 : o < 0 ? 1 : 0;
      if (dealBetween(s, pw.id, native.id)) o += TRADE_OPINION_PER_MONTH;
      // Land hunger: their colonies pressing on our borders.
      let pressure = 0;
      for (const p of provincesOf(s, pw.id)) {
        if (this.map.provinces[p].nb.some(([q]) => ownedSet.has(q))) pressure++;
      }
      o -= Math.min(
        MAX_BORDER_PRESSURE,
        Math.ceil(pressure / 2) * BORDER_PRESSURE,
      );
      const before = nation.opinion[pw.id];
      nation.opinion[pw.id] = Math.max(-100, Math.min(100, Math.round(o)));
      if (before > ANGRY_OPINION && nation.opinion[pw.id] <= ANGRY_OPINION) {
        this.event({ k: "angry", day: s.day, n: native.id, at: pw.id });
      }
    }
  }

  private armiesMonthly(): void {
    const s = this.state;
    for (const a of [...s.armies]) {
      const owner = this.nation(a.owner);
      const prov = s.provinces[a.prov];
      const home = prov.owner === a.owner;
      this.touch(a);
      if (home && a.depart < 0) {
        for (const r of a.regs) {
          const need = Math.min(REINFORCE_PER_MONTH, REGIMENT_MEN - r.men);
          const got = Math.max(0, Math.min(need, Math.floor(owner.manpower)));
          r.men += got;
          owner.manpower -= got;
        }
      } else if (!home) {
        const terrain = TERRAIN[this.map.provinces[a.prov].terrain];
        const nativeHere =
          owner.kind === "native" &&
          (prov.owner === -1 || s.nations[prov.owner]?.kind === "native");
        const rate =
          (ATTRITION_AWAY + terrain.attrition) * (nativeHere ? 0.5 : 1);
        for (const r of a.regs)
          r.men = Math.max(0, Math.round(r.men * (1 - rate)));
      }
      a.regs = a.regs.filter((r) => r.men > 50);
      if (armyMen(a) < MIN_ARMY_MEN) this.removeArmy(a);
    }
  }

  updatePrices(supply?: Record<Good, number>): void {
    const s = this.state;
    let sup = supply;
    if (!sup) {
      sup = Object.fromEntries(GOODS.map((g) => [g, 0])) as Record<
        Good,
        number
      >;
      s.provinces.forEach((prov, p) => {
        if (prov.owner >= 0 && s.nations[prov.owner].kind === "power") {
          sup![this.map.provinces[p].good] +=
            (prov.pop / 1000) * GOOD_YIELD[this.map.provinces[p].good];
        }
      });
    }
    for (const g of GOODS) s.prices[g] = marketPrice(g, sup[g]);
    this.dirtyPrices = true;
  }

  updateScores(): void {
    const s = this.state;
    const count = new Map<number, number>();
    const pop = new Map<number, number>();
    for (const prov of s.provinces) {
      if (prov.owner < 0) continue;
      count.set(prov.owner, (count.get(prov.owner) ?? 0) + 1);
      pop.set(prov.owner, (pop.get(prov.owner) ?? 0) + prov.pop);
    }
    for (const n of s.nations) {
      if (n.kind !== "power") continue;
      const nation = this.nation(n.id);
      const c = count.get(n.id) ?? 0;
      nation.stats.peakProvinces = Math.max(nation.stats.peakProvinces, c);
      nation.score = scoreOf(nation, c, pop.get(n.id) ?? 0);
    }
  }

  private checkEnd(): void {
    const s = this.state;
    const powers = s.nations.filter((n) => n.kind === "power");
    const alive = powers.filter((n) => n.alive);
    const humans = powers.filter((n) => n.player !== null);
    const humansLeft = humans.filter((n) => n.alive);
    if (
      s.day >= s.endDay ||
      alive.length <= 1 ||
      (humans.length > 0 && humansLeft.length === 0)
    ) {
      this.finish();
    }
  }

  /** Ends the game now; the highest score among living powers wins. */
  finish(): void {
    const s = this.state;
    if (s.over) return;
    this.updateScores();
    const powers = s.nations.filter((n) => n.kind === "power");
    const ranked = [...powers].sort(
      (a, b) =>
        Number(b.alive) - Number(a.alive) || b.score - a.score || a.id - b.id,
    );
    s.over = true;
    s.winner = ranked[0].id;
    this.justEnded = true;
    this.event({ k: "over", day: s.day, winner: s.winner });
  }

  /** Powers ranked best first, as at the end of the game. */
  ranking(): Nation[] {
    return this.state.nations
      .filter((n) => n.kind === "power")
      .sort(
        (a, b) =>
          Number(b.alive) - Number(a.alive) || b.score - a.score || a.id - b.id,
      );
  }

  // ---------------------------------------------------------------- peace

  makePeace(a: number, b: number): void {
    const s = this.state;
    s.wars = s.wars.filter(
      (w) => !((w.a === a && w.b === b) || (w.a === b && w.b === a)),
    );
    s.truces = s.truces.filter(
      (t) => !((t.a === a && t.b === b) || (t.a === b && t.b === a)),
    );
    s.truces.push({ a, b, until: s.day + TRUCE_DAYS });
    s.offers = s.offers.filter(
      (o) => !((o.from === a && o.to === b) || (o.from === b && o.to === a)),
    );
    this.relationsChanged();
    // Armies standing in their former enemy's land go home.
    for (const army of [...s.armies]) {
      const owner = s.provinces[army.prov].owner;
      const other = army.owner === a ? b : army.owner === b ? a : -1;
      if (other < 0 || owner !== other) {
        if (
          other >= 0 &&
          army.path.some((q) => s.provinces[q].owner === other)
        ) {
          this.touch(army).path = [];
          army.depart = -1;
        }
        continue;
      }
      const home = s.nations[army.owner].capital;
      if (s.provinces[home]?.owner === army.owner) {
        this.touch(army);
        army.prov = home;
        army.path = [];
        army.depart = -1;
        army.retreating = false;
        army.arrived = s.day;
        army.from = -1;
      } else {
        this.removeArmy(army);
      }
    }
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      const nx = s.nations[x];
      if (nx.kind === "native")
        this.nation(x).opinion[y] = Math.max(nx.opinion[y], -30);
    }
    this.event({ k: "peace", day: s.day, n: a, with: b });
  }

  // ---------------------------------------------------------------- commands

  /** Carries out nation `n`'s command; returns why not, or null if done. */
  command(n: number, c: Command): string | null {
    const s = this.state;
    const nation = s.nations[n];
    if (!nation?.alive) return "Your nation has fallen.";
    if (s.over) return "The game is over.";
    switch (c.k) {
      case "colonize": {
        if (!validProv(s, c.p)) return "No such province.";
        const ok = colonizeCheck(s, this.map, n, c.p);
        if (!ok.ok) return ok.why;
        const me = this.nation(n);
        me.gold -= ok.gold;
        me.colonists -= 1;
        this.prov(c.p).colony = { by: n, start: s.day, done: s.day + ok.days };
        return null;
      }
      case "build": {
        if (!validProv(s, c.p) || !["farm", "port", "fort"].includes(c.b))
          return "No such building.";
        const ok = buildCheck(s, this.map, n, c.p, c.b);
        if (!ok.ok) return ok.why;
        this.nation(n).gold -= ok.gold;
        this.prov(c.p).build = {
          kind: c.b,
          start: s.day,
          done: s.day + ok.days,
        };
        return null;
      }
      case "recruit": {
        if (!validProv(s, c.p)) return "No such province.";
        const ok = recruitCheck(s, this.map, n, c.p, c.t);
        if (!ok.ok) return ok.why;
        const me = this.nation(n);
        me.gold -= ok.gold;
        me.manpower -= REGIMENT_MEN;
        this.prov(c.p).recruits.push({
          type: c.t,
          start: s.day,
          done: s.day + ok.days,
        });
        return null;
      }
      case "move": {
        const a = s.armies.find((x) => x.id === c.a);
        if (!a || a.owner !== n) return "That's not your army.";
        if (a.retreating)
          return "It's retreating and won't listen until it's safe.";
        if (!validProv(s, c.to)) return "No such province.";
        const moving = a.depart >= 0 && a.path.length > 0;
        if (moving && c.to === a.prov) {
          // Turn back: give up the hop under way.
          this.touch(a).path = [];
          a.depart = -1;
          return null;
        }
        const from = moving ? a.path[0] : a.prov;
        const route = findPath(s, this.map, n, from, c.to, armySpeed(a));
        if (!route)
          return "Can't get there: the way is blocked or it's not land you can enter.";
        this.touch(a).path = moving ? [a.path[0], ...route.path] : route.path;
        if (!moving) this.startHop(a);
        return null;
      }
      case "stop": {
        const a = s.armies.find((x) => x.id === c.a);
        if (!a || a.owner !== n) return "That's not your army.";
        if (a.retreating) return "It's retreating.";
        this.touch(a).path = a.depart >= 0 ? a.path.slice(0, 1) : [];
        return null;
      }
      case "split": {
        const a = s.armies.find((x) => x.id === c.a);
        if (!a || a.owner !== n) return "That's not your army.";
        if (a.depart >= 0 || a.retreating)
          return "Only a halted army can split.";
        if (a.regs.length < 2) return "It's a single regiment.";
        const half = a.regs.splice(Math.ceil(a.regs.length / 2));
        this.touch(a);
        const b: Army = { ...a, id: s.nextId++, regs: half, path: [] };
        s.armies.push(b);
        this.touch(b);
        return null;
      }
      case "merge": {
        const a = s.armies.find((x) => x.id === c.a);
        const b = s.armies.find((x) => x.id === c.b);
        if (!a || !b || a.owner !== n || b.owner !== n || a === b)
          return "Pick two of your armies.";
        if (a.prov !== b.prov) return "They need to be in the same province.";
        if (a.depart >= 0 || b.depart >= 0 || a.retreating || b.retreating)
          return "Both must be halted.";
        this.touch(a).regs.push(...b.regs);
        this.removeArmy(b);
        return null;
      }
      case "disband": {
        const a = s.armies.find((x) => x.id === c.a);
        if (!a || a.owner !== n) return "That's not your army.";
        this.nation(n).manpower += Math.round(armyMen(a) * 0.5);
        this.removeArmy(a);
        return null;
      }
      case "war": {
        if (!validNation(s, c.n)) return "No such nation.";
        const ok = warCheck(s, n, c.n);
        if (!ok.ok) return ok.why;
        this.declareWar(n, c.n);
        return null;
      }
      case "peace": {
        if (!validNation(s, c.n)) return "No such nation.";
        const ok = peaceCheck(s, n, c.n);
        if (!ok.ok) return ok.why;
        const other = s.nations[c.n];
        if (other.player === null) {
          if (aiWantsPeace(this, c.n, n)) this.makePeace(n, c.n);
          else this.event({ k: "refused", day: s.day, n, by: c.n });
        } else {
          s.offers.push({ from: n, to: c.n, day: s.day });
          this.relationsChanged();
          this.event({ k: "offer", day: s.day, n, to: c.n });
        }
        return null;
      }
      case "answer": {
        const offer = s.offers.find((o) => o.from === c.n && o.to === n);
        if (!offer) return "There's no offer to answer.";
        s.offers = s.offers.filter((o) => o !== offer);
        this.relationsChanged();
        if (c.yes && atWar(s, n, c.n)) this.makePeace(c.n, n);
        else this.event({ k: "refused", day: s.day, n: c.n, by: n });
        return null;
      }
      case "trade": {
        if (!validNation(s, c.n)) return "No such nation.";
        const ok = tradeCheck(s, this.map, n, c.n);
        if (!ok.ok) return ok.why;
        s.deals.push({ power: n, native: c.n, since: s.day });
        this.relationsChanged();
        const nat = this.nation(c.n);
        nat.opinion[n] = Math.min(100, nat.opinion[n] + 5);
        this.event({ k: "trade", day: s.day, n, with: c.n });
        return null;
      }
      case "untrade": {
        const deal = dealBetween(s, n, c.n);
        if (!deal) return "You don't trade with them.";
        s.deals = s.deals.filter((d) => d !== deal);
        this.relationsChanged();
        const nat = this.nation(c.n);
        nat.opinion[n] = Math.max(-100, nat.opinion[n] - 10);
        this.event({ k: "untrade", day: s.day, n, with: c.n });
        return null;
      }
      case "gift": {
        if (!validNation(s, c.n)) return "No such nation.";
        const ok = giftCheck(s, n, c.n, c.gold);
        if (!ok.ok) return ok.why;
        this.nation(n).gold -= c.gold;
        const nat = this.nation(c.n);
        nat.gold += c.gold;
        const boost =
          (GIFT_OPINION[c.gold] ?? 0) * (1 + powerRules(nation).diplomacy / 50);
        nat.opinion[n] = Math.min(100, Math.round(nat.opinion[n] + boost));
        this.event({ k: "gift", day: s.day, n, to: c.n, gold: c.gold });
        return null;
      }
      case "buy": {
        if (!validProv(s, c.p)) return "No such province.";
        const ok = buyCheck(s, this.map, n, c.p);
        if (!ok.ok) return ok.why;
        const prov = this.prov(c.p);
        const seller = prov.owner;
        this.nation(n).gold -= ok.gold;
        const nat = this.nation(seller);
        nat.gold += ok.gold;
        nat.opinion[n] = Math.max(-100, nat.opinion[n] - 15);
        prov.owner = n;
        prov.pop = Math.round(150 + prov.natives * 0.02);
        prov.natives = Math.round(prov.natives * 0.6);
        prov.siege = null;
        prov.recruits = [];
        this.nation(n).stats.landBought++;
        this.event({
          k: "bought",
          day: s.day,
          n,
          p: c.p,
          from: seller,
          gold: ok.gold,
        });
        return null;
      }
      default:
        return "Unknown command.";
    }
  }

  declareWar(n: number, target: number): void {
    const s = this.state;
    s.wars.push({ a: n, b: target, by: n, start: s.day, gains: [0, 0] });
    s.deals = s.deals.filter(
      (d) =>
        !(
          (d.power === n && d.native === target) ||
          (d.power === target && d.native === n)
        ),
    );
    s.offers = s.offers.filter(
      (o) =>
        !(
          (o.from === n && o.to === target) ||
          (o.from === target && o.to === n)
        ),
    );
    this.relationsChanged();
    if (s.nations[target].kind === "native")
      this.nation(target).opinion[n] = -100;
    if (s.nations[n].kind === "native") this.nation(n).opinion[target] = -100;
    // Other natives think less of a power that picks fights.
    if (s.nations[n].kind === "power" && s.nations[target].kind === "native") {
      for (const o of s.nations) {
        if (o.kind === "native" && o.id !== target && o.alive) {
          this.nation(o.id).opinion[n] = Math.max(-100, o.opinion[n] - 5);
        }
      }
    }
    this.event({ k: "war", day: s.day, n, on: target });
  }
}

function validProv(s: GameState, p: unknown): p is number {
  return (
    typeof p === "number" &&
    Number.isInteger(p) &&
    p >= 0 &&
    p < s.provinces.length
  );
}

function validNation(s: GameState, n: unknown): n is number {
  return (
    typeof n === "number" &&
    Number.isInteger(n) &&
    n >= 0 &&
    n < s.nations.length
  );
}

function regUpkeep(type: RegType): number {
  switch (type) {
    case "inf":
      return 1;
    case "cav":
      return 1.6;
    case "art":
      return 2;
    case "war":
      return 0.4;
    case "horse":
      return 0.7;
  }
}
