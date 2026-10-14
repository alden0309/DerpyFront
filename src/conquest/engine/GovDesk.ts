// GOV (r21): the governor's desk. What a governor (a player) decides month
// by month and year by year, besides the old levers (taxes, the remittance,
// a building, the militia called out, war and peace, laws, public works,
// the council): the customs duties; a building programme that orders the
// next fort, church, wharf, court-house or trading house each half year;
// native affairs (a treaty council, the Indian trade licensed); the militia
// (musters and drill, ranging companies on the frontier); courts and
// pardons (the colony's prisoners); and the desk's own matters, a scene a
// month or so (GovEvents.ts). Each lever says what it does, and what it
// costs, on the page; every number here is the one the engine uses.

import { dateOf } from "./Calendar";
import { relate } from "./Council";
import { economyCommand, tally } from "./Economy";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { journal, milestone, remembers, touchLife } from "./LifeCore";
import { Check, lifeOfSeat, meOf, no, yes } from "./LifeQueries";
import type { World } from "./Map";
import {
  atWar,
  buildCheck,
  charName,
  provincesOf,
  settlers,
  tribesfolk,
} from "./Queries";
import { declareRev, moveMotion, revSide, voteMotion } from "./Revolution";
import { DAYS_PER_YEAR } from "./Rules";
import { hash01 } from "./SocietyCore";
import type {
  BuildingKind,
  DeskCommand,
  GameState,
  GovDesk,
  Life,
  ModFx,
  Nation,
} from "./Types";
import { worldRng } from "./WorldRng";

// ---------------------------------------------------------------- the desk

/** The colony's desk, made the first time it's needed. */
export function deskOf(g: ConquestGame, n: number): GovDesk {
  return (g.nation(n).desk ??= {});
}

/** Read-only: the desk as it is. */
export function deskView(s: GameState, n: number): GovDesk {
  return s.nations[n]?.desk ?? {};
}

/** The colony a player governs (a crown colony or one of its own), or -1. */
export function governedBy(s: GameState, life: Life): number {
  const me = meOf(s, life);
  if (!me || life.watching) return -1;
  return s.nations.findIndex(
    (n) => n.alive && n.kind === "power" && n.ruler === me.id,
  );
}

/** The track's own dice for the desk. */
export function ddice(s: GameState, salt: number, ...xs: number[]) {
  let k = salt | 0;
  for (const x of xs) k = (Math.imul(k, 31) + (x | 0)) | 0;
  return worldRng(s, 0x21d0000 + (k & 0xfffff));
}

function natMod(
  g: ConquestGame,
  n: number,
  key: string,
  label: string,
  days: number,
  fx: Partial<Record<ModFx, number>>,
): void {
  const x = g.nation(n);
  x.mods = x.mods.filter((m) => m.key !== key);
  if (Object.keys(fx).length)
    x.mods.push({ key, label, until: g.s.day + days, fx });
}

// ---------------------------------------------------------------- duties

export interface DutyDef {
  key: string;
  name: string;
  text: string;
  fx: Partial<Record<ModFx, number>>;
  /** What the colony's merchants think of the governor for it. */
  merchants: number;
}

/** The customs schedule. The customary duties are the default (no change). */
export const DUTIES: DutyDef[] = [
  {
    key: "free",
    name: "A free port",
    text: "No duties at all: ships crowd in and trade grows, the treasury goes without, and London wants to know where its customs went.",
    fx: { tax: -0.06, production: 0.04, favor: -3 },
    merchants: 10,
  },
  {
    key: "light",
    name: "Light duties",
    text: "A little less in the treasury, a little more trade.",
    fx: { tax: -0.03, production: 0.02, favor: -1 },
    merchants: 5,
  },
  {
    key: "usual",
    name: "The customary duties",
    text: "As they've always been.",
    fx: {},
    merchants: 0,
  },
  {
    key: "heavy",
    name: "Heavy duties",
    text: "More in the treasury and a crown pleased with its customs; less trade, more smuggling, and grumbling on every wharf.",
    fx: { tax: 0.05, production: -0.03, favor: 2, unrest: 1 },
    merchants: -8,
  },
];

