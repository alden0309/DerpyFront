// TOWNS (r17): the towns' month, and what becomes of a town's places and
// people when it changes hands. Loaded by Game.ts; everything here runs on
// the towns' own dice.
//
// A town that's taken keeps its places as ruins rather than losing them:
// the game remembers what stood (the wharf, the church, the fort, the
// court-house) and what was burned in an occupation or left to rot when the
// settlers fled, and the town's government can repair it by vote. A native
// nation that takes a port keeps its landing (the beach and trading place
// where canoes put in and traders' boats anchor), which serves as its docks.
// When colonists are driven out, their townsfolk go with the settlers and
// the nation's own people move in; under a new crown, some of the old
// families leave rather than stay.

import { householdsOf, makeLocal, postsIn, rolesFor } from "./Folk";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { isNativeChar } from "./LifeQueries";
import { LOCALS_CAP } from "./LifeRules";
import { kmBetween } from "./Map";
import { leave, newcomersMonthly } from "./Newcomers";
import { provincesOf, settlers } from "./Queries";
import { tdice, townsChanged, townsState } from "./TownsCore";
import type { BuildingKind, Character, TownRuin } from "./Types";
import { lapseWorks, townsCommand, worksMonthly } from "./Works";
import { RUIN_WORK, TOWN_WORKS } from "./WorksCore";

// ---------------------------------------------------------------- remembering what stood

const PUBLIC: BuildingKind[] = ["port", "church", "fort", "courthouse"];

/** Remember what stands in every town, and note what's been lost (or rebuilt) since. */
function watchPlaces(g: ConquestGame): void {
  const s = g.s;
  const t = townsState(g);
  for (let p = 0; p < s.provinces.length; p++) {
    const pr = s.provinces[p];
    const had = t.built[p];
    if (!had && !PUBLIC.some((b) => (pr.b[b] ?? 0) > 0)) continue;
    notePlaces(g, p, pr.occupier >= 0 ? pr.occupier : -1);
  }
}

/** Compare what stands with what stood: losses become ruins, gains mend them. */
function notePlaces(g: ConquestGame, p: number, by: number): void {
  const s = g.s;
  const t = townsState(g);
  const pr = s.provinces[p];
  const had = (t.built[p] ??= {});
  for (const b of PUBLIC) {
    const was = had[b] ?? 0;
    const now = pr.b[b] ?? 0;
    if (now < was) {
      addRuin(
        g,
        p,
        b,
        was - now,
        by,
        pr.devastation >= 0.3 ? "burned" : "abandoned",
      );
    } else if (now > was) mendRuin(g, p, b, now - was);
    if (now > 0) had[b] = now;
    else delete had[b];
  }
  if (!Object.keys(had).length) delete t.built[p];
}

function addRuin(
  g: ConquestGame,
  p: number,
  b: BuildingKind,
  lvl: number,
  by: number,
  how: TownRuin["how"],
): void {
  const key = RUIN_WORK[b];
  if (!key) return;
  const t = townsState(g);
  const list = (t.ruins[p] ??= []);
  const old = list.find((r) => r.key === key);
  if (old) {
    old.lvl += lvl;
    old.day = g.s.day;
    if (by >= 0) old.by = by;
    if (how === "burned") old.how = how;
  } else list.push({ key, lvl, day: g.s.day, by, how });
  townsChanged(g);
}

function mendRuin(
  g: ConquestGame,
  p: number,
  b: BuildingKind,
  lvl: number,
): void {
  const key = RUIN_WORK[b];
  const t = townsState(g);
  const ru = (t.ruins[p] ?? []).find((r) => r.key === key);
  if (!ru) return;
  ru.lvl -= lvl;
  if (ru.lvl <= 0) t.ruins[p] = t.ruins[p].filter((r) => r !== ru);
  if (!t.ruins[p].length) delete t.ruins[p];
  townsChanged(g);
}

// ---------------------------------------------------------------- a town changes hands

/**
 * WAR/TOWNS (r17): a province changed hands. Called from the ownership
 * changes (and by the month's look for any it missed); a second call for
 * the same change does nothing.
 */
export function townTaken(
  g: ConquestGame,
  p: number,
  from: number,
  to: number,
): void {
  const s = g.s;
  const t = townsState(g);
  if (t.held[p] === to || from === to) {
    t.held[p] = to;
    return;
  }
  t.held[p] = to;
  const pr = s.provinces[p];
  if (!pr) return;
  const fromN = s.nations[from];
  const toN = s.nations[to];
  // What stood is remembered: anything gone now is a ruin (burned if the
  // town was laid waste, left to rot if the settlers fled).
  notePlaces(g, p, pr.devastation >= 0.3 ? to : -1);
  const ruins = t.ruins[p] ?? [];
  // A native nation keeps the landing of a port it takes, unless it was burned.
  if (toN?.kind === "native" && g.map.provinces[p]?.coastal) {
    const wharf = ruins.find((r) => r.key === "wharf");
    if (wharf && wharf.how !== "burned" && !(pr.b.port ?? 0)) {
      g.prov(p).b.port = 1;
      mendRuin(g, p, "port", 1);
      (t.built[p] ??= {}).port = 1;
    }
  }
  // The town's own works: what the settlers left rots.
  if (toN?.kind === "native" && fromN?.kind === "power") {
    const kept = t.kept[p] ?? {};
    for (const key of Object.keys(kept) as (keyof typeof kept)[]) {
      if (TOWN_WORKS[key].native) continue;
      delete kept[key];
      g.prov(p).mods = pr.mods.filter((m) => m.key !== `town:${key}`);
      (t.ruins[p] ??= []).push({
        key,
        lvl: 1,
        day: s.day,
        by: -1,
        how: "abandoned",
      });
    }
    if (!Object.keys(kept).length) delete t.kept[p];
  }
  townsChanged(g);
  lapseWorks(
    g,
    p,
    `${g.map.provinces[p]?.name ?? "the town"} is in ${toN?.adjective ?? "other"} hands`,
  );
  peopleTaken(g, p, from, to);
}

