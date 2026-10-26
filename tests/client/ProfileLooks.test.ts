// PROFILE (r26): pictures and badges on the pages. A picture sits over the
// monogram, which shows when there's no picture or it can't load; pinned
// badges show their emblems (unknown ones nothing); every badge has its
// emblem drawn; the crop box never lets an edge show; and the picker reads
// a file by its bytes (PNG, JPEG, WebP; never SVG).

import { html, render } from "lit";
import { describe, expect, test } from "vitest";
import { avatar, lookFor, pinnedBadges } from "../../src/derpland/Avatar";
import { badgeEmblem, DRAWN_GLYPHS } from "../../src/derpland/BadgeArt";
import { BADGES } from "../../src/derpland/Badges";
import { MONOGRAM_COLORS } from "../../src/derpland/Pictures";
import { clampFrame, fileKind, zoomFrame } from "../../src/hub/PicturePicker";

function mount(t: unknown): HTMLElement {
  const el = document.createElement("div");
  document.body.append(el);
  render(t, el);
  return el;
}

describe("a player's picture", () => {
  test("no picture: their initial on their colour", () => {
    const el = mount(avatar("alden", null, "tok"));
    const tok = el.querySelector(".tok.av") as HTMLElement;
    expect(tok.textContent?.trim()).toBe("A");
    expect(tok.querySelector("img")).toBeNull();
    expect(tok.getAttribute("style")).toContain("--token:");
  });

  test("a preset or an upload sits over the initial, which shows again if it can't load", () => {
    const el = mount(avatar("Pat", "p:fox", "tok"));
    const img = el.querySelector("img.av-img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/derpland/pics/fox.svg");
    expect(img.getAttribute("alt")).toBe("");
    expect(el.textContent?.trim()).toBe("P");
    img.dispatchEvent(new Event("error"));
    expect(img.hasAttribute("data-broken")).toBe(true);
    img.dispatchEvent(new Event("load"));
    expect(img.hasAttribute("data-broken")).toBe(false);
    const up = mount(avatar("Gary", "u:7:0123456789ab", "tok"));
    expect(up.querySelector("img")?.getAttribute("src")).toBe(
      "/derpy/api/pictures/7/0123456789ab.jpg",
    );
  });

  test("a monogram colour, a link, and anything that isn't a picture", () => {
    const m = mount(avatar("Kim", "m:2", "tok", "/player/Kim"));
    const a = m.querySelector("a.tok") as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("/player/Kim");
    expect(a.getAttribute("style")).toContain(MONOGRAM_COLORS[2]);
    expect(a.querySelector("img")).toBeNull();
    for (const bad of ["javascript:alert(1)", "p:../../x", "u:1:nothex"]) {
      const el = mount(avatar("Kim", bad, "tok"));
      expect(el.querySelector("img"), bad).toBeNull();
    }
  });

  test("lists: looks by account id, the default when someone isn't there", () => {
    const looks = { 5: { pic: "p:owl", badges: ["df-mvp"] } };
    expect(lookFor(looks, 5).pic).toBe("p:owl");
    expect(lookFor(looks, 6)).toEqual({ pic: null, badges: [] });
    expect(lookFor(undefined, 5)).toEqual({ pic: null, badges: [] });
  });
});

describe("badges on the pages", () => {
  test("pinned badges show their emblems and names; unknown ones nothing", () => {
    const el = mount(html`${pinnedBadges(["df-mvp", "nope", "cq-win"])}`);
    const pins = el.querySelectorAll(".av-pin");
    expect(pins).toHaveLength(2);
    expect(pins[0].getAttribute("aria-label")).toBe("Most Valuable");
    expect(pins[0].getAttribute("title")).toContain("MVP");
    expect(el.querySelectorAll("svg.av-pin-art")).toHaveLength(2);
    expect(mount(html`${pinnedBadges([])}`).children).toHaveLength(0);
  });

  test("every badge has its emblem, in its tier's metal", () => {
    for (const b of BADGES) {
      expect(DRAWN_GLYPHS.has(b.glyph), b.key).toBe(true);
      const el = mount(html`${badgeEmblem(b.key)}`);
      const svg = el.querySelector("svg")!;
      expect(svg.getAttribute("data-tier"), b.key).toBe(b.tier);
      expect(
        svg.querySelectorAll("g path, g circle, g rect, g ellipse").length,
        b.key,
      ).toBeGreaterThan(0);
    }
    expect(mount(html`${badgeEmblem("nope")}`).querySelector("svg")).toBeNull();
  });
});

describe("the crop box", () => {
  const img = { w: 1200, h: 750 };
  const box = 280;

  test("the picture always covers the box: no edge shows, however it's dragged", () => {
    const f = clampFrame({ x: 500, y: -9999, scale: 0.01 }, img, box);
    const cover = box / 750;
    expect(f.scale).toBeCloseTo(cover);
    expect(f.x).toBe(0);
    expect(f.y + img.h * f.scale).toBeGreaterThanOrEqual(box - 1e-9);
    const g = clampFrame({ x: -99999, y: 0, scale: cover }, img, box);
    expect(g.x + img.w * g.scale).toBeCloseTo(box);
  });

  test("zooming keeps the point under the finger where it was", () => {
    const start = clampFrame({ x: -100, y: 0, scale: box / 750 }, img, box);
    const at = { x: 100, y: 140 };
    const z = zoomFrame(start, img, box, start.scale * 2, at);
    const before = (at.x - start.x) / start.scale;
    const after = (at.x - z.x) / z.scale;
    expect(after).toBeCloseTo(before);
    // Zooming out past covering stops at covering.
    expect(zoomFrame(z, img, box, 0.0001).scale).toBeCloseTo(box / 750);
  });
});

describe("the picker reads a file by its bytes", () => {
  const bytes = (s: string | number[]) =>
    typeof s === "string" ? new TextEncoder().encode(s) : Uint8Array.from(s);
  test("PNG, JPEG and WebP; never SVG or anything else", () => {
    expect(
      fileKind(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe("png");
    expect(fileKind(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe("jpeg");
    expect(fileKind(bytes("RIFF\x10\0\0\0WEBPVP8 "))).toBe("webp");
    expect(
      fileKind(bytes('<svg xmlns="http://www.w3.org/2000/svg">')),
    ).toBeNull();
    expect(fileKind(bytes("<?xml version='1.0'?><svg>"))).toBeNull();
    expect(fileKind(bytes("GIF89a\x01\0"))).toBeNull();
    expect(fileKind(bytes("hello"))).toBeNull();
  });
});
