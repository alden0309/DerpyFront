// What you can do with the people you meet, Crusader Kings fashion. Every
// interaction says up front how it'll go: they decide (and you see whether
// they'll say yes, and every reason for and against), or it's a roll of the
// dice (and you see the odds and what makes them), or it simply happens.
// Done to another player, the big ones (friendship, courting, marriage, a
// duel, a cause, a job, a trade) go to them as a scene to accept or refuse.

import { findIn } from "./Areas";
import { kill, marry } from "./Characters";
import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  hurt,
  journal,
  meet,
  milestone,
  outcomeMeta,
  remembers,
  rollCheck,
  setCooldown,
  setTie,
  spend,
  touchLife,
} from "./LifeCore";
import { raiseLifeEvent } from "./LifeEvents";
import {
  carried,
  CARRY,
  charSkill,
  Check,
  isChildLife,
  isNativeChar,
  lifeOfChar,
  meOf,
  no,
  npcSkill,
  opinionOf,
  peopleHere,
  rankOf,
  skillLevel,
  startRank,
  weddingCost,
  yes,
} from "./LifeQueries";
import {
  checkChance,
  JOBS,
  MARRY_OPINION,
  PATRON_OPINION,
  roleJobs,
  ROLES,
  SKILL_NAMES,
} from "./LifeRules";
import { AMERICAS, World, worldOf } from "./Map";
import { joinMovement, movementOf, recruitInto } from "./Movements";
import { handOf, hireCheck, hireHand } from "./Property";
// SOCIETY (r11)
import { addSettler, settleAcceptance, settleCheck } from "./Founding";
import {
  affairWith,
  exposeBy,
  hushMoney,
  learnSecret,
  scandalize,
  secretOn,
  startAffair,
  wouldBeAffair,
} from "./Liaisons";
import {
  appointerOf,
  eligible,
  giveOffice,
  officeById,
  officeName,
  OFFICES,
  seekAcceptance,
} from "./Offices";
import { ageOf, charName, hasTrait } from "./Queries";
import { DAYS_PER_YEAR, SEAT_NAMES } from "./Rules";
import { rumour } from "./Rumours";
import { learnTongue } from "./Society";
import {
  LESSON_FEE,
  LESSON_POINTS,
  motherTongue,
  TALK_POINTS,
  talkWith,
  tongueName,
  tonguesOf,
  type TalkView,
} from "./Tongues";
import type {
  Breakdown,
  Character,
  GameState,
  Good,
  JobKind,
  Life,
  PersonAct,
  Skill,
} from "./Types";
import { GOODS, PERSON_ACTS, SEATS } from "./Types";
import {
  bossOf,
  canPromote,
  hireAcceptance,
  hireGates,
  leaveJob,
  promote,
  promotionAcceptance,
  startJob,
} from "./Work";

const WORLD = worldOf(AMERICAS);

export type InteractionGroup =
  | "friendly"
  | "romance"
  | "work"
  | "favours"
  | "cause"
  | "hostile";

export const GROUP_NAMES: Record<InteractionGroup, string> = {
  friendly: "Friendly",
  romance: "Romance",
  work: "Work and business",
  favours: "Favours",
  cause: "The cause",
  hostile: "Hostile",
};

export interface InteractionDef {
  label: string;
  group: InteractionGroup;
  text: string;
  cooldown: number;
  /** They decide, a roll decides, or it just happens. */
  mode: "accept" | "chance" | "do";
  skill?: Skill;
  /** Done to another player: they get to answer (or it's done straight). */
  player: "ask" | "direct" | "no";
}

export const INTERACTIONS: Record<PersonAct, InteractionDef> = {
  talk: {
    label: "Talk",
    group: "friendly",
    text: "Pass the time of day. Small kindnesses add up.",
    cooldown: 7,
    mode: "do",
    player: "direct",
  },
  flatter: {
    label: "Flatter",
    group: "friendly",
    text: "Praise them. Done well, they warm to you; laid on too thick, they don't.",
    cooldown: 60,
    mode: "chance",
    skill: "persuasion",
    player: "no",
  },
  gift: {
    label: "Give a gift",
    group: "friendly",
    text: "Coins, wine, a good hat. More to the poor, less to the rich.",
    cooldown: 30,
    mode: "do",
    player: "direct",
  },
  befriend: {
    label: "Offer friendship",
    group: "friendly",
    text: "Ask them to be a true friend. Friends ease your cares, lend a hand, and stand by you.",
    cooldown: 90,
    mode: "accept",
    player: "ask",
  },
  mentor: {
    label: "Ask them to teach you",
    group: "friendly",
    text: "Someone who knows their trade better than you could teach you it: their skill grows in you every month.",
    cooldown: 120,
    mode: "accept",
    player: "no",
  },
  court: {
    label: "Court",
    group: "romance",
    text: "Walk out together. If it goes well, it may come to marriage.",
    cooldown: 30,
    mode: "chance",
    skill: "persuasion",
    player: "ask",
  },
  propose: {
    label: "Propose marriage",
    group: "romance",
    text: "A wedding (the higher you stand, the more it costs); they come to live in your home.",
    cooldown: 60,
    mode: "accept",
    player: "ask",
  },
  work: {
    label: "Ask for work",
    group: "work",
    text: "Ask to be taken on. You hold one job at a time, at their place.",
    cooldown: 30,
    mode: "accept",
    player: "no",
  },
  promote: {
    label: "Ask for promotion",
    group: "work",
    text: "Ask to be moved up a rung.",
    cooldown: 60,
    mode: "accept",
    player: "no",
  },
  quit: {
    label: "Hand in your notice",
    group: "work",
    text: "Leave their employ. Leaving soon after starting doesn't go down well.",
    cooldown: 0,
    mode: "do",
    player: "no",
  },
  hire: {
    label: "Offer them work",
    group: "work",
    text: "Take them on as a hand at your business: they cost wages, and bring in takings.",
    cooldown: 30,
    mode: "accept",
    player: "ask",
  },
  trade: {
    label: "Offer goods for sale",
    group: "work",
    text: "Sell another traveller what you're carrying, at your price.",
    cooldown: 7,
    mode: "accept",
    player: "ask",
  },
  borrow: {
    label: "Borrow money",
    group: "favours",
    text: "A loan, repaid with a fifth again within the year.",
    cooldown: 180,
    mode: "accept",
    player: "no",
  },
  patron: {
    label: "Ask for patronage",
    group: "favours",
    text: "A patron of standing speaks for you: promotions, commissions, appointments.",
    cooldown: 180,
    mode: "accept",
    player: "no",
  },
  recruit: {
    label: "Recruit to your cause",
    group: "cause",
    text: "Bring them into the movement. Grievances help; officials may inform on you.",
    cooldown: 90,
    mode: "chance",
    skill: "persuasion",
    player: "ask",
  },
  join: {
    label: "Join their cause",
    group: "cause",
    text: "Swear yourself to the movement they belong to.",
    cooldown: 30,
    mode: "do",
    player: "direct",
  },
  bribe: {
    label: "Grease their palm",
    group: "favours",
    text: "A purse, quietly given, to someone with a say: in your work, your rank, your suit. Most take it; the honest take offence, and talk.",
    cooldown: 180,
    mode: "chance",
    skill: "stealth",
    player: "no",
  },
  rumour: {
    label: "Spread a rumour",
    group: "hostile",
    text: "Whisper against them. Hurts candidates and councillors; get caught and you've an enemy.",
    cooldown: 90,
    mode: "chance",
    skill: "stealth",
    player: "direct",
  },
  insult: {
    label: "Insult",
    group: "hostile",
    text: "Say what you think of them, loudly.",
    cooldown: 30,
    mode: "do",
    player: "direct",
  },
  duel: {
    label: "Challenge to a duel",
    group: "hostile",
    text: "Pistols at dawn, or swords. Honour satisfied; someone may die.",
    cooldown: 365,
    mode: "chance",
    skill: "fighting",
    player: "ask",
  },
  // SOCIETY (r11)
  tryst: {
    label: "Meet in secret",
    group: "romance",
    text: "A stolen hour with your lover, somewhere nobody looks. Stealth keeps it quiet; if either of you is married, every meeting is a risk.",
    cooldown: 21,
    mode: "chance",
    skill: "stealth",
    player: "ask",
  },
  tongue: {
    label: "Take lessons in their tongue",
    group: "friendly",
    text: "Pay them to teach you their tongue, a lesson at a time. The more Learning you have, the faster it comes.",
    cooldown: 21,
    mode: "accept",
    player: "no",
  },
  seek: {
    label: "Seek an appointment",
    group: "work",
    text: "Ask for an office in their gift: the county court, the watch, the parish, the town. Offices pay fees, bring renown, and lead on to the assembly and the council.",
    cooldown: 90,
    mode: "accept",
    player: "no",
  },
  settle: {
    label: "Ask them to come to your settlement",
    group: "cause",
    text: "Bring their household to the settlement you're getting up, on the terms you're offering.",
    cooldown: 60,
    mode: "accept",
    player: "no",
  },
  pry: {
    label: "Pry into their affairs",
    group: "hostile",
    text: "Ask around, read what's left on desks, follow them once or twice. Everybody has something to hide; some have something worth knowing.",
    cooldown: 120,
    mode: "chance",
    skill: "stealth",
    player: "no",
  },
  blackmail: {
    label: "Blackmail",
    group: "hostile",
    text: "You know their secret. A quiet word, and a sum named. They may pay; they may not.",
    cooldown: 180,
    mode: "chance",
    skill: "stealth",
    player: "no",
  },
};

