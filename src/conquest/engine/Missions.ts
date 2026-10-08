// Expeditions and outposts: a party sent into the wilds under a leader the
// governor picks. Expeditions survey land (what it yields, whether it's
// rich); outpost parties raise a palisade fort, on your land or anyone's.
// The journey takes weeks, something usually happens on the way (rapids,
// fever, natives, getting lost, winter), and every choice shows its odds and
// how the leader's skills and traits move them. Some never come back.

import { kill, nationCharacters, remember } from "./Characters";
import type { Ctx, EventDef } from "./Events";
import { raiseEvent, registerEvents } from "./Events";
import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import { isFeverSeason, isWinter, kmBetween, World } from "./Map";
import {
  ageOf,
  charName,
  hasTrait,
  monthOf,
  provincesOf,
  stat,
} from "./Queries";
import { ADULT_AGE, EXPEDITION, OUTPOST, TERRAIN, TRAITS } from "./Rules";
import type {
  Breakdown,
  Character,
  Command,
  GameState,
  Good,
  MapDef,
  Mission,
  TraitId,
} from "./Types";

type Check = { ok: true } | { ok: false; why: string };
const yes: Check = { ok: true };
const no = (why: string): Check => ({ ok: false, why });

export const MAX_MISSIONS = 2;
const RANGE_KM = { explore: 2200, outpost: 1600 };

// ---------------------------------------------------------------- what you know

/** Whether nation `n` knows what province `p` yields. Natives know their world. */
export function isExplored(s: GameState, n: number, p: number): boolean {
  const nation = s.nations[n];
  if (!nation || nation.kind !== "power") return true;
  return nation.explored.includes(p) || s.provinces[p].owner === n;
}

function survey(g: ConquestGame, n: number, ps: number[]): number[] {
  const nation = g.nation(n);
  const found: number[] = [];
  const known = new Set(nation.explored);
  for (const p of ps) {
    if (known.has(p)) continue;
    known.add(p);
    found.push(p);
  }
  if (found.length) nation.explored = [...known].sort((a, b) => a - b);
  return found;
}

// ---------------------------------------------------------------- who can go

/** People who could lead a party: grown, at court, not governing or fighting. */
export function missionLeaders(s: GameState, n: number): Character[] {
  const nation = s.nations[n];
  const busy = new Set<number>([
    nation.ruler,
    ...s.armies.filter((a) => a.owner === n).map((a) => a.commander),
    ...nation.missions.map((m) => m.leader),
  ]);
  return nationCharacters(s, n).filter(
    (c) => c.alive && ageOf(s, c) >= ADULT_AGE && !busy.has(c.id),
  );
}

export interface LeaderFlag {
  text: string;
  good: boolean;
}

/** What would help or hurt this person on the trail, for the picker. */
export function leaderFlags(s: GameState, c: Character): LeaderFlag[] {
  const out: LeaderFlag[] = [];
  const st = (k: Parameters<typeof stat>[2]) => stat(s, c, k);
  const rate = (label: string, v: number, what: string) => {
    if (v >= 9) out.push({ text: `${label} ${v}: ${what}`, good: true });
    else if (v <= 4) out.push({ text: `${label} ${v}: ${what}`, good: false });
  };
  rate("Martial", st("mar"), "forcing a way through rapids and ambushes");
  rate("Learning", st("lea"), "finding the way and treating fevers");
  rate("Diplomacy", st("dip"), "winning over natives on the trail");
  rate("Intrigue", st("int"), "slipping past trouble unseen");
  for (const t of c.traits) {
    const r = TRAITS[t];
    if (!r.trail) continue;
    out.push({ text: `${r.name}: ${r.trail}`, good: TRAIL_GOOD[t] });
  }
  const age = ageOf(s, c);
  if (age >= 55)
    out.push({ text: `Age ${age}: hardship weighs on the old`, good: false });
  return out;
}

const TRAIL_GOOD: Record<TraitId, boolean> = {
  ambitious: true,
  content: true,
  honest: true,
  deceitful: true,
  brave: true,
  craven: false,
  greedy: false,
  generous: true,
  diligent: true,
  lazy: false,
  zealous: false,
  tolerant: true,
  just: true,
  cruel: true,
  robust: true,
  sickly: false,
  educated: true,
  charming: true,
};

