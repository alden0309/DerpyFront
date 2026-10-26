// MAP (r12): achievements. Fifty-odd marks of a life (or a line) across
// every system: work and trade, house and family, letters and tongues,
// office, wealth, the road and the sea, arms and the law, the native
// peoples' own paths, the seasons, and the long game. Each is earned once
// in a game (and noted in the journal); the server pays a few Derp Coins
// for it the first time an account earns it, and never again, so replaying
// can't farm them. The checks only read the state, so they're cheap enough
// to run every day and after every command.
//
// CQACH (r22): over a hundred, and two kinds of each:
// - this game's: earned in the game you're playing (Life.achieved), shown in
//   it, and paid in it on any difficulty, PLAY_PAY.achievementTimes its
//   account coins, with the line's coins (Coins.ts), so held to the time
//   played like them;
// - overall: your account's, across all your games, paid once per account,
//   and from now on earned only in a game on the hardest difficulty
//   (OVERALL_DIFFICULTY; the server checks it). Those earned before stay.
// Some are hard, some rare, a few secret (hidden until earned), and those of
// the store's add-ons (the 1776 campaign, Legends) come only to their owners.
// The counts some wait on are kept here (achCount): the trades worked, the
// duels won, the expeditions home; and a few by the systems that know (the
// dice, the cards), each in a marked block.

import { CAMPAIGN_1776, LEGENDS } from "../DlcIds"; // CQACH (r22)
import { dateOf } from "./Calendar";
import { isCampaign } from "./Campaign1776Core"; // CQACH (r22)
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { journal, milestone, touchLife } from "./LifeCore";
import { lifeIsNative, meOf, officesOf } from "./LifeQueries";
import { JOBS, PLAY_PAY } from "./LifeRules"; // CQACH (r22)
import { isWinter } from "./Map";
import { ageOf } from "./Queries";
import { isNorth } from "./Seasons";
import { achievementText } from "./StoryCore"; // STORY (r17)
import { LEVEL_POINTS, lifeTonguePoints, motherTongue } from "./Tongues";
// CQTUT (r26)
import {
  FIRST_LIFE,
  FIRST_LIFE_COINS,
  TUT_EARN_DONE,
  TUT_STEP_COUNT,
  tutEarned,
} from "./TutorialCore";
import type {
  Difficulty,
  JobKind,
  Life,
  LifeMilestone,
  RefitKey,
} from "./Types";

export type AchievementGroup =
  | "work"
  | "home"
  | "society"
  | "office"
  | "wealth"
  | "travel"
  | "arms"
  | "native"
  | "seasons"
  | "time"
  // CQACH (r22)
  | "business"
  | "ships"
  | "tavern"
  | "revolution"
  | "campaign"
  | "legends";

export const ACHIEVEMENT_GROUPS: { id: AchievementGroup; name: string }[] = [
  { id: "work", name: "Work and trade" },
  { id: "business", name: "Businesses and partnerships" }, // CQACH (r22)
  { id: "home", name: "House and family" },
  { id: "society", name: "Society, letters and tongues" },
  { id: "tavern", name: "The tavern's games" }, // CQACH (r22)
  { id: "office", name: "Office and power" },
  { id: "revolution", name: "Breaking with the crown" }, // CQACH (r22)
  { id: "wealth", name: "Wealth" },
  { id: "travel", name: "The road and the sea" },
  { id: "ships", name: "Ships and crews" }, // CQACH (r22)
  { id: "arms", name: "Arms and the law" },
  { id: "native", name: "The peoples' own paths" },
  { id: "seasons", name: "The seasons" },
  { id: "time", name: "The long game" },
  // CQACH (r22): the store's add-ons, for their owners.
  { id: "campaign", name: "1776: The Revolution" },
  { id: "legends", name: "Legends" },
];

/** CQACH (r22): the store's add-ons an achievement may belong to. */
export type AchievementDlc = typeof CAMPAIGN_1776 | typeof LEGENDS;

export interface AchievementDef {
  key: string;
  name: string;
  /** How it's earned, as the page tells it. */
  how: string;
  /**
   * Derp Coins it pays the first time an account earns it (overall, on the
   * hardest difficulty). CQACH (r22): in a game, it pays this many times
   * PLAY_PAY.achievementTimes (gameCoins).
   */
  coins: number;
  group: AchievementGroup;
  check: (g: ConquestGame, life: Life) => boolean;
  /** A dearer check (it looks through the world): weekly, and after commands. */
  slow?: boolean;
  /** CQACH (r22): hidden until earned: its name and how aren't shown. */
  secret?: true;
  /** CQACH (r22): "hard" (a long road), or "rare" (few lines will ever see it). */
  tier?: "hard" | "rare";
  /** CQACH (r22): an add-on's: shown to, and earned by, only its owners. */
  dlc?: AchievementDlc;
  /**
   * CQTUT (r26): the account's alone: its coins are paid onto the account
   * once, on any difficulty, and nothing in the game (so earning it again
   * pays nothing). The first life's lessons.
   */
  account?: true;
}

/** MAP (r12): counts kept for achievements (days at sea, days on a winter road). */
export function achCount(life: Life, key: string): number {
  return life.achCount?.[key] ?? 0;
}

const prop = (life: Life, kind: string) =>
  (life.property ?? []).some((p) => p.kind === kind);
const jobIs = (life: Life, kind: string, rank = 0) =>
  life.job?.kind === kind && life.job.rank >= rank;
const milestoneLike = (life: Life, re: RegExp) =>
  life.milestones.some((m) => re.test(m.text));
const friends = (life: Life) =>
  Object.values(life.ties).filter((t) => t === "friend").length;

// ---------------------------------------------------------------- CQACH (r22): what the new ones read

/** A character of this line (any generation). */
const ofLine = (l: Life, c: number) => c >= 0 && l.line.includes(c);
/** Moments of a kind in the line's story, all told (LifeTally.kinds). */
const kindCount = (l: Life, kind: string) => l.tally.kinds?.[kind] ?? 0;
/** Keys counted under a prefix ("job:" for the trades worked). */
const keysUnder = (l: Life, prefix: string) =>
  Object.keys(l.achCount ?? {}).filter((k) => k.startsWith(prefix)).length;
const businesses = (l: Life) =>
  (l.property ?? []).filter((p) => p.kind === "business");
