// ADMIN (r26): Accounts. Find an account by name or id; its page (profile,
// coins and their history, purchases and items, recent games, friends,
// marks, sessions, where it is now, and what other sections add); and what
// the owner can do to it. Every change writes the audit log in the same
// transaction. The owner's own account can't be suspended, deleted or lose
// its Mr. Based mark from here (that mark is how the owner is known).

import { randomBytes } from "crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { englishSocial, placeText } from "../../../../derpland/SocialText";
import { hashToken } from "../../DerpyAuth";
import { DERPY_ITEMS, findItem, itemGrants } from "../../DerpyCatalog";
import { db, inTransaction } from "../../DerpyDb";
import { renameAccount } from "../../DerpyNames";
import { socialForgetAccount, socialRenamed } from "../../DerpySocial";
import { placeOf, presence } from "../../Presence";
import { forgetOwner, OWNER_SQL, SUSPENDED_SQL } from "../AdminAccess";
import {
  adminSection,
  idParam,
  type AdminCtx,
  type Queryable,
} from "../AdminRegistry";
import { basedSince, dropFromGames } from "../AdminSources";
import { ledger } from "../Ledger";

/** Coin changes bigger than this (either way) need a typed name and a fresh sign-in. */
export const COIN_CONFIRM_OVER = 1000;
/** A password reset link works this long, once. */
export const RESET_LINK_MS = 24 * 60 * 60 * 1000;

/** The marks the page can set or clear. */
export const ACCOUNT_MARKS = {
  based_access: "Plays Mr. Based",
  appear_offline: "Appears offline",
} as const;
export type AccountMark = keyof typeof ACCOUNT_MARKS;

interface AccountRow {
  id: number;
  username: string;
  coins: number;
  owner: boolean;
  basedAccess: boolean;
  appearOffline: boolean;
  suspended: boolean;
}

async function accountRow(
  q: Queryable,
  id: number,
  lock = false,
): Promise<AccountRow | null> {
  const r = await q.query(
    `SELECT a.id, a.username, a.coins, a.based_access, a.appear_offline,
       ${OWNER_SQL("a")} AS owner, ${SUSPENDED_SQL("a")} AS suspended
     FROM derpy_accounts a WHERE a.id = $1 ${lock ? "FOR UPDATE" : ""}`,
    [id],
  );
  const x = r.rows[0];
  if (!x) return null;
  return {
    id: Number(x.id),
    username: String(x.username),
    coins: Number(x.coins),
    owner: x.owner === true,
    basedAccess: x.based_access === true,
    appearOffline: x.appear_offline === true,
    suspended: x.suspended === true,
  };
}

const target = (a: { id: number; username: string }) => ({
  type: "account",
  id: a.id,
  name: a.username,
});

const Reason = z.string().trim().min(1).max(300);
const Confirm = z.string().max(100).optional();

function bad(res: Response, error: string, status = 400): void {
  res.status(status).json({ error });
}

/** The typed confirmation: the account's name exactly (or "delete <name>"). */
function confirmed(given: string | undefined, expected: string): boolean {
  return given !== undefined && given.trim() === expected;
}

/**
 * Runs `fn` on the account in a transaction (locked), or answers 404. `fn`
 * returns the JSON to send, or a string error (400).
 */
async function onAccount(
  req: Request,
  res: Response,
  fn: (
    c: Queryable,
    acc: AccountRow,
  ) => Promise<Record<string, unknown> | string | [number, string]>,
): Promise<void> {
  const id = idParam(req);
  if (id === null) return notThere(res);
  const out = await inTransaction(async (c) => {
    const acc = await accountRow(c, id, true);
    if (!acc) return null;
    return fn(c, acc);
  });
  if (out === null) return notThere(res);
  if (typeof out === "string") return bad(res, out);
  if (Array.isArray(out)) return bad(res, out[1], out[0]);
  res.json(out);
}

function notThere(res: Response): void {
  res.status(404).json({ error: "no_such_account" });
}

// ---- reading ---------------------------------------------------------------

