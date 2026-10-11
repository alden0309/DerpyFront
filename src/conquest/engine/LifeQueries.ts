// Questions about players' lives, asked by the server and by every browser
// of its own copy of the state: what a character is good at, what a place
// offers, who's here and what they think of you, the road to somewhere,
// what a promotion still needs. Numbers come as Breakdowns, like the rest.

import { Explain } from "./Explain";
import {
  ALLOWANCE,
  ALLOWANCE_YEARS,
  BACKGROUNDS,
  CARRIAGE_PACE,
  FAMILY_COST,
  FAMILY_MULT,
  HORSE_PACE,
  HOUSES,
  JOBS,
  KIT,
  LIFESTYLE,
  LIFESTYLES,
  LODGES,
  NATIVE_STATION_NAMES,
  PORTIONS,
  PRESS_YEAR,
  RankDef,
  ROAD_COST_PER_DAY,
  ROLES,
  SEA_FARE_BASE,
  SEA_FARE_PER_100KM,
  SEA_PASSAGE_KM,
  SKILL_MAX,
  SKILL_STAT,
  STATION_HOUSE,
  STATION_LIFESTYLE,
  STATION_NAMES,
  STATION_WAGE,
  TAX_RATES,
  TITHE,
  TRAIT_SKILLS,
  WALK_SPEED,
  WEDDINGS,
  WORK_DAYS,
} from "./LifeRules";
import type { World } from "./Map";
import { landHopDays, seaHopDays } from "./Paths";
import { propertyBudget } from "./Property";
import {
  ageOf,
  atWar,
  hasTrait,
  settlers,
  stat,
  tribesfolk,
  yearOf,
} from "./Queries";
import {
  DAYS_PER_YEAR,
  EUROPE_PRICE,
  NATIVE_SEAT_NAMES,
  SEAT_NAMES,
  TITLE_NAMES,
} from "./Rules";
import {
  Breakdown,
  Character,
  GameState,
  Good,
  KitKey,
  Life,
  Lifestyle,
  MapDef,
  PlaceKind,
  Seat,
  SEATS,
  Skill,
  Terrain,
} from "./Types";

export type Check = { ok: true } | { ok: false; why: string };
export const yes: Check = { ok: true };
export const no = (why: string): Check => ({ ok: false, why });

// ---------------------------------------------------------------- whose life

export function lifeOfSeat(s: GameState, seat: string): Life | undefined {
  return s.lives.find((l) => l.seat === seat);
}

/** The life playing a character, if a player plays them. */
export function lifeOfChar(s: GameState, c: number): Life | undefined {
  if (c < 0) return undefined;
  return s.lives.find((l) => l.c === c);
}

export function isPlayed(s: GameState, c: number): boolean {
  return s.lives.some((l) => l.c === c);
}

export function meOf(s: GameState, life: Life): Character | undefined {
  return life.c >= 0 ? s.chars[life.c] : undefined;
}

export function nationByKey(s: GameState, key: string): number {
  return s.nations.findIndex((n) => n.key === key);
}

/** A native character (by faith and people). */
export function isNativeChar(s: GameState, c: Character | undefined): boolean {
  if (!c) return false;
  return s.nations[c.nation]?.kind === "native" || c.religion === "native";
}

export function lifeIsNative(s: GameState, life: Life): boolean {
  const me = meOf(s, life);
  if (me) return isNativeChar(s, me);
  return BACKGROUNDS[life.background]?.native ?? false;
}

export function ageOfLife(s: GameState, life: Life): number {
  const me = meOf(s, life);
  return me ? ageOf(s, me) : 0;
}

/** Under 16: a child heir, who can't work, marry or hold office yet. */
export function isChildLife(s: GameState, life: Life): boolean {
  return ageOfLife(s, life) < 16;
}

// ---------------------------------------------------------------- skills

/** A played character's skill with everything that changes it. */
export function skillOf(s: GameState, life: Life, sk: Skill): Breakdown {
  const me = meOf(s, life);
  const e = new Explain().add("Learned", life.skills[sk] ?? 0, true);
  if (!me) return e.done(0);
  for (const t of me.traits) {
    const v = TRAIT_SKILLS[t]?.[sk] ?? 0;
    if (v) e.add(t[0].toUpperCase() + t.slice(1), v);
  }
  const st = stat(s, me, SKILL_STAT[sk]);
  const bonus = Math.floor((st - 5) / 3);
  if (bonus !== 0) e.add(`Attribute (${st})`, bonus);
  const age = ageOf(s, me);
  if (age < 16) e.mul(`Young (${age})`, Math.max(0.3, age / 16));
  else if (age >= 70 && (sk === "fighting" || sk === "seamanship"))
    e.add(`Old age (${age})`, -3);
  else if (age >= 58 && sk === "fighting") e.add(`Old age (${age})`, -1);
  if (life.health < 35 && (sk === "fighting" || sk === "leadership"))
    e.add("In poor health", -2);
  if (life.stress >= 70 && (sk === "persuasion" || sk === "leadership"))
    e.add("Under strain", -1);
  if (life.job && JOBS[life.job.kind].main === sk && hasKit(s, life, "tools"))
    e.add("Good tools", 1);
  return e.done(0, 0, SKILL_MAX + 6);
}

