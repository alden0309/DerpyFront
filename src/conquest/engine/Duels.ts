// HOME (r12): duels played out as scenes, Crusader Kings fashion. A
// challenge given or taken becomes a chain of scenes: the seconds (name one,
// go without, apologise or refuse), the choice of weapons (the challenged
// party chooses: smallswords or pistols), the field at dawn (a last word of
// reconciliation, first blood only, or firing into the air), then the
// exchanges, each with its choices and odds from Fighting and traits (and a
// second at your side), and the outcome: wounds, a death, honour and renown,
// and the law's interest (heat, and a hook the courts can take up).
//
// Everything rides on the life events' machinery: each scene is a raised
// event whose numbers (who, which weapon, the wounds so far) travel in its
// context, so a duel survives saving, loading and the delta like any other
// event, and decides itself if left too long.

import { kill } from "./Characters";
import { addHeat } from "./Crime";
import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import {
  addRenown,
  addStress,
  gainXp,
  hurt,
  journal,
  milestone,
  outcomeMeta,
  remembers,
  setTie,
  touchLife,
} from "./LifeCore";
import type { LCtx, LifeChoice, LifeEventDef } from "./LifeEvents";
import {
  charSkill,
  lifeOfChar,
  meOf,
  opinionOf,
  skillLevel,
} from "./LifeQueries";
import { COWARD_DAYS, ldice, setMark } from "./LifeR21Core"; // LIFE (r21)
import { checkChance } from "./LifeRules";
import { ageOf, charName, hasTrait } from "./Queries";
import { rumour } from "./Rumours"; // LIFE (r21): the town's talk of a run
import type {
  Breakdown,
  Character,
  DuelAftermath,
  GameState,
  Life,
} from "./Types";

/** Game days before a duel's scene decides itself. */
export const DUEL_DAYS = 30;
/** Wounds at which a duellist is down, and from which they may die of it. */
export const DOWN = 35;
export const MORTAL = 60;
/** The law's heat for a duel fought, and for a death in one (colonies only). */
export const DUEL_HEAT = 5;
export const DUEL_DEATH_HEAT = 25;

export type DuelMove = "press" | "guard" | "feint" | "aim" | "snap" | "delope";

const SWORDS = 1;
const PISTOLS = 2;

// ---------------------------------------------------------------- who's who

const foeOf = (g: ConquestGame, ctx: LCtx): Character | undefined =>
  g.s.chars[ctx.c];
const nameOf = (g: ConquestGame, ctx: LCtx) => charName(foeOf(g, ctx));
const firstOf = (g: ConquestGame, ctx: LCtx) => foeOf(g, ctx)?.first ?? "They";
const he = (c: Character | undefined) => (c?.female ? "she" : "he");
const him = (c: Character | undefined) => (c?.female ? "her" : "him");
const his = (c: Character | undefined) => (c?.female ? "her" : "his");
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
const weaponWord = (w: number) => (w === PISTOLS ? "pistols" : "smallswords");

/** A duel is being fought (its scenes are waiting). */
export function duelOn(life: Life): boolean {
  return life.events.some(
    (e) => e.key.startsWith("duel-") && e.key !== "duel-report",
  );
}

/** Who could stand second for you: your best friend here, or a well-wisher. */
export function secondFor(s: GameState, life: Life, foe: number): number {
  const ok = (c: Character | undefined): c is Character =>
    !!c?.alive &&
    !c.abroad &&
    c.id !== foe &&
    c.id !== life.c &&
    ageOf(s, c) >= 18 &&
    (c.home === undefined || c.home === life.prov);
  const friends = Object.entries(life.ties)
    .filter(([, t]) => t === "friend" || t === "mentor")
    .map(([id]) => s.chars[Number(id)])
    .filter(ok);
  if (friends.length) return friends.sort((a, b) => a.id - b.id)[0].id;
  let best = -1;
  let bestOp = 19;
  for (const id of life.met) {
    const c = s.chars[id];
    if (!ok(c)) continue;
    const op = opinionOf(s, c, life).total;
    if (op > bestOp) {
      bestOp = op;
      best = c.id;
    }
  }
  return best;
}

// ---------------------------------------------------------------- the odds

interface Side {
  score: number;
  why: Explain;
}

/** A duellist's hand: their Fighting, and what their nature adds or takes. */
function sideOf(
  s: GameState,
  c: Character,
  life: Life | undefined,
  weapon: number,
  who: "You" | "They",
): Side {
  const e = new Explain();
  const sk = life
    ? skillLevel(s, life, "fighting")
    : charSkill(s, c, "fighting");
  e.add(`${who === "You" ? "Your" : "Their"} fighting`, sk, true);
  const t = (id: Parameters<typeof hasTrait>[1], label: string, v: number) => {
    if (hasTrait(c, id)) e.add(label, v);
  };
  t("brave", "Brave", 1);
  t("craven", "Craven", -2);
  t("scarred", "Has done this before", 1);
  t("wounded", "An old wound", -1);
  t("sickly", "Sickly", -1);
  if (weapon === SWORDS) {
    t("strong", "A strong arm", 1);
    t("cruel", "Means to hurt", 1);
    t("gouty", "Gout in the foot", -1);
  } else {
    t("drunkard", "An unsteady hand", -1);
    t("diligent", "Practised at the butts", 1);
  }
  const age = ageOf(s, c);
  if (age >= 55) e.add("Getting on", -1);
  if (life) {
    if (life.health < 50) e.add("Not in health", -1);
    if (life.stress > 60) e.add("Shaken", -1);
  }
  return { score: e.total, why: e };
}

function mine(s: GameState, life: Life, ctx: LCtx): Side {
  const me = meOf(s, life)!;
  const side = sideOf(s, me, life, ctx.w || SWORDS, "You");
  if (ctx.sec >= 0) side.why.add("A second at your side", 1);
  else side.why.add("Nobody to see fair play", -1);
  side.score = side.why.total;
  return side;
}

function theirs(s: GameState, ctx: LCtx): Side {
  const c = s.chars[ctx.c];
  return sideOf(s, c, lifeOfChar(s, c.id), ctx.w || SWORDS, "They");
}

/** A pistol shot's chance of finding its mark: luck more than skill. */
function pistolHit(score: number, quick: boolean): number {
  return Math.max(
    0.1,
    Math.min(0.72, 0.34 + 0.035 * (score - 5) - (quick ? 0.1 : 0)),
  );
}

const SWORD_DC: Record<string, number> = { press: 1, guard: -1, feint: 2 };

/** Your chance with a move, and why (the breakdown the scene shows). */
export function duelOdds(
  s: GameState,
  life: Life,
  ctx: LCtx,
  move: DuelMove,
): { chance: number; why: Breakdown } {
  const a = mine(s, life, ctx);
  const b = theirs(s, ctx);
  const e = new Explain();
  for (const p of a.why.parts) e.add(p.label, p.value);
  for (const p of b.why.parts)
    e.add(p.label.replace(/^Their/, "Their"), -p.value);
  if (move === "delope") return { chance: 0, why: e.done(0) };
  if (ctx.w === PISTOLS) {
    const quick = move === "snap";
    if (quick) e.add("Firing at the word", -1);
    return {
      chance: pistolHit(a.score, quick),
      why: e.done(0),
    };
  }
  let dc = b.score + (SWORD_DC[move] ?? 0);
  if (move === "feint") {
    const me = meOf(s, life)!;
    if (hasTrait(me, "deceitful") || hasTrait(me, "shrewd")) {
      e.add("Sly", 2);
      dc -= 2;
    }
    e.add("A feint is a gamble", -2);
  }
  if (move === "press") e.add("Pressing is riskier", -1);
  if (move === "guard") e.add("Guarding is safer", 1);
  return { chance: checkChance(a.score, dc), why: e.done(0) };
}

