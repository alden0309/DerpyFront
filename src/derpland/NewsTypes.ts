// NEWS (r25): Derp Land's What's New, as /derpy/api/news serves it. The
// shapes the server and the pages share, which entries a viewer has seen,
// and the tiny markdown an entry's body is written in. Plain code with no
// page or server parts, so both sides use it.
//
// Nothing here names a game: the server says which games a viewer may see,
// with their names and colours, and sends only those games' entries.

import type { SiteBanner } from "./BannerTypes"; // ADMIN (r26)

/** One entry, as written in the server's entries file and as served. */
export interface NewsEntry {
  /** Stable: its date, then a short slug ("2026-10-19-friends"). */
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** Which game it's about ("site" is Derp Land itself). */
  game: string;
  title: string;
  /** Paragraphs and bullet lists (parseNewsBody). */
  body: string;
  /** A path on the site ("/store"), with the words for it. */
  link?: string;
  linkText?: string;
}

/** A game this viewer may see news of: for the filter and the tags. */
export interface NewsGame {
  id: string;
  name: string;
  color: string;
}

/** GET /derpy/api/news (and POST /news/seen's answer). */
export interface NewsView {
  signedIn: boolean;
  /** Newest first: only what this viewer may see. */
  entries: NewsEntry[];
  games: NewsGame[];
  /** Signed in: the newest of `entries` already seen (null: none of them). */
  lastSeen: string | null;
  /** Signed in: how many of `entries`, from the top, are new. */
  unseen: number;
  /** ADMIN (r26): the site banner (null: none), for pages signed out. */
  banner?: SiteBanner | null;
}

/** What the social beat carries for the bar's dot, signed in. */
export interface NewsBeat {
  unseen: number;
  /** The newest entry this viewer may see (to tell a stale list). */
  newest: string | null;
}

/**
 * The mark of someone who first came when there was no news: nothing seen
 * yet, so everything written after counts as new.
 */
export const NEWS_NOTHING = "0000-00-00";

/** Each entry's place in a newest-first list (0: the newest). */
export function newsOrder(
  entries: readonly NewsEntry[],
): ReadonlyMap<string, number> {
  return new Map(entries.map((e, i) => [e.id, i]));
}

/**
 * How many entries, from the top of a newest-first list, are newer than the
 * viewer's mark (the newest entry they've seen). `order` is every entry's
 * place in the whole file, so a mark on an entry this list leaves out still
 * counts. A mark no entry has (taken out of the file since, or NEWS_NOTHING)
 * goes by the date it starts with: whatever is dated after that day is new.
 */
export function unseenCount(
  entries: readonly NewsEntry[],
  mark: string,
  order: ReadonlyMap<string, number> = newsOrder(entries),
): number {
  const at = order.get(mark);
  const day = mark.slice(0, 10);
  let n = 0;
  for (const e of entries) {
    const place = order.get(e.id);
    const newer =
      at !== undefined && place !== undefined ? place < at : e.date > day;
    // Newest first: everything after this one is older still.
    if (!newer) break;
    n++;
  }
  return n;
}

/** Whether seeing up to `a` goes further than the mark `b` (never back). */
export function newerMark(
  a: string,
  b: string,
  order: ReadonlyMap<string, number>,
): boolean {
  const pa = order.get(a);
  const pb = order.get(b);
  if (pa !== undefined && pb !== undefined) return pa < pb;
  const da = a.slice(0, 10);
  const db = b.slice(0, 10);
  // A mark that's gone counts its whole day as seen.
  return da > db;
}

// ---- the body's markdown -----------------------------------------------

/** A run of text: plain, **bold** or *italic*. */
export interface NewsInline {
  text: string;
  b?: true;
  i?: true;
}

export type NewsBlock =
  | { list: false; parts: NewsInline[] }
  | { list: true; items: NewsInline[][] };

const BULLET = /^[-*•]\s+(.*)$/;
const INLINE = /\*\*(?=\S)(.+?)(?<=\S)\*\*|\*(?=[^\s*])(.+?)(?<=[^\s*])\*/g;

/**
 * An entry's body: paragraphs (lines together; a blank line between two),
 * bullet lists ("- ", "* " or "• " at the start of a line; an indented line
 * carries on the item before it), **bold** and *italic*. That's all. Nothing
 * else means anything (no HTML, links, pictures or headings): it's text,
 * and the pages put it on screen as text.
 */
export function parseNewsBody(src: string): NewsBlock[] {
  const blocks: NewsBlock[] = [];
  let para: string[] = [];
  let items: string[] = [];
  const flush = () => {
    if (para.length > 0)
      blocks.push({ list: false, parts: parseInline(para.join(" ")) });
    if (items.length > 0)
      blocks.push({ list: true, items: items.map(parseInline) });
    para = [];
    items = [];
  };
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (line === "") {
      flush();
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      if (para.length > 0) flush();
      items.push(bullet[1]);
      continue;
    }
    if (items.length > 0 && /^\s/.test(raw)) {
      items[items.length - 1] += ` ${line}`;
      continue;
    }
    if (items.length > 0) flush();
    para.push(line);
  }
  flush();
  return blocks;
}

/** One line's **bold** and *italic* (a marker left open stays as it is). */
export function parseInline(s: string): NewsInline[] {
  const out: NewsInline[] = [];
  let last = 0;
  for (const m of s.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: s.slice(last, at) });
    if (m[1] !== undefined) out.push({ text: m[1], b: true });
    else out.push({ text: m[2], i: true });
    last = at + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

/** The body as plain text (for a card's summary or a test). */
export function newsBodyText(src: string): string {
  return parseNewsBody(src)
    .map((b) =>
      b.list
        ? b.items.map((i) => i.map((p) => p.text).join("")).join("\n")
        : b.parts.map((p) => p.text).join(""),
    )
    .join("\n\n");
}
