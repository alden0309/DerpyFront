// ECON (r17): the scenes of bonds, leave and a venture for home. They're
// raised, never drawn, and each is about what someone really did: a lender
// who offered or called in, a borrower who asked or can't pay, a master's
// letter when your leave is up. Another player only ever appears as what
// they did themselves. Left unanswered, each takes a quiet course that
// spends nothing and decides nothing in anyone else's name.

import { formatDate } from "./Calendar";
import { goodsName } from "./Company";
import { registerFamily } from "./EventPacing";
import type { ConquestGame } from "./Game";
import { answerLeave, askMore, leaveOdds } from "./Leave";
import { journal } from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import { lifeOfChar } from "./LifeQueries";
import {
  graceSpent,
  LOAN_MORE,
  loansOf,
  monthInterest,
  owedNow,
  rateWords,
} from "./LoanCore";
import {
  answerOffer,
  answerTime,
  askTime,
  bondTerms,
  callIn,
  cantPay,
  courtFor,
  forgive,
  kindWorth,
  moreTime,
  repay,
  repayOdds,
  sue,
  suitOdds,
  takeInKind,
  timeChance,
} from "./Loans";
import { chanceWords } from "./Odds";
import { charName } from "./Queries";
import { seaOf } from "./SeaCore";
import type { GameState, Life, Loan } from "./Types";
import { backOddsWords, backVentures, buyVentureBack } from "./VentureBack";

const r1 = (v: number) => Math.round(v * 10) / 10;

const loanOf = (g: ConquestGame, ctx: LCtx): Loan | undefined =>
  loansOf(g.s).find((l) => l.id === ctx.l);
const nm = (s: GameState, c: number) => charName(s.chars[c]);
const he = (s: GameState, c: number) => (s.chars[c]?.female ? "she" : "he");
const him = (s: GameState, c: number) => (s.chars[c]?.female ? "her" : "him");

/** A choice blocked once its bond is settled, or not in the state it's about. */
const unless =
  (ok: (l: Loan) => boolean) =>
  (g: ConquestGame, _life: Life, ctx: LCtx): string | null => {
    const l = loanOf(g, ctx);
    return !l || l.status === "closed"
      ? "It's settled"
      : ok(l)
        ? null
        : "Not now";
  };

/** Report a command's refusal in the journal (a scene can't show an error). */
const said = (g: ConquestGame, life: Life, err: string | null) => {
  if (err) journal(g, life, err, "bad");
};

// ---------------------------------------------------------------- bonds

