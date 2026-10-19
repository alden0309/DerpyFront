// CHAL (r25): weekly challenges, kept and paid. Each account's progress on
// each of the week's challenges is a row (derpy_challenges); a challenge is
// paid, once, in the transaction that first takes it to its mark, and the
// game's bonus is paid with the third. Everything goes by account id, so a
// rename changes nothing here.
//
// DerpyFront's are checked from the game the server saves (recordDerpyGame
// hands each credited account's line here). A game counts only if it was a
// real one, by the rules that pay coins and a few more: long enough to pay
// (DERP_COINS_MIN_GAME_SECONDS), the player spawned, no cheats, someone to
// play against, and not played at the same time as another game that
// counted (one seat at a time; derpy_challenge_games keeps the times).
//
// Derpy Conquest's are checked on the server as the game is played
// (server/conquest/ConquestChallenges.ts) and land here as progress.

import {
  Difficulty,
  GameMapType,
  GameMode,
  HumansVsNations,
} from "@openfront/engine-api/game/GameTypes";
import { maps } from "@openfront/engine-api/game/Maps.gen";
import {
  OTHER_INDEX_BUILT,
  type OtherUnit,
  type PlayerStats,
} from "@openfront/engine-api/StatsSchemas";
import {
  DERP_COINS_MIN_GAME_SECONDS,
  peakTilesFromStats,
} from "@openfront/shared/DerpCoins";
import type { GameRecord, PlayerRecord } from "@openfront/shared/WireSchemas";
import type pg from "pg";
import {
  bonusKey,
  CHALLENGE_BONUS,
  CHALLENGE_BY_KEY,
  CHALLENGE_COINS,
  CHALLENGE_GAMES,
  challengesFor,
  doneAt,
  progressUnits,
  weekMonday,
  weekOf,
  weekStart,
  type ChallengeDef,
  type ChallengeDone,
  type ChallengeGame,
  type ChallengeGameView,
  type ChallengeOwned,
  type PlayerChallenges,
  type WeekHistory,
  type WeekView,
} from "../../derpland/Challenges";
import { logger } from "../Logger";
import { PERSONALITY_GRANTS } from "./DerpyCatalog";
import { db, derpyDbConfigured, inTransaction } from "./DerpyDb";
import { heldSince } from "./DerpyNames";

const log = logger.child({ component: "DerpyChallenges" });

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

/**
 * Challenges are checked and paid unless DERPY_CHALLENGES is "off" (the
 * test suite's default, so a game's coins there don't depend on the week).
 */
export function challengesOn(): boolean {
  return process.env.DERPY_CHALLENGES !== "off";
}

// ---------------------------------------------------------------- progress and pay

/** Progress to add to a challenge: `add` more (summed), or `best` (the most in one game). */
export interface ChallengeStep {
  key: string;
  add?: number;
  best?: number;
}

/** What an account owns that a challenge may need. */
export async function challengeOwned(
  q: Queryable,
  accountId: number,
): Promise<ChallengeOwned> {
  const r = await q.query(
    `SELECT 1 FROM derpy_owned WHERE account_id = $1 AND item = ANY($2::text[])
     LIMIT 1`,
    [accountId, [...PERSONALITY_GRANTS]],
  );
  return { aiPersonality: (r.rowCount ?? 0) > 0 };
}

/**
 * Adds progress for an account in a week, inside a transaction: each step's
 * row is locked, moved on, and paid the first time it reaches its mark (the
 * game's bonus with the last of its three). Steps for challenges that aren't
 * the account's this week are ignored. Returns what was newly done.
 */
