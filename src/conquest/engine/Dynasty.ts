// TREE (r25): a line's dynasty, made from the game's state: every character
// the seat has played (the line of heirs, and anyone taken up or begun
// anew), their husbands and wives (all of them: the dead keep their
// husband's or wife's mark, LEGACY keeps each wedding), their children
// played or not, and their parents and brothers and sisters, with what each
// was; and for those the seat was, their life from the game's own records
// (LEGACY's every character, the chronicle's chapter, the milestones, the
// achievements earned while they were played).
//
// Each seat's dynasty is made from its own life and from what anyone may
// know of the people in it (who married whom, who was born to whom): never
// from another player's life. A husband or wife who's another player's
// character is on it as far as the marriage goes, and no further.
// `secrets: false` (the site's record, or anyone but the line's own
// player) leaves out the lovers, the children never owned to and the
// moments only the player knows. Pure: it reads the state and writes nothing.

import { ACHIEVEMENT_BY_KEY } from "./Achievements";
import { dateOf } from "./Calendar";
import { chronicleOf } from "./Chronicle";
import type {
  DynastyRecord,
  DynLife,
  DynMoment,
  DynPerson,
} from "./DynastyCore";
import { eduChipText } from "./Edu";
import { causePhrase, lineCharacters, type LineChar } from "./Legacy";
import { heirOf, lifeOfChar, officesOf, siblingsOf } from "./LifeQueries";
import { ROLES } from "./LifeRules";
import { ageOf } from "./Queries";
import { TRAITS } from "./Rules";
import { storyKind, storyWeight } from "./StoryCore";
import type {
  Character,
  GameState,
  Life,
  LifeMilestone,
  MapDef,
} from "./Types";

export type { DynastyRecord } from "./DynastyCore";

/** How many moments of a life the record keeps (the greatest, then the latest). */
export const DYN_MOMENTS = 14;

/** The days of each character's part in the line: [from, to] (to: null while played now). */
function partsOf(
  s: GameState,
  life: Life,
): Map<number, [number, number | null]> {
  const out = new Map<number, [number, number | null]>();
  const L = life.legacy;
  const line = [...new Set(life.line)];
  line.forEach((id, n) => {
    const rec = L?.recs.find((r) => r.c === id);
    const first = life.milestones.find((m) => m.c === id)?.day;
    const from =
      rec?.from ??
      (id === life.c ? L?.since : undefined) ??
      first ??
      life.joined;
    const nextFirst =
      n + 1 < line.length
        ? (L?.recs.find((r) => r.c === line[n + 1])?.from ??
          life.milestones.find((m) => m.c === line[n + 1])?.day)
        : undefined;
    const to =
      id === life.c && life.c >= 0
        ? null
        : (rec?.to ??
          s.chars[id]?.died?.day ??
          nextFirst ??
          life.ended?.day ??
          s.day);
    out.set(id, [from, to]);
  });
  return out;
}

const PROV = (map: Pick<MapDef, "provinces">, p: number | undefined) =>
  p !== undefined && p >= 0 ? (map.provinces[p]?.name ?? "") : "";

/** The life of someone the seat was, from the game's records. */
function lifeOfPart(
  s: GameState,
  life: Life,
  rec: LineChar,
  n: number,
  span: [number, number | null],
  story: string[],
  secrets: boolean,
): DynLife {
  const mine = life.milestones.filter(
    (m) => m.c === rec.c && (secrets || !m.sec),
  );
  const texts = (pick: (m: LifeMilestone) => boolean, max: number) => {
    const out: string[] = [];
    for (const m of mine)
      if (pick(m) && out[out.length - 1] !== m.text) out.push(m.text);
    return out.slice(-max);
  };
  const [from, to] = span;
  const inPart = (day: number) => day >= from && (to === null || day <= to);
  const ach = Object.entries(life.achieved ?? {})
    .filter(([, day]) => inPart(day))
    .sort((a, b) => a[1] - b[1])
    .flatMap(([key]) => {
      const def = ACHIEVEMENT_BY_KEY.get(key);
      return def ? [def.name] : [];
    });
  // The moments worth telling: the work, its ranks and the offices have their
  // own lists; of the rest, the greatest, then the latest, told in order.
  const told = mine.filter(
    (m) => !["job", "promoted", "office"].includes(m.kind) || m.big,
  );
  const ranked = told
    .map((m, i) => ({ m, i, w: storyWeight(m) }))
    .sort((a, b) => b.w - a.w || b.i - a.i)
    .slice(0, DYN_MOMENTS)
    .sort((a, b) => a.i - b.i);
  const moments: DynMoment[] = ranked.map(({ m }) => ({
    y: dateOf(m.day).year,
    t: m.text,
    k: storyKind(m),
    ...(m.big ? { big: true as const } : {}),
  }));
  return {
    n,
    came: rec.came,
    ended: rec.ended,
    fate: rec.fate,
    from: rec.from,
    to: rec.to,
    age: rec.age,
    title: rec.title,
    office: rec.office,
    home: rec.home,
    renown: rec.renown,
    purse: rec.purse,
    earned: rec.earned,
    children: rec.children,
    battles: rec.battles,
    battlesWon: rec.battlesWon,
    duels: rec.duels,
    wounds: rec.wounds,
    places: rec.places,
    skills: rec.skills,
    work: texts((m) => m.kind === "job" || m.kind === "promoted", 14),
    offices: texts((m) => m.kind === "office", 10),
    ach,
    moments,
    story,
  };
}

