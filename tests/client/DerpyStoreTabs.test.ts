// DFSTORE (r21): the Derp Store's tabs (by game, then category), as Derp
// Land's Store and Inventory and DerpyFront's Derp Store page show them.

import { describe, expect, test } from "vitest";
import {
  firstTab,
  itemsInTab,
  ownedInTab,
  ownsItem,
  tabCounts,
  tabFromHash,
  tabHash,
} from "../../src/derpland/StoreTabs";
import {
  DERPY_ITEMS,
  DERPY_STORE_TABS,
} from "../../src/server/derpy/DerpyCatalog";

const tabs = DERPY_STORE_TABS;

describe("the store's tabs", () => {
  test("each item shows under exactly one tab", () => {
    for (const item of DERPY_ITEMS) {
      let seen = 0;
      for (const t of tabs) {
        for (const c of t.categories) {
          if (
            itemsInTab(DERPY_ITEMS, { game: t.game, category: c.id }).includes(
              item,
            )
          ) {
            seen++;
          }
        }
      }
      expect(seen).toBe(1);
    }
  });

  test("a tab lists its items cheapest first", () => {
    const fx = itemsInTab(DERPY_ITEMS, {
      game: "derpyfront",
      category: "effects",
    });
    expect(fx.map((i) => i.price)).toEqual(
      [...fx.map((i) => i.price)].sort((a, b) => a - b),
    );
    expect(fx[0].name).toBe("fx_solar");
    // Skin packs keep their order (they're already cheapest first).
    expect(
      itemsInTab(DERPY_ITEMS, { game: "derpyfront", category: "skins" })[0]
        .name,
    ).toBe("classics");
  });

  test("counts per tab, for sale and owned", () => {
    const forSale = tabCounts(DERPY_ITEMS, tabs);
    expect(forSale.get("derpyfront/skins")).toBe(11); // SITE (r22): 8 + 3
    expect(forSale.get("derpyfront/personalities")).toBe(4); // AIP (r23)
    expect(forSale.get("derpyfront/effects")).toBe(6);
    expect(forSale.get("derpyfront/fanfares")).toBe(6);
    expect(forSale.get("conquest/startdates")).toBe(1); // SITE (r22)
    expect(forSale.get("conquest/mapstyles")).toBe(5); // DLC (r21)
    expect(forSale.get("conquest/addons")).toBe(1); // SITE (r22)
    const owned = ["pack:classics", "skin:classic_camo", "pack:fx_frost"];
    const mine = tabCounts(DERPY_ITEMS, tabs, owned);
    expect(mine.get("derpyfront/skins")).toBe(1);
    expect(mine.get("derpyfront/effects")).toBe(1);
    expect(mine.get("derpyfront/fanfares")).toBe(0);
    expect(
      ownedInTab(DERPY_ITEMS, owned, {
        game: "derpyfront",
        category: "effects",
      }).map((i) => i.name),
    ).toEqual(["fx_frost"]);
    expect(ownsItem(owned, DERPY_ITEMS[0])).toBe(true);
  });

  test("links name tabs, and anything else lands on the first", () => {
    expect(firstTab(tabs)).toEqual({ game: "derpyfront", category: "skins" });
    expect(tabFromHash("#conquest/addons", tabs)).toEqual({
      game: "conquest",
      category: "addons",
    });
    expect(tabFromHash("#effects", tabs)).toEqual({
      game: "derpyfront",
      category: "effects",
    });
    expect(tabFromHash("#conquest", tabs)).toEqual({
      game: "conquest",
      category: "startdates",
    });
    expect(tabFromHash("#conquest/nope", tabs)).toEqual({
      game: "conquest",
      category: "startdates",
    });
    expect(tabFromHash("", tabs)).toEqual(firstTab(tabs));
    expect(tabFromHash("#rubbish", tabs)).toEqual(firstTab(tabs));
    const t = { game: "derpyfront", category: "fanfares" };
    expect(tabFromHash(tabHash(t), tabs)).toEqual(t);
  });
});

// SITE (r22): Derpy Conquest's tabs are Start Dates, Map Styles and Add-Ons.
describe("Derpy Conquest's tabs", () => {
  const conquest = tabs.find((t) => t.game === "conquest")!;

  test("Start Dates, Map Styles, Add-Ons, in that order", () => {
    expect(conquest.categories.map((c) => c.label)).toEqual([
      "Start Dates",
      "Map Styles",
      "Add-Ons",
    ]);
  });

  test("1776 is a start date, Legends an add-on, every item still for sale", () => {
    const names = (category: string) =>
      itemsInTab(DERPY_ITEMS, { game: "conquest", category }).map(
        (i) => i.name,
      );
    expect(names("startdates")).toEqual(["campaign_1776"]);
    expect(names("addons")).toEqual(["legends"]);
    expect(names("mapstyles")).toHaveLength(5);
    const shown = conquest.categories.flatMap((c) => names(c.id));
    expect(shown.sort()).toEqual(
      DERPY_ITEMS.filter((i) => i.game === "conquest")
        .map((i) => i.name)
        .sort(),
    );
  });

  test("owned items show as owned under their new tabs", () => {
    const owned = ["pack:legends", "pack:campaign_1776"];
    const mine = tabCounts(DERPY_ITEMS, tabs, owned);
    expect(mine.get("conquest/addons")).toBe(1);
    expect(mine.get("conquest/startdates")).toBe(1);
    expect(mine.get("conquest/mapstyles")).toBe(0);
  });

  test("old links (Campaigns, Legends) open the new tabs", () => {
    expect(tabFromHash("#conquest/campaigns", tabs)).toEqual({
      game: "conquest",
      category: "startdates",
    });
    expect(tabFromHash("#conquest/legends", tabs)).toEqual({
      game: "conquest",
      category: "addons",
    });
    expect(tabFromHash("#legends", tabs)).toEqual({
      game: "conquest",
      category: "addons",
    });
    expect(tabFromHash("#campaigns", tabs)).toEqual({
      game: "conquest",
      category: "startdates",
    });
    expect(tabFromHash("#conquest/mapstyles", tabs)).toEqual({
      game: "conquest",
      category: "mapstyles",
    });
  });
});
