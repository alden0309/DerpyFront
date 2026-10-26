// NEWS (r25): Derp Land's What's New. The coordinator writes the entries,
// each approved by the owner, in news/entries.json beside this file, and
// deploys; there's no editor. The server reads the file once at startup and
// keeps it in memory. A file that isn't right is logged and none is served
// (tests/server/DerpyNews.test.ts fails on it first).
//
// None of it is in the site's JavaScript or HTML: the pages ask
// /derpy/api/news. Mr. Based's entries ("based") go only to the accounts
// that may play it (the based_access mark, as DerpyBased checks it). For
// everyone else they don't exist: not in the list, the games, the counts,
// what's been seen, or the errors.
//
// What an account has seen is one mark on it (derpy_accounts.news_seen): the
// newest entry seen. It's kept here once read, so the social beat, which
// carries the unread count every 15 seconds, doesn't touch the database.
// Signed out, the mark lives in the browser (src/derpland/News.ts).
//
// Mounted by DerpyApi at /derpy/api/news.

import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import {
  newerMark,
  NEWS_NOTHING,
  NewsBeat,
  NewsEntry,
  NewsGame,
  newsOrder,
  NewsView,
  unseenCount,
} from "../../derpland/NewsTypes";
import { logger } from "../Logger";
import { Account, accountForToken } from "./DerpyAuth";
import { db, derpyDbConfigured } from "./DerpyDb";
import { currentBanner } from "./SiteBanner"; // ADMIN (r26)

const log = logger.child({ component: "DerpyNews" });

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const NEWS_FILE = path.join(HERE, "news", "entries.json");

/** The games an entry can be about, as the pages show them. */
const GAMES: (NewsGame & { secret?: true })[] = [
  { id: "site", name: "Derp Land", color: "#f5cc3c" },
  { id: "derpyfront", name: "DerpyFront", color: "#4fa6e8" },
  { id: "conquest", name: "Derpy Conquest", color: "#ead8ae" },
  // Only for those who may play it.
  { id: "based", name: "Mr. Based", color: "#c3c9d4", secret: true },
];
const SECRET = new Set(GAMES.filter((g) => g.secret).map((g) => g.id));

// ---- the file ---------------------------------------------------------

