// SHIPS (r21): taking people on by name into an outfit of yours, each with a
// role and a wage you set, and promoting or demoting them whenever you like.
//
// An outfit is anything with a company of people: a ship (Ships.ts) now, a
// business (WORK, r21 wave 2) next. Each kind of outfit registers itself
// here (`registerHost`) with its ladder of roles (a ship's: hand, bosun,
// surgeon, navigator, mate, captain) and a way to find one by its owner's
// seat and its id. Everything else is the same for every kind:
//
// - The computer's people are taken on at once if they'll sign: the pay
//   against what they'd ask (by their skill for the role), what they think
//   of you, the outfit's name, and whether the role is beneath them
//   (`signOdds`, shown before you offer).
// - A player is offered a place (`offerPlace`): a scene ("p2p-berth") to
//   accept or decline. Accepted, it's their work (their Work page, a rung
//   titled by the role, the pay you set); they're paid by the days they're
//   at their post, from your purse, at their month's turn, and they leave
//   from the usual job menu (`hooks.jobLeft`).
// - Promote or demote (`setRole`), raise or cut the pay (`setPay`), let them
//   go (`dismiss`), whenever you like. The computer's people remember it;
//   a player is told.
// - The month (`payRoster` for the computer's people, `payBerth` for
//   players): unpaid, the computer's people grumble and then leave.
//
// Rolls: none. Who signs is decided by the shown odds (above nothing, they
// sign), so the world's dice are never touched.

import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { withFlow } from "./LedgerCore";
import { earn, journal, remembers, spend, touchLife } from "./LifeCore";
import {
  type Check,
  charSkill,
  isChildLife,
  lifeOfChar,
  lifeOfSeat,
  meOf,
  no,
  opinionOf,
  skillLevel,
  yes,
} from "./LifeQueries";
import { JOBS, SKILL_MAX, SKILL_NAMES, WORK_DAYS } from "./LifeRules";
import { wake } from "./Pace";
import { ageOf, charName } from "./Queries";
import type {
  Berth,
  Breakdown,
  Character,
  GameState,
  Hire,
  HireOffer,
  JobKind,
  Life,
  PlaceKind,
  Roster,
  Skill,
} from "./Types";
import { leaveJob, startJob } from "./Work";

const r1 = (v: number) => Math.round(v * 10) / 10;
const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

// ---------------------------------------------------------------- ladders

/** A role on an outfit's ladder. */
export interface RoleDef {
  key: string;
  /** "Mate", "Ship's surgeon". */
  title: string;
  /** Its place on the ladder: higher is senior (moving up is a promotion). */
  rank: number;
  /** The going rate a month for someone just fit for it (a better one asks more). */
  pay: number;
  /** The skills that make someone good at it, weighted (the weights sum to 1). */
  skills: Partial<Record<Skill, number>>;
  /** The least fitness (on the skills' own scale) the computer's people need to take it. */
  need: number;
  /** The rung of the outfit's trade a player in this role stands on. */
  jobRank: number;
  /** What they do, plainly. */
  text: string;
}

/** An outfit's roles, from the bottom up, and the work a player taken on does. */
export interface Ladder {
  key: string;
  /** "her company", "the staff". */
  noun: string;
  roles: RoleDef[];
  job: { kind: JobKind; place: PlaceKind };
}

/** An outfit people are taken on into, as its module describes it. */
export interface HireHost {
  /** Its kind, its owner's seat and its id (a player's place points here). */
  kind: string;
  seat: string;
  id: number;
  /** "the Swallow". */
  name: string;
  owner: Life;
  /** Where it is now (where a player works it). */
  prov: number;
  ladder: Ladder;
  /** Its roster as it is (empty if none yet). */
  roster: Roster;
  /** Make its roster if it has none (the first hire), and mark it changed. */
  own(g: ConquestGame): Roster;
  /** Its name with people looking for a place, 0 to 100 (50: unknown). */
  rep: number;
  /** How many of a role it has room for (0: none here, a canoe has no surgeon). */
  room(role: string): number;
  /** Whether a player in this place is at their post now. */
  atPost(s: GameState, life: Life): boolean;
  /** The month's pay, in the owner's books: its key and words. */
  flow: { key: string; label: string };
  /** Someone's just joined (a ship: a hand by name takes a hand-by-the-head's place). */
  joined?(g: ConquestGame, h: Hire): void;
}

