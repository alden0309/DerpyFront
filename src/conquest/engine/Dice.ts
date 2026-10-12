// DICE (r14): Liar's dice in the tavern. A player opens a table at a stake
// and asks the people in the tavern to sit down (the town's people decide
// there and then, with their reasons; other players get the invitation to
// answer, or sit down on their own until the first roll). Then the game:
// five dice each under a cup, bids in turn on how many of a face lie under
// all the cups (ones wild), each higher than the last, until someone calls
// "Liar!": the cups come up, and whoever was wrong gives up a die. The
// loser opens the next round; the last with dice takes the pot.
//
// Turns go by command, never by the clock: computer players move at once
// when it's their turn (the browser paces them), and a player who stalls is
// moved for by the server, with an ordinary command ("auto"). Everything
// rolls on the table's own dice, saved with it, so a game reloaded mid-way
// goes on exactly as it would have.

import { checkAchievements } from "./Achievements";
import { presentAt } from "./Areas";
import {
  canAsk,
  computerMove,
  readFaces,
  revealLine,
  sitAcceptance,
} from "./DiceAi";
import {
  bidChance,
  bidProblem,
  bidWords,
  countFace,
  DICE_EACH,
  diceChanged,
  diceState,
  DONE_KEEP_DAYS,
  FACES,
  MAX_SEATS,
  MIN_SEATS,
  nextIn,
  OPEN_DAYS,
  pushAct,
  seatedAt,
  seatOf,
  smallestRaise,
  STAKES,
  stillIn,
  tableAt,
  tableById,
  tableRng,
  totalDice,
} from "./DiceCore";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  journal,
  meet,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import {
  hasPlace,
  isChildLife,
  lifeOfChar,
  lifeOfSeat,
  meOf,
} from "./LifeQueries";
import type { World } from "./Map";
import { wake } from "./Pace";
import { charName, hasTrait } from "./Queries";
import { rumour } from "./Rumours";
import type {
  DiceBid,
  DiceCommand,
  DiceSeat,
  DiceTable,
  GameState,
  Life,
  LifeCommand,
} from "./Types";

/** A big table: a win at it is talked about, and worth a little renown. */
export const BIG_POT = 40;
/** Experience in Stealth for a table: a little, and a little more a round. */
export const XP_TABLE = 4;
export const XP_ROUND = 1;
export const XP_MAX = 20;
/** A table within this many days of the last teaches a third as much. */
export const XP_DAYS = 7;

/** "+3", "−3". */
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;

// ---------------------------------------------------------------- small things

const nameOf = (g: ConquestGame, c: number) => charName(g.s.chars[c]);
const firstOf = (g: ConquestGame, c: number) =>
  g.s.chars[c]?.first ?? "Someone";
const townOf = (g: ConquestGame, p: number) => g.map.provinces[p]?.name ?? "";

/** The player sitting in a seat (if it's still theirs to play). */
function lifeAt(g: ConquestGame, x: DiceSeat): Life | undefined {
  if (x.seat === undefined) return undefined;
  const l = lifeOfSeat(g.s, x.seat);
  return l && l.c === x.c ? l : undefined;
}

/** Why someone can't sit down to dice here just now, or null. */
export function diceHere(s: GameState, w: World, life: Life): string | null {
  if (life.c < 0 || life.watching) return "You're watching.";
  if (isChildLife(s, life)) return "Not until you're sixteen.";
  if (life.travel) return "You're on the road.";
  if (!hasPlace(s, w, life.prov, "tavern")) return "There's no tavern here.";
  return null;
}

/** Whether a purse runs to a stake (a drunkard may play on tick, into debt). */
export function stakeProblem(
  s: GameState,
  life: Life,
  stake: number,
): string | null {
  if (life.purse >= stake) return null;
  const me = meOf(s, life);
  if (life.purse < 0)
    return "Nobody dices with a debtor: pay what you owe first.";
  if (me && hasTrait(me, "drunkard")) return null;
  return `The stake is ${stake} coins; you have ${Math.floor(life.purse)}.`;
}

