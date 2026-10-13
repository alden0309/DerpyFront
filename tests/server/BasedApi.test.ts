// BASED (r19): Mr. Based's gate and API. Only the account named Alden may
// play (NAMES r20: the account marked for it, found by that name when it
// signs up); another account and a signed-out visitor get Coming Soon and are
// refused the story, its pictures and its sound. Also saves, picks for the
// flowchart, and notes for the writer (and the script that prints them).
//
// Needs a throwaway Postgres: DERPY_TEST_DATABASE_URL=postgres://...

import express from "express";
import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

// NAMES (r20): access is a mark on the account, by id; BASED_PLAYERS only
// names the accounts to mark, once each (DerpyRename.test.ts covers renames).
describe("who may play", async () => {
  const { canPlayBased, basedPlayers } =
    await import("../../src/server/derpy/DerpyBased");

  test("the owner's name, in any case, is the one to mark", () => {
    delete process.env.BASED_PLAYERS;
    expect([...basedPlayers()]).toEqual(["alden"]);
  });

  test("BASED_PLAYERS can widen it later", () => {
    process.env.BASED_PLAYERS = "Alden, Tester_Pat";
    expect([...basedPlayers()]).toEqual(["alden", "tester_pat"]);
    delete process.env.BASED_PLAYERS;
  });

  test("nobody signed out may play", async () => {
    expect(await canPlayBased(null)).toBe(false);
  });
});

