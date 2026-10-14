// WORK (r21): buying a partner out, selling them your share, or selling up
// the whole business, by offer. Until now these were matters put to the
// partners' vote, so a partner with less than half could buy out the other
// or sell the lot if the votes happened to fall that way, without the other
// ever naming a price. Now:
//
// - Buy them out: you name a price for their whole share. They accept,
//   decline, or come back with their own price (and you can answer that).
// - Sell them your share: you name your price; they accept, decline or
//   counter.
// - Sell up: you propose selling the whole business (to the town, at what it
//   would fetch); every other partner must agree. One who won't may offer to
//   buy you out instead.
//
// A computer partner decides by their interests: what their share is worth
// to them (a fair price: what it would fetch wound up, and a year of its
// profit), whether it's losing money, their nature, what they think of you,
// and what they can pay; the least they'd take (or the most they'd pay) is
// shown before you make the offer, from the same reckoning. Another player
// gets a scene (accept, decline or counter), and can name any price from the
// partnership's page. Nobody can force it, unless the articles have the
// buy-out clause: then a partner holding more than half may buy another out
// at no less than the fair price, or sell up, without their consent.

import { meansOf } from "./DiceAi";
import { registerFamily } from "./EventPacing";
import { Explain } from "./Explain";
import {
  avgProfit,
  buyoutPrice,
  endWithOne,
  tell,
  windingUpShares,
  windUp,
} from "./Firms";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { earn, journal, remembers, spend, touchLife } from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import {
  type Check,
  isChildLife,
  lifeOfChar,
  meOf,
  no,
  opinionOf,
  yes,
} from "./LifeQueries";
import { wake } from "./Pace";
import {
  firmById,
  firmLine,
  MAX_ROUNDS,
  partnerIn,
  partnersChanged,
} from "./PartnersCore";
import { charName, hasTrait } from "./Queries";
import type {
  Breakdown,
  Character,
  Firm,
  FirmBid,
  GameState,
  Life,
  LifeCommand,
} from "./Types";

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Days an offer stands before it lapses. */
export const BID_DAYS = 30;
/** Offers kept on a firm once answered (its recent history). */
const KEEP = 8;

/** The kinds of offer, in words. */
export const BID_WORDS: Record<FirmBid["kind"], string> = {
  buy: "Buy them out",
  sell: "Sell them your share",
  sellall: "Sell up the whole business",
};

// ---------------------------------------------------------------- what a share is worth

/** A partner's fair price: what their share would fetch wound up, and a year of its profit. */
export function fairPrice(s: GameState, f: Firm, c: number): number {
  return buyoutPrice(s, f, c);
}

/** What a partner's part of selling up would come to (as the winding up would pay). */
export function sellUpPart(s: GameState, f: Firm, c: number): number {
  return windingUpShares(s, f).get(c) ?? 0;
}

/** What selling up the whole business would come to, all told. */
export function sellUpTotal(s: GameState, f: Firm): number {
  let t = 0;
  for (const v of windingUpShares(s, f).values()) t += v;
  return r2(t);
}

/** What a computer character could find to pay, at most. */
export function purseOf(s: GameState, f: Firm, c: Character): number {
  const life = lifeOfChar(s, c.id);
  if (life) return Math.max(0, life.purse);
  const p = partnerIn(f, c.id);
  return Math.round(meansOf(s, c) * 4 + (p?.drawn ?? 0));
}

/** What someone thinks of a player (0 for another player: they decide for themselves). */
function liking(s: GameState, c: Character, of: Life | undefined): number {
  if (!of || lifeOfChar(s, c.id)) return 0;
  return opinionOf(s, c, of).total;
}

/**
 * The least a computer partner would take for their whole share, and why:
 * a fair price, less if the business is losing, more if it's their living,
 * if they're greedy, or if they can't abide you.
 */
