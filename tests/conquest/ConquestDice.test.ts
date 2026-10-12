// DICE (r14): Liar's dice in the tavern. Bids that must beat the last, ones
// wild when the cups come up, dice lost and players out, the pot to the last
// with dice; the town's people sitting down or refusing with reasons, and
// another player's invitation; computer players who bid sensibly and call
// plain lies; that it's the same game every time and goes on after a save;
// and, through the rooms server, that no player is ever sent anyone else's
// dice before the reveal, and that a stalling player can't hold up the table.

import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { presentAt } from "../../src/conquest/engine/Areas";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { autoChoice } from "../../src/conquest/engine/Dice";
import {
  computerMove,
  meansOf,
  sitAcceptance,
} from "../../src/conquest/engine/DiceAi";
import {
  bidChance,
  bidProblem,
  countFace,
  diceView,
  raisesOver,
  smallestRaise,
  STAKES,
  stateForSeat,
  tablesOf,
  totalDice,
} from "../../src/conquest/engine/DiceCore";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { actCheck } from "../../src/conquest/engine/LifeActs";
import { lifeOfSeat, opinionOf } from "../../src/conquest/engine/LifeQueries";
import { Rng } from "../../src/conquest/engine/Rng";
import type {
  Character,
  DiceTable,
  GameDelta,
  GameState,
  Life,
} from "../../src/conquest/engine/Types";
import type { ServerMessage } from "../../src/conquest/Protocol";
import { lifeOf, map, plan, prov, world } from "./LifeUtil";

const JT = prov("Jamestown");

/** A player in the tavern at Jamestown on a day with a few people in. */
function tavern(o: { seed?: number; folk?: number } = {}): {
  g: ConquestGame;
  life: Life;
  folk: Character[];
} {
  const g = world({
    start: 1700,
    seed: o.seed ?? 5,
    plans: [
      {
        seat: "s1",
        name: "Alden",
        plan: plan({ home: JT, background: "clerk" }),
      },
    ],
  });
  g.aiEnabled = false;
  const life = lifeOf(g);
  const here = () =>
    presentAt(g.s, g.w, life.prov, "tavern", g.s.day, life)
      .filter((x) => x.kind !== "player")
      .map((x) => g.s.chars[x.c]);
  for (let i = 0; i < 90 && here().length < (o.folk ?? 4); i++) {
    g.tick();
    life.events = [];
  }
  life.events = [];
  life.purse = 200;
  life.area = "tavern";
  return { g, life, folk: here() };
}

/** Make them like you a great deal (so they'll sit down). */
function befriend(g: ConquestGame, life: Life, cs: Character[]): void {
  for (const c of cs)
    g.char(c.id).memories.push({
      of: life.c,
      why: "Test",
      value: 90,
      until: 0,
    });
}

/** Those here who'd sit down at a stake. */
function willing(g: ConquestGame, life: Life, folk: Character[], stake = 5) {
  return folk.filter((c) => sitAcceptance(g.s, life, c, stake).total > 0);
}

function openWith(
  g: ConquestGame,
  life: Life,
  ask: number[],
  stake = 5,
): DiceTable {
  const err = g.lifeCommand(life.seat, {
    k: "dice",
    act: "open",
    stake,
    ask,
  });
  expect(err).toBeNull();
  return tablesOf(g.s).find((t) => t.status === "open")!;
}

const cmd = (g: ConquestGame, life: Life, c: object) =>
  g.lifeCommand(life.seat, { k: "dice", ...c } as never);

/** Play a table to its end, the player letting the table move for them. */
function playOut(g: ConquestGame, life: Life, t: DiceTable): void {
  for (let i = 0; i < 600 && t.status === "playing"; i++) {
    const err = cmd(g, life, { act: "auto", id: t.id });
    expect(err).toBeNull();
  }
  expect(t.status).toBe("done");
}

/** A bare table for the rules alone. */
function bare(dice: number[][], bid: { q: number; f: number } | null) {
  return {
    id: 1,
    prov: 0,
    host: 0,
    stake: 2,
    pot: 0,
    status: "playing",
    seats: dice.map((d, i) => ({
      c: i,
      dice: d,
      n: d.length,
      state: "in",
      rounds: 1,
      paid: 2,
    })),
    asked: [],
    round: 1,
    turn: 0,
    bid,
    by: bid ? 1 : -1,
    acts: [],
    tells: [],
    seq: 0,
    opened: 0,
    rng: 7,
  } as DiceTable;
}

// ---------------------------------------------------------------- the rules

