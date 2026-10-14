// EVENTS (r21): vingt-et-un at the tavern, the game the English called
// "vingt-un" and later "blackjack". The innkeeper keeps the bank. A player
// opens a table at a stake and asks the people in the tavern (the town's
// people decide there and then, with their reasons; other players get an
// invitation); then hand by hand:
//
// - every punter stakes, and the banker deals two cards to each and two to
//   himself, all face down; you see only your own;
// - aces count one or eleven, court cards ten, the rest their pips;
// - a natural (an ace with a ten or a court card) is turned up at once and
//   paid double, unless the banker has one too (a stand-off: the stake back);
//   a banker's natural takes every stake but a natural's;
// - each punter draws ("a card") or stands ("content"); over twenty-one and
//   the cards are turned up and the stake is the bank's;
// - when all have stood or gone over, the banker turns his cards up and
//   draws to seventeen; over twenty-one, he pays everyone standing; else more
//   than his count is paid even money, less loses, the same is a stand-off.
//
// (In the old game the banker took ties and the deal passed round; this
// house keeps the bank and calls ties a stand-off: the guide says so.)
//
// Punters decide at their own pace, all at once: the town's people at once,
// players when they like (in company, the server decides for one who
// stalls). Everything is dealt from the table's own dice, saved with it.

