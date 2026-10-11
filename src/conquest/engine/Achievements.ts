// MAP (r12): achievements. Fifty-odd marks of a life (or a line) across
// every system: work and trade, house and family, letters and tongues,
// office, wealth, the road and the sea, arms and the law, the native
// peoples' own paths, the seasons, and the long game. Each is earned once
// in a game (and noted in the journal); the server pays a few Derp Coins
// for it the first time an account earns it, and never again, so replaying
// can't farm them. The checks only read the state, so they're cheap enough
// to run every day and after every command.

import { dateOf } from "./Calendar";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { journal, touchLife } from "./LifeCore";
import { lifeIsNative, meOf, officesOf } from "./LifeQueries";
import { isWinter } from "./Map";
import { ageOf } from "./Queries";
import { isNorth } from "./Seasons";
import { LEVEL_POINTS, lifeTonguePoints, motherTongue } from "./Tongues";
import type { Life } from "./Types";

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
  | "time";

export const ACHIEVEMENT_GROUPS: { id: AchievementGroup; name: string }[] = [
  { id: "work", name: "Work and trade" },
  { id: "home", name: "House and family" },
  { id: "society", name: "Society, letters and tongues" },
  { id: "office", name: "Office and power" },
  { id: "wealth", name: "Wealth" },
  { id: "travel", name: "The road and the sea" },
  { id: "arms", name: "Arms and the law" },
  { id: "native", name: "The peoples' own paths" },
  { id: "seasons", name: "The seasons" },
  { id: "time", name: "The long game" },
];

export interface AchievementDef {
  key: string;
  name: string;
  /** How it's earned, as the page tells it. */
  how: string;
  /** Derp Coins it pays, the first time an account earns it. */
  coins: number;
  group: AchievementGroup;
  check: (g: ConquestGame, life: Life) => boolean;
  /** A dearer check (it looks through the world): weekly, and after commands. */
  slow?: boolean;
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
    coins: 4,
    group: "work",
    check: (g, l) => l.tally.topRank >= 3,
  },
  {
    key: "business",
    name: "Your own master",
    how: "Own a business with hands of your own.",
    coins: 3,
    group: "work",
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
    coins: 3,
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
    coins: 3,
    group: "home",
    check: (g, l) => l.tally.children >= 5,
  },
  {
    key: "heir",
    name: "The line goes on",
    how: "Go on as your heir when your character dies.",
    coins: 3,
    group: "home",
    check: (g, l) => l.tally.generations >= 2,
  },
  {
    key: "dynasty",
    name: "A dynasty",
    how: "Play three generations of one family.",
    coins: 5,
    group: "home",
    check: (g, l) => l.tally.generations >= 3,
  },
  {
    key: "old-age",
    name: "Threescore and ten",
    how: "Live to seventy.",
    coins: 3,
    group: "home",
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
    coins: 4,
    group: "society",
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
    how: "Reach 150 renown.",
    coins: 4,
    group: "society",
    check: (g, l) => l.tally.peakRenown >= 150,
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
    coins: 3,
    group: "office",
    check: (g, l) => l.tally.topOffice >= 1,
  },
  {
    key: "council",
    name: "On the council",
    how: "Sit on the governor's council (or the nation's).",
    coins: 4,
    group: "office",
    check: (g, l) => l.tally.topOffice >= 2,
  },
  {
    key: "governor",
    name: "His Excellency",
    how: "Become governor of a colony (or sachem of a nation).",
    coins: 5,
    group: "office",
    check: (g, l) => l.tally.topOffice >= 3,
  },
  {
    key: "founder",
    name: "Founder",
    how: "Found a settlement (or a colony of your own).",
    coins: 5,
    group: "office",
    slow: true,
    check: (g, l) => milestoneLike(l, /^Founded /),
  },
  {
    key: "rising",
    name: "The world turned upside down",
    how: "Win a rising.",
    coins: 5,
    group: "office",
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
    coins: 5,
    group: "wealth",
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
    coins: 3,
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
    group: "travel",
    check: (g, l) => (l.boats ?? []).length >= 1,
  },
  {
    key: "ship",
    name: "A ship of your own",
    how: "Own a brig or a full-rigged ship.",
    coins: 4,
    group: "travel",
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
    coins: 3,
    group: "travel",
    check: (g, l) => l.tally.europe !== null,
  },
  {
    key: "expedition",
    name: "Into the unknown",
    how: "Lead an expedition for your nation.",
    coins: 4,
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
    coins: 3,
    group: "arms",
    check: (g, l) => l.tally.battlesWon >= 1,
  },
  {
    key: "duel",
    name: "Satisfaction",
    how: "Win a duel.",
    coins: 3,
    group: "arms",
    slow: true,
    check: (g, l) =>
      milestoneLike(l, /won a duel|beat .* in a duel/i) ||
      ((l.tally as { duelsWon?: number }).duelsWon ?? 0) >= 1,
  },
  {
    key: "company",
    name: "Your own company",
    how: "Raise a company of your own.",
    coins: 3,
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
    coins: 3,
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
    coins: 3,
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
    coins: 3,
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
    coins: 4,
    group: "time",
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
    coins: 5,
    group: "time",
    check: (g, l) => dateOf(g.s.day).year >= 1776,
  },
];

export const ACHIEVEMENT_BY_KEY = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));

/** Everything earnable, in Derp Coins. */
export const ACHIEVEMENT_COINS = ACHIEVEMENTS.reduce((n, a) => n + a.coins, 0);

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
  const got: string[] = [];
  for (const def of ACHIEVEMENTS) {
    if (life.achieved?.[def.key] !== undefined) continue;
    if (quick && def.slow) continue;
    if (!def.check(g, life)) continue;
    touchLife(g, life);
    (life.achieved ??= {})[def.key] = g.s.day;
    got.push(def.key);
    journal(
      g,
      life,
      `Achievement: ${def.name}. ${def.how.replace(/\.$/, "")}: done.`,
      "good",
    );
  }
  return got;
}

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
  checkAchievements(g, life, g.s.day % 7 !== 0);
}

hooks.lifeDaily.push(achievementsDaily);
hooks.afterCommand.push((g, life) => void checkAchievements(g, life));
