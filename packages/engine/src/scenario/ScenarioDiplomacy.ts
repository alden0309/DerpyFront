import {
  MessageType,
  PlayerType,
  Team,
} from "@openfront/engine-api/game/GameTypes";
import {
  ASK_ANSWER_TICKS,
  GoodwillStanding,
  GoodwillWord,
  INVITE_ANSWER_TICKS,
  DIPLOMACY_MESSAGES as M,
  ScenarioAskView,
  ScenarioCourtView,
  ScenarioDiplomacyView,
} from "@openfront/engine-api/game/ScenarioDiplomacy";
import { GameConfig } from "@openfront/engine-api/Schemas";
import { renderNumber } from "@openfront/engine-lib/Format";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import { ScenarioNation } from "@openfront/engine-lib/scenario/ScenarioData";
import {
  COURTED_LEANINGS,
  LEANING_PRICE_PERCENT,
  leaningOf,
} from "@openfront/engine-lib/scenario/ScenarioLeaning";
import { Game, Player } from "../game/Game";

/**
 * DIPLO (r27): courting the neutrals in a Scenario.
 *
 * A nation on a side may send a neutral a gift of gold: the gold goes to the
 * neutral, and the gift raises the neutral's goodwill toward the giver's
 * side by as much. Goodwill fades slowly. Each neutral has a price per side:
 * its size in minutes of a big nation's income, at the going rate, times its
 * historical leaning toward that side (the data's `leaning`). Invited, a
 * computer-run neutral joins once its goodwill there has reached the price
 * (and the war is old enough for a neutral of its size), and otherwise says
 * no and why. A neutral played by a person is asked, and may also ask a side
 * to join it; the side's people answer, or the computer does. Computer-run
 * sides court the neutrals that lean their way with a small share of their
 * income. Joining is for good, like being invaded (ScenarioRules.ts).
 *
 * Everything here works from the game's ticks and integers and the seeded
 * PRNG, so every client agrees; its state is ScenarioDiplomacyExecution's
 * and goes into the game's snapshot with it.
 */

/** The numbers (README, "Courting the neutrals"). */
export const DIPLOMACY_TUNING = {
  /**
   * A neutral's size, in minutes of a big nation's income: this many times
   * its troop cap over the mean cap of the three biggest side nations, at
   * the start, between sizeMin and sizeMax minutes.
   */
  sizeMinutes: 20,
  sizeMin: 1,
  sizeMax: 10,
  /**
   * The going rate (gold a minute): the mean income per minute so far of
   * the three biggest earners on the sides, and at least this.
   */
  rateFloor: 1_000_000,
  /** Goodwill fades by this many parts in 10,000 every 10 seconds (~4%/min). */
  decayPer10k: 67,
  /**
   * A neutral joins nobody before minute earliestBase + its size (in
   * minutes), at least earliestMin and at most earliestMax.
   */
  earliestBase: 4,
  earliestMin: 5,
  earliestMax: 12,
  /** One invitation per side per neutral a minute; one ask per side. */
  inviteCooldown: 600,
  askCooldown: 600,
  /** A computer-run side invites a person's neutral at most this often. */
  aiPersonInviteCooldown: 1800,
  /** Whether computer-run sides court at all (tests turn it off). */
  aiCourts: true,
  /** How often computer-run sides court (ticks), and with what share. */
  aiEvery: 300,
  /** Of each computer-run nation's income, parts in 1,000 it may give. */
  aiSharePerMille: 100,
  /** It gives in two rounds of three ("now and then"). */
  aiActOutOf: 3,
  aiActRounds: 2,
  /** A computer-run nation saves at most this many minutes' going rate. */
  aiBudgetCapMinutes: 1,
};

/** The editions of the scenarios that have courting (scenarioEdition). */
export const DIPLOMACY_FROM_EDITION = 3;
const DIPLOMACY_FROM_EDITION_OF: Readonly<Record<string, number>> = {
  // Its own edition was already 3 (the blockade) before courting.
  colonies1776: 4,
};

