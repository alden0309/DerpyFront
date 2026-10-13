// EDU (r13): sending the children to school, to a master, or to college.
// A dame school or a tutor for the little ones; the Latin grammar school,
// the Jesuits, a sewing school or the convent; an apprenticeship by
// indenture to a real master of a town in one of the game's own trades,
// some seven years, living in his house, and out at the end a journeyman;
// college at home or over the sea, gated by the child's Latin and paid for
// month by month, with classmates who go on through life; and among the
// native peoples the elders, the hunters, the makers, the healers and the
// mission schools. What they learn stays with them (an heir starts with
// it); letters come home; and computer families do the same, cheaply, so
// there are masters' apprentices and classmates in the world.

import { dateOf } from "./Calendar";
import { makeCharacter, remember } from "./Characters";
import {
  BIND_AGES,
  BOARD_KM,
  CALLING_BY_KEY,
  type CallingDef,
  CALLINGS,
  CAMBRIDGE_TEST,
  COLLEGE_AGES,
  COLLEGE_BY_KEY,
  COLLEGE_RANKS,
  COLLEGE_SURETY,
  COLLEGE_YEARS,
  type CollegeDef,
  COLLEGES,
  type Course,
  COURSE_ORDER,
  COURSES,
  DEGREE_RENOWN,
  type Gains,
  MASTER_CAP,
  MASTER_TOWNS,
  MISSION_KM,
  PATH_BY_KEY,
  type PathDef,
  PATHS,
  SCHOOL_BY_KEY,
  type SchoolDef,
  SCHOOLS,
  type Sex,
} from "./EduData";
import { householdsOf, postsIn } from "./Folk"; // TOWNS (r17): postsIn
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { npcWrite } from "./Letters";
import {
  addRenown,
  beginOutcome,
  endOutcome,
  journal,
  meet,
  milestone,
  outcomeMeta,
  remembers,
  setTie,
  spend,
  touchLife,
} from "./LifeCore";
import {
  type Check,
  hasPlace,
  isChildLife,
  isNativeChar,
  isPlayed,
  meOf,
  no,
  npcSkill,
  placesIn,
  startRank,
  yes,
} from "./LifeQueries";
import {
  EUROPE_PASSAGE,
  JOBS,
  LOCALS_CAP,
  roleJobs,
  ROLES,
  SKILL_MAX,
  SKILL_NAMES,
} from "./LifeRules";
import { kmBetween, type World } from "./Map";
import { ageOf, charName, hasTrait, settlers, yearOf } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { motherTongue } from "./Tongues";
import type {
  Character,
  EduCommand,
  EduDone,
  EduKind,
  EduNow,
  GameState,
  Life,
  LifeCommand,
  MapDef,
  Schooling,
  Skill,
  TongueLevel,
} from "./Types";
import { SKILLS } from "./Types";
import { employersIn, startJob } from "./Work";
import { worldRng } from "./WorldRng";

const MONTH_DAYS = DAYS_PER_YEAR / 12;
/** The month the school year and the indentures begin: September. */
export const TERM_MONTH = 8;
/** Apprentices freed early to head a family, and students given their degree. */
const HEIR_SERVED = 0.7;
const HEIR_DEGREE = 0.75;

// ---------------------------------------------------------------- reading a child

/** What a child is at now, if anything. */
export function nowOf(c: Character | undefined): EduNow | null {
  return c?.edu?.now ?? null;
}

/** Away from home: boarding with a master, at college, at a convent or a mission. */
export function awayAtSchool(c: Character | undefined): boolean {
  return !!c?.edu?.now?.away;
}

function eduMut(g: ConquestGame, c: Character): Schooling {
  const ch = g.touchChar(c);
  ch.edu ??= { now: null, past: [], pts: {} };
  return ch.edu;
}

/** A child's skill: their nature at their age, what you taught them, what they learned at school. */
export function childSkill(s: GameState, c: Character, sk: Skill): number {
  return Math.min(
    SKILL_MAX,
    npcSkill(s, c, sk) +
      (c.taught?.[sk] ?? 0) +
      Math.floor(c.edu?.pts?.[sk] ?? 0),
  );
}

/** Their Latin and letters, as a college would test it. */
export function lettersOf(s: GameState, c: Character): number {
  return childSkill(s, c, "letters");
}

/** How far through it they are, 0 to 1. */
export function progressOf(s: GameState, now: EduNow): number {
  const len = Math.max(1, now.until - now.since);
  return Math.max(0, Math.min(1, (s.day - now.since) / len));
}

/** What the whole course teaches. */
export function gainsOf(now: EduNow): Gains {
  switch (now.kind) {
    case "school": {
      const def = SCHOOL_BY_KEY.get(now.key);
      if (!def) return {};
      // A tutor kept for fewer years teaches less in all.
      return def.key === "tutor"
        ? scaled(
            def.skills,
            Math.min(1, (now.until - now.since) / DAYS_PER_YEAR / def.years),
          )
        : def.skills;
    }
    case "apprentice":
      return CALLING_BY_KEY.get(now.key)?.skills ?? {};
    case "college": {
      const g = COURSES[(now.course as Course) ?? "arts"]?.skills ?? {};
      // A gentleman-commoner is let off half his exercises; a servitor works for it.
      const m = now.rank === 2 ? 0.85 : now.rank === 0 ? 1.1 : 1;
      return Object.fromEntries(
        Object.entries(g).map(([k, v]) => [k, (v ?? 0) * m]),
      );
    }
    case "path":
      return PATH_BY_KEY.get(now.key)?.skills ?? {};
  }
}

function scaled(g: Gains, f: number): Gains {
  if (f === 1) return g;
  return Object.fromEntries(
    Object.entries(g).map(([k, v]) => [
      k,
      Math.round((v ?? 0) * f * 100) / 100,
    ]),
  );
}

/** What it's called: "the Latin grammar school", "a cooper", "Harvard College". */
export function eduName(now: EduNow | EduDone): string {
  switch (now.kind) {
    case "school":
      return SCHOOL_BY_KEY.get(now.key)?.name ?? "school";
    case "apprentice":
      return CALLING_BY_KEY.get(now.key)?.name ?? "a trade";
    case "college":
      return COLLEGE_BY_KEY.get(now.key)?.name ?? "college";
    case "path":
      return PATH_BY_KEY.get(now.key)?.name ?? "the people's ways";
  }
}

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const he = (c: Character) => (c.female ? "she" : "he");
const his = (c: Character) => (c.female ? "her" : "his");
const him = (c: Character) => (c.female ? "her" : "him");
const sonOf = (c: Character) => (c.female ? "daughter" : "son");

function provName(map: MapDef, p: number): string {
  return map.provinces[p]?.name ?? "somewhere";
}

const PROV_BY_NAME = new Map<string, number>();
/** A province by its name on the map (-1 if it isn't there). */
export function provByName(map: MapDef, name: string | null): number {
  if (!name) return -1;
  if (!PROV_BY_NAME.size)
    map.provinces.forEach((p, i) => PROV_BY_NAME.set(p.name, i));
  return PROV_BY_NAME.get(name) ?? -1;
}

/** "at Harvard College, Cambridge", "with Josiah Pell, cooper, at Jamestown". */
export function eduWhere(s: GameState, map: MapDef, now: EduNow): string {
  const by = s.chars[now.by];
  switch (now.kind) {
    case "school": {
      const def = SCHOOL_BY_KEY.get(now.key);
      if (def?.where === "home") return "at home";
      const place = def?.places?.find(
        (x) => provByName(map, x.prov) === now.at,
      );
      return place ? place.name : `at ${provName(map, now.at)}`;
    }
    case "apprentice":
      return by
        ? `with ${charName(by)} at ${provName(map, now.at)}`
        : `at ${provName(map, now.at)}`;
    case "college": {
      const c = COLLEGE_BY_KEY.get(now.key);
      return c ? `at ${c.town}` : "at college";
    }
    case "path":
      return by ? `with ${charName(by)}` : "in the village";
  }
}

/** A word for what they're at, for a chip: "At Harvard", "Apprentice cooper". */
export function eduChipText(c: Character): string | null {
  const now = nowOf(c);
  if (now)
    switch (now.kind) {
      case "school":
        return SCHOOL_BY_KEY.get(now.key)?.key === "tutor"
          ? "With a tutor"
          : `At ${lower(SCHOOL_BY_KEY.get(now.key)?.name ?? "school").replace(/^a |^the /, "")}`;
      case "apprentice":
        return `Apprentice ${lower(CALLING_BY_KEY.get(now.key)?.name ?? "")}`.trim();
      case "college":
        return `At ${COLLEGE_BY_KEY.get(now.key)?.short ?? "college"}`;
      case "path":
        return lower(PATH_BY_KEY.get(now.key)?.name ?? "Learning");
    }
  const e = c.edu;
  if (e?.degree)
    return `${COLLEGE_BY_KEY.get(e.degree)?.short ?? "College"} graduate`;
  const served = e?.past.filter((x) => x.kind === "apprentice" && x.done);
  if (served?.length)
    return `Journeyman ${lower(CALLING_BY_KEY.get(served[served.length - 1].key)?.name ?? "")}`.trim();
  return null;
}