/** How much talk each interaction needs: 0 signs will do, 1 a few words, 2 a real conversation. */
const WORDS: Record<PersonAct, number> = {
  talk: 0,
  gift: 0,
  insult: 0,
  duel: 0,
  trade: 0,
  quit: 0,
  rumour: 0,
  tryst: 0,
  pry: 0,
  tongue: 0,
  hire: 1,
  work: 1,
  befriend: 1,
  court: 1,
  promote: 1,
  borrow: 1,
  join: 1,
  bribe: 1,
  blackmail: 1,
  settle: 1,
  flatter: 2,
  mentor: 2,
  propose: 2,
  patron: 2,
  recruit: 2,
  seek: 2,
};

/** How the barrier weighs on what they decide, and on the odds. */
function tonguePart(
  t: TalkView,
  s: GameState,
): { label: string; value: number; dc: number } | null {
  if (t.via >= 0)
    return {
      label: `Through an interpreter, ${charName(s.chars[t.via])}`,
      value: -8,
      dc: 2,
    };
  if (t.level >= 3) return null;
  const tongue = tongueName(t.tongue);
  if (t.level === 2) return { label: `Halting ${tongue}`, value: -5, dc: 1 };
  if (t.level === 1)
    return {
      label: `Only a few words of ${tongue} between you`,
      value: -20,
      dc: 4,
    };
  return {
    label: "No tongue in common: signs and gestures",
    value: -35,
    dc: 6,
  };
}

/** Whether you and they can talk (an interpreter counts). */
export function talkView(
  s: GameState,
  w: World,
  life: Life,
  c: Character,
): TalkView {
  return talkWith(s, w.map, life, c, () => peopleHere(s, life.prov, life));
}

/** Offices this person has the giving of that you could hold. */
export function seekable(s: GameState, life: Life, c: Character): number[] {
  const out: number[] = [];
  for (const list of Object.values(s.society?.offices ?? {}))
    for (const o of list)
      if (
        appointerOf(s, o) === c.id &&
        OFFICES[o.key].how !== "elected" &&
        o.key !== "founder" &&
        o.holder !== life.c
      )
        out.push(o.id);
  return out;
}

/** What the character card shows for an interaction. */
export interface InteractionView {
  check: Check;
  mode: InteractionDef["mode"];
  /** They decide: above nothing, they will. */
  accept: Breakdown | null;
  /** A roll: the chance, and what makes it. */
  chance: number | null;
  odds: Breakdown | null;
  /** Will they (for `accept`)? */
  will: boolean | null;
  /** Another player decides. */
  player: boolean;
  /** A different label for this person (the trade they'd take you on for). */
  label?: string;
  /** SOCIETY (r11): how well you can talk, and through whom. */
  tongue?: TalkView;
}

function relation(a: Character, b: Character): boolean {
  if (
    a.father === b.id ||
    a.mother === b.id ||
    b.father === a.id ||
    b.mother === a.id
  )
    return true;
  if (a.father >= 0 && a.father === b.father) return true;
  if (a.mother >= 0 && a.mother === b.mother) return true;
  return false;
}

const statusOf = (s: GameState, c: Character): number => {
  if (c.role) return ROLES[c.role].status;
  const n = s.nations[c.nation];
  if (n?.ruler === c.id) return 6;
  if (n && SEATS.some((st) => n.council[st] === c.id)) return 5;
  const parent = s.chars[c.father] ?? s.chars[c.mother];
  return parent?.role ? ROLES[parent.role].status : 2;
};

/** What it takes to buy someone's good word: more for the great. */
export function bribeCost(s: GameState, c: Character): number {
  return 5 * statusOf(s, c);
}

/** The trades this person would take you on for. */
export function workOffered(c: Character): JobKind[] {
  return roleJobs(c.role).filter((k) => k !== "servant");
}

/** Whether someone is your teacher's equal: what they know best, and how well. */
export function bestSkill(s: GameState, c: Character): [Skill, number] {
  const sk = c.role ? ROLES[c.role].skill : "persuasion";
  return [sk, charSkill(s, c, sk)];
}

