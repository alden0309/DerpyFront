// POWER (r12): the scenes of the track: a trial's five scenes for the
// defendant, the accuser and the judge; a seat offered on the council; the
// council's votes and the governor's signature; a bill for the governor's
// assent; and a newspaper's attack (sue, answer, or let it pass).

import { answerBill, billTitle } from "./Assembly";
import { seatPresents } from "./ChairRules"; // CHAIR (r16)
import { listWords } from "./ChamberCore"; // CHAMBER (r16)
import {
  acceptSeat,
  answerSeatAsk,
  councilAdvice,
  councillors,
  measureCares,
  SEAT_BY_INDEX,
  seatName,
  signMatter,
  voteMatter,
} from "./Council";
import { SEAT_PORTFOLIO } from "./CouncilTitles";
import { factionName } from "./Factions"; // CHAMBER (r16)
import type { ConquestGame } from "./Game";
import { journal } from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import { isPlayed, skillLevel } from "./LifeQueries";
import { giveUpWarning } from "./OneOffice";
import { answerLibel, answerSedition, paperById, paperOf } from "./Press";
import { charName } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import {
  counselFee,
  courtFee,
  friendsHere,
  judgeDecides,
  KIND_NAMES,
  leaning,
  sentenceOf,
  settleFee,
  trialAnswered,
  trialById,
  trialMove,
  verdictHeard,
  witnessFee,
} from "./Trials";
import type { FactionKey, Life, Trial } from "./Types";

const T = (g: ConquestGame, ctx: LCtx): Trial | undefined =>
  trialById(g.s, ctx.t);
const here = (g: ConquestGame, t: Trial | undefined) =>
  g.map.provinces[t?.p ?? 0]?.name ?? "the court-house";
const year = (g: ConquestGame) => 1607 + Math.floor(g.s.day / DAYS_PER_YEAR);

/** How the case stands, in words. */
function standing(t: Trial): string {
  const l = leaning(t);
  return l > 6
    ? "The case against looks black."
    : l > 2
      ? "The case against is strong."
      : l > -2
        ? "It could go either way."
        : l > -6
          ? "The case against is weak."
          : "The case against is close to nothing.";
}

function judgeWord(g: ConquestGame, t: Trial): string {
  const j = g.s.chars[t.judge];
  if (j?.alive)
    return `${charName(j)} presides${isPlayed(g.s, j.id) ? "" : ""}.`;
  return t.kind === "heresy"
    ? "The inquisitors sit behind a table with a green cross."
    : "The bench of justices looks down over its spectacles.";
}

function accuserWord(g: ConquestGame, t: Trial): string {
  const a = g.s.chars[t.accuser];
  return a?.alive
    ? `${charName(a)} brings the charge.`
    : "The charge is the crown's.";
}

/** A trial scene: its answer recorded, then the trial goes on. */
function move(key: string, m: string) {
  return (g: ConquestGame, life: Life, ctx: LCtx, pass: boolean) => {
    trialMove(g, life, ctx.t, m, pass);
    trialAnswered(g, life, ctx.t, key);
  };
}

const poorFor = (n: number) => (g: ConquestGame, life: Life) =>
  life.purse < n ? `Needs ${n} coins` : null;

const settleable = (t: Trial | undefined) =>
  !!t &&
  t.accuser >= 0 &&
  ["libel", "debt", "accused", "presentment"].includes(t.kind);

const trialScene = "courtroom";

const DEF_HEAD = (g: ConquestGame, life: Life, ctx: LCtx) => {
  const t = T(g, ctx);
  if (!t) return "The case is over.";
  return `The court-house at ${here(g, t)}: ${KIND_NAMES[t.kind]}. You stand charged with ${t.charge}. ${accuserWord(g, t)} ${judgeWord(g, t)}`;
};

