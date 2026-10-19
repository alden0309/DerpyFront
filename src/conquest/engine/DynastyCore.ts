// TREE (r25): a line's dynasty, as a record and as a chart. The record is
// everyone on the family tree of a line (every character the player was,
// their husbands and wives, their children played or not, their parents and
// brothers and sisters), each with their years, how they died, what they
// were, and for those the player was, their life: their work and ranks,
// offices, what they left, renown, achievements, the moments of it and their
// chapter of the chronicle. The game makes it from its state (Dynasty.ts);
// the site keeps it (without ids or anything secret) for the account's
// profile, and makes a smaller one from a finished game's chronicle where
// no record was kept.
//
// The chart lays each house (a family the line was) out as a genealogist
// would: generations in rows, husbands and wives side by side, children
// under the couple they came of, every branch as narrow as it will go. Pure:
// no state, no randomness, nothing but types imported, so the site's pages
// can use it too.

import type { Chart, ChartCouple, ChartDescent, ChartNode } from "./KinChart";

// ---------------------------------------------------------------- the record

/** A moment of a life: the year, the words, and what kind of moment it is (StoryCore's kinds). */
export interface DynMoment {
  y: number;
  t: string;
  k: string;
  big?: true;
}

/** The life of someone the line's player was. */
export interface DynLife {
  /** Their place in the line, from 1. */
  n: number;
  came: "born" | "begin" | "heir" | "takeover";
  ended: "died" | "europe" | "ended" | "living";
  /** "died of a fever at 52", "sailed for Europe", "living, 34 years old". */
  fate: string;
  /** The years of their part in the line (to: null while played now). */
  from: number;
  to: number | null;
  /** Their age at the end of their part (or now). */
  age: number;
  /** What they were at the end ("Master cooper"), their highest office, their home. */
  title: string;
  office: string | null;
  home: string;
  /** Their best renown, the purse they left (or have), the coins they earned. */
  renown: number;
  purse: number;
  earned: number;
  children: number;
  battles: number;
  battlesWon: number;
  duels: number;
  wounds: number;
  places: number;
  /** Their best skills ("Trade", 12). */
  skills: [string, number][];
  /** Their work and its ranks, in order ("Took up work as a cooper at Boston", "Rose to master"). */
  work: string[];
  /** Offices and seats, in order. */
  offices: string[];
  /** Achievements earned while they were played (their names). */
  ach: string[];
  /** The moments of their life worth telling, oldest first. */
  moments: DynMoment[];
  /** Their chapter of the chronicle. */
  story: string[];
}

export interface DynPerson {
  /** The character in the game (only in the game's own record; the site's has none). */
  c?: number;
  first: string;
  family: string;
  /** Shown instead of a personal name ("the Mamanatowick"). */
  styled?: string;
  female: boolean;
  /** The year they were born (null: not known). */
  born: number | null;
  /** The year they died (null: living, or not known). */
  died: number | null;
  dead: boolean;
  /** How they died, as the end of "died …": "of a fever at 52". */
  cause?: string;
  /** Died before sixteen (when the year isn't known). */
  young?: true;
  /** A child the site's older records name without saying son or daughter. */
  unsexed?: true;
  /** Gone to Europe for good. */
  abroad?: true;
  /** Their parents on the record (indices; -1: not on it). */
  father: number;
  mother: number;
  /** Husbands and wives on the record (indices), first to last. */
  spouses: number[];
  /** Lovers who gave them a child (only in the line's own record). */
  lovers?: number[];
  /** A lover's child never owned to (only in the line's own record). */
  hidden?: true;
  /** The heir of the one played now. */
  heir?: true;
  /** The one played now (the line's own record). */
  you?: true;
  /** Another player's character (their player's name, in the game; "" on the site). */
  other?: string;
  /** What they are or were: "Master cooper", "At Harvard", "Innkeeper". */
  title?: string;
  /** Their traits, by name. */
  traits?: string[];
  /** The living: where and how they are ("Living at Boston, aged 34"). */
  now?: string;
  /** Someone the line's player was: their life. */
  life?: DynLife;
}