/** Whether a game with this config has courting: a scenario, new enough. */
export function diplomacyEnabled(config: GameConfig): boolean {
  const s = config.scenario;
  if (s === undefined) return false;
  const from = Object.prototype.hasOwnProperty.call(
    DIPLOMACY_FROM_EDITION_OF,
    s.id,
  )
    ? DIPLOMACY_FROM_EDITION_OF[s.id]
    : DIPLOMACY_FROM_EDITION;
  return (s.edition ?? 1) >= from;
}

const TICKS_PER_MINUTE = 600;
/**
 * Sizes are fixed two seconds in, when every capital has added its troops
 * (a capital's bonus comes on its own first tick, after the board's).
 */
const START_TICK = 20;
/** How often the going rate is worked out again. */
const RATE_EVERY = 300;

/** The key of a neutral's standing with a side. */
function key(neutral: number, side: Team): string {
  return `${neutral}|${side}`;
}

/** What ScenarioDiplomacyExecution keeps (and snapshots). */
export interface DiplomacyStateData {
  /** The tick sizes were fixed at (null: not yet). */
  started: number | null;
  /** Neutral small id -> its size in hundredths of a minute. */
  size: [number, number][];
  /** "neutral|side" -> goodwill (gold). */
  goodwill: [string, number][];
  /** The going rate, gold a minute. */
  rate: number;
  /** "neutral|side" -> the tick the side last invited it. */
  invitedAt: [string, number][];
  /** "neutral|side" -> the tick the neutral last asked the side. */
  askedAt: [string, number][];
  /** "neutral|side" -> [tick, inviter small id]: a person's open invitation. */
  invites: [string, [number, number]][];
  /** "neutral|side" -> tick: a neutral's open ask, before the side's people. */
  asks: [string, number][];
  /** Computer-run nation small id -> [budget, gold earned when last seen]. */
  ai: [number, [number, number]][];
  random: [number, number, number, number];
}