describe("Liar's dice: the rules", () => {
  test("a bid must beat the last: more dice, or as many of a higher face; never ones", () => {
    const t = bare(
      [
        [2, 3, 4, 5, 6],
        [1, 1, 2, 2, 3],
      ],
      { q: 3, f: 4 },
    );
    expect(totalDice(t)).toBe(10);
    expect(bidProblem(t, { q: 3, f: 5 })).toBeNull();
    expect(bidProblem(t, { q: 4, f: 2 })).toBeNull();
    expect(bidProblem(t, { q: 3, f: 4 })).toMatch(/Raise the bid/);
    expect(bidProblem(t, { q: 3, f: 3 })).toMatch(/Raise the bid/);
    expect(bidProblem(t, { q: 2, f: 6 })).toMatch(/Raise the bid/);
    expect(bidProblem(t, { q: 4, f: 1 })).toMatch(/wild/);
    expect(bidProblem(t, { q: 11, f: 6 })).toMatch(/only 10 dice/);
    expect(bidProblem(t, { q: 0, f: 6 })).toMatch(/At least one/);
    // The raises, smallest first, all legal.
    const rs = raisesOver(t.bid, 10);
    expect(rs[0]).toEqual({ q: 3, f: 5 });
    expect(rs[1]).toEqual({ q: 3, f: 6 });
    expect(rs[2]).toEqual({ q: 4, f: 2 });
    for (const b of rs) expect(bidProblem(t, b)).toBeNull();
    expect(smallestRaise({ q: 3, f: 6 }, 10)).toEqual({ q: 4, f: 2 });
    expect(smallestRaise({ q: 10, f: 6 }, 10)).toBeNull();
    expect(smallestRaise(null, 10)).toEqual({ q: 1, f: 2 });
    // Opening a round: anything from one two up.
    const open = bare(
      [
        [2, 2],
        [3, 3],
      ],
      null,
    );
    expect(bidProblem(open, { q: 1, f: 2 })).toBeNull();
  });

  test("ones count as any face when the cups come up", () => {
    expect(countFace([1, 1, 5, 5, 3], 5)).toBe(4);
    expect(countFace([1, 1, 5, 5, 3], 3)).toBe(3);
    expect(countFace([2, 2, 2], 6)).toBe(0);
    // What you can see: your own fives and wilds, and a third of the rest.
    expect(bidChance([5, 1, 2], 6, { q: 2, f: 5 })).toBe(1);
    expect(bidChance([5, 1, 2], 6, { q: 9, f: 5 })).toBe(0);
    const p = bidChance([5, 1, 2], 6, { q: 4, f: 5 });
    expect(p).toBeGreaterThan(0.3);
    expect(p).toBeLessThan(0.7);
  });

  test("calling: a bid that stands costs the caller a die, one that doesn't costs the bidder", () => {
    const { g, life, folk } = tavern();
    befriend(g, life, folk);
    const friends = willing(g, life, folk).slice(0, 1);
    const t = openWith(
      g,
      life,
      friends.map((c) => c.id),
    );
    expect(t.seats.length).toBe(2);
    expect(cmd(g, life, { act: "start", id: t.id })).toBeNull();
    const me = t.seats.find((x) => x.c === life.c)!;
    const them = t.seats.find((x) => x.c !== life.c)!;
    // Rig the cups: you've two fives and a one; they've a five and a one.
    me.dice = [5, 5, 1, 2, 3];
    them.dice = [5, 1, 4, 4, 6];
    t.bid = { q: 5, f: 5 };
    t.by = them.c;
    t.turn = t.seats.indexOf(me);
    expect(cmd(g, life, { act: "liar", id: t.id })).toBeNull();
    let rev = t.acts.filter((a) => a.k === "reveal").pop()!;
    expect(rev.count).toBe(5); // two fives, a five, and two wild ones
    expect(rev.loser).toBe(life.c); // it stood: the caller loses a die
    expect(rev.cups![them.c]).toEqual([5, 1, 4, 4, 6]);
    expect(me.n).toBe(4);
    // Now a bid that doesn't stand.
    if (t.status === "playing") {
      me.dice = [2, 2, 3, 3];
      them.dice = [6, 6, 6, 4, 4];
      t.bid = { q: 3, f: 2 };
      t.by = them.c;
      t.turn = t.seats.indexOf(me);
      expect(cmd(g, life, { act: "liar", id: t.id })).toBeNull();
      rev = t.acts.filter((a) => a.k === "reveal").pop()!;
      expect(rev.count).toBe(2);
      expect(rev.loser).toBe(them.c);
      expect(them.n).toBe(4);
      // The loser opens the next round, and everyone rolls again.
      const roll = t.acts.filter((a) => a.k === "roll").pop()!;
      expect(roll.c).toBe(them.c);
      expect(me.dice.length).toBe(4);
    }
  });

  test("a player out of dice is out; the last with dice takes the pot", () => {
    const { g, life, folk } = tavern();
    befriend(g, life, folk);
    const friends = willing(g, life, folk, 10).slice(0, 3);
    expect(friends.length).toBeGreaterThanOrEqual(2);
    const before = life.purse;
    const t = openWith(
      g,
      life,
      friends.map((c) => c.id),
      10,
    );
    expect(t.pot).toBe(10 * t.seats.length);
    expect(life.purse).toBe(before - 10);
    expect(cmd(g, life, { act: "start", id: t.id })).toBeNull();
    playOut(g, life, t);
    const winners = t.seats.filter((x) => x.state === "in");
    expect(winners.length).toBe(1);
    expect(t.result!.winner).toBe(winners[0].c);
    for (const x of t.seats)
      if (x !== winners[0]) {
        expect(x.state).toBe("out");
        expect(x.n).toBe(0);
      }
    // Everyone's buy-in made the pot; the winner had it.
    const won = t.result!.winner === life.c;
    expect(life.purse).toBe(before - 10 + (won ? t.pot : 0));
    expect(t.result!.fx[life.c].join(" ")).toMatch(
      won ? /the pot/ : /your stake/,
    );
    // XP in Stealth, and the town's people remember the evening.
    expect(life.xp.stealth + life.skills.stealth * 100).toBeGreaterThan(0);
    const why = won ? "Took my money at the dice" : "A good night at the dice";
    for (const c of friends)
      expect(
        opinionOf(g.s, g.s.chars[c.id], life).parts.some(
          (p) => p.label === why,
        ),
      ).toBe(true);
    // Every die lost was a die someone called (or failed to).
    const reveals = t.acts.filter((a) => a.k === "reveal").length;
    expect(reveals).toBeGreaterThan(0);
  });

  test("the old one-click gamble is gone", () => {
    const { g, life } = tavern({ folk: 1 });
    expect(actCheck(g.s, g.w, life, "tavern", "gamble").ok).toBe(false);
    expect(STAKES).toEqual([2, 5, 10, 25]);
  });
});