export interface DynastyRecord {
  v: 1;
  /** The first house's family name (the line's). */
  family: string;
  motto?: string;
  /** The year it was set down, and the year the line began. */
  year: number;
  from: number;
  /** The game is over (the record won't change). */
  over: boolean;
  /** Everyone the line's player was, in order (indices into `people`). */
  line: number[];
  people: DynPerson[];
  /** Made from a finished game's chronicle (only the line, their marriages and children). */
  thin?: true;
}

/** A dynasty on a Derp Land profile's list. */
export interface DynastySummary {
  gameId: string;
  family: string;
  /** The years of the line: from its first, to the year it was set down. */
  from: number;
  to: number;
  /** How many lives the line was, and their names in order. */
  lives: number;
  names: string[];
  /** The game has ended. */
  over: boolean;
  /** "kept": its whole tree; "story": a game finished before dynasties were kept. */
  kind: "kept" | "story";
  /** When it was last set down (ISO). */
  at: string;
}

/** A dynasty's page on Derp Land (GET /derpy/api/players/:username/dynasty/:gameId). */
export interface DynastyPage {
  /** The account's name now. */
  username: string;
  summary: DynastySummary;
  record: DynastyRecord;
}

/** A person's name as the tree writes it. */
export function dynName(p: DynPerson): string {
  return p.styled ?? `${p.first} ${p.family}`.trim();
}

/** "1690–1742", "b. 1720", "1702–?", "died young". */
export function dynYears(p: DynPerson): string {
  const b = p.born === null ? "?" : String(p.born);
  if (!p.dead) return p.born === null ? "" : `b. ${b}`;
  if (p.died === null && p.young) return p.born === null ? "died young" : `${b}, died young`;
  return `${b}–${p.died ?? "?"}`;
}

const ORDINALS = [
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
  "Ninth",
  "Tenth",
  "Eleventh",
  "Twelfth",
];

const ROMAN = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
  "XIII",
  "XIV",
  "XV",
  "XVI",
];

export const roman = (n: number): string => ROMAN[n - 1] ?? String(n);
export const ordinalWord = (n: number): string =>
  ORDINALS[n - 1] ?? `${n}th`;

/** How someone stands in the line, in a few words: "Second of the line", "Wife of Alden", "Son of Thomas". */
export function dynRelation(rec: DynastyRecord, i: number): string {
  const P = rec.people;
  const p = P[i];
  if (p.life)
    return p.you
      ? "Head of the family now"
      : `${ordinalWord(p.life.n)} of the line`;
  const f = p.female;
  const first = (j: number) => P[j].styled ?? P[j].first;
  // Closest to someone played: their husband or wife, child, parent, sibling.
  const played = rec.line;
  for (const j of played) {
    if (P[j].spouses.includes(i) || p.spouses.includes(j))
      return `${f ? "Wife" : "Husband"} of ${first(j)}`;
    if (P[j].lovers?.includes(i)) return `Lover of ${first(j)}`;
  }
  for (const j of played)
    if (p.father === j || p.mother === j)
      return `${p.unsexed ? "Child" : f ? "Daughter" : "Son"} of ${first(j)}${p.hidden ? ", unowned" : ""}`;
  for (const j of played)
    if (P[j].father === i || P[j].mother === i)
      return `${f ? "Mother" : "Father"} of ${first(j)}`;
  for (const j of played) {
    const q = P[j];
    if (
      (q.father >= 0 && q.father === p.father) ||
      (q.mother >= 0 && q.mother === p.mother)
    )
      return `${f ? "Sister" : "Brother"} of ${first(j)}`;
  }
  for (let j = 0; j < P.length; j++) {
    if (j === i) continue;
    if (P[j].spouses.includes(i) || p.spouses.includes(j))
      return `${f ? "Wife" : "Husband"} of ${first(j)}`;
  }
  if (p.father >= 0) return `${f ? "Daughter" : "Son"} of ${first(p.father)}`;
  if (p.mother >= 0) return `${f ? "Daughter" : "Son"} of ${first(p.mother)}`;
  return "";
}

// ---------------------------------------------------------------- relations

interface Rel {
  kids: number[][];
  partners: number[][];
}

