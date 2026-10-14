// WORK (r21): a business's staff by name, taken on the way a ship's company
// is (Hiring.ts): you choose each one's role and pay, promote or demote them
// whenever you like, raise or cut their pay, or let them go. The computer's
// people sign by the odds shown (no dice); other players are offered a place
// in a scene, and it's their work then (their Work page, paid by you by the
// days at their post, left from the usual job menu).
//
// The roles, from the bottom: a hand (one of its hands), a skilled hand (a
// journeyman: worth more than a hand, by their skill), a clerk (the books:
// nothing goes astray), a foreman (in a middling place or bigger: the hands
// work harder) and a manager (minds it when you don't, at their own skill).
// What each does is reckoned in the business's month (Business.ts) and shown
// before you hire. The old way (a hand taken on by name at a hand's wage, or
// a player made a "shopkeeper") still works for those taken on before.

import {
  bizCost,
  type BizInput,
  type BizPlan,
  bizPlan,
  handCount,
  npcBizJob,
  STAFF_HAND_ROLES,
  staffHooks,
  type StaffInput,
  startInput,
  UNMINDED,
} from "./Business";
import { registerFamily } from "./EventPacing";
import type { ConquestGame } from "./Game";
import {
  answerOffer,
  askingPay,
  dismiss,
  fitFor,
  hire,
  type HireHost,
  hostOfBerth,
  type Ladder,
  offerById,
  offerPlace,
  payRoster,
  placeOf,
  prospectOf,
  registerHost,
  type RoleDef,
  roleOf,
  setPay,
  setRole,
  takeGate,
  withdrawOffer,
} from "./Hiring";
import { hooks } from "./Hooks";
import { journal, touchLife } from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import {
  charSkill,
  isChildLife,
  isNativeChar,
  lifeIsNative,
  lifeOfChar,
  lifeOfSeat,
  meOf,
  peopleHere,
} from "./LifeQueries";
import {
  BUSINESS_HANDS,
  HAND_WAGE,
  JOBS,
  ROLES,
  SKILL_NAMES,
} from "./LifeRules";
import { AMERICAS, type World } from "./Map";
import { ageOf, charName } from "./Queries";
import type {
  Character,
  GameState,
  Hire,
  JobKind,
  Life,
  LifeCommand,
  Part,
  Property,
  Skill,
} from "./Types";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- the roles

/** A hand's and a skilled hand's titles in each trade (where its own rungs won't do). */
const TITLES: Partial<Record<JobKind, [string, string]>> = {
  farmer: ["Farmhand", "Husbandman"],
  clerk: ["Porter", "Under-clerk"],
  innkeeper: ["Pot-boy", "Tapster"],
  miller: ["Miller's man", "Under-miller"],
  shopkeeper: ["Shop boy", "Shopman"],
  trapper: ["Trapper", "Woodsman"],
};

/** The going pay a month for each role, for someone just fit for it. */
export const STAFF_PAY = {
  hand: HAND_WAGE,
  skilled: 3.5,
  clerk: 3,
  foreman: 4,
  manager: 5,
};

/** What each role adds, at most (by their fitness for it). */
export const STAFF_FX = {
  /** A named hand: ×0.9 with no skill, ×1 at 4, up to ×1.2 (at 12). */
  hand: { base: 0.9, per: 0.025, most: 0.3 },
  /** A skilled hand: ×1.15 at 6, up to ×1.5. */
  skilled: { base: 1.15, from: 6, per: 0.035, most: 0.35 },
  /** A clerk: the takings up to 8 in a hundred (nothing goes astray). */
  clerk: { per: 0.008, most: 0.08 },
  /** A foreman: every hand's takings up to 15 in a hundred. */
  foreman: { per: 0.012, most: 0.15 },
};

/** Skills weighted, a skill named twice counted once with both weights. */
function weigh(...xs: [Skill, number][]): Partial<Record<Skill, number>> {
  const out: Partial<Record<Skill, number>> = {};
  for (const [k, w] of xs) out[k] = r2((out[k] ?? 0) + w);
  return out;
}

