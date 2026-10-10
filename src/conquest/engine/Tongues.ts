// Tongues. Every people speaks its own: English, French, Spanish, Dutch,
// Swedish, Portuguese and German over the water; the great native families
// here (Algonquian, Iroquoian, Muskogean, Siouan, Nahuatl, Mayan and more);
// and the trade jargons people made to get by (Mobilian on the Gulf, the
// Delaware jargon on the middle rivers, the Basque whalers' pidgin up the St
// Lawrence). Characters know tongues at four levels. Across a barrier, talk
// goes badly or not at all; an interpreter helps; and you learn by living
// among speakers, from a tutor or a grammar, and by talking with people,
// faster the more Learning you have.

import { stat, yearOf } from "./Queries";
import { hash01 } from "./SocietyCore";
import type {
  Character,
  GameState,
  Life,
  MapDef,
  TongueId,
  TongueLevel,
} from "./Types";

export interface TongueDef {
  name: string;
  /** Kin tongues share a family: a speaker of one catches a little of another. */
  family: string;
  native: boolean;
  pidgin?: boolean;
  text: string;
  /** Years it was in use (a jargon comes and goes). */
  from?: number;
  until?: number;
}

export const TONGUES: Record<TongueId, TongueDef> = {
  english: {
    name: "English",
    family: "germanic",
    native: false,
    text: "The tongue of the Chesapeake, New England and, given time, a great deal else.",
  },
  dutch: {
    name: "Dutch",
    family: "germanic",
    native: false,
    text: "Spoken on the Hudson long after the flag changes; the tongue of trade in half the ports of the world.",
  },
  german: {
    name: "German",
    family: "germanic",
    native: false,
    text: "Palatines, Moravians and Pennsylvania farmers. Close enough to Dutch to argue in.",
  },
  swedish: {
    name: "Swedish",
    family: "germanic",
    native: false,
    text: "New Sweden's tongue, on the Delaware: Swedes, Finns, and their Lenape neighbours' jokes about them.",
  },
  french: {
    name: "French",
    family: "romance",
    native: false,
    text: "Quebec, Acadia and Louisiana; the tongue of diplomacy and of the coureurs de bois.",
  },
  spanish: {
    name: "Spanish",
    family: "romance",
    native: false,
    text: "From Florida to New Mexico and all New Spain: the oldest European tongue in the Americas.",
  },
  portuguese: {
    name: "Portuguese",
    family: "romance",
    native: false,
    text: "Brazil's tongue, and the sailors'. A Spaniard follows most of it and pretends to follow the rest.",
  },
  // ---- trade jargons
  mobilian: {
    name: "Mobilian Jargon",
    family: "pidgin",
    native: true,
    pidgin: true,
    from: 1650,
    text: "The trade tongue of the Gulf and the lower Mississippi: Choctaw and Chickasaw words, everybody's grammar.",
  },
  delaware: {
    name: "Delaware trade jargon",
    family: "pidgin",
    native: true,
    pidgin: true,
    from: 1615,
    until: 1730,
    text: "A pidgin of Lenape words the Dutch, Swedes and English used on the Delaware and the Hudson.",
  },
  basque: {
    name: "The Basque pidgin",
    family: "pidgin",
    native: true,
    pidgin: true,
    until: 1700,
    text: "Whalers' and fishers' talk of the St Lawrence gulf: Basque, Mi'kmaq and Innu words in a heap.",
  },
  // ---- native tongues
  coastal: {
    name: "Algonquian (the coast)",
    family: "algonquian",
    native: true,
    text: "Powhatan, Lenape, Massachusett, Narragansett, Abenaki, Mi'kmaq: kin tongues along the Atlantic shore.",
  },
  lakes: {
    name: "Algonquian (the lakes and plains)",
    family: "algonquian",
    native: true,
    text: "Anishinaabe, Cree, Innu, Illinois and Blackfoot: the tongues of the great lakes, the north woods and the plains.",
  },
  iroquoian: {
    name: "Iroquoian",
    family: "iroquoian",
    native: true,
    text: "The Five Nations, the Wendat, the Neutrals, the Erie and the Susquehannock: kin tongues of the longhouse.",
  },
  cherokee: {
    name: "Cherokee",
    family: "iroquoian",
    native: true,
    text: "The southern cousin of the Iroquoian tongues, spoken in the mountains.",
  },
  muskogean: {
    name: "Muskogean",
    family: "muskogean",
    native: true,
    text: "Muscogee, Choctaw and Chickasaw: the tongues of the southern towns and their square grounds.",
  },
  natchez: {
    name: "Natchez",
    family: "natchez",
    native: true,
    text: "A tongue like no other, spoken around the Great Sun's mound.",
  },
  timucuan: {
    name: "Timucuan",
    family: "timucuan",
    native: true,
    text: "Timucua and Calusa: the tongues of Florida before the missions.",
  },
  siouan: {
    name: "Siouan",
    family: "siouan",
    native: true,
    text: "Dakota, Lakota, Osage: from the upper Mississippi out onto the plains.",
  },
  caddoan: {
    name: "Caddoan",
    family: "caddoan",
    native: true,
    text: "The Caddo and the Pawnee: farming towns of the southern and central plains.",
  },
  athabaskan: {
    name: "Athabaskan",
    family: "nadene",
    native: true,
    text: "Apache and Diné: the tongues of the southwest's high country.",
  },
  tlingit: {
    name: "Tlingit",
    family: "nadene",
    native: true,
    text: "The tongue of the far northwest coast, of cedar houses and great canoes.",
  },
  puebloan: {
    name: "Puebloan",
    family: "puebloan",
    native: true,
    text: "Keres, Tewa, Tiwa and Zuni: the tongues of the pueblos on the Rio Grande.",
  },
  numic: {
    name: "Numic",
    family: "utoaztecan",
    native: true,
    text: "The Shoshone tongue of the basin and the mountains, a far cousin of Nahuatl.",
  },
  nahuatl: {
    name: "Nahuatl",
    family: "utoaztecan",
    native: true,
    text: "The tongue of the Mexica and of half New Spain's markets; the friars wrote grammars of it.",
  },
  purepecha: {
    name: "Purépecha",
    family: "purepecha",
    native: true,
    text: "The tongue of Michoacán, kin to nothing else.",
  },
  zapotec: {
    name: "Zapotec",
    family: "otomanguean",
    native: true,
    text: "The cloud people's tongue, of the valleys of Oaxaca.",
  },
  mayan: {
    name: "Mayan",
    family: "mayan",
    native: true,
    text: "Yucatec, Itzá and K'iche': the tongues of the old cities and the highlands.",
  },
  miskito: {
    name: "Miskito",
    family: "misumalpan",
    native: true,
    text: "The tongue of the Mosquito Coast, salted with English from the logwood cutters.",
  },
  kalinago: {
    name: "Kalinago",
    family: "arawakan",
    native: true,
    text: "The Island Carib tongue of the Lesser Antilles: the men and the women speak it differently.",
  },
  salishan: {
    name: "Salishan",
    family: "salishan",
    native: true,
    text: "The tongues of the Salish Sea and its rivers of salmon.",
  },
  chumash: {
    name: "Chumash",
    family: "chumash",
    native: true,
    text: "The tongue of the plank-canoe people of the California shore.",
  },
};

