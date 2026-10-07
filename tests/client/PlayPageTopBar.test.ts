import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@openfront/shared/AssetUrls", () => ({
  assetUrl: (path: string) => path,
}));

// Rendering play-page mounts its children too (steam-wishlist, cosmetic
// background, …), and some reach for browser APIs jsdom doesn't ship.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import { PlayPage } from "../../src/client/components/PlayPage";

// Phones get the same Derp Land bar as desktops (desktop-nav-bar), so the
// play page no longer draws its own fixed top bar with a hamburger menu.
describe("play-page", () => {
  let el: PlayPage;

  afterEach(() => el?.remove());

  it("has no top bar of its own, only the name and the play buttons", async () => {
    if (!customElements.get("play-page")) {
      customElements.define("play-page", PlayPage);
    }
    el = document.createElement("play-page") as PlayPage;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.querySelector("#hamburger-btn")).toBeNull();
    expect(el.querySelector("derpy-nav-account")).toBeNull();
    expect(el.querySelector("username-input")).toBeTruthy();
    expect(el.querySelector("game-mode-selector")).toBeTruthy();
  });
});
