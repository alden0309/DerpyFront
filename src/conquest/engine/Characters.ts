// The people who run the colonies: governors and their families, the
// notables at court who serve on the council (or plot against it), and the
// leaders of native nations. They age, marry, have children, die, and
// remember how they were treated.

import type { ConquestGame } from "./Game";
import { hooks, skipped } from "./Hooks";
import { clanName, NATIVE_CLANS, NATIVE_NAMES } from "./LifeRules";
import { NAMES, nativeTitle } from "./Names";
import {
  ageOf,
  appointCheck,
  birthChance,
  charName,
  deathRisk,
  discoveryChance,
  findHeir,
  hasTrait,
  marryCheck,
  opinionOfRuler,
  provincesOf,
  schemeSpeed,
  stat,
} from "./Queries";
import { Rng } from "./Rng";
import {
  ADULT_AGE,
  DAYS_PER_YEAR,
  SEAT_NAMES,
  SEAT_STAT,
  STAT_MAX,
  STAT_MIN,
  TRAITS,
} from "./Rules";
import {
  Ambition,
  Character,
  Command,
  GameState,
  Memory,
  Religion,
  SchemeKind,
  Seat,
  SEATS,
  Stat,
  Stats,
  STATS,
  TraitId,
} from "./Types";

// ---------------------------------------------------------------- making people

export interface CharOptions {
  nation: number;
  culture: string;
  religion: Religion;
  female?: boolean;
  /** Age in years on the current day. */
  age: number;
  first?: string;
  family?: string;
  title?: string | null;
  stats?: Stats;
  traits?: TraitId[];
  father?: number;
  mother?: number;
  made?: boolean;
}

export function makeCharacter(
  s: GameState,
  rng: Rng,
  o: CharOptions,
): Character {
  const native = o.religion === "native" || !NAMES[o.culture];
  const female = o.female ?? rng.chance(0.5);
  const names = native
    ? {
        male: NATIVE_NAMES.male,
        female: NATIVE_NAMES.female,
        family: NATIVE_CLANS.map(clanName),
      }
    : NAMES[o.culture];
  const c: Character = {
    id: s.nextId++,
    first: o.first ?? rng.pick(female ? names.female : names.male)!,
    family: o.family ?? rng.pick(names.family)!,
    title: o.title ?? null,
    female,
    born: s.day - o.age * DAYS_PER_YEAR - rng.int(0, DAYS_PER_YEAR - 1),
    nation: o.nation,
    culture: o.culture,
    religion: o.religion,
    stats: o.stats ?? randomStats(rng),
    traits: o.traits ?? randomTraits(rng, rng.int(1, 3)),
    alive: true,
    died: null,
    spouse: -1,
    father: o.father ?? -1,
    mother: o.mother ?? -1,
    children: [],
    ambition: null,
    scheme: null,
    memories: [],
    lastBirth: -9999,
    made: o.made ?? false,
  };
  s.chars[c.id] = c;
  return c;
}

export function randomStats(rng: Rng, focus?: Stat): Stats {
  const out = {} as Stats;
  for (const st of STATS) out[st] = rng.int(3, 8);
  if (focus) out[focus] = Math.min(STAT_MAX, out[focus] + rng.int(3, 6));
  return out;
}

export function randomTraits(rng: Rng, count: number): TraitId[] {
  const all = (Object.keys(TRAITS) as TraitId[]).filter(
    (t) => !TRAITS[t].acquired,
  );
  const out: TraitId[] = [];
  for (let tries = 0; out.length < count && tries < 40; tries++) {
    const t = rng.pick(all)!;
    if (out.includes(t)) continue;
    const opp = TRAITS[t].opposite;
    if (opp && out.includes(opp)) continue;
    if ((t === "sickly" || t === "robust") && !rng.chance(0.4)) continue;
    out.push(t);
  }
  return out;
}