/** Why a player can't sit down at a table, or null. */
export function joinProblem(
  s: GameState,
  w: World,
  life: Life,
  t: DiceTable | undefined,
): string | null {
  if (!t || t.status === "done") return "That table has broken up.";
  if (t.status === "playing")
    return "The dice are rolling already: wait for the next game.";
  const why = diceHere(s, w, life);
  if (why) return why;
  if (life.prov !== t.prov) return "That table is in another town.";
  if (seatOf(t, life.c)?.state === "in") return "You're at the table already.";
  if (seatedAt(s, life.c)) return "You're at another table.";
  if (stillIn(t).length >= MAX_SEATS) return "The table is full.";
  return stakeProblem(s, life, t.stake);
}

/** Why a player can't open a table here at a stake, or null. */
export function openProblem(
  s: GameState,
  w: World,
  life: Life,
  stake: number,
): string | null {
  const why = diceHere(s, w, life);
  if (why) return why;
  if (seatedAt(s, life.c)) return "You're at a table already.";
  const other = tableAt(s, life.prov);
  if (other)
    return other.status === "open"
      ? "There's a table gathering already: sit down at it."
      : "There's a game going already: watch, or wait for the next.";
  return stakeProblem(s, life, stake);
}

/** The people in this tavern today. */
function tavernFolk(g: ConquestGame, p: number): Set<number> {
  return new Set(presentAt(g.s, g.w, p, "tavern", g.s.day).map((x) => x.c));
}

// ---------------------------------------------------------------- sitting down

function sitDown(
  g: ConquestGame,
  t: DiceTable,
  c: number,
  life: Life | null,
): void {
  const x: DiceSeat = {
    c,
    dice: [],
    n: DICE_EACH,
    state: "in",
    rounds: 0,
    paid: t.stake,
  };
  if (life) {
    x.seat = life.seat;
    const tick = Math.max(0, t.stake - Math.max(0, life.purse));
    if (tick > 0) x.tick = tick;
    spend(g, life, t.stake);
    touchLife(g, life).area = "tavern";
  }
  t.pot += t.stake;
  // A seat left in the gathering (someone stood up) is taken again.
  t.seats = t.seats.filter((y) => y.c !== c);
  t.seats.push(x);
  t.asked = t.asked.filter((y) => y !== c);
  pushAct(t, { k: "sit", c, round: 0 });
  diceChanged(g);
}

/**
 * Ask someone to the table: a computer character decides at once (with
 * their reasons); a player gets the invitation to answer.
 */
function askOne(
  g: ConquestGame,
  life: Life,
  t: DiceTable,
  c: number,
  here: Set<number>,
): string | null {
  const s = g.s;
  const ch = s.chars[c];
  const no = canAsk(s, ch);
  if (no) return `${ch ? ch.first : "They"}: ${no}`;
  if (c === life.c) return null;
  if (seatOf(t, c)?.state === "in" || t.asked.includes(c)) return null;
  if (stillIn(t).length + t.asked.length >= MAX_SEATS)
    return "Six at a table at most.";
  if (seatedAt(s, c)) return `${ch.first} is at another table.`;
  if (!here.has(c)) return `${ch.first} isn't in the tavern.`;
  const other = lifeOfChar(s, c);
  if (other) {
    t.asked.push(c);
    raiseEvent(g, other, "p2p-dice", { t: t.id, c: life.c, stake: t.stake });
    diceChanged(g);
    return null;
  }
  meet(g, life, c);
  const v = sitAcceptance(s, life, ch, t.stake);
  if (v.total > 0) {
    sitDown(g, t, c, null);
    return null;
  }
  const worst = [...v.parts]
    .filter((p) => !p.mul && p.value < 0)
    .sort((a, b) => a.value - b.value)[0];
  pushAct(t, {
    k: "refuse",
    c,
    round: 0,
    why: worst ? worst.label : "Not tonight",
  });
  diceChanged(g);
  return null;
}

/** The table's own dice, seeded from the world's when it opens (and never shown). */
function seedOf(g: ConquestGame, id: number): number {
  return (
    (Math.floor(g.rng.next() * 0x7fffffff) ^ Math.imul(id, 0x9e3779b1)) | 0
  );
}