// ---------------------------------------------------------------- the journey

/** Your province nearest the target: where the party sets out. */
export function missionStart(
  s: GameState,
  w: World,
  n: number,
  p: number,
): number {
  let best = -1;
  let bestKm = Infinity;
  for (const q of provincesOf(s, n)) {
    if (s.provinces[q].occupier >= 0) continue;
    const km = q === p ? 0 : kmBetween(w.map, q, p);
    if (km < bestKm) {
      bestKm = km;
      best = q;
    }
  }
  return best;
}

export interface MissionRoute {
  /** Provinces from the start to the target, both included. */
  route: number[];
  /** For each hop: by boat. */
  sea: boolean[];
  /** Days for each hop (before the leader's pace). */
  legs: number[];
  landKm: number;
  seaKm: number;
}

/** Canoes and longboats along the coast. */
const BOAT_KM_PER_DAY = 70;
const BOAT_LAUNCH_DAYS = 2;

/**
 * The way a party goes: on foot over land wherever it can, and by boat only
 * across water it can't walk round (to an island, or over a sound when the
 * way round is more than three times as long).
 */
export function missionRoute(
  map: MapDef,
  from: number,
  to: number,
  kind: Mission["kind"],
): MissionRoute {
  const mixed = quickestWay(map, from, to, kind, true);
  const land = quickestWay(map, from, to, kind, false);
  const days = (r: MissionRoute) => r.legs.reduce((a, b) => a + b, 0);
  if (land.route.length > 1 && days(land) <= days(mixed) * 3) return land;
  return mixed;
}

function quickestWay(
  map: MapDef,
  from: number,
  to: number,
  kind: Mission["kind"],
  boats: boolean,
): MissionRoute {
  const rules = kind === "explore" ? EXPEDITION : OUTPOST;
  const count = map.provinces.length;
  const days = new Float64Array(count).fill(Infinity);
  const prev = new Int32Array(count).fill(-1);
  const bySea = new Uint8Array(count);
  const kmTo = new Float64Array(count);
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
    for (const [q, km, river] of map.provinces[u].nb) {
      const speed = TERRAIN[map.provinces[q].terrain].speed;
      const d =
        days[u] + (km * 1.25) / (rules.kmPerDay * speed) + (river ? 1 : 0);
      if (d < days[q]) {
        days[q] = d;
        prev[q] = u;
        bySea[q] = 0;
        kmTo[q] = km;
      }
    }
    if (boats && map.provinces[u].coastal) {
      for (const [q, km] of map.provinces[u].sea) {
        if (km > map.seaLaneKm) break;
        const d = days[u] + BOAT_LAUNCH_DAYS + km / BOAT_KM_PER_DAY;
        if (d < days[q]) {
          days[q] = d;
          prev[q] = u;
          bySea[q] = 1;
          kmTo[q] = km;
        }
      }
    }
  }
  if (from === to || days[to] === Infinity)
    return { route: [from], sea: [], legs: [], landKm: 0, seaKm: 0 };
  const route: number[] = [];
  const sea: boolean[] = [];
  const legs: number[] = [];
  let landKm = 0;
  let seaKm = 0;
  for (let c = to; c !== from; c = prev[c]) {
    route.push(c);
    sea.push(bySea[c] === 1);
    legs.push(days[c] - days[prev[c]]);
    if (bySea[c]) seaKm += kmTo[c];
    else landKm += kmTo[c] * 1.25;
  }
  route.push(from);
  route.reverse();
  sea.reverse();
  legs.reverse();
  return { route, sea, legs, landKm, seaKm };
}