/** How each kind of outfit is found: by its owner's seat and its id, and all of them. */
export interface HostKind {
  find(s: GameState, seat: string, id: number): HireHost | undefined;
  all(s: GameState): HireHost[];
  /** Why a player's place ended when the outfit's gone: "now she's no longer hers". */
  gone: string;
}

const KINDS = new Map<string, HostKind>();

/** An outfit's module says how its outfits are found (Ships.ts: "ship"). */
export function registerHost(kind: string, h: HostKind): void {
  KINDS.set(kind, h);
}

export function hostKind(kind: string): HostKind | undefined {
  return KINDS.get(kind);
}

/** The outfit a player's place is in, if it's still there. */
export function hostOfBerth(
  s: GameState,
  b: Pick<Berth, "kind" | "seat" | "id">,
): HireHost | undefined {
  return KINDS.get(b.kind)?.find(s, b.seat, b.id);
}

/** Every outfit of every kind (for finding someone's place or an offer). */
export function allHosts(s: GameState): HireHost[] {
  const out: HireHost[] = [];
  for (const k of KINDS.values()) out.push(...k.all(s));
  return out;
}

export function roleOf(ladder: Ladder, key: string): RoleDef | undefined {
  return ladder.roles.find((r) => r.key === key);
}

// ---------------------------------------------------------------- people

/** Someone who might be taken on: who, what they're good at, and what they think of you. */
export interface Prospect {
  /** Their character, or -1 for one not yet met (someone looking for a berth). */
  c: number;
  name: string;
  skills: Partial<Record<Skill, number>>;
  /** What they think of the owner. */
  opinion: number;
  /** A player's seat. */
  seat?: string;
}

/** Someone the owner could take on, as they stand now. */
export function prospectOf(
  s: GameState,
  owner: Life,
  c: Character,
  ladder: Ladder,
): Prospect {
  const life = lifeOfChar(s, c.id);
  const skills: Partial<Record<Skill, number>> = {};
  for (const r of ladder.roles)
    for (const sk of Object.keys(r.skills) as Skill[])
      skills[sk] ??= life ? skillLevel(s, life, sk) : charSkill(s, c, sk);
  return {
    c: c.id,
    name: charName(c),
    skills,
    opinion: life ? 0 : opinionOf(s, c, owner).total,
    ...(life ? { seat: life.seat } : {}),
  };
}

/** How fit someone is for a role: their skills, weighted as the role weighs them. */
export function fitFor(p: Pick<Prospect, "skills">, role: RoleDef): number {
  let v = 0;
  for (const [sk, w] of Object.entries(role.skills) as [Skill, number][])
    v += (p.skills[sk] ?? 0) * w;
  return r1(v);
}

/** What the role's skills are, in words: "seamanship and leadership". */
export function roleSkillWords(role: RoleDef): string {
  const names = (Object.keys(role.skills) as Skill[]).map((k) =>
    SKILL_NAMES[k].toLowerCase(),
  );
  return names.length > 1
    ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
    : names[0];
}

/** What someone fit for a role would ask a month: more the better they are (up to 1.6 of the going rate). */
export function askingPay(p: Pick<Prospect, "skills">, role: RoleDef): number {
  const over = Math.max(0, fitFor(p, role) - role.need);
  const x = Math.min(1.6, 0.85 + over * (0.75 / (SKILL_MAX * 0.5)));
  return r1(role.pay * x);
}

/** The best role someone would expect, by their fitness (for "beneath them"). */
export function expectedRole(
  p: Pick<Prospect, "skills">,
  ladder: Ladder,
): RoleDef {
  let best = ladder.roles[0];
  for (const r of ladder.roles)
    if (fitFor(p, r) >= r.need + 3 && r.rank > best.rank) best = r;
  return best;
}

/**
 * Whether one of the computer's people would sign, and why: above nothing,
 * they do. The pay against what they'd ask, what they think of you, the
 * outfit's name, a role beneath them, and whether they're up to it at all.
 */
