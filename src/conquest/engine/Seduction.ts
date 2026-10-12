// INTRIGUE (r15): seduction, Crusader Kings fashion. You set about winning
// someone, a few weeks of attentions, and then they decide: a lover, or (if
// that's what you're after) someone kept at a monthly allowance, a mistress or
// a kept man; or they turn you down, and think the less of you. If either of
// you is married, people may notice before it comes to anything: talk, a
// husband or wife's anger, the minister's, and a husband who calls you out.
// The odds are shown before you begin, from the same reckoning that's rolled.
// Your own husband or wife can be courted too ("Court your wife"): it warms
// them, and makes a child likelier for a while. Another player's character is
// never seduced: their player is asked, in a scene, and says yes or no.
//
// Grown men and women only (eighteen and over, both), never close kin, and
// nothing is described: the door closes.

import { birth } from "./Characters";
import { startDuel } from "./Duels";
import { realMeans } from "./EventPacing";
import { Explain } from "./Explain";
import { householdsOf } from "./Folk";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { talkView } from "./Interactions";
import {
  ADULT_AGE,
  closeKin,
  grown,
  idice,
  intrigue,
  intrigueChanged,
  intrigueOf,
  secretNote,
  standing,
} from "./IntrigueCore";
import { withFlow } from "./LedgerCore";
import { affairWith, endAffair, startAffair, wouldBeAffair } from "./Liaisons";
import {
  addRenown,
  addStress,
  earn,
  journal,
  meet,
  remembers,
  setTie,
  spend,
  touchLife,
} from "./LifeCore";
import {
  Check,
  lifeOfChar,
  meOf,
  no,
  opinionOf,
  peopleHere,
  skillLevel,
  yes,
} from "./LifeQueries";
import type { World } from "./Map";
import { ageOf, birthChance, charName, hasTrait, stat } from "./Queries";
import { rumour } from "./Rumours";
import { tongueName } from "./Tongues";
import type {
  Breakdown,
  Character,
  GameState,
  IntrigueScheme,
  KeptLover,
  Life,
  SchemeOdds,
} from "./Types";

/** The numbers seduction runs on (shown in the guide, rolled by the engine). */
export const SEDUCE = {
  /** Where the chance starts, in points out of 100. */
  base: 30,
  /** Each point of your persuasion, and of diplomacy over 5. */
  persuasion: 2,
  dip: 2,
  /** Never surer than this, nor more hopeless. */
  min: 5,
  max: 90,
  /** Weeks of attentions: this, more for the great, less for the persuasive. */
  weeks: 3,
  /** Each week, if either of you is married: the chance people notice. */
  find: 0.04,
  /** Days before someone who said no can be asked again. */
  again: 180,
  /** The most kept at once. */
  maxKept: 2,
  /** Monthly chance of a child with a kept lover (when not already an affair's). */
  child: 0.02,
} as const;

/** Courting your own husband or wife: a child likelier by this much, for this long. */
export const FOND = { mul: 1.5, days: 180, again: 60 } as const;

/** What a kept lover's allowance comes to a month: more for someone of standing. */
export function keepCost(s: GameState, c: Character): number {
  return 2 + standing(s, c);
}

export function keptOf(s: GameState, life: Life): KeptLover[] {
  return intrigueOf(s).kept.filter(
    (k) => k.seat === life.seat && k.by === life.c,
  );
}

/** A scheme of yours going on someone (seduction or plot). */
export function schemeOn(
  s: GameState,
  life: Life,
  c: number,
  kind?: IntrigueScheme["kind"],
): IntrigueScheme | undefined {
  return intrigueOf(s).schemes.find(
    (x) =>
      x.seat === life.seat &&
      x.by === life.c &&
      x.target === c &&
      (x.status === "on" || x.status === "strike") &&
      (!kind || x.kind === kind),
  );
}

export function mySchemes(s: GameState, life: Life): IntrigueScheme[] {
  return intrigueOf(s).schemes.filter((x) => x.seat === life.seat);
}

