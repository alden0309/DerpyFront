// Letters to anyone, anywhere. Write to someone you've met or know of (a
// governor, a famous preacher, your cousin in Boston), and the letter goes by
// rider or with the next ship, taking as long as the road or the sea takes;
// ships founder, and letters with them. The reader decides (a loan, a
// venture, a hand in marriage, a place) and their answer comes back the same
// way, with their reasons. Other players write to you, and so do the people
// of the world: lovers, rivals, petitioners, hosts, blackmailers.

import { dateOf } from "./Calendar";
import { Explain } from "./Explain";
import { charterAcceptance, grantCharter } from "./Founding";
import type { ConquestGame } from "./Game";
import {
  answerInvite,
  gatheringById,
  inviteText,
  rsvpBreakdown,
  scheduleWedding,
} from "./Gatherings";
import { affairWith, exposeBy, startAffair } from "./Liaisons";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  journal,
  meet,
  remembers,
  setTie,
  spend,
  touchLife,
} from "./LifeCore";
import {
  Check,
  isChildLife,
  isNativeChar,
  lifeOfChar,
  meOf,
  no,
  opinionOf,
  peopleHere,
  skillLevel,
  travelRoute,
  weddingCost,
  yes,
} from "./LifeQueries";
import { ROLES } from "./LifeRules";
import { isHurricaneSeason, kmBetween, type World } from "./Map";
import {
  appointerOf,
  eligible,
  giveOffice,
  officeById,
  officeTitle,
  seekAcceptance,
} from "./Offices";
import { ageOf, charName, hasTrait } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { rumour } from "./Rumours";
import { dice } from "./SocietyCore";
import { motherTongue, sharedLevel, tongueName, tonguesOf } from "./Tongues";
import type {
  Breakdown,
  Character,
  GameState,
  Gathering,
  Letter,
  LetterKind,
  Life,
  MapDef,
} from "./Types";
import { SEATS } from "./Types";

export interface LetterKindDef {
  label: string;
  /** What it's for, on the writing desk. */
  text: string;
  /** Wants a yes or no. */
  ask: boolean;
  /** Takes an amount of coins (asked or staked or demanded). */
  coins?: number[];
}

export const LETTER_KINDS: Record<LetterKind, LetterKindDef> = {
  friendly: {
    label: "A friendly letter",
    text: "News, compliments and the weather. Keeps a friendship warm across the miles.",
    ask: false,
  },
  favour: {
    label: "Ask a favour (a loan)",
    text: "A loan, to be repaid with a fifth again within the year. Friends and family say yes more often.",
    ask: true,
    coins: [5, 10, 20, 40],
  },
  business: {
    label: "Propose a venture",
    text: "Each of you puts in the same stake on a cargo or a speculation; in some months it pays, or it doesn't. Merchants and planters listen.",
    ask: true,
    coins: [10, 20, 40],
  },
  love: {
    label: "A love letter",
    text: "For a sweetheart, a lover or a spouse far off. Letters can be found.",
    ask: true,
  },
  marriage: {
    label: "Propose marriage",
    text: "By letter: if they say yes, they come to you and the wedding is held at your home.",
    ask: true,
  },
  threat: {
    label: "A threat",
    text: "Demand money, or that they back off. The craven give in; the brave come after you.",
    ask: true,
    coins: [0, 5, 15, 30],
  },
  recommend: {
    label: "Recommend someone",
    text: "Put in a good word for someone you know: they'll be thought the better of.",
    ask: true,
  },
  petition: {
    label: "A petition",
    text: "To an official: an appointment, redress for your county, leave to found a settlement, or a pardon.",
    ask: true,
  },
  invite: {
    label: "An invitation",
    text: "To a gathering you're giving. They'll need time to get there.",
    ask: true,
  },
  introduce: {
    label: "Introduce yourself",
    text: "To someone you know only by name: after it, they know you, and your letters aren't a stranger's.",
    ask: false,
  },
  reply: { label: "A reply", text: "", ask: false },
  blackmail: { label: "A letter without a name", text: "", ask: true },
  news: { label: "News", text: "", ask: false },
};

/** What a player may write. */
export const WRITABLE: LetterKind[] = [
  "friendly",
  "introduce",
  "favour",
  "business",
  "love",
  "marriage",
  "recommend",
  "petition",
  "invite",
  "threat",
];

export const PETITIONS = [
  { label: "An appointment", text: "A local office in their gift." },
  {
    label: "Redress for your county",
    text: "Its grievances heard: unrest eased, your name made.",
  },
  {
    label: "Leave to found a settlement",
    text: "A charter for the settlement you're getting up.",
  },
  { label: "A pardon", text: "Your scandal forgiven, officially." },
] as const;

const MAX_POST = 80;
/** A rider is faster than a walker. */
const POST_PACE = 1.8;
/** Unanswered letters lapse after this long. */
export const ANSWER_DAYS = 60;

export function postOf(life: Life): Letter[] {
  return life.post ?? [];
}

// ---------------------------------------------------------------- who and where

/** Where someone is to be written to: their province. */
export function addressOf(s: GameState, c: Character): number {
  const life = lifeOfChar(s, c.id);
  if (life) return life.travel ? life.travel.dest : life.prov;
  const t = (s.travellers ?? []).find((x) => x.c === c.id);
  if (t) return t.depart >= 0 ? t.path[t.path.length - 1] : t.prov;
  if (c.home !== undefined) return c.home;
  const n = s.nations.find(
    (x) =>
      x.alive &&
      (x.ruler === c.id ||
        x.court.includes(c.id) ||
        SEATS.some((st) => x.council[st] === c.id)),
  );
  return n?.capital ?? s.nations[c.nation]?.capital ?? -1;
}

/** Everyone you could write to: people you've met, family, and the great of every colony. */
export function correspondents(s: GameState, life: Life): number[] {
  const me = meOf(s, life);
  if (!me) return [];
  const out = new Set<number>();
  const add = (id: number) => {
    const c = s.chars[id];
    if (c?.alive && !c.abroad && id !== me.id && ageOf(s, c) >= 14) out.add(id);
  };
  for (const id of Object.keys(life.ties)) add(Number(id));
  for (const id of [me.spouse, me.father, me.mother, ...me.children]) add(id);
  for (const pid of [me.father, me.mother])
    for (const k of s.chars[pid]?.children ?? []) add(k);
  for (const id of [...life.met].reverse()) add(id);
  // The people of the town you're in: you know of them.
  for (const c of peopleHere(s, life.prov, life)) add(c.id);
  for (const l of s.lives) if (l.c >= 0 && !l.watching) add(l.c);
  for (const n of s.nations) {
    if (!n.alive || (n.kind !== "power" && n.kind !== "native")) continue;
    add(n.ruler);
    for (const st of SEATS) add(n.council[st]);
  }
  for (const list of Object.values(s.society?.offices ?? {}))
    for (const o of list) if (o.nation === me.nation) add(o.holder);
  return [...out];
}

/** Have you met them, or do they know of you? */
export function acquainted(s: GameState, life: Life, c: Character): boolean {
  if (life.met.includes(c.id) || life.ties[c.id]) return true;
  const me = meOf(s, life);
  if (!me) return false;
  if ([me.spouse, me.father, me.mother, ...me.children].includes(c.id))
    return true;
  return c.memories.some((m) => m.of === me.id);
}