function relationsOf(rec: DynastyRecord): Rel {
  const P = rec.people;
  const n = P.length;
  const ok = (j: number) => j >= 0 && j < n;
  const kids: number[][] = P.map(() => []);
  P.forEach((p, i) => {
    for (const par of [p.father, p.mother]) if (ok(par)) kids[par].push(i);
  });
  const byBirth = (a: number, b: number) =>
    (P[a].born ?? 9999) - (P[b].born ?? 9999) || a - b;
  for (const k of kids) k.sort(byBirth);
  // Each one's partners: their marriages in order, their lovers, then those
  // whose own record names them, then anyone they had a child with.
  const partners: number[][] = P.map(() => []);
  const add = (a: number, b: number) => {
    if (a === b || !ok(a) || !ok(b)) return;
    if (!partners[a].includes(b)) partners[a].push(b);
  };
  P.forEach((p, i) => {
    for (const s of p.spouses) add(i, s);
    for (const l of p.lovers ?? []) add(i, l);
  });
  P.forEach((p, i) => {
    for (const s of p.spouses) add(s, i);
    for (const l of p.lovers ?? []) add(l, i);
  });
  P.forEach((p) => {
    if (ok(p.father) && ok(p.mother)) {
      add(p.father, p.mother);
      add(p.mother, p.father);
    }
  });
  return { kids, partners };
}

const married = (rec: DynastyRecord, a: number, b: number) =>
  rec.people[a].spouses.includes(b) || rec.people[b].spouses.includes(a);

/**
 * The houses of a line: each family it was, everyone on the record who's
 * kin to them (by birth or marriage), in the order the line came to them.
 */
export function dynastyHouses(rec: DynastyRecord): number[][] {
  const P = rec.people;
  const { kids, partners } = relationsOf(rec);
  const seen = new Set<number>();
  const houses: number[][] = [];
  const walk = (start: number) => {
    const out: number[] = [];
    const q = [start];
    seen.add(start);
    while (q.length) {
      const i = q.shift()!;
      out.push(i);
      const p = P[i];
      for (const j of [p.father, p.mother, ...kids[i], ...partners[i]])
        if (j >= 0 && j < P.length && !seen.has(j)) {
          seen.add(j);
          q.push(j);
        }
    }
    return out.sort((a, b) => a - b);
  };
  for (const i of rec.line) if (!seen.has(i)) houses.push(walk(i));
  for (let i = 0; i < P.length; i++) if (!seen.has(i)) houses.push(walk(i));
  return houses;
}

// ---------------------------------------------------------------- the chart

export interface DynChart extends Chart {
  /** The house's family name, and the years it covers. */
  family: string;
  from: number | null;
  to: number | null;
  /** The people of this house (indices into the record). */
  people: number[];
  /** Who the chart first centres on: the one played now, or the last of the line in it. */
  focus: number;
}

/** A branch laid out: where each person sits, and its edges row by row. */
interface Sub {
  pos: Map<number, number>;
  l: Map<number, number>;
  r: Map<number, number>;
}

const GAP = 0.2;

function shift(s: Sub, dx: number): void {
  for (const [k, v] of s.pos) s.pos.set(k, v + dx);
  for (const [k, v] of s.l) s.l.set(k, v + dx);
  for (const [k, v] of s.r) s.r.set(k, v + dx);
}

/** `b` set beside `a` on its right, as close as every row allows; merged into `a`. */
function besideRight(a: Sub, b: Sub, gap = GAP): void {
  let dx = -Infinity;
  for (const [g, r] of a.r) {
    const l = b.l.get(g);
    if (l !== undefined) dx = Math.max(dx, r + gap - l);
  }
  if (dx === -Infinity)
    dx = Math.max(...a.r.values()) + gap - Math.min(...b.l.values());
  shift(b, dx);
  for (const [k, v] of b.pos) a.pos.set(k, v);
  for (const [g, l] of b.l) a.l.set(g, Math.min(a.l.get(g) ?? Infinity, l));
  for (const [g, r] of b.r) a.r.set(g, Math.max(a.r.get(g) ?? -Infinity, r));
}

