// Derpy Conquest's game: the state, the daily tick and the commands that
// change it. The server runs one per room; every nation, played or not,
// goes through command() and the same rules.

import { runAi } from "./Ai";
import { dateOf, isMonthStart } from "./Calendar";
import { characterCommand, charactersMonthly } from "./Characters";
import { crownCommand, crownMonthly, europeMonthly } from "./Crown";
import { diplomacyCommand, diplomacyMonthly } from "./Diplomacy";
import {
  convoysDaily,
  economyCommand,
  economyMonthly,
  worksDaily,
} from "./Economy";
import { answerEvent, eventsDaily, eventsMonthly } from "./Events";
import { folkMonthly } from "./Folk";
import { recordMilestone, yearlyMarks } from "./History";
import {
  beginLife,
  lifeCommand,
  livesAtEnd,
  livesDaily,
  livesMonthly,
} from "./Life";
import { World, worldOf } from "./Map";
// WORLD r11: fog of war, province markets, leads, and fitting old saves to the map.
import { fogDaily } from "./Fog";
import { leadsDaily, leadsMonthly } from "./Leads";
import { fitStateToMap } from "./MapFix";
import { marketsMonthly } from "./Markets";
import { missionCommand, missionsDaily, outpostsDaily } from "./Missions";
import { movementsMonthly } from "./Movements";
import { makePolities, politicsMonthly } from "./Politics";
import { popsMonthly } from "./Pops";
import { scoreOf } from "./Queries";
import { Rng } from "./Rng";
import { END_YEAR } from "./Rules";
import { newGameState } from "./Setup";
import { dealsMonthly, tradeCommand } from "./Trade";
import {
  Army,
  BattleReport,
  Character,
  Command,
  GameDelta,
  GameEvent,
  GameSettings,
  GameState,
  LifeCommand,
  LifePlan,
  MapDef,
  Nation,
  PlayerSeat,
  Province,
} from "./Types";
import { militaryCommand, warDaily, warMonthly } from "./War";

export { STATE_VERSION } from "./Setup";

export class ConquestGame {
  readonly w: World;
  readonly rng: Rng;
  private provs = new Set<number>();
  private nations = new Set<number>();
  private charsTouched = new Set<number>();
  private armies = new Map<number, Army | null>();
  private wars = false;
  private truces = false;
  private treaties = false;
  private offers = false;
  private deals = false;
  private europe = false;
  private battles: BattleReport[] = [];
  private events: GameEvent[] = [];
  private livesTouched = new Set<string>();
  private localsTouched = new Set<number>();
  private movements = false;
  private politiesTouched = new Set<number>();
  private travellers = false;
  private rumours = false;
  /** WORLD r11: markets touched, leads changed, and what each player last got. */
  private marketsTouched = new Set<number>();
  private leads = false;
  private sent = new Map<string, Map<string, string>>();
  /** While an act or a choice is being carried out: whose, and what it wrote. */
  capture: {
    seat: string;
    lines: string[];
    meta: Partial<Omit<import("./Types").Outcome, "n" | "lines" | "day">>;
    /** Purse, renown, stress, health and favour when it began. */
    before: number[];
  } | null = null;
  /** Turned off in tests that want a quiet world. */
  aiEnabled = true;

  /** Ids below this have been sent to players already. */
  private seenId: number;

  constructor(
    readonly map: MapDef,
    readonly state: GameState,
  ) {
    this.w = worldOf(map);
    fitStateToMap(state, map);
    this.rng = new Rng(state);
    this.seenId = state.nextId;
    // Players start from the whole state as it is now: later changes to
    // anything in it go out as just the fields that changed.
    state.provinces.forEach((pr, p) => this.diff(`p${p}`, pr));
    state.nations.forEach((n, i) => this.diff(`n${i}`, n));
    for (const life of state.lives) this.diff(`l${life.seat}`, life);
  }

  /**
   * A new world, with a life for each player who made a character. Returns
   * the game; a plan that doesn't fit the world is skipped (its player can
   * make another and drop in).
   */
  static create(
    map: MapDef,
    settings: GameSettings,
    seats: PlayerSeat[],
  ): ConquestGame {
    const g = new ConquestGame(
      map,
      newGameState(map, { ...settings, endYear: END_YEAR }),
    );
    makePolities(g);
    for (const seat of seats) beginLife(g, seat.seat, seat.name, seat.plan);
    g.takeDelta();
    return g;
  }

  get s(): GameState {
    return this.state;
  }

  // ---------------------------------------------------------------- changes

  prov(p: number): Province {
    this.provs.add(p);
    return this.state.provinces[p];
  }

  nation(n: number): Nation {
    this.nations.add(n);
    return this.state.nations[n];
  }

  char(c: number): Character {
    this.charsTouched.add(c);
    return this.state.chars[c];
  }

  touchChar(c: Character): Character {
    this.charsTouched.add(c.id);
    return c;
  }