// ---------------------------------------------------------------- can it be done

/** Whether you could set about winning them (not whether you'd succeed). */
export function seduceCheck(
  s: GameState,
  w: World,
  life: Life,
  c: Character | undefined,
  aim: "lover" | "keep" = "lover",
): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (!c?.alive || c.abroad) return no("They're gone.");
  if (c.id === me.id) return no("That's you.");
  if (ageOf(s, me) < ADULT_AGE) return no("Not until you're eighteen.");
  if (!grown(s, c)) return no("Not until they're eighteen.");
  if (closeKin(s, me, c)) return no("Too close kin.");
  if (c.female === me.female) return no("Not in this century.");
  if (me.spouse === c.id)
    return no(`Your own ${c.female ? "wife" : "husband"}: court them instead.`);
  if (life.travel) return no("You're on the road.");
  if (!peopleHere(s, life.prov, life).some((x) => x.id === c.id))
    return no("They're not here.");
  if (schemeOn(s, life, c.id, "seduce")) return no("You're at it already.");
  const left = (life.cooldowns[`intr:seduce:${c.id}`] ?? 0) - s.day;
  if (left > 0)
    return no(`They turned you down lately: again in ${left} days.`);
  const other = lifeOfChar(s, c.id);
  if (other) {
    if (
      other.events.some((e) => e.key === "p2p-intr-seduce" && e.ctx.c === me.id)
    )
      return no("They haven't answered you yet.");
  } else {
    const t = talkView(s, w, life, c);
    if (t.level < 1)
      return no(`You'd need a few words of ${tongueName(t.theirs)}.`);
  }
  if (aim === "lover" && life.ties[c.id] === "lover")
    return no("Lovers already.");
  if (aim === "keep") {
    if (keptOf(s, life).some((k) => k.c === c.id))
      return no("You keep them already.");
    if (keptOf(s, life).length >= SEDUCE.maxKept)
      return no(`You keep ${SEDUCE.maxKept} already.`);
    const cost = keepCost(s, c);
    if (life.purse < cost * 2)
      return no(`You'd want ${cost * 2} coins in hand to keep them.`);
  }
  return yes;
}

// ---------------------------------------------------------------- the odds

export interface SeduceView {
  check: Check;
  /** Another player: they decide, in a scene. */
  player: boolean;
  odds: SchemeOdds;
  weeks: number;
  /** What makes the chance (points out of 100). */
  why: Breakdown;
  /** Each way it can go, with its chance. */
  outcomes: { label: string; p: number; bad?: boolean }[];
  risks: string[];
  /** A kept lover's allowance a month. */
  cost: number;
}

