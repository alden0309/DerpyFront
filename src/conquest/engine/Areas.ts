// Where everyone is. A province's places (the tavern, the church, the fort,
// the council fire...) and your own home are areas you can go into, and each
// has the people in it right now: the innkeeper behind the bar and whoever's
// drinking, the minister at the pulpit and on Sundays the whole town, the
// sergeant drilling the soldiers, the governor's people at the levee, a
// merchant passing through from Boston, another player having a pot of ale.
//
// Nothing here is stored. Who is where follows from who lives here, what
// they do, the day of the week and a roll of dice fixed by the person and
// the day, so the server and every browser agree without being told.

import { dateOf } from "./Calendar";
import { knowsDen } from "./CrimeQueries";
import {
  familyAtHome,
  isNativeChar,
  lifeOfChar,
  placesIn,
} from "./LifeQueries";
import { JOBS, PLACES, ROLES } from "./LifeRules";
import type { World } from "./Map";
import { ageOf, charName } from "./Queries";
import type { Character, GameState, Life, PlaceKind, Traveller } from "./Types";
import { SEATS } from "./Types";

export type PresentKind =
  | "work"
  | "leisure"
  | "worship"
  | "court"
  | "visitor"
  | "traveller"
  | "player"
  | "family"
  | "hand";

/** Someone in an area, and what they're doing there. */
export interface Present {
  c: number;
  doing: string;
  kind: PresentKind;
}

/** The areas of a province you can go into (your home, if it's here). */
export function areasOf(
  s: GameState,
  w: World,
  p: number,
  life?: Life | null,
): PlaceKind[] {
  // LIFE (r11): the den is only there for those who know it.
  const out = placesIn(s, w, p).filter(
    (pl) => pl !== "den" || (!!life && knowsDen(life, p)),
  );
  if (life && life.c >= 0 && !life.watching && life.home === p)
    out.push("home");
  return out;
}

/** What a place is called here (a market is a trading ground in a village). */
export function areaName(s: GameState, p: number, area: PlaceKind): string {
  const owner = s.provinces[p]?.owner ?? -1;
  const native = owner >= 0 && s.nations[owner]?.kind === "native";
  const def = PLACES[area];
  return native && def.nativeName ? def.nativeName : def.name;
}