/** A notable suited to a council seat (or to scheming). */
export function makeNotable(
  s: GameState,
  rng: Rng,
  nation: number,
  seat?: Seat,
): Character {
  const n = s.nations[nation];
  const native = n.kind === "native";
  const c = makeCharacter(s, rng, {
    nation,
    culture: n.culture,
    religion: n.religion,
    age: rng.int(24, 55),
    stats: randomStats(rng, seat ? SEAT_STAT[seat] : rng.pick(STATS)),
    title: native && seat ? `${nativeSeatTitle(seat)} of the ${n.name}` : null,
    female: native ? false : seat === "chaplain" ? false : rng.chance(0.25),
  });
  if (!native) {
    if (c.traits.includes("ambitious") || rng.chance(0.15))
      c.ambition = "governorship";
    else
      c.ambition = rng.pick<Ambition>(["wealth", "glory", "faith", "peace"])!;
  }
  return c;
}

function nativeSeatTitle(seat: Seat): string {
  return {
    treasurer: "Keeper of stores",
    marshal: "War chief",
    envoy: "Speaker",
    spymaster: "Scout",
    chaplain: "Healer",
  }[seat];
}

/** A computer governor: decent at something, flawed at something else. */
export function randomGovernor(
  s: GameState,
  rng: Rng,
  nation: number,
): Character {
  const n = s.nations[nation];
  const focus = rng.pick(STATS)!;
  return makeCharacter(s, rng, {
    nation,
    culture: n.culture,
    religion: n.religion,
    female: rng.chance(0.1),
    age: rng.int(30, 48),
    stats: randomStats(rng, focus),
    traits: randomTraits(rng, rng.int(2, 3)),
  });
}

/** A family around a new governor: maybe a spouse, maybe children. */
export function makeFamily(s: GameState, rng: Rng, gov: Character): void {
  const age = ageOf(s, gov);
  if (age < 22 || rng.chance(0.25)) return;
  const n = s.nations[gov.nation];
  const spouse = makeCharacter(s, rng, {
    nation: gov.nation,
    culture: n.culture,
    religion: n.religion,
    female: !gov.female,
    age: Math.max(18, age - rng.int(-3, 8)),
  });
  marry(s, gov, spouse);
  const kids = age > 30 ? rng.int(0, 3) : rng.int(0, 1);
  const mother = gov.female ? gov : spouse;
  const father = gov.female ? spouse : gov;
  for (let i = 0; i < kids; i++) {
    const kidAge = rng.int(0, Math.max(0, Math.min(18, ageOf(s, mother) - 18)));
    birth(s, rng, father, mother, kidAge);
  }
}

export function marry(_s: GameState, a: Character, b: Character): void {
  a.spouse = b.id;
  b.spouse = a.id;
  // The wife takes her husband's family name, as was usual (natives keep
  // their clans).
  if (a.religion === "native" || b.religion === "native") return;
  if (b.female) b.family = a.family;
  else a.family = b.family;
}

export function birth(
  s: GameState,
  rng: Rng,
  father: Character,
  mother: Character,
  ageYears = 0,
): Character {
  const n = s.nations[father.nation] ?? s.nations[mother.nation];
  const stats = {} as Stats;
  for (const st of STATS) {
    stats[st] = Math.max(
      STAT_MIN,
      Math.min(
        STAT_MAX,
        Math.round((father.stats[st] + mother.stats[st]) / 2 + rng.int(-2, 2)),
      ),
    );
  }
  const native = n?.kind === "native" || mother.religion === "native";
  const kid = makeCharacter(s, rng, {
    nation: native ? mother.nation : father.nation,
    culture: native ? mother.culture : n.culture,
    religion: native ? mother.religion : father.religion,
    age: ageYears,
    // Clans pass from the mother.
    family: native ? mother.family : father.family,
    stats,
    traits: randomTraits(rng, rng.int(0, 2)),
    father: father.id,
    mother: mother.id,
  });
  // Siblings don't share a name (unless the first has died).
  const taken = new Set(
    mother.children
      .map((id) => s.chars[id])
      .filter((x) => x?.alive && x.female === kid.female)
      .map((x) => x.first),
  );
  const pool = native
    ? kid.female
      ? NATIVE_NAMES.female
      : NATIVE_NAMES.male
    : (NAMES[kid.culture] ?? NAMES.english)[kid.female ? "female" : "male"];
  for (let i = 0; i < 6 && taken.has(kid.first); i++)
    kid.first = rng.pick(pool)!;
  if (mother.home !== undefined) kid.home = mother.home;
  else if (father.home !== undefined) kid.home = father.home;
  father.children.push(kid.id);
  mother.children.push(kid.id);
  return kid;
}