/** How many days out (the same again back), and why. */
export function missionDays(
  s: GameState,
  w: World,
  n: number,
  c: Character | undefined,
  p: number,
  kind: Mission["kind"],
): Breakdown {
  const from = missionStart(s, w, n, p);
  const e = new Explain();
  const rules = kind === "explore" ? EXPEDITION : OUTPOST;
  const way = from < 0 ? null : missionRoute(w.map, from, p, kind);
  let land = 0;
  let water = 0;
  way?.legs.forEach((d, i) => (way.sea[i] ? (water += d) : (land += d)));
  if (land > 0)
    e.add(
      `${Math.round(way!.landKm)} km over land`,
      Math.round(land * 10) / 10,
    );
  if (water > 0)
    e.add(`${Math.round(way!.seaKm)} km by boat`, Math.round(water * 10) / 10);
  if (land + water < rules.minDays)
    e.add(
      "Making ready and the work at the far end",
      rules.minDays - land - water,
    );
  if (hasTrait(c, "diligent")) e.mul("Diligent leader", 0.8);
  if (hasTrait(c, "ambitious")) e.mul("Ambitious leader", 0.85);
  if (hasTrait(c, "lazy")) e.mul("Lazy leader", 1.25);
  if (hasTrait(c, "craven")) e.mul("Careful leader", 1.1);
  return e.done(0, 1);
}

export function missionCheck(
  s: GameState,
  w: World,
  n: number,
  c: number,
  p: number,
  kind: Mission["kind"],
): Check {
  const nation = s.nations[n];
  const pr = s.provinces[p];
  if (!nation || nation.kind !== "power")
    return no("Only colonies send parties out.");
  if (!pr) return no("No such place.");
  if (nation.missions.length >= MAX_MISSIONS)
    return no(`You already have ${MAX_MISSIONS} parties out.`);
  const leader = s.chars[c];
  if (!leader || !missionLeaders(s, n).some((x) => x.id === c))
    return no("Choose someone at your court who's free to go.");
  if (nation.missions.some((m) => m.target === p && m.kind === kind))
    return no("A party is already on its way there.");
  const from = missionStart(s, w, n, p);
  if (from < 0) return no("You hold no land to set out from.");
  const km = from === p ? 0 : kmBetween(w.map, from, p);
  if (km > RANGE_KM[kind])
    return no(`Too far: ${Math.round(km)} km from your nearest land.`);
  if (kind === "explore") {
    if (isExplored(s, n, p)) return no("You already know this land.");
    if (nation.gold < EXPEDITION.gold)
      return no(`Needs ${EXPEDITION.gold} gold.`);
  } else {
    if (pr.outpost) return no("There's already an outpost here.");
    if (pr.owner >= 0 && pr.owner !== n && s.nations[pr.owner].kind === "power")
      return no("Another colony holds it.");
    if (nation.gold < OUTPOST.gold) return no(`Needs ${OUTPOST.gold} gold.`);
    for (const [good, v] of Object.entries(OUTPOST.goods) as [Good, number][])
      if (nation.market.stock[good] < v)
        return no(`Needs ${v} ${good} in the warehouses.`);
  }
  return yes;
}

/** Send a party. */
export function missionCommand(
  g: ConquestGame,
  n: number,
  c: Command,
): string | null {
  if (c.k !== "expedition" && c.k !== "outpost") return "Unknown command.";
  const s = g.s;
  const kind = c.k === "expedition" ? "explore" : "outpost";
  const check = missionCheck(s, g.w, n, c.c, c.p, kind);
  if (!check.ok) return check.why;
  const nation = g.nation(n);
  const leader = s.chars[c.c];
  const days = missionDays(s, g.w, n, leader, c.p, kind).total;
  const from = missionStart(s, g.w, n, c.p);
  const way = missionRoute(g.map, from, c.p, kind);
  const sum = way.legs.reduce((a, b) => a + b, 0);
  const legs = way.legs.map((d) =>
    sum > 0 ? Math.round(((d * days) / sum) * 10) / 10 : days,
  );
  if (kind === "explore") nation.gold -= EXPEDITION.gold;
  else {
    nation.gold -= OUTPOST.gold;
    for (const [good, v] of Object.entries(OUTPOST.goods) as [Good, number][])
      nation.market.stock[good] -= v;
  }
  nation.missions.push({
    id: g.nextId(),
    kind,
    leader: c.c,
    from,
    target: c.p,
    start: s.day,
    arrive: s.day + days,
    home: s.day + days * 2,
    stage: "out",
    men: kind === "explore" ? EXPEDITION.men : OUTPOST.men,
    incident: false,
    route: way.route,
    sea: way.sea,
    legs,
  });
  return null;
}

