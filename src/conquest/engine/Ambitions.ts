// Ambitions: a goal a character sets themselves, one at a time, that gives
// a life direction. Rise in your trade, make a fortune, build a fine house,
// marry well, raise a family, make a name, win office, see the colonies,
// master a skill, ruin your rival, lead a cause. Each shows how far along it
// is; reaching it brings renown, ease of mind and sometimes more.

import type { ConquestGame } from "./Game";
import {
  addRenown,
  addStress,
  gainTrait,
  journal,
  milestone,
  touchLife,
} from "./LifeCore";
import {
  Check,
  isChildLife,
  lifeIsNative,
  meOf,
  no,
  officesOf,
  skillLevel,
  yes,
} from "./LifeQueries";
import { JOBS, SKILL_NAMES } from "./LifeRules";
import { movementOf } from "./Movements";
import { ageOf } from "./Queries";
import type { GameState, Life, Skill, TraitId } from "./Types";
import { SKILLS } from "./Types";

export interface AmbitionDef {
  name: string;
  text: string;
  /** Who may take it up (beyond being grown). */
  can?: (s: GameState, life: Life) => Check;
  /** The mark it's measured from, when it's set. */
  base?: (s: GameState, life: Life, arg?: string) => number;
  /** How far along: [now, wanted]. */
  progress: (
    s: GameState,
    life: Life,
    base: number,
    arg?: string,
  ) => [number, number];
  reward: { renown: number; stress: number; trait?: TraitId; text: string };
  /** Asks which skill. */
  skill?: boolean;
}

const kids = (s: GameState, life: Life) => {
  const me = meOf(s, life);
  return me ? me.children.filter((k) => s.chars[k]?.alive).length : 0;
};

export const AMBITIONS: Record<string, AmbitionDef> = {
  rise: {
    name: "Rise in your trade",
    text: "Climb two rungs of the ladder you're on.",
    can: (s, life) =>
      !life.job
        ? no("You'd need a trade first.")
        : life.job.rank + 2 >= JOBS[life.job.kind].ranks.length + 1
          ? no("You're too near the top of your ladder.")
          : yes,
    base: (s, life) => life.job?.rank ?? 0,
    progress: (s, life, base) => [Math.max(0, (life.job?.rank ?? 0) - base), 2],
    reward: {
      renown: 6,
      stress: -15,
      text: "Two rungs up the ladder: they look at you differently now.",
    },
  },
  fortune: {
    name: "Make a fortune",
    text: "Put by a hundred coins more than you have now.",
    base: (s, life) => Math.floor(life.purse),
    progress: (s, life, base) => [
      Math.max(0, Math.floor(life.purse) - base),
      100,
    ],
    reward: {
      renown: 5,
      stress: -15,
      trait: "shrewd",
      text: "A fortune of your own making. Money sticks to you now.",
    },
  },
  house: {
    name: "A fine house",
    text: "Own a fine house (or a longhouse) of your own.",
    progress: (s, life) => [
      Math.min(
        3,
        Math.max(
          0,
          ...(life.property ?? [])
            .filter((p) => p.kind === "house")
            .map((p) => p.level),
        ),
      ),
      3,
    ],
    reward: {
      renown: 6,
      stress: -20,
      text: "A fine roof over your family's heads, and the street knows whose it is.",
    },
  },
  marry: {
    name: "Marry well",
    text: "Marry: someone of standing, if you can.",
    can: (s, life) =>
      (meOf(s, life)?.spouse ?? -1) >= 0 ? no("You're married.") : yes,
    progress: (s, life) => [(meOf(s, life)?.spouse ?? -1) >= 0 ? 1 : 0, 1],
    reward: {
      renown: 3,
      stress: -20,
      text: "Married, and settled, and nobody can say otherwise.",
    },
  },
  family: {
    name: "Raise a family",
    text: "Three living children.",
    can: (s, life) =>
      kids(s, life) >= 3 ? no("You have three already.") : yes,
    progress: (s, life) => [Math.min(3, kids(s, life)), 3],
    reward: {
      renown: 4,
      stress: -25,
      text: "A full house, and the line is safe.",
    },
  },
  name: {
    name: "Make a name",
    text: "Win twenty renown more than you have.",
    base: (s, life) => Math.floor(life.renown),
    progress: (s, life, base) => [
      Math.max(0, Math.floor(life.renown) - base),
      20,
    ],
    reward: {
      renown: 4,
      stress: -10,
      trait: "famous",
      text: "They know your name from one end of the colony to the other.",
    },
  },
  friends: {
    name: "True friends",
    text: "Three friends who'd stand by you.",
    progress: (s, life) => [
      Math.min(
        3,
        Object.values(life.ties).filter((t) => t === "friend").length,
      ),
      3,
    ],
    reward: {
      renown: 3,
      stress: -25,
      text: "Three true friends. A rich life, whatever the purse says.",
    },
  },
  office: {
    name: "Win office",
    text: "A seat in the assembly or on the council (or at the council fire).",
    can: (s, life) =>
      officesOf(s, life.c).length ? no("You hold office already.") : yes,
    progress: (s, life) => [officesOf(s, life.c).length ? 1 : 0, 1],
    reward: {
      renown: 8,
      stress: -10,
      text: "A voice in how things are run. Use it well, or at least loudly.",
    },
  },
  glory: {
    name: "Glory in battle",
    text: "Fight on the winning side in two battles.",
    can: (s, life) =>
      life.job?.kind === "soldier" ||
      life.job?.kind === "warrior" ||
      s.armies.some((a) => a.commander === life.c)
        ? yes
        : no("You'd need to be under arms."),
    base: (s, life) => life.tally.battlesWon,
    progress: (s, life, base) => [Math.max(0, life.tally.battlesWon - base), 2],
    reward: {
      renown: 10,
      stress: -10,
      trait: "brave",
      text: "Twice through the smoke and the noise, and on the winning side.",
    },
  },
  travel: {
    name: "See the country",
    text: "Visit eight places you've never been.",
    base: (s, life) => life.visited.length,
    progress: (s, life, base) => [Math.max(0, life.visited.length - base), 8],
    reward: {
      renown: 4,
      stress: -15,
      text: "You've seen more of the country than most will in their lives.",
    },
  },
  master: {
    name: "Master a skill",
    text: "Bring one skill to 14.",
    skill: true,
    can: (s, life) => yes,
    progress: (s, life, base, arg) => [
      Math.min(14, skillLevel(s, life, (arg as Skill) ?? "persuasion")),
      14,
    ],
    reward: {
      renown: 6,
      stress: -10,
      text: "A master of it, and you know it.",
    },
  },
  revenge: {
    name: "Ruin your rival",
    text: "See a rival or nemesis dead, gone, or beaten in a duel.",
    can: (s, life) =>
      Object.values(life.ties).some((t) => t === "rival" || t === "nemesis")
        ? yes
        : no("You'd need an enemy first."),
    progress: (s, life, base) => {
      const beaten = Object.keys(life.ties).length === 0 ? 0 : 0;
      const done = life.journal.some(
        (j) =>
          j.day >= base &&
          /(killed|beat you in|You won|wounded .*honour is satisfied)/.test(
            j.text,
          ),
      );
      return [done ? 1 : beaten, 1];
    },
    base: (s) => s.day,
    reward: {
      renown: 6,
      stress: -20,
      text: "Your enemy is brought low. Sweet, if you don't think about it.",
    },
  },
  cause: {
    name: "Lead a cause",
    text: "Lead a movement with half the country behind it.",
    can: (s, life) =>
      movementOf(s, life.c) ? yes : no("Join or found a cause first."),
    progress: (s, life) => {
      const m = movementOf(s, life.c);
      return [
        m && m.leader === life.c ? Math.min(50, Math.floor(m.support)) : 0,
        50,
      ];
    },
    reward: {
      renown: 12,
      stress: -10,
      text: "Half the country marches to your drum.",
    },
  },
};

