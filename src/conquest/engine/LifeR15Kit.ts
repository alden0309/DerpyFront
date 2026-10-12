// EVENTS (r15): the small tools the round's new events are written with:
// what a choice comes to, who's about (never another player), and when an
// event can happen (a time of life, a season, a place, a station).

import { dateOf } from "./Calendar";
import { npc, played, townsfolk } from "./EventPacing";
import type { ConquestGame } from "./Game";
import {
  addRenown,
  addStress,
  earn,
  gainTrait,
  gainXp,
  heal,
  hurt,
  journal,
  loseTrait,
  remembers,
  touchLife,
} from "./LifeCore";
import type { LCtx } from "./LifeEvents";
import {
  ageOfLife,
  isChildLife,
  lifeIsNative,
  meOf,
  siblingsOf,
} from "./LifeQueries";
import { isFeverSeason, isHurricaneSeason, isWinter } from "./Map";
import { holdsPost } from "./OneOffice";
import { ageOf, settlers } from "./Queries";
import { isHarvest } from "./Seasons";
import type { Character, Life, Skill, TraitId } from "./Types";

// ---------------------------------------------------------------- what it comes to

export interface Fx {
  coins?: number;
  renown?: number;
  stress?: number;
  health?: number;
  favor?: number;
  xp?: Partial<Record<Skill, number>>;
  gain?: TraitId;
  lose?: TraitId;
}

export function fx(
  g: ConquestGame,
  life: Life,
  f: Fx,
  cause = "misadventure",
): void {
  if (f.coins) earn(g, life, f.coins);
  if (f.renown) addRenown(g, life, f.renown);
  if (f.stress) addStress(g, life, f.stress);
  if (f.favor) touchLife(g, life).favor = Math.max(0, life.favor + f.favor);
  for (const [k, v] of Object.entries(f.xp ?? {}))
    gainXp(g, life, k as Skill, v ?? 0);
  if (f.gain) gainTrait(g, life, f.gain);
  if (f.lose) loseTrait(g, life, f.lose);
  if (f.health) {
    if (f.health > 0) heal(g, life, f.health);
    else hurt(g, life, -f.health, cause);
  }
}

export const say = (
  g: ConquestGame,
  life: Life,
  text: string,
  tone?: "good" | "bad",
) => journal(g, life, text, tone);

/** "Needs 5 coins", or nothing. */
export const poor = (life: Life, n: number) =>
  life.purse < n ? `Needs ${n} coins` : null;

/** A coin-costing choice's label: "Buy it (3 coins)". */
export const costs = (label: string, n: number) => `${label} (${n} coins)`;

/** The person an event is about (in its context), if a computer character. */
export function who(g: ConquestGame, ctx: LCtx): Character | undefined {
  return npc(g.s, g.s.chars[ctx.c]);
}

/** They remember what you did (only the computer's people: players decide for themselves). */
export function like(
  g: ConquestGame,
  life: Life,
  ctx: LCtx,
  why: string,
  v: number,
  years = 3,
): void {
  const c = who(g, ctx);
  if (c?.alive) remembers(g, life, g.char(c.id), why, v, years);
}

export const he = (c: Character | undefined) => (c?.female ? "she" : "he");
export const him = (c: Character | undefined) => (c?.female ? "her" : "him");
export const his = (c: Character | undefined) => (c?.female ? "her" : "his");
export const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

export function nameOf(g: ConquestGame, ctx: LCtx): string {
  const c = g.s.chars[ctx.c];
  return c ? `${c.first}` : "they";
}

// ---------------------------------------------------------------- when

export const me = (g: ConquestGame, life: Life) => meOf(g.s, life)!;
export const month = (g: ConquestGame) => dateOf(g.s.day).month;
export const year = (g: ConquestGame) => dateOf(g.s.day).year;
export const here = (g: ConquestGame, life: Life) =>
  g.map.provinces[life.prov]?.name ?? "town";
export const lat = (g: ConquestGame, life: Life) =>
  g.map.provinces[life.prov]?.lat ?? 40;
export const age = (g: ConquestGame, life: Life) => ageOfLife(g.s, life);

export const adult = (g: ConquestGame, life: Life) => !isChildLife(g.s, life);
export const child = (g: ConquestGame, life: Life) =>
  isChildLife(g.s, life) && age(g, life) >= 6;
export const young = (g: ConquestGame, life: Life) =>
  age(g, life) >= 16 && age(g, life) <= 25;
export const prime = (g: ConquestGame, life: Life) =>
  age(g, life) >= 26 && age(g, life) <= 54;