// ---------------------------------------------------------------- whose children

/** The children a life looks after: their own, and brothers and sisters it pays for. */
export function familyPupils(s: GameState, life: Life): Character[] {
  const me = meOf(s, life);
  if (!me) return [];
  const ids = new Set<number>(me.children);
  for (const pid of [me.father, me.mother])
    for (const k of s.chars[pid]?.children ?? [])
      if (k !== me.id && s.chars[k]?.edu?.now?.seat === life.seat) ids.add(k);
  return [...ids]
    .map((id) => s.chars[id])
    .filter((c): c is Character => !!c?.alive && !c.abroad);
}

/** Children whose future you may decide: your own, and orphaned brothers and sisters. */
export function inYourCare(s: GameState, life: Life, c: Character): boolean {
  const me = meOf(s, life);
  if (!me || c.id === me.id) return false;
  if (me.children.includes(c.id)) return true;
  if (c.edu?.now?.seat === life.seat) return true;
  const sib = c.father === me.father || c.mother === me.mother;
  const orphan = ![c.father, c.mother].some((id) => s.chars[id]?.alive);
  return sib && orphan && ageOf(s, c) < 18;
}

/** The children to show on the schooling page: young enough, or schooled. */
export function schoolable(s: GameState, life: Life): Character[] {
  const me = meOf(s, life);
  if (!me) return [];
  const ids = new Set<number>(me.children);
  for (const pid of [me.father, me.mother])
    for (const k of s.chars[pid]?.children ?? [])
      if (k !== me.id && inYourCare(s, life, s.chars[k])) ids.add(k);
  return [...ids]
    .map((id) => s.chars[id])
    .filter(
      (c): c is Character =>
        !!c?.alive &&
        !c.abroad &&
        !isPlayed(s, c.id) &&
        (ageOf(s, c) <= 21 || !!c.edu?.now),
    )
    .sort((a, b) => a.born - b.born);
}

// ---------------------------------------------------------------- offers

export interface EduNeed {
  label: string;
  met: boolean;
}

/** Something a child could be sent to, with what it takes and whether it can be done now. */
export interface EduOffer {
  kind: EduKind;
  key: string;
  name: string;
  /** Where, said that way: "at Jamestown", "the Ursulines at Quebec". */
  where: string;
  text: string;
  at: number;
  by: number;
  /** Coins a month, and once (a premium, a passage). */
  fee: number;
  once: number;
  years: number;
  away: boolean;
  skills: Gains;
  needs: EduNeed[];
  check: Check;
  rank?: number;
  course?: Course;
}

/** Who's asking: a player (with a purse) or a computer family. */
interface Asker {
  s: GameState;
  w: World;
  /** Where the family lives. */
  home: number;
  /** Coins in hand (Infinity for a computer family: they pay their own way). */
  purse: number;
  life: Life | null;
}

function askerOf(s: GameState, w: World, life: Life, kid: Character): Asker {
  return { s, w, home: kid.home ?? life.home, purse: life.purse, life };
}

const need = (label: string, met: boolean): EduNeed => ({ label, met });

function sexNeed(sex: Sex, kid: Character): EduNeed | null {
  if (sex === "both") return null;
  return sex === "boys"
    ? need("Boys only", !kid.female)
    : need("Girls only", kid.female);
}

function ageNeed(s: GameState, kid: Character, ages: [number, number]) {
  const a = ageOf(s, kid);
  return need(
    `Aged ${ages[0]} to ${ages[1]} (${a})`,
    a >= ages[0] && a <= ages[1],
  );
}

function coinsNeed(a: Asker, n: number, what: string): EduNeed | null {
  if (n <= 0 || !a.life) return null;
  return need(
    `${Math.round(n * 10) / 10} coins in hand ${what} (you have ${Math.floor(a.purse)})`,
    a.purse >= n,
  );
}

function settle(needs: (EduNeed | null)[]): {
  needs: EduNeed[];
  check: Check;
} {
  const list = needs.filter((x): x is EduNeed => !!x);
  const miss = list.find((n) => !n.met);
  return { needs: list, check: miss ? no(miss.label) : yes };
}

/** The culture of the people who keep a town (its holder's). */
function townCulture(s: GameState, p: number): string | null {
  const pr = s.provinces[p];
  const o = pr ? s.nations[pr.occupier >= 0 ? pr.occupier : pr.owner] : null;
  return o && o.kind === "power" ? o.culture : null;
}

function nationKeyOf(s: GameState, c: Character): string {
  return s.nations[c.nation]?.key ?? "";
}

/** Whether a town keeps one of these schools now. */
function townKeeps(s: GameState, w: World, def: SchoolDef, p: number): boolean {
  const pr = s.provinces[p];
  if (!pr) return false;
  const culture = townCulture(s, p);
  if (!culture) return false;
  if (def.since) {
    const y = def.since[culture];
    if (y === undefined || yearOf(s) < y) return false;
  }
  const owner = s.nations[pr.owner];
  const folk = settlers(pr);
  if (
    folk < (def.folk ?? 0) &&
    owner?.capital !== p &&
    s.towns?.kept[p]?.school === undefined // TOWNS (r17): a schoolhouse voted by the town
  )
    return false;
  if (def.key !== "dame" && !placesIn(s, w, p).includes("church")) return false;
  return folk >= 50;
}

/** A school's nearest place for a child: home if it has one, else the nearest that does. */
function schoolPlace(
  a: Asker,
  def: SchoolDef,
  kid: Character,
): { at: number; name: string } | null {
  const { s, w } = a;
  const map = w.map;
  const year = yearOf(s);
  if (def.where === "home") return { at: a.home, name: "at home" };
  if (def.where === "town") {
    const culture = townCulture(s, a.home) ?? kid.culture;
    const nm = def.names?.[culture] ?? def.name;
    if (townKeeps(s, w, def, a.home))
      return { at: a.home, name: `${lower(nm)} at ${provName(map, a.home)}` };
    if (def.local) return null;
    let best = -1;
    let bestKm = BOARD_KM;
    s.provinces.forEach((pr, p) => {
      if (pr.owner !== kid.nation || p === a.home) return;
      if (!townKeeps(s, w, def, p)) return;
      const km = kmBetween(map, a.home, p);
      if (km < bestKm) {
        best = p;
        bestKm = km;
      }
    });
    return best >= 0
      ? {
          at: best,
          name: `${lower(def.names?.[townCulture(s, best) ?? ""] ?? nm)} at ${provName(map, best)}`,
        }
      : null;
  }
  // Fixed places: open this year, held by their crown; missions near enough.
  let best: { at: number; name: string } | null = null;
  let bestKm = Infinity;
  for (const pl of def.places ?? []) {
    if (year < pl.from || year > pl.to) continue;
    const p = provByName(map, pl.prov);
    if (p < 0) continue;
    const pr = s.provinces[p];
    const holder = s.nations[pr.occupier >= 0 ? pr.occupier : pr.owner];
    if (holder?.key !== pl.power) continue;
    const km = kmBetween(map, a.home, p);
    if (def.native) {
      if (km > MISSION_KM) continue;
    } else if (pl.power !== nationKeyOf(s, kid)) continue;
    if (km < bestKm) {
      best = { at: p, name: pl.name };
      bestKm = km;
    }
  }
  return best;
}

/** Every school a child could be sent to (those that don't apply to them are left out). */
export function schoolOffers(
  s: GameState,
  w: World,
  life: Life,
  kid: Character,
): EduOffer[] {
  return schoolOffersFor(askerOf(s, w, life, kid), kid);
}

function schoolOffersFor(a: Asker, kid: Character): EduOffer[] {
  const { s } = a;
  const native = isNativeChar(s, kid);
  const out: EduOffer[] = [];
  for (const def of SCHOOLS) {
    if (def.native !== native) continue;
    if (def.faiths && !def.faiths.includes(kid.religion)) continue;
    if (def.sex !== "both" && (def.sex === "girls") !== kid.female) continue;
    const place = schoolPlace(a, def, kid);
    const away = !!place && (!!def.boards || place.at !== a.home);
    const fee = def.fee + (away ? def.board : 0);
    // A tutor stays until they're sixteen or so, not the whole five years.
    const years =
      def.key === "tutor"
        ? Math.max(1, Math.min(def.years, 17 - ageOf(s, kid)))
        : def.years;
    const { needs, check } = settle([
      need(place ? cap(place.name) : noPlace(def), !!place),
      ageNeed(s, kid, def.ages),
      sexNeed(def.sex, kid),
      coinsNeed(a, fee, "for the first month"),
    ]);
    out.push({
      kind: "school",
      key: def.key,
      name: def.names?.[kid.culture] ?? def.name,
      where: place?.name ?? "",
      text: def.text,
      at: place?.at ?? -1,
      by: -1,
      fee: a.life ? fee : 0,
      once: 0,
      years,
      away,
      skills: scaled(def.skills, years / def.years),
      needs,
      check,
    });
  }
  return out;
}

function noPlace(def: SchoolDef): string {
  switch (def.key) {
    case "dame":
      return "No dame school here: only in a colonial town";
    case "grammar":
      return "No Latin school within reach (a town of 2,000 with a church, or the capital)";
    case "needle":
      return "No sewing school within reach (a town of 800)";
    case "jesuit":
      return "No Jesuit college open in your colony";
    case "convent":
      return "No convent school open in your colony";
    case "mission":
      return "No mission school near your people just now";
    default:
      return "None within reach";
  }
}

