// Derp Land's own API, served by the master at /derpy/api: accounts (shared
// by every game), the leaderboards and profiles, DerpyFront's saved-game
// replays, and the Derp Store.

import { GameAwardsSchema } from "@openfront/engine-api/game/Awards";
import { PartialGameRecordSchema } from "@openfront/shared/WireSchemas";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { RenameError } from "../../derpland/Names"; // NAMES (r20)
import { finalizeGameRecord } from "../Archive";
import { keepAdminKey } from "./admin/AdminAccess"; // ADMIN (r26)
import { adminRouter } from "./admin/AdminRouter"; // ADMIN (r26)
import { passwordRouter } from "./PasswordReset"; // ADMIN (r26)
import { logger } from "../Logger";
import { setNoStoreHeaders } from "../NoStoreHeaders";
import { dynastyFor } from "./ConquestDynasties"; // TREE (r25)
import {
  Account,
  accountForToken,
  AuthError,
  login,
  logout,
  ownedItems,
  register,
} from "./DerpyAuth";
import { basedRouter } from "./DerpyBased"; // BASED (r19)
import {
  DERPY_ITEMS,
  DERPY_PACKS,
  DERPY_STORE_TABS,
  derpyCosmeticsCatalog,
  findItem,
  itemGrants,
} from "./DerpyCatalog";
import {
  challengesInGame,
  playerChallenges,
  weekView,
} from "./DerpyChallenges"; // CHAL (r25)
import {
  conquestGamePage, // LEGACY (r21)
  conquestLeaderboard,
  overallLeaderboard,
  recentResults,
} from "./DerpyConquest";
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
import { checkName, nameStatus, renameAccount } from "./DerpyNames"; // NAMES (r20)
import { loadNews, newsRouter } from "./DerpyNews"; // NEWS (r25)
import { socialRenamed, socialRouter, socialSignedOut } from "./DerpySocial"; // FRIENDS (r25)
import { liveGames } from "./LiveGames"; // SITE (r19)

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
  suspended: 403, // ADMIN (r26)
};

