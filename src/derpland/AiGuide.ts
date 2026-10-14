// SITE (r22): what each DerpyFront AI personality pack does, in plain words,
// for the Derp Store (Derp Land's /store and DerpyFront's store page).
//
// Everything here was read from the simulation (round 21's DFSTORE work):
// TEMPERAMENT_TUNING in engine-lib's AiPersonalities.ts, and where it's used
// in NationExecution (pace, the attack and reserve shares, embargoes),
// AiAttackBehavior (the shares, betrayal only once it's ready to attack),
// NationAllianceBehavior (the same alliance rules for everyone),
// NationStructureBehavior (what it builds) and NationNukeBehavior (who it
// nukes). The numbers in the words are computed from the tuning, so they
// stay true; tests/client/AiGuide.test.ts checks them against the engine.
//
// The English lives here (Derp Land shows it as it is) and, word for word,
// under derpy.ai_guide in resources/lang/en.json (DerpyFront's store page
// shows it through translateText). A test keeps the two the same.

import { UnitType } from "@openfront/engine-api/game/GameTypes";
import {
  AI_PERSONALITY_PACKS,
  NO_TEMPERAMENT,
  TEMPERAMENT_TUNING,
  TEMPERAMENTS,
  temperedRatios,
  type Temperament,
  type TemperamentTuning,
} from "@openfront/engine-lib/game/AiPersonalities";

/** What the guide says about each temperament and pack, in this order. */
export const AI_ASPECTS = [
  "expands",
  "attacks",
  "allies",
  "betrays",
  "builds",
  "nukes",
  "danger",
] as const;
export type AiAspect = (typeof AI_ASPECTS)[number];

/** A column of the comparison: a temperament, or a nation with no pack. */
export type GuideColumn = Temperament | "usual";
export const GUIDE_COLUMNS: readonly GuideColumn[] = ["usual", ...TEMPERAMENTS];

/**
 * What a nation without a persona draws when it's made (NationExecution's
 * constructor: nextInt(50, 60), nextInt(30, 40), nextInt(10, 20), so the
 * top of each range is one under): the share of its troop cap it saves up
 * before attacking a player, the share it never sends below, and the share
 * it keeps home while it takes empty land.
 */
export const USUAL_SHARES = {
  trigger: [0.5, 0.59],
  reserve: [0.3, 0.39],
  expand: [0.1, 0.19],
} as const;

/** The usual cap on missile silos, and the threat that calls for defense posts. */
export const USUAL_MAX_SILOS = 3;
export const USUAL_DEFENSE_THREAT = 0.35;

const pct = (x: number) => Math.round(x * 100);
const range = (lo: number, hi: number) => `${pct(lo)}–${pct(hi)}%`;

function tuningOf(column: GuideColumn): TemperamentTuning {
  return column === "usual" ? NO_TEMPERAMENT : TEMPERAMENT_TUNING[column];
}

/** The shares a column's nations play by, lowest and highest. */
export function guideShares(column: GuideColumn): {
  trigger: [number, number];
  reserve: [number, number];
  expand: [number, number];
} {
  const t = tuningOf(column);
  const lo = temperedRatios(t, {
    trigger: USUAL_SHARES.trigger[0],
    reserve: USUAL_SHARES.reserve[0],
    expand: USUAL_SHARES.expand[0],
  });
  const hi = temperedRatios(t, {
    trigger: USUAL_SHARES.trigger[1],
    reserve: USUAL_SHARES.reserve[1],
    expand: USUAL_SHARES.expand[1],
  });
  return {
    trigger: [lo.trigger, hi.trigger],
    reserve: [lo.reserve, hi.reserve],
    expand: [lo.expand, hi.expand],
  };
}

/**
 * How much shorter (or longer) the wait between a nation's moves is than
 * usual, in percent: 20 for a pace of 0.8, 15 for 1.15. Whether that's
 * faster or slower is in the words ({pace}% faster).
 */
export function pacePercent(attackRate: number): number {
  return pct(Math.abs(1 - attackRate));
}

/** The numbers a column's words quote, all from the engine's tuning. */
export function guideParams(column: GuideColumn): Record<string, string> {
  const t = tuningOf(column);
  const s = guideShares(column);
  const usual = guideShares("usual");
  const more = (x: number | undefined) => `${pct((x ?? 1) - 1)}%`;
  return {
    pace: String(pacePercent(t.attackRate)),
    trigger: range(...s.trigger),
    reserve: range(...s.reserve),
    expand: range(...s.expand),
    usualTrigger: range(...usual.trigger),
    usualReserve: range(...usual.reserve),
    usualExpand: range(...usual.expand),
    sams: `${pct(t.structures[UnitType.SAMLauncher] ?? 1)}%`,
    samsMore: more(t.structures[UnitType.SAMLauncher]),
    ports: more(t.structures[UnitType.Port]),
    factories: more(t.structures[UnitType.Factory]),
    silos: String(column === "usual" ? USUAL_MAX_SILOS : t.maxSilos),
    usualSilos: String(USUAL_MAX_SILOS),
    threat: `${pct(USUAL_DEFENSE_THREAT * t.defenseThreat)}%`,
    usualThreat: `${pct(USUAL_DEFENSE_THREAT)}%`,
  };
}

