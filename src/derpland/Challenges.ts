// CHAL (r25): weekly challenges for DerpyFront and Derpy Conquest (none for
// Mr. Based). Shared by the server, which checks and pays them, and the
// pages, which show them: no DOM and no server imports.
//
// The week runs from Monday 00:00 to the next Monday 00:00, New York time
// (so it moves with daylight saving). Each week shows three challenges for
// each game, one easy, one medium and one hard, picked from that game's pools
// by the week's number alone, so everyone gets the same ones; no tier repeats
// the week before or after it. Each pays once per account per week, and
// finishing all three of a game's pays a bonus on top.
//
// The pay is set against the games' own: a good DerpyFront game pays 150 to
// 250 Derp Coins and Conquest pays 200 an hour, so one game's three and its
// bonus (675) come to a few good sessions' worth, never a fortune.
//
// Changing a pool reshuffles the weeks to come (and could change the one
// under way), so add to the pools between weeks, not in the middle of one.

export type ChallengeGame = "derpyfront" | "conquest";
export type ChallengeTier = "easy" | "medium" | "hard";

export const CHALLENGE_GAMES: readonly ChallengeGame[] = [
  "derpyfront",
  "conquest",
];
export const CHALLENGE_TIERS: readonly ChallengeTier[] = [
  "easy",
  "medium",
  "hard",
];

/** Derp Coins each challenge pays, by tier. */
export const CHALLENGE_COINS: Record<ChallengeTier, number> = {
  easy: 100,
  medium: 175,
  hard: 250,
};

/** Derp Coins for finishing all three of a game's challenges in a week. */
export const CHALLENGE_BONUS = 150;

/** The key of a game's bonus as it's kept beside the challenges. */
export const bonusKey = (game: ChallengeGame) => `bonus:${game}`;

/** The time zone the week is kept in. */
export const CHALLENGE_TZ = "America/New_York";

export interface ChallengeDef {
  key: string;
  game: ChallengeGame;
  tier: ChallengeTier;
  name: string;
  /** How it's done, as the pages say it. */
  how: string;
  /** Done at this many (games, minutes, years...). */
  target: number;
  /**
   * Progress is kept in whole parts of one: seconds of a minute (60), days
   * of a year (365). Default 1.
   */
  per?: number;
  /** What's counted, for "2 / 5 games"; none: a single thing to do. */
  unit?: string;
  /**
   * DerpyFront: only for accounts owning a store item it needs (AI
   * personalities); an account without one gets `alt` in its place.
   */
  needs?: "ai-personality";
  alt?: string;
}

/** The progress at which a challenge is done (in its `per`s). */
export const doneAt = (d: ChallengeDef): number => d.target * (d.per ?? 1);

// ---------------------------------------------------------------- the pools

const df = (
  tier: ChallengeTier,
  key: string,
  name: string,
  how: string,
  o: Partial<ChallengeDef> = {},
): ChallengeDef => ({
  key: `df-${key}`,
  game: "derpyfront",
  tier,
  name,
  how,
  target: 1,
  ...o,
});

const cq = (
  tier: ChallengeTier,
  key: string,
  name: string,
  how: string,
  o: Partial<ChallengeDef> = {},
): ChallengeDef => ({
  key: `cq-${key}`,
  game: "conquest",
  tier,
  name,
  how,
  target: 1,
  ...o,
});

/**
 * DerpyFront's, each checked from the game the server saves (DerpyGames):
 * the map, the settings, the winner and each player's stats.
 */