export interface PostView {
  days: number;
  cost: number;
  /** Sea passages on the way. */
  sea: number;
  /** Chance it's lost. */
  risk: number;
  from: number;
  to: number;
}

function seaRisk(
  s: GameState,
  map: MapDef,
  a: number,
  b: number,
  war: boolean,
): number {
  const month = dateOf(s.day).month;
  const hurricane = [a, b].some((p) =>
    isHurricaneSeason(map.provinces[p].lat, map.provinces[p].lon, month),
  );
  return 0.03 + (hurricane ? 0.05 : 0) + (war ? 0.04 : 0);
}

/** How a letter would go from one province to another: days, postage, risk. */
export function postRoute(
  s: GameState,
  map: MapDef,
  from: number,
  to: number,
  war = false,
): PostView | null {
  if (from < 0 || to < 0 || !map.provinces[from] || !map.provinces[to])
    return null;
  if (from === to) return { days: 1, cost: 0.2, sea: 0, risk: 0, from, to };
  const r = travelRoute(s, map, from, to, true, false, true, POST_PACE);
  if (!r) {
    // No road nor lane: a runner, the long way round.
    const km = kmBetween(map, from, to);
    return {
      days: Math.ceil(km / 35) + 7,
      cost: 1 + Math.round(km / 400),
      sea: 0,
      risk: 0.05,
      from,
      to,
    };
  }
  const sea = r.sea.filter(Boolean).length;
  let keep = 1;
  let at = from;
  r.path.forEach((q, i) => {
    if (r.sea[i]) keep *= 1 - seaRisk(s, map, at, q, war);
    at = q;
  });
  const landDays = r.legs.reduce((m, d, i) => m + (r.sea[i] ? 0 : d), 0);
  return {
    days: Math.max(1, Math.ceil(r.days + sea * 6)),
    cost: Math.round((0.5 + sea + landDays * 0.05) * 10) / 10,
    sea,
    risk: Math.round((1 - keep) * 1000) / 1000,
    from,
    to,
  };
}

// ---------------------------------------------------------------- the words

const sirOf = (c: Character | undefined) => (c?.female ? "Madam" : "Sir");

function salutation(s: GameState, c: Character, life: Life): string {
  const me = meOf(s, life);
  if (me && (me.spouse === c.id || life.ties[c.id] === "lover"))
    return `My dearest ${c.first}`;
  if (life.ties[c.id] === "friend") return `My dear ${c.first}`;
  if (me && (me.father === c.id || me.mother === c.id))
    return c.female ? "Honoured Mother" : "Honoured Father";
  const n = s.nations[c.nation];
  if (n?.ruler === c.id) return "May it please Your Excellency";
  return `${sirOf(c)}`;
}

/** The words of a letter a player writes. */
export function letterText(
  s: GameState,
  w: World,
  life: Life,
  c: Character,
  kind: LetterKind,
  arg = 0,
  about = -1,
): string {
  const me = meOf(s, life)!;
  const hi = salutation(s, c, life);
  const here = w.map.provinces[life.prov]?.name ?? "here";
  const other = s.chars[about];
  switch (kind) {
    case "friendly":
      return `${hi}, I write from ${here}, where all is well enough, the roads are mud and the parson is longer-winded than ever. I think of you often and hope this finds you in health.`;
    case "introduce":
      return about >= 0 && about !== me.id && other
        ? `${hi}, permit me to make known to you ${charName(other)}, a person of good character whom I am proud to call my acquaintance.`
        : `${hi}, though we have not met, your name is known to me, and I take the liberty of making mine known to you: ${charName(me)}, of ${here}, at your service.`;
    case "favour":
      return `${hi}, I find myself pressed, and must ask a kindness: the loan of ${arg} coins, which I would repay with a fifth again within the year.`;
    case "business":
      return `${hi}, I have a venture in mind: a cargo, well chosen, for the islands. Will you go halves with me, ${arg} coins apiece? My bill for my share is enclosed.`;
    case "love":
      return `${hi}, every day you are away is a week, and every week a winter. I have read your last a dozen times. Write to me, and tell me you think of me.`;
    case "marriage":
      return `${hi}, I will not waste words: I would have you for my ${c.female ? "wife" : "husband"}, if you will have me. Come to ${here}, and we will be married there.`;
    case "threat":
      return arg > 0
        ? `${hi}, you know what you have done, and so do I. ${arg} coins, sent by the bearer, and we need say no more about it. Otherwise I will say a great deal.`
        : `${hi}, keep out of my way. I say this once, and civilly.`;
    case "recommend":
      return `${hi}, I commend to you ${other ? charName(other) : "a friend"}, whom I have known some while and found honest, able and worth your notice.`;
    case "petition":
      return `${hi}, your humble petitioner ${charName(me)}, of ${here}, begs leave to lay before you ${["a request for an office in your gift", "the grievances of this county, long borne", "a plan for a new settlement, which wants only your leave", "a plea for your pardon"][Math.max(0, Math.min(3, arg))]}.`;
    case "invite":
      return `${hi}, it would give me the greatest pleasure if you would come to us, on the day written below.`;
    default:
      return "";
  }
}

// ---------------------------------------------------------------- what they'd say

function letterBase(
  s: GameState,
  map: MapDef,
  life: Life,
  c: Character,
  e: Explain,
  kind: LetterKind,
): void {
  const me = meOf(s, life)!;
  const op = opinionOf(s, c, life).total;
  e.add(`What ${c.first} thinks of you (${op})`, Math.round(op / 2));
  if (!acquainted(s, life, c) && kind !== "introduce")
    e.add("A letter from a stranger", -12);
  const hand = Math.floor(skillLevel(s, life, "letters") / 4);
  if (hand) e.add("Your way with words", hand);
  // Who can read it, and in what tongue.
  const mine = tonguesOf(s, map, me);
  const theirs = tonguesOf(s, map, c);
  const theirTongue = motherTongue(c.culture);
  if (isNativeChar(s, c)) {
    if ((mine[theirTongue] ?? 0) >= 2)
      e.add(`Your words in ${tongueName(theirTongue)}, carried by a runner`, 2);
    else e.add("Read out to them by an interpreter", -5);
  } else {
    const shared = sharedLevel(mine, theirs);
    if (shared.level >= 3 && shared.tongue !== motherTongue(me.culture))
      e.add(`Written in good ${tongueName(shared.tongue!)}`, 3);
    else if (shared.level < 2)
      e.add("In a tongue they can barely read", shared.level === 1 ? -10 : -20);
  }
}

