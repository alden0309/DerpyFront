// EVENTS (r21): the makings of the round's events of place (the tavern's
// goings-on, home's, the docks', a stranger's abroad). Each is plain data:
// where it happens (EventPlaces.ts' words), who's in it (someone of the
// place, never another player), and choices whose outcomes are numbers, so
// the tip on every choice is worked out from what it really does. Each
// place's events rest together as a family (EventPacing.ts).

import { registerFamily } from "./EventPacing";
import { tag } from "./EventPlaces";
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
  spend,
} from "./LifeCore";
import type { LCtx, LifeChoice, LifeEventDef } from "./LifeEvents";
import { adult, local } from "./LifeR15Kit";
import { SKILL_NAMES } from "./LifeRules";
import { charName } from "./Queries";
import { TRAITS } from "./Rules";
import { addFavor } from "./Standing";
import type { Character, Life, Skill, TraitId } from "./Types";

/** What a choice comes to. */
export interface PFx {
  coins?: number;
  renown?: number;
  stress?: number;
  health?: number;
  favor?: number;
  xp?: Partial<Record<Skill, number>>;
  gain?: TraitId;
  lose?: TraitId;
  /** What the one it's about thinks of you for it (a computer character; remembered three years). */
  like?: number;
  /** Their reason, as they'd put it. */
  why?: string;
  /** Written in your journal ("{first}", "{name}", "{he}", "{his}", "{him}", "{here}"). */
  say: string;
}

export interface PChoice {
  label: string;
  /** Coins paid on choosing it (the price chip on the button). */
  cost?: number;
  /** A skill tested, and how hard. */
  check?: [Skill, number];
  /** No skill to it: the chance it goes well. */
  odds?: number;
  /** A few words before the reckoning. */
  tip?: string;
  /** Why it can't be chosen now, if it can't. */
  need?: (g: ConquestGame, life: Life) => string | null;
  win: PFx;
  lose?: PFx;
}

export interface PDef {
  /** "tvn-fiddler": the word before the dash is its family. */
  key: string;
  /** Where it happens, in EventPlaces' words ("town @tavern inside"). */
  where: string;
  title: string;
  body: string;
  choices: PChoice[];
  /** Someone of the place it's about (grown, not played). */
  who?: (c: Character, g: ConquestGame, life: Life) => boolean;
  /** Only when this holds. */
  when?: (g: ConquestGame, life: Life) => boolean;
  /** Children too (most are for the grown). */
  young?: boolean;
  weight?: number;
  scene?: string;
}

/** Days before one of these comes again for a line. */
export const PLACE_EVENT_REST = 1460;

// ---------------------------------------------------------------- words

const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

function words(f: PFx): string {
  const out: string[] = [];
  if (f.coins) out.push(`${signed(f.coins)} coins`);
  if (f.renown) out.push(`${signed(f.renown)} renown`);
  if (f.favor) out.push(`${signed(f.favor)} favour`);
  if (f.health) out.push(`${signed(f.health)} health`);
  if (f.stress) out.push(`${signed(f.stress)} stress`);
  for (const [k, v] of Object.entries(f.xp ?? {}))
    if (v) out.push(`+${SKILL_NAMES[k as Skill].toLowerCase()}`);
  if (f.like) out.push(`${signed(f.like)} with {first}`);
  if (f.gain) out.push(TRAITS[f.gain].name.toLowerCase());
  if (f.lose) out.push(`no longer ${TRAITS[f.lose].name.toLowerCase()}`);
  return out.join(", ");
}

const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/** The tip on a choice: what it does, from the same numbers it does it with. */
export function tipOf(c: PChoice): string {
  const lead = c.tip ? `${c.tip}. ` : "";
  const w = words(c.win);
  const l = c.lose ? words(c.lose) : "";
  if (c.check && c.lose)
    return `${lead}Done well: ${w || "it goes well"}. If not: ${l || "nothing comes of it"}.`;
  if (c.odds !== undefined && c.lose)
    return `${lead}${Math.round(c.odds * 100)}% it goes well${w ? `: ${w}` : ""}; if not: ${l || "nothing comes of it"}.`;
  if (!w) return c.tip ? `${c.tip}.` : "Nothing gained, nothing lost.";
  return `${lead}${cap(w)}.`;
}

