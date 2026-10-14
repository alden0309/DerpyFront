// LEGACY (r21): Derp Coins as you play Derpy Conquest.
//
// Time at the table pays PLAY_PAY.perMinute, and the line's coins (Coins.ts)
// are paid as each is reached, up to PLAY_PAY.linesPerHour for every hour at
// the table, so a game nobody finishes still pays. Both run on the server's
// real clock, never the game's, which is what keeps them from being farmed:
// - pausing: only the first PLAY_PAY.pausedMinutes of each stop count, and
//   nothing is paid until the world has moved on;
// - skipping ahead: pays by the minute, like any other minute (a year
//   skipped through in eighteen seconds is eighteen seconds);
// - stepping away: a minute counts only if the player has made a choice of
//   their own (anything they do, a letter answered) lately;
// - two games (or two seats) at once: an account counts for one seat at a
//   time, wherever it last made a choice;
// - starting game after game: the line's coins in a game are held to the
//   time played in it.
// Paid about once a real minute, once the world has moved on, into the
// account and onto the game's row (derpy_conquest_play), all in one
// transaction; the end of the game pays the rest (ConquestRooms.finishRoom).

import {
  countsAtTable,
  lifeCoins,
  linesDue,
  timeCoins,
} from "../../conquest/engine/Coins";
import { lifeOfSeat } from "../../conquest/engine/LifeQueries";
import type { GameState } from "../../conquest/engine/Types";
import type { PayNote } from "../../conquest/Protocol";
import { payInPlay, playRow } from "../derpy/DerpyConquest";
import { derpyDbConfigured } from "../derpy/DerpyDb";

/** Real milliseconds between payments (at most). */
export const PAY_EVERY_MS = 60_000;

/** A seat's pay in one game. */
export interface SeatPay {
  gameId: string;
  accountId: number;
  /** As the database has it: seconds at the table paid for, coins for them, the line's coins. */
  secs: number;
  play: number;
  lines: number;
  /** Seconds at the table counted since. */
  owed: number;
  /** When it was last paid (real ms), and the game's day then. */
  at: number;
  day: number;
  /** The line's coins, line by line, at the last payment (to say which grew). */
  shown: Record<string, number>;
  /** Loaded from the database. */
  ready: boolean;
  busy: Promise<void> | null;
}

/** What a room must offer (ConquestRooms' rooms do). */
export interface PayRoom {
  code: string;
  saveId: string | null;
  paused: boolean;
  /** When the clock last stopped (real ms), or null while it runs. */
  pausedAt: number | null;
  game: { state: GameState } | null;
  seats: PaySeat[];
}

/** What a seat must offer. */
export interface PaySeat {
  id: string;
  accountId: number | null;
  conn: object | null;
  pay?: SeatPay;
}

export class TablePay {
  /** Each account's last choice: when, and in which room and seat (only that seat's time counts). */
  private readonly choices = new Map<
    number,
    { at: number; room: string; seat: string }
  >();

  constructor(
    private readonly now: () => number,
    private readonly tell: (seat: PaySeat, note: PayNote) => void,
    private readonly warn: (msg: string) => void,
  ) {}

  /** A choice of the player's own: a command (a letter answered too), or a new character. */
  choice(room: PayRoom, seat: PaySeat): void {
    if (seat.accountId === null) return;
    this.choices.set(seat.accountId, {
      at: this.now(),
      room: room.code,
      seat: seat.id,
    });
  }

  /** Milliseconds since an account's last choice in this seat (Infinity: none, or elsewhere). */
  sinceChoice(room: PayRoom, seat: PaySeat): number {
    if (seat.accountId === null) return Infinity;
    const c = this.choices.get(seat.accountId);
    return c && c.room === room.code && c.seat === seat.id
      ? this.now() - c.at
      : Infinity;
  }

  /** The seat's pay in this game, loaded from the database the first time (a guest's, or with no database: none). */
  ready(room: PayRoom, seat: PaySeat): SeatPay | null {
    if (seat.accountId === null || !room.saveId || !derpyDbConfigured())
      return null;
    const had = seat.pay;
    if (had && had.gameId === room.saveId && had.accountId === seat.accountId)
      return had;
    const life = room.game ? lifeOfSeat(room.game.state, seat.id) : undefined;
    const p: SeatPay = {
      gameId: room.saveId,
      accountId: seat.accountId,
      secs: 0,
      play: 0,
      lines: 0,
      owed: 0,
      at: this.now(),
      day: room.game?.state.day ?? 0,
      shown: life ? linesNow(life) : {},
      ready: false,
      busy: null,
    };
    seat.pay = p;
    p.busy = playRow(p.gameId, p.accountId)
      .then((row) => {
        p.secs = row.secs;
        p.play = row.play;
        p.lines = row.lines;
        p.ready = true;
        this.note(room, seat, p, 0, 0, []);
      })
      .catch((err) => this.warn(`couldn't read pay for ${p.gameId}: ${err}`))
      .finally(() => {
        p.busy = null;
      });
    return p;
  }