export function leastToSell(
  s: GameState,
  f: Firm,
  seller: Character,
  buyer: Life | undefined,
): { least: number; b: Breakdown } {
  const fair = fairPrice(s, f, seller.id);
  const e = new Explain();
  e.add(`A fair price for their share (wound up, and a year's profit)`, fair);
  const p = partnerIn(f, seller.id);
  if (avgProfit(s, f, 3) < 0) e.mul("It's losing money: glad to be out", 0.8);
  if (p?.role === "managing") e.mul("It's their living: they run it", 1.15);
  if (hasTrait(seller, "greedy")) e.mul("Greedy", 1.2);
  if (hasTrait(seller, "content")) e.mul("Content as they are", 1.05);
  const op = liking(s, seller, buyer);
  if (op >= 20) e.mul(`They like you (${op})`, 0.95);
  else if (op <= -10) e.mul(`They can't abide you (${op})`, 1.25);
  const b = e.done(0);
  return { least: Math.max(1, Math.round(b.total)), b };
}

/**
 * The most a computer partner would pay for a player's whole share, and why:
 * a little under a fair price, much less if it's losing, more if they're
 * ambitious or like you, and never more than they can find.
 */
export function mostToBuy(
  s: GameState,
  f: Firm,
  buyer: Character,
  seller: Life,
): { most: number; b: Breakdown } {
  const fair = fairPrice(s, f, seller.c);
  const e = new Explain();
  e.add(`A fair price for your share (wound up, and a year's profit)`, fair);
  e.mul("A buyer drives a bargain", 0.95);
  if (avgProfit(s, f, 3) < 0) e.mul("It's losing money", 0.6);
  if (hasTrait(buyer, "greedy")) e.mul("Greedy", 0.9);
  if (hasTrait(buyer, "ambitious")) e.mul("Ambitious: they want it", 1.1);
  const op = liking(s, buyer, seller);
  if (op >= 20) e.mul(`They like you (${op})`, 1.05);
  else if (op <= -10) e.mul(`They can't abide you (${op})`, 0.8);
  const b = e.done(0);
  const can = purseOf(s, f, buyer);
  const most = Math.max(0, Math.min(Math.round(b.total), can));
  if (can < b.total)
    b.parts.push({ label: `All they could find: ${can}`, value: 0 });
  return { most, b };
}

/** Whether a computer partner would agree to sell up, and why. */
export function wouldSellUp(
  s: GameState,
  f: Firm,
  c: Character,
  by: Life | undefined,
): { yes: boolean; why: string } {
  const part = sellUpPart(s, f, c.id);
  const fair = fairPrice(s, f, c.id);
  if (avgProfit(s, f, 3) < 0) return { yes: true, why: "It's losing money" };
  const op = liking(s, c, by);
  if (op <= -20) return { yes: true, why: "Can't work with you" };
  if (part >= fair * (hasTrait(c, "greedy") ? 0.8 : 0.9))
    return { yes: true, why: `Their part (${Math.round(part)}) is fair` };
  return {
    yes: false,
    why: `It pays: their part (${Math.round(part)}) is less than their share's worth going on (${fair})`,
  };
}

// ---------------------------------------------------------------- the clause

/** Whether the articles let a partner force it (the buy-out clause, and more than half). */
export function clauseFor(f: Firm, c: number): boolean {
  return !!f.clause && (partnerIn(f, c)?.share ?? 0) > 50;
}

// ---------------------------------------------------------------- making an offer

export function bidsOf(f: Firm): FirmBid[] {
  return f.bids ?? [];
}

/** Offers still open on a firm. */
export function openBids(f: Firm): FirmBid[] {
  return bidsOf(f).filter((b) => b.status === "open");
}

