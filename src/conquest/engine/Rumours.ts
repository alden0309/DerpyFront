// Talk. Something happens somewhere (a governor dies, a battle is won, a
// player marries above themselves or kills a man at dawn) and the news sets
// out from there at a rider's pace, a few dozen miles a day, reaching the
// next town in a few days and the far colonies in weeks. A province knows
// what has reached it; the tavern is where you hear it.

import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { ROLES } from "./LifeRules";
import { kmBetween } from "./Map";
import { charName } from "./Queries";
import type { GameState, MapDef, Rumour } from "./Types";
import { SEATS } from "./Types";

/** How fast talk travels: km a day. */
export const RUMOUR_KM_PER_DAY = 45;
/** How long anyone bothers to repeat it. */
export const RUMOUR_DAYS = 540;
const MAX_RUMOURS = 90;

/** Start some talk where something happened. */
export function rumour(
  g: ConquestGame,
  p: number,
  text: string,
  about = -1,
  tone?: "good" | "bad",
): void {
  const s = g.s;
  if (p < 0 || !g.map.provinces[p]) return;
  s.rumours ??= [];
  // The same thing said twice in a week is one rumour.
  if (s.rumours.some((r) => r.text === text && s.day - r.day < 7)) return;
  s.rumours.push({
    id: g.nextId(),
    day: s.day,
    p,
    text,
    about,
    ...(tone ? { tone } : {}),
  });
  const old = s.day - RUMOUR_DAYS;
  s.rumours = s.rumours.filter((r) => r.day >= old).slice(-MAX_RUMOURS);
  g.rumoursChanged();
}

/** Whether talk of something has reached a province by a day. */
export function reached(
  map: MapDef,
  r: Rumour,
  q: number,
  day: number,
): boolean {
  if (day < r.day) return false;
  if (r.p === q) return true;
  return kmBetween(map, r.p, q) <= (day - r.day) * RUMOUR_KM_PER_DAY;
}

/** The day talk of something reaches a province. */
export function reachesOn(map: MapDef, r: Rumour, q: number): number {
  if (r.p === q) return r.day;
  return r.day + Math.ceil(kmBetween(map, r.p, q) / RUMOUR_KM_PER_DAY);
}

/** What they're saying here, newest first. */
export function heardHere(
  s: GameState,
  map: MapDef,
  p: number,
  day: number = s.day,
): Rumour[] {
  return (s.rumours ?? [])
    .filter((r) => reached(map, r, p, day) && day - r.day <= 365)
    .sort((a, b) => b.day - a.day || b.id - a.id);
}

// ---------------------------------------------------------------- what gets talked about

hooks.death.push((g, c, cause) => {
  const s = g.s;
  const n = s.nations[c.nation];
  const ruler = n?.ruler === c.id;
  const council = n ? SEATS.some((st) => n.council[st] === c.id) : false;
  const played = s.lives.some((l) => l.line.includes(c.id));
  if (!ruler && !council && !c.role && !played) return;
  const p = c.home ?? n?.capital ?? -1;
  const who = ruler
    ? `${charName(c)}, ${n.kind === "native" ? "leader of the" : "governor of"} ${n.name.replace(/^the /, "")},`
    : c.role
      ? `${charName(c)}, the ${ROLES[c.role].title.toLowerCase()},`
      : charName(c);
  rumour(g, p, `${who} is dead: ${cause}.`, c.id, "bad");
});

hooks.battle.push((g, r) => {
  const s = g.s;
  const side = r.winner === 0 ? r.attacker : r.defender;
  const won = s.nations[side.nations[0]];
  rumour(
    g,
    r.prov,
    `There was a battle at ${g.map.provinces[r.prov].name}, and the ${won?.adjective ?? "other"} side carried the day. ${Math.round(r.attacker.lost + r.defender.lost)} men fell.`,
    -1,
  );
});
