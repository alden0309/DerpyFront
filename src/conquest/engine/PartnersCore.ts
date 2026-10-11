// PARTNERS (r13): the track's own bookkeeping. Where firms and the articles
// going between partners live in the game, the delta that carries their
// changes to players, the track's own dice (so partnerships never shift the
// rest of the world's luck), the rules' numbers, and read-only views that
// the engine and the browser share.

import type { ConquestGame } from "./Game";
import { BUSINESS_HANDS, EXPAND_COST, JOBS } from "./LifeRules";
import { Rng } from "./Rng";
import type {
  Firm,
  FirmOffer,
  FirmPartner,
  GameState,
  JobKind,
  PartnersDelta,
  PartnersState,
} from "./Types";

// ---------------------------------------------------------------- the rules' numbers

/** Firms a player may be a partner in at once. */
export const MAX_FIRMS = 3;
/** Firms a computer character will be a partner in at once. */
export const NPC_MAX_FIRMS = 2;
/** Partners a firm may have. */
export const MAX_PARTNERS = 4;
/** Counter-offers before the talks are given up. */
export const MAX_ROUNDS = 4;
/** Days a matter put to the partners stays open. */
export const VOTE_DAYS = 30;
/** Days articles wait for an answer before they lapse. */
export const OFFER_DAYS = 60;
/** Interest a month on what a firm has borrowed. */
export const LOAN_RATE = 0.01;
/** What a firm may borrow at a time. */
export const LOANS = [20, 50, 100];
/** What a firm may send in a cargo at a time. */
export const CARGOES = [10, 20, 40, 80];
/** What may be called in from the partners at a time. */
export const CALLS = [10, 20, 40, 80];
/** What a lawyer charges for drawing up articles: an attorney, a law clerk. */
export const LAWYER_FEE = { attorney: 6, clerk: 3 };
/** A managing partner keeping a second set of books pockets this much of the takings. */
export const SKIM_SHARE = 0.25;
/** A bankrupt's share fetches this much of its worth from the creditors. */
export const FIRE_SALE = 0.6;
/** Months of books kept. */
export const BOOK_MONTHS = 24;
/** The firm's story, lines kept. */
const MAX_LINES = 30;
/** Settled offers kept a while (for the record), then dropped. */
const OFFER_KEEP_DAYS = 120;
/** Wound-up firms kept a year for their books. */
const FIRM_KEEP_DAYS = 365;

// ---------------------------------------------------------------- the state

const CHANGED = new WeakMap<ConquestGame, Set<string>>();

/** Note what changed: "f" the firms, "o" the offers. */
export function partnersChanged(g: ConquestGame, key: "f" | "o"): void {
  let set = CHANGED.get(g);
  if (!set) CHANGED.set(g, (set = new Set()));
  set.add(key);
}

/** The state, made the first time it's needed. */
export function partners(g: ConquestGame): PartnersState {
  const s = g.s;
  if (!s.partners) {
    s.partners = { firms: [], offers: [] };
    partnersChanged(g, "f");
    partnersChanged(g, "o");
  }
  return s.partners;
}

/** What changed since the last call, for the players (and clears it). */
export function takePartnersDelta(g: ConquestGame): PartnersDelta | undefined {
  const keys = CHANGED.get(g);
  const ps = g.s.partners;
  if (!keys?.size || !ps) return undefined;
  const d: PartnersDelta = {};
  if (keys.has("f")) d.firms = ps.firms;
  if (keys.has("o")) d.offers = ps.offers;
  keys.clear();
  return d;
}

export function applyPartnersDelta(s: GameState, d: PartnersDelta): void {
  s.partners ??= { firms: [], offers: [] };
  if (d.firms) s.partners.firms = d.firms;
  if (d.offers) s.partners.offers = d.offers;
}

/** Drop what's long settled, so the state stays small. */
export function tidyPartners(g: ConquestGame): void {
  const ps = g.s.partners;
  if (!ps) return;
  const day = g.s.day;
  const offers = ps.offers.filter(
    (o) =>
      o.status === "post" ||
      o.status === "open" ||
      o.status === "answered" ||
      day - o.day < OFFER_KEEP_DAYS,
  );
  if (offers.length !== ps.offers.length) {
    ps.offers = offers;
    partnersChanged(g, "o");
  }
  const firms = ps.firms.filter(
    (f) => f.status === "trading" || day - (f.ended ?? day) < FIRM_KEEP_DAYS,
  );
  if (firms.length !== ps.firms.length) {
    ps.firms = firms;
    partnersChanged(g, "f");
  }
}

const DICE = new WeakMap<ConquestGame, { day: number; rng: number }>();

/**
 * The track's own dice: seeded afresh each day from the game's seed (with a
 * salt of its own), so they never touch the world's dice and need nothing
 * saved.
 */
