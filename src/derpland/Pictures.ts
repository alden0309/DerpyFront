// PROFILE (r26): profile pictures. A player's picture is one short string,
// kept on their account and sent wherever their name shows:
//
//   p:<id>             one of the preset pictures below (drawn for Derp Land,
//                      static SVGs at /derpland/pics/<id>.svg)
//   m:<n>              their initial on one of the monogram colours
//   u:<account>:<ver>  a picture they uploaded (a JPEG the server drew again,
//                      at /derpy/api/pictures/<account>/<ver>.jpg; a new
//                      upload is a new version, so it can be kept for good)
//   null               the default: their initial on a colour from their name
//
// Some presets are unlocked by badges. Shared by the server and the pages.

import { BADGE_BY_KEY, BADGES } from "./Badges";

export type PictureGroup = "portraits" | "animals" | "motifs" | "emblems";

export interface PresetDef {
  id: string;
  name: string;
  group: PictureGroup;
  /** Unlocked by this badge, or "gold": by any gold badge. */
  unlock?: string;
}

export const PICTURE_GROUPS: readonly { id: PictureGroup; name: string }[] = [
  { id: "portraits", name: "Portraits" },
  { id: "animals", name: "Animals" },
  { id: "motifs", name: "Game pieces" },
  { id: "emblems", name: "Emblems" },
];

export const PRESETS: readonly PresetDef[] = [
  { id: "settler", name: "Settler", group: "portraits" },
  { id: "admiral", name: "Admiral", group: "portraits" },
  { id: "grenadier", name: "Grenadier", group: "portraits" },
  { id: "farmer", name: "Farmer", group: "portraits" },
  { id: "pirate", name: "Pirate", group: "portraits" },
  { id: "queen", name: "Queen", group: "portraits" },
  { id: "scholar", name: "Scholar", group: "portraits" },
  { id: "knight", name: "Knight", group: "portraits" },
  { id: "banana", name: "Banana Buddy", group: "portraits" },
  { id: "gator", name: "Gator", group: "animals" },
  { id: "eagle", name: "Eagle", group: "animals" },
  { id: "bear", name: "Bear", group: "animals" },
  { id: "fox", name: "Fox", group: "animals" },
  { id: "owl", name: "Owl", group: "animals" },
  { id: "horse", name: "Horse", group: "animals" },
  { id: "beaver", name: "Beaver", group: "animals" },
  { id: "turtle", name: "Turtle", group: "animals" },
  { id: "musket", name: "Crossed Muskets", group: "motifs" },
  { id: "dome", name: "Dome of Alden", group: "motifs" },
  { id: "ship", name: "Ship of the Line", group: "motifs" },
  { id: "cannon", name: "Cannon", group: "motifs" },
  { id: "fort", name: "Fort", group: "motifs" },
  { id: "anchor", name: "Anchor", group: "motifs" },
  { id: "compass", name: "Compass Rose", group: "motifs" },
  { id: "crown", name: "Crown", group: "motifs" },
  { id: "quill", name: "Quill and Ink", group: "motifs" },
  { id: "coin", name: "Derp Coin", group: "motifs" },
  { id: "laurel", name: "Laurels", group: "emblems", unlock: "df-wins-10" },
  {
    id: "helm",
    name: "Warlord's Helm",
    group: "emblems",
    unlock: "df-wins-50",
  },
  {
    id: "sunburst",
    name: "Hard Star",
    group: "emblems",
    unlock: "df-hard-win",
  },
  { id: "globe", name: "Old Globe", group: "emblems", unlock: "sc-all-wins" },
  {
    id: "calendar",
    name: "Full Week",
    group: "emblems",
    unlock: "ch-full-week",
  },
  {
    id: "crest",
    name: "Family Crest",
    group: "emblems",
    unlock: "cq-dynasty-3",
  },
  {
    id: "medal",
    name: "Hard Medal",
    group: "emblems",
    unlock: "cq-achievement",
  },
  { id: "goldbanana", name: "Golden Banana", group: "emblems", unlock: "gold" },
];

export const PRESET_BY_ID: ReadonlyMap<string, PresetDef> = new Map(
  PRESETS.map((p) => [p.id, p]),
);

/**
 * The monogram colours: the first eight are the colours a name picks by
 * default (Icons.ts's token colours), then a few more to choose.
 */