/** Whether a partner may make an offer now. */
export function bidCheck(
  s: GameState,
  life: Life,
  f: Firm,
  kind: FirmBid["kind"],
  c: number,
  price: number,
): Check {
  if (f.status !== "trading") return no("The firm is wound up.");
  const me = partnerIn(f, life.c);
  if (!me) return no("You're not a partner.");
  if (isChildLife(s, life)) return no("Not until you're grown.");
  if (openBids(f).some((b) => b.by === life.c || b.to === life.c))
    return no("You have an offer open with them already.");
  if (kind === "sellall") {
    if (f.partners.length < 2) return no("There's nobody to agree with.");
    if (openBids(f).some((b) => b.kind === "sellall"))
      return no("Selling up is before the partners already.");
    return yes;
  }
  const them = partnerIn(f, c);
  if (!them || c === life.c) return no("Choose a partner.");
  if (openBids(f).some((b) => b.by === c || b.to === c))
    return no("They have an offer open already.");
  if (!Number.isFinite(price) || price < 1 || price > 99999)
    return no("Name a price.");
  if (kind === "buy" && life.purse < price)
    return no(`You'd need the ${Math.round(price)} coins.`);
  return yes;
}

/** Make an offer: a computer partner answers at once; a player is asked in a scene. */
export function makeBid(
  g: ConquestGame,
  life: Life,
  f: Firm,
  kind: FirmBid["kind"],
  c: number,
  price: number,
  round = 0,
): string | null {
  const s = g.s;
  const p = Math.round(price);
  const check = bidCheck(s, life, f, kind, c, p);
  if (!check.ok) return check.why;
  const bid: FirmBid = {
    id: g.nextId(),
    kind,
    by: life.c,
    to: kind === "sellall" ? -1 : c,
    price: kind === "sellall" ? Math.round(sellUpTotal(s, f)) : p,
    day: s.day,
    until: s.day + BID_DAYS,
    round,
    ...(kind === "sellall" ? { yes: { [life.c]: 1 } } : {}),
    status: "open",
  };
  (f.bids ??= []).push(bid);
  partnersChanged(g, "f");
  touchLife(g, life);
  journal(g, life, `${f.name}: ${bidWords(s, f, bid)}.`);
  firmLine(g, f, `${bidWords(s, f, bid)}.`);
  // The articles' clause: more than half, at no less than a fair price.
  if (clauseFor(f, life.c)) {
    if (kind === "sellall") {
      settle(g, f, bid, "under the articles' buy-out clause");
      return null;
    }
    if (kind === "buy" && p >= fairPrice(s, f, c)) {
      settle(g, f, bid, "under the articles' buy-out clause");
      return null;
    }
  }
  ask(g, f, bid);
  return null;
}

/** Put an offer to whoever answers it: a computer partner decides now; a player is asked. */
function ask(g: ConquestGame, f: Firm, bid: FirmBid): void {
  const s = g.s;
  const by = lifeOfChar(s, bid.by);
  const targets =
    bid.kind === "sellall"
      ? f.partners.map((p) => p.c).filter((c) => c !== bid.by)
      : [bid.to];
  for (const c of targets) {
    if (bid.status !== "open") return;
    const ch = s.chars[c];
    const pl = lifeOfChar(s, c);
    if (pl) {
      raiseEvent(g, pl, "p2p-bid", { c: bid.by, f: f.id, b: bid.id });
      wake(g, pl, `${f.name}: an offer from ${charName(s.chars[bid.by])}.`);
      continue;
    }
    if (!ch) continue;
    npcAnswer(g, f, bid, ch, by);
  }
}

