// NEWS (r25): What's New on the server. The entries file and its checks (a
// bad file fails here, and on the live site is logged and none served),
// the order, who may see what (Mr. Based's entries only for the accounts
// that may play it, and not a trace of them for anyone else), and what's
// been seen, signed in, against a real Postgres.
//
// The database part needs a throwaway Postgres:
// DERPY_TEST_DATABASE_URL=postgres://... (every derpy_ table in it is
// dropped first). Skipped without one.

import express from "express";
import fs from "fs";
import http from "http";
import { AddressInfo } from "net";
import os from "os";
import path from "path";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import {
  newerMark,
  NEWS_NOTHING,
  newsOrder,
  unseenCount,
  type NewsEntry,
  type NewsView,
} from "../../src/derpland/NewsTypes";
import type { SocialState } from "../../src/derpland/SocialTypes";

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: logError, info: vi.fn(), warn: vi.fn() }),
  },
}));

import {
  forgetNewsViewers,
  loadNews,
  NEWS_FILE,
  newsView,
  parseNewsFile,
  setNews,
  sortNews,
} from "../../src/server/derpy/DerpyNews";

/** Words only Mr. Based's entries have: none may reach anyone else. */
const SECRET = ["Fountain Pen", "dead drop", "chapter-two", "Mr. Based"];

const FIXTURE: NewsEntry[] = [
  {
    id: "2026-10-21-store",
    date: "2026-10-21",
    game: "site",
    title: "A bigger Store",
    body: "Every skin in one place.\n\n- Packs\n- Single skins",
    link: "/store",
    linkText: "Open the Store",
  },
  {
    id: "2026-10-20-chapter-two",
    date: "2026-10-20",
    game: "based",
    title: "The Fountain Pen",
    body: "Chapter two: a **dead drop** on the Seine.",
  },
  {
    id: "2026-10-20-capitals",
    date: "2026-10-20",
    game: "derpyfront",
    title: "Capitals",
    body: "Raise a Capital and *hold* it.",
  },
  {
    id: "2026-10-19-harbours",
    date: "2026-10-19",
    game: "conquest",
    title: "Harbours",
    body: "Ships come in at last.",
  },
];

const secretFree = (x: unknown) => {
  const text = JSON.stringify(x).toLowerCase();
  for (const word of [...SECRET, "based"])
    expect(text).not.toContain(word.toLowerCase());
};

