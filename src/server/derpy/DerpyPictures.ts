// PROFILE (r26): profile pictures, served at /derpy/api/pictures.
//
// - Choosing: a preset (some unlocked by badges), a monogram colour, the
//   default, or the account's own upload again.
// - Uploading: any signed-in account, UPLOADS_PER_DAY a day (the last 24
//   hours, counted in Postgres, so a restart doesn't reset it). The page
//   crops and shrinks the picture first; here it's read from its bytes (PNG
//   or baseline JPEG only, never by its name or Content-Type), drawn again
//   as a fresh 256 px JPEG (ImageCodec.ts: nothing but the pixels survive,
//   no EXIF or GPS, no script) and kept in Postgres: Render's disk is wiped
//   on every deploy. One at a time, so two uploads never both hold memory.
// - Serving: /pictures/<account>/<version>.jpg, kept by browsers for a year
//   (a new upload is a new version), as an image only (nosniff, no scripts).
// - Moderation: anyone signed in may report an uploaded picture. The owner
//   sees reported and recent uploads and may remove one (the account goes
//   back to its monogram, at once everywhere) and stop the account
//   uploading; each action writes an audit line in its own transaction.
//   The functions here do the work. ADMIN (r26)'s page calls them from its
//   sections "pictures" and "reports" (admin/sections/Pictures.ts, its page
//   half src/admin/sections/PicturesView.ts); until the two branches meet,
//   /pictures/moderation/* below serves the same to the owner alone, and
//   404 to everyone else.

