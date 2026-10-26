// ADMIN (r26): who may use the admin page, and how it stays hidden.
//
// The owner is recognised the way Mr. Based already recognises him: by the
// mark on his account (derpy_accounts.based_access), given once, by account
// id, to the account that held the owner's name ("Alden", BASED_PLAYERS'
// default) when it was first marked (BasedAccess.ts). The mark that names
// the owner is based_granted_as = "alden": it never moves with a rename, and
// nobody can gain it by renaming to Alden. Mr. Based given by hand to anyone
// else (from this page) never sets it, so it never makes them an owner.
//
// For anyone else, every admin route answers exactly as a path that doesn't
// exist does (DerpyApi's own 404), before reading a body or counting a rate
// limit, and the page at /admin falls through to the site's ordinary answer
// for an unknown address.

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import type pg from "pg";
import { hashToken } from "../DerpyAuth";
import { db } from "../DerpyDb";
import { OWNER_SQL, SUSPENDED_SQL } from "./AdminSql";

export { OWNER_MARK, OWNER_SQL, SUSPENDED_SQL } from "./AdminSql";

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

/** Destructive actions need a sign-in (or the password again) this recent. */
export const FRESH_MS = 12 * 60 * 60 * 1000;

export interface OwnerSession {
  id: number;
  username: string;
  tokenHash: string;
  /** When this session signed in (ms). */
  signedInAt: number;
  /** When the password was last typed again on it (ms), or null. */
  reauthAt: number | null;
}

export function bearer(req: Request): string {
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? h.slice("Bearer ".length).trim() : "";
}

/** The owner's session behind `token`, or null for anyone else (or nobody). */
export async function ownerSession(
  token: string,
  q?: Queryable,
): Promise<OwnerSession | null> {
  if (!token) return null;
  const r = await (q ?? (await db())).query(
    `UPDATE derpy_sessions s SET last_seen = now()
     FROM derpy_accounts a
     WHERE s.token_hash = $1 AND a.id = s.account_id
       AND ${OWNER_SQL("a")} AND NOT ${SUSPENDED_SQL("a")}
     RETURNING a.id, a.username, s.token_hash, s.created_at, s.admin_reauth_at`,
    [hashToken(token)],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    username: String(row.username),
    tokenHash: String(row.token_hash),
    signedInAt: new Date(row.created_at).getTime(),
    reauthAt: row.admin_reauth_at
      ? new Date(row.admin_reauth_at).getTime()
      : null,
  };
}

/** Signed in (or the password typed again) within the last 12 hours. */
export function isFresh(s: OwnerSession, now = Date.now()): boolean {
  return Math.max(s.signedInAt, s.reauthAt ?? 0) >= now - FRESH_MS;
}

/** Exactly what DerpyApi says for an address it doesn't have. */
export function notFound(res: Response): void {
  res.status(404).json({ error: "not_found" });
}

/**
 * CSRF: a change must come from a page on this site. Sessions are bearer
 * tokens a browser never attaches by itself, so this is the second lock,
 * not the first: the Origin's host must be the Host asked for.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (typeof origin !== "string" || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// ---- the owner's account id, kept for the /me check ----------------------

let ownerCache: { id: number | null; at: number } | null = null;
const OWNER_CACHE_MS = 5 * 60 * 1000;

/** The owner's account id (kept a few minutes), or null if nobody holds it. */
export async function ownerId(q?: Queryable): Promise<number | null> {
  if (ownerCache && Date.now() - ownerCache.at < OWNER_CACHE_MS)
    return ownerCache.id;
  const r = await (q ?? (await db())).query(
    `SELECT id FROM derpy_accounts a WHERE ${OWNER_SQL("a")} LIMIT 1`,
  );
  ownerCache = {
    id: r.rows[0] ? Number(r.rows[0].id) : null,
    at: Date.now(),
  };
  return ownerCache.id;
}

/** For tests (and after a change of marks): read the owner again next time. */
export function forgetOwner(): void {
  ownerCache = null;
}

// ---- the page's cookie ----------------------------------------------------

/**
 * The admin page is served only to a browser carrying this cookie, which
 * only the owner is ever given (on /derpy/api/me, signed in as him). Its
 * value's hash is kept on his session, so signing out (anywhere) ends it.
 * HttpOnly, SameSite=Strict, and only sent to /admin.
 */
export const ADMIN_COOKIE = "dl_admin";
const COOKIE_DAYS = 30;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      const v = part.slice(i + 1).trim();
      return /^[A-Za-z0-9_-]{20,100}$/.test(v) ? v : null;
    }
  }
  return null;
}

/**
 * Called on /me: when the account is the owner's and the browser doesn't
 * already carry this session's key, a new key is made and set. Anyone
 * else's /me is untouched (the owner's id is kept in memory, so it costs
 * them nothing).
 */
export async function keepAdminKey(
  req: Request,
  res: Response,
  token: string,
  accountId: number,
): Promise<void> {
  if (accountId !== (await ownerId())) return;
  const pool = await db();
  const tokenHash = hashToken(token);
  const have = readCookie(req, ADMIN_COOKIE);
  const r = await pool.query(
    "SELECT admin_key FROM derpy_sessions WHERE token_hash = $1",
    [tokenHash],
  );
  const stored: string | null = r.rows[0]?.admin_key ?? null;
  if (r.rows.length === 0) return;
  if (have && stored && safeEqual(sha(have), stored)) return;
  const key = randomBytes(32).toString("base64url");
  await pool.query(
    "UPDATE derpy_sessions SET admin_key = $2 WHERE token_hash = $1",
    [tokenHash, sha(key)],
  );
  res.append(
    "Set-Cookie",
    `${ADMIN_COOKIE}=${key}; Path=/admin; Max-Age=${COOKIE_DAYS * 86400}; HttpOnly; SameSite=Strict${req.secure ? "; Secure" : ""}`,
  );
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The owner, from the admin page's cookie, or null (anyone else, or a stale key). */
export async function ownerFromCookie(
  req: Request,
): Promise<{ id: number; username: string } | null> {
  const key = readCookie(req, ADMIN_COOKIE);
  if (key === null) return null;
  const r = await (
    await db()
  ).query(
    `SELECT a.id, a.username FROM derpy_sessions s
     JOIN derpy_accounts a ON a.id = s.account_id
     WHERE s.admin_key = $1 AND ${OWNER_SQL("a")} AND NOT ${SUSPENDED_SQL("a")}`,
    [sha(key)],
  );
  const row = r.rows[0];
  return row ? { id: Number(row.id), username: String(row.username) } : null;
}