export const TONGUE_IDS = Object.keys(TONGUES) as TongueId[];

export const LEVEL_NAMES = [
  "none",
  "a few words",
  "conversational",
  "fluent",
] as const;

/** Points a level takes (each level is another hundred). */
export const LEVEL_POINTS = 100;

/** Each people's own tongue. */
const MOTHER: Record<string, TongueId> = {
  english: "english",
  french: "french",
  spanish: "spanish",
  dutch: "dutch",
  swedish: "swedish",
  portuguese: "portuguese",
  german: "german",
  powhatan: "coastal",
  lenape: "coastal",
  wampanoag: "coastal",
  narragansett: "coastal",
  wabanaki: "coastal",
  mikmaq: "coastal",
  anishinaabe: "lakes",
  cree: "lakes",
  innu: "lakes",
  illinois: "lakes",
  blackfoot: "lakes",
  haudenosaunee: "iroquoian",
  wendat: "iroquoian",
  attawandaron: "iroquoian",
  erie: "iroquoian",
  susquehannock: "iroquoian",
  cherokee: "cherokee",
  muscogee: "muskogean",
  choctaw: "muskogean",
  chickasaw: "muskogean",
  natchez: "natchez",
  timucua: "timucuan",
  calusa: "timucuan",
  oceti: "siouan",
  osage: "siouan",
  caddo: "caddoan",
  pawnee: "caddoan",
  apache: "athabaskan",
  dine: "athabaskan",
  tlingit: "tlingit",
  pueblo: "puebloan",
  shoshone: "numic",
  mexica: "nahuatl",
  chichimeca: "nahuatl",
  purepecha: "purepecha",
  zapotec: "zapotec",
  maya: "mayan",
  itza: "mayan",
  kiche: "mayan",
  miskito: "miskito",
  kalinago: "kalinago",
  salish: "salishan",
  chumash: "chumash",
};