/** Day by day: trouble halfway out, the work at the far end, home again. */
export function missionsDaily(g: ConquestGame): void {
  const s = g.s;
  for (const nation of s.nations) {
    if (nation.kind !== "power" || nation.missions.length === 0) continue;
    for (const m of [...nation.missions]) {
      // A party waiting on the governor's orders stays where it is.
      if (nation.events.some((e) => e.ctx.mission === m.id)) {
        const mm = x(g, nation.id, m);
        mm.arrive++;
        mm.home++;
        continue;
      }
      const leader = s.chars[m.leader];
      if (!leader?.alive || m.men <= 0) {
        end(
          g,
          nation.id,
          m,
          "lost",
          leader?.alive
            ? `the party was lost`
            : `${charName(leader)} died on the trail`,
        );
        continue;
      }
      if (
        m.stage === "out" &&
        !m.incident &&
        s.day >= m.start + Math.floor((m.arrive - m.start) / 2)
      ) {
        x(g, nation.id, m).incident = true;
        trouble(g, nation.id, m);
        continue;
      }
      if (m.stage === "out" && s.day >= m.arrive) arrive(g, nation.id, m);
      else if (m.stage === "back" && s.day >= m.home)
        end(g, nation.id, m, "back", "home safe");
    }
  }
}

/** The mission as stored on its nation, marked changed. */
function x(g: ConquestGame, n: number, m: Mission): Mission {
  return g.nation(n).missions.find((y) => y.id === m.id) ?? m;
}

function arrive(g: ConquestGame, n: number, m: Mission): void {
  const s = g.s;
  const leader = s.chars[m.leader];
  const p = m.target;
  const name = g.map.provinces[p].name;
  const mm = x(g, n, m);
  mm.stage = "back";
  mm.home = s.day + (m.arrive - m.start);
  const wide = hasTrait(leader, "educated") || stat(s, leader, "lea") >= 10;
  const near = g.map.provinces[p].nb.map(([q]) => q);
  const ring = wide
    ? [
        ...new Set(
          near.flatMap((q) => [q, ...g.map.provinces[q].nb.map(([r]) => r)]),
        ),
      ]
    : near;
  if (m.kind === "explore") {
    const found = survey(g, n, [p, ...ring]);
    const rich = found.filter((q) => s.provinces[q].rich);
    const good = g.w.raw[p];
    const text =
      `${charName(leader)} surveyed ${name} (${good}) and ${found.length - 1} provinces around it.` +
      (rich.length
        ? ` Rich land found: ${rich.map((q) => `${g.map.provinces[q].name} (${g.w.raw[q]})`).join(", ")}.`
        : "");
    g.event({
      k: "mission",
      day: s.day,
      n,
      p,
      kind: m.kind,
      result: "done",
      c: m.leader,
      text,
    });
    remember(g, leader, {
      of: -1,
      why: `Led the survey of ${name}`,
      value: 5,
      years: 10,
    });
    return;
  }
  const pr = s.provinces[p];
  if (
    pr.outpost ||
    (pr.owner >= 0 && pr.owner !== n && s.nations[pr.owner].kind === "power")
  ) {
    g.event({
      k: "mission",
      day: s.day,
      n,
      p,
      kind: m.kind,
      result: "lost",
      c: m.leader,
      text: `${charName(leader)} found ${name} already taken; the party turns for home.`,
    });
    return;
  }
  g.prov(p).outpost = { by: n, since: s.day };
  survey(g, n, [p, ...near]);
  if (pr.owner >= 0 && s.nations[pr.owner].kind === "native") {
    (g.nation(pr.owner).relations[n] ??= []).push({
      of: -1,
      why: `Built a fort on our land at ${name}`,
      value: -15,
      until: s.day + 365 * 10,
    });
  }
  g.event({
    k: "mission",
    day: s.day,
    n,
    p,
    kind: m.kind,
    result: "done",
    c: m.leader,
    text: `${charName(leader)}'s party raised an outpost at ${name}.`,
  });
}

