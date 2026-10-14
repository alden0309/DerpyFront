// LEDGER (r15): money made plain. The month's forecast counts every coin
// that comes and goes each month (wages and living, rents and keep, boats'
// crews, your people's wages, a company's pay, dividends and voyages), with
// what runs on luck kept apart as what's expected and its range. At each
// month's turn the month's books close into a statement, line by line, and
// the news of your own affairs comes as its own kind of notice. The tracker
// lists everything of yours out working; the acres you own are added up by
// province.

import { BOATS, CREW_WAGE } from "./Boats";
import { formatDate, formatMonth, isMonthStart } from "./Calendar";
import {
  companyAllowance,
  companyPay,
  followerFlow,
  followerTitle,
  peopleOf,
  tradeFlow,
} from "./Followers";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import {
  budgetKey,
  commandFlow,
  openBooks,
  turnFlows,
  withFlow,
  type FlowTag,
} from "./LedgerCore";
import { ACT_BY_KEY } from "./LifeActs";
import { journal, touchLife } from "./LifeCore";
import { atPost, hasKit, meOf, monthlyBudget } from "./LifeQueries";
import {
  KIT,
  LAND_LOT,
  SHARE_CRASH,
  SHARE_DIVIDEND,
  SHARE_SWING,
  VENTURE_LUCK,
  VENTURE_WAR_LOSS,
  VENTURE_WAR_PRICE, // BUSINESS (r15)
} from "./LifeRules";
import type { World } from "./Map";
import { officerKeep, ventureFlow, venturesOf } from "./Money";
import { boatJobOdds, clerkOdds, nextTurn, tripPerMonth } from "./Odds";
import { firmsWith, partnerIn } from "./PartnersCore";
import { paperOf } from "./Press";
import { propertyBudget, propertyFlow, propertyOf } from "./Property";
import { charName } from "./Queries";
import { effortDay } from "./Trades";
import type {
  AffairItem,
  AffairKind,
  Breakdown,
  GameState,
  KitKey,
  Life,
  LifeCommand,
  Part,
  Property,
  Statement,
  Venture,
} from "./Types";
import { SUNDAY } from "./Work";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- the forecast

/** How the month's lines are grouped on the page. */
export type LedgerGroup =
  | "work"
  | "living"
  | "family"
  | "property"
  | "keep"
  | "boats"
  | "people"
  | "ventures"
  | "firms"
  | "other";

export const LEDGER_GROUPS: { id: LedgerGroup; name: string }[] = [
  { id: "work", name: "Work and office" },
  { id: "living", name: "Living" },
  { id: "family", name: "The children" },
  { id: "property", name: "House, land and business" },
  { id: "keep", name: "What you keep" },
  { id: "boats", name: "Boats" },
  { id: "people", name: "Your people" },
  { id: "ventures", name: "Money at work" },
  { id: "firms", name: "Partnerships and the press" },
  { id: "other", name: "Other" },
];