/** A number in [0, 1), the same for the same person, day and question. */
export function dice(c: number, day: number, salt: number): number {
  let x = (Math.imul(c + 1, 374761393) + Math.imul(day, 668265263)) | 0;
  x = (x + Math.imul(salt + 7, 1274126177)) | 0;
  x = Math.imul(x ^ (x >>> 15), 2246822519);
  x = Math.imul(x ^ (x >>> 13), 3266489917);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/**
 * Which stretch of their routine someone is in. People keep to where they
 * go for some days at a time (three to seven, each their own, starting on
 * their own day), rather than everyone rolling afresh every morning: the
 * regulars stay regulars for a while, and a place's company changes a few
 * at a time.
 */
export function stintOf(c: number, day: number): number {
  const len = 3 + Math.floor(dice(c, 0, 91) * 5);
  const phase = Math.floor(dice(c, 0, 92) * len);
  return Math.floor((day + phase) / len);
}

function pick<T>(list: readonly T[], r: number): T {
  return list[Math.min(list.length - 1, Math.floor(r * list.length))];
}

const LEISURE: Partial<Record<PlaceKind, string[]>> = {
  tavern: [
    "drinking",
    "playing at cards",
    "arguing politics",
    "telling a long story",
    "nursing a pot of ale",
    "singing, badly",
    "reading the gazette aloud",
    "throwing dice",
  ],
  market: [
    "buying bread",
    "haggling over cloth",
    "selling eggs",
    "looking for a bargain",
    "gossiping at the pump",
  ],
  church: ["at prayer", "in the back pew", "talking with the sexton"],
  fields: ["at work in the fields", "weeding", "with the cattle"],
  village: [
    "at the cookfire",
    "pounding corn",
    "mending a net",
    "minding the children",
    "talking outside the lodge",
  ],
  councilfire: [
    "listening at the fire",
    "sharing the pipe",
    "waiting to speak",
  ],
  woods: ["out hunting", "gathering firewood", "checking snares"],
  docks: [
    "watching the ships",
    "waiting for a passage",
    "unloading barrels",
    "fishing off the quay",
  ],
  fort: ["at drill", "on sentry", "visiting the garrison"],
  governor: ["waiting to see the governor", "at the levee", "with a petition"],
  workshop: ["fetching timber", "watching the smith"],
  press: ["reading the news sheet", "with an advertisement to place"],
  apothecary: ["buying physic", "waiting to be bled"],
  home: ["at home", "by the fire", "with the children"],
};

const SUNDAY = ["at the sermon", "singing a psalm", "at prayer"];

/** Field work by the season. */
function fieldWork(day: number, r: number): string {
  const m = dateOf(day).month;
  if (m >= 3 && m <= 4)
    return pick(["planting", "ploughing", "sowing seed"], r);
  if (m >= 7 && m <= 9)
    return pick(["at the harvest", "cutting tobacco", "carting sheaves"], r);
  if (m === 11 || m <= 1)
    return pick(["mending fences", "clearing stumps", "threshing"], r);
  return pick(["hoeing", "weeding", "with the cattle"], r);
}

/** The first of these the province has (somewhere for anyone to be). */
function fallback(have: Set<PlaceKind>, ...want: PlaceKind[]): PlaceKind {
  for (const k of [
    ...want,
    "tavern",
    "village",
    "market",
    "councilfire",
  ] as PlaceKind[])
    if (have.has(k)) return k;
  return [...have][0] ?? "woods";
}

interface Spot {
  area: PlaceKind;
  doing: string;
  kind: PresentKind;
}

/** Where a local spends today: at work, in the tavern, at church, at home (null). */
function localRoutine(
  s: GameState,
  have: Set<PlaceKind>,
  c: Character,
  workAt: PlaceKind | null,
  doing: string[] | undefined,
  day: number,
  native: boolean,
): Spot | null {
  // Where they go keeps for a stretch; what they're doing there is the day's.
  const r = dice(c.id, stintOf(c.id, day), 1);
  const r2 = dice(c.id, day, 2);
  const sunday = ((day % 7) + 7) % 7 === 0;
  const age = ageOf(s, c);
  if (!native && sunday && have.has("church") && c.religion !== "native") {
    if (c.role === "preacher")
      return { area: "church", doing: "preaching the sermon", kind: "work" };
    if (r < 0.8)
      return { area: "church", doing: pick(SUNDAY, r2), kind: "worship" };
  }
  if (workAt && have.has(workAt)) {
    const drunk = c.traits.includes("drunkard");
    const atWork = c.role === "innkeeper" ? 0.95 : drunk ? 0.55 : 0.7;
    if (r < atWork) {
      const what =
        workAt === "fields" && !doing
          ? fieldWork(day, r2)
          : pick(doing ?? ["at work"], r2);
      return { area: workAt, doing: what, kind: "work" };
    }
    if (
      r < atWork + (drunk ? 0.3 : 0.12) &&
      have.has("tavern") &&
      c.role !== "preacher"
    )
      return {
        area: "tavern",
        doing: pick(LEISURE.tavern!, r2),
        kind: "leisure",
      };
    if (r < 0.9 && have.has("market"))
      return {
        area: "market",
        doing: pick(LEISURE.market!, r2),
        kind: "leisure",
      };
    return null;
  }
  // No trade of their own: family of the house, the young, the idle.
  if (native) {
    if (r < 0.35)
      return {
        area: fallback(have, "village"),
        doing: pick(LEISURE.village!, r2),
        kind: "leisure",
      };
    if (r < 0.6 && have.has("fields") && (c.female || age < 18))
      return {
        area: "fields",
        doing: pick(
          ["among the corn hills", "weeding the squash", "scaring crows"],
          r2,
        ),
        kind: "leisure",
      };
    if (r < 0.75 && have.has("woods") && !c.female)
      return {
        area: "woods",
        doing: pick(LEISURE.woods!, r2),
        kind: "leisure",
      };
    if (r < 0.85 && have.has("councilfire"))
      return {
        area: "councilfire",
        doing: pick(LEISURE.councilfire!, r2),
        kind: "leisure",
      };
    return null;
  }
  if (r < 0.28 && have.has("market"))
    return {
      area: "market",
      doing: pick(LEISURE.market!, r2),
      kind: "leisure",
    };
  if (r < 0.42 && age >= 18 && have.has("tavern") && !c.female)
    return {
      area: "tavern",
      doing: pick(LEISURE.tavern!, r2),
      kind: "leisure",
    };
  if (r < 0.5 && have.has("church"))
    return {
      area: "church",
      doing: pick(LEISURE.church!, r2),
      kind: "worship",
    };
  if (r < 0.62 && workAt === null && have.has("fields"))
    return { area: "fields", doing: fieldWork(day, r2), kind: "leisure" };
  return null;
}

const TRAVELLER_AREAS: Record<Traveller["kind"], PlaceKind[]> = {
  merchant: ["market", "market", "tavern"],
  trader: ["market", "village", "tavern"],
  preacher: ["church", "church", "market"],
  pedlar: ["market", "tavern"],
  official: ["governor", "governor", "tavern"],
  messenger: ["governor", "tavern"],
  family: ["tavern", "market"],
  drover: ["market", "fields", "tavern"],
  envoy: ["councilfire", "governor", "village"],
};

const TRAVELLER_DOING: Record<Traveller["kind"], string> = {
  merchant: "trading, from",
  trader: "trading, from",
  preacher: "preaching, from",
  pedlar: "selling ribbons and pins, from",
  official: "on the governor's business, from",
  messenger: "carrying letters, from",
  family: "passing through, from",
  drover: "driving cattle, from",
  envoy: "an envoy from",
};

/** Someone in the province's lists, and why they're here. */
interface Resident {
  c: Character;
  base:
    | "role"
    | "family"
    | "ruler"
    | "council"
    | "court"
    | "commander"
    | "traveller"
    | "player"
    | "mine"
    | "hand";
  /** Their place of work (role holders, hands), if any. */
  workAt?: PlaceKind;
  traveller?: Traveller;
  life?: Life;
}

/** Who is travelling just now (and so not at home). */
function awaySet(s: GameState): Map<number, Traveller> {
  const m = new Map<number, Traveller>();
  for (const t of s.travellers ?? []) m.set(t.c, t);
  return m;
}

function residents(
  s: GameState,
  w: World,
  p: number,
  life?: Life | null,
): Resident[] {
  const out: Resident[] = [];
  const seen = new Set<number>();
  const away = awaySet(s);
  const add = (c: Character | undefined, r: Omit<Resident, "c">) => {
    if (!c?.alive || c.abroad || seen.has(c.id)) return;
    if (life && c.id === life.c) return;
    const t = away.get(c.id);
    // On the road, or stopped somewhere else: not at home.
    if (t && r.base !== "traveller" && !(t.depart < 0 && t.prov === p)) return;
    seen.add(c.id);
    out.push({ c, ...r });
  };
  // Other players here.
  for (const l of s.lives) {
    if (l.c < 0 || l.watching || l.travel || l.prov !== p || l === life)
      continue;
    add(s.chars[l.c], { base: "player", life: l });
  }
  // Your own family, at home.
  if (life && life.c >= 0 && life.home === p)
    for (const c of familyAtHome(s, life))
      if (ageOf(s, c) >= 4) add(c, { base: "mine" });
  // Hired hands at players' businesses here.
  for (const l of s.lives)
    for (const pr of l.property ?? [])
      if (pr.prov === p && pr.kind === "business")
        for (const id of pr.hands)
          add(s.chars[id], { base: "hand", workAt: pr.place ?? "workshop" });
  // The court at a capital.
  for (const n of s.nations) {
    if (!n.alive || n.capital !== p || n.kind === "crown") continue;
    const ruler = s.chars[n.ruler];
    add(ruler, { base: "ruler" });
    for (const seat of SEATS)
      add(s.chars[n.council[seat]], { base: "council" });
    for (const id of n.court) add(s.chars[id], { base: "court" });
    if (ruler) {
      add(s.chars[ruler.spouse], { base: "family" });
      for (const k of ruler.children) {
        const kid = s.chars[k];
        if (kid && ageOf(s, kid) >= 14) add(kid, { base: "family" });
      }
    }
  }
  // Townsfolk and their households.
  for (const id of s.locals[p] ?? []) {
    const c = s.chars[id];
    if (!c) continue;
    const role = c.role ? ROLES[c.role] : undefined;
    add(c, { base: "role", workAt: role?.place });
    const sp = s.chars[c.spouse];
    if (sp && (sp.home === undefined || sp.home === p))
      add(sp, { base: "family", workAt: undefined });
    for (const k of c.children) {
      const kid = s.chars[k];
      if (
        kid &&
        (kid.home === undefined || kid.home === p) &&
        ageOf(s, kid) >= 14
      )
        add(kid, { base: "family" });
    }
  }
  // Commanders of armies standing here.
  for (const a of s.armies)
    if (a.prov === p && a.depart < 0 && a.commander >= 0)
      add(s.chars[a.commander], { base: "commander" });
  // Travellers stopping here.
  for (const t of s.travellers ?? [])
    if (t.depart < 0 && t.prov === p)
      add(s.chars[t.c], { base: "traveller", traveller: t });
  void w;
  return out;
}

/** Where a player is: where they went in, or somewhere sensible. */
export function playerArea(
  s: GameState,
  w: World,
  life: Life,
  have?: Set<PlaceKind>,
): PlaceKind {
  const places = have ?? new Set(areasOf(s, w, life.prov, life));
  if (life.area && places.has(life.area)) return life.area;
  if (life.job && life.job.prov === life.prov && places.has(life.job.place))
    return life.job.place;
  return fallback(places, "tavern", "village");
}

function spotFor(
  s: GameState,
  w: World,
  p: number,
  have: Set<PlaceKind>,
  r: Resident,
  day: number,
): Spot | null {
  const c = r.c;
  const native = isNativeChar(s, c);
  const d1 = dice(c.id, stintOf(c.id, day), 3);
  const d2 = dice(c.id, day, 4);
  const sunday = ((day % 7) + 7) % 7 === 0;
  switch (r.base) {
    case "player": {
      const area = playerArea(s, w, r.life!, have);
      return { area, doing: `played by ${r.life!.name}`, kind: "player" };
    }
    case "mine":
      if (d1 < 0.7 || !have.has("market"))
        return { area: "home", doing: pick(LEISURE.home!, d2), kind: "family" };
      return {
        area: "market",
        doing: pick(LEISURE.market!, d2),
        kind: "family",
      };
    case "hand":
      if (d1 < 0.8 && r.workAt && have.has(r.workAt))
        return {
          area: r.workAt,
          doing: "at work, your hired hand",
          kind: "hand",
        };
      return null;
    case "ruler": {
      const seat: PlaceKind = native ? "councilfire" : "governor";
      if (!native && sunday && have.has("church") && d1 < 0.7)
        return {
          area: "church",
          doing: "in the governor's pew",
          kind: "worship",
        };
      if (d1 < 0.85 && have.has(seat))
        return {
          area: seat,
          doing: native ? "presiding at the fire" : "holding court",
          kind: "court",
        };
      if (d1 < 0.92 && have.has("tavern"))
        return {
          area: "tavern",
          doing: "taking a glass with the gentlemen",
          kind: "visitor",
        };
      return null;
    }
    case "council":
    case "court": {
      const seat: PlaceKind = native ? "councilfire" : "governor";
      if (!native && sunday && have.has("church") && d1 < 0.75)
        return { area: "church", doing: pick(SUNDAY, d2), kind: "worship" };
      const at = r.base === "council" ? 0.55 : 0.4;
      if (d1 < at && have.has(seat))
        return {
          area: seat,
          doing: r.base === "council" ? "in council" : "at court",
          kind: "court",
        };
      if (d1 < at + 0.2 && have.has("tavern"))
        return {
          area: "tavern",
          doing: pick(LEISURE.tavern!, d2),
          kind: "visitor",
        };
      if (d1 < at + 0.35 && have.has("market"))
        return {
          area: "market",
          doing: pick(LEISURE.market!, d2),
          kind: "visitor",
        };
      return null;
    }
    case "commander": {
      const area = fallback(have, native ? "councilfire" : "fort");
      return { area, doing: "commanding the army here", kind: "work" };
    }
    case "traveller": {
      const t = r.traveller!;
      const choices = TRAVELLER_AREAS[t.kind].filter((k) => have.has(k));
      const area = choices.length ? pick(choices, d1) : fallback(have);
      const from = w.map.provinces[t.home]?.name ?? "afar";
      return {
        area,
        doing: `${TRAVELLER_DOING[t.kind]} ${from}`,
        kind: "traveller",
      };
    }
    case "role": {
      const role = c.role ? ROLES[c.role] : undefined;
      return localRoutine(
        s,
        have,
        c,
        r.workAt ?? null,
        role?.doing,
        day,
        native,
      );
    }
    case "family":
      return localRoutine(s, have, c, null, undefined, day, native);
  }
  void p;
  return null;
}

const KIND_ORDER: Record<PresentKind, number> = {
  player: 0,
  court: 1,
  work: 2,
  visitor: 3,
  traveller: 4,
  hand: 5,
  family: 6,
  worship: 7,
  leisure: 8,
};

/** Everyone in each area of a province today. */
export function presence(
  s: GameState,
  w: World,
  p: number,
  day: number = s.day,
  life?: Life | null,
): Map<PlaceKind, Present[]> {
  const list = areasOf(s, w, p, life);
  const have = new Set(list);
  const out = new Map<PlaceKind, Present[]>(list.map((k) => [k, []]));
  for (const r of residents(s, w, p, life)) {
    const spot = spotFor(s, w, p, have, r, day);
    if (!spot) continue;
    const area = have.has(spot.area) ? spot.area : fallback(have);
    out.get(area)?.push({ c: r.c.id, doing: spot.doing, kind: spot.kind });
  }
  const status = (id: number) => {
    const c = s.chars[id];
    const n = s.nations[c.nation];
    if (n?.ruler === id) return 10;
    if (n && SEATS.some((st) => n.council[st] === id)) return 8;
    return c.role ? ROLES[c.role].status : 0;
  };
  for (const v of out.values())
    v.sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        status(b.c) - status(a.c) ||
        a.c - b.c,
    );
  return out;
}

