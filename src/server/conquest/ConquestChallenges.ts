// CHAL (r25): Derpy Conquest's weekly challenges, watched on the server as
// each game is played (the server runs every game, so nothing rests on a
// player's word). Each seat's look at the week's three is taken as the world
// is sent out (ConquestRooms.flush): what each measures (a count kept in the
// game, the line's tallies, time at the table, the coins the game has paid)
// when the seat first sits down this week is where it starts, and what it
// gains from there counts.
//
// The coin rules' guards hold here too (ConquestPay):
// - a gain counts only at a moment that counts at the table: a choice of the
//   player's own lately, the clock running (or not stopped for long), and
//   this seat, where the account last chose (one seat at a time). What the
//   world does while you're away isn't yours;
// - nothing is reported until the seat has had CHALLENGE_MIN_TABLE_SECS at
//   the table in that game;
// - the game, not the browser, is the record, so reloading or replaying a
//   save starts again from where it stands.
// Progress goes to the database (DerpyChallenges) about every half minute,
// at once when something reaches its mark; the database pays it, once.

import { achCount, RETOOK_COUNT } from "../../conquest/engine/Achievements";
import type { ConquestGame } from "../../conquest/engine/Game";
import type { Life } from "../../conquest/engine/Types";
import { RUNG3_COUNT } from "../../conquest/engine/Work";
import {
  doneAt,
  weekChallenges,
  weekOf,
  type ChallengeDef,
  type ChallengeDone,
} from "../../derpland/Challenges";
import type { ChallengeStep, GameProgress } from "../derpy/DerpyChallenges";

/** Seconds at the table a seat must have in a game before it counts for challenges. */
export const CHALLENGE_MIN_TABLE_SECS = 600;

/** Real milliseconds between reports of progress (unless something is done). */
export const REPORT_EVERY_MS = 30_000;

/** What the server knows of a seat at a look. */
export interface ChallengeLook {
  g: ConquestGame;
  life: Life;
  /** This moment counts at the table (ConquestPay's rules). */
  counting: boolean;
  /** Seconds at the table in this game that counted, and the Derp Coins it has paid while played. */
  tableSecs: number;
  coins: number;
}

interface Measure {
  read: (x: ChallengeLook) => number;
  /** Done in one game: the game's own gain counts (the most of any game). */
  best?: true;
  /** Done with one character (so in one game too): a new character starts from nothing. */
  perCharacter?: true;
  /** The measure itself, once it has risen this week (owning two businesses). */
  reach?: true;
}

const friendsOf = (l: Life) =>
  Object.values(l.ties).filter((t) => t === "friend").length;
const businessesOf = (l: Life) =>
  (l.property ?? []).filter((p) => p.kind === "business").length;
/** Parts of the line begun by an heir (LEGACY r21's records, and the one played now). */
const heirsOf = (l: Life) =>
  (l.legacy?.recs ?? []).filter((r) => r.came === "heir").length +
  (l.legacy?.came === "heir" ? 1 : 0);

/** What each Derpy Conquest challenge measures. */
export const CONQUEST_MEASURES: Record<string, Measure> = {
  "cq-work": { read: (x) => x.life.tally.jobs },
  "cq-promoted": { read: (x) => x.life.tally.promotions },
  "cq-places-5": { read: (x) => x.life.visited.length },
  "cq-hour": { read: (x) => Math.floor(x.tableSecs) },
  "cq-sea": { read: (x) => achCount(x.life, "sea") },
  "cq-earn-100": { read: (x) => Math.floor(x.life.tally.earned) },
  "cq-friends-2": { read: (x) => friendsOf(x.life), perCharacter: true },
  "cq-marry": { read: (x) => x.life.tally.marriages },
  "cq-child": { read: (x) => x.life.tally.children },
  "cq-rung-3": { read: (x) => achCount(x.life, RUNG3_COUNT) },
  "cq-two-biz": { read: (x) => businessesOf(x.life), reach: true },
  "cq-battle": { read: (x) => x.life.tally.battlesWon },
  "cq-two-hours": { read: (x) => Math.floor(x.tableSecs) },
  "cq-coins-150": { read: (x) => Math.floor(x.coins), best: true },
  "cq-renown-25": {
    read: (x) => Math.floor(x.life.renown),
    perCharacter: true,
  },
  // Days go by: with one character, at the table.
  "cq-30-years": { read: (x) => x.g.s.day, perCharacter: true },
  "cq-retake": { read: (x) => achCount(x.life, RETOOK_COUNT) },
  "cq-election": { read: (x) => x.life.tally.elections },
  "cq-heir": { read: (x) => heirsOf(x.life) },
  "cq-coins-400": { read: (x) => Math.floor(x.coins), best: true },
  "cq-savings-250": {
    read: (x) => Math.floor(x.life.purse),
    perCharacter: true,
  },
  "cq-three-hours": { read: (x) => Math.floor(x.tableSecs) },
};