  /** `dt` real milliseconds in a room: counted for every seat they count for. */
  count(room: PayRoom, dt: number): void {
    const g = room.game;
    if (!g || g.state.over || dt <= 0) return;
    const t = this.now();
    for (const seat of room.seats) {
      if (seat.accountId === null || !seat.conn) continue;
      const since = this.sinceChoice(room, seat);
      if (since === Infinity) continue;
      const life = lifeOfSeat(g.state, seat.id);
      const counts = countsAtTable({
        living: !!life && life.c >= 0 && !life.watching,
        sinceChoice: since,
        paused: room.paused,
        pausedFor: room.pausedAt === null ? 0 : t - room.pausedAt,
      });
      if (!counts) continue;
      const p = this.ready(room, seat);
      if (p) p.owed += dt / 1000;
    }
  }

  /**
   * Pays a seat what it's owed: about once a real minute, once the world has
   * moved on since the last payment; or now (`force`: leaving, the end).
   */
  settle(room: PayRoom, seat: PaySeat, force = false): Promise<void> {
    const p = seat.pay;
    const g = room.game;
    if (!p || !g) return Promise.resolve();
    if (p.busy)
      return force ? p.busy.then(() => this.settle(room, seat, true)) : p.busy;
    if (!p.ready) return Promise.resolve();
    const t = this.now();
    if (!force && (t - p.at < PAY_EVERY_MS || g.state.day <= p.day))
      return Promise.resolve();
    const life = lifeOfSeat(g.state, seat.id);
    const owed = p.owed;
    const secs = p.secs + owed;
    const time = Math.max(0, Math.floor(timeCoins(secs)) - p.play);
    const lines = life ? linesDue(life, secs, p.lines).due : 0;
    const day = g.state.day;
    if (time === 0 && lines === 0 && owed < 1) {
      p.at = t;
      p.day = day;
      return Promise.resolve();
    }
    const now = life ? linesNow(life) : p.shown;
    const grew =
      lines > 0
        ? Object.keys(now).filter((k) => now[k] > (p.shown[k] ?? 0))
        : [];
    p.busy = payInPlay(p.gameId, p.accountId, { play: time, lines, secs: owed })
      .then((row) => {
        p.owed -= owed;
        p.secs = row.secs;
        p.play = row.play;
        p.lines = row.lines;
        p.at = t;
        p.day = day;
        if (lines > 0) p.shown = now;
        this.note(room, seat, p, time, lines, grew);
      })
      .catch((err) => this.warn(`couldn't pay for ${p.gameId}: ${err}`))
      .finally(() => {
        p.busy = null;
      });
    return p.busy;
  }

  /** Every seat in a room paid what it's owed now (the end, a shutdown). */
  settleAll(room: PayRoom): Promise<unknown> {
    return Promise.all(room.seats.map((s) => this.settle(room, s, true)));
  }

  /** The player is told: what was just paid, and where they stand in this game. */
  private note(
    room: PayRoom,
    seat: PaySeat,
    p: SeatPay,
    time: number,
    lines: number,
    grew: string[],
  ): void {
    const life = room.game ? lifeOfSeat(room.game.state, seat.id) : undefined;
    const held = life ? linesDue(life, p.secs + p.owed, p.lines).held : 0;
    this.tell(seat, {
      t: "paid",
      signedIn: true,
      time,
      lines,
      grew,
      play: p.play,
      linePaid: p.lines,
      minutes: Math.floor(p.secs / 60),
      held,
    });
  }

  /** What a guest is told when they sit down: they'd be paid if they signed in. */
  static guestNote(): PayNote {
    return {
      t: "paid",
      signedIn: false,
      time: 0,
      lines: 0,
      grew: [],
      play: 0,
      linePaid: 0,
      minutes: 0,
      held: 0,
    };
  }
}

/** The line's coins as they stand, by line (without 1776). */
function linesNow(
  life: Parameters<typeof lifeCoins>[0],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lifeCoins(life, false).lines)
    out[l.line.replace(/^\d+ /, "")] = l.coins;
  return out;
}