export const AMBITION_KEYS = Object.keys(AMBITIONS);

export function ambitionCheck(
  s: GameState,
  life: Life,
  key: string,
  arg?: string,
): Check {
  const def = AMBITIONS[key];
  if (!def) return no("No such ambition.");
  if (!meOf(s, life)) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not as a child.");
  if (life.ambition?.key === key)
    return no("You've set your heart on it already.");
  if (def.skill && !SKILLS.includes(arg as Skill)) return no("Choose a skill.");
  if (def.skill && skillLevel(s, life, arg as Skill) >= 14)
    return no(
      `You've mastered ${SKILL_NAMES[arg as Skill].toLowerCase()} already.`,
    );
  if (key === "house" && lifeIsNative(s, life)) return yes;
  const c = def.can?.(s, life) ?? yes;
  if (!c.ok) return c;
  const [now, want] = def.progress(s, life, def.base?.(s, life, arg) ?? 0, arg);
  if (now >= want) return no("You have that already.");
  return yes;
}

/** How far along your ambition is: [now, wanted]. */
export function ambitionProgress(
  s: GameState,
  life: Life,
): [number, number] | null {
  const a = life.ambition;
  if (!a) return null;
  const def = AMBITIONS[a.key];
  return def ? def.progress(s, life, a.base, a.arg) : null;
}

export function setAmbition(
  g: ConquestGame,
  life: Life,
  key: string | null,
  arg?: string,
): string | null {
  const s = g.s;
  if (key === null) {
    if (!life.ambition) return "You have no ambition to give up.";
    const was = AMBITIONS[life.ambition.key]?.name ?? "it";
    touchLife(g, life).ambition = null;
    addStress(g, life, 5);
    journal(g, life, `You give up on "${was}". It stings, a little.`);
    return null;
  }
  const check = ambitionCheck(s, life, key, arg);
  if (!check.ok) return check.why;
  const def = AMBITIONS[key];
  touchLife(g, life).ambition = {
    key,
    since: s.day,
    base: def.base?.(s, life, arg) ?? 0,
    ...(arg ? { arg } : {}),
  };
  journal(
    g,
    life,
    `You set your heart on it: ${def.name.toLowerCase()}${def.skill ? ` (${SKILL_NAMES[arg as Skill].toLowerCase()})` : ""}.`,
  );
  return null;
}

/** Each month: an ambition reached is rewarded. */
export function ambitionsMonthly(g: ConquestGame, life: Life): void {
  const a = life.ambition;
  if (!a) return;
  const def = AMBITIONS[a.key];
  const me = meOf(g.s, life);
  if (!def || !me) return;
  const [now, want] = def.progress(g.s, life, a.base, a.arg);
  if (now < want) return;
  touchLife(g, life);
  life.ambition = null;
  life.ambitionsDone = [...(life.ambitionsDone ?? []), a.key].slice(-30);
  life.tally.ambitions = (life.tally.ambitions ?? 0) + 1;
  addRenown(g, life, def.reward.renown);
  addStress(g, life, def.reward.stress);
  if (def.reward.trait && !me.traits.includes(def.reward.trait))
    gainTrait(g, life, def.reward.trait);
  journal(
    g,
    life,
    `Ambition fulfilled: ${def.name.toLowerCase()}. ${def.reward.text}`,
    "good",
  );
  milestone(
    g,
    life,
    "renown",
    `Fulfilled an ambition: ${def.name.toLowerCase()}`,
  );
  void ageOf;
}