export function skillLevel(s: GameState, life: Life, sk: Skill): number {
  return skillOf(s, life, sk).total;
}

/** What someone not played is good at: their nature, and their trade. */
export function npcSkill(s: GameState, c: Character, sk: Skill): number {
  let v = 1 + Math.max(0, stat(s, c, SKILL_STAT[sk]) - 3);
  if (c.role && ROLES[c.role].skill === sk) v += 5;
  for (const t of c.traits) v += TRAIT_SKILLS[t]?.[sk] ?? 0;
  const age = ageOf(s, c);
  if (age < 16) v = Math.floor((v * age) / 16);
  return Math.max(0, Math.min(SKILL_MAX, v));
}

/** Anyone's skill: a player's from their sheet, anyone else's by nature. */
export function charSkill(s: GameState, c: Character, sk: Skill): number {
  const life = lifeOfChar(s, c.id);
  return life ? skillLevel(s, life, sk) : npcSkill(s, c, sk);
}

// ---------------------------------------------------------------- places

const WOODED: Terrain[] = [
  "forest",
  "hills",
  "mountains",
  "marsh",
  "jungle",
  "tundra",
];

/** The places in a province, from what's there: buildings, people, land. */
export function placesIn(s: GameState, w: World, p: number): PlaceKind[] {
  const pr = s.provinces[p];
  const def = w.map.provinces[p];
  const owner = pr.owner >= 0 ? s.nations[pr.owner] : undefined;
  const folk = settlers(pr);
  const out: PlaceKind[] = [];
  const wooded =
    WOODED.includes(def.terrain) ||
    w.raw[p] === "furs" ||
    w.raw[p] === "timber";
  if (owner?.kind === "power" && folk >= 50) {
    out.push("tavern", "market");
    if ((pr.b.church ?? 0) > 0 || folk >= 400) out.push("church");
    if (def.coastal && (pr.b.port ?? 0) > 0) out.push("docks");
    if ((pr.b.fort ?? 0) > 0 || owner.capital === p) out.push("fort");
    if (
      folk >= 600 ||
      pr.b.smithy ||
      pr.b.weaver ||
      pr.b.gunsmith ||
      pr.b.lumbercamp
    )
      out.push("workshop");
    if (
      yearOf(s) >= (PRESS_YEAR[owner.culture] ?? 9999) &&
      (owner.capital === p || folk >= 2500)
    )
      out.push("press");
    out.push("fields");
    if (owner.capital === p || (pr.b.courthouse ?? 0) > 0) out.push("governor");
    if (owner.capital === p || folk >= 1500) out.push("apothecary");
    if (wooded) out.push("woods");
    // LIFE (r11): a watch-house and gaol in a town of any size; a den in a
    // big one or a port (found, not seen: Areas.ts shows it to those who know).
    if (folk >= 500 || owner.capital === p || (pr.b.courthouse ?? 0) > 0)
      out.push("gaol");
    if (folk >= 900 || owner.capital === p || (def.coastal && folk >= 400))
      out.push("den");
  } else if (owner?.kind === "native") {
    out.push("village", "councilfire", "fields");
    if (def.coastal || owner.capital === p) out.push("market");
    out.push("woods");
  } else {
    if (tribesfolk(pr) >= 150) out.push("village");
    out.push("woods");
  }
  return out;
}

export function hasPlace(
  s: GameState,
  w: World,
  p: number,
  place: PlaceKind,
): boolean {
  return placesIn(s, w, p).includes(place);
}

// ---------------------------------------------------------------- jobs

export function rankOf(life: Life): RankDef | null {
  if (!life.job) return null;
  return JOBS[life.job.kind].ranks[life.job.rank] ?? null;
}

export function jobTitle(life: Life): string {
  return rankOf(life)?.title ?? "";
}

/** Whether a job's work is being done (at the post, or wherever it goes). */
export function atPost(s: GameState, w: World, life: Life): boolean {
  const job = life.job;
  if (!job) return false;
  switch (job.kind) {
    case "soldier":
    case "warrior":
      return job.army >= 0 || life.prov === job.prov;
    case "sailor":
      return (
        (life.travel !== null && life.travel.sea[0] === true) ||
        hasPlace(s, w, life.prov, "docks")
      );
    case "trapper":
    case "hunter":
      return life.travel === null && hasPlace(s, w, life.prov, "woods");
    case "trader":
      return life.travel === null;
    case "clerk":
      return job.rank >= 2 || life.prov === job.prov;
  }
  // LIFE (r11): in a cell nobody works; some work goes to sea, the road, or anywhere.
  if (life.crime?.jail) return false;
  // A militia officer leading their own company in the field is on service.
  if (job.kind === "militia" && (life.company?.army ?? -1) >= 0) return true;
  switch (JOBS[job.kind].post) {
    case "sea":
      return (
        (life.travel !== null && life.travel.sea[0] === true) ||
        (life.travel === null && hasPlace(s, w, life.prov, "docks"))
      );
    case "road":
      return life.travel !== null || life.prov === job.prov;
    case "anywhere":
      return true;
  }
  return life.travel === null && life.prov === job.prov;
}

