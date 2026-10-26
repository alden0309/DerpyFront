// ADMIN (r26): one-time password reset links. There's no email here: the
// owner makes a link on the admin page (Accounts) and sends it himself. It
// opens /reset-password#<token> (the token rides after the #, so it never
// reaches a server log or a Referer), which asks for a new password. A link
// works once, for 24 hours, and only the newest one an account has. Using
// it signs out every session the account had, then signs this browser in
// (unless the account is suspended).
//
// Mounted by DerpyApi at /derpy/api/password.

import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { SUSPENDED_SQL } from "./admin/AdminSql";
import {
  hashPassword,
  hashToken,
  PASSWORD_MAX,
  PASSWORD_MIN,
  startSession,
} from "./DerpyAuth";
import { db, inTransaction } from "./DerpyDb";
import { socialForgetAccount } from "./DerpySocial";

type Handle = (
  fn: (req: Request, res: Response) => Promise<unknown>,
) => (req: Request, res: Response, next: NextFunction) => void;

const Token = z.string().regex(/^[A-Za-z0-9_-]{30,100}$/);

/** The account a live link is for, or null (unknown, used or expired). */
async function linkAccount(
  token: string,
): Promise<{ id: number; username: string } | null> {
  const r = await (
    await db()
  ).query(
    `SELECT a.id, a.username FROM derpy_password_resets r
     JOIN derpy_accounts a ON a.id = r.account_id
     WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now()`,
    [hashToken(token)],
  );
  const row = r.rows[0];
  return row ? { id: Number(row.id), username: String(row.username) } : null;
}

export function passwordRouter({ handle }: { handle: Handle }): express.Router {
  const router = express.Router();
  const json = express.json({ limit: "4kb" });
  const limiter = rateLimit({ windowMs: 60_000, limit: 20 });

  // Is this link still good, and whose is it?
  router.post(
    "/reset/check",
    limiter,
    json,
    handle(async (req, res) => {
      const token = Token.safeParse(req.body?.token);
      const acc = token.success ? await linkAccount(token.data) : null;
      if (!acc) {
        res.status(404).json({ error: "link_gone" });
        return;
      }
      res.json({ username: acc.username });
    }),
  );

  router.post(
    "/reset",
    limiter,
    json,
    handle(async (req, res) => {
      const body = z
        .object({ token: Token, password: z.string().max(1000) })
        .safeParse(req.body);
      if (!body.success) {
        res.status(404).json({ error: "link_gone" });
        return;
      }
      const { token, password } = body.data;
      if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
        res.status(400).json({ error: "invalid_password" });
        return;
      }
      const hash = await hashPassword(password);
      const done = await inTransaction(async (c) => {
        const r = await c.query(
          `UPDATE derpy_password_resets r SET used_at = now()
           FROM derpy_accounts a
           WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now()
             AND a.id = r.account_id
           RETURNING a.id, a.username, ${SUSPENDED_SQL("a")} AS suspended`,
          [hashToken(token)],
        );
        const row = r.rows[0];
        if (!row) return null;
        await c.query(
          "UPDATE derpy_accounts SET password_hash = $2 WHERE id = $1",
          [row.id, hash],
        );
        await c.query("DELETE FROM derpy_sessions WHERE account_id = $1", [
          row.id,
        ]);
        return {
          id: Number(row.id),
          username: String(row.username),
          suspended: row.suspended === true,
        };
      });
      if (done === null) {
        res.status(404).json({ error: "link_gone" });
        return;
      }
      socialForgetAccount(done.id);
      if (done.suspended) {
        res.json({ username: done.username, signedIn: false });
        return;
      }
      res.json({ ...(await startSession(done.id)), signedIn: true });
    }),
  );

  return router;
}