// ---------------------------------------------------------------- who plays

describe("Liar's dice: who sits down", () => {
  test("the town's people agree or refuse with reasons", () => {
    const { g, life, folk } = tavern();
    const c = folk[0];
    const ch = g.char(c.id);
    // A drunkard who likes you: yes.
    ch.traits = ["drunkard"];
    befriend(g, life, [c]);
    const yes = sitAcceptance(g.s, life, ch, 2);
    expect(yes.total).toBeGreaterThan(0);
    expect(yes.parts.some((p) => p.label === "Never says no to a game")).toBe(
      true,
    );
    // A minister: no.
    const role = ch.role;
    ch.role = "preacher";
    ch.traits = ["zealous"];
    const no = sitAcceptance(g.s, life, ch, 2);
    expect(no.total).toBeLessThanOrEqual(0);
    expect(no.parts.some((p) => p.label === "A minister doesn't dice")).toBe(
      true,
    );
    ch.role = role;
    ch.traits = [];
    // Someone of small means can't stake 25.
    const p0 = folk.find((x) => meansOf(g.s, x) < 25)!;
    expect(p0).toBeTruthy();
    g.char(p0.id).memories = [];
    const poor = sitAcceptance(g.s, life, p0, 25);
    expect(poor.parts.some((p) => p.label === "Hasn't the money")).toBe(true);
    expect(poor.total).toBeLessThanOrEqual(0);
    // Asked, a refusal is written at the table with its reason.
    const t = openWith(g, life, [p0.id], 25);
    const refused = t.acts.find((a) => a.k === "refuse" && a.c === p0.id);
    expect(refused?.why).toBe("Hasn't the money");
    expect(t.seats.length).toBe(1);
    // Alone, you can't roll.
    expect(cmd(g, life, { act: "start", id: t.id })).toMatch(/someone/);
    // Leaving a gathering table gives your stake back.
    const p = life.purse;
    expect(cmd(g, life, { act: "leave", id: t.id })).toBeNull();
    expect(life.purse).toBe(p + 25);
    expect(t.status).toBe("done");
  });

  test("purses, debts and a drunkard's tick", () => {
    const { g, life, folk } = tavern();
    life.purse = 3;
    expect(cmd(g, life, { act: "open", stake: 5, ask: [] })).toMatch(
      /you have 3/,
    );
    life.purse = -4;
    expect(cmd(g, life, { act: "open", stake: 2, ask: [] })).toMatch(/debtor/);
    // A drunkard plays on tick.
    life.purse = 1;
    g.char(life.c).traits.push("drunkard");
    befriend(g, life, folk);
    const friends = willing(g, life, folk).slice(0, 1);
    const t = openWith(
      g,
      life,
      friends.map((c) => c.id),
      5,
    );
    expect(life.purse).toBe(-4);
    expect(t.seats[0].tick).toBe(4);
  });

  test("another player is invited, may accept or decline, or sit down until the first roll", () => {
    const g = world({
      start: 1700,
      seed: 9,
      plans: [
        {
          seat: "a",
          name: "Alden",
          plan: plan({ home: JT, background: "clerk" }),
        },
        {
          seat: "b",
          name: "Bea",
          plan: plan({
            home: JT,
            first: "Beatrice",
            family: "Cole",
            female: true,
            background: "clerk",
          }),
        },
        {
          seat: "c",
          name: "Cal",
          plan: plan({
            home: JT,
            first: "Caleb",
            family: "Hart",
            background: "clerk",
          }),
        },
      ],
    });
    g.aiEnabled = false;
    const [a, b, c] = ["a", "b", "c"].map((x) => lifeOf(g, x));
    for (const l of [a, b, c]) {
      l.purse = 50;
      l.area = "tavern";
      l.events = [];
    }
    const t = openWith(g, a, [b.c], 5);
    expect(t.asked).toEqual([b.c]);
    const ev = b.events.find((e) => e.key === "p2p-dice")!;
    expect(ev).toBeTruthy();
    expect(ev.ctx.t).toBe(t.id);
    // Bea accepts: she's seated and her stake is in the pot.
    expect(g.lifeCommand("b", { k: "event", id: ev.id, choice: 0 })).toBeNull();
    expect(t.seats.map((x) => x.c)).toEqual([a.c, b.c]);
    expect(t.pot).toBe(10);
    expect(b.purse).toBe(45);
    // Caleb sits down on his own.
    expect(g.lifeCommand("c", { k: "dice", act: "join", id: t.id })).toBeNull();
    expect(t.seats.length).toBe(3);
    // Asked again later, and he declines: written at the table.
    expect(
      g.lifeCommand("c", { k: "dice", act: "leave", id: t.id }),
    ).toBeNull();
    expect(c.purse).toBe(50);
    expect(cmd(g, a, { act: "ask", id: t.id, ask: [c.c] })).toBeNull();
    const ev2 = c.events.find((e) => e.key === "p2p-dice")!;
    expect(
      g.lifeCommand("c", { k: "event", id: ev2.id, choice: 1 }),
    ).toBeNull();
    expect(t.asked).toEqual([]);
    expect(t.acts.some((x) => x.k === "refuse" && x.c === c.c)).toBe(true);
    // Once the dice roll, nobody else sits down.
    expect(cmd(g, a, { act: "start", id: t.id })).toBeNull();
    expect(g.lifeCommand("c", { k: "dice", act: "join", id: t.id })).toMatch(
      /rolling already/,
    );
    // Only the one whose turn it is may bid.
    const turn = t.seats[t.turn].c === a.c ? a : b;
    const other = turn === a ? b : a;
    expect(
      g.lifeCommand(other.seat, {
        k: "dice",
        act: "bid",
        id: t.id,
        q: 1,
        f: 3,
      }),
    ).toMatch(/isn't your turn/);
    expect(
      g.lifeCommand(turn.seat, { k: "dice", act: "liar", id: t.id }),
    ).toMatch(/no bid/);
    expect(
      g.lifeCommand(turn.seat, { k: "dice", act: "bid", id: t.id, q: 1, f: 3 }),
    ).toBeNull();
    expect(
      g.lifeCommand(other.seat, {
        k: "dice",
        act: "bid",
        id: t.id,
        q: 1,
        f: 2,
      }),
    ).toMatch(/Raise the bid/);
  });

  test("leaving: mid-round when the cups come up, between rounds at once; setting out mid-round throws the round in", () => {
    const who = (first: string, family: string, female = false) =>
      plan({ home: JT, first, family, female, background: "clerk" });
    const g = world({
      start: 1700,
      seed: 9,
      plans: [
        { seat: "a", name: "Alden", plan: who("Alden", "Drackley") },
        { seat: "b", name: "Bea", plan: who("Beatrice", "Cole", true) },
        { seat: "c", name: "Cal", plan: who("Caleb", "Hart") },
        { seat: "d", name: "Dot", plan: who("Dorothy", "Gates", true) },
      ],
    });
    g.aiEnabled = false;
    const [a, b, c, d] = ["a", "b", "c", "d"].map((x) => lifeOf(g, x));
    for (const l of [a, b, c, d]) {
      l.purse = 50;
      l.area = "tavern";
    }
    const t = openWith(g, a, [], 5);
    for (const l of [b, c, d])
      expect(
        g.lifeCommand(l.seat, { k: "dice", act: "join", id: t.id }),
      ).toBeNull();
    expect(t.seats.map((x) => x.c)).toEqual([a.c, b.c, c.c, d.c]);
    expect(cmd(g, a, { act: "start", id: t.id })).toBeNull();
    // Alden opens; Bea asks to leave mid-round: she plays on until the reveal.
    expect(cmd(g, a, { act: "bid", id: t.id, q: 1, f: 2 })).toBeNull();
    expect(cmd(g, b, { act: "leave", id: t.id })).toBeNull();
    const bs = t.seats[1];
    expect(bs.state).toBe("in");
    expect(bs.quitting).toBe(true);
    expect(cmd(g, b, { act: "bid", id: t.id, q: 1, f: 3 })).toBeNull();
    // Caleb calls: the cups come up, and Bea goes. Her stake stays in the pot.
    expect(cmd(g, c, { act: "liar", id: t.id })).toBeNull();
    expect(bs.state).toBe("gone");
    expect(t.pot).toBe(20);
    expect(t.status).toBe("playing");
    // The next round is opened (by whoever lost a die); then Caleb sets out
    // for Plymouth mid-round: he's gone, and the round is thrown in.
    const opener = [a, c, d].find((l) => l.c === t.seats[t.turn].c)!;
    expect(cmd(g, opener, { act: "bid", id: t.id, q: 1, f: 2 })).toBeNull();
    const round = t.round;
    expect(
      g.lifeCommand("c", { k: "travel", to: prov("Plymouth") }),
    ).toBeNull();
    expect(t.seats[2].state).toBe("gone");
    expect(t.acts.some((x) => x.k === "void")).toBe(true);
    expect(t.round).toBe(round + 1);
    expect(t.bid).toBeNull();
    // Between rounds, Dorothy gets up at once: Alden is the last with dice.
    expect(cmd(g, d, { act: "leave", id: t.id })).toBeNull();
    expect(t.status).toBe("done");
    expect(t.result!.winner).toBe(a.c);
    expect(a.purse).toBe(45 + 20);
  });
});

// ---------------------------------------------------------------- the computer players

describe("Liar's dice: the computer players", () => {
  test("they seldom bid what they can't believe, always call a bid that can't be true, and don't call a sure one", () => {
    const { g, folk } = tavern();
    const r = new Rng({ rng: 4242 });
    let bids = 0;
    let absurd = 0;
    let falseBids = 0;
    let falseCalled = 0;
    let sure = 0;
    let sureCalled = 0;
    for (let k = 0; k < 1500; k++) {
      const n = 2 + r.int(0, 3);
      const t = bare(
        Array.from({ length: n }, () =>
          Array.from({ length: 1 + r.int(0, 4) }, () => r.int(1, 6)),
        ),
        null,
      );
      t.seats.forEach((x, i) => (x.c = folk[i % folk.length].id));
      t.rng = r.int(1, 1e9);
      const total = totalDice(t);
      if (r.chance(0.8)) {
        const all = raisesOver(null, total);
        t.bid = all[r.int(0, Math.min(all.length - 1, total * 2))];
        t.by = t.seats[1].c;
      }
      const me = t.seats[0];
      const hidden = total - me.dice.length;
      const m = computerMove(g.s, t, 0, new Rng(t));
      if (t.bid) {
        const p = bidChance(me.dice, hidden, t.bid);
        if (p === 0) {
          falseBids++;
          if (m.liar) falseCalled++;
        }
        if (p >= 0.9) {
          sure++;
          if (m.liar) sureCalled++;
        }
      }
      if (m.bid) {
        bids++;
        expect(bidProblem(t, m.bid)).toBeNull();
        if (bidChance(me.dice, hidden, m.bid) < 0.1) absurd++;
        expect(m.say.length).toBeGreaterThan(2);
      }
    }
    expect(bids).toBeGreaterThan(800);
    expect(absurd / bids).toBeLessThan(0.05);
    expect(falseBids).toBeGreaterThan(5);
    expect(falseCalled).toBe(falseBids);
    expect(sure).toBeGreaterThan(100);
    expect(sureCalled / sure).toBeLessThan(0.05);
  });

  test("beatable: a sensible player wins a fair share against three of them", () => {
    const { g, life, folk } = tavern({ folk: 5 });
    life.purse = 10_000;
    befriend(g, life, folk);
    const ask = willing(g, life, folk, 2)
      .slice(0, 3)
      .map((c) => c.id);
    expect(ask.length).toBe(3);
    let wins = 0;
    const N = 30;
    for (let k = 0; k < N; k++) {
      const t = openWith(g, life, ask, 2);
      expect(t.seats.length).toBe(4);
      cmd(g, life, { act: "start", id: t.id });
      for (let i = 0; i < 500 && t.status === "playing"; i++) {
        const me = t.seats.find((x) => x.c === life.c)!;
        const total = totalDice(t);
        const hidden = total - me.dice.length;
        const cur = t.bid ? bidChance(me.dice, hidden, t.bid) : 1;
        const best = raisesOver(t.bid, total)
          .filter((b) => !t.bid || b.q <= t.bid.q + 1)
          .map((b) => ({ b, p: bidChance(me.dice, hidden, b) }))
          .filter((o) => o.p >= 0.5)
          .sort((a, x) => a.b.q - x.b.q || x.p - a.p)[0];
        if (t.bid && (cur < 0.4 || !best))
          cmd(g, life, { act: "liar", id: t.id });
        else if (best) cmd(g, life, { act: "bid", id: t.id, ...best.b });
        else cmd(g, life, { act: "auto", id: t.id });
      }
      expect(t.status).toBe("done");
      if (t.result?.winner === life.c) wins++;
    }
    // A fair share is a quarter; not perfect, not hopeless.
    expect(wins).toBeGreaterThanOrEqual(3);
    expect(wins).toBeLessThan(N - 5);
  });

  test("they speak as they bid, and a player may read their faces (never surely)", () => {
    const { g, life, folk } = tavern({ folk: 5 });
    life.purse = 10_000;
    befriend(g, life, folk);
    const ask = willing(g, life, folk, 2)
      .slice(0, 3)
      .map((c) => c.id);
    let tells = 0;
    let right = 0;
    let said = 0;
    for (let k = 0; k < 12; k++) {
      const t = openWith(g, life, ask, 2);
      cmd(g, life, { act: "start", id: t.id });
      for (let i = 0; i < 500 && t.status === "playing"; i++) {
        const before = t.acts.length;
        cmd(g, life, { act: "auto", id: t.id });
        for (const a of t.acts.slice(before)) {
          if (a.k === "bid" && a.c !== life.c) {
            said += a.say ? 1 : 0;
            expect(a.mood).toBeTruthy();
          }
          const tl = t.tells.find((x) => x.n === a.n);
          if (!tl || !a.bid) continue;
          tells++;
          expect(tl.to).toBe(life.c);
          // Some faces look sure, some unsure: never all one way.
          right += /easy|glance|flat|unhurried/.test(tl.text) ? 1 : 0;
        }
      }
    }
    expect(said).toBeGreaterThan(20);
    expect(tells).toBeGreaterThan(5);
    expect(right).toBeGreaterThan(0);
    expect(right).toBeLessThan(tells);
  });

  test("the move made for a stalling player: the smallest raise, or a call when that's a long shot", () => {
    const t = bare(
      [
        [5, 5, 2, 3],
        [4, 4, 4, 4],
      ],
      { q: 2, f: 5 },
    );
    expect(autoChoice(t, t.seats[0])).toEqual({ bid: { q: 2, f: 6 } });
    t.bid = { q: 7, f: 6 };
    expect(autoChoice(t, t.seats[0])).toEqual({ liar: true });
    t.bid = null;
    expect(autoChoice(t, t.seats[0])).toEqual({ bid: { q: 1, f: 5 } });
  });
});

// ---------------------------------------------------------------- the same every time

describe("Liar's dice: determinism and saving", () => {
  function game(seed: number) {
    const x = tavern({ seed });
    befriend(x.g, x.life, x.folk);
    const friends = willing(x.g, x.life, x.folk).slice(0, 3);
    return { ...x, friends };
  }

  test("the same commands make the same game", () => {
    const one = game(11);
    const two = game(11);
    for (const x of [one, two]) {
      const t = openWith(
        x.g,
        x.life,
        x.friends.map((c) => c.id),
        5,
      );
      cmd(x.g, x.life, { act: "start", id: t.id });
      playOut(x.g, x.life, t);
    }
    expect(JSON.stringify(two.g.s.dice)).toBe(JSON.stringify(one.g.s.dice));
    expect(two.life.purse).toBe(one.life.purse);
  });

  test("a table mid-game survives a save and a load, and goes on the same", () => {
    const { g, life, friends } = game(13);
    const t = openWith(
      g,
      life,
      friends.map((c) => c.id),
      5,
    );
    cmd(g, life, { act: "start", id: t.id });
    for (let i = 0; i < 6 && t.status === "playing"; i++)
      cmd(g, life, { act: "auto", id: t.id });
    expect(t.status).toBe("playing");
    // Saved and loaded (as the server does it).
    const saved = JSON.parse(JSON.stringify(g.s)) as GameState;
    const g2 = new ConquestGame(map, saved);
    g2.aiEnabled = false;
    const life2 = lifeOfSeat(g2.s, life.seat)!;
    const t2 = tablesOf(g2.s)[0];
    expect(t2.seats.map((x) => x.dice)).toEqual(t.seats.map((x) => x.dice));
    playOut(g, life, t);
    playOut(g2, life2, t2);
    expect(JSON.stringify(t2)).toBe(JSON.stringify(t));
    expect(life2.purse).toBe(life.purse);
  });

  test("an old save with no dice in it loads, and the tables come and go in deltas", () => {
    const { g, life, friends } = game(17);
    const old = JSON.parse(JSON.stringify(g.s)) as GameState;
    delete old.dice;
    const g2 = new ConquestGame(map, old);
    expect(tablesOf(g2.s)).toEqual([]);
    // A player's copy follows the deltas.
    const mine = JSON.parse(JSON.stringify(g.s)) as GameState;
    g.takeDelta();
    const t = openWith(
      g,
      life,
      friends.map((c) => c.id),
      5,
    );
    cmd(g, life, { act: "start", id: t.id });
    const d = g.takeDelta();
    expect(d.dice).toBeTruthy();
    applyDelta(mine, { ...d, dice: diceView(d.dice, life.seat) });
    const seen = tablesOf(mine)[0];
    expect(seen.id).toBe(t.id);
    expect(seen.rng).toBe(0);
    for (const x of seen.seats)
      expect(x.dice).toEqual(x.c === life.c ? t.seats[0].dice : []);
    // The full state for a seat hides the same, and the world's dice too.
    const full = stateForSeat(g.s, "nobody");
    expect(full.rng).toBe(0);
    expect(tablesOf(full)[0].seats.every((x) => x.dice.length === 0)).toBe(
      true,
    );
    expect(tablesOf(g.s)[0].seats[0].dice.length).toBe(5);
  });
});

// ---------------------------------------------------------------- through the server

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const settle = () => new Promise((r) => setTimeout(r, 60));
/** Moves the rooms server's clock on a little (set by the test below). */
let tick: () => void = () => {};

class Client {
  readonly messages: ServerMessage[] = [];
  private waiters: {
    test: (m: ServerMessage) => boolean;
    resolve: (m: ServerMessage) => void;
  }[] = [];
  readonly ws: WebSocket;
  readonly open: Promise<void>;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.open = new Promise((r) => this.ws.on("open", () => r()));
    this.ws.on("message", (data) => {
      const m = JSON.parse(String(data)) as ServerMessage;
      this.messages.push(m);
      this.waiters = this.waiters.filter((w) => {
        if (!w.test(m)) return true;
        w.resolve(m);
        return false;
      });
    });
  }
  send(m: unknown) {
    this.ws.send(JSON.stringify(m));
  }
  next<T extends ServerMessage["t"]>(
    t: T,
    test: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true,
  ) {
    return new Promise<Extract<ServerMessage, { t: T }>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out waiting for ${t}`)),
        4000,
      );
      this.waiters.push({
        test: (m) => m.t === t && test(m as Extract<ServerMessage, { t: T }>),
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Extract<ServerMessage, { t: T }>);
        },
      });
    });
  }
  private id = 100;
  async cmd(c: object): Promise<string | null> {
    const id = this.id++;
    // The server counts messages a second by its own (fake) clock.
    tick();
    const ack = this.next("ack", (m) => m.id === id);
    this.send({ t: "cmd", id, c });
    return (await ack).err;
  }
  /** The game as this player sees it: the start, and every delta since. */
  state(): GameState {
    let s: GameState | null = null;
    for (const m of this.messages) {
      if (m.t === "game") s = JSON.parse(JSON.stringify(m.state));
      else if (m.t === "d" && s) applyDelta(s, m.d as GameDelta);
    }
    return s!;
  }
  close() {
    this.ws.close();
  }
}

describe("Liar's dice between two players, through the rooms server", () => {
  let server: http.Server;
  let url = "";
  let clock = 1_800_000_000_000;
  let rooms: import("../../src/server/conquest/ConquestRooms").ConquestRooms;
  const clients: Client[] = [];
  beforeAll(async () => {
    const { attachConquest, ConquestRooms } =
      await import("../../src/server/conquest/ConquestRooms");
    rooms = new ConquestRooms(() => clock);
    tick = () => (clock += 60);
    server = http.createServer();
    attachConquest(server, rooms);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/conquest/ws`;
  });
  afterAll(async () => {
    for (const c of clients) c.close();
    await new Promise((r) => server.close(r));
  });
  const client = async (name: string) => {
    const c = new Client(url);
    clients.push(c);
    await c.open;
    c.send({ t: "hello", name });
    await c.next("welcome");
    return c;
  };

  test("B never sees A's dice before the cups are lifted; a stalling player is moved for", async () => {
    const host = await client("Alden");
    const lobby = host.next("lobby");
    host.send({
      t: "create",
      solo: false,
      open: true,
      settings: { difficulty: "normal", start: 1700 },
    });
    const l = await lobby;
    const friend = await client("Bea");
    const joined = host.next("lobby", (m) => m.seats.length === 2);
    friend.send({ t: "join", code: l.code });
    await joined;
    host.send({ t: "plan", plan: plan({ home: JT, background: "clerk" }) });
    friend.send({
      t: "plan",
      plan: plan({
        home: JT,
        first: "Beatrice",
        family: "Cole",
        female: true,
        background: "clerk",
      }),
    });
    await host.next("lobby", (m) => m.seats.every((s) => s.made));
    friend.send({ t: "ready", ready: true });
    await host.next("lobby", (m) => m.seats.some((s) => s.ready));
    const games = [host.next("game"), friend.next("game")];
    host.send({ t: "start" });
    const [hg, fg] = await Promise.all(games);
    const paused = host.next("clock", (m) => m.paused);
    host.send({ t: "pause", p: true });
    await paused;
    const room = rooms.rooms.get(l.code)!;
    const game = room.game!;
    const A = lifeOfSeat(game.s, hg.you)!;
    const B = lifeOfSeat(game.s, fg.you)!;
    A.purse = B.purse = 60;
    expect(await host.cmd({ k: "enter", area: "tavern" })).toBeNull();
    expect(await friend.cmd({ k: "enter", area: "tavern" })).toBeNull();

    // Alden opens a table and asks Beatrice; she takes a seat; he rolls.
    expect(
      await host.cmd({ k: "dice", act: "open", stake: 5, ask: [B.c] }),
    ).toBeNull();
    const t = tablesOf(game.s)[0];
    const ev = B.events.find((e) => e.key === "p2p-dice")!;
    expect(await friend.cmd({ k: "event", id: ev.id, choice: 0 })).toBeNull();
    expect(await host.cmd({ k: "dice", act: "start", id: t.id })).toBeNull();
    expect(t.status).toBe("playing");

    await settle();
    // Each sees their own dice, and nobody else's.
    const seenBy = (c: Client) => tablesOf(c.state())[0];
    const aSeat = () => t.seats.find((x) => x.c === A.c)!;
    const bSeat = () => t.seats.find((x) => x.c === B.c)!;
    expect(seenBy(host).seats.find((x) => x.c === A.c)!.dice).toEqual(
      aSeat().dice,
    );
    expect(seenBy(host).seats.find((x) => x.c === B.c)!.dice).toEqual([]);
    expect(seenBy(friend).seats.find((x) => x.c === B.c)!.dice).toEqual(
      bSeat().dice,
    );
    expect(seenBy(friend).seats.find((x) => x.c === A.c)!.dice).toEqual([]);
    expect(seenBy(friend).rng).toBe(0);

    // Coming back (a resync), the full state hides them too.
    const back = await client("Bea");
    const again = back.next("game");
    back.send({ t: "rejoin", code: l.code, secret: fg.secret });
    const g2 = await again;
    expect(g2.state.rng).toBe(0);
    const t2 = tablesOf(g2.state)[0];
    expect(t2.seats.find((x) => x.c === A.c)!.dice).toEqual([]);
    expect(t2.seats.find((x) => x.c === B.c)!.dice).toEqual(bSeat().dice);
    expect(aSeat().dice.length).toBe(5);

    // The table's clock: it's Alden's turn, and they both hear how long he has.
    const clockMsg = back.next("diceclock");
    rooms.step();
    const dc = await clockMsg;
    expect(dc.c).toBe(A.c);
    expect(dc.left).toBeGreaterThanOrEqual(45);
    // He stalls: after the time, the table bids for him (the smallest bid).
    const moved = back.next("d", (m) => !!m.d.dice);
    clock += 30_000;
    rooms.step();
    expect(t.acts.filter((a) => a.k === "bid").length).toBe(0);
    clock += 20_000;
    rooms.step();
    await moved;
    const auto = t.acts.find((a) => a.k === "bid")!;
    expect(auto.c).toBe(A.c);
    expect(auto.auto).toBe(true);
    expect(auto.bid!.q).toBe(1);

    // Play on to the end, each moving on their own turn.
    for (let i = 0; i < 200 && t.status === "playing"; i++) {
      const who = t.seats[t.turn].c === A.c ? host : back;
      expect(await who.cmd({ k: "dice", act: "auto", id: t.id })).toBeNull();
    }
    expect(t.status).toBe("done");
    await settle();

    // Through it all, Beatrice was never sent Alden's dice (nor he hers),
    // except in a reveal, once the cups were lifted; nor anyone's tells.
    const reveals = new Map<number, number[][]>();
    for (const [msgs, me, them] of [
      [[...friend.messages, ...back.messages], B.c, A.c],
      [host.messages, A.c, B.c],
    ] as [ServerMessage[], number, number][]) {
      let tables = 0;
      for (const m of msgs) {
        if (m.t !== "d" && m.t !== "game") continue;
        const ds = m.t === "game" ? m.state.dice : m.d.dice;
        if (!ds) continue;
        tables++;
        for (const tb of ds.tables) {
          expect(tb.rng).toBe(0);
          for (const x of tb.seats) if (x.c !== me) expect(x.dice).toEqual([]);
          for (const tl of tb.tells) expect(tl.to).toBe(me);
          const r = tb.acts.filter((a) => a.k === "reveal");
          reveals.set(
            me,
            r.map((a) => a.cups![them] ?? []),
          );
        }
      }
      expect(tables).toBeGreaterThan(3);
    }
    // ...and every reveal showed the dice that were really under the cups.
    const real = t.acts.filter((a) => a.k === "reveal");
    expect(real.length).toBeGreaterThan(3);
    expect(reveals.get(B.c)).toEqual(real.map((a) => a.cups![A.c] ?? []));
  }, 60000);
});