export const FRONT_CHALLENGES: readonly ChallengeDef[] = [
  // ---- easy
  df(
    "easy",
    "play-3",
    "Three games",
    "Play 3 games, at least 5 minutes in each.",
    {
      target: 3,
      unit: "games",
    },
  ),
  df("easy", "win", "A win's a win", "Win a game."),
  df(
    "easy",
    "land-25",
    "A quarter of the map",
    "Hold a quarter of the land at once.",
  ),
  df(
    "easy",
    "gold-1m",
    "Make a million",
    "Earn 1,000,000 gold in one game (donations don't count).",
  ),
  df("easy", "cities-5", "City planner", "Build 5 cities in one game."),
  df("easy", "ports-3", "Harbour master", "Build 3 ports in one game."),
  df(
    "easy",
    "ships-20",
    "Send the fleet",
    "Send 20 ships in one game: trade ships, transports and warships.",
  ),
  df("easy", "factories-3", "Smokestacks", "Build 3 factories in one game."),
  // ---- medium
  df("medium", "win-china", "Win on China", "Win a game on the China map."),
  df("medium", "win-europe", "Win on Europe", "Win a game on the Europe map."),
  df("medium", "win-japan", "Win on Japan", "Win a game on the Japan map."),
  df(
    "medium",
    "win-florida",
    "Win on Florida",
    "Win a game on the Florida (Detailed) map.",
  ),
  df(
    "medium",
    "hvn",
    "Humans vs Nations",
    "Win a Humans vs Nations team game.",
  ),
  df("medium", "team-win", "Team player", "Win a team game."),
  df(
    "medium",
    "third",
    "A third of the world",
    "Finish a game holding a third of the land.",
  ),
  df(
    "medium",
    "play-5-long",
    "Five long games",
    "Play 5 games, at least 10 minutes in each.",
    { target: 5, unit: "games" },
  ),
  df(
    "medium",
    "no-nuke",
    "Clean hands",
    "Win a game of at least 15 minutes without launching a nuke.",
  ),
  df(
    "medium",
    "gold-award",
    "Top earner",
    "Win the Most money made award at the end of a game.",
  ),
  df("medium", "mvp", "Most valuable", "Be named a game's MVP."),
  // ---- hard
  df("hard", "win-hard", "Hard as nails", "Win a game on Hard or Impossible."),
  df("hard", "win-3", "Hat trick", "Win 3 games.", {
    target: 3,
    unit: "wins",
  }),
  df(
    "hard",
    "win-north-america",
    "Win on North America",
    "Win a game on the North America map.",
  ),
  df(
    "hard",
    "ai-win",
    "Personality test",
    "Win a game with AI personalities ticked for the nations.",
    { needs: "ai-personality", alt: "df-win-long" },
  ),
  df(
    "hard",
    "gold-5m",
    "Tycoon",
    "Earn 5,000,000 gold in one game (donations don't count).",
  ),
  df(
    "hard",
    "fast-win",
    "Blitz",
    "Win a game in under 15 minutes, against at least 5 nations.",
  ),
  df(
    "hard",
    "conquer-8",
    "Steamroller",
    "Conquer 8 players or nations in one game (bots don't count).",
  ),
];

/** DerpyFront stand-ins, for an account without what a challenge needs. */
export const FRONT_ALTS: readonly ChallengeDef[] = [
  df(
    "hard",
    "win-long",
    "The long war",
    "Win a game that lasts at least 25 minutes.",
  ),
];

/**
 * Derpy Conquest's, each checked on the server from the game as it's played
 * (ConquestChallenges): what's done while you're at the table this week
 * counts, the way time at the table pays.
 */