// ---------------------------------------------------------------- masters

/** How a master is likely to use an apprentice: −2 hard to +2 good. */
export function masterTemper(m: Character): number {
  let t = 0;
  if (hasTrait(m, "cruel")) t -= 2;
  if (hasTrait(m, "drunkard")) t -= 1;
  if (hasTrait(m, "greedy")) t -= 1;
  if (hasTrait(m, "lazy")) t -= 1;
  if (hasTrait(m, "just")) t += 1;
  if (hasTrait(m, "generous")) t += 1;
  if (hasTrait(m, "honest")) t += 0.5;
  if (hasTrait(m, "diligent")) t += 0.5;
  if (hasTrait(m, "content")) t += 0.5;
  return Math.max(-2, Math.min(2, Math.round(t)));
}

/** What the town says of a master. */
export function masterName(t: number, female = false): string {
  const his = female ? "her" : "his";
  return t <= -2
    ? "known as a hard master"
    : t < 0
      ? `said to be sharp with ${his} people`
      : t >= 2
        ? `known as a kind ${female ? "mistress" : "master"}`
        : t > 0
          ? `a fair ${female ? "mistress" : "master"}, they say`
          : "nobody says much either way";
}

/** Apprentices each master has now (one pass over everyone). */
export function apprenticeCounts(s: GameState): Map<number, number> {
  const out = new Map<number, number>();
  for (const c of Object.values(s.chars)) {
    const n = c.edu?.now;
    if (c.alive && n?.kind === "apprentice" && n.by >= 0)
      out.set(n.by, (out.get(n.by) ?? 0) + 1);
  }
  return out;
}