export const DUTY_USUAL = 2;
/** Duties change once in this long. */
export const DUTY_REST = 180;

export function dutyCheck(s: GameState, life: Life, level: number): Check {
  const n = governedBy(s, life);
  if (n < 0) return no("Only the governor sets the duties.");
  if (!Number.isInteger(level) || !DUTIES[level])
    return no("No such schedule.");
  const d = deskView(s, n);
  if ((d.duty ?? DUTY_USUAL) === level)
    return no("They stand at that already.");
  const next = (d.dutyAt ?? -Infinity) + DUTY_REST;
  if (next > s.day)
    return no("The merchants won't bear another change so soon.");
  return yes;
}

export function setDuty(
  g: ConquestGame,
  life: Life,
  level: number,
): string | null {
  const s = g.s;
  const ok = dutyCheck(s, life, level);
  if (!ok.ok) return ok.why;
  const n = governedBy(s, life);
  const d = deskOf(g, n);
  d.duty = level;
  d.dutyAt = s.day;
  const def = DUTIES[level];
  natMod(
    g,
    n,
    "r21:duty",
    `Customs: ${def.name.toLowerCase()}`,
    50 * DAYS_PER_YEAR,
    def.fx,
  );
  // The merchants and shipmasters of the colony's towns remember it.
  const me = meOf(s, life)!;
  if (def.merchants)
    for (const p of provincesOf(s, n))
      for (const id of s.locals[p] ?? []) {
        const c = s.chars[id];
        if (!c?.alive || (c.role !== "merchant" && c.role !== "captain"))
          continue;
        remembers(
          g,
          life,
          g.char(id),
          def.merchants > 0 ? "Eased the duties" : "Raised the duties",
          def.merchants,
          3,
        );
      }
  journal(
    g,
    life,
    `You set the colony's customs at ${def.name.toLowerCase()}. ${def.text}`,
  );
  void me;
  return null;
}

// ---------------------------------------------------------------- a building programme

export interface ProgrammeDef {
  key: string;
  name: string;
  text: string;
  b: BuildingKind;
  years: number;
  /** Where it builds next (in order), from the colony's counties. */
  wants: (s: GameState, w: World, n: number, p: number) => boolean;
}

const borders = (
  s: GameState,
  w: World,
  n: number,
  p: number,
  native?: boolean,
) =>
  w.map.provinces[p].nb.some(([q]) => {
    const o = s.provinces[q].owner;
    return (
      o !== n && (o < 0 || (native ? s.nations[o]?.kind === "native" : true))
    );
  });

export const PROGRAMMES: ProgrammeDef[] = [
  {
    key: "forts",
    name: "Forts on the frontier",
    text: "A fort in each frontier county that hasn't one: the frontier sleeps easier and holds longer.",
    b: "fort",
    years: 4,
    wants: (s, w, n, p) => borders(s, w, n, p) && !(s.provinces[p].b.fort ?? 0),
  },
  {
    key: "churches",
    name: "A church in every parish",
    text: "A church in each county of 150 settlers or more that hasn't one.",
    b: "church",
    years: 5,
    wants: (s, _w, _n, p) =>
      settlers(s.provinces[p]) >= 150 && !(s.provinces[p].b.church ?? 0),
  },
  {
    key: "wharves",
    name: "Wharves and ports",
    text: "A port in each county on the coast that hasn't one: ships call, and trade with them.",
    b: "port",
    years: 4,
    wants: (s, w, _n, p) =>
      w.map.provinces[p].coastal && !(s.provinces[p].b.port ?? 0),
  },
  {
    key: "courts",
    name: "Court-houses for the counties",
    text: "A court-house in each county of 300 settlers or more that hasn't one: order, and justice nearer home.",
    b: "courthouse",
    years: 4,
    wants: (s, _w, _n, p) =>
      settlers(s.provinces[p]) >= 300 && !(s.provinces[p].b.courthouse ?? 0),
  },
  {
    key: "truck",
    name: "Truck houses on the frontier",
    text: "A trading house (the colony's own, with fair weights) in each fur county on a native nation's border: the furs come in, and the nations deal with the colony rather than with sharpers.",
    b: "tradingpost",
    years: 4,
    wants: (s, w, n, p) =>
      borders(s, w, n, p, true) &&
      w.raw[p] === "furs" &&
      !(s.provinces[p].b.tradingpost ?? 0),
  },
];