/** What the reader would say to a letter, and why (null: nothing to decide). */
export function letterAcceptance(
  s: GameState,
  w: World,
  life: Life,
  c: Character,
  kind: LetterKind,
  arg = 0,
  about = -1,
): Breakdown | null {
  const me = meOf(s, life);
  if (!me) return null;
  const map = w.map;
  const e = new Explain();
  const tie = life.ties[c.id];
  const status = c.role ? ROLES[c.role].status : statusOf(s, c);
  switch (kind) {
    case "friendly":
    case "introduce":
      e.add("A civil letter is answered civilly", 10);
      letterBase(s, map, life, c, e, kind);
      return e.done(0);
    case "favour": {
      e.add("Lending is a risk", -10);
      letterBase(s, map, life, c, e, kind);
      const wealth = c.role ? ROLES[c.role].wealth : status * 10;
      if (wealth < arg) e.add("More than they have", -40);
      else
        e.add(
          "They can spare it",
          Math.min(10, Math.floor((wealth - arg) / 6)),
        );
      if (tie === "friend") e.add("A friend in need", 12);
      if (
        [me.father, me.mother, me.spouse].includes(c.id) ||
        (me.father >= 0 && c.father === me.father) ||
        (me.mother >= 0 && c.mother === me.mother)
      )
        e.add("Family", 20);
      if ((life.property ?? []).length) e.add("You own property", 6);
      if (life.debts.length) e.add("You owe others already", -15);
      if (hasTrait(c, "greedy")) e.add("Tight-fisted", -10);
      if (hasTrait(c, "generous")) e.add("Open-handed", 6);
      return e.done(0);
    }
    case "business": {
      e.add("Money is easier kept than made", -12);
      letterBase(s, map, life, c, e, kind);
      const trade = ["merchant", "planter", "captain", "trader", "innkeeper"];
      if (c.role && trade.includes(c.role)) e.add("A merchant's instinct", 12);
      else e.add("Not their line of business", -20);
      e.add(
        `Your trade (${skillLevel(s, life, "trade")})`,
        Math.round(skillLevel(s, life, "trade") / 2),
      );
      const wealth = c.role ? ROLES[c.role].wealth : status * 10;
      if (wealth < arg) e.add("More than they could stake", -30);
      if (hasTrait(c, "greedy")) e.add("Greedy for a return", 6);
      return e.done(0);
    }
    case "love": {
      e.add("A love letter is a bold thing", -5);
      letterBase(s, map, life, c, e, kind);
      if (me.spouse === c.id) e.add("Your husband or wife", 30);
      if (tie === "lover") e.add("Lovers", 25);
      if (c.spouse >= 0 && c.spouse !== me.id) e.add("Married to another", -15);
      if (c.female === me.female) e.add("Not in this century", -100);
      return e.done(0);
    }
    case "marriage": {
      e.add("Marriage by letter is a leap in the dark", -25);
      letterBase(s, map, life, c, e, kind);
      if (tie === "lover") e.add("Sweethearts", 18);
      const prospects = Math.min(
        15,
        (life.job?.rank ?? 0) * 3 + Math.floor(life.renown / 5),
      );
      if (prospects) e.add("Your prospects", prospects);
      if (status >= 4 && prospects < 6 && life.background !== "gentry")
        e.add("Beneath their family", -15);
      if ((life.property ?? []).some((p) => p.kind === "house"))
        e.add("A house of your own", 5);
      if (life.purse < 0) e.add("You're in debt", -10);
      return e.done(0);
    }
    case "threat": {
      e.add("Nobody likes to be threatened", -10);
      const fight = skillLevel(s, life, "fighting");
      e.add(`Your menace (fighting ${fight})`, Math.round(fight / 2));
      e.add(
        `Your name (renown ${Math.floor(life.renown)})`,
        Math.min(10, Math.floor(life.renown / 5)),
      );
      if (hasTrait(c, "brave")) e.add("Brave", -15);
      if (hasTrait(c, "craven")) e.add("Craven", 15);
      if (status >= 4) e.add("They have friends in high places", -12);
      if (tie === "rival" || tie === "nemesis")
        e.add("They hate you already", -8);
      if (arg > 0) {
        const wealth = c.role ? ROLES[c.role].wealth : status * 10;
        if (wealth < arg * 2) e.add("More than they could pay", -15);
      }
      return e.done(0);
    }
    case "recommend": {
      const other = s.chars[about];
      e.add("A recommendation is weighed", 0, true);
      letterBase(s, map, life, c, e, kind);
      e.add(
        `Your renown (${Math.floor(life.renown)})`,
        Math.min(12, Math.floor(life.renown / 4)),
      );
      if (other && hasTrait(other, "famous")) e.add("They've heard of them", 5);
      return e.done(0);
    }
    case "petition": {
      if (arg === 0) {
        const o = officeById(s, about);
        if (!o) return null;
        return seekAcceptance(s, life, o, c, true);
      }
      if (arg === 2) return charterAcceptance(s, w, life, c, true);
      e.add("Petitions are many and answers few", -10);
      letterBase(s, map, life, c, e, kind);
      if (arg === 1) {
        const pr = s.provinces[life.home];
        e.add(
          `Unrest in your county (${Math.round(pr?.unrest ?? 0)})`,
          Math.round((pr?.unrest ?? 0) / 5),
        );
        e.add(
          `Your renown (${Math.floor(life.renown)})`,
          Math.min(10, Math.floor(life.renown / 5)),
        );
      } else {
        e.add("Favour at home", Math.min(15, Math.round(life.favor / 3)));
        if (hasTrait(c, "just")) e.add("Just: forgiveness must be earned", -8);
        if (hasTrait(c, "generous")) e.add("Generous", 6);
      }
      return e.done(0);
    }
    case "invite": {
      const gat = gatheringById(s, arg);
      if (!gat) return null;
      return rsvpBreakdown(s, w, gat, c, life);
    }
    default:
      return null;
  }
}

function statusOf(s: GameState, c: Character): number {
  const n = s.nations[c.nation];
  if (n?.ruler === c.id) return 6;
  if (n && SEATS.some((st) => n.council[st] === c.id)) return 5;
  return 2;
}

/** Can you write this letter now. */
export function letterCheck(
  s: GameState,
  w: World,
  life: Life,
  to: number,
  kind: LetterKind,
  arg = 0,
  about = -1,
): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (!WRITABLE.includes(kind)) return no("You can't write that.");
  const c = s.chars[to];
  if (!c?.alive || c.abroad) return no("They're beyond the reach of letters.");
  if (c.id === me.id) return no("A letter to yourself?");
  if (life.travel) return no("Not from the road: write when you've stopped.");
  if (isChildLife(s, life) && kind !== "friendly" && kind !== "love")
    return no("Not until you're grown.");
  if (!correspondents(s, life).includes(to))
    return no("You don't know of them.");
  if (addressOf(s, c) < 0) return no("Nobody knows where they are.");
  if (
    postOf(life).some(
      (l) =>
        l.status === "transit" &&
        l.from === me.id &&
        l.to === to &&
        l.kind === kind,
    )
  )
    return no("A letter of yours is on its way to them already.");
  const left = (life.cooldowns[`letter:${kind}:${to}`] ?? 0) - s.day;
  if (left > 0) return no(`You wrote lately: again in ${left} days.`);
  const route = postRoute(s, w.map, life.prov, addressOf(s, c));
  if (!route) return no("No post goes there.");
  const def = LETTER_KINDS[kind];
  if (def.coins && !def.coins.includes(arg)) return no("Choose an amount.");
  switch (kind) {
    case "business":
      if (life.purse < arg + route.cost)
        return no(`Your stake (${arg}) and the postage.`);
      break;
    case "love":
      if (c.female === me.female) return no("Not in this century.");
      if (ageOf(s, c) < 16) return no("They're a child.");
      break;
    case "marriage":
      if (me.spouse >= 0) return no("You're married.");
      if (c.spouse >= 0) return no("They're married.");
      if (c.female === me.female) return no("Not in this century.");
      if (ageOf(s, c) < 16) return no("They're a child.");
      if (
        [me.father, me.mother].includes(c.id) ||
        (c.father >= 0 && c.father === me.father) ||
        (c.mother >= 0 && c.mother === me.mother)
      )
        return no("Too close kin.");
      if (life.purse < weddingCost(s, life))
        return no(`A wedding will cost ${weddingCost(s, life)} coins.`);
      if (
        (s.society?.gatherings ?? []).some(
          (x) =>
            x.kind === "wedding" &&
            x.status === "planned" &&
            x.about.includes(me.id),
        )
      )
        return no("You're promised already.");
      break;
    case "recommend":
    case "introduce": {
      if (kind === "recommend" && (about < 0 || about === me.id))
        return no("Choose someone to recommend.");
      if (about >= 0 && about !== me.id) {
        const a = s.chars[about];
        if (!a?.alive || !life.met.includes(about))
          return no("Only someone you know.");
        if (about === to) return no("To themselves?");
      }
      break;
    }
    case "petition": {
      if (arg === 0) {
        const o = officeById(s, about);
        if (!o) return no("Choose an office.");
        if (appointerOf(s, o) !== c.id) return no("It isn't in their gift.");
        const e = eligible(s, life, o);
        if (!e.ok) return e;
      } else if (arg === 1) {
        const n = s.nations[c.nation];
        if (n?.ruler !== c.id) return no("Petition the governor.");
      } else if (arg === 2) {
        if (!life.founding) return no("You're not getting up a settlement.");
        if (life.founding.charter === "granted")
          return no("You have your charter.");
        if (s.nations[me.nation]?.ruler !== c.id)
          return no("Only the governor can grant it.");
      } else if (arg === 3) {
        if (!life.scandal || life.scandal.until <= s.day)
          return no("You've nothing to be pardoned for.");
        if (s.nations[me.nation]?.ruler !== c.id)
          return no("Only the governor pardons.");
      } else return no("What do you ask?");
      break;
    }
    case "invite": {
      const gat = gatheringById(s, arg);
      if (!gat || gat.host !== me.id || gat.status !== "planned")
        return no("Choose a gathering of yours.");
      if (gat.invited.includes(to)) return no("They're invited already.");
      break;
    }
  }
  if (life.purse < route.cost) return no(`Postage: ${route.cost} coins.`);
  return yes;
}