/** Open a table here at a stake, and ask people to it. */
export function openTable(
  g: ConquestGame,
  life: Life,
  stake: number,
  ask: number[],
  known?: Set<number>,
): string | null {
  const s = g.s;
  if (!STAKES.includes(stake)) return "Choose a stake.";
  const why = openProblem(s, g.w, life, stake);
  if (why) return why;
  if (ask.length > MAX_SEATS - 1) return "Six at a table at most.";
  const ds = diceState(g);
  // Your last game's table is cleared away.
  ds.tables = ds.tables.filter(
    (t) => !(t.status === "done" && t.host === life.c),
  );
  const id = g.nextId();
  const t: DiceTable = {
    id,
    prov: life.prov,
    host: life.c,
    stake,
    pot: 0,
    status: "open",
    seats: [],
    asked: [],
    round: 0,
    turn: 0,
    bid: null,
    by: -1,
    acts: [],
    tells: [],
    seq: 0,
    opened: s.day,
    rng: seedOf(g, id),
  };
  ds.tables.push(t);
  sitDown(g, t, life.c, life);
  journal(
    g,
    life,
    `You open a table of Liar's dice at the tavern in ${townOf(g, life.prov)}, ${stake} coins a seat.`,
  );
  const here = tavernFolk(g, life.prov);
  for (const c of known ?? []) here.add(c);
  for (const c of ask) askOne(g, life, t, c, here);
  t.seq++;
  diceChanged(g);
  return null;
}

/** A player sits down at a gathering table. */
export function joinTable(
  g: ConquestGame,
  life: Life,
  t: DiceTable | undefined,
): string | null {
  const why = joinProblem(g.s, g.w, life, t);
  if (why) return why;
  const tb = t!;
  sitDown(g, tb, life.c, life);
  journal(
    g,
    life,
    `You sit down to Liar's dice with ${nameOf(g, tb.host)}, ${tb.stake} coins a seat.`,
  );
  const host = lifeOfChar(g.s, tb.host);
  if (host && host !== life)
    journal(g, host, `${nameOf(g, life.c)} sits down at your dice table.`);
  tb.seq++;
  return null;
}

/** A player turns down an invitation. */
export function declineTable(g: ConquestGame, life: Life, id: number): void {
  const t = tableById(g.s, id);
  if (!t || !t.asked.includes(life.c)) return;
  t.asked = t.asked.filter((c) => c !== life.c);
  pushAct(t, { k: "refuse", c: life.c, round: 0, why: "Not tonight" });
  const host = lifeOfChar(g.s, t.host);
  if (host) journal(g, host, `${nameOf(g, life.c)} won't sit down tonight.`);
  t.seq++;
  diceChanged(g);
}

/** The table breaks up before a die is rolled: every stake goes back. */
function breakUp(g: ConquestGame, t: DiceTable, why: string): void {
  for (const x of t.seats) {
    if (x.state !== "in") continue;
    const l = lifeAt(g, x);
    if (l) {
      earn(g, l, x.paid);
      journal(g, l, `${why} Your ${x.paid} coins come back to you.`);
    }
    x.state = "gone";
  }
  for (const c of t.asked) {
    const l = lifeOfChar(g.s, c);
    if (l) dropInvite(g, l, t.id);
  }
  t.asked = [];
  t.pot = 0;
  t.status = "done";
  t.ended = g.s.day;
  pushAct(t, { k: "gone", c: t.host, round: t.round, why });
  t.seq++;
  diceChanged(g);
}

function dropInvite(g: ConquestGame, l: Life, id: number): void {
  if (!l.events.some((e) => e.key === "p2p-dice" && e.ctx.t === id)) return;
  touchLife(g, l).events = l.events.filter(
    (e) => !(e.key === "p2p-dice" && e.ctx.t === id),
  );
}

// ---------------------------------------------------------------- the game