/** Peoples among whom a jargon was in everyday use. */
const JARGON: Record<TongueId, string[]> = {
  mobilian: ["choctaw", "chickasaw", "muscogee", "natchez", "caddo"],
  delaware: ["lenape", "susquehannock"],
  basque: ["mikmaq", "innu"],
};

/** Colonists who'd pick up a jargon from their neighbours. */
const JARGON_COLONISTS: Record<TongueId, string[]> = {
  mobilian: ["french", "spanish"],
  delaware: ["dutch", "swedish"],
  basque: ["french"],
};

export function motherTongue(culture: string): TongueId {
  return MOTHER[culture] ?? "english";
}

export function tongueName(t: TongueId): string {
  return TONGUES[t]?.name ?? t;
}

export function levelOf(points: number): TongueLevel {
  return points >= 3 * LEVEL_POINTS
    ? 3
    : points >= 2 * LEVEL_POINTS
      ? 2
      : points >= LEVEL_POINTS
        ? 1
        : 0;
}

function inUse(s: GameState, t: TongueId): boolean {
  const def = TONGUES[t];
  const y = yearOf(s);
  return !!def && (def.from ?? 0) <= y && y <= (def.until ?? 9999);
}

// ---------------------------------------------------------------- who knows what

/** Caches, per game (a server runs many, and ids repeat between them). */
const npcCaches = new WeakMap<
  GameState,
  Map<string, Record<TongueId, TongueLevel>>
>();
const talkCaches = new WeakMap<GameState, Map<string, TalkView>>();

function cacheOf<T>(
  m: WeakMap<GameState, Map<string, T>>,
  s: GameState,
): Map<string, T> {
  let c = m.get(s);
  if (!c) m.set(s, (c = new Map()));
  if (c.size > 6000) c.clear();
  return c;
}

/** The peoples next door to a province (their own, and its neighbours'). */
function neighbourCultures(s: GameState, map: MapDef, p: number): string[] {
  const out = new Set<string>();
  const add = (q: number) => {
    const o = s.provinces[q]?.owner ?? -1;
    if (o >= 0 && s.nations[o]?.alive) out.add(s.nations[o].culture);
  };
  add(p);
  for (const [q] of map.provinces[p]?.nb ?? []) add(q);
  return [...out];
}

function homeOf(s: GameState, c: Character): number {
  return c.home ?? s.nations[c.nation]?.capital ?? -1;
}

/** Roles whose people have reason to speak with strangers. */
const GO_BETWEENS = new Set([
  "trader",
  "merchant",
  "captain",
  "sachem",
  "elder",
  "innkeeper",
  "official",
]);

/**
 * What tongues someone not played knows: their people's, fluently, and the
 * plausible extras (a trader the neighbours' tongue, a missionary the
 * people he preaches to, the Gulf towns Mobilian).
 */
