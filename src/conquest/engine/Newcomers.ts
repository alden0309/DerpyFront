// TOWNS (r17): a town's people grow with it. Ships and the road bring
// families, single men and women, widows and widowers, servants, tradesmen
// and now and then a person of note, in proportion to the settlers who come
// (and to keep a town that's lost people filled to what its size holds).
// A child of the town who marries and has children keeps house of their
// own, so the grandchildren belong to the town too. Native towns take in kin
// from the nation's other towns, and their young people marry between
// towns. A town that has had nobody to marry for a year or two draws someone
// through ordinary life: a grown child of the town, a widow come to her
// sister's from another town of the colony, or a family off a ship.

import { birth, makeCharacter, marry } from "./Characters";
import { householdsOf } from "./Folk";
import type { ConquestGame } from "./Game";
import { personCheck } from "./Interactions";
import { journal } from "./LifeCore";
import { isNativeChar, meOf, peopleHere } from "./LifeQueries";
import { ROLES } from "./LifeRules";
import { kmBetween } from "./Map";
import { NAMES } from "./Names";
import { ageOf, charName, provincesOf } from "./Queries";
import type { Rng } from "./Rng";
import {
  ARRIVALS,
  DRIFT_IN,
  dryDays,
  headsOf,
  householdRoom,
  HOUSEHOLDS,
  KEPT_ARRIVALS,
  marriageable,
  MARRY_BETWEEN,
  SHORT_BOOST,
  tdice,
  townFolk,
  townsChanged,
  townsState,
  turnoverOf,
  type ArrivalKind,
} from "./TownsCore";
import type {
  Character,
  Life,
  Nation,
  Religion,
  TownArrival,
  TownCameHow,
} from "./Types";

// ---------------------------------------------------------------- the tables

/** The ports a people's ships come from (by culture). */
const SHIP_PORTS: Record<string, string[]> = {
  english: ["Bristol", "London", "Plymouth", "Gravesend", "Southampton"],
  french: ["La Rochelle", "Rouen", "Dieppe", "Nantes", "Saint-Malo"],
  spanish: ["Cádiz", "Seville", "the Canaries", "Santander"],
  portuguese: ["Lisbon", "Porto", "the Azores", "Madeira"],
  dutch: ["Amsterdam", "the Texel", "Rotterdam", "Middelburg"],
  swedish: ["Gothenburg", "Stockholm"],
};

const TRADES = [
  "a cooper",
  "a carpenter",
  "a joiner",
  "a blacksmith",
  "a tailor",
  "a weaver",
  "a shoemaker",
  "a baker",
  "a chandler",
  "a wheelwright",
  "a bricklayer",
  "a mason",
  "a saddler",
  "a potter",
  "a tanner",
  "a miller",
  "a shopkeeper",
  "a fisherman",
];

/** A farming family, as each people said it. */
const FARMER: Record<string, string> = {
  english: "a planter",
  puritan: "a husbandman",
  french: "a habitant",
  spanish: "a labrador",
  portuguese: "a lavrador",
  dutch: "a farmer",
  swedish: "a farmer",
};

/** A person of note, as each people said it. */
const NOTE: Record<string, string> = {
  english: "a gentleman",
  french: "a gentleman of good family",
  spanish: "a hidalgo",
  portuguese: "a fidalgo",
  dutch: "a merchant of standing",
  swedish: "a gentleman",
};

const MAN_AS = [
  "a journeyman",
  "in service",
  "a discharged soldier",
  "a sailor come ashore",
  "a labourer",
];
const WOMAN_AS = [
  "in service",
  "a seamstress",
  "come to her brother's",
  "come to keep house for her uncle",
  "a dairymaid",
];
const NATIVE_AS = {
  man: ["a hunter", "a young warrior", "a trader", "a maker of canoes"],
  woman: [
    "a maker of baskets",
    "a healer's daughter",
    "of the clan mothers' kin",
  ],
  family: ["a hunter", "a trader", "a maker"],
};

// ---------------------------------------------------------------- whose people

/** Who a household is of: its nation, people, faith, and whether native. */
export interface Folk {
  nation: number;
  culture: string;
  religion: Religion;
  native: boolean;
}

function folkOfNation(n: Nation): Folk {
  return {
    nation: n.id,
    culture: n.culture,
    religion: n.kind === "native" ? "native" : n.religion,
    native: n.kind === "native",
  };
}