export const TRIAL_EVENTS: LifeEventDef[] = [
  // ---------------------------------------------------------------- the defendant
  {
    key: "trial-charge",
    pool: "raised",
    cooldown: 0,
    scene: trialScene,
    title: "The charge",
    body: (g, life, ctx) => {
      const t = T(g, ctx);
      return `${DEF_HEAD(g, life, ctx)}\nThe clerk reads the indictment in a voice like a saw. ${t ? standing(t) : ""} How will you meet it?`;
    },
    choices: [
      {
        label: (g, life, ctx) =>
          `Engage counsel (${counselFee(T(g, ctx)!)} coins)`,
        tip: "A lawyer to examine the witnesses and speak for you: a better defence.",
        blocked: (g, life, ctx) => poorFor(counselFee(T(g, ctx)!))(g, life),
        apply: move("trial-charge", "counsel"),
      },
      {
        label: "Answer it yourself",
        tip: "Your own wits, and your own voice.",
        apply: move("trial-charge", "self"),
      },
      {
        label: (g, life, ctx) =>
          `Settle with your accuser (${settleFee(T(g, ctx)!)} coins)`,
        tip: "Pay them to withdraw it: the case is over.",
        blocked: (g, life, ctx) => {
          const t = T(g, ctx);
          if (!settleable(t))
            return "Only a private accuser can be settled with";
          if (isPlayed(g.s, t!.accuser))
            return "Your accuser is a player: write to them";
          return poorFor(settleFee(t!))(g, life);
        },
        apply: move("trial-charge", "settle"),
      },
      {
        label: (g, life, ctx) =>
          `Bribe the clerk to lose the papers (${witnessFee(T(g, ctx)!)})`,
        tip: "The evidence thinner if it works; worse if he talks.",
        check: {
          skill: "stealth",
          dc: (g, life, ctx) => 6 + (T(g, ctx)?.grade ?? 1),
        },
        blocked: (g, life, ctx) => poorFor(witnessFee(T(g, ctx)!))(g, life),
        apply: move("trial-charge", "clerk"),
      },
    ],
  },
  {
    key: "trial-witness",
    pool: "raised",
    cooldown: 0,
    scene: trialScene,
    title: "Witnesses and evidence",
    body: (g, life, ctx) => {
      const t = T(g, ctx);
      const a = g.s.chars[t?.accuser ?? -1];
      return `${a?.alive ? `${charName(a)}'s witnesses` : "The crown's witnesses"} are sworn one by one: what they saw, what they heard, what they're sure of. ${t ? standing(t) : ""}${t?.counsel ? " Your counsel takes notes." : ""}`;
    },
    choices: [
      {
        label: (g, life, ctx) => {
          const t = T(g, ctx);
          const n = t ? friendsHere(g.s, life, t.p) : 0;
          return n
            ? `Call your friends to speak for you (${n})`
            : "Call your friends to speak for you";
        },
        tip: "Friends and family of yours in the county swear to your good character.",
        blocked: (g, life, ctx) => {
          const t = T(g, ctx);
          return t && friendsHere(g.s, life, t.p) > 0
            ? null
            : "No friends or family in the county to speak for you";
        },
        apply: move("trial-witness", "friends"),
      },
      {
        label: "Cross-examine their witnesses",
        tip: "Catch them out: the case against is weaker if you do.",
        check: {
          skill: "letters",
          dc: (g, life, ctx) =>
            6 + (T(g, ctx)?.grade ?? 1) - (T(g, ctx)?.counsel ? 2 : 0),
        },
        apply: move("trial-witness", "cross"),
      },
      {
        label: (g, life, ctx) =>
          `Pay a witness to forget (${witnessFee(T(g, ctx)!)})`,
        tip: "Much weaker evidence if it works; perjury on top of it if it doesn't.",
        check: {
          skill: "stealth",
          dc: (g, life, ctx) => 7 + (T(g, ctx)?.grade ?? 1),
        },
        blocked: (g, life, ctx) => poorFor(witnessFee(T(g, ctx)!))(g, life),
        apply: move("trial-witness", "perjure"),
      },
      {
        label: "Say nothing",
        tip: "Let them prove it.",
        apply: move("trial-witness", "silent"),
      },
    ],
  },
  {
    key: "trial-plea",
    pool: "raised",
    cooldown: 0,
    scene: trialScene,
    title: "How do you plead?",
    body: (g, life, ctx) => {
      const t = T(g, ctx);
      if (!t) return "The case is over.";
      const full = sentenceOf(g.s, t, false).text;
      const mercy = sentenceOf(g.s, t, true).text;
      return `"How say you: guilty, or not guilty?" ${standing(t)} Found guilty, the sentence would be ${full}; ${mercy === full ? "pleading guilty would spare you nothing but the trial" : `pleading guilty, ${mercy}`}.`;
    },
    choices: [
      {
        label: "Not guilty",
        tip: "Put yourself on the country: the jury decides.",
        apply: move("trial-plea", "not"),
      },
      {
        label: "Guilty, and beg for mercy",
        tip: "No jury: a lighter sentence.",
        apply: move("trial-plea", "guilty"),
      },
      {
        label: "Plead benefit of clergy",
        tip: "Read the neck verse (Psalm 51) to show you can read: the brand on your thumb instead of the rest. Once in a life, under English law.",
        blocked: (g, life, ctx) => {
          const t = T(g, ctx);
          if (!t) return "Over";
          if (skillLevel(g.s, life, "letters") < 4)
            return "Needs letters 4: you must read the verse";
          if (life.crime?.branded) return "Only once in a life";
          if (g.s.nations[t.nation]?.culture !== "english")
            return "Only under English law";
          if (t.grade >= 4) return "Not for a hanging matter";
          return null;
        },
        apply: move("trial-plea", "clergy"),
      },
    ],
  },
  {
    key: "trial-plea-witch",
    pool: "raised",
    cooldown: 0,
    scene: trialScene,
    title: "How do you plead?",
    body: (g, life, ctx) => {
      const t = T(g, ctx);
      return `The afflicted girls shriek when you're brought in. The magistrates ask whether you have made a covenant with the Devil. ${t ? standing(t) : ""}${year(g) >= 1692 && year(g) <= 1693 ? " At Salem, those who confessed were spared the rope." : ""}`;
    },
    choices: [
      {
        label: "Deny it: not guilty",
        tip: "Stand on your innocence: the jury decides, and the rope if they're against you.",
        apply: move("trial-plea-witch", "not"),
      },
      {
        label: "Confess, and name others",
        tip: "The confessors are spared the rope: a public penance, and a name that will never be clean.",
        apply: move("trial-plea-witch", "confess"),
      },
    ],
  },
  {
    key: "trial-plea-heresy",
    pool: "raised",
    cooldown: 0,
    scene: trialScene,
    title: "Before the Holy Office",
    body: (g, life, ctx) => {
      const t = T(g, ctx);
      return `The inquisitors read the denunciation. You aren't told who made it. ${t ? standing(t) : ""} Penitence is valued here; obstinacy is not.`;
    },
    choices: [
      {
        label: "Deny everything",
        tip: "Maintain your innocence: the tribunal decides.",
        apply: move("trial-plea-heresy", "not"),
      },
      {
        label: "Abjure your errors and ask for penance",
        tip: "A public penance (renown and peace of mind), and it's over.",
        apply: move("trial-plea-heresy", "abjure"),
      },
    ],
  },
  {
    key: "trial-plea-print",
    pool: "raised",
    cooldown: 0,
    scene: trialScene,
    title: "How do you plead?",
    body: (g, life, ctx) => {
      const t = T(g, ctx);
      return `The offending sheet is read aloud to the court. ${t ? standing(t) : ""} ${year(g) >= 1735 ? "Since Zenger's case, juries have been known to find for the printer when the thing printed was true." : "The law holds that the greater the truth, the greater the libel."}`;
    },
    choices: [
      {
        label: "Not guilty",
        tip: "The jury decides.",
        apply: move("trial-plea-print", "not"),
      },
      {
        label: "Plead the truth of it",
        tip: "A printer may not be punished for printing the truth. Juries like it, more so after 1735.",
        apply: move("trial-plea-print", "truth"),
      },
      {
        label: "Guilty, and apologise",
        tip: "No jury: the lighter sentence (a fine).",
        apply: move("trial-plea-print", "guilty"),
      },
    ],
  },
  {
    key: "trial-jury",
    pool: "raised",
    cooldown: 0,
    scene: trialScene,
    title: "Before the jury",
    body: (g, life, ctx) => {
      const t = T(g, ctx);
      return `Twelve men of the county, in their best coats, look at you. ${t ? standing(t) : ""}${t && t.sympathy > 2 ? " They seem to like you." : t && t.sympathy < -2 ? " They don't seem to like you." : ""}`;
    },
    choices: [
      {
        label: "Speak to the jury yourself",
        tip: "Win them over, or lose them.",
        check: {
          skill: "persuasion",
          dc: (g, life, ctx) => 6 + (T(g, ctx)?.grade ?? 1),
        },
        apply: move("trial-jury", "speak"),
      },
      {
        label: "Let your counsel speak",
        tip: "A sure hand with a jury.",
        blocked: (g, life, ctx) =>
          T(g, ctx)?.counsel ? null : "You have no counsel",
        apply: move("trial-jury", "counselspeaks"),
      },
      {
        label: (g, life, ctx) =>
          `Buy the court (${courtFee(T(g, ctx)!)} coins)`,
        tip: "A justice with debts, a juryman with a farm to save. Found out, and it's a graver charge.",
        check: {
          skill: "persuasion",
          dc: (g, life, ctx) => 6 + (T(g, ctx)?.grade ?? 1),
        },
        blocked: (g, life, ctx) => poorFor(courtFee(T(g, ctx)!))(g, life),
        apply: move("trial-jury", "buy"),
      },
      {
        label: "Throw yourself on the mercy of the court",
        tip: "The jury softens a little; a lighter sentence if it goes against you.",
        apply: move("trial-jury", "mercy"),
      },
    ],
  },
  // ---------------------------------------------------------------- the accuser
  {
    key: "trial-lay",
    pool: "raised",
    cooldown: 0,
    scene: trialScene,
    title: "Laying the charge",
    body: (g, life, ctx) => {
      const t = T(g, ctx);
      return `At ${here(g, t)} you bring ${charName(g.s.chars[t?.defendant ?? -1])} before the court, charged with ${t?.charge ?? "it"}. ${t ? judgeWord(g, t) : ""} ${t ? standing(t) : ""}`;
    },
    choices: [
      {
        label: "Press the charge",
        tip: "Lay it out clearly: a stronger case.",
        check: { skill: "persuasion", dc: 6 },
        apply: move("trial-lay", "press"),
      },
      {
        label: (g, life, ctx) =>
          `Settle out of court (they pay ${settleFee(T(g, ctx)!)})`,
        tip: "They pay you to drop it.",
        blocked: (g, life, ctx) => {
          const t = T(g, ctx);
          if (!settleable(t)) return "Not a case that can be settled";
          if (isPlayed(g.s, t!.defendant))
            return "They're a player: let them offer";
          return null;
        },
        apply: move("trial-lay", "takesettle"),
      },
      {
        label: "Withdraw the charge",
        tip: "Drop it: a little renown lost.",
        apply: move("trial-lay", "withdraw"),
      },
    ],
  },
  {
    key: "trial-prove",
    pool: "raised",
    cooldown: 0,
    scene: trialScene,
    title: "Your witnesses",
    body: (g, life, ctx) => {
      const t = T(g, ctx);
      return `${charName(g.s.chars[t?.defendant ?? -1])}${t?.counsel ? " and their counsel" : ""} sit across the court. ${t ? standing(t) : ""}`;
    },
    choices: [
      {
        label: "Call your witnesses",
        tip: "Make the case stronger.",
        check: { skill: "persuasion", dc: 6 },
        apply: move("trial-prove", "witnesses"),
      },
      {
        label: (g, life, ctx) =>
          `Pay a witness to remember (${witnessFee(T(g, ctx)!)})`,
        tip: "Much stronger if it works; a scandal if it doesn't.",
        check: { skill: "stealth", dc: 7 },
        blocked: (g, life, ctx) => poorFor(witnessFee(T(g, ctx)!))(g, life),
        apply: move("trial-prove", "suborn"),
      },
      {
        label: "Trust to the evidence",
        tip: "Let it speak for itself.",
        apply: move("trial-prove", "trust"),
      },
    ],
  },
  {
    key: "trial-sum",
    pool: "raised",
    cooldown: 0,
    scene: trialScene,
    title: "Before the jury",
    body: (g, life, ctx) => {
      const t = T(g, ctx);
      return `The jury will go out soon. ${t ? standing(t) : ""}`;
    },
    choices: [
      {
        label: "Address the jury",
        tip: "Remind them what was done.",
        check: { skill: "persuasion", dc: 7 },
        apply: move("trial-sum", "address"),
      },
      {
        label: "Ask the court for mercy",
        tip: "A lighter verdict likelier; people think better of you.",
        apply: move("trial-sum", "askmercy"),
      },
    ],
  },
  // ---------------------------------------------------------------- the judge
  {
    key: "trial-bench",
    pool: "raised",
    cooldown: 0,
    scene: trialScene,
    title: "Judgment",
    body: (g, life, ctx) => {
      const t = T(g, ctx);
      if (!t) return "The case is over.";
      const d = g.s.chars[t.defendant];
      const l = leaning(t);
      return `You preside at ${here(g, t)} over ${KIND_NAMES[t.kind]}: ${charName(d)}, charged with ${t.charge}. ${accuserWord(g, t)}\nThe evidence ${Math.round(t.evidence)}, the defence ${Math.round(t.defence)}; the jury ${t.sympathy > 1 ? "leans toward the prisoner" : t.sympathy < -1 ? "has no love for the prisoner" : "keeps its counsel"}. Left to the jury, it would likely be ${l > 0 ? "guilty" : "not guilty"}.${t.bribe ? ` A purse of ${t.bribe} coins has found its way to your chambers.` : ""}\nThe law allows ${sentenceOf(g.s, t, false).text}, or in mercy ${sentenceOf(g.s, t, true).text}.`;
    },
    choices: [
      {
        label: (g, life, ctx) =>
          `Guilty: ${T(g, ctx) ? sentenceOf(g.s, T(g, ctx)!, false).text : "the full sentence"}`,
        tip: "Sum up for a conviction and the full sentence.",
        apply: (g, life, ctx) => {
          judgeDecides(g, life, ctx.t, "convict");
          trialAnswered(g, life, ctx.t, "trial-bench");
        },
      },
      {
        label: (g, life, ctx) =>
          `Guilty, in mercy: ${T(g, ctx) ? sentenceOf(g.s, T(g, ctx)!, true).text : "a lighter sentence"}`,
        tip: "A conviction, and mercy in the sentence.",
        apply: (g, life, ctx) => {
          judgeDecides(g, life, ctx.t, "lighter");
          trialAnswered(g, life, ctx.t, "trial-bench");
        },
      },
      {
        label: "Direct an acquittal",
        tip: "The prisoner goes free. If the town thinks them guilty, it'll grumble.",
        apply: (g, life, ctx) => {
          judgeDecides(g, life, ctx.t, "acquit");
          trialAnswered(g, life, ctx.t, "trial-bench");
        },
      },
      {
        label: "Leave it to the jury",
        tip: "Let the twelve decide, as the law intends.",
        apply: (g, life, ctx) => {
          judgeDecides(g, life, ctx.t, "jury");
          trialAnswered(g, life, ctx.t, "trial-bench");
        },
      },
      {
        label: (g, life, ctx) =>
          `Take the money (${T(g, ctx)?.bribe ?? 0} coins) and acquit`,
        tip: "Coins in your pocket. A scandal if it comes out.",
        blocked: (g, life, ctx) =>
          T(g, ctx)?.bribe ? null : "Nobody has offered you anything",
        apply: (g, life, ctx) => {
          judgeDecides(g, life, ctx.t, "bribe");
          trialAnswered(g, life, ctx.t, "trial-bench");
        },
      },
    ],
  },
  // ---------------------------------------------------------------- the verdict
  {
    key: "trial-end",
    pool: "raised",
    cooldown: 0,
    scene: trialScene,
    title: "The verdict",
    body: (g, life, ctx) => {
      const t = T(g, ctx);
      if (!t) return "The case is over.";
      const d = g.s.chars[t.defendant];
      const you = t.defendant === life.c;
      const guilty = t.verdict === "guilty";
      const head = you
        ? guilty
          ? `The foreman stands. "Guilty." The sentence: ${t.sentence}.`
          : `The foreman stands. "Not guilty." You're discharged.`
        : guilty
          ? `${charName(d)} is found guilty of ${t.charge}. The sentence: ${t.sentence}.`
          : `${charName(d)} is acquitted of ${t.charge}.`;
      // The clerk's minutes, less the charge (first) and the verdict (last).
      const record = t.lines.slice(1, -1).slice(-4);
      return `${head}${record.length ? `\nFrom the court's record: ${record.join(" ")}` : ""}`;
    },
    choices: [
      {
        label: (g, life, ctx) => {
          const t = T(g, ctx);
          if (t && t.defendant === life.c && t.verdict === "guilty")
            return /hang|secular/.test(t.sentence ?? "")
              ? "Go to the gallows"
              : "Hear the sentence carried out";
          return "So be it";
        },
        tip: "The court rises.",
        apply: (g, life, ctx) => verdictHeard(g, life, ctx.t),
      },
    ],
  },
];

