// PROFILE (r26): Derp Land's badges. Milestones across the site, earned from
// what the server already keeps (games, challenges, dynasties, friends),
// checked and kept on the server (src/server/derpy/DerpyBadges.ts) and
// shown on profiles, where a player may pin up to three beside their name.
// Shared by the server and the pages: names, rules and looks, nothing else.

export type BadgeTier = "bronze" | "silver" | "gold";

export type BadgeGroup =
  | "front"
  | "scenarios"
  | "challenges"
  | "conquest"
  | "land";

/** The picture in a badge's medal (src/derpland/BadgeArt.ts draws them). */
export type BadgeGlyph =
  | "crown"
  | "crowns"
  | "helmet"
  | "flag"
  | "shield"
  | "swords"
  | "chess"
  | "star"
  | "map"
  | "coins"
  | "nuke"
  | "skull"
  | "people"
  | "scroll"
  | "hourglass"
  | "globe"
  | "target"
  | "calendar"
  | "calendars"
  | "streak"
  | "candle"
  | "tree"
  | "oak"
  | "medal"
  | "medals"
  | "axe"
  | "cabin"
  | "steeple"
  | "handshake"
  | "partyflag"
  | "dice"
  | "megaphone"
  | "stall"
  | "twin"
  | "cake";

export interface BadgeDef {
  key: string;
  name: string;
  /** One plain line on how it's earned. */
  how: string;
  tier: BadgeTier;
  group: BadgeGroup;
  glyph: BadgeGlyph;
  /** A count to reach: the profile shows how far along an unearned one is. */
  goal?: number;
}

export const BADGE_GROUPS: readonly { id: BadgeGroup; name: string }[] = [
  { id: "front", name: "DerpyFront" },
  { id: "scenarios", name: "Scenarios" },
  { id: "challenges", name: "Weekly challenges" },
  { id: "conquest", name: "Derpy Conquest" },
  { id: "land", name: "Derp Land" },
];

