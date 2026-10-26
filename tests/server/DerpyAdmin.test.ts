// ADMIN (r26): the owner's admin page. Only the owner's account (marked for
// Mr. Based under the owner's name, by id) gets anything; for anyone else,
// signed out or in, every admin route answers exactly as an address that
// doesn't exist, and /admin falls through to the site's ordinary answer.
// Destructive actions need a typed name and a sign-in from the last 12
// hours; changes need the site's own Origin; every action is logged. And
// the actions themselves: coins, items, marks, renames, the blocklist,
// signing out everywhere, suspensions, reset links, deletes, the banner,
// games, challenge fix-ups.
//
// Needs a throwaway Postgres: DERPY_TEST_DATABASE_URL=postgres://... (its
// derpy_ tables are dropped first).

import express from "express";
import http from "http";
import { AddressInfo } from "net";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { SocialState } from "../../src/derpland/SocialTypes";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

/** Every derpy_ table, so each run starts from nothing. */
const DROP = `DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'derpy\\_%'
  LOOP EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', t); END LOOP; END $$;`;

const SPA = "<!doctype html><title>DerpyFront</title><p>the app shell";

describe.skipIf(!TEST_DB)("the admin page, against Postgres", () => {
  let origin = "";
  let server: http.Server;
  let pool: pg.Pool;
  let closeDb: () => Promise<void>;
  let db: () => Promise<pg.Pool>;
  let Sources: typeof import("../../src/server/derpy/admin/AdminSources");
  let Banner: typeof import("../../src/server/derpy/SiteBanner");

  interface User {
    id: number;
    token: string;
    name: string;
    password: string;
  }
  const users: Record<string, User> = {};

  async function call(
    path: string,
    opts: {
      method?: string;
      body?: unknown;
      raw?: string;
      token?: string;
      origin?: string | null;
      cookie?: string;
    } = {},
  ) {
    const hasBody = opts.body !== undefined || opts.raw !== undefined;
    // The page's own changes carry the site's Origin.
    const from =
      opts.origin === null
        ? undefined
        : (opts.origin ?? (hasBody ? origin : undefined));
    const res = await fetch(origin + path, {
      method: opts.method ?? (hasBody ? "POST" : "GET"),
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...(from ? { Origin: from } : {}),
        ...(opts.cookie ? { Cookie: opts.cookie } : {}),
      },
      body:
        opts.raw ??
        (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      status: res.status,
      text,
      json: json as any,
      headers: res.headers,
    };
  }

  const admin = (
    path: string,
    who: User | null,
    body?: unknown,
    extra: { origin?: string | null } = {},
  ) =>
    call(`/derpy/api/admin${path}`, {
      token: who?.token,
      body,
      ...extra,
    });

  // Signing up and in straight through DerpyAuth (the HTTP routes allow 10
  // a minute, and this file needs more); the routes are checked where it
  // matters.
  async function register(name: string, password = "hunter22"): Promise<User> {
    const { register: signUp } =
      await import("../../src/server/derpy/DerpyAuth");
    const r = await signUp(name, password);
    if (typeof r === "string") throw new Error(r);
    const u = { id: r.account.id, token: r.token, name, password };
    users[name] = u;
    return u;
  }

  async function login(u: User): Promise<void> {
    const { login: signIn } = await import("../../src/server/derpy/DerpyAuth");
    const r = await signIn(u.name, u.password);
    if (typeof r === "string") throw new Error(r);
    u.token = r.token;
  }

  async function lastAudit(): Promise<Record<string, unknown>> {
    const r = await pool.query(
      "SELECT * FROM derpy_admin_audit ORDER BY id DESC LIMIT 1",
    );
    return r.rows[0];
  }

  async function coins(u: User): Promise<number> {
    const r = await pool.query(
      "SELECT coins FROM derpy_accounts WHERE id = $1",
      [u.id],
    );
    return Number(r.rows[0].coins);
  }

  beforeAll(async () => {
    delete process.env.BASED_PLAYERS;
    process.env.DATABASE_URL = TEST_DB;
    const pgm = await import("pg");
    const c = new pgm.default.Client({ connectionString: TEST_DB });
    await c.connect();
    await c.query(DROP);
    await c.end();
    ({ db, closeDerpyDb: closeDb } =
      await import("../../src/server/derpy/DerpyDb"));
    Sources = await import("../../src/server/derpy/admin/AdminSources");
    Banner = await import("../../src/server/derpy/SiteBanner");
    const { derpyApiRouter } = await import("../../src/server/derpy/DerpyApi");
    const { adminPage } =
      await import("../../src/server/derpy/admin/AdminPage");
    const app = express();
    app.use("/derpy/api", derpyApiRouter());
    // As the master: the admin page, then the address-unknown fallback.
    app.use(adminPage());
    app.get("/{*splat}", (_req, res) => {
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
      res.type("html").send(SPA);
    });
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    pool = await db();
    await register("Alden", "letaldenwin");
    await register("Tester_Pat");
    await register("Sam_Wise");
  }, 60_000);

  afterAll(async () => {
    await new Promise((r) => server?.close(r));
    await closeDb?.();
    delete process.env.DATABASE_URL;
  });

  // ---------------------------------------------------------------- who

  describe("who gets in", () => {
    const ROUTES: [string, unknown?][] = [
      ["/hello"],
      ["/overview"],
      ["/accounts"],
      ["/accounts/1"],
      ["/audit"],
      ["/banner"],
      ["/games"],
      ["/economy/ledger"],
      ["/nothing-here"],
      ["/accounts/1/delete", { confirm: "x" }],
      ["/accounts/1/coins", { delta: 5, reason: "x" }],
      ["/banner", { enabled: true, text: "hi" }],
      ["/reauth", { password: "x" }],
    ];

    test("signed out, every admin route is the same 404 as an address that doesn't exist", async () => {
      const unknown = await call("/derpy/api/no-such-thing");
      expect(unknown.status).toBe(404);
      for (const [path, body] of ROUTES) {
        const r = await admin(path, null, body);
        expect(r.status, path).toBe(404);
        expect(r.text, path).toBe(unknown.text);
        expect(r.headers.get("cache-control")).toBe(
          unknown.headers.get("cache-control"),
        );
      }
    });

    test("signed in as anyone else, the same, whatever is sent", async () => {
      const unknown = await call("/derpy/api/no-such-thing", {
        token: users.Tester_Pat.token,
      });
      for (const [path, body] of ROUTES) {
        const r = await admin(path, users.Tester_Pat, body);
        expect(r.status, path).toBe(404);
        expect(r.text, path).toBe(unknown.text);
      }
      // Not even a body it can't read gets a different answer.
      const broken = await call("/derpy/api/admin/banner", {
        token: users.Tester_Pat.token,
        raw: "{not json",
      });
      expect(broken.status).toBe(404);
      expect(broken.text).toBe(unknown.text);
      // Nor a made-up session.
      expect(
        (await admin("/hello", { ...users.Tester_Pat, token: "nope" })).status,
      ).toBe(404);
    });

    test("the owner gets in, by the account marked under the owner's name", async () => {
      const r = await admin("/hello", users.Alden);
      expect(r.status).toBe(200);
      expect(r.json.owner).toEqual({ id: users.Alden.id, username: "Alden" });
      expect(r.json.fresh).toBe(true);
      expect(r.json.sections).toEqual(
        expect.arrayContaining([
          "overview",
          "accounts",
          "moderation",
          "games",
          "economy",
          "challenges",
          "news",
          "banner",
          "audit",
        ]),
      );
    });

    test("/admin is the site's ordinary unknown page for anyone without the owner's cookie", async () => {
      const unknown = await call("/adminx");
      for (const p of [
        "/admin",
        "/admin/",
        "/admin/accounts/1",
        "/admin/app-0123456789abcdef.js",
      ]) {
        const r = await call(p);
        expect(r.status, p).toBe(unknown.status);
        expect(r.text, p).toBe(unknown.text);
        expect(r.headers.get("cache-control")).toBe(
          unknown.headers.get("cache-control"),
        );
      }
      // Anyone else's /me never sets it; a made-up cookie is nothing.
      const me = await call("/derpy/api/me", { token: users.Tester_Pat.token });
      expect(me.status).toBe(200);
      expect(me.headers.get("set-cookie")).toBeNull();
      const fake = await call("/admin", {
        cookie: "dl_admin=" + "a".repeat(43),
      });
      expect(fake.text).toBe(SPA);
    });

    test("the owner's /me gives his browser the page's cookie, and the page and its script come with it", async () => {
      const me = await call("/derpy/api/me", { token: users.Alden.token });
      const set = me.headers.get("set-cookie") ?? "";
      expect(set).toMatch(/^dl_admin=[A-Za-z0-9_-]{43};/);
      expect(set).toContain("Path=/admin");
      expect(set).toContain("HttpOnly");
      expect(set).toContain("SameSite=Strict");
      const cookie = set.split(";")[0];
      // Asked again with it: nothing new.
      const again = await call("/derpy/api/me", {
        token: users.Alden.token,
        cookie,
      });
      expect(again.headers.get("set-cookie")).toBeNull();

      const page = await call("/admin/accounts/1", { cookie });
      expect(page.status).toBe(200);
      expect(page.headers.get("cache-control")).toContain("no-store");
      expect(page.headers.get("cache-control")).toContain("private");
      expect(page.text).toContain("<title>Admin · Derp Land</title>");
      const src = /src="(\/admin\/app-[0-9a-f]{16}\.js)"/.exec(page.text)?.[1];
      expect(src).toBeDefined();
      // The hub's own script isn't on it.
      expect(page.text).not.toContain("/src/hub/Main.ts");
      const js = await call(src!, { cookie });
      expect(js.status).toBe(200);
      expect(js.headers.get("content-type")).toContain("javascript");
      expect(js.headers.get("cache-control")).toBe(
        "private, max-age=31536000, immutable",
      );
      expect(js.text).toContain("dl-admin");
      // Without the cookie, the script's address is nothing at all.
      expect((await call(src!)).text).toBe(SPA);
      // Signed out: the cookie's session is gone, and so is the page.
      const extra = { json: { ...users.Alden } };
      await login(extra.json);
      const set2 = (
        await call("/derpy/api/me", { token: extra.json.token })
      ).headers.get("set-cookie")!;
      const cookie2 = set2.split(";")[0];
      expect((await call("/admin", { cookie: cookie2 })).status).toBe(200);
      await call("/derpy/api/logout", {
        token: extra.json.token,
        body: {},
        origin: null,
      });
      expect((await call("/admin", { cookie: cookie2 })).text).toBe(SPA);
    }, 60_000);

    test("Mr. Based given by hand never makes anyone the owner", async () => {
      await pool.query(
        "UPDATE derpy_accounts SET based_access = true WHERE id = $1",
        [users.Sam_Wise.id],
      );
      expect((await admin("/hello", users.Sam_Wise)).status).toBe(404);
      await pool.query(
        "UPDATE derpy_accounts SET based_access = false WHERE id = $1",
        [users.Sam_Wise.id],
      );
    });

    test("changes need the site's own Origin", async () => {
      const body = { delta: 1, reason: "origin test" };
      const none = await admin(
        `/accounts/${users.Sam_Wise.id}/coins`,
        users.Alden,
        body,
        { origin: null },
      );
      expect(none.status).toBe(403);
      expect(none.json.error).toBe("bad_origin");
      const other = await admin(
        `/accounts/${users.Sam_Wise.id}/coins`,
        users.Alden,
        body,
        {
          origin: "https://evil.example",
        },
      );
      expect(other.status).toBe(403);
      expect(await coins(users.Sam_Wise)).toBe(0);
      expect(
        (await admin(`/accounts/${users.Sam_Wise.id}/coins`, users.Alden, body))
          .status,
      ).toBe(200);
      expect(await coins(users.Sam_Wise)).toBe(1);
    });

    test("a stale sign-in can't run destructive actions until the password is typed again", async () => {
      const pat = users.Tester_Pat;
      await pool.query(
        "UPDATE derpy_sessions SET created_at = now() - interval '13 hours' WHERE account_id = $1",
        [users.Alden.id],
      );
      expect((await admin("/hello", users.Alden)).json.fresh).toBe(false);
      const big = await admin(`/accounts/${pat.id}/coins`, users.Alden, {
        delta: 5000,
        reason: "stale",
        confirm: pat.name,
      });
      expect(big.status).toBe(403);
      expect(big.json.error).toBe("stale_sign_in");
      for (const [path, body] of [
        ["rename", { username: "Pat_New", confirm: pat.name }],
        ["suspend", { reason: "x", confirm: pat.name }],
        ["delete", { confirm: `delete ${pat.name}` }],
        ["signout", { confirm: pat.name }],
        ["reset-link", { confirm: pat.name }],
      ] as const) {
        const r = await admin(`/accounts/${pat.id}/${path}`, users.Alden, body);
        expect(r.status, path).toBe(403);
        expect(r.json.error, path).toBe("stale_sign_in");
      }
      // Small changes still go.
      expect(
        (
          await admin(`/accounts/${pat.id}/coins`, users.Alden, {
            delta: 10,
            reason: "small",
          })
        ).status,
      ).toBe(200);
      // The password again: wrong, then right.
      expect(
        (await admin("/reauth", users.Alden, { password: "nope" })).status,
      ).toBe(401);
      const ok = await admin("/reauth", users.Alden, {
        password: "letaldenwin",
      });
      expect(ok.status).toBe(200);
      expect((await admin("/hello", users.Alden)).json.fresh).toBe(true);
      expect(
        (
          await admin(`/accounts/${pat.id}/coins`, users.Alden, {
            delta: 5000,
            reason: "fresh",
            confirm: pat.name,
          })
        ).status,
      ).toBe(200);
      expect((await lastAudit()).action).toBe("coins.give");
    });
  });

  // ---------------------------------------------------------------- what it does

  describe("accounts", () => {
    test("search by name, old name or id, and the account's page", async () => {
      const pat = users.Tester_Pat;
      const byName = await admin("/accounts?q=test", users.Alden);
      expect(
        byName.json.accounts.map((a: { username: string }) => a.username),
      ).toContain("Tester_Pat");
      const byId = await admin(`/accounts?q=%23${pat.id}`, users.Alden);
      expect(byId.json.accounts[0].id).toBe(pat.id);
      const page = await admin(`/accounts/${pat.id}`, users.Alden);
      expect(page.status).toBe(200);
      expect(page.json.account.username).toBe("Tester_Pat");
      expect(page.json.sessions.length).toBeGreaterThan(0);
      expect(page.json.sessions[0]).not.toHaveProperty("token_hash");
      expect(JSON.stringify(page.json)).not.toContain(pat.token);
      expect((await admin("/accounts/999999", users.Alden)).status).toBe(404);
    });

    test("coins: given and taken with a reason, in their coin history and the log; never below zero", async () => {
      const sam = users.Sam_Wise;
      const before = await coins(sam);
      const give = await admin(`/accounts/${sam.id}/coins`, users.Alden, {
        delta: 500,
        reason: "Tournament prize",
      });
      expect(give.status).toBe(200);
      expect(give.json.coins).toBe(before + 500);
      const audit = await lastAudit();
      expect(audit).toMatchObject({
        action: "coins.give",
        target_id: String(sam.id),
        reason: "Tournament prize",
      });
      expect(audit.before).toEqual({ coins: before });
      expect(audit.after).toEqual({ coins: before + 500, delta: 500 });
      const page = await admin(`/accounts/${sam.id}`, users.Alden);
      expect(page.json.history[0]).toMatchObject({
        kind: "admin",
        delta: 500,
        what: "Tournament prize",
      });
      const take = await admin(`/accounts/${sam.id}/coins`, users.Alden, {
        delta: -200,
        reason: "Oops",
      });
      expect(take.json.coins).toBe(before + 300);
      expect((await lastAudit()).action).toBe("coins.take");
      const tooMuch = await admin(`/accounts/${sam.id}/coins`, users.Alden, {
        delta: -1000,
        reason: "x",
      });
      expect(tooMuch.json.error).toBe("not_enough_coins");
      // Over the threshold, the name must be typed.
      const big = await admin(`/accounts/${sam.id}/coins`, users.Alden, {
        delta: 2000,
        reason: "big",
      });
      expect(big.json.error).toBe("confirm");
      expect(await coins(sam)).toBe(before + 300);
    });

    test("items: given (not a purchase) and taken back", async () => {
      const sam = users.Sam_Wise;
      const give = await admin(`/accounts/${sam.id}/items/grant`, users.Alden, {
        item: "classics",
      });
      expect(give.status).toBe(200);
      const rows = await pool.query(
        "SELECT item, granted FROM derpy_owned WHERE account_id = $1",
        [sam.id],
      );
      expect(rows.rows.length).toBeGreaterThan(1);
      expect(rows.rows.every((r) => r.granted)).toBe(true);
      expect(
        (
          await admin(`/accounts/${sam.id}/items/grant`, users.Alden, {
            item: "classics",
          })
        ).json.error,
      ).toBe("already_owned");
      const ledger = await admin(
        `/economy/ledger?account=${sam.name}&kind=purchase`,
        users.Alden,
      );
      expect(ledger.json.rows).toEqual([]);
      expect((await lastAudit()).action).toBe("items.grant");
      const take = await admin(
        `/accounts/${sam.id}/items/revoke`,
        users.Alden,
        { item: "pack:classics" },
      );
      expect(take.status).toBe(200);
      expect(
        (
          await pool.query("SELECT 1 FROM derpy_owned WHERE account_id = $1", [
            sam.id,
          ])
        ).rowCount,
      ).toBe(0);
      expect((await lastAudit()).action).toBe("items.revoke");
    });

    test("marks: Mr. Based given and taken by hand (never the owner's own); appear offline", async () => {
      const sam = users.Sam_Wise;
      const noName = await admin(`/accounts/${sam.id}/marks`, users.Alden, {
        mark: "based_access",
        value: true,
      });
      expect(noName.json.error).toBe("confirm");
      const set = await admin(`/accounts/${sam.id}/marks`, users.Alden, {
        mark: "based_access",
        value: true,
        confirm: sam.name,
      });
      expect(set.status).toBe(200);
      expect(
        (await call("/derpy/api/based/access", { token: sam.token })).json.play,
      ).toBe(true);
      expect((await admin("/hello", sam)).status).toBe(404);
      await admin(`/accounts/${sam.id}/marks`, users.Alden, {
        mark: "based_access",
        value: false,
        confirm: sam.name,
      });
      expect(
        (await call("/derpy/api/based/access", { token: sam.token })).json.play,
      ).toBe(false);
      const own = await admin(
        `/accounts/${users.Alden.id}/marks`,
        users.Alden,
        { mark: "based_access", value: false, confirm: "Alden" },
      );
      expect(own.json.error).toBe("own_account");
      expect((await admin("/hello", users.Alden)).status).toBe(200);
      const off = await admin(`/accounts/${sam.id}/marks`, users.Alden, {
        mark: "appear_offline",
        value: true,
      });
      expect(off.status).toBe(200);
      expect((await lastAudit()).action).toBe("marks.set");
      await admin(`/accounts/${sam.id}/marks`, users.Alden, {
        mark: "appear_offline",
        value: false,
      });
    });

    test("rename: no 7-day wait, but unique and valid; the log keeps both names", async () => {
      const pat = users.Tester_Pat;
      // Pat changed it themself just now: their own rule says wait a week.
      const self = await call("/derpy/api/username", {
        token: pat.token,
        body: { username: "Tester_Pat2" },
        origin: null,
      });
      expect(self.status).toBe(200);
      pat.name = "Tester_Pat2";
      expect(
        (
          await call("/derpy/api/username", {
            token: pat.token,
            body: { username: "Tester_Pat3" },
            origin: null,
          })
        ).status,
      ).toBe(429);
      const wrong = await admin(`/accounts/${pat.id}/rename`, users.Alden, {
        username: "Pat_Renamed",
        confirm: "Tester_Pat",
      });
      expect(wrong.json.error).toBe("confirm");
      const taken = await admin(`/accounts/${pat.id}/rename`, users.Alden, {
        username: "sam_wise",
        confirm: pat.name,
      });
      expect(taken.json.error).toBe("username_taken");
      const invalid = await admin(`/accounts/${pat.id}/rename`, users.Alden, {
        username: "no spaces!",
        confirm: pat.name,
      });
      expect(invalid.json.error).toBe("invalid_username");
      const ok = await admin(`/accounts/${pat.id}/rename`, users.Alden, {
        username: "Pat_Renamed",
        confirm: pat.name,
        reason: "Asked to",
      });
      expect(ok.status).toBe(200);
      expect(
        (await call("/derpy/api/me", { token: pat.token })).json.account
          .username,
      ).toBe("Pat_Renamed");
      expect(await lastAudit()).toMatchObject({
        action: "account.rename",
        before: { username: "Tester_Pat2" },
        after: { username: "Pat_Renamed" },
      });
      pat.name = "Pat_Renamed";
    });

    test("the name blocklist: sign-ups and renames refused, the account's own name left alone", async () => {
      expect(
        (
          await admin("/moderation/names/block", users.Alden, {
            word: "Gnarly",
          })
        ).status,
      ).toBe(200);
      expect((await lastAudit()).action).toBe("names.block");
      const signUp = await call("/derpy/api/register", {
        body: { username: "xx_GNARLY_xx", password: "hunter22" },
        origin: null,
      });
      expect(signUp.status).toBe(409);
      const leet = await call("/derpy/api/register", {
        body: { username: "gn4rly_one", password: "hunter22" },
        origin: null,
      });
      expect(leet.status).toBe(409);
      const rename = await admin(
        `/accounts/${users.Sam_Wise.id}/rename`,
        users.Alden,
        { username: "Gnarly_Sam", confirm: users.Sam_Wise.name },
      );
      expect(rename.json.error).toBe("username_reserved");
      const names = await admin("/moderation/names", users.Alden);
      expect(names.json.words.map((w: { word: string }) => w.word)).toEqual([
        "gnarly",
      ]);
      // Someone already called it is listed, and may still change capitals.
      await pool.query(
        "UPDATE derpy_accounts SET username = 'Gnarly_Dude', username_key = 'gnarly_dude' WHERE id = $1",
        [users.Sam_Wise.id],
      );
      expect(
        (await admin("/moderation/names", users.Alden)).json.flagged.map(
          (f: { id: number }) => f.id,
        ),
      ).toContain(users.Sam_Wise.id);
      const { checkName } = await import("../../src/server/derpy/DerpyNames");
      expect((await checkName("GNARLY_DUDE", users.Sam_Wise.id)).ok).toBe(true);
      await pool.query(
        "UPDATE derpy_accounts SET username = 'Sam_Wise', username_key = 'sam_wise' WHERE id = $1",
        [users.Sam_Wise.id],
      );
      expect(
        (
          await admin("/moderation/names/unblock", users.Alden, {
            word: "gnarly",
          })
        ).status,
      ).toBe(200);
      const after = await call("/derpy/api/register", {
        body: { username: "gnarly_one", password: "hunter22" },
        origin: null,
      });
      expect(after.status).toBe(200);
      await pool.query(
        "DELETE FROM derpy_accounts WHERE username_key = 'gnarly_one'",
      );
    });

    test("sign out everywhere ends every session at once", async () => {
      const sam = users.Sam_Wise;
      await login(sam);
      const r = await admin(`/accounts/${sam.id}/signout`, users.Alden, {
        confirm: sam.name,
      });
      expect(r.status).toBe(200);
      expect(r.json.sessions).toBeGreaterThanOrEqual(2);
      expect((await call("/derpy/api/me", { token: sam.token })).status).toBe(
        401,
      );
      expect(
        (
          await call("/derpy/api/social/beat", {
            token: sam.token,
            body: { tab: "tab-1234", where: { k: "home" } },
            origin: null,
          })
        ).status,
      ).toBe(401);
      expect((await lastAudit()).action).toBe("account.signout");
      await login(sam);
    });

    test("suspend: no sign-in or session until lifted or over; never the owner", async () => {
      const sam = users.Sam_Wise;
      expect(
        (
          await admin(`/accounts/${users.Alden.id}/suspend`, users.Alden, {
            reason: "x",
            confirm: "Alden",
          })
        ).json.error,
      ).toBe("own_account");
      const past = await admin(`/accounts/${sam.id}/suspend`, users.Alden, {
        reason: "x",
        until: new Date(Date.now() - 60_000).toISOString(),
        confirm: sam.name,
      });
      expect(past.json.error).toBe("until_past");
      // Whatever it's playing now, it's taken out of.
      const playIds = (
        await pool.query(
          "SELECT play_id FROM derpy_sessions WHERE account_id = $1",
          [sam.id],
        )
      ).rows.map((x) => String(x.play_id));
      const kicked: string[] = [];
      const dropped: number[] = [];
      Sources.setAdminSources({
        front: {
          list: async () => ({ games: [], workers: [] }),
          end: async () => false,
          kick: async (ids) => {
            kicked.push(...ids);
          },
        },
        conquest: {
          rooms: () => [],
          close: async () => false,
          drop: (id) => {
            dropped.push(id);
            return 1;
          },
        },
      });
      const r = await admin(`/accounts/${sam.id}/suspend`, users.Alden, {
        reason: "Spamming chat",
        until: null,
        confirm: sam.name,
      });
      expect(r.status).toBe(200);
      expect(playIds.length).toBeGreaterThan(0);
      expect(kicked.sort()).toEqual(playIds.sort());
      expect(dropped).toEqual([sam.id]);
      Sources.setAdminSources({ front: null, conquest: null });
      expect((await call("/derpy/api/me", { token: sam.token })).status).toBe(
        401,
      );
      const signIn = await call("/derpy/api/login", {
        body: { username: sam.name, password: sam.password },
        origin: null,
      });
      expect(signIn.status).toBe(403);
      expect(signIn.json.error).toBe("suspended");
      // A wrong password says only that.
      expect(
        (
          await call("/derpy/api/login", {
            body: { username: sam.name, password: "wrong!!" },
            origin: null,
          })
        ).json.error,
      ).toBe("wrong_password");
      // Nor may it play: a Conquest table signs in the same way.
      const { accountForToken } =
        await import("../../src/server/derpy/DerpyAuth");
      expect(await accountForToken(sam.token)).toBeNull();
      expect(await lastAudit()).toMatchObject({
        action: "account.suspend",
        reason: "Spamming chat",
      });
      expect(
        (
          await admin("/accounts?filter=suspended", users.Alden)
        ).json.accounts.map((a: { id: number }) => a.id),
      ).toEqual([sam.id]);

      expect(
        (await admin(`/accounts/${sam.id}/unsuspend`, users.Alden, {})).status,
      ).toBe(200);
      await login(sam);
      // One with an end: over when it ends.
      await admin(`/accounts/${sam.id}/suspend`, users.Alden, {
        reason: "A day off",
        until: new Date(Date.now() + 86_400_000).toISOString(),
        confirm: sam.name,
      });
      expect(
        (
          await call("/derpy/api/login", {
            body: { username: sam.name, password: sam.password },
            origin: null,
          })
        ).status,
      ).toBe(403);
      await pool.query(
        "UPDATE derpy_accounts SET suspended_until = now() - interval '1 second' WHERE id = $1",
        [sam.id],
      );
      await login(sam);
      expect((await call("/derpy/api/me", { token: sam.token })).status).toBe(
        200,
      );
    });

    test("a one-time reset link: whose it is, a new password, everyone else signed out, once", async () => {
      const sam = users.Sam_Wise;
      const old = sam.token;
      const r = await admin(`/accounts/${sam.id}/reset-link`, users.Alden, {
        confirm: sam.name,
      });
      expect(r.status).toBe(200);
      const token = /^\/reset-password#([A-Za-z0-9_-]{43})$/.exec(
        r.json.path,
      )?.[1];
      expect(token).toBeDefined();
      // Only the hash is kept, and the log never has the link.
      expect(JSON.stringify(await lastAudit())).not.toContain(token!);
      expect(
        (
          await call("/derpy/api/password/reset/check", {
            body: { token },
            origin: null,
          })
        ).json.username,
      ).toBe(sam.name);
      expect(
        (
          await call("/derpy/api/password/reset", {
            body: { token, password: "abc" },
            origin: null,
          })
        ).json.error,
      ).toBe("invalid_password");
      const set = await call("/derpy/api/password/reset", {
        body: { token, password: "new-pass-1" },
        origin: null,
      });
      expect(set.status).toBe(200);
      expect(set.json.signedIn).toBe(true);
      expect(set.json.account.username).toBe(sam.name);
      expect((await call("/derpy/api/me", { token: old })).status).toBe(401);
      expect(
        (await call("/derpy/api/me", { token: set.json.token })).status,
      ).toBe(200);
      expect(
        (
          await call("/derpy/api/password/reset", {
            body: { token, password: "again-2" },
            origin: null,
          })
        ).json.error,
      ).toBe("link_gone");
      sam.password = "new-pass-1";
      await login(sam);
      // A newer link ends an older one.
      const a = (
        await admin(`/accounts/${sam.id}/reset-link`, users.Alden, {
          confirm: sam.name,
        })
      ).json.path.split("#")[1];
      await admin(`/accounts/${sam.id}/reset-link`, users.Alden, {
        confirm: sam.name,
      });
      expect(
        (
          await call("/derpy/api/password/reset/check", {
            body: { token: a },
            origin: null,
          })
        ).status,
      ).toBe(404);
    });

    test("delete: a typed confirmation, the existing cascades; never the owner", async () => {
      const gone = await register("Gone_Soon");
      await admin(`/accounts/${gone.id}/items/grant`, users.Alden, {
        item: "classics",
      });
      await admin(`/accounts/${gone.id}/coins`, users.Alden, {
        delta: 50,
        reason: "x",
      });
      expect(
        (
          await admin(`/accounts/${gone.id}/delete`, users.Alden, {
            confirm: "Gone_Soon",
          })
        ).json.error,
      ).toBe("confirm");
      expect(
        (
          await admin(`/accounts/${users.Alden.id}/delete`, users.Alden, {
            confirm: "delete Alden",
          })
        ).json.error,
      ).toBe("own_account");
      const r = await admin(`/accounts/${gone.id}/delete`, users.Alden, {
        confirm: "delete Gone_Soon",
        reason: "Asked to be removed",
      });
      expect(r.status).toBe(200);
      for (const t of [
        "derpy_accounts WHERE id",
        "derpy_owned WHERE account_id",
        "derpy_sessions WHERE account_id",
        "derpy_coin_adjustments WHERE account_id",
      ])
        expect(
          (await pool.query(`SELECT 1 FROM ${t} = $1`, [gone.id])).rowCount,
          t,
        ).toBe(0);
      expect((await call("/derpy/api/me", { token: gone.token })).status).toBe(
        401,
      );
      expect(await lastAudit()).toMatchObject({
        action: "account.delete",
        target_name: "Gone_Soon",
        reason: "Asked to be removed",
      });
    });
  });

  describe("the rest of the page", () => {
    test("the site banner: set, shown on the beat and signed out, expiring, off", async () => {
      Banner.forgetBanner();
      const r = await admin("/banner", users.Alden, {
        enabled: true,
        text: "Server restart at 9",
        link: "/whats-new",
        linkText: "Why",
      });
      expect(r.status).toBe(200);
      const v = r.json.setting.version;
      const beat = await call("/derpy/api/social/beat", {
        token: users.Tester_Pat.token,
        body: { tab: "tab-5678", where: { k: "home" } },
        origin: null,
      });
      expect((beat.json as SocialState).banner).toEqual({
        v,
        text: "Server restart at 9",
        link: "/whats-new",
        linkText: "Why",
      });
      const news = await call("/derpy/api/news");
      expect(news.json.banner).toMatchObject({ text: "Server restart at 9" });
      expect((await lastAudit()).action).toBe("banner.set");
      // A restart reads it back.
      Banner.forgetBanner();
      expect((await call("/derpy/api/news")).json.banner).toMatchObject({ v });
      // Links elsewhere must be https.
      expect(
        (
          await admin("/banner", users.Alden, {
            enabled: true,
            text: "x",
            link: "javascript:alert(1)",
          })
        ).status,
      ).toBe(400);
      // It ends.
      await admin("/banner", users.Alden, {
        enabled: true,
        text: "Soon over",
        endsAt: new Date(Date.now() + 700).toISOString(),
      });
      expect((await call("/derpy/api/news")).json.banner).toMatchObject({
        text: "Soon over",
      });
      await new Promise((res) => setTimeout(res, 900));
      expect((await call("/derpy/api/news")).json.banner).toBeNull();
      await admin("/banner", users.Alden, { enabled: false, text: "" });
      expect((await call("/derpy/api/news")).json.banner).toBeNull();
      expect((await lastAudit()).action).toBe("banner.off");
    });

    test("games: every DerpyFront game and Conquest room, ended or closed with a reason, logged", async () => {
      const ended: string[] = [];
      const closed: string[] = [];
      Sources.setAdminSources({
        front: {
          list: async () => ({
            games: [
              {
                id: "abcd1234",
                phase: "playing",
                map: "World",
                mapKey: "world",
                mode: "Free For All",
                kind: "private",
                createdAt: Date.now() - 60_000,
                startedAt: Date.now() - 30_000,
                players: ["Pat"],
                watchers: 0,
                maxPlayers: null,
                locked: false,
                watchable: false,
              },
            ],
            workers: [],
          }),
          end: async (id, reason) => {
            ended.push(`${id}:${reason}`);
            return id === "abcd1234";
          },
        },
        conquest: {
          rooms: () => [
            {
              code: "QWER",
              title: "A colony",
              solo: false,
              open: true,
              locked: false,
              started: true,
              over: false,
              year: 1650,
              startedAt: Date.now(),
              paused: false,
              saveId: "s1",
              watchers: 0,
              watchId: null,
              seats: [
                { name: "Pat", accountId: users.Tester_Pat.id, online: true },
              ],
            },
          ],
          close: async (code, reason) => {
            closed.push(`${code}:${reason}`);
            return true;
          },
        },
      });
      const g = await admin("/games", users.Alden);
      expect(g.json.front.games[0].id).toBe("abcd1234");
      expect(g.json.conquest.rooms[0].code).toBe("QWER");
      expect(
        (await admin("/games/front/abcd1234/end", users.Alden, {})).status,
      ).toBe(400);
      expect(
        (
          await admin("/games/front/abcd1234/end", users.Alden, {
            reason: "Cheating",
          })
        ).status,
      ).toBe(200);
      expect(ended).toEqual(["abcd1234:Cheating"]);
      expect(await lastAudit()).toMatchObject({
        action: "games.end",
        target_id: "abcd1234",
        reason: "Cheating",
      });
      expect(
        (await admin("/games/front/zzzz/end", users.Alden, { reason: "x" }))
          .status,
      ).toBe(404);
      expect(
        (
          await admin("/games/conquest/QWER/close", users.Alden, {
            reason: "Maintenance",
          })
        ).status,
      ).toBe(200);
      expect(closed).toEqual(["QWER:Maintenance"]);
      expect((await lastAudit()).action).toBe("games.close_room");
      const o = await admin("/overview", users.Alden);
      expect(o.json.games).toMatchObject({
        frontGames: 1,
        frontLobbies: 0,
        conquestGames: 1,
      });
      Sources.setAdminSources({ front: null, conquest: null });
    });

    test("the Overview: Mr. Based shown as it is, the database's size, and the rest", async () => {
      Sources.noteBased(users.Alden.id);
      const o = await admin("/overview", users.Alden);
      expect(o.status).toBe(200);
      expect(o.json.accounts.total).toBeGreaterThanOrEqual(3);
      expect(o.json.dbBytes).toBeGreaterThan(0);
      const me = o.json.online.find(
        (p: { id: number }) => p.id === users.Alden.id,
      );
      expect(me.place).toBe("Playing Mr. Based");
      Sources.forgetBased();
    });

    test("a challenge paid by hand: marked done, paid once, logged", async () => {
      const { weekOf, weekChallenges } =
        await import("../../src/derpland/Challenges");
      const week = weekOf(Date.now());
      const easy = weekChallenges(week, "conquest")[0];
      const pat = users.Tester_Pat;
      const before = await coins(pat);
      const r = await admin("/challenges/pay", users.Alden, {
        account: pat.name,
        week,
        key: easy.key,
        reason: "Didn't count",
      });
      expect(r.status).toBe(200);
      expect(r.json.paid).toBe(100);
      expect(await coins(pat)).toBe(before + 100);
      expect(
        (
          await admin("/challenges/pay", users.Alden, {
            account: pat.name,
            week,
            key: easy.key,
            reason: "again",
          })
        ).json.error,
      ).toBe("already_done");
      expect(await lastAudit()).toMatchObject({
        action: "challenges.pay",
        reason: "Didn't count",
      });
      const view = await admin(`/challenges?week=${week}`, users.Alden);
      const pick = view.json.games
        .find((g: { game: string }) => g.game === "conquest")
        .picks.find((p: { key: string }) => p.key === easy.key);
      expect(pick).toMatchObject({ done: 1, paid: 100 });
      const hist = await admin(`/accounts/${pat.id}`, users.Alden);
      expect(
        hist.json.history.some(
          (h: { kind: string; delta: number }) =>
            h.kind === "challenge" && h.delta === 100,
        ),
      ).toBe(true);
    });

    test("the economy and What's New answer", async () => {
      expect(
        (await admin("/economy/days", users.Alden)).json.days,
      ).toHaveLength(30);
      const cat = await admin("/economy/catalog", users.Alden);
      expect(
        cat.json.items.find((i: { name: string }) => i.name === "classics")
          .price,
      ).toBeGreaterThan(0);
      const news = await admin("/news", users.Alden);
      expect(news.status).toBe(200);
      expect(Array.isArray(news.json.entries)).toBe(true);
    });

    test("the audit log: filtered and paged", async () => {
      const all = await admin("/audit", users.Alden);
      expect(all.json.total).toBeGreaterThan(10);
      expect(all.json.actions).toEqual(
        expect.arrayContaining(["coins.give", "account.delete", "banner.set"]),
      );
      const coinsOnly = await admin("/audit?action=coins", users.Alden);
      expect(
        coinsOnly.json.rows.every((r: { action: string }) =>
          r.action.startsWith("coins."),
        ),
      ).toBe(true);
      const sam = await admin(
        `/audit?targetType=account&targetId=${users.Sam_Wise.id}`,
        users.Alden,
      );
      expect(sam.json.rows.length).toBeGreaterThan(3);
      expect(
        sam.json.rows.every(
          (r: { targetId: string }) => r.targetId === String(users.Sam_Wise.id),
        ),
      ).toBe(true);
      expect(
        (await admin("/audit?q=Tournament", users.Alden)).json.rows[0].reason,
      ).toBe("Tournament prize");
      // Every line names who did it.
      const actors = await pool.query(
        "SELECT DISTINCT actor_id FROM derpy_admin_audit",
      );
      expect(actors.rows.map((r) => Number(r.actor_id))).toEqual([
        users.Alden.id,
      ]);
    });

    test("the migration runs again (and again) without changing anything", async () => {
      const { ADMIN_SCHEMA } =
        await import("../../src/server/derpy/admin/AdminSchema");
      const count = async () =>
        Number(
          (await pool.query("SELECT count(*) FROM derpy_admin_audit")).rows[0]
            .count,
        );
      const n = await count();
      await pool.query(ADMIN_SCHEMA);
      await pool.query(ADMIN_SCHEMA);
      await closeDb();
      pool = await db();
      expect(await count()).toBe(n);
      expect((await admin("/hello", users.Alden)).status).toBe(200);
    });
  });
});