/** Their chance of hitting you with a pistol. */
function theirShot(g: ConquestGame, ctx: LCtx, quick: boolean): number {
  return pistolHit(theirs(g.s, ctx).score, quick);
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

// ---------------------------------------------------------------- LIFE (r21): to the death

/**
 * A duel to the death: no first blood, no firing into the air, no yielding.
 * It goes on until one of you is down (wounds of 35), and the one who's down
 * dies of it; with pistols, the seconds load again for up to five exchanges.
 * Losing, you may run from the field: you live, and the town calls you a
 * coward for three years.
 */
export const DEATH = {
  /** Pistols: exchanges before the seconds call it, hit or miss. */
  pistolRounds: 5,
  /** Running: renown lost, the coward's name, and a chance of a parting cut. */
  runRenown: -12,
  runCut: 0.25,
  runCutWound: [8, 18] as [number, number],
  /** They demand it to the death: a sworn enemy, or this much hatred (less for a grave insult). */
  demand: -70,
  demandGrave: -30,
  /** A craven foe who's losing badly may run (each pass). */
  theyRun: 0.5,
};

/** Whether a challenge made to you is to the death: the insult's weight. */
export function deathDemanded(
  s: GameState,
  life: Life,
  foe: Character,
  grave = false,
): boolean {
  if (hasTrait(foe, "craven")) return false;
  if (life.ties[foe.id] === "nemesis") return true;
  const op = opinionOf(s, foe, life).total;
  if (op <= DEATH.demand) return true;
  if (grave && op <= DEATH.demandGrave) return true;
  return hasTrait(foe, "cruel") && op <= -50;
}

/** Their chance of taking your terms, to the death, and why. */
export function deathAgree(
  s: GameState,
  life: Life,
  foe: Character,
): { chance: number; why: Breakdown } {
  const e = new Explain().add("Few will stake their life on a quarrel", 25);
  if (hasTrait(foe, "brave")) e.add("Brave", 25);
  if (hasTrait(foe, "cruel")) e.add("Means to hurt", 15);
  if (hasTrait(foe, "craven")) e.add("Craven", -40);
  if (hasTrait(foe, "content")) e.add("Content with life", -10);
  if (life.ties[foe.id] === "nemesis") e.add("Your sworn enemy", 30);
  const op = opinionOf(s, foe, life).total;
  if (op < 0) e.add(`Their hatred (${op})`, Math.round(-op / 4));
  if (ageOf(s, foe) >= 50) e.add("Getting on", -10);
  // A man who'd likely lose holds back; one who'd likely win leans in.
  const mine = deathOdds(s, life, { c: foe.id, w: SWORDS, sec: -1 }).win;
  e.add(
    `Their chance against you (${pct(1 - mine)})`,
    Math.round((0.5 - mine) * 60),
  );
  const why = e.done(0);
  return {
    chance: Math.max(0.05, Math.min(0.9, why.total / 100)),
    why,
  };
}

/** A wound's spread as [wounds, chance], capped at "down". */
function spread(
  lo: number,
  hi: number,
  bonus = 0,
  bonusP = 0,
): [number, number][] {
  const out = new Map<number, number>();
  const n = hi - lo + 1;
  for (let k = lo; k <= hi; k++) {
    const add = (v: number, p: number) =>
      out.set(Math.min(DOWN, v), (out.get(Math.min(DOWN, v)) ?? 0) + p);
    add(k, ((1 - bonusP) * 1) / n);
    if (bonusP) add(k + bonus, bonusP / n);
  }
  return [...out.entries()];
}

/**
 * Your chance of coming off the field the winner of a duel to the death,
 * from wounds as they stand, keeping to one move (the same tables the
 * exchanges roll from). Swords: pass after pass until one is down.
 * Pistols: exchange after exchange (five at most; then nobody wins).
 */
export function deathOdds(
  s: GameState,
  life: Life,
  ctx: LCtx,
  move?: DuelMove,
): { win: number; lose: number } {
  const mw = ctx.mw ?? 0;
  const fw = ctx.fw ?? 0;
  if ((ctx.w || SWORDS) === PISTOLS) {
    const m = move === "snap" ? "snap" : "aim";
    const p = duelOdds(s, life, { ...ctx, w: PISTOLS }, m).chance;
    const q0 = pistolHit(theirs(s, { ...ctx, w: PISTOLS }).score, false);
    const mine = spread(15, 50, 30, 0.2);
    const yours = spread(15, 45, 25, 0.15);
    const memo = new Map<string, [number, number]>();
    const go = (a: number, b: number, r: number): [number, number] => {
      if (b >= DOWN && a < DOWN) return [1, 0];
      if (a >= DOWN) return [b >= DOWN ? 0 : 0, 1];
      if (r >= DEATH.pistolRounds) return [0, 0];
      const key = `${a},${b},${r}`;
      const hit = memo.get(key);
      if (hit) return hit;
      let win = 0;
      let lose = 0;
      // I hit or not; they hit or not (half as likely if I fired first and hit).
      for (const iHit of [true, false]) {
        const pi = iHit ? p : 1 - p;
        const q = iHit && m === "snap" ? q0 * 0.5 : q0;
        for (const theyHit of [true, false]) {
          const pq = theyHit ? q : 1 - q;
          const w0 = pi * pq;
          if (w0 <= 0) continue;
          const fws = iHit ? mine : [[0, 1] as [number, number]];
          const mws = theyHit ? yours : [[0, 1] as [number, number]];
          for (const [df, pf] of fws)
            for (const [dm, pm] of mws) {
              const [wn, ls] = go(
                Math.min(DOWN, a + dm),
                Math.min(DOWN, b + df),
                r + 1,
              );
              win += w0 * pf * pm * wn;
              lose += w0 * pf * pm * ls;
            }
        }
      }
      const res: [number, number] = [win, lose];
      memo.set(key, res);
      return res;
    };
    const [win, lose] = go(mw, fw, ctx.r ?? 0);
    return { win, lose };
  }
  const m = move && SWORD_WOUND[move] ? move : "guard";
  const p = duelOdds(s, life, { ...ctx, w: SWORDS }, m).chance;
  const hitThem = spread(...SWORD_WOUND[m]);
  const hitMe = spread(...SWORD_TAKEN[m]);
  const memo = new Map<number, number>();
  const go = (a: number, b: number): number => {
    if (b >= DOWN) return 1;
    if (a >= DOWN) return 0;
    const key = a * 64 + b;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let v = 0;
    for (const [d, pd] of hitThem) v += p * pd * go(a, b + d);
    for (const [d, pd] of hitMe) v += (1 - p) * pd * go(a + d, b);
    memo.set(key, v);
    return v;
  };
  const win = go(mw, fw);
  return { win, lose: 1 - win };
}

/** In words: "about 3 in 5 you walk away, 2 in 5 you're carried". */
export function deathWords(o: { win: number; lose: number }): string {
  return `if it goes on: ${pct(o.win)} you walk off the field, ${pct(o.lose)} you're carried off it${o.win + o.lose < 0.99 ? `, ${pct(1 - o.win - o.lose)} the seconds call it` : ""}`;
}

// ---------------------------------------------------------------- starting one

function raise(g: ConquestGame, life: Life, key: string, ctx: LCtx): void {
  raiseEvent(g, life, key, ctx);
  const ev = life.events.find((e) => e.key === key);
  if (ev) ev.expires = Math.min(ev.expires, g.s.day + DUEL_DAYS);
}

/**
 * A challenge: given (you call them out) or taken (they call you out). It
 * opens the first scene; the rest follow as you answer them.
 */
export function startDuel(
  g: ConquestGame,
  life: Life,
  foe: Character,
  challenged: boolean,
  /**
   * LIFE (r21): to the death. "ask": you asked it of them (they may agree);
   * a challenge made to you is to the death when the insult weighs enough
   * (`deathDemanded`), the more readily when it's `grave` (a wife's honour).
   */
  terms: { death?: "ask"; grave?: boolean } = {},
): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return;
  touchLife(g, life);
  const name = charName(foe);
  if (life.ties[foe.id] !== "nemesis") setTie(g, life, foe.id, "rival");
  // Their second: someone of their household or the town.
  const locals = (s.locals[life.prov] ?? []).filter(
    (id) => id !== foe.id && id !== me.id && s.chars[id]?.alive,
  );
  const fsec = locals.length ? locals[g.rng.int(0, locals.length - 1)] : -1;
  // LIFE (r21): to the death, if it's demanded of you or you asked and they'd have it.
  let dd = 0;
  if (challenged && deathDemanded(s, life, foe, !!terms.grave)) dd = 1;
  else if (!challenged && terms.death === "ask") {
    const agree = deathAgree(s, life, foe);
    dd = ldice(s, 0x7d1, foe.id, life.c).chance(agree.chance) ? 1 : 0;
    journal(
      g,
      life,
      dd
        ? `${charName(foe)} takes your terms: it will be to the death.`
        : `${charName(foe)} won't stake ${foe.female ? "her" : "his"} life on it: the ordinary terms, or nothing.`,
      dd ? "bad" : undefined,
    );
  }
  raise(g, life, "duel-call", {
    dd, // LIFE (r21)
    c: foe.id,
    ch: challenged ? 0 : 1,
    sc: secondFor(s, life, foe.id),
    sec: -1,
    fsec,
    w: 0,
    r: 0,
    mw: 0,
    fw: 0,
    fb: 0,
    dl: 0,
    fdl: 0,
    p: life.prov,
  });
  journal(
    g,
    life,
    challenged
      ? `${name} has called you out. The seconds will want to see you tonight.`
      : `You have called ${name} out. Now it must be arranged.`,
    "bad",
  );
  outcomeMeta(g, life, { ok: null, c: foe.id });
}