/** Where a living person is, and how. */
function nowOf(
  s: GameState,
  life: Life,
  map: Pick<MapDef, "provinces">,
  c: Character,
): string {
  const age = ageOf(s, c);
  if (c.id === life.c) {
    const where = life.travel
      ? `On the road to ${PROV(map, life.travel.dest)}`
      : `At ${PROV(map, life.prov)}`;
    return `${where}, ${age} years old, in ${life.health >= 70 ? "good" : life.health >= 40 ? "fair" : "poor"} health`;
  }
  if (c.abroad) return `In Europe, ${age} years old`;
  const edu = c.edu?.now?.away ? eduChipText(c) : null;
  const home = PROV(map, c.home ?? s.nations[c.nation]?.capital ?? undefined);
  return `${edu ? `${edu}, ` : home ? `Living at ${home}, ` : "Living, "}${age} years old`;
}

/** What someone is or was, in a few words. */
function titleOf(s: GameState, c: Character): string | undefined {
  const office = officesOf(s, c.id).sort((a, b) => b.level - a.level)[0];
  if (office) return office.label;
  if (c.alive) {
    const edu = eduChipText(c);
    if (edu) return edu;
  }
  if (c.role) return ROLES[c.role]?.title;
  return undefined;
}

/**
 * A seat's dynasty, from the state. `secrets` (the default: the line's own
 * player) keeps their lovers, their children never owned to and the moments
 * only they know; `false` is everyone else's (and the site's) record, and
 * has no character ids (`ids: false`) for the site.
 */