  touch(a: Army): Army {
    this.armies.set(a.id, a);
    return a;
  }

  removeArmy(a: Army): void {
    const i = this.state.armies.indexOf(a);
    if (i >= 0) this.state.armies.splice(i, 1);
    this.armies.set(a.id, null);
  }

  addArmy(a: Army): Army {
    this.state.armies.push(a);
    return this.touch(a);
  }

  warsChanged(): void {
    this.wars = true;
  }
  trucesChanged(): void {
    this.truces = true;
  }
  treatiesChanged(): void {
    this.treaties = true;
  }
  offersChanged(): void {
    this.offers = true;
  }
  dealsChanged(): void {
    this.deals = true;
  }
  europeChanged(): void {
    this.europe = true;
  }
  lifeChanged(seat: string): void {
    this.livesTouched.add(seat);
  }
  localsChanged(p: number): void {
    this.localsTouched.add(p);
  }
  movementsChanged(): void {
    this.movements = true;
  }
  politiesChanged(n: number): void {
    this.politiesTouched.add(n);
  }
  travellersChanged(): void {
    this.travellers = true;
  }
  rumoursChanged(): void {
    this.rumours = true;
  }
  marketsChanged(p: number): void {
    this.marketsTouched.add(p);
  }
  leadsChanged(): void {
    this.leads = true;
  }

  /**
   * WORLD r11: what of something already sent has changed: just those
   * fields, or all of it if it's new to the players or lost a field.
   */
  private diff(
    key: string,
    obj: object,
  ): { full: boolean; patch: Record<string, unknown> | null } {
    const before = this.sent.get(key);
    const now = new Map<string, string>();
    for (const [k, v] of Object.entries(obj))
      if (v !== undefined) now.set(k, JSON.stringify(v));
    this.sent.set(key, now);
    if (!before) return { full: true, patch: null };
    for (const k of before.keys())
      if (!now.has(k)) return { full: true, patch: null };
    let patch: Record<string, unknown> | null = null;
    for (const [k, json] of now)
      if (before.get(k) !== json)
        (patch ??= {})[k] = (obj as Record<string, unknown>)[k];
    return { full: false, patch };
  }

  battle(r: BattleReport): void {
    this.state.battles.push(r);
    if (this.state.battles.length > 40)
      this.state.battles.splice(0, this.state.battles.length - 40);
    this.battles.push(r);
  }

  event(e: GameEvent): void {
    this.events.push(e);
    recordMilestone(this, e);
  }

  nextId(): number {
    return this.state.nextId++;
  }

  /** Everything changed since the last call. */
  takeDelta(): GameDelta {
    const s = this.state;
    // Characters born or arrived since last time (ids come from nextId).
    for (let id = this.seenId; id < s.nextId; id++)
      if (s.chars[id]) this.charsTouched.add(id);
    this.seenId = s.nextId;
    const d: GameDelta = { day: s.day };
    for (const p of this.provs) {
      const x = this.diff(`p${p}`, s.provinces[p]);
      if (x.full) (d.prov ??= {})[p] = s.provinces[p];
      else if (x.patch) (d.provPatch ??= {})[p] = x.patch;
    }
    for (const n of this.nations) {
      const x = this.diff(`n${n}`, s.nations[n]);
      if (x.full) (d.nations ??= {})[n] = s.nations[n];
      else if (x.patch) (d.nationPatch ??= {})[n] = x.patch;
    }
    if (this.charsTouched.size > 0) {
      d.chars = {};
      for (const c of this.charsTouched)
        if (s.chars[c]) d.chars[c] = s.chars[c];
    }
    if (this.armies.size > 0) d.armies = Object.fromEntries(this.armies);
    if (this.wars) d.wars = s.wars;
    if (this.truces) d.truces = s.truces;
    if (this.treaties) d.treaties = s.treaties;
    if (this.offers) d.offers = s.offers;
    if (this.deals) d.deals = s.deals;
    if (this.europe) d.europe = s.europe;
    if (this.battles.length > 0) d.battles = this.battles;
    if (this.events.length > 0) d.events = this.events;
    for (const seat of this.livesTouched) {
      const life = s.lives.find((l) => l.seat === seat);
      if (!life) continue;
      const x = this.diff(`l${seat}`, life);
      if (x.full) (d.lives ??= {})[seat] = life;
      else if (x.patch) (d.lifePatch ??= {})[seat] = x.patch;
    }
    if (this.marketsTouched.size > 0) {
      d.markets = {};
      for (const p of this.marketsTouched)
        d.markets[p] = s.markets?.[p] ?? null;
    }
    if (this.leads) d.leads = s.leads ?? [];
    if (this.localsTouched.size > 0) {
      d.locals = {};
      for (const p of this.localsTouched) d.locals[p] = s.locals[p] ?? [];
    }
    if (this.movements) d.movements = s.movements;
    if (this.travellers) d.travellers = s.travellers ?? [];
    if (this.rumours) d.rumours = s.rumours ?? [];
    if (this.politiesTouched.size > 0) {
      d.polities = {};
      for (const n of this.politiesTouched)
        if (s.polities[n]) d.polities[n] = s.polities[n];
    }
    if (s.over) d.over = { winner: s.winner };
    this.livesTouched = new Set();
    this.localsTouched = new Set();
    this.movements = false;
    this.travellers = false;
    this.rumours = false;
    this.marketsTouched = new Set();
    this.leads = false;
    this.politiesTouched = new Set();
    this.provs = new Set();
    this.nations = new Set();
    this.charsTouched = new Set();
    this.armies = new Map();
    this.wars =
      this.truces =
      this.treaties =
      this.offers =
      this.deals =
      this.europe =
        false;
    this.battles = [];
    this.events = [];
    return d;
  }