/** The roles on a business's staff, titled for its trade. */
export function staffRoles(job: JobKind): RoleDef[] {
  const def = JOBS[job];
  const main = def.main;
  const t = TITLES[job] ?? [
    def.ranks[0]?.title ?? "Hand",
    def.ranks[1] && !def.ranks[1].buy ? def.ranks[1].title : "Skilled hand",
  ];
  const top = Math.max(0, def.ranks.length - 1);
  const rung = (n: number) => Math.min(n, top);
  const sk = SKILL_NAMES[main].toLowerCase();
  return [
    {
      key: "hand",
      title: t[0],
      rank: 0,
      pay: STAFF_PAY.hand,
      skills: weigh([main, 1]),
      need: 0,
      jobRank: 0,
      text: `One of its hands (in place of a hand from the town). A good one brings in more: ×0.9 with no ${sk}, up to ×1.2.`,
    },
    {
      key: "skilled",
      title: t[1],
      rank: 1,
      pay: STAFF_PAY.skilled,
      skills: weigh([main, 1]),
      need: 6,
      jobRank: rung(1),
      text: `A skilled hand: one of its hands, worth ×1.15 to ×1.5 of one by their ${sk}.`,
    },
    {
      key: "clerk",
      title: "Clerk",
      rank: 2,
      pay: STAFF_PAY.clerk,
      skills: weigh(["trade", 0.6], ["letters", 0.4]),
      need: 4,
      jobRank: rung(1),
      text: "Keeps the books and the counter: nothing goes astray (the takings up to 8 in a hundred more).",
    },
    {
      key: "foreman",
      title: "Foreman",
      rank: 3,
      pay: STAFF_PAY.foreman,
      skills: weigh([main, 0.5], ["leadership", 0.5]),
      need: 6,
      jobRank: rung(2),
      text: "Keeps the hands at it: each brings in up to 15 in a hundred more. A middling place or bigger.",
    },
    {
      key: "manager",
      title: "Manager",
      rank: 4,
      pay: STAFF_PAY.manager,
      skills: weigh([main, 0.6], ["trade", 0.2], ["leadership", 0.2]),
      need: 6,
      jobRank: rung(2),
      text: `Minds it when you don't (away, or at other work), at their own ${sk}: it takes all its takings, not ${Math.round(0.6 * 100)} in a hundred.`,
    },
  ] as RoleDef[];
}

const LADDERS = new Map<JobKind, Ladder>();

/** A trade's staff ladder (made once). */
export function staffLadder(job: JobKind): Ladder {
  let l = LADDERS.get(job);
  if (!l) {
    l = {
      key: `biz:${job}`,
      noun: "its staff",
      roles: staffRoles(job),
      job: { kind: job, place: JOBS[job].places[0] },
      scene: "p2p-staff",
      words: {
        at: "at",
        her: "its",
        place: "place",
        quits: "walks out for good",
      },
    };
    LADDERS.set(job, l);
  }
  return l;
}

// ---------------------------------------------------------------- a business as an outfit

/** "Alden's store at Jamestown". */
export function bizName(
  s: GameState,
  map: { provinces: { name: string }[] },
  owner: Life,
  pr: Property,
): string {
  const me = meOf(s, owner);
  return `${me?.first ?? "the"}${me ? "'s" : ""} ${pr.name} at ${map.provinces[pr.prov]?.name ?? "the town"}`;
}

/** Where its staff work: in its town, not on the road. */
function hereFor(l: Life, pr: Property): boolean {
  return !l.travel && l.prov === pr.prov && !l.crime?.jail;
}