function beginRound(g: ConquestGame, t: DiceTable, opener: number): void {
  const r = tableRng(t);
  t.round++;
  t.bid = null;
  t.by = -1;
  const ns: Record<number, number> = {};
  for (const x of t.seats) {
    if (x.state === "in") {
      x.dice = Array.from({ length: x.n }, () => r.int(1, 6));
      x.rounds++;
      ns[x.c] = x.n;
    } else x.dice = [];
  }
  t.turn = opener;
  pushAct(t, {
    k: "roll",
    c: t.seats[opener].c,
    round: t.round,
    ns,
    turn: t.seats[opener].c,
  });
}

/** The host rolls: the game begins, and they open the first round. */
export function startTable(
  g: ConquestGame,
  life: Life,
  t: DiceTable,
): string | null {
  if (t.status !== "open")
    return t.status === "playing"
      ? "The game's begun."
      : "That table has broken up.";
  if (t.host !== life.c) return "Whoever opened the table rolls first.";
  if (stillIn(t).length < MIN_SEATS) return "You need someone to play against.";
  t.status = "playing";
  t.started = g.s.day;
  for (const c of t.asked) {
    const l = lifeOfChar(g.s, c);
    if (l) {
      dropInvite(g, l, t.id);
      journal(g, l, `${nameOf(g, t.host)}'s dice table began without you.`);
    }
  }
  t.asked = [];
  for (const x of t.seats) {
    const l = lifeAt(g, x);
    if (l && x.state === "in")
      journal(
        g,
        l,
        `The cups are shaken: Liar's dice, ${stillIn(t).length} at the table, a pot of ${t.pot}.`,
      );
  }
  beginRound(
    g,
    t,
    Math.max(
      0,
      t.seats.findIndex((x) => x.c === t.host && x.state === "in"),
    ),
  );
  afterMove(g, t);
  return null;
}

interface MoveOpts {
  auto?: boolean;
  say?: string;
  mood?: NonNullable<DiceTable["acts"][number]["mood"]>;
  /** A computer player believes their own bid (for the tells). */
  sure?: boolean;
}

function placeBid(
  g: ConquestGame,
  t: DiceTable,
  i: number,
  b: DiceBid,
  o: MoveOpts = {},
): void {
  const x = t.seats[i];
  t.bid = { q: b.q, f: b.f };
  t.by = x.c;
  t.turn = nextIn(t, i);
  const n = pushAct(t, {
    k: "bid",
    c: x.c,
    round: t.round,
    bid: t.bid,
    turn: t.seats[t.turn].c,
    ...(o.say ? { say: o.say } : {}),
    ...(o.mood ? { mood: o.mood } : {}),
    ...(o.auto ? { auto: true } : {}),
  });
  // A computer player's face, read (or misread) by the players at the table.
  if (x.seat === undefined && o.sure !== undefined)
    for (const tl of readFaces(g.s, t, x.c, o.sure, tableRng(t)))
      t.tells.push({ n, to: tl.to, by: x.c, text: tl.text });
}

function callLiar(
  g: ConquestGame,
  t: DiceTable,
  i: number,
  o: MoveOpts = {},
): void {
  const x = t.seats[i];
  const b = t.bid!;
  const bi = Math.max(
    0,
    t.seats.findIndex((y) => y.c === t.by),
  );
  pushAct(t, {
    k: "liar",
    c: x.c,
    round: t.round,
    bid: b,
    ...(o.say ? { say: o.say } : {}),
    ...(o.mood ? { mood: o.mood } : {}),
    ...(o.auto ? { auto: true } : {}),
  });
  const cups: Record<number, number[]> = {};
  let count = 0;
  for (const y of t.seats)
    if (y.state === "in") {
      cups[y.c] = [...y.dice];
      count += countFace(y.dice, b.f);
    }
  const stands = count >= b.q;
  const li = stands ? i : bi;
  const loser = t.seats[li];
  const winnerOfCall = stands ? t.seats[bi] : x;
  loser.n--;
  const r = tableRng(t);
  pushAct(t, {
    k: "reveal",
    c: x.c,
    round: t.round,
    bid: b,
    bidder: t.by,
    cups,
    count,
    loser: loser.c,
    // What a computer player says as the cups come up.
    ...(loser.seat === undefined
      ? { say: revealLine(true, r), mood: "frown" as const }
      : winnerOfCall.seat === undefined
        ? { say: revealLine(false, r), mood: "smile" as const }
        : {}),
  });
  // The loser's journal has it (the table itself shows everyone the rest).
  const lost = lifeAt(g, loser);
  if (lost) {
    const there = `${count} ${count === 1 ? "was" : "were"} showing`;
    journal(
      g,
      lost,
      stands
        ? `At the dice you called ${firstOf(g, t.by)}'s ${bidWords(b)} a lie, but ${there}: you lose a die.`
        : `At the dice ${firstOf(g, x.c)} called your ${bidWords(b)} a lie, and only ${there}: you lose a die.`,
      "bad",
    );
  }
  if (loser.n <= 0) {
    loser.state = "out";
    loser.dice = [];
    pushAct(t, { k: "out", c: loser.c, round: t.round });
    const l = lifeAt(g, loser);
    if (l)
      journal(g, l, "Your last die is gone: you're out of the game.", "bad");
  }
  // Those who asked to leave go now the cups are up.
  for (const y of t.seats)
    if (y.quitting && y.state === "in") standUp(g, t, y, "leaves the table");
  if (stillIn(t).length <= 1) return finish(g, t);
  beginRound(g, t, loser.state === "in" ? li : nextIn(t, li));
}

