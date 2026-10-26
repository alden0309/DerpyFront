// PROFILE (r26): Derp Land's badges (src/derpland/Badges.ts), checked and
// kept on the server. Nearly every badge is read from what the site already
// keeps: DerpyFront games and their players, scenarios, weekly challenges,
// Derpy Conquest games, dynasties, achievements and time played, friends,
// store items, the account's age. Two are earned as they happen (being in a
// party with someone, reading What's New): grantBadges().
//
// An account's badges are checked when it asks for its own (each page's top
// bar, at most every CHECK_EVERY_MS) and when its profile is opened. The
// check is a few small queries and an insert that does nothing for badges
// already kept, so running it again changes nothing, and accounts made
// before badges existed get theirs the first time they're checked. A badge,
// once earned, is kept (losing a friend doesn't take Buddy back).
//
// Everything goes by account id, so a rename changes nothing here.

import { allScenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import type pg from "pg";
import zlib from "zlib";
import { z } from "zod";
import {
  BADGE_BY_KEY,
  BADGES,
  cleanPins,
  type EarnedBadge,
  type MyBadges,
  type PlayerBadges,
} from "../../derpland/Badges";
import { CHALLENGE_GAMES } from "../../derpland/Challenges";
import { logger } from "../Logger";
import type { Account } from "./DerpyAuth";
import { nationsIn } from "./DerpyChallenges";
import { db, derpyDbConfigured } from "./DerpyDb";
import { forgetLook } from "./DerpyLooks";

const log = logger.child({ component: "DerpyBadges" });

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

/** An account's badges are checked at most this often (unless asked to). */
export const CHECK_EVERY_MS = 30_000;

/** What the badges are read from: one account's records. */
export interface BadgeFacts {
  createdAt: number;
  dfGames: number;
  dfWins: number;
  dfMvps: number;
  dfBestLand: number;
  dfMostGold: bigint;
  dfNukes: number;
  dfConquests: number;
  dfTeamWins: number;
  dfHardWins: number;
  dfAiWins: number;
  scPlayed: string[];
  scWon: string[];
  chDone: number;
  chFullWeeks: number;
  chBothWeeks: number;
  chWeeks: number;
  cqGames: number;
  cqWins: number;
  /** The most lives on one of their lines, in any game. */
  cqLives: number;
  cqAchievements: number;
  cqSeconds: number;
  friends: number;
  playedWithFriend: boolean;
  inParty: boolean;
  bought: boolean;
}

/** The scenarios there are (the menu's), for "every scenario". */
export function scenarioIds(): string[] {
  return allScenarioData().map((s) => s.id);
}

const YEAR_MS = 365 * 24 * 3600_000;

/** Whether a badge is earned, and for a counted one how far along it is. */
export function badgeRule(
  key: string,
  f: BadgeFacts,
  now = Date.now(),
): { earned: boolean; have?: number; of?: number } {
  const count = (have: number, of: number) => ({
    earned: have >= of,
    have: Math.min(have, of),
    of,
  });
  const scenarios = scenarioIds();
  const every = (got: string[]) => {
    const set = new Set(got);
    return count(scenarios.filter((s) => set.has(s)).length, scenarios.length);
  };
  const hours = Math.floor(f.cqSeconds / 3600);
  switch (key) {
    case "df-first-win":
      return { earned: f.dfWins >= 1 };
    case "df-games-10":
      return count(f.dfGames, 10);
    case "df-mvp":
      return { earned: f.dfMvps >= 1 };
    case "df-nuke":
      return { earned: f.dfNukes >= 1 };
    case "df-team-win":
      return { earned: f.dfTeamWins >= 1 };
    case "df-wins-10":
      return count(f.dfWins, 10);
    case "df-hard-win":
      return { earned: f.dfHardWins >= 1 };
    case "df-ai-win":
      return { earned: f.dfAiWins >= 1 };
    case "df-land-50":
      return { earned: f.dfBestLand >= 50 };
    case "df-gold-5m":
      return { earned: f.dfMostGold >= 5_000_000n };
    case "df-conquests-25":
      return count(f.dfConquests, 25);
    case "df-wins-50":
      return count(f.dfWins, 50);
    case "df-games-100":
      return count(f.dfGames, 100);
    case "sc-first-win":
      return { earned: f.scWon.length >= 1 };
    case "sc-all-played":
      return every(f.scPlayed);
    case "sc-all-wins":
      return every(f.scWon);
    case "ch-first":
      return { earned: f.chDone >= 1 };
    case "ch-full-week":
      return { earned: f.chFullWeeks >= 1 };
    case "ch-both-games":
      return { earned: f.chBothWeeks >= 1 };
    case "ch-weeks-10":
      return count(f.chWeeks, 10);
    case "cq-first-life":
      return { earned: f.cqGames >= 1 || f.cqLives >= 2 };
    case "cq-win":
      return { earned: f.cqWins >= 1 };
    case "cq-hours-5":
      return count(hours, 5);
    case "cq-dynasty-3":
      return count(f.cqLives, 3);
    case "cq-achievement":
      return { earned: f.cqAchievements >= 1 };
    case "cq-hours-25":
      return count(hours, 25);
    case "cq-dynasty-5":
      return count(f.cqLives, 5);
    case "cq-achievements-10":
      return count(f.cqAchievements, 10);
    case "cq-hours-100":
      return count(hours, 100);
    case "dl-friend":
      return { earned: f.friends >= 1 };
    case "dl-party":
      return { earned: f.inParty };
    case "dl-news":
      return { earned: false }; // earned as it happens (grantBadges)
    case "dl-shopper":
      return { earned: f.bought };
    case "dl-both-games":
      return { earned: f.dfGames >= 1 && f.cqGames >= 1 };
    case "dl-friends-5":
      return count(f.friends, 5);
    case "dl-played-together":
      return { earned: f.playedWithFriend };
    case "dl-year":
      return { earned: now - f.createdAt >= YEAR_MS };
    default:
      return { earned: false };
  }
}

const FACTS_SQL = `
WITH df AS (
  SELECT count(*)::int AS games,
    count(*) FILTER (WHERE gp.won)::int AS wins,
    count(*) FILTER (WHERE 'mvp' = ANY(gp.awards))::int AS mvps,
    coalesce(max(gp.peak_territory_pct), 0)::float AS best_land,
    coalesce(max(gp.gold_earned), 0)::text AS most_gold,
    coalesce(sum(gp.nukes), 0)::int AS nukes,
    coalesce(sum(gp.conquests), 0)::int AS conquests,
    count(*) FILTER (WHERE gp.won AND g.mode = 'Team')::int AS team_wins,
    count(*) FILTER (WHERE gp.won AND g.difficulty IN ('Hard', 'Impossible'))::int
      AS hard_wins,
    count(*) FILTER (WHERE gp.won AND g.ai_personalities)::int AS ai_wins,
    coalesce(array_agg(DISTINCT g.scenario)
      FILTER (WHERE g.scenario IS NOT NULL), '{}') AS sc_played,
    coalesce(array_agg(DISTINCT g.scenario)
      FILTER (WHERE g.scenario IS NOT NULL AND gp.won), '{}') AS sc_won
  FROM derpy_game_players gp JOIN derpy_games g ON g.game_id = gp.game_id
  WHERE gp.account_id = $1
), ch AS (
  SELECT
    count(*) FILTER (WHERE done_at IS NOT NULL AND key NOT LIKE 'bonus:%')::int
      AS done,
    count(*) FILTER (WHERE done_at IS NOT NULL AND key LIKE 'bonus:%')::int
      AS full_weeks,
    count(DISTINCT week) FILTER (WHERE done_at IS NOT NULL)::int AS weeks
  FROM derpy_challenges WHERE account_id = $1
), ch_both AS (
  SELECT count(*)::int AS n FROM (
    SELECT week FROM derpy_challenges
    WHERE account_id = $1 AND key LIKE 'bonus:%' AND done_at IS NOT NULL
    GROUP BY week HAVING count(*) >= $2) w
), cq AS (
  SELECT count(*)::int AS games, count(*) FILTER (WHERE won)::int AS wins
  FROM derpy_conquest_players WHERE account_id = $1
), cq_lives AS (
  SELECT greatest(
    (SELECT coalesce(max(lives), 0) FROM derpy_conquest_dynasties
     WHERE account_id = $1),
    (SELECT coalesce(max(CASE WHEN jsonb_typeof(e->'chars') = 'array'
                              THEN jsonb_array_length(e->'chars') ELSE 0 END), 0)
     FROM derpy_conquest_players cp
     JOIN derpy_conquest_games g ON g.game_id = cp.game_id,
       jsonb_array_elements(g.summary) e
     WHERE cp.account_id = $1 AND (e->>'rank')::int = cp.rank)
  )::int AS n
)
SELECT extract(epoch FROM a.created_at) * 1000 AS created_ms,
  df.games AS df_games, df.wins AS df_wins, df.mvps AS df_mvps,
  df.best_land AS df_best_land, df.most_gold AS df_most_gold,
  df.nukes AS df_nukes, df.conquests AS df_conquests,
  df.team_wins AS df_team_wins, df.hard_wins AS df_hard_wins,
  df.ai_wins AS df_ai_wins, df.sc_played, df.sc_won,
  ch.done AS ch_done, ch.full_weeks AS ch_full_weeks, ch.weeks AS ch_weeks,
  ch_both.n AS ch_both_weeks,
  cq.games AS cq_games, cq.wins AS cq_wins, cq_lives.n AS cq_lives,
  (SELECT count(*) FROM derpy_conquest_achievements
   WHERE account_id = $1)::int AS cq_achievements,
  (SELECT coalesce(sum(secs), 0) FROM derpy_conquest_play
   WHERE account_id = $1)::bigint AS cq_seconds,
  (SELECT count(*) FROM derpy_friends WHERE account_id = $1)::int AS friends,
  (EXISTS (
     SELECT 1 FROM derpy_game_players me
     JOIN derpy_game_players o ON o.game_id = me.game_id
       AND o.account_id <> me.account_id
     JOIN derpy_friends f ON f.account_id = me.account_id
       AND f.friend_id = o.account_id
     WHERE me.account_id = $1)
   OR EXISTS (
     SELECT 1 FROM derpy_conquest_players me
     JOIN derpy_conquest_players o ON o.game_id = me.game_id
       AND o.account_id <> me.account_id
     JOIN derpy_friends f ON f.account_id = me.account_id
       AND f.friend_id = o.account_id
     WHERE me.account_id = $1)) AS played_with_friend,
  EXISTS (
    SELECT 1 FROM derpy_party_members m
    JOIN derpy_party_members o ON o.party_id = m.party_id
      AND o.account_id <> m.account_id
    WHERE m.account_id = $1) AS in_party,
  EXISTS (SELECT 1 FROM derpy_owned WHERE account_id = $1) AS bought
FROM derpy_accounts a, df, ch, ch_both, cq, cq_lives
WHERE a.id = $1`;

/** One account's facts, or null when there's no such account. */
export async function badgeFacts(
  q: Queryable,
  accountId: number,
): Promise<BadgeFacts | null> {
  const r = await q.query(FACTS_SQL, [accountId, CHALLENGE_GAMES.length]);
  const x = r.rows[0];
  if (!x) return null;
  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
  return {
    createdAt: Number(x.created_ms),
    dfGames: Number(x.df_games),
    dfWins: Number(x.df_wins),
    dfMvps: Number(x.df_mvps),
    dfBestLand: Number(x.df_best_land),
    dfMostGold: BigInt(String(x.df_most_gold ?? "0").split(".")[0] || "0"),
    dfNukes: Number(x.df_nukes),
    dfConquests: Number(x.df_conquests),
    dfTeamWins: Number(x.df_team_wins),
    dfHardWins: Number(x.df_hard_wins),
    dfAiWins: Number(x.df_ai_wins),
    scPlayed: strings(x.sc_played),
    scWon: strings(x.sc_won),
    chDone: Number(x.ch_done),
    chFullWeeks: Number(x.ch_full_weeks),
    chBothWeeks: Number(x.ch_both_weeks),
    chWeeks: Number(x.ch_weeks),
    cqGames: Number(x.cq_games),
    cqWins: Number(x.cq_wins),
    cqLives: Number(x.cq_lives),
    cqAchievements: Number(x.cq_achievements),
    cqSeconds: Number(x.cq_seconds),
    friends: Number(x.friends),
    playedWithFriend: x.played_with_friend === true,
    inParty: x.in_party === true,
    bought: x.bought === true,
  };
}

// ---------------------------------------------------------------- games' settings, from their records

/** Whether a game's config dealt AI personalities to its nations. */
export function aiPersonalitiesOn(config: {
  nations?: unknown;
  gameMap?: unknown;
  aiPersonalities?: unknown;
}): boolean {
  const list = Array.isArray(config.aiPersonalities)
    ? config.aiPersonalities
    : [];
  return (
    nationsIn(config as Parameters<typeof nationsIn>[0]) > 0 &&
    list.some((id) => id !== "normal")
  );
}

/**
 * The config of a saved game, from the start of its gzipped record (the
 * record's info, config first among it, leads the file), or null.
 */
export function configFromRecordHead(
  head: Buffer,
): Record<string, unknown> | null {
  let text: string;
  try {
    text = zlib
      .gunzipSync(head, { finishFlush: zlib.constants.Z_SYNC_FLUSH })
      .toString("utf8");
  } catch {
    return null;
  }
  const at = text.indexOf('"config":{');
  if (at < 0) return null;
  const start = at + '"config":'.length;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        const v = JSON.parse(text.slice(start, i + 1)) as unknown;
        return v && typeof v === "object"
          ? (v as Record<string, unknown>)
          : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** How much of a record is read to find its config. */
const HEAD_BYTES = 32 * 1024;

/**
 * Reads the difficulty and AI personalities of an account's won DerpyFront
 * games saved before those were kept (a few at a time, the start of each
 * record only), so Hard Won and Mind Games count games from before badges.
 * Returns how many it read.
 */
export async function readGameSettings(
  q: Queryable,
  accountId: number,
  limit = 40,
): Promise<number> {
  const rows = (
    await q.query(
      `SELECT g.game_id, substring(g.record from 1 for $3) AS head
       FROM derpy_games g
       JOIN derpy_game_players gp ON gp.game_id = g.game_id
       WHERE gp.account_id = $1 AND gp.won AND g.difficulty IS NULL
       LIMIT $2`,
      [accountId, limit, HEAD_BYTES],
    )
  ).rows;
  for (const row of rows) {
    let config = configFromRecordHead(row.head as Buffer);
    if (config === null) {
      // A record whose config isn't near its start: read it whole, once.
      const full = (
        await q.query("SELECT record FROM derpy_games WHERE game_id = $1", [
          row.game_id,
        ])
      ).rows[0];
      try {
        const rec = JSON.parse(
          zlib.gunzipSync(full.record as Buffer).toString("utf8"),
        ) as { info?: { config?: Record<string, unknown> } };
        config = rec.info?.config ?? null;
      } catch {
        config = null;
      }
    }
    await q.query(
      `UPDATE derpy_games SET difficulty = $2, ai_personalities = $3
       WHERE game_id = $1 AND difficulty IS NULL`,
      [
        row.game_id,
        typeof config?.difficulty === "string" ? config.difficulty : "",
        config ? aiPersonalitiesOn(config) : false,
      ],
    );
  }
  return rows.length;
}

// ---------------------------------------------------------------- checking and keeping

const checkedAt = new Map<number, number>();

/** Keeps badges for an account (ones it has already stay as they were). Returns the new ones. */
export async function grantBadges(
  q: Queryable,
  accountId: number,
  keys: string[],
): Promise<string[]> {
  const known = keys.filter((k) => BADGE_BY_KEY.has(k));
  if (known.length === 0) return [];
  const r = await q.query(
    `INSERT INTO derpy_badges (account_id, key)
     SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING RETURNING key`,
    [accountId, known],
  );
  const added = r.rows.map((x) => String(x.key));
  if (added.length) log.info("badges", { accountId, added });
  return added;
}

/** Grants badges as something happens, never failing what it's part of. */
export function grantBadgesSoon(accountIds: number[], keys: string[]): void {
  if (!derpyDbConfigured()) return;
  void (async () => {
    const pool = await db();
    for (const id of new Set(accountIds)) await grantBadges(pool, id, keys);
  })().catch((err: unknown) => log.warn(`grant failed: ${String(err)}`));
}

/**
 * Checks an account's badges against its records and keeps any it has
 * newly earned (at most every CHECK_EVERY_MS unless `force`). Returns the
 * facts (null when it wasn't checked now) and the badges newly kept.
 */
export async function checkBadges(
  accountId: number,
  opts: { force?: boolean; now?: number } = {},
): Promise<{ facts: BadgeFacts | null; added: string[] }> {
  const now = opts.now ?? Date.now();
  const last = checkedAt.get(accountId);
  if (!opts.force && last !== undefined && now - last < CHECK_EVERY_MS)
    return { facts: null, added: [] };
  if (checkedAt.size >= 20_000)
    checkedAt.delete(checkedAt.keys().next().value!);
  checkedAt.set(accountId, now);
  const pool = await db();
  await readGameSettings(pool, accountId);
  const facts = await badgeFacts(pool, accountId);
  if (facts === null) return { facts: null, added: [] };
  const earned = BADGES.filter((b) => badgeRule(b.key, facts, now).earned).map(
    (b) => b.key,
  );
  return { facts, added: await grantBadges(pool, accountId, earned) };
}

async function earnedOf(
  q: Queryable,
  accountId: number,
): Promise<(EarnedBadge & { seen: boolean })[]> {
  const r = await q.query(
    `SELECT key, earned_at, seen FROM derpy_badges WHERE account_id = $1
     ORDER BY earned_at, key`,
    [accountId],
  );
  return r.rows
    .filter((x) => BADGE_BY_KEY.has(String(x.key)))
    .map((x) => ({
      key: String(x.key),
      at: new Date(x.earned_at).toISOString(),
      seen: x.seen === true,
    }));
}

async function pinsOf(q: Queryable, accountId: number): Promise<string[]> {
  const r = await q.query(
    "SELECT pinned_badges FROM derpy_accounts WHERE id = $1",
    [accountId],
  );
  const raw = (r.rows[0]?.pinned_badges ?? []) as unknown[];
  return raw.filter((k): k is string => typeof k === "string");
}

/** A player's badges for their profile (checked first, as often as allowed). */
export async function playerBadges(
  accountId: number,
  now = Date.now(),
): Promise<PlayerBadges> {
  const pool = await db();
  let { facts } = await checkBadges(accountId, { now });
  facts ??= await badgeFacts(pool, accountId);
  const earned = await earnedOf(pool, accountId);
  const have = new Set(earned.map((e) => e.key));
  const progress: Record<string, [number, number]> = {};
  if (facts)
    for (const b of BADGES) {
      if (have.has(b.key)) continue;
      const r = badgeRule(b.key, facts, now);
      if (r.of !== undefined && r.have !== undefined && r.have > 0)
        progress[b.key] = [r.have, r.of];
    }
  return {
    earned: earned.map(({ key, at }) => ({ key, at })),
    pinned: cleanPins(await pinsOf(pool, accountId), have),
    progress,
  };
}

/** The signed-in player's own badges: checked, with what's new to them. */
export async function myBadges(accountId: number): Promise<MyBadges> {
  await checkBadges(accountId);
  const pool = await db();
  const earned = await earnedOf(pool, accountId);
  const have = new Set(earned.map((e) => e.key));
  return {
    earned: earned.map(({ key, at }) => ({ key, at })),
    pinned: cleanPins(await pinsOf(pool, accountId), have),
    fresh: earned.filter((e) => !e.seen).map((e) => e.key),
  };
}

/** The player has been shown these in a toast. */
export async function markBadgesSeen(
  accountId: number,
  keys: string[],
): Promise<void> {
  await (
    await db()
  ).query(
    `UPDATE derpy_badges SET seen = true
     WHERE account_id = $1 AND key = ANY($2::text[])`,
    [accountId, keys],
  );
}

/** Pins up to three of the player's badges beside their name. Returns the pins kept. */
export async function setPins(
  accountId: number,
  keys: unknown[],
): Promise<string[]> {
  const pool = await db();
  const have = new Set((await earnedOf(pool, accountId)).map((e) => e.key));
  const pins = cleanPins(keys, have);
  await pool.query(
    "UPDATE derpy_accounts SET pinned_badges = $2 WHERE id = $1",
    [accountId, pins],
  );
  forgetLook(accountId);
  return pins;
}

/** For tests: check every account afresh. */
export function forgetBadgeChecks(): void {
  checkedAt.clear();
}

// ---------------------------------------------------------------- the routes

type Authed = Request & { derpy?: { account: Account; token: string } };
type Wrap = (
  fn: (req: Authed, res: Response) => Promise<unknown>,
) => (req: Request, res: Response, next: NextFunction) => void;

const KeysSchema = z.object({ keys: z.array(z.string().max(40)).max(64) });

/** Mounted by DerpyApi at /derpy/api/badges. */
export function badgesRouter({
  requireAccount,
}: {
  requireAccount: Wrap;
}): express.Router {
  const router = express.Router();
  const json = express.json({ limit: "4kb" });
  const limiter = rateLimit({ windowMs: 60_000, limit: 60 });

  // The bar asks on each page: checks (as often as allowed) and says what's new.
  router.get(
    "/mine",
    limiter,
    requireAccount(async (req, res) => {
      res.json(await myBadges(req.derpy!.account.id));
    }),
  );

  router.post(
    "/seen",
    limiter,
    json,
    requireAccount(async (req, res) => {
      const body = KeysSchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      await markBadgesSeen(req.derpy!.account.id, body.data.keys);
      res.status(204).end();
    }),
  );

  router.post(
    "/pins",
    limiter,
    json,
    requireAccount(async (req, res) => {
      const body = KeysSchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      res.json({
        pinned: await setPins(req.derpy!.account.id, body.data.keys),
      });
    }),
  );

  return router;
}