/** Can it be done at all (not whether they'll agree). */
function gates(
  s: GameState,
  w: World,
  life: Life,
  c: Character | undefined,
  act: PersonAct,
  arg?: number,
): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (!c?.alive || c.abroad) return no("They're gone.");
  if (c.id === me.id) return no("That's you.");
  const def = INTERACTIONS[act];
  if (!def) return no("Unknown.");
  if (life.travel) return no("You're on the road.");
  if (!peopleHere(s, life.prov, life).some((x) => x.id === c.id))
    return no("They're not here.");
  const left = Math.max(0, (life.cooldowns[`p:${act}:${c.id}`] ?? 0) - s.day);
  if (left > 0) return no(`Again in ${left} day${left === 1 ? "" : "s"}.`);
  const child = isChildLife(s, life);
  if (child && act !== "talk" && act !== "gift")
    return no("Not until you're sixteen.");
  const other = lifeOfChar(s, c.id);
  if (other && def.player === "no")
    return no("They're a player: ask them yourself.");
  if (!other && act === "trade") return no("Only with another player.");
  if (
    other &&
    other.events.some((e) => e.key === `p2p-${act}` && e.ctx.c === me.id)
  )
    return no("They haven't answered you yet.");
  const age = ageOf(s, c);
  // SOCIETY (r11): words are needed for most things.
  const words = WORDS[act] ?? 0;
  if (words > 0 && !other) {
    const t = talkView(s, w, life, c);
    if (t.level < words)
      return no(
        `You share ${t.level === 0 ? "no tongue" : "only a few words"} with ${c.first}: you'd need ${words === 2 ? "to speak" : "a few words of"} ${tongueName(t.theirs)}, or an interpreter.`,
      );
  }
  switch (act) {
    case "gift":
      return life.purse >= 1 ? yes : no("You've nothing to give.");
    case "bribe": {
      if (statusOf(s, c) < 3) return no("They've nothing worth buying.");
      const cost = bribeCost(s, c);
      return life.purse >= cost ? yes : no(`It would take ${cost} coins.`);
    }
    case "befriend":
      if (life.ties[c.id] === "friend") return no("You're friends already.");
      if (life.ties[c.id] === "rival" || life.ties[c.id] === "nemesis")
        return no("You're enemies.");
      return yes;
    case "mentor": {
      if (life.ties[c.id] === "mentor") return no("They teach you already.");
      const [sk, lvl] = bestSkill(s, c);
      if (lvl < skillLevel(s, life, sk) + 3)
        return no(
          `They've nothing to teach you (their ${SKILL_NAMES[sk].toLowerCase()} ${lvl}).`,
        );
      return yes;
    }
    case "court":
    case "propose": {
      if (age < 16) return no("They're a child.");
      if (c.female === me.female) return no("Not in this century.");
      if (me.spouse === c.id) return no("You're married to them.");
      // SOCIETY (r11): courting someone while married is an affair; marrying isn't possible.
      if (act === "propose" && me.spouse >= 0) return no("You're married.");
      if (act === "propose" && c.spouse >= 0) return no("They're married.");
      if (relation(me, c)) return no("Too close kin.");
      if (act === "propose" && life.purse < weddingCost(s, life))
        return no(`A wedding costs ${weddingCost(s, life)} coins.`);
      return yes;
    }
    case "work": {
      const jobs = workOffered(c);
      if (!jobs.length) return no("They don't take people on.");
      const kind = jobs[Math.max(0, Math.min(jobs.length - 1, arg ?? 0))];
      return hireGates(s, w, life, c, kind);
    }
    case "promote": {
      if (!life.job) return no("You have no work.");
      if (!canPromote(s, life, c))
        return no(
          life.job.own
            ? "You're your own master."
            : JOBS[life.job.kind].ranks[life.job.rank + 1]?.commission
              ? "A commission comes from the governor, the marshal or your patron."
              : "They're not your master.",
        );
      if (!JOBS[life.job.kind].ranks[life.job.rank + 1])
        return no("The top of the ladder.");
      return yes;
    }
    case "quit": {
      const boss = bossOf(s, life);
      if (!life.job || boss?.id !== c.id) return no("You don't work for them.");
      if (life.job.kind === "servant" && (life.job.until ?? 0) > s.day)
        return no("You're bound until your indenture is served.");
      return yes;
    }
    case "hire": {
      if (other) {
        if (other.job) return no("They have work already.");
        if (age < 16) return no("A child.");
      }
      return hireCheck(s, life, c);
    }
    case "trade": {
      const good = GOODS[arg ?? -1];
      if (!good) return no("Choose something to sell.");
      if ((life.goods[good] ?? 0) <= 0) return no("You're not carrying any.");
      return yes;
    }
    case "borrow": {
      const role = c.role ? ROLES[c.role] : undefined;
      if (!role || role.wealth < 10) return no("They've nothing to lend.");
      if (life.debts.some((d) => d.to === c.id))
        return no("You owe them already.");
      return yes;
    }
    case "patron": {
      const status = statusOf(s, c);
      if (status < 3) return no("They haven't the standing to be a patron.");
      if (life.patron === c.id) return no("They're your patron already.");
      return yes;
    }
    case "recruit": {
      const m = movementOf(s, me.id);
      if (!m) return no("You belong to no movement.");
      if (m.members.includes(c.id) || m.leader === c.id)
        return no("They're in it already.");
      if (movementOf(s, c.id)) return no("They follow another cause.");
      return age >= 16 ? yes : no("A child.");
    }
    case "join": {
      const m = movementOf(s, c.id);
      if (!m) return no("They belong to no movement.");
      if (movementOf(s, me.id)) return no("You belong to a movement already.");
      return yes;
    }
    // SOCIETY (r11)
    case "tryst":
      if (life.ties[c.id] !== "lover") return no("Only with a lover.");
      return yes;
    case "tongue": {
      const theirs = tonguesOf(s, w.map, c);
      const mine = tonguesOf(s, w.map, me);
      const t = motherTongue(c.culture);
      if ((theirs[t] ?? 0) < 3 || (mine[t] ?? 0) >= 3)
        return no("Nothing they could teach you.");
      return life.purse >= LESSON_FEE
        ? yes
        : no(`A lesson costs ${LESSON_FEE} coins.`);
    }
    case "seek": {
      const o = officeById(s, arg ?? -1);
      if (!o || appointerOf(s, o) !== c.id)
        return no("Nothing to seek from them.");
      return eligible(s, life, o);
    }
    case "settle":
      return settleCheck(s, life, c);
    case "pry":
      if (age < 18) return no("A child.");
      if (secretOn(life, c.id)) return no("You know their secret already.");
      return yes;
    case "blackmail": {
      const sec = secretOn(life, c.id);
      if (!sec) return no("You've nothing on them.");
      if (sec.paid !== undefined && s.day - sec.paid < 180)
        return no("They paid you lately.");
      return yes;
    }
    case "duel":
      if (age < 16) return no("A child.");
      if (relation(me, c) || me.spouse === c.id)
        return no("Not your own family.");
      if (
        !other &&
        life.ties[c.id] !== "rival" &&
        life.ties[c.id] !== "nemesis" &&
        opinionOf(s, c, life).total > -20
      )
        return no("A duel needs a quarrel: a rival, or someone who hates you.");
      return yes;
    default:
      return yes;
  }
}

/** They decide, with what the tongue barrier adds. */
function acceptance(
  s: GameState,
  w: World,
  life: Life,
  c: Character,
  act: PersonAct,
  arg?: number,
): Breakdown | null {
  const b = acceptanceOf(s, w, life, c, act, arg);
  if (!b || lifeOfChar(s, c.id) || act === "tongue") return b;
  const part = tonguePart(talkView(s, w, life, c), s);
  if (!part) return b;
  return {
    total: Math.round(b.total + part.value),
    parts: [...b.parts, { label: part.label, value: part.value }],
  };
}