/** The masters (or mistresses) of a trade in a town who could take a child. */
export function mastersIn(
  s: GameState,
  w: World,
  p: number,
  calling: CallingDef,
  kid: Character,
): Character[] {
  const out: Character[] = [];
  const seen = new Set<number>();
  const ok = (c: Character | undefined): c is Character =>
    !!c?.alive &&
    !c.abroad &&
    c.id !== kid.father &&
    c.id !== kid.mother &&
    c.id !== kid.id &&
    !isPlayed(s, c.id) &&
    !seen.has(c.id) &&
    !c.edu?.now;
  for (const id of s.locals[p] ?? []) {
    const c = s.chars[id];
    if (!c?.role || !calling.roles.includes(c.role)) continue;
    if (!c.alive || c.abroad) continue;
    if (calling.mistress) {
      for (const x of [c, s.chars[c.spouse]])
        if (
          ok(x) &&
          x.female &&
          ageOf(s, x) >= 22 &&
          ageOf(s, x) <= 66 &&
          !isNativeChar(s, x)
        ) {
          seen.add(x.id);
          out.push(x);
        }
      continue;
    }
    if (calling.job && !roleJobs(c.role).includes(calling.job)) continue;
    if (!hasPlace(s, w, p, ROLES[c.role].place)) continue;
    if (!ok(c) || ageOf(s, c) > 72) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

/** The towns a family would look in for a master: home first, then those known, nearest first. */
export function masterTowns(
  s: GameState,
  w: World,
  home: number,
  kid: Character,
): number[] {
  const known = Object.keys(s.locals)
    .map(Number)
    .filter((p) => p !== home && s.provinces[p]?.owner === kid.nation)
    .map((p) => ({ p, km: kmBetween(w.map, home, p) }))
    .filter((x) => x.km <= BOARD_KM * 1.5)
    .sort((a, b) => a.km - b.km || a.p - b.p)
    .map((x) => x.p);
  return [home, ...known].slice(0, MASTER_TOWNS);
}

/** Every master a child could be bound to in a trade, town by town. */
export function callingOffers(
  s: GameState,
  w: World,
  life: Life,
  kid: Character,
  key: string,
): EduOffer[] {
  return callingOffersFor(askerOf(s, w, life, kid), kid, key);
}

function callingOffersFor(
  a: Asker,
  kid: Character,
  key: string,
  counts = apprenticeCounts(a.s),
  towns?: number[],
): EduOffer[] {
  const { s, w } = a;
  const calling = CALLING_BY_KEY.get(key);
  if (!calling) return [];
  const out: EduOffer[] = [];
  for (const p of towns ?? masterTowns(s, w, a.home, kid)) {
    for (const m of mastersIn(s, w, p, calling, kid)) {
      const have = counts.get(m.id) ?? 0;
      const t = masterTemper(m);
      const { needs, check } = settle([
        ageNeed(s, kid, BIND_AGES),
        sexNeed(calling.sex, kid),
        calling.coastal
          ? need("A port town", !!w.map.provinces[p]?.coastal)
          : null,
        calling.letters
          ? need(
              `Can read and write: letters ${calling.letters} (${lettersOf(s, kid)})`,
              lettersOf(s, kid) >= calling.letters,
            )
          : null,
        need(
          have >= MASTER_CAP
            ? `${charName(m)} has ${have} apprentices already`
            : `Room in ${his(m)} house (${have} of ${MASTER_CAP})`,
          have < MASTER_CAP,
        ),
        isNativeChar(s, kid)
          ? need("Colonists' trades: your people learn from the elders", false)
          : null,
        coinsNeed(a, calling.premium, "for the premium"),
      ]);
      out.push({
        kind: "apprentice",
        key,
        name: calling.name,
        where: `with ${charName(m)} at ${provName(w.map, p)}`,
        text: `${ageOf(s, m)} years old: ${masterName(t, m.female)}.`,
        at: p,
        by: m.id,
        fee: 0,
        once: a.life ? calling.premium : 0,
        years: calling.years,
        away: true,
        skills: calling.skills,
        needs,
        check,
      });
    }
  }
  return out;
}

/** The trades open to a child (by sex), each with how many masters will see them. */
export function callingsFor(kid: Character): CallingDef[] {
  return CALLINGS.filter(
    (c) => c.sex === "both" || (c.sex === "girls") === kid.female,
  );
}

// ---------------------------------------------------------------- college

/** Whether a college takes a child of this people and faith (before anything else). */
export function collegeFits(
  s: GameState,
  c: CollegeDef,
  kid: Character,
): boolean {
  const native = isNativeChar(s, kid);
  if (c.nativeOnly && !native) return false;
  if (native) return !!c.natives;
  return c.powers.includes(nationKeyOf(s, kid));
}

export function collegeOffers(
  s: GameState,
  w: World,
  life: Life,
  kid: Character,
  rank = 1,
  course: Course = "arts",
): EduOffer[] {
  return collegeOffersFor(askerOf(s, w, life, kid), kid, rank, course);
}

/** The courses a college teaches this year. */
export function coursesAt(c: CollegeDef, year: number): Course[] {
  return COURSE_ORDER.filter(
    (k) =>
      c.courses.includes(k) && (k !== "physic" || year >= (c.physicFrom ?? 0)),
  );
}

function collegeOffersFor(
  a: Asker,
  kid: Character,
  rank: number,
  course: Course,
): EduOffer[] {
  const { s, w } = a;
  const year = yearOf(s);
  const native = isNativeChar(s, kid);
  const out: EduOffer[] = [];
  for (const c of COLLEGES) {
    if (!collegeFits(s, c, kid)) continue;
    // A test of religion that shuts them out altogether: not worth listing.
    if (c.faiths && !c.faiths.includes(kid.religion)) continue;
    if (c.to !== undefined && year > c.to) continue;
    // Not founded for a generation yet: not worth listing.
    if (year < c.from - 30) continue;
    const p = provByName(w.map, c.prov);
    const pr = p >= 0 ? s.provinces[p] : undefined;
    const holder = pr
      ? s.nations[pr.occupier >= 0 ? pr.occupier : pr.owner]
      : undefined;
    const held =
      p < 0 ||
      (!!holder &&
        c.powers.concat(native ? ["england"] : []).includes(holder.key));
    const free = native && !!c.natives;
    const r = Math.max(0, Math.min(2, Math.round(rank)));
    const fee = free ? 0 : Math.round(c.fee * COLLEGE_RANKS[r].mult * 10) / 10;
    const once = p < 0 ? EUROPE_PASSAGE : 0;
    const courses = coursesAt(c, year);
    const pick = courses.includes(course) ? course : courses[0];
    const faithOk =
      !c.faiths ||
      (c.faiths.includes(kid.religion) &&
        !(
          c.key === "cambridge" &&
          kid.religion === "puritan" &&
          year >= CAMBRIDGE_TEST
        ));
    const letters = lettersOf(s, kid);
    const { needs, check } = settle([
      need(
        year < c.from
          ? `Not founded until ${c.from}`
          : c.from < 1500
            ? "Open these four hundred years"
            : `Open (since ${c.from})`,
        year >= c.from,
      ),
      held ? null : need(`${c.town} is in other hands`, false),
      need(
        kid.female
          ? "No college admitted women in these years"
          : "A son (colleges took only men)",
        !kid.female,
      ),
      faithOk
        ? null
        : need(
            c.key === "cambridge" && kid.religion === "puritan"
              ? "No dissenter may take a Cambridge degree after 1662"
              : `A test of religion: ${c.faiths!.join(" or ")}`,
            false,
          ),
      ageNeed(s, kid, COLLEGE_AGES),
      need(
        `Latin and letters ${c.letters} to be admitted (${letters})${letters >= c.letters ? "" : ": a grammar school or a tutor"}`,
        letters >= c.letters,
      ),
      a.life
        ? coinsNeed(
            a,
            fee * COLLEGE_SURETY + once,
            p < 0
              ? `(the passage and ${COLLEGE_SURETY} months' bills)`
              : `(${COLLEGE_SURETY} months' bills)`,
          )
        : null,
    ]);
    out.push({
      kind: "college",
      key: c.key,
      name: c.name,
      where: `at ${c.town}`,
      text: c.text,
      at: p,
      by: -1,
      fee: a.life ? fee : 0,
      once: a.life ? once : 0,
      years: COLLEGE_YEARS,
      away: true,
      skills: COURSES[pick]?.skills ?? {},
      needs,
      check,
      rank: r,
      course: pick,
    });
  }
  return out;
}

// ---------------------------------------------------------------- the peoples' own ways

/** Who in the village would teach a child a path. */
export function teacherFor(
  s: GameState,
  p: number,
  def: PathDef,
  kid: Character,
): Character | undefined {
  return (s.locals[p] ?? [])
    .map((id) => s.chars[id])
    .filter(
      (c): c is Character =>
        !!c?.alive &&
        !c.abroad &&
        !!c.role &&
        def.roles.includes(c.role) &&
        c.id !== kid.id &&
        !isPlayed(s, c.id),
    )
    .sort(
      (a, b) =>
        Number(a.id === kid.father || a.id === kid.mother) -
          Number(b.id === kid.father || b.id === kid.mother) || a.id - b.id,
    )[0];
}

export function pathOffers(
  s: GameState,
  w: World,
  life: Life,
  kid: Character,
): EduOffer[] {
  return pathOffersFor(askerOf(s, w, life, kid), kid);
}

function pathOffersFor(a: Asker, kid: Character): EduOffer[] {
  const { s } = a;
  if (!isNativeChar(s, kid)) return [];
  return PATHS.map((def) => {
    const t = teacherFor(s, a.home, def, kid);
    const { needs, check } = settle([
      ageNeed(s, kid, def.ages),
      sexNeed(def.sex, kid),
      need(
        t
          ? `${charName(t)} will teach ${him(kid)}`
          : `Nobody in the village to teach it (${def.roles.map((r) => lower(ROLES[r].title)).join(" or ")})`,
        !!t,
      ),
    ]);
    return {
      kind: "path" as const,
      key: def.key,
      name: def.name,
      where: t ? `with ${charName(t)}` : "",
      text: def.text,
      at: a.home,
      by: t?.id ?? -1,
      fee: 0,
      once: 0,
      years: def.years,
      away: false,
      skills: def.skills,
      needs,
      check,
    };
  });
}

// ---------------------------------------------------------------- may you?

/** Whether you can decide this child's schooling now, and if not, why. */
export function kinCheck(
  s: GameState,
  life: Life,
  kid: Character | undefined,
): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (!kid?.alive || kid.abroad)
    return no("They're not among the living here.");
  if (!inYourCare(s, life, kid))
    return no("Only your own children, or orphaned brothers and sisters.");
  if (isPlayed(s, kid.id)) return no("Another player lives that life.");
  if (kid.spouse >= 0) return no("Married: their own master now.");
  return yes;
}

/** The offer a command names, checked. */
export function eduOffer(
  s: GameState,
  w: World,
  life: Life,
  c: Omit<EduCommand, "k">,
): { check: Check; offer: EduOffer | null } {
  const kid = s.chars[c.c];
  const kin = kinCheck(s, life, kid);
  if (!kin.ok) return { check: kin, offer: null };
  if (c.act === "home")
    return nowOf(kid)
      ? { check: yes, offer: null }
      : { check: no("They're not away at anything."), offer: null };
  if (nowOf(kid))
    return {
      check: no(
        `${kid.first} is at ${lower(eduName(nowOf(kid)!))} already: bring ${him(kid)} home first.`,
      ),
      offer: null,
    };
  let list: EduOffer[];
  switch (c.act) {
    case "school":
      list = schoolOffers(s, w, life, kid).filter((o) => o.key === c.key);
      break;
    case "bind":
      list = callingOffers(s, w, life, kid, c.key ?? "").filter(
        (o) => o.by === c.by,
      );
      break;
    case "college":
      list = collegeOffers(
        s,
        w,
        life,
        kid,
        c.rank ?? 1,
        (c.course as Course) ?? "arts",
      ).filter((o) => o.key === c.key);
      if (list[0] && c.course && list[0].course !== c.course)
        return {
          check: no(
            `${COURSES[c.course as Course]?.name ?? "That course"} isn't taught there.`,
          ),
          offer: null,
        };
      break;
    case "path":
      list = pathOffers(s, w, life, kid).filter((o) => o.key === c.key);
      break;
    default:
      return { check: no("Unknown."), offer: null };
  }
  const offer = list[0] ?? null;
  if (!offer)
    return {
      check: no(
        c.act === "bind" ? "That master can't take them." : "Not for them.",
      ),
      offer: null,
    };
  return { check: offer.check, offer };
}

// ---------------------------------------------------------------- beginning

/** A child starts at something: the record, the bill, the scene. */
function begin(
  g: ConquestGame,
  life: Life | null,
  kid: Character,
  o: EduOffer,
): void {
  const s = g.s;
  const e = eduMut(g, kid);
  const by = s.chars[o.by];
  const mood =
    o.kind === "apprentice" && by
      ? masterTemper(by)
      : o.kind === "path"
        ? 1
        : 0;
  e.now = {
    kind: o.kind,
    key: o.key,
    at: o.at,
    by: o.by,
    since: s.day,
    until: s.day + Math.round(o.years * DAYS_PER_YEAR),
    away: o.away,
    fee: o.fee,
    mood,
    got: 0,
    ...(life ? { seat: life.seat } : {}),
    ...(o.rank !== undefined ? { rank: o.rank } : {}),
    ...(o.course ? { course: o.course } : {}),
  };
  if (!life) return;
  if (o.once > 0) spend(g, life, o.once);
  const map = g.map;
  switch (o.kind) {
    case "school":
      remembers(g, life, kid, "Sent me to school", 4, 6);
      journal(
        g,
        life,
        SCHOOL_BY_KEY.get(o.key)?.key === "tutor"
          ? `A tutor comes to live with you to teach ${kid.first}: ${o.fee} coins a month.`
          : `${kid.first} starts at ${lower(o.where)}${o.away ? ", boarding" : ""}: ${o.fee} coins a month.`,
        "good",
      );
      outcomeMeta(g, life, { c: kid.id, scene: "church" });
      break;
    case "apprentice": {
      const def = CALLING_BY_KEY.get(o.key)!;
      if (by) {
        remembers(g, life, g.char(by.id), "Took my child apprentice", 6, 8);
        outcomeMeta(g, life, {
          c: by.id,
          scene: by.role ? ROLES[by.role].place : "workshop",
        });
      }
      remembers(g, life, kid, "Bound me apprentice", mood < 0 ? -4 : 2, 8);
      journal(
        g,
        life,
        `The indenture is signed and sealed: ${kid.first} is bound apprentice to ${charName(by)} at ${provName(map, o.at)}, to learn ${def.art}, for ${def.years} years${o.once ? `, with a premium of ${o.once} coins` : ""}. ${cap(he(kid))} goes to live in ${his(by ?? kid)} house.`,
        "good",
      );
      schoolStory(
        g,
        life,
        kid,
        "bound apprentice",
        `to ${charName(by)} at ${provName(map, o.at)}, to learn ${def.art}`,
        o.at,
      ); // STORY (r17)
      break;
    }
    case "college": {
      const c = COLLEGE_BY_KEY.get(o.key)!;
      const mates = pickMates(g, kid, c, e.now);
      e.mates = [...new Set([...(e.mates ?? []), ...mates])];
      remembers(g, life, kid, "Sent me to college", 10, 10);
      journal(
        g,
        life,
        `${kid.first} is admitted to ${c.name} by ${c.head}, entered ${lower(COLLEGE_RANKS[o.rank ?? 1].name)} to read ${lower(COURSES[o.course ?? "arts"].name)}${c.prov ? "" : `. The passage costs ${o.once} coins`}: ${o.fee} coins a month for chamber, commons and tuition.`,
        "good",
      );
      schoolStory(
        g,
        life,
        kid,
        "entered",
        `${c.name}, to read ${lower(COURSES[o.course ?? "arts"].name)}`,
        o.at,
      ); // STORY (r17)
      outcomeMeta(g, life, { c: kid.id, scene: "letter" });
      break;
    }
    case "path": {
      if (by) outcomeMeta(g, life, { c: by.id, scene: "village" });
      remembers(g, life, kid, "Found me a teacher", 4, 6);
      journal(
        g,
        life,
        `${by ? charName(by) : "The elders"} will teach ${kid.first} ${lower(PATH_BY_KEY.get(o.key)?.name ?? "the people's ways").replace(/^learning from /, "as ")}.`,
        "good",
      );
      break;
    }
  }
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * STORY (r17): a step in a child's schooling (or your own) in the story:
 * "Thomas entered Harvard College, to read divinity".
 */
function schoolStory(
  g: ConquestGame,
  life: Life,
  kid: Character,
  did: string,
  rest: string,
  p: number,
  big = false,
): void {
  if (life.c < 0) return;
  const self = kid.id === life.c;
  const text = `${self ? cap(did) : `${kid.first} ${did}`} ${rest}`;
  milestone(g, life, "school", text, p >= 0 ? p : life.prov, {
    quiet: true,
    big,
  });
}

/** Classmates: students already there, and young gentlemen of the colony to make up the year. */
function pickMates(
  g: ConquestGame,
  kid: Character,
  c: CollegeDef,
  now: EduNow,
): number[] {
  const s = g.s;
  const there = Object.values(s.chars)
    .filter(
      (x) =>
        x.alive &&
        x.id !== kid.id &&
        x.edu?.now?.kind === "college" &&
        x.edu.now.key === c.key,
    )
    .sort(
      (a, b) =>
        Math.abs(a.born - kid.born) - Math.abs(b.born - kid.born) ||
        a.id - b.id,
    )
    .slice(0, 4);
  const out = there.map((x) => x.id);
  // Young men of the colony to make up the year (they go on with their lives).
  const n = s.nations.find((x) => x.alive && c.powers.includes(x.key));
  const nat = isNativeChar(s, kid)
    ? (n ?? s.nations[kid.nation])
    : s.nations[kid.nation];
  const homes = s.provinces
    .map((pr, p) => ({ pr, p }))
    .filter((x) => x.pr.owner === nat.id && settlers(x.pr) >= 300)
    .map((x) => x.p);
  for (let i = out.length; i < 3 && homes.length; i++) {
    const age = Math.max(14, ageOf(s, kid) + g.rng.int(-1, 2));
    const m = makeCharacter(s, g.rng, {
      nation: nat.id,
      culture: nat.culture,
      religion: nat.religion,
      female: false,
      age,
    });
    m.home = homes[g.rng.int(0, homes.length - 1)];
    m.edu = {
      now: {
        ...now,
        by: -1,
        fee: 0,
        rank: g.rng.int(0, 2),
        course: c.courses[g.rng.int(0, c.courses.length - 1)],
        mood: 0,
        got: 0,
        seat: undefined,
      },
      past: [
        {
          kind: "school",
          key: "grammar",
          at: m.home,
          by: -1,
          from: s.day - 6 * DAYS_PER_YEAR,
          to: s.day,
          done: true,
        },
      ],
      pts: { letters: 4 },
    };
    delete m.edu.now!.seat;
    g.touchChar(m);
    out.push(m.id);
  }
  for (const id of out) {
    const m = g.char(id);
    const why = `At ${c.short} together`;
    remember(g, m, { of: kid.id, why, value: 10, years: 40 });
    remember(g, kid, { of: id, why, value: 10, years: 40 });
    const me = eduMut(g, m);
    me.mates = [...new Set([...(me.mates ?? []), kid.id])];
  }
  return out;
}

// ---------------------------------------------------------------- the end of it

/** Skills for the part of the course not yet given (a computer family's child gets it all at the end). */
function catchUp(c: Character, now: EduNow, upTo: number): void {
  const e = c.edu!;
  const share = Math.max(0, upTo - (now.got ?? 0));
  if (share <= 0) return;
  for (const [k, v] of Object.entries(gainsOf(now)) as [Skill, number][])
    e.pts[k] = Math.round(((e.pts[k] ?? 0) + v * share) * 100) / 100;
  now.got = Math.max(now.got ?? 0, upTo);
}

function record(
  now: EduNow,
  s: GameState,
  done: boolean,
  why?: string,
): EduDone {
  return {
    kind: now.kind,
    key: now.key,
    at: now.at,
    by: now.by,
    from: now.since,
    to: s.day,
    done,
    ...(why ? { why } : {}),
    ...(now.course ? { course: now.course } : {}),
  };
}

/** The term served, the degree taken: what it leaves them with. */
export function complete(
  g: ConquestGame,
  life: Life | null,
  kid: Character,
  early = false,
): void {
  const s = g.s;
  const e = eduMut(g, kid);
  const now = e.now;
  if (!now) return;
  catchUp(kid, now, 1);
  e.past.push(record(now, s, true, early ? "released early" : undefined));
  e.now = null;
  const by = s.chars[now.by];
  switch (now.kind) {
    case "apprentice": {
      const def = CALLING_BY_KEY.get(now.key);
      if (def?.job) e.papers = [...new Set([...(e.papers ?? []), def.job])];
      if (by?.alive)
        remember(g, by, {
          of: kid.id,
          why: "Served me well",
          value: 8,
          years: 20,
        });
      if (life)
        journal(
          g,
          life,
          `${kid.first} has served ${his(kid)} time with ${charName(by)}${early ? " (released early)" : ""}: out of ${his(kid)} indenture with ${his(kid)} freedom dues, a new suit of clothes, and ${def?.job ? `fit to be taken on as ${lower(JOBS[def.job].ranks[1]?.title ?? "a journeyman")}` : "able to keep a house of her own"}.`,
          "good",
        );
      if (life)
        schoolStory(
          g,
          life,
          kid,
          "served out an apprenticeship",
          `with ${charName(by)}${def?.art ? `, learning ${def.art}` : ""}`,
          now.at,
        ); // STORY (r17)
      break;
    }
    case "path": {
      const def = PATH_BY_KEY.get(now.key);
      if (def?.job) e.papers = [...new Set([...(e.papers ?? []), def.job])];
      if (life)
        journal(
          g,
          life,
          `${kid.first} has learned what ${by ? charName(by) : "the elders"} had to teach: ${lower(def?.name ?? "the people's ways")}.`,
          "good",
        );
      if (life)
        schoolStory(
          g,
          life,
          kid,
          "learned",
          `${lower(def?.name ?? "the people's ways")} from ${by ? charName(by) : "the elders"}`,
          now.at,
        ); // STORY (r17)
      break;
    }
    case "college": {
      const c = COLLEGE_BY_KEY.get(now.key);
      e.degree = now.key;
      e.course = now.course ?? "arts";
      if (!kid.traits.includes("educated"))
        g.char(kid.id).traits.push("educated");
      if (life) {
        addRenown(g, life, DEGREE_RENOWN);
        journal(
          g,
          life,
          `${kid.first} takes ${his(kid)} degree at ${c?.name ?? "college"}${early ? ", granted early" : " at Commencement"}: ${COURSES[(now.course as Course) ?? "arts"].degree}. The family has a scholar.`,
          "good",
        );
        schoolStory(
          g,
          life,
          kid,
          "took a degree",
          `at ${c?.name ?? "college"}: ${COURSES[(now.course as Course) ?? "arts"].degree}`,
          now.at,
          true,
        ); // STORY (r17)
      }
      break;
    }
    case "school": {
      if (now.key === "mission") learnTongue(g, kid, now, 2);
      if (life)
        journal(
          g,
          life,
          `${kid.first} has finished at ${lower(eduName(now))}${now.key === "grammar" || now.key === "jesuit" ? ": Latin enough for college" : ""}.`,
          "good",
        );
      if (life && (now.key === "grammar" || now.key === "jesuit"))
        schoolStory(g, life, kid, "finished at", lower(eduName(now)), now.at); // STORY (r17)
      break;
    }
  }
}

/** Left before the end: what was learned so far, and why. */
export function leave(
  g: ConquestGame,
  life: Life | null,
  kid: Character,
  why: string,
): void {
  const s = g.s;
  const e = eduMut(g, kid);
  const now = e.now;
  if (!now) return;
  catchUp(kid, now, progressOf(s, now));
  if (
    now.kind === "school" &&
    now.key === "mission" &&
    progressOf(s, now) >= 0.5
  )
    learnTongue(g, kid, now, 1);
  e.past.push(record(now, s, false, why));
  e.now = null;
  if (life)
    journal(
      g,
      life,
      `${kid.first} leaves ${lower(eduName(now))} ${eduWhere(s, g.map, now).replace(/^at /, "at ")}: ${why}.`,
    );
}

/** A mission school teaches its crown's tongue. */
function learnTongue(
  g: ConquestGame,
  kid: Character,
  now: EduNow,
  level: TongueLevel,
): void {
  const pr = g.s.provinces[now.at];
  const holder = pr ? g.s.nations[pr.owner] : undefined;
  if (!holder || holder.kind !== "power") return;
  const t = motherTongue(holder.culture);
  const ch = g.char(kid.id);
  ch.learned = { ...(ch.learned ?? {}) };
  ch.learned[t] = Math.max(ch.learned[t] ?? 0, level) as TongueLevel;
}

// ---------------------------------------------------------------- the commands

const TITLES: Record<string, string> = {
  school: "Off to school",
  bind: "The indenture",
  college: "Admitted to college",
  path: "A teacher",
  home: "Home again",
};

function doEdu(g: ConquestGame, life: Life, c: EduCommand): string | null {
  const s = g.s;
  const { check, offer } = eduOffer(s, g.w, life, c);
  if (!check.ok) return check.why;
  touchLife(g, life);
  const kid = g.char(c.c);
  if (c.act === "home") {
    const now = nowOf(kid)!;
    outcomeMeta(g, life, { c: kid.id, scene: "home" });
    leave(
      g,
      life,
      kid,
      now.kind === "apprentice"
        ? "you buy out the indenture and bring them home (the premium is not returned)"
        : "you bring them home",
    );
    remembers(
      g,
      life,
      kid,
      now.mood < 0 ? "Fetched me home" : "Took me away from it",
      now.mood < 0 ? 8 : -3,
      5,
    );
    return null;
  }
  begin(g, life, kid, offer!);
  return null;
}

function eduCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "edu") return undefined;
  beginOutcome(g, life);
  let err: string | null = null;
  try {
    outcomeMeta(g, life, {
      key: `edu-${c.act}`,
      title: TITLES[c.act] ?? "The children",
      scene: "home",
      c: c.c ?? -1,
      ok: null,
    });
    err = doEdu(g, life, c);
  } finally {
    endOutcome(g, life, "act", err !== null);
  }
  return err;
}

