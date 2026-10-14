// BASED (r19): Mr. Based, the story game, served to the accounts allowed to
// play it (only the owner's for now: NAMES r20 marks it by account, first
// found by the name "Alden", so it follows him through renames and nobody
// gains it by renaming to "Alden"). Everyone else gets Coming
// Soon. The story's text, its pictures and its sound live in src/based/ on
// the server and are only ever sent through this API, to those accounts:
// none of it is in the site's public JavaScript.
//
// Mounted by DerpyApi at /derpy/api/based.

import express, { NextFunction, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { flowOf } from "../../based/engine/Flow";
import { PlaceDef } from "../../based/engine/Place";
import { parseChapter } from "../../based/engine/Script";
import { Chapter } from "../../based/engine/Types";
import { formatProblem, validateChapter } from "../../based/engine/Validate";
import { hasBasedAccess } from "./BasedAccess";
import { Account, accountForToken } from "./DerpyAuth";
import { db } from "./DerpyDb";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BASED_DIR = path.resolve(HERE, "../../based");
const STORY_DIR = path.join(BASED_DIR, "story");
const ART_DIR = path.join(BASED_DIR, "art");
const AUDIO_DIR = path.join(BASED_DIR, "audio");
// BASED (r21): the 3D places (data) and the models they're built from.
const PLACES_DIR = path.join(BASED_DIR, "places");
const MODEL_DIR = path.join(BASED_DIR, "models");

// NAMES (r20): BASED_PLAYERS (comma-separated, default the owner) only names
// the accounts to mark, once each (BasedAccess.ts).
export { basedPlayers } from "./BasedAccess";

/**
 * Who may play: accounts marked for it, by id, whatever they're called now.
 * Renaming never gains it or loses it.
 */
export async function canPlayBased(
  account: Pick<Account, "id"> | null,
): Promise<boolean> {
  return account !== null && hasBasedAccess(await db(), account.id);
}

// --- Chapters -------------------------------------------------------------

export interface LoadedChapter {
  chapter: Chapter;
  /** Errors stop the chapter loading; warnings don't. */
  errors: string[];
  warnings: string[];
  /** r21: the 3D places it uses, by key. */
  places: Record<string, PlaceDef>;
}

/** Every place written so far, by key (re-read when a file changes). */
const placeCache = new Map<string, { mtimeMs: number; def: PlaceDef }>();
export function loadPlaces(): Record<string, PlaceDef> {
  const out: Record<string, PlaceDef> = {};
  let files: string[];
  try {
    files = fs.readdirSync(PLACES_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return out;
  }
  for (const f of files) {
    const key = f.slice(0, -".json".length);
    const file = path.join(PLACES_DIR, f);
    try {
      const mtimeMs = fs.statSync(file).mtimeMs;
      const hit = placeCache.get(key);
      if (hit && hit.mtimeMs === mtimeMs) {
        out[key] = hit.def;
        continue;
      }
      const def = JSON.parse(fs.readFileSync(file, "utf8")) as PlaceDef;
      placeCache.set(key, { mtimeMs, def });
      out[key] = def;
    } catch {
      // a place mid-edit that won't parse: the chapter's check reports it
    }
  }
  return out;
}

/** The places a chapter names with @place. */
function placesOf(chapter: Chapter): Set<string> {
  const keys = new Set<string>();
  for (const id of chapter.order) {
    for (const op of chapter.scenes[id].ops) {
      if (op.op === "place" && op.key) keys.add(op.key);
    }
  }
  return keys;
}

const cache = new Map<number, { mtimeMs: number; loaded: LoadedChapter }>();

function keysIn(dir: string, ext: string): Set<string> {
  try {
    return new Set(
      fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(ext))
        .map((f) => f.slice(0, -ext.length)),
    );
  } catch {
    return new Set();
  }
}

/** The chapter numbers written so far, in order. */
export function chapterNumbers(): number[] {
  try {
    return fs
      .readdirSync(STORY_DIR)
      .map((f) => /^chapter-(\d{2})\.story$/.exec(f))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/**
 * A chapter, parsed and checked. Re-read whenever the file changes, so a
 * rewrite shows up on the next load without restarting the server.
 */
export function loadChapter(n: number): LoadedChapter | null {
  const file = path.join(
    STORY_DIR,
    `chapter-${String(n).padStart(2, "0")}.story`,
  );
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  const all = loadPlaces();
  // A place edited since: load the chapter again too.
  const stamp =
    stat.mtimeMs + [...placeCache.values()].reduce((a, p) => a + p.mtimeMs, 0);
  const hit = cache.get(n);
  if (hit && hit.mtimeMs === stamp) return hit.loaded;
  const { chapter, errors } = parseChapter(fs.readFileSync(file, "utf8"));
  const problems = validateChapter(chapter, {
    art: keysIn(ART_DIR, ".webp"),
    sounds: keysIn(AUDIO_DIR, ".mp3"),
    places: all,
  });
  const places: Record<string, PlaceDef> = {};
  for (const key of placesOf(chapter)) if (all[key]) places[key] = all[key];
  const loaded: LoadedChapter = {
    chapter,
    errors: [
      ...errors.map((e) => `error line ${e.line}: ${e.message}`),
      ...problems.filter((p) => p.level === "error").map(formatProblem),
    ],
    warnings: problems.filter((p) => p.level === "warning").map(formatProblem),
    places,
  };
  cache.set(n, { mtimeMs: stamp, loaded });
  return loaded;
}

function credits(): unknown {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(ART_DIR, "credits.json"), "utf8"),
    );
  } catch {
    return { items: [] };
  }
}