const LOAN_SCENES: LifeEventDef[] = [
  {
    key: "loan-offer",
    pool: "raised",
    cooldown: 0,
    scene: "letter",
    title: (g, _l, ctx) => `${nm(g.s, ctx.c)} offers you a loan`,
    body: (g, _life, ctx) => {
      const l = loanOf(g, ctx);
      if (!l) return "The offer has lapsed.";
      return `${nm(g.s, l.lender)} offers to lend you ${r1(l.sum)} coins on ${bondTerms(l)}: interest of ${monthInterest(l)} a month, and the sum repaid at its day (or before, whenever you like).`;
    },
    choices: [
      {
        label: "Take it",
        tip: "The money's yours now; the bond is in your ledger, with its interest a month and its day.",
        blocked: unless((l) => l.status === "offered"),
        apply: (g, life, ctx) =>
          said(g, life, answerOffer(g, life, ctx.l, true)),
      },
      {
        label: "Thank them, and decline",
        tip: "Nothing changes.",
        apply: (g, life, ctx) => {
          const l = loanOf(g, ctx);
          if (l?.status === "offered")
            said(g, life, answerOffer(g, life, ctx.l, false));
        },
      },
    ],
  },
  {
    key: "loan-ask",
    pool: "raised",
    cooldown: 0,
    scene: "letter",
    title: (g, _l, ctx) => `${nm(g.s, ctx.c)} asks for a loan`,
    body: (g, _life, ctx) => {
      const l = loanOf(g, ctx);
      if (!l) return "The request has lapsed.";
      return `${nm(g.s, l.borrower)} asks you to lend ${him(g.s, l.borrower)} ${r1(l.sum)} coins on ${bondTerms(l)}. You'd have ${monthInterest(l)} a month in interest, and the sum at its day; ${he(g.s, l.borrower)} may repay sooner.`;
    },
    choices: [
      {
        label: (g, _life, ctx) =>
          `Lend it (${r1(loanOf(g, ctx)?.sum ?? 0)} coins)`,
        tip: "The bond goes in your ledger: call it in when it falls due, or let it run on at interest.",
        blocked: (g, life, ctx) => {
          const l = loanOf(g, ctx);
          if (!l || l.status !== "offered") return "It's settled";
          return life.purse < l.sum ? `Needs ${r1(l.sum)} coins` : null;
        },
        apply: (g, life, ctx) =>
          said(g, life, answerOffer(g, life, ctx.l, true)),
      },
      {
        label: "Decline",
        tip: "Nothing changes between you, but they'll know you wouldn't.",
        apply: (g, life, ctx) => {
          const l = loanOf(g, ctx);
          if (l?.status === "offered")
            said(g, life, answerOffer(g, life, ctx.l, false));
        },
      },
    ],
  },
  {
    key: "loan-due",
    pool: "raised",
    cooldown: 0,
    scene: "letter",
    title: "Your bond falls due",
    body: (g, _life, ctx) => {
      const l = loanOf(g, ctx);
      if (!l) return "It's settled.";
      const lender = lifeOfChar(g.s, l.lender);
      return `${lender ? "A reminder in your ledger" : `A civil note from ${nm(g.s, l.lender)}`}: your bond for ${r1(l.sum)} coins falls due on ${formatDate(l.due)}, and ${r1(owedNow(l))} will be owed. ${lender ? `${nm(g.s, l.lender)} may call it in then, or let it run on at interest.` : `"I trust you will be ready."`}`;
    },
    choices: [
      {
        label: (g, _life, ctx) =>
          `Repay it now (${r1(owedNow(loanOf(g, ctx) ?? { owed: 0, arrears: 0 }))} coins)`,
        tip: "Clear of it, before its day: the lender thinks the better of you.",
        blocked: (g, life, ctx) => {
          const l = loanOf(g, ctx);
          if (!l || l.status === "closed") return "It's settled";
          return life.purse < owedNow(l)
            ? `Needs ${r1(owedNow(l))} coins`
            : null;
        },
        apply: (g, life, ctx) => said(g, life, repay(g, life, ctx.l)),
      },
      {
        label: (g, _life, ctx) => {
          const l = loanOf(g, ctx);
          const p = l && !lifeOfChar(g.s, l.lender) ? timeChance(g.s, l) : null;
          return `Ask for ${LOAN_MORE[0]} months more${p !== null ? ` (likely ${chanceWords(p)})` : ""}`;
        },
        tip: "The lender decides: by what they think of you, and how often they've put it off before.",
        blocked: (g, _life, ctx) => {
          const l = loanOf(g, ctx);
          if (!l || l.status === "closed") return "It's settled";
          return l.ask !== undefined ? "Not now" : graceSpent(l);
        },
        apply: (g, life, ctx) =>
          said(g, life, askTime(g, life, ctx.l, LOAN_MORE[0])),
      },
      {
        label: "It will be ready",
        tip: "Nothing now: find the money by its day.",
        apply: () => {},
      },
    ],
  },
  {
    key: "loan-falls",
    pool: "raised",
    cooldown: 0,
    scene: "letter",
    title: (g, _l, ctx) => `${nm(g.s, ctx.c)}'s bond has fallen due`,
    body: (g, _life, ctx) => {
      const l = loanOf(g, ctx);
      if (!l) return "It's settled.";
      const npcB = !lifeOfChar(g.s, l.borrower);
      const o = npcB ? repayOdds(g.s, l) : null;
      return `${nm(g.s, l.borrower)}'s bond for ${r1(l.sum)} coins has fallen due: ${r1(owedNow(l))} owed. Call it in now, or let it run on at interest (${rateWords(l.rate)}) and call it in when you like.${o ? ` Called in, ${he(g.s, l.borrower)}'d likely pay ${chanceWords(o.pay)}, ask for time ${chanceWords(o.time)}, or be unable to ${chanceWords(o.cannot)}.` : ""}`;
    },
    choices: [
      {
        label: "Call it in",
        tip: "They pay, ask for more time, or can't (and then it's yours to forgive, take in kind, or sue for).",
        blocked: unless((l) => ["due", "running", "time"].includes(l.status)),
        apply: (g, life, ctx) => {
          const l = loanOf(g, ctx);
          if (l) said(g, life, callIn(g, life, l));
        },
      },
      {
        label: "Let it run on at interest",
        tip: "Nothing now: Estate › Ledger has Call it in whenever you want it.",
        apply: () => {},
      },
    ],
  },
  {
    key: "loan-called",
    pool: "raised",
    cooldown: 0,
    scene: "letter",
    title: (g, _l, ctx) => `${nm(g.s, ctx.c)} calls in your bond`,
    body: (g, _life, ctx) => {
      const l = loanOf(g, ctx);
      if (!l) return "It's settled.";
      const lender = lifeOfChar(g.s, l.lender);
      return `${nm(g.s, l.lender)} calls in your bond: ${r1(owedNow(l))} coins${l.arrears ? `, ${r1(l.arrears)} of it interest in arrears` : ""}. ${lender ? "" : `"I must ask you to settle it."`}`;
    },
    choices: [
      {
        label: (g, _life, ctx) =>
          `Pay it (${r1(owedNow(loanOf(g, ctx) ?? { owed: 0, arrears: 0 }))} coins)`,
        tip: "Clear of it.",
        blocked: (g, life, ctx) => {
          const l = loanOf(g, ctx);
          if (!l || l.status === "closed") return "It's settled";
          return life.purse < owedNow(l)
            ? `Needs ${r1(owedNow(l))} coins`
            : null;
        },
        apply: (g, life, ctx) => said(g, life, repay(g, life, ctx.l)),
      },
      {
        label: "Say you can't pay",
        tip: (g, _life, ctx) => {
          const l = loanOf(g, ctx);
          return l && lifeOfChar(g.s, l.lender)
            ? "The lender decides: forgive it, take goods you carry in kind, sue, or give you time."
            : "The lender decides: more time if they think well of you, goods you carry in kind, or a suit for debt.";
        },
        blocked: unless((l) => ["called", "due", "time"].includes(l.status)),
        apply: (g, life, ctx) => said(g, life, cantPay(g, life, ctx.l)),
      },
      {
        label: (g, _life, ctx) => {
          const l = loanOf(g, ctx);
          const p = l && !lifeOfChar(g.s, l.lender) ? timeChance(g.s, l) : null;
          return `Ask for ${LOAN_MORE[0]} months more${p !== null ? ` (likely ${chanceWords(p)})` : ""}`;
        },
        tip: "The lender decides.",
        blocked: (g, _life, ctx) => {
          const l = loanOf(g, ctx);
          if (!l || l.status === "closed") return "It's settled";
          return l.ask !== undefined ? "Not now" : graceSpent(l);
        },
        apply: (g, life, ctx) =>
          said(g, life, askTime(g, life, ctx.l, LOAN_MORE[0])),
      },
    ],
  },
  {
    key: "loan-time",
    pool: "raised",
    cooldown: 0,
    scene: "letter",
    title: (g, _l, ctx) => `${nm(g.s, ctx.c)} asks for more time`,
    body: (g, _life, ctx) => {
      const l = loanOf(g, ctx);
      if (!l) return "It's settled.";
      return `${nm(g.s, l.borrower)} asks for ${ctx.m} months more to pay the bond (${r1(owedNow(l))} coins). The interest runs on meanwhile.`;
    },
    choices: [
      {
        label: (_g, _life, ctx) => `Give ${ctx.m} months more`,
        tip: "They think the better of you; the bond runs on at interest.",
        blocked: (g, _life, ctx) => {
          const l = loanOf(g, ctx);
          if (!l || l.status === "closed") return "It's settled";
          return (l.ask ?? 0) > 0 ? graceSpent(l) : "Not now";
        },
        apply: (g, life, ctx) =>
          said(g, life, answerTime(g, life, ctx.l, true)),
      },
      {
        label: "Refuse",
        tip: "They must pay now, or say they can't.",
        blocked: unless((l) => (l.ask ?? 0) > 0),
        apply: (g, life, ctx) =>
          said(g, life, answerTime(g, life, ctx.l, false)),
      },
    ],
  },
  {
    key: "loan-default",
    pool: "raised",
    cooldown: 0,
    scene: "letter",
    title: (g, _l, ctx) => `${nm(g.s, ctx.c)} can't pay`,
    body: (g, _life, ctx) => {
      const l = loanOf(g, ctx);
      if (!l) return "It's settled.";
      return `${nm(g.s, l.borrower)} can't pay the bond: ${r1(owedNow(l))} coins. It's yours to decide: more time, forgive it, take something in kind, or sue for it at the court-house.`;
    },
    choices: [
      {
        label: `Give ${LOAN_MORE[0]} months more`,
        tip: "The bond runs on at interest, and they think the better of you.",
        blocked: (g, _life, ctx) => {
          const l = loanOf(g, ctx);
          if (!l || l.status === "closed") return "It's settled";
          return l.status === "default" ? graceSpent(l) : "Not now";
        },
        apply: (g, life, ctx) =>
          said(g, life, moreTime(g, life, ctx.l, LOAN_MORE[0])),
      },
      {
        label: "Forgive the debt",
        tip: "It's gone, and they won't forget it (+30).",
        blocked: unless((l) => l.status === "default"),
        apply: (g, life, ctx) => said(g, life, forgive(g, life, ctx.l)),
      },
      {
        label: (g, _life, ctx) => {
          const l = loanOf(g, ctx);
          return `Take it in kind (≈ ${l ? kindWorth(g.s, g.w, l) : 0})`;
        },
        tip: "Goods to the value, at less than they'd fetch: the bond is cancelled (or what's left stands). They resent it.",
        blocked: (g, _life, ctx) => {
          const l = loanOf(g, ctx);
          if (!l || l.status !== "default") return "It's settled";
          return kindWorth(g.s, g.w, l) <= 0.5 ? "Nothing worth taking" : null;
        },
        apply: (g, life, ctx) => said(g, life, takeInKind(g, life, ctx.l)),
      },
      {
        label: (g, _life, ctx) => {
          const l = loanOf(g, ctx);
          return `Sue for it${l ? ` (likely ${chanceWords(suitOdds(g.s, l))})` : ""}`;
        },
        tip: "A suit for debt at the court-house: judgment for what they have, the rest stands; they resent it bitterly.",
        blocked: (g, _life, ctx) => {
          const l = loanOf(g, ctx);
          if (!l || l.status !== "default") return "It's settled";
          return courtFor(g.s, l) < 0
            ? "No court of a crown where they live"
            : null;
        },
        apply: (g, life, ctx) => said(g, life, sue(g, life, ctx.l)),
      },
    ],
  },
];

