// EVENTS (r15): the pace of what happens in a life, and who may appear in it.
//
// The same thing shouldn't keep coming round. So:
// - every event rests after it comes: four years for what happens at home
//   (LifeEvents' own rule), and now a year at the least for anything on the
//   road or at sea, and for each of a trade's matters at work;
// - events that tell much the same story rest together, as a family (a
//   sickness, a friend in money trouble, a quarrel, the tavern's goings-on);
// - each showing makes an event less likely to be drawn again than one that
//   hasn't come yet (its weight is divided by one more than its showings).
//
// And other players are never put into an event. They appear only as what
// they really did (a proposal, a challenge, a vote, a letter they wrote): no
// drawn event names another player's character, stands them in its scene, or
// puts words in their mouth. Anyone who asks for money in an event must
// really be short of it: rich people don't beg.

import { meansOf } from "./DiceAi";
import { householdsOf } from "./Folk";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { touchLife } from "./LifeCore";
import { lifeOfChar } from "./LifeQueries";
import { ageOf } from "./Queries";
import type { Character, EventPool, GameState, Life } from "./Types";
import { worldRng } from "./WorldRng";

// ---------------------------------------------------------------- the rests

/** The least time before an event on the road or at sea comes again. */
export const ROAD_REST = 330;

/** The least time before a matter at work (or a big job) comes again, each variant. */
export const MATTER_REST = 400;

/** The rest a family takes when no other is set. */
export const FAMILY_REST_DEFAULT = 120;

/** Events that tell much the same story, by family. */
export const FAMILIES: Record<string, string[]> = {
  sickness: [
    "fever",
    "smallpox",
    "camp-fever",
    "gout",
    "season-chill",
    "season-fever",
    "breakdown",
    "kin-ague",
    "age-rheum",
  ],
  money: [
    "friend-loan",
    "friend-debt",
    "gambling-debt",
    "house-relatives",
    "letter-kin",
    "kin-cousin-money",
    "town-subscription",
  ],
  calamity: [
    "fire",
    "home-roof",
    "hurricane",
    "earthquake",
    "great-snow",
    "town-fire-bell",
    "wthr-hail",
    "wthr-flood",
  ],
  windfall: [
    "legacy",
    "lottery",
    "fortune-teller",
    "lost-purse",
    "town-found-purse",
  ],
  quarrels: [
    "rival-insult",
    "rival-challenge",
    "nemesis-plot",
    "tavern-brawl",
    "town-slander",
  ],
  hearth: [
    "spouse-quarrel",
    "spouse-surprise",
    "lover-scandal",
    "kin-anniversary",
  ],
  children: ["child-sick", "child-trade", "child-match", "child-apprentice"],
  pulpit: [
    "preacher-witch",
    "revival",
    "preacher-sermon",
    "preacher-dancing",
    "whitefield",
    "drunk-reform",
    "tithingman",
  ],
  // On the road and at sea: the weather, and men with guns.
  "sea-weather": ["sea-storm", "trv-hurricane", "trv-gale"],
  robbers: [
    "road-bandits",
    "road-deserters",
    "trv-enemy-patrol",
    "trv-maroons",
  ],
};

/** How long each family rests after one of its events, in days. */
export const FAMILY_REST: Record<string, number> = {
  sickness: 200,
  money: 365,
  calamity: 365,
  windfall: 365,
  quarrels: 200,
  hearth: 150,
  children: 150,
  pulpit: 200,
  "sea-weather": 60,
  robbers: 90,
};

const FAMILY_OF = new Map<string, string>();
for (const [f, keys] of Object.entries(FAMILIES))
  for (const k of keys) FAMILY_OF.set(k, f);

/**
 * An event's family: named above, or (for what happens at home) the word its
 * key begins with, so a farmer's droughts and hogs and prices rest together.
 */
export function familyOf(key: string, pool: EventPool): string | undefined {
  const named = FAMILY_OF.get(key);
  if (named) return named;
  if (pool !== "any") return undefined;
  const dash = key.indexOf("-");
  return dash > 0 ? key.slice(0, dash) : undefined;
}

export function familyRest(family: string): number {
  return FAMILY_REST[family] ?? FAMILY_REST_DEFAULT;
}

/** Whether a family is resting for this life. */
export function familyResting(
  s: GameState,
  life: Life,
  family: string,
): boolean {
  return (life.cooldowns[`fam:${family}`] ?? 0) > s.day;
}

/** How many times an event (or a trade's matter) has come to this line. */
export function seenOf(life: Life, key: string): number {
  return life.evSeen?.[key] ?? 0;
}

/** Note one more showing. */
export function noteSeen(g: ConquestGame, life: Life, key: string): void {
  const seen = (touchLife(g, life).evSeen ??= {});
  seen[key] = (seen[key] ?? 0) + 1;
}

