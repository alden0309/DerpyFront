// CQTUT (r26): making a first life: the same world every time (the 1700
// map on its own seed, run to the first of May, kept once made), and in it
// Thomas or Hannah Hale, a journeyman cooper of Boston, with a widowed
// mother and a sister in town and two coopers next door: one to be a
// friend, one a rival. The server makes the game with this; so do tests.

import {
  pickSitter,
  plainLook,
  sitterOf,
  wantedFor,
  type Wanted,
} from "./Appearance";
import { dayOf } from "./Calendar";
import { makeCharacter } from "./Characters";
import { ConquestGame } from "./Game";
import { journal, meet, touchLife } from "./LifeCore";
import { lifeOfSeat, meOf } from "./LifeQueries";
import { FRAME_COLORS } from "./LifeRules";
import { ageOf } from "./Queries";
import { Rng } from "./Rng";
import { HAIR_TONE_KEYS } from "./Sitters";
import { workState } from "./Trades";
import { provNamed } from "./Tutorial";
import {
  TUT_AGE,
  TUT_BIRTH_DAY,
  TUT_BIRTH_MONTH,
  TUT_FAMILY,
  TUT_FIRST,
  TUT_HOME,
  TUT_SEED,
  TUT_START_DAY,
  TUT_START_MONTH,
  TUT_START_YEAR,
} from "./TutorialCore";
import type {
  Character,
  GameSettings,
  GameState,
  LifePlan,
  MapDef,
  TutorialCast,
} from "./Types";

/** The world the lessons begin in. */
export const TUT_SETTINGS: GameSettings = {
  endYear: 1776,
  difficulty: "easy",
  seed: TUT_SEED,
  start: TUT_START_YEAR,
  tutorial: true,
};

/** The day the life begins: 1 May 1700. */
export const TUT_START = dayOf(TUT_START_YEAR, TUT_START_MONTH, TUT_START_DAY);

let worldJson: string | null = null;

/**
 * The world on the first of May 1700, nobody in it yet: made once (the
 * same seed always makes the same world), and a fresh copy each time.
 */
export function tutorialWorld(map: MapDef): GameState {
  if (!worldJson) {
    const g = ConquestGame.create(map, TUT_SETTINGS, []);
    while (g.s.day < TUT_START && !g.s.over) g.tick();
    worldJson = JSON.stringify(g.s);
  }
  return JSON.parse(worldJson) as GameState;
}

/** The character the lessons are lived as. */
export function tutorialPlan(map: MapDef, female: boolean): LifePlan {
  return {
    origin: "england",
    home: map.provinces.findIndex((p) => p.name === TUT_HOME),
    first: female ? TUT_FIRST.woman : TUT_FIRST.man,
    family: TUT_FAMILY,
    female,
    age: TUT_AGE,
    religion: "puritan",
    face: 0,
    sigil: {
      field: "azure",
      division: "chevron",
      tincture: "or",
      charge: "star",
      chargeTincture: "argent",
    },
    frame: FRAME_COLORS[2],
    motto: "",
    background: "craftsman",
    stats: { dip: 6, mar: 5, ste: 6, int: 5, lea: 6 },
    skills: { persuasion: 2, letters: 2, trade: 1 },
    traits: ["diligent"],
  };
}

/**
 * A first life's game, with one seat: `female` for Hannah, else Thomas.
 * Throws if the life can't begin (it always can: the world is fixed).
 */
export function tutorialGame(
  map: MapDef,
  seat: string,
  name: string,
  female: boolean,
): ConquestGame {
  const g = new ConquestGame(map, tutorialWorld(map));
  const err = g.beginLife(seat, name, tutorialPlan(map, female));
  if (err) throw new Error(`The first life couldn't begin: ${err}`);
  setUpLessons(g, seat);
  g.takeDelta();
  return g;
}