// ---------------------------------------------------------------- the end of it

function endDuel(g: ConquestGame, life: Life, ctx: LCtx, how: string): void {
  const s = g.s;
  const me = meOf(s, life)!;
  const foe = foeOf(g, ctx);
  if (!foe) return;
  const name = charName(foe);
  const other = lifeOfChar(s, foe.id);
  const cause = `a duel with ${charName(me)}`;
  gainXp(g, life, "fighting", 15);
  const weapon = ctx.w === PISTOLS ? "pistols" : "swords";
  // Who came off best.
  let res = 0;
  if (how === "yield" || how === "ran") res = -1;
  else if (how === "theyyield" || how === "theyran") res = 1;
  else if (ctx.fw > ctx.mw) res = 1;
  else if (ctx.mw > ctx.fw) res = -1;
  // A death from the wounds.
  let dead = -1;
  // LIFE (r21): to the death, whoever is down dies of it.
  if (how === "death" && ctx.fw >= DOWN) {
    dead = foe.id;
    if (other) hurt(g, other, 200, cause);
    else kill(g, g.char(foe.id), cause);
  } else if (how === "death") {
    // You're down: nothing more for them.
  } else if (
    ctx.fw >= MORTAL &&
    g.rng.chance(Math.min(0.85, (ctx.fw - 45) / 50))
  ) {
    dead = foe.id;
    if (other) hurt(g, other, 200, cause);
    else kill(g, g.char(foe.id), cause);
  } else if (ctx.fw > 0 && other) hurt(g, other, ctx.fw, cause);
  // STORY (r17): every duel is in the story (the one fought with you too, if you're played).
  duelStory(g, life, other, me, foe, how, res, dead, weapon);
  // Honour and renown.
  if (how === "ran") {
    // LIFE (r21): you ran from a duel to the death.
    addRenown(g, life, DEATH.runRenown);
    addStress(g, life, 10);
    setMark(g, life, "coward", COWARD_DAYS);
    remembers(
      g,
      life,
      g.char(foe.id),
      "Ran from me like a whipped dog",
      -10,
      5,
    );
    rumour(
      g,
      ctx.p,
      `${charName(me)} ran from a duel to the death with ${name}, and was seen going over the wall of the churchyard.`,
      me.id,
      "bad",
    );
    journal(
      g,
      life,
      `You ran. Behind you ${name}'s second is laughing, and by noon the whole town will be. They'll call you a coward for years.`,
      "bad",
    );
  } else if (how === "theyran") {
    addRenown(g, life, 7);
    remembers(g, life, g.char(foe.id), "Ran from me on the field", -20, 10);
    journal(
      g,
      life,
      `${name} ran from the field. The day is yours, and so is the story.`,
      "good",
    );
  } else if (how === "delope") {
    addRenown(g, life, 3);
    journal(
      g,
      life,
      `You both fired into the air. Honour is satisfied, and the town will talk of it kindly.`,
      "good",
    );
  } else if (how === "reconciled") {
    addRenown(g, life, 1);
    remembers(g, life, g.char(foe.id), "Made it up on the field", 15, 3);
    if (life.ties[foe.id] === "rival") setTie(g, life, foe.id, null);
    journal(
      g,
      life,
      `The seconds talked it round on the very field. You and ${name} shook hands.`,
      "good",
    );
  } else if (res > 0) {
    addRenown(g, life, dead >= 0 ? 4 : 6);
    remembers(g, life, g.char(foe.id), "Beat me in a duel", -30, 10);
    if (dead >= 0) {
      addStress(g, life, 15);
      journal(g, life, `${name} died of it on the grass.`, "bad");
    } else journal(g, life, `You bested ${name}. Honour is satisfied.`, "good");
  } else if (res < 0) {
    addRenown(g, life, how === "yield" ? -3 : 1);
    if (other) addRenown(g, other, 4);
    journal(
      g,
      life,
      how === "yield"
        ? `You lowered your blade and yielded to ${name}.`
        : `${name} had the better of you.`,
      "bad",
    );
  } else {
    addRenown(g, life, 2);
    journal(
      g,
      life,
      `Neither of you had the better of it. The seconds declared honour satisfied.`,
    );
  }
  // Your own wounds; they may kill you.
  let iDied = false;
  if (ctx.mw > 0) {
    life.tally.wounds++;
    iDied = hurt(
      g,
      life,
      // LIFE (r21): to the death, the one who's down doesn't get up.
      how === "death" && ctx.mw >= DOWN ? 200 : ctx.mw,
      `a duel with ${name}`,
    );
    if (ctx.mw >= DOWN && !iDied)
      milestone(g, life, "wounded", `Wounded in a duel with ${name}`);
  }
  // The law's interest: duelling is against the law in the colonies, and a death the more so.
  const nation = (() => {
    const pr = s.provinces[ctx.p];
    return pr ? (pr.occupier >= 0 ? pr.occupier : pr.owner) : -1;
  })();
  const colonial = nation >= 0 && s.nations[nation]?.kind !== "native";
  const fought = how !== "delope" && how !== "reconciled";
  if (colonial && fought && !iDied)
    addHeat(g, life, nation, dead >= 0 ? DUEL_DEATH_HEAT : DUEL_HEAT);
  const d: DuelAftermath = {
    day: s.day,
    prov: ctx.p,
    nation,
    challenger: ctx.ch === 1 ? me.id : foe.id,
    challenged: ctx.ch === 1 ? foe.id : me.id,
    weapon,
    dead: iDied ? me.id : dead,
    wounded: [
      ...(ctx.mw > 0 ? [me.id] : []),
      ...(ctx.fw > 0 && dead < 0 ? [foe.id] : []),
    ],
  };
  for (const h of hooks.duelAftermath) h(g, life, d);
  if (iDied || life.c !== me.id) return;
  raise(g, life, "duel-outcome", {
    ...ctx,
    res,
    dead: dead >= 0 ? 1 : 0,
    law: colonial && fought ? 1 : 0,
    how: HOWS.indexOf(how),
  });
}

/**
 * STORY (r17): the duel in the story, as it went (a win is talked of in the
 * town, as it always was; the rest are quiet). A played foe's story has it
 * too, from their side: what happened, never what they said.
 */