export function signOdds(
  host: HireHost,
  p: Prospect,
  role: RoleDef,
  pay: number,
): Breakdown {
  const e = new Explain();
  e.add("A berth is a berth", 10);
  const fit = fitFor(p, role);
  if (fit < role.need)
    e.add(`Not up to it: ${roleSkillWords(role)} ${fit} of ${role.need}`, -100);
  const ask = askingPay(p, role);
  const byPay = Math.round((pay / Math.max(0.1, ask) - 1) * 60);
  e.add(
    pay >= ask
      ? `The pay: ${pay} a month, against the ${ask} they'd ask`
      : `The pay: ${pay} a month, under the ${ask} they'd ask`,
    Math.max(-80, Math.min(30, byPay)),
  );
  if (p.opinion)
    e.add(
      `What they think of you (${Math.round(p.opinion)})`,
      Math.round(p.opinion / 4),
    );
  const rep = Math.round(host.rep);
  if (rep !== 50)
    e.add(
      `The ${host.name.replace(/^the /i, "")}'s name (${rep})`,
      Math.round((rep - 50) / 5),
    );
  const want = expectedRole(p, host.ladder);
  if (want.rank > role.rank + 1)
    e.add(`Beneath them: they'd look for a place as ${want.title.toLowerCase()}`, -15);
  return e.done(0);
}

// ---------------------------------------------------------------- the roster

export function hiresOf(host: HireHost): Hire[] {
  return host.roster.hires;
}

export function hireById(host: HireHost, id: number): Hire | undefined {
  return host.roster.hires.find((h) => h.id === id);
}

/** How many of a role the outfit has now. */
export function countOf(host: HireHost, role: string): number {
  return host.roster.hires.filter((h) => h.role === role).length;
}

/** Whose roster someone's on (any outfit of any kind), if anyone's. */
export function placeOf(
  s: GameState,
  c: number,
): { host: HireHost; hire: Hire } | undefined {
  for (const host of allHosts(s)) {
    const hire = host.roster.hires.find((h) => h.c === c);
    if (hire) return { host, hire };
  }
  return undefined;
}

/** The roster's pay a month, all told (a player at full pay). */
export function rosterPay(host: HireHost): number {
  return r1(host.roster.hires.reduce((m, h) => m + h.pay, 0));
}

/** The computer's people's pay a month (a player's is reckoned by their days). */
export function npcPay(host: HireHost): number {
  return r1(
    host.roster.hires.filter((h) => !h.seat).reduce((m, h) => m + h.pay, 0),
  );
}

/** The least and most a month that can be offered. */
export const PAY_RANGE = [0.5, 40] as const;

/** What a role's title is for this outfit: "Mate of the Swallow". */
export function placeTitle(host: HireHost, role: RoleDef): string {
  return `${role.title} of ${host.name}`;
}

/** Whether the owner can take someone on in this role at this pay, now. */
export function hireGate(
  s: GameState,
  host: HireHost,
  p: Prospect,
  roleKey: string,
  pay: number,
): Check {
  const owner = host.owner;
  if (!meOf(s, owner)) return no("You're watching.");
  if (isChildLife(s, owner)) return no("Not until you're sixteen.");
  const role = roleOf(host.ladder, roleKey);
  if (!role) return no("No such place.");
  if (!Number.isFinite(pay) || pay < PAY_RANGE[0] || pay > PAY_RANGE[1])
    return no(`Pay is ${PAY_RANGE[0]} to ${PAY_RANGE[1]} a month.`);
  const room = host.room(role.key);
  if (room <= 0) return no(`${cap(host.name)} has no place for a ${role.title.toLowerCase()}.`);
  if (countOf(host, role.key) >= room)
    return no(`${cap(host.name)} has her ${role.title.toLowerCase()}${room > 1 ? "s" : ""} already.`);
  if (p.c === owner.c) return no("You can't sign yourself on.");
  if (p.c >= 0) {
    const c = s.chars[p.c];
    if (!c?.alive || c.abroad) return no("They're not to be had.");
    if (ageOf(s, c) < 16) return no("A child.");
    if (placeOf(s, p.c)) return no("They have a place already.");
  }
  return yes;
}