export async function stepChallenges(
  c: pg.PoolClient,
  accountId: number,
  week: number,
  game: ChallengeGame,
  steps: ChallengeStep[],
  gameId: string | null,
  owned?: ChallengeOwned,
): Promise<ChallengeDone[]> {
  const mine = challengesFor(
    week,
    game,
    owned ?? (await challengeOwned(c, accountId)),
  );
  const done: ChallengeDone[] = [];
  for (const step of steps) {
    const def = mine.find((d) => d.key === step.key);
    if (!def) continue;
    const add = Math.max(0, Math.floor(step.add ?? 0));
    const best = Math.max(0, Math.floor(step.best ?? 0));
    if (add === 0 && best === 0) continue;
    await c.query(
      `INSERT INTO derpy_challenges (account_id, week, key) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [accountId, week, def.key],
    );
    const row = (
      await c.query(
        `SELECT progress, done_at FROM derpy_challenges
         WHERE account_id = $1 AND week = $2 AND key = $3 FOR UPDATE`,
        [accountId, week, def.key],
      )
    ).rows[0];
    const was = Number(row.progress);
    const now = Math.max(was + add, best);
    if (now === was) continue;
    const finishes = row.done_at === null && now >= doneAt(def);
    const coins = finishes ? CHALLENGE_COINS[def.tier] : 0;
    await c.query(
      `UPDATE derpy_challenges SET progress = $4, updated_at = now()
         ${finishes ? ", done_at = now(), coins = $5, game_id = $6" : ""}
       WHERE account_id = $1 AND week = $2 AND key = $3`,
      finishes
        ? [accountId, week, def.key, now, coins, gameId]
        : [accountId, week, def.key, now],
    );
    if (!finishes) continue;
    await pay(c, accountId, coins);
    log.info("challenge", { accountId, week, key: def.key, coins });
    const entry: ChallengeDone = { key: def.key, name: def.name, coins };
    done.push(entry);
    // The third of the game's: its bonus, once.
    const count = Number(
      (
        await c.query(
          `SELECT count(*)::int AS n FROM derpy_challenges
           WHERE account_id = $1 AND week = $2 AND key = ANY($3::text[])
             AND done_at IS NOT NULL`,
          [accountId, week, mine.map((d) => d.key)],
        )
      ).rows[0].n,
    );
    if (count < mine.length) continue;
    const bonus = await c.query(
      `INSERT INTO derpy_challenges (account_id, week, key, progress, done_at,
         coins, game_id)
       VALUES ($1, $2, $3, 1, now(), $4, $5)
       ON CONFLICT DO NOTHING RETURNING key`,
      [accountId, week, bonusKey(game), CHALLENGE_BONUS, gameId],
    );
    if ((bonus.rowCount ?? 0) > 0) {
      await pay(c, accountId, CHALLENGE_BONUS);
      entry.bonus = CHALLENGE_BONUS;
      log.info("challenge bonus", { accountId, week, game });
    }
  }
  return done;
}

async function pay(
  c: pg.PoolClient,
  accountId: number,
  coins: number,
): Promise<void> {
  await c.query("UPDATE derpy_accounts SET coins = coins + $2 WHERE id = $1", [
    accountId,
    coins,
  ]);
}

/** Conquest's progress for an account in a game, in its own transaction. */
export async function conquestChallengeProgress(
  accountId: number,
  week: number,
  steps: ChallengeStep[],
  gameId: string,
): Promise<ChallengeDone[]> {
  if (!derpyDbConfigured() || !challengesOn() || steps.length === 0) return [];
  return inTransaction((c) =>
    stepChallenges(c, accountId, week, "conquest", steps, gameId, {
      aiPersonality: false,
    }),
  );
}

// ---------------------------------------------------------------- DerpyFront: what a game counts for

/** A DerpyFront game, as the challenges read one player's part in it. */
export interface FrontFacts {
  map: string;
  difficulty: string;
  mode: string;
  teams: unknown;
  /** The game's length, and the player's time in it (to the end, or until they were wiped out). */
  durationS: number;
  playedS: number;
  won: boolean;
  /** Most land at once, and at the end, as percents of the map's land. */
  peakPct: number;
  finalPct: number;
  gold: bigint;
  /** Players and nations conquered (not bots). */
  conquered: number;
  nukes: number;
  ships: number;
  awards: readonly string[];
  built: Partial<Record<OtherUnit, number>>;
  /** The AI nations in the game. */
  nations: number;
  /** AI personalities were ticked for them. */
  aiPersonalities: boolean;
}

/** The player's line, as DerpyGames works it out (the fields read here). */
export interface FrontLine {
  won: boolean;
  peakTerritoryPct: number;
  goldEarned: bigint;
  conquests: number;
  ships: number;
  nukes: number;
  awards: readonly string[];
}

const n = (v: unknown): number =>
  v === undefined || v === null ? 0 : Number(v);

/** How many AI nations a game had. */
export function nationsIn(config: GameRecord["info"]["config"]): number {
  if (typeof config.nations === "number") return config.nations;
  if (config.nations === "default")
    return maps.find((m) => m.type === config.gameMap)?.defaultNationCount ?? 0;
  return 0;
}

export function frontFacts(
  record: GameRecord,
  player: PlayerRecord,
  line: FrontLine,
  numLandTiles: number,
  humansAndNationsConquered: number,
): FrontFacts {
  const config = record.info.config;
  const stats: PlayerStats = player.stats;
  const durationS = record.info.duration;
  const killedAt = stats?.killedAt;
  const playedS =
    killedAt !== undefined && killedAt !== null
      ? Math.min(durationS, n(killedAt) / 10)
      : durationS;
  const built: Partial<Record<OtherUnit, number>> = {};
  for (const [k, v] of Object.entries(stats?.units ?? {}))
    built[k as OtherUnit] = n((v as unknown[])?.[OTHER_INDEX_BUILT]);
  return {
    map: config.gameMap,
    difficulty: config.difficulty,
    mode: config.gameMode,
    teams: config.playerTeams,
    durationS,
    playedS,
    won: line.won,
    peakPct: line.peakTerritoryPct,
    finalPct:
      numLandTiles > 0
        ? Math.min(100, (n(stats?.finalTiles) * 100) / numLandTiles)
        : 0,
    gold: line.goldEarned,
    conquered: humansAndNationsConquered,
    nukes: line.nukes,
    ships: line.ships,
    awards: line.awards,
    built,
    nations: nationsIn(config),
    aiPersonalities:
      nationsIn(config) > 0 &&
      (config.aiPersonalities ?? []).some((id) => id !== "normal"),
  };
}

/**
 * Why a game doesn't count for challenges (null: it does): too short to pay,
 * never spawned, played with cheats, or nobody to play against.
 */
export function frontGameProblem(
  record: GameRecord,
  player: PlayerRecord,
): "short" | "unspawned" | "cheats" | "alone" | null {
  const config = record.info.config;
  if (record.info.duration < DERP_COINS_MIN_GAME_SECONDS) return "short";
  if (peakTilesFromStats(player.stats) <= 0) return "unspawned";
  const cheats = config.hostCheats;
  if (
    config.infiniteGold ||
    config.infiniteTroops ||
    config.instantBuild ||
    cheats?.infiniteGold ||
    cheats?.infiniteTroops ||
    (cheats?.goldMultiplier ?? 1) > 1 ||
    (cheats?.startingGold ?? 0) > 0
  )
    return "cheats";
  const others =
    nationsIn(config) + n(config.bots) + record.info.players.length - 1;
  if (others <= 0) return "alone";
  return null;
}

const won = (f: FrontFacts) => (f.won ? 1 : 0);
const wonOn = (map: GameMapType) => (f: FrontFacts) =>
  f.won && f.map === map ? 1 : 0;
const yes = (b: boolean) => (b ? 1 : 0);

/** What each DerpyFront challenge takes from a game that counts: progress to add. */
export const FRONT_CHECKS: Record<string, (f: FrontFacts) => number> = {
  "df-play-3": (f) => yes(f.playedS >= 300),
  "df-win": won,
  "df-land-25": (f) => yes(f.peakPct >= 25),
  "df-gold-1m": (f) => yes(f.gold >= 1_000_000n),
  "df-cities-5": (f) => yes((f.built.city ?? 0) >= 5),
  "df-ports-3": (f) => yes((f.built.port ?? 0) >= 3),
  "df-ships-20": (f) => yes(f.ships >= 20),
  "df-factories-3": (f) => yes((f.built.fact ?? 0) >= 3),
  "df-win-china": wonOn(GameMapType.China),
  "df-win-europe": wonOn(GameMapType.Europe),
  "df-win-japan": wonOn(GameMapType.Japan),
  "df-win-florida": wonOn(GameMapType.FloridaDetailed),
  "df-hvn": (f) =>
    yes(f.won && f.mode === GameMode.Team && f.teams === HumansVsNations),
  "df-team-win": (f) => yes(f.won && f.mode === GameMode.Team),
  "df-third": (f) => yes(f.finalPct >= 100 / 3),
  "df-play-5-long": (f) => yes(f.playedS >= 600),
  "df-no-nuke": (f) => yes(f.won && f.nukes === 0 && f.durationS >= 900),
  "df-gold-award": (f) => yes(f.awards.includes("gold")),
  "df-mvp": (f) => yes(f.awards.includes("mvp")),
  "df-win-hard": (f) =>
    yes(
      f.won &&
        (f.difficulty === Difficulty.Hard ||
          f.difficulty === Difficulty.Impossible),
    ),
  "df-win-3": won,
  "df-win-north-america": wonOn(GameMapType.NorthAmerica),
  "df-ai-win": (f) => yes(f.won && f.aiPersonalities),
  "df-gold-5m": (f) => yes(f.gold >= 5_000_000n),
  "df-fast-win": (f) => yes(f.won && f.durationS < 900 && f.nations >= 5),
  "df-conquer-8": (f) => yes(f.conquered >= 8),
  "df-win-long": (f) => yes(f.won && f.durationS >= 1500),
};

/** Played closer together than this, two games are at the same time. */
export const OVERLAP_GRACE_S = 60;

export interface FrontCredit {
  accountId: number;
  player: PlayerRecord;
  line: FrontLine;
  /** Players and nations they conquered (not bots). */
  conquered: number;
}

/**
 * A saved DerpyFront game's challenges, for each account credited in it:
 * progress, and anything newly done paid. The game is timed by the server's
 * clock (`now` is when it was saved), so an upload can't place itself in
 * another week. Returns what each account newly did.
 */
export async function recordFrontChallenges(
  record: GameRecord,
  credits: FrontCredit[],
  numLandTiles: number,
  now = Date.now(),
): Promise<Map<number, ChallengeDone[]>> {
  const out = new Map<number, ChallengeDone[]>();
  if (!derpyDbConfigured() || !challengesOn()) return out;
  const week = weekOf(now);
  const endedAt = new Date(now);
  const startedAt = new Date(now - record.info.duration * 1000);
  for (const credit of credits) {
    if (frontGameProblem(record, credit.player) !== null) continue;
    try {
      const done = await inTransaction(async (c) => {
        // One account's games one at a time, so two saved at once can't both
        // miss each other.
        await c.query("SELECT 1 FROM derpy_accounts WHERE id = $1 FOR UPDATE", [
          credit.accountId,
        ]);
        const overlap = await c.query(
          `SELECT 1 FROM derpy_challenge_games
           WHERE account_id = $1 AND game_id <> $2
             AND started_at < $4::timestamptz - make_interval(secs => $5)
             AND ended_at > $3::timestamptz + make_interval(secs => $5)
           LIMIT 1`,
          [
            credit.accountId,
            record.info.gameID,
            startedAt,
            endedAt,
            OVERLAP_GRACE_S,
          ],
        );
        if ((overlap.rowCount ?? 0) > 0) return [];
        const kept = await c.query(
          `INSERT INTO derpy_challenge_games (account_id, game_id, week,
             started_at, ended_at)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING game_id`,
          [credit.accountId, record.info.gameID, week, startedAt, endedAt],
        );
        if ((kept.rowCount ?? 0) === 0) return []; // counted already
        const facts = frontFacts(
          record,
          credit.player,
          credit.line,
          numLandTiles,
          credit.conquered,
        );
        const owned = await challengeOwned(c, credit.accountId);
        const steps = challengesFor(week, "derpyfront", owned).map((d) => ({
          key: d.key,
          add: FRONT_CHECKS[d.key]?.(facts) ?? 0,
        }));
        return stepChallenges(
          c,
          credit.accountId,
          week,
          "derpyfront",
          steps,
          record.info.gameID,
          owned,
        );
      });
      if (done.length) out.set(credit.accountId, done);
    } catch (err) {
      log.error(
        `challenges for game ${record.info.gameID} failed: ${String(err)}`,
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------- what the pages see

interface Row {
  key: string;
  progress: number;
  doneAt: string | null;
  coins: number;
}

async function rowsOf(
  q: Queryable,
  accountId: number,
  weeks: number[],
): Promise<Map<number, Map<string, Row>>> {
  const r = await q.query(
    `SELECT week, key, progress, done_at, coins FROM derpy_challenges
     WHERE account_id = $1 AND week = ANY($2::int[])`,
    [accountId, weeks],
  );
  const out = new Map<number, Map<string, Row>>();
  for (const x of r.rows) {
    const w = Number(x.week);
    if (!out.has(w)) out.set(w, new Map());
    out.get(w)!.set(String(x.key), {
      key: String(x.key),
      progress: Number(x.progress),
      doneAt: x.done_at ? new Date(x.done_at).toISOString() : null,
      coins: Number(x.coins),
    });
  }
  return out;
}

function gameView(
  game: ChallengeGame,
  defs: ChallengeDef[],
  rows: Map<string, Row> | undefined,
): ChallengeGameView {
  return {
    game,
    challenges: defs.map((d) => {
      const row = rows?.get(d.key);
      const done = row?.doneAt ?? null;
      const u = progressUnits(d, done ? doneAt(d) : (row?.progress ?? 0));
      return {
        key: d.key,
        tier: d.tier,
        name: d.name,
        how: d.how,
        coins: CHALLENGE_COINS[d.tier],
        have: u.have,
        of: u.of,
        ...(d.unit ? { unit: d.unit } : {}),
        doneAt: done,
      };
    }),
    bonus: {
      coins: CHALLENGE_BONUS,
      doneAt: rows?.get(bonusKey(game))?.doneAt ?? null,
    },
  };
}

/** The week's challenges, and where an account stands with them (null: signed out). */
export async function weekView(
  accountId: number | null,
  now = Date.now(),
): Promise<WeekView> {
  const week = weekOf(now);
  // Signed out: the week's own challenges, as everyone gets them.
  let owned: ChallengeOwned = { aiPersonality: true };
  let rows: Map<string, Row> | undefined;
  if (accountId !== null && derpyDbConfigured()) {
    const pool = await db();
    owned = await challengeOwned(pool, accountId);
    rows = (await rowsOf(pool, accountId, [week])).get(week);
  }
  return {
    week,
    startsAt: new Date(weekStart(week)).toISOString(),
    endsAt: new Date(weekStart(week + 1)).toISOString(),
    serverTime: now,
    signedIn: accountId !== null,
    games: CHALLENGE_GAMES.map((g) =>
      gameView(g, challengesFor(week, g, owned), rows),
    ),
  };
}

/** How many past weeks a profile lists. */
export const HISTORY_WEEKS = 6;

/**
 * A player's challenges for their profile, by username (a name given up in
 * the last 7 days still finds its account, as profiles do), or null.
 */
export async function playerChallenges(
  username: string,
  now = Date.now(),
): Promise<PlayerChallenges | null> {
  const pool = await db();
  const acc = (
    await pool.query(
      `SELECT id, username FROM derpy_accounts WHERE id = COALESCE(
         (SELECT id FROM derpy_accounts WHERE username_key = $1),
         (SELECT id FROM derpy_accounts
          WHERE old_username_key = $1 AND username_changed_at >= $2
          ORDER BY username_changed_at DESC LIMIT 1))`,
      [username.toLowerCase(), heldSince(now)],
    )
  ).rows[0];
  if (!acc) return null;
  const id = Number(acc.id);
  const week = weekOf(now);
  const past = (
    await pool.query(
      `SELECT DISTINCT week FROM derpy_challenges
       WHERE account_id = $1 AND week < $2 AND done_at IS NOT NULL
       ORDER BY week DESC LIMIT $3`,
      [id, week, HISTORY_WEEKS],
    )
  ).rows.map((r) => Number(r.week));
  const rows = await rowsOf(pool, id, past);
  const history: WeekHistory[] = past.map((w) => {
    const done = [...(rows.get(w)?.values() ?? [])]
      .filter((r) => r.doneAt !== null)
      .sort((a, b) => a.doneAt!.localeCompare(b.doneAt!));
    return {
      week: w,
      startsAt: `${weekMonday(w)}`,
      done: done.flatMap((r) => {
        const def = CHALLENGE_BY_KEY.get(r.key);
        if (def)
          return [
            { key: r.key, name: def.name, game: def.game, coins: r.coins },
          ];
        const game = CHALLENGE_GAMES.find((g) => bonusKey(g) === r.key);
        return game
          ? [{ key: r.key, name: "All three", game, coins: r.coins }]
          : [];
      }),
      coins: done.reduce((s, r) => s + r.coins, 0),
    };
  });
  return {
    username: String(acc.username),
    week: await weekView(id, now),
    history,
  };
}

/**
 * What an account did in one game (for its end screen): the challenges it
 * finished there, and whether the game is saved for it yet.
 */
export async function challengesInGame(
  accountId: number,
  gameId: string,
): Promise<{ recorded: boolean; done: ChallengeDone[] }> {
  const pool = await db();
  const [saved, done] = await Promise.all([
    pool.query(
      `SELECT 1 FROM derpy_game_players WHERE game_id = $1 AND account_id = $2`,
      [gameId, accountId],
    ),
    pool.query(
      `SELECT key, coins FROM derpy_challenges
       WHERE account_id = $1 AND game_id = $2 AND done_at IS NOT NULL
       ORDER BY done_at, key`,
      [accountId, gameId],
    ),
  ]);
  const list: ChallengeDone[] = [];
  let bonus = 0;
  for (const r of done.rows) {
    const key = String(r.key);
    const def = CHALLENGE_BY_KEY.get(key);
    if (def) list.push({ key, name: def.name, coins: Number(r.coins) });
    else if (key.startsWith("bonus:")) bonus += Number(r.coins);
  }
  // Easy, medium, hard (one transaction's are all done at once); the bonus
  // came with the last of the three, in this game.
  const tier = (k: string) =>
    ["easy", "medium", "hard"].indexOf(CHALLENGE_BY_KEY.get(k)?.tier ?? "");
  list.sort((a, b) => tier(a.key) - tier(b.key));
  if (bonus > 0 && list.length) list[list.length - 1].bonus = bonus;
  return { recorded: (saved.rowCount ?? 0) > 0, done: list };
}