export function npcTongues(
  s: GameState,
  map: MapDef,
  c: Character,
): Record<TongueId, TongueLevel> {
  const p = homeOf(s, c);
  const near = p >= 0 ? neighbourCultures(s, map, p) : [];
  const key = `${c.id}|${c.culture}|${c.role ?? ""}|${p}|${near.join(",")}|${yearOf(s) >= 1650 ? 1 : 0}${yearOf(s) >= 1700 ? 1 : 0}`;
  const npcCache = cacheOf(npcCaches, s);
  const hit = npcCache.get(key);
  if (hit) return hit;
  const out: Record<TongueId, TongueLevel> = {};
  const set = (t: TongueId, lvl: TongueLevel) => {
    if ((out[t] ?? 0) < lvl) out[t] = lvl;
  };
  const mine = motherTongue(c.culture);
  set(mine, 3);
  const native = TONGUES[mine]?.native ?? false;
  const role = c.role ?? "";
  const go = GO_BETWEENS.has(role);
  const r = (salt: number) => hash01(c.id, salt);
  for (const culture of near) {
    const t = motherTongue(culture);
    if (t === mine) continue;
    const other = TONGUES[t];
    if (!other) continue;
    if (go) set(t, r(t.length) < 0.6 ? 2 : 1);
    else if (role === "preacher" && native !== other.native && other.native)
      // Missionaries learned the tongues of the people they preached to.
      set(t, c.religion === "catholic" ? 2 : 1);
    else if (r(t.charCodeAt(0)) < 0.18) set(t, 1);
  }
  for (const [j, peoples] of Object.entries(JARGON)) {
    if (!inUse(s, j)) continue;
    if (peoples.includes(c.culture)) set(j, 2);
    else if (
      JARGON_COLONISTS[j]?.includes(c.culture) &&
      near.some((x) => peoples.includes(x))
    )
      set(j, go ? 2 : r(j.length + 7) < 0.3 ? 1 : 0);
  }
  if (!native && go && role !== "innkeeper")
    // Merchants and officials of one crown often read another's.
    set(
      mine === "english" ? "french" : mine === "french" ? "english" : "french",
      r(99) < 0.5 ? 1 : 0,
    );
  npcCache.set(key, out);
  return out;
}

/** The second tongue an educated European would have a little of. */
const LINGUA: Record<TongueId, TongueId> = {
  english: "french",
  french: "english",
  spanish: "french",
  portuguese: "spanish",
  dutch: "english",
  swedish: "german",
  german: "french",
};

const EDUCATED = ["gentry", "lawyer", "physician", "clerk", "preacher"];

/** Points a played character starts with: their people's tongue, and what their upbringing taught. */
export function baseTongues(
  s: GameState,
  map: MapDef,
  life: Life,
): Record<TongueId, number> {
  const me = s.chars[life.c];
  if (!me) return {};
  const out: Record<TongueId, number> = {};
  // Taken over from the world: what they knew.
  if (!me.made && life.line[0] !== me.id) {
    for (const [t, lvl] of Object.entries(npcTongues(s, map, me)))
      out[t] = lvl * LEVEL_POINTS;
  }
  const mine = motherTongue(me.culture);
  out[mine] = 3 * LEVEL_POINTS;
  const near = neighbourCultures(s, map, life.home);
  const first = near
    .map(motherTongue)
    .find((t) => t !== mine && TONGUES[t]?.native !== TONGUES[mine]?.native);
  const bg = life.background;
  // Traders and go-betweens grow up with a second tongue.
  if (first && (bg === "trader" || bg === "trapper" || bg === "speaker"))
    out[first] = Math.max(out[first] ?? 0, 2 * LEVEL_POINTS);
  else if (first && (bg === "preacher" || bg === "sailor" || bg === "healer"))
    out[first] = Math.max(out[first] ?? 0, LEVEL_POINTS);
  // The educated have a little of the other great tongue of Europe.
  const lingua = LINGUA[mine];
  if (lingua && (EDUCATED.includes(bg) || me.traits.includes("educated")))
    out[lingua] = Math.max(out[lingua] ?? 0, LEVEL_POINTS + 20);
  for (const [j, peoples] of Object.entries(JARGON)) {
    if (!inUse(s, j)) continue;
    if (peoples.includes(me.culture)) out[j] = Math.max(out[j] ?? 0, 200);
    else if (
      (bg === "trader" || bg === "trapper") &&
      near.some((x) => peoples.includes(x))
    )
      out[j] = Math.max(out[j] ?? 0, 150);
  }
  // A child of a mixed house hears both parents' tongues.
  for (const pid of [me.father, me.mother]) {
    const par = s.chars[pid];
    if (!par) continue;
    const t = motherTongue(par.culture);
    out[t] = Math.max(out[t] ?? 0, 2 * LEVEL_POINTS);
  }
  return out;
}