/** Take one of the computer's people on: they sign if the odds are above nothing. */
export function hire(
  g: ConquestGame,
  host: HireHost,
  c: Character,
  roleKey: string,
  pay: number,
): string | null {
  const s = g.s;
  if (lifeOfChar(s, c.id)) return "Another player: offer them the place.";
  const p = prospectOf(s, host.owner, c, host.ladder);
  const gate = hireGate(s, host, p, roleKey, pay);
  if (!gate.ok) return gate.why;
  const role = roleOf(host.ladder, roleKey)!;
  const odds = signOdds(host, p, role, pay);
  if (odds.total <= 0)
    return `${charName(c)} won't sign: ${worst(odds).toLowerCase()}.`;
  const roster = host.own(g);
  const h: Hire = {
    id: g.nextId(),
    c: c.id,
    role: role.key,
    pay: r1(pay),
    since: s.day,
    roleSince: s.day,
    loyalty: Math.max(30, Math.min(80, 45 + odds.total / 2)),
  };
  roster.hires.push(h);
  touchLife(g, host.owner);
  host.joined?.(g, h);
  remembers(g, host.owner, c, "Gave me a berth", 6, 3);
  journal(
    g,
    host.owner,
    `${charName(c)} signs on as ${role.title.toLowerCase()} of ${host.name}, at ${h.pay} a month.`,
    "good",
  );
  return null;
}

/** The part of a breakdown that weighs most against. */
function worst(b: Breakdown): string {
  const bad = [...b.parts].filter((x) => !x.mul).sort((a, z) => a.value - z.value)[0];
  return bad?.label ?? "they'd rather not";
}

// ---------------------------------------------------------------- players

/** Offers waiting on a player's answer, anywhere. */
export function offersTo(
  s: GameState,
  seat: string,
): { host: HireHost; offer: HireOffer }[] {
  const out: { host: HireHost; offer: HireOffer }[] = [];
  for (const host of allHosts(s))
    for (const o of host.roster.offers ?? [])
      if (o.seat === seat) out.push({ host, offer: o });
  return out;
}

export function offerById(
  s: GameState,
  id: number,
): { host: HireHost; offer: HireOffer } | undefined {
  for (const host of allHosts(s)) {
    const offer = (host.roster.offers ?? []).find((o) => o.id === id);
    if (offer) return { host, offer };
  }
  return undefined;
}

/** How long an offer stands. */
export const OFFER_DAYS = 30;

/** Whether a player can be offered a place now. */
export function offerGate(
  s: GameState,
  host: HireHost,
  them: Life,
  roleKey: string,
  pay: number,
): Check {
  const c = meOf(s, them);
  if (!c || them.watching) return no("They're watching.");
  if (them.seat === host.owner.seat) return no("That's you.");
  if (isChildLife(s, them)) return no("Not until they're sixteen.");
  const p = prospectOf(s, host.owner, c, host.ladder);
  const gate = hireGate(s, host, p, roleKey, pay);
  if (!gate.ok) return gate;
  if ((host.roster.offers ?? []).some((o) => o.seat === them.seat))
    return no("They have your offer already.");
  return yes;
}

/** Offer a player a place: they're asked in a scene, and may accept or decline. */
export function offerPlace(
  g: ConquestGame,
  host: HireHost,
  them: Life,
  roleKey: string,
  pay: number,
): string | null {
  const s = g.s;
  const gate = offerGate(s, host, them, roleKey, pay);
  if (!gate.ok) return gate.why;
  const roster = host.own(g);
  const o: HireOffer = {
    id: g.nextId(),
    c: them.c,
    seat: them.seat,
    role: roleKey,
    pay: r1(pay),
    day: s.day,
    until: s.day + OFFER_DAYS,
  };
  (roster.offers ??= []).push(o);
  touchLife(g, host.owner);
  const role = roleOf(host.ladder, roleKey)!;
  journal(
    g,
    host.owner,
    `You offer ${charName(s.chars[them.c])} a place as ${role.title.toLowerCase()} of ${host.name}, at ${o.pay} a month.`,
  );
  raiseEvent(g, them, "p2p-berth", { c: host.owner.c, o: o.id });
  wake(g, them, `${charName(meOf(s, host.owner))} offers you a place.`);
  return null;
}

