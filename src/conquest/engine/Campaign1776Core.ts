// DLC (r21): the 1776 campaign's questions that other modules ask (is this
// the campaign, who's who, what the campaign holds still), apart from the
// campaign itself (Campaign1776.ts) so they import nothing heavy.

import type { ConquestGame } from "./Game";
import type { Campaign76, Course76, GameState, Life, RevSide } from "./Types";

// ---------------------------------------------------------------- who's who

/** The year the campaign begins, and the store item that opens it. */
export const CAMPAIGN_YEAR = 1776;

/** A game that began in 1776 (and so is the campaign). */
export function isCampaign(s: GameState): boolean {
  return s.settings.start === CAMPAIGN_YEAR;
}

const byKey = (s: GameState, key: string) =>
  s.nations.findIndex((n) => n.key === key);

/** The United Colonies (from 4 July 1776 the United States): the map's English colony. */
export function usOf(s: GameState): number {
  return isCampaign(s) ? byKey(s, "england") : -1;
}

/** British America: the colonies that stayed loyal. */
export function britainOf(s: GameState): number {
  return isCampaign(s) ? byKey(s, "britain") : -1;
}

/** The King's own forces in America: the United Colonies' crown. */
export function kingOf(s: GameState): number {
  return isCampaign(s) ? byKey(s, "crown-england") : -1;
}

/** The campaign's record (on the United Colonies). */
export function campaignOf(s: GameState): Campaign76 | undefined {
  const n = usOf(s);
  return n >= 0 ? s.nations[n].r76 : undefined;
}

// ---------------------------------------------------------------- the end of the world

/** The words for the end of the world: 1776, or the campaign's peace. */
export function endWords(s: GameState): {
  year: number;
  reached: string;
  lived: string;
  told: string;
  over: string;
} {
  if (!isCampaign(s))
    return {
      year: 1776,
      reached: "The world has reached 1776.",
      lived: "lived to see 1776",
      told: "It is 1776. Whatever comes next, your story ends here.",
      over: "It is 1776. The story ends here.",
    };
  // CQ24 (r24): the campaign runs to the end of 1800 (a save of the old
  // campaign, to 1784, carries on there: Campaign1776Course.ts).
  const c = courseOf(s);
  if (c?.crushed !== undefined)
    return {
      year: 1800,
      reached: "The century is out, and the world has reached the end of 1800.",
      lived: "lived to see the century out",
      told: "It is the last night of 1800. The rising was put down and the colonies are the King's again; whatever comes next, your story ends here.",
      over: "The year 1800 is out, the colonies the King's still. The story ends here.",
    };
  return {
    year: 1800,
    reached: "The century is out, and the world has reached the end of 1800.",
    lived: "lived to see the century out",
    told: "It is the last night of 1800. The Revolution is long over, the republic has its government and its quarrels, and whatever comes next, your story ends here.",
    over: "The year 1800 is out, and the republic with it. The story ends here.",
  };
}

/** A player's side in the war (GOV r21's rising sides, on the United Colonies). */
export function sideOf(s: GameState, life: Life): RevSide | undefined {
  const us = usOf(s);
  if (us < 0) return undefined;
  return s.nations[us]?.desk?.rev?.sides[life.seat];
}

// ---------------------------------------------------------------- what the campaign holds still

/**
 * In the campaign the war's armies are where the beats put them: the
 * computer doesn't march the King's armies, or the Continental Army's main
 * army (`army`: an army's id; without it, whether all a nation's are held).
 * The United Colonies' other regiments defend the frontier as any colony's
 * would. A player who commands an army marches it as they please.
 */
export function campaignHoldsArmy(
  s: GameState,
  n: number,
  army?: number,
): boolean {
  if (!isCampaign(s)) return false;
  // CQ24 (r24): the frontier war's nations (1790-95) are held too.
  if (courseOf(s)?.frontier?.on && courseOf(s)!.frontier!.foes.includes(n))
    return true;
  const us = usOf(s);
  if (!s.nations[us]?.rebelling) return false;
  if (n === kingOf(s)) return true;
  return n === us && army !== undefined && army === campaignOf(s)?.armies?.main;
}

