// PARTNERS (r13): a firm at work. Each month its business is reckoned the
// way a business of one's own is (Property.ts: hands, the managing
// partner's skill and whether they mind it, wages, upkeep, excise), with
// interest on what it owes and any cargo come home; the profit is divided
// by share and paid into the partners' purses, a loss comes out of the
// firm's chest, and when the chest is empty it's called from the partners.
// The partners put matters to a vote. Things go wrong: a managing partner
// keeps two sets of books, partners quarrel and go to law, a partner fails
// and their creditors come for the share, war and the sea take the ship,
// a partner dies and the share passes to an heir; and in the end a firm is
// wound up: debts first, then each partner's capital, then what's over (or
// short) by share. Nothing here makes money that a business of one's own
// wouldn't: the partnership pools capital, so bigger businesses can be had.

import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import { raiseEvent } from "./Hooks";
import {
  addStress,
  earn,
  gainXp,
  journal,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import {
  charSkill,
  Check,
  isChildLife,
  lifeOfChar,
  no,
  opinionOf,
  yes,
} from "./LifeQueries";
import {
  BUSINESS_UPKEEP,
  EXCISE,
  EXPAND_COST,
  HAND_TAKINGS,
  HAND_WAGE,
  JOBS,
  ROLES,
  SHIP_UPKEEP_MULT,
  VENTURE_DAYS,
  VENTURE_LUCK,
  VENTURE_WAR_LOSS,
} from "./LifeRules";
import { BAILIFFS_AT } from "./Money";
import { wake } from "./Pace";
import { askNewcomer } from "./Partners";
import {
  bizCost,
  bizRoom,
  bizSale,
  BOOK_MONTHS,
  CALLS,
  CARGOES,
  fdice,
  FIRE_SALE,
  firmLine,
  firmsWith,
  LOAN_RATE,
  LOANS,
  managerOf,
  MAX_FIRMS,
  MAX_PARTNERS,
  NPC_MAX_FIRMS,
  partnerIn,
  partners,
  partnersChanged,
  SKIM_SHARE,
  VOTE_DAYS,
} from "./PartnersCore";
import { paperById, paperValue } from "./Press";
import { ageOf, charName, hasTrait } from "./Queries";
import { rumour } from "./Rumours";
import { openTrial, trialById } from "./Trials";
import type {
  Breakdown,
  Character,
  Firm,
  FirmDecision,
  FirmDecisionKey,
  FirmPartner,
  GameState,
  Life,
  Property,
} from "./Types";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Trades whose business is a vessel (the sea can take it). */
export const SHIP_JOBS = new Set(["sailor", "fisherman", "whaler"]);

/** Most a firm will owe. */
export const MAX_DEBT = 200;

// ---------------------------------------------------------------- who's who

const isPlayer = (s: GameState, c: number) => !!lifeOfChar(s, c);

/** Pay a partner (a player into their purse; anyone else's is their own affair). */
function payTo(g: ConquestGame, c: number, coins: number): void {
  const life = lifeOfChar(g.s, c);
  if (life && coins) earn(g, life, coins);
}

/** Take from a partner (a player from their purse, even into debt). */
function chargeTo(g: ConquestGame, c: number, coins: number): void {
  const life = lifeOfChar(g.s, c);
  if (life && coins) spend(g, life, coins);
}

/** Tell a player partner something, and wake them for it if it matters. */
function tell(
  g: ConquestGame,
  c: number,
  text: string,
  tone?: "good" | "bad",
  loud = false,
): void {
  const life = lifeOfChar(g.s, c);
  if (!life || life.watching) return;
  journal(g, life, text, tone);
  if (loud) wake(g, life, text);
}

/** Every player among a firm's partners (their lives). */
export function playerPartners(s: GameState, f: Firm): Life[] {
  const out: Life[] = [];
  for (const p of f.partners) {
    const l = lifeOfChar(s, p.c);
    if (l && !l.watching) out.push(l);
  }
  return out;
}

/** Whether someone looks after the business in person this month. */
export function mindsIt(s: GameState, c: Character, p: number): boolean {
  const life = lifeOfChar(s, c.id);
  if (life) return !life.travel && life.prov === p;
  return !c.abroad && (c.home === undefined || c.home === p);
}

/** The colony the firm trades under is at war. */
export function firmAtWar(s: GameState, f: Pick<Firm, "prov">): boolean {
  const owner = s.provinces[f.prov]?.owner ?? -1;
  return owner >= 0 && s.wars.some((w) => w.a === owner || w.b === owner);
}

/** The business's name as people say it ("an inn", "a plantation"). */
export function bizName(job: string, level: number): string {
  if (job === "farmer" && level >= 3) return "plantation";
  return JOBS[job as keyof typeof JOBS]?.business ?? "business";
}

// ---------------------------------------------------------------- a month's reckoning

export interface FirmMonthView {
  takings: number;
  wages: number;
  upkeep: number;
  excise: number;
  interest: number;
  profit: number;
  /** The managing partner's skill in the trade, and whether they mind it. */
  skill: number;
  minding: boolean;
  /** The enemy holds the town. */
  held: boolean;
  hands: number;
  why: Breakdown;
}

/**
 * A month of a firm's business, as it stands (or with every hand it has room
 * for, `full`): the same sums as a business of one's own.
 */
export function firmMonthView(
  s: GameState,
  f: Pick<Firm, "biz" | "prov" | "partners" | "debt">,
  full = false,
): FirmMonthView {
  const e = new Explain();
  const v: FirmMonthView = {
    takings: 0,
    wages: 0,
    upkeep: 0,
    excise: 0,
    interest: 0,
    profit: 0,
    skill: 0,
    minding: false,
    held: false,
    hands: 0,
    why: { total: 0, parts: [] },
  };
  const biz = f.biz;
  if (biz) {
    const def = JOBS[biz.job];
    const mgr = managerOf(f as Firm);
    const c = mgr ? s.chars[mgr.c] : undefined;
    v.skill = c ? charSkill(s, c, def.main) : 3;
    v.minding = !!c && mindsIt(s, c, f.prov);
    v.held = (s.provinces[f.prov]?.occupier ?? -1) >= 0;
    v.hands = full ? bizRoom(biz.level) : biz.hands;
    const per = HAND_TAKINGS * (0.8 + v.skill / 25) * (v.minding ? 1 : 0.6);
    v.takings = v.held ? 0 : r1(per * v.hands);
    v.wages = v.hands * HAND_WAGE;
    v.upkeep =
      (BUSINESS_UPKEEP[biz.level] ?? 0) *
      (biz.job === "sailor" ? SHIP_UPKEEP_MULT : 1);
    const owner = s.provinces[f.prov]?.owner ?? -1;
    const nativeLand = owner >= 0 && s.nations[owner]?.kind === "native";
    v.excise = nativeLand ? 0 : r2(v.takings * EXCISE);
    e.add(
      v.held
        ? "Takings: the enemy holds the town"
        : `Takings: ${v.hands} hand${v.hands === 1 ? "" : "s"}, ${def.main} ${v.skill}${v.minding ? "" : ", nobody minding it"}`,
      v.takings,
      true,
    );
    if (v.wages) e.add("Wages", -v.wages);
    if (v.upkeep)
      e.add(`Upkeep: the ${bizName(biz.job, biz.level)}`, -v.upkeep);
    if (v.excise) e.add("Excise and duties", -v.excise);
  }
  v.interest = r2(f.debt * LOAN_RATE);
  if (v.interest) e.add(`Interest on ${Math.round(f.debt)} owed`, -v.interest);
  v.profit = r2(v.takings - v.wages - v.upkeep - v.excise - v.interest);
  v.why = e.done(2);
  return v;
}

/** What the profit was these last months, on average (or the forecast, new). */
export function avgProfit(s: GameState, f: Firm, months = 6): number {
  const list = f.books.slice(-months);
  if (!list.length) return firmMonthView(s, f, true).profit;
  return r2(list.reduce((m, b) => m + b.profit, 0) / list.length);
}

/** A cargo's name, from what the country round the firm makes. */
function cargoName(g: ConquestGame, f: Firm): string {
  const raw = g.w.raw[f.prov];
  const what: Record<string, string> = {
    grain: "wheat and flour",
    fish: "salt fish",
    furs: "beaver pelts",
    tobacco: "tobacco",
    sugar: "sugar and rum",
    timber: "masts and staves",
    silver: "silver plate",
  };
  const to = ["London", "Bristol", "the Indies", "Lisbon", "Amsterdam"][
    fdice(g).int(0, 4)
  ];
  return `${what[raw] ?? "a mixed cargo"} for ${to}`;
}

/** A cargo come home (or not): what it fetched. */
function cargoHome(g: ConquestGame, f: Firm): { back: number; text: string } {
  const s = g.s;
  const cargo = f.cargo!;
  const r = fdice(g);
  const war = firmAtWar(s, f);
  const ship = !!f.biz && SHIP_JOBS.has(f.biz.job);
  let lossP = war ? VENTURE_WAR_LOSS : VENTURE_LUCK[0].p;
  if (ship) lossP *= 0.7;
  const mgr = managerOf(f);
  const c = mgr ? s.chars[mgr.c] : undefined;
  const trade = c ? charSkill(s, c, "trade") : 3;
  let roll = r.next();
  let luck = VENTURE_LUCK[VENTURE_LUCK.length - 1];
  if (roll < lossP) luck = VENTURE_LUCK[0];
  else {
    roll = Math.min(0.999, (roll - lossP) / (1 - lossP) + trade * 0.004);
    const rest = VENTURE_LUCK.slice(1);
    const total = rest.reduce((a, b) => a + b.p, 0);
    let acc = 0;
    for (const l of rest) {
      acc += l.p / total;
      if (roll < acc) {
        luck = l;
        break;
      }
    }
  }
  const back = r2(cargo.stake * luck.x);
  const text =
    luck.x === 0
      ? `the cargo of ${cargo.name} is ${war ? "taken by a privateer" : "lost at sea"}`
      : `the cargo of ${cargo.name} is home, ${luck.text}: ${Math.round(back)} for ${cargo.stake}`;
  return { back, text };
}

/** Divide coins from the chest among the partners by share. */
function divide(g: ConquestGame, f: Firm, amount: number): void {
  let paid = 0;
  for (const p of f.partners) {
    const a = r2((amount * p.share) / 100);
    if (!a) continue;
    paid += a;
    p.drawn = r2(p.drawn + a);
    payTo(g, p.c, a);
  }
  f.chest = r2(f.chest - paid);
}

/** Call coins into the chest from the partners by share. */
function callIn(g: ConquestGame, f: Firm, amount: number, why: string): void {
  for (const p of f.partners) {
    const a = r2((amount * p.share) / 100);
    if (!a) continue;
    chargeTo(g, p.c, a);
    f.chest = r2(f.chest + a);
    tell(
      g,
      p.c,
      `${f.name} ${why}: your part, ${a} coins, is called from your purse.`,
      "bad",
    );
  }
}

/** Remember a month in the books. */
function book(
  g: ConquestGame,
  f: Firm,
  takings: number,
  costs: number,
  profit: number,
  note?: string,
): void {
  f.books.push({
    day: g.s.day,
    takings: r2(takings),
    costs: r2(costs),
    profit: r2(profit),
    ...(note ? { note } : {}),
  });
  if (f.books.length > BOOK_MONTHS)
    f.books.splice(0, f.books.length - BOOK_MONTHS);
}

/** Whether a computer partner who keeps the books starts keeping two sets. */
function npcStartsSkimming(g: ConquestGame, c: Character): boolean {
  if (hasTrait(c, "honest")) return false;
  const deceit = hasTrait(c, "deceitful");
  const greed = hasTrait(c, "greedy");
  const p = deceit && greed ? 0.12 : deceit ? 0.08 : greed ? 0.05 : 0;
  return p > 0 && fdice(g).chance(p);
}

/**
 * The month's reckoning of one firm: the business, the books, a cargo, the
 * division (or the call). Returns the profit as the books show it.
 */
export function firmMonth(g: ConquestGame, f: Firm): number {
  if (f.status !== "trading") return 0;
  const s = g.s;
  let takings = 0;
  let costs = 0;
  let extra = 0;
  const notes: string[] = [];
  const mgr = managerOf(f);
  const mgrChar = mgr ? s.chars[mgr.c] : undefined;
  // A newspaper: its owner has its sales; the profit is shared out by them.
  if (f.hold === "paper") return paperMonth(g, f);
  if (f.biz) {
    // A hand taken on each month there's room and the money for it; one
    // let go when the firm lost money and the chest is bare.
    const last = f.books[f.books.length - 1];
    if (bizRoom(f.biz.level) > f.biz.hands && f.chest >= HAND_WAGE * 2)
      f.biz.hands++;
    else if (f.biz.hands > 0 && f.chest <= 0 && (last?.profit ?? 0) < 0)
      f.biz.hands--;
    const v = firmMonthView(s, f);
    takings = v.takings;
    costs = r2(v.wages + v.upkeep + v.excise + v.interest);
    if (v.held) notes.push("the enemy holds the town");
    // The managing partner learns the trade as they run it.
    const ml = mgr ? lifeOfChar(s, mgr.c) : undefined;
    if (ml && v.minding) {
      gainXp(g, ml, JOBS[f.biz.job].main, 4, true);
      gainXp(g, ml, "trade", 1);
    }
  } else if (f.debt) costs = r2(f.debt * LOAN_RATE);
  // Two sets of books: a share of the takings never reaches the chest.
  let skim = 0;
  if (mgr && mgrChar && takings > 0) {
    if (!mgr.cooking && !isPlayer(s, mgr.c) && npcStartsSkimming(g, mgrChar))
      mgr.cooking = true;
    if (mgr.cooking) {
      skim = r1(takings * SKIM_SHARE);
      mgr.skim = r2((mgr.skim ?? 0) + skim);
      payTo(g, mgr.c, skim);
    }
  }
  const shown = r2(takings - skim);
  f.chest = r2(f.chest + shown - costs);
  // A cargo come home.
  if (f.cargo && f.cargo.due <= s.day) {
    const { back, text } = cargoHome(g, f);
    const stake = f.cargo.stake;
    f.cargo = null;
    f.chest = r2(f.chest + back);
    extra = r2(back - stake);
    notes.push(text);
    firmLine(g, f, `${text[0].toUpperCase()}${text.slice(1)}.`);
    for (const l of playerPartners(s, f)) {
      journal(
        g,
        l,
        `${f.name}: ${text}.`,
        back > stake ? "good" : back < stake ? "bad" : undefined,
      );
      if (back === 0)
        raiseEvent(g, l, "pa-cargo", { f: f.id, c: mgr?.c ?? -1 });
    }
    if (back >= stake * 2)
      rumour(
        g,
        f.prov,
        `${f.name} have made a fortune on a cargo of ${text.replace(/^the cargo of /, "").replace(/ is home.*$/, "")}.`,
        mgr?.c ?? -1,
        "good",
      );
  }
  const profit = r2(shown - costs + extra);
  if (profit > 0) divide(g, f, profit);
  if (f.chest < 0) {
    const short = r2(-f.chest);
    callIn(g, f, short, `is ${short} coins short this month`);
  }
  book(
    g,
    f,
    shown + (extra > 0 ? extra : 0),
    costs + (extra < 0 ? -extra : 0),
    profit,
    notes.join("; ") || undefined,
  );
  partnersChanged(g, "f");
  return profit;
}

/** A newspaper held in partnership: its owner shares out last month's profit. */
function paperMonth(g: ConquestGame, f: Firm): number {
  const s = g.s;
  const x = f.paper !== undefined ? paperById(s, f.paper) : undefined;
  const holder = managerOf(f);
  if (!x || !holder || x.owner !== holder.c) {
    windUp(g, f, "the paper has gone out of its owner's hands");
    return 0;
  }
  let income = r2(x.income ?? 0);
  let skim = 0;
  if (holder.cooking && income > 0) {
    skim = r1(income * SKIM_SHARE);
    holder.skim = r2((holder.skim ?? 0) + skim);
    income = r2(income - skim);
  }
  for (const p of f.partners) {
    if (p.c === holder.c) continue;
    const a = r2((income * p.share) / 100);
    if (!a) continue;
    chargeTo(g, holder.c, a);
    payTo(g, p.c, a);
    if (a > 0) p.drawn = r2(p.drawn + a);
  }
  holder.drawn = r2(holder.drawn + (income * holder.share) / 100);
  book(
    g,
    f,
    Math.max(0, income),
    Math.max(0, -income),
    income,
    `${x.readers} readers`,
  );
  partnersChanged(g, "f");
  return income;
}

// ---------------------------------------------------------------- what a share is worth

/**
 * What each partner would have if the firm were wound up now: debts paid
 * first, then each partner's capital, then what's over (or short) by share.
 */
export function windingUpShares(s: GameState, f: Firm): Map<number, number> {
  const out = new Map<number, number>();
  let pool = f.chest - f.debt;
  if (f.biz) pool += bizSale(f.biz.level);
  if (f.cargo) pool += Math.round(f.cargo.stake * 0.7);
  const x = f.paper !== undefined ? paperById(s, f.paper) : undefined;
  if (x) pool += paperValue(x);
  const caps = f.partners.map((p) => Math.max(0, p.capital - (p.caught ?? 0)));
  const total = caps.reduce((a, b) => a + b, 0);
  f.partners.forEach((p, i) => {
    let v: number;
    if (pool >= total) v = caps[i] + ((pool - total) * p.share) / 100;
    else if (pool > 0)
      v = total ? (pool * caps[i]) / total : (pool * p.share) / 100;
    else v = (pool * p.share) / 100;
    out.set(p.c, r2(v));
  });
  return out;
}

/** A fair price for a partner's share: what it'd fetch wound up, and a year of its profit. */
export function buyoutPrice(s: GameState, f: Firm, c: number): number {
  const p = partnerIn(f, c);
  if (!p) return 0;
  const base = windingUpShares(s, f).get(c) ?? 0;
  const year = Math.max(0, avgProfit(s, f)) * 12 * (p.share / 100);
  return Math.max(0, Math.round(base + year));
}

// ---------------------------------------------------------------- partners coming and going

/** Share out a leaving partner's share among the rest, in proportion. */
function spreadShare(f: Firm, leaving: FirmPartner): void {
  const rest = f.partners.filter((p) => p !== leaving);
  const total = rest.reduce((m, p) => m + p.share, 0);
  if (!rest.length) return;
  let given = 0;
  rest.forEach((p, i) => {
    const add =
      i === rest.length - 1
        ? leaving.share - given
        : Math.round(
            leaving.share * (total ? p.share / total : 1 / rest.length) * 10,
          ) / 10;
    given += add;
    p.share = Math.round((p.share + add) * 10) / 10;
  });
}

/** Someone takes another's place (an heir, a buyer, a creditor's man). */
function succeed(
  f: Firm,
  p: FirmPartner,
  c: number,
  day: number,
  role?: FirmPartner["role"],
): void {
  const already = partnerIn(f, c);
  if (already && already !== p) {
    already.share = Math.round((already.share + p.share) * 10) / 10;
    already.capital = r2(already.capital + p.capital);
    if (p.role === "managing") already.role = "managing";
    f.partners = f.partners.filter((x) => x !== p);
    return;
  }
  p.c = c;
  p.since = day;
  p.skim = 0;
  p.caught = 0;
  p.cooking = false;
  delete p.dead;
  if (role) p.role = role;
}

/** Make sure someone keeps the books: the largest partner if nobody does. */
function ensureManager(s: GameState, f: Firm): void {
  if (f.partners.some((p) => p.role === "managing")) return;
  const pick = [...f.partners]
    .filter((p) => {
      const c = s.chars[p.c];
      return c?.alive && ageOf(s, c) >= 16;
    })
    .sort((a, b) => b.share - a.share || a.c - b.c)[0];
  if (pick) pick.role = "managing";
}

/** Take a partner out of the firm, paying them `refund` from the chest. */
export function removePartner(
  g: ConquestGame,
  f: Firm,
  c: number,
  refund: number,
): void {
  const p = partnerIn(f, c);
  if (!p) return;
  const paid = Math.max(0, Math.min(r2(refund), Math.max(0, f.chest)));
  f.chest = r2(f.chest - paid);
  payTo(g, c, paid);
  spreadShare(f, p);
  f.partners = f.partners.filter((x) => x !== p);
  ensureManager(g.s, f);
  partnersChanged(g, "f");
  if (f.partners.length <= 1) endWithOne(g, f);
}

/**
 * Only one partner left: the partnership ends, and the business (and the
 * chest, and the debts) are theirs alone.
 */
export function endWithOne(g: ConquestGame, f: Firm): void {
  const s = g.s;
  if (f.status !== "trading") return;
  const p = f.partners[0];
  const life = p ? lifeOfChar(s, p.c) : undefined;
  if (life && !life.watching) {
    touchLife(g, life);
    if (f.biz) {
      const pr: Property = {
        id: g.nextId(),
        kind: "business",
        prov: f.prov,
        level: f.biz.level,
        job: f.biz.job,
        place: f.biz.place,
        hands: [],
        since: s.day,
        name: JOBS[f.biz.job].business ?? bizName(f.biz.job, f.biz.level),
      };
      (life.property ??= []).push(pr);
    }
    let cash = r2(f.chest - f.debt);
    if (f.cargo) cash = r2(cash + Math.round(f.cargo.stake * 0.7));
    if (cash > 0) earn(g, life, cash);
    else if (cash < 0) spend(g, life, -cash);
    journal(
      g,
      life,
      `The partnership of ${f.name} ends: ${f.biz ? `the ${bizName(f.biz.job, f.biz.level)} is yours alone` : "you're the only partner left"}${cash ? `, with ${cash > 0 ? `${cash} coins from the chest` : `${-cash} coins of its debts`}` : ""}.`,
      "good",
    );
  }
  close(g, f, "one partner left");
}

/** Mark a firm wound up and tidy what hung on it. */
function close(g: ConquestGame, f: Firm, why: string): void {
  const s = g.s;
  f.status = "dissolved";
  f.ended = s.day;
  f.biz = null;
  f.cargo = null;
  f.chest = 0;
  f.debt = 0;
  f.seized = null;
  f.suit = null;
  for (const d of f.decisions) if (d.status === "open") d.status = "lost";
  clearFirmEvents(g, f.id);
  firmLine(g, f, `Wound up: ${why}.`);
  const ps = partners(g);
  for (const o of ps.offers)
    if (o.firm === f.id && (o.status === "open" || o.status === "post"))
      o.status = "lapsed";
  partnersChanged(g, "o");
  partnersChanged(g, "f");
}

/** Take away any scene still waiting on a firm (its votes, its troubles). */
export function clearFirmEvents(g: ConquestGame, id: number, d?: number): void {
  for (const life of g.s.lives) {
    const before = life.events.length;
    life.events = life.events.filter(
      (e) =>
        !(
          (e.key === "p2p-firmvote" || e.key.startsWith("pa-")) &&
          e.ctx.f === id &&
          (d === undefined || e.ctx.d === d)
        ),
    );
    if (life.events.length !== before) touchLife(g, life);
  }
}

/**
 * Wind a firm up: the business sold, a cargo at sea sold as it lies, debts
 * paid, then capital returned and the rest (or the shortfall) shared out.
 */
export function windUp(g: ConquestGame, f: Firm, why: string): void {
  const s = g.s;
  if (f.status !== "trading") return;
  const shares = windingUpShares(s, f);
  const x = f.paper !== undefined ? paperById(s, f.paper) : undefined;
  for (const p of f.partners) {
    let amt = shares.get(p.c) ?? 0;
    // The owner of a paper keeps it, against what it's worth.
    if (x && x.owner === p.c) amt = r2(amt - paperValue(x));
    if (amt > 0) payTo(g, p.c, amt);
    else if (amt < 0) chargeTo(g, p.c, -amt);
    tell(
      g,
      p.c,
      `${f.name} is wound up (${why}). ${amt > 0 ? `Your part comes to ${amt} coins.` : amt < 0 ? `Your part of what it owed, ${-amt} coins, is called from you.` : "There's nothing left to divide."}`,
      amt < 0 ? "bad" : undefined,
      true,
    );
  }
  rumour(
    g,
    f.prov,
    `The partnership of ${f.name} at ${g.map.provinces[f.prov]?.name ?? "the town"} is dissolved.`,
    managerOf(f)?.c ?? -1,
  );
  close(g, f, why);
}

// ---------------------------------------------------------------- matters put to the partners

export const DECISIONS: Record<
  FirmDecisionKey,
  { label: string; text: string }
> = {
  expand: {
    label: "Grow the business",
    text: "More room, more hands, more takings: paid from the chest.",
  },
  loan: {
    label: "Take a loan",
    text: `Borrow from a merchant at ${Math.round(LOAN_RATE * 100)} in a hundred a month: money in the chest now, interest every month.`,
  },
  repay: {
    label: "Pay off the debt",
    text: "Clear what the firm owes from the chest.",
  },
  goods: {
    label: "Send a cargo",
    text: "Buy goods and ship them: home in some months, at a profit or a loss, or lost at sea. More are lost in wartime; a ship of the firm's own loses fewer.",
  },
  call: {
    label: "Call in capital",
    text: "Each partner puts more into the chest, by share.",
  },
  admit: {
    label: "Bring in a new partner",
    text: "They put in capital for a share; everyone else's share shrinks to make room.",
  },
  buyout: {
    label: "Buy out a partner",
    text: "Pay them a fair price for their share (what it would fetch wound up, and a year of its profit), and it's yours.",
  },
  manager: {
    label: "Change the managing partner",
    text: "Someone else does the work and keeps the books.",
  },
  sell: {
    label: "Sell up and wind up",
    text: "Sell the business, pay the debts, return the capital and share out the rest.",
  },
};

/** What a matter would cost or bring, in a word, for its button. */
export function decisionCost(f: Firm, key: FirmDecisionKey): number {
  if (key === "expand")
    return f.biz
      ? (EXPAND_COST[f.biz.level] ?? 0)
      : f.lost
        ? bizCost(f.lost.job, 1)
        : 0;
  if (key === "repay") return Math.min(f.debt, Math.max(0, f.chest));
  return 0;
}

/** Whether a partner may put a matter to the others now. */
export function decisionCheck(
  s: GameState,
  life: Life,
  f: Firm,
  key: FirmDecisionKey,
  arg = 0,
  c = -1,
  cap = 0,
): Check {
  if (f.status !== "trading") return no("The firm is wound up.");
  const me = partnerIn(f, life.c);
  if (!me) return no("You're not a partner.");
  if (isChildLife(s, life)) return no("Not until you're grown.");
  if (f.decisions.some((d) => d.status === "open" && d.key === key))
    return no("It's before the partners already.");
  switch (key) {
    case "expand": {
      if (f.hold === "paper") return no("A newspaper grows by its readers.");
      if (!f.biz && !f.lost) return no("There's no business to grow.");
      if (f.biz && f.biz.level >= 3) return no("It's as big as it gets.");
      const cost = decisionCost(f, key);
      if (f.chest < cost)
        return no(
          `${f.biz ? "Growing it" : `Fitting out another ${f.lost!.name}`} costs ${cost}; the chest has ${Math.floor(f.chest)}.`,
        );
      return yes;
    }
    case "loan":
      if (!LOANS.includes(arg)) return no("Choose a sum.");
      if (f.hold === "paper") return no("The paper's owner borrows on it.");
      if (f.debt + arg > MAX_DEBT)
        return no(`No lender will go past ${MAX_DEBT}.`);
      return yes;
    case "repay":
      if (f.debt <= 0) return no("The firm owes nothing.");
      if (f.chest < 1) return no("The chest is empty.");
      return yes;
    case "goods":
      if (!CARGOES.includes(arg)) return no("Choose a sum.");
      if (f.hold === "paper") return no("Not a newspaper's business.");
      if (f.cargo) return no("A cargo is at sea already.");
      if (f.chest < arg)
        return no(`The chest has ${Math.floor(f.chest)}: not enough.`);
      return yes;
    case "call":
      if (!CALLS.includes(arg)) return no("Choose a sum.");
      if (f.hold === "paper") return no("Not for a newspaper.");
      return yes;
    case "admit": {
      const n = s.chars[c];
      if (!n?.alive || n.abroad) return no("Choose someone.");
      if (partnerIn(f, c)) return no("They're a partner already.");
      if (ageOf(s, n) < 16) return no("A child.");
      if (f.partners.length >= MAX_PARTNERS)
        return no(`${MAX_PARTNERS} partners is as many as a firm can hold.`);
      if (arg < 5 || arg > 50) return no("A share of 5 to 50.");
      if (cap < 0 || cap > 999) return no("Their capital.");
      const nl = lifeOfChar(s, c);
      if (firmsWith(s, c).length >= (nl ? MAX_FIRMS : NPC_MAX_FIRMS))
        return no("They have partners enough.");
      return yes;
    }
    case "buyout": {
      const them = partnerIn(f, c);
      if (!them || c === life.c) return no("Choose a partner.");
      const price = buyoutPrice(s, f, c);
      if (life.purse < price) return no(`Their share's price is ${price}.`);
      return yes;
    }
    case "manager": {
      const them = partnerIn(f, c);
      if (!them) return no("Choose a partner.");
      if (them.role === "managing") return no("They manage it already.");
      const ch = s.chars[c];
      if (!ch?.alive || ageOf(s, ch) < 16) return no("Not a child.");
      if (f.hold === "paper" && paperById(s, f.paper ?? -1)?.owner !== c)
        return no("The paper's owner keeps its books.");
      return yes;
    }
    case "sell":
      return yes;
  }
  return no("Unknown.");
}

/** How a computer partner would vote, and why. */
export function npcVote(
  s: GameState,
  f: Firm,
  d: Pick<FirmDecision, "key" | "arg" | "c" | "by" | "cap">,
  voter: Character,
): { yes: boolean; why: string } {
  const war = firmAtWar(s, f);
  const greedy = hasTrait(voter, "greedy");
  const byLife = lifeOfChar(s, d.by);
  const likes = byLife ? opinionOf(s, voter, byLife).total : 10;
  switch (d.key) {
    case "expand": {
      if (!f.biz) return { yes: true, why: "A firm wants its ship" };
      const now = firmMonthView(s, f, true).profit;
      const next = firmMonthView(
        s,
        { ...f, biz: { ...f.biz, level: f.biz.level + 1 } },
        true,
      ).profit;
      return next > now
        ? { yes: true, why: "More hands, more takings" }
        : { yes: false, why: "It wouldn't pay" };
    }
    case "loan":
      if (f.debt > 0) return { yes: false, why: "In debt enough" };
      if (greedy) return { yes: true, why: "Money makes money" };
      return f.biz && firmMonthView(s, f, true).profit > d.arg * LOAN_RATE * 2
        ? { yes: true, why: "It'll pay its interest" }
        : { yes: false, why: "Borrowing for nothing" };
    case "repay":
      return { yes: true, why: "Out of debt is out of danger" };
    case "goods": {
      if (war && !greedy)
        return { yes: false, why: "Privateers are thick in wartime" };
      const mgr = managerOf(f);
      const c = mgr ? s.chars[mgr.c] : undefined;
      const trade = c ? charSkill(s, c, "trade") : 0;
      return trade >= 5 || greedy
        ? { yes: true, why: "A cargo well chosen pays" }
        : { yes: false, why: "A gamble on the sea" };
    }
    case "call": {
      const wealth = voter.role ? ROLES[voter.role].wealth : 5;
      const part = (d.arg * (partnerIn(f, voter.id)?.share ?? 0)) / 100;
      if (part > wealth) return { yes: false, why: "More than they have" };
      const use =
        (f.biz && f.biz.level < 3) || (!f.biz && !!f.lost) || f.chest < 5;
      return use
        ? { yes: true, why: "The firm needs it" }
        : { yes: false, why: "Money better kept at home" };
    }
    case "admit": {
      const n = s.chars[d.c];
      const nl = lifeOfChar(s, d.c);
      if (nl && opinionOf(s, voter, nl).total < -10)
        return { yes: false, why: `Can't abide ${n?.first ?? "them"}` };
      const value = Math.max(
        10,
        f.chest - f.debt + (f.biz ? bizCost(f.biz.job, f.biz.level) * 0.6 : 0),
      );
      const fair = ((d.cap ?? 0) / (value + (d.cap ?? 0))) * 100;
      return fair + 5 >= d.arg
        ? { yes: true, why: "Fair money for the share" }
        : { yes: false, why: "Too cheap a share" };
    }
    case "buyout": {
      if (d.c === voter.id) {
        const fair = buyoutPrice(s, f, voter.id);
        const losing = avgProfit(s, f, 3) < 0;
        return greedy || losing || likes < 0
          ? { yes: true, why: losing ? "Glad to be out of it" : "A fair price" }
          : { yes: false, why: `Their share isn't for sale (worth ${fair})` };
      }
      return likes >= 0
        ? { yes: true, why: "Better them than a stranger" }
        : { yes: false, why: "Not to them" };
    }
    case "manager": {
      const mgr = managerOf(f);
      const job = f.biz ? JOBS[f.biz.job].main : "trade";
      const cur = mgr ? s.chars[mgr.c] : undefined;
      const nu = s.chars[d.c];
      const a = cur ? charSkill(s, cur, job) : 0;
      const b = nu ? charSkill(s, nu, job) : 0;
      if (d.c === voter.id) return { yes: true, why: "They'd run it better" };
      return b > a
        ? { yes: true, why: "They know the trade better" }
        : { yes: false, why: "The present one knows it better" };
    }
    case "sell": {
      const losing = avgProfit(s, f, 3) < 0;
      return losing || likes < -20
        ? {
            yes: true,
            why: losing ? "It's losing money" : "Can't work with you",
          }
        : { yes: false, why: "It pays: why sell?" };
    }
  }
  return { yes: false, why: "No" };
}

/** Shares voted aye and no, and still to vote. */
export function tally(
  f: Firm,
  d: FirmDecision,
): { aye: number; no: number; left: number } {
  let aye = 0;
  let nay = 0;
  let left = 0;
  for (const p of f.partners) {
    const v = d.votes[p.c];
    if (v === 1) aye += p.share;
    else if (v === -1) nay += p.share;
    else left += p.share;
  }
  return { aye, no: nay, left };
}

/** Put a matter to the partners: computer partners vote at once, players are asked. */
export function putDecision(
  g: ConquestGame,
  life: Life,
  f: Firm,
  key: FirmDecisionKey,
  arg = 0,
  c = -1,
  cap = 0,
): string | null {
  const s = g.s;
  const check = decisionCheck(s, life, f, key, arg, c, cap);
  if (!check.ok) return check.why;
  const d: FirmDecision = {
    id: g.nextId(),
    key,
    by: life.c,
    arg,
    c,
    ...(key === "admit" ? { cap } : {}),
    day: s.day,
    until: s.day + VOTE_DAYS,
    votes: { [life.c]: 1 },
    why: {},
    status: "open",
  };
  f.decisions.push(d);
  if (f.decisions.length > 20)
    f.decisions = f.decisions.filter(
      (x, i) => x.status === "open" || i >= f.decisions.length - 12,
    );
  for (const p of f.partners) {
    if (p.c === life.c) continue;
    const ch = s.chars[p.c];
    const pl = lifeOfChar(s, p.c);
    if (pl) {
      raiseEvent(g, pl, "p2p-firmvote", { c: life.c, f: f.id, d: d.id });
      wake(g, pl, `${f.name}: a matter put to the partners.`);
    } else if (ch) {
      const v = npcVote(s, f, d, ch);
      d.votes[p.c] = v.yes ? 1 : -1;
      d.why![p.c] = v.why;
    }
  }
  journal(
    g,
    life,
    `You put it to the partners of ${f.name}: ${decisionWords(s, f, d).toLowerCase()}.`,
  );
  partnersChanged(g, "f");
  resolveDecision(g, f, d);
  return null;
}

/** A matter in words: "Send a cargo of 20", "Buy out Thomas Cole". */
export function decisionWords(s: GameState, f: Firm, d: FirmDecision): string {
  const who = charName(s.chars[d.c]);
  switch (d.key) {
    case "expand":
      return f.biz
        ? `Grow the ${bizName(f.biz.job, f.biz.level)} (${EXPAND_COST[f.biz.level] ?? 0} from the chest)`
        : `Fit out another ${f.lost?.name ?? "business"}`;
    case "loan":
      return `Borrow ${d.arg} coins`;
    case "repay":
      return "Pay off the firm's debt";
    case "goods":
      return `Send a cargo of ${d.arg} coins`;
    case "call":
      return `Call in ${d.arg} coins from the partners`;
    case "admit":
      return `Take in ${who} for ${d.arg}% at ${d.cap ?? 0} coins`;
    case "buyout":
      return `${charName(s.chars[d.by])} to buy out ${who} (${buyoutPrice(s, f, d.c)} coins)`;
    case "manager":
      return `Make ${who} the managing partner`;
    case "sell":
      return "Sell up and wind up the firm";
  }
}

/** A player's vote. */
export function castVote(
  g: ConquestGame,
  life: Life,
  f: Firm,
  id: number,
  aye: boolean,
): string | null {
  const d = f.decisions.find((x) => x.id === id);
  if (!d || d.status !== "open") return "It's been decided.";
  if (!partnerIn(f, life.c)) return "You're not a partner.";
  d.votes[life.c] = aye ? 1 : -1;
  clearVoteEvent(g, life, f.id, d.id);
  partnersChanged(g, "f");
  resolveDecision(g, f, d);
  return null;
}

function clearVoteEvent(g: ConquestGame, life: Life, f: number, d: number) {
  const before = life.events.length;
  life.events = life.events.filter(
    (e) => !(e.key === "p2p-firmvote" && e.ctx.f === f && e.ctx.d === d),
  );
  if (before !== life.events.length) touchLife(g, life);
}

/** Decide it if the votes settle it (or the time's up). */
export function resolveDecision(
  g: ConquestGame,
  f: Firm,
  d: FirmDecision,
  final = false,
): void {
  if (d.status !== "open") return;
  const t = tally(f, d);
  let carried: boolean | null = null;
  if (f.rule === "unanimous") {
    if (t.no > 0) carried = false;
    else if (t.left <= 0) carried = true;
    else if (final) carried = false;
  } else {
    if (t.aye > 50) carried = true;
    else if (t.no >= 50 || (final && t.aye <= 50)) carried = false;
  }
  if (carried === null) return;
  d.status = carried ? "carried" : "lost";
  clearFirmEvents(g, f.id, d.id);
  partnersChanged(g, "f");
  const words = decisionWords(g.s, f, d);
  firmLine(g, f, `${words}: ${carried ? "carried" : "lost"}.`);
  for (const p of f.partners)
    tell(
      g,
      p.c,
      `${f.name}: "${words}" is ${carried ? "carried" : "lost"} (${Math.round(t.aye)} in a hundred for it).`,
      undefined,
      p.c === d.by,
    );
  if (carried) carryOut(g, f, d);
}

/** Do what the partners decided. */
function carryOut(g: ConquestGame, f: Firm, d: FirmDecision): void {
  const s = g.s;
  switch (d.key) {
    case "expand": {
      const cost = decisionCost(f, "expand");
      if (f.chest < cost) {
        firmLine(g, f, "There wasn't the money after all.");
        return;
      }
      f.chest = r2(f.chest - cost);
      if (f.biz) f.biz.level++;
      else if (f.lost) {
        f.biz = {
          job: f.lost.job,
          place: f.lost.place,
          level: 1,
          hands: 0,
          name: f.lost.name,
        };
        f.hold = "biz";
        f.lost = null;
      }
      firmLine(
        g,
        f,
        `The ${bizName(f.biz!.job, f.biz!.level)} is ${f.biz!.level > 1 ? "grown" : "fitted out"}: room for ${bizRoom(f.biz!.level)} hands.`,
      );
      break;
    }
    case "loan":
      f.chest = r2(f.chest + d.arg);
      f.debt = r2(f.debt + d.arg);
      break;
    case "repay": {
      const pay = Math.min(f.debt, Math.max(0, f.chest));
      f.chest = r2(f.chest - pay);
      f.debt = r2(f.debt - pay);
      break;
    }
    case "goods": {
      if (f.cargo || f.chest < d.arg) return;
      f.chest = r2(f.chest - d.arg);
      f.cargo = {
        stake: d.arg,
        due: s.day + fdice(g).int(VENTURE_DAYS[0], VENTURE_DAYS[1]),
        name: cargoName(g, f),
      };
      firmLine(
        g,
        f,
        `A cargo of ${f.cargo.name} sails, ${d.arg} coins' worth.`,
      );
      break;
    }
    case "call":
      for (const p of f.partners) {
        const a = r2((d.arg * p.share) / 100);
        chargeTo(g, p.c, a);
        p.capital = r2(p.capital + a);
        f.chest = r2(f.chest + a);
      }
      break;
    case "admit":
      // The newcomer is asked (Partners.ts takes it from here).
      askNewcomer(g, f, d);
      break;
    case "buyout": {
      const buyer = partnerIn(f, d.by);
      const them = partnerIn(f, d.c);
      const bl = lifeOfChar(s, d.by);
      if (!buyer || !them) return;
      const price = buyoutPrice(s, f, d.c);
      if (bl && bl.purse < price) {
        tell(g, d.by, `You haven't the ${price} coins to buy them out.`, "bad");
        return;
      }
      chargeTo(g, d.by, price);
      payTo(g, d.c, price);
      buyer.share = Math.round((buyer.share + them.share) * 10) / 10;
      buyer.capital = r2(
        buyer.capital + Math.max(0, them.capital - (them.caught ?? 0)),
      );
      if (them.role === "managing") buyer.role = "managing";
      f.partners = f.partners.filter((p) => p !== them);
      tell(
        g,
        d.c,
        `You're bought out of ${f.name} for ${price} coins.`,
        undefined,
        true,
      );
      const bc = s.chars[d.c];
      if (bc && !lifeOfChar(s, d.c) && bl)
        remembers(g, bl, g.char(bc.id), "Bought me out", -4, 2);
      firmLine(
        g,
        f,
        `${charName(s.chars[d.by])} buys out ${charName(bc)} for ${price}.`,
      );
      if (f.partners.length <= 1) endWithOne(g, f);
      break;
    }
    case "manager":
      for (const p of f.partners) p.role = p.c === d.c ? "managing" : "silent";
      for (const p of f.partners)
        p.cooking = p.role === "managing" ? p.cooking : false;
      break;
    case "sell":
      windUp(g, f, "the partners voted to sell up");
      break;
  }
  partnersChanged(g, "f");
}

// ---------------------------------------------------------------- when things go wrong

/** Every month, after the books: the troubles of trade. */
export function firmTroubles(g: ConquestGame, f: Firm): void {
  if (f.status !== "trading") return;
  const s = g.s;
  const r = fdice(g);
  // A partner's failure: their creditors come for the share.
  if (!f.seized)
    for (const p of f.partners) {
      const life = lifeOfChar(s, p.c);
      const broke = life
        ? life.purse < BAILIFFS_AT
        : r.chance(firmAtWar(s, f) ? 0.006 : 0.002);
      if (broke) {
        seize(g, f, p);
        break;
      }
    }
  if (f.status !== "trading") return;
  // The sea, the enemy and the privateers.
  if (f.biz && SHIP_JOBS.has(f.biz.job)) {
    const mgr = managerOf(f);
    const c = mgr ? s.chars[mgr.c] : undefined;
    let p = firmAtWar(s, f) ? 0.03 : 0.005;
    if (c && charSkill(s, c, "seamanship") >= 8) p *= 0.5;
    if (r.chance(p)) loseShip(g, f);
  }
  if (
    f.biz &&
    (s.provinces[f.prov]?.occupier ?? -1) >= 0 &&
    s.day - (f.held ?? -9999) > 180
  ) {
    f.held = s.day;
    for (const l of playerPartners(s, f))
      raiseEvent(g, l, "pa-held", { f: f.id, c: managerOf(f)?.c ?? -1 });
  }
  // Two sets of books found out.
  for (const p of f.partners) {
    const unfound = r2((p.skim ?? 0) - (p.caught ?? 0));
    if (unfound < 1) continue;
    for (const o of f.partners) {
      if (o === p) continue;
      const ol = lifeOfChar(s, o.c);
      const oc = s.chars[o.c];
      if (!oc?.alive) continue;
      let chance: number;
      if (ol) {
        const sk = charSkill(s, oc, "trade") + charSkill(s, oc, "letters");
        chance = 0.05 + sk / 200 + (ol.prov === f.prov ? 0.03 : 0);
      } else if (isPlayer(s, p.c))
        chance = 0.04 + charSkill(s, oc, "trade") / 200;
      else continue;
      if (f.drafted === o.c) chance += 0.05;
      if (unfound > 15) chance += 0.03;
      if (r.chance(chance)) {
        foundOut(g, f, p, o, unfound);
        break;
      }
    }
  }
  // A quarrel over the accounts, with a computer partner who's soured.
  for (const p of f.partners) {
    const pl = lifeOfChar(s, p.c);
    if (!pl || pl.watching) continue;
    const rival = f.partners.find((o) => {
      if (o === p || isPlayer(s, o.c)) return false;
      const oc = s.chars[o.c];
      return !!oc?.alive && opinionOf(s, oc, pl).total < -10;
    });
    const bad = avgProfit(s, f, 3) < 0;
    if ((rival || (bad && f.partners.length > 1)) && r.chance(0.03)) {
      const other =
        rival ?? f.partners.find((o) => o !== p && !isPlayer(s, o.c));
      if (!other) continue;
      const sum = Math.max(
        3,
        Math.round(
          (f.chest + f.partners.reduce((m, x) => m + x.capital, 0)) * 0.06,
        ),
      );
      raiseEvent(g, pl, "pa-dispute", { f: f.id, c: other.c, sum });
      wake(g, pl, `${f.name}: a quarrel over the accounts.`);
      break;
    }
  }
  // A managing partner (a player) who keeps the books alone is tempted.
  const mgr = managerOf(f);
  const ml = mgr ? lifeOfChar(s, mgr.c) : undefined;
  if (
    mgr &&
    ml &&
    !mgr.cooking &&
    f.books.length >= 3 &&
    (f.books[f.books.length - 1]?.takings ?? 0) > 5 &&
    (ml.cooldowns["ev:pa-books"] ?? 0) <= s.day &&
    r.chance(hasTrait(s.chars[mgr.c], "deceitful") ? 0.1 : 0.03)
  )
    raiseEvent(g, ml, "pa-books", { f: f.id, c: mgr.c });
}

/** A managing partner's second set of books, found out by a partner. */
function foundOut(
  g: ConquestGame,
  f: Firm,
  culprit: FirmPartner,
  finder: FirmPartner,
  sum: number,
): void {
  const s = g.s;
  culprit.caught = culprit.skim ?? 0;
  const cl = lifeOfChar(s, culprit.c);
  const fl = lifeOfChar(s, finder.c);
  if (!cl) culprit.cooking = false;
  firmLine(
    g,
    f,
    `${charName(s.chars[finder.c])} finds ${sum} coins missing from the books.`,
  );
  if (cl)
    tell(
      g,
      culprit.c,
      `${charName(s.chars[finder.c])} has been going through the books of ${f.name}, and found ${sum} coins that aren't there.`,
      "bad",
      true,
    );
  if (fl) {
    raiseEvent(g, fl, "pa-embezzle", { f: f.id, c: culprit.c, sum });
    wake(g, fl, `${f.name}: the books don't add up.`);
    return;
  }
  // A computer partner who's found a player out.
  const fc = s.chars[finder.c];
  if (!cl || !fc) return;
  const sue =
    hasTrait(fc, "honest") ||
    hasTrait(fc, "just") ||
    opinionOf(s, fc, cl).total < 0;
  remembers(g, cl, g.char(fc.id), "Cheated me in our partnership", -30, 8);
  if (sue) openSuit(g, f, finder.c, culprit.c, sum, "embezzle");
  else raiseEvent(g, cl, "pa-caught", { f: f.id, c: finder.c, sum });
}

/** The ship is lost: wrecked, or taken in wartime. */
export function loseShip(g: ConquestGame, f: Firm): void {
  const s = g.s;
  const biz = f.biz!;
  const war = firmAtWar(s, f);
  const what = war ? "taken by a privateer" : "lost with all her gear";
  f.lost = { job: biz.job, place: biz.place, name: bizName(biz.job, 1) };
  f.biz = null;
  f.hold = "venture";
  firmLine(g, f, `The firm's ${f.lost.name} is ${what}.`);
  rumour(
    g,
    f.prov,
    `The ${f.lost.name} of ${f.name} has been ${what}.`,
    managerOf(f)?.c ?? -1,
    "bad",
  );
  for (const l of playerPartners(s, f)) {
    journal(g, l, `${f.name}: the ${f.lost.name} is ${what}.`, "bad");
    addStress(g, l, 6);
    raiseEvent(g, l, "pa-ship", {
      f: f.id,
      w: war ? 1 : 0,
      c: managerOf(f)?.c ?? -1,
    });
  }
}

/** A partner's creditors take their share, to be sold. */
function seize(g: ConquestGame, f: Firm, p: FirmPartner): void {
  const s = g.s;
  const worth = windingUpShares(s, f).get(p.c) ?? 0;
  const price = Math.max(1, Math.round(FIRE_SALE * Math.max(0, worth)));
  f.seized = { c: p.c, price, day: s.day };
  firmLine(
    g,
    f,
    `${charName(s.chars[p.c])} has failed: the creditors seize the share, to be sold for ${price}.`,
  );
  tell(
    g,
    p.c,
    `Your creditors have seized your share in ${f.name}: it's to be sold, and the money goes to what you owe.`,
    "bad",
    true,
  );
  const others = playerPartners(s, f).filter((l) => l.c !== p.c);
  for (const l of others) {
    raiseEvent(g, l, "pa-creditors", { f: f.id, c: p.c, price });
    wake(g, l, `${f.name}: creditors at the counting-house door.`);
  }
  if (!others.length) {
    // The computer's partners buy it in if they can, or a creditor's man takes it.
    const buyer = f.partners.find(
      (o) =>
        o !== p &&
        !isPlayer(s, o.c) &&
        (s.chars[o.c]?.role ? ROLES[s.chars[o.c].role!].wealth : 0) >= price,
    );
    sellSeized(g, f, buyer ? "buy" : "stranger", buyer?.c);
  }
  partnersChanged(g, "f");
}

/** The seized share is sold: to a partner, to a stranger, or the firm wound up. */
export function sellSeized(
  g: ConquestGame,
  f: Firm,
  how: "buy" | "stranger" | "wind",
  buyer = -1,
): string | null {
  const s = g.s;
  const sz = f.seized;
  if (!sz || f.status !== "trading") return "It's settled.";
  const p = partnerIn(f, sz.c);
  if (!p) {
    f.seized = null;
    return "It's settled.";
  }
  if (how === "wind") {
    f.seized = null;
    windUp(g, f, `${charName(s.chars[sz.c])}'s creditors forced it`);
    return null;
  }
  if (how === "buy") {
    const bl = lifeOfChar(s, buyer);
    if (bl && bl.purse < sz.price) return `It's ${sz.price} coins.`;
    chargeTo(g, buyer, sz.price);
    payTo(g, sz.c, sz.price);
    succeed(f, p, buyer, s.day);
    firmLine(
      g,
      f,
      `${charName(s.chars[buyer])} buys the seized share for ${sz.price}.`,
    );
  } else {
    const stranger = creditorsMan(s, f);
    payTo(g, sz.c, sz.price);
    if (stranger >= 0) {
      succeed(f, p, stranger, s.day, "silent");
      firmLine(
        g,
        f,
        `${charName(s.chars[stranger])}, for the creditors, takes the seized share.`,
      );
      for (const l of playerPartners(s, f))
        journal(
          g,
          l,
          `${charName(s.chars[stranger])} is your partner in ${f.name} now, for the creditors.`,
        );
    } else {
      spreadShare(f, p);
      f.partners = f.partners.filter((x) => x !== p);
    }
  }
  f.seized = null;
  clearFirmEvents(g, f.id);
  ensureManager(s, f);
  partnersChanged(g, "f");
  if (f.partners.length <= 1) endWithOne(g, f);
  return null;
}

/** A merchant of the town (or someone of means) who buys a seized share. */
function creditorsMan(s: GameState, f: Firm): number {
  const folk = (s.locals[f.prov] ?? [])
    .map((id) => s.chars[id])
    .filter(
      (c): c is Character =>
        !!c?.alive &&
        !c.abroad &&
        !isPlayer(s, c.id) &&
        !partnerIn(f, c.id) &&
        ageOf(s, c) >= 21,
    );
  const best =
    folk.find((c) => c.role === "merchant") ??
    folk.find((c) => c.role === "planter" || c.role === "lawyer") ??
    folk.sort(
      (a, b) =>
        (b.role ? ROLES[b.role].wealth : 0) -
          (a.role ? ROLES[a.role].wealth : 0) || a.id - b.id,
    )[0];
  return best?.id ?? -1;
}

// ---------------------------------------------------------------- suits at law between partners

/**
 * A suit between partners in the county court (a suit for debt): over coins
 * kept out of the books, or a claim on the accounts. Where there's no court
 * of the colonies, the elders hear it at once.
 */
export function openSuit(
  g: ConquestGame,
  f: Firm,
  by: number,
  against: number,
  sum: number,
  why: "embezzle" | "claim",
): string | null {
  const s = g.s;
  if (f.suit) return "There's a suit between the partners already.";
  const owner = s.provinces[f.prov]?.owner ?? -1;
  const firm = f.name;
  if (owner < 0 || s.nations[owner]?.kind !== "power") {
    // Arbitration by the elders, there and then.
    const lean =
      0.5 + (f.drafted === by ? 0.15 : 0) - (f.drafted === against ? 0.15 : 0);
    settleSuit(g, f, by, against, sum, fdice(g).chance(lean), why);
    return null;
  }
  const evidence =
    7 +
    (f.drafted === by ? 4 : 0) -
    (f.drafted === against ? 3 : 0) +
    (sum >= 15 ? 2 : 0);
  const t = openTrial(g, {
    kind: "debt",
    defendant: against,
    accuser: by,
    p: f.prov,
    nation: owner,
    charge:
      why === "embezzle"
        ? `keeping ${sum} coins of the firm of ${firm} out of its books`
        : `a debt of ${sum} coins to ${charName(s.chars[by])} on the accounts of ${firm}`,
    grade: sum >= 20 ? 2 : 1,
    evidence,
  });
  f.suit = { trial: t.id, by, against, sum };
  firmLine(
    g,
    f,
    `${charName(s.chars[by])} goes to law against ${charName(s.chars[against])}.`,
  );
  partnersChanged(g, "f");
  return null;
}

/** Each day: a suit between partners that's been decided. */
export function suitsDaily(g: ConquestGame, f: Firm): void {
  const sx = f.suit;
  if (!sx) return;
  const t = trialById(g.s, sx.trial);
  if (!t) {
    f.suit = null;
    partnersChanged(g, "f");
    return;
  }
  if (t.stage < 5) return;
  f.suit = null;
  if (!t.verdict) {
    firmLine(g, f, "The suit falls.");
    partnersChanged(g, "f");
    return;
  }
  const culprit = partnerIn(f, sx.against);
  const embezzle = !!culprit && (culprit.caught ?? 0) > 0;
  settleSuit(
    g,
    f,
    sx.by,
    sx.against,
    sx.sum,
    t.verdict === "guilty",
    embezzle ? "embezzle" : "claim",
  );
}

/** What a suit (or the elders) decided comes to. */
function settleSuit(
  g: ConquestGame,
  f: Firm,
  by: number,
  against: number,
  sum: number,
  won: boolean,
  why: "embezzle" | "claim",
): void {
  const s = g.s;
  const byName = charName(s.chars[by]);
  const agName = charName(s.chars[against]);
  if (won) {
    if (why === "embezzle") {
      // Made good to the firm, and out they go: their capital less what they took.
      chargeTo(g, against, sum);
      f.chest = r2(f.chest + sum);
      const p = partnerIn(f, against);
      const refund = p ? Math.max(0, p.capital - (p.caught ?? 0)) : 0;
      firmLine(
        g,
        f,
        `${agName} is made to pay back ${sum}, and is put out of the firm.`,
      );
      tell(
        g,
        by,
        `The court finds for you: ${agName} pays ${sum} back into ${f.name}, and is put out of the firm.`,
        "good",
        true,
      );
      tell(
        g,
        against,
        `The court finds against you: ${sum} coins back into ${f.name}, and you're put out of the firm.`,
        "bad",
        true,
      );
      removePartner(g, f, against, refund);
    } else {
      chargeTo(g, against, sum);
      payTo(g, by, sum);
      firmLine(g, f, `${agName} is made to pay ${byName} ${sum}.`);
      tell(
        g,
        against,
        `${byName}'s claim is upheld: you pay ${sum} coins.`,
        "bad",
        true,
      );
      tell(
        g,
        by,
        `Your claim against ${agName} is upheld: ${sum} coins.`,
        "good",
        true,
      );
    }
  } else {
    chargeTo(g, by, 3);
    firmLine(g, f, `${byName}'s case against ${agName} fails.`);
    tell(
      g,
      by,
      `Your case against ${agName} fails; the costs, 3 coins, are yours.`,
      "bad",
      true,
    );
    tell(g, against, `${byName}'s case against you fails.`, "good", true);
    const bl = lifeOfChar(s, by);
    const ac = s.chars[against];
    if (bl && ac && !isPlayer(s, against))
      remembers(g, bl, g.char(ac.id), "Dragged me into court", -20, 5);
  }
  partnersChanged(g, "f");
}

// ---------------------------------------------------------------- deaths and heirs

/** Each day: a dead partner's share passes to their heir (or back to the firm). */
export function heirsDaily(g: ConquestGame, f: Firm): void {
  const s = g.s;
  for (const p of [...f.partners]) {
    if (p.dead === undefined) continue;
    const dead = p.c;
    const deadName = charName(s.chars[dead]);
    const wasManager = p.role === "managing";
    // A player's line goes on in their heir, who inherits the share.
    const line = s.lives.find((l) => l.line.includes(dead));
    let heir = -1;
    if (
      line &&
      !line.watching &&
      line.c >= 0 &&
      line.c !== dead &&
      s.chars[line.c]?.alive
    )
      heir = line.c;
    if (heir < 0) {
      const c = s.chars[dead];
      const kids = (c?.children ?? [])
        .map((k) => s.chars[k])
        .filter(
          (k): k is Character => !!k?.alive && !k.abroad && ageOf(s, k) >= 16,
        )
        .sort((a, b) => a.born - b.born);
      const sp = s.chars[c?.spouse ?? -1];
      heir = kids[0]?.id ?? (sp?.alive && !sp.abroad ? sp.id : -1);
    }
    if (heir < 0) {
      // Nobody to inherit: the estate is paid its capital, and the share goes to the rest.
      firmLine(
        g,
        f,
        `${deadName} dies with no heir; the share goes to the others.`,
      );
      for (const l of playerPartners(s, f))
        journal(
          g,
          l,
          `${deadName} has died with no heir: their share in ${f.name} is divided among the rest of you.`,
        );
      removePartner(g, f, dead, p.capital);
      continue;
    }
    const heirLife = lifeOfChar(s, heir);
    const role =
      heirLife && wasManager ? "managing" : wasManager ? "silent" : p.role;
    succeed(f, p, heir, s.day, role);
    ensureManager(s, f);
    const heirName = charName(s.chars[heir]);
    firmLine(g, f, `${deadName} has died; the share passes to ${heirName}.`);
    if (heirLife)
      tell(
        g,
        heir,
        `You inherit ${deadName}'s share in ${f.name}: ${partnerIn(f, heir)?.share ?? 0} in a hundred.`,
        "good",
      );
    for (const l of playerPartners(s, f)) {
      if (l.c === heir) continue;
      raiseEvent(g, l, "pa-heir", { f: f.id, c: heir, d: dead });
      wake(g, l, `${f.name}: ${deadName} has died.`);
    }
    partnersChanged(g, "f");
  }
}

/** A partner dies: their share waits for the heir (settled the next day). */
export function partnerDied(g: ConquestGame, c: Character): void {
  const s = g.s;
  for (const f of firmsWith(s, c.id)) {
    const p = partnerIn(f, c.id);
    if (p && p.dead === undefined) {
      p.dead = s.day;
      partnersChanged(g, "f");
    }
  }
}