/** A computer partner answers an offer by their interests. */
function npcAnswer(
  g: ConquestGame,
  f: Firm,
  bid: FirmBid,
  ch: Character,
  by: Life | undefined,
): void {
  const s = g.s;
  if (bid.kind === "sellall") {
    const v = wouldSellUp(s, f, ch, by);
    bid.yes = { ...bid.yes, [ch.id]: v.yes ? 1 : -1 };
    bid.why = `${ch.first}: ${v.why}`;
    if (!v.yes) {
      // Rather than sell, they'd buy the proposer out, if they can.
      const fair = by ? fairPrice(s, f, by.c) : 0;
      decline(g, f, bid, v.why);
      if (by && fair > 0 && purseOf(s, f, ch) >= fair) {
        const counter = counterBid(g, f, bid, ch.id, by.c, "buy", fair);
        if (counter)
          counter.why = `${ch.first} won't sell up, but would buy you out instead`;
      }
      return;
    }
    if (allAgree(f, bid)) settle(g, f, bid, "the partners agreed");
    return;
  }
  if (bid.kind === "buy") {
    // They're asked to sell their share.
    const { least } = leastToSell(s, f, ch, by);
    if (bid.price >= least) {
      bid.why = `${ch.first} takes it (the least they'd take: ${least})`;
      settle(g, f, bid, "by agreement");
    } else if (bid.price >= least * 0.75 && bid.round < MAX_ROUNDS) {
      bid.why = `${ch.first} wants ${least}`;
      counterBid(g, f, bid, ch.id, bid.by, "sell", least);
    } else {
      decline(
        g,
        f,
        bid,
        `${ch.first} won't sell at that (the least they'd take: ${least})`,
      );
    }
    return;
  }
  // "sell": they're offered the proposer's share.
  if (!by) return;
  const { most } = mostToBuy(s, f, ch, by);
  if (most > 0 && bid.price <= most) {
    bid.why = `${ch.first} buys it (the most they'd pay: ${most})`;
    settle(g, f, bid, "by agreement");
  } else if (most > 0 && bid.price <= most * 1.35 && bid.round < MAX_ROUNDS) {
    bid.why = `${ch.first} would pay ${most}`;
    counterBid(g, f, bid, ch.id, bid.by, "buy", most);
  } else {
    decline(
      g,
      f,
      bid,
      most > 0
        ? `${ch.first} won't pay that (the most they'd pay: ${most})`
        : `${ch.first} won't buy (or can't)`,
    );
  }
}

/** Whether everyone has agreed to sell up. */
function allAgree(f: Firm, bid: FirmBid): boolean {
  return f.partners.every((p) => bid.yes?.[p.c] === 1);
}

/** Someone turns it down. */
function decline(g: ConquestGame, f: Firm, bid: FirmBid, why: string): void {
  if (bid.status !== "open") return;
  bid.status = "declined";
  bid.why = why;
  partnersChanged(g, "f");
  clearScenes(g, bid);
  firmLine(g, f, `Declined: ${bidWords(g.s, f, bid).toLowerCase()} (${why}).`);
  tell(g, bid.by, `${f.name}: ${why}.`, "bad", true);
  tidy(f);
}

/**
 * A counter-offer: the other side names their price (the one bought out
 * names what they'd sell for; the one offered a share names what they'd pay).
 */
function counterBid(
  g: ConquestGame,
  f: Firm,
  bid: FirmBid,
  from: number,
  to: number,
  kind: "buy" | "sell",
  price: number,
): FirmBid | null {
  const s = g.s;
  if (bid.status === "open") bid.status = "countered";
  clearScenes(g, bid);
  const nb: FirmBid = {
    id: g.nextId(),
    kind,
    by: from,
    to,
    price: Math.round(price),
    day: s.day,
    until: s.day + BID_DAYS,
    round: bid.round + 1,
    status: "open",
  };
  (f.bids ??= []).push(nb);
  partnersChanged(g, "f");
  firmLine(g, f, `${bidWords(s, f, nb)}.`);
  tell(g, to, `${f.name}: ${bidWords(s, f, nb)}.`, undefined, true);
  // A computer partner answering a player's counter answers at once.
  const pl = lifeOfChar(s, to);
  if (pl) raiseEvent(g, pl, "p2p-bid", { c: from, f: f.id, b: nb.id });
  else {
    const ch = s.chars[to];
    if (ch) npcAnswer(g, f, nb, ch, lifeOfChar(s, from));
  }
  tidy(f);
  return nb;
}

