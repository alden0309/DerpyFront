// BASED (r19): Mr. Based's gate and API. Only the account named Alden may
// play (NAMES r20: the account marked for it, found by that name when it
// signs up); another account and a signed-out visitor get Coming Soon and are
// refused the story, its pictures and its sound. Also saves (r22: a profile
// and save slots, and a round-21 save turned into an autosave), picks for
// the flowchart, and notes for the writer (and the script that prints them).
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
      "DROP TABLE IF EXISTS derpy_based_notes, derpy_based_picks, derpy_based_saves, derpy_based_slots CASCADE",
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
    // BSTORY (r25): the new sound and the score, as private as the rest.
    "/based/audio/score_bar",
    "/based/audio/steps_wood",
    "/based/audio/murmur",
    // BASED (r21): the 3D models are as private as the pictures.
    "/based/model/props",
    "/based/model/body_m", // BPEOPLE (r22): the people's bodies
    "/based/model/fusion_props", // BFIX (r23): the props modelled in Fusion
    "/based/save",
    "/based/slots",
    "/based/slot/auto",
    "/based/stats/1",
    "/based/notes",
    "/based/notes/all", // r26: his notes, to copy out to the writer
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
      chapters: { n: number; title: string; ok: boolean }[];
      next: number;
    };
    expect(list.chapters[0]).toMatchObject({
      n: 1,
      title: "Eleven Days",
      ok: true,
    });
    expect(list.next).toBe(2);

    const ch = await call("/based/chapter/1", alden);
    expect(ch.status).toBe(200);
    const body = (await ch.json()) as {
      chapter: { title: string; scenes: Record<string, unknown> };
      flow: unknown[];
      credits: { items: unknown[] };
      places: Record<string, { marks: Record<string, unknown> }>;
    };
    expect(body.chapter.title).toBe("Eleven Days");
    // r21: the places it's played in come with it (r22: every place its
    // doors lead to, too).
    // r25: and his room, up the hotel's stairs.
    expect(Object.keys(body.places).sort()).toEqual([
      "elysee",
      "room",
      "street",
      "vauban",
    ]);
    expect(body.places.vauban.marks).toHaveProperty("stool_end");
    expect(Object.keys(body.chapter.scenes)).toContain("order");
    expect(body.flow.length).toBe(Object.keys(body.chapter.scenes).length);
    expect(body.credits.items.length).toBeGreaterThan(10);

    const art = await call("/based/art/bar_wide", alden);
    expect(art.status).toBe(200);
    expect(art.headers.get("content-type")).toBe("image/webp");
    expect(art.headers.get("cache-control")).toBe("private, max-age=86400");
    const sound = await call("/based/audio/rain", alden);
    expect(sound.headers.get("content-type")).toBe("audio/mpeg");
    // BSTORY (r25): the score and the effects, gated the same way.
    for (const key of ["score_bar", "score_night", "things", "steps_stone"]) {
      const s = await call(`/based/audio/${key}`, alden);
      expect(s.status, key).toBe(200);
      expect(s.headers.get("content-type")).toBe("audio/mpeg");
      expect(s.headers.get("cache-control")).toBe("private, max-age=86400");
    }
    expect((await call("/based/audio/nope", alden)).status).toBe(404);
    const model = await call("/based/model/props", alden);
    expect(model.status).toBe(200);
    expect(model.headers.get("content-type")).toBe("model/gltf-binary");
    expect(model.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(
      Buffer.from(await model.arrayBuffer())
        .subarray(0, 4)
        .toString(),
    ).toBe("glTF");
    // BFIX (r23): and the props modelled for the game in Fusion.
    const fusion = await call("/based/model/fusion_props", alden);
    expect(fusion.status).toBe(200);
    expect(fusion.headers.get("content-type")).toBe("model/gltf-binary");
    expect((await call("/based/model/nope", alden)).status).toBe(404);

    expect((await call("/based/chapter/99", alden)).status).toBe(404);
    expect(
      (await call("/based/art/..%2Fstory%2Fchapter-01", alden)).status,
    ).toBe(404);
    expect((await call("/based/art/nope", alden)).status).toBe(404);
  });

  test("a round-21 save becomes a profile and an autosave", async () => {
    // As round 21 kept it: one save, a current scene, checkpoints.
    const snap = {
      chapter: 1,
      scene: "penhallow",
      flags: { thoughts: 2, thought_glass: 1 },
      rels: {},
      stage: {
        backdrop: null,
        figure: null,
        ambient: "rain_in",
        news: null,
        place: "grenelle",
        actors: { BASED: { at: "stool_end", pose: "sit" } },
        focus: null,
        vignette: null,
        props: {},
      },
      path: ["s:open", "s:vauban"],
      taken: [],
      build: {
        attrs: { WITS: 4, NERVE: 2, HEART: 3 },
        signature: "MEMORY",
        archetype: "ANALYST",
      },
      boosts: [],
      seed: 4242,
      checks: {},
    };
    const pg = await import("pg");
    const c = new pg.default.Client({ connectionString: TEST_DB });
    await c.connect();
    await c.query(
      `INSERT INTO derpy_based_saves (account_id, save)
       SELECT id, $1 FROM derpy_accounts WHERE username_key = 'alden'
       ON CONFLICT (account_id) DO UPDATE SET save = $1`,
      [
        JSON.stringify({
          v: 1,
          current: snap,
          checkpoints: {
            "1": { penhallow: { label: "Penhallow", at: "x", snap } },
          },
          seen: { "1": { scenes: ["open"], options: [], found: [] } },
          finished: {},
        }),
      ],
    );
    await c.end();
    const r = (await (await call("/based/save", alden)).json()) as {
      save: { v: number; migrated: string; seen: object };
      slots: {
        slot: string;
        meta: { place: string; placeName: string; scene: string };
      }[];
    };
    expect(r.save.v).toBe(2);
    expect(r.save.migrated).toContain("the world opens");
    expect(r.save.seen).toEqual({});
    expect(r.slots.map((s) => s.slot)).toEqual(["auto"]);
    expect(r.slots[0].meta.scene).toBe("FREE");
    expect(r.slots[0].meta.placeName).toBe("Le Vauban");
    const auto = (await (await call("/based/slot/auto", alden)).json()) as {
      save: {
        snap: {
          flags: Record<string, number>;
          build: { archetype: string; langPts: Record<string, number> };
          seed: number;
        };
        meta: { chapter: number };
      };
    };
    // Past the meeting with the contact, he's free; who he was is kept.
    expect(auto.save.snap.flags.met_contact).toBe(1);
    expect(auto.save.snap.build.archetype).toBe("ANALYST");
    // r22 BPLAY: his languages as points (the Analyst's four).
    expect(
      Object.values(auto.save.snap.build.langPts).reduce((a, n) => a + n, 0),
    ).toBe(4);
    expect(auto.save.snap.seed).toBe(4242);
    expect(auto.save.meta.chapter).toBe(1);
    // Read again: converted once only.
    const again = (await (await call("/based/save", alden)).json()) as {
      slots: unknown[];
    };
    expect(again.slots).toHaveLength(1);
  });

  test("save slots round-trip, and junk is refused", async () => {
    const snap = {
      chapter: 1,
      scene: "FREE",
      flags: { met_contact: 1 },
      rels: { ANSELME: 2 },
      stage: {
        backdrop: null,
        figure: null,
        ambient: "rain_in",
        news: null,
        place: "vauban",
        actors: {
          BASED: { at: "stool_end", pose: "sit", place: "vauban" },
          WATCHER: { at: "watcher_spot", pose: "fold", place: "street" },
          // BSTORY (r25): a regular's life of his own is kept.
          REGULAR: {
            at: "stool_4",
            pose: "sit",
            place: "vauban",
            idle: "drink",
          },
        },
        focus: null,
        vignette: null,
        props: { glass_second: true },
        weather: "changing",
      },
      path: ["s:open", "s:vauban"],
      taken: [],
      build: {
        attrs: { SOCIAL: 2, INTELLIGENCE: 4, PHYSICAL: 3 },
        signature: "MEMORY",
        archetype: "ANALYST",
        langs: ["fr", "en_gb", "de"],
      },
      boosts: [
        { skill: "INSTINCT", delta: 1, why: "What the British didn't ask" },
      ],
      seed: 123456789,
      checks: { "room@1:expected": { tries: 1, result: "fail", bonus: 3 } },
      done: ["vauban", "posters"],
      tasks: {
        contact: { text: "Meet London's contact.", done: true },
        clovis: { text: "Find out what CLOVIS is.", done: false },
      },
      clock: 80_400,
    };
    const slot = {
      v: 2,
      meta: {
        place: "vauban",
        placeName: "Le Vauban",
        chapter: 1,
        clock: 80_400,
        savedAt: "2026-10-14T22:00:00.000Z",
        played: 1830,
        scene: "FREE",
        label: "Free to go",
      },
      snap,
      world: { x: -4.1, z: -1.5, heading: 3.14, wet: 0.35 },
    };
    const put = await call("/based/slot/3", alden, {
      method: "PUT",
      body: JSON.stringify({ save: slot }),
    });
    expect(put.status).toBe(204);
    const back = (await (await call("/based/slot/3", alden)).json()) as {
      save: typeof slot;
    };
    expect(back.save).toEqual(slot);
    // Listed by what it says, without its contents.
    const list = (await (await call("/based/slots", alden)).json()) as {
      slots: { slot: string; meta: object; snap?: object }[];
    };
    const three = list.slots.find((s) => s.slot === "3")!;
    expect(three.meta).toEqual(slot.meta);
    expect(three.snap).toBeUndefined();
    // Saving again overwrites; the quicksave and autosave are slots too.
    for (const s of ["3", "quick", "auto", "10"]) {
      expect(
        (
          await call(`/based/slot/${s}`, alden, {
            method: "PUT",
            body: JSON.stringify({ save: slot }),
          })
        ).status,
      ).toBe(204);
    }
    // Not a slot.
    for (const s of ["11", "0", "secret"]) {
      expect(
        (
          await call(`/based/slot/${s}`, alden, {
            method: "PUT",
            body: JSON.stringify({ save: slot }),
          })
        ).status,
      ).toBe(404);
    }
    // Junk.
    expect(
      (
        await call("/based/slot/4", alden, {
          method: "PUT",
          body: JSON.stringify({ save: { v: 1 } }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("/based/slot/4", alden, {
          method: "PUT",
          body: JSON.stringify({ save: { ...slot, world: { x: 1 } } }),
        })
      ).status,
    ).toBe(400);
    expect(
      ((await (await call("/based/slot/9", alden)).json()) as { save: unknown })
        .save,
    ).toBeNull();
    // Another account can't write one.
    expect(
      (
        await call("/based/slot/3", tester, {
          method: "PUT",
          body: JSON.stringify({ save: slot }),
        })
      ).status,
    ).toBe(403);
    // Deleting one slot leaves the rest.
    expect(
      (await call("/based/slot/10", alden, { method: "DELETE" })).status,
    ).toBe(204);
    const after = (await (await call("/based/slots", alden)).json()) as {
      slots: { slot: string }[];
    };
    expect(after.slots.map((s) => s.slot).sort()).toEqual([
      "3",
      "auto",
      "quick",
    ]);
  });

  test("a slot with what he carries round-trips; junk in it is refused (BPLAY)", async () => {
    const snap = {
      chapter: 1,
      scene: "FREE",
      flags: {},
      rels: {},
      // His language points (r22 BPLAY).
      build: {
        attrs: { SOCIAL: 2, INTELLIGENCE: 4, PHYSICAL: 3 },
        signature: "MEMORY",
        archetype: "ANALYST",
        langPts: { fr: 2, ru: 2 },
      },
      stage: {
        backdrop: null,
        figure: null,
        ambient: null,
        news: null,
        place: "street",
        actors: {},
        focus: null,
        vignette: null,
        props: {},
        weather: null,
      },
      path: [],
      taken: [],
      checks: {
        "watcher#1/ask-who-he-s-waiting-for": {
          tries: 2,
          result: "pass",
          bonus: 6,
          at: 79_620,
        },
      },
      clock: 79_800,
      inv: { matchbook: 1, cigarettes: 1, phone: 1, passport: 1 },
      worn: {
        jacket: "field_jacket",
        shirt: "olive_tee",
        trousers: "cargo_trousers",
        shoes: "boots",
        glasses: "reading_glasses",
        hand: "umbrella",
      },
      money: 158,
      visited: { street: 78_000, vauban: 79_000 },
      met: { WATCHER: 78_400, BARMAN: 79_100 },
      memories: ["london"],
      remembers: ["PENHALLOW"],
    };
    const slot = {
      v: 2,
      meta: {
        place: "street",
        placeName: "Rue de Grenelle",
        chapter: 1,
        clock: 79_800,
        savedAt: "2026-10-15T01:00:00.000Z",
        played: 900,
        scene: "FREE",
        label: "Free to go",
      },
      snap,
    };
    const put = (save: unknown) =>
      call("/based/slot/5", alden, {
        method: "PUT",
        body: JSON.stringify({ save }),
      });
    expect((await put(slot)).status).toBe(204);
    const back = (await (await call("/based/slot/5", alden)).json()) as {
      save: typeof slot;
    };
    expect(back.save).toEqual(slot);
    // A slot that isn't one, a negative count, a negative purse: refused.
    for (const bad of [
      { ...snap, worn: { pocket: "phone" } },
      { ...snap, inv: { phone: -1 } },
      { ...snap, money: -5 },
      { ...snap, build: { ...snap.build, langPts: { fr: -1 } } },
    ]) {
      expect((await put({ ...slot, snap: bad })).status).toBe(400);
    }
    expect(
      (await call("/based/slot/5", alden, { method: "DELETE" })).status,
    ).toBe(204);
  });

  test("the profile round-trips; a round-21 one can't be written", async () => {
    const profile = {
      v: 2,
      seen: {
        "1": {
          scenes: ["open", "vauban"],
          options: ["order#1=a-scotch"],
          found: [],
        },
      },
      finished: {},
      played: 1830,
    };
    expect(
      (
        await call("/based/save", alden, {
          method: "PUT",
          body: JSON.stringify({ save: profile }),
        })
      ).status,
    ).toBe(204);
    const back = (await (await call("/based/save", alden)).json()) as {
      save: unknown;
      slots: unknown[];
    };
    expect(back.save).toEqual(profile);
    expect(back.slots.length).toBe(3);
    expect(
      (
        await call("/based/save", alden, {
          method: "PUT",
          body: JSON.stringify({ save: { v: 1, current: null } }),
        })
      ).status,
    ).toBe(400);
    // Starting over erases the profile and every slot.
    expect(
      (await call("/based/save", alden, { method: "DELETE" })).status,
    ).toBe(204);
    const none = (await (await call("/based/save", alden)).json()) as {
      save: unknown;
      slots: unknown[];
    };
    expect(none).toMatchObject({ save: null, slots: [] });
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
      body: JSON.stringify({ chapter: 1, scene: "order", note: "   " }),
    });
    expect(bad.status).toBe(400);
    const r = await call("/based/notes", alden, {
      method: "POST",
      body: JSON.stringify({
        chapter: 1,
        scene: "order",
        line: "BARMAN: Good evening, sir. What can I get you?",
        path: [
          "s:open",
          "s:posters",
          "s:vauban",
          "s:order",
          "c:order#1=a-scotch",
        ],
        note: "Love the barman. Make him a little older?",
      }),
    });
    expect(r.status).toBe(200);
    const { id } = (await r.json()) as { id: number };
    expect(id).toBeGreaterThan(0);

    const mine = (await (
      await call("/based/notes?chapter=1&scene=order", alden)
    ).json()) as {
      notes: { note: string }[];
    };
    expect(mine.notes.map((n) => n.note)).toContain(
      "Love the barman. Make him a little older?",
    );

    // What scripts/based-notes.ts prints for the coordinator.
    const { listNotes, formatNotes } =
      await import("../../src/server/derpy/BasedNotes");
    const { loadChapter } = await import("../../src/server/derpy/DerpyBased");
    const { db } = await import("../../src/server/derpy/DerpyDb");
    const notes = await listNotes(await db(), { chapter: 1 });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ username: "Alden", scene: "order" });
    const text = formatNotes(notes, new Map([[1, loadChapter(1)!.chapter]]));
    expect(text).toContain('Chapter 1, scene "order" (The barman');
    expect(text).toContain("On screen: BARMAN: Good evening, sir.");
    expect(text).toContain(
      "Path: open > posters > vauban > order > [A scotch]",
    );
    expect(text).toContain("> Love the barman. Make him a little older?");
  });

  test("r26: all his notes, as text for the writer, marked sent once copied, the sent ones cleared", async () => {
    const r = await call("/based/notes", alden, {
      method: "POST",
      body: JSON.stringify({
        chapter: 1,
        scene: "tv_talk",
        line: "BARMAN: My grandson joined his Volunteers in the spring.",
        path: ["s:order", "c:order#1=a-scotch", "s:tv_talk"],
        note: "Should he say this to a stranger?\nMaybe later in the night.",
      }),
    });
    expect(r.status).toBe(200);
    type Mine = {
      notes: {
        id: number;
        scene: string;
        sceneLabel: string;
        note: string;
        sentAt: string | null;
        entry: string;
      }[];
    };
    const all = async () =>
      ((await (await call("/based/notes/all", alden)).json()) as Mine).notes;
    let notes = await all();
    // Both of his, oldest first, none sent yet.
    expect(notes.map((n) => n.scene)).toEqual(["order", "tv_talk"]);
    expect(notes.every((n) => n.sentAt === null)).toBe(true);
    const tv = notes[1];
    expect(tv.sceneLabel).toBe("The television");
    expect(tv.entry).toMatch(
      /^Chapter 1, "The television" \(scene tv_talk, script line \d+\)/,
    );
    expect(tv.entry).toMatch(/\nWritten: \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/);
    expect(tv.entry).toContain(
      "On screen: BARMAN: My grandson joined his Volunteers in the spring.",
    );
    expect(tv.entry).toContain("Choices that led there: [A scotch]");
    expect(tv.entry).toContain(
      "Note: Should he say this to a stranger?\n  Maybe later in the night.",
    );
    // And as one piece of text, as the page copies it.
    const { notesText } = await import("../../src/based/client/NotesText");
    const text = notesText(notes as never, new Date("2026-10-21T12:00:00Z"));
    expect(text).toMatch(
      /^Mr\. Based: 2 notes for the writer \(copied 2026-10-21 12:00 UTC\)\n\n1\. Chapter 1, "The barman"/,
    );
    expect(text).toContain('\n\n2. Chapter 1, "The television"');

    // Copied: marked sent. Only his own, and only once.
    const bad = await call("/based/notes/sent", alden, {
      method: "POST",
      body: JSON.stringify({ ids: [] }),
    });
    expect(bad.status).toBe(400);
    const mark = async (ids: number[]) =>
      (
        (await (
          await call("/based/notes/sent", alden, {
            method: "POST",
            body: JSON.stringify({ ids }),
          })
        ).json()) as { marked: number }
      ).marked;
    expect(await mark([notes[0].id, 999_999])).toBe(1);
    expect(await mark([notes[0].id])).toBe(0);
    notes = await all();
    expect(notes[0].sentAt).not.toBeNull();
    expect(notes[1].sentAt).toBeNull();
    const other = await call("/based/notes/sent", tester, {
      method: "POST",
      body: JSON.stringify({ ids: [notes[1].id] }),
    });
    expect(other.status).toBe(403);

    // "Clear the ones I've sent": the sent one goes, the new one stays.
    const cleared = (await (
      await call("/based/notes/sent", alden, { method: "DELETE" })
    ).json()) as { cleared: number };
    expect(cleared.cleared).toBe(1);
    notes = await all();
    expect(notes.map((n) => n.scene)).toEqual(["tv_talk"]);
    expect(
      (await call("/based/notes/sent", tester, { method: "DELETE" })).status,
    ).toBe(403);
  });
});