// ---------------------------------------------------------------- monthly life

export function charactersMonthly(g: ConquestGame): void {
  const s = g.s;
  for (const nation of s.nations) {
    if (!nation.alive || nation.kind === "crown" || nation.kind === "rebels")
      continue;
    const people = nationCharacters(s, nation.id);
    for (const c of people) {
      if (!c.alive || c.abroad) continue;
      forget(g, c);
      if (skipped(g, c.id)) continue;
      if (rollDeath(g, c)) continue;
      rollBirth(g, c);
      scheme(g, c);
    }
    refillCourt(g, nation.id);
    const ruler = s.chars[nation.ruler];
    if (ruler) {
      const heir = findHeir(s, ruler);
      if (heir !== nation.heir) g.nation(nation.id).heir = heir;
    }
  }
}

/** Everyone who belongs to a nation's court: ruler, family, council, court. */
export function nationCharacters(s: GameState, n: number): Character[] {
  const nation = s.nations[n];
  const ids = new Set<number>();
  const ruler = s.chars[nation.ruler];
  if (ruler) {
    ids.add(ruler.id);
    if (ruler.spouse >= 0) ids.add(ruler.spouse);
    for (const k of ruler.children) ids.add(k);
  }
  for (const seat of SEATS)
    if (nation.council[seat] >= 0) ids.add(nation.council[seat]);
  for (const c of nation.court) ids.add(c);
  const out: Character[] = [];
  for (const id of ids) {
    const c = s.chars[id];
    if (c) out.push(c);
  }
  return out;
}

function forget(g: ConquestGame, c: Character): void {
  const keep = c.memories.filter((m) => m.until === 0 || m.until > g.s.day);
  if (keep.length !== c.memories.length) g.touchChar(c).memories = keep;
}

export function remember(
  g: ConquestGame,
  c: Character,
  m: Omit<Memory, "until"> & { years?: number },
): void {
  const until =
    m.years === undefined ? 0 : g.s.day + Math.round(m.years * DAYS_PER_YEAR);
  g.touchChar(c).memories.push({ of: m.of, why: m.why, value: m.value, until });
}

function rollDeath(g: ConquestGame, c: Character): boolean {
  const s = g.s;
  const risk = deathRisk(s, g.w, c).total;
  if (!g.rng.chance(risk / 12)) return false;
  const age = ageOf(s, c);
  const n = s.nations[c.nation];
  const cause =
    age >= 60
      ? `old age at ${age}`
      : g.w.tropical[n.capital] && g.rng.chance(0.6)
        ? `a fever at ${age}`
        : hasTrait(c, "sickly")
          ? `a long illness at ${age}`
          : `illness at ${age}`;
  kill(g, c, cause);
  return true;
}

export function kill(g: ConquestGame, c: Character, cause: string): void {
  const s = g.s;
  const ch = g.touchChar(c);
  ch.alive = false;
  ch.died = { day: s.day, cause };
  ch.scheme = null;
  if (ch.spouse >= 0 && s.chars[ch.spouse]) g.char(ch.spouse).spouse = -1;
  const n = s.nations[ch.nation];
  if (!n) {
    for (const h of hooks.death) h(g, ch, cause);
    return;
  }
  const important =
    n.ruler === ch.id ||
    (Object.values(n.council) as number[]).includes(ch.id) ||
    isFamily(s, n.ruler, ch.id);
  if (important) g.event({ k: "died", day: s.day, n: n.id, c: ch.id, cause });
  for (const seat of SEATS)
    if (n.council[seat] === ch.id) g.nation(n.id).council[seat] = -1;
  if (n.court.includes(ch.id))
    g.nation(n.id).court = n.court.filter((x) => x !== ch.id);
  if (n.ruler === ch.id) succession(g, n.id);
  for (const h of hooks.death) h(g, ch, cause);
}

