// CQ24 (r24): the scenes of a sacred place plundered (SacredPlunder.ts): what
// the dig turned up, and the day its people come for what was taken. They're
// the player's own (Legends' "legend-" scenes are kept from other seats), can
// happen anywhere (EVENTS r21's tags), and rest with Legends' family.
// Told in the period's voice, with the people shown as people with a claim,
// and nothing gory.

import { dateOf } from "./Calendar";
import { tag } from "./EventPlaces";
import { progressOf } from "./Legends";
import { LEGENDS } from "./LegendsData";
import type { LifeEventDef } from "./LifeEvents";
import {
  amendsOf,
  placeName,
  PLUNDER_FINDS,
  plunderedMark,
  reckon,
  RECKONING,
  sacredPeople,
  thePeople,
} from "./SacredPlunder";

const peopleName = (s: Parameters<typeof sacredPeople>[0], i: number) => {
  const def = LEGENDS[i];
  const n = def ? sacredPeople(s, def) : -1;
  return thePeople(s.nations[n]?.name ?? "its people");
};

const PLUNDERED_EVENT: LifeEventDef = {
  key: "legend-plundered",
  pool: "raised",
  cooldown: 0,
  scene: "woods",
  where: tag(""),
  title: (_g, _l, ctx) => {
    const def = LEGENDS[ctx.i];
    return def ? `Digging at ${placeName(def)}` : "A dig";
  },
  body: (g, life, ctx) => {
    const def = LEGENDS[ctx.i];
    const find = def ? PLUNDER_FINDS[def.key]?.[ctx.f] : undefined;
    if (!def || !find) return "";
    const x = progressOf(life, def.key);
    const people = peopleName(g.s, ctx.i);
    return `${find.text}\n\n${
      ctx.c > 0
        ? `It comes to ${ctx.c} coins.`
        : "It comes to nothing you can sell."
    }${x?.relic ? ` You keep ${x.relic}.` : ""} Word of it will travel: ${people} will not forget who dug there${
      ctx.c > 0 || x?.relic
        ? ", and in time they'll come for what was taken"
        : ""
    }.`;
  },
  choices: [
    {
      label: "So be it",
      tip: "Journal › Legends keeps what you did, and what history knows of the place.",
      apply: () => undefined,
    },
  ],
};

const RECKONING_EVENT: LifeEventDef = {
  key: "legend-reckoning",
  pool: "raised",
  cooldown: 0,
  scene: "village",
  where: tag(""),
  title: (_g, _l, ctx) => {
    const def = LEGENDS[ctx.i];
    return def ? `They've come about ${placeName(def)}` : "Visitors";
  },
  body: (g, life, ctx) => {
    const def = LEGENDS[ctx.i];
    if (!def) return "";
    const x = progressOf(life, def.key);
    const mark = plunderedMark(g.s, def);
    const when = mark ? ` in ${dateOf(mark.day).year}` : "";
    return `Men of ${peopleName(g.s, ctx.i)} come to find you. They know who dug at ${placeName(def)}${when}, and they've come, civilly enough, for what was taken from it${
      x?.relic ? `: above all ${x.relic}` : ""
    }. They won't go away with nothing.`;
  },
  choices: [
    {
      label: (_g, life, ctx) => {
        const x = progressOf(life, LEGENDS[ctx.i]?.key ?? "");
        return x?.got
          ? `Give it all back (${x.got} coins)`
          : "Give it all back";
      },
      tip: "What you kept goes home, and what it came to. Their anger eases (their nation's opinion of yours much less bitter), and those who know you think better of you.",
      blocked: (_g, life, ctx) => {
        const x = progressOf(life, LEGENDS[ctx.i]?.key ?? "");
        return (x?.got ?? 0) > life.purse ? `Needs ${x?.got} coins` : null;
      },
      apply: (g, life, ctx) => reckon(g, life, ctx.i, "returned", true),
    },
    {
      label: (_g, life, ctx) =>
        `Pay them amends (${amendsOf(progressOf(life, LEGENDS[ctx.i]?.key ?? ""))} coins)`,
      tip: "They take the coins and go, and you keep what you kept. Their nation doesn't forgive it.",
      blocked: (_g, life, ctx) => {
        const n = amendsOf(progressOf(life, LEGENDS[ctx.i]?.key ?? ""));
        return life.purse < n ? `Needs ${n} coins` : null;
      },
      apply: (g, life, ctx) => reckon(g, life, ctx.i, "paid", true),
    },
    {
      label: "Talk them round",
      tip: `Persuasion: they go with nothing. Failed, they take what they came for (half your purse, at most what it came to, and what you kept), and someone's hurt.`,
      check: RECKONING.talk,
      apply: (g, life, ctx, pass) => reckon(g, life, ctx.i, "talked", pass),
    },
    {
      label: "Stand your ground",
      tip: `Fighting: they're sent off (renown +2, and their nation angrier still). Failed, you're hurt (health −${RECKONING.hurt}) and they take what they came for.`,
      check: RECKONING.fight,
      apply: (g, life, ctx, pass) => reckon(g, life, ctx.i, "fought", pass),
    },
    {
      label: "Let them take it",
      tip: "They take what you kept, and half your purse (at most what it came to).",
      apply: (g, life, ctx) => reckon(g, life, ctx.i, "lost", false),
    },
  ],
};

/** The plunder's scenes, for Legends' list (LegendEvents.ts). */
export function plunderEvents(): LifeEventDef[] {
  return [PLUNDERED_EVENT, RECKONING_EVENT];
}

/** Their quiet course, left unanswered: so be it; they take it. */
export function plunderQuiet(): Record<string, number> {
  return { "legend-plundered": 0, "legend-reckoning": 4 };
}