/** The chance they'll be won, the weeks it takes, and the risk of talk: what's shown is what's rolled. */
export function seduceView(
  s: GameState,
  w: World,
  life: Life,
  cId: number,
  aim: "lover" | "keep" = "lover",
): SeduceView {
  const c = s.chars[cId];
  const check = seduceCheck(s, w, life, c, aim);
  const me = meOf(s, life);
  const player = !!c && !!lifeOfChar(s, c.id);
  const e = new Explain().add("To begin with", SEDUCE.base);
  let weeks: number = SEDUCE.weeks;
  let d = 0;
  const risks: string[] = [];
  if (c && me && !player) {
    const ps = skillLevel(s, life, "persuasion");
    e.add(`Your persuasion (${ps})`, ps * SEDUCE.persuasion);
    const dip = stat(s, me, "dip");
    e.add(`Your diplomacy (${dip})`, (dip - 5) * SEDUCE.dip);
    const op = opinionOf(s, c, life).total;
    e.add(
      `What ${c.first} thinks of you (${op})`,
      Math.max(-25, Math.min(25, Math.round(op / 2))),
    );
    if (hasTrait(me, "charming")) e.add("You're charming", 10);
    if (hasTrait(c, "zealous")) e.add("Godly", -20);
    if (hasTrait(c, "just")) e.add("Upright", -5);
    if (hasTrait(c, "honest")) e.add("Honest", -5);
    if (hasTrait(c, "content")) e.add("Content with their lot", -5);
    if (hasTrait(c, "deceitful")) e.add("Not one for scruples", 5);
    if (hasTrait(c, "drunkard")) e.add("Fond of a glass", 5);
    if (c.spouse >= 0) e.add("They're married", -15);
    if (me.spouse >= 0) e.add("You're married", -5);
    if (c.religion === me.religion) e.add("The same faith", 3);
    if (c.religion === "puritan") e.add("A puritan conscience", -10);
    if (Math.abs(ageOf(s, c) - ageOf(s, me)) > 20)
      e.add("Twenty years and more between you", -10);
    const t = talkView(s, w, life, c);
    if (t.level === 1) e.add("Only a few words between you", -10);
    else if (t.level === 2) e.add("Halting talk", -5);
    const st = standing(s, c);
    if (aim === "keep") {
      if (realMeans(s, c) < 10) e.add("Little to live on", 15);
      if (st >= 4) e.add("Above being kept", -25);
      if (life.purse < keepCost(s, c) * 6) e.add("Can you keep them?", -10);
    }
    weeks = Math.max(
      2,
      Math.min(8, SEDUCE.weeks + Math.floor(st / 2) - Math.floor(ps / 8)),
    );
    if (me.spouse >= 0 || c.spouse >= 0) {
      const stealth = skillLevel(s, life, "stealth");
      let find = SEDUCE.find - stealth * 0.0015;
      const sp = s.chars[c.spouse];
      if (sp && (hasTrait(sp, "just") || hasTrait(sp, "zealous"))) find += 0.02;
      const mine = s.chars[me.spouse];
      if (mine && (hasTrait(mine, "just") || hasTrait(mine, "zealous")))
        find += 0.01;
      d = Math.round(Math.max(0.005, Math.min(0.12, find)) * 1000) / 1000;
      risks.push(
        "Married on either side: people may notice, before it comes to anything or after. Then: your husband or wife's anger, the minister's, renown lost, and a husband who may call you out.",
      );
    }
    risks.push(
      "Turned down: they think the less of you (−20), and won't be asked again for half a year.",
    );
    risks.push(
      aim === "keep"
        ? `Kept: ${keepCost(s, c)} coins a month while it lasts. A child may come of it.`
        : "As lovers: what lovers risk (a child, a blackmailer, being found out). See You › Family.",
    );
  }
  const why = e.done(0, SEDUCE.min, SEDUCE.max);
  const p = why.total / 100;
  const found = 1 - (1 - d) ** weeks;
  const outcomes = player
    ? []
    : [
        {
          label:
            aim === "keep" ? "They agree to be kept" : "They're won: lovers",
          p: (1 - found) * p,
        },
        {
          label: "They turn you down",
          p: (1 - found) * (1 - p),
          bad: true,
        },
        ...(d > 0
          ? [
              {
                label: "Noticed before it comes to anything",
                p: found,
                bad: true,
              },
            ]
          : []),
      ];
  return {
    check,
    player,
    odds: { p, d, f: 0 },
    weeks,
    why,
    outcomes,
    risks,
    cost: c ? keepCost(s, c) : 0,
  };
}

// ---------------------------------------------------------------- doing it

