// FRIENDS (r25): joining a DerpyFront lobby whose host gave it a password.
// An invite's link brings a pass (taken out of the address and given to the
// lobby's server); otherwise the page asks for the password, says when it's
// wrong, and lets you give up.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../../src/client/Auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/client/Auth")>()),
  getPlayToken: vi.fn(async () => "play-token"),
}));
vi.mock("../../src/client/ClientEnv", () => ({
  ClientEnv: {
    gameHttpBase: () => "https://game.test",
    gameWorkerPath: () => "w0",
  },
}));
vi.mock("../../src/client/Utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/client/Utils")>()),
  translateText: (key: string) => key,
}));

const { unlockLobby, takePass } =
  await import("../../src/client/derpy/LobbyPassword");

const PASSWORD = "Banana-Sekrit-42";

let calls: { url: string; body: Record<string, unknown>; auth: string }[];

/** The lobby's server: takes the pass "good-pass" and the password PASSWORD. */
function server() {
  calls = [];
  return vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push({
      url,
      body,
      auth: String((init.headers as Record<string, string>).Authorization),
    });
    const answer = (status: number, json: unknown) =>
      new Response(JSON.stringify(json), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (body.pass === "good-pass") return answer(200, { ok: true });
    if (body.password === undefined)
      return answer(403, { error: "password_required" });
    if (body.password === "too-many")
      return answer(429, { error: "too_many_tries" });
    return body.password === PASSWORD
      ? answer(200, { ok: true })
      : answer(403, { error: "wrong_password" });
  });
}

const prompt = () =>
  document.querySelector("derpy-lobby-password-prompt") as HTMLElement & {
    updateComplete: Promise<boolean>;
  };

async function type(text: string) {
  const p = prompt();
  await p.updateComplete;
  const input = p.querySelector("input")!;
  input.value = text;
  input.dispatchEvent(new Event("input"));
  await p.updateComplete;
  p.querySelector("form")!.dispatchEvent(
    new Event("submit", { cancelable: true }),
  );
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("a lobby with a password", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", server());
    history.replaceState(null, "", "/game/AbCd1234");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  test("an invite's pass: in at once, and the pass taken out of the address", async () => {
    history.replaceState(null, "", "/game/AbCd1234?pass=good-pass&x=1");
    expect(await unlockLobby("AbCd1234")).toBe(true);
    expect(calls).toEqual([
      {
        url: "https://game.test/w0/api/game/AbCd1234/unlock",
        body: { pass: "good-pass" },
        auth: "Bearer play-token",
      },
    ]);
    expect(window.location.search).toBe("?x=1");
    expect(prompt()).toBeNull();
  });

  test("asks for it, says when it's wrong, and goes in with the right one", async () => {
    const done = unlockLobby("AbCd1234");
    await settle();
    await settle();
    expect(prompt()).not.toBeNull();
    // The first ask carried nothing (in case this player was let in before).
    expect(calls[0].body).toEqual({});

    await type("banana");
    await settle();
    await prompt().updateComplete;
    expect(prompt().textContent).toContain("lobby_password.wrong");
    expect(calls[calls.length - 1].body).toEqual({ password: "banana" });

    await type("too-many");
    await settle();
    await prompt().updateComplete;
    expect(prompt().textContent).toContain("lobby_password.too_many");

    await type(PASSWORD);
    expect(await done).toBe(true);
    expect(calls[calls.length - 1].body).toEqual({ password: PASSWORD });
    expect(prompt()).toBeNull();
  });

  test("giving up: no join", async () => {
    const done = unlockLobby("AbCd1234");
    await settle();
    await settle();
    const p = prompt();
    await p.updateComplete;
    const cancel = [...p.querySelectorAll("button")].find(
      (b) => b.type === "button",
    )!;
    cancel.click();
    expect(await done).toBe(false);
    expect(prompt()).toBeNull();
  });

  test("a pass that isn't good any more: asked for the password instead", async () => {
    history.replaceState(null, "", "/game/AbCd1234?pass=old-pass");
    const done = unlockLobby("AbCd1234");
    await settle();
    await settle();
    expect(calls[0].body).toEqual({ pass: "old-pass" });
    expect(prompt()).not.toBeNull();
    await type(PASSWORD);
    expect(await done).toBe(true);
  });

  test("takePass: nothing there, nothing taken", () => {
    history.replaceState(null, "", "/game/AbCd1234?spectate");
    expect(takePass()).toBeUndefined();
    expect(window.location.search).toBe("?spectate");
  });
});