/** A business as an outfit people are taken on into (Hiring.ts). */
export function bizHost(
  s: GameState,
  owner: Life,
  pr: Property,
  map: { provinces: { name: string }[] } = AMERICAS,
): HireHost {
  const ladder = staffLadder(pr.job!);
  return {
    kind: "biz",
    seat: owner.seat,
    id: pr.id,
    name: bizName(s, map, owner, pr),
    owner,
    prov: pr.prov,
    ladder,
    roster: pr.biz?.roster ?? { hires: [] },
    own: (g) => {
      touchLife(g, owner);
      const st = (pr.biz ??= {});
      return (st.roster ??= { hires: [] });
    },
    rep: 50,
    room: (role) => roomFor(pr, role),
    atPost: (_s, l) => hereFor(l, pr),
    flow: staffFlow(pr),
    // A hand by name takes a town hand's place if it's full.
    joined: (g, h) => {
      if (!STAFF_HAND_ROLES.includes(h.role)) return;
      const st = pr.biz;
      if (!st?.extra) return;
      if (handCount(pr) <= (BUSINESS_HANDS[pr.level] ?? 0)) return;
      st.extra--;
      if (!st.extra) delete st.extra;
      journal(g, owner, `A hand from the town makes way at your ${pr.name}.`);
    },
  };
}

/** Its staff's pay in the owner's books (the same key as its forecast line). */
export function staffFlow(pr: Property): {
  key: string;
  label: string;
  aff: "property";
} {
  return {
    key: `ps:${pr.id}`,
    label: `${pr.name.replace(/^\w/, (m) => m.toUpperCase())}: its staff's pay`,
    aff: "property",
  };
}

/** How many of a role a business has room for. */
export function roomFor(pr: Property, role: string): number {
  const hands = BUSINESS_HANDS[pr.level] ?? 0;
  const hires = pr.biz?.roster?.hires ?? [];
  const n = (k: string) => hires.filter((h) => h.role === k).length;
  switch (role) {
    case "hand":
      return Math.max(0, hands - pr.hands.length - n("skilled"));
    case "skilled":
      return Math.max(
        0,
        Math.min(pr.level + 1, hands - pr.hands.length - n("hand")),
      );
    case "clerk":
    case "manager":
      return 1;
    case "foreman":
      return pr.level >= 2 ? 1 : 0;
  }
  return 0;
}

/** The business of a seat's by its id. */
function bizOf(life: Life, id: number | undefined): Property | undefined {
  return (life.property ?? []).find(
    (x) => x.id === id && x.kind === "business" && !!x.job,
  );
}

registerHost("biz", {
  find: (s, seat, id) => {
    const owner = lifeOfSeat(s, seat);
    const pr = owner ? bizOf(owner, id) : undefined;
    return owner && pr ? bizHost(s, owner, pr) : undefined;
  },
  all: (s) => {
    const out: HireHost[] = [];
    for (const l of s.lives)
      for (const pr of l.property ?? [])
        if (
          pr.kind === "business" &&
          pr.job &&
          pr.biz?.roster &&
          (pr.biz.roster.hires.length || pr.biz.roster.offers?.length)
        )
          out.push(bizHost(s, l, pr));
    return out;
  },
  gone: "now the business isn't its owner's",
});

// ---------------------------------------------------------------- what they do

/** A skill of one on its staff (a player's from their sheet). */
export function staffSkill(s: GameState, h: Hire, sk: Skill): number {
  const c = s.chars[h.c];
  return c ? charSkill(s, c, sk) : 0;
}

/** How fit one on its staff is for a role. */
export function staffFit(
  s: GameState,
  pr: Property,
  h: Hire,
  role = h.role,
): number {
  const def = roleOf(staffLadder(pr.job!), role);
  if (!def) return 0;
  let v = 0;
  for (const [sk, w] of Object.entries(def.skills) as [Skill, number][])
    v += staffSkill(s, h, sk) * w;
  return r1(v);
}

/** Whether one on its staff is at work now (the computer's always; a player at their post). */
export function staffAtWork(s: GameState, pr: Property, h: Hire): boolean {
  if (!h.seat) return !!s.chars[h.c]?.alive;
  const l = lifeOfSeat(s, h.seat);
  return !!l && l.c === h.c && hereFor(l, pr);
}

