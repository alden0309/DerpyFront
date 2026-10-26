// ADMIN (r26): Weekly challenges, read-only: a week's picks for both games
// (and the stand-in for accounts without what one needs), how many accounts
// did each and what was paid, and the latest done. One fix-up: pay an
// account for one of its challenges that week, marked done as if it had
// done it (with the game's bonus if that makes all three), and logged.

import { z } from "zod";
import {
  bonusKey,
  CHALLENGE_BONUS,
  CHALLENGE_BY_KEY,
  CHALLENGE_COINS,
  CHALLENGE_GAMES,
  challengesFor,
  doneAt,
  weekChallenges,
  weekEnd,
  weekOf,
  weekStart,
} from "../../../../derpland/Challenges";
import { challengeOwned } from "../../DerpyChallenges";
import { db, inTransaction } from "../../DerpyDb";
import { adminSection } from "../AdminRegistry";

const PayBody = z.object({
  account: z.string().trim().min(1).max(30),
  week: z.number().int().min(0),
  key: z.string().max(60),
  reason: z.string().trim().min(1).max(300),
});

export const challenges = adminSection({
  id: "challenges",
  routes: [
    {
      method: "get",
      path: "/",
      handler: async (req, res) => {
        const current = weekOf(Date.now());
        const asked = Number(req.query.week);
        const week =
          Number.isInteger(asked) && asked > 0 && asked <= current
            ? asked
            : current;
        const pool = await db();
        const [counts, recent, players] = await Promise.all([
          pool.query(
            `SELECT key, count(*) FILTER (WHERE done_at IS NOT NULL)::int AS done,
               count(*)::int AS tried, coalesce(sum(coins), 0)::int AS coins
             FROM derpy_challenges WHERE week = $1 GROUP BY key`,
            [week],
          ),
          pool.query(
            `SELECT ch.account_id, a.username, ch.key, ch.done_at, ch.coins, ch.game_id
             FROM derpy_challenges ch JOIN derpy_accounts a ON a.id = ch.account_id
             WHERE ch.week = $1 AND ch.done_at IS NOT NULL
             ORDER BY ch.done_at DESC LIMIT 60`,
            [week],
          ),
          pool.query(
            "SELECT count(DISTINCT account_id)::int AS n FROM derpy_challenges WHERE week = $1",
            [week],
          ),
        ]);
        const byKey = new Map(
          counts.rows.map((x) => [
            String(x.key),
            { done: x.done, tried: x.tried, paid: x.coins },
          ]),
        );
        const row = (key: string) =>
          byKey.get(key) ?? { done: 0, tried: 0, paid: 0 };
        res.json({
          week,
          current,
          startsAt: new Date(weekStart(week)).toISOString(),
          endsAt: new Date(weekEnd(week)).toISOString(),
          players: players.rows[0].n,
          games: CHALLENGE_GAMES.map((game) => {
            const picks = weekChallenges(week, game);
            const alts = picks
              .map((d) => (d.alt ? CHALLENGE_BY_KEY.get(d.alt) : undefined))
              .filter((d) => d !== undefined);
            const show = (d: (typeof picks)[number], standIn = false) => ({
              key: d.key,
              tier: d.tier,
              name: d.name,
              how: d.how,
              coins: CHALLENGE_COINS[d.tier],
              standIn,
              ...row(d.key),
            });
            return {
              game,
              picks: [
                ...picks.map((d) => show(d)),
                ...alts.map((d) => show(d, true)),
              ],
              bonus: { coins: CHALLENGE_BONUS, ...row(bonusKey(game)) },
            };
          }),
          recent: recent.rows.map((x) => ({
            accountId: Number(x.account_id),
            username: x.username,
            key: x.key,
            name: CHALLENGE_BY_KEY.get(String(x.key))?.name ?? String(x.key),
            doneAt: new Date(x.done_at).toISOString(),
            coins: x.coins,
            gameId: x.game_id,
          })),
        });
      },
    },
    {
      method: "post",
      path: "/pay",
      handler: async (req, res, ctx) => {
        const body = PayBody.safeParse(req.body);
        const def = body.success
          ? CHALLENGE_BY_KEY.get(body.data.key)
          : undefined;
        if (!body.success || !def) {
          res.status(400).json({ error: "invalid" });
          return;
        }
        const { account, week, reason } = body.data;
        if (week > weekOf(Date.now())) {
          res.status(400).json({ error: "invalid" });
          return;
        }
        const out = await inTransaction(async (c) => {
          const a = await c.query(
            `SELECT id, username, coins FROM derpy_accounts
             WHERE username_key = $1 OR id::text = $2`,
            [account.toLowerCase(), account.replace(/^#/, "")],
          );
          const acc = a.rows[0];
          if (!acc) return "no_such_account";
          const id = Number(acc.id);
          const mine = challengesFor(
            week,
            def.game,
            await challengeOwned(c, id),
          );
          if (!mine.some((d) => d.key === def.key)) return "not_theirs";
          await c.query(
            `INSERT INTO derpy_challenges (account_id, week, key) VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [id, week, def.key],
          );
          const was = (
            await c.query(
              `SELECT progress, done_at FROM derpy_challenges
               WHERE account_id = $1 AND week = $2 AND key = $3 FOR UPDATE`,
              [id, week, def.key],
            )
          ).rows[0];
          if (was.done_at !== null) return "already_done";
          const coins = CHALLENGE_COINS[def.tier];
          await c.query(
            `UPDATE derpy_challenges SET progress = GREATEST(progress, $4),
               done_at = now(), coins = $5, updated_at = now()
             WHERE account_id = $1 AND week = $2 AND key = $3`,
            [id, week, def.key, doneAt(def), coins],
          );
          let paid = coins;
          const n = Number(
            (
              await c.query(
                `SELECT count(*)::int AS n FROM derpy_challenges
                 WHERE account_id = $1 AND week = $2 AND key = ANY($3::text[])
                   AND done_at IS NOT NULL`,
                [id, week, mine.map((d) => d.key)],
              )
            ).rows[0].n,
          );
          let bonus = 0;
          if (n >= mine.length) {
            const b = await c.query(
              `INSERT INTO derpy_challenges (account_id, week, key, progress, done_at, coins)
               VALUES ($1, $2, $3, 1, now(), $4) ON CONFLICT DO NOTHING RETURNING key`,
              [id, week, bonusKey(def.game), CHALLENGE_BONUS],
            );
            if ((b.rowCount ?? 0) > 0) bonus = CHALLENGE_BONUS;
          }
          paid += bonus;
          const after = await c.query(
            "UPDATE derpy_accounts SET coins = coins + $2 WHERE id = $1 RETURNING coins",
            [id, paid],
          );
          await ctx.audit(
            {
              action: "challenges.pay",
              target: { type: "account", id, name: acc.username },
              reason,
              before: {
                coins: Number(acc.coins),
                progress: Number(was.progress),
              },
              after: {
                week,
                key: def.key,
                name: def.name,
                coins: Number(after.rows[0].coins),
                paid,
                bonus,
              },
            },
            c,
          );
          return { paid, bonus, username: String(acc.username) };
        });
        if (typeof out === "string") {
          res
            .status(out === "no_such_account" ? 404 : 409)
            .json({ error: out });
          return;
        }
        res.json(out);
      },
    },
  ],
});