/** Take a scene about an offer away from whoever had it. */
function clearScenes(g: ConquestGame, bid: FirmBid): void {
  for (const l of g.s.lives) {
    const before = l.events.length;
    l.events = l.events.filter(
      (e) => !(e.key === "p2p-bid" && e.ctx.b === bid.id),
    );
    if (l.events.length !== before) touchLife(g, l);
  }
}

/** Keep a firm's recent offers only. */
function tidy(f: Firm): void {
  const list = f.bids ?? [];
  const done = list.filter((b) => b.status !== "open");
  if (done.length > KEEP) {
    const drop = new Set(done.slice(0, done.length - KEEP));
    f.bids = list.filter((b) => !drop.has(b));
  }
}

/** A player's money moves; a computer character's is their own affair. */
function pay(g: ConquestGame, from: number, to: number, coins: number): void {
  const a = lifeOfChar(g.s, from);
  const b = lifeOfChar(g.s, to);
  if (a) spend(g, a, coins);
  if (b) earn(g, b, coins);
}

/** Carry out an agreed (or, under the clause, forced) offer. */
function settle(g: ConquestGame, f: Firm, bid: FirmBid, how: string): void {
  const s = g.s;
  clearScenes(g, bid);
  if (bid.kind === "sellall") {
    bid.status = "accepted";
    partnersChanged(g, "f");
    windUp(g, f, `the partners sold up (${how})`);
    tidy(f);
    return;
  }
  const buyer = bid.kind === "buy" ? bid.by : bid.to;
  const seller = bid.kind === "buy" ? bid.to : bid.by;
  const bp = partnerIn(f, buyer);
  const sp = partnerIn(f, seller);
  const bl = lifeOfChar(s, buyer);
  if (!bp || !sp) {
    bid.status = "lapsed";
    return;
  }
  if (bl && bl.purse < bid.price) {
    bid.status = "declined";
    bid.why = `${charName(s.chars[buyer])} hadn't the ${bid.price} coins`;
    tell(g, buyer, `${f.name}: you haven't the ${bid.price} coins.`, "bad");
    tell(g, seller, `${f.name}: ${bid.why}.`, "bad");
    partnersChanged(g, "f");
    return;
  }
  bid.status = "accepted";
  pay(g, buyer, seller, bid.price);
  bp.share = Math.round((bp.share + sp.share) * 10) / 10;
  bp.capital = r2(bp.capital + Math.max(0, sp.capital - (sp.caught ?? 0)));
  if (sp.role === "managing") bp.role = "managing";
  f.partners = f.partners.filter((p) => p !== sp);
  const words = `${charName(s.chars[buyer])} buys out ${charName(s.chars[seller])} for ${bid.price} (${how})`;
  firmLine(g, f, `${words}.`);
  tell(
    g,
    seller,
    `${f.name}: you're bought out for ${bid.price} coins (${how}).`,
    undefined,
    true,
  );
  tell(
    g,
    buyer,
    `${f.name}: you buy out ${charName(s.chars[seller])} for ${bid.price} coins.`,
    "good",
    true,
  );
  const sc = s.chars[seller];
  if (sc && !lifeOfChar(s, seller) && bl)
    remembers(
      g,
      bl,
      g.char(sc.id),
      how.includes("clause") ? "Forced me out" : "Bought me out",
      how.includes("clause") ? -12 : -2,
      2,
    );
  partnersChanged(g, "f");
  tidy(f);
  if (f.partners.length <= 1) endWithOne(g, f);
}

// ---------------------------------------------------------------- answering

/** Whether a player can answer an offer now (and what it's about). */
export function answerCheck(
  s: GameState,
  life: Life,
  f: Firm | undefined,
  bid: FirmBid | undefined,
): Check {
  if (!f || !bid || bid.status !== "open") return no("That offer's gone");
  if (bid.kind === "sellall") {
    if (!partnerIn(f, life.c) || bid.by === life.c)
      return no("It isn't yours to answer");
    if (bid.yes?.[life.c]) return no("You've answered");
    return yes;
  }
  if (bid.to !== life.c) return no("It isn't yours to answer");
  return yes;
}

