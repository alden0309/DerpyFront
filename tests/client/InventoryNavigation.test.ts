import type { UserMeResponse } from "@openfront/shared/ApiSchemas";
import type { Cosmetics } from "@openfront/shared/CosmeticSchemas";
import fs from "fs";
import type { LitElement } from "lit";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../src/client/InventoryModal";
import type { InventoryModal } from "../../src/client/InventoryModal";
import { modalRouter } from "../../src/client/ModalRouter";
import { initNavigation } from "../../src/client/Navigation";
import { DesktopNavBar } from "../../src/client/components/DesktopNavBar";
import { MobileNavBar } from "../../src/client/components/MobileNavBar";
import { PlayPage } from "../../src/client/components/PlayPage";

if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", {
    value: ResizeObserverStub,
  });
}

async function mount<T extends LitElement>(element: T): Promise<T> {
  document.body.appendChild(element);
  await element.updateComplete;
  return element;
}

afterEach(() => document.body.replaceChildren());

describe("Inventory navigation", () => {
  it("shows the shared Derp Land bar, whose Inventory tab leads to the site's Inventory, and no Clans", async () => {
    const desktop = await mount(new DesktopNavBar());
    const bar = desktop.querySelector("derp-bar")!;
    expect(bar).toBeTruthy();
    await bar.updateComplete;
    const tabs = Array.from(
      bar.shadowRoot!.querySelectorAll<HTMLAnchorElement>("a.tab"),
    ).map((a) => a.getAttribute("href"));
    expect(tabs).toEqual(["/store", "/inventory", "/leaderboard"]);
    expect(desktop.querySelector('[data-page="page-clan"]')).toBeNull();
    const mobile = await mount(new MobileNavBar());
    expect(mobile.querySelector('[data-page="page-clan"]')).toBeNull();
  });

  it("removes cosmetic and flag selectors from the play page", async () => {
    const play = await mount(new PlayPage());
    expect(play.querySelector("cosmetics-input")).toBeNull();
    expect(play.querySelector("flag-input")).toBeNull();
    expect(play.querySelector("username-input")).toBeTruthy();
  });

  it("declares only the routed Inventory page in index.html", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "index.html"),
      "utf8",
    );
    expect(source).toContain('<inventory-modal\n          id="page-inventory"');
    expect(source).not.toContain("<cosmetics-modal");
    expect(source).not.toContain("<flag-input-modal");
  });

  it("routes an actual navigation click with the active tab and restores deep links", async () => {
    history.replaceState(null, "", "/");
    const play = document.createElement("div");
    play.id = "page-play";
    document.body.appendChild(play);
    const inventory = document.createElement(
      "inventory-modal",
    ) as InventoryModal;
    inventory.id = "page-inventory";
    inventory.setAttribute("inline", "");
    inventory.className = "page-content hidden";
    Object.assign(inventory as unknown as Record<string, unknown>, {
      cosmetics: {
        patterns: {},
        flags: {},
        crowns: {},
        skins: {},
        effects: {},
      } as Cosmetics,
      userMeResponse: {
        user: {},
        player: { flares: [] },
      } as unknown as UserMeResponse,
      ownershipState: "loaded",
      isLoading: false,
      loadFailed: false,
    });
    document.body.appendChild(inventory);
    // DerpyFront's own inventory (flags and patterns) is opened from links
    // like the one on the site's Inventory page; any nav item routes it.
    const link = document.createElement("button");
    link.className = "nav-menu-item";
    link.dataset.page = "page-inventory";
    document.body.appendChild(link);
    modalRouter.register("inventory", {
      tag: "inventory-modal",
      pageId: "page-inventory",
    });
    initNavigation();

    link.click();

    // DerpyFront opens on flags: the one thing everyone can pick.
    await vi.waitFor(() => {
      expect(window.location.hash).toBe("#modal=inventory&tab=flags");
    });
    expect(link.classList.contains("active")).toBe(true);

    inventory.setActiveTab("effects");
    expect(window.location.hash).toBe("#modal=inventory&tab=effects");

    inventory.close();
    history.replaceState(null, "", "/#modal=inventory&tab=crowns");
    expect(modalRouter.routeFromHash()).toBe(true);
    await vi.waitFor(() => {
      expect((inventory as unknown as { activeTab: string }).activeTab).toBe(
        "crowns",
      );
    });
    expect(window.location.hash).toBe("#modal=inventory&tab=crowns");
  }, 30_000);
});