function end(
  g: ConquestGame,
  n: number,
  m: Mission,
  result: "back" | "lost",
  why: string,
): void {
  const s = g.s;
  const nation = g.nation(n);
  nation.missions = nation.missions.filter((y) => y.id !== m.id);
  const name = g.map.provinces[m.target].name;
  const what =
    m.kind === "explore"
      ? `The expedition to ${name}`
      : `The outpost party for ${name}`;
  g.event({
    k: "mission",
    day: s.day,
    n,
    p: m.target,
    kind: m.kind,
    result,
    c: m.leader,
    text: `${what}: ${why}.`,
  });
}

// ---------------------------------------------------------------- trouble on the way

/** A chance, with every cause listed, clamped to 5–95%. */
function odds(base: number, bits: [string, number][]): Breakdown {
  const e = new Explain().add("Base", base, true);
  for (const [label, v] of bits) e.add(label, v);
  return e.done(2, 0.05, 0.95);
}

const pctText = (b: Breakdown) =>
  `${Math.round(b.total * 100)}% (${b.parts
    .map((p) =>
      p.label === "Base"
        ? `${Math.round(p.value * 100)}% base`
        : `${p.value > 0 ? "+" : "−"}${Math.abs(Math.round(p.value * 100))}% ${p.label.toLowerCase()}`,
    )
    .join(", ")})`;

const lead = (g: ConquestGame, ctx: Ctx) => g.s.chars[ctx.leader];
const skill = (g: ConquestGame, ctx: Ctx, st: Parameters<typeof stat>[2]) =>
  stat(g.s, lead(g, ctx), st);
const has = (g: ConquestGame, ctx: Ctx, t: TraitId) =>
  hasTrait(lead(g, ctx), t);

function mission(g: ConquestGame, n: number, ctx: Ctx): Mission | undefined {
  return g.s.nations[n].missions.find((m) => m.id === ctx.mission);
}

function delay(g: ConquestGame, n: number, ctx: Ctx, days: number): void {
  const m = mission(g, n, ctx);
  if (!m) return;
  const mm = x(g, n, m);
  mm.arrive += days;
  mm.home += days * 2;
}

function loseMen(g: ConquestGame, n: number, ctx: Ctx, share: number): void {
  const m = mission(g, n, ctx);
  if (!m) return;
  const keep = has(g, ctx, "just") ? 1 - share * 0.7 : 1 - share;
  x(g, n, m).men = Math.floor(m.men * keep);
}

/** The leader's life at risk: shows and uses the same number. */
function dangerToLeader(g: ConquestGame, ctx: Ctx, base: number): Breakdown {
  const e = new Explain().add("Base", base, true);
  if (has(g, ctx, "robust")) e.mul("Robust", 0.5);
  if (has(g, ctx, "sickly")) e.mul("Sickly", 2);
  const age = ageOf(g.s, lead(g, ctx));
  if (age >= 55) e.mul(`Age ${age}`, 1.5);
  return e.done(2, 0, 0.9);
}

function maybeDie(
  g: ConquestGame,
  n: number,
  ctx: Ctx,
  risk: Breakdown,
  cause: string,
): void {
  const c = lead(g, ctx);
  if (c?.alive && g.rng.chance(risk.total)) kill(g, c, cause);
  void n;
}

function talk(g: ConquestGame, ctx: Ctx): Breakdown {
  return odds(0.45, [
    [`Diplomacy ${skill(g, ctx, "dip")}`, (skill(g, ctx, "dip") - 5) * 0.05],
    ["Charming", has(g, ctx, "charming") ? 0.15 : 0],
    ["Honest", has(g, ctx, "honest") ? 0.15 : 0],
    ["Deceitful", has(g, ctx, "deceitful") ? 0.1 : 0],
    ["Generous", has(g, ctx, "generous") ? 0.1 : 0],
    ["Tolerant", has(g, ctx, "tolerant") ? 0.1 : 0],
    ["Zealous", has(g, ctx, "zealous") ? -0.1 : 0],
  ]);
}

function force(g: ConquestGame, ctx: Ctx): Breakdown {
  return odds(0.45, [
    [`Martial ${skill(g, ctx, "mar")}`, (skill(g, ctx, "mar") - 5) * 0.04],
    ["Brave", has(g, ctx, "brave") ? 0.15 : 0],
    ["Cruel", has(g, ctx, "cruel") ? 0.1 : 0],
    ["Craven", has(g, ctx, "craven") ? -0.15 : 0],
  ]);
}