  // ---------------------------------------------------------------- time

  tick(): void {
    const s = this.state;
    if (s.over) return;
    s.day++;
    worksDaily(this);
    warDaily(this);
    outpostsDaily(this);
    missionsDaily(this);
    convoysDaily(this);
    eventsDaily(this);
    livesDaily(this);
    fogDaily(this); // WORLD r11
    leadsDaily(this); // WORLD r11
    if (isMonthStart(s.day)) this.month();
    if (s.day >= s.endDay) this.finish();
  }

  private month(): void {
    if (dateOf(this.state.day).month === 0) yearlyMarks(this);
    economyMonthly(this);
    popsMonthly(this);
    charactersMonthly(this);
    europeMonthly(this);
    crownMonthly(this);
    diplomacyMonthly(this);
    warMonthly(this);
    dealsMonthly(this);
    eventsMonthly(this);
    folkMonthly(this);
    politicsMonthly(this);
    movementsMonthly(this);
    livesMonthly(this);
    marketsMonthly(this); // WORLD r11
    leadsMonthly(this); // WORLD r11
    if (this.aiEnabled) {
      for (const n of this.state.nations) {
        if (n.alive && n.player === null) runAi(this, n.id);
      }
    }
    this.updateScores();
  }

  updateScores(): void {
    for (const n of this.state.nations) {
      if (!n.alive || (n.kind !== "power" && n.kind !== "native")) continue;
      const score = scoreOf(this.state, this.w, n.id).total;
      if (score !== n.score) this.nation(n.id).score = score;
    }
  }

  finish(): void {
    const s = this.state;
    if (s.over) return;
    this.updateScores();
    livesAtEnd(this);
    s.over = true;
    const best = this.ranking()[0];
    s.winner = best ? best.id : -1;
    this.event({ k: "over", day: s.day, winner: s.winner });
  }

  /** Colonial powers, best score first. */
  ranking(): Nation[] {
    return this.state.nations
      .filter((n) => n.kind === "power")
      .sort((a, b) => b.score - a.score || a.id - b.id);
  }

  nationOfSeat(seat: string): number {
    return this.state.nations.findIndex((n) => n.player === seat);
  }

  /** A player's character steps into the world (at the start, or dropping in). */
  beginLife(seat: string, name: string, plan: LifePlan): string | null {
    return beginLife(this, seat, name, plan);
  }

  /** Carry out a player's command for their character; why it can't, or null. */
  lifeCommand(seat: string, c: LifeCommand): string | null {
    return lifeCommand(this, seat, c);
  }

  // ---------------------------------------------------------------- commands

  /** Carry out a command for nation `n`; returns why it can't, or null. */
  command(n: number, c: Command): string | null {
    const s = this.state;
    if (s.over) return "The game is over.";
    const nation = s.nations[n];
    if (!nation?.alive) return "Your nation has fallen.";
    if (c === null || typeof c !== "object" || typeof c.k !== "string")
      return "Bad command.";
    switch (c.k) {
      case "colonize":
      case "build":
      case "tax":
      case "remit":
      case "ban":
        return c.k === "remit"
          ? crownCommand(this, n, c)
          : economyCommand(this, n, c);
      case "recruit":
      case "move":
      case "stop":
      case "split":
      case "merge":
      case "disband":
      case "lead":
      case "war":
      case "peace":
      case "answer":
        return militaryCommand(this, n, c);
      case "treaty":
      case "untreaty":
      case "gift":
      case "buy":
        return diplomacyCommand(this, n, c);
      case "appoint":
      case "dismiss":
      case "marry":
      case "confront":
        return characterCommand(this, n, c);
      case "event":
        return answerEvent(this, n, c.id, c.choice);
      case "demand":
      case "independence":
        return crownCommand(this, n, c);
      case "expedition":
      case "outpost":
        return missionCommand(this, n, c);
      case "deal":
      case "dealAnswer":
      case "order":
        return tradeCommand(this, n, c);
      case "abandon":
        return economyCommand(this, n, c);
      case "tribute":
      case "release":
        return diplomacyCommand(this, n, c);
      default:
        return "Unknown command.";
    }
  }
}
