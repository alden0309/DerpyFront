// LEGACY (r21): the chronicle of a line, told in chapters. Each character
// the line was gets a chapter written from their moments (who, where, why,
// and what came of it): how they came into the story, their work and
// fortune, their family, their wars and quarrels, their public life, the
// sea and the road, and how their part ended; with the people who mattered
// to them, their own big numbers, and the roads they travelled. Around the
// chapters: an opening and a closing for the whole line, its big numbers,
// and the family's line from one generation to the next.
//
// Pure: it reads the state (and the records Legacy.ts keeps) and writes
// nothing. The story so far, the story told at the end, and the site's page
// for a finished game are all made here. `secrets: false` (for anyone but
// the line's own player) leaves out what only they know.

import { dateOf } from "./Calendar";
import { causePhrase, lineCharacters, type LineChar } from "./Legacy";
import { lifeScore } from "./LifeQueries";
import { charName } from "./Queries";
import { storyKind, storyWeight } from "./StoryCore";
import type {
  Character,
  GameState,
  Life,
  LifeMilestone,
  MapDef,
  Tie,
} from "./Types";

export interface ChronNumber {
  label: string;
  value: string;
}

export interface ChronPerson {
  /** The character (-1: known only by name). */
  c: number;
  name: string;
  /** What they were to them: "wife", "son and heir", "friend", "patron". */
  role: string;
}

export interface ChronChapter {
  n: number;
  /** "I", "II"… */
  roman: string;
  c: number;
  name: string;
  /** "1700–1737" (or "1752–", still living). */
  years: string;
  /** What they were: "tenant farmer at Jamestown". */
  title: string;
  paras: string[];
  people: ChronPerson[];
  numbers: ChronNumber[];
  /** The provinces they travelled, in order (for the chapter's map). */
  places: number[];
  /** What they were, with their stats. */
  record: LineChar;
}

export interface ChronTreeGen {
  c: number;
  name: string;
  years: string;
  came: LineChar["came"];
  spouses: string[];
  children: {
    c: number;
    name: string;
    born: number;
    /** Carried the line on (the next chapter). */
    heir: boolean;
    /** Died before 16. */
    young: boolean;
  }[];
}

export interface Chronicle {
  /** "The Fell line, 1700 to 1776". */
  title: string;
  family: string;
  opening: string;
  numbers: ChronNumber[];
  chapters: ChronChapter[];
  closing: string;
  tree: ChronTreeGen[];
}

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
];

/** Moments told of someone done to: "Wounded at Quebec" is "he was wounded at Quebec". */
const PASSIVE = new Set(
  "Wounded Taken Betrothed Acquitted Convicted Elected Returned Made Chosen Commissioned Granted Recalled Caught Tried".split(
    " ",
  ),
);

/** Moments that open sentences with their verb ("Married Mary Cole"). */
const VERBS = new Set(
  "Acknowledged Acquitted Bought Broke Brought Built Became Betrothed Came Carried Caught Chosen Commissioned Convicted Declared Divorced Elected Fought Found Founded Fulfilled Gave Granted Hid Informed Joined Killed Knocked Lost Made Married Met Moved Passed Petitioned Proclaimed Ran Recalled Retook Returned Rode Rose Sailed Sat Served Set Sold Struck Taken Took Tried Went Won Wounded Lived Left Raised Kept Led Opened Signed Paid Struck Stood Saved Freed Fled Named Endowed Hired Lent Sued Settled Paid".split(
    " ",
  ),
);

interface Pron {
  he: string;
  He: string;
  his: string;
  His: string;
  him: string;
}

function pron(c: Character | undefined): Pron {
  return c?.female
    ? { he: "she", He: "She", his: "her", His: "Her", him: "her" }
    : { he: "he", He: "He", his: "his", His: "His", him: "him" };
}