/** Why a job here can't be taken, or ok. */
export function jobCheck(
  s: GameState,
  w: World,
  life: Life,
  place: PlaceKind,
  kind: string,
): Check {
  const def = JOBS[kind as keyof typeof JOBS];
  if (!def) return no("No such work.");
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (life.travel) return no("You're on the road.");
  if (!def.places.includes(place)) return no("They don't do that work here.");
  if (!hasPlace(s, w, life.prov, place))
    return no("There's no such place here.");
  const native = isNativeChar(s, me);
  if (def.native !== null && def.native !== native)
    return no(
      def.native
        ? "That's work among the native peoples."
        : "That's colonists' work.",
    );
  if (life.job?.kind === "servant" && (life.job.until ?? 0) > s.day)
    return no("You're bound to your master until your indenture is served.");
  if (life.job?.kind === kind && life.job.prov === life.prov)
    return no("You already do this work here.");
  const pr = s.provinces[life.prov];
  const holder = pr.occupier >= 0 ? pr.occupier : pr.owner;
  if (def.ownNation && holder !== me.nation)
    return no(
      `Only ${s.nations[holder]?.adjective ?? "local"} people are taken on here.`,
    );
  if (def.ownFaith && s.nations[holder]?.religion !== me.religion)
    return no("It's a church of another faith.");
  for (const [sk, v] of Object.entries(def.need ?? {}) as [Skill, number][])
    if (skillLevel(s, life, sk) < v)
      return no(`Needs ${sk} ${v} (you have ${skillLevel(s, life, sk)}).`);
  return yes;
}

/** The rung a new hand starts on: the first, or the second if they're good. */
export function startRank(s: GameState, life: Life, kind: string): number {
  const def = JOBS[kind as keyof typeof JOBS];
  const r1 = def.ranks[1];
  if (
    r1 &&
    !r1.buy &&
    !r1.commission &&
    skillLevel(s, life, def.main) >= r1.skill + 2 &&
    life.renown >= r1.renown
  )
    return 1;
  return 0;
}

export interface PromotionView {
  check: Check;
  next: RankDef | null;
  /** The things still needed, each met or not. */
  needs: { label: string; met: boolean }[];
}

/** The officers' opinion a commission needs (sergeant to lieutenant: 15). */
export function commissionOpinion(rank: number): number {
  return 10 + 5 * Math.max(0, rank - 2);
}

/** The best word anyone with a say has for you: patron, marshal, governor. */
export function commissionFriend(s: GameState, life: Life): number {
  const job = life.job;
  if (!job) return -100;
  const n = s.nations[job.nation >= 0 ? job.nation : 0];
  let best = -100;
  for (const id of [n?.council.marshal, n?.ruler, life.patron]) {
    const c = id !== undefined && id >= 0 ? s.chars[id] : undefined;
    if (c?.alive) best = Math.max(best, opinionOf(s, c, life).total);
  }
  return best;
}

/** What the next rung needs, and whether you have it. */
export function promotionView(s: GameState, life: Life): PromotionView {
  const job = life.job;
  if (!job) return { check: no("No job."), next: null, needs: [] };
  const def = JOBS[job.kind];
  const next = def.ranks[job.rank + 1] ?? null;
  if (!next)
    return { check: no("The top of this ladder."), next: null, needs: [] };
  const needs: { label: string; met: boolean }[] = [];
  needs.push({
    label: `${next.months} months as ${def.ranks[job.rank].title.toLowerCase()} (${job.months} so far)`,
    met: job.months >= next.months,
  });
  if (next.skill > 0)
    needs.push({
      label: `${def.main} ${next.skill} (${skillLevel(s, life, def.main)})`,
      met: skillLevel(s, life, def.main) >= next.skill,
    });
  if (next.second)
    needs.push({
      label: `${def.second} ${next.second} (${skillLevel(s, life, def.second)})`,
      met: skillLevel(s, life, def.second) >= next.second,
    });
  if (next.renown > 0)
    needs.push({
      label: `renown ${next.renown} (${Math.floor(life.renown)})`,
      met: life.renown >= next.renown,
    });
  // LIFE (r11): a name in the underworld; a horse for the road.
  if (next.notoriety)
    needs.push({
      label: `notoriety ${next.notoriety} (${Math.floor(life.crime?.notoriety ?? 0)})`,
      met: (life.crime?.notoriety ?? 0) >= next.notoriety,
    });
  if (next.kit)
    needs.push({
      label: next.kit === "horse" ? "a horse of your own" : `a ${next.kit}`,
      met: hasKit(s, life, next.kit),
    });
  if (next.opinion !== undefined && !job.own) {
    const boss = s.chars[job.employer];
    const op = boss?.alive ? opinionOf(s, boss, life).total : -100;
    needs.push({
      label: `your employer's good opinion, ${next.opinion} (${boss?.alive ? op : "nobody"})`,
      met: op >= next.opinion,
    });
  }
  if (next.commission) {
    const want = commissionOpinion(job.rank + 1);
    const have = commissionFriend(s, life);
    needs.push({
      label: `a word from the marshal, the governor or a patron, opinion ${want} (best ${have > -100 ? have : "none"})${next.buy ? `, or ${next.buy.cost} coins to buy it` : ""}`,
      met:
        have >= want || (next.buy !== undefined && life.purse >= next.buy.cost),
    });
  }
  // A commission that can also be bought needs the word or the coins.
  if (next.buy && !next.commission)
    needs.push({
      label: `${next.buy.cost} coins for ${next.buy.what} (bought at the ${job.place === "governor" ? "governor's house" : job.place})`,
      met: life.purse >= next.buy.cost,
    });
  const missing = needs.find((x) => !x.met);
  return {
    check: missing ? no(`Needs ${missing.label}.`) : yes,
    next,
    needs,
  };
}