/**
 * The war between the Americans and the King is the campaign's: the United
 * Colonies' regiments don't go at the King's garrisons or into British
 * America, and British America's don't come into the United Colonies.
 */
export function campaignForbids(s: GameState, n: number, p: number): boolean {
  if (!isCampaign(s)) return false;
  if (courseForbids(s, n, p)) return true; // CQ24 (r24): the course's own wars
  const us = usOf(s);
  if (!s.nations[us]?.rebelling) return false;
  const pr = s.provinces[p];
  const br = britainOf(s);
  const king = kingOf(s);
  const held = pr.occupier >= 0 ? pr.occupier : pr.owner;
  if (n === br) return pr.owner === us || held === us;
  if (n === us)
    return (
      held === king ||
      held === br ||
      pr.owner === br ||
      s.armies.some((a) => a.prov === p && a.owner === king)
    );
  return false;
}

/** No peace between the United Colonies and British America but the Treaty of Paris. */
export function campaignWar(s: GameState, a: number, b: number): boolean {
  if (!isCampaign(s)) return false;
  if (courseWar(s, a, b)) return true; // CQ24 (r24): the course's own wars

  const us = usOf(s);
  const br = britainOf(s);
  if (!s.nations[us]?.rebelling) return false;
  return (a === us && b === br) || (a === br && b === us);
}

/** The rising's own rules wait on the campaign's beats. */
export function campaignRising(s: GameState, n: number): boolean {
  return isCampaign(s) && n === usOf(s);
}

/** In the campaign, Europe's wars are history's (no others start, none end early). */
export function campaignEurope(s: GameState): boolean {
  return isCampaign(s);
}

/** A loyalist may serve the King where his army holds the town (a Loyalist regiment). */
export function servesHere(s: GameState, life: Life, holderN: number): boolean {
  if (!isCampaign(s)) return false;
  const side = sideOf(s, life);
  return (
    side === "loyal" && (holderN === kingOf(s) || holderN === britainOf(s))
  );
}

/** The Continental Congress's officers, for the United States' council seats (CouncilTitles.ts). */
export const CONGRESS_TITLES: Record<string, string> = {
  spymaster: "Secretary of Congress",
  treasurer: "Treasurer of the United States",
  attorney: "Judge advocate general",
  surveyor: "Geographer to the army",
  marshal: "President of the Board of War",
  envoy: "Secretary for Foreign Affairs",
  chaplain: "Chaplain to Congress",
  speaker: "Chairman of the Committee of the Whole",
};

/** A scene that's a player's own secret (a spy's capture). */
export function r76Secret(key: string): boolean {
  return key.startsWith("r76-spy");
}

// ---------------------------------------------------------------- the war's tables
// (here, with nothing heavy imported, so the scenes and the pages can read
// them at any point in loading)

/** Changing sides once you've chosen one: a turncoat is remembered. */
export const TURNCOAT = { renown: -6, rest: 365 };

/** What a commission takes, and where it's given. */
export const COMMISSION = {
  /** An officer's coat, sword and kit. */
  cost: 10,
  /** A season between asks. */
  rest: 90,
  /** The reckoning, against 0 (as a skill check's DC). */
  leadershipDc: 10,
  captain: { leadership: 12, renown: 30 },
};

/** Spying: the check, the pay and what being taken means. */
export const SPY = {
  dc: 13,
  /** A season between reports. */
  rest: 60,
  /** Paid a report: by the committee's secret service, or by the British. */
  pay: { patriot: 4, loyal: 6 },
  renown: 2,
  /** Failed: the chance you're taken. */
  caught: 0.5,
  /** Taken and tried: the chance of the rope (otherwise held till exchanged). */
  hanged: 0.2,
  heldDays: 120,
  bribe: 8,
  bribeWorks: 0.75,
  bluffDc: 13,
};