export function dynastyOf(
  s: GameState,
  life: Life,
  map: Pick<MapDef, "provinces">,
  o: { secrets?: boolean; ids?: boolean } = {},
): DynastyRecord {
  const secrets = o.secrets ?? true;
  const ids = o.ids ?? true;
  const line = [...new Set(life.line)].filter((id) => s.chars[id]);
  const year = (d: number) => dateOf(d).year;
  const recs = lineCharacters(s, life, map);
  const recOf = new Map(recs.map((r) => [r.c, r]));
  const chron = chronicleOf(s, life, map, { secrets });
  const storyOf = new Map(chron.chapters.map((ch) => [ch.c, ch.paras]));
  const parts = partsOf(s, life);

  // Who married whom: their own mark, the mark the dead keep, LEGACY's weddings.
  const rev = new Map<number, number[]>();
  for (const c of Object.values(s.chars))
    if (c && c.spouse >= 0) {
      const l = rev.get(c.spouse);
      if (l) l.push(c.id);
      else rev.set(c.spouse, [c.id]);
    }
  const wed = new Map<number, number[]>();
  const wedAdd = (a: number, b: number) => {
    const l = wed.get(a);
    if (!l) wed.set(a, [b]);
    else if (!l.includes(b)) l.push(b);
  };
  for (const [a, b] of life.legacy?.wed ?? []) {
    wedAdd(a, b);
    wedAdd(b, a);
  }
  for (const r of life.legacy?.recs ?? [])
    if (r.spouse >= 0) {
      wedAdd(r.c, r.spouse);
      wedAdd(r.spouse, r.c);
    }
  const marriagesOf = (id: number): number[] => {
    const c = s.chars[id];
    const out: number[] = [];
    for (const x of [
      ...(wed.get(id) ?? []),
      ...(c && c.spouse >= 0 ? [c.spouse] : []),
      ...(rev.get(id) ?? []),
    ])
      if (x !== id && s.chars[x] && !out.includes(x)) out.push(x);
    return out;
  };

  // Lovers' children never owned to (the line's own record only), each to
  // the one of the line it was born to (by the days of their parts).
  const hiddenKids = new Map<number, { lover: number; of: number }>();
  if (secrets)
    for (const a of life.affairs ?? []) {
      const of =
        line.find((id) => {
          const [f, t] = parts.get(id) ?? [0, null];
          return a.since >= f && (t === null || a.since <= t);
        }) ?? line[line.length - 1];
      const me = s.chars[of];
      if (!me) continue;
      for (const k of a.kids)
        if (s.chars[k] && !me.children.includes(k))
          hiddenKids.set(k, { lover: a.c, of });
    }

  // ---------------------------------------------------------------- who's on it
  const order: number[] = [];
  const at = new Map<number, number>();
  const add = (id: number | undefined) => {
    if (id === undefined || id < 0 || !s.chars[id] || at.has(id)) return;
    at.set(id, order.length);
    order.push(id);
  };
  for (const id of line) add(id);
  for (const id of line) {
    const c = s.chars[id];
    add(c.father);
    add(c.mother);
    for (const sb of siblingsOf(s, c)) add(sb.id);
    for (const sp of marriagesOf(id)) add(sp);
    for (const k of c.children) add(k);
    for (const [k, h] of hiddenKids)
      if (h.of === id) {
        add(h.lover);
        add(k);
      }
  }

  const heir = life.c >= 0 ? heirOf(s, life) : -1;
  const idx = (id: number) => (id >= 0 ? (at.get(id) ?? -1) : -1);
  const people: DynPerson[] = order.map((id) => {
    const c = s.chars[id];
    const other = lifeOfChar(s, id);
    const theirs = !!other && other.seat !== life.seat;
    const hid = hiddenKids.get(id);
    const ofLine = line.includes(id);
    const p: DynPerson = {
      ...(ids ? { c: id } : {}),
      first: c.first,
      family: c.family,
      ...(c.title ? { styled: c.title } : {}),
      female: c.female,
      born: year(c.born),
      died: c.died ? year(c.died.day) : null,
      dead: !c.alive,
      ...(c.died && !theirs ? { cause: causePhrase(c.died.cause) } : {}),
      ...(c.abroad ? { abroad: true as const } : {}),
      // A lover's child (never a mother's own: hers are hers) to its father.
      father: hid ? idx(hid.of) : idx(c.father),
      mother: idx(c.mother),
      spouses: marriagesOf(id)
        .map(idx)
        .filter((j) => j >= 0),
      ...(hid ? { hidden: true as const } : {}),
      ...(id === heir ? { heir: true as const } : {}),
      ...(id === life.c && life.c >= 0 ? { you: true as const } : {}),
      ...(theirs ? { other: secrets ? other!.name : "" } : {}),
    };
    if (!theirs) {
      const rec = ofLine ? recOf.get(id) : undefined;
      // What LEGACY says they were ("" when it can't say), or what they are.
      const said = rec && rec.title !== "" ? rec.title : undefined;
      const title = said ?? titleOf(s, c);
      if (title) p.title = title;
      if (c.traits.length) p.traits = c.traits.map((t) => TRAITS[t]?.name ?? t);
      if (c.alive) p.now = nowOf(s, life, map, c);
      if (rec)
        p.life = lifeOfPart(
          s,
          life,
          rec,
          line.indexOf(id) + 1,
          parts.get(id) ?? [life.joined, null],
          storyOf.get(id) ?? [],
          secrets,
        );
    } else {
      const office = officesOf(s, id).sort((a, b) => b.level - a.level)[0];
      if (office) p.title = office.label;
    }
    return p;
  });
  // Lovers who gave the line a child (its own record only).
  for (const [k, h] of hiddenKids) {
    const i = idx(h.of);
    const l = idx(h.lover);
    if (i < 0 || l < 0 || idx(k) < 0) continue;
    const lovers = (people[i].lovers ??= []);
    if (!lovers.includes(l)) lovers.push(l);
  }
  const first = s.chars[line[0]];
  return {
    v: 1,
    family: first?.family ?? life.name,
    ...(life.motto ? { motto: life.motto } : {}),
    year: year(s.day),
    from: recs[0]?.from ?? year(life.joined),
    over: s.over,
    line: line.map(idx),
    people,
  };
}