describe("the entries file", () => {
  test("the one in the repo is right (a bad one fails here first)", () => {
    const r = parseNewsFile(fs.readFileSync(NEWS_FILE, "utf8"));
    if (!r.ok)
      throw new Error(`src/server/derpy/news/entries.json: ${r.error}`);
    expect(Array.isArray(r.entries)).toBe(true);
  });

  test("a good file, newest first (on one day, the one higher in the file)", () => {
    const shuffled = [FIXTURE[3], FIXTURE[1], FIXTURE[0], FIXTURE[2]];
    const r = parseNewsFile(JSON.stringify(shuffled));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entries.map((e) => e.id)).toEqual([
      "2026-10-21-store",
      "2026-10-20-chapter-two",
      "2026-10-20-capitals",
      "2026-10-19-harbours",
    ]);
    expect(sortNews([FIXTURE[2], FIXTURE[1]]).map((e) => e.id)).toEqual([
      "2026-10-20-capitals",
      "2026-10-20-chapter-two",
    ]);
  });

  const good = FIXTURE[2];
  const bad: [string, unknown][] = [
    ["not JSON", "[{"],
    ["not a list", { entries: [] }],
    ["an unknown field", [{ ...good, linktext: "x" }]],
    ["no title", [{ ...good, title: "  " }]],
    ["no body", [{ ...good, body: "" }]],
    ["an unknown game", [{ ...good, game: "chess" }]],
    ["an id that isn't a slug", [{ ...good, id: "2026-10-20 Capitals!" }]],
    ["an id from another day", [{ ...good, id: "2026-10-18-capitals" }]],
    [
      "a day that isn't real",
      [{ ...good, date: "2026-02-30", id: "2026-02-30-x" }],
    ],
    ["a link off the site", [{ ...good, link: "https://example.com" }]],
    ["a protocol-relative link", [{ ...good, link: "//example.com/x" }]],
    ["a script link", [{ ...good, link: "javascript:alert(1)" }]],
    ["linkText without a link", [{ ...good, linkText: "Go" }]],
    ["one id twice", [good, { ...good, title: "Again" }]],
  ];
  for (const [what, file] of bad)
    test(`refused: ${what}`, () => {
      const r = parseNewsFile(
        typeof file === "string" ? file : JSON.stringify(file),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
    });

  test("on the live site, a bad file is logged and none is served", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "derpy-news-"));
    const file = path.join(dir, "entries.json");
    setNews(FIXTURE);
    fs.writeFileSync(file, JSON.stringify([{ ...good, game: "chess" }]));
    logError.mockClear();
    expect(loadNews(file)).toBe(0);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(newsView(null).entries).toEqual([]);

    fs.writeFileSync(file, JSON.stringify(FIXTURE));
    expect(loadNews(file)).toBe(4);
    expect(loadNews(path.join(dir, "missing.json"))).toBe(0);
    expect(newsView(null).entries).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("what a mark has seen", () => {
  const list = sortNews(FIXTURE);
  const order = newsOrder(list);

  test("everything newer than the mark, from the top", () => {
    expect(unseenCount(list, "2026-10-21-store", order)).toBe(0);
    expect(unseenCount(list, "2026-10-20-capitals", order)).toBe(2);
    expect(unseenCount(list, "2026-10-19-harbours", order)).toBe(3);
    expect(unseenCount(list, NEWS_NOTHING, order)).toBe(4);
  });

  test("a mark on an entry the list leaves out still counts", () => {
    const open = list.filter((e) => e.game !== "based");
    expect(unseenCount(open, "2026-10-20-chapter-two", order)).toBe(1);
  });

  test("a mark that's gone from the file counts its whole day as seen", () => {
    expect(unseenCount(list, "2026-10-20-taken-out", order)).toBe(1);
    expect(newerMark("2026-10-21-store", "2026-10-20-taken-out", order)).toBe(
      true,
    );
    expect(
      newerMark("2026-10-20-capitals", "2026-10-20-taken-out", order),
    ).toBe(false);
  });

  test("never back", () => {
    expect(newerMark("2026-10-19-harbours", "2026-10-21-store", order)).toBe(
      false,
    );
    expect(newerMark("2026-10-21-store", "2026-10-19-harbours", order)).toBe(
      true,
    );
    expect(newerMark("2026-10-19-harbours", NEWS_NOTHING, order)).toBe(true);
  });
});

describe("Mr. Based's entries, signed out", () => {
  test("not in the list, the games, or anywhere in what's sent", () => {
    setNews(sortNews(FIXTURE));
    const v = newsView(null);
    expect(v.entries.map((e) => e.id)).toEqual([
      "2026-10-21-store",
      "2026-10-20-capitals",
      "2026-10-19-harbours",
    ]);
    expect(v.games.map((g) => g.id)).toEqual([
      "site",
      "derpyfront",
      "conquest",
    ]);
    expect(v.signedIn).toBe(false);
    secretFree(v);
  });
});

const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("What's New, against Postgres", () => {
  let base = "";
  let server: http.Server;
  let pool: pg.Pool;
  let closeDb: () => Promise<void>;
  const users: Record<string, { id: number; token: string }> = {};

  async function call(
    p: string,
    opts: { body?: unknown; token?: string } = {},
  ): Promise<{ status: number; json: any; text: string }> {
    const res = await fetch(base + p, {
      method: opts.body !== undefined ? "POST" : "GET",
      headers: {
        ...(opts.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null, text };
  }
  const view = async (who: string) => {
    const r = await call("/news", { token: users[who].token });
    expect(r.status).toBe(200);
    return r.json as NewsView;
  };
  const beat = async (who: string) => {
    const r = await call("/social/beat", {
      token: users[who].token,
      body: { tab: `tab-${who}`, where: { k: "home" } },
    });
    expect(r.status).toBe(200);
    return r.json as SocialState;
  };
  const mark = async (who: string) =>
    (
      await pool.query("SELECT news_seen FROM derpy_accounts WHERE id = $1", [
        users[who].id,
      ])
    ).rows[0].news_seen as string | null;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    const pgm = await import("pg");
    const c = new pgm.default.Client({ connectionString: TEST_DB });
    await c.connect();
    const tables = await c.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'derpy\\_%'",
    );
    if (tables.rows.length > 0)
      await c.query(
        `DROP TABLE IF EXISTS ${tables.rows.map((r) => r.tablename).join(", ")} CASCADE`,
      );
    await c.end();
    const D = await import("../../src/server/derpy/DerpyDb");
    closeDb = D.closeDerpyDb;
    const { register } = await import("../../src/server/derpy/DerpyAuth");
    const { derpyApiRouter } = await import("../../src/server/derpy/DerpyApi");
    const app = express();
    app.use("/derpy/api", derpyApiRouter());
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/derpy/api`;
    pool = await D.db();
    for (const name of ["Nw_Alden", "Nw_Pat", "Nw_Gary"]) {
      const s = await register(name, "hunter22");
      if (typeof s === "string") throw new Error(s);
      users[name.slice(3).toLowerCase()] = { id: s.account.id, token: s.token };
    }
    // Alden may play Mr. Based; Pat and Gary may not.
    await pool.query(
      "UPDATE derpy_accounts SET based_access = (id = $1) WHERE id = ANY($2::bigint[])",
      [users.alden.id, Object.values(users).map((u) => u.id)],
    );
  }, 60_000);

  afterAll(async () => {
    await new Promise((r) => server?.close(r));
    await closeDb?.();
    delete process.env.DATABASE_URL;
  });

  test("the first look: what's out already isn't new", async () => {
    // Everything but the newest entry is out when they first look.
    setNews(sortNews(FIXTURE.slice(1)));
    expect(await mark("pat")).toBeNull();
    const pat = await view("pat");
    expect(pat).toMatchObject({
      signedIn: true,
      unseen: 0,
      lastSeen: "2026-10-20-capitals",
    });
    expect(await mark("pat")).toBe("2026-10-20-capitals");
    secretFree(pat);

    const alden = await view("alden");
    expect(alden.unseen).toBe(0);
    expect(alden.lastSeen).toBe("2026-10-20-chapter-two");
    expect(alden.entries.map((e) => e.game)).toContain("based");
    expect(alden.games.map((g) => g.name)).toContain("Mr. Based");
  });

  test("new since: the count on the beat, without a trace of Mr. Based", async () => {
    const secret: NewsEntry = {
      id: "2026-10-22-chapter-three",
      date: "2026-10-22",
      game: "based",
      title: "The Fountain Pen, again",
      body: "Another dead drop.",
    };
    setNews(sortNews([secret, ...FIXTURE]));
    const patBeat = await beat("pat");
    expect(patBeat.news).toEqual({ unseen: 1, newest: "2026-10-21-store" });
    secretFree(patBeat);
    const pat = await view("pat");
    expect(pat.unseen).toBe(1);
    expect(pat.entries[0].id).toBe("2026-10-21-store");
    secretFree(pat);

    expect((await beat("alden")).news).toEqual({
      unseen: 2,
      newest: "2026-10-22-chapter-three",
    });
    setNews(sortNews(FIXTURE));
  });

  test("a beat needs no database once the mark is known", async () => {
    await beat("pat");
    const spy = vi.spyOn(pool, "query");
    expect((await beat("pat")).news?.unseen).toBe(1);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("seen up to an entry, kept on the account, and never back", async () => {
    const r = await call("/news/seen", {
      token: users.pat.token,
      body: { upTo: "2026-10-21-store" },
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ unseen: 0, lastSeen: "2026-10-21-store" });
    expect(await mark("pat")).toBe("2026-10-21-store");
    expect((await beat("pat")).news?.unseen).toBe(0);

    const back = await call("/news/seen", {
      token: users.pat.token,
      body: { upTo: "2026-10-19-harbours" },
    });
    expect(back.json).toMatchObject({
      unseen: 0,
      lastSeen: "2026-10-21-store",
    });
    expect(await mark("pat")).toBe("2026-10-21-store");

    // A restart: the mark comes back from the account.
    forgetNewsViewers();
    expect((await view("pat")).unseen).toBe(0);
  });

  test("only entries you may see can be marked, and the answer says nothing more", async () => {
    const secret = await call("/news/seen", {
      token: users.pat.token,
      body: { upTo: "2026-10-20-chapter-two" },
    });
    const nothing = await call("/news/seen", {
      token: users.pat.token,
      body: { upTo: "2026-10-20-nothing" },
    });
    expect(secret.status).toBe(400);
    expect(secret.text).toBe(nothing.text);
    expect(nothing.status).toBe(400);
    expect(await mark("pat")).toBe("2026-10-21-store");
    expect(
      (await call("/news/seen", { body: { upTo: "2026-10-21-store" } })).status,
    ).toBe(401);
  });

  test("signed out: the same list as anyone, no database", async () => {
    const r = await call("/news");
    expect(r.status).toBe(200);
    expect((r.json as NewsView).entries).toHaveLength(3);
    secretFree(r.json);
    expect((await call("/news", { token: "not-a-session" })).status).toBe(401);
  });

  test("access taken away: Mr. Based's entries go at once, and so does a mark on one", async () => {
    await call("/news/seen", {
      token: users.alden.token,
      body: { upTo: "2026-10-21-store" },
    });
    const secret: NewsEntry = {
      id: "2026-10-23-chapter-four",
      date: "2026-10-23",
      game: "based",
      title: "Chapter four",
      body: "The Fountain Pen speaks.",
    };
    setNews(sortNews([secret, ...FIXTURE]));
    await call("/news/seen", {
      token: users.alden.token,
      body: { upTo: secret.id },
    });
    expect(await mark("alden")).toBe(secret.id);
    await pool.query(
      "UPDATE derpy_accounts SET based_access = false WHERE id = $1",
      [users.alden.id],
    );
    const v = await view("alden");
    expect(v.entries.map((e) => e.id)).toEqual([
      "2026-10-21-store",
      "2026-10-20-capitals",
      "2026-10-19-harbours",
    ]);
    expect(v).toMatchObject({ unseen: 0, lastSeen: "2026-10-21-store" });
    secretFree(v);
    secretFree(await beat("alden"));
    await pool.query(
      "UPDATE derpy_accounts SET based_access = true WHERE id = $1",
      [users.alden.id],
    );
    setNews(sortNews(FIXTURE));
  });

  test("nothing out at the first look: whatever is written after is new", async () => {
    setNews([]);
    const first = await view("gary");
    expect(first).toMatchObject({ entries: [], unseen: 0, lastSeen: null });
    expect(await mark("gary")).toBe(NEWS_NOTHING);
    setNews(sortNews(FIXTURE));
    const later = await view("gary");
    expect(later.unseen).toBe(3);
    expect(later.lastSeen).toBeNull();
    secretFree(later);
  });
});