/**
 * A month's wage: what the rung pays if you work the month (`actual`
 * false), or what this month's days at the post have earned (`actual`).
 */
export function wageOf(
  s: GameState,
  w: World,
  life: Life,
  actual = false,
): number {
  const r = rankOf(life);
  if (!r || !life.job) return 0;
  if (!actual) return atPost(s, w, life) ? r.wage : 0;
  // LIFE (r11): overtime earns up to 1.4 of a month's wage.
  const cap = life.work?.effort === "overtime" ? 1.4 : 1;
  const share = Math.min(cap, (life.job.worked ?? 0) / WORK_DAYS);
  return Math.round(r.wage * share * 100) / 100;
}

// ---------------------------------------------------------------- money

export function lifestyleCost(s: GameState, life: Life): Breakdown {
  const def = LIFESTYLE[life.lifestyle];
  const native = lifeIsNative(s, life);
  const e = new Explain().add(
    `${def.name} living`,
    native ? def.nativeCost : def.cost,
    true,
  );
  const fam = familyAtHome(s, life).length;
  if (fam > 0)
    e.add(
      `${fam} at home`,
      fam * FAMILY_COST * FAMILY_MULT[life.lifestyle] * (native ? 0.5 : 1),
    );
  if (life.job?.kind === "servant") e.mul("Your master feeds you", 0);
  else if (isChildLife(s, life)) e.mul("Your family keeps you", 0);
  return e.done(1);
}

/**
 * A month's money: what comes in, what goes out. As a forecast (wages for a
 * full month's work, property too), or `actual`: what's paid at the month's
 * end (wages by the days worked; property is settled on its own).
 */
export function monthlyBudget(
  s: GameState,
  w: World,
  life: Life,
  actual = false,
): Breakdown {
  const e = new Explain();
  const wage = wageOf(s, w, life, actual);
  // LIFE (r11): a crooked living brings takings, not wages, and pays no dues.
  const crooked = !!life.job && !!JOBS[life.job.kind].crime;
  const what = crooked ? "Takings" : "Wage";
  if (wage)
    e.add(
      actual && life.job
        ? `${what}: ${jobTitle(life).toLowerCase()} (${Math.round(life.job.worked ?? 0)} of ${WORK_DAYS} days)`
        : `${what}: ${jobTitle(life).toLowerCase()}`,
      wage,
    );
  if (allowanceDue(s, life)) e.add("Your family's allowance", ALLOWANCE);
  let earned = crooked ? 0 : wage;
  for (const o of officesOf(s, life.c)) {
    // A governor who holds a commission (or any post) draws the larger pay.
    const pay =
      o.kind === "governor" || o.kind === "sachem"
        ? Math.max(0, o.stipend - wage)
        : o.stipend;
    if (pay) {
      e.add(pay < o.stipend ? `${o.label} (above your pay)` : o.label, pay);
      earned += pay;
    }
  }
  for (const d of duesOn(s, life, earned)) e.add(d.label, d.value);
  const cost = lifestyleCost(s, life).total;
  if (cost) e.add("Living", -cost);
  if (!actual) {
    for (const part of propertyBudget(s, life).parts)
      e.add(part.label, part.value);
    for (const k of Object.keys(life.kit ?? {}) as KitKey[])
      if (KIT[k].upkeep && hasKit(s, life, k))
        e.add(`Keep: ${KIT[k].name.toLowerCase()}`, -KIT[k].upkeep);
  }
  return e.done(1);
}

// ---------------------------------------------------------------- station and dues

export interface StationView {
  /** 0 labouring folk to 4 the great. */
  level: number;
  name: string;
  /** What puts you there: "Expected of a captain". */
  why: string;
  /** Who you are, said that way: "a captain". */
  who: string;
  /** The way of living expected of you. */
  expected: Lifestyle;
}

/** Where you stand, and so how people expect you to live. */
export function stationOf(s: GameState, life: Life): StationView {
  const me = meOf(s, life);
  let level = 0;
  let why = "Plain working folk";
  let who = "working folk";
  const up = (l: number, w: string, wh: string) => {
    if (l > level) {
      level = l;
      why = w;
      who = wh;
    }
  };
  const a = (t: string) => `${/^[aeiou]/i.test(t) ? "an" : "a"} ${t}`;
  if (me && ageOf(s, me) >= 16) {
    const r = rankOf(life);
    if (r) {
      const l = STATION_WAGE.filter((x) => r.wage >= x).length;
      const t = r.title.toLowerCase();
      up(l, `Expected of ${a(t)}`, a(t));
    }
    // The assembly makes you middling, the council a gentleman, the
    // governor's chair one of the great.
    for (const o of officesOf(s, me.id)) {
      const t = o.label.replace(/^(\w)/, (m) => m.toLowerCase());
      up(o.level === 3 ? 4 : o.level, `Expected of ${a(t)}`, a(t));
    }
    if (life.background === "gentry" && life.line.length === 1)
      up(2, "Born to the gentry", "one of the gentry");
    if (life.renown >= 150)
      up(3, "Your name is known everywhere", "someone so famous");
    else if (life.renown >= 60)
      up(2, "Your name is known", "someone so well known");
    for (const pr of life.property ?? [])
      if (pr.kind === "house" && pr.level >= 3) {
        const t = pr.name.toLowerCase();
        up(pr.level - 1, `Expected in ${a(t)}`, `the owner of ${a(t)}`);
      }
  }
  return {
    level,
    name: (lifeIsNative(s, life) ? NATIVE_STATION_NAMES : STATION_NAMES)[level],
    why,
    who,
    expected: STATION_LIFESTYLE[level],
  };
}