/** Firms with a character of this line among the partners. */
const firmsOf = (g: ConquestGame, l: Life) =>
  (g.s.partners?.firms ?? []).filter((f) =>
    f.partners.some((p) => ofLine(l, p.c)),
  );
const boats = (l: Life) => l.boats ?? [];
const REFITS: RefitKey[] = ["copper", "sails", "guns", "cabins"];
const OFFICERS = ["captain", "mate", "navigator", "surgeon", "bosun"];
/** The underworld's trades (and the pirate's), whose top rung is a secret one. */
const CROOKED: JobKind[] = [
  "thief",
  "fence",
  "smuggler",
  "highwayman",
  "counterfeiter",
  "pirate",
];
/** The road to the governor's chair, step by step (ChairCore's). */
const ROAD = ["name", "county", "court", "house", "council", "lt", "governor"];
/** A colony that broke with the crown (not the 1776 campaign's own war). */
const revs = (g: ConquestGame) =>
  isCampaign(g.s)
    ? []
    : g.s.nations.flatMap((n) => (n.desk?.rev ? [n.desk.rev] : []));
const legendsFound = (l: Life) =>
  (l.legends?.list ?? []).filter((x) => x.found !== undefined).length;

/** CQACH (r22): whether a seat's account owns an add-on (the server marks the life). */
export function ownsDlc(life: Life, dlc: AchievementDlc): boolean {
  return dlc === LEGENDS ? !!life.dlc?.legends : !!life.dlc?.campaign1776;
}