export const BADGES: readonly BadgeDef[] = [
  // ---- DerpyFront
  {
    key: "df-first-win",
    name: "First Victory",
    how: "Win a game of DerpyFront.",
    tier: "bronze",
    group: "front",
    glyph: "crown",
  },
  {
    key: "df-games-10",
    name: "Regular",
    how: "Finish 10 games of DerpyFront.",
    tier: "bronze",
    group: "front",
    glyph: "flag",
    goal: 10,
  },
  {
    key: "df-mvp",
    name: "Most Valuable",
    how: "Be named MVP at the end of a game of DerpyFront.",
    tier: "bronze",
    group: "front",
    glyph: "star",
  },
  {
    key: "df-nuke",
    name: "Mushroom Cloud",
    how: "Launch a nuke in DerpyFront.",
    tier: "bronze",
    group: "front",
    glyph: "nuke",
  },
  {
    key: "df-team-win",
    name: "Team Player",
    how: "Win a team game of DerpyFront.",
    tier: "bronze",
    group: "front",
    glyph: "people",
  },
  {
    key: "df-wins-10",
    name: "Ten Crowns",
    how: "Win 10 games of DerpyFront.",
    tier: "silver",
    group: "front",
    glyph: "crowns",
    goal: 10,
  },
  {
    key: "df-hard-win",
    name: "Hard Won",
    how: "Win a game of DerpyFront on Hard or Impossible.",
    tier: "silver",
    group: "front",
    glyph: "swords",
  },
  {
    key: "df-ai-win",
    name: "Mind Games",
    how: "Win a game of DerpyFront against AI nations with personalities.",
    tier: "silver",
    group: "front",
    glyph: "chess",
  },
  {
    key: "df-land-50",
    name: "Half the Map",
    how: "Hold half the map's land at once in DerpyFront.",
    tier: "silver",
    group: "front",
    glyph: "map",
  },
  {
    key: "df-gold-5m",
    name: "Gold Rush",
    how: "Earn 5 million gold in one game of DerpyFront.",
    tier: "silver",
    group: "front",
    glyph: "coins",
  },
  {
    key: "df-conquests-25",
    name: "Conqueror",
    how: "Wipe out 25 players, nations or bots in DerpyFront, all games together.",
    tier: "silver",
    group: "front",
    glyph: "skull",
    goal: 25,
  },
  {
    key: "df-wins-50",
    name: "Warlord",
    how: "Win 50 games of DerpyFront.",
    tier: "gold",
    group: "front",
    glyph: "helmet",
    goal: 50,
  },
  {
    key: "df-games-100",
    name: "Centurion",
    how: "Finish 100 games of DerpyFront.",
    tier: "gold",
    group: "front",
    glyph: "shield",
    goal: 100,
  },
  // ---- Scenarios
  {
    key: "sc-first-win",
    name: "Rewriting History",
    how: "Win a DerpyFront scenario.",
    tier: "bronze",
    group: "scenarios",
    glyph: "scroll",
  },
  {
    key: "sc-all-played",
    name: "Time Traveller",
    how: "Play every DerpyFront scenario.",
    tier: "silver",
    group: "scenarios",
    glyph: "hourglass",
  },
  {
    key: "sc-all-wins",
    name: "History Buff",
    how: "Win every DerpyFront scenario.",
    tier: "gold",
    group: "scenarios",
    glyph: "globe",
  },
  // ---- Weekly challenges
  {
    key: "ch-first",
    name: "Challenger",
    how: "Finish a weekly challenge.",
    tier: "bronze",
    group: "challenges",
    glyph: "target",
  },
  {
    key: "ch-full-week",
    name: "Full Week",
    how: "Finish all three of a game's weekly challenges in one week.",
    tier: "silver",
    group: "challenges",
    glyph: "calendar",
  },
  {
    key: "ch-both-games",
    name: "Double Duty",
    how: "Finish all six weekly challenges, both games' three, in one week.",
    tier: "gold",
    group: "challenges",
    glyph: "calendars",
  },
  {
    key: "ch-weeks-10",
    name: "Ten Weeks",
    how: "Finish weekly challenges in 10 different weeks.",
    tier: "gold",
    group: "challenges",
    glyph: "streak",
    goal: 10,
  },
  // ---- Derpy Conquest
  {
    key: "cq-first-life",
    name: "A Life Lived",
    how: "Finish a life in Derpy Conquest: see your heir take over, or play a game to its end.",
    tier: "bronze",
    group: "conquest",
    glyph: "candle",
  },
  {
    key: "cq-win",
    name: "Crowned in the Colonies",
    how: "Win a game of Derpy Conquest.",
    tier: "bronze",
    group: "conquest",
    glyph: "crown",
  },
  {
    key: "cq-hours-5",
    name: "Settler",
    how: "Play Derpy Conquest for 5 hours.",
    tier: "bronze",
    group: "conquest",
    glyph: "axe",
    goal: 5,
  },
  {
    key: "cq-dynasty-3",
    name: "Dynasty",
    how: "Keep one family going for 3 generations in a game of Derpy Conquest.",
    tier: "silver",
    group: "conquest",
    glyph: "tree",
    goal: 3,
  },
  {
    key: "cq-achievement",
    name: "Hard Earned",
    how: "Earn an overall Derpy Conquest achievement (they're earned on Hard).",
    tier: "silver",
    group: "conquest",
    glyph: "medal",
  },
  {
    key: "cq-hours-25",
    name: "Homesteader",
    how: "Play Derpy Conquest for 25 hours.",
    tier: "silver",
    group: "conquest",
    glyph: "cabin",
    goal: 25,
  },
  {
    key: "cq-dynasty-5",
    name: "Old Blood",
    how: "Keep one family going for 5 generations in a game of Derpy Conquest.",
    tier: "gold",
    group: "conquest",
    glyph: "oak",
    goal: 5,
  },
  {
    key: "cq-achievements-10",
    name: "Decorated",
    how: "Earn 10 overall Derpy Conquest achievements.",
    tier: "gold",
    group: "conquest",
    glyph: "medals",
    goal: 10,
  },
  {
    key: "cq-hours-100",
    name: "Pillar of the Colony",
    how: "Play Derpy Conquest for 100 hours.",
    tier: "gold",
    group: "conquest",
    glyph: "steeple",
    goal: 100,
  },
  // ---- Derp Land
  {
    key: "dl-friend",
    name: "Buddy",
    how: "Make a friend on Derp Land.",
    tier: "bronze",
    group: "land",
    glyph: "handshake",
  },
  {
    key: "dl-party",
    name: "Party Up",
    how: "Be in a party with someone else.",
    tier: "bronze",
    group: "land",
    glyph: "partyflag",
  },
  {
    key: "dl-news",
    name: "Well Informed",
    how: "Read What's New.",
    tier: "bronze",
    group: "land",
    glyph: "megaphone",
  },
  {
    key: "dl-shopper",
    name: "Shopper",
    how: "Buy something in the Derp Store.",
    tier: "bronze",
    group: "land",
    glyph: "stall",
  },
  {
    key: "dl-both-games",
    name: "Double Life",
    how: "Finish a game of DerpyFront and a game of Derpy Conquest.",
    tier: "bronze",
    group: "land",
    glyph: "twin",
  },
  {
    key: "dl-friends-5",
    name: "Popular",
    how: "Have 5 friends on Derp Land.",
    tier: "silver",
    group: "land",
    glyph: "people",
    goal: 5,
  },
  {
    key: "dl-played-together",
    name: "Party Played",
    how: "Finish a game with a friend in it.",
    tier: "silver",
    group: "land",
    glyph: "dice",
  },
  {
    key: "dl-year",
    name: "Old Hand",
    how: "Have a Derp Land account for a year.",
    tier: "silver",
    group: "land",
    glyph: "cake",
  },
];

export const BADGE_BY_KEY: ReadonlyMap<string, BadgeDef> = new Map(
  BADGES.map((b) => [b.key, b]),
);

/** The most badges a player may pin beside their name. */
export const PIN_MAX = 3;

export const TIER_NAMES: Record<BadgeTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

/** A badge a player has, and when they first had it (ISO). */
export interface EarnedBadge {
  key: string;
  at: string;
}

/** A player's badges, as their profile shows them. */
export interface PlayerBadges {
  earned: EarnedBadge[];
  /** Pinned beside their name, in their order (earned ones only). */
  pinned: string[];
  /** How far along the counted ones are: [have, of]. */
  progress: Record<string, [number, number]>;
}

/** The signed-in player's own badges, for the bar's toast and the pins. */
export interface MyBadges {
  earned: EarnedBadge[];
  pinned: string[];
  /** Earned and not yet shown in a toast. */
  fresh: string[];
}

/** Keeps the keys that are badges, earned, once each, at most PIN_MAX. */
export function cleanPins(
  keys: readonly unknown[],
  earned: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const k of keys) {
    if (typeof k !== "string" || !BADGE_BY_KEY.has(k) || !earned.has(k))
      continue;
    if (!out.includes(k)) out.push(k);
    if (out.length === PIN_MAX) break;
  }
  return out;
}