/** A player accepts, declines, or counters an offer (a new price). */
export function answerBid(
  g: ConquestGame,
  life: Life,
  fid: number,
  id: number,
  how: "accept" | "decline" | "counter" | "buyinstead",
  price = 0,
): string | null {
  const s = g.s;
  const f = firmById(s, fid);
  const bid = f ? bidsOf(f).find((b) => b.id === id) : undefined;
  const check = answerCheck(s, life, f, bid);
  if (!check.ok) return `${check.why}.`;
  const me = meOf(s, life);
  const name = charName(me);
  if (bid!.kind === "sellall") {
    if (how === "accept") {
      bid!.yes = { ...bid!.yes, [life.c]: 1 };
      partnersChanged(g, "f");
      clearMine(g, life, bid!);
      firmLine(g, f!, `${name} agrees to sell up.`);
      if (allAgree(f!, bid!)) settle(g, f!, bid!, "the partners agreed");
      return null;
    }
    bid!.yes = { ...bid!.yes, [life.c]: -1 };
    decline(g, f!, bid!, `${name} won't sell up`);
    if (how === "buyinstead") {
      const fair = fairPrice(s, f!, bid!.by);
      if (life.purse < fair) return `You'd need ${fair} coins to buy them out.`;
      counterBid(g, f!, bid!, life.c, bid!.by, "buy", price > 0 ? price : fair);
    }
    return null;
  }
  if (how === "accept") {
    // The buyer must have the money (a player buying from a "sell" offer is the one answering).
    if (bid!.kind === "sell" && life.purse < bid!.price)
      return `You'd need ${bid!.price} coins.`;
    settle(g, f!, bid!, "by agreement");
    return null;
  }
  if (how === "decline") {
    decline(g, f!, bid!, `${name} declines`);
    return null;
  }
  // A counter: the other side of the same deal, at your price.
  if (bid!.round >= MAX_ROUNDS)
    return "You've been back and forth enough: accept or decline.";
  const p = Math.round(price);
  if (!Number.isFinite(p) || p < 1) return "Name a price.";
  if (bid!.kind === "sell" && life.purse < p)
    return `You'd need ${p} coins to pay it.`;
  counterBid(
    g,
    f!,
    bid!,
    life.c,
    bid!.by,
    bid!.kind === "buy" ? "sell" : "buy",
    p,
  );
  return null;
}

function clearMine(g: ConquestGame, life: Life, bid: FirmBid): void {
  const before = life.events.length;
  life.events = life.events.filter(
    (e) => !(e.key === "p2p-bid" && e.ctx.b === bid.id),
  );
  if (life.events.length !== before) touchLife(g, life);
}

/** Take back an offer you made, while it's open. */
export function withdrawBid(
  g: ConquestGame,
  life: Life,
  fid: number,
  id: number,
): string | null {
  const f = firmById(g.s, fid);
  const bid = f ? bidsOf(f).find((b) => b.id === id) : undefined;
  if (!f || !bid || bid.status !== "open") return "That offer's gone.";
  if (bid.by !== life.c) return "It isn't yours.";
  bid.status = "withdrawn";
  clearScenes(g, bid);
  partnersChanged(g, "f");
  firmLine(g, f, `Withdrawn: ${bidWords(g.s, f, bid).toLowerCase()}.`);
  tidy(f);
  return null;
}

// ---------------------------------------------------------------- the days

/** Offers lapse when their time's up (as declined); offers on a partner gone lapse too. */
export function bidsDaily(g: ConquestGame): void {
  const s = g.s;
  for (const f of s.partners?.firms ?? []) {
    if (!f.bids?.length) continue;
    for (const b of f.bids) {
      if (b.status !== "open") continue;
      const gone =
        f.status !== "trading" ||
        !partnerIn(f, b.by) ||
        (b.to >= 0 && !partnerIn(f, b.to));
      if (gone || b.until <= s.day) {
        b.status = "lapsed";
        clearScenes(g, b);
        partnersChanged(g, "f");
        if (!gone)
          tell(g, b.by, `${f.name}: your offer lapsed, unanswered.`, "bad");
      }
    }
  }
}