/** Tongues spoken at least conversationally, beyond the one you were born to. */
function secondTongues(g: ConquestGame, life: Life): number {
  const me = meOf(g.s, life);
  if (!me) return 0;
  const mother = motherTongue(me.culture);
  return Object.entries(lifeTonguePoints(g.s, g.map, life)).filter(
    ([t, v]) => t !== mother && v >= 2 * LEVEL_POINTS,
  ).length;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ---- work and trade
  {
    key: "first-job",
    name: "An honest living",
    how: "Take up your first work.",
    coins: 1,
    group: "work",
    check: (g, l) => l.tally.jobs >= 1 || !!l.job,
  },
  {
    key: "promoted",
    name: "Up a rung",
    how: "Win your first promotion.",
    coins: 2,
    group: "work",
    check: (g, l) => l.tally.promotions >= 1,
  },
  {
    key: "top-rung",
    name: "Master of the trade",
    how: "Climb to the fourth rung of any trade's ladder.",
    coins: 5,
    group: "work",
    tier: "hard", // CQACH (r22)
    check: (g, l) => l.tally.topRank >= 3,
  },
  {
    key: "business",
    name: "Your own master",
    how: "Own a business with hands of your own.",
    coins: 4,
    group: "business", // CQACH (r22): was work
    check: (g, l) => prop(l, "business"),
  },
  {
    key: "people",
    name: "In your service",
    how: "Hire someone into your service: a clerk, a hand, a sword, a guide.",
    coins: 2,
    group: "work",
    check: (g, l) => (l.people ?? []).length >= 1,
  },
  {
    key: "earned",
    name: "Two hundred and fifty",
    how: "Earn 250 coins over a life (or a line).",
    coins: 2,
    group: "work",
    check: (g, l) => l.tally.earned >= 250,
  },
  // ---- house and family
  {
    key: "house",
    name: "A roof of your own",
    how: "Own a house.",
    coins: 2,
    group: "home",
    check: (g, l) => prop(l, "house"),
  },
  {
    key: "mansion",
    name: "The big house",
    how: "Own a house of the third size or grander (a manor, a mansion; a great lodge).",
    coins: 4,
    group: "home",
    check: (g, l) =>
      (l.property ?? []).some((p) => p.kind === "house" && p.level >= 3),
  },
  {
    key: "land",
    name: "Landed",
    how: "Own land of your own.",
    coins: 2,
    group: "home",
    check: (g, l) => prop(l, "land"),
  },
  {
    key: "married",
    name: "Wed",
    how: "Marry.",
    coins: 2,
    group: "home",
    check: (g, l) => l.tally.marriages >= 1,
  },
  {
    key: "child",
    name: "A child is born",
    how: "Have a child.",
    coins: 2,
    group: "home",
    check: (g, l) => l.tally.children >= 1,
  },
  {
    key: "quiverful",
    name: "A quiverful",
    how: "Have five children.",
    coins: 4,
    group: "home",
    check: (g, l) => l.tally.children >= 5,
  },
  {
    key: "heir",
    name: "The line goes on",
    how: "Go on as your heir when your character dies.",
    coins: 4,
    group: "home",
    check: (g, l) => l.tally.generations >= 2,
  },
  {
    key: "dynasty",
    name: "A dynasty",
    how: "Play three generations of one family.",
    coins: 6,
    group: "home",
    tier: "hard", // CQACH (r22)
    check: (g, l) => l.tally.generations >= 3,
  },
  {
    key: "old-age",
    name: "Threescore and ten",
    how: "Live to seventy.",
    coins: 4,
    group: "home",
    tier: "hard", // CQACH (r22)
    slow: true,
    check: (g, l) => {
      const me = meOf(g.s, l);
      return !!me && ageOf(g.s, me) >= 70;
    },
  },
  // ---- society, letters and tongues
  {
    key: "letter",
    name: "Your humble servant",
    how: "Send your first letter.",
    coins: 1,
    group: "society",
    slow: true,
    check: (g, l) => (l.post ?? []).some((x) => x.from === l.c),
  },
  {
    key: "tongue",
    name: "A second tongue",
    how: "Speak a tongue besides your own, at least conversationally.",
    coins: 2,
    group: "society",
    slow: true,
    check: (g, l) => secondTongues(g, l) >= 1,
  },
  {
    key: "tongues",
    name: "Many tongues",
    how: "Speak three tongues besides your own.",
    coins: 5,
    group: "society",
    tier: "hard", // CQACH (r22)
    slow: true,
    check: (g, l) => secondTongues(g, l) >= 3,
  },
  {
    key: "friends",
    name: "Friends in need",
    how: "Have three friends at once.",
    coins: 1,
    group: "society",
    check: (g, l) => friends(l) >= 3,
  },
  {
    key: "host",
    name: "The host",
    how: "Give a gathering of your own (a dinner, a frolic, a feast, a ball).",
    coins: 2,
    group: "society",
    slow: true,
    check: (g, l) =>
      (g.s.society?.gatherings ?? []).some(
        (x) => x.host === l.c && (x.status === "held" || x.status === "on"),
      ),
  },
  {
    key: "renown",
    name: "A name in the country",
    how: "Reach 50 renown.",
    coins: 2,
    group: "society",
    check: (g, l) => l.tally.peakRenown >= 50,
  },
  {
    key: "famous",
    name: "Famous",
    // POLLS (r16): 100, not 150: above 60 renown comes harder now.
    how: "Reach 100 renown.",
    coins: 5,
    group: "society",
    tier: "hard", // CQACH (r22)
    check: (g, l) => l.tally.peakRenown >= 100,
  },
  {
    key: "patron",
    name: "A friend at court",
    how: "Win a patron who speaks for you.",
    coins: 2,
    group: "society",
    check: (g, l) => l.patron >= 0,
  },
  {
    key: "cause",
    name: "The cause",
    how: "Join (or found) a movement.",
    coins: 2,
    group: "society",
    slow: true,
    check: (g, l) =>
      g.s.movements.some((m) => m.leader === l.c || m.members.includes(l.c)),
  },
  // DICE (r14): Liar's dice in the tavern (counted by Dice.ts).
  {
    key: "dice-last",
    name: "Down to the last die",
    how: "Win a game of Liar's dice with one die left under your cup.",
    coins: 2,
    group: "tavern", // CQACH (r22): was society
    check: (_g, l) => achCount(l, "dice-last") > 0,
  },
  {
    key: "dice-full",
    name: "The whole table",
    how: "Win a game of Liar's dice against five others.",
    coins: 2,
    group: "tavern", // CQACH (r22): was society
    check: (_g, l) => achCount(l, "dice-full") > 0,
  },
  // ---- office and power
  {
    key: "local-office",
    name: "A local man",
    how: "Hold an office: in your county, your town, the assembly, the council.",
    coins: 2,
    group: "office",
    slow: true,
    check: (g, l) => l.tally.topOffice >= 1 || officesOf(g.s, l.c).length > 0,
  },
  {
    key: "assembly",
    name: "Elected",
    how: "Sit in your colony's assembly (or at the council fire).",
    coins: 4,
    group: "office",
    // FIXES (r15): won at a poll (or sitting in the house), not just any
    // office: an appointment to the council paid "Elected" before.
    check: (g, l) =>
      l.tally.elections > 0 ||
      officesOf(g.s, l.c).some((o) => o.kind === "assembly"),
  },
  {
    key: "council",
    name: "On the council",
    how: "Sit on the governor's council (or the nation's).",
    coins: 5,
    group: "office",
    check: (g, l) => l.tally.topOffice >= 2,
  },
  {
    key: "governor",
    name: "His Excellency",
    how: "Become governor of a colony (or sachem of a nation).",
    coins: 6,
    group: "office",
    tier: "hard", // CQACH (r22)
    check: (g, l) => l.tally.topOffice >= 3,
  },
  {
    key: "founder",
    name: "Founder",
    how: "Found a settlement (or a colony of your own).",
    coins: 6,
    group: "office",
    slow: true,
    check: (g, l) => milestoneLike(l, /^Founded /),
  },
  {
    key: "rising",
    name: "The world turned upside down",
    how: "Win a rising.",
    coins: 6,
    group: "revolution", // CQACH (r22): was office
    tier: "rare", // CQACH (r22)
    check: (g, l) => l.tally.risingsWon >= 1,
  },
  // ---- wealth
  {
    key: "purse",
    name: "A full purse",
    how: "Have 100 coins in your purse.",
    coins: 2,
    group: "wealth",
    check: (g, l) => l.tally.peakPurse >= 100,
  },
  {
    key: "fortune",
    name: "A fortune",
    how: "Have 1,000 coins in your purse.",
    coins: 6,
    group: "wealth",
    tier: "hard", // CQACH (r22)
    check: (g, l) => l.tally.peakPurse >= 1000,
  },
  {
    key: "venture",
    name: "Venturer",
    how: "Put money out to work: a cargo ventured, or shares in a company.",
    coins: 2,
    group: "wealth",
    check: (g, l) => (l.ventures ?? []).length > 0,
  },
  {
    key: "carriage",
    name: "Carriage folk",
    how: "Keep a carriage.",
    coins: 2,
    group: "wealth",
    check: (g, l) => l.kit?.carriage !== undefined,
  },
  {
    key: "pay-dirt",
    name: "Pay dirt",
    how: "Work a lead and find what it promised.",
    coins: 4,
    group: "wealth",
    check: (g, l) =>
      (l.leads ?? []).some((x) => x.status === "found" || x.status === "done"),
  },
  // ---- the road and the sea
  {
    key: "sea-legs",
    name: "Sea legs",
    how: "Put to sea.",
    coins: 1,
    group: "travel",
    check: (g, l) => achCount(l, "sea") >= 1,
  },
  {
    key: "boat",
    name: "Master and owner",
    how: "Own a boat.",
    coins: 2,
    group: "ships", // CQACH (r22): was travel
    check: (g, l) => (l.boats ?? []).length >= 1,
  },
  {
    key: "ship",
    name: "A ship of your own",
    how: "Own a brig or a full-rigged ship.",
    coins: 5,
    group: "ships", // CQACH (r22): was travel
    tier: "hard", // CQACH (r22)
    check: (g, l) =>
      (l.boats ?? []).some((b) => b.kind === "brig" || b.kind === "ship"),
  },
  {
    key: "far",
    name: "Far and wide",
    how: "Visit twenty-five provinces.",
    coins: 2,
    group: "travel",
    check: (g, l) => l.visited.length >= 25,
  },
  {
    key: "europe",
    name: "The old country",
    how: "Go to Europe.",
    coins: 4,
    group: "travel",
    check: (g, l) => l.tally.europe !== null,
  },
  {
    key: "expedition",
    name: "Into the unknown",
    how: "Lead an expedition for your nation.",
    coins: 5,
    group: "travel",
    slow: true,
    check: (g, l) =>
      l.c >= 0 &&
      g.s.nations.some((n) => n.missions.some((m) => m.leader === l.c)),
  },
  // ---- arms and the law
  {
    key: "battle",
    name: "Victory",
    how: "Win a battle.",
    coins: 4,
    group: "arms",
    check: (g, l) => l.tally.battlesWon >= 1,
  },
  {
    key: "duel",
    name: "Satisfaction",
    how: "Win a duel.",
    coins: 4,
    group: "arms",
    slow: true,
    check: (g, l) =>
      milestoneLike(l, /won a duel|beat .* in a duel/i) ||
      ((l.tally as { duelsWon?: number }).duelsWon ?? 0) >= 1 ||
      achCount(l, "duel-won") >= 1, // CQACH (r22): counted as they're won
  },
  {
    key: "company",
    name: "Your own company",
    how: "Raise a company of your own.",
    coins: 4,
    group: "arms",
    check: (g, l) => !!l.company,
  },
  {
    key: "scars",
    name: "Scars",
    how: "Be wounded, and live.",
    coins: 1,
    group: "arms",
    check: (g, l) => l.tally.wounds >= 1,
  },
  {
    key: "outlaw",
    name: "Wanted",
    how: "Make a name in the underworld (25 notoriety).",
    coins: 2,
    group: "arms",
    check: (g, l) => (l.crime?.notoriety ?? 0) >= 25,
  },
  // ---- the peoples' own paths
  {
    key: "war-honours",
    name: "War honours",
    how: "Rise to the second rank of warriors.",
    coins: 4,
    group: "native",
    check: (g, l) => jobIs(l, "warrior", 2),
  },
  {
    key: "healer",
    name: "Medicine",
    how: "Take up the healer's way.",
    coins: 2,
    group: "native",
    check: (g, l) => jobIs(l, "healer"),
  },
  {
    key: "go-between",
    name: "Between two worlds",
    how: "Work as an interpreter between the peoples.",
    coins: 4,
    group: "native",
    check: (g, l) => jobIs(l, "interpreter"),
  },
  {
    key: "gifts",
    name: "Gifts at the fire",
    how: "Lay gifts before a native nation's council.",
    coins: 2,
    group: "native",
    check: (g, l) => l.cooldowns.present !== undefined,
  },
  {
    key: "sachem-voice",
    name: "A voice at the fire",
    how: "As one of the peoples, speak at your nation's council fire (or sit as sachem).",
    coins: 4,
    group: "native",
    slow: true,
    check: (g, l) => lifeIsNative(g.s, l) && l.tally.topOffice >= 1,
  },
  // ---- the seasons
  {
    key: "harvest",
    name: "Harvest home",
    how: "Help bring in the harvest (at the fields, in September or October).",
    coins: 1,
    group: "seasons",
    check: (g, l) => l.cooldowns["act:harvest"] !== undefined,
  },
  {
    key: "winter-road",
    name: "Through the snow",
    how: "Spend ten days on the roads of a northern winter.",
    coins: 2,
    group: "seasons",
    check: (g, l) => achCount(l, "winterRoad") >= 10,
  },
  {
    key: "storm",
    name: "Rode out the storm",
    how: "Meet a hurricane at sea, and live.",
    coins: 2,
    group: "seasons",
    check: (g, l) => l.cooldowns["ev:trv-hurricane"] !== undefined,
  },
  // ---- the long game
  {
    key: "decade",
    name: "A decade",
    how: "Live ten years in the game.",
    coins: 2,
    group: "time",
    check: (g, l) => l.tally.days >= 3650,
  },
  {
    key: "half-century",
    name: "Half a century",
    how: "Live fifty years in the game (a line counts).",
    coins: 5,
    group: "time",
    tier: "rare", // CQACH (r22)
    check: (g, l) => l.tally.days >= 18250,
  },
  {
    key: "ambition",
    name: "Ambition fulfilled",
    how: "Fulfil an ambition you set yourself.",
    coins: 2,
    group: "time",
    check: (g, l) => (l.tally.ambitions ?? 0) >= 1,
  },
  {
    key: "1776",
    name: "Seventy-six",
    how: "Be alive in 1776.",
    coins: 6,
    group: "time",
    check: (g, l) => dateOf(g.s.day).year >= 1776,
  },
  ...newAchievements(), // CQACH (r22)
  // CQTUT (r26): the first life's lessons, to the end (Tutorial.ts).
  {
    key: FIRST_LIFE,
    name: "First life",
    how: `Finish the first life's lessons, skipping no more than ${TUT_STEP_COUNT - TUT_EARN_DONE} of them.`,
    coins: FIRST_LIFE_COINS,
    group: "time",
    account: true,
    check: (g, l) => tutEarned(l.tut),
  },
];