function folkOfChar(s: ConquestGame["s"], c: Character): Folk {
  const native = isNativeChar(s, c);
  return {
    nation: c.nation,
    culture: c.culture,
    religion: native ? "native" : c.religion,
    native,
  };
}

function sameFolk(s: ConquestGame["s"], c: Character, f: Folk): boolean {
  return isNativeChar(s, c) === f.native && c.culture === f.culture;
}

/** A people's name for a farmer, a person of note, its ships' ports. */
function cultureKey(f: Folk): string {
  return f.religion === "puritan" ? "puritan" : f.culture;
}

// ---------------------------------------------------------------- making people

function person(
  g: ConquestGame,
  r: Rng,
  p: number,
  f: Folk,
  female: boolean,
  age: number,
): Character {
  const c = makeCharacter(g.s, r, {
    nation: f.nation,
    culture: f.culture,
    religion: f.religion,
    female,
    age: Math.max(0, Math.round(age)),
  });
  c.home = p;
  return c;
}

/** A child of two of them, of an age (and of a sex, if it must be). */
function child(
  g: ConquestGame,
  r: Rng,
  father: Character,
  mother: Character,
  age: number,
  female?: boolean,
): Character {
  const kid = birth(g.s, r, father, mother, Math.max(0, Math.round(age)));
  if (female !== undefined && kid.female !== female) {
    kid.female = female;
    const list = NAMES[kid.culture] ?? NAMES.english;
    if (!isNativeChar(g.s, kid))
      kid.first = r.pick(female ? list.female : list.male) ?? kid.first;
  }
  return kid;
}

function couple(
  g: ConquestGame,
  r: Rng,
  p: number,
  f: Folk,
  hisAge: number,
): [Character, Character] {
  const man = person(g, r, p, f, false, hisAge);
  const wife = person(g, r, p, f, true, Math.max(18, hisAge + r.int(-8, 2)));
  marry(g.s, man, wife);
  return [man, wife];
}

/** Children of a couple, up to `n`, none older than their mother allows. */
function children(
  g: ConquestGame,
  r: Rng,
  man: Character,
  wife: Character,
  n: number,
  oldest = 14,
): Character[] {
  const out: Character[] = [];
  const top = Math.min(oldest, ageOf(g.s, wife) - 18);
  for (let i = 0; i < n && top >= 0; i++)
    out.push(child(g, r, man, wife, r.int(0, top)));
  return out;
}

/** A household of a kind, made up in a town: the head first. */
function household(
  g: ConquestGame,
  r: Rng,
  p: number,
  f: Folk,
  kind: ArrivalKind,
  /** Come to be married: a widow or widower young enough to marry again. */
  young = false,
): { head: Character; folk: Character[]; as: string } {
  const ck = cultureKey(f);
  const trade = (): string =>
    f.native
      ? r.pick(NATIVE_AS.family)!
      : r.chance(0.3)
        ? (FARMER[ck] ?? FARMER.english)
        : r.pick(TRADES)!;
  switch (kind) {
    case "daughters":
    case "sons": {
      const want = kind === "daughters";
      const [man, wife] = couple(g, r, p, f, r.int(42, 52));
      const kids = [child(g, r, man, wife, r.int(18, 22), want)];
      if (r.chance(0.4))
        kids.push(
          child(g, r, man, wife, r.int(15, 18), r.chance(0.6) ? want : !want),
        );
      kids.push(...children(g, r, man, wife, r.int(0, 2), 12));
      return { head: man, folk: [man, wife, ...kids], as: trade() };
    }
    case "couple": {
      const [man, wife] = couple(g, r, p, f, r.int(20, 27));
      const kids = r.chance(0.4) ? children(g, r, man, wife, 1, 2) : [];
      return { head: man, folk: [man, wife, ...kids], as: trade() };
    }
    case "man": {
      const c = person(g, r, p, f, false, r.int(18, 30));
      return {
        head: c,
        folk: [c],
        as: f.native ? r.pick(NATIVE_AS.man)! : r.pick(MAN_AS)!,
      };
    }
    case "woman": {
      const c = person(g, r, p, f, true, r.int(17, 27));
      return {
        head: c,
        folk: [c],
        as: f.native ? r.pick(NATIVE_AS.woman)! : r.pick(WOMAN_AS)!,
      };
    }
    case "widow":
    case "widower": {
      const female = kind === "widow";
      const age = young
        ? r.int(female ? 22 : 24, female ? 34 : 38)
        : r.int(female ? 24 : 28, female ? 42 : 50);
      const c = person(g, r, p, f, female, age);
      // The late husband (or wife), for the children's sake: dead before they came.
      const late = person(g, r, p, f, !female, age + (female ? 4 : -3));
      marry(g.s, c, late);
      late.alive = false;
      late.died = { day: g.s.day - r.int(60, 900), cause: "a fever" };
      late.home = undefined;
      c.spouse = -1;
      const [man, wife] = female ? [late, c] : [c, late];
      const kids = children(g, r, man, wife, r.int(0, 3), 15);
      return {
        head: c,
        folk: [c, ...kids],
        as: female ? "a widow" : "a widower",
      };
    }
    case "note": {
      const [man, wife] = couple(g, r, p, f, r.int(32, 50));
      man.stats[r.pick(["dip", "ste", "lea"] as const)!] += 2;
      const kids = children(g, r, man, wife, r.int(1, 3), 20);
      return {
        head: man,
        folk: [man, wife, ...kids],
        as: NOTE[f.culture] ?? NOTE.english,
      };
    }
    default: {
      const [man, wife] = couple(g, r, p, f, r.int(26, 44));
      const kids = children(g, r, man, wife, r.int(1, 4), 16);
      return { head: man, folk: [man, wife, ...kids], as: trade() };
    }
  }
}

