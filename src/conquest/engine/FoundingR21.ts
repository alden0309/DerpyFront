// GOV (r21): founding a settlement, widened. Plant it under your own crown
// (with the governor's charter, or as squatters), for another crown (the
// Swedes had their New Sweden from a Dutchman, Peter Minuit, in 1638), or
// as a colony of your own answering to no crown. Before you set out, the
// page shows what it all costs and the odds of the first year (a hard
// winter, a starving time); when it's planted, the founder holds its land
// as proprietor (seigneur, adelantado, patroon) and its first chair as the
// town's mayor (maire, alcalde, burgomaster), with renown, and favour for a
// chartered planting.

import { dateOf } from "./Calendar";
import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import { addStress, journal, touchLife } from "./LifeCore";
import { Check, isChildLife, meOf, no, skillLevel, yes } from "./LifeQueries";
import { kmBetween, type World } from "./Map";
import { ensureOffices, giveOffice } from "./Offices";
import { postsOf } from "./OneOffice";
import { atWar, charName, provincesOf, tribesfolk } from "./Queries";
import { addFavor } from "./Standing";
import type { Breakdown, Character, Founding, GameState, Life } from "./Types";
import { worldRng } from "./WorldRng";

/** The founder's reward, by how it was planted. */
export const PLANT = {
  /** Renown: your crown with its charter, as squatters, for another crown, your own colony. */
  renown: { charter: 15, squatters: 10, other: 12, free: 20 },
  /** Favour at home for a chartered planting. */
  favour: 5,
  /** Going over to another crown: what your old colony thinks, and your favour at home (halved). */
  oldColony: -10,
  /** A hard first year: renown less, stress, and a share of the settlers lost. */
  hardRenown: -4,
  hardStress: 12,
  hardLost: 0.25,
  /** The mayor's first term, by the town's charter. */
  mayorDays: 365,
};

/** The first year's reckoning: the chance of a hard one (a starving time). */
export const SEASONING = {
  base: 0.25,
  /** Supplies laid in beyond what's needed: less, to a point. */
  spareMax: 0.15,
  sparePer: 0.3,
  /** Arriving with winter coming (October to February, north of 35°), or in time to plant (March to May). */
  winter: 0.15,
  spring: -0.05,
  fever: 0.1,
  natives: 0.08,
  /** Your leadership and farming, about 6. */
  leadPer: -0.015,
  leadMax: 0.1,
  farmPer: -0.01,
  farmMax: 0.06,
  /** Each household beyond five: more hands. */
  housePer: -0.01,
  houseMax: 0.05,
  min: 0.05,
  max: 0.7,
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------- for another crown

/** Crown colonies a settlement could be planted for, besides your own. */
export function otherCrowns(s: GameState, life: Life): number[] {
  const me = meOf(s, life);
  if (!me) return [];
  return s.nations
    .filter(
      (n) =>
        n.alive &&
        n.kind === "power" &&
        n.id !== me.nation &&
        !n.independent &&
        !n.rebelling &&
        !atWar(s, n.id, me.nation) &&
        provincesOf(s, n.id).length > 0,
    )
    .map((n) => n.id);
}

/** Whether you can plant for that crown, or why not. */
export function underCheck(s: GameState, life: Life, n: number): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're grown.");
  const x = s.nations[n];
  if (!x?.alive || x.kind !== "power") return no("A colony's crown.");
  if (n === me.nation) return yes;
  if (!otherCrowns(s, life).includes(n))
    return no(
      "Not a crown you could plant for (at war with yours, or no crown at all).",
    );
  return yes;
}

/** The colony a settlement will be the crown's (or -1: its own). */
export function plantedFor(s: GameState, life: Life, f: Founding): number {
  const me = meOf(s, life);
  if (f.independent) return -1;
  return f.under ?? me?.nation ?? -1;
}

/** The charter's reckoning, widened: only the right governor grants it, and a stranger asks harder. */
export function charterR21(
  s: GameState,
  life: Life,
  gov: Character,
  e: Explain,
): void {
  const f = life.founding;
  const me = meOf(s, life);
  if (!f || !me) return;
  const want = f.under ?? me.nation;
  const govOf = s.nations.findIndex((n) => n.alive && n.ruler === gov.id);
  if (govOf !== want) {
    e.add(
      `${charName(gov)} can't grant land for ${s.nations[want]?.name ?? "that crown"}`,
      -100,
    );
    return;
  }
  if (f.under !== undefined && f.under !== me.nation) {
    e.add("A stranger to their crown", -10);
    const small = provincesOf(s, want).length < 4;
    if (small) e.add("A small colony wants settlers", 10);
    else e.add("Their crown wants settlers", 4);
  }
}

// ---------------------------------------------------------------- the first year