/** A named hand's worth against a hand from the town (1). */
export function handWorth(role: string, fit: number): number {
  if (role === "skilled") {
    const f = STAFF_FX.skilled;
    return r2(f.base + Math.min(f.most, Math.max(0, fit - f.from) * f.per));
  }
  const f = STAFF_FX.hand;
  return r2(f.base + Math.min(f.most, fit * f.per));
}

/** What a clerk adds to the takings (×). */
export function clerkWorth(fit: number): number {
  return r2(1 + Math.min(STAFF_FX.clerk.most, fit * STAFF_FX.clerk.per));
}

/** What a foreman adds to each hand's takings (×). */
export function foremanWorth(fit: number): number {
  return r2(1 + Math.min(STAFF_FX.foreman.most, fit * STAFF_FX.foreman.per));
}

/** What a business's staff come to this month (Business.ts reckons it in). */
export function staffInput(
  s: GameState,
  owner: Life,
  pr: Property,
): StaffInput | undefined {
  const hires = pr.biz?.roster?.hires ?? [];
  if (!hires.length || !pr.job) return undefined;
  const main = JOBS[pr.job].main;
  let pay = 0;
  let hands = 0;
  let worth = 0;
  let takeX = 1;
  let fore = 1;
  let mgr: StaffInput["mgr"];
  const notes: string[] = [];
  for (const h of hires) {
    pay += h.pay;
    const c = s.chars[h.c];
    const name = c ? charName(c) : "someone";
    const at = staffAtWork(s, pr, h);
    const fit = staffFit(s, pr, h);
    const role = roleOf(staffLadder(pr.job), h.role);
    const title = role?.title.toLowerCase() ?? h.role;
    if (STAFF_HAND_ROLES.includes(h.role)) {
      hands++;
      const x = at ? handWorth(h.role, fit) : 0;
      worth += x;
      notes.push(
        at
          ? `${name}, ${title}: worth ×${x} of a hand`
          : `${name}, ${title}: not at work, so brings nothing in`,
      );
    } else if (!at) notes.push(`${name}, ${title}: not at work`);
    else if (h.role === "clerk") {
      takeX = clerkWorth(fit);
      notes.push(`${name}, clerk: the takings ×${takeX} (nothing goes astray)`);
    } else if (h.role === "foreman") {
      if (pr.level >= 2) {
        fore = foremanWorth(fit);
        notes.push(`${name}, foreman: every hand ×${fore}`);
      } else notes.push(`${name}, foreman: too small a place to need one`);
    } else if (h.role === "manager") {
      const skill = c ? staffSkill(s, h, main) : 0;
      if (!mgr || skill > mgr.skill) {
        mgr = { skill, who: `your manager ${c?.first ?? "on its staff"}` };
        notes.push(
          `${name}, manager: minds it when you don't (${SKILL_NAMES[main].toLowerCase()} ${skill})`,
        );
      }
    }
  }
  const all = handCount(pr);
  const handX = all > 0 ? r2(((all - hands + worth) / all) * fore) : fore;
  return {
    hands,
    handX,
    takeX,
    pay: r2(pay),
    ...(mgr ? { mgr } : {}),
    notes,
  };
}

staffHooks.push(staffInput);

// ---------------------------------------------------------------- who could be taken on

/** The town's people who might take a place at a business (the computer's, grown, free). */
export function staffCandidates(
  s: GameState,
  w: World,
  owner: Life,
  pr: Property,
): Character[] {
  const native = lifeIsNative(s, owner);
  const taken = new Set<number>();
  for (const l of s.lives) {
    for (const f of l.people ?? []) taken.add(f.c);
    for (const p of l.property ?? []) for (const c of p.hands) taken.add(c);
  }
  const ladder = staffLadder(pr.job!);
  const list = peopleHere(s, pr.prov)
    .filter(
      (c) =>
        !lifeOfChar(s, c.id) &&
        !taken.has(c.id) &&
        ageOf(s, c) >= 16 &&
        ageOf(s, c) <= 62 &&
        (!c.role || ROLES[c.role].status <= 2) &&
        !npcBizJob(c) &&
        (isNativeChar(s, c) === native || pr.job === "trapper") &&
        !placeOf(s, c.id),
    )
    .map((c) => {
      const p = prospectOf(s, owner, c, ladder);
      const best = Math.max(...ladder.roles.map((r) => fitFor(p, r) - r.need));
      return { c, best };
    })
    .sort((a, b) => b.best - a.best || a.c.id - b.c.id);
  void w;
  return list.slice(0, 8).map((x) => x.c);
}