function isFamily(s: GameState, ruler: number, c: number): boolean {
  const r = s.chars[ruler];
  return !!r && (r.spouse === c || r.children.includes(c));
}

function rollBirth(g: ConquestGame, c: Character): void {
  const s = g.s;
  if (!c.female || c.spouse < 0) return;
  if (s.day - c.lastBirth < 300) return;
  const chance = birthChance(s, c).total;
  if (chance <= 0 || !g.rng.chance(chance / 12)) return;
  const father = g.char(c.spouse);
  const kid = birth(s, g.rng, father, g.touchChar(c), 0);
  g.touchChar(kid);
  c.lastBirth = s.day;
  for (const h of hooks.birth) h(g, kid, c, father);
  const n = s.nations[father.nation];
  if (n && (n.ruler === father.id || n.ruler === c.id))
    g.event({ k: "born", day: s.day, n: n.id, c: kid.id });
}

function scheme(g: ConquestGame, c: Character): void {
  const s = g.s;
  const n = s.nations[c.nation];
  if (n.kind !== "power" || c.id === n.ruler || ageOf(s, c) < ADULT_AGE) return;
  if (isFamily(s, n.ruler, c.id)) return;
  const opinion = opinionOfRuler(s, c).total;
  if (!c.scheme) {
    const wants =
      c.ambition === "governorship" ||
      hasTrait(c, "deceitful") ||
      hasTrait(c, "greedy");
    if (opinion > -25 || !wants) return;
    let kind: SchemeKind =
      c.ambition === "governorship"
        ? "slander"
        : hasTrait(c, "greedy")
          ? "embezzle"
          : "incite";
    if ((hasTrait(c, "cruel") || hasTrait(c, "deceitful")) && opinion < -60)
      kind = "murder";
    g.touchChar(c).scheme = {
      kind,
      target: n.ruler,
      started: s.day,
      progress: 0,
      exposed: false,
    };
    return;
  }
  const sc = g.touchChar(c).scheme!;
  if (opinion > 0 && !sc.exposed) {
    c.scheme = null;
    return;
  }
  if (!sc.exposed && g.rng.chance(discoveryChance(s, c).total)) {
    sc.exposed = true;
    g.event({
      k: "scheme",
      day: s.day,
      n: n.id,
      c: c.id,
      s: sc.kind,
      done: false,
    });
  }
  sc.progress = Math.min(
    100,
    sc.progress + schemeSpeed(s, c).total * (sc.exposed ? 0.5 : 1),
  );
  if (sc.progress >= 100) {
    finishScheme(g, c);
  }
}

function finishScheme(g: ConquestGame, c: Character): void {
  const s = g.s;
  const sc = c.scheme!;
  const n = g.nation(c.nation);
  g.event({
    k: "scheme",
    day: s.day,
    n: n.id,
    c: c.id,
    s: sc.kind,
    done: true,
  });
  if (sc.kind === "slander") {
    n.mods.push({
      key: "slander",
      label: `${charName(c)}'s letters to court`,
      until: s.day + 2 * DAYS_PER_YEAR,
      fx: { favor: -15 },
    });
  } else if (sc.kind === "embezzle") {
    n.gold -= Math.max(10, Math.round(Math.max(0, n.gold) * 0.15));
  } else if (sc.kind === "incite") {
    const provs = provincesOf(s, n.id);
    const p = provs.length > 0 ? provs[g.rng.int(0, provs.length - 1)] : -1;
    if (p >= 0)
      g.prov(p).mods.push({
        key: "incited",
        label: `Stirred up by ${charName(c)}`,
        until: s.day + 365,
        fx: { unrest: 25 },
      });
  } else if (sc.kind === "murder") {
    const target = s.chars[sc.target];
    if (target?.alive && n.ruler === target.id)
      kill(g, target, `poison, by ${charName(c)}'s hand`);
  }
  g.touchChar(c).scheme = null;
}

function refillCourt(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = s.nations[n];
  const living = nation.court.filter((id) => s.chars[id]?.alive);
  if (nation.kind !== "power") {
    for (const seat of ["marshal", "envoy"] as Seat[]) {
      if (nation.council[seat] < 0)
        g.nation(n).council[seat] = makeNotable(s, g.rng, n, seat).id;
    }
    return;
  }
  if (living.length < 3 && g.rng.chance(0.25)) {
    const c = makeNotable(s, g.rng, n);
    g.touchChar(c);
    g.nation(n).court = [...living, c.id];
  }
}