export interface Beneath {
  /** Steps beneath your station in all. */
  steps: number;
  /** Steps your way of living falls short (a carriage makes up one). */
  living: number;
  /** No house fit for your station: what's expected. */
  house: string | null;
}

/** How far beneath your station you live: your table, and your roof. */
export function beneathStation(s: GameState, life: Life): Beneath {
  const st = stationOf(s, life);
  const have =
    LIFESTYLES.indexOf(life.lifestyle) + (hasKit(s, life, "carriage") ? 1 : 0);
  const living = Math.max(0, LIFESTYLES.indexOf(st.expected) - have);
  // On campaign a tent is house enough.
  const want = (life.job?.army ?? -1) >= 0 ? 0 : STATION_HOUSE[st.level];
  const roof =
    (life.property ?? []).find(
      (p) => p.kind === "house" && p.prov === life.home,
    )?.level ?? 0;
  const defs = lifeIsNative(s, life) ? LODGES : HOUSES;
  const house =
    want > roof
      ? want === 1
        ? "House"
        : (defs[want - 1]?.name ?? null)
      : null;
  return { steps: living + (house ? 1 : 0), living, house };
}

/** Whether you have a kept thing (tools wear out after a while). */
export function hasKit(s: GameState, life: Life, k: KitKey): boolean {
  const got = life.kit?.[k];
  if (got === undefined) return false;
  const lasts = KIT[k].lasts;
  return !lasts || s.day - got < lasts;
}

/** The church takes a tenth (or near it) of what Christian colonists earn. */
export function tithed(s: GameState, life: Life): boolean {
  const me = meOf(s, life);
  return !!me && !lifeIsNative(s, life) && me.religion !== "native";
}

/** Tithes and taxes on a month's earnings. */
export function duesOn(
  s: GameState,
  life: Life,
  earned: number,
): { label: string; value: number }[] {
  if (earned <= 0 || lifeIsNative(s, life)) return [];
  const out: { label: string; value: number }[] = [];
  const me = meOf(s, life);
  if (tithed(s, life))
    out.push({
      label: "Tithes and church rates",
      value: -Math.round(earned * TITHE * 100) / 100,
    });
  const n =
    s.nations[
      life.job && life.job.nation >= 0 ? life.job.nation : (me?.nation ?? -1)
    ];
  if (n?.kind === "power") {
    const rate = TAX_RATES[n.tax] ?? TAX_RATES[1];
    out.push({
      label: `Taxes (${["low", "normal", "high"][n.tax] ?? "normal"})`,
      value: -Math.round(earned * rate * 100) / 100,
    });
  }
  return out;
}

/** What a child of yours takes into a marriage, at your station. */
export function portionOf(s: GameState, life: Life): number {
  return PORTIONS[stationOf(s, life).level];
}

/** What your own wedding costs at your station. */
export function weddingCost(s: GameState, life: Life): number {
  return WEDDINGS[stationOf(s, life).level];
}

/** How much faster than walking you go overland: on horseback, by coach. */
export function paceOf(s: GameState, life: Life): number {
  if (hasKit(s, life, "carriage")) return CARRIAGE_PACE;
  if (hasKit(s, life, "horse")) return HORSE_PACE;
  return 1;
}

/** A gentleman's child is kept by their family for the first few years. */
export function allowanceDue(s: GameState, life: Life): boolean {
  return (
    life.background === "gentry" &&
    life.line.length === 1 &&
    s.day - life.joined < ALLOWANCE_YEARS * DAYS_PER_YEAR
  );
}

// ---------------------------------------------------------------- offices

export interface OfficeView {
  kind: "governor" | "council" | "assembly" | "sachem" | "leader";
  nation: number;
  label: string;
  seat?: Seat;
  /** Coins a month. */
  stipend: number;
  /** 1 assembly, 2 council, 3 governor. */
  level: number;
}