// ---------------------------------------------------------------- the month

/** Each business's staff paid at its owner's month (players by their own days, Hiring.ts). */
export function staffMonthly(g: ConquestGame, owner: Life): void {
  for (const pr of owner.property ?? []) {
    if (pr.kind !== "business" || !pr.job || !pr.biz?.roster?.hires.length)
      continue;
    payRoster(g, bizHost(g.s, owner, pr));
  }
}

hooks.lifeMonthly.push(staffMonthly);

// The month's figure: each business's staff's pay (a player's at full pay).
// Its own line (the ledger lists properties apart, with a copy of the life
// that has none, so the businesses are looked up by the seat).
hooks.forecast.push((s, life) => {
  const out: Part[] = [];
  if (life.c < 0 || life.watching) return out;
  const real = s.lives.find((l) => l.seat === life.seat) ?? life;
  for (const pr of real.property ?? []) {
    const hires = pr.biz?.roster?.hires ?? [];
    if (pr.kind !== "business" || !hires.length) continue;
    const pay = r2(hires.reduce((m, h) => m + h.pay, 0));
    const f = staffFlow(pr);
    if (pay) out.push({ key: f.key, label: f.label, value: -pay });
  }
  return out;
});

// ---------------------------------------------------------------- the commands

/** A business's staff: take on, offer a player a place, promote, pay, let go; a player's answer. */
export function staffCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "staff") return undefined;
  const s = g.s;
  if (isChildLife(s, life)) return "Not as a child.";
  if (c.act === "answer")
    return answerOffer(g, life, c.hire ?? -1, (c.arg ?? 0) > 0);
  const pr = bizOf(life, c.id);
  if (!pr) return "Not your business.";
  const host = bizHost(s, life, pr, g.map);
  const ladder = host.ladder;
  switch (c.act) {
    case "hire": {
      const who = s.chars[c.c ?? -1];
      if (!who) return "No such person.";
      if (lifeOfChar(s, who.id)) return "Another player: offer them the place.";
      if (!hereFor(life, pr)) return "Be at the business to take people on.";
      if (!peopleHere(s, pr.prov).some((x) => x.id === who.id))
        return "They're not in the town.";
      const role = c.role ?? "hand";
      const pay = c.pay ?? roleOf(ladder, role)?.pay ?? HAND_WAGE;
      return hire(g, host, who, role, pay);
    }
    case "offer": {
      const them = s.lives.find((l) => l.c === c.c);
      if (!them) return "Not a player.";
      const role = c.role ?? "hand";
      return offerPlace(
        g,
        host,
        them,
        role,
        c.pay ?? roleOf(ladder, role)?.pay ?? HAND_WAGE,
      );
    }
    case "unoffer":
      return withdrawOffer(g, host, c.hire ?? -1);
    case "role":
      return setRole(g, host, c.hire ?? -1, c.role ?? "");
    case "pay":
      return setPay(g, host, c.hire ?? -1, c.pay ?? 0);
    case "dismiss":
      return dismiss(g, host, c.hire ?? -1);
  }
  return "Unknown.";
}

hooks.command.push(staffCommand);

/** Whether a player's place is on a business's staff (for their Work page). */
export function staffPlace(
  s: GameState,
  life: Life,
): { host: HireHost; pr: Property } | undefined {
  const b = life.job?.berth;
  if (!b || b.kind !== "biz") return undefined;
  const host = hostOfBerth(s, b);
  const owner = lifeOfSeat(s, b.seat);
  const pr = owner ? bizOf(owner, b.id) : undefined;
  return host && pr ? { host, pr } : undefined;
}

