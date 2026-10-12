// INTRIGUE (r15): plots to kill, Crusader Kings fashion. Choose whom, and how
// (a powder from the apothecary, a hired cutthroat, men waiting on the road,
// an accident at the docks, a bully paid to pick a quarrel and call them
// out), draw in accomplices with a grudge, debts or greed who think well of
// you, and the plot ripens over weeks. Each week it may be found out; when
// its moment comes it comes off or it doesn't. Done, the target dies by the
// world's own death (an heir takes up a line; offices fall vacant). Foiled,
// they're warned, and your enemy for life. Found out, it's the constable, and
// a trial: hanging or transportation. Talk goes round either way.
//
// The costs, the chance it comes off and the chance it's found out are shown
// before you begin, from the same numbers that are rolled.
//
// Another player's character can be the target, but never simply killed:
// they're warned as it ripens (the sharper their wits, the likelier), and
// when the moment comes they get a scene and a chance to act (guards, a
// fight, flight, finding out who). If it succeeds they go on as their heir,
// as with any death. Nobody under eighteen is ever a target. The schemer's
// copy alone holds the plot (IntrigueCore.ts): the target sees nothing of it
// unless they find it out.

import { isBound } from "./BondCore"; // LABOUR (r15)
import { kill } from "./Characters";
import { lawAt } from "./CrimeQueries";
import { realMeans } from "./EventPacing";
import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import { raiseEvent } from "./Hooks";
import {
  closeKin,
  grown,
  idice,
  intrigue,
  intrigueChanged,
  intrigueOf,
  secretNote,
  standing,
} from "./IntrigueCore";
import { addressOf } from "./Letters";
import {
  addRenown,
  addStress,
  hurt,
  journal,
  meet,
  remembers,
  setTie,
  spend,
  touchLife,
} from "./LifeCore";
import {
  Check,
  hasPlace,
  isPlayed,
  lifeOfChar,
  meOf,
  no,
  opinionOf,
  peopleHere,
  skillLevel,
  yes,
} from "./LifeQueries";
import { SKILL_NAMES } from "./LifeRules";
import type { World } from "./Map";
import { charName, hasTrait, stat } from "./Queries";
import { rumour } from "./Rumours";
import { mySchemes, schemeOn } from "./Seduction";
import { openTrial } from "./Trials";
import type {
  Breakdown,
  Character,
  GameState,
  IntrigueScheme,
  Life,
  PlaceKind,
  PlotMethod,
  SchemeOdds,
  Skill,
} from "./Types";

export interface PlotMethodDef {
  label: string;
  text: string;
  /** Coins laid out to begin (more for the great). */
  cost: number;
  /** Weeks before the moment comes. */
  weeks: number;
  /** Your skill that helps it. */
  skill: Skill;
  /** The chance it comes off, in points out of 100, before what changes it. */
  base: number;
  /** The chance a week that it's found out. */
  find: number;
  /** The chance it's traced to you, if it fails at the moment. */
  trace: number;
  /** A place the town must have for it. */
  needs?: PlaceKind;
  /** Only against men (nobody called a woman out). */
  men?: boolean;
  /** How the world hears the death. */
  cause: string;
}

/** The ways to have someone killed, and what each runs on. */
export const PLOT_METHODS: Record<PlotMethod, PlotMethodDef> = {
  poison: {
    label: "Poison, from the apothecary",
    text: "A powder in their wine or their physic. Quiet, if it works: the town calls it a fever. If it doesn't, a sick-bed and a suspicious one.",
    cost: 12,
    weeks: 4,
    skill: "medicine",
    base: 40,
    find: 0.02,
    trace: 0.35,
    needs: "apothecary",
    cause: "a sudden fever",
  },
  cutthroat: {
    label: "A hired cutthroat",
    text: "A man from the waterfront who'll do it for money, on a dark night. Quick, and the likeliest to talk.",
    cost: 18,
    weeks: 3,
    skill: "stealth",
    base: 45,
    find: 0.03,
    trace: 0.45,
    needs: "tavern",
    cause: "a knife in the dark",
  },
  ambush: {
    label: "An ambush on the road",
    text: "Men waiting where the road goes into the woods, the next time they ride out. It takes longer to arrange.",
    cost: 14,
    weeks: 5,
    skill: "fighting",
    base: 38,
    find: 0.025,
    trace: 0.3,
    cause: "set upon on the road",
  },
  accident: {
    label: "An accident at the docks",
    text: "A load that slips, a plank that gives way. Nobody's fault: the hardest to trace, the least sure.",
    cost: 8,
    weeks: 4,
    skill: "stealth",
    base: 30,
    find: 0.015,
    trace: 0.2,
    needs: "docks",
    cause: "an accident at the docks",
  },
  duel: {
    label: "A duel, arranged with a bully",
    text: "A quarrelsome man with a steady hand, paid to pick a quarrel and call them out. Honour does the rest.",
    cost: 15,
    weeks: 2,
    skill: "persuasion",
    base: 35,
    find: 0.02,
    trace: 0.25,
    needs: "tavern",
    men: true,
    cause: "killed in a duel",
  },
};

