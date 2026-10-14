// LEGACY (r21): every character a line was. When a character's part in a
// line ends (they die, sail for Europe, or the line ends with them), what
// they were is kept: their title, home, renown, purse, health, skills,
// husband or wife, friends and enemies, and the line's counts when their
// part began and ended (so each of them has their own children, battles,
// years and earnings). The story's chapters (Chronicle.ts), the end screen,
// and the site's game page and profiles read them through lineCharacters().
//
// It only listens (a milestone hook, and the month's best renown) and only
// writes `life.legacy`: no dice, no ids, so the world's luck is untouched.
// An old save's earlier characters are told from what the game still knows
// of them (their dates, their moments).

import { dateOf } from "./Calendar";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { touchLife } from "./LifeCore";
import { lifeTitle } from "./LifeQueries";
import { SKILL_NAMES } from "./LifeRules";
import { ageOf, charName } from "./Queries";
import type {
  Character,
  GameState,
  Life,
  LifeLegacy,
  LifeMilestone,
  LifeTally,
  LineCame,
  LineRecord,
  MapDef,
  Skill,
  TallyMark,
} from "./Types";

/** The line's counts now. */
export function markOf(t: LifeTally): TallyMark {
  return {
    days: t.days,
    jobs: t.jobs,
    promotions: t.promotions,
    children: t.children,
    marriages: t.marriages,
    battles: t.battles,
    battlesWon: t.battlesWon,
    wounds: t.wounds,
    provinces: t.provinces,
    earned: Math.round(t.earned),
    elections: t.elections,
    duels: t.kinds?.duel ?? 0,
  };
}

const ZERO: TallyMark = {
  days: 0,
  jobs: 0,
  promotions: 0,
  children: 0,
  marriages: 0,
  battles: 0,
  battlesWon: 0,
  wounds: 0,
  provinces: 0,
  earned: 0,
  elections: 0,
  duels: 0,
};

function legacyOf(life: Life): LifeLegacy {
  return (life.legacy ??= { recs: [] });
}

/** A character's part in the line begins (born, begun, an heir, a life taken up). */
function begin(g: ConquestGame, life: Life, came: LineCame): void {
  touchLife(g, life);
  const L = legacyOf(life);
  L.since = g.s.day;
  L.came = came;
  L.t0 = markOf(life.tally);
  L.peak = Math.round(life.renown);
}

/** How a character came to the line, from their moments (an old save's). */
function cameOf(life: Life, c: number): LineCame {
  const m = life.milestones.find(
    (x) =>
      x.c === c &&
      (x.kind === "born" ||
        x.kind === "begin" ||
        x.kind === "heir" ||
        x.kind === "takeover"),
  );
  if (m) return m.kind as LineCame;
  return life.line[0] === c ? "born" : "heir";
}

/** The day a character's part began, from their moments (an old save's). */
function sinceOf(life: Life, c: number): number {
  const m = life.milestones.find((x) => x.c === c);
  return m?.day ?? life.joined;
}

/** What a character is as their part ends (or stands, for the one played now). */
function recordNow(
  s: GameState,
  life: Life,
  ended: LineRecord["ended"],
  why: string,
): LineRecord | null {
  const me = s.chars[life.c];
  if (!me) return null;
  const L = life.legacy;
  return {
    c: me.id,
    from: L?.since ?? sinceOf(life, me.id),
    to: s.day,
    came: L?.came ?? cameOf(life, me.id),
    ended,
    why,
    title: lifeTitle(s, life),
    home: life.home,
    renown: Math.round(Math.max(L?.peak ?? 0, life.renown)),
    purse: Math.round(life.purse),
    health: Math.round(life.health),
    skills: topSkills(life.skills, 4),
    spouse: me.spouse,
    patron: life.patron,
    ties: Object.entries(life.ties)
      .filter(([, t]) => t !== "lover") // a lover is nobody else's business
      .map(([c, tie]) => ({ c: Number(c), tie })),
    // An old save's first part ends knowing only the line's counts.
    t0: L?.t0 ?? (L?.recs.length ? L.recs[L.recs.length - 1].t1 : ZERO),
    t1: markOf(life.tally),
  };
}

