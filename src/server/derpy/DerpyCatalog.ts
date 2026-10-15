// What the Derp Store sells, game by game and category by category (DFSTORE
// r21 added the tabs):
//  - DerpyFront: territory skin packs (images stamped over your territory,
//    centred on where you spawned; a pack unlocks all of its skins), AI
//    personalities (AIP r23: four, sold one by one; they replaced r21's
//    personality packs), Nuke & Dome effects, and victory fanfares;
//  - Derpy Conquest: start dates ("1776: The Revolution"), map styles and
//    add-ons (Legends) (DLC r21; the game server checks them:
//    ConquestDlc.ts). SITE (r22) gave Conquest these three tabs.
//
// Owning an item is a row in derpy_owned: "pack:<item>" for every item, plus
// what it unlocks ("skin:<name>", "effect:<name>", "dome:<theme>").

import { AI_PERSONALITY_PACKS } from "@openfront/engine-lib/game/AiPersonalities";
import {
  AI_TYPES,
  AiType,
  aiTypeItem,
} from "@openfront/engine-lib/game/AiPersonalityTypes";
import { Cosmetics } from "@openfront/shared/CosmeticSchemas";
import {
  DERPY_FX_THEMES,
  DerpyFxTheme,
  DomeShimmer,
  fxEffectNames,
  fxExplosionAttributes,
} from "@openfront/shared/DerpyFx";
import {
  DERPY_SKIN_MOTION,
  type SkinMotion,
} from "@openfront/shared/DerpySkinMotion";
import {
  CAMPAIGN_1776,
  LEGENDS,
  MAP_STYLES,
  MAP_STYLE_NAMES,
  MAP_STYLE_PALETTES,
  mapStyleItem,
  type MapStyleKey,
} from "../../conquest/DlcIds"; // DLC (r21)

export interface DerpySkin {
  /** Cosmetic name: lowercase letters, digits and underscores. */
  name: string;
  displayName: string;
  url: string;
  /** SITE (r22): how it moves on the map, if it does (DerpySkinMotion.ts). */
  motion?: SkinMotion;
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
  const motion = DERPY_SKIN_MOTION[name];
  return {
    name,
    displayName,
    url: `/derpy-skins/${name}.png`,
    ...(motion ? { motion } : {}),
  };
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
  // SITE (r22): three more packs, drawn by scripts/derpy-skins/sweet-shop.html,
  // tile-mosaic.html and nature-in-motion.html. All original.
  {
    name: "sweets",
    displayName: "Sweet Shop",
    description:
      "Peppermint swirls, rainbow sprinkles, a dozen donuts, gummy critters and an ice cream social.",
    price: 2000,
    skins: [
      skin("sweets_peppermint", "Peppermint Swirls"),
      skin("sweets_sprinkles", "Rainbow Sprinkles"),
      skin("sweets_donuts", "Donut Dozen"),
      skin("sweets_gummies", "Gummy Critters"),
      skin("sweets_icecream", "Ice Cream Social"),
    ],
  },
  {
    name: "tiles",
    displayName: "Tile & Mosaic",
    description:
      "Stained glass, terrazzo chips, Art Deco fans, a patchwork quilt and a mosaic of eight-pointed stars.",
    price: 2500,
    skins: [
      skin("tiles_stainedglass", "Stained Glass"),
      skin("tiles_terrazzo", "Terrazzo"),
      skin("tiles_deco", "Art Deco Fans"),
      skin("tiles_quilt", "Patchwork Quilt"),
      skin("tiles_stars", "Star Mosaic"),
    ],
  },
  {
    // The first skins that move: the territory shader plays each one's
    // motion over its picture (DerpySkinMotion.ts).
    name: "motion",
    displayName: "Nature in Motion",
    description:
      "Skins that move: lava that seethes, northern lights that ripple, fireflies that twinkle, clouds that drift across your land, and a honeycomb with a golden gleam.",
    price: 4500,
    skins: [
      skin("motion_lava", "Lava Flow"),
      skin("motion_aurora", "Northern Lights"),
      skin("motion_fireflies", "Firefly Meadow"),
      skin("motion_clouds", "Drifting Clouds"),
      skin("motion_honey", "Golden Honeycomb"),
    ],
  },
];

export function findPack(name: string): DerpyPack | undefined {
  return DERPY_PACKS.find((p) => p.name === name);
}

export function allDerpySkins(): DerpySkin[] {
  return DERPY_PACKS.flatMap((p) => p.skins);
}