/** The life made ready for its lessons: the shop, the family, the neighbours. */
export function setUpLessons(g: ConquestGame, seat: string): void {
  const s = g.s;
  const life = lifeOfSeat(s, seat)!;
  const cast0 = (id: number | undefined) => {
    const c = id === undefined ? undefined : s.chars[id];
    return c ? g.touchChar(c) : undefined;
  };
  const me = g.touchChar(meOf(s, life)!);
  const p = provNamed(g, TUT_HOME);
  // The lessons' own dice, so the town is the same every time.
  const rng = new Rng({ rng: TUT_SEED ^ 0x5eed });
  const folk = (o: {
    female: boolean;
    age: number;
    first: string;
    family: string;
    father?: number;
    mother?: number;
  }): Character => {
    const c = makeCharacter(s, rng, {
      nation: me.nation,
      culture: me.culture,
      religion: me.religion,
      traits: [],
      ...o,
    });
    c.home = p;
    return g.touchChar(c);
  };
  // Born on 15 June 1679: twenty now, twenty-one in six weeks.
  me.born = dayOf(TUT_START_YEAR - TUT_AGE - 1, TUT_BIRTH_MONTH, TUT_BIRTH_DAY);
  const birthday = dayOf(TUT_START_YEAR, TUT_BIRTH_MONTH, TUT_BIRTH_DAY);
  // Your late father (a cooper), your mother and your sister.
  const father = folk({
    female: false,
    age: 48,
    first: "Josiah",
    family: TUT_FAMILY,
  });
  father.alive = false;
  father.died = { day: s.day - 600, cause: "a fever at 46" };
  const mother = folk({
    female: true,
    age: 45,
    first: "Abigail",
    family: TUT_FAMILY,
  });
  mother.traits = ["honest"];
  father.spouse = mother.id;
  const sister = folk({
    female: true,
    age: 14,
    first: "Patience",
    family: TUT_FAMILY,
    father: father.id,
    mother: mother.id,
  });
  me.father = father.id;
  me.mother = mother.id;
  father.children = [me.id, sister.id];
  mother.children = [me.id, sister.id];
  // Next door, and across the lane: two master coopers.
  const friend = folk({
    female: false,
    age: 29,
    first: "Ezra",
    family: "Thayer",
  });
  friend.role = "master";
  friend.traits = ["generous", "diligent"];
  const wife = folk({
    female: true,
    age: 25,
    first: "Ruth",
    family: "Thayer",
  });
  friend.spouse = wife.id;
  wife.spouse = friend.id;
  const rival = folk({
    female: false,
    age: 31,
    first: "Jonas",
    family: "Pell",
  });
  rival.role = "master";
  rival.traits = ["greedy", "ambitious"];
  // Three faces a newcomer can tell apart: the master, the friend, the rival.
  distinctFaces(s, [cast0(life.job?.employer), friend, rival]);
  const locals = (s.locals[p] ??= []);
  for (const c of [mother, friend, rival])
    if (!locals.includes(c.id)) locals.push(c.id);
  g.localsChanged(p);
  const cast: TutorialCast = {
    master: life.job?.employer ?? -1,
    mother: mother.id,
    sister: sister.id,
    father: father.id,
    friend: friend.id,
    friendWife: wife.id,
    rival: rival.id,
  };
  touchLife(g, life);
  for (const id of [mother.id, sister.id, cast.master, friend.id, rival.id])
    if (id >= 0) meet(g, life, id);
  // A journeyman: the purse grows on a journeyman's pay.
  if (life.job) life.job.rank = 1;
  // You start the day at home (your lodgings), the shop a street away.
  life.area = "home";
  // Nothing comes but the lessons' own while they run (Tutorial.ts).
  workState(g, life).matter = s.day + 400;
  life.cooldowns["fam:colleagues"] = s.day + 400;
  life.cooldowns["fam:masters"] = s.day + 400;
  life.tut = {
    step: 0,
    since: s.day,
    done: [],
    skipped: [],
    cast,
    birthday,
  };
  journal(
    g,
    life,
    `A journeyman cooper of Boston, twenty years old, at ${charNameOf(s, cast.master)}'s shop by the Town Dock. Your mother and your sister Patience keep house in Middle Street.`,
  );
}

/**
 * Each of these given a picture of their own: one whose likeness falls on a
 * picture already taken keeps a near one instead.
 */
function distinctFaces(s: GameState, who: (Character | undefined)[]): void {
  const taken = new Set<string>();
  for (const c of who) {
    if (!c?.alive) continue;
    const age = ageOf(s, c);
    const want = wantedFor(c, age);
    let pick = sitterOf(c, age);
    // Another hair, a wig or a hat, a better coat, a Dutch face (Boston
    // has a few): the gallery's next nearest.
    const others: Partial<Wanted>[] = [
      ...HAIR_TONE_KEYS.map((tone) => ({ tone })),
      { wig: true },
      { hat: true },
      { cls: "merchant" },
      { people: "dutch" },
      { cls: "learned" },
    ];
    for (const o of others) {
      if (!taken.has(pick.id)) break;
      pick = pickSitter({ ...want, ...o });
    }
    if (pick.id !== sitterOf(c, age).id) c.look = plainLook(pick.id);
    taken.add(pick.id);
  }
}

function charNameOf(s: GameState, id: number): string {
  const c = s.chars[id];
  return c ? `${c.first} ${c.family}` : "a master cooper";
}