/** A character's part ends: what they were is kept (once). */
function close(
  g: ConquestGame,
  life: Life,
  ended: LineRecord["ended"],
  why: string,
): void {
  const L = legacyOf(life);
  if (life.c < 0 || L.recs.some((r) => r.c === life.c)) return;
  const rec = recordNow(g.s, life, ended, why);
  if (!rec) return;
  touchLife(g, life);
  L.recs.push(rec);
  delete L.since;
  delete L.came;
  delete L.t0;
  delete L.peak;
}

function topSkills(
  skills: Life["skills"],
  n: number,
): Partial<Record<Skill, number>> {
  const out: Partial<Record<Skill, number>> = {};
  for (const [k, v] of (Object.entries(skills) as [Skill, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n))
    out[k] = v;
  if (skills.fighting !== undefined) out.fighting = skills.fighting;
  return out;
}

hooks.milestone.push((g, life, m: LifeMilestone) => {
  switch (m.kind) {
    case "born":
    case "begin":
    case "heir":
    case "takeover":
      return begin(g, life, m.kind);
    case "died":
      return close(g, life, "died", m.text);
    case "europe":
      return close(g, life, "europe", m.text);
    case "watching":
      return close(g, life, "ended", m.text);
  }
});

hooks.lifeMonthly.push((g, life) => {
  const L = life.legacy;
  if (!L || life.c < 0 || life.renown <= (L.peak ?? 0)) return;
  touchLife(g, life).legacy!.peak = Math.round(life.renown);
});

// ---------------------------------------------------------------- reading them

/** What a character was in their line, for the end screen and the site (Protocol's LineCharacter). */
export interface LineChar {
  /** The character (an id in the game). */
  c: number;
  name: string;
  female: boolean;
  /** Years: born, and their part in the line (to: null while still played). */
  born: number;
  from: number;
  to: number | null;
  came: LineCame;
  ended: LineRecord["ended"] | "living";
  /** "died, a fever at 52", "sailed for Europe", "living in 1776". */
  fate: string;
  age: number;
  title: string;
  office: string | null;
  home: string;
  renown: number;
  purse: number;
  earned: number;
  spouse: string | null;
  children: number;
  battles: number;
  battlesWon: number;
  duels: number;
  wounds: number;
  places: number;
  fighting: number;
  health: number;
  skills: [string, number][];
  stats: Character["stats"];
  traits: string[];
}

/** The highest office a character's moments tell of ("Burgess for Jamestown"), or null. */
export function officeOf(life: Life, c: number): string | null {
  let best: { text: string; w: number } | null = null;
  for (const m of life.milestones) {
    if (m.c !== c || m.kind !== "office" || m.sec) continue;
    const t = m.text;
    const got =
      /^(?:.+? became|Became|Made|Commissioned) (.+)$/.exec(t)?.[1] ??
      /^Proclaimed .+?, its first (.+)$/.exec(t)?.[1] ??
      (/^Chosen speaker of (.+)$/.test(t)
        ? `Speaker of ${/^Chosen speaker of (.+)$/.exec(t)![1]}`
        : null) ??
      (/^Elected to (.+)$/.test(t)
        ? `Member of ${/^Elected to (.+)$/.exec(t)![1]}`
        : null);
    if (!got || /famous/.test(got)) continue;
    const w = /governor|sachem|first /i.test(got)
      ? 4
      : /council|speaker|lieutenant/i.test(got)
        ? 3
        : /assembly|burgess|member/i.test(got)
          ? 2
          : 1;
    if (!best || w >= best.w) best = { text: cap(got), w };
  }
  return best?.text ?? null;
}

/**
 * A cause of death as the end of "died …": "of a fever at 52", "in battle at
 * Quebec", "hanged at Boston for theft".
 */
export function causePhrase(cause: string): string {
  if (/^(battle|a duel|the fury|a rising)\b/.test(cause)) return `in ${cause}`;
  if (
    /^(a |an |the |old age|illness|camp fever|strain|poison|smallpox|fever|consumption|the ague|the flux)/.test(
      cause,
    )
  )
    return `of ${cause}`;
  return cause;
}

/** "died of a fever at 52" from "Amos Fell died, a fever at 52". */
function fateOf(
  s: GameState,
  c: Character,
  ended: LineChar["ended"],
  why: string,
): string {
  if (ended === "living")
    return s.over
      ? `living in ${dateOf(s.day).year}`
      : `living, ${ageOf(s, c)} years old`;
  if (ended === "europe") return "sailed for Europe";
  if (ended === "died" || !c.alive) {
    const cause = c.died?.cause ?? /died, (.+)$/.exec(why)?.[1];
    return cause ? `died ${causePhrase(cause)}` : "died";
  }
  return why.replace(new RegExp(`^${escape(charName(c))} `), "").trim();
}

/** Every character of a line, in order, with what they were (`map` names their homes). */
export function lineCharacters(
  s: GameState,
  life: Life,
  map: Pick<MapDef, "provinces">,
): LineChar[] {
  const out: LineChar[] = [];
  const seen = new Set<number>();
  const L = life.legacy;
  for (const id of life.line) {
    if (seen.has(id)) continue;
    seen.add(id);
    const c = s.chars[id];
    if (!c) continue;
    const living = id === life.c && life.c >= 0;
    const rec =
      L?.recs.find((r) => r.c === id) ??
      (living ? recordNow(s, life, "died", "") : null);
    const mine = life.milestones.filter((m) => m.c === id && !m.sec);
    const places = new Set(life.trail.filter((t) => t.c === id).map((t) => t.p))
      .size;
    const ended: LineChar["ended"] = living
      ? "living"
      : (rec?.ended ?? (!c.alive ? "died" : c.abroad ? "europe" : "ended"));
    const from = rec?.from ?? sinceOf(life, id);
    const to = living ? null : (rec?.to ?? c.died?.day ?? lastDay(mine));
    const d = (k: keyof TallyMark) =>
      rec ? Math.max(0, rec.t1[k] - rec.t0[k]) : 0;
    const count = (kind: string, re?: RegExp) =>
      mine.filter((m) => m.kind === kind && (!re || re.test(m.text))).length;
    const ageAt = Math.floor(((to ?? s.day) - c.born) / 365);
    const sp = rec && rec.spouse >= 0 ? s.chars[rec.spouse] : undefined;
    out.push({
      c: id,
      name: charName(c),
      female: c.female,
      born: dateOf(c.born).year,
      from: dateOf(from).year,
      to: to === null ? null : dateOf(to).year,
      came: rec?.came ?? cameOf(life, id),
      ended,
      fate: fateOf(s, c, ended, rec?.why ?? ""),
      age: ageAt,
      title: rec?.title ?? titleFromMoments(mine),
      office: officeOf(life, id),
      home: map.provinces[rec?.home ?? c.home ?? life.home]?.name ?? "",
      renown: rec?.renown ?? 0,
      purse: rec?.purse ?? 0,
      earned: d("earned"),
      spouse: sp ? charName(sp) : spouseFromMoments(mine),
      children: rec ? d("children") : count("child"),
      battles: rec ? d("battles") : count("battle"),
      battlesWon: rec ? d("battlesWon") : count("battle", /^(Won|Took|Retook)/),
      duels: rec ? d("duels") : count("duel"),
      wounds: rec ? d("wounds") : count("wounded"),
      places,
      fighting: rec?.skills.fighting ?? 0,
      health: rec?.health ?? 0,
      skills: (Object.entries(rec?.skills ?? {}) as [Skill, number][])
        .filter(
          ([k]) => k !== "fighting" || Object.keys(rec!.skills).length <= 4,
        )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, v]) => [SKILL_NAMES[k] ?? k, v]),
      stats: { ...c.stats },
      traits: [...c.traits],
    });
  }
  return out;
}

/** An old save's character: what their work was, from their moments. */
function titleFromMoments(mine: LifeMilestone[]): string {
  for (let i = mine.length - 1; i >= 0; i--) {
    const t = mine[i].text;
    const rose = /^Rose to (.+)$/.exec(t);
    if (rose) return cap(rose[1]);
    const took = /^Took up work as (.+?) at /.exec(t);
    if (took) return cap(took[1]);
  }
  return "";
}

function spouseFromMoments(mine: LifeMilestone[]): string | null {
  for (let i = mine.length - 1; i >= 0; i--) {
    const m = /^Married (.+)$/.exec(mine[i].text);
    if (m && mine[i].kind === "married") return m[1];
  }
  return null;
}

function lastDay(ms: LifeMilestone[]): number | null {
  return ms.length ? ms[ms.length - 1].day : null;
}

function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function escape(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