// ---------------------------------------------------------------- sending

function pushPost(g: ConquestGame, life: Life, l: Letter): void {
  touchLife(g, life);
  life.post ??= [];
  life.post.push(l);
  if (life.post.length > MAX_POST) {
    // Old letters, read and answered, go in the fire first.
    const keep = life.post.filter(
      (x) => x.status === "transit" || (x.ask && !x.done && x.to === life.c),
    );
    const old = life.post.filter((x) => !keep.includes(x));
    life.post = [
      ...old.slice(old.length - Math.max(0, MAX_POST - keep.length)),
      ...keep,
    ].sort((a, b) => a.sent - b.sent || a.id - b.id);
  }
}

/** A player writes a letter. */
export function writeLetter(
  g: ConquestGame,
  life: Life,
  to: number,
  kind: LetterKind,
  arg = 0,
  about = -1,
): string | null {
  const s = g.s;
  const check = letterCheck(s, g.w, life, to, kind, arg, about);
  if (!check.ok) return check.why;
  const me = meOf(s, life)!;
  const c = s.chars[to];
  const dest = addressOf(s, c);
  const war = s.wars.some((x) => x.a === me.nation || x.b === me.nation);
  const route = postRoute(s, g.map, life.prov, dest, war)!;
  spend(g, life, route.cost);
  if (kind === "business") spend(g, life, arg);
  const r = dice(g);
  let days = route.days;
  for (let i = 0; i < route.sea; i++) days += r.int(-3, 6);
  const letter: Letter = {
    id: g.nextId(),
    kind,
    from: me.id,
    to,
    origin: life.prov,
    dest,
    sent: s.day,
    arrive: s.day + Math.max(1, days),
    bySea: route.sea > 0,
    status: "transit",
    text: letterText(s, g.w, life, c, kind, arg, about),
    ...(arg ? { arg } : {}),
    ...(about >= 0 ? { about } : {}),
    ask: LETTER_KINDS[kind].ask,
  };
  pushPost(g, life, letter);
  touchLife(g, life).cooldowns[`letter:${kind}:${to}`] =
    s.day + (kind === "friendly" || kind === "love" ? 14 : 45);
  gainXp(g, life, "letters", 3);
  meet(g, life, to);
  // Love letters can be found.
  const a = affairWith(life, to);
  if (a && kind === "love") exposeBy(g, life, a, 5);
  if (kind === "invite") {
    const gat = gatheringById(s, arg);
    if (gat) {
      gat.invited.push(to);
      g.societyChanged("g");
    }
  }
  journal(
    g,
    life,
    `You write to ${charName(c)} at ${g.map.provinces[dest]?.name ?? "somewhere"}: ${LETTER_KINDS[kind].label.toLowerCase()}. It should arrive in about ${route.days} days${route.sea ? ", by ship" : ""}.`,
  );
  return null;
}

/** An invitation to a gathering, sent by post to someone far off. */
export function sendInvitation(
  g: ConquestGame,
  life: Life,
  gat: Gathering,
  c: Character,
): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return;
  const dest = addressOf(s, c);
  const route = postRoute(s, g.map, life.prov, dest);
  pushPost(g, life, {
    id: g.nextId(),
    kind: "invite",
    from: me.id,
    to: c.id,
    origin: life.prov,
    dest,
    sent: s.day,
    arrive: s.day + (route?.days ?? 10),
    bySea: (route?.sea ?? 0) > 0,
    status: "transit",
    text: inviteText(g, gat),
    arg: gat.id,
    ask: true,
  });
}

/** Someone of the world writes to a player. */
export function npcWrite(
  g: ConquestGame,
  life: Life,
  from: Character,
  kind: LetterKind,
  text: string,
  o: {
    arg?: number;
    about?: number;
    ask?: boolean;
    re?: number;
    answer?: Letter["answer"];
    delay?: number;
  } = {},
): Letter | null {
  const s = g.s;
  if (life.c < 0) return null;
  const origin = addressOf(s, from);
  const dest = life.travel ? life.travel.dest : life.prov;
  const route = postRoute(s, g.map, origin, dest);
  const days = (route?.days ?? 10) + (o.delay ?? 0);
  const letter: Letter = {
    id: g.nextId(),
    kind,
    from: from.id,
    to: life.c,
    origin,
    dest,
    sent: s.day,
    arrive: s.day + Math.max(1, days),
    bySea: (route?.sea ?? 0) > 0,
    status: "transit",
    text,
    ...(o.arg !== undefined ? { arg: o.arg } : {}),
    ...(o.about !== undefined ? { about: o.about } : {}),
    ...(o.re !== undefined ? { re: o.re } : {}),
    ...(o.answer ? { answer: o.answer } : {}),
    ask: o.ask ?? false,
  };
  pushPost(g, life, letter);
  return letter;
}

// ---------------------------------------------------------------- arriving

/** Each day: letters arrive (or don't). */
export function postDaily(g: ConquestGame): void {
  const s = g.s;
  for (const life of s.lives) {
    if (!life.post?.length) continue;
    for (const l of [...life.post]) {
      if (l.status !== "transit" || l.arrive > s.day) continue;
      // Outgoing: it reaches its reader. Incoming: it reaches you.
      if (l.from === life.c && l.to !== life.c) arriveAt(g, life, l);
      else if (l.to === life.c) receive(g, life, l);
      else {
        // Written by a character this seat no longer plays: it goes astray.
        l.status = "lost";
        touchLife(g, life);
      }
    }
    // Unanswered letters lapse.
    for (const l of life.post) {
      if (l.to !== life.c || !l.ask || l.done || l.status !== "delivered")
        continue;
      if (s.day - l.arrive >= ANSWER_DAYS) lapse(g, life, l);
    }
  }
}