hooks.daily.push(bidsDaily);

// ---------------------------------------------------------------- words

/** An offer in words: "Alden Drackley offers to buy out Thomas Cole for 120". */
export function bidWords(s: GameState, f: Firm, b: FirmBid): string {
  const by = charName(s.chars[b.by]);
  const to = charName(s.chars[b.to]);
  switch (b.kind) {
    case "buy":
      return `${by} offers to buy out ${to} for ${b.price}`;
    case "sell":
      return `${by} offers ${to} their share for ${b.price}`;
    case "sellall":
      return `${by} proposes selling up the whole business (about ${b.price} all told, shared as the winding up would)`;
  }
}

// ---------------------------------------------------------------- the commands

export function bidCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "bid") return undefined;
  const s = g.s;
  switch (c.act) {
    case "make": {
      const f = firmById(s, c.id ?? -1);
      if (!f) return "No such partnership.";
      const kind = c.key as FirmBid["kind"];
      if (kind !== "buy" && kind !== "sell" && kind !== "sellall")
        return "What kind of offer?";
      return makeBid(g, life, f, kind, c.c ?? -1, c.price ?? 0);
    }
    case "accept":
    case "decline":
    case "counter":
    case "buyinstead":
      return answerBid(g, life, c.id ?? -1, c.hire ?? -1, c.act, c.price ?? 0);
    case "withdraw":
      return withdrawBid(g, life, c.id ?? -1, c.hire ?? -1);
  }
  return "Unknown.";
}

hooks.command.push(bidCommand);

// ---------------------------------------------------------------- the scene

function bidOf(g: ConquestGame, ctx: LCtx) {
  const f = firmById(g.s, ctx.f);
  const b = f ? bidsOf(f).find((x) => x.id === ctx.b) : undefined;
  return f && b ? { f, b } : undefined;
}

/** A counter's price in a scene: a quarter more (asking), or a fifth less (paying). */
export function sceneCounter(b: FirmBid): number {
  return b.kind === "buy"
    ? Math.round(b.price * 1.25)
    : Math.max(1, Math.round(b.price * 0.8));
}