function sorted<K extends string | number, V>(m: Map<K, V>): [K, V][] {
  return [...m].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** The rules and state of courting in one game (see the top of this file). */
export class ScenarioDiplomacy {
  started: number | null = null;
  size = new Map<number, number>();
  goodwill = new Map<string, number>();
  rate = DIPLOMACY_TUNING.rateFloor;
  invitedAt = new Map<string, number>();
  askedAt = new Map<string, number>();
  invites = new Map<string, [number, number]>();
  asks = new Map<string, number>();
  ai = new Map<number, [number, number]>();
  random: PseudoRandom;

  constructor(
    readonly game: Game,
    seed: number,
  ) {
    this.random = new PseudoRandom(seed);
  }

  static fromData(game: Game, d: DiplomacyStateData): ScenarioDiplomacy {
    const s = Object.create(ScenarioDiplomacy.prototype) as ScenarioDiplomacy;
    Object.assign(s, {
      game,
      started: d.started,
      size: new Map(d.size),
      goodwill: new Map(d.goodwill),
      rate: d.rate,
      invitedAt: new Map(d.invitedAt),
      askedAt: new Map(d.askedAt),
      invites: new Map(d.invites),
      asks: new Map(d.asks),
      ai: new Map(d.ai),
      random: PseudoRandom.fromState(d.random),
    });
    return s;
  }

  toData(): DiplomacyStateData {
    return {
      started: this.started,
      size: sorted(this.size),
      goodwill: sorted(this.goodwill),
      rate: this.rate,
      invitedAt: sorted(this.invitedAt),
      askedAt: sorted(this.askedAt),
      invites: sorted(this.invites),
      asks: sorted(this.asks),
      ai: sorted(this.ai),
      random: this.random.getState(),
    };
  }

  // --- who is who ---------------------------------------------------------

  /** The scenario nation `p` plays, if any. */
  nation(p: Player): ScenarioNation | null {
    return this.game.scenario()?.nationOf(p) ?? null;
  }

  /** A neutral that can be courted: a scenario nation, alive, on no side. */
  isNeutral(p: Player): boolean {
    return p.isAlive() && p.team() === null && this.nation(p) !== null;
  }

  sides(): Team[] {
    return this.game.scenario()?.sideIds() ?? [];
  }

  /** Whether `side` still has a nation in the war. */
  sideAlive(side: Team): boolean {
    return this.game.players().some((p) => p.team() === side);
  }

  private neutrals(): Player[] {
    return this.game.players().filter((p) => this.isNeutral(p));
  }

  private people(side: Team): Player[] {
    return this.game
      .players()
      .filter((p) => p.team() === side && p.type() === PlayerType.Human);
  }

  // --- prices -------------------------------------------------------------

  /** Fixes every neutral's size, once the board is laid out. */
  private start(): void {
    if (this.started !== null || this.game.inSpawnPhase()) return;
    if (this.game.ticks() < START_TICK) return;
    const t = DIPLOMACY_TUNING;
    const config = this.game.config();
    const caps = this.game
      .players()
      .filter((p) => p.team() !== null)
      .map((p) => config.maxTroops(p))
      .sort((a, b) => b - a)
      .slice(0, 3);
    const big =
      caps.length === 0 ? 1 : caps.reduce((a, b) => a + b, 0) / caps.length;
    for (const n of this.neutrals()) {
      const hundredths = Math.round(
        (t.sizeMinutes * 100 * config.maxTroops(n)) / Math.max(1, big),
      );
      this.size.set(
        n.smallID(),
        Math.min(t.sizeMax * 100, Math.max(t.sizeMin * 100, hundredths)),
      );
    }
    this.started = this.game.ticks();
    this.updateRate();
  }

  /** The going rate: the three biggest earners' income a minute, so far. */
  private updateRate(): void {
    const minutes = Math.max(2, this.game.ticks() / TICKS_PER_MINUTE);
    const top = this.game
      .players()
      .filter((p) => p.team() !== null)
      .map((p) => Number(p.goldEarned()))
      .sort((a, b) => b - a)
      .slice(0, 3);
    const mean =
      top.length === 0 ? 0 : top.reduce((a, b) => a + b, 0) / top.length;
    this.rate = Math.max(
      DIPLOMACY_TUNING.rateFloor,
      Math.floor(mean / minutes),
    );
  }

  /** The war's whole minutes so far, as its timer counts them. */
  minute(): number {
    return Math.floor(this.game.ticks() / TICKS_PER_MINUTE);
  }

  /** A neutral's size in hundredths of a minute of the going rate. */
  sizeOf(neutral: Player): number {
    return this.size.get(neutral.smallID()) ?? DIPLOMACY_TUNING.sizeMin * 100;
  }

  /** The leaning's percent (null: never) for `side` now. */
  leaningPercent(neutral: Player, side: Team): number | null {
    const n = this.nation(neutral);
    if (n === null) return null;
    return LEANING_PRICE_PERCENT[leaningOf(n, side, this.minute())];
  }

  /** What goodwill `side` needs to win `neutral` over now (null: never). */
  price(neutral: Player, side: Team): number | null {
    const pct = this.leaningPercent(neutral, side);
    if (pct === null) return null;
    const base = Math.floor((this.sizeOf(neutral) * this.rate) / 100);
    return Math.max(1, Math.floor((base * pct) / 100));
  }

  /** The first tick a neutral of this size joins anyone. */
  earliestTick(neutral: Player): number {
    const t = DIPLOMACY_TUNING;
    const minutes = Math.min(
      t.earliestMax,
      Math.max(
        t.earliestMin,
        t.earliestBase + Math.ceil(this.sizeOf(neutral) / 100),
      ),
    );
    return minutes * TICKS_PER_MINUTE;
  }

  goodwillOf(neutral: Player, side: Team): number {
    return this.goodwill.get(key(neutral.smallID(), side)) ?? 0;
  }

  /** Whether a computer-run neutral would join `side` if invited now. */
  wouldJoin(neutral: Player, side: Team): boolean {
    return this.refusal(neutral, side) === null;
  }

  /**
   * Why a computer-run neutral says no to `side` now (an en.json key), or
   * null when it says yes.
   */
  refusal(neutral: Player, side: Team): string | null {
    const price = this.price(neutral, side);
    if (price === null) return M.refusedNever;
    if (this.game.ticks() < this.earliestTick(neutral)) return M.refusedEarly;
    const pct = this.percent(neutral, side, price);
    if (pct >= 100) return null;
    if (pct >= 60) return M.refusedFriendly;
    if (pct >= 25) return M.refusedWary;
    return M.refusedCold;
  }

  private percent(neutral: Player, side: Team, price: number): number {
    return Math.floor((this.goodwillOf(neutral, side) * 100) / price);
  }

  // --- what players do ----------------------------------------------------

  /** A side's nation sends a neutral `gold` (as much as it has). */
  gift(giver: Player, neutral: Player, gold: number): void {
    this.start();
    const side = giver.team();
    if (side === null || !giver.isAlive() || !this.isNeutral(neutral)) return;
    const removed = giver.removeGold(BigInt(Math.max(0, Math.floor(gold))));
    if (removed <= 0n) return;
    this.receive(neutral, side, removed);
    if (giver.type() === PlayerType.Human) {
      this.game.displayMessage(
        M.giftSent,
        MessageType.DONATION_SENT,
        giver.id(),
        undefined,
        { name: neutral.displayName(), gold: renderNumber(removed) },
        undefined,
        neutral.id(),
      );
    }
    this.tellGift(neutral, side, removed, giver);
  }

  /** The gold reaches the neutral, and its goodwill toward `side` grows. */
  private receive(neutral: Player, side: Team, gold: bigint): void {
    neutral.addGold(gold);
    const k = key(neutral.smallID(), side);
    this.goodwill.set(k, (this.goodwill.get(k) ?? 0) + Number(gold));
  }

  /** A neutral played by a person hears of a gift. */
  private tellGift(
    neutral: Player,
    side: Team,
    gold: bigint,
    giver: Player,
  ): void {
    if (neutral.type() !== PlayerType.Human) return;
    this.game.displayMessage(
      M.giftReceived,
      MessageType.DONATION_RECEIVED,
      neutral.id(),
      undefined,
      { name: giver.displayName(), side, gold: renderNumber(gold) },
      undefined,
      giver.id(),
    );
  }

  /** A side's nation invites a neutral to join its side. */
  invite(inviter: Player, neutral: Player): void {
    this.start();
    const side = inviter.team();
    if (side === null || !inviter.isAlive() || !this.isNeutral(neutral)) {
      return;
    }
    const k = key(neutral.smallID(), side);
    const now = this.game.ticks();
    if (now - (this.invitedAt.get(k) ?? -Infinity) < this.inviteCooldown()) {
      return;
    }
    if (this.invites.has(k)) return;
    this.invitedAt.set(k, now);

    if (neutral.type() === PlayerType.Human) {
      // A person answers (the card on their screen).
      this.invites.set(k, [now, inviter.smallID()]);
      this.game.displayMessage(
        M.invited,
        MessageType.ALLIANCE_REQUEST,
        neutral.id(),
        undefined,
        { name: inviter.displayName(), side },
        undefined,
        inviter.id(),
      );
      this.tell(
        inviter,
        M.inviteSent,
        { name: neutral.displayName(), side },
        neutral,
      );
      return;
    }
    const no = this.refusal(neutral, side);
    if (no === null) {
      this.join(neutral, side);
      return;
    }
    this.tell(
      inviter,
      no,
      {
        name: neutral.displayName(),
        side,
        minute: Math.ceil(this.earliestTick(neutral) / TICKS_PER_MINUTE),
      },
      neutral,
    );
  }

  /** The invite cooldown: a minute. */
  private inviteCooldown(): number {
    return DIPLOMACY_TUNING.inviteCooldown;
  }

  /** A neutral asks to join `side`. */
  askToJoin(neutral: Player, side: Team): void {
    this.start();
    if (!this.isNeutral(neutral) || !this.sides().includes(side)) return;
    if (!this.sideAlive(side)) return;
    const k = key(neutral.smallID(), side);
    const now = this.game.ticks();
    if (this.asks.has(k)) return;
    if (
      now - (this.askedAt.get(k) ?? -Infinity) <
      DIPLOMACY_TUNING.askCooldown
    ) {
      return;
    }
    this.askedAt.set(k, now);
    const people = this.people(side);
    if (people.length === 0) {
      this.decideAsk(neutral, side);
      return;
    }
    this.asks.set(k, now);
    for (const p of people) {
      this.game.displayMessage(
        M.asks,
        MessageType.ALLIANCE_REQUEST,
        p.id(),
        undefined,
        { name: neutral.displayName(), side },
        undefined,
        neutral.id(),
      );
    }
    this.tell(neutral, M.askSent, { side }, null);
  }

  /**
   * The computer answers a neutral's ask for its side: yes, unless the
   * side has no nation left in the war (or the neutral is no longer one).
   */
  private decideAsk(neutral: Player, side: Team): void {
    if (this.isNeutral(neutral) && this.sideAlive(side)) {
      this.join(neutral, side);
    } else {
      this.tell(neutral, M.askRefused, { side }, null);
    }
  }

  /**
   * An answer: from a neutral, to the invitation of `other`'s side; from a
   * side's nation, to `other`'s (a neutral's) ask. The first answer decides.
   */
  reply(replier: Player, other: Player, accept: boolean): void {
    if (!replier.isAlive()) return;
    if (replier.team() === null) {
      const side = other.team();
      if (side === null) return;
      const k = key(replier.smallID(), side);
      const open = this.invites.get(k);
      if (open === undefined) return;
      this.invites.delete(k);
      const inviter = this.playerBySmall(open[1]);
      if (accept) {
        if (this.isNeutral(replier) && this.sideAlive(side)) {
          this.join(replier, side);
        }
      } else if (inviter !== null) {
        this.tell(
          inviter,
          M.inviteDeclined,
          { name: replier.displayName(), side },
          replier,
        );
      }
      return;
    }
    const side = replier.team()!;
    const k = key(other.smallID(), side);
    if (!this.asks.has(k)) return;
    this.asks.delete(k);
    if (accept) {
      if (this.isNeutral(other)) this.join(other, side);
    } else {
      this.tell(other, M.askRefused, { side }, null);
    }
  }

  /** A neutral joins `side` for good, and everyone hears. */
  join(neutral: Player, side: Team): void {
    if (!this.isNeutral(neutral)) return;
    neutral.setTeam(side);
    this.forget(neutral.smallID());
    this.game.displayMessage(
      M.joined,
      MessageType.ALLIANCE_ACCEPTED,
      null,
      undefined,
      { name: neutral.displayName(), side },
      undefined,
      neutral.id(),
    );
  }

  /** Drops everything about a neutral that is one no more. */
  private forget(smallID: number): void {
    const prefix = `${smallID}|`;
    for (const m of [
      this.goodwill,
      this.invitedAt,
      this.askedAt,
      this.invites,
      this.asks,
    ] as Map<string, unknown>[]) {
      for (const k of [...m.keys()]) if (k.startsWith(prefix)) m.delete(k);
    }
  }

  private playerBySmall(id: number): Player | null {
    const p = this.game.playerBySmallID(id);
    return p.isPlayer() ? (p as Player) : null;
  }

  /** A message to `to`, if a person plays it. */
  private tell(
    to: Player,
    message: string,
    params: Record<string, string | number>,
    focus: Player | null,
  ): void {
    if (to.type() !== PlayerType.Human) return;
    this.game.displayMessage(
      message,
      message === M.askSent || message === M.inviteSent
        ? MessageType.ALLIANCE_REQUEST
        : MessageType.ALLIANCE_REJECTED,
      to.id(),
      undefined,
      params,
      undefined,
      focus?.id(),
    );
  }

  // --- every tick ---------------------------------------------------------

  tick(): void {
    this.start();
    if (this.started === null) return;
    const t = this.game.ticks();
    if (t % 100 === 0) this.decay();
    if (t % 10 === 0) this.expire(t);
    if (t % RATE_EVERY === 0) {
      this.updateRate();
      this.cleanUp();
    }
    if (DIPLOMACY_TUNING.aiCourts && t % DIPLOMACY_TUNING.aiEvery === 0) {
      this.court();
    }
  }

  private decay(): void {
    for (const [k, g] of this.goodwill) {
      const left = g - Math.ceil((g * DIPLOMACY_TUNING.decayPer10k) / 10_000);
      if (left <= 0) this.goodwill.delete(k);
      else this.goodwill.set(k, left);
    }
  }

  /** Invitations and asks nobody answered in time. */
  private expire(now: number): void {
    for (const [k, [at, inviter]] of [...this.invites]) {
      if (now - at < INVITE_ANSWER_TICKS) continue;
      this.invites.delete(k);
      const [n, side] = this.split(k);
      const from = this.playerBySmall(inviter);
      if (n !== null && from !== null) {
        this.tell(from, M.inviteUnanswered, { name: n.displayName(), side }, n);
      }
    }
    for (const [k, at] of [...this.asks]) {
      if (now - at < ASK_ANSWER_TICKS) continue;
      this.asks.delete(k);
      const [n, side] = this.split(k);
      if (n !== null) this.decideAsk(n, side);
    }
  }

  private split(k: string): [Player | null, Team] {
    const bar = k.indexOf("|");
    return [this.playerBySmall(Number(k.slice(0, bar))), k.slice(bar + 1)];
  }

  /** Forgets neutrals that joined a side some other way (invaded). */
  private cleanUp(): void {
    for (const id of this.size.keys()) {
      const p = this.playerBySmall(id);
      if (p === null || !this.isNeutral(p)) this.forget(id);
    }
  }

  /**
   * Computer-run sides court: each computer-run nation puts a share of its
   * income by; now and then the side gives it to the neutral leaning its way
   * that is nearest to joining, and invites any neutral that is ready.
   */
  private court(): void {
    const t = DIPLOMACY_TUNING;
    const now = this.game.ticks();
    const neutrals = this.neutrals();
    for (const side of this.sides()) {
      const members = this.game
        .players()
        .filter((p) => p.team() === side && p.type() === PlayerType.Nation);
      for (const m of members) {
        const earned = Number(m.goldEarned());
        const prev = this.ai.get(m.smallID());
        let budget = prev === undefined ? 0 : prev[0];
        if (prev !== undefined) {
          budget += Math.floor(
            (Math.max(0, earned - prev[1]) * t.aiSharePerMille) / 1000,
          );
        }
        budget = Math.min(budget, this.rate * t.aiBudgetCapMinutes);
        this.ai.set(m.smallID(), [budget, earned]);
      }
      if (members.length === 0 || neutrals.length === 0) continue;

      // Invite any neutral that is ready (a person's, not too often).
      for (const n of neutrals) {
        if (!this.isNeutral(n) || this.price(n, side) === null) continue;
        if (now < this.earliestTick(n)) continue;
        const g = this.goodwillOf(n, side);
        if (g < (this.price(n, side) ?? Infinity)) continue;
        const k = key(n.smallID(), side);
        const last = this.invitedAt.get(k) ?? -Infinity;
        const wait =
          n.type() === PlayerType.Human
            ? t.aiPersonInviteCooldown
            : t.inviteCooldown;
        if (now - last < wait) continue;
        this.invite(members[0], n);
      }

      // Now and then, a gift to the neutral nearest to joining.
      if (this.random.nextInt(0, t.aiActOutOf) >= t.aiActRounds) continue;
      const minute = this.minute();
      let target: Player | null = null;
      let targetToGo = Infinity;
      for (const n of neutrals) {
        if (!this.isNeutral(n)) continue;
        const nation = this.nation(n);
        if (nation === null) continue;
        if (!COURTED_LEANINGS.includes(leaningOf(nation, side, minute))) {
          continue;
        }
        const price = this.price(n, side);
        if (price === null) continue;
        const toGo = price - this.goodwillOf(n, side);
        if (toGo <= 0) continue;
        if (toGo < targetToGo) {
          target = n;
          targetToGo = toGo;
        }
      }
      if (target === null) continue;
      let total = 0n;
      for (const m of members) {
        const entry = this.ai.get(m.smallID());
        if (entry === undefined) continue;
        const half = Number(m.gold() / 2n);
        const give = Math.min(entry[0], half, targetToGo - Number(total));
        if (give < Math.max(10_000, Math.floor(targetToGo / 100))) continue;
        const removed = m.removeGold(BigInt(give));
        if (removed <= 0n) continue;
        this.receive(target, side, removed);
        this.ai.set(m.smallID(), [entry[0] - Number(removed), entry[1]]);
        total += removed;
      }
      if (total > 0n && target.type() === PlayerType.Human) {
        this.tellGift(target, side, total, members[0]);
      }
    }
  }

  // --- what the client is shown -------------------------------------------

  /** The view of `other` for `viewer` (see ScenarioDiplomacyView). */
  view(viewer: Player, other: Player): ScenarioDiplomacyView | undefined {
    const viewerSide = viewer.team();
    if (this.isNeutral(other)) {
      const v: ScenarioDiplomacyView = { standing: this.standing(other) };
      const early = this.earliestTick(other);
      if (this.game.ticks() < early) {
        v.notBeforeMinute = Math.ceil(early / TICKS_PER_MINUTE);
      }
      if (viewerSide !== null) v.court = this.courtView(viewer, other);
      else if (viewer === other)
        v.ask = this.sides().map((s) => this.askView(viewer, s));
      return v;
    }
    const otherSide = other.team();
    if (this.isNeutral(viewer) && otherSide !== null) {
      return {
        standing: this.standing(viewer),
        ask: [this.askView(viewer, otherSide)],
      };
    }
    return undefined;
  }

  standing(neutral: Player): GoodwillStanding[] {
    const now = this.game.ticks();
    return this.sides().map((side) => {
      const price = this.price(neutral, side);
      if (price === null) return { side, word: "never", percent: 0 };
      const percent = Math.min(100, this.percent(neutral, side, price));
      let word: GoodwillWord;
      if (percent >= 100) {
        word = now >= this.earliestTick(neutral) ? "ready" : "friendly";
      } else if (percent >= 60) word = "friendly";
      else if (percent >= 25) word = "wary";
      else word = "cold";
      return { side, word, percent };
    });
  }

  private courtView(viewer: Player, neutral: Player): ScenarioCourtView {
    const side = viewer.team()!;
    const k = key(neutral.smallID(), side);
    const now = this.game.ticks();
    const cooldown = Math.max(
      0,
      (this.invitedAt.get(k) ?? -Infinity) + this.inviteCooldown() - now,
    );
    const price = this.price(neutral, side);
    return {
      side,
      canGift: viewer.isAlive() && viewer.gold() > 0n,
      canInvite: viewer.isAlive() && cooldown === 0 && !this.invites.has(k),
      inviteCooldown: Number.isFinite(cooldown) ? cooldown : 0,
      goldToGo:
        price === null
          ? 0
          : Math.max(0, price - this.goodwillOf(neutral, side)),
      personNeutral: neutral.type() === PlayerType.Human,
    };
  }

  private askView(neutral: Player, side: Team): ScenarioAskView {
    const k = key(neutral.smallID(), side);
    const now = this.game.ticks();
    const raw =
      (this.askedAt.get(k) ?? -Infinity) + DIPLOMACY_TUNING.askCooldown - now;
    const cooldown = Number.isFinite(raw) ? Math.max(0, raw) : 0;
    const pending = this.asks.has(k);
    return {
      side,
      canAsk:
        this.isNeutral(neutral) &&
        this.sideAlive(side) &&
        cooldown === 0 &&
        !pending,
      cooldown,
      pending,
    };
  }
}

/**
 * The game's courting, when it has any. Kept beside the game (not on it):
 * ScenarioDiplomacyExecution holds the state and registers it here when it
 * starts or is restored, so intents and the client's queries find it.
 */
const DIPLOMACY = new WeakMap<Game, ScenarioDiplomacy>();

export function registerDiplomacy(game: Game, d: ScenarioDiplomacy): void {
  DIPLOMACY.set(game, d);
}

export function scenarioDiplomacy(game: Game): ScenarioDiplomacy | null {
  return DIPLOMACY.get(game) ?? null;
}

/** For the client (GameRunner.playerActions): the courting view, if any. */
export function scenarioDiplomacyView(
  game: Game,
  viewer: Player,
  other: Player,
): ScenarioDiplomacyView | undefined {
  return scenarioDiplomacy(game)?.view(viewer, other);
}
