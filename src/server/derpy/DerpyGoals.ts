// DFX (r26): Scenario goals' bonus coins. A Scenario player who met their
// nation's optional goal has it in their stats (`goal`: the tick, written by
// the engine), and the saved game carries it. When the game is saved, each
// signed-in player's goal is paid GOAL_COINS, once per goal per account
// (derpy_scenario_goals), under the coin lines' own anti-farming rules (a
// game long enough to pay, the player spawned, no cheats, someone to play
// against). Losing the war doesn't stop a goal met being paid.

import { scenarioReplayable } from "@openfront/engine-api/game/Scenarios";
import {
  GOAL_COINS,
  goalKey,
  scenarioGoal,
} from "@openfront/engine-lib/scenario/ScenarioGoals";
import { scenarioRoster } from "@openfront/engine-lib/scenario/ScenarioSeats";
import type { GameRecord, PlayerRecord } from "@openfront/shared/WireSchemas";
import express, { NextFunction, Request, Response } from "express";
import type pg from "pg";
import type { Account } from "./DerpyAuth";
import { frontGameProblem } from "./DerpyChallenges";
import { db } from "./DerpyDb";

/** A goal a saved game met, for the account that met it. */
export interface GoalLine {
  /** "europe1939:poland" */
  key: string;
  /** What it paid now: GOAL_COINS, or 0 when it was paid in an earlier game. */
  coins: number;
}

/**
 * The goal `player` met in this saved game, if any: their nation's (from the
 * game's seats, resolved as the engine resolves them), when their stats say
 * it was met within the game.
 */
export function goalMetIn(
  record: GameRecord,
  player: PlayerRecord,
): { key: string; tick: number } | null {
  const config = record.info.config;
  if (config.scenario === undefined) return null;
  // A game from another edition played another war (and can't be replayed).
  if (!scenarioReplayable(config)) return null;
  const tick = player.stats?.goal;
  if (tick === undefined) return null;
  // Met within the game.
  if (tick < 0 || tick > record.info.num_turns + 10) return null;
  const roster = scenarioRoster(
    config,
    record.info.players.map((p) => p.clientID),
  );
  if (roster === null) return null;
  for (const [nation, clientID] of roster.seats) {
    if (clientID !== player.clientID) continue;
    if (scenarioGoal(roster.data.id, nation) === null) return null;
    return { key: goalKey(roster.data.id, nation), tick };
  }
  return null;
}

/**
 * Pays `accountId` for the goal `player` met in the saved game (inside the
 * transaction that saved it): GOAL_COINS the first time that account meets
 * that goal, nothing after. Null when there's no goal to pay or the game
 * doesn't count.
 */
export async function payGoal(
  c: pg.PoolClient,
  accountId: number,
  record: GameRecord,
  player: PlayerRecord,
): Promise<GoalLine | null> {
  const met = goalMetIn(record, player);
  if (met === null) return null;
  if (frontGameProblem(record, player) !== null) return null;
  const inserted = await c.query(
    `INSERT INTO derpy_scenario_goals (account_id, goal, game_id, met_tick, coins)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (account_id, goal) DO NOTHING
     RETURNING goal`,
    [accountId, met.key, record.info.gameID, met.tick, GOAL_COINS],
  );
  if ((inserted.rowCount ?? 0) === 0) return { key: met.key, coins: 0 };
  await c.query("UPDATE derpy_accounts SET coins = coins + $2 WHERE id = $1", [
    accountId,
    GOAL_COINS,
  ]);
  return { key: met.key, coins: GOAL_COINS };
}

/**
 * The goal a saved game met for an account, for the win screen: whether the
 * game is saved yet, and the goal (and whether this game paid it).
 */
export async function goalInGame(
  accountId: number,
  gameId: string,
): Promise<{ recorded: boolean; goal: GoalLine | null }> {
  const pool = await db();
  const [saved, goal] = await Promise.all([
    pool.query(
      "SELECT 1 FROM derpy_game_players WHERE game_id = $1 AND account_id = $2",
      [gameId, accountId],
    ),
    pool.query(
      `SELECT goal, game_id, coins FROM derpy_scenario_goals
       WHERE account_id = $1 AND game_id = $2`,
      [accountId, gameId],
    ),
  ]);
  const row = goal.rows[0];
  return {
    recorded: (saved.rowCount ?? 0) > 0,
    goal: row ? { key: String(row.goal), coins: Number(row.coins) } : null,
  };
}

/** The goals an account has met (and so been paid for), newest first. */
export async function goalsMet(
  accountId: number,
): Promise<{ key: string; gameId: string; metAt: string }[]> {
  const r = await (
    await db()
  ).query(
    `SELECT goal, game_id, met_at FROM derpy_scenario_goals
     WHERE account_id = $1 ORDER BY met_at DESC`,
    [accountId],
  );
  return r.rows.map((x) => ({
    key: String(x.goal),
    gameId: String(x.game_id),
    metAt: new Date(x.met_at).toISOString(),
  }));
}

type Authed = Request & { derpy?: { account: Account; token: string } };
type Handler = (req: Authed, res: Response) => Promise<unknown>;

/** /derpy/api/goals: the goals an account has met, and a game's. */
export function goalsRouter({
  requireAccount,
}: {
  requireAccount: (
    fn: Handler,
  ) => (req: Request, res: Response, next: NextFunction) => void;
}): express.Router {
  const router = express.Router();
  router.get(
    "/",
    requireAccount(async (req, res) => {
      res.json({ goals: await goalsMet(req.derpy!.account.id) });
    }),
  );
  // The game's goal for the signed-in account (asked again until it's saved).
  router.get(
    "/game/:id",
    requireAccount(async (req, res) => {
      const id = String(req.params.id);
      if (!/^[A-Za-z0-9-]{1,60}$/.test(id)) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(await goalInGame(req.derpy!.account.id, id));
    }),
  );
  return router;
}