function lost(g: ConquestGame, life: Life, l: Letter): boolean {
  if (!l.bySea) return false;
  const s = g.s;
  const risk = seaRisk(s, g.map, l.origin, l.dest, false);
  if (!dice(g).chance(risk)) return false;
  l.status = "lost";
  touchLife(g, life);
  const reader = s.chars[l.to];
  if (l.from === life.c) {
    journal(
      g,
      life,
      `The ship carrying your letter to ${charName(reader)} never made port. They'll not hear from you.`,
      "bad",
    );
    if (l.kind === "business" && l.arg) {
      // The bill of exchange went down too; the banker makes it good, less his fee.
      earn(g, life, Math.round(l.arg * 0.8));
    }
  }
  return true;
}

/** A player's letter reaches its reader: a player gets it to answer; anyone else decides. */
function arriveAt(g: ConquestGame, life: Life, l: Letter): void {
  const s = g.s;
  touchLife(g, life);
  if (lost(g, life, l)) return;
  const reader = s.chars[l.to];
  if (!reader?.alive || reader.abroad) {
    l.status = "lost";
    journal(
      g,
      life,
      `Your letter to ${charName(reader)} came back unopened: they're gone.`,
      "bad",
    );
    if (l.kind === "business" && l.arg) earn(g, life, l.arg);
    return;
  }
  // A player who moved on: it follows them.
  const other = lifeOfChar(s, l.to);
  if (other) {
    const now = other.travel ? other.travel.dest : other.prov;
    if (now !== l.dest && !(l as Letter & { fwd?: boolean }).fwd) {
      const route = postRoute(s, g.map, l.dest, now);
      l.dest = now;
      (l as Letter & { fwd?: boolean }).fwd = true;
      l.arrive = s.day + (route?.days ?? 5);
      return;
    }
  }
  l.status = "delivered";
  if (other) {
    pushPost(g, other, { ...l, read: false, done: !l.ask });
    journal(
      g,
      other,
      `A letter from ${charName(s.chars[l.from])}: ${LETTER_KINDS[l.kind].label.toLowerCase()}.`,
    );
    if (l.kind === "introduce") introduce(g, life, l, other);
    if (l.kind === "recommend") recommend(g, life, l);
    if (l.kind === "friendly")
      remembers(g, life, g.char(reader.id), "A kind letter", 4, 2);
    return;
  }
  decide(g, life, l, reader);
}

/** Someone not played reads a player's letter and answers it. */
function decide(g: ConquestGame, life: Life, l: Letter, c: Character): void {
  const s = g.s;
  const gatAsked =
    l.kind === "invite" ? gatheringById(s, l.arg ?? -1) : undefined;
  const b = (gatAsked
    ? rsvpBreakdown(s, g.w, gatAsked, c, life, true)
    : letterAcceptance(s, g.w, life, c, l.kind, l.arg ?? 0, l.about ?? -1)) ?? {
    total: 1,
    parts: [],
  };
  const yesA = b.total > 0;
  const me = meOf(s, life)!;
  let text = "";
  let coins = 0;
  const name = c.first;
  switch (l.kind) {
    case "friendly":
      remembers(g, life, g.char(c.id), "A kind letter", 4, 2);
      text = pick(g, [
        `Your letter was a great comfort. All here is much as you left it: the harvest middling, the neighbours worse.`,
        `I laughed at your account of the parson. Write again soon: there is little enough else to laugh at here.`,
        `Thank you for your letter. I keep it by me. Do not wait so long before the next.`,
      ]);
      break;
    case "introduce":
      if (yesA) {
        remembers(g, life, g.char(c.id), "Introduced by letter", 5, 3);
        meet(g, life, c.id);
        if (l.about !== undefined && l.about !== me.id)
          introduceTo(g, life, l.about, c);
        text = `I am obliged for your letter, and glad to know of you. Should you come this way, my door is open.`;
      } else
        text = `I have your letter. I do not know you, and I see no reason to.`;
      break;
    case "favour":
      if (yesA) {
        coins = l.arg ?? 0;
        text = `Enclosed is a bill for ${coins} coins. Repay it when you can, and within the year.`;
      } else
        text = `I cannot oblige you, and I am sorry for it: ${objection(b)}.`;
      remembers(
        g,
        life,
        g.char(c.id),
        yesA ? "Lent them money" : "Asked me for money",
        yesA ? 0 : -3,
        1,
      );
      break;
    case "business":
      if (yesA) {
        text = `Agreed: my half is staked with yours. We shall see what the sea makes of it.`;
        venture(g, life, c, l.arg ?? 10);
      } else {
        coins = l.arg ?? 0;
        text = `I return your bill: ${objection(b)}. Find another partner.`;
      }
      break;
    case "love":
      remembers(
        g,
        life,
        g.char(c.id),
        yesA ? "A love letter" : "Unwanted letters",
        yesA ? 10 : -8,
        2,
      );
      text = yesA
        ? `Your letter is under my pillow. Come soon, or write again, or both.`
        : `I must ask you not to write to me in that way again.`;
      break;
    case "marriage":
      text = yesA
        ? `Yes. I will come to you as soon as I can be ready. Have the banns read.`
        : `You do me an honour I cannot accept: ${objection(b)}.`;
      remembers(
        g,
        life,
        g.char(c.id),
        yesA ? "Promised to them" : "Asked for my hand by letter",
        yesA ? 15 : -2,
        2,
      );
      break;
    case "threat":
      if (yesA) {
        const wealth = c.role ? ROLES[c.role].wealth : 20;
        coins = Math.min(l.arg ?? 0, Math.floor(wealth / 2));
        remembers(g, life, g.char(c.id), "Threatened me", -25, 5);
        text = coins
          ? `Here is your money. Damn you for it.`
          : `Very well. I will keep out of your way.`;
        dropBlackmail(g, life, c.id);
      } else {
        remembers(g, life, g.char(c.id), "Threatened me", -35, 6);
        text = `Do your worst. I have shown your letter to the constable.`;
      }
      break;
    case "recommend":
      if (yesA) recommend(g, life, l);
      text = yesA
        ? `I shall bear your friend in mind. Your word counts with me.`
        : `I have your recommendation. I make my own judgements.`;
      break;
    case "petition":
      text = petitionAnswer(g, life, l, c, yesA, b);
      break;
    case "invite": {
      const gat = gatheringById(s, l.arg ?? -1);
      if (gat) answerInvite(g, gat, c.id, yesA, objection(b, yesA));
      text = yesA
        ? `We shall be very glad to come.`
        : `We must send our regrets: ${objection(b)}.`;
      break;
    }
  }
  l.status = "delivered";
  touchLife(g, life);
  const back = npcWrite(
    g,
    life,
    c,
    "reply",
    `${salutationBack(s, c, life)}, ${text} ${signOff(c)}`,
    {
      re: l.id,
      arg: coins,
      answer: {
        yes: yesA,
        why: b,
        text: `${name} ${yesA ? "says yes" : "says no"}`,
        day: s.day,
      },
    },
  );
  if (back) back.answer!.day = back.arrive;
}