function duelStory(
  g: ConquestGame,
  life: Life,
  other: Life | undefined,
  me: Character,
  foe: Character,
  how: string,
  res: number,
  dead: number,
  weapon: string,
): void {
  const name = charName(foe);
  const quiet = { quiet: true } as const;
  // LIFE (r21): to the death, and running from it.
  if (how === "ran") {
    milestone(
      g,
      life,
      "duel",
      `Ran from a duel to the death with ${name}`,
      life.prov,
      { ...quiet, tone: "bad" },
    );
    if (other && other !== life)
      milestone(
        g,
        other,
        "duel",
        `${charName(me)} ran from your duel to the death`,
        other.prov,
        { ...quiet, tone: "good" },
      );
    return;
  }
  if (how === "theyran") {
    milestone(
      g,
      life,
      "duel",
      `${name} ran from your duel to the death`,
      life.prov,
      { tone: "good" },
    );
    return;
  }
  if (how === "death" && res > 0) {
    milestone(
      g,
      life,
      "duel",
      `Killed ${name} in a duel to the death, with ${weapon}`,
      life.prov,
      { tone: "good", big: true },
    );
    return;
  }
  if (how === "delope")
    milestone(
      g,
      life,
      "duel",
      `Met ${name} on the field: you both fired into the air`,
      life.prov,
      { ...quiet, tone: "good" },
    );
  else if (how === "reconciled")
    milestone(
      g,
      life,
      "duel",
      `Met ${name} on the field, and made it up`,
      life.prov,
      { ...quiet, tone: "good" },
    );
  else if (res > 0)
    // The win is talked of in the town, as it was when it went under "renown".
    milestone(
      g,
      life,
      "duel",
      dead >= 0
        ? `Won a duel against ${name} with ${weapon}: ${name} died of it`
        : `Won a duel against ${name} with ${weapon}`,
      life.prov,
      { tone: "good", big: dead >= 0 },
    );
  else if (res < 0)
    milestone(
      g,
      life,
      "duel",
      how === "yield"
        ? `Yielded to ${name} in a duel with ${weapon}`
        : `Lost a duel to ${name}, with ${weapon}`,
      life.prov,
      { ...quiet, tone: "bad" },
    );
  else
    milestone(
      g,
      life,
      "duel",
      `Fought ${name} with ${weapon}: neither had the better of it`,
      life.prov,
      quiet,
    );
  if (!other || other === life) return;
  const mine = charName(me);
  const theirs =
    how === "delope"
      ? `Met ${mine} on the field: you both fired into the air`
      : how === "reconciled"
        ? `Met ${mine} on the field, and made it up`
        : res > 0
          ? `Lost a duel to ${mine}, with ${weapon}`
          : res < 0
            ? `Won a duel against ${mine} with ${weapon}`
            : `Fought ${mine} with ${weapon}: neither had the better of it`;
  milestone(g, other, "duel", theirs, other.prov, {
    quiet: true,
    ...(res !== 0 && how !== "delope" && how !== "reconciled"
      ? { tone: res > 0 ? ("bad" as const) : ("good" as const) }
      : {}),
  });
}

const HOWS = [
  "fought",
  "yield",
  "theyyield",
  "delope",
  "reconciled",
  "firstblood",
  "satisfied",
  // LIFE (r21): to the death: one of you died of it; you ran; they ran.
  "death",
  "ran",
  "theyran",
];

// ---------------------------------------------------------------- the exchanges

const SWORD_WOUND: Record<string, [number, number]> = {
  press: [12, 28],
  guard: [6, 16],
  feint: [16, 36],
};
const SWORD_TAKEN: Record<string, [number, number]> = {
  press: [10, 24],
  guard: [5, 13],
  feint: [12, 26],
};

const HIT_THEM = [
  "Your point finds {his} sword arm.",
  "You beat {his} blade aside and cut {him} across the ribs.",
  "{He} parries late; your steel opens {his} shoulder.",
  "A thrust under {his} guard: {he} staggers back, bleeding.",
];
const HIT_YOU = [
  "{His} riposte comes like a snake: your forearm is laid open.",
  "You overreach, and {his} point takes you in the thigh.",
  "{He} binds your blade and cuts you along the cheek.",
  "Steel in your side, a hand's breadth from the heart.",
];
const SHOT_THEM = [
  "Your ball takes {him} in the hip; {he} goes down on one knee.",
  "{He} spins with the shot and clutches {his} side.",
  "A hit, high in the chest. The surgeon is running before {he} falls.",
];
const SHOT_YOU = [
  "Something hits you like a mule's kick: you're down in the wet grass.",
  "{His} ball tears through your coat and your shoulder with it.",
  "A sting along the ribs, then the warmth of your own blood.",
];
const MISS = [
  "The ball goes somewhere into the trees.",
  "A puff of smoke, a flat crack, and nothing.",
  "Wide: a rook goes up from the elms, cawing.",
];

function line(g: ConquestGame, list: string[], c: Character | undefined) {
  return g.rng
    .pick(list)!
    .replace(/\{He\}/g, cap(he(c)))
    .replace(/\{he\}/g, he(c))
    .replace(/\{His\}/g, cap(his(c)))
    .replace(/\{his\}/g, his(c))
    .replace(/\{him\}/g, him(c));
}

const rollIn = (g: ConquestGame, [a, b]: [number, number]) => g.rng.int(a, b);

/** One exchange, its result written down; then the next, or the end. */
function exchange(
  g: ConquestGame,
  life: Life,
  ctx: LCtx,
  move: DuelMove,
): void {
  const foe = foeOf(g, ctx);
  if (!foe?.alive) {
    journal(g, life, "Your opponent never came to the field.");
    return;
  }
  const next: LCtx = { ...ctx, r: ctx.r + 1 };
  outcomeMeta(g, life, { scene: "duel", c: foe.id });
  if (ctx.w === PISTOLS) {
    const p = duelOdds(g.s, life, ctx, move).chance;
    const theyDelope = ctx.fdl === 1;
    const theyQuick = hasTrait(foe, "craven");
    const iHit = move !== "delope" && g.rng.next() < p;
    let q = theyDelope ? 0 : theirShot(g, ctx, theyQuick);
    if (move === "snap" && iHit) q *= 0.5;
    const theyHit = g.rng.next() < q;
    if (iHit) {
      next.fw += rollIn(g, [15, 50]) + (g.rng.chance(0.2) ? 30 : 0);
      journal(g, life, line(g, SHOT_THEM, foe), "good");
    } else if (move === "delope")
      journal(g, life, "You raise your pistol and fire into the air.");
    else journal(g, life, `You fire. ${g.rng.pick(MISS)}`);
    if (theyHit) {
      next.mw += rollIn(g, [15, 45]) + (g.rng.chance(0.15) ? 25 : 0);
      journal(g, life, line(g, SHOT_YOU, foe), "bad");
    } else if (theyDelope)
      journal(g, life, `${cap(firstOf(g, ctx))} fires into the air.`);
    else journal(g, life, `${cap(firstOf(g, ctx))} fires. ${g.rng.pick(MISS)}`);
    outcomeMeta(g, life, {
      ok: iHit && !theyHit ? true : theyHit ? false : null,
    });
    // LIFE (r21): to the death, the seconds load again until one is down.
    if (ctx.dd) {
      if (next.fw >= DOWN || next.mw >= DOWN)
        return endDuel(g, life, next, "death");
      if (next.r >= DEATH.pistolRounds)
        return endDuel(g, life, next, "satisfied");
      raise(g, life, "duel-exchange", next);
      return;
    }
    if (move === "delope" && theyDelope)
      return endDuel(g, life, next, "delope");
    if (next.fw > 0 || next.mw > 0 || next.r >= 2 || move === "delope")
      return endDuel(
        g,
        life,
        next,
        next.fw || next.mw ? "fought" : "satisfied",
      );
    // Both missed: another exchange, if anyone wants one.
    raise(g, life, "duel-exchange", next);
    return;
  }
  // Swords: a pass.
  const p = duelOdds(g.s, life, ctx, move).chance;
  const pass = g.rng.next() < p;
  if (pass) {
    next.fw += rollIn(g, SWORD_WOUND[move]);
    journal(g, life, line(g, HIT_THEM, foe), "good");
  } else {
    next.mw += rollIn(g, SWORD_TAKEN[move]);
    journal(g, life, line(g, HIT_YOU, foe), "bad");
  }
  outcomeMeta(g, life, { ok: pass });
  // LIFE (r21): to the death, pass after pass until one of you is down.
  if (ctx.dd) {
    if (next.fw >= DOWN || next.mw >= DOWN)
      return endDuel(g, life, next, "death");
    if (
      next.fw >= 20 &&
      next.fw > next.mw + 10 &&
      hasTrait(foe, "craven") &&
      ldice(g.s, 0x7d2, foe.id, next.r).chance(DEATH.theyRun)
    ) {
      journal(
        g,
        life,
        `${cap(firstOf(g, ctx))} throws down ${his(foe)} sword and runs for the trees.`,
        "good",
      );
      return endDuel(g, life, next, "theyran");
    }
    raise(g, life, "duel-exchange", next);
    return;
  }
  if (ctx.fb && (next.fw > 0 || next.mw > 0))
    return endDuel(g, life, next, "firstblood");
  if (next.fw >= DOWN) return endDuel(g, life, next, "fought");
  if (next.mw >= DOWN) return endDuel(g, life, next, "fought");
  if (next.r >= 3) return endDuel(g, life, next, "satisfied");
  // The other side may yield, hurt and outmatched.
  if (
    next.fw >= 20 &&
    next.fw > next.mw + 10 &&
    (hasTrait(foe, "craven") || g.rng.chance(0.25))
  ) {
    journal(
      g,
      life,
      `${cap(firstOf(g, ctx))} lowers ${his(foe)} sword and yields.`,
      "good",
    );
    return endDuel(g, life, next, "theyyield");
  }
  raise(g, life, "duel-exchange", next);
}