async function search(req: Request, res: Response): Promise<void> {
  const q = String(req.query.q ?? "")
    .trim()
    .slice(0, 40);
  const sort = String(req.query.sort ?? "new");
  const order =
    sort === "seen"
      ? "last_seen DESC NULLS LAST, a.id DESC"
      : sort === "coins"
        ? "a.coins DESC, a.id DESC"
        : sort === "name"
          ? "a.username_key"
          : "a.id DESC";
  const args: unknown[] = [];
  const conds: string[] = [];
  if (/^#?\d{1,15}$/.test(q)) {
    args.push(Number(q.replace("#", "")), q.replace("#", "").toLowerCase());
    conds.push("(a.id = $1 OR a.username_key LIKE $2 || '%')");
  } else if (q) {
    args.push(`%${q.toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
    conds.push("(a.username_key LIKE $1 OR a.old_username_key LIKE $1)");
  }
  const filter = String(req.query.filter ?? "");
  if (filter === "suspended") conds.push(SUSPENDED_SQL("a"));
  if (filter === "based") conds.push("a.based_access");
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const r = await (
    await db()
  ).query(
    `SELECT a.id, a.username, a.coins, a.created_at, a.old_username,
       a.based_access, ${OWNER_SQL("a")} AS owner,
       ${SUSPENDED_SQL("a")} AS suspended, a.suspended_until,
       (SELECT max(s.last_seen) FROM derpy_sessions s WHERE s.account_id = a.id) AS last_seen,
       (SELECT count(*) FROM derpy_game_players gp WHERE gp.account_id = a.id)::int
         + (SELECT count(*) FROM derpy_conquest_players cp WHERE cp.account_id = a.id)::int AS games
     FROM derpy_accounts a ${where}
     ORDER BY ${order} LIMIT 100`,
    args,
  );
  const total = await (
    await db()
  ).query("SELECT count(*)::int AS n FROM derpy_accounts");
  const snap = presence.snapshot();
  res.json({
    total: total.rows[0].n,
    accounts: r.rows.map((x) => ({
      id: Number(x.id),
      username: x.username,
      oldName: x.old_username,
      coins: Number(x.coins),
      createdAt: new Date(x.created_at).toISOString(),
      lastSeen: x.last_seen ? new Date(x.last_seen).toISOString() : null,
      games: Number(x.games),
      owner: x.owner === true,
      basedAccess: x.based_access === true,
      suspended: x.suspended === true,
      suspendedUntil: x.suspended_until
        ? new Date(x.suspended_until).toISOString()
        : null,
      online: snap.has(Number(x.id)),
    })),
  });
}

async function accountPage(
  req: Request,
  res: Response,
  ctx: AdminCtx,
): Promise<void> {
  const id = idParam(req);
  if (id === null) return notThere(res);
  const pool = await db();
  const r = await pool.query(
    `SELECT a.*, ${OWNER_SQL("a")} AS owner, ${SUSPENDED_SQL("a")} AS suspended_now
     FROM derpy_accounts a WHERE a.id = $1`,
    [id],
  );
  const a = r.rows[0];
  if (!a) return notThere(res);
  const [
    owned,
    front,
    conquest,
    friends,
    party,
    sessions,
    resets,
    history,
    audit,
  ] = await Promise.all([
    pool.query(
      `SELECT item, acquired_at, granted, price FROM derpy_owned
         WHERE account_id = $1 ORDER BY acquired_at DESC, item`,
      [id],
    ),
    pool.query(
      `SELECT g.game_id, g.map, g.mode, g.ended_at, g.duration_s, g.num_players,
           g.scenario, gp.won, gp.coins
         FROM derpy_game_players gp JOIN derpy_games g ON g.game_id = gp.game_id
         WHERE gp.account_id = $1 ORDER BY g.ended_at DESC LIMIT 10`,
      [id],
    ),
    pool.query(
      `SELECT cg.game_id, cg.ended_at, cg.final_year, cg.num_players, cp.nation,
           cp.won, cp.coins
         FROM derpy_conquest_players cp
         JOIN derpy_conquest_games cg ON cg.game_id = cp.game_id
         WHERE cp.account_id = $1 ORDER BY cg.ended_at DESC LIMIT 10`,
      [id],
    ),
    pool.query(
      `SELECT
           (SELECT count(*) FROM derpy_friends WHERE account_id = $1)::int AS friends,
           (SELECT count(*) FROM derpy_friend_requests WHERE to_id = $1)::int AS requests_in,
           (SELECT count(*) FROM derpy_friend_requests WHERE from_id = $1)::int AS requests_out,
           (SELECT count(*) FROM derpy_game_players WHERE account_id = $1)::int AS front_games,
           (SELECT count(*) FROM derpy_conquest_players WHERE account_id = $1)::int AS conquest_games`,
      [id],
    ),
    pool.query(
      `SELECT p.id, p.leader_id = $1 AS leader,
           (SELECT count(*) FROM derpy_party_members m2 WHERE m2.party_id = p.id)::int AS size
         FROM derpy_party_members m JOIN derpy_parties p ON p.id = m.party_id
         WHERE m.account_id = $1`,
      [id],
    ),
    pool.query(
      `SELECT token_hash, created_at, last_seen FROM derpy_sessions
         WHERE account_id = $1 ORDER BY last_seen DESC`,
      [id],
    ),
    pool.query(
      `SELECT created_at, expires_at, used_at FROM derpy_password_resets
         WHERE account_id = $1 ORDER BY created_at DESC LIMIT 3`,
      [id],
    ),
    ledger({ accountId: id, limit: 40 }),
    pool.query(
      `SELECT id, at, actor_name, action, reason, before, after
         FROM derpy_admin_audit WHERE target_type = 'account' AND target_id = $1
         ORDER BY at DESC, id DESC LIMIT 20`,
      [String(id)],
    ),
  ]);
  // What other sections add (PROFILE's picture and badges, say).
  const panels: Record<string, unknown> = {};
  for (const s of ctx.sections) {
    if (!s.account) continue;
    try {
      const v = await s.account(id);
      if (v !== undefined) panels[s.id] = v;
    } catch (err) {
      panels[s.id] = { error: String(err).slice(0, 200) };
    }
  }
  const snap = presence.snapshot();
  const where = snap.get(id);
  const based = basedSince(Date.now() - 60 * 60 * 1000).get(id) ?? null;
  const items = owned.rows.map((o) => {
    const name = String(o.item);
    const shop = name.startsWith("pack:") ? findItem(name.slice(5)) : undefined;
    return {
      item: name,
      label: shop?.displayName ?? null,
      game: shop?.game ?? null,
      category: shop?.category ?? null,
      acquiredAt: new Date(o.acquired_at).toISOString(),
      granted: o.granted === true,
      price: o.price === null ? (shop?.price ?? null) : Number(o.price),
      priceKnown: o.price !== null,
    };
  });
  const f = friends.rows[0];
  res.json({
    account: {
      id: Number(a.id),
      username: a.username,
      coins: Number(a.coins),
      createdAt: new Date(a.created_at).toISOString(),
      oldName: a.old_username,
      usernameChangedAt: a.username_changed_at
        ? new Date(a.username_changed_at).toISOString()
        : null,
      owner: a.owner === true,
      marks: {
        based_access: a.based_access === true,
        appear_offline: a.appear_offline === true,
      },
      basedGrantedAs: a.based_granted_as,
      suspension:
        a.suspended_at === null
          ? null
          : {
              at: new Date(a.suspended_at).toISOString(),
              until: a.suspended_until
                ? new Date(a.suspended_until).toISOString()
                : null,
              reason: a.suspended_reason,
              now: a.suspended_now === true,
            },
      newsSeen: a.news_seen,
    },
    online: where
      ? {
          place: placeText(placeOf(where), englishSocial),
          hidden: presence.hidden(id),
        }
      : null,
    basedLastActive: based === null ? null : new Date(based).toISOString(),
    items,
    // Every item in the store, for granting.
    store: DERPY_ITEMS.map((i) => ({
      name: i.name,
      label: i.displayName,
      game: i.game,
      category: i.category,
      price: i.price,
    })),
    games: {
      derpyfront: front.rows.map((g) => ({
        gameId: g.game_id,
        map: g.map,
        mode: g.mode,
        scenario: g.scenario,
        endedAt: new Date(g.ended_at).toISOString(),
        durationS: g.duration_s,
        players: g.num_players,
        won: g.won,
        coins: g.coins,
      })),
      conquest: conquest.rows.map((g) => ({
        gameId: g.game_id,
        endedAt: new Date(g.ended_at).toISOString(),
        year: g.final_year,
        players: g.num_players,
        nation: g.nation,
        won: g.won,
        coins: g.coins,
      })),
      frontCount: f.front_games,
      conquestCount: f.conquest_games,
    },
    social: {
      friends: f.friends,
      requestsIn: f.requests_in,
      requestsOut: f.requests_out,
      party: party.rows[0]
        ? { leader: party.rows[0].leader === true, size: party.rows[0].size }
        : null,
    },
    sessions: sessions.rows.map((s) => ({
      // A short tag to tell them apart; never the token or its whole hash.
      tag: String(s.token_hash).slice(0, 6),
      createdAt: new Date(s.created_at).toISOString(),
      lastSeen: new Date(s.last_seen).toISOString(),
      current: s.token_hash === ctx.owner.tokenHash,
    })),
    resets: resets.rows.map((x) => ({
      createdAt: new Date(x.created_at).toISOString(),
      expiresAt: new Date(x.expires_at).toISOString(),
      usedAt: x.used_at ? new Date(x.used_at).toISOString() : null,
    })),
    history,
    audit: audit.rows.map((x) => ({
      id: Number(x.id),
      at: new Date(x.at).toISOString(),
      actor: x.actor_name,
      action: x.action,
      reason: x.reason,
      before: x.before,
      after: x.after,
    })),
    panels,
  });
}

// ---- changing ----------------------------------------------------------------

const CoinsBody = z.object({
  delta: z
    .number()
    .int()
    .refine((n) => n !== 0 && Math.abs(n) <= 1_000_000),
  reason: Reason,
  confirm: Confirm,
});

const bigCoinChange = (body: unknown) => {
  const d = (body as { delta?: unknown } | undefined)?.delta;
  return typeof d === "number" && Math.abs(d) > COIN_CONFIRM_OVER;
};

async function changeCoins(
  req: Request,
  res: Response,
  ctx: AdminCtx,
): Promise<void> {
  const body = CoinsBody.safeParse(req.body);
  if (!body.success) return bad(res, "invalid");
  const { delta, reason, confirm } = body.data;
  await onAccount(req, res, async (c, acc) => {
    if (
      Math.abs(delta) > COIN_CONFIRM_OVER &&
      !confirmed(confirm, acc.username)
    )
      return "confirm";
    if (acc.coins + delta < 0) return "not_enough_coins";
    const r = await c.query(
      "UPDATE derpy_accounts SET coins = coins + $2 WHERE id = $1 RETURNING coins",
      [acc.id, delta],
    );
    const coins = Number(r.rows[0].coins);
    await c.query(
      `INSERT INTO derpy_coin_adjustments (account_id, delta, kind, reason, balance)
       VALUES ($1, $2, 'admin', $3, $4)`,
      [acc.id, delta, reason, coins],
    );
    await ctx.audit(
      {
        action: delta > 0 ? "coins.give" : "coins.take",
        target: target(acc),
        reason,
        before: { coins: acc.coins },
        after: { coins, delta },
      },
      c,
    );
    return { coins };
  });
}

const ItemBody = z.object({
  item: z.string().max(60),
  reason: Reason.optional(),
});

async function grantItem(
  req: Request,
  res: Response,
  ctx: AdminCtx,
): Promise<void> {
  const body = ItemBody.safeParse(req.body);
  const item = body.success ? findItem(body.data.item) : undefined;
  if (!body.success || !item) return bad(res, "no_such_item");
  await onAccount(req, res, async (c, acc) => {
    const had = await c.query(
      "SELECT 1 FROM derpy_owned WHERE account_id = $1 AND item = $2",
      [acc.id, `pack:${item.name}`],
    );
    if ((had.rowCount ?? 0) > 0) return "already_owned";
    await c.query(
      `INSERT INTO derpy_owned (account_id, item, granted)
       SELECT $1, unnest($2::text[]), true ON CONFLICT DO NOTHING`,
      [acc.id, itemGrants(item)],
    );
    await ctx.audit(
      {
        action: "items.grant",
        target: target(acc),
        reason: body.data.reason ?? null,
        after: { item: item.name, label: item.displayName },
      },
      c,
    );
    return { ok: true };
  });
}

async function revokeItem(
  req: Request,
  res: Response,
  ctx: AdminCtx,
): Promise<void> {
  const body = ItemBody.safeParse(req.body);
  if (!body.success) return bad(res, "no_such_item");
  const name = body.data.item.replace(/^pack:/, "");
  const item = findItem(name);
  await onAccount(req, res, async (c, acc) => {
    const owned = await c.query(
      "SELECT item, granted, price FROM derpy_owned WHERE account_id = $1",
      [acc.id],
    );
    const rows = owned.rows.map((o) => String(o.item));
    const packRow = owned.rows.find((o) => o.item === `pack:${name}`);
    if (!packRow) return "not_owned";
    // What the item gave, less what another item they own gives too.
    const mine = item ? itemGrants(item) : [`pack:${name}`];
    const others = new Set(
      rows
        .filter((r) => r.startsWith("pack:") && r !== `pack:${name}`)
        .flatMap((r) => {
          const other = findItem(r.slice(5));
          return other ? itemGrants(other) : [];
        }),
    );
    const drop = mine.filter((r) => !others.has(r));
    await c.query(
      "DELETE FROM derpy_owned WHERE account_id = $1 AND item = ANY($2::text[])",
      [acc.id, drop],
    );
    await ctx.audit(
      {
        action: "items.revoke",
        target: target(acc),
        reason: body.data.reason ?? null,
        before: {
          item: name,
          label: item?.displayName ?? null,
          granted: packRow.granted === true,
          price: packRow.price,
        },
      },
      c,
    );
    return { ok: true };
  });
}

const MarkBody = z.object({
  mark: z.enum(Object.keys(ACCOUNT_MARKS) as [AccountMark, ...AccountMark[]]),
  value: z.boolean(),
  confirm: Confirm,
});

async function setMark(
  req: Request,
  res: Response,
  ctx: AdminCtx,
): Promise<void> {
  const body = MarkBody.safeParse(req.body);
  if (!body.success) return bad(res, "invalid");
  const { mark, value, confirm } = body.data;
  await onAccount(req, res, async (c, acc) => {
    if (mark === "based_access") {
      if (acc.owner) return "own_account";
      if (!confirmed(confirm, acc.username)) return "confirm";
      // Given by hand: never with the owner's name mark (based_granted_as),
      // so it never makes anyone the owner. Taken away, the name it was
      // first given under stays used, so a restart doesn't give it back.
      await c.query(
        "UPDATE derpy_accounts SET based_access = $2 WHERE id = $1",
        [acc.id, value],
      );
    } else {
      await c.query(
        "UPDATE derpy_accounts SET appear_offline = $2 WHERE id = $1",
        [acc.id, value],
      );
      presence.setHidden(acc.id, value);
    }
    await ctx.audit(
      {
        action: value ? "marks.set" : "marks.clear",
        target: target(acc),
        before: {
          [mark]: mark === "based_access" ? acc.basedAccess : acc.appearOffline,
        },
        after: { [mark]: value },
      },
      c,
    );
    return { ok: true };
  });
  forgetOwner();
}

const RenameBody = z.object({
  username: z.string().max(100),
  confirm: Confirm,
});

async function rename(
  req: Request,
  res: Response,
  ctx: AdminCtx,
): Promise<void> {
  const body = RenameBody.safeParse(req.body);
  const id = idParam(req);
  if (!body.success || id === null) return bad(res, "invalid_username");
  const pool = await db();
  const acc = await accountRow(pool, id);
  if (!acc) return notThere(res);
  if (!confirmed(body.data.confirm, acc.username)) return bad(res, "confirm");
  const result = await renameAccount(id, body.data.username, Date.now(), {
    force: true,
  });
  if (!result.ok) return bad(res, result.error, 409);
  socialRenamed(id, result.username);
  await ctx.audit({
    action: "account.rename",
    target: { type: "account", id, name: result.username },
    reason:
      typeof req.body?.reason === "string"
        ? req.body.reason.slice(0, 300)
        : null,
    before: { username: acc.username },
    after: { username: result.username },
  });
  res.json({ username: result.username });
}

async function signOutEverywhere(
  req: Request,
  res: Response,
  ctx: AdminCtx,
): Promise<void> {
  const confirm = Confirm.safeParse(req.body?.confirm);
  await onAccount(req, res, async (c, acc) => {
    if (!confirmed(confirm.success ? confirm.data : undefined, acc.username))
      return "confirm";
    const r = await c.query(
      "DELETE FROM derpy_sessions WHERE account_id = $1",
      [acc.id],
    );
    await ctx.audit(
      {
        action: "account.signout",
        target: target(acc),
        after: { sessions: r.rowCount ?? 0 },
      },
      c,
    );
    return { sessions: r.rowCount ?? 0 };
  });
  const id = idParam(req);
  if (id !== null) socialForgetAccount(id);
}

const SuspendBody = z.object({
  reason: Reason,
  /** When it ends (ISO), or null: until lifted. */
  until: z.string().datetime({ offset: true }).nullable().optional(),
  confirm: Confirm,
});

async function suspend(
  req: Request,
  res: Response,
  ctx: AdminCtx,
): Promise<void> {
  const body = SuspendBody.safeParse(req.body);
  if (!body.success) return bad(res, "invalid");
  const until = body.data.until ? new Date(body.data.until) : null;
  if (until !== null && until.getTime() <= Date.now())
    return bad(res, "until_past");
  let playIds: string[] | null = null;
  await onAccount(req, res, async (c, acc) => {
    if (acc.owner) return "own_account";
    if (!confirmed(body.data.confirm, acc.username)) return "confirm";
    await c.query(
      `UPDATE derpy_accounts SET suspended_at = now(), suspended_until = $2,
         suspended_reason = $3 WHERE id = $1`,
      [acc.id, until, body.data.reason],
    );
    // No sign-in from now: every session goes too (and, below, every game
    // it's in).
    const s = await c.query(
      "DELETE FROM derpy_sessions WHERE account_id = $1 RETURNING play_id",
      [acc.id],
    );
    playIds = s.rows.map((r) => String(r.play_id));
    await ctx.audit(
      {
        action: "account.suspend",
        target: target(acc),
        reason: body.data.reason,
        after: {
          until: until?.toISOString() ?? null,
          sessionsEnded: s.rowCount ?? 0,
        },
      },
      c,
    );
    return { ok: true };
  });
  const id = idParam(req);
  if (id !== null) socialForgetAccount(id);
  if (id !== null && playIds !== null)
    await dropFromGames(id, playIds, "This account is suspended.");
}

async function unsuspend(
  req: Request,
  res: Response,
  ctx: AdminCtx,
): Promise<void> {
  await onAccount(req, res, async (c, acc) => {
    const r = await c.query(
      `UPDATE derpy_accounts SET suspended_at = NULL, suspended_until = NULL,
         suspended_reason = NULL WHERE id = $1 AND suspended_at IS NOT NULL
       RETURNING id`,
      [acc.id],
    );
    if ((r.rowCount ?? 0) === 0) return "not_suspended";
    await ctx.audit(
      {
        action: "account.unsuspend",
        target: target(acc),
        reason:
          typeof req.body?.reason === "string"
            ? req.body.reason.slice(0, 300)
            : null,
      },
      c,
    );
    return { ok: true };
  });
}

async function resetLink(
  req: Request,
  res: Response,
  ctx: AdminCtx,
): Promise<void> {
  const confirm = Confirm.safeParse(req.body?.confirm);
  await onAccount(req, res, async (c, acc) => {
    if (!confirmed(confirm.success ? confirm.data : undefined, acc.username))
      return "confirm";
    const token = randomBytes(32).toString("base64url");
    // Only the newest link works.
    await c.query(
      "DELETE FROM derpy_password_resets WHERE account_id = $1 AND used_at IS NULL",
      [acc.id],
    );
    const expires = new Date(Date.now() + RESET_LINK_MS);
    await c.query(
      `INSERT INTO derpy_password_resets (token_hash, account_id, expires_at)
       VALUES ($1, $2, $3)`,
      [hashToken(token), acc.id, expires],
    );
    await ctx.audit(
      {
        action: "account.reset_link",
        target: target(acc),
        after: { expiresAt: expires.toISOString() },
      },
      c,
    );
    return {
      path: `/reset-password#${token}`,
      expiresAt: expires.toISOString(),
    };
  });
}

