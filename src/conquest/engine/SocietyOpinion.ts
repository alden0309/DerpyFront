// What society adds to what someone thinks of you: a scandal, an office you
// hold over their county, and speaking their own tongue to them.

import type { Explain } from "./Explain";
import { AMERICAS } from "./Map";
import { hasTrait } from "./Queries";
import { motherTongue, TONGUES, tonguesOf } from "./Tongues";
import type { Character, GameState, Life } from "./Types";

export function societyOpinion(
  s: GameState,
  c: Character,
  life: Life,
  e: Explain,
): void {
  const me = s.chars[life.c];
  if (!me) return;
  if (life.scandal && life.scandal.until > s.day) {
    const prim =
      hasTrait(c, "zealous") || hasTrait(c, "just") || c.role === "preacher";
    e.add(`The scandal (${life.scandal.text.toLowerCase()})`, prim ? -12 : -4);
  }
  // An officer of their own county.
  const home = c.home;
  if (home !== undefined)
    for (const o of s.society?.offices[home] ?? [])
      if (o.holder === me.id) {
        e.add("An officer of their county", 4);
        break;
      }
  // Speaking to them in their own tongue, when it isn't yours.
  const theirs = motherTongue(c.culture);
  if (theirs !== motherTongue(me.culture) && TONGUES[theirs]) {
    const lvl = tonguesOf(s, AMERICAS, me)[theirs] ?? 0;
    if (lvl >= 2) e.add("Speaks their tongue", lvl === 3 ? 8 : 4);
  }
}