/** A played character's points in each tongue: what they began with and what they've learned. */
export function lifeTonguePoints(
  s: GameState,
  map: MapDef,
  life: Life,
): Record<TongueId, number> {
  const base = baseTongues(s, map, life);
  if (life.tongues && life.tongues.c === life.c)
    for (const [t, v] of Object.entries(life.tongues.pts))
      base[t] = Math.max(base[t] ?? 0, v);
  return base;
}

/** Levels a character knows, played or not. */
export function tonguesOf(
  s: GameState,
  map: MapDef,
  c: Character,
): Record<TongueId, TongueLevel> {
  const life = s.lives.find((l) => l.c === c.id);
  if (!life) return npcTongues(s, map, c);
  const out: Record<TongueId, TongueLevel> = {};
  for (const [t, v] of Object.entries(lifeTonguePoints(s, map, life))) {
    const lvl = levelOf(v);
    if (lvl > 0) out[t] = lvl;
  }
  return out;
}

export function knows(
  s: GameState,
  map: MapDef,
  c: Character,
  t: TongueId,
): TongueLevel {
  return tonguesOf(s, map, c)[t] ?? 0;
}

/** The tongue most spoken in a province: its owner's (or the nearest people's). */
export function provinceTongue(
  s: GameState,
  map: MapDef,
  p: number,
): TongueId | null {
  const o = s.provinces[p]?.owner ?? -1;
  if (o >= 0) return motherTongue(s.nations[o].culture);
  const near = neighbourCultures(s, map, p);
  return near.length ? motherTongue(near[0]) : null;
}

// ---------------------------------------------------------------- talking

export interface TalkView {
  /** How well the two of you can talk: 0 not at all, 3 freely. */
  level: TongueLevel;
  /** The tongue you'd use. */
  tongue: TongueId;
  /** Through an interpreter (a character id), or -1. */
  via: number;
  /** Their own tongue (what you'd learn by talking with them). */
  theirs: TongueId;
}

/** Kin tongues: a speaker of one catches a little of the other. */
function kin(a: TongueId, b: TongueId): TongueLevel {
  if (a === b) return 3;
  const pair = [a, b].sort().join("|");
  if (pair === "portuguese|spanish") return 2;
  if (pair === "dutch|german") return 1;
  const fa = TONGUES[a]?.family;
  const fb = TONGUES[b]?.family;
  return fa && fa === fb && fa !== "pidgin" ? 1 : 0;
}

/** The best two people can do between them, without help. */
export function sharedLevel(
  a: Record<TongueId, TongueLevel>,
  b: Record<TongueId, TongueLevel>,
): { level: TongueLevel; tongue: TongueId | null } {
  let best: TongueLevel = 0;
  let tongue: TongueId | null = null;
  for (const [t, la] of Object.entries(a)) {
    const lb = b[t] ?? 0;
    const lvl = Math.min(la, lb) as TongueLevel;
    if (lvl > best) {
      best = lvl;
      tongue = t;
    }
  }
  if (best < 1)
    for (const [ta, la] of Object.entries(a)) {
      if (la < 3) continue;
      for (const [tb, lb] of Object.entries(b)) {
        if (lb < 3) continue;
        const k = kin(ta, tb);
        if (k > best) {
          best = k;
          tongue = ta;
        }
      }
    }
  return { level: best, tongue };
}

/** Whether you and someone can talk, and in what (an interpreter if one's about). */
export function talkWith(
  s: GameState,
  map: MapDef,
  life: Life,
  c: Character,
  around?: () => Character[],
): TalkView {
  const me = s.chars[life.c];
  const theirs = motherTongue(c.culture);
  if (!me) return { level: 3, tongue: theirs, via: -1, theirs };
  const pts = life.tongues?.c === life.c ? life.tongues.pts : null;
  const key = `${life.c}|${c.id}|${life.prov}|${s.day}|${around ? 1 : 0}|${pts ? Object.values(pts).join(",") : ""}`;
  const talkCache = cacheOf(talkCaches, s);
  const hit = talkCache.get(key);
  if (hit) return hit;
  const mine = tonguesOf(s, map, me);
  const yours = tonguesOf(s, map, c);
  const { level, tongue } = sharedLevel(mine, yours);
  let view: TalkView = {
    level,
    tongue: tongue ?? motherTongue(me.culture),
    via: -1,
    theirs,
  };
  if (level < 2 && around) {
    // Someone here who speaks with both of you.
    for (const x of around()) {
      if (x.id === c.id || x.id === me.id) continue;
      const xs = tonguesOf(s, map, x);
      const withMe = sharedLevel(mine, xs).level;
      const withThem = sharedLevel(xs, yours).level;
      if (withMe >= 2 && withThem >= 2) {
        view = { level: 2, tongue: view.tongue, via: x.id, theirs };
        break;
      }
    }
  }
  talkCache.set(key, view);
  return view;
}