/** The owner takes back an offer not yet answered. */
export function withdrawOffer(
  g: ConquestGame,
  host: HireHost,
  id: number,
): string | null {
  const roster = host.roster;
  const o = (roster.offers ?? []).find((x) => x.id === id);
  if (!o) return "That's been answered.";
  host.own(g).offers = (roster.offers ?? []).filter((x) => x !== o);
  touchLife(g, host.owner);
  const them = lifeOfSeat(g.s, o.seat);
  if (them) {
    touchLife(g, them).events = them.events.filter(
      (e) => !(e.key === "p2p-berth" && e.ctx.o === id),
    );
  }
  return null;
}

/** Why a player can't take up an offer now, or ok. */
export function takeGate(
  s: GameState,
  life: Life,
  host: HireHost | undefined,
  o: HireOffer | undefined,
): Check {
  if (!host || !o) return no("The offer's gone");
  if (life.crime?.jail) return no("Not from a cell");
  if (life.job?.kind === "servant" && (life.job.until ?? 0) > s.day)
    return no("You're bound by your indenture");
  if ((life.job?.army ?? -1) >= 0) return no("You march with the army");
  const role = roleOf(host.ladder, o.role);
  if (!role) return no("The offer's gone");
  if (countOf(host, o.role) >= host.room(o.role))
    return no(`Her ${role.title.toLowerCase()}'s place is filled`);
  return yes;
}

/** A player answers an offer: yes (it's their work now) or no. */
export function answerOffer(
  g: ConquestGame,
  life: Life,
  id: number,
  accept: boolean,
): string | null {
  const s = g.s;
  const found = offerById(s, id);
  if (!found || found.offer.seat !== life.seat) return "The offer's gone.";
  const { host, offer } = found;
  const owner = host.owner;
  const role = roleOf(host.ladder, offer.role)!;
  if (!accept) {
    host.own(g).offers = (host.roster.offers ?? []).filter((x) => x !== offer);
    touchLife(g, owner);
    journal(g, life, `You decline the place aboard ${host.name}.`);
    journal(
      g,
      owner,
      `${charName(meOf(s, life))} declines your offer of a place as ${role.title.toLowerCase()} of ${host.name}.`,
    );
    return null;
  }
  const gate = takeGate(s, life, host, offer);
  if (!gate.ok) return `${gate.why}.`;
  host.own(g).offers = (host.roster.offers ?? []).filter((x) => x !== offer);
  if (life.job) leaveJob(g, life, `for a place as ${role.title.toLowerCase()} of ${host.name}`);
  const h: Hire = {
    id: g.nextId(),
    c: life.c,
    seat: life.seat,
    role: role.key,
    pay: offer.pay,
    since: s.day,
    roleSince: s.day,
    loyalty: 60,
  };
  host.own(g).hires.push(h);
  touchLife(g, owner);
  host.joined?.(g, h);
  const job = startJob(
    g,
    life,
    host.ladder.job.kind,
    host.ladder.job.place,
    Math.min(role.jobRank, JOBS[host.ladder.job.kind].ranks.length - 1),
    owner.c,
  );
  job.prov = host.prov;
  job.berth = {
    kind: host.kind,
    seat: host.seat,
    id: host.id,
    title: placeTitle(host, role),
    pay: h.pay,
  };
  journal(
    g,
    life,
    `You're ${role.title.toLowerCase()} of ${host.name} now, at ${h.pay} a month from her owner, paid by the days you're at your post. ${role.text}`,
    "good",
  );
  journal(
    g,
    owner,
    `${charName(meOf(s, life))} takes your place as ${role.title.toLowerCase()} of ${host.name}, at ${h.pay} a month.`,
    "good",
  );
  wake(g, owner, `${charName(meOf(s, life))} joins ${host.name}.`);
  return null;
}

/** Keep a player's own copy of their place (title and pay) as the roster has it. */
function syncBerth(g: ConquestGame, host: HireHost, h: Hire): void {
  if (!h.seat) return;
  const life = lifeOfSeat(g.s, h.seat);
  const b = life?.job?.berth;
  const role = roleOf(host.ladder, h.role);
  if (!life || !b || !role) return;
  touchLife(g, life);
  b.title = placeTitle(host, role);
  b.pay = h.pay;
  life.job!.rank = Math.min(
    role.jobRank,
    JOBS[life.job!.kind].ranks.length - 1,
  );
}