import { randomBytes } from "crypto";
import express, { NextFunction, Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type pg from "pg";
import { z } from "zod";
import type { PlayerBadges } from "../../derpland/Badges";
import {
  parsePic,
  type PictureError,
  PRESET_BY_ID,
  presetUnlocked,
  uploadRef,
  UPLOADS_PER_DAY,
  VERSION_RE,
} from "../../derpland/Pictures";
import { logger } from "../Logger";
import { type Account, hashToken } from "./DerpyAuth";
import { checkBadges, playerBadges } from "./DerpyBadges";
import { db, inTransaction } from "./DerpyDb";
import { forgetLook, lookFromRow, looksOf } from "./DerpyLooks";
import { ImageError, reencodePicture } from "./ImageCodec";
import { Limiter } from "./LobbyLock";

const log = logger.child({ component: "DerpyPictures" });

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

/** The most an upload may weigh as it arrives. */
export const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
/** Reports one account may make in a day. */
export const REPORTS = new Limiter(20, 24 * 3600_000);

// ---------------------------------------------------------------- the owner

/**
 * The owner's account, as ADMIN (r26) names it (admin/AdminSql.ts's
 * OWNER_SQL, which this copies until the two meet): Mr. Based's mark, given
 * once by account id under the owner's own name, so a rename neither loses
 * it nor gains it, and Mr. Based given to anyone else never makes an owner.
 */
const OWNER_SQL = (a: string) =>
  `(${a}.based_access AND ${a}.based_granted_as = 'alden')`;

/** Whether this account may moderate pictures: the owner's alone. */
export async function isPictureModerator(
  q: Queryable,
  accountId: number,
): Promise<boolean> {
  const r = await q.query(
    `SELECT 1 FROM derpy_accounts a WHERE a.id = $1 AND ${OWNER_SQL("a")}`,
    [accountId],
  );
  return (r.rowCount ?? 0) > 0;
}

/** One line of the audit log, in the shape of ADMIN's (admin/AdminAudit.ts). */
export interface PictureAudit {
  /** "pictures.remove", "pictures.block", "pictures.unblock", "reports.dismiss". */
  action: string;
  target?: { type: string; id: string | number; name?: string | null };
  reason?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Writes an action's audit line, in `q` (the change's transaction) when
 * given: ADMIN's ctx.audit has exactly this shape.
 */
export type PictureAuditFn = (e: PictureAudit, q?: Queryable) => Promise<void>;

/** Until ADMIN's audit log takes them: each action in the server's log. */
export function logAudit(actorId: number): PictureAuditFn {
  return async (e) => {
    log.info("picture moderation", {
      actorId,
      action: e.action,
      target: e.target?.id,
      ...(e.reason ? { reason: e.reason } : {}),
    });
  };
}

// ---------------------------------------------------------------- choosing

async function earnedSet(
  q: Queryable,
  accountId: number,
): Promise<Set<string>> {
  const r = await q.query(
    "SELECT key FROM derpy_badges WHERE account_id = $1",
    [accountId],
  );
  return new Set(r.rows.map((x) => String(x.key)));
}

/** What the picture endpoints answer: done (the picture now), or why not. */
export type PictureResult =
  | { ok: true; picture: string | null }
  | { error: PictureError };

/**
 * Wear a preset, a monogram colour, the default (null), or the account's
 * own upload again (its u: string).
 */
export async function choosePicture(
  accountId: number,
  ref: string | null,
): Promise<PictureResult> {
  const pool = await db();
  if (ref !== null) {
    const p = parsePic(ref);
    if (p === null) return { error: "invalid" };
    if (p.kind === "preset") {
      const def = PRESET_BY_ID.get(p.id)!;
      if (def.unlock) {
        await checkBadges(accountId);
        if (!presetUnlocked(def, await earnedSet(pool, accountId)))
          return { error: "locked" };
      }
    }
    if (p.kind === "upload") {
      if (p.account !== accountId) return { error: "invalid" };
      const mine = await pool.query(
        "SELECT 1 FROM derpy_pictures WHERE account_id = $1 AND version = $2",
        [accountId, p.version],
      );
      if ((mine.rowCount ?? 0) === 0) return { error: "not_found" };
    }
  }
  await pool.query("UPDATE derpy_accounts SET picture = $2 WHERE id = $1", [
    accountId,
    ref,
  ]);
  await pool.query(
    "INSERT INTO derpy_picture_log (account_id, kind, version) VALUES ($1, 'choose', $2)",
    [accountId, ref],
  );
  forgetLook(accountId);
  return { ok: true, picture: ref };
}

// ---------------------------------------------------------------- uploading

let queue: Promise<unknown> = Promise.resolve();
/** Runs `fn` after every upload before it has finished. */
function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

/** Uploads in the last 24 hours. */
async function uploadsToday(q: Queryable, accountId: number): Promise<number> {
  const r = await q.query(
    `SELECT count(*)::int AS n FROM derpy_picture_log
     WHERE account_id = $1 AND kind = 'upload'
       AND created_at > now() - interval '24 hours'`,
    [accountId],
  );
  return Number(r.rows[0].n);
}

/**
 * An upload: checked (the account may, today), drawn again and kept, and
 * worn. The bytes are whatever was sent; only what they are counts.
 */
export async function uploadPicture(
  accountId: number,
  bytes: Uint8Array,
): Promise<PictureResult & { bytes?: number }> {
  if (bytes.length > UPLOAD_MAX_BYTES) return { error: "too_large" };
  const pool = await db();
  const acc = (
    await pool.query(
      "SELECT picture_blocked FROM derpy_accounts WHERE id = $1",
      [accountId],
    )
  ).rows[0];
  if (!acc) return { error: "invalid" };
  if (acc.picture_blocked === true) return { error: "uploads_blocked" };
  if ((await uploadsToday(pool, accountId)) >= UPLOADS_PER_DAY)
    return { error: "rate_limited" };
  let jpeg: Buffer;
  try {
    jpeg = await oneAtATime(async () => reencodePicture(bytes).jpeg);
  } catch (err) {
    if (err instanceof ImageError) {
      log.info("upload refused", { accountId, why: err.message });
      return { error: err.code };
    }
    throw err;
  }
  const version = randomBytes(6).toString("hex");
  const ref = uploadRef(accountId, version);
  const done = await inTransaction(async (c) => {
    // Checked again inside, so two at once can't both slip under the limit.
    await c.query("SELECT 1 FROM derpy_accounts WHERE id = $1 FOR UPDATE", [
      accountId,
    ]);
    if ((await uploadsToday(c, accountId)) >= UPLOADS_PER_DAY)
      return "rate_limited" as const;
    await c.query(
      `INSERT INTO derpy_pictures (account_id, version, data) VALUES ($1, $2, $3)
       ON CONFLICT (account_id) DO UPDATE
         SET version = $2, data = $3, created_at = now()`,
      [accountId, version, jpeg],
    );
    await c.query("UPDATE derpy_accounts SET picture = $2 WHERE id = $1", [
      accountId,
      ref,
    ]);
    await c.query(
      "INSERT INTO derpy_picture_log (account_id, kind, version) VALUES ($1, 'upload', $2)",
      [accountId, version],
    );
    // Old lines aren't needed for the limit.
    await c.query(
      `DELETE FROM derpy_picture_log
       WHERE account_id = $1 AND created_at < now() - interval '30 days'`,
      [accountId],
    );
    return "ok" as const;
  });
  if (done !== "ok") return { error: done };
  forgetLook(accountId);
  log.info("picture uploaded", { accountId, version, bytes: jpeg.length });
  return { ok: true, picture: ref, bytes: jpeg.length };
}

/** An uploaded picture's JPEG, by account and version, or null. */
export async function pictureBytes(
  accountId: number,
  version: string,
): Promise<Buffer | null> {
  if (!VERSION_RE.test(version)) return null;
  const r = await (
    await db()
  ).query(
    "SELECT data FROM derpy_pictures WHERE account_id = $1 AND version = $2",
    [accountId, version],
  );
  return (r.rows[0]?.data as Buffer | undefined) ?? null;
}

/** The account's own upload (worn or not), for the picker. */
export async function myUpload(accountId: number): Promise<string | null> {
  const r = await (
    await db()
  ).query("SELECT version FROM derpy_pictures WHERE account_id = $1", [
    accountId,
  ]);
  const v = r.rows[0]?.version as string | undefined;
  return v ? uploadRef(accountId, v) : null;
}

/** Where the account stands on uploading. */
export async function uploadStatus(accountId: number): Promise<{
  blocked: boolean;
  left: number;
  upload: string | null;
}> {
  const pool = await db();
  const acc = (
    await pool.query(
      "SELECT picture_blocked FROM derpy_accounts WHERE id = $1",
      [accountId],
    )
  ).rows[0];
  return {
    blocked: acc?.picture_blocked === true,
    left: Math.max(0, UPLOADS_PER_DAY - (await uploadsToday(pool, accountId))),
    upload: await myUpload(accountId),
  };
}

// ---------------------------------------------------------------- reports and moderation

/** Report someone's uploaded picture (the one they wear now). */
export async function reportPicture(
  reporterId: number,
  accountId: number,
  version: string,
): Promise<{ ok: true } | { error: PictureError }> {
  if (reporterId === accountId) return { error: "yourself" };
  const pool = await db();
  const wearing = await pool.query(
    `SELECT 1 FROM derpy_pictures p JOIN derpy_accounts a ON a.id = p.account_id
     WHERE p.account_id = $1 AND p.version = $2 AND a.picture = $3`,
    [accountId, version, uploadRef(accountId, version)],
  );
  if ((wearing.rowCount ?? 0) === 0) return { error: "not_found" };
  if (!REPORTS.take(String(reporterId))) return { error: "rate_limited" };
  await pool.query(
    `INSERT INTO derpy_picture_reports (account_id, version, reporter_id)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [accountId, version, reporterId],
  );
  log.info("picture reported", { accountId, version, reporterId });
  return { ok: true };
}

/** An uploaded picture as the owner's list shows it. */
export interface ModerationRow {
  accountId: number;
  username: string;
  version: string;
  picture: string;
  /** Whether the account wears it now. */
  worn: boolean;
  uploadedAt: string;
  reports: number;
  reporters: string[];
  lastReportAt: string | null;
  blocked: boolean;
}

export interface ModerationView {
  reported: ModerationRow[];
  recent: ModerationRow[];
  blocked: { accountId: number; username: string }[];
}

const MOD_ROW = `
  SELECT p.account_id, a.username, p.version, p.created_at, a.picture,
    a.picture_blocked,
    (SELECT count(*) FROM derpy_picture_reports r
     WHERE r.account_id = p.account_id AND r.version = p.version)::int AS reports,
    (SELECT coalesce(json_agg(ra.username ORDER BY r.created_at), '[]')
     FROM derpy_picture_reports r JOIN derpy_accounts ra ON ra.id = r.reporter_id
     WHERE r.account_id = p.account_id AND r.version = p.version) AS reporters,
    (SELECT max(r.created_at) FROM derpy_picture_reports r
     WHERE r.account_id = p.account_id AND r.version = p.version) AS last_report
  FROM derpy_pictures p JOIN derpy_accounts a ON a.id = p.account_id`;

function modRow(r: Record<string, unknown>): ModerationRow {
  const accountId = Number(r.account_id);
  const version = String(r.version);
  const picture = uploadRef(accountId, version);
  return {
    accountId,
    username: String(r.username),
    version,
    picture,
    worn: r.picture === picture,
    uploadedAt: new Date(r.created_at as string).toISOString(),
    reports: Number(r.reports),
    reporters: Array.isArray(r.reporters) ? r.reporters.map(String) : [],
    lastReportAt: r.last_report
      ? new Date(r.last_report as string).toISOString()
      : null,
    blocked: r.picture_blocked === true,
  };
}

/** What the owner's moderation section shows. */
export async function moderationView(): Promise<ModerationView> {
  const pool = await db();
  const [reported, recent, blocked] = await Promise.all([
    pool.query(
      `${MOD_ROW} WHERE EXISTS (SELECT 1 FROM derpy_picture_reports r
         WHERE r.account_id = p.account_id AND r.version = p.version)
       ORDER BY last_report DESC LIMIT 100`,
    ),
    pool.query(`${MOD_ROW} ORDER BY p.created_at DESC LIMIT 40`),
    pool.query(
      `SELECT id, username FROM derpy_accounts WHERE picture_blocked
       ORDER BY username_key LIMIT 200`,
    ),
  ]);
  return {
    reported: reported.rows.map(modRow),
    recent: recent.rows.map(modRow),
    blocked: blocked.rows.map((r) => ({
      accountId: Number(r.id),
      username: String(r.username),
    })),
  };
}

/**
 * The owner removes an account's uploaded picture: it's gone (not served
 * again), the account wears its monogram, its reports are cleared, and
 * (with `block`) it may not upload again until the owner allows it. Its
 * audit line is written in the same transaction.
 */
export async function removePicture(
  accountId: number,
  opts: { block: boolean; reason?: string | null; audit: PictureAuditFn },
): Promise<{ ok: true } | { error: PictureError }> {
  const done = await inTransaction(async (c) => {
    const acc = await c.query(
      `SELECT username, picture, picture_blocked FROM derpy_accounts
       WHERE id = $1 FOR UPDATE`,
      [accountId],
    );
    const row = acc.rows[0];
    if (!row) return false;
    const gone = await c.query(
      "DELETE FROM derpy_pictures WHERE account_id = $1 RETURNING version",
      [accountId],
    );
    const version = (gone.rows[0]?.version as string | undefined) ?? null;
    const wore = parsePic(row.picture as string | null)?.kind === "upload";
    const blocked = row.picture_blocked === true || opts.block;
    await c.query(
      `UPDATE derpy_accounts SET
         picture = CASE WHEN $2 THEN NULL ELSE picture END,
         picture_blocked = $3
       WHERE id = $1`,
      [accountId, wore, blocked],
    );
    await c.query("DELETE FROM derpy_picture_reports WHERE account_id = $1", [
      accountId,
    ]);
    await c.query(
      "INSERT INTO derpy_picture_log (account_id, kind, version) VALUES ($1, 'removed', $2)",
      [accountId, version],
    );
    await opts.audit(
      {
        action: "pictures.remove",
        target: { type: "account", id: accountId, name: String(row.username) },
        reason: opts.reason ?? null,
        before: {
          picture: row.picture ?? null,
          upload: version,
          uploadsBlocked: row.picture_blocked === true,
        },
        after: {
          picture: wore ? null : (row.picture ?? null),
          upload: null,
          uploadsBlocked: blocked,
        },
      },
      c,
    );
    return true;
  });
  if (!done) return { error: "not_found" };
  forgetLook(accountId);
  return { ok: true };
}

/** The owner stops (or lets again) an account uploading. */
export async function blockUploads(
  accountId: number,
  opts: { blocked: boolean; reason?: string | null; audit: PictureAuditFn },
): Promise<{ ok: true } | { error: PictureError }> {
  const done = await inTransaction(async (c) => {
    const acc = await c.query(
      "SELECT username, picture_blocked FROM derpy_accounts WHERE id = $1 FOR UPDATE",
      [accountId],
    );
    const row = acc.rows[0];
    if (!row) return false;
    if ((row.picture_blocked === true) === opts.blocked) return true;
    await c.query(
      "UPDATE derpy_accounts SET picture_blocked = $2 WHERE id = $1",
      [accountId, opts.blocked],
    );
    await opts.audit(
      {
        action: opts.blocked ? "pictures.block" : "pictures.unblock",
        target: { type: "account", id: accountId, name: String(row.username) },
        reason: opts.reason ?? null,
        before: { uploadsBlocked: !opts.blocked },
        after: { uploadsBlocked: opts.blocked },
      },
      c,
    );
    return true;
  });
  return done ? { ok: true } : { error: "not_found" };
}

/** The owner looked at a reported picture and kept it: its reports go. */
export async function dismissReports(
  accountId: number,
  version: string,
  opts: { reason?: string | null; audit: PictureAuditFn },
): Promise<{ ok: true }> {
  await inTransaction(async (c) => {
    const gone = await c.query(
      `DELETE FROM derpy_picture_reports r USING derpy_accounts a
       WHERE r.account_id = $1 AND r.version = $2 AND a.id = r.account_id
       RETURNING a.username`,
      [accountId, version],
    );
    if ((gone.rowCount ?? 0) === 0) return;
    await opts.audit(
      {
        action: "reports.dismiss",
        target: {
          type: "account",
          id: accountId,
          name: String(gone.rows[0].username),
        },
        reason: opts.reason ?? null,
        before: { version, reports: gone.rowCount },
        after: { reports: 0 },
      },
      c,
    );
  });
  return { ok: true };
}

/** What an account's admin page shows of its picture (ADMIN's account panel). */
export interface AccountPicture {
  picture: string | null;
  upload: {
    version: string;
    picture: string;
    uploadedAt: string;
    worn: boolean;
    reports: number;
  } | null;
  uploadsBlocked: boolean;
  uploadsToday: number;
}

export async function accountPicture(
  accountId: number,
): Promise<AccountPicture | undefined> {
  const pool = await db();
  const acc = (
    await pool.query(
      "SELECT picture, picture_blocked FROM derpy_accounts WHERE id = $1",
      [accountId],
    )
  ).rows[0];
  if (!acc) return undefined;
  const up = (
    await pool.query(`${MOD_ROW} WHERE p.account_id = $1`, [accountId])
  ).rows[0];
  const row = up ? modRow(up) : null;
  return {
    picture: lookFromRow(acc).pic,
    upload: row
      ? {
          version: row.version,
          picture: row.picture,
          uploadedAt: row.uploadedAt,
          worn: row.worn,
          reports: row.reports,
        }
      : null,
    uploadsBlocked: acc.picture_blocked === true,
    uploadsToday: await uploadsToday(pool, accountId),
  };
}

/** ADMIN's Overview lines: pictures waiting on a look, and the week's uploads. */
export async function picturesOverview(): Promise<
  { label: string; value: number; href: string }[]
> {
  const r = (
    await (
      await db()
    ).query(
      `SELECT
         (SELECT count(DISTINCT (account_id, version)) FROM derpy_picture_reports
          r WHERE EXISTS (SELECT 1 FROM derpy_pictures p
            WHERE p.account_id = r.account_id AND p.version = r.version))::int
           AS reported,
         (SELECT count(*) FROM derpy_picture_log
          WHERE kind = 'upload' AND created_at > now() - interval '7 days')::int
           AS week`,
    )
  ).rows[0];
  return [
    {
      label: "Reported pictures",
      value: Number(r.reported),
      href: "/admin/moderation/reports",
    },
    {
      label: "Pictures uploaded this week",
      value: Number(r.week),
      href: "/admin/moderation/pictures",
    },
  ];
}

// ---------------------------------------------------------------- the routes

type Authed = Request & { derpy?: { account: Account; token: string } };
type Wrap = (
  fn: (req: Authed, res: Response) => Promise<unknown>,
) => (req: Request, res: Response, next: NextFunction) => void;

const ERROR_STATUS: Record<PictureError, number> = {
  bad_type: 415,
  bad_image: 422,
  unsupported: 415,
  too_big: 422,
  too_small: 422,
  too_large: 413,
  rate_limited: 429,
  uploads_blocked: 403,
  locked: 403,
  invalid: 400,
  not_found: 404,
  yourself: 400,
};

const Choose = z.object({ picture: z.string().max(60).nullable() });
const Target = z.object({
  account: z.coerce.number().int().positive(),
  version: z.string().regex(VERSION_RE),
});
const Reason = z.string().max(500).nullish();
const Remove = z.object({
  account: z.coerce.number().int().positive(),
  block: z.boolean().optional(),
  reason: Reason,
});
const Block = z.object({
  account: z.coerce.number().int().positive(),
  blocked: z.boolean(),
  reason: Reason,
});
const Dismiss = Target.extend({ reason: Reason });

/** Mounted by DerpyApi at /derpy/api/pictures. */
export function picturesRouter({
  handle,
  requireAccount,
}: {
  handle: Wrap;
  requireAccount: Wrap;
}): express.Router {
  const router = express.Router();
  const json = express.json({ limit: "4kb" });
  // Counted per session (friends may share a house's address), or per
  // address without one. The day's limit on uploads is the account's own.
  const perSession = (req: Request) => {
    const token = req.headers.authorization ?? "";
    return token
      ? `s:${hashToken(token).slice(0, 24)}`
      : ipKeyGenerator(req.ip ?? "");
  };
  const limit = (n: number) =>
    rateLimit({ windowMs: 60_000, limit: n, keyGenerator: perSession });
  const chooseLimiter = limit(30);
  const uploadLimiter = limit(10);
  const modLimiter = limit(120);
  const raw = express.raw({ type: () => true, limit: UPLOAD_MAX_BYTES });

  const answer = (res: Response, r: { error: PictureError } | object) => {
    if ("error" in r) {
      res.status(ERROR_STATUS[r.error]).json({ error: r.error });
      return;
    }
    const rest: Record<string, unknown> = { ...r };
    delete rest.ok;
    res.json(rest);
  };

  /** The owner's routes: anyone else finds nothing here. */
  const ownerOnly = (
    fn: (req: Authed, res: Response, actor: number) => Promise<unknown>,
  ) =>
    requireAccount(async (req, res) => {
      const actor = req.derpy!.account.id;
      if (!(await isPictureModerator(await db(), actor))) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await fn(req, res, actor);
    });

  // An uploaded picture. A new upload is a new version (a new address), so
  // this one never changes: browsers keep it for a year. Removed: gone.
  router.get(
    "/:account/:file",
    handle(async (req, res) => {
      const m = /^([0-9a-f]{12})\.jpg$/.exec(String(req.params.file));
      const account = Number(req.params.account);
      const data =
        m && Number.isSafeInteger(account) && account > 0
          ? await pictureBytes(account, m[1])
          : null;
      if (data === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.removeHeader("Pragma");
      res.removeHeader("Expires");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.setHeader("Content-Disposition", "inline");
      res.end(data);
    }),
  );

  // Where the signed-in account stands: may it upload, how many more today,
  // its own upload (worn or not).
  router.get(
    "/mine",
    requireAccount(async (req, res) => {
      res.json(await uploadStatus(req.derpy!.account.id));
    }),
  );

  router.post(
    "/choose",
    chooseLimiter,
    json,
    requireAccount(async (req, res) => {
      const body = Choose.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      answer(
        res,
        await choosePicture(req.derpy!.account.id, body.data.picture),
      );
    }),
  );

  router.post(
    "/upload",
    uploadLimiter,
    (req: Request, res: Response, next: NextFunction) => {
      raw(req, res, (err?: unknown) => {
        if (err) {
          const tooBig = (err as { type?: string }).type === "entity.too.large";
          res
            .status(tooBig ? 413 : 400)
            .json({ error: tooBig ? "too_large" : "invalid" });
          return;
        }
        next();
      });
    },
    requireAccount(async (req, res) => {
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (body.length === 0) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      answer(res, await uploadPicture(req.derpy!.account.id, body));
    }),
  );

  router.post(
    "/report",
    chooseLimiter,
    json,
    requireAccount(async (req, res) => {
      const body = Target.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      answer(
        res,
        await reportPicture(
          req.derpy!.account.id,
          body.data.account,
          body.data.version,
        ),
      );
    }),
  );

  // ---- the owner's (PROFILE r26: until ADMIN's sections take them over)
  router.get(
    "/moderation",
    modLimiter,
    ownerOnly(async (_req, res) => {
      res.json(await moderationView());
    }),
  );
  router.post(
    "/moderation/remove",
    modLimiter,
    json,
    ownerOnly(async (req, res, actor) => {
      const body = Remove.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      const r = await removePicture(body.data.account, {
        block: body.data.block === true,
        reason: body.data.reason,
        audit: logAudit(actor),
      });
      if ("error" in r) answer(res, r);
      else res.json(await moderationView());
    }),
  );
  router.post(
    "/moderation/block",
    modLimiter,
    json,
    ownerOnly(async (req, res, actor) => {
      const body = Block.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      const r = await blockUploads(body.data.account, {
        blocked: body.data.blocked,
        reason: body.data.reason,
        audit: logAudit(actor),
      });
      if ("error" in r) answer(res, r);
      else res.json(await moderationView());
    }),
  );
  router.post(
    "/moderation/dismiss",
    modLimiter,
    json,
    ownerOnly(async (req, res, actor) => {
      const body = Dismiss.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      await dismissReports(body.data.account, body.data.version, {
        reason: body.data.reason,
        audit: logAudit(actor),
      });
      res.json(await moderationView());
    }),
  );

  return router;
}

// ---------------------------------------------------------------- for other pages

/** What a player's page adds: their account, picture and badges. */
export async function profileExtras(username: string): Promise<{
  accountId: number;
  picture: string | null;
  badges: PlayerBadges;
} | null> {
  const r = await (
    await db()
  ).query("SELECT id FROM derpy_accounts WHERE username_key = $1", [
    username.toLowerCase(),
  ]);
  if (!r.rows[0]) return null;
  const id = Number(r.rows[0].id);
  const [badges, looks] = await Promise.all([playerBadges(id), looksOf([id])]);
  return { accountId: id, picture: looks.get(id)?.pic ?? null, badges };
}

/** What the signed-in account's /me adds: its picture, its pins, and whether it moderates. */
export async function meExtras(accountId: number): Promise<{
  picture: string | null;
  pinned: string[];
  moderator?: true;
}> {
  const look = (await looksOf([accountId])).get(accountId);
  const mod = await isPictureModerator(await db(), accountId);
  return {
    picture: look?.pic ?? null,
    pinned: look?.badges ?? [],
    ...(mod ? { moderator: true as const } : {}),
  };
}