async function deleteAccount(
  req: Request,
  res: Response,
  ctx: AdminCtx,
): Promise<void> {
  const confirm = Confirm.safeParse(req.body?.confirm);
  const reason =
    typeof req.body?.reason === "string" ? req.body.reason.slice(0, 300) : null;
  let playIds: string[] | null = null;
  await onAccount(req, res, async (c, acc) => {
    if (acc.owner) return "own_account";
    if (
      !confirmed(
        confirm.success ? confirm.data : undefined,
        `delete ${acc.username}`,
      )
    )
      return "confirm";
    const counts = await c.query(
      `SELECT
         (SELECT count(*) FROM derpy_game_players WHERE account_id = $1)::int AS front_games,
         (SELECT count(*) FROM derpy_conquest_players WHERE account_id = $1)::int AS conquest_games,
         (SELECT count(*) FROM derpy_owned WHERE account_id = $1)::int AS items,
         (SELECT count(*) FROM derpy_friends WHERE account_id = $1)::int AS friends`,
      [acc.id],
    );
    const sessions = await c.query(
      "SELECT play_id FROM derpy_sessions WHERE account_id = $1",
      [acc.id],
    );
    playIds = sessions.rows.map((r) => String(r.play_id));
    // The existing rules do the rest: every table keyed to the account
    // deletes its rows with it (ON DELETE CASCADE).
    await c.query("DELETE FROM derpy_accounts WHERE id = $1", [acc.id]);
    await ctx.audit(
      {
        action: "account.delete",
        target: target(acc),
        reason,
        before: { username: acc.username, coins: acc.coins, ...counts.rows[0] },
      },
      c,
    );
    return { ok: true };
  });
  const id = idParam(req);
  if (id !== null) socialForgetAccount(id);
  if (id !== null && playIds !== null)
    await dropFromGames(id, playIds, "This account has been deleted.");
}