/** Set about winning someone (or, with another player, ask them). */
export function seduce(
  g: ConquestGame,
  life: Life,
  cId: number,
  aim: "lover" | "keep",
): string | null {
  const s = g.s;
  if (aim !== "lover" && aim !== "keep") return "Lover, or kept?";
  const v = seduceView(s, g.w, life, cId, aim);
  if (!v.check.ok) return v.check.why;
  const me = meOf(s, life)!;
  const c = g.char(cId);
  meet(g, life, cId);
  touchLife(g, life).cooldowns[`intr:seduce:${cId}`] = s.day + 30;
  const other = lifeOfChar(s, cId);
  if (other) {
    raiseEvent(g, other, "p2p-intr-seduce", {
      c: me.id,
      a: aim === "keep" ? 1 : 0,
      k: keepCost(s, c),
    });
    secretNote(
      g,
      life,
      `You make your interest in ${charName(c)} plain. It's for ${c.female ? "her" : "him"} to say.`,
    );
    return null;
  }
  const sch: IntrigueScheme = {
    id: g.nextId(),
    kind: "seduce",
    seat: life.seat,
    by: me.id,
    target: cId,
    p: life.prov,
    started: s.day,
    week: 0,
    weeks: v.weeks,
    aim,
    helpers: [],
    leaks: 0,
    odds: v.odds,
    paid: 0,
    status: "on",
    lines: [
      `You set about winning ${charName(c)}${aim === "keep" ? ", to keep" : ""}: ${v.weeks} weeks of attentions.`,
    ],
  };
  intrigue(g).schemes.push(sch);
  intrigueChanged(g);
  secretNote(g, life, sch.lines[0]);
  return null;
}

/** A week of a seduction: noticed, or on to the moment. */
export function seduceWeek(
  g: ConquestGame,
  life: Life,
  x: IntrigueScheme,
): void {
  const s = g.s;
  const c = s.chars[x.target];
  if (!c?.alive || c.abroad)
    return endScheme(g, life, x, "dropped", `${charName(c)} is gone.`);
  const r = idice(g);
  if (x.odds.d > 0 && r.chance(x.odds.d)) return noticed(g, life, x);
  if (
    !peopleHere(s, x.p, life).some((y) => y.id === c.id) ||
    life.prov !== x.p
  ) {
    x.waited = (x.waited ?? 0) + 1;
    x.lines.push(
      life.prov !== x.p
        ? "A week away: it waits for you."
        : `${c.first} is away: it waits.`,
    );
    intrigueChanged(g);
    if ((x.waited ?? 0) > 6)
      endScheme(g, life, x, "dropped", "Too long apart: it came to nothing.");
    return;
  }
  x.week++;
  intrigueChanged(g);
  if (x.week < x.weeks) {
    x.lines.push(WEEKS[(x.week - 1) % WEEKS.length](c));
    return;
  }
  // The moment: yes or no, on the odds shown.
  if (r.chance(x.odds.p)) won(g, life, x, c);
  else refused(g, life, x, c);
}

const WEEKS: ((c: Character) => string)[] = [
  (c) => `You find reasons to be where ${c.first} is.`,
  (c) => `A walk after church; ${c.first} laughs at the right places.`,
  (c) => `A note, unsigned, and a flower; ${c.first} knows whose.`,
  (c) => `Long talk by the fire at the tavern. Someone looked twice.`,
  (c) => `${c.first} lingers when the others go.`,
  (c) => `A gift, small enough to be proper.`,
  (c) => `${c.first} says your name as if it were a secret.`,
];

function endScheme(
  g: ConquestGame,
  life: Life,
  x: IntrigueScheme,
  status: IntrigueScheme["status"],
  line: string,
): void {
  x.status = status;
  x.ended = g.s.day;
  x.lines.push(line);
  intrigueChanged(g);
  secretNote(g, life, line, status === "done" ? "good" : "bad");
}

/** Won: a lover, or someone kept. The door closes on the rest. */
function won(
  g: ConquestGame,
  life: Life,
  x: IntrigueScheme,
  c: Character,
): void {
  const s = g.s;
  addStress(g, life, -5);
  remembers(g, life, g.char(c.id), "Won my heart", 15, 3);
  setTie(g, life, c.id, "lover");
  const affair = wouldBeAffair(s, life, c);
  if (affair) startAffair(g, life, c.id);
  if (x.aim === "keep") {
    const cost = keepCost(s, c);
    intrigue(g).kept.push({
      seat: life.seat,
      by: life.c,
      c: c.id,
      since: s.day,
      cost,
      owed: 0,
    });
    endScheme(
      g,
      life,
      x,
      "done",
      `${charName(c)} agrees to be kept: rooms of ${c.female ? "her" : "his"} own, and ${cost} coins a month from you.${affair ? " Nobody must know." : ""}`,
    );
  } else
    endScheme(
      g,
      life,
      x,
      "done",
      `You and ${charName(c)} are lovers now.${affair ? " Nobody must know." : ""}`,
    );
}