/** A weight, faded by how often it's been seen: what hasn't come yet comes first. */
export function faded(life: Life, key: string, w: number): number {
  return w / (1 + seenOf(life, key));
}

// ---------------------------------------------------------------- other players

/** Whether a character is someone's played character. */
export function played(s: GameState, id: number): boolean {
  return id >= 0 && s.lives.some((l) => l.c === id);
}

/** A character, if nobody plays them: the computer's people speak in events, players don't. */
export function npc(
  s: GameState,
  c: Character | undefined,
): Character | undefined {
  return c && !played(s, c.id) ? c : undefined;
}

/** Whether a character is another player's (not this life's own). */
export function otherPlayer(
  s: GameState,
  life: Life,
  id: number | undefined,
): boolean {
  return id !== undefined && id >= 0 && id !== life.c && played(s, id);
}

/** The people a drawn event may name, by its context's keys. */
const PEOPLE: Record<string, string[]> = {
  "child-match": ["c", "m"],
};

/**
 * Whether a drawn event would put another player into it: someone in its
 * context, or (for talk about the marriage) a husband or wife who's played.
 */
export function namesAPlayer(
  s: GameState,
  life: Life,
  key: string,
  ctx: Record<string, number>,
): boolean {
  for (const k of PEOPLE[key] ?? ["c", "c2"])
    if (otherPlayer(s, life, ctx[k])) return true;
  // "Your husband has heard something": a played husband or wife hears for
  // themselves, when the affair really comes out (Liaisons.ts).
  if (key === "lover-scandal" || key === "spouse-quarrel") {
    const me = s.chars[life.c];
    if (me && otherPlayer(s, life, me.spouse)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- means

/** What someone really has: a player's purse, or a computer character's means. */
export function realMeans(s: GameState, c: Character): number {
  const l = lifeOfChar(s, c.id);
  return l ? l.purse : meansOf(s, c);
}

/**
 * Whether someone would come asking for a sum: never another player (they ask
 * for themselves, by letter or in person), and only if they're really short of
 * it. A merchant with sixty to his name doesn't beg eight coins.
 */
export function wouldBeg(
  s: GameState,
  c: Character | undefined,
  sum: number,
): boolean {
  if (!c?.alive || c.abroad || played(s, c.id)) return false;
  return realMeans(s, c) < sum * 1.5;
}

/** A friend of this life's who'd really come asking for a sum, or none. */
export function needyFriend(
  s: GameState,
  life: Life,
  sum: number,
): Character | undefined {
  for (const [k, t] of Object.entries(life.ties)) {
    if (t !== "friend") continue;
    const c = s.chars[Number(k)];
    if (wouldBeg(s, c, sum)) return c;
  }
  return undefined;
}

/** Events in which someone asks for money, and how much. */
export const ASKS: Record<string, number> = {
  "friend-loan": 8,
  "friend-debt": 10,
};

// ---------------------------------------------------------------- people for new events

/**
 * Someone of the town for an event: grown, not played, matching `pick`.
 * Chosen on the world's side dice (so looking doesn't disturb the game's).
 */
export function townsfolk(
  g: ConquestGame,
  life: Life,
  salt: number,
  pick: (c: Character) => boolean = () => true,
): Character | undefined {
  const s = g.s;
  const list = householdsOf(s, life.prov).filter(
    (c) => c.id !== life.c && ageOf(s, c) >= 16 && !played(s, c.id) && pick(c),
  );
  if (!list.length) return undefined;
  return list[worldRng(s, salt * 7919 + life.c).int(0, list.length - 1)];
}

// ---------------------------------------------------------------- the hooks

function weigh(
  g: ConquestGame,
  life: Life,
  key: string,
  pool: EventPool,
  ctx: Record<string, number>,
  w: number,
): number {
  const s = g.s;
  if (pool !== "raised" && namesAPlayer(s, life, key, ctx)) return 0;
  const ask = ASKS[key];
  if (ask !== undefined && !wouldBeg(s, s.chars[ctx.c], ask)) return 0;
  const fam = familyOf(key, pool);
  if (fam && familyResting(s, life, fam)) return 0;
  return faded(life, key, w);
}

function fired(
  g: ConquestGame,
  life: Life,
  key: string,
  pool: EventPool,
): void {
  const day = g.s.day;
  noteSeen(g, life, key);
  const fam = familyOf(key, pool);
  if (fam) {
    const k = `fam:${fam}`;
    life.cooldowns[k] = Math.max(life.cooldowns[k] ?? 0, day + familyRest(fam));
  }
  if (pool === "road" || pool === "sea") {
    const k = `ev:${key}`;
    life.cooldowns[k] = Math.max(life.cooldowns[k] ?? 0, day + ROAD_REST);
  }
}

hooks.eventWeight.push(weigh);
hooks.eventFired.push(fired);