/** "{first}", "{name}", "{he}", "{He}", "{his}", "{His}", "{him}", "{here}". */
export function fillIn(
  g: ConquestGame,
  life: Life,
  ctx: LCtx,
  text: string,
): string {
  const c = ctx.c !== undefined ? g.s.chars[ctx.c] : undefined;
  const he = c?.female ? "she" : "he";
  const his = c?.female ? "her" : "his";
  const him = c?.female ? "her" : "him";
  return text
    .replace(/\{first\}/g, c?.first ?? "they")
    .replace(/\{name\}/g, c ? charName(c) : "someone")
    .replace(/\{he\}/g, he)
    .replace(/\{He\}/g, cap(he))
    .replace(/\{his\}/g, his)
    .replace(/\{His\}/g, cap(his))
    .replace(/\{him\}/g, him)
    .replace(/\{here\}/g, g.map.provinces[life.prov]?.name ?? "town");
}

// ---------------------------------------------------------------- doing it

function apply(
  g: ConquestGame,
  life: Life,
  ctx: LCtx,
  f: PFx,
  title: string,
): void {
  if (f.coins && f.coins > 0) earn(g, life, f.coins);
  if (f.coins && f.coins < 0) spend(g, life, -f.coins);
  if (f.renown) addRenown(g, life, f.renown);
  if (f.stress) addStress(g, life, f.stress);
  if (f.favor) addFavor(g, life, f.favor);
  for (const [k, v] of Object.entries(f.xp ?? {}))
    gainXp(g, life, k as Skill, v ?? 0);
  if (f.gain) gainTrait(g, life, f.gain);
  if (f.lose) loseTrait(g, life, f.lose);
  const c = ctx.c !== undefined ? g.s.chars[ctx.c] : undefined;
  if (f.like && c?.alive && !g.s.lives.some((l) => l.c === c.id))
    remembers(
      g,
      life,
      g.char(c.id),
      f.why ??
        (f.like > 0
          ? `A kindness: ${title.toLowerCase()}`
          : `A slight: ${title.toLowerCase()}`),
      f.like,
      3,
    );
  const tone =
    (f.health ?? 0) < 0 || (f.coins ?? 0) < 0 || (f.stress ?? 0) >= 5
      ? "bad"
      : (f.coins ?? 0) > 0 || (f.renown ?? 0) > 0 || (f.like ?? 0) > 0
        ? "good"
        : undefined;
  journal(g, life, fillIn(g, life, ctx, f.say), tone);
  if (f.health) {
    if (f.health > 0) heal(g, life, f.health);
    else hurt(g, life, -f.health, title.toLowerCase());
  }
}

function choiceOf(d: PDef, c: PChoice): LifeChoice {
  return {
    label: (g, life, ctx) => {
      const l = fillIn(g, life, ctx, c.label);
      return c.cost ? `${l} (${c.cost} ${c.cost === 1 ? "coin" : "coins"})` : l;
    },
    tip: (g, life, ctx) => fillIn(g, life, ctx, tipOf(c)),
    check: c.check ? { skill: c.check[0], dc: c.check[1] } : undefined,
    blocked:
      c.cost || c.need
        ? (g, life) => {
            if (c.cost && life.purse < c.cost) return `Needs ${c.cost} coins`;
            return c.need?.(g, life) ?? null;
          }
        : undefined,
    apply: (g, life, ctx, pass) => {
      if (c.cost) spend(g, life, c.cost);
      const good = c.check
        ? pass
        : c.odds !== undefined
          ? g.rng.chance(c.odds)
          : true;
      apply(g, life, ctx, good ? c.win : (c.lose ?? c.win), d.title);
    },
  };
}

let salts = 0x21f0;

/** An event of place, made from its data. */
export function placeEvent(d: PDef): LifeEventDef {
  const salt = salts++;
  return {
    key: d.key,
    pool: "any",
    weight: d.weight,
    cooldown: PLACE_EVENT_REST,
    where: tag(d.where),
    scene: d.scene,
    when: (g, life): LCtx | null => {
      if (!d.young && !adult(g, life)) return null;
      if (d.when && !d.when(g, life)) return null;
      if (!d.who) return {};
      const c = local(g, life, salt, (x) => d.who!(x, g, life));
      return c ? { c: c.id } : null;
    },
    title: (g, life, ctx) => fillIn(g, life, ctx, d.title),
    body: (g, life, ctx) => fillIn(g, life, ctx, d.body),
    choices: d.choices.map((c) => choiceOf(d, c)),
  };
}

/** A place's events, with how long its family rests after one of them. */
export function placeFamily(
  family: string,
  rest: number,
  defs: PDef[],
): LifeEventDef[] {
  for (const d of defs)
    if (!d.key.startsWith(`${family}-`))
      throw new Error(`PlaceKit: ${d.key} isn't of ${family}`);
  registerFamily(family, [], rest);
  return defs.map(placeEvent);
}
