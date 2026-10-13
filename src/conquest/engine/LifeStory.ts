// STORY (r17): what a life is remembered for, that no one system writes
// down for itself. A husband, wife or child lost; a siege carried by your own
// army; your home taken, freed or burned in a war. Everything else is written
// where it happens, with milestone() (LifeCore.ts), and told by the story
// (StoryCore.ts, StoryBook.ts).
//
// Nothing here rolls dice or names anyone it shouldn't: it only writes down
// what happened, and nobody in the town talks of it on its account.

import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { milestone, touchLife } from "./LifeCore";
import { meOf } from "./LifeQueries";
import { charName } from "./Queries";
import type { Army, Character, GameEvent, Life, Nation } from "./Types";

/** A nation in a sentence: "England", "the Powhatan". */
export function nationWord(n: Nation | undefined): string {
  if (!n) return "another people";
  if (/^the /i.test(n.name)) return n.name;
  return n.kind === "native" ? `the ${n.name}` : n.name;
}

const placeOf = (g: ConquestGame, p: number) =>
  g.map.provinces[p]?.name ?? "the town";

// ---------------------------------------------------------------- losses

/** A husband, wife or child of a played character has died. */
function losses(g: ConquestGame, c: Character, cause: string): void {
  const s = g.s;
  for (const life of s.lives) {
    if (life.watching || life.c < 0 || life.c === c.id) continue;
    const me = meOf(s, life);
    if (!me?.alive) continue;
    const spouse = me.spouse === c.id || c.spouse === me.id;
    const child = me.children.includes(c.id);
    if (!spouse && !child) continue;
    const who = spouse
      ? `${c.female ? "wife" : "husband"}`
      : `${c.female ? "daughter" : "son"}`;
    milestone(
      g,
      life,
      "loss",
      `${spouse ? "Widowed: your" : "Your"} ${who} ${charName(c)} died, ${cause}`,
      life.prov,
      { quiet: true, tone: "bad", big: spouse },
    );
  }
}

// ---------------------------------------------------------------- the war at home

/** The army a life is with (commanding it, serving in it, or its own company). */
function armyOf(g: ConquestGame, life: Life, p: number): Army | undefined {
  const me = life.c;
  return g.s.armies.find(
    (a) =>
      a.prov === p &&
      (a.commander === me ||
        (life.job !== null && life.job.army === a.id) ||
        life.company?.army === a.id),
  );
}

function warAtHome(g: ConquestGame, e: GameEvent): void {
  const s = g.s;
  if (
    e.k !== "occupied" &&
    e.k !== "freed" &&
    e.k !== "ceded" &&
    e.k !== "razed"
  )
    return;
  const place = placeOf(g, e.p);
  for (const life of s.lives) {
    if (life.watching || life.c < 0) continue;
    const me = meOf(s, life);
    if (!me?.alive) continue;
    // A siege your own army carried.
    if (e.k === "occupied" || e.k === "freed") {
      const a = armyOf(g, life, e.p);
      if (a && a.owner === e.n) {
        const commanding = a.commander === me.id;
        milestone(
          g,
          life,
          "battle",
          `${e.k === "freed" ? "Retook" : "Took"} ${place} after a siege${commanding ? ", in command" : ""}`,
          e.p,
          { quiet: true, tone: "good", big: commanding },
        );
        continue;
      }
    }
    // Your own town, taken, freed or burned.
    if (life.home !== e.p) continue;
    const by = s.nations[e.n];
    const ours = me.nation === e.n;
    // Taken and burned the same day: one moment.
    const taken =
      e.k === "razed" &&
      life.milestones.find(
        (m) =>
          m.kind === "home" &&
          m.day === s.day &&
          m.p === e.p &&
          / was taken by /.test(m.text),
      );
    if (taken) {
      taken.text = `${place}, your home, was taken and burned by ${nationWord(by)}`;
      taken.big = true;
      touchLife(g, life);
      continue;
    }
    const text =
      e.k === "freed"
        ? `${place}, your home, was free of its occupiers again`
        : e.k === "razed"
          ? `${place}, your home, was burned by ${nationWord(by)}`
          : e.k === "ceded"
            ? `${place}, your home, was ceded to ${nationWord(by)}`
            : `${place}, your home, was taken by ${nationWord(by)}`;
    milestone(g, life, "home", text, e.p, {
      quiet: true,
      tone: e.k === "freed" || ours ? "good" : "bad",
      big: e.k === "razed",
    });
  }
}

hooks.death.push(losses);
hooks.gameEvent.push(warAtHome);