// ---------------------------------------------------------------- promotion, pay, dismissal

/** Make someone on the roster a different role: up is a promotion, down a demotion. */
export function setRole(
  g: ConquestGame,
  host: HireHost,
  id: number,
  roleKey: string,
): string | null {
  const s = g.s;
  const h = hireById(host, id);
  if (!h) return "They're not aboard.";
  const role = roleOf(host.ladder, roleKey);
  const was = roleOf(host.ladder, h.role);
  if (!role || !was) return "No such place.";
  if (role.key === h.role) return `They're ${role.title.toLowerCase()} already.`;
  if (host.room(role.key) <= 0)
    return `${cap(host.name)} has no place for a ${role.title.toLowerCase()}.`;
  if (countOf(host, role.key) >= host.room(role.key))
    return `${cap(host.name)} has her ${role.title.toLowerCase()} already: move them first.`;
  const up = role.rank > was.rank;
  const c = s.chars[h.c];
  touchLife(g, host.owner);
  h.role = role.key;
  h.roleSince = s.day;
  const verb = up ? "promote" : role.rank < was.rank ? "demote" : "move";
  journal(
    g,
    host.owner,
    `You ${verb} ${charName(c)} to ${role.title.toLowerCase()} of ${host.name}.`,
  );
  if (h.seat) {
    syncBerth(g, host, h);
    const life = lifeOfSeat(s, h.seat);
    if (life) {
      journal(
        g,
        life,
        `${charName(meOf(s, host.owner))} ${up ? "promotes you" : role.rank < was.rank ? "demotes you" : "moves you"} to ${role.title.toLowerCase()} of ${host.name}${up ? "" : ""}. Your pay stays ${h.pay} a month unless it's changed.`,
        up ? "good" : role.rank < was.rank ? "bad" : undefined,
      );
      wake(g, life, `You're ${role.title.toLowerCase()} of ${host.name} now.`);
    }
  } else if (c?.alive) {
    h.loyalty = Math.max(0, Math.min(100, h.loyalty + (up ? 12 : role.rank < was.rank ? -20 : 0)));
    if (up) remembers(g, host.owner, c, `Made me ${role.title.toLowerCase()}`, 8, 3);
    else if (role.rank < was.rank)
      remembers(g, host.owner, c, "Broke me to a lower berth", -12, 3);
  }
  return null;
}

/** Raise or cut someone's pay. */
export function setPay(
  g: ConquestGame,
  host: HireHost,
  id: number,
  pay: number,
): string | null {
  const s = g.s;
  const h = hireById(host, id);
  if (!h) return "They're not aboard.";
  if (!Number.isFinite(pay) || pay < PAY_RANGE[0] || pay > PAY_RANGE[1])
    return `Pay is ${PAY_RANGE[0]} to ${PAY_RANGE[1]} a month.`;
  const now = r1(pay);
  if (now === h.pay) return null;
  const up = now > h.pay;
  const c = s.chars[h.c];
  touchLife(g, host.owner);
  const was = h.pay;
  h.pay = now;
  journal(
    g,
    host.owner,
    `${up ? "You raise" : "You cut"} ${charName(c)}'s pay to ${now} a month.`,
  );
  if (h.seat) {
    syncBerth(g, host, h);
    const life = lifeOfSeat(s, h.seat);
    if (life) {
      journal(
        g,
        life,
        `${charName(meOf(s, host.owner))} ${up ? "raises" : "cuts"} your pay aboard ${host.name} from ${was} to ${now} a month.`,
        up ? "good" : "bad",
      );
      wake(g, life, `Your pay is ${now} a month now.`);
    }
  } else if (c?.alive) {
    const d = Math.round(((now - was) / Math.max(0.5, was)) * 30);
    h.loyalty = Math.max(0, Math.min(100, h.loyalty + Math.max(-25, Math.min(15, d))));
    remembers(
      g,
      host.owner,
      c,
      up ? "Raised my pay" : "Cut my pay",
      up ? 4 : -8,
      2,
    );
  }
  return null;
}