/** Someone gets up from a game under way: their buy-in stays in the pot. */
function standUp(
  g: ConquestGame,
  t: DiceTable,
  x: DiceSeat,
  why: string,
): void {
  x.state = "gone";
  x.dice = [];
  x.quitting = false;
  pushAct(t, { k: "gone", c: x.c, round: t.round, why });
  const l = lifeAt(g, x);
  if (l)
    journal(
      g,
      l,
      "You get up from the dice table. Your stake stays in the pot.",
    );
}

/**
 * Someone leaves the table, of their own accord or not. A gathering gives
 * back their stake (and breaks up if it was the host's); in a game, between
 * rounds they go at once, and mid-round they go when the cups come up; a
 * player who has to go mid-round (setting out, dying, another life) is gone
 * at once, and the round is thrown in and rolled again.
 */
function leave(
  g: ConquestGame,
  t: DiceTable,
  x: DiceSeat,
  why: string,
  forced: boolean,
): void {
  if (t.status === "open") {
    if (x.c === t.host)
      return breakUp(
        g,
        t,
        why === "sets out"
          ? "The dice table breaks up: its host has gone."
          : "The dice table breaks up.",
      );
    const l = lifeAt(g, x) ?? (x.seat ? lifeOfSeat(g.s, x.seat) : undefined);
    if (l && x.seat !== undefined) {
      earn(g, l, x.paid);
      journal(
        g,
        l,
        `You get up from the dice table; your ${x.paid} coins come back to you.`,
      );
    }
    t.pot -= x.paid;
    t.seats = t.seats.filter((y) => y !== x);
    pushAct(t, { k: "gone", c: x.c, round: 0, why });
    t.seq++;
    diceChanged(g);
    return;
  }
  if (t.status !== "playing" || x.state !== "in") return;
  const i = t.seats.indexOf(x);
  if (t.bid && !forced) {
    x.quitting = true;
    const l = lifeAt(g, x);
    if (l)
      journal(
        g,
        l,
        "You'll get up from the dice table when the cups are lifted.",
      );
    t.seq++;
    diceChanged(g);
    return;
  }
  const mid = t.bid !== null;
  const wasTurn = t.turn === i;
  standUp(g, t, x, why);
  if (stillIn(t).length <= 1) {
    finish(g, t);
    t.seq++;
    diceChanged(g);
    return;
  }
  if (mid) {
    // The round is thrown in: everyone rolls again, the same one to open.
    pushAct(t, { k: "void", c: x.c, round: t.round });
    const opener = t.seats[t.turn]?.state === "in" ? t.turn : nextIn(t, t.turn);
    beginRound(g, t, opener);
  } else if (wasTurn) {
    t.turn = nextIn(t, i);
    const last = t.acts[t.acts.length - 1];
    if (last) last.turn = t.seats[t.turn].c;
  }
  afterMove(g, t);
}