const ID_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** A path on this site: /store, /conquest, /player/Alden#games. */
const LINK_RE = /^\/(?!\/)[A-Za-z0-9\-._~/?#=&%+]*$/;

function realDay(d: string): boolean {
  const t = Date.parse(`${d}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
}

export const NewsEntrySchema = z
  .strictObject({
    id: z
      .string()
      .max(80)
      .regex(
        ID_RE,
        "id is the date, then a slug of a-z, 0-9 and dashes (2026-10-19-friends)",
      ),
    date: z
      .string()
      .regex(DATE_RE, "date is YYYY-MM-DD")
      .refine(realDay, "date is not a real day"),
    game: z.enum(GAMES.map((g) => g.id) as [string, ...string[]]),
    title: z.string().trim().min(1).max(100),
    body: z.string().trim().min(1).max(4000),
    link: z
      .string()
      .max(200)
      .regex(LINK_RE, "link is a path on the site, like /store")
      .optional(),
    linkText: z.string().trim().min(1).max(40).optional(),
  })
  .superRefine((e, ctx) => {
    if (!e.id.startsWith(`${e.date}-`))
      ctx.addIssue({
        code: "custom",
        path: ["id"],
        message: `id must start with its date (${e.date}-)`,
      });
    if (e.linkText !== undefined && e.link === undefined)
      ctx.addIssue({
        code: "custom",
        path: ["linkText"],
        message: "linkText needs a link",
      });
  });

export const NewsFileSchema = z
  .array(NewsEntrySchema)
  .max(1000)
  .superRefine((list, ctx) => {
    const ids = new Set<string>();
    list.forEach((e, i) => {
      if (ids.has(e.id))
        ctx.addIssue({
          code: "custom",
          path: [i, "id"],
          message: `id ${e.id} is used twice`,
        });
      ids.add(e.id);
    });
  });

/** Newest first: by date, and on the same day, the one higher in the file. */
export function sortNews(list: readonly NewsEntry[]): NewsEntry[] {
  return list
    .map((e, i) => ({ e, i }))
    .sort((a, b) =>
      a.e.date === b.e.date ? a.i - b.i : a.e.date < b.e.date ? 1 : -1,
    )
    .map((x) => x.e);
}

/** The entries file's text, checked: the entries newest first, or what's wrong. */
export function parseNewsFile(
  text: string,
): { ok: true; entries: NewsEntry[] } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `not JSON: ${(err as Error).message}` };
  }
  const r = NewsFileSchema.safeParse(raw);
  if (!r.success)
    return {
      ok: false,
      error: r.error.issues
        .slice(0, 8)
        .map((i) => `${i.path.join(".") || "(file)"}: ${i.message}`)
        .join("; "),
    };
  return { ok: true, entries: sortNews(r.data) };
}

// ---- what's served ----------------------------------------------------

let all: NewsEntry[] = [];
/** Without the secret games' entries: what everyone else sees. */
let open: NewsEntry[] = [];
let order: ReadonlyMap<string, number> = new Map();

/** The entries to serve (sorted: parseNewsFile's). */
export function setNews(entries: readonly NewsEntry[]): void {
  all = [...entries];
  open = all.filter((e) => !SECRET.has(e.game));
  order = newsOrder(all);
}

/**
 * Reads the entries file; one that isn't right is logged and none is served.
 * DERPY_NEWS_FILE points a local server at another file (entries to look at
 * before they go in the real one); the hosted site never sets it.
 */
export function loadNews(
  file = process.env.DERPY_NEWS_FILE ?? NEWS_FILE,
): number {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    log.error(`What's New: can't read ${file}, serving none: ${err}`);
    setNews([]);
    return 0;
  }
  const r = parseNewsFile(text);
  if (!r.ok) {
    log.error(`What's New: ${file} isn't right, serving none: ${r.error}`);
    setNews([]);
    return 0;
  }
  setNews(r.entries);
  log.info("What's New loaded", { entries: r.entries.length });
  return r.entries.length;
}

// ---- who's seen what --------------------------------------------------

interface Viewer {
  /** The newest entry seen (an id, or NEWS_NOTHING). */
  mark: string;
  /** May play Mr. Based. */
  based: boolean;
  at: number;
}

/** Each account's mark, once read (re-read after this long, or when asked). */
const VIEWER_MS = 10 * 60_000;
const viewers = new Map<number, Viewer>();

function listFor(v: Viewer | null): NewsEntry[] {
  return v?.based ? all : open;
}

async function readViewer(accountId: number): Promise<Viewer> {
  const pool = await db();
  const r = await pool.query(
    "SELECT news_seen, based_access FROM derpy_accounts WHERE id = $1",
    [accountId],
  );
  const based = r.rows[0]?.based_access === true;
  let mark: string | null = r.rows[0]?.news_seen ?? null;
  if (mark === null) {
    // The first look: what's out already isn't news to them.
    const first = (based ? all : open)[0]?.id ?? NEWS_NOTHING;
    const set = await pool.query(
      `UPDATE derpy_accounts SET news_seen = COALESCE(news_seen, $2)
       WHERE id = $1 RETURNING news_seen`,
      [accountId, first],
    );
    mark = (set.rows[0]?.news_seen as string | undefined) ?? first;
  }
  const v: Viewer = { mark, based, at: Date.now() };
  if (viewers.size >= 20_000) viewers.delete(viewers.keys().next().value!);
  viewers.set(accountId, v);
  return v;
}

/** An account's mark: what's kept, unless it's old or `fresh` asks again. */
async function viewer(accountId: number, fresh = false): Promise<Viewer> {
  const hit = viewers.get(accountId);
  if (!fresh && hit && Date.now() - hit.at < VIEWER_MS) return hit;
  return readViewer(accountId);
}

/** What a viewer (null: signed out) is served. */
export function newsView(v: Viewer | null): NewsView {
  const entries = listFor(v);
  const games = GAMES.filter((g) => !g.secret || v?.based).map(
    ({ id, name, color }) => ({ id, name, color }),
  );
  if (v === null)
    return { signedIn: false, entries, games, lastSeen: null, unseen: 0 };
  const unseen = unseenCount(entries, v.mark, order);
  return {
    signedIn: true,
    entries,
    games,
    lastSeen: entries[unseen]?.id ?? null,
    unseen,
  };
}

/** For the social beat: how many entries are new to this account. */
export async function newsBeat(accountId: number): Promise<NewsBeat> {
  const v = await viewer(accountId);
  const entries = listFor(v);
  return {
    unseen: unseenCount(entries, v.mark, order),
    newest: entries[0]?.id ?? null,
  };
}

/**
 * The account has seen everything up to `upTo` (one of the entries it may
 * see). A mark never moves back. Null when `upTo` isn't such an entry.
 */
export async function markNewsSeen(
  accountId: number,
  upTo: string,
): Promise<NewsView | null> {
  const v = await viewer(accountId);
  if (!listFor(v).some((e) => e.id === upTo)) return null;
  if (newerMark(upTo, v.mark, order)) {
    v.mark = upTo;
    await (
      await db()
    ).query("UPDATE derpy_accounts SET news_seen = $2 WHERE id = $1", [
      accountId,
      upTo,
    ]);
  }
  return newsView(v);
}

/**
 * ADMIN (r26): every entry (Mr. Based's too), their order, the games and
 * which are secret: for the owner's admin page only.
 */
export function newsForAdmin(): {
  entries: readonly NewsEntry[];
  order: ReadonlyMap<string, number>;
  games: readonly (NewsGame & { secret?: true })[];
} {
  return { entries: all, order, games: GAMES };
}

/** For tests: forget every account's mark (as a restart would). */
export function forgetNewsViewers(): void {
  viewers.clear();
}

// ---- the routes -------------------------------------------------------

type Handler = (
  req: Request & { derpy?: { account: Account; token: string } },
  res: Response,
) => Promise<unknown>;
type Wrap = (
  fn: Handler,
) => (req: Request, res: Response, next: NextFunction) => void;

const SeenSchema = z.object({ upTo: z.string().min(1).max(80) });

export function newsRouter({
  handle,
  requireAccount,
}: {
  handle: Wrap;
  requireAccount: Wrap;
}): express.Router {
  const router = express.Router();
  const json = express.json({ limit: "2kb" });
  const readLimiter = rateLimit({ windowMs: 60_000, limit: 120 });
  const seenLimiter = rateLimit({ windowMs: 60_000, limit: 60 });

  // The entries this viewer may see, newest first, and (signed in) how many
  // are new. Signed out needs no database: the page keeps what it's seen.
  router.get(
    "/",
    readLimiter,
    handle(async (req, res) => {
      const h = req.headers.authorization ?? "";
      const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
      if (!token || !derpyDbConfigured()) {
        // ADMIN (r26): with the site banner, which signed-out pages get here.
        res.json({ ...newsView(null), banner: await currentBanner() });
        return;
      }
      const found = await accountForToken(token);
      if (found === null) {
        res.status(401).json({ error: "signed_out" });
        return;
      }
      // Asked again, so access taken away shows at once.
      res.json({
        ...newsView(await viewer(found.account.id, true)),
        banner: await currentBanner(), // ADMIN (r26)
      });
    }),
  );

  // Seen, up to an entry (and everything older). Anything else, an entry
  // this account may not see included, is the same "invalid".
  router.post(
    "/seen",
    seenLimiter,
    json,
    requireAccount(async (req, res) => {
      const body = SeenSchema.safeParse(req.body);
      const view = body.success
        ? await markNewsSeen(req.derpy!.account.id, body.data.upTo)
        : null;
      if (view === null) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      res.json(view);
    }),
  );

  return router;
}