// ---------------------------------------------------------------- CQ24 (r24): the course of history
// (Campaign1776Course.ts keeps it; these are the light questions other
// modules ask of it, and the gates the beats pass through.)

/** The campaign's course: where history held, and where players turned it. */
export function courseOf(s: GameState): Course76 | undefined {
  return campaignOf(s)?.course;
}

/** Whether a beat went otherwise than history (players turned it). */
export function beatTurned(s: GameState, key: string): boolean {
  return courseOf(s)?.turned[key] !== undefined;
}

/**
 * The beats pass through these (Campaign1776.fireBeat) before they do what
 * history did: true when the course has taken a beat over (it yields to
 * what players have done, waits, or is fought for real).
 */
export const R76_GATES: ((g: ConquestGame, b: { key: string }) => boolean)[] =
  [];

/** The course's wars after the peace: the frontier's and the Quasi-War's sides. */
function courseSides(s: GameState): [number, number[]][] {
  const c = courseOf(s);
  if (!c) return [];
  const us = usOf(s);
  const out: [number, number[]][] = [];
  if (c.frontier?.on) out.push([us, c.frontier.foes]);
  if (c.quasi) {
    const fr = s.nations.findIndex((n) => n.key === "france");
    if (fr >= 0) out.push([us, [fr]]);
  }
  return out;
}

/** The course's wars: the computer's armies on either side don't go into the other's country. */
function courseForbids(s: GameState, n: number, p: number): boolean {
  const pr = s.provinces[p];
  if (!pr) return false;
  const held = pr.occupier >= 0 ? pr.occupier : pr.owner;
  for (const [a, foes] of courseSides(s)) {
    if (n === a && (foes.includes(held) || foes.includes(pr.owner)))
      return true;
    if (foes.includes(n) && (held === a || pr.owner === a)) return true;
  }
  return false;
}

/**
 * After the peace the republic's wars with the powers are history's (the
 * Northwest's, the Quasi-War): no power answers an ally's call to a war the
 * United States is in, on either side, and the United States answers no
 * ally's call at all (it kept out of Europe's wars, its treaty with France
 * or not), unless a player rules the nation answering (they may still
 * declare war themselves). The frontier's peoples, and risings, still stand
 * by each other. `a` attacked `b`; `ally` is called to `b`'s side.
 */
export function campaignNoCall(
  s: GameState,
  ally: number,
  a: number,
  b: number,
): boolean {
  const c = courseOf(s);
  if (c?.peace === undefined) return false;
  const us = usOf(s);
  if (ally !== us) {
    if (a !== us && b !== us) return false;
    const k = s.nations[ally]?.kind;
    if (k !== "power" && k !== "crown") return false;
  }
  const ruler = s.nations[ally]?.ruler ?? -1;
  return ruler < 0 || !s.lives.some((l) => l.c === ruler);
}

/** The course's wars: only the course makes their peace. */
function courseWar(s: GameState, a: number, b: number): boolean {
  for (const [x, foes] of courseSides(s))
    if ((a === x && foes.includes(b)) || (b === x && foes.includes(a)))
      return true;
  return false;
}

/**
 * Europe's wars with Britain in the campaign (Crown.ts's history): when each
 * opens and ends as the course has them. France's comes with the alliance,
 * Spain's a year after, and both end with the peace. Undefined: not one of
 * the campaign's wars; null: not now.
 */
export function campaignEuropeSpan(
  s: GameState,
  a: string,
  b: string,
): [number, number] | null | undefined {
  if (!isCampaign(s)) return undefined;
  const pair = [a, b].sort().join("-");
  const key = (
    {
      "britain-france": "france",
      "britain-spain": "spain",
      "britain-netherlands": "netherlands",
    } as Record<string, string>
  )[pair];
  if (!key) return undefined;
  const c = courseOf(s);
  if (c?.peace !== undefined || c?.crushed !== undefined) return null;
  const from = c?.europe?.[key];
  if (from === undefined) return key === "netherlands" ? undefined : null;
  return [from, Number.MAX_SAFE_INTEGER];
}