/** Turned down: they think the less of you, and may say why to others. */
function refused(
  g: ConquestGame,
  life: Life,
  x: IntrigueScheme,
  c: Character,
): void {
  const s = g.s;
  remembers(g, life, g.char(c.id), "Unwelcome advances", -20, 2);
  addStress(g, life, 4);
  touchLife(g, life).cooldowns[`intr:seduce:${c.id}`] = s.day + SEDUCE.again;
  endScheme(
    g,
    life,
    x,
    "failed",
    `${charName(c)} turns you down, and not kindly.`,
  );
  if (hasTrait(c, "zealous") || hasTrait(c, "just")) {
    addRenown(g, life, -1);
    const me = meOf(s, life)!;
    rumour(
      g,
      life.prov,
      `${charName(me)} made advances to ${charName(c)}, and was sent off with a flea in the ear.`,
      me.id,
      "bad",
    );
  }
}

/** Noticed before it came to anything: talk, anger, perhaps a challenge. */
function noticed(g: ConquestGame, life: Life, x: IntrigueScheme): void {
  const s = g.s;
  const me = meOf(s, life)!;
  const c = s.chars[x.target];
  endScheme(
    g,
    life,
    x,
    "found",
    `People have noticed you and ${charName(c)}. It's the talk of the town.`,
  );
  // This much is public now.
  journal(g, life, `Talk: you and ${charName(c)}.`, "bad");
  addRenown(g, life, -3);
  addStress(g, life, 6);
  remembers(g, life, g.char(c.id), "Made me the talk of the town", -10, 2);
  rumour(
    g,
    life.prov,
    `${charName(me)} has been paying court to ${charName(c)}, and everyone saw.`,
    me.id,
    "bad",
  );
  // Your husband or wife.
  const sp = s.chars[me.spouse];
  if (sp?.alive) {
    remembers(g, life, g.char(sp.id), `Making eyes at ${c.first}`, -25, 3);
    const spl = lifeOfChar(s, sp.id);
    if (spl)
      journal(
        g,
        spl,
        `Talk reaches you: ${charName(me)} and ${charName(c)}.`,
        "bad",
      );
  }
  // The minister.
  for (const p of householdsOf(s, life.prov))
    if (p.role === "preacher")
      remembers(g, life, g.char(p.id), "A wandering eye", -10, 2);
  // Their husband may call you out.
  const theirs = s.chars[c.spouse];
  if (
    theirs?.alive &&
    !theirs.female &&
    !me.female &&
    !lifeOfChar(s, theirs.id)
  ) {
    let p = 0.35;
    if (hasTrait(theirs, "brave")) p += 0.3;
    if (hasTrait(theirs, "craven")) p -= 0.25;
    if (idice(g).chance(p)) {
      journal(
        g,
        life,
        `${charName(theirs)} has heard, and sends a friend to ask for satisfaction.`,
        "bad",
      );
      startDuel(g, life, g.char(theirs.id), true);
    }
  } else if (theirs?.alive) {
    const tl = lifeOfChar(s, theirs.id);
    if (tl)
      journal(
        g,
        tl,
        `Talk reaches you: ${charName(me)} has been paying court to ${charName(c)}.`,
        "bad",
      );
  }
}

// ---------------------------------------------------------------- kept lovers

