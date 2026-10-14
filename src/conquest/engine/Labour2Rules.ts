// LABOUR2 (r21): the numbers an overseer and work at a business go by. Read
// by the household's model (BondCore.ts), the month (Overseer.ts, BondBiz.ts)
// and the page, so what's shown is what happens. Nothing here imports the
// rest of the game, so the household's model can read it without a cycle.
//
// Harshness never pays here either. A hard overseer gets a little more out of
// the day, and loses it again in spirits and health (so in the work), and in
// flight, sickness and risings; so does an overseer paid by a share of the
// crop, who drives people for this year's crop (as planters complained of
// their own overseers). Your orders of restraint halve what his nature does.
// What an overseer is worth is minding the place while you're away.
//
// Pay by shares: Washington's agreement of 5 August 1762 with Edward Violet
// gave his overseer at Bullskin "two clear Shares of all the Tobacco corn and
// other Grain which he may raise", and asked him to take "all necessary and
// proper care of the Negroes committed to his management" (The Papers of
// George Washington, Colonial Series 7, founders.archives.gov). Lowcountry
// planters more often paid their overseers wages.

import type {
  BondMark,
  Character,
  GameState,
  Life,
  Overseer,
  OverseerManner,
} from "./Types";

// ---------------------------------------------------------------- an overseer

export interface MannerDef {
  name: string;
  /** In a line, for the page. */
  text: string;
  /** What his nature does to spirits and health, each month's target. */
  mood: number;
  health: number;
  /** × on the day's work he gets out of them. */
  drive: number;
}

export const MANNERS: Record<OverseerManner, MannerDef> = {
  hard: {
    name: "A hard driver",
    text: "Gets the day's work out of them by fear, as many overseers did: a little more work, and spirits and health that fall, and more who go.",
    mood: -8,
    health: -4,
    drive: 1.05,
  },
  steady: {
    name: "A steady hand",
    text: "Keeps the work going, without much harshness or much kindness.",
    mood: -2,
    health: 0,
    drive: 1.02,
  },
  fair: {
    name: "A fair man",
    text: "Asks no more than the work needs, and listens when he's told something: a better temper in the quarters.",
    mood: 3,
    health: 1,
    drive: 1,
  },
};

export const MANNER_ORDER: OverseerManner[] = ["fair", "steady", "hard"];

/** Your orders of restraint keep this much of his harshness, and of his drive. */
export const RESTRAINT = 0.5;

/** Paid by shares of the crop, he pushes for this year's crop. */
export const SHARE_PAY = { mood: -4, health: -3, drive: 1.04 };

/** An overseer's shares, by how many work the fields (one, or two for ten or more). */
export function sharesFor(workers: number): number {
  return workers >= 10 ? 2 : 1;
}

/** The part of the crop his shares come to: his shares, of the hands' shares and his. */
export function shareOf(shares: number, workers: number): number {
  return shares > 0 && workers > 0 ? shares / (workers + shares) : 0;
}

/** The overseer's parts in spirits, health and the work, for the breakdowns. */
export function overseerParts(o: Overseer): {
  mood: [string, number][];
  health: [string, number][];
  drive: number;
} {
  const m = MANNERS[o.manner];
  const held = o.orders.rule === "restraint";
  const keep = (v: number) => (v < 0 && held ? Math.round(v * RESTRAINT) : v);
  const tag = held && m.mood < 0 ? ", held back by your orders" : "";
  const mood: [string, number][] = [
    [`The overseer: ${m.name.toLowerCase()}${tag}`, keep(m.mood)],
  ];
  const health: [string, number][] = m.health
    ? [[`The overseer: ${m.name.toLowerCase()}${tag}`, keep(m.health)]]
    : [];
  let drive = held ? 1 + (m.drive - 1) * RESTRAINT : m.drive;
  if (o.pay === "share") {
    mood.push(["The overseer's paid by the crop, and drives them for it", SHARE_PAY.mood]);
    health.push(["The overseer's paid by the crop, and drives them for it", SHARE_PAY.health]);
    drive *= SHARE_PAY.drive;
  }
  return { mood, health, drive };
}

/** The work goes this much better under an overseer of this skill (the crop, the season, the hands). */
export function overseerSkillX(skill: number): number {
  return 1 + 0.004 * Math.min(15, Math.max(0, skill));
}

/** With the holder away, how much of the work is done under an overseer, by his skill (with nobody: 0.75). */
export function overseerMind(skill: number): number {
  return 0.82 + 0.15 * Math.min(1, Math.max(0, skill) / 12);
}

/** The household's overseer, if it has one alive. */
export function overseerOf(s: GameState, life: Life): Overseer | undefined {
  const o = life.bondage?.overseer;
  return o && s.chars[o.c]?.alive ? o : undefined;
}

/** Whether the overseer has charge of someone: the household's people at home (not those at a business). */
export function underOverseer(
  s: GameState,
  life: Life,
  c: Character,
): Overseer | undefined {
  const o = overseerOf(s, life);
  if (!o || c.bond?.work === "biz") return undefined;
  return c.bond?.at === life.bondage?.home ? o : undefined;
}

// ---------------------------------------------------------------- work at a business

/** How much of a free hand's work someone held does at a business: by their trade, health and spirits. */
export function bizEff(m: Pick<BondMark, "sk" | "health" | "mood">): number {
  return (
    (0.8 + m.sk.craft / 25) *
    (0.4 + (0.6 * m.health) / 100) *
    (0.85 + (0.25 * m.mood) / 100)
  );
}

/** Working in a town among free people: more chances to go, and more places to go to. */
export const BIZ_FLIGHT = 1.2;

/** What someone at a business can put by of their own a month (Sundays, odd jobs, a tip). */
export const BIZ_SAVE = 0.06;

/** The youngest who can be set to work at a business (apprentices began at about fourteen). */
export const BIZ_AGE = 14;

/** Whether someone works at a business of the household's (kept there, not at home). */
export function atBusiness(c: Character | undefined): boolean {
  return c?.bond?.work === "biz" && c.bond.biz !== undefined;
}

/** The game, as far as taking someone off a business's books needs it. */
interface Touch {
  touchChar(c: Character): Character;
  lifeChanged(seat: string): void;
}

/**
 * Someone taken off a business of the household's: off its books, and back
 * to the household's home (where the rest of their work is set).
 */
export function leaveBusiness(g: Touch, life: Life, c: Character): void {
  let changed = false;
  for (const pr of life.property ?? []) {
    const list = pr.biz?.bound;
    if (!list?.includes(c.id)) continue;
    pr.biz!.bound = list.filter((x) => x !== c.id);
    if (!pr.biz!.bound.length) delete pr.biz!.bound;
    changed = true;
  }
  if (c.bond?.biz !== undefined || c.bond?.work === "biz") {
    const ch = g.touchChar(c);
    const home = life.bondage?.home ?? ch.bond!.at;
    ch.bond = { ...ch.bond!, at: home, work: "rest" };
    delete ch.bond.biz;
    changed = true;
  }
  if (changed) g.lifeChanged(life.seat);
}
