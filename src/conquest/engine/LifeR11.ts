// LIFE (r11): the round-11 life plugged into the old one through its hooks:
// each day and month of a life (the law, your people, boats, contracts), the
// new commands (effort, trades taken up, crime and the law, people, boats,
// contracts), what a cell forbids, and what wakes a skip ahead (a child born,
// a death in the family, a battle). Also what passes to an heir.

import { boatCommand, boatHold, boatsMonthly } from "./Boats";
import { contractCommand, contractsDaily } from "./Contracts";
import { crimeCommand, crimeDaily, crimeGate, crimeMonthly } from "./Crime";
import {
  extraCarry,
  guideWithYou,
  peopleCommand,
  peopleDaily,
  peopleMonthly,
} from "./Followers";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import {
  beginOutcome,
  earn,
  endOutcome,
  journal,
  outcomeMeta,
  touchLife,
} from "./LifeCore";
import { CARRY, lifeOfChar } from "./LifeQueries";
import { JOBS } from "./LifeRules";
import { wake } from "./Pace";
import { charName } from "./Queries";
import { setEffort, takeUp, takeUpLabel } from "./Trades";
import type {
  Effort,
  GameState,
  JobKind,
  Life,
  LifeCommand,
  PlaceKind,
} from "./Types";

/** Loads you can carry: on your back, your hands' backs, and (at `p`) your boat's hold. */
export function carryLimit(s: GameState, life: Life, p: number): number {
  return CARRY + extraCarry(life) + (p >= 0 ? boatHold(life, p) : 0);
}

/** How likely the road's dangers are at a day's travel (a day is three seconds now: more happens). */
export function roadRiskFactor(g: ConquestGame, life: Life): number {
  let f = 3;
  const t = life.travel;
  if (t && !t.sea[0] && guideWithYou(g.s, life)) f *= 0.6;
  if (life.job?.kind === "guide" && t && !t.sea[0]) f *= 0.7;
  return f;
}

function workCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k === "effort") return setEffort(g, life, c.v as Effort);
  if (c.k !== "takeup") return undefined;
  const kind = c.job as JobKind;
  if (!JOBS[kind]) return "No such work.";
  beginOutcome(g, life);
  let err: string | null = null;
  try {
    outcomeMeta(g, life, {
      key: `takeup-${kind}`,
      title: takeUpLabel(kind),
      scene: c.place as PlaceKind,
      c: -1,
      ok: null,
    });
    err = takeUp(g, life, kind, c.place as PlaceKind);
  } finally {
    endOutcome(g, life, "act", err !== null);
  }
  return err;
}

hooks.command.push(
  workCommand,
  crimeCommand,
  peopleCommand,
  boatCommand,
  contractCommand,
);
hooks.gate.push(crimeGate);
hooks.lifeDaily.push(crimeDaily, peopleDaily, contractsDaily);
hooks.lifeMonthly.push(crimeMonthly, peopleMonthly, boatsMonthly);

// What wakes a skip ahead besides letters and arrivals.
hooks.birth.push((g, kid, mother, father) => {
  for (const life of g.s.lives)
    if (life.c === mother.id || life.c === father.id)
      wake(
        g,
        life,
        `A ${kid.female ? "daughter" : "son"} is born: ${kid.first}.`,
      );
});
hooks.death.push((g, c) => {
  for (const life of g.s.lives) {
    if (life.watching || life.c < 0 || life.c === c.id) continue;
    const me = g.s.chars[life.c];
    if (!me) continue;
    if (
      me.spouse === c.id ||
      me.children.includes(c.id) ||
      life.patron === c.id
    )
      wake(g, life, `${charName(c)} has died.`);
  }
  // A played character's company can't march on without them.
  const life = lifeOfChar(g.s, c.id);
  if (life?.company && life.company.army >= 0) {
    const a = g.s.armies.find((x) => x.id === life.company!.army);
    if (a) g.touch(a).commander = -1;
  }
});
hooks.battle.push((g, r, attackers, defenders) => {
  for (const life of g.s.lives) {
    if (life.watching || life.c < 0) continue;
    const mine = [...attackers, ...defenders].some(
      (a) =>
        a.commander === life.c ||
        life.job?.army === a.id ||
        life.company?.army === a.id,
    );
    if (mine) wake(g, life, `A battle at ${g.map.provinces[r.prov].name}.`);
    // A company that carries the field shares out the spoils.
    const co = life.company;
    const won = r.winner === 0 ? attackers : defenders;
    if (co && co.army >= 0 && won.some((a) => a.id === co.army)) {
      const spoils = Math.min(60, Math.round(4 + co.men * 0.12));
      earn(g, life, spoils);
      journal(
        g,
        life,
        `${co.name} carried the field at ${g.map.provinces[r.prov].name}: ${spoils} coins of spoils for the captain.`,
        "good",
      );
    }
  }
});

/** The heir takes up the line: the boats, and those of your people who stay. */
export function lifeR11Succeeded(g: ConquestGame, life: Life): void {
  touchLife(g, life);
  // A company follows its captain, not his family.
  const co = life.company;
  if (co) {
    if (co.army >= 0) {
      const a = g.s.armies.find((x) => x.id === co.army);
      if (a) g.touch(a).commander = -1;
    }
    life.company = null;
  }
  for (const f of life.people ?? []) f.loyalty = Math.max(0, f.loyalty - 15);
  for (const c of life.contracts ?? [])
    if (c.status === "taken") c.status = "failed";
  delete life.work;
  // The heir has a clean name with the law, and a little of the family's in the underworld.
  if (life.crime) {
    life.crime = {
      notoriety: Math.round(life.crime.notoriety * 0.3),
      heat: {},
      dens: life.crime.dens,
      record: [],
      jail: null,
    };
  }
}

/** The line has ended: nobody to keep them. */
export function lifeR11Ended(g: ConquestGame, life: Life): void {
  lifeR11Succeeded(g, life);
  life.people = [];
  life.boats = [];
  life.contracts = [];
  delete life.crime;
}