/** Each month: the allowance paid (or not), and perhaps a child. */
export function keptMonthly(g: ConquestGame, life: Life): void {
  const s = g.s;
  const st = s.intrigue;
  if (!st?.kept.length) return;
  for (const k of [...st.kept]) {
    if (k.seat !== life.seat) continue;
    const c = s.chars[k.c];
    if (k.by !== life.c || !c?.alive || c.abroad) {
      endKept(g, life, k, null);
      continue;
    }
    const other = lifeOfChar(s, c.id);
    if (life.purse >= k.cost) {
      withFlow(
        g,
        { key: `intr:kept:${k.c}`, label: `An allowance for ${c.first}` },
        () => spend(g, life, k.cost),
      );
      if (other)
        withFlow(
          g,
          {
            key: `intr:keptby:${k.by}`,
            label: `An allowance from ${meOf(s, life)?.first ?? "someone"}`,
          },
          () => earn(g, other, k.cost),
        );
      k.owed = 0;
    } else {
      k.owed++;
      secretNote(
        g,
        life,
        `You couldn't pay ${c.first}'s allowance this month.`,
        "bad",
      );
      if (k.owed >= 2) {
        remembers(g, life, g.char(c.id), "Left me without a penny", -15, 2);
        endKept(
          g,
          life,
          k,
          `${charName(c)} won't be kept on promises: it's over.`,
        );
        continue;
      }
    }
    intrigueChanged(g);
    // A kept lover is seen to: an affair's meetings go on.
    const a = affairWith(life, c.id);
    if (a) {
      a.met = s.day;
      continue;
    }
    // Not an affair (neither of you married): a child may still come.
    const me = meOf(s, life)!;
    const mother = me.female ? me : c;
    const father = me.female ? c : me;
    if (
      !other &&
      ageOf(s, mother) >= ADULT_AGE &&
      ageOf(s, mother) <= 44 &&
      s.day - mother.lastBirth >= 300 &&
      idice(g).chance(SEDUCE.child)
    )
      naturalChild(g, life, mother, father, c);
  }
}

/** A child of a kept lover, outside a marriage. */
function naturalChild(
  g: ConquestGame,
  life: Life,
  mother: Character,
  father: Character,
  lover: Character,
): void {
  const s = g.s;
  const kid = birth(s, idice(g), g.touchChar(father), g.touchChar(mother), 0);
  g.touchChar(kid);
  mother.lastBirth = s.day;
  const me = meOf(s, life)!;
  if (me.female) {
    // Yours, plainly: whose else is a question for later.
    father.children = father.children.filter((x) => x !== kid.id);
    kid.father = -1;
    kid.home = life.home;
  } else {
    father.children = father.children.filter((x) => x !== kid.id);
    kid.father = -1;
    kid.home = lover.home ?? life.prov;
  }
  raiseEvent(g, life, "intr-child", { c: lover.id, k: kid.id });
}

/** A kept arrangement ends (and, said, why). */
export function endKept(
  g: ConquestGame,
  life: Life,
  k: KeptLover,
  why: string | null,
): void {
  const st = intrigue(g);
  st.kept = st.kept.filter((x) => x !== k);
  intrigueChanged(g);
  if (why) secretNote(g, life, why, "bad");
  const a = affairWith(life, k.c);
  if (a && why) endAffair(g, life, a, "the arrangement is over");
}

/** Stop keeping someone. */
export function dismissKept(
  g: ConquestGame,
  life: Life,
  c: number,
): string | null {
  const k = keptOf(g.s, life).find((x) => x.c === c);
  if (!k) return "You don't keep them.";
  const ch = g.s.chars[c];
  if (ch?.alive) remembers(g, life, g.char(c), "Turned me off", -20, 3);
  endKept(g, life, k, `You end it with ${charName(ch)}: no more allowance.`);
  if (life.ties[c] === "lover") setTie(g, life, c, null);
  return null;
}

// ---------------------------------------------------------------- your own husband or wife

export interface WooView {
  check: Check;
  /** Their chance of a child a year now, and while you're courting each other. */
  now: number;
  fond: number;
  player: boolean;
}

/** The wife of a marriage (for the chance of a child). */
function wifeOf(s: GameState, me: Character): Character | undefined {
  return me.female ? me : s.chars[me.spouse];
}

