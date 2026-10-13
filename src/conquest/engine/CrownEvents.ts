// CROWN (r18): the scene of a petition granted. A player who governs is
// asked who'll lead the expedition the crown sends: himself (his character
// goes with the army, and he marches it), or the crown's general (the
// computer marches it on the town). Left unanswered, the general leads.
// Nothing in it speaks for another player.

import { formatDate } from "./Calendar";
import { crownOf } from "./CrownCore";
import { chooseLead } from "./CrownPetition";
import { regimentsWords } from "./CrownRegiments";
import { registerFamily } from "./EventPacing";
import type { ConquestGame } from "./Game";
import type { LifeEventDef } from "./LifeEvents";

const askById = (g: ConquestGame, id: number) =>
  crownOf(g.s).asks.find((a) => a.id === id);

const CROWN_EVENTS: LifeEventDef[] = [
  {
    key: "crown-granted",
    pool: "raised",
    cooldown: 0,
    scene: "governor",
    title: (g, _life, ctx) =>
      `An expedition for ${g.map.provinces[ctx.p]?.name ?? "the town"}`,
    body: (g, _life, ctx) => {
      const a = askById(g, ctx.a);
      const place = g.map.provinces[ctx.p]?.name ?? "the town";
      if (!a) return `The expedition to ${place} is over.`;
      const N = g.s.nations[a.n];
      const what = regimentsWords(N.adjective, a.regs ?? 0, a.guns ?? 0);
      return `The crown has granted your petition. ${what}${a.ships ? `, with a squadron of ${a.ships} ships,` : ""} sail for ${place}, and should land about ${formatDate(a.lands ?? g.s.day)}${a.men ? `, to be joined by the ${a.men} regiment${a.men === 1 ? "" : "s"} the colony raises` : ""}.\n\nThe crown sends a general of its own with them. You may take the command yourself: you'd go with the army, and march it on ${place} at your own pace and peril. Or leave it to him, and the army marches on the town as soon as it lands.`;
    },
    choices: [
      {
        label: "Command it yourself",
        tip: "Your character goes with the army; you march it (from your army's panel). A victory is yours, and so is a defeat.",
        apply: (g, life, ctx) => chooseLead(g, life, ctx.a, true),
      },
      {
        // Unanswered, the crown's general leads.
        label: "Leave it to the crown's general",
        tip: "He marches on the town as soon as it lands. You can still ride with it.",
        apply: (g, life, ctx) => chooseLead(g, life, ctx.a, false),
      },
    ],
  },
];

let paced = false;

/** The scenes, registered with the event pacing the first time they're looked up. */
export function crownEvents(): LifeEventDef[] {
  if (!paced) {
    paced = true;
    registerFamily(
      "crown",
      CROWN_EVENTS.map((d) => d.key),
      30,
    );
  }
  return CROWN_EVENTS;
}

/** The quiet course each scene takes if it's left unanswered (a choice's index). */
export function crownQuiet(): Record<string, number> {
  return { "crown-granted": 1 };
}