/**
 * CQACH (r22): the new ones, across what the game has grown to since: jobs
 * and trades, businesses and partnerships, ships and crews, expeditions and
 * new nations, governors and assemblies, breaking with the crown, duels,
 * the tavern's games, travel, family, and the store's add-ons.
 */
function newAchievements(): AchievementDef[] {
  return [
    // ---- work and trade
    {
      key: "trades-five",
      name: "Jack of all trades",
      how: "Work at five different trades in one line.",
      coins: 3,
      group: "work",
      check: (g, l) => keysUnder(l, "job:") >= 5,
    },
    {
      key: "two-trades",
      name: "Two ladders climbed",
      how: "Reach the third rung of two different trades.",
      coins: 5,
      group: "work",
      tier: "hard",
      check: (g, l) => keysUnder(l, "rung:") >= 2,
    },
    {
      key: "general",
      name: "General",
      how: "Rise to general, the top of the army's eight rungs.",
      coins: 8,
      group: "work",
      tier: "rare",
      check: (g, l) => jobIs(l, "soldier", JOBS.soldier.ranks.length - 1),
    },
    {
      key: "underworld-top",
      name: "King of the underworld",
      how: "Rise to the top of a crooked trade: gang boss, kingpin, smuggling master, captain of the road, master forger or pirate commodore.",
      coins: 6,
      group: "work",
      secret: true,
      check: (g, l) =>
        !!l.job &&
        CROOKED.includes(l.job.kind) &&
        l.job.rank >= JOBS[l.job.kind].ranks.length - 1,
    },
    // ---- businesses and partnerships
    {
      key: "three-concerns",
      name: "Three concerns",
      how: "Own three businesses at once.",
      coins: 4,
      group: "business",
      check: (g, l) => businesses(l).length >= 3,
    },
    {
      key: "great-concern",
      name: "A great concern",
      how: "Own a business of the largest size.",
      coins: 4,
      group: "business",
      check: (g, l) => businesses(l).some((p) => p.level >= 3),
    },
    {
      key: "manager",
      name: "Minded for you",
      how: "Put a manager in to run a business of yours.",
      coins: 2,
      group: "business",
      check: (g, l) => businesses(l).some((p) => p.biz?.mgr !== undefined),
    },
    {
      key: "articles",
      name: "Articles of copartnership",
      how: "Sign articles and become a partner in a firm.",
      coins: 2,
      group: "business",
      check: (g, l) => firmsOf(g, l).length > 0,
    },
    {
      key: "trading-company",
      name: "A company of merchants",
      how: "Be a partner in a trading company that has sent out three cargoes.",
      coins: 5,
      group: "business",
      check: (g, l) =>
        firmsOf(g, l).some(
          (f) => f.hold === "company" && (f.co?.made ?? 0) >= 3,
        ),
    },
    {
      key: "privateer-company",
      name: "Gentlemen adventurers",
      how: "Be a partner in a company that fits out a privateer.",
      coins: 4,
      group: "business",
      check: (g, l) => firmsOf(g, l).some((f) => f.hold === "privateer"),
    },
    {
      key: "dividends",
      name: "Dividends",
      how: "Draw 100 coins of profit from your firms, all told.",
      coins: 4,
      group: "business",
      check: (g, l) =>
        (g.s.partners?.firms ?? []).reduce(
          (n, f) =>
            n +
            f.partners.reduce((m, p) => m + (ofLine(l, p.c) ? p.drawn : 0), 0),
          0,
        ) >= 100,
    },
    // ---- ships and crews
    {
      key: "fleet",
      name: "A fleet",
      how: "Own three boats at once.",
      coins: 4,
      group: "ships",
      check: (g, l) => boats(l).length >= 3,
    },
    {
      key: "fitted-out",
      name: "Fitted out",
      how: "Give a ship of yours all four refits: copper, new sails, guns and cabins.",
      coins: 5,
      group: "ships",
      check: (g, l) =>
        boats(l).some((b) => REFITS.every((r) => b.refits?.includes(r))),
    },
    {
      key: "known-ship",
      name: "Known on the waterfront",
      how: "A ship of yours makes a name of 80 on the waterfront.",
      coins: 4,
      group: "ships",
      check: (g, l) => boats(l).some((b) => (b.rep ?? 0) >= 80),
    },
    {
      key: "ten-voyages",
      name: "Ten voyages",
      how: "A boat of yours makes ten voyages and charters.",
      coins: 4,
      group: "ships",
      check: (g, l) => boats(l).some((b) => (b.voyages ?? 0) >= 10),
    },
    {
      key: "ships-company",
      name: "All her officers",
      how: "Take on a captain, a mate, a navigator, a surgeon and a bosun by name for one ship.",
      coins: 5,
      group: "ships",
      tier: "hard",
      check: (g, l) =>
        boats(l).some((b) =>
          OFFICERS.every((r) => b.roster?.hires.some((h) => h.role === r)),
        ),
    },
    {
      key: "marque",
      name: "Letter of marque",
      how: "Hold a letter of marque for a boat of yours.",
      coins: 3,
      group: "ships",
      check: (g, l) => boats(l).some((b) => !!b.marque),
    },
    {
      key: "prize",
      name: "A prize!",
      how: "Take a prize at sea, aboard a privateer or on the account.",
      coins: 4,
      group: "ships",
      check: (g, l) => kindCount(l, "prize") >= 1,
    },
    {
      key: "prizes-five",
      name: "Scourge of the sea lanes",
      how: "Take five prizes at sea.",
      coins: 8,
      group: "ships",
      tier: "rare",
      check: (g, l) => kindCount(l, "prize") >= 5,
    },
    {
      key: "lost-ship",
      name: "Lived to tell it",
      how: "Lose the ship you sail in (foundered, or taken by the enemy), and live.",
      coins: 3,
      group: "ships",
      secret: true,
      check: (g, l) => kindCount(l, "wreck") >= 1,
    },
    // ---- the road and the sea: travel and expeditions
    {
      key: "far-sixty",
      name: "The breadth of the land",
      how: "Visit sixty provinces.",
      coins: 5,
      group: "travel",
      tier: "hard",
      check: (g, l) => l.visited.length >= 60,
    },
    {
      key: "old-salt",
      name: "Old salt",
      how: "Spend a hundred days at sea.",
      coins: 4,
      group: "travel",
      check: (g, l) => achCount(l, "sea") >= 100,
    },
    {
      key: "capitals",
      name: "Every court",
      how: "Visit the capitals of five nations: a colony's seat of government or a native nation's chief town.",
      coins: 4,
      group: "travel",
      check: (g, l) => {
        const seen = new Set(l.visited);
        let n = 0;
        for (const x of g.s.nations)
          if (x.capital >= 0 && seen.has(x.capital)) n++;
        return n >= 5;
      },
    },
    {
      key: "pathfinder",
      name: "Pathfinder",
      how: "An expedition you led or got up comes home having done well.",
      coins: 4,
      group: "travel",
      check: (g, l) => achCount(l, "exped-won") >= 1,
    },
    {
      key: "three-expeditions",
      name: "Three times out",
      how: "Three expeditions you led or got up come home having done well.",
      coins: 7,
      group: "travel",
      tier: "hard",
      check: (g, l) => achCount(l, "exped-won") >= 3,
    },
    {
      key: "outpost",
      name: "A post in the wilds",
      how: "Plant an outpost with an expedition you led or got up.",
      coins: 4,
      group: "travel",
      check: (g, l) => achCount(l, "exped-outpost") >= 1,
    },
    // ---- house and family
    {
      key: "twice-wed",
      name: "Twice wed",
      how: "Marry a second time.",
      coins: 2,
      group: "home",
      check: (g, l) => l.tally.marriages >= 2,
    },
    {
      key: "houseful",
      name: "A houseful",
      how: "Have ten children (a line counts).",
      coins: 6,
      group: "home",
      tier: "hard",
      check: (g, l) => l.tally.children >= 10,
    },
    {
      key: "grandchild",
      name: "A grandchild",
      how: "See a grandchild born to the character you play.",
      coins: 3,
      group: "home",
      slow: true,
      check: (g, l) => {
        const me = meOf(g.s, l);
        return !!me?.children.some(
          (k) => (g.s.chars[k]?.children.length ?? 0) > 0,
        );
      },
    },
    {
      key: "degree",
      name: "A learned house",
      how: "Take a degree at college, or see a child of yours take one.",
      coins: 4,
      group: "home",
      slow: true,
      check: (g, l) => {
        const me = meOf(g.s, l);
        return (
          !!me &&
          (!!me.edu?.degree ||
            me.children.some((k) => !!g.s.chars[k]?.edu?.degree))
        );
      },
    },
    {
      key: "five-generations",
      name: "Five generations",
      how: "Play five generations of one family.",
      coins: 10,
      group: "home",
      tier: "rare",
      check: (g, l) => l.tally.generations >= 5,
    },
    {
      key: "fourscore",
      name: "Fourscore",
      how: "Live to eighty.",
      coins: 6,
      group: "home",
      tier: "rare",
      slow: true,
      check: (g, l) => {
        const me = meOf(g.s, l);
        return !!me && ageOf(g.s, me) >= 80;
      },
    },
    // ---- the tavern's games
    {
      key: "dice-regular",
      name: "A regular at the dice",
      how: "Play twenty tables of Liar's dice.",
      coins: 3,
      group: "tavern",
      check: (g, l) => achCount(l, "dice-tables") >= 20,
    },
    {
      key: "dice-five",
      name: "Five pots",
      how: "Win five pots at Liar's dice.",
      coins: 3,
      group: "tavern",
      check: (g, l) => kindCount(l, "dice") >= 5,
    },
    {
      key: "big-pot",
      name: "The big pot",
      how: "Win a pot of 100 coins or more at Liar's dice.",
      coins: 4,
      group: "tavern",
      tier: "rare",
      check: (g, l) => achCount(l, "dice-big") >= 1,
    },
    {
      key: "natural",
      name: "A natural",
      how: "Turn up a natural at vingt-et-un: an ace with a ten or a court card.",
      coins: 1,
      group: "tavern",
      check: (g, l) => achCount(l, "cards-natural") >= 1,
    },
    {
      key: "card-sharp",
      name: "Card sharp",
      how: "Win ten hands of vingt-et-un against the bank.",
      coins: 3,
      group: "tavern",
      check: (g, l) => achCount(l, "cards-won") >= 10,
    },
    {
      key: "broke-bank",
      name: "Broke the bank",
      how: "Get up from the card table twenty coins or more up.",
      coins: 3,
      group: "tavern",
      check: (g, l) => achCount(l, "cards-broke") >= 1,
    },
    // ---- office and power
    {
      key: "elections-three",
      name: "Returned again",
      how: "Win three elections.",
      coins: 4,
      group: "office",
      check: (g, l) => l.tally.elections >= 3,
    },
    {
      key: "speaker",
      name: "The speaker's chair",
      how: "Sit in the speaker's chair of your colony's assembly.",
      coins: 5,
      group: "office",
      check: (g, l) =>
        g.s.nations.some((n) => g.s.power?.cabinets[n.id]?.speaker === l.c),
    },
    {
      key: "whole-road",
      name: "The whole road",
      how: "Reach every step on the road to the governor's chair: a name, the county, the court, the house, the council, the lieutenancy and the chair.",
      coins: 8,
      group: "office",
      tier: "hard",
      check: (g, l) => ROAD.every((k) => l.chair?.steps?.[k] !== undefined),
    },
    {
      key: "renewed",
      name: "Another term",
      how: "Have the crown renew your commission as governor.",
      coins: 6,
      group: "office",
      tier: "hard",
      check: (g, l) =>
        g.s.nations.some(
          (n) => n.chair?.gov === l.c && n.ruler === l.c && n.chair.terms >= 2,
        ),
    },
    {
      key: "greatness",
      name: "Marks of greatness",
      how: "Have three marks of greatness (a hall, a coach, a portrait, a school endowed and the like).",
      coins: 4,
      group: "office",
      check: (g, l) => Object.keys(l.chair?.great ?? {}).length >= 3,
    },
    {
      key: "college",
      name: "A seat of learning",
      how: "Endow a college.",
      coins: 6,
      group: "office",
      tier: "rare",
      check: (g, l) => l.chair?.great?.college !== undefined,
    },
    {
      key: "new-nation",
      name: "A nation of your own",
      how: "Proclaim a new nation, and be its first to rule it.",
      coins: 10,
      group: "office",
      tier: "rare",
      check: (g, l) => achCount(l, "proclaimed") >= 1,
    },
    // ---- breaking with the crown
    {
      key: "declared",
      name: "Free and independent",
      how: "As governor, carry a motion to break with the crown, and declare it.",
      coins: 8,
      group: "revolution",
      tier: "rare",
      check: (g, l) => revs(g).some((r) => ofLine(l, r.by)),
    },
    {
      key: "patriot",
      name: "A patriot",
      how: "Take the side of liberty when your colony breaks with the crown.",
      coins: 3,
      group: "revolution",
      check: (g, l) => revs(g).some((r) => r.sides[l.seat] === "patriot"),
    },
    {
      key: "loyal",
      name: "Loyal to the crown",
      how: "Stand with the crown when your colony breaks with it.",
      coins: 3,
      group: "revolution",
      secret: true,
      check: (g, l) => revs(g).some((r) => r.sides[l.seat] === "loyal"),
    },
    {
      key: "liberty",
      name: "Liberty won",
      how: "Stand with the patriots when your colony wins its freedom.",
      coins: 8,
      group: "revolution",
      tier: "rare",
      check: (g, l) => achCount(l, "liberty") >= 1,
    },
    // ---- arms and the law: duels
    {
      key: "duels-three",
      name: "Three times on the field",
      how: "Win three duels.",
      coins: 5,
      group: "arms",
      tier: "hard",
      check: (g, l) => achCount(l, "duel-won") >= 3,
    },
    {
      key: "honour",
      name: "Honour satisfied",
      how: "Meet someone on the field and make it up, or both fire into the air.",
      coins: 2,
      group: "arms",
      check: (g, l) => achCount(l, "duel-honour") >= 1,
    },
    {
      key: "sword-pistol",
      name: "Sword and pistol",
      how: "Win a duel with swords and another with pistols.",
      coins: 5,
      group: "arms",
      tier: "hard",
      check: (g, l) =>
        achCount(l, "duel-swords") >= 1 && achCount(l, "duel-pistols") >= 1,
    },
    {
      key: "to-the-death",
      name: "To the death",
      how: "Win a duel to the death.",
      coins: 4,
      group: "arms",
      secret: true,
      check: (g, l) => achCount(l, "duel-death") >= 1,
    },
    // ---- 1776: The Revolution (its owners)
    {
      key: "r76-commission",
      name: "Commissioned",
      how: "Take a commission from the Continental Congress or the King's commander.",
      coins: 3,
      group: "campaign",
      dlc: CAMPAIGN_1776,
      check: (g, l) => !!l.r76?.commission,
    },
    {
      key: "r76-battles",
      name: "In the thick of it",
      how: "Fight in three of the war's battles with the army you serve.",
      coins: 5,
      group: "campaign",
      dlc: CAMPAIGN_1776,
      tier: "hard",
      check: (g, l) => (l.r76?.fought?.length ?? 0) >= 3,
    },
    {
      key: "r76-yorktown",
      name: "Yorktown",
      how: "Be at Yorktown with the army.",
      coins: 6,
      group: "campaign",
      dlc: CAMPAIGN_1776,
      tier: "rare",
      check: (g, l) => !!l.r76?.fought?.includes("yorktown"),
    },
    {
      key: "r76-spy",
      name: "Behind the lines",
      how: "Send five reports as a spy in a town the other side holds.",
      coins: 5,
      group: "campaign",
      dlc: CAMPAIGN_1776,
      check: (g, l) => (l.r76?.reports ?? 0) >= 5,
    },
    {
      key: "r76-turncoat",
      name: "Turncoat",
      how: "Change sides in the war.",
      coins: 2,
      group: "campaign",
      dlc: CAMPAIGN_1776,
      secret: true,
      check: (g, l) => (l.r76?.turned ?? 0) >= 1,
    },
    {
      key: "r76-peace",
      // CQ24 (r24): the campaign runs to the end of 1800 now.
      name: "The century out",
      how: "Live to see the 1776 campaign through, to the end of 1800.",
      coins: 6,
      group: "campaign",
      dlc: CAMPAIGN_1776,
      check: (g, l) => isCampaign(g.s) && g.s.day >= g.s.endDay,
    },
    // ---- Legends (its owners)
    {
      key: "legend-heard",
      name: "Old stories",
      how: "Hear talk of a legend.",
      coins: 1,
      group: "legends",
      dlc: LEGENDS,
      check: (g, l) => (l.legends?.list.length ?? 0) >= 1,
    },
    {
      key: "legend-found",
      name: "The journey's end",
      how: "Follow a legend (or a sacred place) to the journey's end.",
      coins: 5,
      group: "legends",
      dlc: LEGENDS,
      check: (g, l) => legendsFound(l) >= 1,
    },
    {
      key: "legend-three",
      name: "Legend hunter",
      how: "Follow three legends to the journey's end.",
      coins: 10,
      group: "legends",
      dlc: LEGENDS,
      tier: "rare",
      check: (g, l) => legendsFound(l) >= 3,
    },
    {
      key: "legend-waters",
      name: "The waters",
      how: "Drink the water of the Fountain of Youth.",
      coins: 6,
      group: "legends",
      dlc: LEGENDS,
      secret: true,
      check: (g, l) => l.legends?.waters !== undefined,
    },
    {
      key: "legend-keeper",
      name: "Keeper of the place",
      how: "Stand up for a sacred place when someone means it harm.",
      coins: 5,
      group: "legends",
      dlc: LEGENDS,
      check: (g, l) => Object.keys(l.legends?.kept ?? {}).length > 0,
    },
  ];
}

