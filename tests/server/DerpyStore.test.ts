// DFSTORE (r21): the Derp Store's catalog: every item, its tabs, what owning
// it grants, and the join checks for the looks it sells.

import { AI_PERSONALITY_PACKS } from "@openfront/engine-lib/game/AiPersonalities";
import {
  CosmeticsSchema,
  findEffectForSlot,
} from "@openfront/shared/CosmeticSchemas";
import {
  DERPY_DOME_STYLES,
  DERPY_FX_THEMES,
  domeStyleIndex,
  fxEffectNames,
} from "@openfront/shared/DerpyFx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, test, vi } from "vitest";
import { FANFARE_NAMES } from "../../src/client/derpy/Fanfares";
import {
  DERPY_ITEMS,
  DERPY_PACKS,
  DERPY_STORE_TABS,
  derpyCosmeticsCatalog,
  findItem,
  itemGrants,
  ownedPersonalityPacks,
} from "../../src/server/derpy/DerpyCatalog";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const { derpyLooksFor } = await import("../../src/server/derpy/DerpySkins");

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const en = JSON.parse(
  fs.readFileSync(path.join(ROOT, "resources/lang/en.json"), "utf8"),
);

describe("the catalog", () => {
  test("every item has a unique, well-formed name and a tab to live under", () => {
    const names = DERPY_ITEMS.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
    for (const item of DERPY_ITEMS) {
      expect(item.name).toMatch(/^[a-z0-9_]{1,32}$/);
      const tab = DERPY_STORE_TABS.find((t) => t.game === item.game);
      expect(tab?.categories.map((c) => c.id)).toContain(item.category);
      expect(item.price).toBeGreaterThan(0);
      expect(Number.isInteger(item.price)).toBe(true);
    }
  });

  test("the tabs: DerpyFront's four categories, then Conquest's three", () => {
    expect(
      DERPY_STORE_TABS.map((t) => [t.game, t.categories.map((c) => c.id)]),
    ).toEqual([
      ["derpyfront", ["skins", "personalities", "effects", "fanfares"]],
      ["conquest", ["campaigns", "legends", "mapstyles"]],
    ]);
  });

  test("the skin packs are still sold, first, at their old prices", () => {
    const skins = DERPY_ITEMS.filter((i) => i.category === "skins");
    expect(skins.map((i) => i.name)).toEqual(DERPY_PACKS.map((p) => p.name));
    for (const p of DERPY_PACKS) {
      expect(findItem(p.name)?.price).toBe(p.price);
      expect(findItem(p.name)?.skins).toBe(p.skins);
    }
  });

  test("the price list (r21)", () => {
    const price = (cat: string) =>
      Object.fromEntries(
        DERPY_ITEMS.filter((i) => i.category === cat).map((i) => [
          i.name,
          i.price,
        ]),
      );
    expect(price("personalities")).toEqual({
      ai_pirates: 2500,
      ai_empires: 2500,
      ai_merchants: 2000,
      ai_scientists: 3000,
      ai_warlords: 2500,
    });
    expect(price("effects")).toEqual({
      fx_solar: 1500,
      fx_toxic: 1800,
      fx_frost: 2000,
      fx_banana: 2500,
      fx_cosmic: 3500,
      fx_golden: 6000,
    });
    expect(price("fanfares")).toEqual({
      fanfare_chiptune: 600,
      fanfare_bagpipes: 700,
      fanfare_brass: 800,
      fanfare_steeldrum: 800,
      fanfare_shanty: 900,
      fanfare_orchestral: 1200,
    });
    // Something new for a week or two of play, and goals for the long haul.
    const prices = DERPY_ITEMS.map((i) => i.price);
    expect(Math.min(...prices)).toBeLessThanOrEqual(600);
    expect(Math.max(...prices)).toBe(6000);
  });

  test("Conquest's tabs are empty until its DLC comes", () => {
    expect(DERPY_ITEMS.filter((i) => i.game === "conquest")).toEqual([]);
  });

  test("every AI personality pack is sold, with its personas and emblems", () => {
    for (const pack of AI_PERSONALITY_PACKS) {
      const item = findItem(pack.id)!;
      expect(item.category).toBe("personalities");
      expect(item.personas?.map((p) => p.id)).toEqual(
        pack.personas.map((p) => p.id),
      );
      for (const p of item.personas ?? []) {
        expect(p.emblem).toBe(`/derpy-emblems/persona_${p.id}.svg`);
        const file = path.join(ROOT, "resources/public", p.emblem);
        expect(fs.existsSync(file)).toBe(true);
        expect(fs.readFileSync(file, "utf8")).toMatch(/^<svg [^>]*viewBox/);
      }
    }
  });

  test("every fanfare sold has its music", () => {
    expect(
      DERPY_ITEMS.filter((i) => i.category === "fanfares").map((i) => i.name),
    ).toEqual([...FANFARE_NAMES]);
  });

  test("every item and tab has its words in en.json", () => {
    for (const item of DERPY_ITEMS) {
      if (item.category === "skins") {
        expect(en.derpy[`pack_${item.name}`]).toBe(item.displayName);
        expect(en.derpy[`pack_desc_${item.name}`]).toBe(item.description);
      } else {
        expect(en.derpy[`item_${item.name}`]).toBe(item.displayName);
        expect(en.derpy[`item_desc_${item.name}`]).toBe(item.description);
      }
    }
    for (const t of DERPY_STORE_TABS) {
      expect(en.derpy[`store_game_${t.game}`]).toBe(t.label);
      for (const c of t.categories) {
        expect(en.derpy[`store_cat_${c.id}`]).toBe(c.label);
        expect(en.derpy[`store_blurb_${c.id}`]).toBeTruthy();
      }
    }
  });
});