// ---------------------------------------------------------------- the scenes

/**
 * Which of a duel scene's choices belong to it (the others are for the
 * other weapon, or for later): by the scene and its numbers alone, so the
 * page can show just these.
 */
export function duelChoicesShown(key: string, ctx: LCtx): number[] {
  const all = (n: number) => Array.from({ length: n }, (_, i) => i);
  switch (key) {
    case "duel-call":
      return ctx.ch === 1 ? [0, 1, 2] : [0, 1, 2, 3];
    case "duel-exchange": {
      const out: number[] = [];
      // LIFE (r21): to the death: no calling it, no air, no yielding; you may run.
      if (ctx.dd) {
        if (ctx.w === PISTOLS) out.push(4, 5);
        else out.push(1, 2, 3);
        if (ctx.r > 0) out.push(8);
        return out;
      }
      if (ctx.w === PISTOLS && ctx.r > 0) out.push(0);
      if (ctx.w === PISTOLS) out.push(...(ctx.dl ? [6] : [4, 5, 6]));
      else out.push(1, 2, 3, ...(ctx.r > 0 ? [7] : []));
      return out;
    }
    case "duel-dawn":
      return ctx.dd ? [0, 1] : [0, 1, 2]; // LIFE (r21)
    case "duel-outcome":
      if (HOWS[ctx.how] === "ran") return [4]; // LIFE (r21)
      return ctx.dead && ctx.law ? [0, 1, 2] : ctx.dead ? [4] : [3, 4];
    default:
      return all(DUEL_EVENTS.find((d) => d.key === key)?.choices.length ?? 0);
  }
}

const blockedNoSecond = (_g: ConquestGame, _l: Life, ctx: LCtx) =>
  ctx.sec < 0 ? "Needs a second to speak for you" : null;

const SWORD_MOVES: [DuelMove, string, string][] = [
  [
    "guard",
    "Keep your guard and wait for the riposte",
    "Safer: lighter wounds either way.",
  ],
  [
    "press",
    "Press the attack",
    "Drive {him} back: a good wound if it lands, a bad one if it doesn't.",
  ],
  [
    "feint",
    "Feint, then the thrust",
    "A trick of the salle: the deepest wound, if {he} falls for it.",
  ],
];

const PISTOL_MOVES: [DuelMove, string, string][] = [
  [
    "aim",
    "Take careful aim",
    "Steady: the better shot, but {he} fires as you do.",
  ],
  [
    "snap",
    "Fire at the word",
    "Quick: a worse shot, but hit {him} first and {his} own goes wild.",
  ],
  [
    "delope",
    "Fire into the air",
    "Throw away your shot. Honour, if {he} does the same; if not, {he} fires at you at leisure.",
  ],
];

function moveChoice(m: [DuelMove, string, string]): LifeChoice {
  const [move, label, tip] = m;
  return {
    label: (g, life, ctx) =>
      move === "delope"
        ? label
        : `${label} (${pct(duelOdds(g.s, life, ctx, move).chance)})`,
    tip: (g, _life, ctx) =>
      tip
        .replace(/\{he\}/g, he(foeOf(g, ctx)))
        .replace(/\{him\}/g, him(foeOf(g, ctx)))
        .replace(/\{his\}/g, his(foeOf(g, ctx))),
    blocked: (_g, _l, ctx) =>
      (ctx.w === PISTOLS) !== PISTOL_MOVES.some((x) => x[0] === move)
        ? "Not with these weapons"
        : null,
    apply: (g, life, ctx) => exchange(g, life, ctx, move),
  };
}

/** The NPC's own choice of weapons, by what they're good at. */
function theirWeapon(g: ConquestGame, ctx: LCtx): number {
  const foe = foeOf(g, ctx);
  if (!foe) return PISTOLS;
  const f = charSkill(g.s, foe, "fighting");
  return f >= 7 || hasTrait(foe, "strong") ? SWORDS : PISTOLS;
}

/** Whether an NPC will fire into the air with you: honourable and not your enemy. */
function willDelope(g: ConquestGame, life: Life, ctx: LCtx): boolean {
  const foe = foeOf(g, ctx);
  if (!foe) return false;
  let p = 0.25;
  if (hasTrait(foe, "just") || hasTrait(foe, "honest")) p += 0.25;
  if (hasTrait(foe, "content")) p += 0.1;
  if (hasTrait(foe, "cruel")) p -= 0.25;
  const op = opinionOf(g.s, foe, life).total;
  p += Math.max(-0.2, Math.min(0.2, op / 200));
  return g.rng.chance(Math.max(0.05, Math.min(0.85, p)));
}

/** Their pride against your persuasion, for a word of peace. */
function peaceDc(g: ConquestGame, life: Life, ctx: LCtx): number {
  const foe = foeOf(g, ctx);
  let dc = 6;
  if (!foe) return dc;
  if (hasTrait(foe, "cruel")) dc += 2;
  if (hasTrait(foe, "brave")) dc += 1;
  if (hasTrait(foe, "craven")) dc -= 2;
  if (hasTrait(foe, "content") || hasTrait(foe, "just")) dc -= 1;
  const op = opinionOf(g.s, foe, life).total;
  dc += op <= -50 ? 2 : op >= 0 ? -1 : 0;
  if (life.ties[foe.id] === "nemesis") dc += 2;
  return dc;
}