hooks.command.push(eduCommand);

// ---------------------------------------------------------------- the bills

/** The month's bills for children at school or college (in the month's budget). */
export function eduBudget(
  s: GameState,
  life: Life,
): { label: string; value: number }[] {
  if (life.watching || life.c < 0) return [];
  const out: { label: string; value: number }[] = [];
  for (const kid of familyPupils(s, life)) {
    const now = kid.edu?.now;
    if (!now || now.seat !== life.seat || now.fee <= 0) continue;
    const what =
      now.kind === "college"
        ? `College: ${kid.first} at ${COLLEGE_BY_KEY.get(now.key)?.short ?? "college"}`
        : now.key === "tutor"
          ? `A tutor for ${kid.first}`
          : `School: ${kid.first}, ${lower(eduName(now))}${now.away ? " (boarding)" : ""}`;
    out.push({ label: what, value: -now.fee });
  }
  return out;
}

hooks.budget.push(eduBudget);

// ---------------------------------------------------------------- the months

/** Each month: children learn, bills are paid (or not), things happen, letters come home. */
export function eduMonthly(g: ConquestGame): void {
  const s = g.s;
  for (const life of s.lives) {
    if (life.watching || life.c < 0) continue;
    if (!s.chars[life.c]?.alive) continue;
    for (const kid of familyPupils(s, life)) {
      const now = kid.edu?.now;
      if (now?.seat === life.seat) pupilMonth(g, life, kid);
    }
  }
  if (dateOf(s.day).month === TERM_MONTH) computerFamilies(g);
}

