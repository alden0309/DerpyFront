// WAR (r17): the scene of a plot in a town under foreign rule. It's raised
// for each player living in the town (or there) when its people's plot
// forms: join it, lead it, inform on it, or keep out, with the odds of its
// first night shown before you choose, from the same reckoning the night is
// rolled from. The rising itself uses the movements' scenes (the drums in
// the street, the standard raised, the victory, the lists of names).
// Nothing in it speaks for another player: a plot led by a player names
// them as its leader, which they are.

import { formatDate } from "./Calendar";
import { registerFamily } from "./EventPacing";
import type { ConquestGame } from "./Game";
import { journal } from "./LifeCore";
import type { LifeEventDef } from "./LifeEvents";
import { lifeOfChar } from "./LifeQueries";
import { chanceWords } from "./Odds";
import { charName } from "./Queries";
import { INFORM, plotInform, plotJoin, plotLead } from "./Reclaim";
import { RISING, risingOdds, townRisingOf, yokeOf } from "./ReclaimCore";
import type { Life, Movement } from "./Types";

const movementOf = (g: ConquestGame, id: number): Movement | undefined =>
  g.s.movements.find((m) => m.id === id);

const live = (g: ConquestGame, id: number) => {
  const m = movementOf(g, id);
  return m && (m.status === "brewing" || m.status === "risen") ? m : undefined;
};

function tell(g: ConquestGame, life: Life, err: string | null): void {
  if (err) journal(g, life, `It couldn't be done: ${err}`);
}

/** The odds of a plot's first night, in words: what the scene and the town's page show. */
export function nightWords(g: ConquestGame, m: Movement): string {
  const s = g.s;
  const o = risingOdds(s, g.w, m);
  const R = s.nations[m.against];
  const words = (p: number) => `${chanceWords(p)}`;
  return `If it rises: found out before it begins ${words(o.found)}; takes the town ${words(o.seize)} (${o.men} men against ${o.garrison ? `a garrison of ${o.garrison}` : "no garrison"}); beaten in the streets ${words(o.beaten)}. Then it must hold the town ${RISING.holdMonths} months against the ${R.adjective}${o.relief ? `: ${o.relief} of their soldiers are within reach` : ", who have no soldiers near"}.`;
}

const RECLAIM_EVENTS: LifeEventDef[] = [
  {
    key: "town-plot",
    pool: "raised",
    cooldown: 0,
    scene: (g, _life, ctx) =>
      g.s.nations[movementOf(g, ctx.m)?.people ?? -1]?.kind === "native"
        ? "councilfire"
        : "tavern",
    title: (g, _life, ctx) =>
      `A plot in ${g.map.provinces[ctx.p]?.name ?? "the town"}`,
    body: (g, _life, ctx) => {
      const s = g.s;
      const m = movementOf(g, ctx.m);
      const tr = m ? townRisingOf(s, m) : undefined;
      if (!m || !tr) return "Talk of a plot, and then nothing more.";
      const place = g.map.provinces[ctx.p]?.name ?? "the town";
      const R = s.nations[m.against];
      const O = s.nations[tr.old];
      const y = yokeOf(s, ctx.p);
      const leader = s.chars[m.leader];
      const aim =
        tr.aim === "expel"
          ? `take ${place} back for the ${O.name.replace(/^the /, "")}`
          : tr.aim === "free"
            ? `make ${place} a free town`
            : `give ${place} back to ${O.name}`;
      return `${O.adjective} townsfolk have been meeting at night in the back rooms of ${place}. They mean to rise against the ${R.adjective} and ${aim}. Its leader is ${charName(leader)}${lifeOfChar(s, m.leader) ? "" : ""}; ${m.members.length} ${m.members.length === 1 ? "is" : "are"} sworn besides, and they say the day is about ${formatDate(m.due)}.${y ? ` The town's ferment stands at ${Math.round(y.ferment)}.` : ""}\n\n${nightWords(g, m)}`;
    },
    choices: [
      {
        label: "Swear yourself to it",
        tip: "Join it: its fate is yours. If it wins, renown; if it's broken, the lists of names, or worse.",
        blocked: (g, life, ctx) => {
          const m = live(g, ctx.m);
          if (!m) return "It's over";
          if (m.leader === life.c || m.members.includes(life.c))
            return "You're sworn to it";
          return null;
        },
        apply: (g, life) => tell(g, life, plotJoin(g, life)),
      },
      {
        label: "Lead it",
        tip: "Take it over: you call the rising when it's ready (support 40, three sworn), and choose what it's for.",
        blocked: (g, life, ctx) => {
          const m = live(g, ctx.m);
          if (!m || m.status !== "brewing") return "It's past that";
          if (lifeOfChar(g.s, m.leader)) return "Another player leads it";
          if (life.renown < 10)
            return "They won't follow an unknown (renown 10)";
          return null;
        },
        apply: (g, life) => tell(g, life, plotLead(g, life)),
      },
      {
        label: "Inform on it",
        tip: `Its rulers take its ringleaders and pay you ${INFORM.reward} coins; 1 in 3 its people learn who talked, and don't forget it.`,
        blocked: (g, life, ctx) => {
          const m = live(g, ctx.m);
          if (!m || m.status !== "brewing") return "It's past that";
          if (m.leader === life.c || m.members.includes(life.c))
            return "You're sworn to it";
          return null;
        },
        apply: (g, life) => tell(g, life, plotInform(g, life)),
      },
      {
        // Unanswered, you keep out of it.
        label: "Keep out of it",
        tip: "It's none of yours. Nothing changes.",
        apply: () => {},
      },
    ],
  },
];

let paced = false;

/** The scenes, registered with the event pacing the first time they're looked up. */
export function reclaimEvents(): LifeEventDef[] {
  if (!paced) {
    paced = true;
    registerFamily(
      "reclaim",
      RECLAIM_EVENTS.map((d) => d.key),
      30,
    );
  }
  return RECLAIM_EVENTS;
}

/** The quiet course each scene takes if it's left unanswered (a choice's index). */
export function reclaimQuiet(): Record<string, number> {
  return { "town-plot": 3 };
}