export const PROG_BY_KEY = new Map(PROGRAMMES.map((x) => [x.key, x]));

/** A programme's next building every this many days. */
export const PROG_EVERY = 182;

/** Where a programme would build next (the first county it wants that a building can go in now), or -1. */
export function progNext(
  s: GameState,
  w: World,
  n: number,
  key: string,
): { p: number; why?: string } {
  const def = PROG_BY_KEY.get(key);
  if (!def) return { p: -1, why: "No such programme." };
  let why = "Nowhere left that wants one.";
  for (const p of provincesOf(s, n)) {
    if (!def.wants(s, w, n, p)) continue;
    const ok = buildCheck(s, w, n, p, def.b);
    if (ok.ok) return { p };
    why = `${w.map.provinces[p].name}: ${ok.why}`;
  }
  return { p: -1, why };
}

/** Counties a programme would still build in. */
export function progLeft(
  s: GameState,
  w: World,
  n: number,
  key: string,
): number[] {
  const def = PROG_BY_KEY.get(key);
  if (!def) return [];
  return provincesOf(s, n).filter((p) => def.wants(s, w, n, p));
}

export function progCheck(
  s: GameState,
  w: World,
  life: Life,
  key: string | null,
): Check {
  const n = governedBy(s, life);
  if (n < 0) return no("Only the governor sets a building programme.");
  const d = deskView(s, n);
  if (key === null) return d.prog ? yes : no("There's no programme to end.");
  const def = PROG_BY_KEY.get(key);
  if (!def) return no("No such programme.");
  if (d.prog && d.prog.until > s.day)
    return no("Finish (or end) the one under way first.");
  if (!progLeft(s, w, n, key).length)
    return no("Every county that wants one has one.");
  return yes;
}

export function setProg(
  g: ConquestGame,
  life: Life,
  key: string | null,
): string | null {
  const s = g.s;
  const ok = progCheck(s, g.w, life, key);
  if (!ok.ok) return ok.why;
  const n = governedBy(s, life);
  const d = deskOf(g, n);
  if (key === null) {
    journal(
      g,
      life,
      `You end the programme: ${PROG_BY_KEY.get(d.prog!.key)?.name.toLowerCase()}.`,
    );
    d.prog = null;
    return null;
  }
  const def = PROG_BY_KEY.get(key)!;
  d.prog = {
    key,
    from: s.day,
    until: s.day + def.years * DAYS_PER_YEAR,
    built: [],
    next: s.day,
  };
  journal(
    g,
    life,
    `You begin a programme of works: ${def.name.toLowerCase()}, for ${def.years} years. Each half year the treasury pays for the next.`,
    "good",
  );
  progStep(g, n);
  return null;
}

/** The programme's next building, when it's due and the treasury can bear it. */
function progStep(g: ConquestGame, n: number): void {
  const s = g.s;
  const d = s.nations[n]?.desk;
  const pr = d?.prog;
  if (!pr || pr.next > s.day) return;
  if (pr.until <= s.day) {
    const life = s.lives.find((l) => l.c === s.nations[n].ruler);
    if (life)
      journal(
        g,
        life,
        `The programme is done: ${PROG_BY_KEY.get(pr.key)?.name.toLowerCase()}, ${pr.built.length} built.`,
        "good",
      );
    deskOf(g, n).prog = null;
    return;
  }
  const at = progNext(s, g.w, n, pr.key);
  if (at.p < 0) {
    // Nothing can go up now (the treasury, the goods): try again next month.
    deskOf(g, n).prog!.next = s.day + 30;
    return;
  }
  const def = PROG_BY_KEY.get(pr.key)!;
  const err = economyCommand(g, n, { k: "build", p: at.p, b: def.b });
  const x = deskOf(g, n).prog!;
  if (!err) {
    x.built.push(at.p);
    x.next = s.day + PROG_EVERY;
  } else x.next = s.day + 30;
}