// ---- DFSTORE (r21): every item, by game and category ----

export type DerpyGame = "derpyfront" | "conquest";
export type DerpyCategory =
  | "skins"
  | "personalities"
  | "effects"
  | "fanfares"
  // SITE (r22): Derpy Conquest's tabs. A start date ("1776: The
  // Revolution") was a "campaigns" item and Legends a "legends" one; links
  // naming those still land on the new tabs (StoreTabs.tabFromHash).
  | "startdates"
  | "mapstyles"
  | "addons";

export interface DerpyStoreTab {
  game: DerpyGame;
  label: string;
  categories: { id: DerpyCategory; label: string; blurb: string }[];
}

/** The store's tabs: a game, then its categories, in this order. */
export const DERPY_STORE_TABS: readonly DerpyStoreTab[] = [
  {
    game: "derpyfront",
    label: "DerpyFront",
    categories: [
      {
        id: "skins",
        label: "Skins",
        blurb:
          "Pictures stamped over your territory. Everyone in the game sees them.",
      },
      {
        id: "personalities",
        label: "AI personalities",
        blurb:
          "How the AI nations play. Tick the ones you own when you set up a Solo game or host a lobby, and each AI nation is dealt one of them at random.",
      },
      {
        id: "effects",
        label: "Nuke & Dome effects",
        blurb:
          "How your nukes fly and burst, and how your Domes of Alden shimmer and stop a strike. Looks only: they change nothing in the game.",
      },
      {
        id: "fanfares",
        label: "Victory fanfares",
        blurb: "The music that plays when you win.",
      },
    ],
  },
  {
    game: "conquest",
    label: "Derpy Conquest",
    // SITE (r22): Start Dates, Map Styles, Add-Ons (Legends lives here).
    categories: [
      {
        id: "startdates",
        label: "Start Dates",
        blurb:
          "New years to begin a game in, each with a campaign of its own. 1607, 1650 and 1700 come with every game.",
      },
      {
        id: "mapstyles",
        label: "Map Styles",
        blurb: "Other looks for Conquest's map. Only you see them.",
      },
      {
        id: "addons",
        label: "Add-Ons",
        blurb:
          "More to find and do in any Derpy Conquest game, from any start date.",
      },
    ],
  },
];

export interface DerpyFxPreview {
  trail: string[];
  burst: string[];
  dome: string;
  accent: string;
  shimmer: DomeShimmer;
}

/** Anything the store sells. */
export interface DerpyItem {
  /** Unique across the store: lowercase letters, digits, underscores. */
  name: string;
  game: DerpyGame;
  category: DerpyCategory;
  displayName: string;
  description: string;
  /** Price in Derp Coins. */
  price: number;
  /** Skins: what the pack holds. */
  skins?: DerpySkin[];
  /** AIP (r23): AI personalities: the personality it lets you deal. */
  aiType?: AiType;
  /** Nuke & Dome effects: the colours, for the store's preview. */
  fx?: DerpyFxPreview;
  /** Victory fanfares: the instruments, and how long it plays. */
  fanfare?: { instruments: string; seconds: number };
  /** Owned rows it adds besides "pack:<name>" (for later DLC). */
  grants?: string[];
  /** DLC (r21): Derpy Conquest's items: what they add, and how to use them. */
  conquest?: ConquestItemInfo;
}

// ---- DLC (r21): Derpy Conquest's campaigns, legends and map styles ----

/** What a Derpy Conquest item adds, for the store and the Inventory. */
export interface ConquestItemInfo {
  /** What it brings, a line each. */
  features: string[];
  /** How to use it once it's yours. */
  howTo: string;
  /** Map styles: the colours of the style, for the store's little chart. */
  palette?: { sea: string; land: string; ink: string; accent: string };
}

const MAP_STYLE_TEXT: Record<
  MapStyleKey,
  {
    displayName: string;
    description: string;
    price: number;
    features: string[];
    palette: NonNullable<ConquestItemInfo["palette"]>;
  }