function moodMult(now: EduNow, kid: Character): number {
  let m = 1 + 0.15 * now.mood;
  if (hasTrait(kid, "diligent")) m *= 1.15;
  if (hasTrait(kid, "lazy")) m *= 0.85;
  return m;
}

function pupilMonth(g: ConquestGame, life: Life, kid: Character): void {
  const s = g.s;
  const now = kid.edu!.now!;
  if (isPlayed(s, kid.id)) {
    leave(g, life, kid, "gone to make their own way");
    return;
  }
  if (s.day >= now.until) {
    complete(g, life, kid);
    letterHome(g, life, kid, "done");
    return;
  }
  // A month's learning.
  const e = eduMut(g, kid);
  const n = e.now!;
  const share = Math.min(
    MONTH_DAYS / Math.max(1, n.until - n.since),
    1 - (n.got ?? 0),
  );
  if (share > 0) {
    const mult = moodMult(n, kid);
    for (const [k, v] of Object.entries(gainsOf(n)) as [Skill, number][])
      e.pts[k] = Math.round(((e.pts[k] ?? 0) + v * share * mult) * 100) / 100;
    n.got = Math.round(((n.got ?? 0) + share) * 1000) / 1000;
  }
  // The bills: three months unpaid and they're sent home.
  if (n.fee > 0) {
    if (life.purse < 0) {
      n.owed = (n.owed ?? 0) + 1;
      if (n.owed >= 3) {
        leave(g, life, kid, "sent home, the bills unpaid");
        return;
      }
      if (n.owed === 1)
        journal(
          g,
          life,
          `${kid.first}'s ${n.kind === "college" ? "college" : "school"} writes: the bills are unpaid. Three months and ${he(kid)} comes home.`,
          "bad",
        );
    } else if (n.owed) n.owed = 0;
  }
  // The master has died: the indenture is assigned, or the child comes home.
  if (n.kind === "apprentice" && n.by >= 0 && !s.chars[n.by]?.alive) {
    raiseEvent(g, life, "edu-master", { c: kid.id, m: n.by });
    return;
  }
  if (n.kind !== "apprentice" && n.by >= 0 && !s.chars[n.by]?.alive) n.by = -1;
  const r = worldRng(s, kid.id * 17 + 0xed);
  const age = ageOf(s, kid);
  const busy = life.events.length >= 3;
  if (!busy) {
    const ev = pickEvent(s, n, kid, age, r.next(), r.next());
    if (ev) {
      raiseEvent(g, life, ev, { c: kid.id, m: n.by });
      return;
    }
  }
  // Letters home, every four to seven months.
  const last = n.wrote ?? n.since;
  if (n.away && s.day - last >= 120 + (kid.id % 4) * 30 && age >= 6)
    letterHome(g, life, kid, "news");
}