// ---------------------------------------------------------------- where from

/** Other towns of a nation, nearest first (with people in them). */
function townsOfNation(
  g: ConquestGame,
  n: number,
  p: number,
  min = 100,
): number[] {
  const s = g.s;
  return provincesOf(s, n)
    .filter((q) => q !== p && townFolk(s, q) >= min)
    .sort((a, b) => kmBetween(g.map, p, a) - kmBetween(g.map, p, b) || a - b);
}

/** Where a household comes from, and how. */
function whence(
  g: ConquestGame,
  r: Rng,
  p: number,
  f: Folk,
): { how: TownCameHow; from: string } {
  const s = g.s;
  // Down the road: a town of the nation within a few days' walk (over land).
  const road = overland(g, f.nation, p);
  if (f.native) {
    const q = r.pick(
      road.length ? road : townsOfNation(g, f.nation, p).slice(0, 4),
    );
    return {
      how: "visit",
      from:
        q !== undefined ? g.map.provinces[q].name : "the nation's other towns",
    };
  }
  const port = g.map.provinces[p].coastal && (s.provinces[p].b.port ?? 0) > 0;
  if (road.length && (!port || r.chance(0.35)))
    return { how: "road", from: g.map.provinces[r.pick(road)!].name };
  // By sea: from home, or now and then from another of the colony's ports.
  const ports = townsOfNation(g, f.nation, p).filter(
    (q) => g.map.provinces[q].coastal && (s.provinces[q].b.port ?? 0) > 0,
  );
  if (ports.length && r.chance(0.25))
    return {
      how: "ship",
      from: g.map.provinces[r.pick(ports.slice(0, 4))!].name,
    };
  return {
    how: "ship",
    from: r.pick(SHIP_PORTS[f.culture] ?? SHIP_PORTS.english)!,
  };
}

/** Towns of a nation within four hops over land (nearest first). */
function overland(g: ConquestGame, n: number, p: number): number[] {
  const s = g.s;
  const out: number[] = [];
  const seen = new Set([p]);
  let ring = [p];
  for (let hop = 0; hop < 4 && ring.length; hop++) {
    const next: number[] = [];
    for (const q of ring)
      for (const [x] of g.map.provinces[q].nb) {
        if (seen.has(x)) continue;
        seen.add(x);
        next.push(x);
        if (s.provinces[x]?.owner === n && townFolk(s, x) >= 100) out.push(x);
      }
    ring = next;
  }
  return out.slice(0, 5);
}

// ---------------------------------------------------------------- the news