export const PLOT_METHOD_KEYS = Object.keys(PLOT_METHODS) as PlotMethod[];

/** The numbers every plot shares. */
export const PLOT = {
  /** Never surer than this, nor more hopeless. */
  min: 5,
  max: 85,
  /** Each accomplice: so much likelier to come off, so much likelier to be found out. */
  helper: 8,
  helperFind: 0.01,
  helperTrace: 0.05,
  maxHelpers: 3,
  /** Someone who said no to joining it, and might talk. */
  leakFind: 0.03,
  /** Guards on the target: the chance is so much less. */
  guarded: 0.5,
  /** Plots at once. */
  most: 2,
  /** Weeks it waits for the target to come back within reach. */
  wait: 6,
  /** A player target, when it fails at the moment: the chance it's their death. */
  death: 0.6,
  /** Guards hired against a plot: the cost, and how long they're paid for. */
  guardCost: 6,
  guardDays: 90,
} as const;

/** The chance a player target hears something each week (their intrigue and stealth). */
export function warnChance(s: GameState, life: Life): number {
  const me = meOf(s, life);
  const int = me ? stat(s, me, "int") : 5;
  const p = 0.15 + (int - 5) * 0.03 + skillLevel(s, life, "stealth") * 0.01;
  return Math.round(Math.max(0.05, Math.min(0.6, p)) * 100) / 100;
}

export function plotsOf(s: GameState, life: Life): IntrigueScheme[] {
  return mySchemes(s, life).filter((x) => x.kind === "plot");
}

export function schemeById(
  s: GameState,
  id: number,
): IntrigueScheme | undefined {
  return intrigueOf(s).schemes.find((x) => x.id === id);
}

/** Someone known well enough to plot against: met, or of public note, or here. */
function known(s: GameState, life: Life, c: Character): boolean {
  if (life.met.includes(c.id) || life.ties[c.id]) return true;
  return s.nations.some(
    (n) =>
      n.alive && (n.ruler === c.id || Object.values(n.council).includes(c.id)),
  );
}

/** Where someone can be reached: a player where they are, anyone else at home. */
export function whereabouts(s: GameState, c: Character): number {
  const l = lifeOfChar(s, c.id);
  if (l) return l.travel ? -1 : l.prov;
  return addressOf(s, c);
}

// ---------------------------------------------------------------- can it be done

/** Whether you could set this plot going (not whether it would come off). */
export function plotCheck(
  s: GameState,
  w: World,
  life: Life,
  c: Character | undefined,
  method: PlotMethod,
): Check {
  const me = meOf(s, life);
  const def = PLOT_METHODS[method];
  if (!me || life.watching) return no("You're watching.");
  if (!def) return no("How?");
  if (!c?.alive || c.abroad) return no("They're beyond your reach.");
  if (c.id === me.id) return no("That's you.");
  if (!grown(s, me)) return no("Not until you're eighteen.");
  if (!grown(s, c)) return no("Never a child.");
  // LABOUR (r15): never someone held or bound to service.
  if (isBound(c)) return no("Not someone held or bound to service.");
  if (me.spouse === c.id) return no("Not your own husband or wife.");
  if (closeKin(s, me, c)) return no("Not your own blood.");
  if (life.travel) return no("You're on the road.");
  if (!known(s, life, c)) return no("You don't know them.");
  if (whereabouts(s, c) !== life.prov)
    return no("They're not within reach here: plots are laid where they are.");
  if (schemeOn(s, life, c.id, "plot"))
    return no("You've a plot against them already.");
  if (
    plotsOf(s, life).filter((x) => x.status === "on" || x.status === "strike")
      .length >= PLOT.most
  )
    return no(`You've ${PLOT.most} plots going already.`);
  if (def.needs && !hasPlace(s, w, life.prov, def.needs))
    return no(
      def.needs === "apothecary"
        ? "There's no apothecary here to sell you the powder."
        : def.needs === "docks"
          ? "There are no docks here."
          : "There's no tavern here to find the man in.",
    );
  if (def.men && c.female) return no("Nobody calls a woman out.");
  const cost = plotCost(s, c, method);
  if (life.purse < cost) return no(`It would take ${cost} coins.`);
  return yes;
}

/** What a plot costs to begin: more against the great. */
export function plotCost(
  s: GameState,
  c: Character,
  method: PlotMethod,
): number {
  return PLOT_METHODS[method].cost + Math.max(0, standing(s, c) - 2) * 2;
}

// ---------------------------------------------------------------- the odds

export interface PlotView {
  check: Check;
  /** Another player: they're warned as it ripens, and get a chance to act. */
  player: boolean;
  odds: SchemeOdds;
  weeks: number;
  cost: number;
  /** What makes the chance it comes off (points out of 100). */
  why: Breakdown;
  /** What makes the chance a week it's found out (as a chance). */
  findWhy: Breakdown;
  /** Each way it can end, with its chance (they add up to one). */
  outcomes: { label: string; p: number; bad?: boolean; key: string }[];
  /** For a player target: the chance a week they hear something. */
  warn?: number;
}

