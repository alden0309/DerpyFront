// Wave 2 (r11): the talk that reaches you, for the news. At a day every
// three seconds the world's doings come by slowly, so what's said in the
// country round you (a death in town, an election, a battle up the river, a
// failed harvest) joins the news the day the talk reaches where you are,
// and so does anything said of people you know, wherever it happened. The
// stories behind leads stay in the taverns: you hear those by listening.

import { kmBetween } from "../engine/Map";
import { reachesOn } from "../engine/Rumours";
import type { GameState, Life, MapDef, Rumour } from "../engine/Types";

/** How far off the talk of strangers is worth repeating, in km. */
export const TALK_KM = 900;

/** People a life knows well enough to care what's said of them. */
function caresAbout(s: GameState, life: Life, c: number): boolean {
  if (c < 0) return false;
  if (life.ties[c]) return true;
  const me = s.chars[life.c];
  if (!me) return false;
  return (
    me.spouse === c ||
    me.father === c ||
    me.mother === c ||
    me.children.includes(c)
  );
}

/** Talk that reached where you are after day `from`, up to day `to`, oldest first. */
export function talkReaching(
  s: GameState,
  map: MapDef,
  life: Life | null | undefined,
  from: number,
  to: number,
): Rumour[] {
  if (!life || life.watching || life.c < 0 || to <= from) return [];
  const here = life.prov;
  if (here < 0) return [];
  const out: Rumour[] = [];
  for (const r of s.rumours ?? []) {
    if (r.lead || r.about === life.c) continue;
    const on = reachesOn(map, r, here);
    if (on <= from || on > to) continue;
    if (kmBetween(map, r.p, here) > TALK_KM && !caresAbout(s, life, r.about))
      continue;
    out.push(r);
  }
  return out.sort((a, b) => a.day - b.day || a.id - b.id);
}

/** A line for the news: where it's said to have happened, unless it's here. */
export function talkLine(map: MapDef, life: Life, r: Rumour): string {
  if (r.p === life.prov) return `Talk in town: ${r.text}`;
  return `Word from ${map.provinces[r.p]?.name ?? "afar"}: ${r.text}`;
}