// ---------------------------------------------------------------- native affairs

/** The native nations a colony borders or treats with (its neighbours). */
export function nativeNeighbours(s: GameState, w: World, n: number): number[] {
  const out = new Set<number>();
  for (const p of provincesOf(s, n))
    for (const [q] of w.map.provinces[p].nb) {
      const o = s.provinces[q].owner;
      if (o >= 0 && s.nations[o]?.kind === "native" && s.nations[o].alive)
        out.add(o);
    }
  return [...out].sort((a, b) => a - b);
}

/** A treaty council: presents from the treasury, and a scene. */
export const COUNCIL = { gold: 20, rest: DAYS_PER_YEAR };

export function councilCheck(
  s: GameState,
  w: World,
  life: Life,
  o: number,
): Check {
  const n = governedBy(s, life);
  if (n < 0) return no("Only the governor holds a treaty council.");
  const nat = s.nations[o];
  if (!nat?.alive || nat.kind !== "native") return no("With a native nation.");
  if (!nativeNeighbours(s, w, n).includes(o))
    return no("They aren't your neighbours.");
  const last = deskView(s, n).councils?.[o] ?? -Infinity;
  if (last + COUNCIL.rest > s.day) return no("Once a year with each nation.");
  if (s.nations[n].gold < COUNCIL.gold)
    return no(`Presents cost ${COUNCIL.gold} gold from the treasury.`);
  if (life.events.some((e) => e.key === "gov-council"))
    return no("A council is sitting already.");
  return yes;
}

export function holdCouncil(
  g: ConquestGame,
  life: Life,
  o: number,
): string | null {
  const s = g.s;
  const ok = councilCheck(s, g.w, life, o);
  if (!ok.ok) return ok.why;
  const n = governedBy(s, life);
  g.nation(n).gold -= COUNCIL.gold;
  (deskOf(g, n).councils ??= {})[o] = s.day;
  journal(
    g,
    life,
    `You call the ${s.nations[o].name} to a treaty council, with ${COUNCIL.gold} gold in presents from the treasury.`,
  );
  raiseEvent(g, life, "gov-council", { n, o });
  return null;
}

/** The Indian trade licensed and bonded: fair dealing, at a cost. */
export const LICENCE = {
  fx: { tax: -0.01 } as Partial<Record<ModFx, number>>,
  regard: 6,
};

export function setLicence(
  g: ConquestGame,
  life: Life,
  on: boolean,
): string | null {
  const s = g.s;
  const n = governedBy(s, life);
  if (n < 0) return "Only the governor licenses the Indian trade.";
  const d = deskOf(g, n);
  if (!!d.licence === on)
    return on ? "It's licensed already." : "It isn't licensed.";
  d.licence = on;
  if (on) {
    natMod(
      g,
      n,
      "r21:licence",
      "The Indian trade licensed",
      50 * DAYS_PER_YEAR,
      LICENCE.fx,
    );
    for (const o of nativeNeighbours(s, g.w, n))
      relate(g, o, n, "Traders licensed and bonded", LICENCE.regard, 1);
    journal(
      g,
      life,
      "Every trader with the nations must now be licensed and bonded, and the weights are inspected. The sharpers are furious.",
      "good",
    );
  } else {
    natMod(g, n, "r21:licence", "", 0, {});
    journal(g, life, "The Indian trade is open to anyone again.");
  }
  return null;
}

// ---------------------------------------------------------------- the militia