// ---------------------------------------------------------------- leave

const LEAVE_SCENES: LifeEventDef[] = [
  {
    key: "leave-ask",
    pool: "raised",
    cooldown: 0,
    scene: "letter",
    title: (g, _l, ctx) => `${nm(g.s, ctx.c)} asks for leave`,
    body: (g, _life, ctx) =>
      `${nm(g.s, ctx.c)} asks for ${ctx.d} days' leave from ${g.s.chars[ctx.c]?.female ? "her" : "his"} place with you. On leave they're paid nothing, and aren't counted as away.`,
    choices: [
      {
        label: "Give the leave",
        tip: "They're back by its last day, or overstay it.",
        apply: (g, life, ctx) =>
          said(g, life, answerLeave(g, life, ctx.c, true)),
      },
      {
        label: "Refuse",
        tip: "They may go anyway, and be away from their post.",
        apply: (g, life, ctx) => {
          const other = lifeOfChar(g.s, ctx.c);
          if (other?.leave?.asked)
            said(g, life, answerLeave(g, life, ctx.c, false));
        },
      },
    ],
  },
  {
    key: "leave-over",
    pool: "raised",
    cooldown: 0,
    scene: "letter",
    title: "Your leave is up",
    body: (g, _life, ctx) =>
      `A letter from ${nm(g.s, ctx.c)}: "Your leave was up a week ago, and your place stands empty. I'll hold it a fortnight more, and not a day longer."`,
    choices: [
      {
        label: "Hurry back",
        tip: "Be at your post within the fortnight.",
        apply: () => {},
      },
      {
        label: (g, life) => {
          const o = leaveOdds(g.s, life, 14, "job");
          return `Write asking a fortnight more (likely ${chanceWords(Math.max(0.03, o.p - 0.25))})`;
        },
        tip: "By what they think of you, less for having overstayed already.",
        apply: (g, life) => said(g, life, askMore(g, life, 14)),
      },
    ],
  },
];