> = {
  antique: {
    displayName: MAP_STYLE_NAMES.antique,
    description:
      "The map as a London engraver would have cut it in copper: sepia ink on cream paper, hatched seas, and each colony's border tinted by hand.",
    price: 1000,
    features: [
      "Sepia ink and cream paper, the seas hatched with the engraver's lines",
      "Colonies tinted along their borders by hand, as the old map-sellers did",
      "Names in an engraver's italic",
    ],
    palette: MAP_STYLE_PALETTES.antique,
  },
  night: {
    displayName: MAP_STYLE_NAMES.night,
    description:
      "The map at night: a dark sea under the stars, the land in shadow, lamplight in every town, and the names picked out in gold.",
    price: 800,
    features: [
      "A night sea and shadowed land, the colonies' colours dimmed",
      "Every town and village lit by its lamps and fires",
      "Names and borders picked out in gold leaf",
    ],
    palette: MAP_STYLE_PALETTES.night,
  },
  pirate: {
    displayName: MAP_STYLE_NAMES.pirate,
    description:
      "A buccaneer's chart, yellowed, stained and burned at the edges: rhumb lines from the compass rose, a sea serpent or two, and the borders in red ink.",
    price: 1200,
    features: [
      "Yellowed, stained parchment with scorched edges",
      "Rhumb lines across the seas from the compass rose",
      "Borders in red ink, and sea serpents in the deep water",
    ],
    palette: MAP_STYLE_PALETTES.pirate,
  },
  woodcut: {
    displayName: MAP_STYLE_NAMES.woodcut,
    description:
      "Bold black lines and flat colour, as if cut from a block of pear wood for a broadside: a printer's map for a printer's age.",
    price: 900,
    features: [
      "Heavy black outlines and flat, few colours",
      "Seas cut in bold wave strokes",
      "The look of a broadside or an almanac's map",
    ],
    palette: MAP_STYLE_PALETTES.woodcut,
  },
};

/** Derpy Conquest's items: the 1776 campaign, Legends, the map styles. */
export const CONQUEST_ITEMS: readonly DerpyItem[] = [
  {
    name: CAMPAIGN_1776,
    game: "conquest",
    category: "startdates", // SITE (r22)
    displayName: "1776: The Revolution",
    description:
      "A new start date: 1 January 1776, with Boston under siege and independence not yet declared. Live through the American Revolution to the Treaty of Paris, as a patriot, a loyalist or neither.",
    price: 4000,
    conquest: {
      features: [
        "Begin on 1 January 1776: the Thirteen Colonies in arms as the United Colonies, while Quebec, Nova Scotia, the Floridas and the West Indies stay with the King as British America",
        "The war's great events as they happened: the Declaration, the fall of New York, Trenton, Saratoga, the French alliance, Valley Forge, Charleston, Yorktown and the peace",
        "Choose your side, and see what each side costs and pays when the war is over",
        "A commission in the Continental Army or a Loyalist regiment, a letter of marque from Congress, spying in a town held by the other side, a seat in Congress",
        "The world runs to the end of 1783",
      ],
      howTo:
        "In Derpy Conquest, host a game and choose 1776 under Begin in. Only the host needs to own it: friends join for free.",
    },
  },
  {
    name: LEGENDS,
    game: "conquest",
    category: "addons", // SITE (r22)
    displayName: "Legends",
    description:
      "The Fountain of Youth, the Seven Cities of Cíbola, the fate of the Lost Colony, Norumbega, Blackbeard's hoard, a lost silver mine, and the sacred places of the native nations. Rumours rarely come, the clues need a master's skill, and the roads are long. Some of it is true, after a fashion.",
    price: 3000,
    conquest: {
      features: [
        "Eight legends of the Americas, each a chain of rumour, clues and a journey",
        "Very hard: the clues need high skills (letters, woodcraft, persuasion, seamanship and more), and each step costs time and money",
        "Rewards that fit, and some that are bittersweet; the Fountain of Youth is the rarest of all",
        // CQ24 (r24): a sacred place may be plundered as well as kept.
        "The native nations' sacred places: earn their people's trust and keep them, or plunder them for what's buried there, and live with what follows",
      ],
      howTo:
        "Rumours of the legends come to your characters in any Derpy Conquest game you play, from any start date. What you've heard and found is in Journal › Legends.",
    },
  },
  ...MAP_STYLES.map((key): DerpyItem => {
    const t = MAP_STYLE_TEXT[key];
    return {
      name: mapStyleItem(key),
      game: "conquest",
      category: "mapstyles",
      displayName: t.displayName,
      description: t.description,
      price: t.price,
      conquest: {
        features: t.features,
        howTo:
          "Choose it in Derpy Conquest's menu › Settings › Map style, or here in the Inventory. Only you see it; it changes nothing in the game.",
        palette: t.palette,
      },
    };
  }),
];
// ---- end DLC (r21)