export const ACHIEVEMENT_BY_KEY = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));

/**
 * Everything earnable, in Derp Coins. CQTUT (r26): the life's marks; the
 * first life's lessons (an account's alone) are paid apart.
 */
export const ACHIEVEMENT_COINS = ACHIEVEMENTS.reduce(
  (n, a) => n + (a.account ? 0 : a.coins),
  0,
);

/**
 * How the journal line for one earned begins (the client shows its own
 * toast for it, so the line isn't toasted twice).
 */
export const ACHIEVEMENT_NOTE = "Achievement earned: ";

// ---------------------------------------------------------------- CQACH (r22): this game's, and overall

/** The difficulty overall (account) achievements may be earned on: the hardest. */
export const OVERALL_DIFFICULTY: Difficulty = "hard";

/** Whether a game at this difficulty earns overall (account) achievements. */
export function countsOverall(difficulty: string | undefined): boolean {
  return difficulty === OVERALL_DIFFICULTY;
}

/**
 * CQTUT (r26): whether an achievement goes onto the account from a game at
 * this difficulty: on Hard, or an account's own (the first life's lessons)
 * on any.
 */
export function paysOverall(
  key: string,
  difficulty: string | undefined,
): boolean {
  return countsOverall(difficulty) || !!ACHIEVEMENT_BY_KEY.get(key)?.account;
}

