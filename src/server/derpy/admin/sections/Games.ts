// ADMIN (r26): Games. Every DerpyFront lobby and game on the game workers
// (private and matched ones too), every Derpy Conquest room, and the latest
// saved games of both. The owner can close a lobby or end a game for
// everyone (with a reason each player sees), close a Conquest room (its
// game saved first), watch, and open replays.

import { z } from "zod";
import { db } from "../../DerpyDb";
import { conquestAdmin, frontAdmin } from "../AdminSources";
import { adminSection } from "../AdminRegistry";

const ReasonBody = z.object({ reason: z.string().trim().min(1).max(300) });

export const games = adminSection({
  id: "games",
  routes: [
    {
      method: "get",
      path: "/",
      handler: async (_req, res) => {
        const front = frontAdmin();
        const conquest = conquestAdmin();
        const pool = await db();
        const [list, recentFront, recentConquest] = await Promise.all([
          front ? front.list().catch(() => null) : Promise.resolve(null),
          pool.query(
            `SELECT g.game_id, g.map, g.mode, g.game_type, g.ended_at, g.duration_s,
               g.winner, g.num_players, g.scenario,
               (SELECT string_agg(gp.username, ', ' ORDER BY gp.username)
                FROM derpy_game_players gp WHERE gp.game_id = g.game_id) AS accounts
             FROM derpy_games g ORDER BY g.ended_at DESC LIMIT 30`,
          ),
          pool.query(
            `SELECT g.game_id, g.ended_at, g.duration_s, g.final_year, g.difficulty,
               g.num_players, g.winner,
               (SELECT string_agg(cp.username, ', ' ORDER BY cp.rank)
                FROM derpy_conquest_players cp WHERE cp.game_id = g.game_id) AS accounts
             FROM derpy_conquest_games g ORDER BY g.ended_at DESC LIMIT 30`,
          ),
        ]);
        res.json({
          front: {
            available: front !== null && list !== null,
            games: (list?.games ?? []).sort(
              (a, b) =>
                (a.phase === "lobby" ? 1 : 0) - (b.phase === "lobby" ? 1 : 0) ||
                b.createdAt - a.createdAt,
            ),
          },
          conquest: {
            available: conquest !== null,
            rooms: conquest?.rooms() ?? [],
          },
          recent: {
            derpyfront: recentFront.rows.map((g) => ({
              gameId: g.game_id,
              map: g.map,
              mode: g.mode,
              type: g.game_type,
              scenario: g.scenario,
              endedAt: new Date(g.ended_at).toISOString(),
              durationS: g.duration_s,
              winner: g.winner,
              players: g.num_players,
              accounts: g.accounts ?? "",
            })),
            conquest: recentConquest.rows.map((g) => ({
              gameId: g.game_id,
              endedAt: new Date(g.ended_at).toISOString(),
              durationS: g.duration_s,
              year: g.final_year,
              difficulty: g.difficulty,
              winner: g.winner,
              players: g.num_players,
              accounts: g.accounts ?? "",
            })),
          },
        });
      },
    },
    {
      method: "post",
      path: "/front/:id/end",
      handler: async (req, res, ctx) => {
        const id = String(req.params.id);
        const body = ReasonBody.safeParse(req.body);
        const front = frontAdmin();
        if (!/^[A-Za-z0-9]{1,20}$/.test(id) || !body.success || !front) {
          res.status(400).json({ error: "invalid" });
          return;
        }
        const was = (await front.list().catch(() => null))?.games.find(
          (g) => g.id === id,
        );
        const ok = await front.end(id, body.data.reason);
        if (!ok) {
          res.status(404).json({ error: "no_such_game" });
          return;
        }
        await ctx.audit({
          action: was?.phase === "lobby" ? "games.close_lobby" : "games.end",
          target: { type: "derpyfront", id, name: was?.map ?? null },
          reason: body.data.reason,
          before: was
            ? {
                phase: was.phase,
                kind: was.kind,
                map: was.map,
                players: was.players,
              }
            : undefined,
        });
        res.json({ ok: true });
      },
    },
    {
      method: "post",
      path: "/conquest/:code/close",
      handler: async (req, res, ctx) => {
        const code = String(req.params.code);
        const body = ReasonBody.safeParse(req.body);
        const conquest = conquestAdmin();
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(code) || !body.success || !conquest) {
          res.status(400).json({ error: "invalid" });
          return;
        }
        const was = conquest.rooms().find((r) => r.code === code);
        const ok = await conquest.close(code, body.data.reason);
        if (!ok) {
          res.status(404).json({ error: "no_such_room" });
          return;
        }
        await ctx.audit({
          action: "games.close_room",
          target: { type: "conquest", id: code, name: was?.title ?? null },
          reason: body.data.reason,
          before: was
            ? {
                started: was.started,
                year: was.year,
                seats: was.seats.map((s) => s.name),
                saveId: was.saveId,
              }
            : undefined,
        });
        res.json({ ok: true });
      },
    },
  ],
});