/** Musters: four a year, or a monthly drill; the cost a month from the treasury, and what it does. */
export const MUSTERS = [
  {
    name: "No musters",
    gold: 0,
    morale: 0,
    fx: {} as Partial<Record<ModFx, number>>,
  },
  {
    name: "Four musters a year",
    gold: 2,
    morale: 0.1,
    fx: { unrest: -1, production: -0.01 },
  },
  {
    name: "A monthly drill",
    gold: 5,
    morale: 0.2,
    fx: { unrest: -2, production: -0.02 },
  },
];

/** Ranging companies on the frontier: the cost a month each, the most. */
export const RANGERS = { gold: 3, max: 3 };

export function setMusters(
  g: ConquestGame,
  life: Life,
  level: number,
): string | null {
  const s = g.s;
  const n = governedBy(s, life);
  if (n < 0) return "Only the governor orders the musters.";
  if (!Number.isInteger(level) || !MUSTERS[level]) return "No such order.";
  const d = deskOf(g, n);
  if ((d.musters ?? 0) === level) return "That's the order now.";
  d.musters = level;
  natMod(
    g,
    n,
    "r21:musters",
    MUSTERS[level].name,
    50 * DAYS_PER_YEAR,
    MUSTERS[level].fx,
  );
  journal(g, life, `The militia: ${MUSTERS[level].name.toLowerCase()}.`);
  return null;
}

export function setRangers(
  g: ConquestGame,
  life: Life,
  k: number,
): string | null {
  const s = g.s;
  const n = governedBy(s, life);
  if (n < 0) return "Only the governor raises ranging companies.";
  if (!Number.isInteger(k) || k < 0 || k > RANGERS.max)
    return `None to ${RANGERS.max}.`;
  const d = deskOf(g, n);
  if ((d.rangers ?? 0) === k) return "That's how many there are.";
  d.rangers = k;
  journal(
    g,
    life,
    k
      ? `${k} ranging compan${k === 1 ? "y" : "ies"} on the frontier, at ${k * RANGERS.gold} gold a month.`
      : "The ranging companies are paid off.",
  );
  return null;
}

/** Recruits' morale from the musters (War.ts reads it). */
export function musterMorale(s: GameState, n: number): number {
  return MUSTERS[s.nations[n]?.desk?.musters ?? 0]?.morale ?? 0;
}

// ---------------------------------------------------------------- courts and pardons

/** The colony's prisoners who are players: in its gaols, awaiting trial or serving. */
export function prisoners(s: GameState, n: number): Life[] {
  return s.lives.filter(
    (l) =>
      l.c >= 0 && !l.watching && l.crime?.jail && l.crime.jail.nation === n,
  );
}

export function pardonCheck(s: GameState, life: Life, seat: string): Check {
  const n = governedBy(s, life);
  if (n < 0) return no("Only the governor pardons.");
  const l = lifeOfSeat(s, seat);
  if (!l || !prisoners(s, n).includes(l))
    return no("They aren't in the colony's gaols.");
  return yes;
}

/** A pardon (free, the slate wiped with the colony's law), or the sentence commuted (half the time left). */
export function pardon(
  g: ConquestGame,
  life: Life,
  seat: string,
  full: boolean,
): string | null {
  const s = g.s;
  const ok = pardonCheck(s, life, seat);
  if (!ok.ok) return ok.why;
  const n = governedBy(s, life);
  const l = lifeOfSeat(s, seat)!;
  const j = l.crime!.jail!;
  const me = meOf(s, life)!;
  touchLife(g, l);
  if (full) {
    l.crime!.jail = null;
    delete l.crime!.heat[n];
    journal(
      g,
      l,
      `${charName(me)} has pardoned you: you walk out of the gaol a free ${s.chars[l.c]?.female ? "woman" : "man"}, your slate with the colony's law wiped clean.`,
      "good",
    );
    journal(g, life, `You pardon ${charName(s.chars[l.c])} (${j.charge}).`);
    milestone(g, l, "arrest", `Pardoned by ${charName(me)}`, l.prov, {
      quiet: true,
      tone: "good",
    });
    // The bench doesn't like it.
    const cab = s.power?.cabinets[n];
    const att = cab?.attorney ?? -1;
    if (att >= 0 && s.chars[att]?.alive)
      remembers(
        g,
        life,
        g.char(att),
        "Pardoned a felon over the court's head",
        -5,
        2,
      );
  } else {
    const left = Math.max(0, j.until - s.day);
    l.crime!.jail!.until = s.day + Math.ceil(left / 2);
    journal(
      g,
      l,
      `${charName(me)} has commuted your sentence: you'll be out by ${s.day + Math.ceil(left / 2) > s.day ? "half the time" : "tomorrow"}.`,
      "good",
    );
    journal(g, life, `You commute ${charName(s.chars[l.c])}'s sentence.`);
  }
  return null;
}