export const accounts = adminSection({
  id: "accounts",
  routes: [
    { method: "get", path: "/", handler: search },
    { method: "get", path: "/:id", handler: accountPage },
    {
      method: "post",
      path: "/:id/coins",
      fresh: bigCoinChange,
      handler: changeCoins,
    },
    { method: "post", path: "/:id/items/grant", handler: grantItem },
    { method: "post", path: "/:id/items/revoke", handler: revokeItem },
    {
      method: "post",
      path: "/:id/marks",
      fresh: (b) =>
        (b as { mark?: unknown } | undefined)?.mark === "based_access",
      handler: setMark,
    },
    { method: "post", path: "/:id/rename", fresh: true, handler: rename },
    {
      method: "post",
      path: "/:id/signout",
      fresh: true,
      handler: signOutEverywhere,
    },
    { method: "post", path: "/:id/suspend", fresh: true, handler: suspend },
    { method: "post", path: "/:id/unsuspend", handler: unsuspend },
    {
      method: "post",
      path: "/:id/reset-link",
      fresh: true,
      handler: resetLink,
    },
    {
      method: "post",
      path: "/:id/delete",
      fresh: true,
      handler: deleteAccount,
    },
  ],
  overview: async () => {
    const r = await (
      await db()
    ).query(
      `SELECT count(*)::int AS n FROM derpy_accounts a WHERE ${SUSPENDED_SQL("a")}`,
    );
    return r.rows[0].n > 0
      ? [
          {
            label: "Suspended accounts",
            value: r.rows[0].n,
            href: "/admin/accounts?filter=suspended",
          },
        ]
      : [];
  },
});