/** Take someone off the roster: the outfit's gone, they left, or you let them go. */
function removeHire(g: ConquestGame, host: HireHost, h: Hire): void {
  host.own(g).hires = host.roster.hires.filter((x) => x !== h);
  touchLife(g, host.owner);
}

/** Let someone go. A player loses their place (it's their work). */
export function dismiss(
  g: ConquestGame,
  host: HireHost,
  id: number,
): string | null {
  const s = g.s;
  const h = hireById(host, id);
  if (!h) return "They're not aboard.";
  const c = s.chars[h.c];
  removeHire(g, host, h);
  journal(g, host.owner, `You pay off ${charName(c)} from ${host.name}.`);
  if (h.seat) {
    const life = lifeOfSeat(s, h.seat);
    if (life?.job?.berth && sameBerth(life.job.berth, host)) {
      journal(
        g,
        life,
        `${charName(meOf(s, host.owner))} pays you off from ${host.name}.`,
        "bad",
      );
      leaveJob(g, life, "when you were paid off");
      wake(g, life, `You're paid off from ${host.name}.`);
    }
  } else if (c?.alive) remembers(g, host.owner, c, "Paid me off", -10, 2);
  return null;
}

function sameBerth(b: Pick<Berth, "kind" | "seat" | "id">, host: HireHost): boolean {
  return b.kind === host.kind && b.seat === host.seat && b.id === host.id;
}

/** The outfit's gone (sold, lost): everyone's paid off. */
export function disband(g: ConquestGame, host: HireHost, why: string): void {
  const s = g.s;
  for (const h of [...host.roster.hires]) {
    removeHire(g, host, h);
    if (h.seat) {
      const life = lifeOfSeat(s, h.seat);
      if (life?.job?.berth && sameBerth(life.job.berth, host)) {
        journal(g, life, `${cap(host.name)} ${why}: you're paid off.`, "bad");
        leaveJob(g, life, `when ${host.name} ${why}`);
        wake(g, life, `${cap(host.name)} ${why}.`);
      }
    }
  }
  for (const o of [...(host.roster.offers ?? [])]) withdrawOffer(g, host, o.id);
}

// SHIPS (r21): a player who leaves their place (from the job menu, for other
// work, for being away too long) is off the roster, and its owner is told.
hooks.jobLeft.push((g, life, job) => {
  const b = job.berth;
  if (!b) return;
  const host = hostOfBerth(g.s, b);
  const h = host?.roster.hires.find((x) => x.seat === life.seat);
  if (!host || !h) return;
  removeHire(g, host, h);
  journal(
    g,
    host.owner,
    `${charName(meOf(g.s, life))} leaves ${host.name}: ${roleOf(host.ladder, h.role)?.title.toLowerCase() ?? "a place"} to fill.`,
  );
  wake(g, host.owner, `${charName(meOf(g.s, life))} leaves ${host.name}.`);
});

// A player's place: at their post wherever the outfit says (aboard, or where she lies).
hooks.atPost.push((s, life) => {
  const b = life.job?.berth;
  if (!b) return undefined;
  const host = hostOfBerth(s, b);
  if (!host) return false;
  if (life.crime?.jail) return false;
  return host.atPost(s, life);
});

// ---------------------------------------------------------------- the months

/** A month of the computer's people's pay, from the owner's purse; unpaid, they grumble and go. */
export function payRoster(g: ConquestGame, host: HireHost): void {
  const s = g.s;
  const owner = host.owner;
  for (const h of [...host.roster.hires]) {
    if (h.seat) continue;
    const c = s.chars[h.c];
    if (!c?.alive) {
      removeHire(g, host, h);
      journal(g, owner, `${charName(c)} of ${host.name} is dead.`, "bad");
      continue;
    }
    touchLife(g, owner);
    if (owner.purse >= h.pay) {
      withFlow(g, { key: host.flow.key, label: host.flow.label, aff: "boat" }, () =>
        spend(g, owner, h.pay),
      );
      h.owed = 0;
      const role = roleOf(host.ladder, h.role);
      const ask = role ? askingPay(prospectOf(s, owner, c, host.ladder), role) : h.pay;
      // Paid what they're worth, they settle in; paid well under it, they look about them.
      h.loyalty = Math.max(
        0,
        Math.min(100, h.loyalty + (h.pay >= ask ? 2 : h.pay >= ask * 0.8 ? 0 : -4)),
      );
    } else {
      h.owed = (h.owed ?? 0) + 1;
      h.loyalty = Math.max(0, h.loyalty - 20);
      journal(
        g,
        owner,
        `You couldn't pay ${charName(c)} of ${host.name} this month.`,
        "bad",
      );
    }
    if ((h.owed ?? 0) >= 2 || h.loyalty < 15) {
      removeHire(g, host, h);
      remembers(g, owner, c, (h.owed ?? 0) >= 2 ? "Never paid me" : "A poor berth", -10, 3);
      journal(
        g,
        owner,
        `${charName(c)} has had enough of ${host.name} and goes ashore for good${(h.owed ?? 0) >= 2 ? ", unpaid" : ""}.`,
        "bad",
      );
      wake(g, owner, `${charName(c)} leaves ${host.name}.`);
    }
  }
}

