// PROFILE (r26): what each account shows beside its name: its picture and
// the badges it pins. Read by account id (a rename changes nothing here),
// kept in memory once read so who's online (whose beat never touches the
// database while nothing changes) and the lists stay cheap, and forgotten at
// once when this process changes it (a new picture, new pins, the owner
// removing an upload). Only the master changes them.

import type pg from "pg";
import { BADGE_BY_KEY, PIN_MAX } from "../../derpland/Badges";
import { type Look, parsePic } from "../../derpland/Pictures";
import { db } from "./DerpyDb";

/** What's kept is read again after this long anyway. */
export const LOOK_CACHE_MS = 30 * 60_000;

const cache = new Map<number, { look: Look; at: number }>();

const DEFAULT: Look = { pic: null, badges: [] };

/** An account's look from its row (anything not right left out). */
export function lookFromRow(row: {
  picture?: unknown;
  pinned_badges?: unknown;
}): Look {
  const pic =
    typeof row.picture === "string" && parsePic(row.picture) !== null
      ? row.picture
      : null;
  const badges = Array.isArray(row.pinned_badges)
    ? row.pinned_badges
        .filter(
          (k): k is string => typeof k === "string" && BADGE_BY_KEY.has(k),
        )
        .slice(0, PIN_MAX)
    : [];
  return { pic, badges };
}

export const isDefaultLook = (l: Look) =>
  l.pic === null && l.badges.length === 0;

/** These accounts' looks (unknown ones: the default), the misses read in one query. */
export async function looksOf(
  ids: Iterable<number>,
  q?: Pick<pg.Pool, "query">,
): Promise<Map<number, Look>> {
  const out = new Map<number, Look>();
  const missing: number[] = [];
  const now = Date.now();
  for (const id of new Set(ids)) {
    const hit = cache.get(id);
    if (hit && now - hit.at < LOOK_CACHE_MS) out.set(id, hit.look);
    else missing.push(id);
  }
  if (missing.length === 0) return out;
  const r = await (q ?? (await db())).query(
    `SELECT id, picture, pinned_badges FROM derpy_accounts
     WHERE id = ANY($1::bigint[])`,
    [missing],
  );
  for (const row of r.rows) {
    const look = lookFromRow(row);
    out.set(Number(row.id), look);
    remember(Number(row.id), look);
  }
  for (const id of missing) if (!out.has(id)) out.set(id, DEFAULT);
  return out;
}

/** Looks by username (as the lists name people), lower-cased keys. */
export async function looksByName(
  names: Iterable<string>,
): Promise<Map<string, Look & { id: number }>> {
  const keys = [...new Set([...names].map((n) => n.toLowerCase()))];
  const out = new Map<string, Look & { id: number }>();
  if (keys.length === 0) return out;
  const r = await (
    await db()
  ).query(
    `SELECT id, username_key, picture, pinned_badges FROM derpy_accounts
     WHERE username_key = ANY($1::text[])`,
    [keys],
  );
  for (const row of r.rows) {
    const look = lookFromRow(row);
    remember(Number(row.id), look);
    out.set(String(row.username_key), { ...look, id: Number(row.id) });
  }
  return out;
}

/**
 * Each row with its account's picture and pins (`pic`, `badges`; left off
 * for the default), by its username.
 */
export async function withLooks<T extends { username: string }>(
  rows: T[],
): Promise<(T & Partial<Look>)[]> {
  const looks = await looksByName(rows.map((r) => r.username));
  return rows.map((r) => {
    const l = looks.get(r.username.toLowerCase());
    if (!l || isDefaultLook(l)) return r;
    return {
      ...r,
      ...(l.pic ? { pic: l.pic } : {}),
      ...(l.badges.length ? { badges: l.badges } : {}),
    };
  });
}

function remember(id: number, look: Look): void {
  if (cache.size >= 20_000) cache.delete(cache.keys().next().value!);
  cache.set(id, { look, at: Date.now() });
}

/** This account's look changed: read it again next time. */
export function forgetLook(id: number): void {
  cache.delete(id);
}

/** For tests: forget every look. */
export function forgetAllLooks(): void {
  cache.clear();
}