/** What happens this month (if anything): an event's key. */
export function pickEvent(
  s: GameState,
  n: EduNow,
  kid: Character,
  age: number,
  roll: number,
  roll2: number,
): string | null {
  const year = yearOf(s);
  switch (n.kind) {
    case "apprentice":
      if (n.mood <= -1 && roll < 0.035) return "edu-harsh";
      if (age >= 13 && roll2 < (n.mood <= -1 ? 0.02 : 0.004))
        return "edu-runaway";
      if (n.mood >= 1 && roll > 0.98) return "edu-good";
      return null;
    case "college": {
      const abroad = n.at < 0;
      if ((n.trouble ?? 0) >= 3 && roll < 0.08) return "edu-expel";
      if (roll < 0.02) return "edu-scrape";
      if (roll < 0.02 + (n.rank === 2 ? 0.03 : 0.012)) return "edu-debts";
      const awakening = !abroad && year >= 1740 && year <= 1745;
      if (roll2 < (awakening ? 0.05 : 0.004)) return "edu-revival";
      if (roll2 > 1 - (abroad ? 0.012 : 0.004)) return "edu-sick";
      if (
        roll2 > 0.5 &&
        roll2 < 0.5 + (abroad || n.key === "wm" ? 0.006 : 0.002)
      )
        return "edu-duel";
      return null;
    }
    case "school":
      if (n.away && age < 11 && roll < 0.012) return "edu-homesick";
      return null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------- letters home

const DOINGS: Record<string, string> = {
  smith: "draw out a nail rod and shoe a quiet horse",
  cooper: "dress a stave and raise a cask",
  joiner: "cut a mortise true and frame a door",
  tanner: "flesh a hide and know when the bark has done its work",
  miller: "dress a millstone and set the gate to the race",
  ropemaker: "spin a fair yarn the length of the walk",
  distiller: "tend the still and know the cut by the smell",
  shipwright: "adze a plank and drive a treenail",
  brewer: "mash and boil and pitch the yeast",
  printer: "set a stickful of type without a fault and pull a clean sheet",
  apothecary: "make up a draught from the dispensatory and roll a pill",
  surgeon: "open a vein and bind it again",
  merchant: "keep the waste-book and copy a letter fair",
  shopkeeper: "weigh out tea and keep the book of debts",
  lawyer: "draw a deed and copy a writ",
  mariner: "hand, reef and steer, and box the compass",
  tailor: "cut a waistcoat from the pattern",
  cordwainer: "close an upper and peg a sole",
  silversmith: "raise a beaker and planish it bright",
  wheelwright: "turn a hub and set the spokes",
  mantua: "cut and fit a gown on the lady herself",
  milliner: "trim a hat and dress a cap for a lady",
  seamstress: "make a shirt from the piece and mark it",
  midwife:
    "sit with a woman in her labour and know when to send for the mistress",
  housewifery: "make butter and cheese and keep the household book",
};

/** Somebody's name, and the town of their home. */
function nameAndTown(
  s: GameState,
  map: MapDef,
  c: Character | undefined,
): string {
  if (!c) return "a friend";
  return c.home !== undefined
    ? `${charName(c)} of ${provName(map, c.home)}`
    : charName(c);
}

/** A letter from a child away (or from the master for a little one). */
export function letterHome(
  g: ConquestGame,
  life: Life,
  kid: Character,
  why: "news" | "done",
): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return;
  const e = kid.edu;
  const now = e?.now ?? null;
  const last = e?.past[e.past.length - 1];
  const rec = now ?? last;
  if (!rec) return;
  const writes = lettersOf(s, kid) >= 2 && ageOf(s, kid) >= 8;
  const master = s.chars[rec.by];
  const from = writes ? kid : master?.alive ? master : undefined;
  if (!from) return;
  const r = worldRng(s, kid.id * 13 + 5);
  const dear = me.female
    ? "Honoured Mother"
    : me.id === kid.father
      ? "Honoured Father"
      : "Honoured Sir";
  const sign = `\nYour dutiful ${sonOf(kid)},\n${kid.first}`;
  let body: string;
  const where = eduWhere(s, g.map, rec as EduNow);
  if (!writes && master) {
    body = `${me.female ? "Madam" : "Sir"},\n${kid.first} being yet too young to write a good hand, I send you word for ${him(kid)}. ${cap(he(kid))} is in health and minds ${his(kid)} book${rec.kind === "apprentice" ? " and the work" : ""}${(rec as EduNow).mood < 0 ? ", though not so well as I would like" : " very well"}.\nI am, ${me.female ? "Madam" : "Sir"}, your humble servant,\n${charName(master)}`;
  } else if (why === "done") {
    body =
      rec.kind === "college"
        ? `${dear},\nCommencement is over and I am a Bachelor. I disputed in the meeting-house before the whole country and did not disgrace you. I will come home by the first good passage. ${sign}`
        : rec.kind === "apprentice"
          ? `${dear},\nMy time is served. ${charName(master)} has given me my indenture and a new suit, and says he will speak for me to any master in the trade. I am a journeyman now, and mean to be a master. ${sign}`
          : `${dear},\nI have done at school and come home with a prize. ${sign}`;
  } else if (rec.kind === "college") {
    const col = COLLEGE_BY_KEY.get(rec.key);
    const mate =
      s.chars[
        (e?.mates ?? [])[r.int(0, Math.max(0, (e?.mates ?? []).length - 1))]
      ];
    const lines = [
      `We rise at five for prayers in the hall, recite to our tutor at six, and dispute in Latin of an afternoon. ${mate ? `${nameAndTown(s, g.map, mate)} has the chamber below mine and is a good fellow.` : ""} I must beg a further remittance: the steward's bill for commons and candles is come in.`,
      `${col?.prov ? "The college" : "The University"} is grand beyond telling, and dear beyond telling. I have bought the books my tutor named and a gown fit to be seen in. ${mate ? `I am much with ${nameAndTown(s, g.map, mate)}.` : ""} Pray do not believe what you may hear of the bonfire.`,
      `I am reading ${lower(COURSES[(rec as EduNow).course as Course]?.name ?? "the arts")} and am third in my class at the last examination. ${mate ? `${charName(mate)} sends his compliments.` : ""} The winter has been hard and the fire in my chamber small.`,
    ];
    body = `${dear},\n${r.pick(lines)} ${sign}`;
  } else if (rec.kind === "apprentice") {
    const doing = DOINGS[rec.key] ?? "do a good part of the work of the shop";
    const mood = (rec as EduNow).mood;
    body =
      mood <= -1
        ? `${dear},\nI would not trouble you, but ${charName(master)} beats me for every fault and some that are not mine, and we have salt fish four days in seven. I mean to bear it as you bid me. I can ${doing} now. ${sign}`
        : mood >= 1
          ? `${dear},\nI am well and ${charName(master)} uses me kindly; ${master?.female ? "she" : "he"} says I have a good eye and steady hands. I can ${doing} now. My duty to all at home. ${sign}`
          : `${dear},\nThis comes to tell you I am in health. The work is hard and the days are long, but I can ${doing} now. Pray send my winter stockings. ${sign}`;
  } else if (rec.key === "convent") {
    body = `${dear},\nThe good sisters teach us to read and write, and to work in silk and gold thread; I have begun a sampler for you. We hear Mass every morning and are not allowed to talk at dinner. ${sign}`;
  } else if (rec.key === "mission") {
    body = `My ${me.female ? "mother" : "father"},\nI make these letters as the minister teaches us. I am well. I learn the words of the book and the English (or the French) words for things. At night I think of the fire at home and the stories. ${sign}`;
  } else {
    body = `${dear},\nI am well at ${where.replace(/^at /, "")}. The master is strict and the Latin is very hard, but I am above the middle of the form. ${sign}`;
  }
  const n = e?.now;
  if (n) eduMut(g, kid).now!.wrote = s.day;
  const abroad = rec.at < 0;
  const letter = npcWrite(g, life, from, "news", body, {
    delay: abroad ? 45 + r.int(0, 25) : 0,
    about: kid.id,
  });
  if (letter && rec.at >= 0) letter.origin = rec.at;
}

// ---------------------------------------------------------------- computer families

/** Each September: computer families send their children to school, to a master, to college. */
export function computerFamilies(g: ConquestGame): void {
  const s = g.s;
  const r = worldRng(s, 0x5c400);
  // Finish (or end) what's under way for children nobody plays for.
  for (const c of Object.values(s.chars)) {
    const now = c.edu?.now;
    if (!now || !c.alive) continue;
    const payer = now.seat
      ? s.lives.find((l) => l.seat === now.seat)
      : undefined;
    if (payer && !payer.watching && payer.c >= 0) continue;
    if (isPlayed(s, c.id)) leave(g, null, c, "gone to make their own way");
    else if (s.day >= now.until) {
      complete(g, null, c);
      graduatePost(g, c);
    } else if (
      now.kind === "apprentice" &&
      now.by >= 0 &&
      !s.chars[now.by]?.alive
    )
      reassign(g, null, c);
  }
  // New starts.
  const counts = apprenticeCounts(s);
  for (const key of Object.keys(s.locals)) {
    const p = Number(key);
    for (const kid of householdsOf(s, p))
      startComputerChild(g, r, kid, p, counts);
  }
  // Governors' children: a tutor, then college.
  for (const n of s.nations) {
    if (!n.alive || (n.kind !== "power" && n.kind !== "native")) continue;
    const ruler = s.chars[n.ruler];
    for (const id of ruler?.children ?? []) {
      const kid = s.chars[id];
      if (!kid?.alive || kid.abroad || nowOf(kid) || kid.spouse >= 0) continue;
      if (isPlayed(s, kid.id) || isPlayed(s, ruler!.id)) continue;
      const a: Asker = {
        s,
        w: g.w,
        home: kid.home ?? n.capital,
        purse: Infinity,
        life: null,
      };
      const age = ageOf(s, kid);
      if (n.kind === "power" && age >= 6 && age <= 8 && !kid.edu?.past.length) {
        const o = schoolOffersFor(a, kid).find(
          (x) => x.key === "tutor" && x.check.ok,
        );
        if (o) begin(g, null, kid, o);
      } else if (
        !kid.female &&
        age >= 15 &&
        age <= 17 &&
        !kid.edu?.degree &&
        r.chance(0.6)
      ) {
        const o = collegeOffersFor(a, kid, 2, "arts").filter((x) => x.check.ok);
        const pick = o.find((x) => x.at >= 0) ?? o[0];
        if (pick) begin(g, null, kid, pick);
      }
    }
  }
}

/** A computer family's child: what they're sent to this year, if anything. */
function startComputerChild(
  g: ConquestGame,
  r: ReturnType<typeof worldRng>,
  kid: Character,
  p: number,
  counts: Map<number, number>,
): void {
  const s = g.s;
  if (!kid.alive || kid.abroad || kid.spouse >= 0 || nowOf(kid)) return;
  const age = ageOf(s, kid);
  if (age < 4 || age > 17) return;
  const parents = [s.chars[kid.father], s.chars[kid.mother]];
  if (parents.some((x) => x && isPlayed(s, x.id)) || isPlayed(s, kid.id))
    return;
  // Only the children of a household, not the head of it.
  if (!parents.some((x) => x)) return;
  const status = Math.max(
    1,
    ...parents.map((x) => (x?.role ? ROLES[x.role].status : 0)),
  );
  const a: Asker = { s, w: g.w, home: p, purse: Infinity, life: null };
  const past = kid.edu?.past ?? [];
  const had = (k: string) => past.some((x) => x.key === k);
  const take = (o: EduOffer | undefined) => {
    if (!o) return;
    begin(g, null, kid, o);
    if (o.kind === "apprentice") counts.set(o.by, (counts.get(o.by) ?? 0) + 1);
  };
  if (isNativeChar(s, kid)) {
    const paths = pathOffersFor(a, kid).filter(
      (o) => o.check.ok && !had(o.key),
    );
    if (paths.length && r.chance(0.55)) take(paths[r.int(0, paths.length - 1)]);
    else if (age <= 10 && r.chance(0.08))
      take(
        schoolOffersFor(a, kid).find((o) => o.key === "mission" && o.check.ok),
      );
    return;
  }
  let schools: EduOffer[] | null = null;
  const school = (key: string) =>
    (schools ??= schoolOffersFor(a, kid)).find(
      (o) => o.key === key && o.check.ok,
    );
  if (age <= 6 && !past.length && r.chance(0.5)) return take(school("dame"));
  if (
    !kid.female &&
    age >= 7 &&
    age <= 10 &&
    status >= 3 &&
    !had("grammar") &&
    !had("jesuit") &&
    r.chance(0.6)
  )
    return take(school("grammar") ?? school("jesuit") ?? school("tutor"));
  if (kid.female && age >= 7 && age <= 10 && status >= 2 && r.chance(0.35))
    return take(school("convent") ?? school("needle"));
  if (
    age >= 12 &&
    age <= 15 &&
    status <= 3 &&
    !past.some((x) => x.kind === "apprentice") &&
    r.chance(kid.female ? 0.2 : 0.4)
  ) {
    const callings = CALLINGS.filter(
      (c) =>
        (c.sex === "both" || (c.sex === "girls") === kid.female) &&
        c.premium <= (status >= 3 ? 30 : 8),
    );
    // A computer family looks for a master in its own town.
    const offers = callings
      .flatMap((c) => callingOffersFor(a, kid, c.key, counts, [p]))
      .filter((o) => o.check.ok);
    if (offers.length) take(offers[r.int(0, offers.length - 1)]);
    return;
  }
  if (
    !kid.female &&
    age >= 15 &&
    status >= 3 &&
    !kid.edu?.degree &&
    (had("grammar") || had("jesuit") || had("tutor")) &&
    r.chance(0.5)
  ) {
    const o = collegeOffersFor(
      a,
      kid,
      status >= 4 ? 2 : 1,
      r.chance(0.4) ? "divinity" : "arts",
    ).filter((x) => x.check.ok);
    take(o.find((x) => x.at >= 0) ?? o[0]);
  }
}

/** A master died: the indenture goes to the widow or the next master of the trade, or ends. */
export function reassign(
  g: ConquestGame,
  life: Life | null,
  kid: Character,
  to?: number,
): Character | null {
  const s = g.s;
  const now = kid.edu?.now;
  if (!now || now.kind !== "apprentice") return null;
  const dead = s.chars[now.by];
  const next: Character | undefined =
    to !== undefined ? s.chars[to] : successorOf(s, g.w, kid);
  if (!next) {
    leave(
      g,
      life,
      kid,
      `${dead ? charName(dead) : "the master"} died, and nobody would take the indenture`,
    );
    return null;
  }
  const e = eduMut(g, kid);
  e.now!.by = next.id;
  e.now!.mood = masterTemper(next);
  if (life)
    journal(
      g,
      life,
      `${kid.first}'s indenture is assigned to ${charName(next)}, to serve out the rest of the term.`,
    );
  return next;
}

/** Who an indenture passes to when the master dies: the widow, or the next master of the trade there. */
export function successorOf(
  s: GameState,
  w: World,
  kid: Character,
): Character | undefined {
  const now = kid.edu?.now;
  if (!now || now.kind !== "apprentice") return undefined;
  const calling = CALLING_BY_KEY.get(now.key);
  if (!calling) return undefined;
  const dead = s.chars[now.by];
  const widow = dead ? s.chars[dead.spouse] : undefined;
  if (
    widow?.alive &&
    !widow.abroad &&
    !isPlayed(s, widow.id) &&
    widow.id !== kid.mother
  )
    return widow;
  const counts = apprenticeCounts(s);
  return mastersIn(s, w, now.at, calling, kid).find(
    (m) => (counts.get(m.id) ?? 0) < MASTER_CAP && m.id !== now.by,
  );
}

/** What a degree's course makes a town's graduate (if the town wants one). */
const POST_FOR: Record<Course, import("./Types").RoleId | null> = {
  arts: null,
  divinity: "preacher",
  law: "lawyer",
  physic: "physician",
};

/**
 * A computer family's graduate may take up the work the degree opened: the
 * town's pulpit, its law office or its physic, if that post is empty and
 * the town keeps the place for it.
 */
function graduatePost(g: ConquestGame, c: Character): void {
  const s = g.s;
  const role = POST_FOR[(c.edu?.course as Course) ?? "arts"];
  const p = c.home;
  if (!role || p === undefined || c.role || !s.locals[p]) return;
  const list = s.locals[p];
  if (postsIn(s, list) >= LOCALS_CAP) return; // TOWNS (r17): the posts, not every household
  if (list.some((id) => s.chars[id]?.alive && s.chars[id]?.role === role))
    return;
  if (!hasPlace(s, g.w, p, ROLES[role].place)) return;
  g.char(c.id).role = role;
  if (!list.includes(c.id)) s.locals[p] = [...list, c.id]; // TOWNS (r17): a head already
  g.localsChanged(p);
}

// ---------------------------------------------------------------- heirs

/** EDU (r13): a child at school or away comes home to head the family, keeping what they learned. */
function eduHeir(g: ConquestGame, life: Life, heir: Character): void {
  const s = g.s;
  const e = heir.edu;
  if (!e) return;
  const before = { ...e.pts };
  const now = e.now;
  if (now) {
    const f = progressOf(s, now);
    const served =
      f >= 0.95 ||
      (now.kind === "apprentice" && f >= HEIR_SERVED) ||
      (now.kind === "college" && f >= HEIR_DEGREE);
    const where = eduWhere(s, g.map, now);
    if (served) complete(g, null, heir, true);
    else leave(g, null, heir, "came home to head the family");
    journal(
      g,
      life,
      now.away
        ? `Word reaches you ${where}: you are head of the family now. You come home${served ? (now.kind === "college" ? ", your degree granted early" : now.kind === "apprentice" ? ", released from your indenture with your time as good as served" : "") : ""}.`
        : `You leave ${lower(eduName(now))} to head the family.`,
    );
  }
  // What was given at the end, on top of the skills already reckoned.
  for (const sk of SKILLS) {
    const add = Math.floor(e.pts[sk] ?? 0) - Math.floor(before[sk] ?? 0);
    if (add > 0) life.skills[sk] = Math.min(15, (life.skills[sk] ?? 0) + add);
  }
  // Friends from college or the bench, still about.
  const mates = (e.mates ?? []).filter(
    (id) => s.chars[id]?.alive && !s.chars[id]?.abroad,
  );
  for (const id of mates) meet(g, life, id);
  if (mates[0] && !life.ties[mates[0]]) setTie(g, life, mates[0], "friend");
  // Out of an apprenticeship: a master of the trade at home takes on a journeyman.
  const paper = e.papers?.[e.papers.length - 1];
  if (!life.job && paper && ageOf(s, heir) >= 16) {
    const boss = employersIn(s, g.w, life.home).find((x) =>
      x.jobs.includes(paper),
    );
    if (boss)
      startJob(
        g,
        life,
        paper,
        boss.place,
        startRank(s, life, paper),
        boss.c.id,
      );
  }
}

hooks.heir.push(eduHeir);

// ---------------------------------------------------------------- for the pages

export interface EduStatus {
  /** A short word for a chip: "At Harvard". */
  chip: string;
  /** A sentence: "At Harvard College, Cambridge, by Boston: the second year of four (the arts)". */
  line: string;
  progress: number;
  tone: "good" | "bad" | "";
}

const ORD = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
];