function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function lower1(t: string): string {
  return t.charAt(0).toLowerCase() + t.slice(1);
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function nf(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${nf(n)} ${n === 1 ? one : many}`;
}

const WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

/** "seven children", "twenty-two sieges" stays "22 sieges". */
function counted(n: number, one: string, many = `${one}s`): string {
  return n <= 12 ? `${WORDS[n]} ${n === 1 ? one : many}` : plural(n, one, many);
}

/** "once", "twice", "four times". */
function times(n: number): string {
  return n === 1 ? "once" : n === 2 ? "twice" : `${counted(n, "time")}`;
}

/** A moment's words as a clause with its subject: "he married Mary Cole". */
export function clauseOf(text: string, who: Character | undefined): string {
  const p = pron(who);
  let t = text
    .replace(/\bto you\b/g, `to ${p.him}`)
    .replace(/\byou both\b/g, "they both")
    .replace(/\byou came\b/g, `${p.he} came`)
    .replace(/\byour own\b/g, `${p.his} own`)
    .replace(/\bYour\b/g, p.His)
    .replace(/\byour\b/g, p.his)
    .replace(/\byou\b/g, p.him);
  const name = who ? charName(who) : "";
  if (name && t.startsWith(`${name} `))
    return `${p.he} ${t.slice(name.length + 1)}`;
  if (/^Widowed: /.test(t))
    return `${p.he} was widowed: ${lower1(t.slice("Widowed: ".length))}`;
  const first = t.split(/[\s,:]/)[0];
  if (PASSIVE.has(first)) return `${p.he} was ${lower1(t)}`;
  if (VERBS.has(first)) return `${p.he} ${lower1(t)}`;
  if (/^(A|An|The|His|Her)\b/.test(t)) return lower1(t);
  return t;
}

/** "In 1712 he married Mary Cole, and rose to master." */
function yearSentences(
  items: LifeMilestone[],
  who: Character | undefined,
  max: number,
): string[] {
  const byYear = new Map<number, LifeMilestone[]>();
  for (const m of items) {
    const y = dateOf(m.day).year;
    byYear.set(y, [...(byYear.get(y) ?? []), m]);
  }
  const years = [...byYear.entries()];
  // Keep the weightiest years when there are too many to tell.
  let kept = years;
  if (years.length > max) {
    const weight = (ms: LifeMilestone[]) =>
      ms.reduce((n, m) => n + storyWeight(m), 0);
    const best = new Set(
      [...years]
        .sort((a, b) => weight(b[1]) - weight(a[1]) || a[0] - b[0])
        .slice(0, max)
        .map((y) => y[0]),
    );
    kept = years.filter((y) => best.has(y[0]));
  }
  let last = -999;
  let run = 0;
  const NEXT = ["The next year", "A year later", "The year after that"];
  const out = kept.map(([year, ms]) => {
    const clauses = ms.slice(0, 3).map((m, i) => {
      const c = clauseOf(m.text, who);
      // "he married…, rose to…": the subject once a sentence.
      const p = pron(who);
      return i > 0 && c.startsWith(`${p.he} `) ? c.slice(p.he.length + 1) : c;
    });
    run = year === last + 1 ? run + 1 : 0;
    const when = run > 0 ? NEXT[(run - 1) % NEXT.length] : `In ${year}`;
    last = year;
    const more = ms.length > 3 ? ", among other things" : "";
    return `${when} ${list(clauses)}${more}.`;
  });
  if (years.length > kept.length)
    out.push(
      `There was more of the kind: ${plural(years.length - kept.length, "other year")} of it, told year by year below.`,
    );
  return out;
}

// ---------------------------------------------------------------- the themes

const WORK = new Set([
  "job",
  "promoted",
  "business",
  "company",
  "find",
  "crime",
]);
const FAMILY = new Set(["married", "child", "loss", "school"]);
const STRIFE = new Set([
  "battle",
  "wounded",
  "duel",
  "arrest",
  "trial",
  "convicted",
  "escape",
  "plot",
  "movement",
  "rising",
]);
const PUBLIC = new Set(["office", "election", "petition"]);
const SEA = new Set(["voyage", "storm", "wreck", "prize", "moved", "freed"]);
/** Told in their own way (counted, or in the opening and the end), not as moments. */
const ASIDE = new Set([
  "born",
  "begin",
  "heir",
  "takeover",
  "died",
  "watching",
  "end",
  "europe",
  "achievement",
  "fight",
  "dice",
  "home",
  "taken",
]);

function themeOf(m: LifeMilestone): string {
  const k = storyKind(m);
  if (ASIDE.has(k)) return "aside";
  if (k === "renown") return /portrait/.test(m.text) ? "aside" : "public";
  if (WORK.has(k)) return "work";
  if (FAMILY.has(k)) return "family";
  if (STRIFE.has(k)) return "strife";
  if (PUBLIC.has(k)) return "public";
  if (SEA.has(k)) return "sea";
  return "other";
}

/** The chapter of one character. */
function chapter(
  s: GameState,
  life: Life,
  map: Pick<MapDef, "provinces">,
  rec: LineChar,
  i: number,
  all: LineChar[],
  secrets: boolean,
): ChronChapter {
  const who = s.chars[rec.c];
  const p = pron(who);
  const mine = life.milestones.filter(
    (m) => m.c === rec.c && (secrets || !m.sec),
  );
  const first = who?.first ?? rec.name.split(" ")[0];
  const place = (pi: number | undefined) =>
    pi !== undefined ? (map.provinces[pi]?.name ?? "") : "";
  const paras: string[] = [];

  // ---- how they came into the story
  const opener = mine.find((m) =>
    ["born", "begin", "heir", "takeover"].includes(m.kind),
  );
  const prev = i > 0 ? all[i - 1] : null;
  let open = "";
  if (opener?.kind === "born" || opener?.kind === "begin") {
    const b = /^(.+?), (.+?), (\d+), at (.+)$/.exec(opener.text);
    open = b
      ? `${rec.name} came into the story at ${b[4]} in ${dateOf(opener.day).year}, a ${b[2]} of ${b[3]}.`
      : `${rec.name} came into the story in ${dateOf(opener.day).year}.`;
  } else if (opener?.kind === "heir" && prev) {
    const how =
      prev.ended === "europe"
        ? `When ${prev.name} sailed for Europe in ${prev.to ?? rec.from}, ${first} stayed to carry on the family`
        : `When ${prev.name} died in ${prev.to ?? rec.from}, ${first}, ${Math.max(0, rec.from - rec.born)}, became head of the family`;
    open = `${how}${rec.home ? ` at ${rec.home}` : ""}.`;
  } else if (opener?.kind === "takeover") {
    open = `In ${dateOf(opener.day).year} the story took up the life of ${rec.name}, ${Math.max(0, rec.from - rec.born)}${rec.home ? `, at ${rec.home}` : ""}.`;
  } else {
    open = `${rec.name} carried the story on from ${rec.from}.`;
  }
  const firstJob = mine.find(
    (m) => m.kind === "job" && /^Took up work/.test(m.text),
  );
  if (firstJob && dateOf(firstJob.day).year - rec.from <= 1)
    open += ` ${p.He} ${lower1(firstJob.text)}.`;
  paras.push(open);

  // ---- the themes, each its own paragraph
  const themed = (t: string) =>
    mine.filter((m) => themeOf(m) === t && m !== firstJob);
  const work = themed("work");
  // Rising in a trade: one sentence, every rung and its year.
  const rose = work.filter((m) => /^Rose to /.test(m.text));
  const rungs: string[] = [];
  for (const m of rose) {
    const r = m.text.slice("Rose to ".length);
    if (!rungs.some((x) => x.startsWith(`${r} (`)))
      rungs.push(`${r} (${dateOf(m.day).year})`);
  }
  const workText = [
    ...(rungs.length ? [`${p.He} rose to ${list(rungs)}.`] : []),
    ...yearSentences(
      work.filter((m) => !rose.includes(m)),
      who,
      4,
    ),
  ];
  const money: string[] = [];
  if (rec.earned > 0)
    money.push(
      `In ${plural(Math.max(1, (rec.to ?? dateOf(s.day).year) - rec.from), "year")} ${p.he} earned ${plural(rec.earned, "coin")}`,
    );
  if (rec.ended !== "living" && rec.purse > 0)
    money.push(`left ${plural(rec.purse, "coin")} in the purse`);
  if (work.length || money.length)
    paras.push(
      [...workText, money.length ? `${list(money)}.` : ""]
        .filter(Boolean)
        .join(" "),
    );

  // Family: the marriage(s), the children by name, the losses.
  const fam = themed("family");
  const births = fam.filter((m) => m.kind === "child");
  const famRest = fam.filter((m) => m.kind !== "child");
  const famText: string[] = yearSentences(famRest, who, 5);
  if (births.length) {
    const names = births
      .map((m) => {
        const k = /, (\w+), was born/.exec(m.text)?.[1];
        return k ? `${k} (${dateOf(m.day).year})` : null;
      })
      .filter((x): x is string => !!x);
    famText.push(
      `${births.length === 1 ? "A child" : cap(counted(births.length, "child", "children"))} ${births.length === 1 ? "was" : "were"} born to ${p.him}${names.length ? `: ${list(names.slice(0, 8))}${names.length > 8 ? `, and ${names.length - 8} more` : ""}` : ""}.`,
    );
  }
  if (famText.length) paras.push(famText.join(" "));

  // Wars, quarrels and the law; with the sieges, the brawls and the home's fortunes summed up.
  const strife = themed("strife");
  const sieges = strife.filter((m) => /after a siege/.test(m.text));
  const fights = strife.filter((m) => !sieges.includes(m));
  const strifeText = yearSentences(fights, who, 4);
  if (sieges.length) {
    const towns = [
      ...new Set(
        sieges
          .map((m) => /^(?:Retook|Took) (.+?) after a siege/.exec(m.text)?.[1])
          .filter((x): x is string => !!x),
      ),
    ];
    strifeText.push(
      `${p.He} was at ${plural(sieges.length, "siege")}${towns.length ? `, among them ${list(towns.slice(0, 3))}` : ""}.`,
    );
  }
  const brawls = mine.filter((m) => storyKind(m) === "fight");
  if (brawls.length) {
    const won = brawls.filter(
      (m) => !/second best|neither/.test(m.text),
    ).length;
    strifeText.push(
      `The story remembers ${plural(brawls.length, "tavern brawl")}; ${p.he} had the better of ${won === brawls.length ? (won === 1 ? "it" : "them all") : nf(won)}.`,
    );
  }
  const home = mine.filter(
    (m) => storyKind(m) === "home" || storyKind(m) === "taken",
  );
  if (home.length) {
    const burned = home.filter((m) => /burned/.test(m.text)).length;
    const where = /^(.+?), (?:his|her|your) home/.exec(home[0].text)?.[1];
    strifeText.push(
      home.length === 1
        ? `In ${dateOf(home[0].day).year} ${lower1(clauseOf(home[0].text, who))}.`
        : `${where ? `${where}, ${p.his} home,` : `${p.His} home`} changed hands ${times(home.length)} in the wars${burned ? `, and was burned ${times(burned)}` : ""}.`,
    );
  }
  if (strifeText.length) paras.push(strifeText.join(" "));

  // Public life.
  const pub = themed("public");
  const pubText = yearSentences(pub, who, 4);
  const portraits = mine.filter((m) => /portrait/.test(m.text)).length;
  if (portraits)
    pubText.push(`${p.He} sat for ${p.his} portrait ${times(portraits)}.`);
  if (rec.office)
    pubText.push(`At the height of it ${p.he} was ${lower1(rec.office)}.`);
  if (rec.renown >= 50)
    pubText.push(
      rec.renown >= 100
        ? `${p.His} name was known across the colonies (renown ${rec.renown}).`
        : `${p.His} name was known in the colony (renown ${rec.renown}).`,
    );
  if (pubText.length) paras.push(pubText.join(" "));

  // The sea and the road.
  const sea = themed("sea");
  const seaText = yearSentences(sea, who, 4);
  if (rec.places > 2)
    seaText.push(`${p.He} saw ${plural(rec.places, "place")} in all.`);
  if (seaText.length) paras.push(seaText.join(" "));

  // Anything else (another system's moments).
  const other = themed("other");
  if (other.length) paras.push(yearSentences(other, who, 3).join(" "));

  // ---- the end of their part
  const next = i + 1 < all.length ? all[i + 1] : null;
  const nextChar = next ? s.chars[next.c] : undefined;
  const rel =
    nextChar && who?.children.includes(nextChar.id)
      ? nextChar.female
        ? "daughter"
        : "son"
      : null;
  let end = "";
  if (rec.ended === "died") {
    const died = mine.find((m) => m.kind === "died");
    const where = place(died?.p);
    const cause = who?.died?.cause ?? /died, (.+)$/.exec(died?.text ?? "")?.[1];
    const said = cause ? causePhrase(cause) : "";
    end = `${rec.name} died${rec.to ? ` in ${rec.to}` : ""}${where && !said.includes(` at ${where}`) ? ` at ${where}` : ""}${said ? `, ${said}` : ""}${rec.age ? "" : ""}.`;
  } else if (rec.ended === "europe") {
    const why = mine.find((m) => m.kind === "europe")?.text;
    end = why
      ? `In ${rec.to ?? ""} ${clauseOf(why, who)}.`
      : `In ${rec.to ?? ""} ${p.he} sailed for Europe.`;
  } else if (rec.ended === "living") {
    end = s.over
      ? `In ${dateOf(s.day).year} ${p.he} was living still, ${rec.age} years old${rec.title ? `, ${lower1(rec.title)}` : ""}${rec.home ? ` at ${rec.home}` : ""}.`
      : `As the story stands in ${dateOf(s.day).year}, ${p.he} is ${rec.age}${rec.title ? `, ${lower1(rec.title)}` : ""}${rec.home ? ` at ${rec.home}` : ""}.`;
  } else {
    end = `${cap(rec.fate)}.`;
  }
  if (next && rec.ended !== "living")
    end +=
      next.came === "heir"
        ? ` ${next.name}${rel ? `, ${p.his} ${rel},` : ""} carried the family on.`
        : next.came === "takeover"
          ? ` The story went on with someone else: ${next.name}.`
          : ` The story began again with ${next.name}.`;
  paras.push(end);

  return {
    n: i + 1,
    roman: ROMAN[i] ?? String(i + 1),
    c: rec.c,
    name: rec.name,
    years: `${rec.from}–${rec.to ?? ""}`,
    title: titleWords(rec),
    paras: paras.filter((x) => x.trim()),
    people: peopleOf(s, life, rec, next),
    numbers: chapterNumbers(rec, s),
    places: placesOf(life, rec.c),
    record: rec,
  };
}

/** "tenant farmer at Jamestown", "of Jamestown" (no trade), "governor of Virginia". */
function titleWords(rec: LineChar): string {
  const t =
    rec.title &&
    !/^(Of no fixed trade|Watching|Their story is told)$/.test(rec.title)
      ? lower1(rec.title)
      : "";
  if (!t) return rec.home ? `of ${rec.home}` : "";
  return rec.home && !/ (of|for|at) /.test(t) ? `${t} at ${rec.home}` : t;
}

/** "a tenant farmer", "an attorney", "of Jamestown". */
function withArticle(t: string): string {
  if (!t || /^(of|at|the|his|her)\b/.test(t) || /^a child/.test(t)) return t;
  return /^[aeiou]/i.test(t) ? `an ${t}` : `a ${t}`;
}

function placesOf(life: Life, c: number): number[] {
  const out: number[] = [];
  for (const t of life.trail)
    if (t.c === c && !out.includes(t.p)) out.push(t.p);
  return out;
}

const TIE_ROLE: Record<Tie, string> = {
  friend: "friend",
  rival: "rival",
  mentor: "mentor",
  nemesis: "sworn enemy",
  lover: "",
};

/** The people who mattered to a character: husband or wife, children, the heir, friends and enemies, a patron. */
function peopleOf(
  s: GameState,
  life: Life,
  rec: LineChar,
  next: LineChar | null,
): ChronPerson[] {
  const out: ChronPerson[] = [];
  const add = (c: number, role: string) => {
    const ch = s.chars[c];
    if (!ch || !role || out.some((x) => x.c === c)) return;
    out.push({ c, name: charName(ch), role });
  };
  const who = s.chars[rec.c];
  const stored = life.legacy?.recs.find((r) => r.c === rec.c);
  const spouse = stored ? stored.spouse : (who?.spouse ?? -1);
  if (spouse >= 0) add(spouse, s.chars[spouse]?.female ? "wife" : "husband");
  if (who) {
    for (const parent of [who.father, who.mother]) {
      const pc = s.chars[parent];
      if (pc && life.line.includes(parent))
        add(parent, pc.female ? "mother" : "father");
    }
    for (const k of who.children) {
      const kid = s.chars[k];
      if (!kid) continue;
      const heir = next?.c === k;
      add(k, `${kid.female ? "daughter" : "son"}${heir ? " and heir" : ""}`);
    }
  }
  const ties = stored
    ? stored.ties
    : rec.ended === "living"
      ? Object.entries(life.ties).map(([c, tie]) => ({ c: Number(c), tie }))
      : [];
  for (const t of ties) add(t.c, TIE_ROLE[t.tie]);
  const patron = stored ? stored.patron : life.c === rec.c ? life.patron : -1;
  if (patron >= 0) add(patron, "patron");
  // The family first, then the rest; no more than a dozen.
  return out.slice(0, 12);
}

function chapterNumbers(rec: LineChar, s: GameState): ChronNumber[] {
  const to = rec.to ?? dateOf(s.day).year;
  const nums: ChronNumber[] = [
    { label: "Years in the story", value: nf(Math.max(0, to - rec.from)) },
    {
      label: rec.ended === "living" ? "Age" : "Age at the end",
      value: nf(rec.age),
    },
  ];
  if (rec.children) nums.push({ label: "Children", value: nf(rec.children) });
  if (rec.battles)
    nums.push({
      label: "Battles",
      value: `${nf(rec.battles)} (${nf(rec.battlesWon)} won)`,
    });
  if (rec.duels) nums.push({ label: "Duels", value: nf(rec.duels) });
  if (rec.places) nums.push({ label: "Places seen", value: nf(rec.places) });
  if (rec.earned) nums.push({ label: "Coins earned", value: nf(rec.earned) });
  if (rec.renown)
    nums.push({ label: "Renown at its height", value: nf(rec.renown) });
  return nums;
}

/** The family's line: each generation, the husband or wife, the children, and who carried it on. */
function treeOf(s: GameState, life: Life, recs: LineChar[]): ChronTreeGen[] {
  return recs.map((rec, i) => {
    const who = s.chars[rec.c];
    const next = recs[i + 1];
    const spouses = new Set<string>();
    for (const m of life.milestones)
      if (m.c === rec.c && m.kind === "married") {
        const w = /^Married (.+)$/.exec(m.text)?.[1];
        if (w) spouses.add(w);
      }
    // One name for each (a wife's maiden name and her married one are the same woman).
    const firsts = new Set([...spouses].map((x) => x.split(" ")[0]));
    for (const sp of [
      who && who.spouse >= 0 && s.chars[who.spouse]
        ? charName(s.chars[who.spouse])
        : null,
      rec.spouse,
    ])
      if (sp && !firsts.has(sp.split(" ")[0])) {
        spouses.add(sp);
        firsts.add(sp.split(" ")[0]);
      }
    return {
      c: rec.c,
      name: rec.name,
      years: `${rec.born}–${rec.ended === "living" ? "" : (rec.to ?? "")}`,
      came: rec.came,
      spouses: [...spouses],
      children: (who?.children ?? [])
        .map((k) => s.chars[k])
        .filter((k): k is Character => !!k)
        .map((k) => ({
          c: k.id,
          name: k.first,
          born: dateOf(k.born).year,
          heir: next?.c === k.id,
          young: !k.alive && !!k.died && (k.died.day - k.born) / 365 < 16,
        })),
    };
  });
}

/** The chronicle of a line. */
export function chronicleOf(
  s: GameState,
  life: Life,
  map: Pick<MapDef, "provinces">,
  o: { secrets?: boolean } = {},
): Chronicle {
  const secrets = o.secrets ?? true;
  const recs = lineCharacters(s, life, map);
  const chapters = recs.map((r, i) =>
    chapter(s, life, map, r, i, recs, secrets),
  );
  const first = recs[0];
  const last = recs[recs.length - 1];
  const family = (first && s.chars[first.c]?.family) || life.name;
  const t = life.tally;
  const from = first?.from ?? dateOf(life.joined).year;
  const to = dateOf(s.day).year;
  const years = Math.round(t.days / 365);
  const kin = /^of the /.test(family) ? `a family ${family}` : `the ${family}s`;
  const heights: string[] = [];
  if (t.topOffice >= 3) heights.push("the governor's chair");
  else if (t.topOffice === 2) heights.push("a council seat");
  else if (t.topOffice === 1) heights.push("a seat in the assembly");
  if (t.risingsWon) heights.push("a rising that won");
  if (t.europe) heights.push("a passage home to Europe");
  const deeds: string[] = [];
  if (t.provinces > 2) deeds.push(`saw ${plural(t.provinces, "place")}`);
  if (t.children)
    deeds.push(`raised ${plural(t.children, "child", "children")}`);
  if (t.battles)
    deeds.push(
      `fought ${plural(t.battles, "battle")} and won ${nf(t.battlesWon)}`,
    );
  if (t.earned) deeds.push(`earned ${plural(t.earned, "coin")}`);
  const opening = first
    ? `${cap(kin)} began with ${first.name}${first.title || first.home ? `, ${withArticle(titleWords(first))}` : ""}, in ${first.from}. Over ${plural(years, "year")} and ${plural(Math.max(1, recs.length), "life", "lives")} they ${deeds.length ? list(deeds) : "lived quietly"}${heights.length ? `, and rose to ${list(heights)}` : ""}.`
    : "A story yet to be told.";
  const closing = life.watching
    ? `The line ended in ${dateOf(life.ended?.day ?? s.day).year}: ${life.ended?.why ?? "the story is told"}. Score ${lifeScore(s, life)}.`
    : s.over
      ? `In ${to}, the year the story stops, ${last ? `${last.name} was living still` : "the line lived on"}. Score ${lifeScore(s, life)}.`
      : `The story goes on, in ${to}. Score so far ${lifeScore(s, life)}.`;
  const numbers: ChronNumber[] = [
    { label: "Years", value: nf(years) },
    { label: "Lives", value: nf(recs.length) },
  ];
  if (t.provinces)
    numbers.push({ label: "Places seen", value: nf(t.provinces) });
  if (t.children) numbers.push({ label: "Children", value: nf(t.children) });
  if (t.marriages) numbers.push({ label: "Marriages", value: nf(t.marriages) });
  if (t.battles)
    numbers.push({
      label: "Battles",
      value: `${nf(t.battles)} (${nf(t.battlesWon)} won)`,
    });
  if (t.kinds?.duel) numbers.push({ label: "Duels", value: nf(t.kinds.duel) });
  numbers.push({ label: "Coins earned", value: nf(t.earned) });
  numbers.push({ label: "Richest", value: `${nf(t.peakPurse)} coins` });
  numbers.push({ label: "Renown at its height", value: nf(t.peakRenown) });
  if (t.promotions)
    numbers.push({ label: "Promotions", value: nf(t.promotions) });
  if (t.elections)
    numbers.push({ label: "Elections won", value: nf(t.elections) });
  numbers.push({ label: "Score", value: nf(lifeScore(s, life)) });
  return {
    title: `The ${family} ${recs.length > 1 ? "line" : "story"}, ${from} to ${to}`,
    family,
    opening,
    numbers,
    chapters,
    closing,
    tree: treeOf(s, life, recs),
  };
}
