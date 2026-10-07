// Derpy Front's own API, served by the master at /derpy/api: accounts, the
// leaderboard and profiles, saved-game replays, and the Derp Store.

import { GameAwardsSchema } from "@openfront/engine-api/game/Awards";
import { PartialGameRecordSchema } from "@openfront/shared/WireSchemas";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { finalizeGameRecord } from "../Archive";
import { logger } from "../Logger";
import { setNoStoreHeaders } from "../NoStoreHeaders";
import {
  Account,
  accountForToken,
  AuthError,
  login,
  logout,
  ownedItems,
  register,
} from "./DerpyAuth";
import { DERPY_PACKS, derpyCosmeticsCatalog, findPack } from "./DerpyCatalog";
import {
  derpyDbConfigured,
  DerpyDbUnavailable,
  inTransaction,
} from "./DerpyDb";
import {
  leaderboard,
  profile,
  recordDerpyGame,
  savedGameRecord,
} from "./DerpyGames";

const log = logger.child({ component: "DerpyApi" });

type Authed = Request & { derpy?: { account: Account; token: string } };

const CredentialsSchema = z.object({
  username: z.string().max(100),
  password: z.string().max(1000),
});

const AUTH_ERROR_STATUS: Record<AuthError, number> = {
  invalid_username: 400,
  invalid_password: 400,
  username_taken: 409,
  wrong_password: 401,
};

function bearer(req: Request): string {
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? h.slice("Bearer ".length).trim() : "";
}

/** Wraps an async handler so a thrown error becomes a JSON 500 (or 503). */
function handle(
  fn: (req: Authed, res: Response) => Promise<unknown>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res) => {
    fn(req as Authed, res).catch((err: unknown) => {
      if (err instanceof DerpyDbUnavailable) {
        res.status(503).json({ error: "accounts_unavailable" });
        return;
      }
      log.error(`${req.method} ${req.path} failed: ${err}`);
      if (!res.headersSent) res.status(500).json({ error: "server_error" });
    });
  };
}

function requireAccount(
  fn: (req: Authed, res: Response) => Promise<unknown>,
): (req: Request, res: Response, next: NextFunction) => void {
  return handle(async (req, res) => {
    // A beacon sent as a page unloads can't set headers, so it may carry
    // the session token in its JSON body instead.
    const bodyToken =
      typeof req.body?.token === "string" ? (req.body.token as string) : "";
    const token = bearer(req) || bodyToken;
    const found = await accountForToken(token);
    if (found === null) {
      res.status(401).json({ error: "signed_out" });
      return;
    }
    req.derpy = { account: found.account, token };
    await fn(req, res);
  });
}