function sneak(g: ConquestGame, ctx: Ctx): Breakdown {
  return odds(0.5, [
    [`Intrigue ${skill(g, ctx, "int")}`, (skill(g, ctx, "int") - 5) * 0.04],
    ["Craven", has(g, ctx, "craven") ? 0.1 : 0],
  ]);
}

function wayfind(g: ConquestGame, ctx: Ctx): Breakdown {
  return odds(0.45, [
    [`Learning ${skill(g, ctx, "lea")}`, (skill(g, ctx, "lea") - 5) * 0.04],
    ["Educated", has(g, ctx, "educated") ? 0.1 : 0],
    ["Cruel", has(g, ctx, "cruel") ? 0.1 : 0],
  ]);
}

function fever(g: ConquestGame, ctx: Ctx): Breakdown {
  const e = new Explain().add("Base", 0.3, true);
  e.add(`Learning ${skill(g, ctx, "lea")}`, -(skill(g, ctx, "lea") - 5) * 0.02);
  if (has(g, ctx, "educated")) e.add("Educated", -0.1);
  if (has(g, ctx, "robust")) e.mul("Robust", 0.5);
  if (has(g, ctx, "sickly")) e.mul("Sickly", 2);
  return e.done(2, 0.02, 0.9);
}

const whereName = (g: ConquestGame, ctx: Ctx) =>
  g.map.provinces[ctx.target].name;
const leaderName = (g: ConquestGame, ctx: Ctx) => charName(lead(g, ctx));

/** Native nation whose land the party crosses, if any. */
function nativesNear(g: ConquestGame, p: number): number {
  const s = g.s;
  const owners = [p, ...g.map.provinces[p].nb.map(([q]) => q)].map(
    (q) => s.provinces[q].owner,
  );
  return owners.find((o) => o >= 0 && s.nations[o].kind === "native") ?? -1;
}