import { presentAt } from "./Areas";
import {
  BANK_STANDS,
  bankOdds,
  bustChance,
  CARD_DONE_KEEP,
  CARD_IDLE_DAYS,
  CARD_STAKES,
  cardRng,
  cardsChanged,
  cardSeatedAt,
  cardSeatOf,
  cardsState,
  cardTableAt,
  cardTableById,
  handTotal,
  isNatural,
  MAX_PUNTERS,
  punters,
  pushCardAct,
  shuffled,
  standOdds,
  unseenOf,
} from "./CardsCore";
import { meansOf } from "./DiceAi";
import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { withFlow } from "./LedgerCore";
import {
  addStress,
  earn,
  gainXp,
  journal,
  meet,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import type { LifeEventDef } from "./LifeEvents";
import {
  hasPlace,
  isChildLife,
  lifeOfChar,
  lifeOfSeat,
  meOf,
  opinionOf,
} from "./LifeQueries";
import type { World } from "./Map";
import { wake } from "./Pace";
import { ageOf, charName, hasTrait } from "./Queries";
import type {
  Breakdown,
  Card,
  CardsCommand,
  CardSeat,
  CardTable,
  Character,
  GameState,
  Life,
  LifeCommand,
} from "./Types";

/** Experience in Trade for a hand (reckoning the odds): a little, a week's worth at most. */
export const XP_HAND = 1;
export const XP_WEEK = 10;

const firstOf = (g: ConquestGame, c: number) =>
  c < 0 ? "the landlord" : (g.s.chars[c]?.first ?? "someone");
const townOf = (g: ConquestGame, p: number) => g.map.provinces[p]?.name ?? "";

/** Money at the card table, in the books under one name. */
function flow<T>(g: ConquestGame, f: () => T): T {
  return withFlow(
    g,
    { key: "cards", label: "Vingt-et-un at the tavern", chance: true },
    f,
  );
}

/** The player sitting in a seat (if it's still theirs to play). */
function lifeAt(g: ConquestGame, x: CardSeat): Life | undefined {
  if (x.seat === undefined) return undefined;
  const l = lifeOfSeat(g.s, x.seat);
  return l && l.c === x.c ? l : undefined;
}

// ---------------------------------------------------------------- who keeps the bank, who sits down

/** The innkeeper here, who keeps the bank (a computer character), or -1: the house. */
export function bankerAt(s: GameState, w: World, p: number): number {
  const folk = presentAt(s, w, p, "tavern", s.day);
  for (const x of folk) {
    const c = s.chars[x.c];
    if (c?.alive && c.role === "innkeeper" && !lifeOfChar(s, c.id)) return c.id;
  }
  for (const id of s.locals[p] ?? []) {
    const c = s.chars[id];
    if (c?.alive && c.role === "innkeeper" && !lifeOfChar(s, c.id)) return c.id;
  }
  return -1;
}

/**
 * Whether one of the town's people will sit down at the cards, and why:
 * like the dice (their means against the stake, what they think of you,
 * their nature and their calling), with the cards' own reputation.
 */
export function cardsAcceptance(
  s: GameState,
  life: Life,
  c: Character,
  stake: number,
): Breakdown {
  const e = new Explain();
  e.add("A hand of cards", 8);
  e.add("What they think of you", Math.round(opinionOf(s, c, life).total / 3));
  if (hasTrait(c, "drunkard")) e.add("Never says no to a game", 15);
  if (hasTrait(c, "greedy")) e.add("Thinks they can beat the bank", 6);
  if (hasTrait(c, "ambitious")) e.add("A game to be won", 3);
  if (hasTrait(c, "brave")) e.add("Likes a risk", 3);
  if (hasTrait(c, "lazy")) e.add("Nothing better to do", 3);
  if (hasTrait(c, "shrewd")) e.add("Can count the cards", 4);
  if (hasTrait(c, "craven")) e.add("Doesn't care for the risk", -8);
  if (hasTrait(c, "diligent")) e.add("Work in the morning", -6);
  if (hasTrait(c, "zealous")) e.add("Cards are the devil's picture book", -18);
  if (c.role === "preacher") e.add("A minister doesn't play cards", -45);
  if (c.role === "innkeeper") e.add("Keeps the bank, not a seat", -60);
  const m = meansOf(s, c);
  if (stake * 3 > m) e.add("Hasn't the money", -40);
  else if (stake * 8 > m) e.add("More than they can spare", -14);
  else if (stake * 40 <= m) e.add("Hardly worth the candle", -3);
  else if (stake * 15 <= m) e.add("Small stakes to them", 4);
  return e.done(0);
}

/** Why someone can't play cards here just now, or null. */
export function cardsHere(s: GameState, w: World, life: Life): string | null {
  if (life.c < 0 || life.watching) return "You're watching.";
  if (isChildLife(s, life)) return "Not until you're sixteen.";
  if (life.travel) return "You're on the road.";
  if (!hasPlace(s, w, life.prov, "tavern")) return "There's no tavern here.";
  return null;
}

/** Whether a purse runs to a stake (a drunkard may play on tick, into debt). */
export function cardStakeProblem(
  s: GameState,
  life: Life,
  stake: number,
): string | null {
  if (life.purse >= stake) return null;
  const me = meOf(s, life);
  if (life.purse < 0)
    return "The bank won't deal to a debtor: pay what you owe first.";
  if (me && hasTrait(me, "drunkard")) return null;
  return `The stake is ${stake} ${stake === 1 ? "coin" : "coins"}; you have ${Math.floor(life.purse)}.`;
}

/** Why a player can't open a table here, or null. */
export function cardsOpenProblem(
  s: GameState,
  w: World,
  life: Life,
  stake: number,
): string | null {
  const why = cardsHere(s, w, life);
  if (why) return why;
  if (cardSeatedAt(s, life.c)) return "You're at a card table already.";
  if (cardTableAt(s, life.prov))
    return "There's a card table here already: sit down at it.";
  return cardStakeProblem(s, life, stake);
}

/** Why a player can't sit down at a table, or null. */
export function cardsJoinProblem(
  s: GameState,
  w: World,
  life: Life,
  t: CardTable | undefined,
): string | null {
  if (!t || t.status === "done") return "That table has broken up.";
  const why = cardsHere(s, w, life);
  if (why) return why;
  if (life.prov !== t.prov) return "That table is in another town.";
  const x = cardSeatOf(t, life.c);
  if (x && x.state !== "gone") return "You're at the table already.";
  if (cardSeatedAt(s, life.c)) return "You're at another table.";
  if (punters(t).length >= MAX_PUNTERS) return "The table is full.";
  return cardStakeProblem(s, life, t.stake);
}

function tavernFolk(g: ConquestGame, p: number): Set<number> {
  return new Set(presentAt(g.s, g.w, p, "tavern", g.s.day).map((x) => x.c));
}

function sitDown(
  g: ConquestGame,
  t: CardTable,
  c: number,
  life: Life | null,
): void {
  const x: CardSeat = {
    c,
    cards: [],
    n: 0,
    state: t.status === "hand" ? "out" : "in",
    stake: 0,
    net: 0,
    hands: 0,
  };
  if (life) {
    x.seat = life.seat;
    touchLife(g, life).area = "tavern";
  } else {
    // A computer punter's money for the evening, and how long they mean to stay.
    const r = cardRng(t);
    const ch = g.s.chars[c];
    x.purse = Math.max(t.stake, Math.min(meansOf(g.s, ch) / 2, t.stake * 12));
    x.stay = 4 + r.int(0, 8);
  }
  t.seats = t.seats.filter((y) => y.c !== c);
  t.seats.push(x);
  t.asked = t.asked.filter((y) => y !== c);
  pushCardAct(t, { k: "sit", c, hand: t.hand });
  cardsChanged(g);
}

function askOne(
  g: ConquestGame,
  life: Life,
  t: CardTable,
  c: number,
  here: Set<number>,
): string | null {
  const s = g.s;
  const ch = s.chars[c];
  if (!ch?.alive) return "Gone.";
  if (ageOf(s, ch) < 16) return `${ch.first}: too young.`;
  if (c === life.c || c === t.bank) return null;
  const x = cardSeatOf(t, c);
  if ((x && x.state !== "gone") || t.asked.includes(c)) return null;
  if (punters(t).length + t.asked.length >= MAX_PUNTERS)
    return "Five at a table at most.";
  if (cardSeatedAt(s, c)) return `${ch.first} is at another table.`;
  if (!here.has(c)) return `${ch.first} isn't in the tavern.`;
  const other = lifeOfChar(s, c);
  if (other) {
    t.asked.push(c);
    raiseEvent(g, other, "p2p-cards", { t: t.id, c: life.c, stake: t.stake });
    cardsChanged(g);
    return null;
  }
  meet(g, life, c);
  const v = cardsAcceptance(s, life, ch, t.stake);
  if (v.total > 0) {
    sitDown(g, t, c, null);
    return null;
  }
  const worst = [...v.parts]
    .filter((p) => !p.mul && p.value < 0)
    .sort((a, b) => a.value - b.value)[0];
  pushCardAct(t, {
    k: "refuse",
    c,
    hand: t.hand,
    why: worst?.label ?? "Not tonight",
  });
  cardsChanged(g);
  return null;
}

function seedOf(g: ConquestGame, id: number): number {
  return (
    (Math.floor(g.rng.next() * 0x7fffffff) ^ Math.imul(id, 0x2c1b3c6d)) | 0
  );
}

/** Open a table here at a stake, and ask people to it. */
export function openCards(
  g: ConquestGame,
  life: Life,
  stake: number,
  ask: number[],
): string | null {
  const s = g.s;
  if (!CARD_STAKES.includes(stake)) return "Choose a stake.";
  const why = cardsOpenProblem(s, g.w, life, stake);
  if (why) return why;
  const cs = cardsState(g);
  cs.tables = cs.tables.filter(
    (t) => !(t.status === "done" && t.host === life.c),
  );
  const id = g.nextId();
  const t: CardTable = {
    id,
    prov: life.prov,
    host: life.c,
    bank: bankerAt(s, g.w, life.prov),
    stake,
    status: "open",
    seats: [],
    asked: [],
    hand: 0,
    bankCards: [],
    deck: [],
    acts: [],
    seq: 0,
    opened: s.day,
    last: s.day,
    rng: seedOf(g, id),
  };
  cs.tables.push(t);
  sitDown(g, t, life.c, life);
  journal(
    g,
    life,
    `You sit down to vingt-et-un at the tavern in ${townOf(g, life.prov)}, ${stake} ${stake === 1 ? "coin" : "coins"} a hand, with ${t.bank >= 0 ? `${charName(s.chars[t.bank])} keeping the bank` : "the house keeping the bank"}.`,
  );
  const here = tavernFolk(g, life.prov);
  for (const c of ask) askOne(g, life, t, c, here);
  t.seq++;
  return null;
}

/** A player sits down (gathering, or between hands; mid-hand, they wait for the next). */
export function joinCards(
  g: ConquestGame,
  life: Life,
  t: CardTable | undefined,
): string | null {
  const why = cardsJoinProblem(g.s, g.w, life, t);
  if (why) return why;
  const tb = t!;
  sitDown(g, tb, life.c, life);
  journal(g, life, `You sit down at the card table, ${tb.stake} a hand.`);
  const host = lifeOfChar(g.s, tb.host);
  if (host && host !== life)
    journal(
      g,
      host,
      `${charName(g.s.chars[life.c])} sits down at your card table.`,
    );
  tb.seq++;
  return null;
}

export function declineCards(g: ConquestGame, life: Life, id: number): void {
  const t = cardTableById(g.s, id);
  if (!t || !t.asked.includes(life.c)) return;
  t.asked = t.asked.filter((c) => c !== life.c);
  pushCardAct(t, { k: "refuse", c: life.c, hand: t.hand, why: "Not tonight" });
  const host = lifeOfChar(g.s, t.host);
  if (host)
    journal(
      g,
      host,
      `${charName(g.s.chars[life.c])} won't sit down to cards tonight.`,
    );
  t.seq++;
  cardsChanged(g);
}

// ---------------------------------------------------------------- a hand

/** Whether a punter is dealt into the next hand. */
function dealtIn(g: ConquestGame, t: CardTable, x: CardSeat): boolean {
  if (x.state === "gone" || x.quitting) return false;
  const l = lifeAt(g, x);
  if (x.seat !== undefined) {
    if (!l || x.ready !== true) return false;
    return !cardStakeProblem(g.s, l, t.stake);
  }
  return (x.purse ?? 0) >= t.stake && (x.stay ?? 0) > 0;
}

/** Whether every player at the table has said whether they're in the next hand. */
function allSaid(t: CardTable): boolean {
  return t.seats.every(
    (x) => x.state === "gone" || x.seat === undefined || x.ready !== undefined,
  );
}

/** Deal a hand: stakes in, two cards each, naturals turned up. */
function deal(g: ConquestGame, t: CardTable): string | null {
  const ins = t.seats.filter((x) => dealtIn(g, t, x));
  if (!ins.length) return "Nobody's in this hand.";
  const r = cardRng(t);
  t.hand++;
  t.status = "hand";
  t.deck = shuffled(r);
  t.bankCards = [];
  const stakes: Record<number, number> = {};
  for (const x of t.seats) {
    x.cards = [];
    x.n = 0;
    x.stake = 0;
    if (x.state !== "gone") x.state = "out";
  }
  for (const x of ins) {
    x.state = "play";
    x.stake = t.stake;
    x.hands++;
    stakes[x.c] = t.stake;
    const l = lifeAt(g, x);
    if (l) {
      const tick = Math.max(0, t.stake - Math.max(0, l.purse));
      if (tick > 0) x.tick = (x.tick ?? 0) + tick;
      flow(g, () => spend(g, l, t.stake));
    } else x.purse = (x.purse ?? 0) - t.stake;
  }
  // Two rounds of the deal, one card at a time, the banker last.
  for (let k = 0; k < 2; k++) {
    for (const x of ins) {
      x.cards.push(t.deck.pop()!);
      x.n = x.cards.length;
    }
    t.bankCards.push(t.deck.pop()!);
  }
  pushCardAct(t, { k: "deal", c: t.bank, hand: t.hand, stakes });
  for (const x of t.seats) if (x.seat !== undefined) x.ready = undefined;
  // A banker's natural is shown at once and takes every stake but a natural's.
  if (isNatural(t.bankCards)) {
    pushCardAct(t, {
      k: "bank",
      c: t.bank,
      hand: t.hand,
      cards: [...t.bankCards],
    });
    for (const x of ins) x.state = isNatural(x.cards) ? "natural" : "stood";
    settle(g, t);
    afterMove(g, t);
    return null;
  }
  // A punter's natural is turned up and paid at the settling.
  for (const x of ins)
    if (isNatural(x.cards)) {
      x.state = "natural";
      pushCardAct(t, {
        k: "natural",
        c: x.c,
        hand: t.hand,
        cards: [...x.cards],
      });
    }
  computersPlay(g, t);
  afterMove(g, t);
  return null;
}

/** Draw a card: over twenty-one, it's turned up and the stake is the bank's; at twenty-one, content. */
function draw(g: ConquestGame, t: CardTable, x: CardSeat, auto = false): void {
  x.cards.push(t.deck.pop()!);
  x.n = x.cards.length;
  pushCardAct(t, {
    k: "draw",
    c: x.c,
    hand: t.hand,
    count: x.n,
    ...(auto ? { auto: true } : {}),
  });
  const tot = handTotal(x.cards).total;
  if (tot > 21) {
    x.state = "bust";
    pushCardAct(t, { k: "bust", c: x.c, hand: t.hand, cards: [...x.cards] });
    const l = lifeAt(g, x);
    if (l)
      journal(
        g,
        l,
        `At vingt-et-un you drew to ${tot}: over, and your ${x.stake} to the bank.`,
        "bad",
      );
  } else if (tot === 21) stand(g, t, x, auto);
}

function stand(g: ConquestGame, t: CardTable, x: CardSeat, auto = false): void {
  x.state = "stood";
  pushCardAct(t, {
    k: "stand",
    c: x.c,
    hand: t.hand,
    count: x.n,
    ...(auto ? { auto: true } : {}),
  });
}

/** Whoever's still deciding. */
const deciding = (t: CardTable) => t.seats.filter((x) => x.state === "play");

/** The town's people at the table play their hands at once (the browser paces them). */
function computersPlay(g: ConquestGame, t: CardTable): void {
  for (const x of t.seats) {
    if (x.seat !== undefined || x.state !== "play") continue;
    for (let guard = 0; guard < 12 && x.state === "play"; guard++) {
      if (computerDraws(g.s, t, x)) draw(g, t, x);
      else stand(g, t, x);
    }
  }
}

/**
 * Whether one of the town's people draws: by their own count against the
 * banker's odds from what they can see, bolder or warier by temper. They
 * stand on what the odds say is good enough for them; a drunkard draws on
 * a whim.
 */
export function computerDraws(
  s: GameState,
  t: CardTable,
  x: CardSeat,
): boolean {
  const c = s.chars[x.c];
  const { total, soft } = handTotal(x.cards);
  if (total >= 20) return false;
  if (total <= 11) return true;
  const known = [...x.cards, ...shownCards(t, x.c)];
  const unseen = unseenOf(known);
  const bust = bustChance(x.cards, unseen);
  const bank = bankOdds(unseen);
  const now = standOdds(total, bank);
  // The bolder draw on more; the warier stand sooner.
  const lean =
    (c && hasTrait(c, "brave") ? 0.06 : 0) +
    (c && hasTrait(c, "greedy") ? 0.04 : 0) -
    (c && hasTrait(c, "craven") ? 0.08 : 0) +
    (c && hasTrait(c, "drunkard") ? 0.1 : 0);
  if (soft) return total <= 17 + (lean > 0.05 ? 1 : 0);
  // Drawing is worth it when going over is less likely than losing standing.
  return bust < now.lose + lean;
}

/** Cards turned up this hand at the table (busts and naturals), apart from someone's own. */
export function shownCards(t: CardTable, except: number): Card[] {
  const out: Card[] = [];
  for (const y of t.seats)
    if (y.c !== except && (y.state === "bust" || y.state === "natural"))
      out.push(...y.cards);
  return out;
}

/** The banker turns his cards up and draws to seventeen. */
function bankPlays(g: ConquestGame, t: CardTable): void {
  // Nobody left standing against him (all over): he needn't draw.
  const against = t.seats.some((x) => x.state === "stood");
  for (let guard = 0; guard < 12 && against; guard++) {
    if (handTotal(t.bankCards).total >= BANK_STANDS) break;
    t.bankCards.push(t.deck.pop()!);
  }
  pushCardAct(t, {
    k: "bank",
    c: t.bank,
    hand: t.hand,
    cards: [...t.bankCards],
  });
}

/** What a punter's hand comes to against the banker's: +2 a natural paid double, +1, 0, −1. */
export function outcomeOf(x: CardSeat, bank: readonly Card[]): number {
  if (x.state === "bust") return -1;
  const bankNat = isNatural(bank);
  if (x.state === "natural") return bankNat ? 0 : 2;
  if (bankNat) return -1;
  const b = handTotal(bank).total;
  const mine = handTotal(x.cards).total;
  if (b > 21) return 1;
  return mine > b ? 1 : mine < b ? -1 : 0;
}

/** The hand is settled: every hand shown, stakes paid or taken. */
function settle(g: ConquestGame, t: CardTable): void {
  const s = g.s;
  const hands: Record<number, Card[]> = { [t.bank]: [...t.bankCards] };
  const pay: Record<number, number> = {};
  for (const x of t.seats) {
    if (!x.stake) continue;
    hands[x.c] = [...x.cards];
    const o = outcomeOf(x, t.bankCards);
    const back = o === -1 ? 0 : x.stake * (1 + o);
    pay[x.c] = back - x.stake;
    x.net += back - x.stake;
    const l = lifeAt(g, x);
    if (l) {
      if (back > 0) flow(g, () => earn(g, l, back));
      afterHand(g, l, t, x, o);
    } else x.purse = (x.purse ?? 0) + back;
  }
  pushCardAct(t, { k: "settle", c: t.bank, hand: t.hand, hands, pay });
  t.status = "between";
  t.last = s.day;
  for (const x of t.seats) {
    if (x.state === "gone") continue;
    x.stake = 0;
    x.state = "in";
    if (x.quitting) leaveNow(g, t, x, "gets up from the table");
  }
  // The town's people stay a while, then go (out of money, or enough for one night).
  for (const x of t.seats) {
    if (x.seat !== undefined || x.state === "gone") continue;
    x.stay = (x.stay ?? 0) - 1;
    if ((x.purse ?? 0) < t.stake)
      leaveNow(g, t, x, "has lost what they meant to");
    else if ((x.stay ?? 0) <= 0)
      leaveNow(g, t, x, "has had enough for one night");
  }
  if (!punters(t).length)
    close(g, t, "Everyone's got up: the cards are put away.");
  cardsChanged(g);
}

/** What a hand comes to for a player: a little reckoning learned, stress eased or added. */
function afterHand(
  g: ConquestGame,
  l: Life,
  t: CardTable,
  x: CardSeat,
  o: number,
): void {
  const s = g.s;
  const fresh = (l.cooldowns["cards:xpweek"] ?? 0) <= s.day;
  if (fresh) {
    touchLife(g, l).cooldowns["cards:xpweek"] = s.day + 7;
    touchLife(g, l).cooldowns["cards:xp"] = 0;
  }
  const had = l.cooldowns["cards:xp"] ?? 0;
  if (had < XP_WEEK) {
    gainXp(g, l, "trade", XP_HAND);
    touchLife(g, l).cooldowns["cards:xp"] = had + XP_HAND;
  }
  if (o > 0) addStress(g, l, -2);
  else if (o < 0 && x.stake * 5 > Math.max(0, l.purse) + x.stake)
    addStress(g, l, 3);
  const mine = handTotal(x.cards).total;
  const bank = handTotal(t.bankCards).total;
  journal(
    g,
    l,
    o === 2
      ? `Vingt-et-un: a natural, paid double: +${x.stake * 2}.`
      : o === 1
        ? `Vingt-et-un: your ${mine} against the bank's ${bank > 21 ? "bust" : bank}: +${x.stake}.`
        : o === 0
          ? `Vingt-et-un: ${mine} each: a stand-off, your stake back.`
          : x.state === "bust"
            ? `Vingt-et-un: over at ${mine}: −${x.stake}.`
            : `Vingt-et-un: your ${mine} against the bank's ${bank}: −${x.stake}.`,
    o > 0 ? "good" : o < 0 ? "bad" : undefined,
  );
}

/** Someone gets up for good (between hands, or as a hand is settled). */
function leaveNow(
  g: ConquestGame,
  t: CardTable,
  x: CardSeat,
  why: string,
): void {
  if (x.state === "gone") return;
  x.state = "gone";
  x.quitting = false;
  x.ready = undefined;
  pushCardAct(t, { k: "gone", c: x.c, hand: t.hand, why });
  const l = lifeAt(g, x) ?? (x.seat ? lifeOfSeat(g.s, x.seat) : undefined);
  if (l && l.c === x.c) {
    const net = x.net;
    journal(
      g,
      l,
      x.hands
        ? `You get up from the card table ${net > 0 ? `${net} up` : net < 0 ? `${-net} down` : "even"} after ${x.hands} ${x.hands === 1 ? "hand" : "hands"}.`
        : "You get up from the card table.",
      net > 0 ? "good" : net < 0 ? "bad" : undefined,
    );
    if (x.tick)
      journal(
        g,
        l,
        `${x.tick} of your stakes went on tick: you owe the bank.`,
        "bad",
      );
    // The innkeeper remembers a winner (and a good customer).
    const bank = t.bank >= 0 ? g.s.chars[t.bank] : undefined;
    if (bank?.alive && x.hands) {
      if (net >= 20)
        remembers(g, l, g.char(bank.id), "Broke my bank at vingt-et-un", -4, 1);
      else if (net <= -10)
        remembers(g, l, g.char(bank.id), "Plays freely at my table", 3, 1);
    }
  }
}

function close(g: ConquestGame, t: CardTable, why: string): void {
  for (const x of t.seats)
    if (x.state !== "gone") leaveNow(g, t, x, "gets up from the table");
  for (const c of t.asked) {
    const l = lifeOfChar(g.s, c);
    if (l) dropInvite(g, l, t.id);
  }
  t.asked = [];
  t.status = "done";
  t.ended = g.s.day;
  pushCardAct(t, { k: "close", c: t.host, hand: t.hand, why });
  cardsChanged(g);
}

function dropInvite(g: ConquestGame, l: Life, id: number): void {
  if (!l.events.some((e) => e.key === "p2p-cards" && e.ctx.t === id)) return;
  touchLife(g, l).events = l.events.filter(
    (e) => !(e.key === "p2p-cards" && e.ctx.t === id),
  );
}

/** After any move: when nobody's left deciding, the banker plays and the hand is settled. */
function afterMove(g: ConquestGame, t: CardTable): void {
  t.seq++;
  t.last = g.s.day;
  cardsChanged(g);
  if (t.status === "hand" && !deciding(t).length) {
    bankPlays(g, t);
    settle(g, t);
  }
  if (
    t.status === "between" &&
    allSaid(t) &&
    t.seats.some((x) => x.seat !== undefined && x.ready === true)
  )
    deal(g, t);
  for (const x of t.seats) {
    const l = lifeAt(g, x);
    if (l && x.state === "play") wake(g, l, "Your hand at vingt-et-un.");
  }
}

/** The move made for a player who stalled: their hand by the town's sense, or sitting out the next. */
export function cardsAuto(g: ConquestGame, t: CardTable, x: CardSeat): void {
  if (t.status === "hand" && x.state === "play") {
    for (let guard = 0; guard < 12 && x.state === "play"; guard++) {
      if (handTotal(x.cards).total < 15) draw(g, t, x, true);
      else stand(g, t, x, true);
    }
  } else if (t.status !== "hand" && x.ready === undefined) {
    x.ready = false;
    x.idle = (x.idle ?? 0) + 1;
    if (x.idle >= 2)
      leaveNow(g, t, x, "is stood up from the table, having gone quiet");
  }
}

// ---------------------------------------------------------------- keeping the tables

/**
 * Anyone who can't be at the table leaves it: a player who has set out, gone
 * elsewhere, died or plays someone else (mid-hand, they stand on what they
 * hold); one of the town's people who has died or taken the road.
 */
export function sweepCardTables(g: ConquestGame): void {
  const s = g.s;
  for (const t of s.cards?.tables ?? []) {
    if (t.status === "done") continue;
    let moved = false;
    for (const x of t.seats) {
      if (x.state === "gone") continue;
      let why: string | null = null;
      const ch = s.chars[x.c];
      if (!ch?.alive) why = "dies";
      else if (x.seat !== undefined) {
        const l = lifeOfSeat(s, x.seat);
        if (!l || l.c !== x.c || l.watching) why = "is gone";
        else if (l.travel || l.prov !== t.prov) why = "sets out";
      } else {
        const tr = (s.travellers ?? []).find((y) => y.c === x.c);
        if (tr && tr.depart >= 0) why = "takes the road";
      }
      if (!why) continue;
      moved = true;
      if (t.status === "hand" && x.state === "play") {
        stand(g, t, x, true);
        x.quitting = true;
      } else if (t.status === "hand" && x.stake) x.quitting = true;
      else leaveNow(g, t, x, why);
    }
    const asked = t.asked.filter((c) => {
      const l = lifeOfChar(s, c);
      return !!l && !l.travel && l.prov === t.prov;
    });
    if (asked.length !== t.asked.length) {
      t.asked = asked;
      moved = true;
    }
    if (moved) {
      if (t.status !== "hand" && !punters(t).length)
        close(g, t, "Everyone's got up: the cards are put away.");
      else afterMove(g, t);
    }
  }
}

/** Each day: tables left idle break up; old ones are cleared away. */
export function cardsDaily(g: ConquestGame): void {
  const cs = g.s.cards;
  if (!cs || !cs.tables.length) return;
  sweepCardTables(g);
  const day = g.s.day;
  for (const t of cs.tables)
    if (
      t.status !== "done" &&
      t.status !== "hand" &&
      day - t.last >= CARD_IDLE_DAYS
    )
      close(g, t, "Nobody's dealt for days: the cards are put away.");
  const kept = cs.tables.filter(
    (t) => t.status !== "done" || day - (t.ended ?? day) < CARD_DONE_KEEP,
  );
  if (kept.length !== cs.tables.length) {
    cs.tables = kept;
    cardsChanged(g);
  }
}

/** Someone who can't play on (the server couldn't move for them) leaves a table. */
export function dropFromCards(g: ConquestGame, id: number, c: number): void {
  const t = cardTableById(g.s, id);
  const x = t ? cardSeatOf(t, c) : undefined;
  if (!t || !x || x.state === "gone") return;
  if (t.status === "hand" && x.state === "play") {
    stand(g, t, x, true);
    x.quitting = true;
    afterMove(g, t);
  } else {
    leaveNow(g, t, x, "is called away");
    if (t.status !== "hand" && !punters(t).length)
      close(g, t, "Everyone's got up: the cards are put away.");
    else afterMove(g, t);
  }
}

// ---------------------------------------------------------------- the commands

function mine(t: CardTable | undefined, life: Life): CardSeat | undefined {
  const x = t ? cardSeatOf(t, life.c) : undefined;
  return x && x.seat === life.seat && x.state !== "gone" ? x : undefined;
}

export function cardsCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "cards") return undefined;
  const d = c as CardsCommand;
  const s = g.s;
  if (isChildLife(s, life)) return "Not until you're sixteen.";
  const t = typeof d.id === "number" ? cardTableById(s, d.id) : undefined;
  const ask = Array.isArray(d.ask)
    ? d.ask
        .filter((x): x is number => Number.isInteger(x))
        .slice(0, MAX_PUNTERS)
    : [];
  switch (d.act) {
    case "open":
      return openCards(g, life, Number(d.stake), ask);
    case "ask": {
      if (!t || t.status === "done") return "That table has broken up.";
      if (t.host !== life.c)
        return "Only whoever opened the table asks people to it.";
      const here = tavernFolk(g, t.prov);
      let err: string | null = null;
      for (const x of ask) err = askOne(g, life, t, x, here) ?? err;
      t.seq++;
      cardsChanged(g);
      return ask.length === 1 ? err : null;
    }
    case "join":
      return joinCards(g, life, t);
    case "deal": {
      const x = mine(t, life);
      if (!t || !x) return "You're not at that table.";
      if (t.status === "hand") return "A hand's being played.";
      const why = cardStakeProblem(s, life, t.stake);
      if (why) return why;
      x.ready = true;
      x.idle = 0;
      t.seq++;
      cardsChanged(g);
      if (allSaid(t)) return deal(g, t);
      return null;
    }
    case "sitout": {
      const x = mine(t, life);
      if (!t || !x) return "You're not at that table.";
      if (t.status === "hand") return "A hand's being played.";
      x.ready = false;
      t.seq++;
      afterMove(g, t);
      return null;
    }
    case "draw":
    case "stand": {
      const x = mine(t, life);
      if (!t || !x || t.status !== "hand" || x.state !== "play")
        return "You've no hand to play.";
      if (d.act === "draw") draw(g, t, x);
      else stand(g, t, x);
      afterMove(g, t);
      return null;
    }
    case "auto": {
      const x = mine(t, life);
      if (!t || !x) return "You're not at that table.";
      cardsAuto(g, t, x);
      afterMove(g, t);
      return null;
    }
    case "leave": {
      const x = mine(t, life);
      if (!t || !x) return "You're not at that table.";
      if (t.status === "hand" && x.stake) {
        if (x.state === "play") stand(g, t, x);
        x.quitting = true;
        journal(
          g,
          life,
          "You'll get up from the card table when this hand is settled.",
        );
      } else leaveNow(g, t, x, "gets up from the table");
      if (t.status !== "hand" && !punters(t).length)
        close(g, t, "Everyone's got up: the cards are put away.");
      else afterMove(g, t);
      return null;
    }
  }
  return "Unknown.";
}

