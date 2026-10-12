// Where the in-game chat sits once a player has dragged it somewhere else.
//
// A placement hugs the screen edges nearest the chat: "12 px from the right,
// 80 px from the top". The chat then grows away from those edges as it opens
// and folds, so a chat parked in a top corner opens downwards and one on the
// right opens to the left. The distances were measured on a screen of a
// given size; on another size they are scaled to it, so a corner stays a
// corner and the middle stays the middle. Whatever the screen, the chat is
// kept inside it.
//
// The placement is remembered per browser. Storage may be missing or full
// (private windows, blocked site data), so every read and write is guarded
// and the chat simply falls back to its corner.

export const CHAT_PLACEMENT_KEY = "derpyChatPlacement";

/** The closest the chat comes to a screen edge, in CSS pixels. */
export const CHAT_EDGE_MARGIN = 8;

export interface ChatPlacement {
  /** The side the chat hugs, and its distance from that side (px). */
  h: "left" | "right";
  x: number;
  v: "top" | "bottom";
  y: number;
  /** The size of the screen the distances were measured on. */
  vw: number;
  vh: number;
}

export interface ChatBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Distances from the anchor edges, for the screen the chat is on now. */
export interface ChatOffsets {
  h: "left" | "right";
  x: number;
  v: "top" | "bottom";
  y: number;
}

const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

/** Keep `value` within [lo, hi]; when the range is empty, the low end wins. */
export function clampTo(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(value, hi));
}

/**
 * The placement for a chat box dropped at `box` on a `vw` x `vh` screen:
 * anchored to the nearer side horizontally and vertically.
 */
export function placementFromBox(
  box: ChatBox,
  vw: number,
  vh: number,
): ChatPlacement {
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const h = cx <= vw / 2 ? "left" : "right";
  const v = cy <= vh / 2 ? "top" : "bottom";
  const x = h === "left" ? box.left : vw - (box.left + box.width);
  const y = v === "top" ? box.top : vh - (box.top + box.height);
  return {
    h,
    x: Math.max(0, Math.round(x)),
    v,
    y: Math.max(0, Math.round(y)),
    vw: Math.round(vw),
    vh: Math.round(vh),
  };
}

/** The placement's distances on a `vw` x `vh` screen, before fitting. */
export function scaledOffsets(
  p: ChatPlacement,
  vw: number,
  vh: number,
): ChatOffsets {
  const sx = p.vw > 0 ? vw / p.vw : 1;
  const sy = p.vh > 0 ? vh / p.vh : 1;
  return {
    h: p.h,
    x: Math.round(p.x * sx),
    v: p.v,
    y: Math.round(p.y * sy),
  };
}

/**
 * Offsets that keep a `width` x `height` chat wholly on a `vw` x `vh` screen,
 * at least CHAT_EDGE_MARGIN from every edge where it fits. When the chat is
 * bigger than the screen, it keeps its anchor edges in view.
 */
export function fitOffsets(
  o: ChatOffsets,
  width: number,
  height: number,
  vw: number,
  vh: number,
): ChatOffsets {
  const m = CHAT_EDGE_MARGIN;
  return {
    h: o.h,
    x: Math.round(clampTo(o.x, m, Math.max(m, vw - width - m))),
    v: o.v,
    y: Math.round(clampTo(o.y, m, Math.max(m, vh - height - m))),
  };
}

/**
 * How far a box at `box` may move by (dx, dy) and still be on screen: the
 * drag is stopped at the margin rather than letting the chat leave the screen.
 */
export function clampDrag(
  box: ChatBox,
  dx: number,
  dy: number,
  vw: number,
  vh: number,
): { dx: number; dy: number } {
  const m = CHAT_EDGE_MARGIN;
  const left = clampTo(
    box.left + dx,
    Math.min(m, box.left),
    Math.max(m, vw - box.width - m, box.left),
  );
  const top = clampTo(
    box.top + dy,
    Math.min(m, box.top),
    Math.max(m, vh - box.height - m, box.top),
  );
  return { dx: left - box.left, dy: top - box.top };
}

/** A placement read back from storage, or null if it is not one. */
export function parsePlacement(raw: string | null): ChatPlacement | null {
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const p = v as Record<string, unknown>;
  if (p.h !== "left" && p.h !== "right") return null;
  if (p.v !== "top" && p.v !== "bottom") return null;
  if (![p.x, p.y, p.vw, p.vh].every(finite)) return null;
  const [x, y, vw, vh] = [p.x, p.y, p.vw, p.vh] as number[];
  if (x < 0 || y < 0 || vw <= 0 || vh <= 0) return null;
  return { h: p.h, x, v: p.v, y, vw, vh };
}

export function loadChatPlacement(): ChatPlacement | null {
  try {
    return parsePlacement(
      globalThis.localStorage?.getItem(CHAT_PLACEMENT_KEY) ?? null,
    );
  } catch {
    return null;
  }
}

export function saveChatPlacement(p: ChatPlacement | null): void {
  try {
    if (p === null) {
      globalThis.localStorage?.removeItem(CHAT_PLACEMENT_KEY);
    } else {
      globalThis.localStorage?.setItem(CHAT_PLACEMENT_KEY, JSON.stringify(p));
    }
  } catch {
    // Storage is unavailable: the chat stays put for this game only.
  }
}