describe.skipIf(!TEST_DB)("Mr. Based's API against Postgres", () => {
  let base = "";
  let server: http.Server;
  let closeDb: () => Promise<void>;
  let alden = "";
  let tester = "";

  async function call(
    path: string,
    token = "",
    init: RequestInit = {},
  ): Promise<Response> {
    return fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }

  async function signIn(username: string): Promise<string> {
    const body = JSON.stringify({ username, password: "hunter22" });
    let r = await call("/register", "", { method: "POST", body });
    if (r.status === 409)
      r = await call("/login", "", { method: "POST", body });
    expect(r.status).toBe(200);
    return ((await r.json()) as { token: string }).token;
  }

  beforeAll(async () => {
    delete process.env.BASED_PLAYERS;
    process.env.DATABASE_URL = TEST_DB;
    const pg = await import("pg");
    const c = new pg.default.Client({ connectionString: TEST_DB });
    await c.connect();
    await c.query(
      "DROP TABLE IF EXISTS derpy_based_notes, derpy_based_picks, derpy_based_saves CASCADE",
    );
    await c
      .query(
        "DELETE FROM derpy_accounts WHERE username_key IN ('alden', 'based_tester')",
      )
      .catch(() => {});
    // NAMES (r20): no account left marked by another test, so the Alden
    // signed up below is the one the name marks.
    await c
      .query(
        "UPDATE derpy_accounts SET based_access = false, based_granted_as = NULL",
      )
      .catch(() => {});
    await c.end();
    const { derpyApiRouter } = await import("../../src/server/derpy/DerpyApi");
    ({ closeDerpyDb: closeDb } =
      await import("../../src/server/derpy/DerpyDb"));
    const app = express();
    app.use("/derpy/api", derpyApiRouter());
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/derpy/api`;
    alden = await signIn("Alden");
    tester = await signIn("Based_Tester");
  }, 60_000);

  afterAll(async () => {
    await new Promise((r) => server?.close(r));
    await closeDb?.();
  });

  test("anyone can ask whether they may play", async () => {
    expect(await (await call("/based/access")).json()).toEqual({
      signedIn: false,
      play: false,
    });
    expect(await (await call("/based/access", tester)).json()).toEqual({
      signedIn: true,
      play: false,
    });
    expect(await (await call("/based/access", alden)).json()).toEqual({
      signedIn: true,
      play: true,
    });
  });

  test.each([
    "/based/chapters",
    "/based/chapter/1",
    "/based/art/bar_wide",
    "/based/audio/rain",
    "/based/save",
    "/based/stats/1",
    "/based/notes",
  ])("%s refuses the signed-out and other accounts", async (path) => {
    const anon = await call(path);
    expect(anon.status).toBe(401);
    const other = await call(path, tester);
    expect(other.status).toBe(403);
    const text = await other.text();
    expect(JSON.parse(text)).toEqual({ error: "coming_soon" });
    // Nothing of the story leaks into a refusal.
    expect(text).not.toMatch(/Anselme|Vauban|Penhallow/);
  });

  test("Alden gets the chapters, the story and its art", async () => {
    const list = (await (await call("/based/chapters", alden)).json()) as {
      chapters: {
        n: number;
        title: string;
        ok: boolean;
        checkpoints: unknown[];
      }[];
      next: number;
    };
    expect(list.chapters[0]).toMatchObject({
      n: 1,
      title: "The First Glass",
      ok: true,
    });
    expect(list.chapters[0].checkpoints.length).toBeGreaterThan(3);
    expect(list.next).toBe(2);

    const ch = await call("/based/chapter/1", alden);
    expect(ch.status).toBe(200);
    const body = (await ch.json()) as {
      chapter: { title: string; scenes: Record<string, unknown> };
      flow: unknown[];
      credits: { items: unknown[] };
    };
    expect(body.chapter.title).toBe("The First Glass");
    expect(Object.keys(body.chapter.scenes)).toContain("anselme");
    expect(body.flow.length).toBe(Object.keys(body.chapter.scenes).length);
    expect(body.credits.items.length).toBeGreaterThan(10);

    const art = await call("/based/art/bar_wide", alden);
    expect(art.status).toBe(200);
    expect(art.headers.get("content-type")).toBe("image/webp");
    expect(art.headers.get("cache-control")).toBe("private, max-age=86400");
    const sound = await call("/based/audio/rain", alden);
    expect(sound.headers.get("content-type")).toBe("audio/mpeg");

    expect((await call("/based/chapter/99", alden)).status).toBe(404);
    expect(
      (await call("/based/art/..%2Fstory%2Fchapter-01", alden)).status,
    ).toBe(404);
    expect((await call("/based/art/nope", alden)).status).toBe(404);
  });

  test("saves round-trip, and junk is refused", async () => {
    expect(await (await call("/based/save", alden)).json()).toMatchObject({
      save: null,
    });
    const bad = await call("/based/save", alden, {
      method: "PUT",
      body: JSON.stringify({ save: { v: 2 } }),
    });
    expect(bad.status).toBe(400);
    const snap = {
      chapter: 1,
      scene: "anselme",
      flags: { thoughts: 2, thought_glass: 1 },
      rels: {},
      stage: {
        backdrop: "glass",
        figure: null,
        ambient: "rain_in",
        news: null,
      },
      path: ["s:open", "s:vauban", "s:reverie", "c:reverie#1=the-first-glass"],
      taken: ["reverie#1/the-first-glass"],
    };
    const save = {
      v: 1,
      current: snap,
      checkpoints: {
        "1": {
          anselme: { label: "The bartender", at: "2026-10-13T12:00:00Z", snap },
        },
      },
      seen: {
        "1": {
          scenes: ["open", "vauban"],
          options: ["reverie#1=the-first-glass"],
          found: [],
        },
      },
      finished: {},
    };
    const put = await call("/based/save", alden, {
      method: "PUT",
      body: JSON.stringify({ save }),
    });
    expect(put.status).toBe(204);
    const back = (await (await call("/based/save", alden)).json()) as {
      save: typeof save;
    };
    expect(back.save).toEqual(save);
    // Another account can't write one.
    const theirs = await call("/based/save", tester, {
      method: "PUT",
      body: JSON.stringify({ save }),
    });
    expect(theirs.status).toBe(403);
  });

  test("picks feed the flowchart's shares", async () => {
    const r = await call("/based/picks", alden, {
      method: "POST",
      body: JSON.stringify({
        chapter: 1,
        picks: [
          { choice: "anselme#1", option: "it-might" },
          { choice: "first_glass#1", option: "drink-it" },
        ],
      }),
    });
    expect(r.status).toBe(204);
    // Changing your mind replaces your pick rather than adding one.
    await call("/based/picks", alden, {
      method: "POST",
      body: JSON.stringify({
        chapter: 1,
        picks: [{ choice: "first_glass#1", option: "leave-it" }],
      }),
    });
    const stats = await (await call("/based/stats/1", alden)).json();
    expect(stats).toEqual({
      players: 1,
      picks: {
        "anselme#1": { "it-might": 1 },
        "first_glass#1": { "leave-it": 1 },
      },
    });
  });

  test("notes for the writer are kept with their scene and path", async () => {
    const bad = await call("/based/notes", alden, {
      method: "POST",
      body: JSON.stringify({ chapter: 1, scene: "anselme", note: "   " }),
    });
    expect(bad.status).toBe(400);
    const r = await call("/based/notes", alden, {
      method: "POST",
      body: JSON.stringify({
        chapter: 1,
        scene: "anselme",
        line: "ANSELME: Monsieur Based. You are looking at that glass as if it owes you money.",
        path: [
          "s:open",
          "s:vauban",
          "s:reverie",
          "c:reverie#1=back-to-the-room",
          "s:anselme",
        ],
        note: "Love Anselme. Make him a little older?",
      }),
    });
    expect(r.status).toBe(200);
    const { id } = (await r.json()) as { id: number };
    expect(id).toBeGreaterThan(0);

    const mine = (await (
      await call("/based/notes?chapter=1&scene=anselme", alden)
    ).json()) as {
      notes: { note: string }[];
    };
    expect(mine.notes.map((n) => n.note)).toContain(
      "Love Anselme. Make him a little older?",
    );

    // What scripts/based-notes.ts prints for the coordinator.
    const { listNotes, formatNotes } =
      await import("../../src/server/derpy/BasedNotes");
    const { loadChapter } = await import("../../src/server/derpy/DerpyBased");
    const { db } = await import("../../src/server/derpy/DerpyDb");
    const notes = await listNotes(await db(), { chapter: 1 });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ username: "Alden", scene: "anselme" });
    const text = formatNotes(notes, new Map([[1, loadChapter(1)!.chapter]]));
    expect(text).toContain('Chapter 1, scene "anselme" (Anselme');
    expect(text).toContain("On screen: ANSELME: Monsieur Based.");
    expect(text).toContain(
      "Path: open > vauban > reverie > [Back to the room] > anselme",
    );
    expect(text).toContain("> Love Anselme. Make him a little older?");
  });
});