/** The chart of one house of a line. */
export function dynastyChart(rec: DynastyRecord, house: number[]): DynChart {
  const P = rec.people;
  const { kids, partners } = relationsOf(rec);
  const inHouse = new Set(house);
  const firstPlayed = rec.line.find((i) => inHouse.has(i)) ?? house[0];

  // Generations, from the first of the line in the house (0).
  const gen = new Map<number, number>([[firstPlayed, 0]]);
  const q = [firstPlayed];
  while (q.length) {
    const i = q.shift()!;
    const g = gen.get(i)!;
    const p = P[i];
    const next: [number, number][] = [
      [p.father, g - 1],
      [p.mother, g - 1],
      ...kids[i].map((k): [number, number] => [k, g + 1]),
      ...partners[i].map((k): [number, number] => [k, g]),
    ];
    for (const [j, gj] of next)
      if (inHouse.has(j) && !gen.has(j)) {
        gen.set(j, gj);
        q.push(j);
      }
  }
  for (const i of house) if (!gen.has(i)) gen.set(i, 0);

  const claimed = new Set<number>();
  const couples: ChartCouple[] = [];
  const descents: ChartDescent[] = [];
  const pairKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const paired = new Set<string>();

  /** Someone and their husbands and wives in a row, their children's branches beneath. */
  const unit = (i: number): Sub => {
    claimed.add(i);
    const g = gen.get(i)!;
    const ps = partners[i].filter(
      (p) => inHouse.has(p) && !claimed.has(p) && gen.get(p) === g,
    );
    for (const p of ps) claimed.add(p);
    const members =
      ps.length === 0 ? [i] : ps.length === 1 ? [i, ps[0]] : [ps[0], i, ...ps.slice(1)];
    for (const p of ps) paired.add(pairKey(i, p));
    // The children of anyone in the row, by the couple they came of.
    const groups: { parents: number[]; kids: number[]; at: number }[] = [];
    const seenKid = new Set<number>();
    for (const m of members)
      for (const k of kids[m]) {
        if (!inHouse.has(k) || seenKid.has(k)) continue;
        seenKid.add(k);
        const kp = P[k];
        const other = kp.father === m ? kp.mother : kp.father;
        const parents =
          other >= 0 && members.includes(other)
            ? [m, other].sort((a, b) => members.indexOf(a) - members.indexOf(b))
            : [m];
        let gr = groups.find(
          (x) =>
            x.parents.length === parents.length &&
            x.parents.every((y, j) => y === parents[j]),
        );
        if (!gr) {
          gr = {
            parents,
            kids: [],
            at:
              parents.reduce((s, y) => s + members.indexOf(y), 0) /
              parents.length,
          };
          groups.push(gr);
        }
        gr.kids.push(k);
      }
    groups.sort((a, b) => a.at - b.at);
    let acc: Sub | null = null;
    const placed: { gr: (typeof groups)[number]; kids: number[] }[] = [];
    for (const gr of groups) {
      const mine: number[] = [];
      for (const k of gr.kids) {
        if (claimed.has(k)) continue;
        const sub = unit(k);
        mine.push(k);
        if (!acc) acc = sub;
        else besideRight(acc, sub);
      }
      placed.push({ gr, kids: mine });
      descents.push({
        parents: gr.parents,
        children: gr.kids,
        ...(gr.kids.some((k) => P[k].hidden) ? { hidden: true } : {}),
      });
    }
    // The row over its children: each couple as near over its own as it'll go.
    let off = 0;
    if (acc) {
      let w = 0;
      let sum = 0;
      for (const { gr, kids: ks } of placed) {
        if (!ks.length) continue;
        const xs = ks.map((k) => acc!.pos.get(k)!);
        const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
        sum += (mid - gr.at) * ks.length;
        w += ks.length;
      }
      off = w ? sum / w : 0;
    } else off = -(members.length - 1) / 2;
    const out: Sub = acc ?? { pos: new Map(), l: new Map(), r: new Map() };
    members.forEach((m, j) => out.pos.set(m, off + j));
    const lo = off - 0.5;
    const hi = off + members.length - 0.5;
    out.l.set(g, Math.min(out.l.get(g) ?? Infinity, lo));
    out.r.set(g, Math.max(out.r.get(g) ?? -Infinity, hi));
    return out;
  };

  /** Up from someone to their eldest forebear not yet on the chart. */
  const climb = (i: number): number => {
    let at = i;
    for (;;) {
      const p = P[at];
      const up = [p.father, p.mother].find(
        (x) => x >= 0 && inHouse.has(x) && !claimed.has(x),
      );
      if (up === undefined) return at;
      at = up;
    }
  };

  // The line first (its eldest forebear), then anyone left, each beside the rest.
  const order = [
    ...rec.line.filter((i) => inHouse.has(i)),
    ...house
      .filter((i) => !P[i].life)
      .sort((a, b) => (P[a].born ?? 9999) - (P[b].born ?? 9999) || a - b),
  ];
  let all: Sub | null = null;
  for (const i of order) {
    if (claimed.has(i)) continue;
    const sub = unit(climb(i));
    if (!all) all = sub;
    else besideRight(all, sub, 0.6);
  }
  const pos = all!.pos;

  // Husbands and wives (and lovers) with others between them, or placed apart.
  for (const i of house)
    for (const p of partners[i]) {
      if (!inHouse.has(p) || gen.get(p) !== gen.get(i)) continue;
      paired.add(pairKey(i, p));
    }
  const lanes = new Map<number, number>();
  const done = new Set<string>();
  for (const key of [...paired].sort()) {
    const [a, b] = key.split("|").map(Number);
    if (done.has(key) || !pos.has(a) || !pos.has(b)) continue;
    done.add(key);
    const near = Math.abs(pos.get(a)! - pos.get(b)!) <= 1.01;
    const g = gen.get(a)!;
    const lane = near ? 0 : (lanes.get(g) ?? 0);
    if (!near) lanes.set(g, lane + 1);
    // The line's own first, so the rule runs from them.
    const [x, y] = P[b].life && !P[a].life ? [b, a] : [a, b];
    couples.push({
      a: x,
      b: y,
      kind: married(rec, a, b) ? "married" : "lovers",
      near,
      lane,
    });
  }

  // ---------------------------------------------------------------- tidy up
  const xs = [...pos.values()];
  const minX = Math.min(...xs);
  const nodes: ChartNode[] = house
    .filter((i) => pos.has(i))
    .map((i) => ({
      c: i,
      gen: gen.get(i)!,
      x: Math.round((pos.get(i)! - minX) * 100) / 100,
    }));
  const byId = new Map(nodes.map((n) => [n.c, n]));
  const ds = descents
    .map((d) => {
      const pg = byId.get(d.parents[0])?.gen;
      return {
        ...d,
        children: d.children.filter((k) => byId.get(k)?.gen === (pg ?? 0) + 1),
      };
    })
    .filter(
      (d) =>
        d.children.length > 0 &&
        d.parents.every((p) => byId.get(p)?.gen === byId.get(d.parents[0])?.gen),
    );
  const gens = nodes.map((n) => n.gen);
  const years = house
    .flatMap((i) => [P[i].born, P[i].died])
    .filter((y): y is number => y !== null);
  const played = rec.line.filter((i) => inHouse.has(i));
  const focus =
    played.find((i) => P[i].you) ?? played[played.length - 1] ?? house[0];
  return {
    family: P[firstPlayed]?.family ?? rec.family,
    from: years.length ? Math.min(...years) : null,
    to: years.length ? Math.max(...years) : null,
    people: house,
    focus,
    nodes,
    couples,
    descents: ds,
    minX: 0,
    maxX: Math.max(...nodes.map((n) => n.x)),
    minGen: Math.min(...gens),
    maxGen: Math.max(...gens),
  };
}

