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
    name: "classics",
    displayName: "The Classics",
    description: "Checkers, camo, tie-dye, plaid and polka dots.",
    price: 1500,
    skins: [
      skin("classic_checkers", "Checkerboard"),
      skin("classic_camo", "Camo"),
      skin("classic_tiedye", "Tie-Dye"),
      skin("classic_plaid", "Plaid"),
      skin("classic_polka", "Polka Dots"),
    ],
  },
  {
    name: "derpland",
    displayName: "Derp Land Pack",
    description:
      "Bananas, slippery peels, jungle leaves, a fruit stand and a pile of gold.",
    price: 2000,
    skins: [
      skin("derpland_bananas", "Going Bananas"),
      skin("derpland_peels", "Slippery Peels"),
      skin("derpland_jungle", "Banana Jungle"),
      skin("derpland_awning", "Fruit Stand"),
      skin("derpland_coins", "Golden Coins"),
    ],
  },
  {
    name: "florida",
    displayName: "Florida Pack",
    description: "Oranges, gators, flamingos and a rocket off the Space Coast.",
    price: 2500,
    skins: [
      skin("florida_oranges", "Orange Grove"),
      skin("florida_gator", "Gator Country"),
      skin("florida_flamingo", "Flamingo Flock"),
      skin("florida_sunset", "Sunshine State"),
      skin("florida_rocket", "Space Coast"),
    ],
  },
  {
    name: "ocean",
    displayName: "Deep Blue",
    description:
      "Curling waves, a school of fish, anchors, tentacles and a lighthouse in the night.",
    price: 2500,
    skins: [
      skin("ocean_waves", "Curling Waves"),
      skin("ocean_fish", "Fish School"),
      skin("ocean_anchors", "Anchors Aweigh"),
      skin("ocean_octopus", "Tentacles"),
      skin("ocean_lighthouse", "Lighthouse Night"),
    ],
  },
  {
    name: "arcade",
    displayName: "Arcade",
    description:
      "Pixel hearts, pixel monsters, a neon grid, lucky dice and card suits.",
    price: 3000,
    skins: [
      skin("arcade_hearts", "Pixel Hearts"),
      skin("arcade_blobs", "Pixel Blobs"),
      skin("arcade_neongrid", "Neon Grid"),
      skin("arcade_dice", "Lucky Dice"),
      skin("arcade_suits", "Card Suits"),
    ],
  },
  {
    name: "politics",
    displayName: "American Politics",
    description: "Stars and stripes, both party animals, and your civic duty.",
    price: 3000,
    skins: [
      skin("politics_flag", "Stars and Stripes"),
      skin("politics_donkey", "The Donkey"),
      skin("politics_elephant", "The Elephant"),
      skin("politics_ivoted", "I Voted"),
      skin("politics_capitol", "Capitol Dome"),
    ],
  },
  {
    name: "space",
    displayName: "Outer Space",
    description:
      "Ringed planets, spiral galaxies, flying saucers, floating astronauts and the cratered moon.",
    price: 3500,
    skins: [
      skin("space_planets", "Ringed Planets"),
      skin("space_galaxy", "Galaxy Swirl"),
      skin("space_ufos", "Flying Saucers"),
      skin("space_astronauts", "Little Astronauts"),
      skin("space_moon", "Moon Craters"),
    ],
  },
  {
    // The store's grandest pack: an original space opera. Drawn by
    // scripts/derpy-skins/astral-armada.html.
    name: "armada",
    displayName: "Astral Armada",
    description:
      "Manta-winged starfighters, ring-spun battle cruisers, a drifting nebula, the Armada's own insignia and its robot crew.",
    price: 5000,
    skins: [
      skin("armada_fighters", "Starfighter Squadron"),
      skin("armada_cruisers", "Battle Cruisers"),
      skin("armada_nebula", "Nebula Drift"),
      skin("armada_insignia", "Armada Insignia"),
      skin("armada_robots", "Bot Brigade"),
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