// --- Saves, picks and notes ----------------------------------------------

const Key = z.string().max(64);
const StageSchema = z.object({
  backdrop: Key.nullable(),
  figure: Key.nullable(),
  ambient: Key.nullable(),
  news: z.string().max(400).nullable(),
  // r21: the 3D place and who's where in it (absent in older saves).
  place: Key.nullable().optional(),
  actors: z
    .record(Key, z.object({ at: Key, pose: Key, wear: Key.optional() }))
    .optional(),
  focus: Key.nullable().optional(),
  vignette: Key.nullable().optional(),
  props: z.record(Key, z.boolean()).optional(),
});
// r21: who he is (the setup screen), what's boosted his skills, the dice.
const BuildSchema = z.object({
  attrs: z.record(Key, z.number().int().min(0).max(20)),
  signature: Key,
  archetype: Key.optional(),
});
const BoostSchema = z.object({
  skill: Key,
  delta: z.number().int().min(-10).max(10),
  why: z.string().max(200),
});
const SnapSchema = z.object({
  chapter: z.number().int().min(1).max(99),
  scene: Key,
  flags: z.record(Key, z.number()),
  rels: z.record(Key, z.number()),
  stage: StageSchema,
  path: z.array(z.string().max(160)).max(3000),
  taken: z.array(z.string().max(160)).max(500),
  build: BuildSchema.nullable().optional(),
  boosts: z.array(BoostSchema).max(100).optional(),
  seed: z.number().int().min(0).max(4294967295).optional(),
  checks: z
    .record(
      z.string().max(160),
      z.object({
        tries: z.number().int().min(0).max(1000),
        result: z.enum(["pass", "fail"]),
        bonus: z.number().int().min(-50).max(50),
      }),
    )
    .optional(),
});
export const SaveSchema = z.object({
  v: z.literal(1),
  current: SnapSchema.nullable(),
  checkpoints: z.record(
    z.string().max(4),
    z.record(
      Key,
      z.object({
        label: z.string().max(200),
        at: z.string().max(40),
        snap: SnapSchema,
      }),
    ),
  ),
  seen: z.record(
    z.string().max(4),
    z.object({
      scenes: z.array(Key).max(1000),
      options: z.array(z.string().max(160)).max(3000),
      found: z.array(Key).max(1000).default([]),
    }),
  ),
  finished: z.record(
    z.string().max(4),
    z.object({
      at: z.string().max(40),
      flags: z.record(Key, z.number()),
      rels: z.record(Key, z.number()),
      path: z.array(z.string().max(160)).max(3000),
      build: BuildSchema.optional(),
      boosts: z.array(BoostSchema).max(100).optional(),
    }),
  ),
});

