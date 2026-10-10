// The people of a province: the tavern keeper, the minister, the sergeant,
// the planter and their families in a colony; the sachem, the healer, the
// clan mother and the makers in a native village. They're made the first
// time a player comes by, and from then on they live: they age, marry,
// have children and die, and their posts pass on.

import {
  birth,
  kill,
  makeCharacter,
  marry,
  nationCharacters,
} from "./Characters";
import type { ConquestGame } from "./Game";
import { hooks, skipped } from "./Hooks";
import { placesIn } from "./LifeQueries";
import { LOCALS_CAP, ROLES } from "./LifeRules";
import { ageOf, birthChance, deathRisk, hasTrait, settlers } from "./Queries";
import type { Character, GameState, RoleId, Stat } from "./Types";

/** The roles a province has room for, in the order they're filled. */
export function rolesFor(g: ConquestGame, p: number): RoleId[] {
  const s = g.s;
  const pr = s.provinces[p];
  const owner = pr.owner >= 0 ? s.nations[pr.owner] : undefined;
  const places = placesIn(s, g.w, p);
  const has = (k: Parameters<typeof places.includes>[0]) => places.includes(k);
  const out: RoleId[] = [];
  if (owner?.kind === "power") {
    out.push("innkeeper");
    if (has("market")) out.push("merchant");
    if (has("fields")) out.push("planter");
    if (has("church")) out.push("preacher");
    if (has("fort")) out.push("sergeant");
    if (has("workshop")) out.push("master");
    if (has("docks")) out.push("captain");
    if (has("governor")) out.push("official", "lawyer");
    if (has("press")) out.push("printer");
    if (has("apothecary")) out.push("physician");
    // LIFE (r11): the law of the town, and the other side of it.
    if (has("gaol")) out.push("constable");
    if (has("den")) out.push("fence");
    // Common folk, so the fort, the docks and the fields have people in them.
    if (has("fort")) out.push("soldier");
    if (has("docks")) out.push("sailor");
    out.push("labourer");
    if (has("fort") && settlers(pr) >= 1500) out.push("soldier");
  } else if (owner?.kind === "native") {
    out.push("sachem", "warleader", "elder", "healer", "trader", "maker");
    if (has("woods")) out.push("hunter");
    out.push("youngwarrior");
  } else {
    // Open country: whoever lives off the land there.
    if (has("village")) out.push("elder", "hunter", "trader");
    else if (has("woods")) out.push("hunter");
  }
  return out.slice(0, LOCALS_CAP);
}

/** The people who live in a nation's land and act for it (natives' nearest). */
function folkNation(g: ConquestGame, p: number): number {
  const s = g.s;
  const pr = s.provinces[p];
  if (pr.owner >= 0) return pr.owner;
  // Open country: the nearest living native nation by hops.
  const seen = new Set([p]);
  let ring = [p];
  for (let hop = 0; hop < 6 && ring.length; hop++) {
    const next: number[] = [];
    for (const q of ring)
      for (const [r] of g.map.provinces[q].nb) {
        if (seen.has(r)) continue;
        seen.add(r);
        const o = s.provinces[r].owner;
        if (o >= 0 && s.nations[o].kind === "native" && s.nations[o].alive)
          return o;
        next.push(r);
      }
    ring = next;
  }
  return s.nations.findIndex((n) => n.kind === "native" && n.alive);
}

const ROLE_STAT: Record<RoleId, Stat> = {
  innkeeper: "dip",
  preacher: "lea",
  merchant: "ste",
  captain: "mar",
  sergeant: "mar",
  master: "ste",
  printer: "lea",
  planter: "ste",
  physician: "lea",
  official: "int",
  lawyer: "dip",
  sachem: "dip",
  warleader: "mar",
  healer: "lea",
  hunter: "int",
  elder: "ste",
  trader: "dip",
  maker: "ste",
  soldier: "mar",
  sailor: "mar",
  labourer: "ste",
  youngwarrior: "mar",
  // LIFE (r11)
  constable: "mar",
  fence: "int",
};