/** The chance it comes off, the weeks, the chance it's found out: what's shown is what's rolled. */
export function plotView(
  s: GameState,
  w: World,
  life: Life,
  cId: number,
  method: PlotMethod,
  helpers: number[] = [],
  leaks = 0,
): PlotView {
  const c = s.chars[cId];
  const def = PLOT_METHODS[method] ?? PLOT_METHODS.poison;
  const check = plotCheck(s, w, life, c, method);
  const me = meOf(s, life);
  const player = !!c && !!lifeOfChar(s, c.id);
  const e = new Explain().add("To begin with", def.base);
  const fe = new Explain().add("To begin with", def.find);
  let weeks = def.weeks;
  let trace = def.trace;
  const guarded = !!c && (intrigueOf(s).guards[c.id] ?? -1) >= s.day;
  if (c && me) {
    const sk = skillLevel(s, life, def.skill);
    e.add(
      `Your ${SKILL_NAMES[def.skill].toLowerCase()} (${sk})`,
      Math.round(sk * 1.5),
    );
    const mine = stat(s, me, "int");
    e.add(`Your intrigue (${mine})`, Math.round((mine - 5) * 1.5));
    const theirs = stat(s, c, "int");
    e.add(`Their wits (${theirs})`, -Math.round((theirs - 5) * 1.5));
    const st = standing(s, c);
    if (st > 2)
      e.add("Someone of standing: servants, friends, eyes", -(st - 2) * 4);
    if (helpers.length)
      e.add(
        `${helpers.length} accomplice${helpers.length === 1 ? "" : "s"}`,
        helpers.length * PLOT.helper,
      );
    if (method === "poison" && hasTrait(c, "robust"))
      e.add("A strong constitution", -10);
    if (method === "poison" && hasTrait(c, "sickly"))
      e.add("Sickly already", 5);
    if (method === "cutthroat" && hasTrait(c, "brave"))
      e.add("They'd fight", -5);
    if (method === "accident" && hasTrait(c, "drunkard"))
      e.add("Often in drink", 10);
    if (method === "duel" && hasTrait(c, "craven"))
      e.add("They may refuse the challenge", -15);
    if (method === "duel" && hasTrait(c, "brave"))
      e.add("They'll stand and fight", 5);
    if (guarded) e.mul("Men watching over them", PLOT.guarded);
    const stealth = skillLevel(s, life, "stealth");
    fe.add(`Your stealth (${stealth})`, -stealth * 0.001);
    if (helpers.length)
      fe.add("More mouths to keep shut", helpers.length * PLOT.helperFind);
    if (leaks)
      fe.add("People who said no, and may talk", leaks * PLOT.leakFind);
    fe.add(`Their wits (${theirs})`, (theirs - 5) * 0.003);
    if (st >= 4) fe.add("A great one's household is watchful", 0.01);
    trace += helpers.length * PLOT.helperTrace - stealth * 0.01;
    if (st >= 4) weeks += 1;
  }
  const why = e.done(0, PLOT.min, PLOT.max);
  const findWhy = fe.done(3, 0.005, 0.2);
  const odds: SchemeOdds = {
    p: why.total / 100,
    d: findWhy.total,
    f: Math.round(Math.max(0.05, Math.min(0.9, trace)) * 100) / 100,
  };
  return {
    check,
    player,
    odds,
    weeks,
    cost: c ? plotCost(s, c, method) : def.cost,
    why,
    findWhy,
    outcomes: plotOutcomes(odds, weeks, c?.first ?? "they"),
    ...(player && c ? { warn: warnChance(s, lifeOfChar(s, c.id)!) } : {}),
  };
}

/**
 * Each way a plot can end, from its odds: found out on the way; done (and
 * perhaps traced to you after); foiled at the moment (and perhaps traced).
 * These are the chances the rolls below come to.
 */
export function plotOutcomes(
  o: SchemeOdds,
  weeks: number,
  who = "they",
): { label: string; p: number; bad?: boolean; key: string }[] {
  const found = 1 - (1 - o.d) ** weeks;
  const go = 1 - found;
  return [
    {
      key: "done",
      label: `It's done: ${who} die${who === "they" ? "" : "s"}`,
      p: go * o.p * (1 - o.f / 2),
    },
    {
      key: "done-traced",
      label: "It's done, but traced to you after: a trial for murder",
      p: go * o.p * (o.f / 2),
      bad: true,
    },
    {
      key: "foiled",
      label: `Foiled: ${who === "they" ? "they're" : `${who}'s`} warned, and your enemy for life`,
      p: go * (1 - o.p) * (1 - o.f),
      bad: true,
    },
    {
      key: "found",
      label: "Found out: arrest, and a trial (hanging, or transportation)",
      p: found + go * (1 - o.p) * o.f,
      bad: true,
    },
  ];
}

// ---------------------------------------------------------------- accomplices

