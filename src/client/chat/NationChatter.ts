// The AI nations' table talk: now and then a nation says something in chat
// about what just happened to it — you attacked it, it attacked you, an
// alliance offered, accepted or broken, a nuke, a new city, winning, losing,
// a gift, a call to arms — or just passes the time. It answers a player who
// names it in the all-players chat, too.
//
// It runs on the client, from the game updates the simulation already sends
// for drawing the map, and nothing it does goes back. It has its own RNG,
// seeded from the game id, the tick and the nation, and never touches the
// simulation's: the same game says the same things on every client and in
// its replay, and the game itself cannot tell it is there (see
// tests/NationChatterDeterminism.test.ts).
//
// Only nations talk (PlayerType.Nation), never tribes (bots). It is careful
// not to spam: a small budget of lines a minute across the whole game, a
// separate small budget for big moments (a betrayal, a nuke, a fall), and
// cool-downs per nation and per subject.

import {
  GameUpdates,
  MessageType,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { simpleHash } from "@openfront/engine-lib/Util";
import { ChatterEvent, TEMPLATES } from "./ChatterTemplates";
import { voiceFor } from "./NationCulture";
import { GENERIC_KIT, VoiceKit, VOICES } from "./NationVoices";

/** A player as the chatter sees one. */
export interface ChatterPlayer {
  smallID: number;
  id: string;
  type: PlayerType;
  name: string;
  /** The nation's flag code from the map (nations only). */
  flag: string | null;
}

/** What the chatter reads of the game. The client's GameView and, in the
 *  tests, the engine's Game both answer it. Read-only. */
export interface ChatterWorld {
  gameID(): string;
  map(): string;
  ticks(): number;
  inSpawnPhase(): boolean;
  player(smallID: number): ChatterPlayer | null;
  playerById(id: string): ChatterPlayer | null;
  playerByClientID(clientID: string): ChatterPlayer | null;
  /** Every player of the game (humans, nations, tribes), alive or not. */
  players(): readonly ChatterPlayer[];
  /** Every nation of the game, alive or not. */
  nations(): readonly ChatterPlayer[];
  tiles(smallID: number): number;
  isAlive(smallID: number): boolean;
  /** smallIDs of the player's current allies. */
  allies(smallID: number): number[];
  numLandTiles(): number;
}

export interface ChatterLine {
  /** The nation speaking. */
  speaker: number;
  event: ChatterEvent;
  /** The words, with "{name}" where the player it is about goes. */
  text: string;
  /** smallID of the player "{name}" stands for, if any. */
  about: number | null;
  tick: number;
  /** An answer to a player's chat message rather than to the game. */
  reply: boolean;
}

// Ticks are 100 ms: 600 to the minute.
const SPEAK_DELAY_MIN = 8;
const SPEAK_DELAY_SPREAD = 25;
const MIN_GAP = 45; // between two nations' lines
const MAX_QUEUE_WAIT = 300;
const NORMAL_BUDGET = { cap: 2, refill: 300 }; // about 2 a minute
const BIG_BUDGET = { cap: 2, refill: 400 }; // 1.5 more for big moments
const REPLY_BUDGET = { cap: 2, refill: 150 };
const NATION_COOLDOWN = 450;
const NATION_COOLDOWN_BIG = 100;
const SUBJECT_COOLDOWN = 1500;
const SUBJECT_COOLDOWN_BIG = 300;
const REPLY_COOLDOWN = 120;
const LAND_CHECK_EVERY = 60;
const RECENT_MEMORY = 8;

interface Rule {
  chance: number;
  big?: boolean;
}

const RULES: Partial<Record<ChatterEvent, Rule>> = {
  greeting: { chance: 1 },
  idle: { chance: 1 },
  attacked: { chance: 0.35 },
  attacking: { chance: 0.25 },
  allianceOffer: { chance: 0.45 },
  allianceAccepted: { chance: 0.6 },
  allianceRejected: { chance: 0.5 },
  snubbed: { chance: 0.5 },
  betrayed: { chance: 0.9, big: true },
  betrayer: { chance: 0.6, big: true },
  nuked: { chance: 0.85, big: true },
  nukeLaunch: { chance: 0.55, big: true },
  bigCity: { chance: 0.12 },
  winning: { chance: 0.4 },
  losing: { chance: 0.45 },
  nearlyDead: { chance: 0.75, big: true },
  eliminated: { chance: 0.8, big: true },
  conquered: { chance: 0.6, big: true },
  donation: { chance: 0.75 },
  targetRequest: { chance: 0.3 },
  targetAck: { chance: 0.6 },
  victory: { chance: 1, big: true },
  goodGame: { chance: 1, big: true },
};

// The same subject between two nations is much less interesting to a room
// of players than one that involves them.
const NATIONS_ONLY_FACTOR = 0.25;

const EVENT_SALT: Record<string, number> = {};
let salt = 1;
for (const e of Object.keys(TEMPLATES)) EVENT_SALT[e] = salt++;

/** A tiny, self-contained PRNG (mulberry32), never the simulation's. */
export class ChatterRng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

function mix(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h = Math.imul(h ^ (p >>> 0), 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

class Budget {
  private tokens: number;
  private last = 0;
  constructor(private readonly spec: { cap: number; refill: number }) {
    this.tokens = spec.cap;
  }
  private refill(tick: number) {
    const gained = Math.floor((tick - this.last) / this.spec.refill);
    if (gained > 0) {
      this.tokens = Math.min(this.spec.cap, this.tokens + gained);
      this.last += gained * this.spec.refill;
    }
    if (this.tokens >= this.spec.cap) this.last = tick;
  }
  has(tick: number): boolean {
    this.refill(tick);
    return this.tokens >= 1;
  }
  take(tick: number): boolean {
    if (!this.has(tick)) return false;
    this.tokens--;
    return true;
  }
}

type Kit = Required<Omit<VoiceKit, "lines">> & { lines: VoiceKit["lines"] };

function kitFor(voice: string): Kit {
  const own = VOICES[voice] ?? VOICES.generic;
  return {
    hello: own.hello ?? GENERIC_KIT.hello,
    yes: own.yes ?? GENERIC_KIT.yes,
    no: own.no ?? GENERIC_KIT.no,
    wow: own.wow ?? GENERIC_KIT.wow,
    ugh: own.ugh ?? GENERIC_KIT.ugh,
    thanks: own.thanks ?? GENERIC_KIT.thanks,
    bye: own.bye ?? GENERIC_KIT.bye,
    friend: own.friend ?? GENERIC_KIT.friend,
    food: own.food ?? GENERIC_KIT.food,
    place: own.place ?? GENERIC_KIT.place,
    lines: own.lines,
  };
}

const SLOT = /\{(hello|yes|no|wow|ugh|thanks|bye|friend|food|place)\}/g;

/**
 * One line for `event` in `voice`, chosen and filled from `rng`. Lines the
 * voice said lately (`recent`) are skipped while there are others.
 */
export function composeLine(
  voice: string,
  event: ChatterEvent,
  rng: ChatterRng | (() => number),
  withName: boolean,
  recent: string[] = [],
): string {
  const r =
    typeof rng === "function"
      ? { next: rng, int: (n: number) => Math.floor(rng() * n) }
      : rng;
  const kit = kitFor(voice);
  const own = kit.lines?.[event] ?? [];
  const pool: { t: string; w: number }[] = [
    ...own.map((t) => ({ t, w: 2 })),
    ...TEMPLATES[event].map((t) => ({ t, w: 1 })),
  ].filter((c) => withName || !c.t.includes("{name}"));
  if (pool.length === 0) return "";
  const fresh = pool.filter((c) => !recent.includes(c.t));
  const choices = fresh.length > 0 ? fresh : pool;
  const total = choices.reduce((s, c) => s + c.w, 0);
  let x = r.next() * total;
  let chosen = choices[choices.length - 1].t;
  for (const c of choices) {
    x -= c.w;
    if (x < 0) {
      chosen = c.t;
      break;
    }
  }
  recent.push(chosen);
  if (recent.length > RECENT_MEMORY) recent.shift();
  // One choice per slot per line: "my {food}! My {food}!" is the same dish.
  const filled = new Map<string, string>();
  return chosen.replace(SLOT, (_, slot: keyof Omit<Kit, "lines">) => {
    let v = filled.get(slot);
    if (v === undefined) {
      const options = kit[slot];
      v = options[r.int(options.length)];
      filled.set(slot, v);
    }
    return v;
  });
}

const NUKE_MESSAGES = new Set([
  MessageType.NUKE_INBOUND,
  MessageType.HYDROGEN_BOMB_INBOUND,
  MessageType.MIRV_INBOUND,
]);
const TRACKED_UNITS = new Set<UnitType>([
  UnitType.AtomBomb,
  UnitType.HydrogenBomb,
  UnitType.MIRV,
  UnitType.MIRVWarhead,
  UnitType.TransportShip,
]);

// A few names players use for nations that are not their map names.
const FLAG_ALIASES: Record<string, string[]> = {
  us: ["usa", "america", "the us"],
  gb: ["uk", "britain", "england"],
  ae: ["uae"],
  cd: ["drc"],
  kr: ["korea"],
  nl: ["holland"],
  cz: ["czechia"],
};

function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasesOf(p: ChatterPlayer): string[] {
  const names = new Set<string>();
  const full = p.name.trim();
  names.add(full);
  const paren = /^(.*?)\s*\((.+)\)\s*$/.exec(full);
  if (paren) {
    names.add(paren[1]);
    names.add(paren[2]);
  }
  for (const a of FLAG_ALIASES[(p.flag ?? "").toLowerCase()] ?? []) {
    names.add(a);
  }
  return [...names].map(fold).filter((n) => n.length >= 3);
}

interface Pending {
  due: number;
  line: ChatterLine;
}

export class NationChatter {
  private readonly seed: number;
  private readonly voices = new Map<number, string>();
  private readonly recent = new Map<string, string[]>();
  private readonly normal = new Budget(NORMAL_BUDGET);
  private readonly big = new Budget(BIG_BUDGET);
  private readonly replies = new Budget(REPLY_BUDGET);
  private readonly lastSpoke = new Map<number, number>();
  private readonly lastSubject = new Map<string, number>();
  private readonly lastReply = new Map<number, number>();
  private readonly seenAttacks = new Set<string>();
  private readonly unitOwner = new Map<number, number>();
  private readonly cities = new Map<number, { level: number; done: boolean }>();
  private readonly peakTiles = new Map<number, number>();
  private readonly nearlyDeadSaid = new Set<number>();
  private readonly lastLosingRoll = new Map<number, number>();
  private lastWinningRoll = -Infinity;
  private nextIdle = -1;
  private lastDue = -Infinity;
  private gameOver = false;
  private queue: Pending[] = [];
  private aliasCache: { id: number; re: RegExp }[] | null = null;
  private aliasNations = 0;

  constructor(private readonly world: ChatterWorld) {
    this.seed = simpleHash(world.gameID());
  }

  /** The voice a nation speaks with (see NationCulture). */
  voiceOf(smallID: number): string {
    let v = this.voices.get(smallID);
    if (v === undefined) {
      const p = this.world.player(smallID);
      v = p === null ? "generic" : voiceFor(p.name, p.flag, this.world.map());
      this.voices.set(smallID, v);
    }
    return v;
  }

  /**
   * Feed one tick's updates; returns the lines due to be said by now. Call
   * once per simulation tick, in order.
   */
  tick(updates: GameUpdates): ChatterLine[] {
    const now = this.world.ticks();
    if (!this.gameOver) {
      this.readUpdates(updates, now);
      if (!this.world.inSpawnPhase()) {
        if (now % LAND_CHECK_EVERY === 0) this.checkLand(now);
        this.maybeIdle(now);
      }
    }
    return this.flush(now);
  }

  /**
   * A player said something in the all-players chat. A nation it names may
   * answer (see `reply` on the line). `seq` is the server's line number, so
   * every client picks the same answer.
   */
  onChat(senderClientID: string, text: string, seq: number): void {
    if (this.gameOver) return;
    const sender = this.world.playerByClientID(senderClientID);
    if (sender === null || sender.type !== PlayerType.Human) return;
    const now = this.world.ticks();
    const named = this.mentionedNation(text);
    if (named === null) return;
    const last = this.lastReply.get(named) ?? -Infinity;
    if (now - last < REPLY_COOLDOWN || !this.replies.has(now)) return;
    const rng = new ChatterRng(mix(this.seed, seq, named, 0x5e9));
    if (!rng.chance(0.9)) return;
    this.replies.take(now);
    this.lastReply.set(named, now);
    const event = mentionKind(text);
    const voice = this.voiceOf(named);
    const words = composeLine(
      voice,
      event,
      rng,
      true,
      this.recentFor(voice, event),
    );
    this.queue.push({
      due: now + 12 + rng.int(20),
      line: {
        speaker: named,
        event,
        text: words,
        about: sender.smallID,
        tick: now,
        reply: true,
      },
    });
  }

  private recentFor(voice: string, event: ChatterEvent): string[] {
    const key = `${voice}:${event}`;
    let r = this.recent.get(key);
    if (r === undefined) {
      r = [];
      this.recent.set(key, r);
    }
    return r;
  }

  private isNation(smallID: number | null | undefined): boolean {
    if (smallID === null || smallID === undefined) return false;
    return this.world.player(smallID)?.type === PlayerType.Nation;
  }

  private isHuman(smallID: number | null | undefined): boolean {
    if (smallID === null || smallID === undefined) return false;
    return this.world.player(smallID)?.type === PlayerType.Human;
  }

  private smallIDOf(id: string): number | null {
    return this.world.playerById(id)?.smallID ?? null;
  }

  /**
   * Something happened that `speaker` might talk about. Rolls the dice,
   * checks the cool-downs and the budget, and queues the line.
   */
  private consider(
    now: number,
    speaker: number,
    event: ChatterEvent,
    about: number | null,
    opts: { allowDead?: boolean; nationsOnly?: boolean } = {},
  ): void {
    const rule = RULES[event];
    if (rule === undefined || !this.isNation(speaker)) return;
    if (!opts.allowDead && !this.world.isAlive(speaker)) return;
    const big = rule.big === true;
    const rng = new ChatterRng(
      mix(this.seed, now, speaker, EVENT_SALT[event], about ?? 0xffff),
    );
    const chance = rule.chance * (opts.nationsOnly ? NATIONS_ONLY_FACTOR : 1);
    if (!rng.chance(chance)) return;
    const lastSpoke = this.lastSpoke.get(speaker) ?? -Infinity;
    if (now - lastSpoke < (big ? NATION_COOLDOWN_BIG : NATION_COOLDOWN)) return;
    const subject = `${speaker}:${event}:${about ?? ""}`;
    const lastSubject = this.lastSubject.get(subject) ?? -Infinity;
    if (now - lastSubject < (big ? SUBJECT_COOLDOWN_BIG : SUBJECT_COOLDOWN)) {
      return;
    }
    const due = Math.max(
      now + SPEAK_DELAY_MIN + rng.int(SPEAK_DELAY_SPREAD),
      this.lastDue + MIN_GAP,
    );
    if (due - now > MAX_QUEUE_WAIT) return;
    if (!(big ? this.big : this.normal).take(now)) return;
    this.lastSpoke.set(speaker, now);
    this.lastSubject.set(subject, now);
    this.lastDue = due;
    const voice = this.voiceOf(speaker);
    const text = composeLine(
      voice,
      event,
      rng,
      about !== null,
      this.recentFor(voice, event),
    );
    if (text === "") return;
    this.queue.push({
      due,
      line: { speaker, event, text, about, tick: now, reply: false },
    });
  }

  private readUpdates(u: GameUpdates, now: number): void {
    for (const unit of u[GameUpdateType.Unit]) {
      if (TRACKED_UNITS.has(unit.unitType)) {
        if (unit.isActive) this.unitOwner.set(unit.id, unit.ownerID);
        else this.unitOwner.delete(unit.id);
      }
      if (unit.unitType === UnitType.City && unit.isActive) {
        const before = this.cities.get(unit.id);
        const done = unit.underConstruction !== true;
        this.cities.set(unit.id, { level: unit.level, done });
        const built = done && (before === undefined || !before.done);
        const grew =
          before !== undefined && unit.level > before.level && unit.level >= 3;
        if ((built || grew) && !this.world.inSpawnPhase()) {
          this.consider(now, unit.ownerID, "bigCity", null);
        }
      }
    }

    for (const pu of u[GameUpdateType.Player]) {
      for (const a of pu.outgoingAttacks ?? []) {
        if (this.seenAttacks.has(a.id)) continue;
        this.seenAttacks.add(a.id);
        this.onAttack(now, a.attackerID, a.targetID);
      }
    }

    for (const inc of u[GameUpdateType.UnitIncoming]) {
      const attacker = this.unitOwner.get(inc.unitID);
      if (attacker === undefined) continue;
      if (NUKE_MESSAGES.has(inc.messageType)) {
        this.onNuke(now, attacker, inc.playerID);
      } else if (inc.messageType === MessageType.NAVAL_INVASION_INBOUND) {
        this.onAttack(now, attacker, inc.playerID);
      }
    }

    for (const req of u[GameUpdateType.AllianceRequest]) {
      if (this.isNation(req.requestorID) && this.isHuman(req.recipientID)) {
        this.consider(now, req.requestorID, "allianceOffer", req.recipientID);
      }
    }

    for (const reply of u[GameUpdateType.AllianceRequestReply]) {
      const from = reply.request.requestorID;
      const to = reply.request.recipientID;
      if (this.isHuman(from) && this.isNation(to)) {
        this.consider(
          now,
          to,
          reply.accepted ? "allianceAccepted" : "allianceRejected",
          from,
        );
      } else if (this.isNation(from) && this.isHuman(to)) {
        this.consider(
          now,
          from,
          reply.accepted ? "allianceAccepted" : "snubbed",
          to,
        );
      }
    }

    for (const broke of u[GameUpdateType.BrokeAlliance]) {
      const { traitorID, betrayedID } = broke;
      if (this.isNation(betrayedID)) {
        this.consider(now, betrayedID, "betrayed", traitorID, {
          nationsOnly: !this.isHuman(traitorID),
        });
      }
      if (this.isNation(traitorID) && this.isHuman(betrayedID)) {
        this.consider(now, traitorID, "betrayer", betrayedID);
      }
    }

    for (const t of u[GameUpdateType.TargetPlayer]) {
      if (this.isNation(t.playerID)) {
        this.consider(now, t.playerID, "targetRequest", t.targetID);
      } else if (this.isHuman(t.playerID)) {
        const friends = this.world
          .allies(t.playerID)
          .filter((a) => this.isNation(a) && a !== t.targetID);
        if (friends.length > 0) {
          const rng = new ChatterRng(mix(this.seed, now, t.playerID, 0x7a3));
          this.consider(now, rng.pick(friends), "targetAck", t.targetID);
        }
      }
    }

    for (const d of u[GameUpdateType.DonateEvent]) {
      const to = this.smallIDOf(d.recipientId);
      const from = this.smallIDOf(d.senderId);
      if (
        to !== null &&
        from !== null &&
        this.isNation(to) &&
        this.isHuman(from)
      ) {
        this.consider(now, to, "donation", from);
      }
    }

    for (const c of u[GameUpdateType.ConquestEvent]) {
      const winner = this.smallIDOf(c.conquerorId);
      const loser = this.smallIDOf(c.conqueredId);
      if (loser === null) continue;
      if (this.isNation(loser)) {
        this.consider(now, loser, "eliminated", winner, {
          allowDead: true,
          nationsOnly: !this.isHuman(winner),
        });
      } else if (this.isHuman(loser) && this.isNation(winner)) {
        this.consider(now, winner!, "conquered", loser);
      }
    }

    if (u[GameUpdateType.SpawnPhaseEnd].length > 0) this.greet(now);

    for (const win of u[GameUpdateType.Win]) this.onWin(now, win.winner);
  }

  private onAttack(now: number, attacker: number, target: number): void {
    if (this.isHuman(attacker) && this.isNation(target)) {
      this.consider(now, target, "attacked", attacker);
    } else if (this.isNation(attacker) && this.isHuman(target)) {
      this.consider(now, attacker, "attacking", target);
    }
  }

  private onNuke(now: number, attacker: number, target: number): void {
    if (this.isNation(target)) {
      this.consider(now, target, "nuked", attacker, {
        nationsOnly: !this.isHuman(attacker),
      });
    } else if (this.isNation(attacker) && this.isHuman(target)) {
      this.consider(now, attacker, "nukeLaunch", target);
    }
  }

  private aliveNations(): ChatterPlayer[] {
    return this.world.nations().filter((n) => this.world.isAlive(n.smallID));
  }

  private greet(now: number): void {
    const nations = this.aliveNations();
    if (nations.length === 0) return;
    const rng = new ChatterRng(mix(this.seed, 0x6e7));
    const first = rng.pick(nations);
    this.consider(now, first.smallID, "greeting", null);
    if (nations.length > 3 && rng.chance(0.6)) {
      const second = rng.pick(nations.filter((n) => n !== first));
      this.consider(now, second.smallID, "greeting", null);
    }
    this.nextIdle = now + 900 + rng.int(600);
  }

  private maybeIdle(now: number): void {
    if (this.nextIdle < 0) this.nextIdle = now + 900;
    if (now < this.nextIdle) return;
    const rng = new ChatterRng(mix(this.seed, now, 0x1d1e));
    this.nextIdle = now + 700 + rng.int(800);
    if (now - this.lastDue < 300) return;
    const nations = this.aliveNations();
    if (nations.length === 0) return;
    this.consider(now, rng.pick(nations).smallID, "idle", null);
  }

  private checkLand(now: number): void {
    // The biggest player of all, so a nation that is merely the biggest
    // nation, behind a human, does not brag.
    let leader: ChatterPlayer | null = null;
    let leaderTiles = 0;
    for (const p of this.world.players()) {
      if (!this.world.isAlive(p.smallID)) continue;
      const tiles = this.world.tiles(p.smallID);
      if (tiles > leaderTiles) {
        leaderTiles = tiles;
        leader = p;
      }
    }
    for (const n of this.world.nations()) {
      if (!this.world.isAlive(n.smallID)) continue;
      const tiles = this.world.tiles(n.smallID);
      const peak = Math.max(this.peakTiles.get(n.smallID) ?? 0, tiles);
      this.peakTiles.set(n.smallID, peak);
      if (peak >= 150 && tiles > 0 && tiles <= peak * 0.12) {
        if (!this.nearlyDeadSaid.has(n.smallID)) {
          this.nearlyDeadSaid.add(n.smallID);
          this.consider(now, n.smallID, "nearlyDead", null);
        }
      } else if (peak >= 120 && tiles <= peak * 0.5) {
        const last = this.lastLosingRoll.get(n.smallID) ?? -Infinity;
        if (now - last >= 3000) {
          this.lastLosingRoll.set(n.smallID, now);
          this.consider(now, n.smallID, "losing", null);
        }
      }
    }
    if (
      leader !== null &&
      leader.type === PlayerType.Nation &&
      leaderTiles >= this.world.numLandTiles() * 0.2 &&
      now - this.lastWinningRoll >= 3600
    ) {
      this.lastWinningRoll = now;
      this.consider(now, leader.smallID, "winning", null);
    }
  }

  private onWin(now: number, winner: unknown): void {
    this.gameOver = true;
    if (!Array.isArray(winner)) return;
    const [kind, who] = winner as [string, string];
    if (kind === "nation") {
      const n = this.world.nations().find((p) => p.name === who);
      if (n !== undefined) {
        this.consider(now, n.smallID, "victory", null, { allowDead: true });
      }
      return;
    }
    const nations = this.aliveNations();
    if (nations.length === 0) return;
    const rng = new ChatterRng(mix(this.seed, now, 0x99));
    const speaker = rng.pick(nations).smallID;
    const about =
      kind === "player"
        ? (this.world.playerByClientID(who)?.smallID ?? null)
        : null;
    this.consider(now, speaker, "goodGame", about);
  }

  private mentionedNation(text: string): number | null {
    const nations = this.world.nations();
    if (this.aliasCache === null || this.aliasNations !== nations.length) {
      this.aliasNations = nations.length;
      this.aliasCache = [];
      for (const n of nations) {
        for (const alias of aliasesOf(n)) {
          this.aliasCache.push({
            id: n.smallID,
            re: new RegExp(
              `(?<![\\p{L}\\p{N}])${escapeRegExp(alias)}(?![\\p{L}\\p{N}])`,
              "u",
            ),
          });
        }
      }
    }
    const folded = fold(text);
    let best: { id: number; at: number } | null = null;
    for (const { id, re } of this.aliasCache) {
      if (!this.world.isAlive(id)) continue;
      const m = re.exec(folded);
      if (m !== null && (best === null || m.index < best.at)) {
        best = { id, at: m.index };
      }
    }
    return best?.id ?? null;
  }

  private flush(now: number): ChatterLine[] {
    if (this.queue.length === 0) return [];
    const ready = this.queue.filter((p) => p.due <= now);
    if (ready.length === 0) return [];
    this.queue = this.queue.filter((p) => p.due > now);
    ready.sort((a, b) => a.due - b.due);
    return ready.map((p) => ({ ...p.line, tick: now }));
  }
}

/** What a player's message to a nation is about, roughly. */
export function mentionKind(text: string): ChatterEvent {
  const t = fold(text);
  if (/\b(sorry|apolog|my bad|oops|forgive)/.test(t)) return "mentionSorry";
  if (/\b(thanks|thank you|thx|ty|gracias|merci|danke|cheers)\b/.test(t)) {
    return "mentionThanks";
  }
  if (
    /\b(attack|kill|destroy|crush|nuke|war|die|invade|coming for|end you)/.test(
      t,
    )
  ) {
    return "mentionThreat";
  }
  if (/\b(ally|allies|alliance|team up|friends?|peace|truce|deal)\b/.test(t)) {
    return "mentionAlly";
  }
  if (
    /\b(hi|hello|hey|hola|bonjour|yo|sup|greetings|howdy|ciao|hallo)\b/.test(t)
  ) {
    return "mentionGreet";
  }
  return "mention";
}