// ---------------------------------------------------------------- succession

/** The ruler is gone: the heir takes over, or the crown (or elders) choose. */
export function succession(g: ConquestGame, n: number, how?: string): void {
  const s = g.s;
  const nation = g.nation(n);
  const old = s.chars[nation.ruler];
  let next: Character | undefined;
  let why = how ?? "";
  if (nation.kind === "native") {
    let chosen = -1;
    for (const h of hooks.successor) {
      chosen = h(g, n);
      if (chosen >= 0) break;
    }
    const elder = s.chars[nation.council.marshal];
    if (chosen >= 0 && s.chars[chosen]?.alive) {
      next = s.chars[chosen];
      for (const seat of SEATS)
        if (nation.council[seat] === next.id) nation.council[seat] = -1;
      why = "chosen by the council fire";
    } else if (elder?.alive && g.rng.chance(0.5)) {
      next = elder;
      nation.council.marshal = -1;
      why = "chosen by the elders from the war chiefs";
    } else {
      next = makeCharacter(s, g.rng, {
        nation: n,
        culture: nation.culture,
        religion: nation.religion,
        female: false,
        age: g.rng.int(30, 50),
        title: `${nativeTitle(nation.key)} of the ${nation.name}`,
        stats: randomStats(g.rng, g.rng.pick(STATS)),
      });
      why = "chosen by the elders";
    }
    next.title = `${nativeTitle(nation.key)} of the ${nation.name}`;
  } else {
    const heir = old ? s.chars[findHeir(s, old)] : undefined;
    if (heir?.alive && !how) {
      next = heir;
      why =
        ageOf(s, heir) < ADULT_AGE
          ? `inherited at ${ageOf(s, heir)}; the council governs in their name`
          : "inherited from their parent";
      nation.mods.push({
        key: "new-governor",
        label: "A governor the crown didn't choose",
        until: s.day + DAYS_PER_YEAR,
        fx: { favor: -5 },
      });
    } else {
      let picked = -1;
      for (const h of hooks.successor) {
        picked = h(g, n);
        if (picked >= 0) break;
      }
      const candidates = SEATS.map(
        (seat) => s.chars[nation.council[seat]],
      ).filter((c): c is Character => !!c?.alive);
      if (picked >= 0 && s.chars[picked]?.alive) {
        candidates.splice(0, candidates.length, s.chars[picked]);
        why = why || "appointed by the crown";
      }
      candidates.sort(
        (a, b) =>
          stat(s, b, "ste") +
          stat(s, b, "dip") -
          (stat(s, a, "ste") + stat(s, a, "dip")),
      );
      next = candidates[0];
      if (next) {
        for (const seat of SEATS)
          if (nation.council[seat] === next.id) nation.council[seat] = -1;
        why = why || "appointed by the crown from the council";
      } else {
        next = randomGovernor(s, g.rng, n);
        why = why || "sent out by the crown";
      }
      nation.mods.push({
        key: "crown-pick",
        label: "The crown's own choice",
        until: s.day + 2 * DAYS_PER_YEAR,
        fx: { favor: 10 },
      });
    }
  }
  g.touchChar(next);
  next.ambition = null;
  next.scheme = null;
  nation.ruler = next.id;
  nation.court = nation.court.filter((id) => id !== next!.id);
  nation.heir = findHeir(s, next);
  g.event({ k: "succession", day: s.day, n, c: next.id, how: why });
}

// ---------------------------------------------------------------- commands