/** They decide: what they think of it, and why. */
function acceptanceOf(
  s: GameState,
  w: World,
  life: Life,
  c: Character,
  act: PersonAct,
  arg?: number,
): Breakdown | null {
  const me = meOf(s, life)!;
  const op = opinionOf(s, c, life).total;
  const opinion = (e: Explain, div = 2) =>
    e.add(`What they think of you (${op})`, Math.round(op / div));
  switch (act) {
    case "work": {
      const jobs = workOffered(c);
      const kind = jobs[Math.max(0, Math.min(jobs.length - 1, arg ?? 0))];
      return hireAcceptance(s, w, life, c, kind);
    }
    case "promote":
      return promotionAcceptance(s, life, c);
    case "befriend": {
      const e = new Explain().add("Friendship takes time", -15);
      opinion(e);
      const shared = me.traits.filter((t) => c.traits.includes(t)).length;
      if (shared) e.add("Kindred spirits", Math.min(10, shared * 5));
      if (c.memories.some((m) => m.of === me.id && m.why === "Good company"))
        e.add("You've passed many an hour", 5);
      if (hasTrait(c, "generous")) e.add("Warm-hearted", 5);
      if (life.ties[c.id] === "lover") e.add("Sweethearts already", 15);
      const friends = Object.values(life.ties).filter(
        (t) => t === "friend",
      ).length;
      if (friends >= 4)
        e.add(
          `You've ${friends} friends already: can you keep up?`,
          -8 * (friends - 3),
        );
      return e.done(0);
    }
    case "mentor": {
      const e = new Explain().add("Teaching takes time", -20);
      opinion(e);
      if (life.job && workOffered(c).includes(life.job.kind))
        e.add("You're in their trade", 10);
      if (hasTrait(c, "generous")) e.add("Generous with what they know", 10);
      if (hasTrait(c, "greedy")) e.add("Mean with their time", -10);
      if (hasTrait(me, "diligent")) e.add("You're keen", 5);
      if (s.lives.some((l) => l !== life && l.ties[c.id] === "mentor"))
        e.add("They teach another already", -15);
      const age = ageOf(s, me);
      if (age <= 25) e.add("You're young enough to learn", 5);
      return e.done(0);
    }
    case "propose": {
      const e = new Explain().add("Marriage is a serious matter", -20);
      opinion(e);
      if (life.ties[c.id] === "lover") e.add("Sweethearts", 15);
      const prospects = Math.min(
        15,
        (life.job?.rank ?? 0) * 3 + Math.floor(life.renown / 5),
      );
      if (prospects) e.add("Your prospects", prospects);
      if (statusOf(s, c) >= 4 && prospects < 6 && life.background !== "gentry")
        e.add("Beneath their family", -15);
      if ((life.property ?? []).some((p) => p.kind === "house"))
        e.add("A house of your own", 5);
      if (life.lifestyle === "comfortable") e.add("You live comfortably", 5);
      if (life.purse < 0) e.add("You're in debt", -10);
      return e.done(0);
    }
    case "hire": {
      const e = new Explain().add("Steady wages", 15);
      opinion(e, 3);
      if (c.role && ROLES[c.role].status >= 2)
        e.add("They have a trade of their own", -40);
      if (hasTrait(c, "lazy")) e.add("Not one for hard work", -10);
      if (life.purse < 10) e.add("Can you even pay?", -10);
      return e.done(0);
    }
    case "borrow": {
      const role = c.role ? ROLES[c.role] : undefined;
      const e = new Explain().add("Lending is a risk", -10);
      opinion(e);
      if (role)
        e.add(
          "They've money put by",
          Math.min(10, Math.floor(role.wealth / 6)),
        );
      if ((life.property ?? []).length) e.add("You own property", 10);
      if (life.debts.length) e.add("You owe others already", -15);
      if (hasTrait(c, "greedy")) e.add("Tight-fisted", -10);
      if (hasTrait(c, "generous")) e.add("Open-handed", 5);
      return e.done(0);
    }
    // SOCIETY (r11)
    case "seek": {
      const o = officeById(s, arg ?? -1);
      return o ? seekAcceptance(s, life, o, c) : null;
    }
    case "settle":
      return life.founding ? settleAcceptance(s, life, c) : null;
    case "tongue": {
      const e = new Explain().add("A fee is a fee", 10);
      opinion(e, 3);
      if (hasTrait(c, "greedy")) e.add("Glad of the money", 5);
      if (hasTrait(c, "lazy")) e.add("Can't be bothered", -10);
      if (hasTrait(c, "generous")) e.add("Glad to share it", 5);
      return e.done(0);
    }
    case "patron": {
      const e = new Explain().add("Patronage is given sparingly", -25);
      opinion(e);
      const fame = Math.min(15, Math.floor(life.renown / 3));
      if (fame) e.add(`Your renown (${Math.floor(life.renown)})`, fame);
      if (life.patron >= 0 && s.chars[life.patron]?.alive)
        e.add("You have a patron already", -20);
      if (hasTrait(me, "ambitious")) e.add("Ambitious: worth backing", 5);
      return e.done(0);
    }
    default:
      return null;
  }
}

/** A roll: the chance, and what makes it. */
function chanceOf(
  s: GameState,
  life: Life,
  c: Character,
  act: PersonAct,
): { p: number; why: Breakdown } | null {
  const status = c.role ? ROLES[c.role].status : 2;
  // SOCIETY (r11): talking through a barrier is harder.
  const words = WORDS[act] ?? 0;
  const lang =
    words > 0 && !lifeOfChar(s, c.id)
      ? tonguePart(talkView(s, WORLD, life, c), s)
      : null;
  const roll = (sk: Skill, dc: number, against: string) => {
    const have = skillLevel(s, life, sk);
    const e = new Explain()
      .add(`Your ${SKILL_NAMES[sk].toLowerCase()}`, have, true)
      .add(against, -dc, true);
    if (lang) e.add(lang.label, -lang.dc, true);
    return {
      p: checkChance(have, dc + (lang?.dc ?? 0)),
      why: e.done(0),
    };
  };
  switch (act) {
    case "flatter":
      return roll("persuasion", 3 + status, "Their standing");
    case "court":
      return roll(
        "persuasion",
        4 + Math.max(0, status - 2),
        "How hard they are to win",
      );
    case "rumour":
      return roll("stealth", 8, "Who'd believe it");
    case "bribe": {
      const e = new Explain()
        .add(
          `Your ${SKILL_NAMES.stealth.toLowerCase()}`,
          skillLevel(s, life, "stealth"),
          true,
        )
        .add("Their standing", -(3 + status), true);
      let dc = 3 + status;
      if (hasTrait(c, "honest")) {
        e.add("Honest", -4, true);
        dc += 4;
      }
      if (hasTrait(c, "just")) {
        e.add("Just", -2, true);
        dc += 2;
      }
      if (hasTrait(c, "greedy")) {
        e.add("Greedy", 4, true);
        dc -= 4;
      }
      if (hasTrait(c, "deceitful")) {
        e.add("Not above it", 2, true);
        dc -= 2;
      }
      return {
        p: checkChance(skillLevel(s, life, "stealth"), dc),
        why: e.done(0),
      };
    }
    case "duel":
      return roll("fighting", charSkill(s, c, "fighting"), "Their fighting");
    // SOCIETY (r11)
    case "tryst": {
      const a = affairWith(life, c.id);
      return roll(
        "stealth",
        a ? 5 + Math.floor(a.exposure / 20) : 3,
        a ? "Watchful eyes" : "Nosy neighbours",
      );
    }
    case "pry":
      return roll("stealth", 6 + status, "How careful they are");
    case "blackmail": {
      let dc = 5 + status;
      if (hasTrait(c, "brave")) dc += 3;
      if (hasTrait(c, "craven")) dc -= 3;
      return roll(
        "stealth",
        dc,
        hasTrait(c, "brave") ? "Their nerve (brave)" : "Their nerve",
      );
    }
    case "recruit": {
      const pr = s.provinces[c.home ?? 0];
      const grievance = Math.floor((pr?.unrest ?? 0) / 15);
      return roll(
        "persuasion",
        9 - grievance,
        "Their loyalty (less where people are restless)",
      );
    }
    default:
      return null;
  }
}

/** Everything the card needs for one interaction with one person. */
export function interactionView(
  s: GameState,
  w: World,
  life: Life,
  cId: number,
  act: PersonAct,
  arg?: number,
): InteractionView {
  const c = s.chars[cId];
  const def = INTERACTIONS[act];
  const check = gates(s, w, life, c, act, arg);
  const other = c ? lifeOfChar(s, c.id) : undefined;
  const view: InteractionView = {
    check,
    mode: def?.mode ?? "do",
    accept: null,
    chance: null,
    odds: null,
    will: def?.mode === "do" ? true : null,
    player: !!other && def?.player === "ask",
  };
  if (act === "work" && c) {
    const jobs = workOffered(c);
    const kind = jobs[Math.max(0, Math.min(jobs.length - 1, arg ?? 0))];
    if (kind)
      view.label = isNativeChar(s, c)
        ? `Ask to join them as ${JOBS[kind].ranks[0].title.toLowerCase()}`
        : `Ask for work as ${JOBS[kind].ranks[0].title.toLowerCase()}`;
  }
  if (act === "bribe" && c)
    view.label = `Grease their palm (${bribeCost(s, c)})`;
  // SOCIETY (r11)
  if (c && meOf(s, life) && !other && c.id !== life.c && c.alive)
    view.tongue = talkView(s, w, life, c);
  if (act === "talk" && view.tongue && view.tongue.level === 0)
    view.label = "Talk with signs";
  if (act === "court" && c && wouldBeAffair(s, life, c))
    view.label = "Court in secret";
  if (act === "seek") {
    const o = officeById(s, arg ?? -1);
    if (o) view.label = `Seek appointment: ${officeName(s, o).toLowerCase()}`;
  }
  if (act === "tongue" && c)
    view.label = `Lessons in ${tongueName(motherTongue(c.culture))} (${LESSON_FEE})`;
  if (!c || !meOf(s, life) || view.player) return view;
  if (def.mode === "accept") {
    view.accept = acceptance(s, w, life, c, act, arg);
    view.will = view.accept ? view.accept.total > 0 : null;
  } else if (def.mode === "chance") {
    const ch = chanceOf(s, life, c, act);
    if (ch) {
      view.chance = ch.p;
      view.odds = ch.why;
    }
  }
  return view;
}

