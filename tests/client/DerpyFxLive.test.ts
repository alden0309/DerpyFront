// FX (r28): a Nuke & Dome pack's picture in the store, the Inventory and the
// pickers: <dfx-live>, with its still and (where WebGL2 is) a live preview.
import { html, render } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DfxLive, fxPosterUrl } from "../../src/derpland/FxLive";
import { fxPreview, STORE_PREVIEW_CSS } from "../../src/derpland/StorePreviews";

const FX = {
  trail: ["#fff3b0", "#ffb703"],
  burst: ["#fff3b0", "#ffb703", "#fb8500", "#d00000"],
  dome: "#ffb703",
  accent: "#fff3b0",
  shimmer: "ripple",
};

function mount(): { host: HTMLElement; el: DfxLive } {
  const host = document.createElement("article");
  document.body.appendChild(host);
  render(html`<div>${fxPreview("fx_solar", FX)}</div>`, host);
  const el = host.querySelector("dfx-live") as DfxLive;
  return { host, el };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("<dfx-live>", () => {
  it("is the pack's picture, starting from its pre-rendered still", () => {
    const { el } = mount();
    expect(el).toBeInstanceOf(DfxLive);
    expect(el.pack).toBe("fx_solar");
    expect(el.getAttribute("aria-hidden")).toBe("true");
    const img = el.querySelector("img.dfx-still") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/derpy-fx/fx_solar.webp");
    expect(el.querySelector(".dfx-play")).not.toBeNull();
    // No canvas until a card plays.
    expect(el.querySelector("canvas")).toBeNull();
  });

  it("keeps the still where WebGL2 isn't available (nothing is loaded)", async () => {
    // jsdom has no WebGL2RenderingContext: hovering must not load the renderer.
    expect(typeof globalThis.WebGL2RenderingContext).toBe("undefined");
    const { host, el } = mount();
    host.dispatchEvent(new Event("pointerenter"));
    host.dispatchEvent(new FocusEvent("focusin"));
    await new Promise((r) => setTimeout(r, 0));
    expect(el.querySelector("canvas")).toBeNull();
    expect(el.dataset.playing).toBeUndefined();
  });

  it("never plays with reduced motion", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("reduce"),
    }));
    vi.stubGlobal("WebGL2RenderingContext", class {});
    const { host, el } = mount();
    host.dispatchEvent(new Event("pointerenter"));
    await new Promise((r) => setTimeout(r, 0));
    expect(el.dataset.playing).toBeUndefined();
    expect(el.querySelector("canvas")).toBeNull();
  });

  it("hides a missing still rather than showing a broken image", () => {
    const { el } = mount();
    const img = el.querySelector("img.dfx-still") as HTMLImageElement;
    img.dispatchEvent(new Event("error"));
    expect(img.classList.contains("missing")).toBe(true);
  });

  it("names each pack's still by the pack", () => {
    expect(fxPosterUrl("fx_golden")).toBe("/derpy-fx/fx_golden.webp");
    expect(STORE_PREVIEW_CSS).toContain("dfx-live{");
  });
});