// ---------------------------------------------------------------- the offer, as a scene

const nameOf = (g: ConquestGame, ctx: LCtx) => charName(g.s.chars[ctx.c]);

function offerOf(g: ConquestGame, ctx: LCtx) {
  return offerById(g.s, ctx.o);
}

const SCENES = (): LifeEventDef[] => [
  {
    key: "p2p-staff",
    pool: "raised",
    cooldown: 0,
    scene: (g, life, ctx) => {
      const f = offerOf(g, ctx);
      const owner = f?.host.owner;
      const pr = owner ? bizOf(owner, f!.host.id) : undefined;
      return pr?.place ?? "market";
    },
    title: (g, life, ctx) => {
      const f = offerOf(g, ctx);
      const role = f ? roleOf(f.host.ladder, f.offer.role) : undefined;
      return f && role
        ? `A place as ${role.title.toLowerCase()} at ${f.host.name.replace(/^the /, "the ")}`
        : "A place offered";
    },
    body: (g, life, ctx) => {
      const f = offerOf(g, ctx);
      if (!f) return "The offer's been taken back.";
      const { host, offer } = f;
      const role = roleOf(host.ladder, offer.role)!;
      const where = g.map.provinces[host.prov]?.name ?? "the town";
      const apart = life.prov !== host.prov;
      const going = JOBS[host.ladder.job.kind].ranks[0]?.wage ?? HAND_WAGE;
      const now = life.job
        ? `You'd leave your work as ${JOBS[life.job.kind].ranks[life.job.rank]?.title.toLowerCase() ?? "you are"}.`
        : "";
      return `${nameOf(g, ctx)} ${apart ? "writes" : "says"}: will you come to ${host.name.replace(/ at .*$/, "")} at ${where} as ${role.title.toLowerCase()}, at ${offer.pay} a month?\n${role.text}\nYour pay comes from its owner, by the days you're at your post (in ${where}). (A beginner in the trade gets about ${going} a month.) You can be promoted or moved, and you can leave from your Work page whenever you like. ${now}`.trim();
    },
    choices: [
      {
        label: "Take the place",
        tip: "It's your work from now on: your Work page shows it. Be in the town to be at your post.",
        blocked: (g, life, ctx) => {
          const f = offerOf(g, ctx);
          const c = takeGate(g.s, life, f?.host, f?.offer);
          return c.ok ? null : c.why;
        },
        apply: (g, life, ctx) => {
          const err = answerOffer(g, life, ctx.o, true);
          if (err) journal(g, life, err, "bad");
        },
      },
      {
        label: "Decline",
        tip: "They'll hear you said no.",
        apply: (g, life, ctx) => {
          if (offerOf(g, ctx)) answerOffer(g, life, ctx.o, false);
        },
      },
    ],
  },
];

let built: LifeEventDef[] | null = null;

/** The staff's scene (LifeEvents adds it the first time it looks one up). */
export function staffEvents(): LifeEventDef[] {
  if (built) return built;
  built = SCENES();
  registerFamily(
    "staff",
    built.map((d) => d.key),
    30,
  );
  return built;
}

/** Left unanswered, an offer is declined. */
export function staffQuiet(): Record<string, number> {
  return { "p2p-staff": 1 };
}

/** What a role on a business's staff asks, for the page: its going pay and least skill. */
export function roleLine(job: JobKind, key: string): string {
  const r = roleOf(staffLadder(job), key);
  if (!r) return "";
  return `${r.title}: about ${r.pay} a month${
    r.need
      ? `, at least ${r.need} in ${Object.keys(r.skills)
          .map((k) => SKILL_NAMES[k as Skill].toLowerCase())
          .join(" and ")}`
      : ""
  }.`;
}

// ---------------------------------------------------------------- a new business, both ways