// ---------------------------------------------------------------- a venture for home

const voyageOf = (g: ConquestGame, ctx: LCtx) =>
  seaOf(g.s).voyages.find((v) => v.id === ctx.v);

function ventureChoice(i: number): LifeEventDef["choices"][number] {
  const option = (g: ConquestGame, life: Life, ctx: LCtx) => {
    const v = voyageOf(g, ctx);
    return v ? backVentures(g.s, g.w, life, v)[i] : undefined;
  };
  return {
    label: (g, life, ctx) => {
      const o = option(g, life, ctx);
      // An empty slot has no label, and the scene leaves it out.
      return o
        ? `${goodsName(o.item)}, ${o.loads} load${o.loads === 1 ? "" : "s"} (${r1(o.cost)} coins)`
        : "";
    },
    tip: (g, life, ctx) => {
      const o = option(g, life, ctx);
      return o ? backOddsWords(o) : "";
    },
    blocked: (g, life, ctx) => {
      const o = option(g, life, ctx);
      if (!o) return "Nothing more that pays";
      return life.purse < o.cost ? `Needs ${r1(o.cost)} coins` : null;
    },
    apply: (g, life, ctx) => {
      const o = option(g, life, ctx);
      if (o) said(g, life, buyVentureBack(g, life, ctx.v, o.item));
    },
  };
}

