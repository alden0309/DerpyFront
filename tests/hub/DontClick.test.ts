/**
 * The front page's "DON'T CLICK HERE!" link: two clicks of pleading, then
 * Holy Michael Nazario himself, as a picture hotlinked from YouTube, with
 * his name back as text if the picture won't load.
 */

vi.mock("../../src/derpland/Account", () => ({
  DERPY_ACCOUNT_EVENT: "derpy-account",
  derpyUsername: () => null,
  me: async () => null,
  api: async () => {
    throw new Error("offline");
  },
}));
vi.mock("../../src/derpland/DerpBar", () => ({
  openSignIn: () => {},
}));

import { afterEach, describe, expect, it, vi } from "vitest";
import { DONT_CLICK, NAZARIO_IMAGE } from "../../src/hub/Hub";

async function mountHome(): Promise<HTMLElement> {
  const el = document.createElement("dl-home");
  document.body.appendChild(el);
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return el;
}

async function settle(el: HTMLElement) {
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
}

describe("the link you shouldn't click", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("pleads, then shows Holy Michael Nazario", async () => {
    const home = await mountHome();
    const button = () =>
      home.querySelector<HTMLButtonElement>(".dl-dontclick")!;

    expect(button().textContent?.trim()).toBe(DONT_CLICK[0]);
    button().click();
    await settle(home);
    expect(button().textContent?.trim()).toBe(DONT_CLICK[1]);
    button().click();
    await settle(home);

    const img = home.querySelector<HTMLImageElement>("img.dl-nazario");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe(
      "https://i.ytimg.com/vi/VGVhzZqAziY/hqdefault.jpg",
    );
    expect(img!.getAttribute("src")).toBe(NAZARIO_IMAGE);
    expect(img!.alt).toBe("Holy Michael Nazario");
    // No text alongside the picture.
    expect(button().textContent?.trim()).toBe("");
  });

  it("is hotlinked, never re-hosted", () => {
    expect(new URL(NAZARIO_IMAGE).host).toBe("i.ytimg.com");
  });

  it("says his name if the picture can't load", async () => {
    const home = await mountHome();
    const button = () =>
      home.querySelector<HTMLButtonElement>(".dl-dontclick")!;
    button().click();
    await settle(home);
    button().click();
    await settle(home);
    home.querySelector("img.dl-nazario")!.dispatchEvent(new Event("error"));
    await settle(home);
    expect(home.querySelector("img.dl-nazario")).toBeNull();
    expect(button().textContent?.trim()).toBe("Holy Michael Nazario");
  });

  it("stops at him: more clicks change nothing", async () => {
    const home = await mountHome();
    for (let i = 0; i < 5; i++) {
      home.querySelector<HTMLButtonElement>(".dl-dontclick")!.click();
      await settle(home);
    }
    expect(home.querySelectorAll("img.dl-nazario")).toHaveLength(1);
  });
});