export function fdice(g: ConquestGame): Rng {
  const s = g.s;
  let d = DICE.get(g);
  if (!d || d.day !== s.day) {
    d = {
      day: s.day,
      rng:
        (Math.imul(s.settings.seed | 0, 0x3c6ef372) ^
          Math.imul(s.day + 9137, 0x1b873593) ^
          0x2545f491) |
        0,
    };
    DICE.set(g, d);
  }
  return new Rng(d);
}

// ---------------------------------------------------------------- read-only views

export const firmsOf = (s: GameState): Firm[] => s.partners?.firms ?? [];
export const offersOf = (s: GameState): FirmOffer[] => s.partners?.offers ?? [];

export const firmById = (s: GameState, id: number): Firm | undefined =>
  firmsOf(s).find((f) => f.id === id);

export const offerById = (s: GameState, id: number): FirmOffer | undefined =>
  offersOf(s).find((o) => o.id === id);

/** The firms someone is a partner in now. */
export function firmsWith(s: GameState, c: number): Firm[] {
  return firmsOf(s).filter(
    (f) => f.status === "trading" && f.partners.some((p) => p.c === c),
  );
}

export function partnerIn(f: Firm, c: number): FirmPartner | undefined {
  return f.partners.find((p) => p.c === c);
}

/** The partner who does the work and keeps the books. */
export function managerOf(f: Firm): FirmPartner | undefined {
  return (
    f.partners.find((p) => p.role === "managing") ??
    [...f.partners].sort((a, b) => b.share - a.share || a.c - b.c)[0]
  );
}

/** Firms whose business stands at a place in a province (for the place tiles). */
export function firmsAt(s: GameState, p: number, place?: string): Firm[] {
  return firmsOf(s).filter(
    (f) =>
      f.status === "trading" &&
      f.prov === p &&
      !!f.biz &&
      (place === undefined || f.biz.place === place),
  );
}

/** Articles waiting on someone's answer (in person, or arrived by post). */
export function offersTo(s: GameState, c: number): FirmOffer[] {
  return offersOf(s).filter((o) => o.to === c && o.status === "open");
}

/** Articles someone has put and is waiting on. */
export function offersFrom(s: GameState, c: number): FirmOffer[] {
  return offersOf(s).filter(
    (o) =>
      o.from === c &&
      (o.status === "open" || o.status === "post" || o.status === "answered"),
  );
}

/** Talks under way between two people. */
export function talksBetween(
  s: GameState,
  a: number,
  b: number,
): FirmOffer | undefined {
  return offersOf(s).find(
    (o) =>
      (o.status === "open" || o.status === "post" || o.status === "answered") &&
      ((o.from === a && o.to === b) || (o.from === b && o.to === a)),
  );
}

// ---------------------------------------------------------------- what a business is worth

/** The trades a business can be in (a trade that ends in a business of one's own). */
export function bizJobs(): JobKind[] {
  return (Object.keys(JOBS) as JobKind[]).filter(
    (k) =>
      !!JOBS[k].business &&
      !JOBS[k].crime &&
      JOBS[k].ranks.some((r) => r.buy !== undefined),
  );
}

/** What setting up a business of a trade costs: its first bought rung. */
export function bizBase(job: JobKind): number {
  return JOBS[job]?.ranks.find((r) => r.buy)?.buy?.cost ?? 40;
}

/** What a business costs to set up at a size (1 to 3). */
export function bizCost(job: JobKind, level: number): number {
  return (
    bizBase(job) +
    EXPAND_COST.slice(1, Math.max(1, Math.min(3, level))).reduce(
      (a, b) => a + b,
      0,
    )
  );
}

/** What a business would fetch if sold (as Property.ts sells one). */
export function bizSale(level: number): number {
  return (
    20 +
    EXPAND_COST.slice(0, Math.max(1, Math.min(3, level))).reduce(
      (a, b) => a + b,
      0,
    ) *
      0.5
  );
}

/** Hands a business of a size can use. */
export const bizRoom = (level: number): number => BUSINESS_HANDS[level] ?? 0;

/** "Drackley & Cole", "Drackley, Cole & Co." from the partners' surnames. */
export function firmNameOf(names: string[]): string {
  const uniq = [...new Set(names.filter(Boolean))];
  if (uniq.length <= 1) return `${uniq[0] ?? "Partners"} & Co.`;
  if (uniq.length === 2) return `${uniq[0]} & ${uniq[1]}`;
  return `${uniq.slice(0, 2).join(", ")} & Co.`;
}

/** Add a line to a firm's story. */
export function firmLine(g: ConquestGame, f: Firm, text: string): void {
  f.lines.push({ day: g.s.day, text });
  if (f.lines.length > MAX_LINES) f.lines.splice(0, f.lines.length - MAX_LINES);
  partnersChanged(g, "f");
}