/** Every house of a line, charted. */
export function dynastyCharts(rec: DynastyRecord): DynChart[] {
  if (!rec.people.length) return [];
  return dynastyHouses(rec).map((h) => dynastyChart(rec, h));
}

// ---------------------------------------------------------------- the site's

/** A finished game's chronicle, as the site keeps it (Protocol's StoredChronicle, in part). */
export interface ThinChronicle {
  chapters: { name: string; paras: string[] }[];
  tree: {
    name: string;
    years: string;
    came: string;
    spouses: string[];
    children: { name: string; born: number; heir: boolean; young: boolean }[];
  }[];
}

/** A line's character, as the site keeps them (Legacy's LineChar, in part). */
export interface ThinChar {
  name: string;
  female: boolean;
  born: number;
  from: number;
  to: number | null;
  came: DynLife["came"];
  ended: DynLife["ended"];
  fate: string;
  age: number;
  title: string;
  office: string | null;
  home: string;
  renown: number;
  purse: number;
  earned: number;
  children: number;
  battles: number;
  battlesWon: number;
  duels: number;
  wounds: number;
  places: number;
  skills: [string, number][];
  traits: string[];
}

/** "Amos Fell" into its first and family names. */
function splitName(name: string, family?: string): { first: string; family: string } {
  if (family && name.endsWith(` ${family}`))
    return { first: name.slice(0, -family.length - 1), family };
  const i = name.indexOf(" ");
  return i < 0
    ? { first: name, family: family ?? "" }
    : { first: name.slice(0, i), family: name.slice(i + 1) };
}