// CQ24 (r24): items taken off sale, and the Derp Coins each buyer is given
// back (once each, by a startup migration: RetiredRefunds.ts). Hard Winter
// (700 since r21) became the base game's winter, for everyone.
export const RETIRED_ITEM_REFUNDS: Readonly<Record<string, number>> = {
  map_winter: 700,
};

// AIP (r23): the four AI personalities, sold one by one. r24: the owner
// asked for one short line on what each will do, and 750 coins each. The
// engine's tuning (engine-lib/game/AiPersonalityTypes.ts) keeps them true.
const PERSONALITY_PRICE = 750;
const PERSONALITY_TEXT: Record<
  AiType,
  { displayName: string; description: string; price: number }
> = {
  mad_scientist: {
    displayName: "Mad Scientist",
    description:
      "Builds more factories, SAMs, missile silos and Domes of Alden, and nukes its enemies far more often.",
    price: PERSONALITY_PRICE,
  },
  trader: {
    displayName: "Trader",
    description:
      "Builds more factories and ports, keeps to itself (on an island if it can), and rarely starts a fight or turns on an ally.",
    price: PERSONALITY_PRICE,
  },
  aggressive: {
    displayName: "Aggressive",
    description:
      "Moves faster, attacks sooner with less held back at home, builds a bigger army, and turns on allies when it pays.",
    price: PERSONALITY_PRICE,
  },
  protector: {
    displayName: "Protector",
    description:
      "Slow to start and rarely picks a fight, but builds twice the defenses and lots of cities, and hits back with everything when attacked.",
    price: PERSONALITY_PRICE,
  },
};

const FX_TEXT: Record<
  string,
  { displayName: string; description: string; price: number }
> = {
  fx_solar: {
    displayName: "Solar Flare",
    description:
      "Nukes trail sunfire and burst in a ring of flame; your Domes glow amber with slow heat ripples.",
    price: 1500,
  },
  fx_toxic: {
    displayName: "Toxic Sludge",
    description:
      "Acid-green trails and a splatter of glowing embers; your Domes bubble like a vat in a cartoon laboratory.",
    price: 1800,
  },
  fx_frost: {
    displayName: "Frostbite",
    description:
      "Icy trails and a burst of snowflake glints; your Domes freeze into a shimmering lattice of hexagons.",
    price: 2000,
  },
  fx_banana: {
    displayName: "Banana Split",
    description:
      "The Derp Land special: banana-yellow trails, sprinkles for fallout, and Domes that twinkle pink and gold.",
    price: 2500,
  },
  fx_cosmic: {
    displayName: "Cosmic Rift",
    description:
      "Nukes spiral in on violet and cyan strands and burst like a nebula; your Domes ripple with aurora light.",
    price: 3500,
  },
  fx_golden: {
    displayName: "Golden Age",
    description:
      "The grandest look in the store: twin golden spirals, a shower of gilded sparks, and Domes with a slow gleam of polished gold.",
    price: 6000,
  },
};

/** The victory fanfares (their music is made in the browser: Fanfares.ts). */
export const DERPY_FANFARES: readonly DerpyItem[] = [
  {
    name: "fanfare_chiptune",
    displayName: "8-Bit Victory",
    description:
      "A bleepy little level-clear jingle, straight out of the arcade.",
    instruments: "square waves and a noise drum",
    seconds: 4,
    price: 600,
  },
  {
    name: "fanfare_bagpipes",
    displayName: "Highland Pipes",
    description:
      "A skirl of pipes over a steady drone. Heard three hills away.",
    instruments: "bagpipes and drone",
    seconds: 6,
    price: 700,
  },
  {
    name: "fanfare_brass",
    displayName: "Brass Band",
    description: "Trumpets and a big bass drum: the classic hometown parade.",
    instruments: "trumpets, trombone and bass drum",
    seconds: 5,
    price: 800,
  },
  {
    name: "fanfare_steeldrum",
    displayName: "Island Steel",
    description: "Sunny steel pans and a shaker, for wins with a sea breeze.",
    instruments: "steel pans and shaker",
    seconds: 5,
    price: 800,
  },
  {
    name: "fanfare_shanty",
    displayName: "Sea Shanty Chorus",
    description:
      "A crew of voices hauling on the line, with a stamp on every beat.",
    instruments: "a chorus of voices and stamping feet",
    seconds: 7,
    price: 900,
  },
  {
    name: "fanfare_orchestral",
    displayName: "Orchestral Triumph",
    description:
      "Strings swell, horns call, timpani roll: the end credits of an epic.",
    instruments: "strings, horns and timpani",
    seconds: 8,
    price: 1200,
  },
].map(({ instruments, seconds, ...f }) => ({
  ...f,
  game: "derpyfront" as const,
  category: "fanfares" as const,
  fanfare: { instruments, seconds },
}));