// ---------------------------------------------------------------- the old names

export const PERSON_ACT_DEFS = INTERACTIONS;

export function personCheck(
  s: GameState,
  life: Life,
  cId: number,
  act: PersonAct,
  w: World = WORLD,
): Check {
  return gates(s, w, life, s.chars[cId], act);
}

export function personOdds(
  s: GameState,
  life: Life,
  cId: number,
  act: PersonAct,
): number | null {
  const c = s.chars[cId];
  return c ? (chanceOf(s, life, c, act)?.p ?? null) : null;
}

// ---------------------------------------------------------------- doing it

/** The biggest reason against, for a refusal. */
function mainObjection(b: Breakdown | null): string {
  const worst = [...(b?.parts ?? [])]
    .filter((p) => !p.mul && p.value < 0)
    .sort((a, x) => a.value - x.value)[0];
  return worst
    ? worst.label.replace(/\.$/, "").toLowerCase()
    : "they'd rather not";
}

/** Do something with or to someone here. */
export function doInteraction(
  g: ConquestGame,
  life: Life,
  cId: number,
  act: PersonAct,
  arg?: number,
  extra: { good?: Good; qty?: number } = {},
): string | null {
  const s = g.s;
  const tradeArg = act === "trade" ? GOODS.indexOf(extra.good as Good) : arg;
  const view = interactionView(s, g.w, life, cId, act, tradeArg);
  if (!view.check.ok) return view.check.why;
  const def = INTERACTIONS[act];
  const me = meOf(s, life)!;
  const c = g.char(cId);
  touchLife(g, life);
  if (def.cooldown) setCooldown(g, life, `p:${act}:${cId}`, def.cooldown);
  meet(g, life, cId);
  // SOCIETY (r11): every conversation teaches a little of their tongue.
  if (
    !lifeOfChar(s, cId) &&
    act !== "tongue" &&
    act !== "pry" &&
    act !== "rumour"
  ) {
    const theirs = motherTongue(c.culture);
    const t = view.tongue;
    if (t && (tonguesOf(s, g.map, me)[theirs] ?? 0) < 3)
      learnTongue(
        g,
        life,
        theirs,
        t.level === 0 ? TALK_POINTS * 0.7 : TALK_POINTS,
      );
  }
  // You go to them where they are.
  const at = findIn(s, g.w, life.prov, cId, s.day, life);
  if (at) life.area = at.area;
  outcomeMeta(g, life, {
    key: act,
    title: view.label ?? def.label,
    c: cId,
    scene: at?.area ?? life.area ?? "tavern",
  });
  const name = charName(c);
  // Another player answers for themselves.
  if (view.player) return propose(g, life, c, act, arg, extra);
  if (def.mode === "accept" && !view.will) {
    const why = mainObjection(view.accept);
    journal(g, life, `${name} says no: ${why}.`, "bad");
    if (act === "propose") {
      addStress(g, life, 5);
      remembers(g, life, c, "Turned down your suit", -3, 1);
    }
    outcomeMeta(g, life, { ok: false });
    return null;
  }
  const pass =
    def.mode === "chance" && view.chance !== null
      ? rollCheck(g, view.chance)
      : true;
  if (def.mode !== "do") outcomeMeta(g, life, { ok: pass });
  switch (act) {
    case "talk": {
      gainXp(g, life, "persuasion", 3);
      const first = !c.memories.some(
        (m) => m.of === me.id && m.why === "Good company",
      );
      // SOCIETY (r11): no tongue in common, so it goes by signs.
      if (view.tongue && view.tongue.level === 0) {
        remembers(g, life, c, "Good company", 1, 1);
        journal(g, life, signTalk(g, c));
        return null;
      }
      remembers(g, life, c, "Good company", 3, 1);
      journal(g, life, smallTalk(g, life, c, first));
      return null;
    }
    case "flatter":
      gainXp(g, life, "persuasion", 5);
      if (pass) {
        remembers(g, life, c, "Flattered me", 10, 2);
        journal(
          g,
          life,
          `${name} colours at your praise, and stands a little taller.`,
          "good",
        );
      } else {
        remembers(g, life, c, "Laid it on thick", -6, 1);
        journal(
          g,
          life,
          `${name} saw through the flattery, and said so.`,
          "bad",
        );
      }
      return null;
    case "gift": {
      const amount = Math.max(
        1,
        Math.min(Math.floor(life.purse), Math.round(arg ?? 5)),
      );
      spend(g, life, amount);
      const status = statusOf(s, c);
      const mult = hasTrait(me, "generous") ? 1.5 : 1;
      const v = Math.min(
        30,
        Math.round(((amount * 3) / (status + 1)) * mult) + 2,
      );
      remembers(g, life, c, "A generous gift", v, 3);
      const player = lifeOfChar(s, cId);
      if (player) {
        earn(g, player, amount);
        journal(g, player, `${charName(me)} gave you ${amount} coins.`, "good");
      }
      journal(
        g,
        life,
        `You gave ${name} ${amount} coins. ${v >= 15 ? "They won't forget it." : "They thank you."}`,
      );
      return null;
    }
    case "befriend":
      gainXp(g, life, "persuasion", 5);
      setTie(g, life, cId, "friend");
      remembers(g, life, c, "A true friend", 10, 0);
      journal(
        g,
        life,
        `${name} takes your hand: friends, for good or ill.`,
        "good",
      );
      return null;
    case "mentor": {
      for (const [id, t] of Object.entries(life.ties))
        if (t === "mentor") delete life.ties[Number(id)];
      setTie(g, life, cId, "mentor");
      remembers(g, life, c, "My pupil", 8, 0);
      const [sk] = bestSkill(s, c);
      journal(
        g,
        life,
        `${name} agrees to teach you ${SKILL_NAMES[sk].toLowerCase()}. Every month with them is worth two alone.`,
        "good",
      );
      return null;
    }
    case "court":
      gainXp(g, life, "persuasion", 5);
      // SOCIETY (r11): courting while married is an affair, and talk spreads.
      if (wouldBeAffair(s, life, c)) {
        gainXp(g, life, "stealth", 3);
        const a = affairWith(life, cId);
        if (a) exposeBy(g, life, a, pass ? 3 : 8);
      }
      if (pass) {
        remembers(g, life, c, "Courted me", 12, 2);
        if (opinionOf(s, c, life).total >= 60) {
          setTie(g, life, cId, "lover");
          if (wouldBeAffair(s, life, c)) {
            startAffair(g, life, cId);
            journal(
              g,
              life,
              `You and ${name} are lovers now. Nobody must know.`,
              "good",
            );
          } else
            journal(g, life, `You and ${name} are sweethearts now.`, "good");
        } else
          journal(
            g,
            life,
            `A walk with ${name}, and a promise of another.`,
            "good",
          );
      } else {
        remembers(g, life, c, "Clumsy courting", -6, 1);
        journal(g, life, `${name} was cool to you today.`);
      }
      return null;
    case "propose":
      return wed(g, life, c);
    case "work": {
      const jobs = workOffered(c);
      const kind = jobs[Math.max(0, Math.min(jobs.length - 1, arg ?? 0))];
      const place = ROLES[c.role!].place;
      startJob(g, life, kind, place, startRank(s, life, kind), cId);
      remembers(g, life, c, "Took me on", 0, 0);
      return null;
    }
    case "promote":
      promote(g, life);
      remembers(g, life, c, "I raised them up", 5, 3);
      return null;
    case "quit": {
      const months = life.job?.months ?? 0;
      if (months < 6) remembers(g, life, c, "Left me in the lurch", -10, 2);
      leaveJob(g, life, "of your own accord");
      return null;
    }
    case "hire":
      return hireHand(g, life, c);
    case "borrow": {
      const role = ROLES[c.role!];
      const op = opinionOf(s, c, life).total;
      const amount = Math.max(
        3,
        Math.round(role.wealth * Math.min(0.8, 0.2 + op / 100)),
      );
      earn(g, life, amount);
      life.debts.push({
        to: cId,
        amount: Math.round(amount * 1.2),
        due: s.day + DAYS_PER_YEAR,
      });
      journal(
        g,
        life,
        `${name} lends you ${amount} coins, to be repaid with ${Math.round(amount * 0.2)} more within the year.`,
      );
      return null;
    }
    case "patron":
      gainXp(g, life, "persuasion", 6);
      life.patron = cId;
      remembers(g, life, c, "My protégé", 10, 0);
      journal(
        g,
        life,
        `${name} agrees to be your patron. Doors will open.`,
        "good",
      );
      milestone(g, life, "renown", `Found a patron in ${name}`);
      return null;
    case "recruit":
      return recruitInto(g, life, c, pass);
    case "join": {
      const m = movementOf(s, cId)!;
      return joinMovement(g, life, m.id);
    }
    case "bribe": {
      const cost = bribeCost(s, c);
      gainXp(g, life, "stealth", 4);
      if (pass) {
        spend(g, life, cost);
        remembers(g, life, c, "Well paid", 25, 2);
        journal(
          g,
          life,
          `${cost} coins change hands, and ${name} remembers you kindly. Nobody need know.`,
          "good",
        );
      } else {
        remembers(g, life, c, "Tried to buy me", -25, 4);
        addRenown(g, life, -4);
        addStress(g, life, 4);
        rumour(
          g,
          life.prov,
          `${charName(me)} tried to bribe ${name}, and was shown the door.`,
          me.id,
          "bad",
        );
        journal(
          g,
          life,
          `${name} pushes the purse back across the table, loudly. By evening the whole town knows you tried.`,
          "bad",
        );
      }
      return null;
    }
    case "rumour":
      gainXp(g, life, "stealth", 6);
      if (pass) {
        c.memories.push({
          of: -2,
          why: "Talked about in the town",
          value: -15,
          until: s.day + 2 * DAYS_PER_YEAR,
        });
        let effect = "The whispers spread.";
        for (const n of s.nations) {
          const seat = SEATS.find((st) => n.council[st] === cId);
          if (seat && g.rng.chance(0.3)) {
            g.nation(n.id).council[seat] = -1;
            if (!n.court.includes(cId)) n.court.push(cId);
            effect = `Within the month ${name} was dismissed as ${SEAT_NAMES[seat].toLowerCase()}.`;
          }
          const pol = s.polities[n.id];
          const cand = pol?.candidates.find((x) => x.c === cId);
          if (cand) {
            cand.points -= 10;
            g.politiesChanged(n.id);
            effect = `${name}'s campaign is in trouble.`;
          }
        }
        const other = lifeOfChar(s, cId);
        if (other) {
          addRenown(g, other, -3);
          journal(
            g,
            other,
            "Someone is putting it about that you're not what you seem.",
            "bad",
          );
        }
        journal(
          g,
          life,
          `You put it about that ${name} isn't what they seem. ${effect}`,
          "good",
        );
      } else {
        remembers(g, life, c, "Spread lies about me", -30, 5);
        setTie(g, life, cId, "rival");
        addRenown(g, life, -2);
        journal(
          g,
          life,
          `${name} found out who was spreading tales. You've made an enemy.`,
          "bad",
        );
      }
      return null;
    case "insult": {
      remembers(g, life, c, "Insulted me", -20, 3);
      if (opinionOf(s, c, life).total <= -40 && life.ties[cId] !== "nemesis")
        setTie(g, life, cId, "rival");
      journal(g, life, `You told ${name} exactly what you think of them.`);
      const other = lifeOfChar(s, cId);
      if (other)
        journal(
          g,
          other,
          `${charName(me)} insulted you, loudly, in front of everyone.`,
          "bad",
        );
      if (
        (hasTrait(c, "brave") || hasTrait(c, "cruel")) &&
        !other &&
        g.rng.chance(0.3)
      )
        return duel(g, life, c, true);
      return null;
    }
    case "duel":
      return duel(g, life, c, false, pass);
    case "trade":
      return "Only with another player.";
    // SOCIETY (r11)
    case "tryst": {
      const a = affairWith(life, cId);
      outcomeMeta(g, life, { scene: "woods" });
      if (pass) {
        addStress(g, life, -6);
        remembers(g, life, c, "A stolen hour", 6, 2);
        if (a) {
          a.met = s.day;
          exposeBy(g, life, a, 2);
        }
        journal(
          g,
          life,
          `An hour with ${name} in the old mill, where nobody goes. Nobody saw. Probably.`,
          "good",
        );
      } else {
        addStress(g, life, 4);
        if (a) {
          a.met = s.day;
          exposeBy(g, life, a, 22);
        }
        journal(
          g,
          life,
          `You and ${name} were nearly caught: a lantern, a dog, a neighbour who looked twice.`,
          "bad",
        );
      }
      return null;
    }
    case "tongue": {
      spend(g, life, LESSON_FEE);
      const t = motherTongue(c.culture);
      const got = learnTongue(g, life, t, LESSON_POINTS);
      remembers(g, life, c, "A keen pupil", 3, 1);
      journal(
        g,
        life,
        `A lesson in ${tongueName(t)} with ${name}: verbs, the names of things, and a great deal of laughing at your accent (+${Math.round(got)}).`,
      );
      return null;
    }
    case "seek": {
      const o = officeById(s, arg ?? -1)!;
      if (o.holder >= 0 && o.holder !== life.c) {
        const old = s.chars[o.holder];
        if (old?.alive)
          remembers(g, life, g.char(old.id), "Took my office", -20, 4);
      }
      giveOffice(g, o, life.c, `by ${name}'s appointment`);
      remembers(g, life, c, "I gave them office", 3, 2);
      return null;
    }
    case "settle":
      addSettler(g, life, c);
      return null;
    case "pry":
      gainXp(g, life, "stealth", 5);
      if (pass) {
        const found = learnSecret(g, life, c);
        journal(
          g,
          life,
          found
            ? `You learn something: ${found}.`
            : `You turn over every stone, and ${name} is exactly what they seem. How dull.`,
          found ? "good" : undefined,
        );
      } else {
        remembers(g, life, c, "Pried into my affairs", -15, 3);
        journal(
          g,
          life,
          `${name} caught you going through ${c.female ? "her" : "his"} papers.`,
          "bad",
        );
      }
      return null;
    case "blackmail": {
      const sec = secretOn(life, cId)!;
      gainXp(g, life, "stealth", 5);
      if (pass) {
        const pay = hushMoney(s, c);
        earn(g, life, pay);
        sec.paid = s.day;
        remembers(g, life, c, "Blackmails me", -30, 6);
        journal(
          g,
          life,
          `${name} pays ${pay} coins without a word, and looks at you as if memorising your face.`,
          "good",
        );
      } else {
        remembers(g, life, c, "Tried to blackmail me", -40, 6);
        setTie(g, life, cId, "rival");
        if (g.rng.chance(0.4))
          scandalize(g, life, `Tried to blackmail ${name}`);
        journal(
          g,
          life,
          `${name} laughs in your face: "Tell them, then." It's your word against theirs, and they have friends.`,
          "bad",
        );
      }
      return null;
    }
  }
}