/**
 * A dynasty from a finished game's chronicle and characters, for games
 * finished before the site kept dynasties: the line, the husbands and wives
 * they married (by name), and their children (the heir is the next of the
 * line). Nothing about parents or brothers and sisters.
 */
export function dynastyFromChronicle(
  chars: ThinChar[],
  ch: ThinChronicle | undefined,
  o: { over: boolean; year: number },
): DynastyRecord {
  const people: DynPerson[] = [];
  const line: number[] = [];
  const tree = ch?.tree ?? [];
  // The next of the line, if they were the heir child of the one before.
  let heirSlot = -1;
  chars.forEach((c, n) => {
    const t = tree[n];
    const name = splitName(c.name);
    const dead = c.ended !== "living";
    const life: DynLife = {
      n: n + 1,
      came: c.came,
      ended: c.ended,
      fate: c.fate,
      from: c.from,
      to: c.to,
      age: c.age,
      title: c.title,
      office: c.office,
      home: c.home,
      renown: c.renown,
      purse: c.purse,
      earned: c.earned,
      children: c.children,
      battles: c.battles,
      battlesWon: c.battlesWon,
      duels: c.duels,
      wounds: c.wounds,
      places: c.places,
      skills: c.skills,
      work: [],
      offices: c.office ? [c.office] : [],
      ach: [],
      moments: [],
      story: ch?.chapters[n]?.name === c.name ? ch.chapters[n].paras : [],
    };
    const me: DynPerson = {
      ...name,
      female: c.female,
      born: c.born,
      died: dead && c.ended === "died" ? c.to : null,
      dead: dead && c.ended === "died",
      ...(c.ended === "europe" ? { abroad: true as const } : {}),
      father: -1,
      mother: -1,
      spouses: [],
      title: c.title || undefined,
      traits: c.traits,
      ...(c.ended === "living" ? { now: cap(c.fate) } : {}),
      life,
    };
    let at: number;
    if (heirSlot >= 0 && c.came === "heir") {
      // The heir was already on the tree as a child of the one before.
      at = heirSlot;
      const was = people[at];
      people[at] = { ...me, father: was.father, mother: was.mother };
    } else {
      at = people.push(me) - 1;
    }
    line.push(at);
    heirSlot = -1;
    if (!t) return;
    const spouses = t.spouses.map((s) => {
      const sp = splitName(s);
      return (
        people.push({
          ...sp,
          female: !c.female,
          born: null,
          died: null,
          dead: false,
          father: -1,
          mother: -1,
          spouses: [at],
        }) - 1
      );
    });
    people[at].spouses = spouses;
    const other = spouses.length === 1 ? spouses[0] : -1;
    for (const k of t.children) {
      const kid: DynPerson = {
        first: k.name,
        family: c.female ? (people[other]?.family ?? name.family) : name.family,
        // The chronicle doesn't say: the heir's own record says, when they come.
        female: false,
        unsexed: true,
        born: k.born,
        died: null,
        dead: k.young,
        ...(k.young ? { young: true as const } : {}),
        father: c.female ? other : at,
        mother: c.female ? at : other,
        spouses: [],
      };
      const ki = people.push(kid) - 1;
      if (k.heir) heirSlot = ki;
    }
  });
  return {
    v: 1,
    family: people[line[0]]?.family ?? "",
    year: o.year,
    from: chars[0]?.from ?? o.year,
    over: o.over,
    line,
    people,
    thin: true,
  };
}

function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
