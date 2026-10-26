// ADMIN (r26): the site banner in the top bar: it comes with the social
// beat (signed in) or What's New's list (signed out), shows under the bar
// with its link, goes at its end time, and a viewer can dismiss it (for
// that banner only; a changed one shows again).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  banner,
  BANNER_DISMISSED_KEY,
  BannerClient,
} from "../../src/derpland/Banner";
import type { SiteBanner } from "../../src/derpland/BannerTypes";
import { BANNER_LINK_RE } from "../../src/derpland/BannerTypes";
import { news, NEWS_EVENT } from "../../src/derpland/News";
import { social, SOCIAL_EVENT } from "../../src/derpland/Social";
import type { SocialState } from "../../src/derpland/SocialTypes";

const B = (over: Partial<SiteBanner> = {}): SiteBanner => ({
  v: 3,
  text: "Servers restart at 9",
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 404 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  social.state = null;
  news.view = null;
});

describe("the banner's state", () => {
  test("from a beat, and from What's New's list when signed out", () => {
    const c = new BannerClient();
    c.start();
    social.state = { banner: B() } as unknown as SocialState;
    window.dispatchEvent(new CustomEvent(SOCIAL_EVENT));
    expect(c.visible()).toEqual(B());
    // An action's answer (no banner field) changes nothing.
    social.state = {} as SocialState;
    window.dispatchEvent(new CustomEvent(SOCIAL_EVENT));
    expect(c.visible()).toEqual(B());
    // A beat that says none: gone.
    social.state = { banner: null } as unknown as SocialState;
    window.dispatchEvent(new CustomEvent(SOCIAL_EVENT));
    expect(c.visible()).toBeNull();
    news.view = {
      signedIn: false,
      entries: [],
      games: [],
      lastSeen: null,
      unseen: 0,
      banner: B({ v: 4, text: "Hello" }),
    };
    window.dispatchEvent(new CustomEvent(NEWS_EVENT));
    expect(c.visible()?.text).toBe("Hello");
    c.stop();
  });

  test("dismissed: remembered for that banner only", () => {
    const c = new BannerClient();
    c.set(B());
    c.dismiss();
    expect(c.visible()).toBeNull();
    expect(localStorage.getItem(BANNER_DISMISSED_KEY)).toBe("3");
    // The next page: still dismissed.
    const next = new BannerClient();
    next.set(B());
    expect(next.visible()).toBeNull();
    // A changed banner shows again.
    next.set(B({ v: 4, text: "New words" }));
    expect(next.visible()?.text).toBe("New words");
  });

  test("a browser that keeps nothing still dismisses it on the page", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("no storage");
    });
    const c = new BannerClient();
    c.set(B());
    c.dismiss();
    expect(c.visible()).toBeNull();
    vi.restoreAllMocks();
  });

  test("gone at its end time, without waiting for a beat", () => {
    vi.useFakeTimers();
    const c = new BannerClient();
    const seen: number[] = [];
    window.addEventListener("derp-banner", () => seen.push(Date.now()));
    c.set(B({ endsAt: new Date(Date.now() + 5000).toISOString() }));
    expect(c.visible()).not.toBeNull();
    vi.advanceTimersByTime(5100);
    expect(c.visible()).toBeNull();
    expect(seen.length).toBeGreaterThanOrEqual(2);
  });

  test("links: a page here or an https address, nothing else", () => {
    expect(BANNER_LINK_RE.test("/store")).toBe(true);
    expect(BANNER_LINK_RE.test("/whats-new#x")).toBe(true);
    expect(BANNER_LINK_RE.test("https://discord.gg/abc")).toBe(true);
    expect(BANNER_LINK_RE.test("//evil.example")).toBe(false);
    expect(BANNER_LINK_RE.test("javascript:alert(1)")).toBe(false);
    expect(BANNER_LINK_RE.test("http://insecure.example")).toBe(false);
  });
});

describe("in the top bar", () => {
  test("shown under the bar with its link, and the cross dismisses it", async () => {
    await import("../../src/derpland/DerpBar");
    const bar = document.createElement("derp-bar") as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    document.body.appendChild(bar);
    await bar.updateComplete;
    const strip = () => bar.shadowRoot!.querySelector(".site-banner");
    expect(strip()).toBeNull();

    banner.set(B({ v: 7, link: "/store", linkText: "To the Store" }));
    await bar.updateComplete;
    expect(strip()?.textContent).toContain("Servers restart at 9");
    const link = strip()!.querySelector<HTMLAnchorElement>("a.sb-link")!;
    expect(link.getAttribute("href")).toBe("/store");
    expect(link.textContent?.trim()).toBe("To the Store");
    expect(link.target).toBe("_self");

    strip()!.querySelector<HTMLButtonElement>(".sb-x")!.click();
    await bar.updateComplete;
    expect(strip()).toBeNull();
    expect(localStorage.getItem(BANNER_DISMISSED_KEY)).toBe("7");

    // Another site's link opens in a new tab, without telling it where from.
    banner.set(B({ v: 8, link: "https://example.com/x" }));
    await bar.updateComplete;
    const out = strip()!.querySelector<HTMLAnchorElement>("a.sb-link")!;
    expect(out.target).toBe("_blank");
    expect(out.rel).toContain("noopener");
    expect(out.textContent?.trim()).toBe("Take a look");
    banner.set(null);
    await bar.updateComplete;
    expect(strip()).toBeNull();
    bar.remove();
  });
});
