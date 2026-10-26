// ADMIN (r26): /derpy/api/admin, the admin page's API. Mounted by DerpyApi.
// The gate comes first: for anyone but the owner, every path here (any
// method) is DerpyApi's own 404, decided before a body is read or a limit
// counted, so nothing here can be told apart from an address that doesn't
// exist. Then each section's routes (sections/index.ts), with the checks
// AdminRegistry.ts describes.

import express, { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { logger } from "../../Logger";
import { verifyPassword } from "../DerpyAuth";
import { db, DerpyDbUnavailable } from "../DerpyDb";
import {
  bearer,
  FRESH_MS,
  isFresh,
  notFound,
  ownerSession,
  OwnerSession,
  sameOrigin,
} from "./AdminAccess";
import { writeAudit } from "./AdminAudit";
import type { AdminCtx, AdminRoute, AdminServerSection } from "./AdminRegistry";
import { ADMIN_SECTIONS } from "./sections";

const log = logger.child({ component: "DerpyAdmin" });

type AdminReq = Request & { admin?: OwnerSession };

/** Wrong passwords typed again, per session: a few a minute. */
const REAUTH_TRIES = 6;
const reauthTries = new Map<string, number[]>();

export function adminRouter(
  sections: readonly AdminServerSection[] = ADMIN_SECTIONS,
): express.Router {
  const router = express.Router();
  const json = express.json({ limit: "64kb" });

  // The gate: the owner, or nothing here at all.
  router.use((req: AdminReq, res: Response, next: NextFunction) => {
    const token = bearer(req);
    if (!token) {
      notFound(res);
      return;
    }
    ownerSession(token)
      .then((s) => {
        if (s === null) {
          notFound(res);
          return;
        }
        req.admin = s;
        next();
      })
      .catch((err: unknown) => {
        if (!(err instanceof DerpyDbUnavailable))
          log.warn(`admin gate failed: ${err}`);
        notFound(res);
      });
  });

  const ctxOf = (req: AdminReq): AdminCtx => {
    const owner = req.admin!;
    return {
      owner,
      sections,
      audit: async (entry, q) =>
        writeAudit(q ?? (await db()), owner, entry),
    };
  };

  const run =
    (route: AdminRoute) =>
    (req: AdminReq, res: Response): void => {
      if (route.method === "post") {
        if (!sameOrigin(req)) {
          res.status(403).json({ error: "bad_origin" });
          return;
        }
        const fresh =
          typeof route.fresh === "function"
            ? route.fresh(req.body)
            : route.fresh === true;
        if (fresh && !isFresh(req.admin!)) {
          res.status(403).json({ error: "stale_sign_in" });
          return;
        }
      }
      route.handler(req, res, ctxOf(req)).catch((err: unknown) => {
        log.error(`${req.method} admin${req.path} failed: ${err}`);
        if (!res.headersSent) res.status(500).json({ error: "server_error" });
      });
    };

  // Who's here, how fresh the sign-in is, and the sections the server has.
  router.get("/hello", (req: AdminReq, res) => {
    const s = req.admin!;
    const since = Math.max(s.signedInAt, s.reauthAt ?? 0);
    res.json({
      owner: { id: s.id, username: s.username },
      fresh: isFresh(s),
      freshUntil: new Date(since + FRESH_MS).toISOString(),
      sections: sections.map((x) => x.id),
    });
  });

  // The password again, for the actions that need a recent sign-in.
  router.post("/reauth", json, (req: AdminReq, res) => {
    if (!sameOrigin(req)) {
      res.status(403).json({ error: "bad_origin" });
      return;
    }
    const s = req.admin!;
    const body = z.object({ password: z.string().max(1000) }).safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "wrong_password" });
      return;
    }
    const now = Date.now();
    const tries = (reauthTries.get(s.tokenHash) ?? []).filter(
      (t) => now - t < 60_000,
    );
    if (tries.length >= REAUTH_TRIES) {
      res.status(429).json({ error: "too_many" });
      return;
    }
    void (async () => {
      const pool = await db();
      const r = await pool.query(
        "SELECT password_hash FROM derpy_accounts WHERE id = $1",
        [s.id],
      );
      const ok =
        r.rows[0] !== undefined &&
        (await verifyPassword(body.data.password, r.rows[0].password_hash));
      if (!ok) {
        tries.push(now);
        reauthTries.set(s.tokenHash, tries);
        res.status(401).json({ error: "wrong_password" });
        return;
      }
      reauthTries.delete(s.tokenHash);
      await pool.query(
        "UPDATE derpy_sessions SET admin_reauth_at = now() WHERE token_hash = $1",
        [s.tokenHash],
      );
      await writeAudit(pool, s, { action: "admin.reauth" });
      res.json({
        fresh: true,
        freshUntil: new Date(Date.now() + FRESH_MS).toISOString(),
      });
    })().catch((err: unknown) => {
      log.error(`admin reauth failed: ${err}`);
      if (!res.headersSent) res.status(500).json({ error: "server_error" });
    });
  });

  for (const section of sections) {
    for (const route of section.routes ?? []) {
      const at = `/${section.id}${route.path === "/" ? "" : route.path}`;
      if (route.method === "get") router.get(at, run(route));
      else router.post(at, json, run(route));
    }
  }

  // An admin address that doesn't exist, for the owner too.
  router.use((_req, res) => notFound(res));
  return router;
}