export const DUEL_EVENTS: LifeEventDef[] = [
  {
    key: "duel-call",
    pool: "raised",
    cooldown: 0,
    scene: (_g, life) => life.area ?? "tavern",
    title: (g, _life, ctx) =>
      ctx.ch === 1 ? `You call ${nameOf(g, ctx)} out` : "A challenge",
    body: (g, life, ctx) => {
      const foe = foeOf(g, ctx);
      const sc = g.s.chars[ctx.sc];
      const fsec = g.s.chars[ctx.fsec];
      const seconds = fsec
        ? `${charName(fsec)} will stand second for ${him(foe)}.`
        : `${cap(he(foe))} will find a second.`;
      // LIFE (r21): to the death, and the odds of it.
      const death = ctx.dd
        ? `\nIt is to be to the death: no first blood, no shots into the air, no yielding. ${cap(deathWords(deathOdds(g.s, life, { ...ctx, w: SWORDS })))} (with smallswords, keeping your guard).`
        : "";
      return ctx.ch === 1
        ? `The words are said and can't be unsaid: you have called ${nameOf(g, ctx)} out. By the code it falls to ${him(foe)} to choose the weapons; it falls to you to name a second, a friend to carry your terms and see fair play. ${seconds}\n${sc ? `${charName(sc)} would stand for you.` : "You have no friend here to stand for you."}${death}`
        : `${cap(nameOf(g, ctx))} draws off a glove and lays it on the table in front of you. "You'll give me satisfaction, sir, or the whole town will know you for what you are."${ctx.dd ? ` ${cap(he(foe))} looks at you a long moment. "To the death."` : ""} ${seconds}\nThe choice of weapons is yours. ${sc ? `${charName(sc)} would stand second for you.` : "You have no friend here to stand second for you."}${death}`;
    },
    choices: [
      {
        label: (g, _l, ctx) =>
          g.s.chars[ctx.sc]
            ? `Ask ${charName(g.s.chars[ctx.sc])} to be your second`
            : "Name a second",
        tip: "A second carries your terms, checks the pistols, and may yet talk it round: better odds.",
        blocked: (_g, _l, ctx) => (ctx.sc < 0 ? "Nobody here to ask" : null),
        apply: (g, life, ctx) => {
          const sc = g.s.chars[ctx.sc];
          if (sc)
            remembers(g, life, g.char(sc.id), "Stood second for me", 8, 3);
          journal(
            g,
            life,
            `${charName(sc)} will stand second for you. ${cap(he(sc))} looks grave about it.`,
          );
          raise(g, life, "duel-weapons", { ...ctx, sec: ctx.sc });
        },
      },
      {
        label: "Go to the field without a second",
        tip: "Nobody to see fair play: worse odds, and no one to talk it round.",
        apply: (g, life, ctx) => {
          journal(g, life, "You'll go to the field alone.");
          raise(g, life, "duel-weapons", { ...ctx, sec: -1 });
        },
      },
      {
        label: (_g, _l, ctx) =>
          ctx.ch === 1
            ? "Withdraw the challenge"
            : "Apologise, and be done with it",
        tip: (_g, _l, ctx) =>
          ctx.ch === 1
            ? "Nobody bleeds. People will say you hadn't the stomach for it (−3 renown)."
            : "Nobody bleeds; honour is lost (−4 renown), and they think a little better of you.",
        apply: (g, life, ctx) => {
          const foe = foeOf(g, ctx);
          addRenown(g, life, ctx.ch === 1 ? -3 : -4);
          addStress(g, life, -3);
          if (foe) remembers(g, life, g.char(foe.id), "Backed down", 5, 2);
          journal(
            g,
            life,
            ctx.ch === 1
              ? `You withdraw your challenge to ${nameOf(g, ctx)}. Tongues wag.`
              : `You apologise to ${nameOf(g, ctx)}, handsomely. Some call it sense; most call it something else.`,
            "bad",
          );
        },
      },
      {
        label: "Refuse to meet them",
        tip: "Neither fight nor apology. The town will call you a coward (−6 renown).",
        blocked: (_g, _l, ctx) =>
          ctx.ch === 1 ? "You made the challenge" : null,
        apply: (g, life, ctx) => {
          addRenown(g, life, -6);
          addStress(g, life, 4);
          journal(
            g,
            life,
            `You won't meet ${nameOf(g, ctx)}. By noon "coward" is chalked on your door.`,
            "bad",
          );
        },
      },
    ],
  },
  {
    key: "duel-weapons",
    pool: "raised",
    cooldown: 0,
    scene: "tavern",
    title: "The choice of weapons",
    body: (g, life, ctx) => {
      const foe = foeOf(g, ctx);
      const sec = g.s.chars[ctx.sec];
      const them = theirWeapon(g, ctx);
      const where = g.map.provinces[ctx.p]?.name ?? "town";
      return ctx.ch === 0
        ? `The seconds meet in a back room at the inn${sec ? `, ${charName(sec)} for you` : ""}. The ground is agreed (a field outside ${where}, at first light), and a surgeon. The weapons are yours to name.\nWith smallswords, the better swordsman usually wins, and wounds are seldom mortal. With pistols, it's nearer a coin toss, and a ball can kill.`
        : `The seconds meet in a back room at the inn${sec ? `, ${charName(sec)} for you` : ""}. The ground is agreed (a field outside ${where}, at first light), and a surgeon. ${cap(nameOf(g, ctx))}, being challenged, names the weapons: ${weaponWord(them)}.${foe && them === SWORDS ? ` ${cap(he(foe))} is said to be handy with a blade.` : ""}`;
    },
    choices: [
      {
        label: (g, life, ctx) =>
          ctx.ch === 0
            ? `Smallswords (${pct(duelOdds(g.s, life, { ...ctx, w: SWORDS }, "guard").chance)} at each pass)`
            : `Agree to ${weaponWord(theirWeapon(g, ctx))}`,
        tip: (_g, _l, ctx) =>
          ctx.ch === 0
            ? "Skill tells. Three passes at most; it ends when someone is down or yields."
            : "By the code it's their choice.",
        apply: (g, life, ctx) => {
          const w = ctx.ch === 0 ? SWORDS : theirWeapon(g, ctx);
          journal(g, life, `It will be ${weaponWord(w)}, at dawn.`);
          raise(g, life, "duel-dawn", { ...ctx, w });
        },
      },
      {
        label: (g, life, ctx) =>
          ctx.ch === 0
            ? `Pistols (${pct(pistolHit(mine(g.s, life, { ...ctx, w: PISTOLS }).score, false))} to hit)`
            : `Have your second argue for ${weaponWord(theirWeapon(g, ctx) === SWORDS ? PISTOLS : SWORDS)}`,
        tip: (_g, _l, ctx) =>
          ctx.ch === 0
            ? "Luck as much as skill. One shot each, two at most; a ball can kill."
            : "Your second's persuasion against the code: it may not wash.",
        blocked: (_g, _l, ctx) =>
          ctx.ch === 1 && ctx.sec < 0 ? "Needs a second to argue it" : null,
        apply: (g, life, ctx) => {
          if (ctx.ch === 0) {
            journal(g, life, "Pistols, then, at twelve paces, at dawn.");
            raise(g, life, "duel-dawn", { ...ctx, w: PISTOLS });
            return;
          }
          const theirs0 = theirWeapon(g, ctx);
          const want = theirs0 === SWORDS ? PISTOLS : SWORDS;
          const ok = g.rng.chance(
            checkChance(skillLevel(g.s, life, "persuasion"), 7),
          );
          journal(
            g,
            life,
            ok
              ? `Your second carries the point: ${weaponWord(want)}.`
              : `Their second won't hear of it: ${weaponWord(theirs0)}.`,
            ok ? "good" : "bad",
          );
          raise(g, life, "duel-dawn", { ...ctx, w: ok ? want : theirs0 });
        },
      },
    ],
  },
  {
    key: "duel-dawn",
    pool: "raised",
    cooldown: 0,
    scene: "duel",
    title: "The field at dawn",
    body: (g, _life, ctx) => {
      const foe = foeOf(g, ctx);
      const sec = g.s.chars[ctx.sec];
      return ctx.w === PISTOLS
        ? `Mist lies on the grass and the elms drip. The surgeon has opened his bag on a stump and pretends not to watch. ${sec ? `${charName(sec)} loads your pistol, checks the flint, and hands it to you butt first.` : "You load your own pistol; your hands are not quite steady."} Twelve paces are walked out. ${cap(nameOf(g, ctx))} takes ${his(foe)} ground, pale and very upright.`
        : `Mist lies on the grass and the elms drip. The surgeon has opened his bag on a stump and pretends not to watch. ${sec ? `${charName(sec)} measures the blades against each other and nods.` : "Nobody measures the blades."} You take off your coat. ${cap(nameOf(g, ctx))} salutes you with ${his(foe)} sword.`;
    },
    choices: [
      {
        label: "Take your ground",
        tip: "To it, then.",
        apply: (g, life, ctx) => {
          journal(g, life, "You take your ground.");
          raise(g, life, "duel-exchange", { ...ctx, r: 0 });
        },
      },
      {
        label: (g, life, ctx) =>
          `A last word of peace through your second (Persuasion ${pct(checkChance(skillLevel(g.s, life, "persuasion"), peaceDc(g, life, ctx)))})`,
        tip: "If they'll hear it, you both walk away with honour. If not, they'll think the less of you for asking.",
        blocked: blockedNoSecond,
        apply: (g, life, ctx) => {
          const ok = g.rng.chance(
            checkChance(
              skillLevel(g.s, life, "persuasion"),
              peaceDc(g, life, ctx),
            ),
          );
          gainXp(g, life, "persuasion", 5);
          outcomeMeta(g, life, { ok });
          if (ok) return endDuel(g, life, ctx, "reconciled");
          const foe = foeOf(g, ctx);
          if (foe)
            remembers(
              g,
              life,
              g.char(foe.id),
              "Tried to crawl out of it",
              -5,
              2,
            );
          journal(g, life, "They won't hear of it. To your places.", "bad");
          raise(g, life, "duel-exchange", { ...ctx, r: 0 });
        },
      },
      {
        label: (_g, _l, ctx) =>
          ctx.w === PISTOLS
            ? "Resolve to fire into the air"
            : "Ask that it end at first blood",
        tip: (_g, _l, ctx) =>
          ctx.w === PISTOLS
            ? "You'll throw away your shot. If they do the same, honour is satisfied; if not, they fire at you at leisure."
            : "If they agree, the first wound ends it: nobody dies today.",
        blocked: (_g, _l, ctx) => (ctx.dd ? "It's to the death" : null), // LIFE (r21)
        apply: (g, life, ctx) => {
          if (ctx.w === PISTOLS) {
            const fdl = willDelope(g, life, ctx) ? 1 : 0;
            journal(
              g,
              life,
              "You've made up your mind: you'll fire into the air.",
            );
            raise(g, life, "duel-exchange", { ...ctx, r: 0, dl: 1, fdl });
            return;
          }
          const foe = foeOf(g, ctx);
          const yes = !!foe && !hasTrait(foe, "cruel") && g.rng.chance(0.7);
          journal(
            g,
            life,
            yes
              ? `${cap(firstOf(g, ctx))} agrees: first blood.`
              : `${cap(firstOf(g, ctx))} won't have it: to the end.`,
            yes ? "good" : "bad",
          );
          raise(g, life, "duel-exchange", { ...ctx, r: 0, fb: yes ? 1 : 0 });
        },
      },
    ],
  },
  {
    key: "duel-exchange",
    pool: "raised",
    cooldown: 0,
    scene: "duel",
    title: (_g, _l, ctx) =>
      ctx.w === PISTOLS
        ? ctx.r === 0
          ? "Make ready. Present."
          : "A second exchange"
        : (["The first pass", "The second pass", "The third pass"][ctx.r] ??
          "Another pass"),
    body: (g, life, ctx) => {
      const foe = foeOf(g, ctx);
      const state =
        ctx.mw || ctx.fw
          ? ` ${ctx.fw ? `${cap(he(foe))} is bleeding${ctx.fw >= 20 ? " badly" : ""}.` : ""}${ctx.mw ? ` You are hurt${ctx.mw >= 20 ? ", and it's bad" : ""}.` : ""}`
          : "";
      // LIFE (r21): to the death, the odds of the whole of it.
      if (ctx.dd) {
        const o = deathOdds(g.s, life, ctx);
        const odds = `\nTo the death: ${deathWords(o)}.`;
        if (ctx.w === PISTOLS)
          return `${ctx.r === 0 ? `"Gentlemen, are you ready?" The second's handkerchief is raised.` : "The seconds load again. Nobody speaks."}${state}${odds}`;
        return `${["Steel touches steel", "You circle each other on the wet grass", "Both of you are blowing now"][ctx.r] ?? "You go at it again, slower now"}. ${cap(nameOf(g, ctx))} ${hasTrait(foe!, "brave") ? "comes on boldly" : hasTrait(foe!, "craven") ? "gives ground at every feint" : "watches your point"}.${state}${odds}`;
      }
      if (ctx.w === PISTOLS)
        return ctx.r === 0
          ? `"Gentlemen, are you ready?" The second's handkerchief is raised.${ctx.dl ? " You've resolved to fire into the air." : ""}${state}`
          : `Both shots wide. The seconds confer in low voices. Honour could be called satisfied; or the pistols loaded again.${state}`;
      return `${["Steel touches steel", "You circle each other on the wet grass", "Both of you are blowing now"][ctx.r] ?? "Again"}. ${cap(nameOf(g, ctx))} ${hasTrait(foe!, "brave") ? "comes on boldly" : hasTrait(foe!, "craven") ? "gives ground at every feint" : "watches your point"}.${ctx.fb ? " First blood ends it." : ""}${state}`;
    },
    choices: [
      // Pistols, after two misses: call it done.
      {
        label: "Call honour satisfied",
        tip: "Shots have been exchanged: nobody can say you didn't stand.",
        blocked: (_g, _l, ctx) =>
          ctx.dd // LIFE (r21)
            ? "It's to the death"
            : ctx.w !== PISTOLS || ctx.r === 0
              ? "Not yet"
              : null,
        apply: (g, life, ctx) => endDuel(g, life, ctx, "satisfied"),
      },
      ...SWORD_MOVES.map(moveChoice),
      ...PISTOL_MOVES.map((m) => {
        const c = moveChoice(m);
        const blocked = c.blocked!;
        return {
          ...c,
          blocked: (g: ConquestGame, l: Life, ctx: LCtx) =>
            blocked(g, l, ctx) ??
            (ctx.dd && m[0] === "delope" ? "It's to the death" : null) ?? // LIFE (r21)
            (ctx.dl && m[0] !== "delope"
              ? "You resolved to fire into the air"
              : null),
        };
      }),
      {
        label: "Lower your blade and yield",
        tip: "It ends now. You lose, and lose face (−3 renown), but you live.",
        blocked: (_g, _l, ctx) =>
          ctx.dd // LIFE (r21): nobody yields in a duel to the death
            ? "It's to the death"
            : ctx.w === PISTOLS
              ? "Not with pistols"
              : ctx.r === 0
                ? "Not before a pass"
                : null,
        apply: (g, life, ctx) => endDuel(g, life, ctx, "yield"),
      },
      // LIFE (r21): losing a duel to the death, you may run for it.
      {
        label: `Run for it (${DEATH.runRenown} renown, and a coward's name)`,
        tip: "You'll live. The town will call you a coward for three years: the brave and the soldiers worst of all. 1 in 4 they cut you as you go.",
        blocked: (_g, _l, ctx) =>
          !ctx.dd
            ? "Only in a duel to the death"
            : ctx.r === 0
              ? "Not before a pass"
              : null,
        apply: (g, life, ctx) => {
          const foe = foeOf(g, ctx);
          const cut = ldice(g.s, 0x7d3, ctx.c, ctx.r).chance(DEATH.runCut)
            ? ldice(g.s, 0x7d4, ctx.c, ctx.r).int(...DEATH.runCutWound)
            : 0;
          if (cut)
            journal(
              g,
              life,
              `${cap(he(foe))} catches you across the back as you turn.`,
              "bad",
            );
          endDuel(g, life, { ...ctx, mw: ctx.mw + cut }, "ran");
        },
      },
    ],
  },
  {
    key: "duel-outcome",
    pool: "raised",
    cooldown: 0,
    scene: "duel",
    title: (_g, _l, ctx) =>
      ctx.dead
        ? "Death on the field"
        : ctx.res > 0
          ? "Victory"
          : ctx.res < 0
            ? "Defeat"
            : "Honour satisfied",
    body: (g, _life, ctx) => {
      const foe = foeOf(g, ctx);
      const how = HOWS[ctx.how] ?? "fought";
      const lines: string[] = [];
      // LIFE (r21): a run from the field, theirs or yours.
      if (how === "ran")
        return `You ran from a duel to the death.${ctx.mw > 0 ? " You're cut, but you're alive." : ""} Behind you somebody is laughing. By noon the town will have a word for you, and it isn't a kind one.`;
      if (how === "theyran")
        return `${cap(nameOf(g, ctx))} ran from the field, sword in the grass behind ${him(foe)}. ${ctx.mw > 0 ? "You're hurt, but " : ""}the day is yours, and the town will tell it for years.`;
      if (how === "delope")
        lines.push(
          "Two shots into the air, and two gentlemen shaking hands in the mist.",
        );
      else if (how === "reconciled")
        lines.push(
          "The seconds talked it round on the field itself. Nobody bled.",
        );
      else {
        if (ctx.fw > 0)
          lines.push(
            ctx.dead
              ? `${cap(nameOf(g, ctx))} is dead. The surgeon closes ${his(foe)} eyes.`
              : `${cap(nameOf(g, ctx))} is wounded${ctx.fw >= DOWN ? ", gravely" : ""}, and will carry the mark.`,
          );
        if (ctx.mw > 0)
          lines.push(
            `You are wounded${ctx.mw >= DOWN ? ", gravely" : ""}: the surgeon binds it while you try not to faint.`,
          );
        if (!ctx.fw && !ctx.mw) lines.push("Neither of you is touched.");
        lines.push(
          ctx.res > 0
            ? "The day is yours, and the town will hear of it by noon."
            : ctx.res < 0
              ? "The day is theirs. You stood, at least."
              : "Honour is satisfied on both sides.",
        );
      }
      if (ctx.law)
        lines.push(
          ctx.dead
            ? "Duelling is against the law, and a death makes it murder in the eyes of the court. The sheriff will want to know who was on that field."
            : "Duelling is against the law here: word of it will reach the magistrate.",
        );
      return lines.join("\n");
    },
    choices: [
      {
        label: "Face it out",
        tip: "You stand by what you did. The law knows where to find you.",
        blocked: (_g, _l, ctx) =>
          !ctx.dead || !ctx.law ? "Nothing to face" : null,
        apply: (g, life) => {
          addRenown(g, life, 2);
          journal(g, life, "You'll answer for it if you must.");
        },
      },
      {
        label: "Lie low until it blows over",
        tip: "Keep to your house a while: the law's interest cools, your nerves don't.",
        blocked: (_g, _l, ctx) =>
          !ctx.dead || !ctx.law ? "Nothing to hide from" : null,
        apply: (g, life, ctx) => {
          addStress(g, life, 6);
          const pr = g.s.provinces[ctx.p];
          const n = pr ? (pr.occupier >= 0 ? pr.occupier : pr.owner) : -1;
          addHeat(g, life, n, -10);
          journal(
            g,
            life,
            "You keep to your own fireside, and your own counsel.",
          );
        },
      },
      {
        label: "Ask your patron to speak for you",
        tip: "A word in the right ear: much of the law's interest goes away (−2 favour).",
        blocked: (g, life, ctx) =>
          !ctx.dead || !ctx.law
            ? "Nothing to smooth over"
            : !g.s.chars[life.patron]?.alive
              ? "You have no patron"
              : null,
        apply: (g, life, ctx) => {
          life.favor = Math.max(0, life.favor - 2);
          const pr = g.s.provinces[ctx.p];
          const n = pr ? (pr.occupier >= 0 ? pr.occupier : pr.owner) : -1;
          addHeat(g, life, n, -15);
          journal(
            g,
            life,
            `${charName(g.s.chars[life.patron])} has a word with the magistrate.`,
            "good",
          );
        },
      },
      {
        label: (g, _l, ctx) => `Offer ${firstOf(g, ctx)} your hand`,
        tip: "It's over: rivals no longer, if they'll take it.",
        blocked: (g, _l, ctx) =>
          ctx.dead
            ? "They're dead"
            : !foeOf(g, ctx)?.alive
              ? "They're gone"
              : null,
        apply: (g, life, ctx) => {
          const foe = foeOf(g, ctx)!;
          const op = opinionOf(g.s, foe, life).total;
          if (op > -60 || hasTrait(foe, "just") || hasTrait(foe, "honest")) {
            remembers(g, life, g.char(foe.id), "Shook hands after", 15, 5);
            if (life.ties[foe.id] === "rival") setTie(g, life, foe.id, null);
            journal(
              g,
              life,
              `${cap(firstOf(g, ctx))} takes your hand. It's done.`,
              "good",
            );
          } else
            journal(
              g,
              life,
              `${cap(firstOf(g, ctx))} turns ${his(foe)} back on your hand.`,
              "bad",
            );
        },
      },
      {
        label: "Leave the field",
        tip: "Home, and a stiff drink.",
        apply: (g, life) => addStress(g, life, -2),
      },
    ],
  },
  {
    key: "duel-report",
    pool: "raised",
    cooldown: 0,
    scene: "duel",
    title: (g, _l, ctx) => `At dawn with ${nameOf(g, ctx)}`,
    body: (g, _life, ctx) => {
      const foe = foeOf(g, ctx);
      const w = ctx.w === PISTOLS ? "pistols" : "smallswords";
      const won = ctx.win === 1;
      return [
        `The seconds settled it on ${w}, at first light outside ${g.map.provinces[ctx.p]?.name ?? "town"}.`,
        ctx.w === PISTOLS
          ? won
            ? `Two shots, close together. Yours told: ${nameOf(g, ctx)} went down clutching ${his(foe)} side.`
            : `Two shots, close together. ${cap(he(foe))} fired truer: you were hit.`
          : won
            ? `Three hard passes, and the last was yours: your point opened ${his(foe)} arm, and ${he(foe)} yielded.`
            : `Three hard passes, and the last was ${his(foe)}: you were cut, and the seconds stopped it.`,
        won
          ? "The day is yours, and the town will hear of it by noon."
          : "The day is theirs. You stood, at least.",
      ].join("\n");
    },
    choices: [
      {
        label: "Leave the field",
        tip: "It's done.",
        apply: () => undefined,
      },
    ],
  },
];