/** SOCIETY (r11): a conversation without a word in common. */
function signTalk(g: ConquestGame, c: Character): string {
  const name = charName(c);
  const theirs = tongueName(motherTongue(c.culture));
  const lines = [
    `You point, mime and draw in the dirt with a stick. ${name} nods, laughs, and answers at length in ${theirs}. Something has been agreed; you're not sure what.`,
    `"Weather," you say, pointing at the sky. ${name} says a word in ${theirs} that might mean "weather", or "sky", or "you fool". You both smile.`,
    `A long exchange of gestures about horses, or possibly marriage. You come away with three words of ${theirs} and a dried fish.`,
    `${name} speaks slowly and loudly in ${theirs}, as everyone does to foreigners. You catch a word here and there. It's a start.`,
  ];
  return lines[g.rng.int(0, lines.length - 1)];
}

/** A word with someone, flavoured by who they are and how they feel. */
function smallTalk(
  g: ConquestGame,
  life: Life,
  c: Character,
  first: boolean,
): string {
  const s = g.s;
  const name = charName(c);
  const op = opinionOf(s, c, life).total;
  const role = c.role ? ROLES[c.role].title.toLowerCase() : null;
  if (first) return `You get to know ${name}${role ? `, the ${role}` : ""}.`;
  const warm = [
    `${name} laughs at your story, and tells a better one.`,
    `You and ${name} put the world to rights for an hour.`,
    `${name} asks after your family, and remembers their names.`,
  ];
  const cool = [
    `${name} answers in as few words as will do.`,
    `${name} keeps glancing at the door.`,
  ];
  const trade: Partial<Record<string, string>> = {
    innkeeper: `${name} complains about the price of malt and the morals of the excise man.`,
    preacher: `${name} hopes to see you on Sunday, and says it like a threat.`,
    merchant: `${name} talks freight rates until your eyes water.`,
    sergeant: `${name} tells you about the war. Which war isn't clear.`,
    planter: `${name} talks tobacco, weather and debts, in that order.`,
    sachem: `${name} listens more than speaks, and remembers everything.`,
    healer: `${name} looks at your colour and gives you something bitter to chew.`,
  };
  const r = g.rng.next();
  if (c.role && trade[c.role] && r < 0.4) return trade[c.role]!;
  return op >= 10
    ? warm[Math.floor(r * warm.length)]
    : cool[Math.floor(r * cool.length)];
}

