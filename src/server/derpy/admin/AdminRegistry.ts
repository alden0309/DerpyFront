// ADMIN (r26): the server's half of an admin section. A section is one
// object in sections/index.ts's list: its routes (mounted under
// /derpy/api/admin/<id>/, every one already behind the owner's gate), and
// optionally what it adds to an account's page and to the Overview. Adding
// a section is a new file and one line in that list; no other section
// changes.
//
// What a section gets for free:
// - only the owner reaches its routes; anyone else gets the site's plain
//   404 (before any body is read);
// - its POSTs are checked for the site's own Origin, and their JSON body is
//   parsed (up to 64 KB);
// - `fresh` routes refuse with 403 stale_sign_in unless the owner signed in
//   (or typed his password again) in the last 12 hours;
// - ctx.audit writes the audit log's line (pass the transaction's client
//   so the line commits with the change);
// - a thrown error is a JSON 500, and lands in the Overview's recent errors.

import type { Request, Response } from "express";
import type pg from "pg";
import type { AuditEntry } from "./AdminAudit";
import type { OwnerSession } from "./AdminAccess";

export type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

export interface AdminCtx {
  /** The owner, signed in on this session. */
  owner: OwnerSession;
  /** Every section on the page (to gather account panels, say). */
  sections: readonly AdminServerSection[];
  /** Writes the audit log's line, in `q` (a transaction) when given. */
  audit(entry: AuditEntry, q?: Queryable): Promise<void>;
}

export type AdminHandler = (
  req: Request,
  res: Response,
  ctx: AdminCtx,
) => Promise<unknown>;

export interface AdminRoute {
  method: "get" | "post";
  /** Under the section: "/" or "/:id/coins". */
  path: string;
  /**
   * POST only: needs a sign-in within 12 hours (or the password again).
   * A function decides from the parsed body (a coin change over the
   * threshold, say).
   */
  fresh?: boolean | ((body: unknown) => boolean);
  handler: AdminHandler;
}

/** One line on the Overview ("Reported pictures: 3"). */
export interface OverviewLine {
  label: string;
  value: string | number;
  /** A page of the admin to go to: "/admin/moderation/pictures". */
  href?: string;
}

export interface AdminServerSection {
  /** The section's id: its API path and the page's /admin/<id>. */
  id: string;
  routes?: AdminRoute[];
  /**
   * What this section adds to an account's page, sent to the page as
   * `panels[<id>]` beside the account (the client's account panel with the
   * same id shows it). Return undefined to add nothing.
   */
  account?(accountId: number): Promise<unknown>;
  /** Lines this section adds to the Overview. */
  overview?(): Promise<OverviewLine[]>;
}

/** A typed way to write a section (it only checks the shape). */
export function adminSection(s: AdminServerSection): AdminServerSection {
  return s;
}

/** Reads a route's id parameter as a positive whole number, or null. */
export function idParam(req: Request, name = "id"): number | null {
  const v = Number(req.params[name]);
  return Number.isSafeInteger(v) && v > 0 ? v : null;
}