export const MONOGRAM_COLORS: readonly string[] = [
  "#e8553f",
  "#3b7fc4",
  "#3a9d63",
  "#e9a92b",
  "#8a5cc4",
  "#e57a2e",
  "#2a9c9a",
  "#c94f86",
  "#5b6474",
  "#2f6d4f",
  "#8a5a34",
  "#1f2a44",
];

/** What a picture string is. */
export type Pic =
  | { kind: "preset"; id: string }
  | { kind: "mono"; n: number }
  | { kind: "upload"; account: number; version: string };

export const VERSION_RE = /^[0-9a-f]{12}$/;

export function parsePic(ref: string | null | undefined): Pic | null {
  if (typeof ref !== "string") return null;
  if (ref.startsWith("p:")) {
    const id = ref.slice(2);
    return PRESET_BY_ID.has(id) ? { kind: "preset", id } : null;
  }
  if (ref.startsWith("m:")) {
    const n = Number(ref.slice(2));
    return Number.isInteger(n) && n >= 0 && n < MONOGRAM_COLORS.length
      ? { kind: "mono", n }
      : null;
  }
  const u = /^u:(\d{1,15}):([0-9a-f]{12})$/.exec(ref);
  if (u) return { kind: "upload", account: Number(u[1]), version: u[2] };
  return null;
}

export const uploadRef = (account: number, version: string) =>
  `u:${account}:${version}`;

/** Where a picture's image is, or null for a monogram. */
export function picSrc(ref: string | null | undefined): string | null {
  const p = parsePic(ref);
  if (p === null || p.kind === "mono") return null;
  if (p.kind === "preset") return `/derpland/pics/${p.id}.svg`;
  return `/derpy/api/pictures/${p.account}/${p.version}.jpg`;
}

/** The colour behind a monogram (also behind a picture still loading). */
export function monogramColor(
  ref: string | null | undefined,
  name: string,
): string {
  const p = parsePic(ref);
  if (p?.kind === "mono") return MONOGRAM_COLORS[p.n];
  let h = 0;
  for (let i = 0; i < name.length; i++)
    h = (h * 31 + name.toLowerCase().charCodeAt(i)) >>> 0;
  return MONOGRAM_COLORS[h % 8];
}

/** Whether a preset may be worn by someone with these badges. */
export function presetUnlocked(
  p: PresetDef,
  earned: ReadonlySet<string>,
): boolean {
  if (!p.unlock) return true;
  if (p.unlock === "gold")
    return BADGES.some((b) => b.tier === "gold" && earned.has(b.key));
  return earned.has(p.unlock);
}

/** The line that says how a locked preset is unlocked. */
export function unlockText(p: PresetDef): string {
  if (!p.unlock) return "";
  if (p.unlock === "gold") return "Earn any gold badge.";
  const b = BADGE_BY_KEY.get(p.unlock);
  return b ? `Earn the ${b.name} badge: ${b.how}` : "";
}

/** What an account shows beside its name: its picture and pinned badges. */
export interface Look {
  /** The picture string, or null: the default monogram. */
  pic: string | null;
  /** Pinned badges, in order (at most three). */
  badges: string[];
}

/** What the picture endpoints answer when they can't. */
export type PictureError =
  | "bad_type"
  | "bad_image"
  | "unsupported"
  | "too_big"
  | "too_small"
  | "too_large"
  | "rate_limited"
  | "uploads_blocked"
  | "locked"
  | "invalid"
  | "not_found"
  | "yourself";

export const PICTURE_ERROR_TEXT: Record<PictureError, string> = {
  bad_type: "That isn't a picture this can use. Pick a PNG, JPEG or WebP.",
  bad_image: "That picture couldn't be read. Try another one.",
  unsupported: "That kind of picture can't be read here. Try another one.",
  too_big: "That picture is too big. Pick a smaller one.",
  too_small: "That picture is too small. Pick a bigger one.",
  too_large: "That file is too big. Pick a smaller one.",
  rate_limited:
    "You've uploaded 5 pictures today. Pick a preset for now, or try again tomorrow.",
  uploads_blocked:
    "Uploading pictures is turned off for this account. You can still pick a preset.",
  locked: "Earn its badge first.",
  invalid: "That didn't work. Try again.",
  not_found: "That picture isn't there any more.",
  yourself: "That's your own picture.",
};

/** Uploads an account may make in a day (any day: the last 24 hours). */
export const UPLOADS_PER_DAY = 5;

// ---------------------------------------------------------------- the owner's moderation

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