/** Court your own husband or wife. */
export function wooView(s: GameState, life: Life): WooView {
  const me = meOf(s, life);
  const sp = me ? s.chars[me.spouse] : undefined;
  const wife = me ? wifeOf(s, me) : undefined;
  const now = wife && wife.spouse >= 0 ? birthChance(s, wife).total : 0;
  const active = (life.cooldowns["intr:fond"] ?? 0) > s.day;
  const fond = active
    ? now
    : Math.min(1, Math.round(now * FOND.mul * 1000) / 1000);
  const player = !!sp && !!lifeOfChar(s, sp.id);
  let check: Check = yes;
  if (!me) check = no("You're watching.");
  else if (!sp?.alive) check = no("You're not married.");
  else if (ageOf(s, me) < ADULT_AGE || ageOf(s, sp) < ADULT_AGE)
    check = no("Not until you're both eighteen.");
  else if (life.travel) check = no("You're on the road.");
  else if (!peopleHere(s, life.prov, life).some((x) => x.id === sp.id))
    check = no(`${sp.first} isn't here.`);
  else {
    const left = (life.cooldowns["intr:woo"] ?? 0) - s.day;
    if (left > 0) check = no(`Again in ${left} days.`);
    else if (
      player &&
      lifeOfChar(s, sp.id)!.events.some(
        (e) => e.key === "p2p-intr-woo" && e.ctx.c === me.id,
      )
    )
      check = no("They haven't answered you yet.");
  }
  return { check, now, fond, player };
}

export function woo(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const v = wooView(s, life);
  if (!v.check.ok) return v.check.why;
  const me = meOf(s, life)!;
  const sp = g.char(me.spouse);
  touchLife(g, life).cooldowns["intr:woo"] = s.day + FOND.again;
  const other = lifeOfChar(s, sp.id);
  if (other) {
    raiseEvent(g, other, "p2p-intr-woo", { c: me.id });
    journal(
      g,
      life,
      `You ask ${sp.first} to walk out with you, like the old days.`,
    );
    return null;
  }
  fondly(g, life, sp);
  return null;
}

/** An evening for the two of you; the door closes. */
export function fondly(g: ConquestGame, life: Life, sp: Character): void {
  const s = g.s;
  touchLife(g, life).cooldowns["intr:fond"] = s.day + FOND.days;
  remembers(g, life, g.char(sp.id), "Courted me again", 12, 3);
  addStress(g, life, -4);
  const lines = [
    `Supper by candlelight, the children sent to bed early, and ${sp.first} laughing at your old jokes as if they were new. The rest is nobody's business.`,
    `You take ${sp.first} walking by the river, the long way home. It's like the first year again.`,
    `A ribbon from the market, a song you both remember, and the door closed on the world.`,
  ];
  journal(g, life, lines[idice(g).int(0, lines.length - 1)], "good");
}

// ---------------------------------------------------------------- the reckoning

/** Each month: a kept lover's allowance (a line of its own in the forecast). */
hooks.forecast.push((s, life) => [
  ...keptOf(s, life).map((k) => ({
    key: `intr:kept:${k.c}`,
    label: `An allowance for ${s.chars[k.c]?.first ?? "someone"}`,
    value: -k.cost,
  })),
  // Kept by another player: their allowance comes to you.
  ...intrigueOf(s)
    .kept.filter((k) => k.c === life.c && life.c >= 0)
    .map((k) => ({
      key: `intr:keptby:${k.by}`,
      label: `An allowance from ${s.chars[k.by]?.first ?? "someone"}`,
      value: k.cost,
    })),
]);

/** Courting each other again makes a child likelier, for a while. */
hooks.birthChance.push((s, c, e) => {
  const l = s.lives.find((x) => x.c >= 0 && (x.c === c.id || x.c === c.spouse));
  if (l && (l.cooldowns["intr:fond"] ?? 0) > s.day)
    e.mul("Courting each other again", FOND.mul);
});