/** The rule, as the pages say it. */
export const OVERALL_RULE =
  "Overall achievements, your account's, are earned only in games on Hard; any you earned before stay yours.";
export const GAME_RULE = `This game's achievements pay Derp Coins in the game you earn them in, on any difficulty: ${PLAY_PAY.achievementTimes} times their account coins, paid with your line's marks as you play.`;

/** What an achievement pays in the game it's earned in (any difficulty). */
export function gameCoins(def: AchievementDef): number {
  if (def.account) return 0; // CQTUT (r26): the account's alone
  return def.coins * PLAY_PAY.achievementTimes;
}

/** This game's achievements on a life, and what they come to. */
export function gameAchievements(life: Pick<Life, "achieved">): {
  keys: string[];
  coins: number;
} {
  const keys = Object.keys(life.achieved ?? {}).filter((k) =>
    ACHIEVEMENT_BY_KEY.has(k),
  );
  return {
    keys,
    coins: keys.reduce((n, k) => n + gameCoins(ACHIEVEMENT_BY_KEY.get(k)!), 0),
  };
}

/** The achievements a player sees: the add-ons' only for their owners. */
export function achievementsFor(owned: {
  campaign1776?: boolean;
  legends?: boolean;
}): AchievementDef[] {
  return ACHIEVEMENTS.filter(
    (a) =>
      !a.dlc || (a.dlc === LEGENDS ? !!owned.legends : !!owned.campaign1776),
  );
}