/** A wedding: the spouse leaves any post and moves in; a dowry, perhaps. */
export function wed(g: ConquestGame, life: Life, c: Character): string | null {
  const s = g.s;
  const me = meOf(s, life)!;
  spend(g, life, weddingCost(s, life));
  // A spouse who kept a post gives it up to move in.
  for (const [k, list] of Object.entries(s.locals)) {
    if (list.includes(c.id)) {
      s.locals[Number(k)] = list.filter((x) => x !== c.id);
      g.localsChanged(Number(k));
    }
  }
  const hand = handOf(s, c.id);
  if (hand) {
    touchLife(g, hand.life);
    hand.pr.hands = hand.pr.hands.filter((x) => x !== c.id);
  }
  const status = c.role
    ? ROLES[c.role].status
    : (() => {
        const parent = s.chars[c.father] ?? s.chars[c.mother];
        return parent?.role ? ROLES[parent.role].status : 1;
      })();
  c.role = undefined;
  const maiden = charName(c);
  marry(s, g.touchChar(me), c);
  c.home = life.home;
  setTie(g, life, c.id, null);
  remembers(g, life, c, "Our wedding day", 20, 0);
  const dowry = Math.max(0, status - 1) * 4;
  if (dowry) earn(g, life, dowry);
  life.tally.marriages++;
  addStress(g, life, -10);
  addRenown(g, life, 1);
  journal(
    g,
    life,
    `You married ${maiden}.${dowry ? ` Their family gave a dowry of ${dowry} coins.` : ""}`,
    "good",
  );
  milestone(g, life, "married", `Married ${maiden}`);
  void MARRY_OPINION;
  void PATRON_OPINION;
  return null;
}

/** Two met with pistols or swords: who wins, who's hurt, who's dead. */
export function duel(
  g: ConquestGame,
  life: Life,
  c: Character,
  challenged: boolean,
  pass?: boolean,
): string | null {
  const s = g.s;
  const me = meOf(s, life)!;
  const name = charName(c);
  const win =
    pass ??
    rollCheck(
      g,
      checkChance(skillLevel(s, life, "fighting"), charSkill(s, c, "fighting")),
    );
  gainXp(g, life, "fighting", 15);
  if (life.ties[c.id] !== "nemesis") life.ties[c.id] = "rival";
  outcomeMeta(g, life, { ok: win, scene: "duel" });
  const opener = challenged
    ? `${name} took it badly and called you out.`
    : `You called ${name} out.`;
  const other = lifeOfChar(s, c.id);
  if (win) {
    addRenown(g, life, 6);
    remembers(g, life, c, "Beat me in a duel", -30, 10);
    if (other) {
      journal(g, other, `${charName(me)} beat you in a duel.`, "bad");
      hurt(g, other, g.rng.int(10, 35), `a duel with ${charName(me)}`);
      journal(g, life, `${opener} You won.`, "good");
    } else if (g.rng.chance(0.25)) {
      kill(g, c, `a duel with ${charName(me)}`);
      journal(g, life, `${opener} At dawn, you killed ${name}.`, "bad");
      addStress(g, life, 15);
    } else {
      journal(
        g,
        life,
        `${opener} You wounded ${name}; honour is satisfied.`,
        "good",
      );
    }
    milestone(g, life, "renown", `Won a duel against ${name}`);
  } else {
    addRenown(g, life, 1);
    journal(g, life, `${opener} You lost.`, "bad");
    if (other) addRenown(g, other, 4);
    hurt(g, life, g.rng.int(15, 55), `a duel with ${name}`);
  }
  return null;
}

// ---------------------------------------------------------------- with other players

/** Put something to another player: they'll get it as a scene to answer. */
function propose(
  g: ConquestGame,
  life: Life,
  c: Character,
  act: PersonAct,
  arg: number | undefined,
  extra: { good?: Good; qty?: number },
): string | null {
  const s = g.s;
  const other = lifeOfChar(s, c.id)!;
  const me = meOf(s, life)!;
  const ctx: Record<string, number> = { c: me.id };
  if (act === "trade") {
    const good = GOODS.indexOf(extra.good as Good);
    const have = life.goods[extra.good as Good] ?? 0;
    const qty = Math.max(1, Math.min(have, Math.round(extra.qty ?? have)));
    ctx.good = good;
    ctx.qty = qty;
    ctx.price = Math.max(0, Math.round(arg ?? 0));
  }
  if (act === "hire") ctx.wage = 3;
  raiseLifeEvent(g, other, `p2p-${act}`, ctx);
  journal(
    g,
    life,
    `You put it to ${charName(c)}. It's for ${c.female ? "her" : "him"} to say.`,
  );
  outcomeMeta(g, life, { ok: null, kind: "proposal" });
  return null;
}