/** The game is won: the pot, and what the night came to for each player. */
function finish(g: ConquestGame, t: DiceTable): void {
  const s = g.s;
  const w = stillIn(t)[0];
  t.status = "done";
  t.ended = s.day;
  t.bid = null;
  if (w) {
    t.turn = t.seats.indexOf(w);
    w.dice = [];
    pushAct(t, { k: "win", c: w.c, round: t.round });
  }
  aftermath(g, t, w);
  diceChanged(g);
  for (const x of t.seats) {
    const l = lifeAt(g, x);
    if (l) checkAchievements(g, l);
  }
}

function aftermath(
  g: ConquestGame,
  t: DiceTable,
  w: DiceSeat | undefined,
): void {
  const s = g.s;
  const fx: Record<number, string[]> = {};
  const add = (c: number, line: string) => (fx[c] ??= []).push(line);
  const big = t.pot >= BIG_POT;
  const here = townOf(g, t.prov);
  const players = t.seats.filter((x) => lifeAt(g, x));
  for (const x of players) {
    const l = lifeAt(g, x)!;
    const me = meOf(s, l)!;
    const won = x === w;
    // A table teaches a straight face and a quick eye (Stealth): the first
    // in a week fully, any more that week a third as much.
    const fresh = (l.cooldowns["dice:xp"] ?? 0) <= s.day;
    const xp = Math.round(
      Math.min(XP_MAX, XP_TABLE + XP_ROUND * x.rounds) * (fresh ? 1 : 1 / 3),
    );
    gainXp(g, l, "stealth", xp);
    if (fresh) touchLife(g, l).cooldowns["dice:xp"] = s.day + XP_DAYS;
    if (won) {
      earn(g, l, t.pot);
      add(x.c, `+${t.pot} coins: the pot`);
      const relief = big ? -12 : -8;
      addStress(g, l, relief);
      add(x.c, `${signed(relief)} stress`);
      const fame = t.pot >= 100 ? 2 : big ? 1 : 0;
      if (fame) {
        addRenown(g, l, fame);
        add(x.c, `+${fame} renown`);
      }
      journal(
        g,
        l,
        `You won at Liar's dice: the pot of ${t.pot} coins is yours.`,
        "good",
      );
      const ach = (touchLife(g, l).achCount ??= {});
      if (x.n === 1) ach["dice-last"] = (ach["dice-last"] ?? 0) + 1;
      if (t.seats.length >= MAX_SEATS)
        ach["dice-full"] = (ach["dice-full"] ?? 0) + 1;
      if (big)
        rumour(
          g,
          t.prov,
          `${charName(me)} took a pot of ${t.pot} coins at Liar's dice in the tavern at ${here}.`,
          me.id,
          "good",
        );
    } else {
      add(x.c, `−${x.paid} coins: your stake`);
      // A big loss smarts; a small one was an evening out.
      const smarts = x.paid >= 10 && x.paid * 4 > Math.max(0, l.purse) + x.paid;
      const st = smarts ? 6 : hasTrait(me, "drunkard") ? -5 : -3;
      addStress(g, l, st);
      add(x.c, `${signed(st)} stress`);
      journal(
        g,
        l,
        w
          ? `${charName(s.chars[w.c])} won the pot of ${t.pot} at Liar's dice.${smarts ? " Your stake went with it, and it stings." : ""}`
          : "The dice table broke up.",
        smarts ? "bad" : undefined,
      );
    }
    add(x.c, `+${xp} Stealth experience`);
    if (x.tick) add(x.c, `${x.tick} of your stake on tick: you owe it`);
  }
  // The town's people at the table remember the evening.
  for (const z of t.seats) {
    if (z.seat !== undefined) continue;
    const npc = s.chars[z.c];
    if (!npc?.alive) continue;
    for (const x of players) {
      const l = lifeAt(g, x)!;
      const took = x === w && t.stake >= 5;
      const why = took
        ? "Took my money at the dice"
        : "A good night at the dice";
      const v = took ? -5 : 5;
      remembers(g, l, g.char(npc.id), why, v, 1);
      add(x.c, `${signed(v)} ${charName(npc)}: ${why}`);
    }
  }
  // A sore loser: a big pot taken off someone who minds.
  if (w && lifeAt(g, w) && t.stake >= 10) {
    const r = tableRng(t);
    const sore = t.seats.filter((z) => {
      const npc = s.chars[z.c];
      return (
        z.seat === undefined &&
        npc?.alive &&
        (hasTrait(npc, "cruel") ||
          hasTrait(npc, "greedy") ||
          hasTrait(npc, "drunkard") ||
          hasTrait(npc, "ambitious"))
      );
    });
    if (sore.length && r.chance(0.4))
      raiseEvent(g, lifeAt(g, w)!, "dice-sore", {
        c: sore[r.int(0, sore.length - 1)].c,
        stake: t.stake,
      });
  }
  t.result = { winner: w ? w.c : -1, pot: t.pot, fx };
}