describe("what owning an item grants", () => {
  test("a skin pack: the pack and its skins, as before", () => {
    const classics = findItem("classics")!;
    expect(itemGrants(classics)).toEqual([
      "pack:classics",
      ...classics.skins!.map((s) => `skin:${s.name}`),
    ]);
  });

  test("an effects pack: its nuke trail, three bursts and its Dome style", () => {
    expect(itemGrants(findItem("fx_frost")!)).toEqual([
      "pack:fx_frost",
      "effect:fx_frost_trail",
      "effect:fx_frost_atom",
      "effect:fx_frost_hydro",
      "effect:fx_frost_mirv",
      "dome:fx_frost",
    ]);
  });

  test("a personality pack or a fanfare: just the item", () => {
    expect(itemGrants(findItem("ai_pirates")!)).toEqual(["pack:ai_pirates"]);
    expect(itemGrants(findItem("fanfare_brass")!)).toEqual([
      "pack:fanfare_brass",
    ]);
  });

  test("the personality packs an owner may use", () => {
    expect(
      ownedPersonalityPacks([
        "pack:ai_warlords",
        "pack:classics",
        "pack:ai_pirates",
        "skin:classic_camo",
      ]),
    ).toEqual(["ai_pirates", "ai_warlords"]);
    expect(ownedPersonalityPacks([])).toEqual([]);
  });
});

describe("the cosmetics catalog the game reads", () => {
  const catalog = derpyCosmeticsCatalog();

  test("still parses as OpenFront's cosmetics, skins and effects alike", () => {
    const parsed = CosmeticsSchema.parse(catalog);
    expect(Object.keys(parsed.skins ?? {})).toHaveLength(40);
    expect(Object.keys(parsed.effects?.nukeTrail ?? {})).toHaveLength(
      DERPY_FX_THEMES.length,
    );
    expect(Object.keys(parsed.effects?.nukeExplosion ?? {})).toHaveLength(
      DERPY_FX_THEMES.length * 3,
    );
  });

  test("each effect pack fills the nuke slots: trail, atom, hydrogen, MIRV", () => {
    for (const theme of DERPY_FX_THEMES) {
      const names = fxEffectNames(theme);
      for (const [slot, name] of Object.entries(names)) {
        expect(name.length).toBeLessThanOrEqual(32);
        const found = findEffectForSlot(catalog, slot, name);
        expect(found?.name).toBe(name);
      }
      expect(DERPY_DOME_STYLES.get(theme.name)).toBe(theme.dome);
    }
    // The bursts are scaled to their bombs.
    const ex = catalog.effects!.nukeExplosion!;
    expect(ex.fx_cosmic_hydro.attributes.size).toBeGreaterThan(
      ex.fx_cosmic_atom.attributes.size,
    );
    expect(ex.fx_cosmic_mirv.attributes.size).toBeLessThan(
      ex.fx_cosmic_atom.attributes.size,
    );
  });

  test("Dome styles have renderer indexes, 0 for none", () => {
    expect(domeStyleIndex(null)).toBe(0);
    expect(domeStyleIndex("nope")).toBe(0);
    expect(domeStyleIndex("fx_solar")).toBe(1);
    expect(domeStyleIndex("fx_golden")).toBe(DERPY_FX_THEMES.length);
  });
});

describe("the join check: a player wears only looks their account owns", () => {
  const owned = [
    ...itemGrants(findItem("fx_frost")!),
    ...itemGrants(findItem("classics")!),
  ];
  const refs = {
    skinName: "classic_camo",
    effects: {
      nukeTrail: "fx_frost_trail",
      atom: "fx_frost_atom",
      hydro: "fx_solar_hydro", // not owned
      mirvWarhead: "fx_frost_mirv",
    },
    derpyDome: "fx_frost",
  };

  test("owned looks come through", () => {
    const looks = derpyLooksFor(owned, refs);
    expect(looks.skin?.name).toBe("classic_camo");
    expect(looks.effects).toEqual({
      nukeTrail: { name: "fx_frost_trail", effectType: "nukeTrail" },
      atom: { name: "fx_frost_atom", effectType: "nukeExplosion" },
      mirvWarhead: { name: "fx_frost_mirv", effectType: "nukeExplosion" },
    });
    expect(looks.derpyDome).toBe("fx_frost");
  });

  test("anything not owned, unknown or in the wrong slot is left off", () => {
    expect(derpyLooksFor([], refs)).toEqual({});
    expect(
      derpyLooksFor(owned, {
        effects: { atom: "fx_frost_trail", hydro: "made_up" },
        derpyDome: "fx_solar",
      }),
    ).toEqual({});
  });
});