const PicksSchema = z.object({
  chapter: z.number().int().min(1).max(99),
  picks: z
    .array(
      z.object({ choice: z.string().max(100), option: z.string().max(100) }),
    )
    .max(300),
});

const NoteSchema = z.object({
  chapter: z.number().int().min(1).max(99),
  scene: Key,
  line: z.string().max(2000).default(""),
  path: z.array(z.string().max(160)).max(3000).default([]),
  note: z.string().trim().min(1).max(4000),
});

// --- The router ------------------------------------------------------------

type Authed = Request & { based?: Account };

type Handler = (req: Authed, res: Response) => Promise<unknown>;

export interface BasedRouterDeps {
  /** Wraps a handler so a thrown error becomes a JSON 500 (or 503). */
  handle: (
    fn: Handler,
  ) => (req: Request, res: Response, next: NextFunction) => void;
}

function bearer(req: Request): string {
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? h.slice("Bearer ".length).trim() : "";
}

export function basedRouter({ handle }: BasedRouterDeps): express.Router {
  const router = express.Router();
  const json = express.json({ limit: "400kb" });

  /** Signed in as an account that may play, or refused. */
  const player = (fn: Handler) =>
    handle(async (req, res) => {
      const found = await accountForToken(bearer(req));
      if (found === null) {
        res.status(401).json({ error: "signed_out" });
        return;
      }
      if (!(await canPlayBased(found.account))) {
        res.status(403).json({ error: "coming_soon" });
        return;
      }
      req.based = found.account;
      await fn(req, res);
    });

  // Anyone may ask whether they can play: the page uses it to pick between
  // the game and Coming Soon.
  router.get(
    "/access",
    handle(async (req, res) => {
      const token = bearer(req);
      const found = token ? await accountForToken(token) : null;
      res.json({
        signedIn: found !== null,
        play: await canPlayBased(found?.account ?? null),
      });
    }),
  );

  router.get(
    "/chapters",
    player(async (_req, res) => {
      const chapters = chapterNumbers().map((n) => {
        const loaded = loadChapter(n)!;
        const c = loaded.chapter;
        return {
          n,
          title: c.title,
          summary: c.summary,
          ok: loaded.errors.length === 0,
          checkpoints: c.order
            .filter((id) => c.scenes[id].checkpoint)
            .map((id) => ({ scene: id, label: c.scenes[id].checkpoint })),
        };
      });
      res.json({ chapters, next: (chapters[chapters.length - 1]?.n ?? 0) + 1 });
    }),
  );

  router.get(
    "/chapter/:n",
    player(async (req, res) => {
      const n = Number(req.params.n);
      const loaded = Number.isInteger(n) ? loadChapter(n) : null;
      if (loaded === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (loaded.errors.length > 0) {
        // The owner sees exactly what's wrong while a chapter is mid-edit.
        res
          .status(422)
          .json({ error: "script_errors", problems: loaded.errors });
        return;
      }
      res.json({
        chapter: loaded.chapter,
        flow: flowOf(loaded.chapter),
        warnings: loaded.warnings,
        credits: credits(),
        places: loaded.places,
      });
    }),
  );

  const media = (dir: string, ext: string, type: string) =>
    player(async (req, res) => {
      const key = String(req.params.key);
      if (!/^[a-z0-9_]{1,64}$/.test(key)) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const file = path.join(dir, `${key}${ext}`);
      if (!fs.existsSync(file)) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      // Private: cached by the player's own browser, never by a CDN.
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.type(type);
      res.send(await fs.promises.readFile(file));
    });
  router.get("/art/:key", media(ART_DIR, ".webp", "image/webp"));
  router.get("/audio/:key", media(AUDIO_DIR, ".mp3", "audio/mpeg"));
  // BASED (r21): the 3D models, as gated as the pictures.
  router.get("/model/:key", media(MODEL_DIR, ".glb", "model/gltf-binary"));

  router.get(
    "/save",
    player(async (req, res) => {
      const r = await (
        await db()
      ).query(
        "SELECT save, updated_at FROM derpy_based_saves WHERE account_id = $1",
        [req.based!.id],
      );
      res.json({
        save: r.rows[0]?.save ?? null,
        updatedAt: r.rows[0]?.updated_at ?? null,
      });
    }),
  );

  router.put(
    "/save",
    json,
    player(async (req, res) => {
      const parsed = SaveSchema.safeParse(req.body?.save);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_save" });
        return;
      }
      await (
        await db()
      ).query(
        `INSERT INTO derpy_based_saves (account_id, save, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (account_id) DO UPDATE SET save = $2, updated_at = now()`,
        [req.based!.id, JSON.stringify(parsed.data)],
      );
      res.status(204).end();
    }),
  );

  router.delete(
    "/save",
    player(async (req, res) => {
      await (
        await db()
      ).query("DELETE FROM derpy_based_saves WHERE account_id = $1", [
        req.based!.id,
      ]);
      res.status(204).end();
    }),
  );

  // Each pick, so the flowchart can show what share of players chose what.
  router.post(
    "/picks",
    json,
    player(async (req, res) => {
      const parsed = PicksSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_picks" });
        return;
      }
      const { chapter, picks } = parsed.data;
      if (picks.length > 0) {
        await (
          await db()
        ).query(
          `INSERT INTO derpy_based_picks (account_id, chapter, choice, option)
           SELECT $1, $2, c, o FROM unnest($3::text[], $4::text[]) AS t(c, o)
           ON CONFLICT (account_id, chapter, choice)
           DO UPDATE SET option = EXCLUDED.option, updated_at = now()`,
          [
            req.based!.id,
            chapter,
            picks.map((p) => p.choice),
            picks.map((p) => p.option),
          ],
        );
      }
      res.status(204).end();
    }),
  );

  router.get(
    "/stats/:n",
    player(async (req, res) => {
      const n = Number(req.params.n);
      const pool = await db();
      const players = await pool.query(
        "SELECT count(DISTINCT account_id)::int AS n FROM derpy_based_picks WHERE chapter = $1",
        [n],
      );
      const rows = await pool.query(
        `SELECT choice, option, count(*)::int AS n FROM derpy_based_picks
         WHERE chapter = $1 GROUP BY choice, option`,
        [n],
      );
      const picks: Record<string, Record<string, number>> = {};
      for (const r of rows.rows) {
        (picks[r.choice] ??= {})[r.option] = r.n;
      }
      res.json({ players: players.rows[0]?.n ?? 0, picks });
    }),
  );

  // Notes for the writer, left on a scene while playing.
  router.post(
    "/notes",
    json,
    player(async (req, res) => {
      const parsed = NoteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_note" });
        return;
      }
      const d = parsed.data;
      const r = await (
        await db()
      ).query(
        `INSERT INTO derpy_based_notes (account_id, chapter, scene, line, path, note)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
        [
          req.based!.id,
          d.chapter,
          d.scene,
          d.line,
          JSON.stringify(d.path),
          d.note,
        ],
      );
      res.json({ id: Number(r.rows[0].id), createdAt: r.rows[0].created_at });
    }),
  );

  router.get(
    "/notes",
    player(async (req, res) => {
      const chapter = Number(req.query.chapter ?? 0);
      const scene = String(req.query.scene ?? "");
      const r = await (
        await db()
      ).query(
        `SELECT id, chapter, scene, line, note, created_at FROM derpy_based_notes
         WHERE account_id = $1 AND ($2 = 0 OR chapter = $2) AND ($3 = '' OR scene = $3)
         ORDER BY created_at DESC LIMIT 50`,
        [req.based!.id, chapter, scene],
      );
      res.json({
        notes: r.rows.map((n) => ({
          id: Number(n.id),
          chapter: n.chapter,
          scene: n.scene,
          line: n.line,
          note: n.note,
          createdAt: n.created_at,
        })),
      });
    }),
  );

  return router;
}