/**
 * The server marks a seat's life with whether its account owns the 1776
 * campaign (Legends.ts's setLegendsOwned does Legends): its achievements
 * come only to owners.
 */
export function setCampaignOwned(
  g: ConquestGame,
  seat: string,
  on: boolean,
): void {
  const life = g.s.lives.find((l) => l.seat === seat);
  if (!life || !!life.dlc?.campaign1776 === on) return;
  touchLife(g, life).dlc = { ...(life.dlc ?? {}), campaign1776: on };
}
// ---------------------------------------------------------------- /CQACH (r22)

/**
 * Anything newly earned is marked (and noted in the journal). Returns the
 * new keys. `quick`: only the cheap checks (the daily round does the dear
 * ones once a week).
 */
export function checkAchievements(
  g: ConquestGame,
  life: Life,
  quick = false,
): string[] {
  if (life.watching || life.c < 0) return [];
  const me = g.s.chars[life.c];
  if (!me?.alive) return [];
  noteWork(g, life); // CQACH (r22)
  const got: string[] = [];
  for (const def of ACHIEVEMENTS) {
    if (life.achieved?.[def.key] !== undefined) continue;
    if (quick && def.slow) continue;
    if (def.dlc && !ownsDlc(life, def.dlc)) continue; // CQACH (r22)
    if (!def.check(g, life)) continue;
    touchLife(g, life);
    (life.achieved ??= {})[def.key] = g.s.day;
    got.push(def.key);
    journal(g, life, `${ACHIEVEMENT_NOTE}${def.name}. ${def.how}`, "good");
    milestone(g, life, "achievement", achievementText(def.name), life.prov, {
      quiet: true,
      tone: "good",
    }); // STORY (r17)
  }
  return got;
}

