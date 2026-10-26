// ADMIN (r26): the admin page's frame: its sections in order (and tabs
// under their parent), its addresses, tables that become cards on a phone,
// and the frame itself against a stand-in API: who's signed in, a section's
// page, a confirmation that needs a name typed, and the password asked for
// again when the server wants a fresh sign-in.

import { html, render } from "lit";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { routeOf } from "../../src/admin/App";
import {
  AdminError,
  childSections,
  findSection,
  registerSection,
  topSections,
  type AdminView,
} from "../../src/admin/Registry";
import "../../src/admin/sections";
import { table } from "../../src/admin/ui";

describe("the registry", () => {
  test("every section in the side list, in order; Usernames is a tab of Moderation", () => {
    expect(topSections().map((s) => s.id)).toEqual([
      "overview",
      "accounts",
      "moderation",
      "games",
      "economy",
      "challenges",
      "news",
      "banner",
      "audit",
    ]);
    expect(childSections("moderation").map((s) => s.id)).toEqual(["names"]);
    expect(findSection("names")?.parent).toBe("moderation");
  });

  test("a section can be added without touching the others, but not twice", () => {
    registerSection({
      id: "pictures-test",
      label: "Pictures",
      order: 10,
      parent: "moderation",
      render: () => html`<p>pictures</p>`,
    });
    expect(childSections("moderation").map((s) => s.id)).toEqual([
      "pictures-test",
      "names",
    ]);
    expect(() =>
      registerSection({
        id: "names",
        label: "x",
        order: 1,
        render: () => html``,
      }),
    ).toThrow();
  });

  test("addresses", () => {
    const r = routeOf({ pathname: "/admin/accounts/12", search: "?q=pat" });
    expect(r.section).toBe("accounts");
    expect(r.rest).toEqual(["12"]);
    expect(r.query.get("q")).toBe("pat");
    expect(routeOf({ pathname: "/admin", search: "" }).section).toBe(
      "overview",
    );
    expect(routeOf({ pathname: "/admin/", search: "" }).section).toBe(
      "overview",
    );
  });

  test("tables label each cell, so a phone can show rows as cards", () => {
    const host = document.createElement("div");
    render(
      table(
        [
          {
            label: "Name",
            lead: true,
            cell: (r: { n: string; c: number }) => r.n,
          },
          { label: "Coins", num: true, cell: (r) => r.c },
        ],
        [{ n: "Pat", c: 5 }],
      ),
      host,
    );
    const tds = host.querySelectorAll("td");
    expect(host.querySelector("table")?.classList.contains("cards")).toBe(true);
    expect(tds[0].dataset.label).toBe("");
    expect(tds[0].classList.contains("lead")).toBe(true);
    expect(tds[1].dataset.label).toBe("Coins");
    render(table([{ label: "x", cell: () => "" }], [], "Nobody."), host);
    expect(host.textContent).toContain("Nobody.");
  });
});

describe("the frame, against a stand-in API", () => {
  let calls: { method: string; path: string; body: unknown }[] = [];
  let fresh = true;

  beforeEach(() => {
    calls = [];
    fresh = true;
    localStorage.setItem("derpy_session_token", "tok");
    history.replaceState(null, "", "/admin/accounts/7");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const path = url.replace(/^\/derpy\/api/, "");
        const body = init.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ method: init.method ?? "GET", path, body });
        const json = (v: unknown, status = 200) =>
          new Response(JSON.stringify(v), { status });
        if (path === "/admin/hello")
          return json({
            owner: { id: 1, username: "Alden" },
            fresh,
            freshUntil: new Date(
              Date.now() + (fresh ? 3600_000 : -3600_000),
            ).toISOString(),
            sections: [],
          });
        if (path === "/admin/reauth") {
          fresh = true;
          return json({
            fresh: true,
            freshUntil: new Date(Date.now() + 3600_000).toISOString(),
          });
        }
        if (path === "/admin/accounts/7/signout")
          return fresh
            ? json({ sessions: 2 })
            : json({ error: "stale_sign_in" }, 403);
        return json({ error: "not_found" }, 404);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    localStorage.clear();
  });

  async function mount() {
    await import("../../src/admin/App");
    const el = document.createElement("dl-admin") as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    document.body.appendChild(el);
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await el.updateComplete;
    }
    return el;
  }

  test("signed in as the owner: the side list, and the address's section", async () => {
    const el = await mount();
    const links = [...el.querySelectorAll<HTMLAnchorElement>(".adm-navlink")];
    expect(links.map((a) => a.textContent?.trim())).toEqual([
      "Overview",
      "Accounts",
      "Moderation",
      "Games",
      "Economy",
      "Challenges",
      "What's New",
      "Site banner",
      "Audit log",
    ]);
    expect(links[1].getAttribute("aria-current")).toBe("page");
    expect(el.querySelector("adm-account")).not.toBeNull();
    expect(el.querySelector(".adm-who-name")?.textContent).toBe("Alden");
  });

  test("not the owner (or signed out): just a sign-in, nothing of the page", async () => {
    localStorage.clear();
    const el = await mount();
    expect(el.querySelector(".adm-nav")).toBeNull();
    expect(el.textContent).toContain("Sign in to use this page.");
  });

  test("a confirmation needing a name, and the password asked for again", async () => {
    const el = await mount();
    // The section's view, as a section gets it.
    const app = el as unknown as { view(path?: string[]): AdminView };
    const view = app.view(["7"]);
    const asked = view.confirm({
      title: "Sign Pat out",
      action: "Go",
      typed: "Pat",
    });
    await (el as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;
    const dialog = el.querySelector<HTMLDialogElement>("dialog.adm-confirm")!;
    const go = () =>
      [...dialog.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Go",
      )!;
    expect(go().disabled).toBe(true);
    const input = dialog.querySelector<HTMLInputElement>("#adm-typed")!;
    input.value = "Pat";
    input.dispatchEvent(new InputEvent("input"));
    await (el as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;
    expect(go().disabled).toBe(false);
    dialog
      .querySelector("form")!
      .dispatchEvent(new SubmitEvent("submit", { cancelable: true }));
    expect(await asked).toEqual({ reason: "" });

    // Stale: the post asks for the password, then tries again.
    fresh = false;
    const posted = view.post("/accounts/7/signout", { confirm: "Pat" });
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await (el as unknown as { updateComplete: Promise<unknown> })
        .updateComplete;
    }
    const pw = el.querySelector<HTMLDialogElement>("dialog.adm-reauth")!;
    const field = pw.querySelector<HTMLInputElement>("#adm-pw")!;
    field.value = "letaldenwin";
    pw.querySelector("form")!.dispatchEvent(
      new SubmitEvent("submit", { cancelable: true }),
    );
    expect(await posted).toEqual({ sessions: 2 });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(
      expect.arrayContaining([
        "POST /admin/accounts/7/signout",
        "POST /admin/reauth",
      ]),
    );
    expect(
      calls.filter((c) => c.path === "/admin/accounts/7/signout"),
    ).toHaveLength(2);
    expect(calls.find((c) => c.path === "/admin/reauth")?.body).toEqual({
      password: "letaldenwin",
    });
  });

  test("an error says what it is", () => {
    const e = new AdminError("confirm", 400);
    expect(e.code).toBe("confirm");
  });
});