function salutationBack(s: GameState, c: Character, life: Life): string {
  const me = meOf(s, life)!;
  if (me.spouse === c.id || life.ties[c.id] === "lover")
    return `My own ${me.first}`;
  if (life.ties[c.id] === "friend") return `Dear ${me.first}`;
  return me.female ? "Madam" : "Sir";
}

function signOff(c: Character): string {
  return `Your servant, ${charName(c)}.`;
}

function pick(g: ConquestGame, lines: string[]): string {
  return lines[dice(g).int(0, lines.length - 1)];
}

/** The biggest reason, in words. */
function objection(b: Breakdown, forIt = false): string {
  const parts = [...b.parts].filter(
    (p) => !p.mul && (forIt ? p.value > 0 : p.value < 0),
  );
  parts.sort((a, x) => (forIt ? x.value - a.value : a.value - x.value));
  const w = parts[0];
  return w
    ? w.label.replace(/ \(.*\)$/, "").toLowerCase()
    : forIt
      ? "they're glad to"
      : "they'd rather not";
}

function introduce(g: ConquestGame, life: Life, l: Letter, reader: Life): void {
  const s = g.s;
  if (l.about !== undefined && l.about !== life.c)
    introduceTo(g, life, l.about, s.chars[reader.c]);
  else meet(g, reader, life.c);
}

function introduceTo(
  g: ConquestGame,
  life: Life,
  about: number,
  to: Character,
): void {
  const s = g.s;
  const a = s.chars[about];
  if (!a) return;
  g.char(to.id).memories.push({
    of: about,
    why: `Introduced by ${charName(meOf(s, life))}`,
    value: 6,
    until: s.day + 3 * DAYS_PER_YEAR,
  });
  const al = lifeOfChar(s, about);
  if (al) {
    meet(g, al, to.id);
    journal(
      g,
      al,
      `${charName(meOf(s, life))} has introduced you to ${charName(to)} by letter.`,
      "good",
    );
  }
}

function recommend(g: ConquestGame, life: Life, l: Letter): void {
  const s = g.s;
  const a = s.chars[l.about ?? -1];
  const to = s.chars[l.to];
  if (!a || !to) return;
  const v = 6 + Math.min(10, Math.floor(life.renown / 8));
  const ch = g.char(to.id);
  ch.memories = ch.memories.filter(
    (m) => !(m.of === a.id && m.why.startsWith("Recommended by")),
  );
  ch.memories.push({
    of: a.id,
    why: `Recommended by ${charName(meOf(s, life))}`,
    value: v,
    until: s.day + 3 * DAYS_PER_YEAR,
  });
  const al = lifeOfChar(s, a.id);
  if (al)
    journal(
      g,
      al,
      `${charName(meOf(s, life))} has recommended you to ${charName(to)}.`,
      "good",
    );
}

function petitionAnswer(
  g: ConquestGame,
  life: Life,
  l: Letter,
  c: Character,
  yesA: boolean,
  b: Breakdown,
): string {
  const s = g.s;
  const arg = l.arg ?? 0;
  if (!yesA)
    return `Your petition is received and will be considered. (It will not: ${objection(b)}.)`;
  if (arg === 0) {
    const o = officeById(s, l.about ?? -1);
    if (o && appointerOf(s, o) === c.id && eligible(s, life, o).ok) {
      if (o.holder >= 0 && !lifeOfChar(s, o.holder)) o.holder = -1;
      if (o.holder < 0) {
        giveOffice(
          g,
          o,
          life.c,
          `by ${charName(c)}'s commission, sent by letter`,
        );
        return `Your commission as ${officeTitle(s, g.w, o)} is enclosed. Do the office credit.`;
      }
    }
    return `I would gladly have obliged, but the place is filled.`;
  }
  if (arg === 1) {
    const pr = g.prov(life.home);
    pr.mods.push({
      key: `redress-${s.day}`,
      label: "Grievances heard",
      until: s.day + DAYS_PER_YEAR,
      fx: { unrest: -5 },
    });
    addRenown(g, life, 3);
    return `Your county's grievances are heard, and some of them will even be remedied.`;
  }
  if (arg === 2) {
    grantCharter(g, life, c);
    return `Leave is granted: plant your settlement, and may it prosper under the crown.`;
  }
  if (arg === 3) {
    touchLife(g, life).scandal = null;
    addRenown(g, life, 1);
    return `You are pardoned. Do not make me regret it.`;
  }
  return "";
}

/** A venture's outcome: a letter from your partner in some months' time. */
function venture(
  g: ConquestGame,
  life: Life,
  c: Character,
  stake: number,
): void {
  const r = dice(g);
  const roll = r.next() + skillLevel(g.s, life, "trade") * 0.01;
  const mult =
    roll < 0.15
      ? 0
      : roll < 0.4
        ? 0.8
        : roll < 0.75
          ? 1.3
          : roll < 0.95
            ? 1.8
            : 2.6;
  const back = Math.round(stake * mult);
  const text =
    mult === 0
      ? `I have the worst of news: the ship went down off Hatteras with everything in her. We are both the poorer.`
      : mult < 1
        ? `The cargo sold, but badly: the market was glutted. Your share is enclosed, ${back} coins.`
        : mult < 2
          ? `The venture answered well. Your share is enclosed: ${back} coins.`
          : `A triumph! The cargo fetched three prices. Your share, ${back} coins, is enclosed, and I drink your health.`;
  npcWrite(
    g,
    life,
    c,
    "business",
    `${salutationBack(g.s, c, life)}, ${text} ${signOff(c)}`,
    { arg: back, delay: r.int(120, 240) },
  );
}

/** A letter reaches a player: news, a question, an answer. */
function receive(g: ConquestGame, life: Life, l: Letter): void {
  const s = g.s;
  touchLife(g, life);
  if (lost(g, life, l)) return;
  l.status = "delivered";
  l.read = false;
  const from = s.chars[l.from];
  const name = charName(from);
  if (l.kind === "reply") {
    const orig = postOf(life).find((x) => x.id === l.re);
    if (orig && l.answer) orig.answer = l.answer;
    if (l.arg) earn(g, life, l.arg);
    l.done = true;
    const yesA = !!l.answer?.yes;
    journal(
      g,
      life,
      `${name} has answered your letter: ${yesA ? "yes" : "no"}.${l.arg ? ` ${l.arg} coins enclosed.` : ""}`,
      yesA ? "good" : "bad",
    );
    if (orig) replied(g, life, orig, l, from);
    return;
  }
  if (!l.ask) l.done = true;
  if (l.kind === "business" && l.arg !== undefined && !l.ask) {
    earn(g, life, l.arg);
    journal(
      g,
      life,
      `A letter from ${name} about your venture: ${l.arg ? `${l.arg} coins` : "nothing but bad news"}.`,
      l.arg ? "good" : "bad",
    );
    return;
  }
  if (l.kind === "friendly" && l.arg) earn(g, life, l.arg);
  journal(
    g,
    life,
    `A letter from ${name}${l.ask ? ": it wants an answer" : ""}.`,
  );
}