/** Someone to fill a role in a province, with a family around them. */
export function makeLocal(
  g: ConquestGame,
  p: number,
  role: RoleId,
  withFamily = true,
): Character {
  const s = g.s;
  const rng = g.rng;
  const n = folkNation(g, p);
  const nation = s.nations[Math.max(0, n)];
  const native = ROLES[role].native || nation.kind === "native";
  const stats = {
    dip: rng.int(3, 8),
    mar: rng.int(3, 8),
    ste: rng.int(3, 8),
    int: rng.int(3, 8),
    lea: rng.int(3, 8),
  };
  stats[ROLE_STAT[role]] = Math.min(14, stats[ROLE_STAT[role]] + rng.int(2, 5));
  // Clan mothers are women; sergeants and captains men; the rest either.
  const female =
    role === "elder"
      ? true
      : role === "sergeant" ||
          role === "soldier" ||
          role === "sailor" ||
          role === "youngwarrior" ||
          role === "captain" ||
          role === "warleader" ||
          role === "official" ||
          role === "lawyer" ||
          role === "preacher" ||
          role === "sachem" ||
          role === "constable"
        ? false
        : rng.chance(native ? 0.4 : 0.2);
  const c = makeCharacter(s, rng, {
    nation: Math.max(0, n),
    culture: nation.culture,
    religion: native ? "native" : nation.religion,
    female,
    age: ROLES[role].status <= 1 ? rng.int(17, 40) : rng.int(26, 58),
    stats,
  });
  c.home = p;
  c.role = role;
  g.touchChar(c);
  if (withFamily && ageOf(s, c) >= 22 && rng.chance(0.7)) {
    const spouse = makeCharacter(s, rng, {
      nation: c.nation,
      culture: c.culture,
      religion: c.religion,
      female: !c.female,
      age: Math.max(18, ageOf(s, c) + rng.int(-8, 4)),
    });
    spouse.home = p;
    marry(s, c, spouse);
    const mother = c.female ? c : spouse;
    const father = c.female ? spouse : c;
    const kids = rng.int(0, 3);
    for (let i = 0; i < kids; i++) {
      const top = Math.min(26, ageOf(s, mother) - 17);
      if (top < 0) break;
      const kid = birth(s, rng, father, mother, rng.int(0, top));
      kid.home = p;
    }
  }
  return c;
}

/** Make a province's people the first time someone comes looking. */
export function seedLocals(g: ConquestGame, p: number): number[] {
  const s = g.s;
  if (s.locals[p]) return s.locals[p];
  const ids = rolesFor(g, p).map((r) => makeLocal(g, p, r).id);
  s.locals[p] = ids;
  g.localsChanged(p);
  return ids;
}

/** Everyone who lives in a province: the townsfolk and their families. */
export function householdsOf(s: GameState, p: number): Character[] {
  const out: Character[] = [];
  const seen = new Set<number>();
  for (const id of s.locals[p] ?? []) {
    const c = s.chars[id];
    if (!c) continue;
    for (const x of [
      c,
      s.chars[c.spouse],
      ...c.children.map((k) => s.chars[k]),
    ]) {
      if (!x?.alive || x.abroad || seen.has(x.id)) continue;
      if (x.home !== undefined && x.home !== p) continue;
      seen.add(x.id);
      out.push(x);
    }
  }
  return out;
}

// ---------------------------------------------------------------- the months

/** Who the nations' own round looks after (rulers, families, councils, courts). */
function courtSet(s: GameState): Set<number> {
  const set = new Set<number>();
  for (const n of s.nations) {
    if (!n.alive || n.kind === "crown") continue;
    for (const c of nationCharacters(s, n.id)) set.add(c.id);
  }
  return set;
}

/**
 * Townsfolk and players' families: old age and fevers, weddings among
 * neighbours, babies, and somebody new taking up a post that's fallen empty.
 */