/** How a child's schooling stands, for the family pages. */
export function eduStatus(
  s: GameState,
  map: MapDef,
  c: Character,
): EduStatus | null {
  const now = nowOf(c);
  const chip = eduChipText(c);
  if (!chip) return null;
  if (!now) {
    const e = c.edu!;
    const last = e.past[e.past.length - 1];
    return {
      chip,
      line: e.degree
        ? `${COURSES[(e.course as Course) ?? "arts"].degree}, ${COLLEGE_BY_KEY.get(e.degree)?.name ?? "college"}`
        : last
          ? `${last.done ? "Finished" : "Left"} ${lower(eduName(last))}${last.why ? ` (${last.why})` : ""}`
          : chip,
      progress: 1,
      tone: "good",
    };
  }
  const years = Math.max(
    1,
    Math.round((now.until - now.since) / DAYS_PER_YEAR),
  );
  const year = Math.min(
    years,
    Math.floor((s.day - now.since) / DAYS_PER_YEAR) + 1,
  );
  const course =
    now.kind === "college"
      ? ` (${lower(COURSES[(now.course as Course) ?? "arts"].name)})`
      : "";
  return {
    chip,
    line: `${now.kind === "apprentice" ? `Apprentice ${lower(eduName(now))},` : cap(eduName(now))} ${eduWhere(s, map, now)}: the ${ORD[year - 1] ?? `${year}th`} year of ${years}${course}`,
    progress: progressOf(s, now),
    tone: now.mood <= -1 ? "bad" : now.mood >= 1 ? "good" : "",
  };
}

/** What they've learned so far, as "letters 3, craft 4". */
export function learnedLine(c: Character): string {
  const pts = c.edu?.pts ?? {};
  return (Object.entries(pts) as [Skill, number][])
    .filter(([, v]) => Math.floor(v) > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${lower(SKILL_NAMES[k])} +${Math.floor(v)}`)
    .join(", ");
}

/** Letters from a child (or about them) in a life's post, newest first. */
export function lettersFrom(
  life: Life,
  c: Character,
): import("./Types").Letter[] {
  return (life.post ?? [])
    .filter(
      (l) =>
        l.kind === "news" &&
        (l.from === c.id || l.about === c.id) &&
        l.status === "delivered",
    )
    .sort((a, b) => b.arrive - a.arrive);
}

/** The town a child's people keep (for naming the indenture). */
export function cultureOfTown(s: GameState, p: number, kid: Character): string {
  return townCulture(s, p) ?? kid.culture;
}