/** The people in one area today. */
export function presentAt(
  s: GameState,
  w: World,
  p: number,
  area: PlaceKind,
  day: number = s.day,
  life?: Life | null,
): Present[] {
  return presence(s, w, p, day, life).get(area) ?? [];
}

/** Where someone in a province is today, if they're out and about. */
export function findIn(
  s: GameState,
  w: World,
  p: number,
  c: number,
  day: number = s.day,
  life?: Life | null,
): { area: PlaceKind; doing: string } | null {
  for (const [area, list] of presence(s, w, p, day, life)) {
    const x = list.find((y) => y.c === c);
    if (x) return { area, doing: x.doing };
  }
  return null;
}

/** Whereabouts of anyone, for their card: a province, and the area if known. */
export function whereabouts(
  s: GameState,
  w: World,
  cId: number,
  life?: Life | null,
): {
  p: number;
  area: PlaceKind | null;
  doing: string;
  road?: Traveller;
} | null {
  const c = s.chars[cId];
  if (!c?.alive || c.abroad) return null;
  const t = (s.travellers ?? []).find((x) => x.c === cId);
  if (t && t.depart >= 0)
    return {
      p: t.prov,
      area: null,
      doing: `on the road to ${w.map.provinces[t.path[t.path.length - 1]]?.name ?? "somewhere"}`,
      road: t,
    };
  const played = lifeOfChar(s, cId);
  let p = t ? t.prov : played ? played.prov : (c.home ?? -1);
  if (p < 0) {
    const n = s.nations.find(
      (x) =>
        x.alive &&
        (x.ruler === cId ||
          x.court.includes(cId) ||
          SEATS.some((st) => x.council[st] === cId)),
    );
    p = n?.capital ?? -1;
  }
  if (p < 0) return null;
  if (played?.travel)
    return {
      p,
      area: null,
      doing: `on the road to ${w.map.provinces[played.travel.dest]?.name ?? "somewhere"}`,
    };
  const at = findIn(s, w, p, cId, s.day, life);
  return at
    ? { p, area: at.area, doing: at.doing }
    : { p, area: null, doing: "at home" };
}

/** A short description of someone for lists: "Innkeeper", "Governor"... */
export function jobLabel(s: GameState, c: Character): string {
  const l = lifeOfChar(s, c.id);
  if (l?.job) return JOBS[l.job.kind].ranks[l.job.rank]?.title ?? "";
  return c.role ? ROLES[c.role].title : charName(c);
}