/** How many of each temperament a pack's six personas have. */
export function packMix(packId: string): Record<Temperament, number> {
  const mix = Object.fromEntries(TEMPERAMENTS.map((t) => [t, 0])) as Record<
    Temperament,
    number
  >;
  const pack = AI_PERSONALITY_PACKS.find((p) => p.id === packId);
  for (const p of pack?.personas ?? []) mix[p.temperament]++;
  return mix;
}

/** Packs whose personas have exactly the same temperaments as `packId`'s. */
export function samePlayAs(packId: string): string[] {
  const key = JSON.stringify(packMix(packId));
  return AI_PERSONALITY_PACKS.filter(
    (p) => p.id !== packId && JSON.stringify(packMix(p.id)) === key,
  ).map((p) => p.id);
}

/** Fills {name} in a template from `params`. */
export function fillGuide(
  template: string,
  params: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in params ? String(params[k]) : m,
  );
}

/**
 * The guide's English, by key (en.json has the same under derpy.ai_guide).
 * Keys: aspect_<aspect>; <column>_<aspect> for a temperament (or "usual");
 * <pack>_<aspect>, <pack>_lean and <pack>_short for a pack; and the
 * section's own words.
 */
export const AI_GUIDE_EN: Readonly<Record<string, string>> = {
  title: "Tell them apart",
  intro:
    "A pack turns the AI nations of a game you host, or play alone, into its six personas, dealt at random (with more nations than personas they come round again as “II”, “III”). With two packs on, their twelve personas are shuffled together. Each persona plays by its temperament; games without a pack play as usual.",
  packs_title: "The packs side by side",
  col_pack: "Pack",
  col_leans: "Leans",
  temperaments_title: "How each temperament plays",
  swipe: "Slide the table sideways to see every temperament.",
  usual: "No pack",
  plays_title: "How it plays",
  same_play:
    "Plays the same as {packs}: the same temperaments. Only the names, flags and chat differ.",

  aspect_expands: "Expands",
  aspect_attacks: "Attacks",
  aspect_allies: "Allies",
  aspect_betrays: "Betrays",
  aspect_builds: "Builds",
  aspect_nukes: "Nukes",
  aspect_danger: "Dangerous when",

  usual_expands:
    "Sends troops into empty land at every move, keeping {usualExpand} of its troop cap at home.",
  usual_attacks:
    "Saves up to {usualTrigger} of its troop cap before attacking a player (now and then it goes sooner), and never goes below {usualReserve} at home. It moves every few seconds, faster on harder difficulties.",
  usual_allies:
    "Asks bordering players, and answers requests, by how it feels about them and who's a threat. It won't ally with a runaway leader.",
  usual_betrays:
    "Turns on a much weaker ally, a traitor, or a lone neighbour three times weaker; on Hard and Impossible, its juiciest ally when that's safe.",
  usual_builds:
    "Cities first, then ports and factories (3 for every 4 cities), SAMs by difficulty, and up to {usualSilos} missile silos (the first at 3 cities).",
  usual_nukes:
    "Nukes whoever it would attack, once it has a silo. MIRVs back at whoever MIRVed it, or at a player about to win or running away with the game.",
  usual_danger: "As dangerous as the difficulty you picked.",

  aggressive_expands:
    "Like any AI nation, but its moves come {pace}% faster, so it grabs empty land sooner.",
  aggressive_attacks:
    "Attacks once it has {trigger} of its troop cap (usually {usualTrigger}), and keeps only {reserve} at home (usually {usualReserve}).",
  aggressive_allies:
    "The usual rules. Its quicker moves mean it asks, and answers, sooner.",
  aggressive_betrays:
    "The usual rules, but it's ready to attack more often, so it weighs turning on an ally more often.",
  aggressive_builds: "The usual buildings, but only {sams} of the usual SAMs.",
  aggressive_nukes: "As any AI nation: whoever it would attack.",
  aggressive_danger:
    "Early, and to its neighbours. It's thin at home just after it attacks, and its few SAMs let nukes through.",

  trader_expands: "Like any AI nation, but its moves come {pace}% slower.",
  trader_attacks:
    "Waits for {trigger} of its troop cap and keeps {reserve} at home: slow to start a fight.",
  trader_allies:
    "The usual rules, and it never starts an embargo (except in team games on Hard and Impossible, where every AI nation shuts out the other teams), so other nations don't sour on it over trade.",
  trader_betrays:
    "The usual rules, but it's ready to attack less often, so it turns on allies less often.",
  trader_builds:
    "{ports} more ports and {factories} more factories; half the missile silos after its first, {silos} at most.",
  trader_nukes:
    "Atom and hydrogen bombs only at a player attacking it right then. MIRVs as any AI nation.",
  trader_danger:
    "When you attack it: it keeps a big army home to answer with, and that's when it nukes.",

  turtle_expands:
    "Its moves come {pace}% slower, but each push into empty land is a little bigger (it keeps {expand} home).",
  turtle_attacks:
    "Waits for {trigger} of its troop cap and keeps {reserve} at home. It rarely starts a war.",
  turtle_allies:
    "The usual rules. Its slower moves mean it answers requests later.",
  turtle_betrays:
    "The usual rules, but it's seldom ready to attack, so it seldom turns on an ally.",
  turtle_builds:
    "Twice the SAMs, half the missile silos after its first ({silos} at most), and defense posts once troops worth {threat} of its army come at it (usually {usualThreat}).",
  turtle_nukes:
    "Atom and hydrogen bombs only at a player attacking it right then. MIRVs as any AI nation.",
  turtle_danger:
    "Hard to crack and costly to poke: attack it and it answers with a full army and nukes. Left alone, it mostly sits tight.",

  nuker_expands: "Like any AI nation, at the usual pace.",
  nuker_attacks:
    "Waits for {trigger} of its troop cap and keeps {reserve} at home, a little more than usual.",
  nuker_allies: "The usual rules.",
  nuker_betrays: "The usual rules.",
  nuker_builds:
    "Its first missile silo at 2 cities (usually 3), then one for every 2 cities, up to {silos} (usually {usualSilos}), and {samsMore} more SAMs to guard them.",
  nuker_nukes:
    "As any AI nation (whoever it would attack), but from more silos, sooner.",
  nuker_danger:
    "From the middle game on: more silos means more nukes. Keep SAMs over your cities.",

  opportunist_expands:
    "Its moves come {pace}% faster, in smaller pushes into empty land (it keeps {expand} home).",
  opportunist_attacks:
    "Attacks at {trigger} of its troop cap, keeping {reserve} at home: quicker than usual to pick a fight.",
  opportunist_allies:
    "The usual rules. Its quicker moves mean it asks, and answers, sooner.",
  opportunist_betrays:
    "The usual rules, but it's ready to attack more often, so it weighs turning on an ally more often.",
  opportunist_builds: "{ports} more ports; otherwise the usual.",
  opportunist_nukes: "As any AI nation: whoever it would attack.",
  opportunist_danger:
    "When you're busy. On Hard and Impossible every AI nation piles onto a player under heavy attack, and this one is ready sooner than most.",

  ai_pirates_short: "Mixed, leans to attack",
  ai_pirates_lean:
    "A bit of everything, leaning to attack: two of the six are Aggressive.",
  ai_pirates_expands:
    "All take empty land first; Redbeard's Brethren, Blackwake Raiders and The Salt Queen move fastest, Old Barnacle's Cove slowest.",
  ai_pirates_attacks:
    "Redbeard's Brethren and Blackwake Raiders start fights earliest, then The Salt Queen; Captain Coinhook and Old Barnacle's Cove wait for big armies.",
  ai_pirates_allies:
    "All by the usual rules; Captain Coinhook never starts an embargo.",
  ai_pirates_betrays:
    "The two raiders and The Salt Queen are ready to attack most often, so they turn on allies most often.",
  ai_pirates_builds:
    "Captain Coinhook builds ports and factories, Old Barnacle's Cove SAMs and defense posts, The Powder Keg silos.",
  ai_pirates_nukes:
    "The Powder Keg builds up to 6 silos. Captain Coinhook and Old Barnacle's Cove nuke only someone attacking them.",
  ai_pirates_danger:
    "Early, if a raider lands next to you; later, The Powder Keg.",

  ai_empires_short: "Defensive",
  ai_empires_lean:
    "The most defensive pack: two Turtles and only one Aggressive. Slow, stubborn empires that are hard to break and nuke back when attacked.",
  ai_empires_expands:
    "All take empty land first; The Iron Crown and The Eagle Throne move fastest, The Marble Throne and Citadel of Ages slowest.",
  ai_empires_attacks:
    "The Iron Crown attacks earliest, then The Eagle Throne; the two Turtles and The Gilded Dynasty wait for big armies.",
  ai_empires_allies:
    "All by the usual rules; The Gilded Dynasty never starts an embargo.",
  ai_empires_betrays:
    "Seldom: two Turtles and a Trader are seldom ready to attack. The Iron Crown and The Eagle Throne are the ones to watch.",
  ai_empires_builds:
    "The Marble Throne and Citadel of Ages build twice the SAMs and early defense posts, The Gilded Dynasty ports and factories, The Wildfire Dominion silos.",
  ai_empires_nukes:
    "The Wildfire Dominion builds up to 6 silos. The Marble Throne, Citadel of Ages and The Gilded Dynasty nuke only someone attacking them.",
  ai_empires_danger:
    "When you attack one of them. Left alone, most of them sit tight.",

  ai_merchants_short: "Calm, trading",
  ai_merchants_lean:
    "The calmest pack: half are Traders, there's no Nuker, and four of the six nuke only someone attacking them. Monopolia and The Tollgate Barons are the exceptions.",
  ai_merchants_expands:
    "All take empty land first; Monopolia and The Tollgate Barons move fastest, Ledger & Sons and the three Traders slower than usual.",
  ai_merchants_attacks:
    "Monopolia attacks earliest, then The Tollgate Barons; the three Traders and Ledger & Sons wait for big armies.",
  ai_merchants_allies:
    "All by the usual rules; House Goldleaf, The Saffron Company and Silk Lantern League never start an embargo.",
  ai_merchants_betrays:
    "Least often of any pack: four of the six are seldom ready to attack. Monopolia and The Tollgate Barons are the ones to watch.",
  ai_merchants_builds:
    "The most ports and factories of any pack (the three Traders); Ledger & Sons builds twice the SAMs. No one builds extra silos.",
  ai_merchants_nukes:
    "The fewest nukes: only Monopolia and The Tollgate Barons nuke whoever they'd attack. The other four nuke only someone attacking them.",
  ai_merchants_danger: "Monopolia, early. The rest only if you attack them.",

  ai_scientists_short: "Nuclear",
  ai_scientists_lean:
    "The nuclear pack, the only one with two Nukers: expect missiles from the middle game on, and SAMs everywhere.",
  ai_scientists_expands:
    "All take empty land first; Clockwork Collective and Professor Fizzbang move fastest, The Bubbling Beaker slowest.",
  ai_scientists_attacks:
    "Clockwork Collective attacks earliest, then Professor Fizzbang; The Bubbling Beaker and Zeppelin Academy wait for big armies.",
  ai_scientists_allies:
    "All by the usual rules; Zeppelin Academy never starts an embargo.",
  ai_scientists_betrays:
    "Clockwork Collective and Professor Fizzbang are ready to attack most often, so they turn on allies most often.",
  ai_scientists_builds:
    "Doctor Voltwhistle and Gamma Labs build up to 6 silos each and extra SAMs, The Bubbling Beaker twice the SAMs, Zeppelin Academy ports and factories.",
  ai_scientists_nukes:
    "The most of any pack: Doctor Voltwhistle and Gamma Labs build silos early and many. The Bubbling Beaker and Zeppelin Academy nuke only someone attacking them.",
  ai_scientists_danger:
    "From the middle game on, once the two Nukers' silos are up.",

  ai_warlords_short: "Mixed, leans to attack",
  ai_warlords_lean:
    "A bit of everything, leaning to attack: two of the six are Aggressive.",
  ai_warlords_expands:
    "All take empty land first; Dust Devil Horde, Ironhoof Riders and The Grey Wolf Clan move fastest, The Canyon Kings slowest.",
  ai_warlords_attacks:
    "Dust Devil Horde and Ironhoof Riders start fights earliest, then The Grey Wolf Clan; The Canyon Kings and Railhead Barons wait for big armies.",
  ai_warlords_allies:
    "All by the usual rules; Railhead Barons never starts an embargo.",
  ai_warlords_betrays:
    "The two hordes and The Grey Wolf Clan are ready to attack most often, so they turn on allies most often.",
  ai_warlords_builds:
    "Railhead Barons build ports and factories, The Canyon Kings SAMs and defense posts, Dynamite Jack's Gang silos.",
  ai_warlords_nukes:
    "Dynamite Jack's Gang builds up to 6 silos. Railhead Barons and The Canyon Kings nuke only someone attacking them.",
  ai_warlords_danger:
    "Early, if a horde lands next to you; later, Dynamite Jack's Gang.",
};

/** Looks up and fills one of the guide's words. */
export type GuideText = (
  key: string,
  params?: Record<string, string | number>,
) => string;

/** The guide in English (Derp Land's pages). */
export const guideEn: GuideText = (key, params) =>
  fillGuide(AI_GUIDE_EN[key] ?? key, params);