export const old = (g: ConquestGame, life: Life) => age(g, life) >= 55;
export const native = (g: ConquestGame, life: Life) => lifeIsNative(g.s, life);
export const colonist = (g: ConquestGame, life: Life) =>
  !lifeIsNative(g.s, life);
export const atHome = (_g: ConquestGame, life: Life) =>
  life.prov === life.home && !life.travel;

/** How many settlers the town has. */
export const people = (g: ConquestGame, life: Life) =>
  settlers(g.s.provinces[life.prov]);
/** A town worth the name (a market, a church, streets). */
export const town = (g: ConquestGame, life: Life) =>
  colonist(g, life) && people(g, life) >= 600;
/** The edge of things: few settlers, and the woods close. */
export const frontier = (g: ConquestGame, life: Life) =>
  colonist(g, life) && people(g, life) < 600;
export const port = (g: ConquestGame, life: Life) =>
  !!g.s.provinces[life.prov]?.b.port;
export const coastal = (g: ConquestGame, life: Life) =>
  !!g.map.provinces[life.prov]?.coastal;

export const winter = (g: ConquestGame, life: Life) =>
  isWinter(lat(g, life), month(g));
export const northern = (g: ConquestGame, life: Life) => lat(g, life) >= 39;
export const southern = (g: ConquestGame, life: Life) => lat(g, life) < 35;
export const harvest = (g: ConquestGame, life: Life) =>
  isHarvest(lat(g, life), month(g));
export const feverSeason = (g: ConquestGame, life: Life) =>
  isFeverSeason(lat(g, life), month(g));
export const hurricaneSeason = (g: ConquestGame, life: Life) => {
  const p = g.map.provinces[life.prov];
  return !!p && isHurricaneSeason(p.lat, p.lon, month(g));
};
export const months =
  (from: number, to: number) =>
  (g: ConquestGame): boolean => {
    const m = month(g);
    return from <= to ? m >= from && m <= to : m >= from || m <= to;
  };

export const warNow = (g: ConquestGame, life: Life) => {
  const n = me(g, life).nation;
  return g.s.wars.some((w) => w.a === n || w.b === n);
};

/** Your husband or wife, if alive and nobody's played character. */
export function spouse(g: ConquestGame, life: Life): Character | undefined {
  const c = g.s.chars[me(g, life).spouse];
  return c?.alive && !played(g.s, c.id) ? c : undefined;
}

/** Your children at home (alive, here, not played), youngest first. */
export function kids(
  g: ConquestGame,
  life: Life,
  from = 0,
  to = 99,
): Character[] {
  const s = g.s;
  return me(g, life)
    .children.map((k) => s.chars[k])
    .filter(
      (c): c is Character =>
        !!c?.alive &&
        !c.abroad &&
        !played(s, c.id) &&
        ageOf(s, c) >= from &&
        ageOf(s, c) <= to,
    )
    .sort((a, b) => b.born - a.born);
}

/** Grandchildren living. */
export function grandkids(g: ConquestGame, life: Life): Character[] {
  const s = g.s;
  const out: Character[] = [];
  for (const k of me(g, life).children)
    for (const gk of s.chars[k]?.children ?? []) {
      const c = s.chars[gk];
      if (c?.alive && !played(s, c.id)) out.push(c);
    }
  return out;
}

/** A brother or sister, alive, grown, not played, living elsewhere. */
export function sibling(g: ConquestGame, life: Life): Character | undefined {
  const s = g.s;
  return siblingsOf(s, me(g, life)).find(
    (c) =>
      c.alive &&
      !c.abroad &&
      !played(s, c.id) &&
      ageOf(s, c) >= 16 &&
      c.home !== undefined &&
      c.home !== life.prov,
  );
}

/** Someone of the town (grown, not played), chosen without disturbing the game's dice. */
export function local(
  g: ConquestGame,
  life: Life,
  salt: number,
  pick?: (c: Character) => boolean,
): Character | undefined {
  return townsfolk(g, life, salt, pick);
}

export const owns = (life: Life, kind: "house" | "land" | "business") =>
  (life.property ?? []).some((p) => p.kind === kind && !p.leased);
export const hasBoat = (life: Life) => (life.boats ?? []).length > 0;
export const hasPeople = (life: Life) => (life.people ?? []).length > 0;
export const inOffice = (g: ConquestGame, life: Life) => holdsPost(g.s, life.c);
export const genteel = (life: Life) =>
  life.lifestyle === "genteel" || life.lifestyle === "grand";