/** The chance of a hard first year at the settlement, with its reasons. */
export function seasoningOdds(
  s: GameState,
  w: World,
  life: Life,
  arriveDay?: number,
): Breakdown {
  const S = SEASONING;
  const e = new Explain().add(
    "The first year is hard everywhere",
    S.base,
    true,
  );
  const f = life.founding;
  if (!f) return e.done(2, S.min, S.max);
  const need = 12 + 5 * f.settlers.length;
  const spare = f.supplies - need;
  if (spare > 0)
    e.add(
      `Supplies beyond the need (${Math.floor(spare)})`,
      -Math.round(Math.min(S.spareMax, (spare / need) * S.sparePer) * 100) /
        100,
    );
  const def = w.map.provinces[f.target];
  const day =
    arriveDay ?? s.day + Math.round(kmBetween(w.map, life.prov, f.target) / 25);
  const m = dateOf(day).month;
  if (def && Math.abs(def.lat) > 35 && (m >= 9 || m <= 1))
    e.add("Arriving with winter coming", S.winter);
  else if (m >= 2 && m <= 4) e.add("Arriving in time to plant", S.spring);
  if (def && (w.tropical[f.target] || def.terrain === "marsh"))
    e.add("Fever country", S.fever);
  const pr = s.provinces[f.target];
  if (pr && tribesfolk(pr) > 0) e.add("People live there already", S.natives);
  const lead = skillLevel(s, life, "leadership");
  const lv = clamp((lead - 6) * S.leadPer, -S.leadMax, S.leadMax);
  if (Math.abs(lv) >= 0.01)
    e.add(`Your leadership (${lead})`, Math.round(lv * 100) / 100);
  const farm = skillLevel(s, life, "farming");
  const fv = clamp((farm - 6) * S.farmPer, -S.farmMax, S.farmMax);
  if (Math.abs(fv) >= 0.01)
    e.add(`Your farming (${farm})`, Math.round(fv * 100) / 100);
  const more = f.settlers.length - 5;
  if (more > 0)
    e.add(
      `${f.settlers.length} households`,
      -Math.min(S.houseMax, more * -S.housePer),
    );
  return e.done(2, S.min, S.max);
}

/** What the whole venture costs: begun, supplies, passage. */
export function foundingCosts(f: Founding): {
  start: number;
  supplies: number;
  passage: number;
  left: number;
} {
  const supplies = 12 + 5 * f.settlers.length;
  const passage = 2 * f.settlers.length;
  return {
    start: 25,
    supplies,
    passage,
    left: Math.max(0, supplies - Math.floor(f.supplies)) + passage,
  };
}

// ---------------------------------------------------------------- planted

/**
 * The settlement is planted: the first year rolled (on its own dice), the
 * founder's renown and favour, and the town's chair. Returns the renown.
 */
export function planted(
  g: ConquestGame,
  life: Life,
  f: Founding,
  n: number,
  old: number,
): number {
  const s = g.s;
  const p = f.target;
  const name = g.map.provinces[p]?.name ?? "the settlement";
  const how = f.independent
    ? "free"
    : f.under !== undefined && f.under !== old
      ? "other"
      : f.charter === "granted"
        ? "charter"
        : "squatters";
  let renown = PLANT.renown[how];
  // The first year.
  const hard = seasoningOdds(s, g.w, life, s.day).total;
  if (worldRng(s, 0x2200000 + p).chance(hard)) {
    renown += PLANT.hardRenown;
    addStress(g, life, PLANT.hardStress);
    const pr = g.prov(p);
    for (const pop of pr.pops)
      pop.size = Math.max(1, Math.round(pop.size * (1 - PLANT.hardLost)));
    journal(
      g,
      life,
      `The starving time at ${name}: a hard first winter, the corn short and the fever in the cabins. A quarter of the settlers are buried or gone home. The rest hold on.`,
      "bad",
    );
  } else
    journal(
      g,
      life,
      `A good first harvest at ${name}: the corn's in, the cabins are tight, and nobody starves.`,
      "good",
    );
  if (how === "charter") addFavor(g, life, PLANT.favour);
  if (how === "other") {
    touchLife(g, life).favor = Math.round(life.favor / 2);
    const oldN = g.nation(old);
    (oldN.relations[n] ??= []).push({
      of: -1,
      why: `Settlers who went over to ${s.nations[n].name}`,
      value: PLANT.oldColony,
      until: s.day + 365 * 8,
    });
  }
  // The town's first chair, by its charter.
  if (!f.independent) mayoralty(g, life, p);
  return renown;
}

/** The founder is the town's first mayor (if they hold no other office). */
function mayoralty(g: ConquestGame, life: Life, p: number): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return;
  const list = ensureOffices(g, p);
  const o = list.find((x) => x.key === "mayor");
  if (!o || o.holder >= 0) return;
  if (postsOf(s, me.id).length) {
    journal(
      g,
      life,
      "The new town's chair waits for its first election: you'd stand well, if you gave up the office you hold.",
    );
    return;
  }
  giveOffice(g, o, me.id, "by the town's charter, its first");
  o.election = s.day + PLANT.mayorDays;
}

/** Whether a county has a founder's office (a town planted by a player): it has a mayor's chair too. */
export function chartered(s: GameState, p: number): boolean {
  return (s.society?.offices[p] ?? []).some((o) => o.key === "founder");
}