/** The writer's side of an answer, when it reaches them. */
function replied(
  g: ConquestGame,
  life: Life,
  orig: Letter,
  reply: Letter,
  from: Character | undefined,
): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me || !from) return;
  const yesA = !!reply.answer?.yes;
  switch (orig.kind) {
    case "favour":
      if (yesA)
        life.debts.push({
          to: from.id,
          amount: Math.round((orig.arg ?? 0) * 1.2),
          due: s.day + DAYS_PER_YEAR,
        });
      break;
    case "love":
      if (
        yesA &&
        !life.ties[from.id] &&
        opinionOf(s, from, life).total >= 40 &&
        me.spouse !== from.id
      ) {
        setTie(g, life, from.id, "lover");
        if (me.spouse >= 0 || from.spouse >= 0) startAffair(g, life, from.id);
        journal(
          g,
          life,
          `You and ${from.first} are lovers now, by letter at least.`,
          "good",
        );
      }
      break;
    case "marriage":
      if (yesA && me.spouse < 0 && from.spouse < 0) {
        const err = scheduleWedding(g, life, from);
        if (err) journal(g, life, err, "bad");
      } else if (!yesA) addStress(g, life, 4);
      break;
    case "business":
      // Another player went halves: your share comes from them in time.
      if (yesA && lifeOfChar(s, from.id))
        venture(g, life, from, orig.arg ?? 10);
      else if (!yesA && lifeOfChar(s, from.id)) earn(g, life, orig.arg ?? 0);
      break;
    case "threat":
      if (!yesA) {
        setTie(
          g,
          life,
          from.id,
          life.ties[from.id] === "nemesis" ? "nemesis" : "rival",
        );
        if (dice(g).chance(0.35)) {
          addRenown(g, life, -3);
          rumour(
            g,
            life.prov,
            `${charName(me)} has been sending threatening letters.`,
            me.id,
            "bad",
          );
        }
      } else addRenown(g, life, 1);
      break;
  }
}

/** A blackmailer who gives way is a blackmailer no more. */
function dropBlackmail(g: ConquestGame, life: Life, c: number): void {
  for (const a of life.affairs ?? [])
    if (a.blackmailer === c) {
      a.blackmailer = -1;
      touchLife(g, life);
    }
}

/** A player answers a letter that wants one. */
export function answerLetter(
  g: ConquestGame,
  life: Life,
  id: number,
  yesA: boolean,
): string | null {
  const s = g.s;
  const l = postOf(life).find((x) => x.id === id);
  if (!l || l.to !== life.c) return "No such letter.";
  if (l.status !== "delivered") return "It hasn't come yet.";
  if (!l.ask || l.done) return "It's answered.";
  const me = meOf(s, life)!;
  const from = s.chars[l.from];
  const other = lifeOfChar(s, l.from);
  touchLife(g, life);
  const fx: string[] = [];
  // What answering costs or gives you now.
  switch (l.kind) {
    case "favour":
      if (yesA && life.purse < (l.arg ?? 0))
        return `You haven't ${l.arg} coins.`;
      if (yesA) {
        spend(g, life, l.arg ?? 0);
        fx.push(`−${l.arg} coins`);
      }
      break;
    case "business":
      if (yesA && life.purse < (l.arg ?? 0))
        return `Your stake is ${l.arg} coins.`;
      if (yesA) spend(g, life, l.arg ?? 0);
      break;
    case "threat":
    case "blackmail":
      if (yesA && life.purse < (l.arg ?? 0))
        return `You haven't ${l.arg} coins.`;
      if (yesA && l.arg) spend(g, life, l.arg);
      break;
    case "marriage":
      if (yesA && (me.spouse >= 0 || (from?.spouse ?? -1) >= 0))
        return "One of you is married.";
      break;
    case "invite": {
      const gat = gatheringById(s, l.arg ?? -1);
      if (gat)
        answerInvite(
          g,
          gat,
          me.id,
          yesA,
          yesA ? "glad to come" : "sends regrets",
        );
      break;
    }
  }
  l.done = true;
  l.read = true;
  l.answer = {
    yes: yesA,
    why: { total: yesA ? 1 : -1, parts: [] },
    text: yesA ? "You said yes" : "You said no",
    day: s.day,
  };
  void fx;
  if (other) {
    // Back to the player who wrote, with your answer.
    const back: Letter = {
      id: g.nextId(),
      kind: "reply",
      from: me.id,
      to: l.from,
      origin: life.prov,
      dest: other.travel ? other.travel.dest : other.prov,
      sent: s.day,
      arrive: s.day + (postRoute(s, g.map, life.prov, other.prov)?.days ?? 5),
      bySea: (postRoute(s, g.map, life.prov, other.prov)?.sea ?? 0) > 0,
      status: "transit",
      text: yesA ? "Yes." : "No.",
      re: l.id,
      arg:
        l.kind === "favour" || l.kind === "threat"
          ? yesA
            ? (l.arg ?? 0)
            : 0
          : 0,
      answer: {
        yes: yesA,
        why: {
          total: yesA ? 1 : -1,
          parts: [{ label: `${charName(me)} decided`, value: yesA ? 1 : -1 }],
        },
        text: `${me.first} ${yesA ? "says yes" : "says no"}`,
        day: s.day,
      },
    };
    pushPost(g, other, back);
    p2pAnswered(g, life, other, l, yesA);
    return null;
  }
  if (from) npcAnswered(g, life, l, from, yesA);
  return null;
}

/** Your side and theirs, when you answer another player. */
function p2pAnswered(
  g: ConquestGame,
  life: Life,
  writer: Life,
  l: Letter,
  yesA: boolean,
): void {
  const s = g.s;
  const me = meOf(s, life)!;
  const them = meOf(s, writer);
  if (!them) return;
  switch (l.kind) {
    case "love":
      if (yesA && life.ties[them.id] !== "lover" && me.spouse !== them.id) {
        setTie(g, life, them.id, "lover");
        if (me.spouse >= 0 || them.spouse >= 0) startAffair(g, life, them.id);
      }
      break;
    case "marriage":
      if (yesA)
        journal(
          g,
          life,
          `You've promised to marry ${charName(them)}. Go to ${g.map.provinces[writer.home]?.name}: the wedding is there.`,
          "good",
        );
      break;
    case "business":
      if (yesA) {
        // The venture's fortune, for each partner.
        venture(g, life, them, l.arg ?? 10);
      }
      break;
    case "threat":
      if (!yesA) setTie(g, life, them.id, "rival");
      break;
  }
}