export function officesOf(s: GameState, c: number): OfficeView[] {
  if (c < 0) return [];
  const out: OfficeView[] = [];
  for (const n of s.nations) {
    if (!n.alive) continue;
    if (n.ruler === c) {
      if (n.kind === "power")
        out.push({
          kind: "governor",
          nation: n.id,
          label: `${n.title > 0 ? `${TITLE_NAMES[n.title]} and g` : "G"}overnor of ${n.name.replace(/^the /, "")}`,
          stipend: 24,
          level: 3,
        });
      else if (n.kind === "native")
        out.push({
          kind: "sachem",
          nation: n.id,
          label: `Leader of the ${n.name}`,
          stipend: 6,
          level: 3,
        });
      else if (n.kind === "rebels")
        out.push({
          kind: "leader",
          nation: n.id,
          label: `Captain of ${n.name}`,
          stipend: 0,
          level: 1,
        });
    }
    if (n.kind === "power" || n.kind === "native")
      for (const seat of SEATS)
        if (n.council[seat] === c)
          out.push({
            kind: "council",
            nation: n.id,
            seat,
            label:
              n.kind === "native"
                ? `${NATIVE_SEAT_NAMES[seat]} of the ${n.name}`
                : `${SEAT_NAMES[seat]} of ${n.name.replace(/^the /, "")}`,
            stipend: n.kind === "native" ? 3 : 5,
            level: 2,
          });
    const pol = s.polities[n.id];
    if (pol?.assembly.includes(c))
      out.push({
        kind: "assembly",
        nation: n.id,
        label: `${n.kind === "native" ? "Speaker at" : "Member of"} ${pol.name}`,
        stipend: n.kind === "native" ? 1 : 2,
        level: 1,
      });
  }
  return out;
}

/** What to call a played character: their office, their trade, or their station. */
export function lifeTitle(s: GameState, life: Life): string {
  const me = meOf(s, life);
  if (!me) return life.ended ? "Their story is told" : "Watching";
  const age = ageOf(s, me);
  if (age < 16) return `A child of ${age}`;
  const offices = officesOf(s, me.id).sort((a, b) => b.level - a.level);
  if (offices[0]) return offices[0].label;
  if (life.job) return jobTitle(life);
  if (life.background === "gentry")
    return me.female ? "Gentlewoman" : "Gentleman";
  return "Of no fixed trade";
}

// ---------------------------------------------------------------- people

export function familyAtHome(s: GameState, life: Life): Character[] {
  const me = meOf(s, life);
  if (!me) return [];
  const out: Character[] = [];
  const sp = s.chars[me.spouse];
  if (sp?.alive && !sp.abroad) out.push(sp);
  for (const k of me.children) {
    const c = s.chars[k];
    if (c?.alive && !c.abroad && c.spouse < 0 && ageOf(s, c) < 21) out.push(c);
  }
  return out;
}

export function siblingsOf(s: GameState, c: Character): Character[] {
  const out = new Set<number>();
  for (const pid of [c.father, c.mother]) {
    const p = s.chars[pid];
    if (p) for (const k of p.children) if (k !== c.id) out.add(k);
  }
  return [...out].map((id) => s.chars[id]).filter((x): x is Character => !!x);
}

/** Who carries the line on: the named heir, the eldest child, a grandchild. */
export function heirOf(s: GameState, life: Life): number {
  const me = meOf(s, life);
  if (!me) return -1;
  const ok = (c: Character | undefined): c is Character =>
    !!c?.alive && !c.abroad && !isPlayed(s, c.id);
  const named = s.chars[life.heir];
  if (ok(named) && me.children.includes(named.id)) return named.id;
  const kids = me.children.map((id) => s.chars[id]).filter(ok);
  kids.sort((a, b) => a.born - b.born);
  if (kids[0]) return kids[0].id;
  const grand = me.children
    .flatMap((id) => s.chars[id]?.children ?? [])
    .map((id) => s.chars[id])
    .filter(ok)
    .sort((a, b) => a.born - b.born);
  return grand[0]?.id ?? -1;
}