/** Whether a household is someone a player is bound up with (they stay). */
function playersOwn(g: ConquestGame, c: Character): boolean {
  const s = g.s;
  for (const life of s.lives) {
    if (life.c === c.id || life.ties[c.id] || life.job?.employer === c.id)
      return true;
    const me = s.chars[life.c];
    if (!me) continue;
    if ([me.spouse, me.father, me.mother].includes(c.id)) return true;
    if (me.children.includes(c.id) || c.children.includes(me.id)) return true;
  }
  return false;
}

function familyAt(g: ConquestGame, head: Character, p: number): Character[] {
  const s = g.s;
  const out = [head];
  const sp = s.chars[head.spouse];
  if (sp?.alive && (sp.home === undefined || sp.home === p)) out.push(sp);
  for (const k of head.children) {
    const kid = s.chars[k];
    if (kid?.alive && !kid.abroad && (kid.home === undefined || kid.home === p))
      out.push(kid);
  }
  return out;
}

/** The nearest town of a nation (another than this one). */
function nearestOf(g: ConquestGame, n: number, p: number): number | undefined {
  if (n < 0) return undefined;
  return provincesOf(g.s, n)
    .filter((q) => q !== p)
    .sort(
      (a, b) => kmBetween(g.map, p, a) - kmBetween(g.map, p, b) || a - b,
    )[0];
}

/** Under new rule, a share of the old families leave: all of them, if the settlers have fled. */
export const LEAVE_UNDER = { fled: 1, crown: 0.3 } as const;

function peopleTaken(
  g: ConquestGame,
  p: number,
  from: number,
  to: number,
): void {
  const s = g.s;
  const list = s.locals[p];
  if (!list) return;
  const fromN = s.nations[from];
  const toN = s.nations[to];
  if (!toN) return;
  const r = tdice(g);
  const fled =
    toN.kind === "native" &&
    fromN?.kind === "power" &&
    settlers(s.provinces[p]) < 50;
  const share = fled
    ? LEAVE_UNDER.fled
    : toN.kind === "power" && fromN?.kind === "power"
      ? LEAVE_UNDER.crown
      : 0;
  if (share > 0) {
    const refuge = nearestOf(g, from, p);
    for (const id of [...list]) {
      const c = s.chars[id];
      if (!c?.alive) continue;
      // The settlers' flight takes every colonist; under a new crown, some of
      // the old crown's families go, and the posts stay (the innkeeper keeps his inn).
      if (fled ? isNativeChar(s, c) : c.culture !== fromN?.culture || !!c.role)
        continue;
      if (playersOwn(g, c)) continue;
      if (!fled && !r.chance(share)) continue;
      const fam = familyAt(g, c, p).filter((x) => !playersOwn(g, x));
      leave(
        g,
        p,
        c,
        fam,
        refuge,
        fled
          ? " with the settlers"
          : ` rather than live under the ${toN.adjective}`,
      );
    }
  }
  // The new holders' own people take up the town's posts.
  fillPosts(g, p, fled ? LOCALS_CAP : 3);
}

/** The posts a town has room for and nobody holds: filled now, on the towns' own dice. */
function fillPosts(g: ConquestGame, p: number, max: number): void {
  const s = g.s;
  const pr = s.provinces[p];
  const native = s.nations[pr.owner]?.kind === "native";
  if (!native && settlers(pr) < 50) return;
  const r = tdice(g);
  const list = (s.locals[p] ??= []);
  const have = new Set(
    list
      .map((id) => s.chars[id])
      .filter((c) => c?.alive)
      .map((c) => c!.role),
  );
  let made = 0;
  for (const role of rolesFor(g, p)) {
    if (made >= max || postsIn(s, list) >= LOCALS_CAP) break;
    if (have.has(role)) continue;
    const c = makeLocal(g, p, role, true, r);
    list.push(c.id);
    have.add(role);
    made++;
  }
  if (made) g.localsChanged(p);
}

// ---------------------------------------------------------------- the month

/** Changes of hands nobody called the hook for (a purchase, a breakaway, an abandoned colony). */
function sweepHolders(g: ConquestGame): void {
  const s = g.s;
  const t = townsState(g);
  for (let p = 0; p < s.provinces.length; p++) {
    const owner = s.provinces[p].owner;
    const was = t.held[p];
    if (was === undefined) {
      if (owner >= 0) t.held[p] = owner;
      continue;
    }
    if (was !== owner) townTaken(g, p, was, owner);
  }
}

export function townsMonthly(g: ConquestGame): void {
  sweepHolders(g);
  watchPlaces(g);
  newcomersMonthly(g);
  worksMonthly(g);
}

/** A new world: what stands everywhere, and who holds it, from the first day. */
function remember(g: ConquestGame): void {
  const s = g.s;
  const t = townsState(g);
  for (let p = 0; p < s.provinces.length; p++) {
    const pr = s.provinces[p];
    if (pr.owner >= 0) t.held[p] = pr.owner;
    for (const b of PUBLIC)
      if ((pr.b[b] ?? 0) > 0) (t.built[p] ??= {})[b] = pr.b[b];
  }
}

/** Households of a town (for tests and the page): the town's people. */
export function townPeople(g: ConquestGame, p: number): Character[] {
  return householdsOf(g.s, p);
}

hooks.monthEnd.push(townsMonthly);
hooks.provinceTaken.push(townTaken);
hooks.command.push(townsCommand);
hooks.created.push(remember);
