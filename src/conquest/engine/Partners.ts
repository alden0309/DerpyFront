// PARTNERS (r13): going into business with someone. Articles of
// copartnership are drawn up (by an attorney or a law clerk, for a fee, if
// you like: the clauses then lean your way in a dispute) and put to the
// other party: in person, from their card or at the market, or by post to
// anyone you could write to. What the firm holds (your business, theirs, a
// new one founded together, your newspaper, or cargoes only), each side's
// share and capital, who manages, and how decisions are taken. A computer
// character signs or refuses there and then, with their reasons, as in any
// interaction (by post, their answer comes back by post). Another player
// gets a scene to sign, refuse, or send back their own terms, as often as
// it takes (up to a point); by post, wherever they are.
//
// This module also runs the track: the days and the months, the commands,
// and the hooks that tie it to letters, deaths and the month's budget.

import { dateOf } from "./Calendar";
import { Explain } from "./Explain";
import {
  avgProfit,
  bizName,
  buyoutPrice,
  castVote,
  clearFirmEvents,
  decisionCheck,
  firmMonth,
  firmMonthView,
  firmTroubles,
  heirsDaily,
  partnerDied,
  putDecision,
  resolveDecision,
  sellSeized,
  suitsDaily,
} from "./Firms";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { addressOf, correspondents, npcWrite, postRoute } from "./Letters";
import {
  beginOutcome,
  earn,
  endOutcome,
  journal,
  meet,
  milestone,
  outcomeMeta,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import {
  charSkill,
  Check,
  hasPlace,
  isChildLife,
  isNativeChar,
  lifeOfChar,
  meOf,
  no,
  opinionOf,
  peopleHere,
  skillLevel,
  yes,
} from "./LifeQueries";
import { JOBS, roleJobs, ROLES, SKILL_NAMES } from "./LifeRules";
import type { World } from "./Map";
import { wake } from "./Pace";
import {
  bizCost,
  bizJobs,
  bizRoom,
  bizSale,
  fdice,
  firmById,
  firmLine,
  firmNameOf,
  firmsOf,
  firmsWith,
  LAWYER_FEE,
  managerOf,
  MAX_FIRMS,
  MAX_ROUNDS,
  NPC_MAX_FIRMS,
  OFFER_DAYS,
  offerById,
  partnerIn,
  partners,
  partnersChanged,
  talksBetween,
  tidyPartners,
} from "./PartnersCore";
import {
  paperById,
  paperOf,
  paperValue,
  READER_PRICE,
  WRITER_WAGE,
} from "./Press";
import { ageOf, charName, hasTrait } from "./Queries";
import { rumour } from "./Rumours";
import type {
  Breakdown,
  Character,
  Firm,
  FirmBiz,
  FirmDecision,
  FirmDecisionKey,
  FirmHold,
  FirmOffer,
  FirmPartner,
  FirmTerms,
  GameState,
  JobKind,
  Letter,
  Life,
  LifeCommand,
  MapDef,
  Part,
} from "./Types";

const r2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- what a firm could hold

/** The business a computer character's trade gives them, if any. */
export function bizJobOfRole(c: Character | undefined): JobKind | null {
  if (!c?.role) return null;
  const ok = new Set(bizJobs());
  return roleJobs(c.role).find((k) => ok.has(k)) ?? null;
}

/** How big a computer character's own business is, by their means. */
export function npcBizLevel(c: Character): number {
  const wealth = c.role ? ROLES[c.role].wealth : 0;
  return wealth >= 50 ? 3 : wealth >= 25 ? 2 : 1;
}

/** Where a computer character's business is (their home). */
function npcProv(s: GameState, c: Character): number {
  return c.home ?? addressOf(s, c);
}

/** Trades whose business could be set up in a province (the place for it is there). */
export function foundable(s: GameState, w: World, p: number): JobKind[] {
  const owner = s.provinces[p]?.owner ?? -1;
  const native = owner >= 0 && s.nations[owner]?.kind === "native";
  return bizJobs().filter((k) => {
    const def = JOBS[k];
    if (def.native === false && native) return false;
    if (def.native === true && !native) return false;
    return hasPlace(s, w, p, def.places[0]);
  });
}

/** One thing the firm could hold, for the articles' first clause. */
export interface HoldChoice {
  key: string;
  label: string;
  hold: FirmHold;
  holder: number;
  id: number;
  job?: JobKind;
  level?: number;
  prov: number;
  /** Why it can't be (shown greyed), if so. */
  why?: string;
}

const town = (map: MapDef, p: number) => map.provinces[p]?.name ?? "somewhere";

/** Everything the two of you could go into business with. */
export function holdChoices(
  s: GameState,
  w: World,
  life: Life,
  c: Character,
): HoldChoice[] {
  const out: HoldChoice[] = [];
  const map = w.map;
  const inFirm = (holder: number, job?: JobKind) =>
    firmsWith(s, holder).some(
      (f) => f.biz?.job === job && f.partners.some((p) => p.c === holder),
    );
  for (const pr of life.property ?? []) {
    if (pr.kind !== "business" || !pr.job) continue;
    out.push({
      key: `mine:${pr.id}`,
      label: `Your ${pr.name} at ${town(map, pr.prov)}`,
      hold: "biz",
      holder: life.c,
      id: pr.id,
      job: pr.job,
      level: pr.level,
      prov: pr.prov,
      why: pr.hands.some((h) => lifeOfChar(s, h))
        ? "A player works there: let them go first"
        : undefined,
    });
  }
  const paper = paperOf(s, life.c);
  if (paper)
    out.push({
      key: `paper:${paper.id}`,
      label: `Your newspaper, ${paper.name}`,
      hold: "paper",
      holder: life.c,
      id: paper.id,
      prov: paper.p,
      why: firmsOf(s).some(
        (f) => f.status === "trading" && f.paper === paper.id,
      )
        ? "It's in a partnership already"
        : undefined,
    });
  const other = lifeOfChar(s, c.id);
  if (other) {
    for (const pr of other.property ?? []) {
      if (pr.kind !== "business" || !pr.job) continue;
      out.push({
        key: `theirs:${pr.id}`,
        label: `${c.first}'s ${pr.name} at ${town(map, pr.prov)}`,
        hold: "biz",
        holder: c.id,
        id: pr.id,
        job: pr.job,
        level: pr.level,
        prov: pr.prov,
      });
    }
  } else {
    const job = bizJobOfRole(c);
    if (job) {
      const level = npcBizLevel(c);
      const prov = npcProv(s, c);
      out.push({
        key: "theirs:-1",
        label: `${c.first}'s ${bizName(job, level)} at ${town(map, prov)}`,
        hold: "biz",
        holder: c.id,
        id: -1,
        job,
        level,
        prov,
        why: inFirm(c.id, job)
          ? "Their business is in a partnership already"
          : undefined,
      });
    }
  }
  if (!life.travel)
    for (const job of foundable(s, w, life.prov))
      out.push({
        key: `found:${job}`,
        label: `A new ${bizName(job, 1)} at ${town(map, life.prov)}, founded together`,
        hold: "biz",
        holder: -1,
        id: -1,
        job,
        prov: life.prov,
      });
  out.push({
    key: "venture",
    label: "A company for cargoes only",
    hold: "venture",
    holder: -1,
    id: -1,
    prov: life.travel ? life.home : life.prov,
  });
  return out;
}

// ---------------------------------------------------------------- weighing the terms

/** What a founding costs, paid from the chest at signing. */
export function foundingCost(t: FirmTerms): number {
  return t.hold === "biz" && t.holder < 0 && t.job
    ? bizCost(t.job, t.level ?? 1)
    : 0;
}

/** What each side brings: coins, and a business or a paper at what it's worth going. */
export function contributions(
  s: GameState,
  t: FirmTerms,
  firm?: Firm,
): [number, number] {
  const out: [number, number] = [t.sides[0].cap, t.sides[1].cap];
  t.sides.forEach((side, i) => {
    if (firm && i === 0) {
      out[0] += Math.max(
        10,
        firm.chest -
          firm.debt +
          (firm.biz ? bizCost(firm.biz.job, firm.biz.level) * 0.6 : 0),
      );
      return;
    }
    if (t.holder !== side.c) return;
    if (t.hold === "biz" && t.job)
      out[i] += Math.round(bizCost(t.job, t.level ?? 1) * 0.6);
    if (t.hold === "paper") {
      const x = paperById(s, t.id);
      if (x) out[i] += paperValue(x);
    }
  });
  return out;
}

/** The shares that would be fair: what each brings, and something for the work. */
export function fairShares(
  s: GameState,
  t: FirmTerms,
  firm?: Firm,
): [number, number] {
  const [a, b] = contributions(s, t, firm);
  const total = Math.max(1, a + b);
  const bonus = total * (t.hold === "venture" ? 0.1 : 0.2);
  const ma = t.sides[0].role === "managing" ? bonus : 0;
  const mb = t.sides[1].role === "managing" ? bonus : 0;
  const fa = Math.round(((a + ma) / (total + bonus)) * 100);
  return [fa, 100 - fa];
}

/** What the firm should make in a month once it's going (every hand it has room for). */
export function articlesForecast(
  s: GameState,
  t: FirmTerms,
  firm?: Firm,
): { profit: number; why: Breakdown } {
  if (firm) {
    const v = firmMonthView(s, firm, true);
    return { profit: v.profit, why: v.why };
  }
  if (t.hold === "paper") {
    const x = paperById(s, t.id);
    const income = x
      ? r2(x.readers * READER_PRICE - x.writers.length * WRITER_WAGE - 1)
      : 0;
    return {
      profit: income,
      why: {
        total: income,
        parts: [
          { label: "The paper's sales, less its writers", value: income },
        ],
      },
    };
  }
  if (t.hold !== "biz" || !t.job)
    return { profit: 0, why: { total: 0, parts: [] } };
  const level = t.level ?? 1;
  const biz: FirmBiz = {
    job: t.job,
    place: JOBS[t.job].places[0],
    level,
    hands: bizRoom(level),
    name: bizName(t.job, level),
  };
  const pseudo = {
    biz,
    prov: t.prov,
    debt: 0,
    partners: t.sides.map(
      (x): FirmPartner => ({
        c: x.c,
        share: x.share,
        role: x.role,
        capital: x.cap,
        since: 0,
        drawn: 0,
      }),
    ),
  };
  const v = firmMonthView(s, pseudo, true);
  return { profit: v.profit, why: v.why };
}

/** Has someone been caught keeping a second set of books? */
export function caughtCheating(s: GameState, c: number): boolean {
  return firmsOf(s).some((f) =>
    f.partners.some((p) => p.c === c && (p.caught ?? 0) > 0),
  );
}

/**
 * Whether a computer character would sign, and every reason for and
 * against: what they think of you, trust, the terms, their means and their
 * trade.
 */
export function articlesAcceptance(
  s: GameState,
  t: FirmTerms,
  npc: Character,
  asker: Life,
  firm?: Firm,
): Breakdown {
  const e = new Explain();
  const i = t.sides[0].c === npc.id ? 0 : 1;
  const mine = t.sides[i];
  const yours = t.sides[1 - i];
  e.add("Going into business is no small thing", -8);
  const op = opinionOf(s, npc, asker).total;
  e.add(`What ${npc.first} thinks of you (${op})`, Math.round(op / 3), true);
  const tie = asker.ties[npc.id];
  if (tie === "friend") e.add("A friend", 8);
  if (tie === "rival" || tie === "nemesis") e.add("They can't abide you", -30);
  const fame = Math.min(8, Math.floor(asker.renown / 6));
  if (fame) e.add(`Your name (renown ${Math.floor(asker.renown)})`, fame);
  if (caughtCheating(s, asker.c))
    e.add("Talk of how you kept your last partner's books", -25);
  if (t.lawyer >= 0) e.add("Articles drawn up by a lawyer", 4);
  // Their trade.
  const theirs = roleJobs(npc.role);
  const means = npc.role ? ROLES[npc.role] : null;
  if (t.hold === "biz" && t.holder === npc.id)
    e.add("Capital for their own business", 6);
  else if (t.job && theirs.includes(t.job)) e.add("Their own trade", 12);
  else if (
    t.hold === "venture" &&
    (npc.role === "merchant" || npc.role === "captain")
  )
    e.add("Cargoes are their business", 8);
  else if (means && means.status >= 4 && means.wealth >= 40)
    e.add("Money to put to work", 4);
  else e.add("Not their line of business", -12);
  // What it should make.
  const fc = articlesForecast(s, t, firm);
  if (t.hold === "venture")
    e.add(
      "A gamble on cargoes",
      npc.role === "merchant" || npc.role === "captain" ? 0 : -4,
    );
  else
    e.add(
      `What it should make: ${fc.profit} a month`,
      Math.max(-15, Math.min(15, Math.round(fc.profit * 2))),
      true,
    );
  // The terms.
  const fair = fairShares(s, t, firm)[i];
  const diff = mine.share - fair;
  if (diff >= 0)
    e.add(
      `Their share, ${mine.share} in a hundred (fair is ${fair})`,
      Math.min(20, Math.round(diff * 0.8)),
      true,
    );
  else
    e.add(
      `The terms favour you: ${mine.share} in a hundred (fair is ${fair})`,
      Math.max(-45, Math.round(diff * 1.2)),
    );
  // Their means.
  const wealth = means?.wealth ?? 5;
  if (mine.cap > wealth)
    e.add(
      `More than they could put in (${mine.cap}; they have ${wealth})`,
      -30,
    );
  else if (mine.cap > wealth * 0.6) e.add("A good part of all they have", -8);
  // Who does the work.
  if (t.hold === "biz" && t.holder === npc.id && mine.role !== "managing")
    e.add("Hand over the running of their own business? Never", -30);
  if (t.job) {
    const main = JOBS[t.job].main;
    if (mine.role === "managing") {
      const sk = charSkill(s, npc, main);
      if (sk < 4)
        e.add(
          `They don't know the trade (${SKILL_NAMES[main].toLowerCase()} ${sk})`,
          -12,
        );
      else e.add("Glad to run it", 3);
    } else if (yours.role === "managing") {
      const sk = skillLevel(s, asker, main);
      e.add(
        `Your ${SKILL_NAMES[main].toLowerCase()} (${sk})`,
        Math.max(-10, Math.min(8, sk - 5)),
        true,
      );
    }
  }
  // Their nature.
  if (hasTrait(npc, "content")) e.add("Content as they are", -8);
  if (hasTrait(npc, "ambitious")) e.add("Ambitious", 6);
  if (hasTrait(npc, "greedy"))
    e.add(
      diff >= 0 ? "Greedy, and it pays" : "Greedy: they want more",
      diff >= 0 ? 5 : -5,
    );
  if (hasTrait(npc, "honest") && caughtCheating(s, asker.c))
    e.add("Honest: they won't deal with a cheat", -10);
  // How things are decided.
  if (mine.share < 50)
    e.add(
      t.rule === "unanimous"
        ? "A say in everything (all must agree)"
        : "You'd outvote them",
      t.rule === "unanimous" ? 4 : -4,
    );
  const n = firmsWith(s, npc.id).length;
  if (n) e.add(`In ${n} partnership${n > 1 ? "s" : ""} already`, -10 * n);
  if (npc.home !== undefined && npc.home !== t.prov && mine.role === "managing")
    e.add("They'd have to move to run it", -10);
  return e.done(0);
}

// ---------------------------------------------------------------- the articles

/** The lawyers here who could draw up the articles, and their fee. */
export function lawyersHere(
  s: GameState,
  life: Life,
): { c: number; fee: number; title: string }[] {
  if (life.travel) return [];
  const out: { c: number; fee: number; title: string }[] = [];
  if (life.job?.kind === "law")
    out.push({ c: life.c, fee: 0, title: "Yourself" });
  for (const c of peopleHere(s, life.prov, life)) {
    const pl = lifeOfChar(s, c.id);
    if (pl) {
      if (pl.job?.kind === "law" && !pl.watching)
        out.push({
          c: c.id,
          fee: pl.job.rank >= 1 ? LAWYER_FEE.attorney : LAWYER_FEE.clerk,
          title: JOBS.law.ranks[pl.job.rank]?.title ?? "Law clerk",
        });
    } else if (c.role === "lawyer")
      out.push({ c: c.id, fee: LAWYER_FEE.attorney, title: "Attorney" });
  }
  return out.slice(0, 4);
}

/** The lawyer's fee for these articles (nothing if you draw them yourself). */
function lawyerFee(s: GameState, life: Life, t: FirmTerms): number {
  if (t.lawyer < 0 || t.lawyer === life.c) return 0;
  return lawyersHere(s, life).find((x) => x.c === t.lawyer)?.fee ?? -1;
}

/** "the inn at Jamestown", "a new shop at Jamestown", "The Boston Gazette". */
export function holdWords(s: GameState, map: MapDef, t: FirmTerms): string {
  if (t.hold === "venture") return "cargoes, to be bought and shipped";
  if (t.hold === "paper") return paperById(s, t.id)?.name ?? "a newspaper";
  const name = t.job ? bizName(t.job, t.level ?? 1) : "business";
  return t.holder < 0
    ? `a new ${name} at ${town(map, t.prov)}`
    : `the ${name} at ${town(map, t.prov)}`;
}

const parts = (n: number) =>
  n % 10 === 0 && n % 20 !== 0
    ? `${n / 10} parts in ten`
    : `${n} parts in a hundred`;

/** The articles, as the clerk would write them out. */
export function articlesText(
  s: GameState,
  map: MapDef,
  t: FirmTerms,
  day = s.day,
): string {
  const [a, b] = t.sides.map((x) => s.chars[x.c]);
  const d = dateOf(day);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const nth = (n: number) =>
    `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
  const brings = (i: 0 | 1) => {
    const side = t.sides[i];
    const what: string[] = [];
    if (t.holder === side.c)
      what.push(
        t.hold === "paper"
          ? "the paper, its press and subscribers"
          : `the ${t.job ? bizName(t.job, t.level ?? 1) : "business"} and its stock`,
      );
    if (side.cap > 0) what.push(`${side.cap} coins`);
    return what.join(" and ") || "nothing but their labour";
  };
  const mgr = t.sides.find((x) => x.role === "managing");
  const lawyer = t.lawyer >= 0 ? s.chars[t.lawyer] : undefined;
  return `Articles of Agreement, made the ${nth(d.day)} day of ${months[d.month]} ${d.year}, between ${charName(a)} and ${charName(b)}: that they shall be copartners in ${holdWords(s, map, t)}, under the name and firm of ${t.name}. ${a?.first ?? "The one"} to bring in ${brings(0)}; ${b?.first ?? "the other"} ${brings(1)}. The profit and loss to be divided, ${a?.family ?? "the one"} ${parts(t.sides[0].share)} and ${b?.family ?? "the other"} ${parts(t.sides[1].share)}. ${mgr ? `${charName(s.chars[mgr.c])} to manage the business and keep the books.` : ""} Nothing of moment to be done without the consent of ${t.rule === "unanimous" ? "all the partners" : "the greater part in interest"}.${lawyer ? ` Drawn up by ${charName(lawyer)}.` : ""}`;
}

/** The post to someone: days, postage, the chance it's lost. */
export function routeTo(
  s: GameState,
  map: MapDef,
  life: Life,
  c: Character,
): ReturnType<typeof postRoute> {
  const me = meOf(s, life);
  const war =
    !!me && s.wars.some((x) => x.a === me.nation || x.b === me.nation);
  return postRoute(s, map, life.prov, addressOf(s, c), war);
}

/** Can these articles be put now (in person, or by post)? */
export function termsCheck(
  s: GameState,
  w: World,
  life: Life,
  t: FirmTerms,
  post: boolean,
): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're grown.");
  if (life.travel) return no("Not from the road.");
  if (!t || !Array.isArray(t.sides) || t.sides.length !== 2)
    return no("The articles are wanting.");
  const [a, b] = t.sides;
  if (a.c !== me.id) return no("The articles are yours to put.");
  const c = s.chars[b.c];
  if (!c?.alive || c.abroad) return no("They're gone.");
  if (c.id === me.id) return no("A partnership with yourself?");
  if (ageOf(s, c) < 16) return no("They're a child.");
  if (firmsWith(s, me.id).length >= MAX_FIRMS)
    return no(`You're in ${MAX_FIRMS} partnerships already.`);
  const other = lifeOfChar(s, c.id);
  if (firmsWith(s, c.id).length >= (other ? MAX_FIRMS : NPC_MAX_FIRMS))
    return no("They have partners enough.");
  if (talksBetween(s, me.id, c.id))
    return no("You're in talks with them already.");
  if (post) {
    if (!correspondents(s, life).includes(c.id))
      return no("You don't know of them.");
    if (!routeTo(s, w.map, life, c)) return no("No post goes there.");
  } else if (!peopleHere(s, life.prov, life).some((x) => x.id === c.id))
    return no("They're not here: write to them.");
  // The shares, the capital, who manages.
  for (const x of t.sides) {
    if (!Number.isInteger(x.share) || x.share < 5 || x.share > 95)
      return no("Each share must be 5 to 95 in a hundred.");
    if (!Number.isInteger(x.cap) || x.cap < 0 || x.cap > 999)
      return no("Capital is 0 to 999 coins.");
    if (x.role !== "managing" && x.role !== "silent")
      return no("Choose roles.");
  }
  if (a.share + b.share !== 100) return no("The shares must make a hundred.");
  if (t.sides.filter((x) => x.role === "managing").length !== 1)
    return no("One of you manages the business.");
  if (t.rule !== "majority" && t.rule !== "unanimous")
    return no("How is it decided?");
  const name = (t.name ?? "").trim();
  if (name.length < 3 || name.length > 40) return no("Name the firm.");
  // What it holds.
  if (t.hold === "biz") {
    if (!t.job || !bizJobs().includes(t.job)) return no("What business?");
    if (t.holder === me.id) {
      const pr = (life.property ?? []).find((x) => x.id === t.id);
      if (!pr || pr.kind !== "business" || pr.job !== t.job)
        return no("That's not your business.");
      if (pr.hands.some((h) => lifeOfChar(s, h)))
        return no("A player works there: let them go first.");
      if (t.prov !== pr.prov || t.level !== pr.level)
        return no("The articles don't match your business.");
    } else if (t.holder === c.id) {
      if (other) {
        const pr = (other.property ?? []).find((x) => x.id === t.id);
        if (!pr || pr.kind !== "business")
          return no("That's not their business.");
        if (t.prov !== pr.prov || t.level !== pr.level || t.job !== pr.job)
          return no("The articles don't match their business.");
      } else {
        if (bizJobOfRole(c) !== t.job) return no("That's not their trade.");
        if (t.prov !== npcProv(s, c) || t.level !== npcBizLevel(c))
          return no("The articles don't match their business.");
        if (firmsWith(s, c.id).some((f) => f.biz?.job === t.job))
          return no("Their business is in a partnership already.");
      }
    } else if (t.holder === -1) {
      if (t.prov !== life.prov)
        return no("A business is founded where you are.");
      if (!foundable(s, w, t.prov).includes(t.job))
        return no(`${town(w.map, t.prov)} has no place for it.`);
      const lv = t.level ?? 1;
      if (lv < 1 || lv > 3) return no("How big?");
      const cost = foundingCost(t);
      if (a.cap + b.cap < cost)
        return no(
          `Setting it up costs ${cost}: put in at least that between you.`,
        );
    } else return no("Who brings the business?");
  } else if (t.hold === "paper") {
    const x = paperById(s, t.id);
    if (!x || x.owner !== me.id || t.holder !== me.id)
      return no("That's not your paper.");
    if (firmsOf(s).some((f) => f.status === "trading" && f.paper === x.id))
      return no("It's in a partnership already.");
    if (a.role !== "managing") return no("The paper's owner keeps its books.");
    if (t.prov !== x.p) return no("The articles don't match your paper.");
  } else if (t.hold === "venture") {
    if (a.cap + b.cap < 10)
      return no("A company for cargoes needs 10 coins at least.");
  } else return no("What will the firm hold?");
  // A lawyer, and the money.
  const fee = lawyerFee(s, life, t);
  if (fee < 0) return no("That lawyer isn't here.");
  const postage = post ? (routeTo(s, w.map, life, c)?.cost ?? 0) : 0;
  const need = a.cap + Math.max(0, fee) + postage;
  if (life.purse < need)
    return no(
      `Your capital${fee > 0 ? `, the lawyer's fee` : ""}${postage ? " and the postage" : ""}: ${Math.ceil(need)} coins.`,
    );
  return yes;
}

/** Fair articles to start from, for a choice of what the firm holds. */
export function suggestTerms(
  s: GameState,
  w: World,
  life: Life,
  c: Character,
  choice: HoldChoice,
  level = 1,
): FirmTerms {
  const me = meOf(s, life)!;
  const job = choice.job;
  const lv =
    choice.holder < 0 && choice.hold === "biz" ? level : (choice.level ?? 1);
  const mineManages =
    choice.holder !== c.id ||
    (choice.hold === "paper" && choice.holder === me.id);
  const t: FirmTerms = {
    hold: choice.hold,
    holder: choice.holder,
    id: choice.id,
    ...(job ? { job } : {}),
    ...(choice.hold === "biz" ? { level: lv } : {}),
    prov: choice.prov,
    sides: [
      {
        c: me.id,
        share: 50,
        cap: 0,
        role: mineManages ? "managing" : "silent",
      },
      { c: c.id, share: 50, cap: 0, role: mineManages ? "silent" : "managing" },
    ],
    rule: "majority",
    lawyer: -1,
    name: firmNameOf(
      mineManages ? [me.family, c.family] : [c.family, me.family],
    ),
  };
  const round5 = (v: number) => Math.max(0, Math.round(v / 5) * 5);
  const wealth = c.role ? ROLES[c.role].wealth : 5;
  if (choice.hold === "biz" && choice.holder === me.id && job)
    t.sides[1].cap = Math.min(
      round5(bizCost(job, lv) * 0.3),
      round5(wealth / 2),
    );
  else if (choice.hold === "biz" && choice.holder === c.id && job)
    t.sides[0].cap = round5(bizCost(job, lv) * 0.4);
  else if (choice.hold === "biz" && job) {
    const each = round5(bizCost(job, lv) * 0.6);
    t.sides[0].cap = each;
    t.sides[1].cap = Math.min(each, round5(wealth * 0.5));
    t.sides[0].cap = Math.max(each, bizCost(job, lv) - t.sides[1].cap + 5);
  } else if (choice.hold === "paper") {
    const x = paperById(s, choice.id);
    t.sides[1].cap = round5((x ? paperValue(x) : 30) * 0.4);
  } else {
    t.sides[0].cap = 20;
    t.sides[1].cap = Math.min(20, round5(wealth / 2));
  }
  const fair = fairShares(s, t)[0];
  t.sides[0].share = Math.max(5, Math.min(95, Math.round(fair / 5) * 5));
  t.sides[1].share = 100 - t.sides[0].share;
  return t;
}

// ---------------------------------------------------------------- putting them

/** A letter of the PARTNERS track, from a player, on its way. */
function pushLetter(g: ConquestGame, life: Life, l: Letter): void {
  touchLife(g, life);
  (life.post ??= []).push(l);
}

/** Send articles (or a notice about them) by post. */
function sendByPost(
  g: ConquestGame,
  life: Life,
  o: FirmOffer | null,
  to: number,
  text: string,
): Letter | null {
  const s = g.s;
  const c = s.chars[to];
  if (!c) return null;
  const route = routeTo(s, g.map, life, c);
  if (!route) return null;
  spend(g, life, route.cost);
  const r = fdice(g);
  let days = route.days;
  for (let i = 0; i < route.sea; i++) days += r.int(-3, 6);
  const l: Letter = {
    id: g.nextId(),
    kind: "articles",
    from: life.c,
    to,
    origin: life.prov,
    dest: addressOf(s, c),
    sent: s.day,
    arrive: s.day + Math.max(1, days),
    bySea: route.sea > 0,
    status: "transit",
    text,
    ...(o ? { arg: o.id } : {}),
    ask: false,
  };
  pushLetter(g, life, l);
  return l;
}

/** Tell the other party something about the articles: now if they're here, by post if not. */
function noticeTo(g: ConquestGame, life: Life, to: number, text: string): void {
  const s = g.s;
  const other = lifeOfChar(s, to);
  if (!other) return;
  const here = !other.travel && !life.travel && other.prov === life.prov;
  if (here) {
    journal(g, other, text);
    wake(g, other, text);
  } else sendByPost(g, life, null, to, text);
}

/** Put the articles to someone. */
export function proposeArticles(
  g: ConquestGame,
  life: Life,
  t: FirmTerms,
  post: boolean,
): string | null {
  const s = g.s;
  const check = termsCheck(s, g.w, life, t, post);
  if (!check.ok) return check.why;
  const me = meOf(s, life)!;
  const c = s.chars[t.sides[1].c];
  const terms: FirmTerms = JSON.parse(JSON.stringify(t));
  terms.name = terms.name.trim();
  // The lawyer is paid for drawing them up, whatever comes of them.
  const fee = lawyerFee(s, life, terms);
  if (fee > 0) {
    spend(g, life, fee);
    const ll = lifeOfChar(s, terms.lawyer);
    if (ll) {
      earn(g, ll, fee);
      journal(
        g,
        ll,
        `You draw up articles of copartnership for ${charName(me)}: ${fee} coins.`,
        "good",
      );
    } else if (s.chars[terms.lawyer])
      remembers(g, life, g.char(terms.lawyer), "Paid my fee", 3, 1);
  }
  const o: FirmOffer = {
    id: g.nextId(),
    from: me.id,
    to: c.id,
    terms,
    firm: -1,
    day: s.day,
    letter: -1,
    round: 0,
    status: "open",
    ...(terms.lawyer >= 0 ? { drafted: me.id } : {}),
  };
  partners(g).offers.push(o);
  partnersChanged(g, "o");
  meet(g, life, c.id);
  outcomeMeta(g, life, { c: c.id });
  if (post) {
    const l = sendByPost(g, life, o, c.id, articlesText(s, g.map, terms));
    if (!l) {
      o.status = "lapsed";
      return "No post goes there.";
    }
    o.status = "post";
    o.letter = l.id;
    journal(
      g,
      life,
      `You send articles of copartnership to ${charName(c)} at ${town(g.map, l.dest)}: they should arrive in about ${Math.max(1, l.arrive - s.day)} days${l.bySea ? ", by ship" : ""}.`,
    );
    outcomeMeta(g, life, { ok: null, kind: "proposal", scene: "letter" });
    return null;
  }
  return deliverHere(g, life, o);
}

/** The articles put in person: a player is asked; anyone else decides at once. */
function deliverHere(g: ConquestGame, life: Life, o: FirmOffer): string | null {
  const s = g.s;
  const c = s.chars[o.to];
  const other = lifeOfChar(s, o.to);
  const name = charName(c);
  const firm = o.firm >= 0 ? firmById(s, o.firm) : undefined;
  if (other) {
    o.status = "open";
    o.day = s.day;
    raiseEvent(g, other, "p2p-articles", { c: o.from, o: o.id });
    wake(
      g,
      other,
      `${charName(s.chars[o.from])} puts articles of copartnership to you.`,
    );
    journal(
      g,
      life,
      `You put the articles to ${name}. It's for ${c.female ? "her" : "him"} to say.`,
    );
    outcomeMeta(g, life, { ok: null, kind: "proposal" });
    partnersChanged(g, "o");
    return null;
  }
  const b = articlesAcceptance(s, o.terms, c, life, firm);
  if (b.total > 0) {
    const err = sign(g, o);
    if (err) {
      o.status = "lapsed";
      return err;
    }
    outcomeMeta(g, life, { ok: true });
    return null;
  }
  o.status = "refused";
  partnersChanged(g, "o");
  const worst = [...b.parts]
    .filter((p) => !p.mul && p.value < 0)
    .sort((x, y) => x.value - y.value)
    .slice(0, 2)
    .map((p) => p.label.replace(/\.$/, "").toLowerCase());
  journal(
    g,
    life,
    `${name} won't sign: ${worst.join("; ") || "they'd rather not"}.`,
    "bad",
  );
  outcomeMeta(g, life, { ok: false });
  return null;
}

/** A player answers articles put to them: they sign. */
export function signArticles(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const s = g.s;
  const o = offerById(s, id);
  if (!o || o.to !== life.c || o.status !== "open")
    return "There's nothing to sign.";
  const err = sign(g, o);
  if (err) return err;
  clearOfferEvent(g, life, o.id);
  const f =
    o.firm >= 0 ? firmById(s, o.firm) : firmsOf(s)[firmsOf(s).length - 1];
  noticeTo(
    g,
    life,
    o.from,
    `${charName(s.chars[life.c])} has signed the articles: ${f?.name ?? "the firm"} is in business.`,
  );
  return null;
}

/** A player turns the articles down. */
export function refuseArticles(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const s = g.s;
  const o = offerById(s, id);
  if (!o || o.to !== life.c || o.status !== "open")
    return "There's nothing to answer.";
  o.status = "refused";
  partnersChanged(g, "o");
  clearOfferEvent(g, life, o.id);
  journal(g, life, `You decline ${charName(s.chars[o.from])}'s articles.`);
  noticeTo(
    g,
    life,
    o.from,
    `${charName(s.chars[life.c])} has declined your articles of copartnership.`,
  );
  return null;
}

/** A player sends back their own terms: their share, their capital and the other's. */
export function counterArticles(
  g: ConquestGame,
  life: Life,
  id: number,
  share: number,
  mine: number,
  theirs: number,
): string | null {
  const s = g.s;
  const o = offerById(s, id);
  if (!o || o.to !== life.c || o.status !== "open")
    return "There's nothing to answer.";
  if (o.firm >= 0)
    return "A firm's terms for a new partner are take them or leave them.";
  if (o.round >= MAX_ROUNDS)
    return "You've gone back and forth enough: sign, or refuse.";
  const other = lifeOfChar(s, o.from);
  if (!other || other.watching) return "They can't answer now.";
  const i = o.terms.sides[0].c === life.c ? 0 : 1;
  const t: FirmTerms = JSON.parse(JSON.stringify(o.terms));
  for (const v of [share, mine, theirs])
    if (!Number.isInteger(v)) return "Whole numbers, please.";
  if (share < 5 || share > 95) return "A share of 5 to 95.";
  if (mine < 0 || mine > 999 || theirs < 0 || theirs > 999)
    return "Capital is 0 to 999 coins.";
  t.sides[i].share = share;
  t.sides[1 - i].share = 100 - share;
  t.sides[i].cap = mine;
  t.sides[1 - i].cap = theirs;
  const cost = foundingCost(t);
  if (t.hold === "biz" && t.holder < 0 && mine + theirs < cost)
    return `Setting it up costs ${cost}: put in at least that between you.`;
  if (t.hold === "venture" && mine + theirs < 10)
    return "A company for cargoes needs 10 coins at least.";
  if (life.purse < mine) return `You haven't ${mine} coins.`;
  const here = !other.travel && !life.travel && other.prov === life.prov;
  if (!here) {
    const route = routeTo(s, g.map, life, s.chars[o.from]);
    if (!route) return "No post goes there.";
    if (life.purse < mine + route.cost) return "Your capital and the postage.";
  }
  clearOfferEvent(g, life, o.id);
  o.terms = t;
  [o.from, o.to] = [o.to, o.from];
  o.round++;
  o.day = s.day;
  partnersChanged(g, "o");
  const name = charName(s.chars[o.to]);
  outcomeMeta(g, life, { c: o.to, ok: null, kind: "proposal" });
  if (here) {
    raiseEvent(g, other, "p2p-articles", { c: o.from, o: o.id });
    wake(
      g,
      other,
      `${charName(s.chars[o.from])} sends back terms of their own.`,
    );
    journal(g, life, `You put your own terms to ${name}.`);
    return null;
  }
  const l = sendByPost(g, life, o, o.to, articlesText(s, g.map, t));
  if (!l) return "No post goes there.";
  o.status = "post";
  o.letter = l.id;
  journal(
    g,
    life,
    `You send your own terms back to ${name} by post: about ${Math.max(1, l.arrive - s.day)} days.`,
  );
  return null;
}

function clearOfferEvent(g: ConquestGame, life: Life, id: number): void {
  const before = life.events.length;
  life.events = life.events.filter(
    (e) => !(e.key === "p2p-articles" && e.ctx.o === id),
  );
  if (before !== life.events.length) touchLife(g, life);
}

/** A letter of articles reaches its reader (Letters.ts asks). */
function articlesArrive(g: ConquestGame, writer: Life, l: Letter): boolean {
  if (l.kind !== "articles") return false;
  const s = g.s;
  touchLife(g, writer);
  l.status = "delivered";
  const o = l.arg !== undefined ? offerById(s, l.arg) : undefined;
  const reader = lifeOfChar(s, l.to);
  const from = s.chars[l.from];
  if (reader) {
    pushLetter(g, reader, { ...l, read: false, done: true });
    journal(
      g,
      reader,
      o && o.letter === l.id && o.status === "post"
        ? `A letter from ${charName(from)}: articles of copartnership, for your answer.`
        : `A letter from ${charName(from)}: ${l.text}`,
    );
  }
  if (!o || o.letter !== l.id || o.status !== "post") return true;
  if (reader) {
    o.status = "open";
    o.day = s.day;
    raiseEvent(g, reader, "p2p-articles", { c: l.from, o: o.id });
    wake(g, reader, `Articles of copartnership from ${charName(from)}.`);
  } else {
    // A computer character reads them and writes back.
    const npc = s.chars[l.to];
    const firm = o.firm >= 0 ? firmById(s, o.firm) : undefined;
    const b = articlesAcceptance(s, o.terms, npc, writer, firm);
    const yesA = b.total > 0;
    const worst = [...b.parts]
      .filter((p) => !p.mul && p.value < 0)
      .sort((x, y) => x.value - y.value)[0];
    const text = yesA
      ? `I have your articles, and I like them. Here they are, signed and witnessed: let us be ${o.terms.name}, and may we both do well by it.`
      : `I have read your articles with care, and I must decline them: ${worst ? worst.label.toLowerCase() : "I would rather not"}.`;
    const back = npcWrite(
      g,
      writer,
      npc,
      "reply",
      `${npc.female ? "Madam" : "Sir"}, ${text} ${charName(npc)}`,
      {
        re: l.id,
        answer: {
          yes: yesA,
          why: b,
          text: `${npc.first} ${yesA ? "signs" : "won't sign"}`,
          day: s.day,
        },
      },
    );
    if (back) back.answer!.day = back.arrive;
    o.status = "answered";
    o.yes = yesA;
    o.letter = back?.id ?? -1;
  }
  partnersChanged(g, "o");
  return true;
}

// ---------------------------------------------------------------- signing

/**
 * The articles are signed: the money's paid in, the business (or the
 * paper) is brought in or set up, and the firm opens its books.
 */
function sign(g: ConquestGame, o: FirmOffer): string | null {
  const s = g.s;
  const t = o.terms;
  if (o.firm >= 0) return admitNewcomer(g, o);
  for (const x of t.sides) {
    const c = s.chars[x.c];
    if (!c?.alive) return "One of you is gone.";
    const l = lifeOfChar(s, x.c);
    if (l && l.purse < x.cap)
      return `${charName(c)} hasn't the ${x.cap} coins.`;
    if (l && firmsWith(s, x.c).length >= MAX_FIRMS)
      return `${charName(c)} is in ${MAX_FIRMS} partnerships already.`;
  }
  let biz: FirmBiz | null = null;
  const capital = [t.sides[0].cap, t.sides[1].cap];
  const holderAt = t.sides.findIndex((x) => x.c === t.holder);
  let cost = 0;
  if (t.hold === "biz" && t.job) {
    if (t.holder >= 0) {
      const hl = lifeOfChar(s, t.holder);
      if (hl) {
        const pr = (hl.property ?? []).find(
          (x) => x.id === t.id && x.kind === "business",
        );
        if (!pr) return "The business isn't there to bring in.";
        hl.property = (hl.property ?? []).filter((x) => x !== pr);
        touchLife(g, hl);
        biz = {
          job: pr.job!,
          place: pr.place ?? JOBS[pr.job!].places[0],
          level: pr.level,
          hands: pr.hands.length,
          name: bizName(pr.job!, pr.level),
        };
      } else {
        const lv = t.level ?? 1;
        biz = {
          job: t.job,
          place: JOBS[t.job].places[0],
          level: lv,
          hands: bizRoom(lv),
          name: bizName(t.job, lv),
        };
      }
      if (holderAt >= 0) capital[holderAt] += bizSale(biz.level);
    } else {
      const lv = t.level ?? 1;
      cost = bizCost(t.job, lv);
      if (t.sides[0].cap + t.sides[1].cap < cost)
        return `Setting it up costs ${cost}.`;
      // Setting it up takes on its hands with its stock.
      biz = {
        job: t.job,
        place: JOBS[t.job].places[0],
        level: lv,
        hands: bizRoom(lv),
        name: bizName(t.job, lv),
      };
    }
  }
  if (t.hold === "paper") {
    const x = paperById(s, t.id);
    if (!x || x.owner !== t.holder) return "The paper isn't theirs to bring.";
    if (holderAt >= 0) capital[holderAt] += paperValue(x);
  }
  for (const x of t.sides) {
    const l = lifeOfChar(s, x.c);
    if (l && x.cap > 0) spend(g, l, x.cap);
  }
  const f: Firm = {
    id: g.nextId(),
    name: t.name,
    hold: t.hold,
    biz,
    ...(t.hold === "paper" ? { paper: t.id } : {}),
    prov: t.prov,
    partners: t.sides.map(
      (x, i): FirmPartner => ({
        c: x.c,
        share: x.share,
        role: x.role,
        capital: r2(capital[i]),
        since: s.day,
        drawn: 0,
      }),
    ),
    chest: r2(t.sides[0].cap + t.sides[1].cap - cost),
    debt: 0,
    rule: t.rule,
    lawyer: t.lawyer,
    drafted: o.drafted ?? -1,
    founded: s.day,
    status: "trading",
    cargo: null,
    books: [],
    decisions: [],
    lines: [],
  };
  partners(g).firms.push(f);
  o.status = "signed";
  const [a, b] = t.sides.map((x) => s.chars[x.c]);
  const place = town(g.map, t.prov);
  const what = holdWords(s, g.map, t);
  firmLine(
    g,
    f,
    `Articles of copartnership signed by ${charName(a)} and ${charName(b)}: ${what}.${cost ? ` ${cost} laid out to set it up.` : ""}`,
  );
  for (const [x, other] of [
    [t.sides[0], b],
    [t.sides[1], a],
  ] as const) {
    const l = lifeOfChar(s, x.c);
    if (l) {
      journal(
        g,
        l,
        `You and ${charName(other)} sign articles of copartnership: ${t.name}, in ${what}. Your share is ${x.share} in a hundred${x.cap ? `, for ${x.cap} coins of capital` : ""}; you are the ${x.role === "managing" ? "managing" : "silent"} partner.`,
        "good",
      );
      milestone(g, l, "job", `Went into partnership: ${t.name}`, t.prov);
    } else {
      const al = lifeOfChar(s, (x.c === a.id ? b : a).id);
      if (al) remembers(g, al, g.char(x.c), "Went into business with me", 8, 4);
    }
  }
  rumour(
    g,
    t.prov,
    `${charName(a)} and ${charName(b)} have gone into partnership at ${place} as ${t.name}, in ${what}.`,
    a.id,
    "good",
  );
  partnersChanged(g, "o");
  partnersChanged(g, "f");
  return null;
}

/** A newcomer signs: their capital into the chest, everyone else's share shrinks. */
function admitNewcomer(g: ConquestGame, o: FirmOffer): string | null {
  const s = g.s;
  const f = firmById(s, o.firm);
  if (!f || f.status !== "trading") return "The firm is gone.";
  const side = o.terms.sides[1];
  const c = s.chars[side.c];
  if (!c?.alive) return "They're gone.";
  if (partnerIn(f, c.id)) return "They're a partner already.";
  const l = lifeOfChar(s, c.id);
  if (l && l.purse < side.cap)
    return `${charName(c)} hasn't the ${side.cap} coins.`;
  if (l && side.cap) spend(g, l, side.cap);
  const scale = (100 - side.share) / 100;
  let left = 100 - side.share;
  f.partners.forEach((p, i) => {
    const v =
      i === f.partners.length - 1
        ? Math.round(left * 10) / 10
        : Math.round(p.share * scale * 10) / 10;
    left -= v;
    p.share = v;
  });
  f.partners.push({
    c: c.id,
    share: side.share,
    role: "silent",
    capital: side.cap,
    since: s.day,
    drawn: 0,
  });
  f.chest = r2(f.chest + side.cap);
  o.status = "signed";
  firmLine(
    g,
    f,
    `${charName(c)} comes into the firm: ${side.share} in a hundred, for ${side.cap} coins.`,
  );
  for (const p of f.partners)
    if (p.c !== c.id)
      lifeOfChar(s, p.c) &&
        journal(
          g,
          lifeOfChar(s, p.c)!,
          `${charName(c)} is a partner in ${f.name} now.`,
          "good",
        );
  if (l)
    journal(
      g,
      l,
      `You come into ${f.name} as a partner: ${side.share} in a hundred, for ${side.cap} coins.`,
      "good",
    );
  partnersChanged(g, "f");
  partnersChanged(g, "o");
  return null;
}

/** The partners agreed to take someone in: put it to them. */
export function askNewcomer(g: ConquestGame, f: Firm, d: FirmDecision): void {
  const s = g.s;
  const by = lifeOfChar(s, d.by);
  const c = s.chars[d.c];
  if (!by || !c?.alive) return;
  const mgr = managerOf(f);
  const terms: FirmTerms = {
    hold: f.hold,
    holder: -1,
    id: f.paper ?? -1,
    ...(f.biz ? { job: f.biz.job, level: f.biz.level } : {}),
    prov: f.prov,
    sides: [
      {
        c: d.by,
        share: 100 - d.arg,
        cap: 0,
        role: mgr?.c === d.by ? "managing" : "managing",
      },
      { c: c.id, share: d.arg, cap: d.cap ?? 0, role: "silent" },
    ],
    rule: f.rule,
    lawyer: -1,
    name: f.name,
  };
  const o: FirmOffer = {
    id: g.nextId(),
    from: d.by,
    to: c.id,
    terms,
    firm: f.id,
    day: s.day,
    letter: -1,
    round: 0,
    status: "open",
  };
  partners(g).offers.push(o);
  partnersChanged(g, "o");
  const here =
    peopleHere(s, by.prov, by).some((x) => x.id === c.id) && !by.travel;
  if (here) {
    const err = deliverHere(g, by, o);
    if (err) journal(g, by, err, "bad");
    return;
  }
  const l = sendByPost(
    g,
    by,
    o,
    c.id,
    `${articlesText(s, g.map, terms)} (To come into the firm of ${f.name}.)`,
  );
  if (!l) {
    o.status = "lapsed";
    journal(g, by, `No post goes to ${charName(c)}.`, "bad");
    return;
  }
  o.status = "post";
  o.letter = l.id;
  journal(g, by, `You write to ${charName(c)}, offering a share in ${f.name}.`);
}

// ---------------------------------------------------------------- the days and the months

/** Each day: articles in the post, answers coming back, votes running out, heirs, suits. */
export function partnersDaily(g: ConquestGame): void {
  const ps = g.s.partners;
  if (!ps) return;
  for (const o of ps.offers) offerDaily(g, o);
  for (const f of ps.firms) {
    if (f.status !== "trading") continue;
    heirsDaily(g, f);
    if (f.status !== "trading") continue;
    suitsDaily(g, f);
    for (const d of f.decisions)
      if (d.status === "open" && d.until <= g.s.day)
        resolveDecision(g, f, d, true);
    if (f.seized && g.s.day - f.seized.day > 30) sellSeized(g, f, "stranger");
    if (
      f.status === "trading" &&
      !f.partners.some((p) => lifeOfChar(g.s, p.c) || p.dead !== undefined)
    ) {
      // No player left in it: it goes on without us, out of the books.
      f.status = "dissolved";
      f.ended = g.s.day;
      clearFirmEvents(g, f.id);
      partnersChanged(g, "f");
    }
  }
}

function offerDaily(g: ConquestGame, o: FirmOffer): void {
  const s = g.s;
  if (o.status !== "post" && o.status !== "open" && o.status !== "answered")
    return;
  const lapse = (why?: string) => {
    o.status = "lapsed";
    partnersChanged(g, "o");
    const to = lifeOfChar(s, o.to);
    if (to) clearOfferEvent(g, to, o.id);
    const from = lifeOfChar(s, o.from);
    if (why && from) journal(g, from, why);
  };
  if (!s.chars[o.from]?.alive || !s.chars[o.to]?.alive) return lapse();
  if (o.status === "post" || o.status === "answered") {
    // The letter on its way: from the sender (articles), or back (an answer).
    const holder = lifeOfChar(s, o.from);
    const l = holder?.post?.find((x) => x.id === o.letter);
    if (!holder || !l || l.status === "lost") return lapse();
    if (o.status === "answered" && l.status === "delivered") {
      if (o.yes) {
        const err = sign(g, o);
        if (err) lapse(`The articles fell through: ${err}`);
      } else {
        o.status = "refused";
        partnersChanged(g, "o");
      }
    }
    return;
  }
  if (s.day - o.day > OFFER_DAYS)
    lapse(
      `${charName(s.chars[o.to])} never answered your articles of copartnership.`,
    );
}

/** Each month: every firm's books, then the troubles of trade. */
export function partnersMonthly(g: ConquestGame): void {
  const ps = g.s.partners;
  if (!ps) return;
  for (const f of ps.firms) {
    if (f.status !== "trading") continue;
    firmMonth(g, f);
    firmTroubles(g, f);
  }
  tidyPartners(g);
}

// ---------------------------------------------------------------- the commands

const TITLES: Record<string, string> = {
  propose: "Articles of copartnership",
  sign: "The articles signed",
  refuse: "The articles declined",
  counter: "Your own terms",
  decide: "Put to the partners",
  creditors: "The seized share",
};

function partnersCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "partners") return undefined;
  const s = g.s;
  if (!meOf(s, life)) return "You're watching.";
  const quiet = !TITLES[c.act];
  if (quiet) return doPartners(g, life, c);
  beginOutcome(g, life);
  let err: string | null = null;
  try {
    outcomeMeta(g, life, {
      key: `partners-${c.act}`,
      title: TITLES[c.act],
      scene: life.area && life.area !== "home" ? life.area : "market",
      c: -1,
      ok: null,
    });
    err = doPartners(g, life, c);
  } finally {
    endOutcome(g, life, "act", err !== null);
  }
  return err;
}