export function characterCommand(
  g: ConquestGame,
  n: number,
  c: Command,
): string | null {
  const s = g.s;
  const nation = s.nations[n];
  switch (c.k) {
    case "appoint": {
      if (!SEATS.includes(c.seat)) return "No such seat.";
      const check = appointCheck(s, n, c.seat, c.c);
      if (!check.ok) return check.why;
      const n2 = g.nation(n);
      const prev = s.chars[n2.council[c.seat]];
      if (prev?.alive) {
        remember(g, prev, {
          of: -1,
          why: `Dismissed as ${SEAT_NAMES[c.seat].toLowerCase()}`,
          value: -20,
          years: 3,
        });
        if (!n2.court.includes(prev.id)) n2.court.push(prev.id);
      }
      n2.council[c.seat] = c.c;
      n2.court = n2.court.filter((x) => x !== c.c);
      remember(g, g.char(c.c), {
        of: -1,
        why: `Made ${SEAT_NAMES[c.seat].toLowerCase()}`,
        value: 15,
        years: 3,
      });
      return null;
    }
    case "dismiss": {
      if (!SEATS.includes(c.seat)) return "No such seat.";
      const id = nation.council[c.seat];
      if (id < 0) return "Nobody sits there.";
      const n2 = g.nation(n);
      n2.council[c.seat] = -1;
      const prev = s.chars[id];
      if (prev?.alive) {
        remember(g, g.char(id), {
          of: -1,
          why: `Dismissed as ${SEAT_NAMES[c.seat].toLowerCase()}`,
          value: -20,
          years: 3,
        });
        if (!n2.court.includes(id)) n2.court.push(id);
      }
      return null;
    }
    case "marry": {
      const check = marryCheck(s, n, c.a, c.b);
      if (!check.ok) return check.why;
      const a = g.char(c.a);
      const b = g.char(c.b);
      const other = b.nation;
      marry(s, a, b);
      remember(g, b, {
        of: -1,
        why: "Married into the governor's family",
        value: 25,
        years: 10,
      });
      if (other !== n && s.nations[other]?.kind === "power") {
        const mine = g.nation(n);
        const theirs = g.nation(other);
        (mine.relations[other] ??= []).push({
          of: -1,
          why: "Marriage ties",
          value: 20,
          until: s.day + 20 * DAYS_PER_YEAR,
        });
        (theirs.relations[n] ??= []).push({
          of: -1,
          why: "Marriage ties",
          value: 20,
          until: s.day + 20 * DAYS_PER_YEAR,
        });
        b.nation = n;
        theirs.court = theirs.court.filter((x) => x !== b.id);
      } else {
        g.nation(n).court = s.nations[n].court.filter((x) => x !== b.id);
      }
      g.event({ k: "married", day: s.day, n, a: a.id, b: b.id });
      return null;
    }
    case "confront": {
      const ch = s.chars[c.c];
      if (!ch?.alive || ch.nation !== n) return "They're not at your court.";
      if (!ch.scheme?.exposed) return "You have no proof against them.";
      const n2 = g.nation(n);
      for (const seat of SEATS)
        if (n2.council[seat] === ch.id) n2.council[seat] = -1;
      n2.court = n2.court.filter((x) => x !== ch.id);
      const t = g.touchChar(ch);
      t.scheme = null;
      t.alive = false;
      t.died = { day: s.day, cause: "banished back to Europe" };
      g.event({
        k: "story",
        day: s.day,
        n,
        title: "Banished",
        text: `${charName(ch)} was caught plotting and sent home in disgrace.`,
      });
      return null;
    }
    default:
      return "Unknown command.";
  }
}

/** Every seat on a nation's council, in order. */
export const COUNCIL_SEATS = SEATS;

/** The candidates for a seat: living adults at court, best first. */
export function seatCandidates(
  s: GameState,
  n: number,
  seat: Seat,
): Character[] {
  const nation = s.nations[n];
  const ruler = s.chars[nation.ruler];
  const pool = new Set<number>(nation.court);
  for (const st of SEATS)
    if (nation.council[st] >= 0) pool.add(nation.council[st]);
  if (ruler) {
    if (ruler.spouse >= 0) pool.add(ruler.spouse);
    for (const k of ruler.children) pool.add(k);
  }
  return [...pool]
    .map((id) => s.chars[id])
    .filter(
      (c): c is Character =>
        !!c?.alive && c.id !== nation.ruler && ageOf(s, c) >= ADULT_AGE,
    )
    .sort((a, b) => stat(s, b, SEAT_STAT[seat]) - stat(s, a, SEAT_STAT[seat]));
}