export const CONQUEST_CHALLENGES: readonly ChallengeDef[] = [
  // ---- easy
  cq("easy", "work", "An honest living", "Take up a trade."),
  cq("easy", "promoted", "Up a rung", "Win a promotion at your work."),
  cq(
    "easy",
    "places-5",
    "See the country",
    "Visit 5 places your line has never been.",
    { target: 5, unit: "places" },
  ),
  cq("easy", "hour", "An evening's play", "Play for an hour at the table.", {
    target: 60,
    per: 60,
    unit: "min",
  }),
  cq("easy", "sea", "Sea legs", "Spend 10 days at sea.", {
    target: 10,
    unit: "days",
  }),
  cq(
    "easy",
    "earn-100",
    "Earn your keep",
    "Earn 100 coins (wages, sales, takings).",
    { target: 100, unit: "coins" },
  ),
  cq("easy", "friends-2", "Good company", "Make 2 new friends.", {
    target: 2,
    unit: "friends",
  }),
  // ---- medium
  cq("medium", "marry", "Wedding bells", "Marry."),
  cq("medium", "child", "A new arrival", "Have a child."),
  cq(
    "medium",
    "rung-3",
    "Third rung",
    "Reach the third rung of a trade's ladder.",
  ),
  cq(
    "medium",
    "two-biz",
    "Two concerns",
    "Own two businesses at once, at least one of them got this week.",
    { target: 2, unit: "businesses" },
  ),
  cq("medium", "battle", "Victory", "Win a battle."),
  cq("medium", "two-hours", "A long sitting", "Play 2 hours at the table.", {
    target: 120,
    per: 60,
    unit: "min",
  }),
  cq(
    "medium",
    "coins-150",
    "A good sitting",
    "Earn 150 Derp Coins in one game.",
    { target: 150, unit: "coins" },
  ),
  cq(
    "medium",
    "renown-25",
    "Talk of the town",
    "Gain 25 renown with one character.",
    { target: 25, unit: "renown" },
  ),
  // ---- hard
  cq("hard", "30-years", "Thirty years", "Live 30 years with one character.", {
    target: 30,
    per: 365,
    unit: "years",
  }),
  cq(
    "hard",
    "retake",
    "For the crown",
    "Retake a town for your crown: march with the army that wins it back, or bring the crown's regiments to do it.",
  ),
  cq(
    "hard",
    "election",
    "Elected",
    "Win an election to an assembly or council.",
  ),
  cq(
    "hard",
    "heir",
    "The next generation",
    "Carry your line on: an heir takes up where your character left off.",
  ),
  cq(
    "hard",
    "coins-400",
    "A great sitting",
    "Earn 400 Derp Coins in one game.",
    { target: 400, unit: "coins" },
  ),
  cq(
    "hard",
    "savings-250",
    "Money put by",
    "Grow one character's purse by 250 coins.",
    { target: 250, unit: "coins" },
  ),
  cq(
    "hard",
    "three-hours",
    "Burning the candle",
    "Play 3 hours at the table.",
    { target: 180, per: 60, unit: "min" },
  ),
];

/** Every challenge and stand-in, by key. */
export const CHALLENGE_BY_KEY: ReadonlyMap<string, ChallengeDef> = new Map(
  [...FRONT_CHALLENGES, ...FRONT_ALTS, ...CONQUEST_CHALLENGES].map((d) => [
    d.key,
    d,
  ]),
);

export const poolOf = (game: ChallengeGame): readonly ChallengeDef[] =>
  game === "derpyfront" ? FRONT_CHALLENGES : CONQUEST_CHALLENGES;

// ---------------------------------------------------------------- the week

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

let wallFormat: Intl.DateTimeFormat | null = null;