function doPartners(
  g: ConquestGame,
  life: Life,
  c: Extract<LifeCommand, { k: "partners" }>,
): string | null {
  const s = g.s;
  const firm = () => (c.id !== undefined ? firmById(s, c.id) : undefined);
  switch (c.act) {
    case "propose":
      if (!c.terms) return "The articles are wanting.";
      return proposeArticles(g, life, c.terms, !!c.post);
    case "sign":
      return signArticles(g, life, c.id ?? -1);
    case "refuse":
      return refuseArticles(g, life, c.id ?? -1);
    case "counter":
      return counterArticles(
        g,
        life,
        c.id ?? -1,
        c.share ?? 0,
        c.mine ?? 0,
        c.theirs ?? 0,
      );
    case "vote": {
      const f = firm();
      if (!f) return "No such firm.";
      return castVote(g, life, f, c.d ?? -1, !!c.yes);
    }
    case "decide": {
      const f = firm();
      if (!f) return "No such firm.";
      return putDecision(
        g,
        life,
        f,
        c.key as FirmDecisionKey,
        c.arg ?? 0,
        c.c ?? -1,
        c.cap ?? 0,
      );
    }
    case "books": {
      const f = firm();
      const p = f ? partnerIn(f, life.c) : undefined;
      if (!f || !p) return "You're not a partner.";
      if (p.role !== "managing")
        return "Only the managing partner keeps the books.";
      p.cooking = !!c.yes;
      partnersChanged(g, "f");
      journal(
        g,
        life,
        c.yes
          ? `You keep a second set of books for ${f.name}: a quarter of the takings into your own pocket, until someone looks.`
          : `You keep honest books for ${f.name} again.`,
        c.yes ? "bad" : undefined,
      );
      return null;
    }
    case "name": {
      const f = firm();
      if (!f || !partnerIn(f, life.c)) return "You're not a partner.";
      const name = (c.name ?? "").replace(/[<>]/g, "").trim().slice(0, 40);
      if (name.length < 3) return "Name the firm.";
      if (managerOf(f)?.c !== life.c && f.partners.length > 1)
        return "The managing partner names the firm.";
      firmLine(g, f, `The firm takes the name ${name}.`);
      f.name = name;
      partnersChanged(g, "f");
      return null;
    }
    case "creditors": {
      const f = firm();
      if (!f || !partnerIn(f, life.c)) return "You're not a partner.";
      return sellSeized(
        g,
        f,
        (c.key as "buy" | "stranger" | "wind") ?? "stranger",
        life.c,
      );
    }
  }
  return "Unknown.";
}

