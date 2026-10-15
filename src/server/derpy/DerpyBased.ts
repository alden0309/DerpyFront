// BASED (r19): Mr. Based, the story game, served to the accounts allowed to
// play it (only the owner's for now: NAMES r20 marks it by account, first
// found by the name "Alden", so it follows him through renames and nobody
// gains it by renaming to "Alden"). Everyone else gets Coming
// Soon. The story's text, its pictures and its sound live in src/based/ on
// the server and are only ever sent through this API, to those accounts:
// none of it is in the site's public JavaScript.
//
// Mounted by DerpyApi at /derpy/api/based.
//
// BWORLD (r22): saves are slots now (an autosave, a quicksave and ten of
// the player's own), one row each in derpy_based_slots, beside the
// account's profile (what's been seen, time played) in derpy_based_saves.
// A round-21 save there (v1: one save, chapters and checkpoints) is turned
// into a profile and an autosave the first time it's read.
//
// BPLAY (r22): a save holds what he carries (his pockets, what he wears and
// holds, his euros) and what the story so far needs (places, people,
// memories). A save from before loads with his starting kit.

import express, { NextFunction, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { flowOf } from "../../based/engine/Flow";
import { PlaceDef } from "../../based/engine/Place";
import { fromV1, isSlot, V1Save } from "../../based/engine/Save";
import { parseChapter } from "../../based/engine/Script";
import { Chapter } from "../../based/engine/Types";
import {
  formatProblem,
  validateChapter,
  validatePlaces,
} from "../../based/engine/Validate";
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

/**
 * The places a chapter names with @place, and (r22) every place their doors
 * lead to, and on: the whole world he can walk to.
 */
function placesOf(
  chapter: Chapter,
  all: Record<string, PlaceDef>,
): Set<string> {
  const keys = new Set<string>();
  const todo: string[] = [];
  for (const id of chapter.order) {
    const t = chapter.scenes[id].trigger;
    if (t?.on === "enter" && t.target) todo.push(t.target);
    if (t?.place) todo.push(t.place);
    for (const op of chapter.scenes[id].ops) {
      if (op.op === "place" && op.key) todo.push(op.key);
      if (op.op === "actor" && op.state?.place) todo.push(op.state.place);
    }
  }
  while (todo.length > 0) {
    const k = todo.pop()!;
    if (keys.has(k) || !all[k]) continue;
    keys.add(k);
    for (const h of Object.values(all[k].hotspots)) {
      if (h.to) todo.push(h.to.place);
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
  // r22: the places' doors must lead somewhere real.
  for (const m of validatePlaces(all)) {
    problems.push({ level: "error", line: 1, message: `place ${m}` });
  }
  const places: Record<string, PlaceDef> = {};
  for (const key of placesOf(chapter, all)) places[key] = all[key];
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
    .record(
      Key,
      z.object({
        at: Key,
        pose: Key,
        wear: Key.optional(),
        // r22: the place (area) they're in.
        place: Key.optional(),
      }),
    )
    .optional(),
  focus: Key.nullable().optional(),
  vignette: Key.nullable().optional(),
  props: z.record(Key, z.boolean()).optional(),
  // r22: the weather the story asked for.
  weather: Key.nullable().optional(),
});
// r21: who he is (the setup screen), what's boosted his skills, the dice.
const BuildSchema = z.object({
  attrs: z.record(Key, z.number().int().min(0).max(20)),
  signature: Key,
  archetype: Key.optional(),
  // r22 (BWORLD's saves): the languages he was given.
  langs: z.array(Key).max(12).optional(),
  // r22 BPLAY: language points spent at the start, by language.
  langPts: z.record(Key, z.number().int().min(0).max(9)).optional(),
});
const BoostSchema = z.object({
  skill: Key,
  delta: z.number().int().min(-10).max(10),
  why: z.string().max(200),
});
// BPLAY: what he carries.
const GearSlotSchema = z.enum([
  "hat",
  "glasses",
  "neck",
  "jacket",
  "shirt",
  "gloves",
  "trousers",
  "shoes",
  "hand",
]);
const KitSchema = z.object({
  inv: z.record(Key, z.number().int().min(0).max(9999)),
  worn: z.partialRecord(GearSlotSchema, Key),
  money: z.number().int().min(0).max(1e9),
});
const SnapSchema = z.object({
  chapter: z.number().int().min(1).max(99),
  scene: Key,
  flags: z.record(Key, z.number()),
  rels: z.record(Key, z.number()),
  stage: StageSchema,
  path: z.array(z.string().max(160)).max(3000),
  taken: z.array(z.string().max(160)).max(5000),
  build: BuildSchema.nullable().optional(),
  boosts: z.array(BoostSchema).max(200).optional(),
  seed: z.number().int().min(0).max(4294967295).optional(),
  checks: z
    .record(
      z.string().max(160),
      z.object({
        tries: z.number().int().min(0).max(1000),
        result: z.enum(["pass", "fail"]),
        bonus: z.number().int().min(-50).max(50),
        // BPLAY: when it was thrown.
        at: z.number().int().min(0).max(1e9).optional(),
      }),
    )
    .optional(),
  // r22: the open world: scenes played once, his journal, the clock.
  done: z.array(Key).max(10_000).optional(),
  tasks: z
    .record(Key, z.object({ text: z.string().max(400), done: z.boolean() }))
    .optional(),
  clock: z.number().int().min(0).max(1e9).optional(),
  // r22 BPLAY: what he carries: his pockets, what he wears and holds, euros.
  inv: KitSchema.shape.inv.optional(),
  worn: KitSchema.shape.worn.optional(),
  money: KitSchema.shape.money.optional(),
  // ...and what the story so far needs.
  visited: z.record(Key, z.number().int().min(0).max(1e9)).optional(),
  met: z.record(Key, z.number().int().min(0).max(1e9)).optional(),
  memories: z.array(Key).max(500).optional(),
  remembers: z.array(Key).max(500).optional(),
});
const SeenSchema = z.record(
  z.string().max(4),
  z.object({
    scenes: z.array(Key).max(10_000),
    options: z.array(z.string().max(160)).max(20_000),
    found: z.array(Key).max(10_000).default([]),
  }),
);
const FinishedSchema = z.record(
  z.string().max(4),
  z.object({
    at: z.string().max(40),
    flags: z.record(Key, z.number()),
    rels: z.record(Key, z.number()),
    path: z.array(z.string().max(160)).max(3000),
    build: BuildSchema.optional(),
    boosts: z.array(BoostSchema).max(200).optional(),
    kit: KitSchema.optional(),
  }),
);
/** r22: the account's profile beside its slots. */
export const ProfileSchema = z.object({
  v: z.literal(2),
  seen: SeenSchema,
  finished: FinishedSchema,
  played: z.number().int().min(0).max(1e9),
  migrated: z.string().max(600).optional(),
});
const MetaSchema = z.object({
  place: z.string().max(64),
  placeName: z.string().max(100),
  chapter: z.number().int().min(1).max(99),
  clock: z.number().int().min(0).max(1e9),
  savedAt: z.string().max(40),
  played: z.number().int().min(0).max(1e9),
  scene: Key,
  label: z.string().max(200),
});
/** r22: one save slot. */
export const SlotSchema = z.object({
  v: z.literal(2),
  meta: MetaSchema,
  snap: SnapSchema,
  world: z
    .object({
      x: z.number().finite(),
      z: z.number().finite(),
      heading: z.number().finite(),
      wet: z.number().min(0).max(1),
    })
    .optional(),
});

/** Round 21's chapter-one scenes after he'd met London's contact. */
const V1_PAST_MEETING = [
  "penhallow",
  "vienna",
  "briefing",
  "questions",
  "the_question",
  "photo",
  "first_glass",
  "street",
  "epilogue",
];

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

  /** The account's slots, listed (not their contents). */
  const listSlots = async (account: number) => {
    const r = await (
      await db()
    ).query(
      "SELECT slot, meta, updated_at FROM derpy_based_slots WHERE account_id = $1",
      [account],
    );
    return r.rows.map((x) => ({
      slot: x.slot as string,
      meta: x.meta as unknown,
      updatedAt: x.updated_at as string,
    }));
  };

  const writeSlot = async (account: number, slot: string, save: unknown) => {
    const parsed = SlotSchema.parse(save);
    await (
      await db()
    ).query(
      `INSERT INTO derpy_based_slots (account_id, slot, meta, data, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (account_id, slot)
       DO UPDATE SET meta = $3, data = $4, updated_at = now()`,
      [
        account,
        slot,
        JSON.stringify(parsed.meta),
        JSON.stringify({ v: parsed.v, snap: parsed.snap, world: parsed.world }),
      ],
    );
  };

  /**
   * The profile, and the slots listed. A round-21 save is converted the
   * first time it's read: a profile, and an autosave at the nearest point
   * of the rewritten chapter one (engine/Save.ts says how).
   */
  router.get(
    "/save",
    player(async (req, res) => {
      const id = req.based!.id;
      const r = await (
        await db()
      ).query(
        "SELECT save, updated_at FROM derpy_based_saves WHERE account_id = $1",
        [id],
      );
      let save = (r.rows[0]?.save ?? null) as {
        v: number;
        [k: string]: unknown;
      } | null;
      if (save?.v === 1) {
        const ch = loadChapter(1);
        if (ch && ch.errors.length === 0) {
          const { profile, auto } = fromV1(
            save as unknown as V1Save,
            ch.chapter,
            {
              now: new Date().toISOString(),
              pastScenes: V1_PAST_MEETING,
              openFlag: "met_contact",
              places: ch.places,
            },
          );
          if (auto) {
            auto.meta.placeName =
              ch.places[auto.meta.place]?.name ?? auto.meta.placeName;
            await writeSlot(id, "auto", auto);
          }
          await (
            await db()
          ).query(
            "UPDATE derpy_based_saves SET save = $2, updated_at = now() WHERE account_id = $1",
            [id, JSON.stringify(profile)],
          );
          save = profile as unknown as { v: number };
        }
      }
      res.json({
        save: save?.v === 2 ? save : null,
        slots: await listSlots(id),
        updatedAt: r.rows[0]?.updated_at ?? null,
      });
    }),
  );

  router.put(
    "/save",
    json,
    player(async (req, res) => {
      const parsed = ProfileSchema.safeParse(req.body?.save);
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

  // Starting over: the profile and every slot.
  router.delete(
    "/save",
    player(async (req, res) => {
      const pool = await db();
      await pool.query("DELETE FROM derpy_based_saves WHERE account_id = $1", [
        req.based!.id,
      ]);
      await pool.query("DELETE FROM derpy_based_slots WHERE account_id = $1", [
        req.based!.id,
      ]);
      res.status(204).end();
    }),
  );

  router.get(
    "/slots",
    player(async (req, res) => {
      res.json({ slots: await listSlots(req.based!.id) });
    }),
  );

  router.get(
    "/slot/:slot",
    player(async (req, res) => {
      const slot = String(req.params.slot);
      if (!isSlot(slot)) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const r = await (
        await db()
      ).query(
        "SELECT meta, data FROM derpy_based_slots WHERE account_id = $1 AND slot = $2",
        [req.based!.id, slot],
      );
      const row = r.rows[0];
      res.json({ save: row ? { ...row.data, meta: row.meta } : null });
    }),
  );

  router.put(
    "/slot/:slot",
    json,
    player(async (req, res) => {
      const slot = String(req.params.slot);
      if (!isSlot(slot)) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (!SlotSchema.safeParse(req.body?.save).success) {
        res.status(400).json({ error: "invalid_save" });
        return;
      }
      await writeSlot(req.based!.id, slot, req.body.save);
      res.status(204).end();
    }),
  );

  router.delete(
    "/slot/:slot",
    player(async (req, res) => {
      const slot = String(req.params.slot);
      if (!isSlot(slot)) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await (
        await db()
      ).query(
        "DELETE FROM derpy_based_slots WHERE account_id = $1 AND slot = $2",
        [req.based!.id, slot],
      );
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
