// LIFE (r11): what can be read about someone's standing with the law and
// the underworld, for the engine and the browser alike: their name among
// rogues, how hard the law is looking, whether they know the den here, and
// how sharp the watch is in a town.

import { Explain } from "./Explain";
import { JOBS } from "./LifeRules";
import type { World } from "./Map";
import { settlers } from "./Queries";
import type {
  BackgroundId,
  Breakdown,
  CrimeState,
  GameState,
  Life,
} from "./Types";

/** Upbringings on the wrong side of the law: they know the den at home. */
export const CRIME_BACKGROUNDS: BackgroundId[] = [
  "pickpocket",
  "smuggler",
  "footpad",
  "coiner",
  "pirate",
];

export function crimeOf(life: Life): CrimeState | undefined {
  return life.crime;
}

/** How well the underworld knows you, 0 to 100. */
export function notorietyOf(life: Life): number {
  return life.crime?.notoriety ?? 0;
}

/** How hard a nation's law is looking for you, 0 to 100. */
export function heatOf(life: Life, nation: number): number {
  return life.crime?.heat[nation] ?? 0;
}

/** The hottest the law is for you anywhere, and where. */
export function worstHeat(life: Life): { nation: number; heat: number } {
  let best = { nation: -1, heat: 0 };
  for (const [k, v] of Object.entries(life.crime?.heat ?? {}))
    if (v > best.heat) best = { nation: Number(k), heat: v };
  return best;
}

export function isJailed(life: Life): boolean {
  return !!life.crime?.jail;
}

/** A lawman at work: the watch, a sheriff, a thief-taker. */
export function isLawman(life: Life): boolean {
  return !!life.job && !!JOBS[life.job.kind].law;
}

/** A crooked living. */
export function isRogue(life: Life): boolean {
  return !!life.job && !!JOBS[life.job.kind].crime;
}

/** Whether you know the den in a province (lawmen know where it is too). */
export function knowsDen(life: Life, p: number): boolean {
  if (life.crime?.dens.includes(p)) return true;
  return isLawman(life) && life.job?.prov === p;
}

/** Someone in the underworld would vouch for you here. */
export function underworldContact(life: Life, p: number): boolean {
  return (
    knowsDen(life, p) ||
    notorietyOf(life) >= 10 ||
    CRIME_BACKGROUNDS.includes(life.background)
  );
}

/** The nation whose law holds in a province (the occupier, if any). */
export function lawAt(s: GameState, p: number): number {
  const pr = s.provinces[p];
  return pr.occupier >= 0 ? pr.occupier : pr.owner;
}

/** How sharp the watch is in a town: the bigger and better kept, the sharper. */
export function watchStrength(s: GameState, w: World, p: number): Breakdown {
  const e = new Explain();
  const pr = s.provinces[p];
  const owner = lawAt(s, p);
  const n = owner >= 0 ? s.nations[owner] : undefined;
  if (!n || n.kind !== "power") {
    e.add(
      n ? "Each village keeps its own peace" : "No law out here",
      n ? 12 : 4,
    );
    return e.done(0, 0, 100);
  }
  const folk = settlers(pr);
  e.add(
    folk >= 4000
      ? "A great town"
      : folk >= 1500
        ? "A busy town"
        : folk >= 500
          ? "A small town"
          : "A few farms",
    folk >= 4000 ? 34 : folk >= 1500 ? 26 : folk >= 500 ? 18 : 8,
  );
  if (n.capital === p) e.add("The capital, with the governor's guard", 10);
  if ((pr.b.courthouse ?? 0) > 0) e.add("A courthouse and its officers", 6);
  if ((pr.b.fort ?? 0) > 0) e.add("Soldiers in the fort", 4);
  const constable = (s.locals[p] ?? [])
    .map((id) => s.chars[id])
    .find((c) => c?.alive && c.role === "constable");
  if (constable) e.add("A high constable", 8);
  const lawmen = s.lives.filter(
    (l) =>
      l.c >= 0 &&
      !l.watching &&
      !l.travel &&
      l.prov === p &&
      isLawman(l) &&
      l.job?.prov === p,
  ).length;
  if (lawmen) e.add("Players keeping the peace here", lawmen * 14);
  if (pr.unrest >= 50) e.add("Disorder in the streets", -8);
  void w;
  return e.done(0, 0, 100);
}
