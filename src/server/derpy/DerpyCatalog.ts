// What the Derp Store sells. Every pack is a set of territory skins (images
// stamped over your territory, centred on where you spawned); buying a pack
// unlocks all of its skins.

import { Cosmetics } from "@openfront/shared/CosmeticSchemas";

export interface DerpySkin {
  /** Cosmetic name: lowercase letters, digits and underscores. */
  name: string;
  displayName: string;
  url: string;
}

export interface DerpyPack {
  name: string;
  displayName: string;
  description: string;
  /** Price in Derp Coins. */
  price: number;
  skins: DerpySkin[];
}

function skin(name: string, displayName: string): DerpySkin {
  return { name, displayName, url: `/derpy-skins/${name}.png` };
}

export const DERPY_PACKS: readonly DerpyPack[] = [
  {
    name: "florida",
    displayName: "Florida Pack",
    description: "Oranges, gators, flamingos and a rocket off the Space Coast.",
    price: 600,
    skins: [
      skin("florida_oranges", "Orange Grove"),
      skin("florida_gator", "Gator Country"),
      skin("florida_flamingo", "Flamingo Flock"),
      skin("florida_sunset", "Sunshine State"),
      skin("florida_rocket", "Space Coast"),
    ],
  },
  {
    name: "classics",
    displayName: "The Classics",
    description: "Checkers, camo, tie-dye, plaid and polka dots.",
    price: 400,
    skins: [
      skin("classic_checkers", "Checkerboard"),
      skin("classic_camo", "Camo"),
      skin("classic_tiedye", "Tie-Dye"),
      skin("classic_plaid", "Plaid"),
      skin("classic_polka", "Polka Dots"),
    ],
  },
  {
    name: "politics",
    displayName: "American Politics",
    description: "Stars and stripes, both party animals, and your civic duty.",
    price: 750,
    skins: [
      skin("politics_flag", "Stars and Stripes"),
      skin("politics_donkey", "The Donkey"),
      skin("politics_elephant", "The Elephant"),
      skin("politics_ivoted", "I Voted"),
      skin("politics_capitol", "Capitol Dome"),
    ],
  },
];

export function findPack(name: string): DerpyPack | undefined {
  return DERPY_PACKS.find((p) => p.name === name);
}

export function allDerpySkins(): DerpySkin[] {
  return DERPY_PACKS.flatMap((p) => p.skins);
}

/**
 * The store as an OpenFront cosmetics catalog, so the game's own skin
 * pipeline (join checks, rendering, the skin picker) can use it unchanged.
 */
export function derpyCosmeticsCatalog(): Cosmetics {
  const skins: NonNullable<Cosmetics["skins"]> = {};
  for (const s of allDerpySkins()) {
    skins[s.name] = {
      name: s.name,
      url: s.url,
      product: null,
      rarity: "common",
    };
  }
  return { patterns: {}, flags: {}, skins };
}