// ---------------------------------------------------------------- the invitation

/** Another player asks you to their card table (a quiet "no" if left unanswered). */
export const CARDS_EVENTS: LifeEventDef[] = [
  {
    key: "p2p-cards",
    pool: "raised",
    cooldown: 0,
    scene: "tavern",
    where: { in: ["town"], at: ["tavern"] },
    title: "A hand of vingt-et-un",
    body: (g, _life, ctx) => {
      const c = g.s.chars[ctx.c];
      const n = ctx.stake;
      return `${c ? charName(c) : "Someone"} is at the card table in the tavern: vingt-et-un against the bank, ${n} ${n === 1 ? "coin" : "coins"} a hand. "Will you sit in?"\nTwo cards each, against the banker's; draw or stand; nearest twenty-one without going over wins.`;
    },
    choices: [
      {
        label: "Sit down at the table",
        tip: "You go over to the tavern and sit down. Each hand's stake is taken as it's dealt.",
        blocked: (g, life, ctx) =>
          cardsJoinProblem(g.s, g.w, life, cardTableById(g.s, ctx.t)),
        apply: (g, life, ctx) => {
          const err = joinCards(g, life, cardTableById(g.s, ctx.t));
          if (err) journal(g, life, err, "bad");
        },
      },
      {
        label: "Not tonight",
        tip: "They'll play without you.",
        apply: (g, life, ctx) => declineCards(g, life, ctx.t),
      },
    ],
  },
];

hooks.command.push(cardsCommand);
hooks.afterCommand.push((g) => sweepCardTables(g));
hooks.death.push((g) => sweepCardTables(g));
hooks.daily.push(cardsDaily);