// ---------------------------------------------------------------- learning

/** How much a conversation (or a month, a lesson, a book) teaches, by your Learning. */
export function learnRate(s: GameState, life: Life): number {
  const me = s.chars[life.c];
  const lea = me ? stat(s, me, "lea") : 5;
  return 1 + Math.max(0, lea - 3) * 0.22;
}

/** Points of progress, slower as you get better. */
export function learnGain(points: number, base: number, rate: number): number {
  const lvl = levelOf(points);
  const slow = [1, 0.7, 0.45, 0][lvl];
  return Math.round(base * rate * slow * 10) / 10;
}

/** Grammars and dictionaries a colony's printers or booksellers might have. */
export interface BookDef {
  tongue: TongueId;
  title: string;
  from: number;
  /** The peoples whose towns sell it. */
  sold: string[];
  cost: number;
}

export const BOOKS: BookDef[] = [
  {
    tongue: "english",
    title: "A New English Grammar",
    from: 1607,
    sold: ["english", "dutch", "french", "swedish"],
    cost: 5,
  },
  {
    tongue: "french",
    title: "A French grammar and dictionary",
    from: 1607,
    sold: ["french", "english", "dutch"],
    cost: 5,
  },
  {
    tongue: "spanish",
    title: "Minsheu's Spanish grammar",
    from: 1607,
    sold: ["spanish", "english", "french"],
    cost: 6,
  },
  {
    tongue: "dutch",
    title: "Hexham's English and Netherdutch dictionary",
    from: 1647,
    sold: ["dutch", "english"],
    cost: 6,
  },
  {
    tongue: "portuguese",
    title: "A Portuguese grammar",
    from: 1607,
    sold: ["spanish", "portuguese"],
    cost: 6,
  },
  {
    tongue: "coastal",
    title: "Roger Williams' A Key into the Language of America",
    from: 1643,
    sold: ["english"],
    cost: 4,
  },
  {
    tongue: "iroquoian",
    title: "The Jesuits' notes on the Huron tongue",
    from: 1636,
    sold: ["french"],
    cost: 4,
  },
  {
    tongue: "lakes",
    title: "A missionary's Algonquin vocabulary",
    from: 1661,
    sold: ["french"],
    cost: 4,
  },
  {
    tongue: "nahuatl",
    title: "Molina's Vocabulario en lengua mexicana",
    from: 1607,
    sold: ["spanish"],
    cost: 7,
  },
  {
    tongue: "mayan",
    title: "Coronel's Arte en lengua de Maya",
    from: 1620,
    sold: ["spanish"],
    cost: 7,
  },
  {
    tongue: "puebloan",
    title: "A friar's word-list of the pueblo tongues",
    from: 1630,
    sold: ["spanish"],
    cost: 5,
  },
];

/** Books only take you so far: past conversational you need people. */
export const BOOK_CAP = 2 * LEVEL_POINTS;
export const BOOK_POINTS = 55;
export const BOOK_COOLDOWN = 60;
/** A lesson with a tutor: the fee, and the points it's worth. */
export const LESSON_FEE = 4;
export const LESSON_POINTS = 45;
/** A conversation's worth, before Learning. */
export const TALK_POINTS = 12;
/** A month living among speakers. */
export const LIVING_POINTS = 10;

/** The books you could buy here. */
export function booksHere(s: GameState, p: number): BookDef[] {
  const o = s.provinces[p]?.owner ?? -1;
  const n = o >= 0 ? s.nations[o] : undefined;
  if (!n || n.kind !== "power") return [];
  const y = yearOf(s);
  return BOOKS.filter((b) => b.from <= y && b.sold.includes(n.culture));
}