function nameList(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const WORDS = ["", "one", "two", "three", "four", "five", "six"];

/** "A ship from Bristol: the Hales, a cooper's family, with their daughters Anne (19) and Mary (16)." */
export function arrivalText(
  g: ConquestGame,
  head: Character,
  folk: Character[],
  how: TownCameHow,
  from: string,
  as: string,
): string {
  const s = g.s;
  const native = isNativeChar(s, head);
  const opener =
    how === "ship"
      ? `A ship from ${from}`
      : how === "road"
        ? `Down the road from ${from}`
        : how === "kin"
          ? `From ${from}, to kin here`
          : how === "visit"
            ? `From ${from}, kin come to stay`
            : how === "marry"
              ? `From ${from}, to marry`
              : how === "grown"
                ? "A household of its own"
                : "Settled here";
  const kids = folk.filter((c) => c.id !== head.id && c.id !== head.spouse);
  const spouse = folk.find((c) => c.id === head.spouse);
  const grown = kids.filter((c) => ageOf(s, c) >= 16);
  const young = kids.length - grown.length;
  const their = spouse ? "their" : head.female ? "her" : "his";
  const grownWords = grown.length
    ? `${their} ${
        grown.every((c) => c.female)
          ? grown.length > 1
            ? "daughters"
            : "daughter"
          : grown.every((c) => !c.female)
            ? grown.length > 1
              ? "sons"
              : "son"
            : "children"
      } ${nameList(grown.map((c) => `${c.first} (${ageOf(s, c)})`))}`
    : "";
  const youngWords = young
    ? `${grown.length ? "and " : ""}${WORDS[young] ?? young} ${grown.length ? "younger " : ""}${young > 1 ? "children" : "child"}`
    : "";
  const tail = [grownWords, youngWords].filter(Boolean).join(" ");
  const who = native ? head.first : charName(head);
  if (spouse) {
    const family = native
      ? `${head.first} and ${spouse.first}`
      : `the ${head.family}${head.family.endsWith("s") ? "es" : "s"}`;
    const what = as && !native ? `, ${as}'s family` : "";
    return `${opener}: ${family}${what}${tail ? `, with ${tail}` : ""}.`;
  }
  const age = ageOf(s, head);
  return `${opener}: ${who} (${age}), ${as}${tail ? `, with ${tail}` : ""}.`;
}

/** Put a household in a town's list, mark how it came, and tell the town. */
function settleIn(
  g: ConquestGame,
  p: number,
  head: Character,
  folk: Character[],
  how: TownCameHow,
  from: string,
  as: string,
  tell = true,
): void {
  const s = g.s;
  const t = townsState(g);
  const list = (s.locals[p] ??= []);
  if (!list.includes(head.id)) list.push(head.id);
  g.localsChanged(p);
  for (const c of folk) {
    g.touchChar(c);
    if (c.home !== p) c.home = p;
    if (!c.came || c.id === head.id)
      c.came = { day: s.day, how, from, as: c.id === head.id ? as : "" };
  }
  if (how === "settled") return;
  const text = arrivalText(g, head, folk, how, from, as);
  const arr: TownArrival = {
    day: s.day,
    c: head.id,
    folk: folk.map((c) => c.id),
    how,
    text,
  };
  const kept = (t.came[p] ??= []);
  kept.push(arr);
  if (kept.length > KEPT_ARRIVALS) kept.splice(0, kept.length - KEPT_ARRIVALS);
  townsChanged(g);
  if (!tell) return;
  // Those who live here hear of it (the town's news, not their own affairs).
  for (const life of s.lives)
    if (life.c >= 0 && life.home === p && meOf(s, life)?.alive)
      journal(g, life, text, undefined, false);
}

// ---------------------------------------------------------------- the month

/** Each town's people at the month's turn: who comes, who keeps house, who goes. */
export function newcomersMonthly(g: ConquestGame): void {
  const s = g.s;
  const t = townsState(g);
  const r = tdice(g);
  for (const key of Object.keys(s.locals)) {
    const p = Number(key);
    const pr = s.provinces[p];
    if (!pr || pr.owner < 0) continue;
    const owner = s.nations[pr.owner];
    if (!owner?.alive || (owner.kind !== "power" && owner.kind !== "native"))
      continue;
    tidyHeads(g, p);
    const folk = townFolk(s, p);
    if (t.seen[p] === undefined) {
      t.seen[p] = Math.round(folk);
      settleFirst(g, p, r);
      continue;
    }
    const grown = folk - t.seen[p];
    t.seen[p] = Math.round(folk);
    if (grown > 0) t.owed[p] = Math.round((t.owed[p] ?? 0) + grown);
    // A town under siege or held by an enemy takes nobody in.
    if (pr.occupier >= 0 || pr.siege) continue;
    ownHouseholds(g, p);
    arrivals(g, p, r);
    departures(g, p, r);
    if (owner.kind === "native") marriesBetween(g, p, r);
    dryMarket(g, p, r);
  }
  lonelyPlayers(g, r);
}

/** The town's households already there when it's first known (no news). */
function settleFirst(g: ConquestGame, p: number, r: Rng): void {
  const s = g.s;
  const owner = s.nations[s.provinces[p].owner];
  const room = householdRoom(s, p);
  const have = headsOf(s, p).length;
  const make = Math.max(0, Math.round(room * 0.6) - have);
  const f = folkOfNation(owner);
  for (let i = 0; i < make; i++) {
    const kind = pickKind(r, f.native);
    const h = household(g, r, p, f, kind);
    settleIn(g, p, h.head, h.folk, "settled", g.map.provinces[p].name, h.as);
  }
}

function pickKind(
  r: Rng,
  native: boolean,
  short: { w: boolean; m: boolean } = { w: false, m: false },
): ArrivalKind {
  const table = ARRIVALS[native ? "native" : "colony"];
  const entries = (Object.entries(table) as [ArrivalKind, number][]).map(
    ([k, w]): [ArrivalKind, number] => [
      k,
      w *
        (short.w && (k === "daughters" || k === "woman")
          ? SHORT_BOOST
          : short.m && (k === "sons" || k === "man")
            ? SHORT_BOOST
            : 1),
    ],
  );
  const total = entries.reduce((m, [, w]) => m + w, 0);
  let x = r.next() * total;
  for (const [k, w] of entries) {
    x -= w;
    if (x < 0) return k;
  }
  return entries[0][0];
}

/**
 * Heads of households that no longer head one here: gone to live elsewhere,
 * married into another household of the town, or married to a player.
 */
function tidyHeads(g: ConquestGame, p: number): void {
  const s = g.s;
  const list = s.locals[p];
  if (!list) return;
  const next = list.filter((id) => {
    const c = s.chars[id];
    if (!c || c.role || !c.alive || c.abroad) return true; // the posts' own round sees to these
    if (c.home !== undefined && c.home !== p) return false;
    const sp = s.chars[c.spouse];
    if (sp?.alive) {
      if (s.lives.some((l) => l.c === sp.id)) return false;
      const at = list.indexOf(sp.id);
      if (at >= 0 && (s.chars[sp.id]?.role || at < list.indexOf(id)))
        return false;
    }
    return true;
  });
  if (next.length !== list.length) {
    s.locals[p] = next;
    g.localsChanged(p);
  }
}

/** A child of the town, married with children, keeps house of their own. */
function ownHouseholds(
  g: ConquestGame,
  p: number,
  wantSex?: boolean,
  /** For one who must be of a people (a remedy for someone of theirs). */
  of?: Folk,
): boolean {
  const s = g.s;
  const list = s.locals[p] ?? [];
  if (wantSex === undefined && headsOf(s, p).length >= householdRoom(s, p))
    return false;
  const heads = new Set(list);
  for (const c of householdsOf(s, p)) {
    if (heads.has(c.id) || c.spouse < 0 || c.role) continue;
    const parent = s.chars[c.father] ?? s.chars[c.mother];
    if (!parent || !(heads.has(parent.id) || heads.has(parent.spouse)))
      continue;
    const sp = s.chars[c.spouse];
    if (!sp?.alive || sp.abroad || heads.has(sp.id)) continue;
    if (s.lives.some((l) => l.c === c.id || l.c === sp.id)) continue;
    const kids = c.children
      .map((k) => s.chars[k])
      .filter((k): k is Character => !!k?.alive && !k.abroad);
    if (!kids.length) continue;
    if (
      wantSex !== undefined &&
      !kids.some(
        (k) =>
          k.female === wantSex &&
          marriageable(s, k) &&
          (!of || sameFolk(s, k, of)),
      )
    )
      continue;
    const as = parent.role
      ? `the ${ROLES[parent.role].title.toLowerCase()}'s ${c.female ? "daughter" : "son"}`
      : `${charName(parent)}'s ${c.female ? "daughter" : "son"}`;
    sp.home = p;
    settleIn(
      g,
      p,
      c,
      [c, sp, ...kids],
      "grown",
      g.map.provinces[p].name,
      as,
      false,
    );
    return true;
  }
  return false;
}

/** Ships and the road: one household a month at most, as the town grows or has room. */
function arrivals(g: ConquestGame, p: number, r: Rng): void {
  const s = g.s;
  const t = townsState(g);
  const owner = s.nations[s.provinces[p].owner];
  const native = owner.kind === "native";
  const room = householdRoom(s, p);
  const have = headsOf(s, p).length;
  const per = native ? HOUSEHOLDS.nativePer : HOUSEHOLDS.per;
  const owed = t.owed[p] ?? 0;
  let come: boolean;
  if (have >= room) {
    // Full: the town still sees comings and goings (one moves on in its turn).
    t.owed[p] = Math.min(owed, per);
    come = r.chance(turnoverOf(room));
  } else if (owed >= per) {
    t.owed[p] = owed - per;
    come = true;
  } else come = r.chance(DRIFT_IN * (room - have));
  if (!come) return;
  // A town short of one sex free to marry sees more of them come.
  const f = folkOfNation(owner);
  const people = householdsOf(s, p).filter((c) => sameFolk(s, c, f));
  const short = {
    w: !people.some((c) => c.female && marriageable(s, c)),
    m: !people.some((c) => !c.female && marriageable(s, c)),
  };
  arrive(g, p, r, f, pickKind(r, native, short));
}

function arrive(
  g: ConquestGame,
  p: number,
  r: Rng,
  f: Folk,
  kind: ArrivalKind,
  young = false,
): Character {
  const w = whence(g, r, p, f);
  const h = household(g, r, p, f, kind, young);
  settleIn(g, p, h.head, h.folk, w.how, w.from, h.as);
  return h.head;
}

/** Whether any of a household is someone a player is bound up with. */
function tiedToPlayers(g: ConquestGame, ids: number[]): boolean {
  const s = g.s;
  const set = new Set(ids);
  for (const life of s.lives) {
    const me = meOf(s, life);
    if (set.has(life.c)) return true;
    for (const id of ids)
      if (life.ties[id] || life.job?.employer === id) return true;
    if (!me) continue;
    if (set.has(me.spouse) || set.has(me.father) || set.has(me.mother))
      return true;
    if (me.children.some((k) => set.has(k))) return true;
  }
  for (const b of s.intrigue?.betrothals ?? [])
    if (set.has(b.a) || set.has(b.b)) return true;
  return false;
}

function familyOf(
  s: ConquestGame["s"],
  head: Character,
  p: number,
): Character[] {
  const out = [head];
  const sp = s.chars[head.spouse];
  if (sp?.alive && (sp.home === undefined || sp.home === p)) out.push(sp);
  for (const k of head.children) {
    const kid = s.chars[k];
    if (kid?.alive && !kid.abroad && kid.home === p && kid.spouse < 0)
      out.push(kid);
  }
  return out;
}

/** A town with more households than it holds: one moves on (the longest come, never the last of a sex free to marry). */
function departures(g: ConquestGame, p: number, r: Rng): void {
  const s = g.s;
  const room = householdRoom(s, p);
  const heads = headsOf(s, p);
  if (heads.length <= room + HOUSEHOLDS.over) return;
  if (!r.chance(0.5)) return;
  const owner = s.provinces[p].owner;
  const people = householdsOf(s, p);
  const free = (female: boolean) =>
    people.filter((c) => c.female === female && marriageable(s, c)).length;
  const goers = heads
    .filter(
      (c) =>
        c.came &&
        c.came.how !== "widow" &&
        c.came.how !== "grown" &&
        s.day - c.came.day >= HOUSEHOLDS.stay,
    )
    .sort((a, b) => (a.came?.day ?? 0) - (b.came?.day ?? 0) || a.id - b.id);
  for (const head of goers) {
    const fam = familyOf(s, head, p);
    if (
      tiedToPlayers(
        g,
        fam.map((c) => c.id),
      )
    )
      continue;
    const takes = (female: boolean) =>
      fam.filter((c) => c.female === female && marriageable(s, c)).length;
    if (
      (takes(true) && takes(true) >= free(true)) ||
      (takes(false) && takes(false) >= free(false))
    )
      continue;
    const to = townsOfNation(g, owner, p)[0];
    leave(g, p, head, fam, to);
    return;
  }
}

/** A household leaves a town (for another, or out of the story). */
export function leave(
  g: ConquestGame,
  p: number,
  head: Character,
  fam: Character[],
  to: number | undefined,
  why = "",
): void {
  const s = g.s;
  s.locals[p] = (s.locals[p] ?? []).filter((id) => id !== head.id);
  g.localsChanged(p);
  for (const c of fam) g.touchChar(c).home = to;
  // Whoever held a post here gives it up; the post is filled again in its turn.
  const post = head.role ? ROLES[head.role].title.toLowerCase() : "";
  if (head.role) g.touchChar(head).role = undefined;
  const native = isNativeChar(s, head);
  const where = to !== undefined ? g.map.provinces[to].name : "parts unknown";
  const who = native
    ? head.first
    : fam.length > 1
      ? `The ${head.family}${head.family.endsWith("s") ? "es" : "s"}`
      : charName(head);
  const text = `${who}${post ? ` (the ${post})` : ""} ${fam.length > 1 ? "have" : "has"} gone to ${where}${why}.`;
  const t = townsState(g);
  const kept = (t.came[p] ??= []);
  kept.push({
    day: s.day,
    c: head.id,
    folk: fam.map((c) => c.id),
    how: head.came?.how ?? "road",
    text,
    gone: true,
  });
  if (kept.length > KEPT_ARRIVALS) kept.splice(0, kept.length - KEPT_ARRIVALS);
  townsChanged(g);
  // A town of theirs that's known takes them in, if it has room.
  if (
    to !== undefined &&
    s.locals[to] &&
    headsOf(s, to).length < householdRoom(s, to)
  ) {
    s.locals[to].push(head.id);
    g.localsChanged(to);
    const was = post ? `once the ${post} at ${g.map.provinces[p].name}` : "";
    const as = head.came?.as;
    head.came = {
      day: s.day,
      how: "road",
      from: g.map.provinces[p].name,
      as: as !== undefined && as !== "" ? as : was,
    };
  }
}

/** Native towns: now and then a young man of the nation comes to marry a woman here, or goes to one. */
function marriesBetween(g: ConquestGame, p: number, r: Rng): void {
  const s = g.s;
  if (!r.chance(MARRY_BETWEEN / 12)) return;
  const owner = s.nations[s.provinces[p].owner];
  const f = folkOfNation(owner);
  const here = householdsOf(s, p).filter(
    (c) => marriageable(s, c) && sameFolk(s, c, f),
  );
  // The husband comes to live in his wife's town, among her mother's clan.
  const bride = here.find((c) => c.female);
  if (!bride) return;
  const from = townsOfNation(g, owner.id, p)[0];
  let groom: Character | undefined;
  if (from !== undefined && s.locals[from]) {
    groom = householdsOf(s, from).find(
      (c) =>
        !c.female &&
        !c.role &&
        marriageable(s, c) &&
        sameFolk(s, c, f) &&
        !(s.locals[from] ?? []).includes(c.id) &&
        !tiedToPlayers(g, [c.id]),
    );
    if (groom) g.touchChar(groom).home = p;
  }
  groom ??= person(
    g,
    r,
    p,
    f,
    false,
    Math.max(18, ageOf(s, bride) + r.int(-2, 6)),
  );
  marry(s, g.touchChar(groom), g.touchChar(bride));
  groom.home = p;
  const town = from !== undefined ? g.map.provinces[from].name : "another town";
  groom.came = {
    day: s.day,
    how: "marry",
    from: town,
    as: "married into the town",
  };
  const text = `From ${town}, to marry: ${groom.first} comes to live among ${bride.first}'s clan.`;
  const t = townsState(g);
  const kept = (t.came[p] ??= []);
  kept.push({ day: s.day, c: groom.id, folk: [groom.id], how: "marry", text });
  if (kept.length > KEPT_ARRIVALS) kept.splice(0, kept.length - KEPT_ARRIVALS);
  townsChanged(g);
  for (const life of s.lives)
    if (life.c >= 0 && life.home === p && meOf(s, life)?.alive)
      journal(g, life, text, undefined, false);
}

// ---------------------------------------------------------------- nobody stuck

function dryMarket(g: ConquestGame, p: number, r: Rng): void {
  const s = g.s;
  const t = townsState(g);
  const owner = s.nations[s.provinces[p].owner];
  const f = folkOfNation(owner);
  const people = householdsOf(s, p).filter((c) => sameFolk(s, c, f));
  const dry = (t.dry[p] ??= {});
  for (const female of [true, false]) {
    const k = female ? "w" : "m";
    if (people.some((c) => c.female === female && marriageable(s, c))) {
      delete dry[k];
      continue;
    }
    dry[k] ??= s.day;
    if (s.day - dry[k]! < dryDays(p, female)) continue;
    remedy(g, p, r, female, f);
    dry[k] = s.day;
  }
  if (!dry.w && !dry.m) delete t.dry[p];
}

/** A player living at home here with nobody they could court: someone of their own people comes. */
function lonelyPlayers(g: ConquestGame, r: Rng): void {
  const s = g.s;
  const t = townsState(g);
  for (const life of s.lives) {
    const me = meOf(s, life);
    const stop = () => delete t.lonely[life.seat];
    if (!me?.alive || life.watching || me.spouse >= 0) {
      stop();
      continue;
    }
    if (
      ageOf(s, me) < 18 ||
      life.travel ||
      life.prov !== life.home ||
      !s.locals[life.home]
    )
      continue;
    if (
      (s.intrigue?.betrothals ?? []).some(
        (b) =>
          (b.a === me.id || b.b === me.id) &&
          (b.status === "promised" || b.status === "planned"),
      )
    ) {
      stop();
      continue;
    }
    const p = life.home;
    const pr = s.provinces[p];
    if (pr.owner < 0 || pr.occupier >= 0) continue;
    if (courtableHere(g, life, me).length) {
      stop();
      continue;
    }
    t.lonely[life.seat] ??= s.day;
    const seatKey = [...life.seat].reduce(
      (h, ch) => (h * 31 + ch.charCodeAt(0)) | 0,
      7,
    );
    if (s.day - t.lonely[life.seat] < dryDays(seatKey ^ p, !me.female))
      continue;
    // Their own people, where the town is of them (a colonist in a colonial town, one of the peoples among their nation).
    const ownerNative = s.nations[pr.owner].kind === "native";
    const f = folkOfChar(s, me);
    if (f.native !== ownerNative) continue;
    if (f.native && f.nation !== pr.owner) continue;
    remedy(g, p, r, !me.female, f);
    t.lonely[life.seat] = s.day;
  }
}

/** Who here a player could court now (the same gates as courting). */
export function courtableHere(
  g: ConquestGame,
  life: Life,
  me: Character,
): Character[] {
  const s = g.s;
  return peopleHere(s, life.prov, life).filter(
    (c) =>
      c.female !== me.female &&
      marriageable(s, c) &&
      isNativeChar(s, c) === isNativeChar(s, me) &&
      personCheck(s, life, c.id, "court", g.w).ok,
  );
}

/**
 * Someone free to marry, of a sex and a people, comes to a town: a grown
 * child of the town first, then a widow or a niece from another town of the
 * colony, then a household off a ship or down the road.
 */
function remedy(
  g: ConquestGame,
  p: number,
  r: Rng,
  female: boolean,
  f: Folk,
): void {
  if (ownHouseholds(g, p, female, f)) return;
  if (fromKin(g, p, female, f)) return;
  const kinds: ArrivalKind[] = female
    ? ["daughters", "woman", "widow"]
    : ["sons", "man", "widower"];
  arrive(g, p, r, f, kinds[r.int(0, kinds.length - 1)], true);
}

/** A single woman (or man) of another town of the colony comes to kin here. */
function fromKin(
  g: ConquestGame,
  p: number,
  female: boolean,
  f: Folk,
): boolean {
  const s = g.s;
  for (const q of townsOfNation(g, f.nation, p, 50)) {
    if (!s.locals[q]) continue;
    const there = householdsOf(s, q).filter(
      (c) =>
        c.female === female &&
        !c.role &&
        marriageable(s, c) &&
        sameFolk(s, c, f) &&
        !tiedToPlayers(g, [c.id]),
    );
    // Never the last one there.
    if (there.length < 2) continue;
    const c = there[0];
    const kids = c.children
      .map((k) => s.chars[k])
      .filter(
        (k): k is Character =>
          !!k?.alive && !k.abroad && k.home === q && ageOf(s, k) < 16,
      );
    const wasHead = (s.locals[q] ?? []).includes(c.id);
    if (wasHead) {
      s.locals[q] = s.locals[q].filter((id) => id !== c.id);
      g.localsChanged(q);
    }
    const widow = c.children.length > 0;
    const as = widow
      ? c.female
        ? "a widow"
        : "a widower"
      : c.female
        ? "come to her aunt's"
        : "come to his uncle's";
    settleIn(g, p, c, [c, ...kids], "kin", g.map.provinces[q].name, as);
    return true;
  }
  return false;
}