/** Who might be drawn in: people here who think well of you. */
export function accompliceCandidates(
  s: GameState,
  life: Life,
  x: IntrigueScheme,
): Character[] {
  const target = s.chars[x.target];
  return peopleHere(s, life.prov, life).filter(
    (c) =>
      c.id !== x.target &&
      !x.helpers.includes(c.id) &&
      grown(s, c) &&
      !isBound(c) && // LABOUR (r15)
      !isPlayed(s, c.id) &&
      !(target && (closeKin(s, c, target) || c.spouse === target.id)) &&
      opinionOf(s, c, life).total >= 10,
  );
}

/** What it costs to draw someone in. */
export function recruitFee(s: GameState, c: Character): number {
  return 4 + standing(s, c) * 2;
}

/** Whether they'd join, and why: a grudge, debts or greed; their scruples against it. */
export function recruitView(
  s: GameState,
  life: Life,
  x: IntrigueScheme | undefined,
  cId: number,
): { check: Check; will: Breakdown; fee: number } {
  const c = s.chars[cId];
  const fee = c ? recruitFee(s, c) : 0;
  const e = new Explain().add("Murder is murder", -25);
  let check: Check = yes;
  if (!x || x.kind !== "plot" || x.seat !== life.seat || x.status !== "on")
    check = no("No such plot.");
  else if (!c) check = no("Nobody.");
  else if (x.helpers.length >= PLOT.maxHelpers)
    check = no(`${PLOT.maxHelpers} accomplices are plenty.`);
  else if (!accompliceCandidates(s, life, x).some((y) => y.id === cId))
    check = no("Not someone who thinks well enough of you, here.");
  else if (life.purse < fee) check = no(`It would take ${fee} coins.`);
  if (c && x) {
    const op = opinionOf(s, c, life).total;
    e.add(`What ${c.first} thinks of you (${op})`, Math.round(op / 2));
    const target = s.chars[x.target];
    const tl = target ? lifeOfChar(s, target.id) : undefined;
    const grudge = tl
      ? opinionOf(s, c, tl).total <= -10
      : !!target && ((c.id * 31 + target.id * 17) % 100) / 100 < 0.2;
    if (grudge) e.add(`Bad blood with ${target?.first ?? "them"}`, 20);
    if (realMeans(s, c) < 8) e.add("Deep in debt", 10);
    if (hasTrait(c, "greedy")) e.add("Greedy", 10);
    if (hasTrait(c, "deceitful")) e.add("Few scruples", 8);
    if (hasTrait(c, "cruel")) e.add("Cruel", 10);
    if (hasTrait(c, "honest")) e.add("Honest", -25);
    if (hasTrait(c, "just")) e.add("Upright", -20);
    if (hasTrait(c, "zealous")) e.add("God-fearing", -10);
    if (hasTrait(c, "craven")) e.add("Afraid of the rope", -10);
  }
  return { check, will: e.done(0), fee };
}

// ---------------------------------------------------------------- doing it

const tag = (x: IntrigueScheme) => `plot:${x.id}`;

/** Set a plot going. */
export function startPlot(
  g: ConquestGame,
  life: Life,
  cId: number,
  method: PlotMethod,
): string | null {
  const s = g.s;
  if (!PLOT_METHODS[method]) return "How?";
  const v = plotView(s, g.w, life, cId, method);
  if (!v.check.ok) return v.check.why;
  const me = meOf(s, life)!;
  const c = s.chars[cId];
  spend(g, life, v.cost);
  const x: IntrigueScheme = {
    id: g.nextId(),
    kind: "plot",
    seat: life.seat,
    by: me.id,
    target: cId,
    p: life.prov,
    started: s.day,
    week: 0,
    weeks: v.weeks,
    method,
    helpers: [],
    leaks: 0,
    odds: v.odds,
    paid: v.cost,
    status: "on",
    warned: 0,
    lines: [
      `You set a plot against ${charName(c)}: ${PLOT_METHODS[method].label.toLowerCase()}. ${v.weeks} weeks, and ${v.cost} coins laid out.`,
    ],
  };
  intrigue(g).schemes.push(x);
  intrigueChanged(g);
  touchLife(g, life).cooldowns[`intr:${tag(x)}`] = s.day;
  secretNote(g, life, x.lines[0]);
  return null;
}

/** Draw someone into a plot. */
export function recruit(
  g: ConquestGame,
  life: Life,
  id: number,
  cId: number,
): string | null {
  const s = g.s;
  const x = schemeById(s, id);
  const v = recruitView(s, life, x, cId);
  if (!v.check.ok) return v.check.why;
  const c = g.char(cId);
  meet(g, life, cId);
  if (v.will.total > 0) {
    spend(g, life, v.fee);
    x!.paid += v.fee;
    x!.helpers.push(cId);
    const nv = plotView(
      s,
      g.w,
      life,
      x!.target,
      x!.method!,
      x!.helpers,
      x!.leaks,
    );
    x!.odds = nv.odds;
    x!.lines.push(`${charName(c)} is in it with you, for ${v.fee} coins.`);
    intrigueChanged(g);
    secretNote(g, life, x!.lines[x!.lines.length - 1], "good");
  } else {
    x!.leaks++;
    const nv = plotView(
      s,
      g.w,
      life,
      x!.target,
      x!.method!,
      x!.helpers,
      x!.leaks,
    );
    x!.odds = nv.odds;
    x!.lines.push(
      `${charName(c)} wants no part of it, and may not keep quiet.`,
    );
    intrigueChanged(g);
    secretNote(g, life, x!.lines[x!.lines.length - 1], "bad");
  }
  return null;
}