/** One challenge as a seat stands with it in a game. */
interface Track {
  /** The measure where counting began (moved up by what rose while it didn't count), and its most since. */
  base: number;
  peak: number;
  /** It rose at a moment that counted. */
  rose: boolean;
  /** With one character: the best of the characters before this one, in this game. */
  charBest: number;
  /** With one character: what the one playing now had already done here (a game picked up again). */
  carried: number;
}

/** A seat's challenges in one game in one week. */
export interface SeatChallenges {
  id: string;
  week: number;
  defs: ChallengeDef[];
  /** The character played at the last look. */
  c: number;
  tracks: Map<string, Track>;
  /** What the game had done before (challenges done in one game); null while it's read. */
  prior: Map<string, GameProgress> | null;
  /** Progress the database has (in this track's terms). */
  sent: Map<string, number>;
  sentAt: number;
  busy: Promise<void> | null;
}

/** A seat, as the challenges see it. */
export interface ChallengeSeat {
  accountId: number | null;
  chal?: SeatChallenges;
}

export interface ChallengeDeps {
  now: () => number;
  /** Records progress (DerpyChallenges.conquestChallengeProgress): what it newly finished. */
  record: (
    accountId: number,
    week: number,
    steps: ChallengeStep[],
    gameId: string,
  ) => Promise<ChallengeDone[]>;
  /** What a game had done already this week (DerpyChallenges.conquestGameProgress). */
  load: (
    accountId: number,
    week: number,
    gameId: string,
  ) => Promise<Map<string, GameProgress>>;
  /** The player is told what they finished. */
  tell: (seat: ChallengeSeat, done: ChallengeDone[]) => void;
  warn: (msg: string) => void;
}

export class ConquestChallenges {
  constructor(private readonly deps: ChallengeDeps) {}

  /**
   * Looks at a seat in a game: its measures, and (now and then) its
   * progress sent on. `force`: sent now if there's any (the end of a game).
   */
  look(
    seat: ChallengeSeat,
    gameId: string,
    x: ChallengeLook,
    force = false,
  ): void {
    const accountId = seat.accountId;
    if (accountId === null || x.life.watching || x.life.c < 0) return;
    const now = this.deps.now();
    const week = weekOf(now);
    const id = `${week}:${accountId}:${gameId}`;
    let s = seat.chal;
    if (!s || s.id !== id) {
      s = this.begin(id, week, accountId, gameId, x);
      seat.chal = s;
      return;
    }
    this.observe(s, x);
    if (s.prior === null || s.busy) return;
    if (x.tableSecs < CHALLENGE_MIN_TABLE_SECS) return;
    const steps: ChallengeStep[] = [];
    let finishing = false;
    for (const d of s.defs) {
      const step = this.stepOf(s, d, x.life.c);
      if (!step) continue;
      const value = step.best ?? (s.sent.get(d.key) ?? 0) + (step.add ?? 0);
      if (value >= doneAt(d)) finishing = true;
      steps.push(step);
    }
    if (!steps.length) return;
    if (!force && !finishing && now - s.sentAt < REPORT_EVERY_MS) return;
    s.sentAt = now;
    const sending = steps.map(
      (st) =>
        [st.key, st.best ?? (s.sent.get(st.key) ?? 0) + (st.add ?? 0)] as const,
    );
    const track = s;
    track.busy = this.deps
      .record(accountId, week, steps, gameId)
      .then((done) => {
        for (const [k, v] of sending) track.sent.set(k, v);
        if (done.length) this.deps.tell(seat, done);
      })
      .catch((err) => this.deps.warn(`couldn't record challenges: ${err}`))
      .finally(() => {
        track.busy = null;
      });
  }