/** Which group a month's line belongs in, by its key. */
export function groupOfKey(key: string, label = ""): LedgerGroup {
  const head = key.split(":")[0];
  switch (head) {
    case "b":
    case "bj":
      return "boats";
    case "f":
    case "tr":
    case "co":
    case "band":
    case "people":
      return "people";
    case "v":
      return "ventures";
    case "firm":
    case "np":
      return "firms";
    case "p":
    case "bond": // LABOUR (r15): those held in bondage, their keep and their work
      return "property";
    case "kit":
    case "ok":
      return "keep";
    case "m": {
      const l = label || key.slice(2);
      if (/^Living|^Bread/.test(l)) return "living";
      if (/^(School|College|A tutor|Board|Apprentice)/.test(l)) return "family";
      if (/^(Your share|Partners' shares)/.test(l)) return "firms";
      return "work";
    }
    default:
      return "other";
  }
}

/** One line of the month's forecast. */
export interface ForecastLine {
  key: string;
  label: string;
  /** Coins a month (for a chance line: what's expected). */
  value: number;
  group: LedgerGroup;
  /** A line that runs on luck: from lo to hi. */
  chance?: [number, number];
  /** What made it (a property's upkeep, rates and rents). */
  parts?: Part[];
}

/** The month as it's expected to come. */
export interface Forecast {
  lines: ForecastLine[];
  /** The fixed lines (wages, keep, rents certain), all told. */
  fixed: number;
  /** What the luck-driven lines are expected to bring, all told. */
  expected: number;
  /** A month, all told: fixed and expected together. */
  total: number;
  /** The worst and best the month could come to. */
  lo: number;
  hi: number;
}

/**
 * The days your work should come to by the month's turn: worked so far, and
 * the working days still to come if you're at your post (the turn's own day
 * is worked before the month is reckoned).
 */
export function projectedWorked(
  s: GameState,
  w: World,
  life: Life,
  turn = nextTurn(s.day),
): number {
  const job = life.job;
  if (!job) return 0;
  let worked = job.worked ?? 0;
  if (!atPost(s, w, life)) return worked;
  const per = effortDay(life);
  for (let d = s.day + 1; d <= turn; d++)
    if (!SUNDAY(d)) worked = Math.round((worked + per) * 10) / 10;
  return worked;
}

/** The land's rents run on the harvest: from 0.6 to 1.4 of the rent (Property.ts rolls 0.6 + 0.8 × luck). */
export const RENT_YEAR = [0.6, 1.4] as const;

/** A property's line of the month: its upkeep, rates, rents and takings together. */
export function propertyLine(
  s: GameState,
  w: World,
  life: Life,
  pr: Property,
): ForecastLine {
  const b = propertyBudget(s, { ...life, property: [pr] });
  const value = r2(b.parts.reduce((m, p) => m + (p.mul ? 0 : p.value), 0));
  const tag = propertyFlow(w, pr);
  const line: ForecastLine = {
    key: tag.key,
    label: tag.label,
    value,
    group: "property",
    parts: b.parts,
  };
  if (pr.kind === "land")
    line.chance = [
      r2(pr.level * (LAND_LOT.rent * RENT_YEAR[0] - LAND_LOT.upkeep)),
      r2(pr.level * (LAND_LOT.rent * RENT_YEAR[1] - LAND_LOT.upkeep)),
    ];
  return line;
}

/**
 * Every month's flow that monthlyBudget doesn't reckon itself: boats' crews
 * and work, your people's wages and trading, a company, an officer's keep,
 * debts falling due, dividends and cargoes home. Registered as a forecast
 * hook, so the month's figure counts them wherever it's shown.
 */
export function ledgerParts(s: GameState, life: Life, w?: World): Part[] {
  const out: Part[] = [];
  if (life.c < 0 || life.watching) return out;
  const turn = nextTurn(s.day);
  // Boats: the crew's wages and her keep, and what her work should bring.
  for (const b of life.boats ?? []) {
    const def = BOATS[b.kind];
    out.push({
      key: `b:${b.id}`,
      label: `The ${b.name}: crew and keep`,
      value: -r1(def.upkeep + b.crew * CREW_WAGE),
    });
    if (b.use !== "idle" && w) {
      const o = boatJobOdds(s, w, life, b, b.use, { day: turn });
      if (o.ok)
        out.push({
          key: `bj:${b.id}`,
          label: `The ${b.name}, ${o.title.replace(/, a month$/, "").toLowerCase()}`,
          value: o.expected,
          chance: [o.lo, o.hi],
        });
    }
  }
  // Your people: wages; a clerk out trading, what a trip makes a month.
  for (const f of peopleOf(life)) {
    if (f.wage > 0) {
      const t = followerFlow(s, f);
      out.push({ key: t.key, label: t.label, value: -f.wage });
    }
    if (f.task?.kind === "trade" && f.task.stake) {
      const o = clerkOdds(s, f, f.task.stake);
      const t = tradeFlow(s, f);
      out.push({
        key: t.key,
        label: `${t.label}, ${f.task.stake} out (a month on average; the range is a trip's)`,
        value: tripPerMonth(o),
        chance: [o.lo, o.hi],
      });
    }
  }
  // A company: its pay, or (in the colony's pay) the captain's allowance.
  const co = life.company;
  if (co) {
    const army = co.army >= 0 ? s.armies.find((a) => a.id === co.army) : null;
    const men = army
      ? Math.round(army.regs.reduce((m, r) => m + r.men, 0))
      : co.men;
    const now = { ...co, men };
    const cp = companyPay(s, now);
    out.push(
      cp.inPay
        ? {
            key: "co",
            label: `${co.name}: the captain's allowance`,
            value: companyAllowance(men),
          }
        : {
            key: "co",
            label: `${co.name}: pay for ${men} men`,
            value: -cp.pay,
          },
    );
  }
  const keep = officerKeep(s, life);
  if (keep > 0)
    out.push({ key: "ok", label: "Keeping up your rank", value: -keep });
  // ECON (r17): a bond's interest is in the figure (Loans.ts); the sum
  // itself is paid when the bond is called in, not at the month's turn.
  // Money at work: dividends, and cargoes due home.
  const me = meOf(s, life);
  const war =
    !!me && s.wars.some((x) => x.a === me.nation || x.b === me.nation);
  for (const v of venturesOf(life)) {
    const o = ventureOdds(v, war);
    if (v.kind === "shares" || v.due <= turn)
      out.push({
        key: ventureFlow(v).key,
        label:
          v.kind === "shares"
            ? `Dividend: shares in ${v.name}`
            : `A cargo of ${v.name}, due home`,
        value: o.expected,
        chance: [o.lo, o.hi],
      });
  }
  // A newspaper of your own: as it did last month.
  const x = paperOf(s, life.c);
  if (x && x.income)
    out.push({
      key: `np:${x.id}`,
      label: `${x.name}, as last month`,
      value: x.income,
      chance: [x.income, x.income],
    });
  return out;
}
hooks.forecast.push(ledgerParts);

/** A venture's month (shares) or homecoming (a cargo): expected, and the range. */
export function ventureOdds(
  v: Venture,
  war: boolean,
): {
  expected: number;
  lo: number;
  hi: number;
  outcomes: { label: string; p: number; back: number }[];
} {
  if (v.kind === "shares") {
    const mean = (SHARE_SWING[0] + SHARE_SWING[1]) / 2;
    const after =
      (1 - SHARE_CRASH) * v.value * (1 + mean) + SHARE_CRASH * v.value * 0.2;
    return {
      expected: r2(after * SHARE_DIVIDEND),
      lo: r2(v.value * 0.2 * SHARE_DIVIDEND),
      hi: r2(v.value * (1 + SHARE_SWING[1]) * SHARE_DIVIDEND),
      outcomes: [],
    };
  }
  const loss = war ? VENTURE_WAR_LOSS : VENTURE_LUCK[0].p;
  const rest = VENTURE_LUCK.slice(1);
  const total = rest.reduce((m, l) => m + l.p, 0);
  const outcomes = [
    { label: VENTURE_LUCK[0].text, p: loss, back: 0 },
    ...rest.map((l) => ({
      label: l.text,
      p: ((1 - loss) * l.p) / total,
      back: r2(v.stake * l.x * (war ? VENTURE_WAR_PRICE : 1)), // BUSINESS (r15)
    })),
  ];
  return {
    expected: r1(outcomes.reduce((m, o) => m + o.p * o.back, 0)),
    lo: 0,
    hi: r1(
      v.stake *
        VENTURE_LUCK[VENTURE_LUCK.length - 1].x *
        (war ? VENTURE_WAR_PRICE : 1), // BUSINESS (r15)
    ),
    outcomes,
  };
}

/**
 * The month's forecast, line by line: monthlyBudget's own lines (wages,
 * dues, living, school; and every forecast hook's), each property on its
 * own line, and each kept thing's keep. The wage is reckoned by the days
 * the month should come to at the pace you work.
 */
export function ledgerForecast(s: GameState, w: World, life: Life): Forecast {
  const lines: ForecastLine[] = [];
  const bare = monthlyBudget(
    s,
    w,
    { ...life, property: [], kit: {} },
    false,
    life.job ? projectedWorked(s, w, life) : undefined,
  );
  for (const p of bare.parts) {
    if (p.mul) continue;
    const key = p.key ?? budgetKey(p.label);
    lines.push({
      key,
      label: p.label,
      value: r2(p.value),
      group: groupOfKey(key, p.label),
      ...(p.chance ? { chance: p.chance } : {}),
    });
  }
  for (const pr of propertyOf(life)) {
    const line = propertyLine(s, w, life, pr);
    if (line.value || line.chance) lines.push(line);
  }
  for (const k of Object.keys(life.kit ?? {}) as KitKey[])
    if (KIT[k].upkeep && hasKit(s, life, k))
      lines.push({
        key: `kit:${k}`,
        label: `Keep: ${KIT[k].name.toLowerCase()}`,
        value: -KIT[k].upkeep,
        group: "keep",
      });
  let fixed = 0;
  let expected = 0;
  let lo = 0;
  let hi = 0;
  for (const l of lines) {
    if (l.chance) {
      expected += l.value;
      lo += Math.min(l.chance[0], l.value);
      hi += Math.max(l.chance[1], l.value);
    } else {
      fixed += l.value;
      lo += l.value;
      hi += l.value;
    }
  }
  return {
    lines,
    fixed: r1(fixed),
    expected: r1(expected),
    total: r1(fixed + expected),
    lo: r1(lo),
    hi: r1(hi),
  };
}

/** The forecast as a breakdown, for a tooltip: fixed lines, then the chance lines. */
export function forecastBreakdown(f: Forecast): Breakdown {
  const parts: Part[] = [];
  for (const l of f.lines)
    if (!l.chance) parts.push({ label: l.label, value: l.value, key: l.key });
  for (const l of f.lines)
    if (l.chance)
      parts.push({
        label: l.label,
        value: l.value,
        key: l.key,
        chance: l.chance,
      });
  return { total: f.total, parts };
}

// ---------------------------------------------------------------- the month's books

/** How many months' statements are kept. */
export const STATEMENTS_KEPT = 12;

/** The month's turn begins: books for everyone, and the turn's flows named as such. */
function monthOpens(g: ConquestGame): void {
  turnFlows(g, true);
  for (const life of g.s.lives)
    if (!life.watching && life.c >= 0 && !life.books)
      touchLife(g, life).books = openBooks(g, life);
}

/** On the eve of the month's turn: what it's expected to bring, for the statement. */
function eveOfTurn(g: ConquestGame, life: Life): void {
  if (!isMonthStart(g.s.day + 1) || life.c < 0) return;
  const f = ledgerForecast(g.s, g.w, life);
  const b = (touchLife(g, life).books ??= openBooks(g, life));
  b.expected = f.total;
  b.exp = {};
  for (const l of f.lines) b.exp[l.key] = r2((b.exp[l.key] ?? 0) + l.value);
}
hooks.lifeDaily.push(eveOfTurn);

/** The month's turn is done: each player's books close into a statement. */
function monthCloses(g: ConquestGame): void {
  turnFlows(g, false);
  const s = g.s;
  for (const life of s.lives) {
    const b = life.books;
    if (!b) continue;
    touchLife(g, life);
    const lines = b.lines.filter((l) => Math.abs(l.v) >= 0.005);
    const sum = lines.reduce((m, l) => m + l.v, 0);
    const diff = r2(life.purse - b.open - sum);
    if (Math.abs(diff) >= 0.01)
      lines.push({ k: "x", l: "Other, not itemised", v: diff });
    life.books = openBooks(g, life);
    if (!lines.length) continue;
    const st: Statement = {
      ...b,
      lines,
      to: s.day,
      close: r2(life.purse),
    };
    (life.statements ??= []).push(st);
    if (life.statements.length > STATEMENTS_KEPT)
      life.statements.splice(0, life.statements.length - STATEMENTS_KEPT);
    if (life.watching || life.c < 0) continue;
    const inn = r1(lines.reduce((m, l) => m + Math.max(0, l.v), 0));
    const out = r1(lines.reduce((m, l) => m + Math.max(0, -l.v), 0));
    const net = r1(life.purse - b.open);
    affairNews(
      g,
      life,
      "statement",
      `The month's accounts (${formatMonth(s.day - 1)}): ${inn} in, ${out} out, ${net >= 0 ? "+" : "−"}${Math.abs(net)} all told.`,
    );
  }
}
hooks.monthStart.push(monthOpens);
hooks.monthEnd.push(monthCloses);

/** News of your own affairs, marked as such. */
export function affairNews(
  g: ConquestGame,
  life: Life,
  kind: AffairKind,
  text: string,
  tone?: "good" | "bad",
): void {
  withFlow(g, { key: "news", label: "", aff: kind }, () =>
    journal(g, life, text, tone),
  );
}

/** What a statement's lines come to: in, out, all told. */
export function statementTotals(st: Statement): {
  inn: number;
  out: number;
  net: number;
} {
  const inn = st.lines.reduce((m, l) => m + Math.max(0, l.v), 0);
  const out = st.lines.reduce((m, l) => m + Math.max(0, -l.v), 0);
  return { inn: r2(inn), out: r2(out), net: r2(st.close - st.open) };
}

// ---------------------------------------------------------------- commands

const COMMAND_FLOWS: Record<string, string> = {
  travel: "Fares on the road",
  act: "Things done and bought in town",
  job: "Work",
  quit: "Work",
  person: "Dealings with people",
  trade: "Buying and selling goods",
  market: "Buying and selling goods",
  present: "Gifts at the council fire",
  lead: "Working leads",
  property: "Property bought and sold",
  army: "Your army",
  command: "Your army",
  march: "Your army",
  repay: "Debts repaid",
  society: "Letters, gatherings and office",
  europe: "The voyage to Europe",
  movement: "Causes",
  stand: "Standing for election",
  gov: "Governing",
  effort: "Work",
  takeup: "Work",
  crime: "The underworld",
  law: "The law",
  people: "Your people",
  boat: "Boats",
  sail: "Sailing",
  contract: "Contracts",
  power: "Office, the council and the press",
  home: "House and household",
  edu: "The children's schooling",
  partners: "Partnerships",
  dice: "Liar's dice",
  likeness: "A likeness",
  // GOV (r21)
  exped: "Expeditions",
  desk: "Governing",
};

/** The name a command's money goes under in the month's books. */
export function commandTag(life: Life, c: LifeCommand): FlowTag {
  if (c.k === "event") {
    const e = life.events.find((x) => x.id === c.id);
    return {
      key: `ev:${e?.key ?? "event"}`,
      label: e?.title ? `${e.title}` : "Events and letters",
    };
  }
  if (c.k === "act") {
    const def = ACT_BY_KEY.get(c.act);
    const label = def?.label.replace(/ \([\d.]+\)$/, "");
    return {
      key: `act:${c.act}`,
      label: label ?? COMMAND_FLOWS.act,
    };
  }
  const label = COMMAND_FLOWS[c.k] ?? "Other comings and goings";
  return { key: `cmd:${c.k}`, label };
}

hooks.gate.push((g, life, c) => {
  commandFlow(g, commandTag(life, c));
  return null;
});
hooks.afterCommand.push((g) => commandFlow(g, null));

// ---------------------------------------------------------------- the tracker

/** Everything of yours out working: boats, cargoes, traders, firms, a company, a paper. */
export function affairsOf(s: GameState, w: World, life: Life): AffairItem[] {
  const out: AffairItem[] = [];
  if (life.c < 0 || life.watching) return out;
  const map = w.map;
  const turn = nextTurn(s.day);
  const at = (p: number) => map.provinces[p]?.name ?? "somewhere";
  for (const b of life.boats ?? []) {
    const def = BOATS[b.kind];
    const o = boatJobOdds(s, w, life, b, b.use, { day: turn });
    const skipper = peopleOf(life).find(
      (f) => f.task?.kind === "boat" && f.task.boat === b.id,
    );
    const sailing = life.travel?.boat === b.id;
    const status = sailing
      ? "under sail"
      : b.use === "idle"
        ? "laid up"
        : o.ok
          ? "at work"
          : "idle";
    const warn =
      (b.owed ?? 0) > 0
        ? "Her crew are owed wages"
        : b.crew < def.crew
          ? `Short-handed: ${b.crew} of ${def.crew}`
          : b.condition < 40
            ? `Battered: ${Math.round(b.condition)}% sound`
            : b.use !== "idle" && !o.ok
              ? o.why
              : undefined;
    out.push({
      kind: "boat",
      id: `b:${b.id}`,
      title: `The ${b.name}`,
      what: `${def.name.toLowerCase()} at ${at(b.prov)}${b.use !== "idle" ? `, ${o.title.replace(/, a month$/, "").toLowerCase()}` : ""}${skipper ? `, ${charName(s.chars[skipper.c])} her skipper` : ""}`,
      status,
      ...(warn ? { warn } : {}),
      p: b.prov,
      due: turn,
      cost: -o.costMonth,
      ...(b.use !== "idle" && o.ok
        ? {
            expected: {
              value: o.expected,
              lo: o.lo,
              hi: o.hi,
              per: "month" as const,
            },
          }
        : {}),
      go: { tab: "estate", sub: "boats" },
    });
  }
  const me = meOf(s, life);
  const war =
    !!me && s.wars.some((x) => x.a === me.nation || x.b === me.nation);
  for (const v of venturesOf(life)) {
    const o = ventureOdds(v, war);
    out.push(
      v.kind === "cargo"
        ? {
            kind: "cargo",
            id: `v:${v.id}`,
            title: `A cargo of ${v.name}`,
            what: `${v.stake} ventured on ${formatDate(v.day)}${war ? "; privateers are out in this war" : ""}`,
            status: "at sea",
            due: v.due,
            expected: { value: o.expected, lo: o.lo, hi: o.hi, per: "home" },
            go: { tab: "estate", sub: "purse" },
          }
        : {
            kind: "shares",
            id: `v:${v.id}`,
            title: `Shares in ${v.name}`,
            what: `${v.stake} paid; worth ${r1(v.value)} now`,
            status: v.value >= v.stake ? "up" : "down",
            due: turn,
            expected: { value: o.expected, lo: o.lo, hi: o.hi, per: "month" },
            go: { tab: "estate", sub: "purse" },
          },
    );
  }
  for (const f of peopleOf(life)) {
    const c = s.chars[f.c];
    const t = f.task;
    if (f.kind !== "clerk" && (!t || t.kind === "boat")) continue;
    const name = `${charName(c)}, ${followerTitle(f).toLowerCase()}`;
    if (t?.kind === "trade") {
      const o = clerkOdds(s, f, t.stake ?? 0);
      out.push({
        kind: "trader",
        id: `f:${f.id}`,
        title: name,
        what: `trading out of ${at(t.p)} with ${t.stake}${t.repeat ? ", and going again" : ""}`,
        status: "trading",
        ...(f.loyalty < 25
          ? { warn: "Disloyal: may run off with the stake" }
          : {}),
        p: t.p,
        due: t.back,
        cost: -f.wage,
        expected: { value: o.expected, lo: o.lo, hi: o.hi, per: "trip" },
        go: { tab: "people", sub: "yours" },
      });
    } else if (t?.kind === "job")
      out.push({
        kind: "band",
        id: `f:${f.id}`,
        title: name,
        what: `on a job (${t.what ?? "robbery"}) at ${at(t.p)}`,
        status: "on a job",
        p: t.p,
        due: t.back,
        go: { tab: "people", sub: "yours" },
      });
    else if (t)
      out.push({
        kind: "people",
        id: `f:${f.id}`,
        title: name,
        what: t.what ? `${t.what} at ${at(t.p)}` : `waiting at ${at(t.p)}`, // BUSINESS (r15)
        status: t.what ? "at work" : "waiting", // BUSINESS (r15): a business's manager
        p: t.p,
        cost: -f.wage,
        go: { tab: "people", sub: "yours" },
      });
    else
      out.push({
        kind: "trader",
        id: `f:${f.id}`,
        title: name,
        what: "with you, waiting for a stake to trade with",
        status: "idle",
        cost: -f.wage,
        warn: `Paid ${f.wage} a month to wait: give them a stake`,
        go: { tab: "people", sub: "yours" },
      });
  }
  const lines = ledgerForecast(s, w, life).lines;
  const lineOf = (key: string) => lines.find((x) => x.key === key);
  for (const f of firmsWith(s, life.c)) {
    if (f.status !== "trading") continue;
    if (f.sea) continue; // SEA (r15): a privateering company is listed by Privateers.ts
    const p = partnerIn(f, life.c);
    const firmShare = lineOf(`firm:${f.id}`)?.value ?? 0;
    out.push({
      kind: "firm",
      id: `firm:${f.id}`,
      title: f.name,
      what: `${p?.share ?? 0}% yours${f.cargo ? `; a cargo of ${f.cargo.name} at sea, home about ${formatDate(f.cargo.due)}` : ""}`,
      status: f.cargo ? "cargo at sea" : "trading",
      p: f.prov,
      ...(f.cargo ? { due: f.cargo.due } : {}),
      expected: {
        value: firmShare,
        lo: firmShare,
        hi: firmShare,
        per: "month",
      },
      go: { tab: "estate", sub: "partners" },
    });
  }
  const co = life.company;
  if (co) {
    const line = lineOf("co");
    out.push({
      kind: "company",
      id: "co",
      title: co.name,
      what: `${co.men} men, ${co.army >= 0 ? "in the field" : "in quarters"}`,
      status: co.inPay
        ? "in the colony's pay"
        : co.army >= 0
          ? "in the field"
          : "in quarters",
      ...(co.owed
        ? { warn: `Unpaid ${co.owed} month${co.owed > 1 ? "s" : ""}` }
        : {}),
      cost: line?.value ?? 0,
      go: { tab: "people", sub: "yours" },
    });
  }
  const x = paperOf(s, life.c);
  if (x)
    out.push({
      kind: "paper",
      id: `np:${x.id}`,
      title: x.name,
      what: `${x.readers} readers at ${at(x.p)}`,
      status: x.shut && x.shut > s.day ? "shut" : "printing",
      p: x.p,
      due: turn,
      expected: {
        value: x.income ?? 0,
        lo: x.income ?? 0,
        hi: x.income ?? 0,
        per: "month",
      },
      go: { tab: "society", sub: "press" },
    });
  for (const c of life.contracts ?? [])
    if (c.status === "taken")
      out.push({
        kind: "contract",
        id: `ct:${c.id}`,
        title: c.title,
        what: `at ${at(c.target)}, by ${formatDate(c.due)}`,
        status: "taken",
        p: c.target,
        due: c.due,
        expected: { value: c.pay, lo: 0, hi: c.pay, per: "home" },
        go: { tab: "work", sub: "contracts" },
      });
  for (const h of hooks.affairs) out.push(...h(s, w, life));
  return out;
}

// ---------------------------------------------------------------- acres

/**
 * A farm of your own, reckoned in acres by its size: a freehold, a farm
 * grown, a plantation. (Land let to tenants is counted by its lots of ten.)
 */
export const FARM_ACRES = [0, 50, 100, 250];

export interface AcreRow {
  prov: number;
  name: string;
  lines: { label: string; acres: number }[];
  total: number;
}

/** The acres you own, province by province, and in all. */
export function acresOf(
  s: GameState,
  w: World,
  life: Life,
): { rows: AcreRow[]; total: number } {
  const rows = new Map<number, AcreRow>();
  const row = (p: number) => {
    let r = rows.get(p);
    if (!r) {
      r = {
        prov: p,
        name: w.map.provinces[p]?.name ?? "",
        lines: [],
        total: 0,
      };
      rows.set(p, r);
    }
    return r;
  };
  for (const pr of propertyOf(life)) {
    if (pr.kind === "land" && pr.level > 0) {
      const r = row(pr.prov);
      r.lines.push({ label: "Let to tenants", acres: pr.level * 10 });
      r.total += pr.level * 10;
    } else if (pr.kind === "business" && pr.job === "farmer") {
      const acres = FARM_ACRES[Math.min(3, pr.level)] ?? 0;
      if (!acres) continue;
      const r = row(pr.prov);
      r.lines.push({
        label:
          pr.level >= 3
            ? "Your plantation"
            : pr.level === 2
              ? "Your farm"
              : "Your farm, a freehold",
        acres,
      });
      r.total += acres;
    }
  }
  const list = [...rows.values()].sort(
    (a, b) =>
      (b.prov === life.home ? 1 : 0) - (a.prov === life.home ? 1 : 0) ||
      b.total - a.total ||
      a.prov - b.prov,
  );
  return { rows: list, total: list.reduce((m, r) => m + r.total, 0) };
}