const MISSION_EVENTS: EventDef[] = [
  {
    key: "mission-rapids",
    who: "mission",
    cooldown: 0,
    when: () => null,
    title: () => "White water",
    body: (g, _n, ctx) =>
      `${leaderName(g, ctx)}'s party has reached rapids on the way to ${whereName(g, ctx)}. The canoes are heavy with stores. The guides say a carry around them will cost two weeks.`,
    choices: [
      {
        label: () => "Carry the canoes around",
        tip: () => "Safe: the party is 12 days later.",
        apply: (g, n, ctx) => delay(g, n, ctx, 12),
        ai: () => 2,
      },
      {
        label: () => "Run the rapids",
        tip: (g, _n, ctx) =>
          `Makes it through ${pctText(force(g, ctx))}. If not, a third of the party drowns and ${leaderName(g, ctx)} may with them (${Math.round(dangerToLeader(g, ctx, 0.2).total * 100)}%).`,
        apply: (g, n, ctx) => {
          if (g.rng.chance(force(g, ctx).total)) return;
          loseMen(g, n, ctx, 0.35);
          maybeDie(
            g,
            n,
            ctx,
            dangerToLeader(g, ctx, 0.2),
            "drowning in the rapids",
          );
        },
        ai: (g, _n, ctx) => force(g, ctx).total * 3,
      },
    ],
  },
  {
    key: "mission-fever",
    who: "mission",
    cooldown: 0,
    when: () => null,
    title: () => "Fever in the camp",
    body: (g, _n, ctx) =>
      `A fever is going through ${leaderName(g, ctx)}'s camp on the way to ${whereName(g, ctx)}. Men shake in their blankets; two have already been buried.`,
    choices: [
      {
        label: () => "Rest until it passes",
        tip: () => "20 days lost, and a tenth of the party with them.",
        apply: (g, n, ctx) => {
          delay(g, n, ctx, 20);
          loseMen(g, n, ctx, 0.1);
        },
        ai: () => 2,
      },
      {
        label: () => "Press on",
        tip: (g, _n, ctx) =>
          `${leaderName(g, ctx)} catches it ${pctText(fever(g, ctx))}, and then dies of it 40% of the time. A quarter of the men are lost either way.`,
        apply: (g, n, ctx) => {
          loseMen(g, n, ctx, 0.25);
          if (g.rng.chance(fever(g, ctx).total))
            maybeDie(g, n, ctx, odds(0.4, []), "fever on the trail");
        },
        ai: (g, _n, ctx) => (1 - fever(g, ctx).total) * 2,
      },
    ],
  },
  {
    key: "mission-natives",
    who: "mission",
    cooldown: 0,
    when: () => null,
    title: (g, _n, ctx) =>
      `Warriors of the ${g.s.nations[ctx.natives]?.name ?? "country"} on the trail`,
    body: (g, _n, ctx) =>
      `${leaderName(g, ctx)}'s party has been met by armed men of the ${g.s.nations[ctx.natives]?.name}. They want to know who is crossing their country, and why.`,
    choices: [
      {
        label: () => "Offer gifts and ask for guides (15 gold)",
        tip: (g, _n, ctx) =>
          `They agree ${pctText(talk(g, ctx))}: guides take the party on (it surveys more), and they think better of you (+5). If not, they turn the party back: 15 days lost.`,
        apply: (g, n, ctx) => {
          g.nation(n).gold -= 15;
          if (g.rng.chance(talk(g, ctx).total)) {
            const m = mission(g, n, ctx);
            if (m)
              survey(
                g,
                n,
                g.map.provinces[m.target].nb.map(([q]) => q),
              );
            (g.nation(ctx.natives).relations[n] ??= []).push({
              of: -1,
              why: "Their explorers came with gifts",
              value: 5,
              until: g.s.day + 365 * 5,
            });
          } else delay(g, n, ctx, 15);
        },
        blocked: (g, n) => (g.s.nations[n].gold < 15 ? "Needs 15 gold" : null),
        ai: (g, _n, ctx) => talk(g, ctx).total * 3,
      },
      {
        label: () => "Slip past them in the night",
        tip: (g, _n, ctx) =>
          `Gets away unseen ${pctText(sneak(g, ctx))}. If caught, they attack: half the party is lost and ${leaderName(g, ctx)} may fall (${Math.round(dangerToLeader(g, ctx, 0.2).total * 100)}%).`,
        apply: (g, n, ctx) => {
          if (g.rng.chance(sneak(g, ctx).total)) return;
          loseMen(g, n, ctx, 0.5);
          maybeDie(
            g,
            n,
            ctx,
            dangerToLeader(g, ctx, 0.2),
            "an ambush on the trail",
          );
        },
        ai: (g, _n, ctx) => sneak(g, ctx).total * 2,
      },
      {
        label: () => "Show them the muskets",
        tip: (g, _n, ctx) =>
          `They back down ${pctText(force(g, ctx))}, but resent it (−10). If not, a fight: 60% of the party lost and ${leaderName(g, ctx)} may fall (${Math.round(dangerToLeader(g, ctx, 0.25).total * 100)}%).`,
        apply: (g, n, ctx) => {
          (g.nation(ctx.natives).relations[n] ??= []).push({
            of: -1,
            why: "Their explorers threatened us",
            value: -10,
            until: g.s.day + 365 * 8,
          });
          if (g.rng.chance(force(g, ctx).total)) return;
          loseMen(g, n, ctx, 0.6);
          maybeDie(
            g,
            n,
            ctx,
            dangerToLeader(g, ctx, 0.25),
            "a skirmish with natives",
          );
        },
        ai: (g, _n, ctx) =>
          force(g, ctx).total *
          (has(g, ctx, "cruel") || has(g, ctx, "brave") ? 2 : 1),
      },
    ],
  },
  {
    key: "mission-lost",
    who: "mission",
    cooldown: 0,
    when: () => null,
    title: () => "Lost",
    body: (g, _n, ctx) =>
      `The trail to ${whereName(g, ctx)} has given out. ${leaderName(g, ctx)}'s men have been walking in circles for three days, and the stores are running low.`,
    choices: [
      {
        label: () => "Trust the compass and push on",
        tip: (g, _n, ctx) =>
          `Finds the way ${pctText(wayfind(g, ctx))}. If not, 25 more days in the wild and a fifth of the party lost.`,
        apply: (g, n, ctx) => {
          if (g.rng.chance(wayfind(g, ctx).total)) return;
          delay(g, n, ctx, 25);
          loseMen(g, n, ctx, 0.2);
        },
        ai: (g, _n, ctx) => wayfind(g, ctx).total * 3,
      },
      {
        label: () => "Go back to the last landmark",
        tip: () => "Safe, but 15 days lost.",
        apply: (g, n, ctx) => delay(g, n, ctx, 15),
        ai: () => 1.5,
      },
    ],
  },
  {
    key: "mission-winter",
    who: "mission",
    cooldown: 0,
    when: () => null,
    title: () => "Winter closes in",
    body: (g, _n, ctx) =>
      `Snow has come early on the road to ${whereName(g, ctx)}. Rivers are freezing and game is scarce.`,
    choices: [
      {
        label: () => "Make camp until the thaw",
        tip: () => "45 days lost, and a tenth of the party.",
        apply: (g, n, ctx) => {
          delay(g, n, ctx, 45);
          loseMen(g, n, ctx, 0.1);
        },
        ai: () => 2,
      },
      {
        label: () => "March on through the snow",
        tip: (g, _n, ctx) =>
          `No time lost, but a quarter of the party freezes and ${leaderName(g, ctx)} may too (${Math.round(dangerToLeader(g, ctx, 0.15).total * 100)}%).`,
        apply: (g, n, ctx) => {
          loseMen(g, n, ctx, 0.25);
          maybeDie(
            g,
            n,
            ctx,
            dangerToLeader(g, ctx, 0.15),
            "cold on the trail",
          );
        },
        ai: (g, _n, ctx) =>
          has(g, ctx, "brave") || has(g, ctx, "ambitious") ? 2 : 1,
      },
    ],
  },
];
registerEvents(MISSION_EVENTS);