/** Give a scheme up (the money's spent). */
export function dropScheme(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const x = schemeById(g.s, id);
  if (
    !x ||
    x.seat !== life.seat ||
    (x.status !== "on" && x.status !== "strike")
  )
    return "No such scheme of yours.";
  if (x.status === "strike") return "Too late: it's happening.";
  close(g, life, x, "dropped", "You let it drop. The money's spent.");
  return null;
}

function close(
  g: ConquestGame,
  life: Life | undefined,
  x: IntrigueScheme,
  status: IntrigueScheme["status"],
  line: string,
  tone?: "good" | "bad",
): void {
  x.status = status;
  x.ended = g.s.day;
  x.lines.push(line);
  if (x.lines.length > 20) x.lines.splice(0, x.lines.length - 20);
  intrigueChanged(g);
  if (life) secretNote(g, life, line, tone);
}

// ---------------------------------------------------------------- the weeks

/** A week of a plot: found out, a warning to a player target, or on towards the moment. */
export function plotWeek(g: ConquestGame, life: Life, x: IntrigueScheme): void {
  const s = g.s;
  const c = s.chars[x.target];
  if (!c?.alive || c.abroad)
    return close(
      g,
      life,
      x,
      "dropped",
      `${charName(c)} is beyond your reach now: the plot comes to nothing.`,
    );
  const r = idice(g);
  if (r.chance(x.odds.d)) return discovered(g, x, false);
  const tl = lifeOfChar(s, c.id);
  if (tl && r.chance(warnChance(s, tl))) warn(g, x, tl);
  if (x.week < x.weeks) {
    x.week++;
    x.lines.push(WEEKS[x.method ?? "poison"][(x.week - 1) % 3]);
    intrigueChanged(g);
    if (x.week < x.weeks) return;
  }
  // The moment: are they within reach?
  if (whereabouts(s, c) !== x.p) {
    x.waited = (x.waited ?? 0) + 1;
    x.lines.push(`${c.first} is away. Your people wait.`);
    intrigueChanged(g);
    if ((x.waited ?? 0) > PLOT.wait)
      close(
        g,
        life,
        x,
        "dropped",
        `${c.first} never came back within reach. It comes to nothing.`,
        "bad",
      );
    return;
  }
  // A player is never struck without a word of warning first.
  if (tl && !x.warned) {
    warn(g, x, tl);
    return;
  }
  strike(g, life, x, c, tl);
}

const WEEKS: Record<PlotMethod, string[]> = {
  poison: [
    "The apothecary weighs out the powder and doesn't ask what it's for.",
    "You learn which cup is theirs, and who pours it.",
    "A servant in the house will carry a tray, for a consideration.",
  ],
  cutthroat: [
    "A man in a tavern by the water names his price.",
    "Your man walks past their door at night, to learn its habits.",
    "He wants half now. You give it him.",
  ],
  ambush: [
    "You learn which road they ride, and when.",
    "There's a place where the road goes down into the creek bottom.",
    "The men are found; they'll wait in the woods.",
  ],
  accident: [
    "You learn when they go down to the wharf.",
    "A crane, a load of barrels, a rope that can be cut part way.",
    "A stevedore will be looking the other way.",
  ],
  duel: [
    "A loud man with a steady hand will pick the quarrel.",
    "He learns which tavern they drink at, and which nights.",
    "He practises with the pistols in a field behind the town.",
  ],
};

/** A player target hears something: a whisper, a strange taste, a shadow. */
function warn(g: ConquestGame, x: IntrigueScheme, tl: Life): void {
  x.warned = (x.warned ?? 0) + 1;
  intrigueChanged(g);
  const k = idice(g).chance(0.5)
    ? 0
    : PLOT_METHOD_KEYS.indexOf(x.method ?? "poison") + 1;
  raiseEvent(g, tl, "intr-warn", { s: x.id, k });
}

/** The moment comes. */
function strike(
  g: ConquestGame,
  life: Life,
  x: IntrigueScheme,
  c: Character,
  tl: Life | undefined,
): void {
  const s = g.s;
  const guarded = (intrigueOf(s).guards[c.id] ?? -1) >= s.day;
  if (tl) {
    if (guarded) {
      journal(
        g,
        tl,
        "The men you hired earned their money: they caught someone where nobody should have been, and he ran. Someone wants you dead.",
        "bad",
      );
      return foiled(g, life, x, c, 1.5);
    }
    x.status = "strike";
    x.lines.push("The moment has come.");
    intrigueChanged(g);
    raiseEvent(g, tl, "intr-strike", {
      s: x.id,
      m: PLOT_METHOD_KEYS.indexOf(x.method ?? "poison"),
    });
    return;
  }
  // The odds it was begun on (with what accomplices brought): as shown.
  if (idice(g).chance(x.odds.p)) done(g, life, x, c);
  else foiled(g, life, x, c);
}