/** Another player answered: what it comes to on both sides. */
export function answerProposal(
  g: ConquestGame,
  life: Life,
  act: PersonAct,
  ctx: Record<string, number>,
  yesAnswer: boolean,
): void {
  const s = g.s;
  const asker = lifeOfChar(s, ctx.c);
  const me = meOf(s, life);
  const them = s.chars[ctx.c];
  if (!asker || !me || !them?.alive || asker.c < 0) return;
  const name = charName(them);
  const mine = charName(me);
  const reply = (ok: boolean) =>
    raiseLifeEvent(g, asker, "p2p-reply", {
      c: me.id,
      act: PERSON_ACTS.indexOf(act),
      yes: ok ? 1 : 0,
    });
  if (!yesAnswer) {
    journal(g, life, `You turned ${name} down.`);
    journal(g, asker, `${mine} turned you down.`, "bad");
    if (act === "duel") {
      addRenown(g, life, -4);
      addRenown(g, asker, 1);
      journal(
        g,
        life,
        "Refusing a challenge: some call it sense, most call it something else.",
        "bad",
      );
    }
    reply(false);
    return;
  }
  switch (act) {
    case "befriend":
      setTie(g, life, them.id, "friend");
      setTie(g, asker, me.id, "friend");
      remembers(g, life, them, "A true friend", 10, 0);
      remembers(g, asker, me, "A true friend", 10, 0);
      journal(g, life, `You and ${name} are friends.`, "good");
      journal(g, asker, `You and ${mine} are friends.`, "good");
      break;
    case "court": {
      remembers(g, life, them, "Courted me", 12, 2);
      remembers(g, asker, me, "Courted me", 12, 2);
      const both =
        opinionOf(s, them, life).total >= 50 &&
        opinionOf(s, me, asker).total >= 50;
      if (both) {
        setTie(g, life, them.id, "lover");
        setTie(g, asker, me.id, "lover");
        // SOCIETY (r11): lovers while married keep it secret.
        if (me.spouse >= 0 || them.spouse >= 0) {
          startAffair(g, life, them.id);
          startAffair(g, asker, me.id);
        }
      }
      journal(
        g,
        life,
        both ? `You and ${name} are sweethearts.` : `A walk out with ${name}.`,
        "good",
      );
      journal(
        g,
        asker,
        both ? `You and ${mine} are sweethearts.` : `A walk out with ${mine}.`,
        "good",
      );
      break;
    }
    case "propose": {
      if (me.spouse >= 0 || them.spouse >= 0) break;
      if (asker.purse < weddingCost(s, asker)) {
        journal(g, life, `${name} can't pay for the wedding just now.`);
        break;
      }
      spend(g, asker, weddingCost(s, asker));
      marry(s, g.touchChar(them), g.touchChar(me));
      setTie(g, life, them.id, null);
      setTie(g, asker, me.id, null);
      // The one who said yes moves into the asker's home.
      touchLife(g, life).home = asker.home;
      g.touchChar(me).home = asker.home;
      life.tally.marriages++;
      asker.tally.marriages++;
      addStress(g, life, -10);
      addStress(g, asker, -10);
      journal(
        g,
        life,
        `You married ${name}, and moved to ${g.map.provinces[asker.home]?.name}.`,
        "good",
      );
      journal(g, asker, `You married ${mine}.`, "good");
      milestone(g, life, "married", `Married ${name}`);
      milestone(g, asker, "married", `Married ${mine}`);
      break;
    }
    case "duel": {
      const a = skillLevel(s, asker, "fighting");
      const b = skillLevel(s, life, "fighting");
      const askerWins = g.rng.chance(checkChance(a, b));
      const [winner, loser] = askerWins ? [asker, life] : [life, asker];
      const wName = charName(meOf(s, winner));
      addRenown(g, winner, 6);
      addRenown(g, loser, 1);
      setTie(g, life, them.id, "rival");
      setTie(g, asker, me.id, "rival");
      journal(g, winner, `At dawn you met, and you won.`, "good");
      journal(g, loser, `At dawn you met ${wName}, and lost.`, "bad");
      hurt(g, loser, g.rng.int(10, 40), `a duel with ${wName}`);
      break;
    }
    case "recruit": {
      const m = movementOf(s, them.id);
      if (m) joinMovement(g, life, m.id);
      break;
    }
    // SOCIETY (r11)
    case "tryst":
      for (const [l, other] of [
        [life, them],
        [asker, me],
      ] as const) {
        addStress(g, l, -6);
        const a = affairWith(l, other.id);
        if (a) {
          a.met = s.day;
          exposeBy(g, l, a, 3);
        }
        journal(g, l, `A stolen hour with ${charName(other)}.`, "good");
      }
      break;
    case "hire": {
      const pr = (asker.property ?? []).find(
        (p) => p.kind === "business" && p.hands.length < 7,
      );
      if (!pr || life.job) break;
      touchLife(g, asker);
      pr.hands.push(me.id);
      life.job = {
        kind: pr.job ?? "craftsman",
        rank: Math.min(1, JOBS[pr.job ?? "craftsman"].ranks.length - 1),
        prov: pr.prov,
        place: pr.place ?? "workshop",
        employer: them.id,
        nation: me.nation,
        army: -1,
        since: s.day,
        months: 0,
        away: 0,
        worked: 0,
        awayDays: 0,
      };
      touchLife(g, life);
      journal(g, life, `You go to work for ${name} at the ${pr.name}.`, "good");
      journal(g, asker, `${mine} comes to work at your ${pr.name}.`, "good");
      break;
    }
    case "trade": {
      const good = GOODS[ctx.good];
      const qty = Math.min(ctx.qty, asker.goods[good] ?? 0);
      const price = ctx.price;
      if (!good || qty <= 0) break;
      if (life.purse < price) {
        journal(g, life, `You haven't the ${price} coins.`, "bad");
        reply(false);
        return;
      }
      if (carried(life) + qty > CARRY) {
        journal(g, life, `You can't carry another ${qty} loads.`, "bad");
        reply(false);
        return;
      }
      spend(g, life, price);
      earn(g, asker, price);
      touchLife(g, asker).goods[good] = (asker.goods[good] ?? 0) - qty;
      if (!asker.goods[good]) delete asker.goods[good];
      life.goods[good] = (life.goods[good] ?? 0) + qty;
      journal(
        g,
        life,
        `You bought ${qty} ${good} from ${name} for ${price} coins.`,
      );
      journal(
        g,
        asker,
        `You sold ${qty} ${good} to ${mine} for ${price} coins.`,
        "good",
      );
      break;
    }
  }
  reply(true);
}

/** Every interaction as a menu for one person, grouped, for the card. */
export function interactionMenu(
  s: GameState,
  w: World,
  life: Life,
  cId: number,
): {
  group: InteractionGroup;
  act: PersonAct;
  arg?: number;
  view: InteractionView;
}[] {
  const c = s.chars[cId];
  const out: {
    group: InteractionGroup;
    act: PersonAct;
    arg?: number;
    view: InteractionView;
  }[] = [];
  for (const act of PERSON_ACTS) {
    const def = INTERACTIONS[act];
    if (act === "work" && c) {
      const jobs = workOffered(c);
      jobs.forEach((_, i) =>
        out.push({
          group: def.group,
          act,
          arg: i,
          view: interactionView(s, w, life, cId, act, i),
        }),
      );
      continue;
    }
    if (act === "trade") continue;
    // SOCIETY (r11): one line per office in their gift.
    if (act === "seek") {
      if (c)
        for (const id of seekable(s, life, c))
          out.push({
            group: def.group,
            act,
            arg: id,
            view: interactionView(s, w, life, cId, act, id),
          });
      continue;
    }
    if (act === "settle" && !life.founding) continue;
    out.push({
      group: def.group,
      act,
      view: interactionView(s, w, life, cId, act),
    });
  }
  void npcSkill;
  void rankOf;
  return out;
}