/** What a player in a place is owed for the month just worked: the pay by the days at their post. */
export function berthDue(life: Life): number {
  const b = life.job?.berth;
  if (!b) return 0;
  const share = Math.min(1, (life.job!.lastWorked ?? 0) / WORK_DAYS);
  return r1(b.pay * share);
}

/** A player's month in a place: paid by the owner for the days they were at their post. */
export function payBerth(g: ConquestGame, life: Life): void {
  const b = life.job?.berth;
  if (!b) return;
  const host = hostOfBerth(g.s, b);
  const h = host?.roster.hires.find((x) => x.seat === life.seat);
  if (!host || !h) return;
  const due = berthDue(life);
  if (due <= 0) return;
  const owner = host.owner;
  if (owner.purse >= due) {
    withFlow(g, { key: host.flow.key, label: host.flow.label, aff: "boat" }, () =>
      spend(g, owner, due),
    );
    withFlow(g, { key: `m:Wage: ${b.title.toLowerCase()}`, label: `Pay: ${b.title.toLowerCase()}` }, () =>
      earn(g, life, due),
    );
    h.owed = 0;
    touchLife(g, owner);
  } else {
    h.owed = (h.owed ?? 0) + 1;
    touchLife(g, owner);
    journal(
      g,
      owner,
      `You couldn't pay ${charName(meOf(g.s, life))} of ${host.name} this month (${due} due).`,
      "bad",
    );
    journal(
      g,
      life,
      `${cap(host.name)}'s owner couldn't pay you this month: ${due} owed. You can leave from your Work page.`,
      "bad",
    );
    wake(g, life, `Your pay aboard ${host.name} wasn't paid.`);
  }
}

/** Each day: places whose outfit is gone end; offers lapse; heirs keep their people on. */
export function hiresDaily(g: ConquestGame): void {
  const s = g.s;
  for (const life of s.lives) {
    const b = life.job?.berth;
    if (!b || life.c < 0) continue;
    const host = hostOfBerth(s, b);
    const kind = KINDS.get(b.kind);
    const on = host?.roster.hires.some((h) => h.seat === life.seat);
    if (!host || !on) {
      journal(g, life, `Your place is gone: ${b.title.toLowerCase()} no more${kind ? `, ${kind.gone}` : ""}.`, "bad");
      leaveJob(g, life, kind ? kind.gone : "when the place went");
      continue;
    }
    // An heir keeps the people on: the work is theirs now.
    if (life.job!.employer !== host.owner.c && host.owner.c >= 0) {
      touchLife(g, life).job!.employer = host.owner.c;
    }
    if (life.job!.prov !== host.prov) life.job!.prov = host.prov;
  }
  for (const host of allHosts(s)) {
    for (const o of [...(host.roster.offers ?? [])])
      if (o.until <= s.day || !lifeOfSeat(s, o.seat)) withdrawOffer(g, host, o.id);
    // A player's place whose life ended (or who took other work) is taken off.
    for (const h of [...host.roster.hires])
      if (h.seat) {
        const l = lifeOfSeat(s, h.seat);
        if (!l || l.c !== h.c || !l.job?.berth || !sameBerth(l.job.berth, host))
          removeHire(g, host, h);
      }
  }
}

hooks.daily.push(hiresDaily);
hooks.lifeMonthly.push(payBerth);