/** It came off: they're dead, by the world's own death. */
function done(
  g: ConquestGame,
  life: Life,
  x: IntrigueScheme,
  c: Character,
): void {
  const def = PLOT_METHODS[x.method ?? "poison"];
  const where = g.map.provinces[x.p]?.name ?? "town";
  close(
    g,
    life,
    x,
    "done",
    `It's done. ${charName(c)} is dead: ${def.cause}.`,
    "good",
  );
  addStress(g, life, 10);
  kill(g, g.char(c.id), def.cause);
  rumour(
    g,
    x.p,
    `${charName(c)} is dead at ${where}: ${def.cause}. Some say it was no accident.`,
    c.id,
    "bad",
  );
  // Traced to you after, perhaps.
  if (idice(g).chance(x.odds.f / 2)) discovered(g, x, true);
}

/** It failed at the moment: they're warned, and your enemy; perhaps traced to you. */
function foiled(
  g: ConquestGame,
  life: Life,
  x: IntrigueScheme,
  c: Character,
  traceMul = 1,
): void {
  const s = g.s;
  const me = meOf(s, life);
  close(
    g,
    life,
    x,
    "foiled",
    `It failed: ${charName(c)} lives, and knows someone wants them dead.`,
    "bad",
  );
  x.knows = true;
  addStress(g, life, 8);
  setTie(g, life, c.id, "nemesis");
  remembers(g, life, g.char(c.id), "Tried to have me killed", -80, 0);
  const tl = lifeOfChar(s, c.id);
  if (tl && me) {
    setTie(g, tl, me.id, "nemesis");
    journal(
      g,
      tl,
      `It was ${charName(me)} who wanted you dead: you're sure of it now. An enemy for life.`,
      "bad",
    );
  }
  rumour(
    g,
    x.p,
    `Someone tried to kill ${charName(c)}, and failed.`,
    c.id,
    "bad",
  );
  if (idice(g).chance(Math.min(0.95, x.odds.f * traceMul)))
    discovered(g, x, false);
}

/** Found out: the constable, and a trial; the target knows. */
export function discovered(
  g: ConquestGame,
  x: IntrigueScheme,
  dead: boolean,
): void {
  const s = g.s;
  const life = s.lives.find((l) => l.seat === x.seat);
  const me = s.chars[x.by];
  const c = s.chars[x.target];
  if (x.status === "on" || x.status === "strike")
    close(
      g,
      life,
      x,
      "found",
      `It's out: the plot against ${charName(c)} is known.`,
      "bad",
    );
  x.status = "found";
  x.knows = true;
  intrigueChanged(g);
  if (!life || !me?.alive || life.c !== me.id) return;
  // Now it's public.
  addRenown(g, life, -5);
  addStress(g, life, 15);
  if (c?.alive) {
    setTie(g, life, c.id, "nemesis");
    remembers(g, life, g.char(c.id), "Tried to have me killed", -80, 0);
    const tl = lifeOfChar(s, c.id);
    if (tl) {
      setTie(g, tl, me.id, "nemesis");
      journal(
        g,
        tl,
        `${charName(me)} has been taken up for conspiring to murder you.`,
        "bad",
      );
    }
  }
  for (const h of x.helpers) {
    const hc = s.chars[h];
    if (hc?.alive) remembers(g, life, g.char(h), "Dragged me into it", -30, 5);
  }
  const charge = dead
    ? `the murder of ${charName(c)}`
    : `conspiring to murder ${charName(c)}`;
  rumour(
    g,
    life.prov,
    `${charName(me)} is taken up for ${charge}.`,
    me.id,
    "bad",
  );
  const p = life.travel ? life.home : life.prov;
  const n = lawAt(s, p);
  if (
    n < 0 ||
    s.nations[n]?.kind !== "power" ||
    (s.power?.trials ?? []).some((t) => t.stage < 5 && t.defendant === me.id)
  ) {
    journal(
      g,
      life,
      `Everyone knows of the plot against ${charName(c)} now. There's no court here to try you for it, but nobody will forget.`,
      "bad",
    );
    return;
  }
  journal(
    g,
    life,
    `The constable is at your door: you're charged with ${charge}.`,
    "bad",
  );
  openTrial(g, {
    kind: "accused",
    defendant: me.id,
    accuser: c?.alive && !isPlayed(s, c.id) ? c.id : -1,
    p,
    nation: n,
    charge,
    grade: dead ? 4 : 3,
    evidence: 7 + x.helpers.length * 1.5 + (dead ? 2 : 0),
  });
}

// ---------------------------------------------------------------- a player at the moment

