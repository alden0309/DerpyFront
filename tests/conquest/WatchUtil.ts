// SITE (r19): every kind of secret a Derpy Conquest game keeps from other
// players, planted in a game with two players (seats s1 and s2), all of them
// s1's. Each carries the text "SECRET" (or is a die, a tell, a scheme, a
// bond, a petition) so a test can look for it in whatever a watcher is sent.

import { SECRET_MARK } from "../../src/conquest/engine/BondCore";
import { crownChanged } from "../../src/conquest/engine/CrownCore";
import { diceChanged } from "../../src/conquest/engine/DiceCore";
import type { ConquestGame } from "../../src/conquest/engine/Game";
import { intrigueChanged } from "../../src/conquest/engine/IntrigueCore";
import { touchLife } from "../../src/conquest/engine/LifeCore";
import { lifeOfSeat, meOf } from "../../src/conquest/engine/LifeQueries";
import { loansChanged } from "../../src/conquest/engine/LoanCore";
import type {
  CrownState,
  DiceState,
  GameState,
  IntrigueState,
  Life,
  LoanState,
} from "../../src/conquest/engine/Types";

/** Text in every planted secret. */
export const SECRET = "SECRET";

function pendingEvent(id: number, key: string, day: number) {
  return {
    id,
    key,
    day,
    title: `${SECRET} ${key}`,
    body: `${SECRET} body of ${key}`,
    choices: [],
    ctx: {},
    expires: day + 30,
  };
}