function personalityItems(): DerpyItem[] {
  return AI_TYPES.map((type) => {
    const text = PERSONALITY_TEXT[type];
    return {
      name: aiTypeItem(type),
      game: "derpyfront",
      category: "personalities",
      displayName: text.displayName,
      description: text.description,
      price: text.price,
      aiType: type,
    };
  });
}

function fxItem(theme: DerpyFxTheme): DerpyItem {
  const text = FX_TEXT[theme.name];
  return {
    name: theme.name,
    game: "derpyfront",
    category: "effects",
    displayName: text.displayName,
    description: text.description,
    price: text.price,
    fx: {
      trail: theme.trail.colors,
      burst: theme.explosion.colors,
      dome: theme.dome.color,
      accent: theme.dome.accent,
      shimmer: theme.dome.shimmer,
    },
  };
}

/** Everything for sale, skin packs first (their old order), then the rest. */
export const DERPY_ITEMS: readonly DerpyItem[] = [
  ...DERPY_PACKS.map(
    (p): DerpyItem => ({
      name: p.name,
      game: "derpyfront",
      category: "skins",
      displayName: p.displayName,
      description: p.description,
      price: p.price,
      skins: p.skins,
    }),
  ),
  ...personalityItems(),
  ...DERPY_FX_THEMES.map(fxItem),
  ...DERPY_FANFARES,
  ...CONQUEST_ITEMS, // DLC (r21)
];

export function findItem(name: string): DerpyItem | undefined {
  return DERPY_ITEMS.find((i) => i.name === name);
}

/** The derpy_owned rows buying `item` adds. */
export function itemGrants(item: DerpyItem): string[] {
  const rows = [`pack:${item.name}`];
  for (const s of item.skins ?? []) rows.push(`skin:${s.name}`);
  if (item.category === "effects") {
    const theme = DERPY_FX_THEMES.find((t) => t.name === item.name);
    if (theme) {
      for (const n of Object.values(fxEffectNames(theme))) {
        rows.push(`effect:${n}`);
      }
      rows.push(`dome:${theme.name}`);
    }
  }
  rows.push(...(item.grants ?? []));
  return rows;
}

/** AIP (r23): the AI personalities an owner of `owned` may deal. */
export function ownedAiTypes(owned: readonly string[]): AiType[] {
  return AI_TYPES.filter((t) => owned.includes(`pack:${aiTypeItem(t)}`));
}

/**
 * AIP (r23): r21's AI personality packs, no longer sold. Whoever owns any of
 * them is given all four personalities (DerpyDb's startup migration); a row
 * for one still in an inventory is simply not shown.
 */
export const RETIRED_PERSONALITY_PACKS: readonly string[] =
  AI_PERSONALITY_PACKS.map((p) => p.id);

/** AIP (r23): the owned rows that everyone with an old pack is given. */
export const PERSONALITY_GRANTS: readonly string[] = AI_TYPES.map(
  (t) => `pack:${aiTypeItem(t)}`,
);

/**
 * The store as an OpenFront cosmetics catalog, so the game's own pipelines
 * (join checks, rendering, the skin picker, the effects grid) can use it
 * unchanged: the skins, and the nuke trails and bursts of the effect packs.
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
  const nukeTrail: Record<string, unknown> = {};
  const nukeExplosion: Record<string, unknown> = {};
  for (const theme of DERPY_FX_THEMES) {
    const names = fxEffectNames(theme);
    nukeTrail[names.nukeTrail] = {
      name: names.nukeTrail,
      product: null,
      rarity: "rare",
      effectType: "nukeTrail",
      attributes: theme.trail,
    };
    for (const nukeType of ["atom", "hydro", "mirvWarhead"] as const) {
      nukeExplosion[names[nukeType]] = {
        name: names[nukeType],
        product: null,
        rarity: "rare",
        effectType: "nukeExplosion",
        attributes: fxExplosionAttributes(theme, nukeType),
      };
    }
  }
  return {
    patterns: {},
    flags: {},
    skins,
    effects: { nukeTrail, nukeExplosion } as Cosmetics["effects"],
  };
}