// NAMES (r20)
const RENAME_ERROR_STATUS: Record<RenameError, number> = {
  invalid_username: 400,
  same_name: 400,
  username_taken: 409,
  username_held: 409,
  username_reserved: 409,
  too_soon: 429,
  accounts_unavailable: 503,
  server_error: 500,
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
    // The games being played (SITE r19) need no accounts either, nor does
    // What's New signed out (NEWS r25).
    if (
      !derpyDbConfigured() &&
      req.path !== "/cosmetics.json" &&
      req.path !== "/live" &&
      !(req.path === "/news" && req.method === "GET")
    ) {
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
      socialSignedOut(token); // FRIENDS (r25)
      res.status(204).end();
    }),
  );

  router.get(
    "/me",
    requireAccount(async (req, res) => {
      const { account } = req.derpy!;
      // ADMIN (r26): the owner's browser gets (or keeps) the admin page's
      // cookie; nobody else's answer changes.
      await keepAdminKey(req, res, req.derpy!.token, account.id).catch(
        (err: unknown) => log.warn(`admin key: ${err}`),
      );
      res.json({
        account: { username: account.username, coins: account.coins },
        owned: await ownedItems(account.id),
      });
    }),
  );

  // NAMES (r20): changing your username. Where you stand (when you last
  // changed it, when you next may), the form's live check, and the change.
  // The session token holds no name, so it stays good through a change.
  const renameLimiter = rateLimit({ windowMs: 60_000, limit: 10 });
  const checkLimiter = rateLimit({ windowMs: 60_000, limit: 90 });

  router.get(
    "/username",
    requireAccount(async (req, res) => {
      res.json(await nameStatus(req.derpy!.account.id));
    }),
  );

  router.get(
    "/username/check",
    checkLimiter,
    requireAccount(async (req, res) => {
      const name = String(req.query.name ?? "").slice(0, 100);
      res.json(await checkName(name, req.derpy!.account.id));
    }),
  );

  router.post(
    "/username",
    renameLimiter,
    json,
    requireAccount(async (req, res) => {
      const body = z
        .object({ username: z.string().max(100) })
        .safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: "invalid_username" });
        return;
      }
      const result = await renameAccount(
        req.derpy!.account.id,
        body.data.username,
      );
      if (!result.ok) {
        const { error, nextChangeAt } = result;
        res
          .status(RENAME_ERROR_STATUS[error])
          .json(nextChangeAt ? { error, nextChangeAt } : { error });
        return;
      }
      log.info("username changed", { account: req.derpy!.account.id });
      socialRenamed(req.derpy!.account.id, result.username); // FRIENDS (r25)
      res.json({
        account: { username: result.username, coins: result.coins },
        username: result.username,
        changedAt: result.changedAt,
        nextChangeAt: result.nextChangeAt,
        canChange: result.canChange,
        heldName: result.heldName,
        heldUntil: result.heldUntil,
      });
    }),
  );

  // ?game=derpyfront (the default), conquest, or overall (both games).
  router.get(
    "/leaderboard",
    handle(async (req, res) => {
      const game = String(req.query.game ?? "derpyfront");
      if (game === "conquest") {
        res.json({ game, players: await conquestLeaderboard() });
      } else if (game === "overall") {
        res.json({ game, players: await overallLeaderboard() });
      } else {
        res.json({ game: "derpyfront", players: await leaderboard() });
      }
    }),
  );

  // The latest finished games in either game, for the hub's front page.
  router.get(
    "/recent",
    handle(async (_req, res) => {
      res.json({ results: await recentResults() });
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

  // TREE (r25): one of a player's Derpy Conquest dynasties: its tree and
  // every life on it (nothing secret), by their name (or one given up lately).
  router.get(
    "/players/:username/dynasty/:gameId",
    handle(async (req, res) => {
      const name = String(req.params.username);
      const id = String(req.params.gameId);
      if (
        !/^[A-Za-z0-9_]{1,20}$/.test(name) ||
        !/^[A-Za-z0-9-]{1,60}$/.test(id)
      ) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const page = await dynastyFor(name, id);
      if (page === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(page);
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

  // LEGACY (r21): a finished Derpy Conquest game: every player, every
  // character their line was (with their stats), and each line's chronicle.
  router.get(
    "/conquest/game/:id",
    handle(async (req, res) => {
      const id = String(req.params.id);
      if (!/^[A-Za-z0-9-]{1,60}$/.test(id)) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const page = await conquestGamePage(id);
      if (page === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(page);
    }),
  );

  // CHAL (r25): this week's challenges for both games, with the signed-in
  // account's progress (signed out: the challenges alone).
  router.get(
    "/challenges",
    handle(async (req, res) => {
      const token = bearer(req);
      const found = token ? await accountForToken(token) : null;
      res.json(await weekView(found?.account.id ?? null));
    }),
  );

  // CHAL (r25): a player's challenges for their profile: this week's, and
  // the last few weeks'. By account, so a rename keeps them.
  router.get(
    "/challenges/player/:username",
    handle(async (req, res) => {
      const p = await playerChallenges(String(req.params.username));
      if (p === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(p);
    }),
  );

  // CHAL (r25): the challenges a game finished for the signed-in account,
  // for its end screen (asked again until the game is saved).
  router.get(
    "/challenges/game/:id",
    requireAccount(async (req, res) => {
      const id = String(req.params.id);
      if (!/^[A-Za-z0-9-]{1,60}$/.test(id)) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(await challengesInGame(req.derpy!.account.id, id));
    }),
  );

  // SITE (r19): the games being played right now that anyone may watch (no
  // account needed), for the front page and each game's page. Made at most
  // every couple of seconds, however many ask.
  router.get("/live", (_req, res) => {
    res.json(liveGames());
  });

  // The skins, in the shape the game's cosmetics code reads. Served even
  // without a database, so skins people own still draw for everyone.
  router.get("/cosmetics.json", (_req, res) => {
    res.json(derpyCosmeticsCatalog());
  });

  // The skin packs (`packs`, as before r21) and, since DFSTORE (r21), every
  // item with its game and category, and the tabs to show them under.
  router.get(
    "/store",
    handle(async (_req, res) => {
      res.json({
        packs: DERPY_PACKS,
        items: DERPY_ITEMS,
        tabs: DERPY_STORE_TABS,
      });
    }),
  );

  router.post(
    "/store/buy",
    json,
    requireAccount(async (req, res) => {
      // `pack` from before r21; `item` names anything in the store.
      const pack = findItem(String(req.body?.item ?? req.body?.pack ?? ""));
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
        const items = itemGrants(pack);
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
      // CHAL (r25): with the weekly challenges it finished.
      res.json({ coins: line?.coins ?? 0, challenges: line?.challenges ?? [] });
    }),
  );

  // BASED (r19): Mr. Based. Only the accounts allowed to play get its story,
  // pictures and sound; everyone else gets Coming Soon.
  router.use("/based", basedRouter({ handle }));

  // FRIENDS (r25): who's online and where, friends, game invites, parties.
  router.use("/social", socialRouter({ requireAccount }));

  // NEWS (r25): What's New, read from its file once, at startup.
  loadNews();
  router.use("/news", newsRouter({ handle, requireAccount }));

  // ADMIN (r26): one-time password reset links (made on the admin page).
  router.use("/password", passwordRouter({ handle }));

  // ADMIN (r26): the owner's admin page's API. For anyone else, every path
  // under it answers exactly as the 404 below does.
  router.use("/admin", adminRouter());

  router.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  return router;
}
