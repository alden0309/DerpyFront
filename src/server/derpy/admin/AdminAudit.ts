// ADMIN (r26): the audit log. Every admin action writes one line (who,
// what, to what, before and after, the reason given, and when), in the same
// transaction as the change when there is one, so a change is never made
// without its line (or the line kept for a change that didn't happen).

import type pg from "pg";
import { db } from "../DerpyDb";

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

export interface AuditTarget {
  type: string;
  id: string | number;
  name?: string | null;
}

export interface AuditEntry {
  /** What was done, as "<area>.<verb>": "coins.give", "account.suspend". */
  action: string;
  target?: AuditTarget;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
}

export interface AuditActor {
  id: number;
  username: string;
}

export async function writeAudit(
  q: Queryable,
  actor: AuditActor,
  e: AuditEntry,
): Promise<void> {
  await q.query(
    `INSERT INTO derpy_admin_audit
       (actor_id, actor_name, action, target_type, target_id, target_name,
        reason, before, after)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      actor.id,
      actor.username,
      e.action,
      e.target?.type ?? null,
      e.target ? String(e.target.id) : null,
      e.target?.name ?? null,
      e.reason ?? null,
      e.before === undefined ? null : JSON.stringify(e.before),
      e.after === undefined ? null : JSON.stringify(e.after),
    ],
  );
}

export interface AuditRow {
  id: number;
  at: string;
  actor: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
}

export interface AuditFilter {
  /** Words to find in the action, the target's name, the reason or who did it. */
  q?: string;
  /** An action, or a whole area ("coins" finds "coins.give" and "coins.take"). */
  action?: string;
  /** One target: its type and id. */
  targetType?: string;
  targetId?: string;
  page?: number;
}

export const AUDIT_PAGE = 50;

/** One page of the log, newest first, and how many lines match in all. */
export async function auditPage(
  f: AuditFilter,
): Promise<{ rows: AuditRow[]; total: number; page: number; pages: number }> {
  const where: string[] = [];
  const args: unknown[] = [];
  const arg = (v: unknown) => {
    args.push(v);
    return `$${args.length}`;
  };
  if (f.q) {
    const like = arg(`%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(
      `(action ILIKE ${like} OR target_name ILIKE ${like} OR reason ILIKE ${like} OR actor_name ILIKE ${like} OR target_id = ${arg(f.q)})`,
    );
  }
  if (f.action) {
    where.push(
      f.action.includes(".")
        ? `action = ${arg(f.action)}`
        : `split_part(action, '.', 1) = ${arg(f.action)}`,
    );
  }
  if (f.targetType) where.push(`target_type = ${arg(f.targetType)}`);
  if (f.targetId) where.push(`target_id = ${arg(f.targetId)}`);
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const pool = await db();
  const total = Number(
    (
      await pool.query(
        `SELECT count(*)::int AS n FROM derpy_admin_audit ${w}`,
        args,
      )
    ).rows[0].n,
  );
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE));
  const page = Math.min(Math.max(1, Math.floor(f.page ?? 1)), pages);
  const r = await pool.query(
    `SELECT * FROM derpy_admin_audit ${w}
     ORDER BY at DESC, id DESC LIMIT ${AUDIT_PAGE} OFFSET ${(page - 1) * AUDIT_PAGE}`,
    args,
  );
  return {
    rows: r.rows.map((x) => ({
      id: Number(x.id),
      at: new Date(x.at).toISOString(),
      actor: String(x.actor_name),
      action: String(x.action),
      targetType: x.target_type,
      targetId: x.target_id,
      targetName: x.target_name,
      reason: x.reason,
      before: x.before,
      after: x.after,
    })),
    total,
    page,
    pages,
  };
}

/** The actions in the log so far, for the filter. */
export async function auditActions(): Promise<string[]> {
  const r = await (
    await db()
  ).query("SELECT DISTINCT action FROM derpy_admin_audit ORDER BY action");
  return r.rows.map((x) => String(x.action));
}
