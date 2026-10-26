// PROFILE (r26): the pages' side of badges and profile pictures: choosing
// a picture, uploading one, reporting one, the signed-in player's badges
// (for the bar's toast) and pinning them. The server is DerpyBadges.ts and
// DerpyPictures.ts.

import { DERPY_API } from "../client/derpy/DerpySession";
import { api, ApiError, DERPY_ACCOUNT_EVENT, derpyToken } from "./Account";
import type { MyBadges } from "./Badges";
import type { PictureError } from "./Pictures";

/** Fired on window when the signed-in player's picture or pins change. */
export const LOOK_EVENT = "derp-look";

function changed(): void {
  window.dispatchEvent(new CustomEvent(LOOK_EVENT));
  window.dispatchEvent(new CustomEvent(DERPY_ACCOUNT_EVENT));
}

function pictureError(err: unknown): PictureError {
  if (err instanceof ApiError) {
    if (err.status === 413) return "too_large";
    return err.code as PictureError;
  }
  return "invalid";
}

/** Wear a preset, a monogram colour (m:<n>), your own upload again, or the default (null). */
export async function choosePicture(
  picture: string | null,
): Promise<{ picture: string | null } | { error: PictureError }> {
  try {
    const r = await api<{ picture: string | null }>("/pictures/choose", {
      method: "POST",
      body: JSON.stringify({ picture }),
    });
    changed();
    return r;
  } catch (err) {
    return { error: pictureError(err) };
  }
}

/** Send the picture the page drew (a 256 px PNG): the server draws it again and keeps it. */
export async function uploadPicture(
  png: Blob,
): Promise<{ picture: string } | { error: PictureError }> {
  const token = derpyToken();
  try {
    const res = await fetch(`${DERPY_API}/pictures/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: png,
    });
    const body = (await res.json().catch(() => ({}))) as {
      picture?: string;
      error?: PictureError;
    };
    if (!res.ok || !body.picture)
      return {
        error: res.status === 413 ? "too_large" : (body.error ?? "invalid"),
      };
    changed();
    return { picture: body.picture };
  } catch {
    return { error: "invalid" };
  }
}

/** May you upload, how many more today, and your own upload (worn or not). */
export function pictureStatus(): Promise<{
  blocked: boolean;
  left: number;
  upload: string | null;
}> {
  return api("/pictures/mine");
}

/** Report someone's uploaded picture. */
export async function reportPicture(
  account: number,
  version: string,
): Promise<PictureError | null> {
  try {
    await api("/pictures/report", {
      method: "POST",
      body: JSON.stringify({ account, version }),
    });
    return null;
  } catch (err) {
    return pictureError(err);
  }
}

/** Your badges, checked: earned, pinned, and the ones not yet shown to you. */
export function myBadges(): Promise<MyBadges> {
  return api<MyBadges>("/badges/mine");
}

export async function markBadgesSeen(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await api("/badges/seen", { method: "POST", body: JSON.stringify({ keys }) });
}

/** Pin badges beside your name (earned ones, three at most). Resolves to the pins kept. */
export async function pinBadges(keys: string[]): Promise<string[]> {
  const r = await api<{ pinned: string[] }>("/badges/pins", {
    method: "POST",
    body: JSON.stringify({ keys }),
  });
  changed();
  return r.pinned;
}