/** How someone feels about a player's character, and why. */
export function opinionOf(s: GameState, c: Character, life: Life): Breakdown {
  const me = meOf(s, life);
  const e = new Explain();
  if (!me || c.id === me.id) return e.done(0);
  if (me.spouse === c.id) e.add("Married to you", 50);
  if (c.father === me.id || c.mother === me.id) e.add("Your child", 40);
  else if (me.father === c.id || me.mother === c.id) e.add("Your parent", 40);
  else if (
    (c.father >= 0 && c.father === me.father) ||
    (c.mother >= 0 && c.mother === me.mother)
  )
    e.add("Your brother or sister", 25);
  const tie = life.ties[c.id];
  if (tie === "friend") e.add("Friends", 25);
  if (tie === "lover") e.add("Lovers", 30);
  if (tie === "rival") e.add("Rivals", -40);
  if (life.patron === c.id) e.add("Your patron", 10);
  if (hasTrait(me, "charming")) e.add("You're charming", 10);
  if (hasTrait(me, "honest")) e.add("Your honest name", 5);
  if (hasTrait(me, "just")) e.add("Your fair dealing", 5);
  if (hasTrait(me, "famous")) e.add("Your fame", 10);
  if (hasTrait(me, "cruel")) e.add("Your cruelty", -10);
  if (hasTrait(me, "greedy")) e.add("Your greed", -5);
  if (hasTrait(me, "drunkard")) e.add("Your drinking", -5);
  if (hasTrait(c, "generous")) e.add("Their good nature", 5);
  if (hasTrait(c, "cruel")) e.add("Their sourness", -5);
  if (c.religion === me.religion) e.add("Same faith", 8);
  else
    e.add(
      "Another faith",
      hasTrait(c, "zealous") || hasTrait(me, "zealous")
        ? -20
        : hasTrait(me, "tolerant")
          ? -2
          : -8,
    );
  const nativeMe = isNativeChar(s, me);
  const nativeThem = isNativeChar(s, c);
  if (c.culture === me.culture) e.add("Your own people", 5);
  else if (nativeMe !== nativeThem)
    e.add(
      nativeThem ? "A stranger from over the sea" : "A stranger of the country",
      hasTrait(me, "tolerant") ? -4 : -12,
    );
  const renown = Math.min(15, Math.floor(life.renown / 5));
  if (renown > 0) e.add(`Your renown (${Math.floor(life.renown)})`, renown);
  const status = c.role ? ROLES[c.role].status : 0;
  if (
    status >= 4 &&
    (life.job?.rank ?? 0) === 0 &&
    life.renown < 10 &&
    life.background !== "gentry"
  )
    e.add("Beneath their notice", -5);
  if (life.lifestyle === "comfortable") e.add("You live well", 3);
  else if (life.lifestyle === "frugal" && status >= 3)
    e.add("Your threadbare coat", -3);
  if (atWar(s, me.nation, c.nation)) e.add("Your peoples are at war", -25);
  if (s.nations[c.nation]?.ruler === me.id) e.add("You govern them", 10);
  for (const m of s.movements) {
    if (m.status !== "brewing" && m.status !== "risen") continue;
    const mine = m.members.includes(me.id) || m.leader === me.id;
    const theirs = m.members.includes(c.id) || m.leader === c.id;
    if (mine && theirs) e.add(`Comrades in ${m.name}`, 15);
    else if (mine && s.nations[m.against]?.ruler === c.id)
      e.add(`You stir up ${m.name}`, -20);
  }
  for (const m of c.memories) {
    if (m.of !== me.id) continue;
    if (m.until !== 0 && m.until <= s.day) continue;
    e.add(m.why, m.value);
  }
  return e.done(0, -100, 100);
}

/** Everyone you could meet in a province right now. */
export function peopleHere(s: GameState, p: number, life?: Life): Character[] {
  const out = new Map<number, Character>();
  const away = new Map<number, number>();
  for (const t of s.travellers ?? []) away.set(t.c, t.depart < 0 ? t.prov : -1);
  const add = (c: Character | undefined, travelling = false) => {
    if (!c?.alive || c.abroad || out.has(c.id)) return;
    if (life && c.id === life.c) return;
    const at = away.get(c.id);
    if (!travelling && at !== undefined && at !== p) return;
    out.set(c.id, c);
  };
  for (const t of s.travellers ?? [])
    if (t.depart < 0 && t.prov === p) add(s.chars[t.c], true);
  for (const l of s.lives)
    for (const pr of l.property ?? [])
      if (pr.prov === p) for (const id of pr.hands) add(s.chars[id]);
  for (const n of s.nations) {
    if (!n.alive || n.capital !== p || n.kind === "crown") continue;
    const ruler = s.chars[n.ruler];
    add(ruler);
    for (const seat of SEATS) add(s.chars[n.council[seat]]);
    for (const id of n.court) add(s.chars[id]);
    if (ruler) {
      add(s.chars[ruler.spouse]);
      for (const k of ruler.children) {
        const kid = s.chars[k];
        if (kid && ageOf(s, kid) >= 14) add(kid);
      }
    }
  }
  for (const id of s.locals[p] ?? []) {
    const c = s.chars[id];
    if (!c) continue;
    add(c);
    const sp = s.chars[c.spouse];
    if (sp && (sp.home === undefined || sp.home === p)) add(sp);
    for (const k of c.children) {
      const kid = s.chars[k];
      if (
        kid &&
        (kid.home === undefined || kid.home === p) &&
        ageOf(s, kid) >= 14
      )
        add(kid);
    }
  }
  for (const a of s.armies)
    if (a.prov === p && a.depart < 0 && a.commander >= 0)
      add(s.chars[a.commander]);
  for (const l of s.lives) {
    if (l.c < 0 || l === life || l.travel || l.prov !== p) continue;
    add(s.chars[l.c]);
  }
  if (life && life.home === p) for (const c of familyAtHome(s, life)) add(c);
  return [...out.values()];
}

// ---------------------------------------------------------------- travel

export interface Route {
  path: number[];
  sea: boolean[];
  /** Days each hop takes. */
  legs: number[];
  days: number;
  cost: number;
}

/** Days for a traveller's hop: on foot, or a passage by sea. */
export function hopDaysFor(
  map: MapDef,
  from: number,
  to: number,
  sea: boolean,
  pace = 1,
): number {
  if (sea) {
    const lane = map.provinces[from].sea.find(([q]) => q === to);
    return lane ? seaHopDays(lane[1]) : -1;
  }
  const nb = map.provinces[from].nb.find(([q]) => q === to);
  return nb ? landHopDays(map, to, nb[1], nb[2], nb[3], WALK_SPEED * pace) : -1;
}