/** Plants one of every per-seat secret, all of them seat `sa`'s, in `g`. */
export function plantSecrets(g: ConquestGame, sa = "s1", sb = "s2"): void {
  const s = g.s;
  const a = lifeOfSeat(s, sa)!;
  const b = lifeOfSeat(s, sb)!;
  const ca = meOf(s, a)!;
  const npc = Number(
    Object.keys(s.chars).find(
      (k) => Number(k) !== a.c && Number(k) !== b.c && s.chars[Number(k)].alive,
    ),
  );

  // INTRIGUE (r15): a plot's lines, a secret scene and what came of it, the
  // marks they leave, a private letter.
  a.journal.push({
    day: s.day,
    text: `${SECRET} plot line`,
    c: a.c,
    sec: true,
  });
  a.milestones.push({
    day: s.day,
    kind: "begin",
    c: a.c,
    text: `${SECRET} milestone`,
    sec: true,
  });
  a.events.push(pendingEvent(9001, "intr-warn", s.day));
  a.events.push(pendingEvent(9002, "p2p-intr-seduce", s.day));
  a.outcome = {
    n: 9001,
    kind: "event",
    key: "intr-warn",
    title: `${SECRET} outcome`,
    scene: "tavern",
    c: -1,
    ok: true,
    lines: [`${SECRET} outcome line`],
  } as Life["outcome"];
  a.cooldowns = { ...a.cooldowns, "intr:plot": s.day, "ev:intr-warn": s.day };
  a.evSeen = { ...(a.evSeen ?? {}), "intr-warn": 1 } as Life["evSeen"];
  a.post = [
    ...(a.post ?? []),
    {
      id: 9001,
      kind: "personal",
      from: b.c,
      to: a.c,
      origin: a.prov,
      dest: a.prov,
      sent: s.day,
      arrive: s.day,
      bySea: false,
      status: "delivered",
      text: `${SECRET} private letter`,
    } as unknown as NonNullable<Life["post"]>[number],
  ];
  // LABOUR (r15): a household's door opened to someone fleeing.
  a.events.push(pendingEvent(9003, "bond-door", s.day));
  a.journal.push({
    day: s.day,
    text: `${SECRET_MARK}${SECRET} sheltered at the door`,
    c: a.c,
  });
  a.cooldowns["ev:bond-door"] = s.day;
  (a.evSeen as Record<string, number>)["bond-door"] = 1;
  // POLLS (r16): the sheriff's present and the canvass's book.
  a.polls = {
    canvass: {
      kind: "local",
      id: 1,
      p: a.prov,
      poll: s.day + 60,
      since: s.day,
      rival: -1,
      weeks: [{ d: s.day, me: 41, them: 39 }],
      moved: [{ label: `${SECRET} treating`, v: 3 }],
      lastMe: { [`${SECRET}me`]: 1 },
      lastThem: { [`${SECRET}them`]: 1 },
      spent: { sheriff: 25 },
      treat: 2,
      sheriff: npc,
      patron: -1,
    },
    last: {
      day: s.day,
      kind: "local",
      title: "County clerk",
      won: true,
      me: 52,
      them: 48,
      rival: -1,
      why: [`${SECRET} why it went so`],
    },
  };
  // ECON (r17): a bond's scene and its money in the books.
  a.events.push(pendingEvent(9004, "loan-ask", s.day));
  a.books = {
    from: s.day,
    open: 10,
    lines: [{ k: "loan:1", l: `${SECRET} interest on a bond`, v: -3 }],
  };
  // CROWN (r18): a petition's marks.
  a.events.push(pendingEvent(9005, "crown:letters", s.day));
  touchLife(g, a);

  // DICE (r14): the dice under every cup, and a face read.
  s.dice = {
    tables: [
      {
        id: 1,
        prov: a.prov,
        host: a.c,
        stake: 5,
        pot: 15,
        status: "playing",
        seats: [
          {
            c: a.c,
            seat: sa,
            dice: [6, 6, 6],
            n: 3,
            state: "in",
            rounds: 1,
            paid: 5,
          },
          {
            c: b.c,
            seat: sb,
            dice: [2, 3],
            n: 2,
            state: "in",
            rounds: 1,
            paid: 5,
          },
          { c: npc, dice: [4, 4, 1], n: 3, state: "in", rounds: 1, paid: 5 },
        ],
        asked: [],
        round: 1,
        turn: 0,
        bid: null,
        by: -1,
        acts: [],
        tells: [{ n: 1, to: a.c, by: npc, text: `${SECRET} a twitch` }],
        seq: 1,
        opened: s.day,
        rng: 4242,
      },
    ],
  } as unknown as DiceState;
  diceChanged(g);

  // INTRIGUE (r15): a scheme, a kept lover, men paid to watch over someone.
  s.intrigue = {
    schemes: [
      {
        id: 1,
        kind: "plot",
        seat: sa,
        by: a.c,
        target: b.c,
        p: a.prov,
        started: s.day,
        week: 1,
        weeks: 6,
      },
    ],
    kept: [{ seat: sa, by: a.c, c: npc, since: s.day, cost: 4, owed: 0 }],
    betrothals: [],
    guards: { [a.c]: s.day + 30 },
  } as unknown as IntrigueState;
  intrigueChanged(g);

  // ECON (r17): a bond between the two players.
  s.loans = {
    list: [
      {
        id: 1,
        lender: a.c,
        borrower: b.c,
        ls: sa,
        bs: sb,
        sum: 100,
        owed: 100,
        rate: 0.06,
        arrears: 0,
        paid: 0,
        made: s.day,
        term: 12,
        due: s.day + 365,
        p: a.prov,
        status: "active",
        how: "bond",
        grace: 0,
        told: 0,
        log: [{ day: s.day, text: `${SECRET} bond drawn up` }],
      },
    ],
    next: 2,
  } as unknown as LoanState;
  loansChanged(g);

  // CROWN (r18): a colony's petition before it sails, and one refused.
  const ask = (id: number, stage: string) => ({
    id,
    n: ca.nation,
    p: a.prov,
    holder: ca.nation,
    by: a.c,
    begun: s.day,
    sails: s.day + 90,
    answer: s.day + 180,
    stage,
    men: 100,
    gold: 50,
    paid: { [sa]: 10 },
    council: [],
    house: [],
    refused: [],
    court: 0,
    asked: [sa],
    riders: [],
    why: `${SECRET} petition ${stage}`,
  });
  s.crown = {
    sailing: [],
    sent: {},
    forts: {},
    asks: [ask(1, "gathering"), ask(2, "sent")],
    past: [ask(3, "refused")],
  } as unknown as CrownState;
  crownChanged(g);

  s.rng = 987654321;
}

/** Everything in `state` a watcher must never see, as a list of what's wrong. */
export function secretsIn(state: GameState): string[] {
  const out: string[] = [];
  const json = JSON.stringify(state);
  if (json.includes(SECRET)) out.push("a secret's text");
  if (state.rng !== 0) out.push("the world's dice");
  for (const t of state.dice?.tables ?? []) {
    if (t.rng !== 0) out.push("a table's dice");
    if (t.seats.some((x) => x.dice.length > 0)) out.push("dice under a cup");
    if (t.tells.length > 0) out.push("a tell");
  }
  if (state.intrigue) {
    if (state.intrigue.schemes.length) out.push("a scheme");
    if (state.intrigue.kept.length) out.push("a kept lover");
    if (Object.keys(state.intrigue.guards).length) out.push("guards");
  }
  if (state.loans?.list.length) out.push("a bond");
  if (
    state.crown?.asks.some((x) => x.stage === "gathering" || x.stage === "sent")
  )
    out.push("a petition before it sails");
  if (state.crown?.past.some((x) => x.stage === "refused"))
    out.push("a refused petition");
  for (const l of state.lives) {
    const cv = l.polls?.canvass;
    if (cv && (cv.sheriff >= 0 || Object.keys(cv.spent).length))
      out.push("the sheriff's present");
    if (l.events.some((e) => e.id >= 9001 && e.id <= 9005))
      out.push("a secret letter");
  }
  return out;
}