hooks.command.push(partnersCommand);
hooks.letterArrives.push(articlesArrive);
hooks.death.push((g, c) => partnerDied(g, c));

// ---------------------------------------------------------------- the month's forecast

/** Your share of each firm's month, for Estate › Purse. */
function firmBudget(s: GameState, life: Life): Part[] {
  const out: Part[] = [];
  for (const f of firmsWith(s, life.c)) {
    const p = partnerIn(f, life.c)!;
    if (f.hold === "paper") {
      const x = paperById(s, f.paper ?? -1);
      const inc = x?.income ?? 0;
      if (!inc) continue;
      out.push(
        x?.owner === life.c
          ? {
              label: `Partners' shares of ${x.name}`,
              value: -r2((inc * (100 - p.share)) / 100),
            }
          : {
              label: `Your share: ${f.name} (${p.share}%)`,
              value: r2((inc * p.share) / 100),
            },
      );
      continue;
    }
    const v = firmMonthView(s, f).profit;
    if (v)
      out.push({
        label: `Your share: ${f.name} (${p.share}%)`,
        value: r2((v * p.share) / 100),
      });
  }
  return out;
}
hooks.budget.push(firmBudget);

// ---------------------------------------------------------------- for the pages

/** Who in town might go into business with you (people with a trade, or means). */
export function likelyPartners(s: GameState, life: Life): Character[] {
  if (life.travel) return [];
  return peopleHere(s, life.prov, life)
    .filter((c) => {
      if (ageOf(s, c) < 18) return false;
      if (lifeOfChar(s, c.id)) return true;
      if (!c.role) return false;
      const r = ROLES[c.role];
      return !!bizJobOfRole(c) || (r.status >= 4 && r.wealth >= 30);
    })
    .sort(
      (a, b) =>
        Number(!!lifeOfChar(s, b.id)) - Number(!!lifeOfChar(s, a.id)) ||
        (b.role ? ROLES[b.role].wealth : 0) -
          (a.role ? ROLES[a.role].wealth : 0) ||
        a.id - b.id,
    )
    .slice(0, 8);
}

/** A partner's view of a firm: their share's worth, and what it pays. */
export function shareView(
  s: GameState,
  f: Firm,
  c: number,
): { worth: number; month: number; price: number } {
  const p = partnerIn(f, c);
  if (!p) return { worth: 0, month: 0, price: 0 };
  const month = r2((avgProfit(s, f) * p.share) / 100);
  return {
    worth: Math.round(buyoutPrice(s, f, c)),
    month,
    price: buyoutPrice(s, f, c),
  };
}

export { decisionCheck };
void isNativeChar;