/** Where a traveller can take ship: a port (or, for natives, any coast by canoe). */
export function canEmbark(
  s: GameState,
  map: MapDef,
  p: number,
  native: boolean,
): boolean {
  if (!map.provinces[p].coastal) return false;
  return native || (s.provinces[p].b.port ?? 0) > 0;
}

/**
 * The quickest way from one province to another for someone travelling:
 * overland, or (with `sea`) by passages from ports. Natives paddle the
 * coasts in short hops from anywhere.
 */
export function travelRoute(
  s: GameState,
  map: MapDef,
  from: number,
  to: number,
  sea: boolean,
  native = false,
  sailor = false,
  /** Faster than walking: a horse, a coach. */
  pace = 1,
): Route | null {
  if (from === to) return null;
  const count = map.provinces.length;
  const days = new Float64Array(count).fill(Infinity);
  const prev = new Int32Array(count).fill(-1);
  const bySea = new Uint8Array(count);
  const done = new Uint8Array(count);
  days[from] = 0;
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < count; i++)
      if (!done[i] && days[i] < best) {
        best = days[i];
        u = i;
      }
    if (u < 0 || u === to) break;
    done[u] = 1;
    for (const [q, km, river, strait] of map.provinces[u].nb) {
      if (done[q]) continue;
      const d =
        best + landHopDays(map, q, km, river, strait, WALK_SPEED * pace);
      if (d < days[q]) {
        days[q] = d;
        prev[q] = u;
        bySea[q] = 0;
      }
    }
    if (sea && canEmbark(s, map, u, native)) {
      const reach = native ? 400 : SEA_PASSAGE_KM;
      for (const [q, km] of map.provinces[u].sea) {
        if (km > reach) break;
        if (done[q]) continue;
        const d = best + seaHopDays(km) + (native ? 1 : 0);
        if (d < days[q]) {
          days[q] = d;
          prev[q] = u;
          bySea[q] = 1;
        }
      }
    }
  }
  if (!Number.isFinite(days[to])) return null;
  const path: number[] = [];
  const seaHops: boolean[] = [];
  for (let c = to; c !== from; c = prev[c]) {
    path.push(c);
    seaHops.push(bySea[c] === 1);
  }
  path.reverse();
  seaHops.reverse();
  const legs: number[] = [];
  let cost = 0;
  let at = from;
  path.forEach((q, i) => {
    const d = hopDaysFor(map, at, q, seaHops[i], pace);
    legs.push(d);
    if (seaHops[i]) {
      if (!sailor && !native) {
        const lane = map.provinces[at].sea.find(([x]) => x === q);
        cost += SEA_FARE_BASE + ((lane?.[1] ?? 0) / 100) * SEA_FARE_PER_100KM;
      }
    } else cost += d * ROAD_COST_PER_DAY;
    at = q;
  });
  return {
    path,
    sea: seaHops,
    legs,
    days: legs.reduce((a, b) => a + b, 0),
    cost: Math.round(cost * 10) / 10,
  };
}

// ---------------------------------------------------------------- the line

/** A line's worth, for ranking players at the end and on the story page. */
export function lifeScore(s: GameState, life: Life): number {
  const t = life.tally;
  return Math.round(
    t.peakRenown +
      t.topRank * 6 +
      t.topOffice * 25 +
      t.generations * 10 +
      t.children * 2 +
      t.battlesWon * 3 +
      t.risingsWon * 25 +
      (t.europe ? 15 : 0) +
      Math.min(50, t.peakPurse / 10),
  );
}

/** People a watching player could take over: grown, living, nobody's. */
export function takeoverCandidates(s: GameState): Character[] {
  return Object.values(s.chars).filter(
    (c) =>
      c.alive &&
      !c.abroad &&
      ageOf(s, c) >= 16 &&
      !isPlayed(s, c.id) &&
      s.nations[c.nation]?.kind !== "crown",
  );
}

// ---------------------------------------------------------------- the market

/** Loads a traveller can carry. */
export const CARRY = 20;

/** What a good fetches here: the colony's market, or a village's trade. */
export function marketPrice(s: GameState, p: number, good: Good): number {
  const pr = s.provinces[p];
  const owner = pr.owner >= 0 ? s.nations[pr.owner] : undefined;
  if (owner?.kind === "power") return owner.market.price[good];
  const native: Partial<Record<Good, number>> = {
    furs: 0.5,
    grain: 0.8,
    fish: 0.8,
    guns: 1.8,
    tools: 1.6,
    cloth: 1.5,
  };
  return Math.round(EUROPE_PRICE[good] * (native[good] ?? 1) * 100) / 100;
}

/** What one load costs you to buy, and fetches when you sell, here. */
export function tradeRates(
  s: GameState,
  life: Life,
  good: Good,
): { buy: number; sell: number } {
  const me = meOf(s, life);
  const shrewd = me && hasTrait(me, "shrewd") ? 0.05 : 0;
  const skill = Math.min(0.1, life.skills.trade * 0.006);
  const price = marketPrice(s, life.prov, good);
  return {
    buy: Math.round(price * (1.12 - shrewd - skill) * 100) / 100,
    sell: Math.round(price * (0.88 + shrewd + skill) * 100) / 100,
  };
}

/** Loads carried now. */
export function carried(life: Life): number {
  return Object.values(life.goods).reduce((m, v) => m + (v ?? 0), 0);
}