/** How each way of meeting the moment is tested, by method (the scene's choices). */
export const STRIKE_CHOICES: Record<
  PlotMethod,
  { label: string; tip: string; skill: Skill; dc: number }[]
> = {
  poison: [
    {
      label: "Something's wrong: push it away",
      tip: "Medicine: you know that bitter taste. Fail, and it's in you.",
      skill: "medicine",
      dc: 5,
    },
    {
      label: "Make the one who poured it drink first",
      tip: "Stealth: turn it back on them, and learn who sent it. Fail, and you drink after all.",
      skill: "stealth",
      dc: 7,
    },
    {
      label: "Call for the physician at once",
      tip: "Persuasion: make them come running. Fail, and help comes late.",
      skill: "persuasion",
      dc: 6,
    },
  ],
  cutthroat: [
    {
      label: "Fight him off",
      tip: "Fighting: you're not dead yet. Fail, and he's quicker.",
      skill: "fighting",
      dc: 6,
    },
    {
      label: "Run for the lights",
      tip: "Woodcraft: the alleys are yours. Fail, and it's a dead end.",
      skill: "woodcraft",
      dc: 6,
    },
    {
      label: "Cry murder!",
      tip: "Persuasion: windows open, the watch comes. Fail, and nobody stirs.",
      skill: "persuasion",
      dc: 7,
    },
  ],
  ambush: [
    {
      label: "Spur through them",
      tip: "Fighting: ride them down. Fail, and your horse goes down.",
      skill: "fighting",
      dc: 7,
    },
    {
      label: "Turn into the trees",
      tip: "Woodcraft: lose them in the woods. Fail, and they follow.",
      skill: "woodcraft",
      dc: 6,
    },
    {
      label: "Throw them your purse and talk",
      tip: "Persuasion: perhaps they're only thieves. Fail: they're not.",
      skill: "persuasion",
      dc: 8,
    },
  ],
  accident: [
    {
      label: "Jump clear",
      tip: "Seamanship: you know a parting rope's sound. Fail, and the load comes down.",
      skill: "seamanship",
      dc: 5,
    },
    {
      label: "Throw yourself flat",
      tip: "Woodcraft: quick on your feet. Fail, and it's on you.",
      skill: "woodcraft",
      dc: 6,
    },
    {
      label: "Shout to the men on the crane",
      tip: "Persuasion: they hold it. Fail, and they don't hear.",
      skill: "persuasion",
      dc: 7,
    },
  ],
  duel: [
    {
      label: "Refuse him, before witnesses",
      tip: "Persuasion: show him up for a hired bully. Fail, and they call you a coward (renown lost), but you live.",
      skill: "persuasion",
      dc: 6,
    },
    {
      label: "Accept, and fight",
      tip: "Fighting: pistols at dawn. Fail, and you fall.",
      skill: "fighting",
      dc: 7,
    },
    {
      label: "Have him bound over by the justice",
      tip: "Letters: the law keeps the peace. Fail, and he's waiting for you.",
      skill: "letters",
      dc: 7,
    },
  ],
};

/**
 * A player met the moment (their choice, and how it went). Passed: they live,
 * and the plot's foiled. Failed: it may be their death (and their heir goes
 * on); a refused duel is only shame.
 */
export function strikeMet(
  g: ConquestGame,
  tl: Life,
  id: number,
  choice: number,
  pass: boolean,
): void {
  const s = g.s;
  const x = schemeById(s, id);
  const me = meOf(s, tl);
  if (!x || x.status !== "strike" || !me) return;
  const life = s.lives.find((l) => l.seat === x.seat);
  const method = x.method ?? "poison";
  const c = me;
  if (pass) {
    journal(g, tl, MET[method][choice] ?? "You live.", "good");
    addRenown(g, tl, 1);
    // Turning the poison back, or a cry that brings the watch, names who sent it.
    const traced =
      (method === "poison" && choice === 1) ||
      (method === "cutthroat" && choice === 2);
    if (life) foiled(g, life, x, c, traced ? 3 : 1);
    return;
  }
  if (method === "duel" && choice === 0) {
    addRenown(g, tl, -4);
    journal(
      g,
      tl,
      "They'll call you a coward in the taverns. But you're alive.",
      "bad",
    );
    if (life) foiled(g, life, x, c);
    return;
  }
  if (idice(g).chance(PLOT.death)) {
    const def = PLOT_METHODS[method];
    if (life) {
      close(
        g,
        life,
        x,
        "done",
        `It's done. ${charName(c)} is dead: ${def.cause}.`,
        "good",
      );
      addStress(g, life, 10);
    }
    rumour(
      g,
      x.p,
      `${charName(c)} is dead: ${def.cause}. Some say it was no accident.`,
      c.id,
      "bad",
    );
    kill(g, g.char(c.id), def.cause);
    if (life && idice(g).chance(x.odds.f / 2)) discovered(g, x, true);
    return;
  }
  hurt(g, tl, 35, PLOT_METHODS[method].cause);
  journal(g, tl, "You live, barely. Someone wanted you dead.", "bad");
  if (life) foiled(g, life, x, c);
}