/**
 * What happens halfway: the country decides it. Rapids where rivers cross,
 * fever in hot lowlands or fever season, warriors where natives live, getting
 * lost in forest, jungle and mountains, snow in winter. Open plains in good
 * weather: nothing at all.
 */
function trouble(g: ConquestGame, n: number, m: Mission): void {
  const s = g.s;
  const p = m.target;
  const def = g.map.provinces[p];
  const month = monthOf(s);
  const ctx: Ctx = {
    mission: m.id,
    leader: m.leader,
    target: p,
    natives: nativesNear(g, p),
  };
  const options: string[] = [];
  if (isWinter(def.lat, month)) options.push("mission-winter");
  if (
    g.w.tropical[p] ||
    isFeverSeason(def.lat, month) ||
    def.terrain === "marsh"
  )
    options.push("mission-fever");
  if (ctx.natives >= 0) options.push("mission-natives");
  if (def.nb.some(([, , river]) => river === 1)) options.push("mission-rapids");
  if (["forest", "jungle", "mountains", "tundra"].includes(def.terrain))
    options.push("mission-lost");
  if (options.length === 0) return;
  const key = options[m.id % options.length];
  const ev = MISSION_EVENTS.find((d) => d.key === key)!;
  raiseEvent(g, n, ev, ctx);
}

// ---------------------------------------------------------------- outposts at war

/** An outpost with enemies at its gate and nobody to hold it is burned. */
export function outpostsDaily(g: ConquestGame): void {
  const s = g.s;
  for (let p = 0; p < s.provinces.length; p++) {
    const post = s.provinces[p].outpost;
    if (!post) continue;
    const here = s.armies.filter(
      (a) => a.prov === p && a.depart < 0 && !a.retreating,
    );
    const atWarWith = (a: number) =>
      s.wars.some(
        (w) => (w.a === a && w.b === post.by) || (w.b === a && w.a === post.by),
      );
    const enemy = here.find((a) => atWarWith(a.owner));
    if (!enemy) continue;
    if (here.some((a) => a.owner === post.by)) continue;
    g.prov(p).outpost = null;
    g.event({ k: "razed", day: s.day, n: enemy.owner, p, from: post.by });
  }
}

/** Outposts a nation keeps up, for the ledger. */
export function outpostsOf(s: GameState, n: number): number[] {
  const out: number[] = [];
  s.provinces.forEach((pr, p) => {
    if (pr.outpost?.by === n) out.push(p);
  });
  return out;
}

export { survey as surveyProvinces };
