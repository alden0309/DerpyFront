/**
 * DFX (r26): a watch-together room's address, /watch/<room>. Kept apart
 * from the room's page so Main can check it without loading the viewer.
 */

import { WATCH_ROOM_RE } from "../../derpland/WatchTypes";

/** The room's id, or null when the path is not a room's. */
export function parseWatchPath(pathname: string): string | null {
  const m = /^\/watch\/([^/]+)\/?$/.exec(pathname);
  if (m === null) return null;
  return WATCH_ROOM_RE.test(m[1]) ? m[1] : null;
}

/**
 * The host key a "Watch together" link carries in its hash (#key=...), if
 * any. The page takes it off the address, so a copied link doesn't host.
 */
export function takeHostKeyFromHash(hash: string): string | null {
  const m = /^#key=([A-Za-z0-9]{1,64})$/.exec(hash);
  return m === null ? null : m[1];
}