/** Your answer to someone of the world. */
function npcAnswered(
  g: ConquestGame,
  life: Life,
  l: Letter,
  c: Character,
  yesA: boolean,
): void {
  const s = g.s;
  const r = dice(g);
  switch (l.kind) {
    case "love": {
      remembers(
        g,
        life,
        g.char(c.id),
        yesA ? "Wrote back" : "Burned my letters",
        yesA ? 8 : -10,
        2,
      );
      const a = affairWith(life, c.id);
      if (a && yesA) exposeBy(g, life, a, 4);
      break;
    }
    case "favour":
      remembers(
        g,
        life,
        g.char(c.id),
        yesA ? "Lent me money in need" : "Wouldn't help me",
        yesA ? 20 : -8,
        4,
      );
      if (yesA && !hasTrait(c, "deceitful") && r.chance(0.8)) {
        const back = Math.round((l.arg ?? 0) * 1.15);
        npcWrite(
          g,
          life,
          c,
          "friendly",
          `${salutationBack(s, c, life)}, with my thanks, and a little over for your kindness, I return what you lent me: ${back} coins. ${signOff(c)}`,
          { arg: back, delay: r.int(150, 330) },
        );
      }
      break;
    case "business":
      if (yesA) venture(g, life, c, l.arg ?? 10);
      break;
    case "threat":
      if (yesA) {
        remembers(g, life, g.char(c.id), "Gave in to me", 5, 2);
        addRenown(g, life, -1);
      } else {
        remembers(g, life, g.char(c.id), "Defied me", -15, 3);
        if (r.chance(0.4)) {
          addRenown(g, life, -2);
          rumour(
            g,
            life.prov,
            `${charName(c)} is telling everyone what they know of ${charName(meOf(s, life))}.`,
            life.c,
            "bad",
          );
          journal(
            g,
            life,
            `${charName(c)} made good on the threat: the talk is all over town.`,
            "bad",
          );
        }
      }
      break;
    case "petition":
      remembers(
        g,
        life,
        g.char(c.id),
        yesA ? "Granted my petition" : "Refused my petition",
        yesA ? 12 : -10,
        3,
      );
      if (yesA) {
        addRenown(g, life, 1);
        gainXp(g, life, "letters", 4);
      }
      break;
    case "news":
      // An office offered.
      if (yesA && l.arg !== undefined) {
        const o = officeById(s, l.arg);
        if (o && o.holder < 0 && eligible(s, life, o).ok)
          giveOffice(g, o, life.c, `on ${charName(c)}'s commission`);
        else journal(g, life, "Too late: the place has been filled.", "bad");
      }
      break;
    case "blackmail": {
      const a = (life.affairs ?? []).find((x) => x.blackmailer === c.id);
      if (yesA) {
        remembers(g, life, g.char(c.id), "Paid for my silence", 0, 1);
        if (a) touchLife(g, life).cooldowns[`hush:${a.c}`] = s.day + 200;
      } else if (a) exposeBy(g, life, a, 100, "town");
      break;
    }
  }
}

function lapse(g: ConquestGame, life: Life, l: Letter): void {
  const s = g.s;
  l.done = true;
  touchLife(g, life);
  const c = s.chars[l.from];
  if (l.kind === "invite") {
    const gat = gatheringById(s, l.arg ?? -1);
    if (gat) answerInvite(g, gat, life.c, false, "never answered");
  }
  if (l.kind === "blackmail") {
    const a = (life.affairs ?? []).find((x) => x.blackmailer === l.from);
    if (a) exposeBy(g, life, a, 100, "town");
    return;
  }
  const other = c ? lifeOfChar(s, c.id) : undefined;
  if (c?.alive && !other)
    remembers(g, life, g.char(c.id), "Never answered my letter", -3, 1);
  if (other) answerLetterSilently(g, life, other, l);
}

function answerLetterSilently(
  g: ConquestGame,
  life: Life,
  writer: Life,
  l: Letter,
): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return;
  pushPost(g, writer, {
    id: g.nextId(),
    kind: "reply",
    from: me.id,
    to: l.from,
    origin: life.prov,
    dest: writer.prov,
    sent: s.day,
    arrive: s.day + 1,
    bySea: false,
    status: "transit",
    text: "No answer came.",
    re: l.id,
    answer: {
      yes: false,
      why: { total: -1, parts: [{ label: "They never answered", value: -1 }] },
      text: `${me.first} never answered`,
      day: s.day,
    },
  });
}

/** Mark letters read. */
export function readLetters(
  g: ConquestGame,
  life: Life,
  id?: number,
): string | null {
  let any = false;
  for (const l of postOf(life))
    if (
      l.to === life.c &&
      l.status === "delivered" &&
      !l.read &&
      (id === undefined || l.id === id)
    ) {
      l.read = true;
      any = true;
    }
  if (any) touchLife(g, life);
  return null;
}

// ---------------------------------------------------------------- the world writes

const NPC_LETTER_CHANCE = 0.22;

/** Each month: someone may write to a player. */
export function postMonthly(g: ConquestGame): void {
  const s = g.s;
  const r = dice(g);
  for (const life of s.lives) {
    const me = meOf(s, life);
    if (!me?.alive || life.watching || isChildLife(s, life)) continue;
    if (!r.chance(NPC_LETTER_CHANCE)) continue;
    const pending = postOf(life).filter(
      (l) => l.to === me.id && (l.status === "transit" || (l.ask && !l.done)),
    ).length;
    if (pending >= 4) continue;
    const far = (c: Character | undefined) =>
      !!c?.alive &&
      !c.abroad &&
      !lifeOfChar(s, c.id) &&
      addressOf(s, c) !== life.prov;
    const ties = Object.entries(life.ties).map(([k, t]) => ({
      c: s.chars[Number(k)],
      t,
    }));
    const options: (() => void)[] = [];
    for (const { c, t } of ties) {
      if (!c?.alive || lifeOfChar(s, c.id)) continue;
      if (t === "lover" && far(c))
        options.push(() =>
          npcWrite(
            g,
            life,
            c,
            "love",
            `My own ${me.first}, the house is very quiet without you, and I am a poor sleeper. Tell me when you will come. Tell me you think of me. ${charName(c)}.`,
            { ask: true },
          ),
        );
      if ((t === "rival" || t === "nemesis") && addressOf(s, c) >= 0)
        options.push(() => {
          const demand = r.pick([0, 5, 10])!;
          npcWrite(
            g,
            life,
            c,
            "threat",
            demand
              ? `Sir, you have crossed me once too often. ${demand} coins by return will smooth it over. Otherwise we shall see. ${charName(c)}.`
              : `Keep out of my affairs, ${me.first}, or I will put you out of them. ${charName(c)}.`,
            { ask: true, arg: demand },
          );
        });
      if (t === "friend" && far(c) && r.chance(0.5))
        options.push(() => {
          const ask = r.pick([5, 10, 15])!;
          npcWrite(
            g,
            life,
            c,
            "favour",
            `Dear ${me.first}, I hate to ask it, but the harvest failed and the creditors are at the door. Could you spare ${ask} coins? I will repay you, as God is my witness. ${charName(c)}.`,
            { ask: true, arg: ask },
          );
        });
    }
    // A merchant you know proposes a venture.
    const merchant = life.met
      .map((id) => s.chars[id])
      .find(
        (c) =>
          c?.alive &&
          !c.abroad &&
          (c.role === "merchant" ||
            c.role === "captain" ||
            c.role === "planter") &&
          opinionOf(s, c, life).total >= 10,
      );
    if (merchant && life.purse >= 20)
      options.push(() =>
        npcWrite(
          g,
          life,
          merchant,
          "business",
          `${me.female ? "Madam" : "Sir"}, a cargo of flour and staves for Barbados wants one more partner at 20 coins a share. I would rather it were you. ${charName(merchant)}.`,
          { ask: true, arg: 20 },
        ),
      );
    // An officer gets petitions.
    const office = Object.values(s.society?.offices ?? {})
      .flat()
      .find((o) => o.holder === me.id);
    if (office) {
      const folk = (s.locals[office.prov] ?? [])
        .map((id) => s.chars[id])
        .filter((c) => c?.alive && !lifeOfChar(s, c.id));
      const c = folk.length ? folk[r.int(0, folk.length - 1)] : undefined;
      if (c)
        options.push(() =>
          npcWrite(
            g,
            life,
            c,
            "petition",
            `To ${officeTitle(s, g.w, office)}: the humble petition of ${charName(c)}, that a neighbour's hogs have broken down the fence again, and that justice be done. ${charName(c)}, their mark.`,
            { ask: true },
          ),
        );
    }
    const pickOne = options.length
      ? options[r.int(0, options.length - 1)]
      : undefined;
    pickOne?.();
  }
}
