// ADMIN (r26): the site banner the owner sets on the admin page: one row in
// derpy_site_banner, kept in the master's memory once read, so serving it
// (on every beat and What's New's list) costs no database query. Only the
// admin page changes it, here in the master, so memory is never stale.

import type pg from "pg";
import type { SiteBanner } from "../../derpland/BannerTypes";
import { logger } from "../Logger";
import { db, derpyDbConfigured } from "./DerpyDb";

const log = logger.child({ component: "SiteBanner" });

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

export interface BannerSetting {
  enabled: boolean;
  text: string;
  link: string | null;
  linkText: string | null;
  /** ms since 1970, or null: no end. */
  endsAt: number | null;
  version: number;
  updatedAt: string | null;
}

const OFF: BannerSetting = {
  enabled: false,
  text: "",
  link: null,
  linkText: null,
  endsAt: null,
  version: 0,
  updatedAt: null,
};

let current: BannerSetting = OFF;
let loading: Promise<void> | null = null;

function fromRow(r: Record<string, unknown> | undefined): BannerSetting {
  if (!r) return OFF;
  return {
    enabled: r.enabled === true,
    text: String(r.text ?? ""),
    link: (r.link as string | null) ?? null,
    linkText: (r.link_text as string | null) ?? null,
    endsAt: r.ends_at ? new Date(r.ends_at as string).getTime() : null,
    version: Number(r.version ?? 0),
    updatedAt: r.updated_at
      ? new Date(r.updated_at as string).toISOString()
      : null,
  };
}

/** Reads the banner once (the master, at startup); later calls wait on the same read. */
export function loadBanner(): Promise<void> {
  if (!derpyDbConfigured()) return Promise.resolve();
  loading ??= (async () => {
    const r = await (
      await db()
    ).query("SELECT * FROM derpy_site_banner WHERE id = 1");
    current = fromRow(r.rows[0]);
  })().catch((err: unknown) => {
    log.warn(`couldn't read the site banner: ${err}`);
    loading = null;
  });
  return loading;
}

/** The banner as pages get it: null while it's off, empty or over. */
export function siteBanner(now = Date.now()): SiteBanner | null {
  const b = current;
  if (!b.enabled || !b.text || (b.endsAt !== null && b.endsAt <= now))
    return null;
  return {
    v: b.version,
    text: b.text,
    ...(b.link ? { link: b.link } : {}),
    ...(b.link && b.linkText ? { linkText: b.linkText } : {}),
    ...(b.endsAt !== null ? { endsAt: new Date(b.endsAt).toISOString() } : {}),
  };
}

/**
 * The banner, read from the database the first time after a start (one
 * query), from memory every time after.
 */
export async function currentBanner(): Promise<SiteBanner | null> {
  await loadBanner();
  return siteBanner();
}

/** The setting as the admin page shows it (read fresh). */
export async function bannerSetting(q?: Queryable): Promise<BannerSetting> {
  const r = await (q ?? (await db())).query(
    "SELECT * FROM derpy_site_banner WHERE id = 1",
  );
  return fromRow(r.rows[0]);
}

/** Saves a new setting (a new version, so it shows again to those who dismissed the old). */
export async function saveBanner(
  q: Queryable,
  b: Omit<BannerSetting, "version" | "updatedAt">,
): Promise<BannerSetting> {
  const r = await q.query(
    `INSERT INTO derpy_site_banner (id, enabled, text, link, link_text, ends_at, version, updated_at)
     VALUES (1, $1, $2, $3, $4, $5, 1, now())
     ON CONFLICT (id) DO UPDATE SET enabled = $1, text = $2, link = $3,
       link_text = $4, ends_at = $5, version = derpy_site_banner.version + 1,
       updated_at = now()
     RETURNING *`,
    [
      b.enabled,
      b.text,
      b.link,
      b.linkText,
      b.endsAt === null ? null : new Date(b.endsAt),
    ],
  );
  return fromRow(r.rows[0]);
}

/** After the change commits: what's served from now. */
export function useBanner(b: BannerSetting): void {
  current = b;
}

/** For tests: as a restart would. */
export function forgetBanner(): void {
  current = OFF;
  loading = null;
}