/** The New York wall clock at `ms`, written as if it were UTC (to the second). */
function wallClock(ms: number): number {
  wallFormat ??= new Intl.DateTimeFormat("en-US", {
    timeZone: CHALLENGE_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const p: Record<string, number> = {};
  for (const x of wallFormat.formatToParts(new Date(ms)))
    if (x.type !== "literal") p[x.type] = Number(x.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
}

/** New York's offset from UTC at `ms` (in ms: -4 h in summer, -5 h in winter). */
function offsetAt(ms: number): number {
  return wallClock(ms) - Math.floor(ms / 1000) * 1000;
}

/** The instant a New York wall-clock time (written as UTC) happens. */
function wallToInstant(wall: number): number {
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t);
  return t;
}

/**
 * The challenge week `ms` falls in: whole weeks since the Monday before
 * 1 January 1970, counted on New York's calendar.
 */
export function weekOf(ms: number): number {
  const day = Math.floor(wallClock(ms) / DAY_MS);
  // 1 January 1970 was a Thursday, three days after a Monday.
  return Math.floor((day + 3) / 7);
}

/** When a week begins: its Monday, 00:00 in New York. */
export function weekStart(week: number): number {
  return wallToInstant(week * WEEK_MS - 3 * DAY_MS);
}

/** When a week ends (the next one's Monday, 00:00 in New York). */
export function weekEnd(week: number): number {
  return weekStart(week + 1);
}

/** The week's Monday as a date: "2026-10-19". */
export function weekMonday(week: number): string {
  return new Date(week * WEEK_MS - 3 * DAY_MS).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- the picks

/** FNV-1a: a string's 32-bit hash. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A shuffle of 0..n-1, the same for the same seed (mulberry32). */
function shuffled(n: number, seed: number): number[] {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The tier's challenge in a week. Each run of n weeks (n the tier's pool)
 * deals the whole pool once, shuffled anew for every run, so a tier never
 * repeats itself inside a run; where one run meets the next, the first of
 * the new run is never the last of the old.
 */
function pickTier(
  week: number,
  game: ChallengeGame,
  tier: ChallengeTier,
): ChallengeDef {
  const pool = poolOf(game).filter((d) => d.tier === tier);
  const n = pool.length;
  const run = Math.floor(week / n);
  const at = week - run * n;
  return pool[runOrder(n, game, tier, run)[at]];
}

/**
 * A run's order: its shuffle, with its first two swapped if the first is
 * the last run's last (whose own swap, of its first two, can't move its
 * last: every tier has more than two).
 */
function runOrder(
  n: number,
  game: ChallengeGame,
  tier: ChallengeTier,
  run: number,
): number[] {
  const order = shuffled(n, hash(`${game}:${tier}:${run}`));
  if (n > 2) {
    const before = shuffled(n, hash(`${game}:${tier}:${run - 1}`))[n - 1];
    if (order[0] === before) [order[0], order[1]] = [order[1], order[0]];
  }
  return order;
}

/** A game's three challenges in a week (easy, medium, hard), the same for everyone. */
export function weekChallenges(
  week: number,
  game: ChallengeGame,
): ChallengeDef[] {
  return CHALLENGE_TIERS.map((t) => pickTier(week, game, t));
}

/** What an account has that a challenge may need. */
export interface ChallengeOwned {
  aiPersonality: boolean;
}

/**
 * A game's challenges for one account: the week's, with a stand-in for any
 * that needs what the account doesn't own (so none is out of its reach).
 */
export function challengesFor(
  week: number,
  game: ChallengeGame,
  owned: ChallengeOwned,
): ChallengeDef[] {
  return weekChallenges(week, game).map((d) =>
    d.needs === "ai-personality" && !owned.aiPersonality && d.alt
      ? (CHALLENGE_BY_KEY.get(d.alt) ?? d)
      : d,
  );
}

// ---------------------------------------------------------------- what the pages are sent

/** One challenge as an account stands with it. */
export interface ChallengeView {
  key: string;
  tier: ChallengeTier;
  name: string;
  how: string;
  coins: number;
  /** Progress and the mark, in whole units ("2 of 5 games"). */
  have: number;
  of: number;
  unit?: string;
  /** When it was done (ISO), or null. */
  doneAt: string | null;
}

export interface ChallengeGameView {
  game: ChallengeGame;
  challenges: ChallengeView[];
  bonus: { coins: number; doneAt: string | null };
}

/** The week as the pages show it. */
export interface WeekView {
  week: number;
  /** ISO: Monday 00:00 New York, and the next Monday. */
  startsAt: string;
  endsAt: string;
  /** The server's clock, so a page can count down whatever its own says. */
  serverTime: number;
  /** Signed in: progress is the account's own. */
  signedIn: boolean;
  games: ChallengeGameView[];
}

/** A past week on a profile: what was done in it. */
export interface WeekHistory {
  week: number;
  startsAt: string;
  done: { key: string; name: string; game: ChallengeGame; coins: number }[];
  coins: number;
}

/** A player's challenges on their profile: this week's, and the last few. */
export interface PlayerChallenges {
  username: string;
  week: WeekView;
  history: WeekHistory[];
}

/** One done in a game, for its end screen. */
export interface ChallengeDone {
  key: string;
  name: string;
  coins: number;
  /** The game's bonus came with it. */
  bonus?: number;
}

/** Whole units of progress (rounded down) and the mark. */
export function progressUnits(
  d: ChallengeDef,
  progress: number,
): { have: number; of: number } {
  const per = d.per ?? 1;
  return {
    have: Math.min(d.target, Math.floor(progress / per)),
    of: d.target,
  };
}

/** "3 days 4 h left", "5 h 12 min left", "12 min left". */
export function timeLeftWords(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(min / 1440);
  const hours = Math.floor((min % 1440) / 60);
  const mins = min % 60;
  if (days > 0)
    return `${days} day${days === 1 ? "" : "s"}${hours ? ` ${hours} h` : ""} left`;
  if (hours > 0) return `${hours} h${mins ? ` ${mins} min` : ""} left`;
  return mins > 0 ? `${mins} min left` : "Ending now";
}