  /** Waits for a seat's progress being sent (the end of a game). */
  settled(seat: ChallengeSeat): Promise<void> {
    return seat.chal?.busy ?? Promise.resolve();
  }

  /** The first look this week in this game: where each measure starts. */
  private begin(
    id: string,
    week: number,
    accountId: number,
    gameId: string,
    x: ChallengeLook,
  ): SeatChallenges {
    const defs = weekChallenges(week, "conquest");
    const tracks = new Map<string, Track>();
    for (const d of defs) {
      const v = CONQUEST_MEASURES[d.key]?.read(x) ?? 0;
      tracks.set(d.key, {
        base: v,
        peak: v,
        rose: false,
        charBest: 0,
        carried: 0,
      });
    }
    const s: SeatChallenges = {
      id,
      week,
      defs,
      c: x.life.c,
      tracks,
      prior: null,
      sent: new Map(),
      sentAt: 0,
      busy: null,
    };
    const c = x.life.c;
    s.busy = this.deps
      .load(accountId, week, gameId)
      .then((prior) => {
        s.prior = prior;
        // With one character: carry on from what they'd done here before.
        for (const d of defs) {
          const p = prior.get(d.key);
          const t = tracks.get(d.key)!;
          if (p && CONQUEST_MEASURES[d.key]?.perCharacter && p.c === c)
            t.carried = s.c === c ? p.q : 0;
        }
      })
      .catch((err) => {
        s.prior = new Map();
        this.deps.warn(`couldn't read a game's challenges: ${err}`);
      })
      .finally(() => {
        s.busy = null;
      });
    return s;
  }

  /** The measures now: what rose at a moment that counted is gained. */
  private observe(s: SeatChallenges, x: ChallengeLook): void {
    const changed = x.life.c !== s.c;
    for (const d of s.defs) {
      const m = CONQUEST_MEASURES[d.key];
      const t = s.tracks.get(d.key);
      if (!m || !t) continue;
      const v = m.read(x);
      if (m.perCharacter && changed) {
        // A new character: the last one's part is kept, and this one begins.
        t.charBest = Math.max(t.charBest, t.carried + t.peak - t.base);
        t.carried = 0;
        t.base = t.peak = v;
        continue;
      }
      if (v <= t.peak) continue;
      if (x.counting) {
        t.peak = v;
        t.rose = true;
      } else {
        // Risen while it didn't count: none of it is the player's.
        t.base += v - t.peak;
        t.peak = v;
      }
    }
    s.c = x.life.c;
  }

  /** What to send for a challenge now (null: nothing new). */
  private stepOf(
    s: SeatChallenges,
    d: ChallengeDef,
    c: number,
  ): ChallengeStep | null {
    const m = CONQUEST_MEASURES[d.key];
    const t = s.tracks.get(d.key);
    if (!m || !t) return null;
    const sent = s.sent.get(d.key) ?? 0;
    const prior = s.prior?.get(d.key);
    const mark = doneAt(d);
    if (m.reach) {
      const best = t.rose ? Math.min(t.peak, mark) : Math.min(t.peak, mark - 1);
      return best > sent && best > (prior?.p ?? 0)
        ? { key: d.key, best }
        : null;
    }
    const gain = t.peak - t.base;
    if (m.perCharacter) {
      const q = t.carried + gain;
      const best = Math.max(prior?.p ?? 0, t.charBest, q);
      return best > sent && (best > (prior?.p ?? 0) || q > (prior?.q ?? 0))
        ? { key: d.key, best, c, q }
        : null;
    }
    if (m.best) {
      const best = (prior?.p ?? 0) + gain;
      return best > sent && gain > 0 ? { key: d.key, best } : null;
    }
    return gain > sent ? { key: d.key, add: gain - sent } : null;
  }
}