// ---------------------------------------------------------------- the months

/** The month's costs to the treasury (on the colony's ledger): musters and rangers. */
export function deskCosts(
  s: GameState,
  n: number,
): { label: string; value: number }[] {
  const d = s.nations[n]?.desk;
  if (!d) return [];
  const out: { label: string; value: number }[] = [];
  const m = MUSTERS[d.musters ?? 0];
  if (m?.gold) out.push({ label: m.name, value: m.gold });
  if (d.rangers)
    out.push({
      label: `Ranging companies (${d.rangers})`,
      value: d.rangers * RANGERS.gold,
    });
  return out;
}

hooks.monthStart.push((g) => {
  const s = g.s;
  for (const nation of s.nations) {
    if (!nation.alive || nation.kind !== "power" || !nation.desk) continue;
    for (const c of deskCosts(s, nation.id))
      tally(g, nation.id, c.label, -c.value);
    progStep(g, nation.id);
    // The licence's goodwill renews each January.
    if (nation.desk.licence && dateOf(s.day).month === 0)
      for (const o of nativeNeighbours(s, g.w, nation.id))
        relate(
          g,
          o,
          nation.id,
          "Traders licensed and bonded",
          LICENCE.regard,
          1,
        );
    // A governor who isn't a player: the desk keeps what's set, but its programme ends with him.
    if (!s.lives.some((l) => l.c === nation.ruler) && nation.desk.prog)
      deskOf(g, nation.id).prog = null;
  }
});

// ---------------------------------------------------------------- commands

export function deskCommand(
  g: ConquestGame,
  life: Life,
  c: DeskCommand,
): string | null {
  if (!meOf(g.s, life) || life.watching) return "You're watching.";
  switch (c.act) {
    case "duty":
      return setDuty(g, life, c.level ?? -1);
    case "prog":
      return setProg(g, life, c.key ?? null);
    case "musters":
      return setMusters(g, life, c.level ?? -1);
    case "rangers":
      return setRangers(g, life, c.level ?? -1);
    case "licence":
      return setLicence(g, life, !!c.on);
    case "council":
      return holdCouncil(g, life, c.n ?? -1);
    case "pardon":
    case "commute":
      return pardon(g, life, c.seat ?? "", c.act === "pardon");
    case "motion":
      return moveMotion(g, life);
    case "vote":
      return voteMotion(g, life, c.vote ?? 0);
    case "declare":
      return declareRev(g, life, !!c.on);
    case "side":
      return revSide(g, life, c.arg ?? "neutral");
    default:
      return "Unknown order.";
  }
}

hooks.command.push((g, life, c) =>
  c.k === "desk" ? deskCommand(g, life, c) : undefined,
);

/** For the page: a county's people of the colony, so a native neighbour's towns. */
export function nativeTowns(s: GameState, o: number): number[] {
  return provincesOf(s, o).filter((p) => tribesfolk(s.provinces[p]) > 0);
}

/** Whether a nation is at war with the colony (for the page). */
export function warWith(s: GameState, n: number, o: number): boolean {
  return atWar(s, n, o);
}

/** A steady pick from a list for a salt (the desk's matters). */
export function pick<T>(xs: T[], ...salt: number[]): T | undefined {
  if (!xs.length) return undefined;
  return xs[Math.floor(hash01(...salt) * xs.length) % xs.length];
}

export type { Nation };