// ---------------------------------------------------------------- moves

/** After any move: the computer players take their turns, and whoever's next is told. */
function afterMove(g: ConquestGame, t: DiceTable): void {
  t.seq++;
  diceChanged(g);
  computersPlay(g, t);
  if (t.status !== "playing") return;
  const l = lifeAt(g, t.seats[t.turn]);
  if (l) wake(g, l, "Your turn at the dice.");
}

function computersPlay(g: ConquestGame, t: DiceTable): void {
  for (let guard = 0; guard < 4000; guard++) {
    if (t.status !== "playing") return;
    const x = t.seats[t.turn];
    if (!x || x.seat !== undefined || x.state !== "in") return;
    const i = t.turn;
    const m = computerMove(g.s, t, i, tableRng(t));
    if (m.liar && t.bid) callLiar(g, t, i, { say: m.say, mood: m.mood });
    else {
      let b = m.bid ?? smallestRaise(t.bid, totalDice(t));
      if (!b || bidProblem(t, b)) b = smallestRaise(t.bid, totalDice(t));
      if (b) placeBid(g, t, i, b, { say: m.say, mood: m.mood, sure: m.sure });
      else if (t.bid) callLiar(g, t, i, { say: m.say, mood: "angry" });
      else return;
    }
    t.seq++;
  }
}

/**
 * The move made for a player who stalled or went away: the smallest raise
 * there is, unless that's a long shot from what they hold (then "Liar!").
 * Opening a round, one of the face they hold most.
 */
export function autoChoice(
  t: DiceTable,
  x: DiceSeat,
): { liar: true } | { bid: DiceBid } {
  const total = totalDice(t);
  const hidden = total - x.dice.length;
  if (!t.bid) {
    let f = 6;
    let most = -1;
    for (const k of FACES) {
      const n = countFace(x.dice, k);
      if (n >= most) {
        most = n;
        f = k;
      }
    }
    return { bid: { q: 1, f } };
  }
  const r = smallestRaise(t.bid, total);
  if (!r || bidChance(x.dice, hidden, r) < 0.3) return { liar: true };
  return { bid: r };
}

function myTurn(t: DiceTable | undefined, life: Life): string | null {
  if (!t || t.status !== "playing")
    return "There's no game going at that table.";
  const x = t.seats[t.turn];
  if (!x || x.c !== life.c || x.seat !== life.seat)
    return "It isn't your turn.";
  return null;
}

// ---------------------------------------------------------------- keeping the tables

/** Finished (a move may have finished it while we looked). */
const over = (t: DiceTable): boolean => t.status === "done";

/**
 * Anyone who can't be at the table any more leaves it: a player who has set
 * out, gone elsewhere, died, or plays someone else now; a computer player
 * who has died or taken the road. Invitations to players who've gone lapse.
 */
export function sweepTables(g: ConquestGame): void {
  const s = g.s;
  for (const t of s.dice?.tables ?? []) {
    if (t.status === "done") continue;
    for (const x of [...t.seats]) {
      if (x.state !== "in" || over(t)) continue;
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
      if (why) leave(g, t, x, why, true);
    }
    if (over(t)) continue;
    const asked = t.asked.filter((c) => {
      const l = lifeOfChar(s, c);
      return !!l && !l.travel && l.prov === t.prov;
    });
    if (asked.length !== t.asked.length) {
      t.asked = asked;
      diceChanged(g);
    }
  }
}