// ---------------------------------------------------------------- the council and the assembly

const seatOf = (ctx: LCtx) => SEAT_BY_INDEX[ctx.seat] ?? "treasurer";

/** CHAMBER (r16): "The merchants want it; the backcountry men are against it. " */
function caresWords(g: ConquestGame, n: number, key: string): string {
  const cares = measureCares(key);
  const glad: string[] = [];
  const sore: string[] = [];
  for (const [f, v] of Object.entries(cares) as [FactionKey, number][]) {
    if (f === "court" || f === "country" || !v) continue;
    (v > 0 ? glad : sore).push(factionName(g.s, n, f));
  }
  const up = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const parts: string[] = [];
  // Every faction's name is a body of people ("the merchants", "the clergy"): plural.
  if (glad.length) parts.push(`${up(listWords(glad))} want it`);
  if (sore.length)
    parts.push(
      `${parts.length ? listWords(sore) : up(listWords(sore))} are against it`,
    );
  return parts.length
    ? `${parts.join("; ")}: they'll remember your vote. `
    : "";
}

export const COUNCIL_EVENTS: LifeEventDef[] = [
  {
    key: "council-offer",
    pool: "raised",
    cooldown: 0,
    scene: "governor",
    title: "A seat on the council",
    body: (g, life, ctx) => {
      const s = g.s;
      const n = ctx.n;
      const seat = seatOf(ctx);
      const nation = s.nations[n];
      const gov = s.chars[ctx.by ?? nation?.ruler ?? -1];
      const warn = giveUpWarning(s, g.w, life.c, { kind: "council", n, seat });
      return `${charName(gov)} offers you the place of ${seatName(s, n, seat).toLowerCase()} of ${nation?.name.replace(/^the /, "") ?? "the colony"}: ${SEAT_PORTFOLIO[seat].charAt(0).toLowerCase()}${SEAT_PORTFOLIO[seat].slice(1)} It pays 5 a month, and a councillor stands next to the chair.${warn ? `\n${warn}` : ""}`;
    },
    choices: [
      {
        // CHAIR (r16): the presents his friends expect, on the button.
        label: (g, life, ctx) => {
          const gifts = seatPresents(g.s, ctx.n, seatOf(ctx));
          return gifts ? `Accept the seat (${gifts} coins)` : "Accept the seat";
        },
        tip: (g, life, ctx) =>
          seatPresents(g.s, ctx.n, seatOf(ctx))
            ? "Take your place at the council table; the governor's friends expect presents."
            : "Take your place at the council table.",
        blocked: (g, life, ctx) => {
          const gifts = seatPresents(g.s, ctx.n, seatOf(ctx));
          return gifts && life.purse < gifts
            ? `The presents his friends expect: ${gifts} coins`
            : null;
        },
        apply: (g, life, ctx) => acceptSeat(g, life, ctx.n, seatOf(ctx)),
      },
      {
        label: "Decline, with thanks",
        tip: "Keep what you have.",
        apply: (g, life, ctx) =>
          journal(
            g,
            life,
            `You decline the place of ${seatName(g.s, ctx.n, seatOf(ctx)).toLowerCase()}.`,
          ),
      },
    ],
  },
  {
    key: "council-vote",
    pool: "raised",
    cooldown: 0,
    scene: "governor",
    title: "The council sits",
    body: (g, life, ctx) => {
      const s = g.s;
      const m = s.power?.cabinets[ctx.n]?.matters.find((x) => x.id === ctx.m);
      if (!m) return "The matter has been decided.";
      const by = s.chars[m.by];
      const gov = m.by === s.nations[ctx.n]?.ruler;
      const ayes = Object.values(m.votes).filter((v) => v > 0).length;
      const noes = Object.values(m.votes).filter((v) => v < 0).length;
      // CHAMBER (r16): who brought it, and which factions care which way (they remember).
      const who = gov
        ? `The governor, ${charName(by)},`
        : councillors(s, ctx.n).some((x) => x.c === m.by)
          ? charName(by)
          : `${charName(by)}, for ${by?.home !== undefined ? (g.map.provinces[by.home]?.name ?? "the county") : "the county"},`;
      return `${who} lays ${gov ? "a measure" : "a matter"} before the council: ${m.title}. ${m.text}\n${caresWords(g, ctx.n, m.key)}So far ${ayes} for and ${noes} against. ${gov ? "Voting with the governor wins his favour; against him, the country party's." : ""}`;
    },
    choices: [
      {
        label: "Vote aye",
        tip: "For the measure.",
        apply: (g, life, ctx) => void voteMatter(g, life, ctx.n, ctx.m, 1),
      },
      {
        label: "Vote no",
        tip: "Against the measure.",
        apply: (g, life, ctx) => void voteMatter(g, life, ctx.n, ctx.m, -1),
      },
      {
        label: "Abstain",
        tip: "Keep out of it.",
        apply: (g, life, ctx) => void voteMatter(g, life, ctx.n, ctx.m, 0),
      },
    ],
  },
  {
    key: "council-assent",
    pool: "raised",
    cooldown: 0,
    scene: "governor",
    title: "For your signature",
    body: (g, life, ctx) => {
      const s = g.s;
      const m = s.power?.cabinets[ctx.n]?.matters.find((x) => x.id === ctx.m);
      if (!m) return "The matter has been settled.";
      const advice = councilAdvice(s, ctx.n, m.key, m.by);
      return `The council has carried a measure brought by ${charName(s.chars[m.by])}: ${m.title}. ${m.text}\nThe council: ${advice.ayes} for, ${advice.noes} against. It wants your signature.`;
    },
    choices: [
      {
        label: "Sign it",
        tip: "It's done.",
        apply: (g, life, ctx) => void signMatter(g, life, ctx.n, ctx.m, true),
      },
      {
        label: "Refuse to sign",
        tip: "It lapses; its mover loses your favour.",
        apply: (g, life, ctx) => void signMatter(g, life, ctx.n, ctx.m, false),
      },
    ],
  },
  {
    key: "council-asked",
    pool: "raised",
    cooldown: 0,
    scene: "governor",
    title: "A request for a seat",
    body: (g, life, ctx) => {
      const s = g.s;
      const c = s.chars[ctx.c];
      const seat = seatOf(ctx);
      const holder = councillors(s, ctx.n).find((x) => x.seat === seat);
      return `${charName(c)} asks for the place of ${seatName(s, ctx.n, seat).toLowerCase()}.${holder ? ` ${charName(s.chars[holder.c])} holds it now, and would be put out.` : " It stands empty."}`;
    },
    choices: [
      {
        label: "Appoint them",
        tip: "Give them the seat.",
        apply: (g, life, ctx) =>
          answerSeatAsk(g, life, ctx.c, seatOf(ctx), true),
      },
      {
        label: "Refuse",
        tip: "No place for them.",
        apply: (g, life, ctx) =>
          answerSeatAsk(g, life, ctx.c, seatOf(ctx), false),
      },
    ],
  },
  {
    key: "bill-assent",
    pool: "raised",
    cooldown: 0,
    scene: "governor",
    title: "A bill for your assent",
    body: (g, life, ctx) => {
      const s = g.s;
      const b = s.power?.cabinets[ctx.n]?.bills.find((x) => x.id === ctx.b);
      if (!b) return "The bill has been settled.";
      return `The house has passed ${billTitle(g, b).charAt(0).toLowerCase()}${billTitle(g, b).slice(1)}, ${b.ayes} to ${b.noes}, brought in by ${charName(s.chars[b.by])}. It wants your assent to become law (if you say nothing in three weeks, custom takes it as given).`;
    },
    choices: [
      {
        label: "Assent: let it be law",
        tip: "It becomes law; the house is pleased.",
        apply: (g, life, ctx) => void answerBill(g, ctx.n, ctx.b, true),
      },
      {
        label: "Veto it",
        tip: "It dies; the country party is angry.",
        apply: (g, life, ctx) => void answerBill(g, ctx.n, ctx.b, false),
      },
    ],
  },
  // ---------------------------------------------------------------- the press
  {
    key: "press-libelled",
    pool: "raised",
    cooldown: 0,
    scene: "press",
    title: "In print",
    body: (g, life, ctx) => {
      const x = paperById(g.s, ctx.p);
      const last = x?.printed
        .filter((p) => p.on === "c" && p.id === life.c)
        .slice(-1)[0];
      return `${x?.name ?? "A paper"} has printed "${last?.head ?? "a piece about you"}". Everyone you meet has read it, or says they haven't.`;
    },
    choices: [
      {
        label: "Sue its printer for libel",
        tip: "A trial, with you as the accuser.",
        apply: (g, life, ctx) => answerLibel(g, life, ctx.p, "sue"),
      },
      {
        label: "Answer it in your own paper",
        tip: "A piece for yourself, at once.",
        blocked: (g, life) =>
          paperOf(g.s, life.c) ? null : "You have no paper",
        apply: (g, life, ctx) => answerLibel(g, life, ctx.p, "print"),
      },
      {
        label: "Let it pass",
        tip: "Most people forget.",
        apply: (g, life, ctx) => answerLibel(g, life, ctx.p, "ignore"),
      },
    ],
  },
  {
    key: "press-seditious",
    pool: "raised",
    cooldown: 0,
    scene: "press",
    title: "Sedition in print?",
    body: (g, life, ctx) => {
      const x = paperById(g.s, ctx.p);
      const last = x?.printed.slice(-1)[0];
      return `${x?.name ?? "A paper"} has printed "${last?.head ?? "a piece against your government"}". Your secretary brings it to you with a face like a funeral.`;
    },
    choices: [
      {
        label: "Prosecute the printer",
        tip: "A trial for seditious libel.",
        apply: (g, life, ctx) => answerSedition(g, life, ctx.p, "prosecute"),
      },
      {
        label: "Shut the paper",
        tip: "By order, for a year: the colony grumbles.",
        apply: (g, life, ctx) => answerSedition(g, life, ctx.p, "shut"),
      },
      {
        label: "Let it pass",
        tip: "A governor who can bear criticism.",
        apply: (g, life, ctx) => answerSedition(g, life, ctx.p, "pass"),
      },
    ],
  },
];

export const POWER_EVENTS: LifeEventDef[] = [
  ...TRIAL_EVENTS,
  ...COUNCIL_EVENTS,
];

/** The quiet course each scene takes if it's left unanswered (a choice's index). */
export const POWER_DEFAULTS: Record<string, number> = {
  "trial-charge": 1,
  "trial-witness": 3,
  "trial-plea": 0,
  "trial-plea-witch": 0,
  "trial-plea-heresy": 0,
  "trial-plea-print": 0,
  "trial-jury": 3,
  "trial-lay": 0,
  "trial-prove": 2,
  "trial-sum": 1,
  "trial-bench": 3,
  "trial-end": 0,
  "council-offer": 1,
  "council-vote": 2,
  "council-assent": 0,
  "council-asked": 1,
  "bill-assent": 0,
  "press-libelled": 2,
  "press-seditious": 2,
};