// ---------------------------------------------------------------- CQACH (r22): the counts kept

/** Adds to a count some achievements wait on. */
export function countAch(
  g: ConquestGame,
  life: Life,
  key: string,
  n = 1,
): void {
  touchLife(g, life);
  (life.achCount ??= {})[key] = achCount(life, key) + n;
}

/** The trades worked (and those climbed to the third rung), noted as they come. */
function noteWork(g: ConquestGame, life: Life): void {
  const job = life.job;
  if (!job) return;
  if (!achCount(life, `job:${job.kind}`)) countAch(g, life, `job:${job.kind}`);
  if (job.rank >= 2 && !achCount(life, `rung:${job.kind}`))
    countAch(g, life, `rung:${job.kind}`);
}

/**
 * Expeditions home since the last look (GOV r21 keeps the last forty): one
 * of yours (you led it, or got it up) that did well, and an outpost
 * planted. Looked at a day late, so every one home by then is there.
 */
function noteExpeditions(g: ConquestGame, life: Life): void {
  const past = g.s.exped?.past;
  if (!past?.length) return;
  // The last day looked at (days may be 0 or less: a game begun in 1607).
  const seen = life.achCount?.["exped:day"] ?? -Infinity;
  let last = seen;
  for (const x of past) {
    if (x.end <= seen || x.end >= g.s.day) continue;
    last = Math.max(last, x.end);
    if (x.result !== "won") continue;
    if (x.by !== life.seat && !ofLine(life, x.leader)) continue;
    countAch(g, life, "exped-won");
    if (x.kind === "outpost") countAch(g, life, "exped-outpost");
  }
  if (last > seen) (touchLife(g, life).achCount ??= {})["exped:day"] = last;
}

/**
 * Moments as they go into a line's story: duels won (and with what, and
 * whether to the death), honour satisfied, a nation proclaimed, a colony's
 * freedom won with the patriots.
 */
export function achievementMoment(
  g: ConquestGame,
  life: Life,
  m: LifeMilestone,
): void {
  if (m.sec || life.c < 0) return;
  if (m.kind === "duel") {
    if (/fired into the air|and made it up/.test(m.text)) {
      countAch(g, life, "duel-honour");
      return;
    }
    if (m.tone !== "good") return;
    countAch(g, life, "duel-won");
    if (/in a duel to the death/.test(m.text)) countAch(g, life, "duel-death");
    if (/with swords/.test(m.text)) countAch(g, life, "duel-swords");
    if (/with pistols/.test(m.text)) countAch(g, life, "duel-pistols");
  } else if (m.kind === "office" && /^Proclaimed /.test(m.text))
    countAch(g, life, "proclaimed");
  else if (
    m.kind === "rising" &&
    /^Stood with the patriots:/.test(m.text) &&
    !isCampaign(g.s)
  )
    countAch(g, life, "liberty");
  // CHAL (r25): a town won back for your crown, by a siege you marched in or
  // the crown's regiments you asked for (a weekly challenge).
  else if (
    (m.kind === "battle" && /^Retook .+ after a siege/.test(m.text)) ||
    (m.kind === "renown" &&
      /^Took back .+ with the crown's regiments/.test(m.text))
  )
    countAch(g, life, RETOOK_COUNT);
}

/** CHAL (r25): the count (Life.achCount) of towns retaken for your crown. */
export const RETOOK_COUNT = "retook";
// ---------------------------------------------------------------- /CQACH (r22)

/** Each day: the counts some achievements wait on, then the checks. */
export function achievementsDaily(g: ConquestGame, life: Life): void {
  const t = life.travel;
  if (t && t.path.length) {
    const count = (key: string) => {
      touchLife(g, life);
      (life.achCount ??= {})[key] = achCount(life, key) + 1;
    };
    if (t.sea[0]) count("sea");
    else {
      const def = g.map.provinces[t.path[0]];
      if (isWinter(def.lat, dateOf(g.s.day).month) && isNorth(def.lat))
        count("winterRoad");
    }
  }
  noteExpeditions(g, life); // CQACH (r22)
  checkAchievements(g, life, g.s.day % 7 !== 0);
}

hooks.lifeDaily.push(achievementsDaily);
hooks.afterCommand.push((g, life) => void checkAchievements(g, life));
hooks.milestone.push(achievementMoment); // CQACH (r22)