export function folkMonthly(g: ConquestGame): void {
  const s = g.s;
  const court = courtSet(s);
  const ids = Object.keys(s.chars).map(Number);
  for (const id of ids) {
    const c = s.chars[id];
    if (!c?.alive || c.abroad) continue;
    const played = skipped(g, id);
    const inCourt = court.has(id) && !played;
    if (inCourt) continue;
    // Folk who never matter to anyone (no home, no role, no family) stay
    // as they are; everyone else lives.
    if (c.home === undefined && !played && c.role === undefined) {
      const sp = s.chars[c.spouse];
      if (!sp || (sp.home === undefined && !skipped(g, sp.id))) continue;
    }
    if (!played && g.rng.chance(deathRisk(s, g.w, c).total / 12)) {
      const age = ageOf(s, c);
      kill(
        g,
        c,
        age < 2
          ? "a fever in infancy"
          : age >= 60
            ? `old age at ${age}`
            : hasTrait(c, "sickly")
              ? `a long illness at ${age}`
              : g.rng.chance(0.3)
                ? `the flux at ${age}`
                : `a fever at ${age}`,
      );
      continue;
    }
    if (c.female && c.spouse >= 0 && s.day - c.lastBirth >= 300) {
      const chance = birthChance(s, c).total;
      if (chance > 0 && g.rng.chance(chance / 12)) {
        const sp = s.chars[c.spouse];
        if (sp?.alive) {
          const kid = birth(s, g.rng, g.touchChar(sp), g.touchChar(c), 0);
          g.touchChar(kid);
          c.lastBirth = s.day;
          for (const h of hooks.birth) h(g, kid, c, sp);
        }
      }
    }
  }
  // Weddings: grown, single townsfolk now and then marry a neighbour.
  for (const key of Object.keys(s.locals)) {
    const p = Number(key);
    if (!g.rng.chance(0.06)) continue;
    const singles = householdsOf(s, p).filter(
      (c) =>
        c.spouse < 0 &&
        ageOf(s, c) >= 18 &&
        ageOf(s, c) <= 40 &&
        !skipped(g, c.id) &&
        !court.has(c.id),
    );
    const a = singles[0];
    const b = singles.find(
      (x) => x.female !== a?.female && x.father !== a?.father,
    );
    if (a && b && (a.father < 0 || a.father !== b.father)) {
      marry(s, g.touchChar(a), g.touchChar(b));
      b.home = a.home = p;
    }
  }
  refillPosts(g);
}

/** A post whose holder died passes to a grown child, or to someone new. */
function refillPosts(g: ConquestGame): void {
  const s = g.s;
  for (const [key, list] of Object.entries(s.locals)) {
    const p = Number(key);
    let changed = false;
    const next: number[] = [];
    for (const id of list) {
      const c = s.chars[id];
      if (c?.alive && !c.abroad && !skipped(g, id)) {
        next.push(id);
        continue;
      }
      changed = true;
      const role = c?.role;
      if (!role) continue;
      // The eldest grown child at home takes it on.
      const heir = (c?.children ?? [])
        .map((k) => s.chars[k])
        .filter(
          (k): k is Character =>
            !!k?.alive &&
            !k.abroad &&
            ageOf(s, k) >= 18 &&
            k.home === p &&
            !k.role &&
            !skipped(g, k.id),
        )
        .sort((a, b) => a.born - b.born)[0];
      if (heir) {
        g.touchChar(heir).role = role;
        next.push(heir.id);
      } else if (g.rng.chance(0.8)) {
        next.push(makeLocal(g, p, role).id);
      }
    }
    // A province that has grown may have room for someone new.
    if (g.rng.chance(0.05)) {
      const want = rolesFor(g, p);
      const have = new Set(next.map((id) => s.chars[id]?.role));
      const missing = want.find((r) => !have.has(r));
      if (missing && next.length < LOCALS_CAP) {
        next.push(makeLocal(g, p, missing).id);
        changed = true;
      }
    }
    if (changed) {
      s.locals[p] = next;
      g.localsChanged(p);
    }
  }
}

/** Grown children of the house: who a player might court. */
export function eligibleHere(s: GameState, p: number): Character[] {
  return householdsOf(s, p).filter(
    (c) => c.spouse < 0 && ageOf(s, c) >= 16 && ageOf(s, c) <= 45,
  );
}