/** One way a new business could be run, and what it would come to. */
export interface StartWay {
  key: "you" | "manager" | "none";
  /** "You mind it", "A manager minds it", "Nobody minds it". */
  label: string;
  /** Who and why, in a line. */
  note: string;
  plan: BizPlan;
  /** The way the plan above is reckoned (as things stand now). */
  now: boolean;
}

/** The best manager the town would give a new business of a trade, and their skill in it. */
export function managerFor(
  s: GameState,
  w: World,
  life: Life,
  job: JobKind,
  p = life.prov,
): { c?: Character; skill: number; pay: number } {
  const main = JOBS[job].main;
  const ladder = staffLadder(job);
  const role = roleOf(ladder, "manager")!;
  const pseudo: Property = {
    id: -1,
    kind: "business",
    prov: p,
    level: 1,
    job,
    place: JOBS[job].places[0],
    hands: [],
    since: s.day,
    name: JOBS[job].business ?? "business",
  };
  let best: { c?: Character; skill: number; pay: number } = {
    skill: role.need,
    pay: role.pay,
  };
  for (const c of staffCandidates(s, w, life, pseudo)) {
    const pr = prospectOf(s, life, c, ladder);
    if (fitFor(pr, role) < role.need) continue;
    const skill = charSkill(s, c, main);
    if (skill > best.skill || (skill === best.skill && !best.c))
      best = { c, skill, pay: Math.max(role.pay, askingPay(pr, role)) };
  }
  return best;
}

/**
 * WORK (r21): a new business's plan both ways: minded (by you, if you'd be
 * free to, or by a manager on its staff at their wage) and with nobody
 * minding it (while you work elsewhere or are away). The plan the start
 * window shows assumes things as they stand; these say what it could be.
 */
export function startWays(
  s: GameState,
  w: World,
  life: Life,
  job: JobKind,
  level: number,
): StartWay[] {
  const base = startInput(s, w, life, job, level);
  const cost = bizCost(job, level);
  const out: StartWay[] = [];
  const main = JOBS[job].main;
  const sk = SKILL_NAMES[main].toLowerCase();
  const mine = charSkill(s, meOf(s, life)!, main);
  const work = life.job;
  const way = (
    key: StartWay["key"],
    label: string,
    note: string,
    i: BizInput,
  ) =>
    out.push({
      key,
      label,
      note,
      plan: bizPlan(s, i, cost),
      now: key === (base.minded ? "you" : "none"),
    });
  // You, in person: as things are, or if you gave up your other work.
  way(
    "you",
    "You mind it",
    base.minded && base.who === "you"
      ? `You're free to: your own work at it adds to the takings (${sk} ${mine}).`
      : work
        ? `If you gave up your work as ${JOBS[work.kind].ranks[work.rank]?.title.toLowerCase() ?? "you are"} and minded it yourself (${sk} ${mine}).`
        : `If you were in the town to mind it (${sk} ${mine}).`,
    { ...base, minded: true, master: "work", skill: mine, who: "you" },
  );
  // A manager on its staff, at their going pay.
  const m = managerFor(s, w, life, job);
  way(
    "manager",
    "A manager minds it",
    `${m.c ? `${charName(m.c)} of the town` : "A manager"} (${sk} ${m.skill}), at ${m.pay} a month on its staff: you're free to work elsewhere or be away.`,
    {
      ...base,
      minded: true,
      master: "work",
      skill: m.skill,
      who: "a manager",
      staff: {
        hands: 0,
        handX: 1,
        takeX: 1,
        pay: m.pay,
        mgr: { skill: m.skill, who: "a manager" },
        notes: [],
      },
    },
  );
  // Nobody.
  way(
    "none",
    "Nobody minds it",
    base.minded
      ? `If you took other work or left the town: it takes ${UNMINDED} of its takings.`
      : `As things stand (${base.away ?? "nobody to mind it"}): it takes ${UNMINDED} of its takings.`,
    {
      ...base,
      minded: false,
      master: "none",
      away: base.away ?? "nobody minds it",
    },
  );
  return out;
}