const MET: Record<PlotMethod, string[]> = {
  poison: [
    "You push the cup away. Later the cat that lapped it is found stiff under the table.",
    "The servant goes white, and won't drink. He tells you everything, between sobs.",
    "The physician comes running, and the emetic does its work. A wretched night; you live.",
  ],
  cutthroat: [
    "He's quick, but you're quicker: he runs, bleeding, into the dark.",
    "You know the alleys better than he does. The lights of the tavern, and safety.",
    "Windows bang open, the watch comes running, and he's taken with the knife still in his hand.",
  ],
  ambush: [
    "You put your horse at them and they scatter. A ball through your hat, no more.",
    "Into the trees, off the path, and home by a road they don't know.",
    "They take the purse, argue, and let you go. Not thieves, then, but not killers either.",
  ],
  accident: [
    "You hear the rope go, and jump. The barrels smash where you stood.",
    "Flat on the planks, and the load goes over you into the water.",
    "The men on the crane hold it, swearing, a foot above your head.",
  ],
  duel: [
    '"A hired bully," you say, loud enough for the room, "and a poor one." The room laughs him out of the door.',
    "At dawn, in the field behind the church, you fire first. He'll live; he won't be hired again.",
    "The justice binds him over to keep the peace, and he leaves town by noon.",
  ],
};

// ---------------------------------------------------------------- a player who's been warned

/** The warned hire guards. */
export function hireGuards(g: ConquestGame, life: Life): void {
  const st = intrigue(g);
  spend(g, life, PLOT.guardCost);
  st.guards[life.c] = Math.max(
    st.guards[life.c] ?? 0,
    g.s.day + PLOT.guardDays,
  );
  intrigueChanged(g);
}

/** The warned try to find out who: on success, they know. */
export function findOut(
  g: ConquestGame,
  tl: Life,
  id: number,
  pass: boolean,
): void {
  const s = g.s;
  const x = schemeById(s, id);
  const by = x ? s.chars[x.by] : undefined;
  if (!x || !by || (x.status !== "on" && x.status !== "strike")) {
    journal(
      g,
      tl,
      "Whoever it was, they've given it up. Or they're very careful.",
    );
    return;
  }
  if (!pass) {
    journal(
      g,
      tl,
      "You ask, and watch, and learn nothing. Somebody's careful.",
      "bad",
    );
    return;
  }
  x.knows = true;
  x.lines.push(`${s.chars[x.target]?.first ?? "They"} know it's you.`);
  intrigueChanged(g);
  journal(g, tl, `It's ${charName(by)}. You're sure of it.`, "bad");
  raiseEvent(g, tl, "intr-known", { s: x.id, c: by.id });
}

/** The warned, knowing who, confront them: it's over, and you're enemies. */
export function confront(g: ConquestGame, tl: Life, id: number): void {
  const s = g.s;
  const x = schemeById(s, id);
  const me = meOf(s, tl);
  if (!x || !me || (x.status !== "on" && x.status !== "strike")) return;
  const life = s.lives.find((l) => l.seat === x.seat);
  const by = s.chars[x.by];
  addRenown(g, tl, 2);
  journal(
    g,
    tl,
    `You tell ${charName(by)} to their face that you know. It's over; you're enemies for life.`,
    "good",
  );
  if (life) {
    journal(
      g,
      life,
      `${charName(me)} knows what you've been about, and said so to your face.`,
      "bad",
    );
    close(
      g,
      life,
      x,
      "foiled",
      `${me.first} found you out: the plot is over.`,
      "bad",
    );
    setTie(g, life, me.id, "nemesis");
  }
  setTie(g, tl, x.by, "nemesis");
}

/** The warned lay an information: the plotter is taken up. */
export function inform(g: ConquestGame, tl: Life, id: number): void {
  const x = schemeById(g.s, id);
  if (!x || (x.status !== "on" && x.status !== "strike")) return;
  journal(g, tl, "You lay an information before the justice.");
  discovered(g, x, false);
}

/** The warned slip away for a while: the plot waits for them to come back. */
export function nearestRefuge(g: ConquestGame, life: Life): number {
  const pr = g.map.provinces[life.prov];
  for (const [q] of pr.nb) {
    const def = g.map.provinces[q];
    if (def && !def.closed && g.s.provinces[q]?.owner >= 0) return q;
  }
  return pr.nb[0]?.[0] ?? -1;
}

/** Plots against this player that they know of (for their page). */
export function plotsAgainst(s: GameState, life: Life): IntrigueScheme[] {
  return intrigueOf(s).schemes.filter(
    (x) =>
      x.kind === "plot" &&
      x.target === life.c &&
      x.knows &&
      x.seat !== life.seat,
  );
}

/** A plot's line for the card: how far on, and its odds now. */
export function plotStage(x: IntrigueScheme): string {
  if (x.status === "strike") return "the moment has come";
  if (x.status !== "on") return x.status;
  return `week ${x.week} of ${x.weeks}`;
}