/**
 * Another player met you (Interactions.answerProposal): each of you gets the
 * blow-by-blow as a scene of its own, and the law hears of it.
 */
export function duelReport(
  g: ConquestGame,
  winner: Life,
  loser: Life,
  wound: number,
): void {
  const pistols = g.rng.chance(0.5) ? PISTOLS : SWORDS;
  const p = winner.prov;
  for (const [l, other, win] of [
    [winner, loser, 1],
    [loser, winner, 0],
  ] as const) {
    raise(g, l, "duel-report", {
      c: other.c,
      w: pistols,
      win,
      wd: win ? 0 : wound,
      p,
    });
  }
  const pr = g.s.provinces[p];
  const nation = pr ? (pr.occupier >= 0 ? pr.occupier : pr.owner) : -1;
  if (nation >= 0 && g.s.nations[nation]?.kind !== "native") {
    addHeat(g, winner, nation, DUEL_HEAT);
    addHeat(g, loser, nation, DUEL_HEAT);
  }
  const d: DuelAftermath = {
    day: g.s.day,
    prov: p,
    nation,
    challenger: winner.c,
    challenged: loser.c,
    weapon: pistols === PISTOLS ? "pistols" : "swords",
    dead: -1,
    wounded: [loser.c],
  };
  for (const h of hooks.duelAftermath) h(g, winner, d);
}
