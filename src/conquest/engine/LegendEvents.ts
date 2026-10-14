// DLC (r21): the scenes of Legends (Legends.ts raises them): talk of a
// legend, a trail followed to its end, and a sacred place you walked that
// someone now means harm. They're a player's own (redacted for other seats),
// say where they happen (EVENTS r21's tags: anywhere), and rest together as
// a family. Nothing here lets anyone take anything from a sacred place.

import { registerFamily } from "./EventPacing";
import { tag } from "./EventPlaces";
import { secretNote } from "./IntrigueCore";
import { keepPlace, rememberRumour } from "./Legends";
import { LEGENDS } from "./LegendsData";
import { addRenown, addStress, gainXp, spend } from "./LifeCore";
import type { LifeEventDef } from "./LifeEvents";

/** Speaking for a sacred place: the checks, and the price of buying the man off. */
export const KEEP = {
  speak: { skill: "persuasion" as const, dc: 14 },
  write: { skill: "letters" as const, dc: 13 },
  pay: 10,
};

const RUMOUR_EVENT: LifeEventDef = {
  key: "legend-rumour",
  pool: "raised",
  cooldown: 0,
  scene: (_g, _l, ctx) =>
    LEGENDS[ctx.i]?.kind === "sacred" ? "councilfire" : "tavern",
  where: tag(""),
  title: (_g, _l, ctx) =>
    LEGENDS[ctx.i]?.kind === "sacred"
      ? "A place that matters"
      : "A story going round",
  body: (_g, _l, ctx) => {
    const def = LEGENDS[ctx.i];
    if (!def) return "";
    return `${def.rumour}\n\n${
      def.kind === "sacred"
        ? "It isn't a story told to strangers. Learning more would mean earning their trust first, and keeping what you're told."
        : "It's the kind of story most people laugh off. Following it would take books, long roads and a master's skill, and it might come to nothing."
    }`;
  },
  choices: [
    {
      label: "Remember it",
      tip: "It goes in Journal › Legends, with the first step of its trail.",
      apply: (g, life, ctx) =>
        rememberRumour(g, life, ctx.i, ctx.at ?? life.prov),
    },
    {
      label: "Let it go",
      tip: "Nothing changes. You may hear of it again some day.",
      apply: () => undefined,
    },
  ],
};

const FOUND_EVENT: LifeEventDef = {
  key: "legend-found",
  pool: "raised",
  cooldown: 0,
  scene: (_g, _l, ctx) =>
    LEGENDS[ctx.i]?.kind === "sacred" ? "village" : "woods",
  where: tag(""),
  title: (_g, _l, ctx) => LEGENDS[ctx.i]?.name ?? "A legend",
  body: (_g, _l, ctx) => LEGENDS[ctx.i]?.outcomes[ctx.o]?.text ?? "",
  choices: [
    {
      label: "So it was",
      tip: "Journal › Legends keeps what you found, and what history knows of it.",
      apply: () => undefined,
    },
  ],
};

const KEEP_EVENT: LifeEventDef = {
  key: "legend-keep",
  pool: "raised",
  cooldown: 0,
  scene: "governor",
  where: tag(""),
  title: (_g, _l, ctx) =>
    `${LEGENDS[ctx.i]?.name.replace(/,.*$/, "") ?? "The place"} is in danger`,
  body: (_g, _l, ctx) =>
    `Word comes from the people who took you to ${LEGENDS[ctx.i]?.name.replace(/,.*$/, "") ?? "the place"}: a surveyor for a land company has been there with his chain and his marks, and a man with a spade and a map says there's treasure in it. They remember your promise.`,
  choices: [
    {
      label: "Go and speak for the place",
      tip: "Persuasion: the surveyor marks his line elsewhere and the treasure-seeker is sent off (renown +4). Failed, they laugh at you, and you've tried.",
      check: KEEP.speak,
      apply: (g, life, ctx, pass) => {
        keepPlace(g, life, ctx.i, pass);
        if (pass)
          secretNote(
            g,
            life,
            "The surveyor marks his line elsewhere, and the man with the spade goes off grumbling.",
            "good",
          );
        else addStress(g, life, 6);
      },
    },
    {
      label: "Write to the governor",
      tip: "Letters: an order that the place is to be left alone (renown +4). Failed, nobody answers.",
      check: KEEP.write,
      apply: (g, life, ctx, pass) => {
        gainXp(g, life, "letters", 10);
        keepPlace(g, life, ctx.i, pass);
        if (!pass) addStress(g, life, 4);
      },
    },
    {
      label: `Pay the treasure-seeker to dig somewhere else (${KEEP.pay} coins)`,
      tip: "It works, and costs you. Renown +4.",
      blocked: (_g, life) =>
        life.purse < KEEP.pay ? `Needs ${KEEP.pay} coins` : null,
      apply: (g, life, ctx) => {
        spend(g, life, KEEP.pay);
        keepPlace(g, life, ctx.i, true);
      },
    },
    {
      label: "Do nothing",
      tip: "You break your promise (renown −3).",
      apply: (g, life) => addRenown(g, life, -3),
    },
  ],
};

const ALL = [RUMOUR_EVENT, FOUND_EVENT, KEEP_EVENT];
let paced = false;

/** Legends' scenes, registered with the event pacing the first time they're looked up. */
export function legendEvents(): LifeEventDef[] {
  if (!paced) {
    paced = true;
    registerFamily(
      "legend",
      ALL.map((d) => d.key),
      60,
    );
  }
  return ALL;
}

/** Each scene's quiet course, left unanswered. */
export function legendQuiet(): Record<string, number> {
  return { "legend-rumour": 0, "legend-found": 0, "legend-keep": 1 };
}