/** Someone who can't play on (the server couldn't move for them) leaves a table. */
export function dropFromTable(g: ConquestGame, id: number, c: number): void {
  const t = tableById(g.s, id);
  const x = t ? seatOf(t, c) : undefined;
  if (t && x && x.state === "in") leave(g, t, x, "is called away", true);
}

/** Each day: gatherings nobody rolled break up, and old tables are cleared away. */
export function diceDaily(g: ConquestGame): void {
  const ds = g.s.dice;
  if (!ds || !ds.tables.length) return;
  sweepTables(g);
  const day = g.s.day;
  for (const t of ds.tables)
    if (t.status === "open" && day - t.opened >= OPEN_DAYS)
      breakUp(g, t, "Nobody rolled: the dice table breaks up.");
  const kept = ds.tables.filter(
    (t) => t.status !== "done" || day - (t.ended ?? day) < DONE_KEEP_DAYS,
  );
  if (kept.length !== ds.tables.length) {
    ds.tables = kept;
    diceChanged(g);
  }
}

// ---------------------------------------------------------------- the commands

export function diceCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "dice") return undefined;
  const d = c as DiceCommand;
  const s = g.s;
  if (isChildLife(s, life)) return "Not until you're sixteen.";
  const t = typeof d.id === "number" ? tableById(s, d.id) : undefined;
  const ask = Array.isArray(d.ask)
    ? d.ask.filter((x): x is number => Number.isInteger(x)).slice(0, MAX_SEATS)
    : [];
  switch (d.act) {
    case "open":
      return openTable(g, life, Number(d.stake), ask);
    case "again": {
      if (!t || t.status !== "done" || !seatOf(t, life.c))
        return "That game is over and gone.";
      // The same people again: the town's people who sat down are still
      // about (they sit at the table), and players if they're still here.
      const others = t.seats.filter((x) => x.c !== life.c).map((x) => x.c);
      const npcs = others.filter((c) => !lifeOfChar(s, c));
      return openTable(g, life, t.stake, others, new Set(npcs));
    }
    case "ask": {
      if (!t || t.status !== "open") return "That table isn't gathering.";
      if (t.host !== life.c)
        return "Only whoever opened the table asks people to it.";
      const here = tavernFolk(g, t.prov);
      let err: string | null = null;
      for (const x of ask) err = askOne(g, life, t, x, here) ?? err;
      t.seq++;
      diceChanged(g);
      return ask.length === 1 ? err : null;
    }
    case "join":
      return joinTable(g, life, t);
    case "start":
      if (!t) return "That table has broken up.";
      return startTable(g, life, t);
    case "bid": {
      const why = myTurn(t, life);
      if (why) return why;
      const b = { q: Number(d.q), f: Number(d.f) };
      const bad = bidProblem(t!, b);
      if (bad) return bad;
      placeBid(g, t!, t!.turn, b);
      afterMove(g, t!);
      return null;
    }
    case "liar": {
      const why = myTurn(t, life);
      if (why) return why;
      if (!t!.bid) return "There's no bid to call yet: you open the round.";
      callLiar(g, t!, t!.turn);
      afterMove(g, t!);
      return null;
    }
    case "auto": {
      const why = myTurn(t, life);
      if (why) return why;
      const i = t!.turn;
      const m = autoChoice(t!, t!.seats[i]);
      if ("liar" in m) callLiar(g, t!, i, { auto: true });
      else placeBid(g, t!, i, m.bid, { auto: true });
      afterMove(g, t!);
      return null;
    }
    case "leave": {
      if (!t) return "That table has broken up.";
      const x = seatOf(t, life.c);
      if (!x || x.seat !== life.seat) return "You're not at that table.";
      if (x.state !== "in") return null;
      leave(g, t, x, "leaves the table", false);
      return null;
    }
  }
  return "Unknown.";
}

hooks.command.push(diceCommand);
// Setting out, another life, a death: whoever can't sit at the table leaves it.
hooks.afterCommand.push((g) => sweepTables(g));
hooks.death.push((g) => sweepTables(g));