const SCENES = (): LifeEventDef[] => [
  {
    key: "p2p-bid",
    pool: "raised",
    cooldown: 0,
    scene: "market",
    title: (g, life, ctx) => {
      const x = bidOf(g, ctx);
      if (!x) return "An offer";
      const by = g.s.chars[x.b.by]?.first ?? "A partner";
      return x.b.kind === "buy"
        ? `${by} offers to buy your share of ${x.f.name}`
        : x.b.kind === "sell"
          ? `${by} offers you their share of ${x.f.name}`
          : `${by} proposes selling up ${x.f.name}`;
    },
    body: (g, life, ctx) => {
      const x = bidOf(g, ctx);
      if (!x || x.b.status !== "open") return "The offer's been taken back.";
      const { f, b } = x;
      const s = g.s;
      const me = partnerIn(f, life.c);
      const by = charName(s.chars[b.by]);
      const profit = Math.round(avgProfit(s, f) * 10) / 10;
      const month = `${profit >= 0 ? "+" : ""}${profit} a month lately`;
      if (b.kind === "sellall") {
        const part = Math.round(sellUpPart(s, f, life.c));
        const fair = fairPrice(s, f, life.c);
        return `${by} proposes selling the whole business and winding up the partnership: the business sold to the town, its debts paid, the capital returned and the rest shared by share. Your part would come to about ${part} coins; your ${me?.share ?? 0}% is worth about ${fair} going on (it makes ${month}).\nEvery partner must agree. You can agree, refuse, or offer to buy ${by} out instead (at a fair price, ${fairPrice(s, f, b.by)}).`;
      }
      const theirs = b.kind === "buy" ? life.c : b.by;
      const fair = fairPrice(s, f, theirs);
      return b.kind === "buy"
        ? `${by} offers ${b.price} coins for your whole share (${me?.share ?? 0}%) of ${f.name}. A fair price would be about ${fair}: what it would fetch wound up, and a year of its profit (it makes ${month}).\nYou can accept, decline, or name your own price (here, a quarter more; any price from the partnership's page).`
        : `${by} offers you their whole share (${partnerIn(f, b.by)?.share ?? 0}%) of ${f.name} for ${b.price} coins. A fair price would be about ${fair} (it makes ${month}).\nYou can buy it, decline, or offer less (here, a fifth less; any price from the partnership's page).`;
    },
    choices: [
      {
        label: (g, life, ctx) => {
          const x = bidOf(g, ctx);
          if (!x) return "Accept";
          return x.b.kind === "sellall"
            ? "Agree to sell up"
            : x.b.kind === "buy"
              ? `Accept (${x.b.price} coins)`
              : `Buy it (${x.b.price} coins)`;
        },
        tip: "Done at once.",
        blocked: (g, life, ctx) => {
          const x = bidOf(g, ctx);
          const c = answerCheck(g.s, life, x?.f, x?.b);
          if (!c.ok) return c.why;
          if (x!.b.kind === "sell" && life.purse < x!.b.price)
            return `You'd need ${x!.b.price} coins`;
          return null;
        },
        apply: (g, life, ctx) => {
          const err = answerBid(g, life, ctx.f, ctx.b, "accept");
          if (err) journal(g, life, err, "bad");
        },
      },
      {
        label: (g, life, ctx) => {
          const x = bidOf(g, ctx);
          if (!x) return "Counter";
          return x.b.kind === "sellall"
            ? `Offer to buy them out instead (${fairPrice(g.s, x.f, x.b.by)} coins)`
            : x.b.kind === "buy"
              ? `Ask for a quarter more (${sceneCounter(x.b)})`
              : `Offer a fifth less (${sceneCounter(x.b)})`;
        },
        tip: "They answer: accept, decline, or come back to you.",
        blocked: (g, life, ctx) => {
          const x = bidOf(g, ctx);
          const c = answerCheck(g.s, life, x?.f, x?.b);
          if (!c.ok) return c.why;
          if (x!.b.kind !== "sellall" && x!.b.round >= MAX_ROUNDS)
            return "You've been back and forth enough";
          const need =
            x!.b.kind === "sellall"
              ? fairPrice(g.s, x!.f, x!.b.by)
              : x!.b.kind === "sell"
                ? sceneCounter(x!.b)
                : 0;
          if (need && life.purse < need) return `You'd need ${need} coins`;
          return null;
        },
        apply: (g, life, ctx) => {
          const x = bidOf(g, ctx);
          if (!x) return;
          const err =
            x.b.kind === "sellall"
              ? answerBid(g, life, ctx.f, ctx.b, "buyinstead")
              : answerBid(g, life, ctx.f, ctx.b, "counter", sceneCounter(x.b));
          if (err) journal(g, life, err, "bad");
        },
      },
      {
        label: (g, life, ctx) =>
          bidOf(g, ctx)?.b.kind === "sellall" ? "Refuse" : "Decline",
        tip: "They'll hear you said no.",
        apply: (g, life, ctx) => {
          if (bidOf(g, ctx)) answerBid(g, life, ctx.f, ctx.b, "decline");
        },
      },
    ],
  },
];

let built: LifeEventDef[] | null = null;

/** The partners' offers' scene. */
export function bidEvents(): LifeEventDef[] {
  if (built) return built;
  built = SCENES();
  registerFamily(
    "bids",
    built.map((d) => d.key),
    0,
  );
  return built;
}

/** Left unanswered, an offer is declined. */
export function bidQuiet(): Record<string, number> {
  return { "p2p-bid": 2 };
}