const VENTURE_SCENES: LifeEventDef[] = [
  {
    key: "econ-venture",
    pool: "raised",
    cooldown: 0,
    scene: "docks",
    title: "A venture for home",
    body: (g, life, ctx) => {
      const v = voyageOf(g, ctx);
      if (!v) return "She's sailed.";
      const far = g.map.provinces[v.to]?.name ?? "the far port";
      const home = g.map.provinces[v.from]?.name ?? "home";
      // EVENTS (r21): plainer ("a sailor's privilege runs both ways" didn't say what it was).
      return `The ${v.ship} is loading at ${far} for home, and sails ${formatDate(v.sails)}. As one of her crew you may carry a little cargo of your own in her hold: buy it here at ${far}'s market, and sell it at ${home} when she's in. You have ${Math.floor(life.purse)} coins.`;
    },
    choices: [
      ventureChoice(0),
      ventureChoice(1),
      ventureChoice(2),
      {
        label: "Bring nothing home",
        tip: "Keep your money in your pocket.",
        apply: () => {},
      },
    ],
  },
];

// ---------------------------------------------------------------- registering

let paced = false;

/** ECON's scenes (LifeEvents adds them the first time it looks one up). */
export function econEvents(): LifeEventDef[] {
  if (!paced) {
    paced = true;
    registerFamily(
      "bonds",
      LOAN_SCENES.map((d) => d.key),
      30,
    );
    registerFamily(
      "leave",
      LEAVE_SCENES.map((d) => d.key),
      30,
    );
    registerFamily("venture", ["econ-venture"], 30);
  }
  return [...LOAN_SCENES, ...LEAVE_SCENES, ...VENTURE_SCENES];
}

/** The quiet course each scene takes if it's left unanswered (a choice's index). */
export function econQuiet(): Record<string, number> {
  return {
    "loan-offer": 1,
    "loan-ask": 1,
    "loan-due": 2,
    "loan-falls": 1,
    // Pay it if you can; if not, you couldn't.
    "loan-called": 0,
    "loan-time": 0,
    "loan-default": 0,
    "leave-ask": 1,
    "leave-over": 0,
    "econ-venture": 3,
  };
}