export function derpyApiRouter(): express.Router {
  const router = express.Router();

  router.use((req, res, next) => {
    setNoStoreHeaders(res);
    if (!derpyDbConfigured() && req.path !== "/cosmetics.json") {
      res.status(503).json({ error: "accounts_unavailable" });
      return;
    }
    next();
  });

  // Signing in and up: slow enough to make password guessing pointless.
  const authLimiter = rateLimit({ windowMs: 60_000, limit: 10 });
  const json = express.json({ limit: "20kb" });

  router.post(
    "/register",
    authLimiter,
    json,
    handle(async (req, res) => {
      const body = CredentialsSchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: "invalid_username" });
        return;
      }
      const result = await register(
        body.data.username.trim(),
        body.data.password,
      );
      if (typeof result === "string") {
        res.status(AUTH_ERROR_STATUS[result]).json({ error: result });
        return;
      }
      res.json(result);
    }),
  );

  router.post(
    "/login",
    authLimiter,
    json,
    handle(async (req, res) => {
      const body = CredentialsSchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: "wrong_password" });
        return;
      }
      const result = await login(body.data.username.trim(), body.data.password);
      if (typeof result === "string") {
        res.status(AUTH_ERROR_STATUS[result]).json({ error: result });
        return;
      }
      res.json(result);
    }),
  );

  router.post(
    "/logout",
    handle(async (req, res) => {
      const token = bearer(req);
      if (token) await logout(token);
      res.status(204).end();
    }),
  );

  router.get(
    "/me",
    requireAccount(async (req, res) => {
      const { account } = req.derpy!;
      res.json({
        account: { username: account.username, coins: account.coins },
        owned: await ownedItems(account.id),
      });
    }),
  );

  router.get(
    "/leaderboard",
    handle(async (_req, res) => {
      res.json({ players: await leaderboard() });
    }),
  );

  router.get(
    "/players/:username",
    handle(async (req, res) => {
      const p = await profile(String(req.params.username));
      if (p === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(p);
    }),
  );

  router.get(
    "/game/:id",
    handle(async (req, res) => {
      const id = String(req.params.id);
      if (!/^[A-Za-z0-9]{1,20}$/.test(id)) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const record = await savedGameRecord(id);
      if (record === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(record);
    }),
  );

  // The skins, in the shape the game's cosmetics code reads. Served even
  // without a database, so skins people own still draw for everyone.
  router.get("/cosmetics.json", (_req, res) => {
    res.json(derpyCosmeticsCatalog());
  });

  router.get(
    "/store",
    handle(async (_req, res) => {
      res.json({ packs: DERPY_PACKS });
    }),
  );

  router.post(
    "/store/buy",
    json,
    requireAccount(async (req, res) => {
      const pack = findPack(String(req.body?.pack ?? ""));
      if (pack === undefined) {
        res.status(404).json({ error: "no_such_pack" });
        return;
      }
      const { account } = req.derpy!;
      const outcome = await inTransaction(async (c) => {
        const owned = await c.query(
          "SELECT 1 FROM derpy_owned WHERE account_id = $1 AND item = $2",
          [account.id, `pack:${pack.name}`],
        );
        if ((owned.rowCount ?? 0) > 0) return "already_owned" as const;
        const paid = await c.query(
          `UPDATE derpy_accounts SET coins = coins - $2
           WHERE id = $1 AND coins >= $2 RETURNING coins`,
          [account.id, pack.price],
        );
        if (paid.rowCount === 0) return "not_enough_coins" as const;
        const items = [
          `pack:${pack.name}`,
          ...pack.skins.map((s) => `skin:${s.name}`),
        ];
        await c.query(
          `INSERT INTO derpy_owned (account_id, item)
           SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
          [account.id, items],
        );
        return { coins: Number(paid.rows[0].coins) };
      });
      if (typeof outcome === "string") {
        res.status(409).json({ error: outcome });
        return;
      }
      res.json({ coins: outcome.coins, owned: await ownedItems(account.id) });
    }),
  );

  // A finished singleplayer game, uploaded by the browser that played it
  // (there's no game server in singleplayer). Credited to the uploader.
  router.post(
    "/games/singleplayer",
    express.json({ limit: "30mb" }),
    requireAccount(async (req, res) => {
      const record = PartialGameRecordSchema.safeParse(req.body?.record);
      const awards = GameAwardsSchema.safeParse(req.body?.awards ?? []);
      if (!record.success || !awards.success) {
        log.warn("rejected a singleplayer game upload", {
          record: record.success ? "ok" : record.error.message.slice(0, 300),
          awards: awards.success ? "ok" : "invalid",
        });
        res.status(400).json({ error: "invalid_record" });
        return;
      }
      const players = record.data.info.players;
      if (players.length !== 1) {
        res.status(400).json({ error: "invalid_record" });
        return;
      }
      const { account } = req.derpy!;
      const lines = await recordDerpyGame(
        finalizeGameRecord(record.data),
        awards.data,
        () => account.id,
      );
      const line = lines.get(account.id);
      res.json({ coins: line?.coins ?? 0 });
    }),
  );

  router.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  return router;
}
