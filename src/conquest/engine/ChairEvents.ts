// CHAIR (r16): the scenes of the road to the governor's chair. Each is
// raised by the round (Chair.ts) for a player who has a real choice to
// make: the crown's offer of the lieutenancy, a petition against you as
// governor (and the petitioner's answer if you offer peace), another
// player's petition wanting your name, your commission running out, the
// house's address against you, a division on an address, and the capital's
// fall. None of them puts words in another player's mouth: each names only
// what someone really did.

import { formatDate } from "./Calendar";
import {
  answerAddress,
  answerLt,
  answerPeace,
  answerPetition,
  answerSign,
  followGovernment,
  voteAddress,
} from "./Chair";
import {
  ADDRESS,
  addressAnswerOdds,
  chairOf,
  followCost,
  infirmity,
  LT,
  PETITION,
  recallOdds,
  renewOdds,
} from "./ChairCore";
import type { ConquestGame } from "./Game";
import { withFlow } from "./LedgerCore";
import { journal, spend } from "./LifeCore";
import type { LifeEventDef } from "./LifeEvents";
import { isPlayed } from "./LifeQueries";
import { chanceWords } from "./Odds";
import { charName } from "./Queries";
import type { Life } from "./Types";

const nameOf = (g: ConquestGame, c: number) => charName(g.s.chars[c]);
const short = (g: ConquestGame, n: number) =>
  g.s.nations[n]?.name.replace(/^the /, "") ?? "the colony";
const govOf = (g: ConquestGame, n: number) =>
  g.s.chars[g.s.nations[n]?.ruler ?? -1];
const pctWords = (p: number) => `${chanceWords(p)} (${Math.round(p * 100)}%)`;

/** A reckoning's parts, in a line: "favour +12, unrest +5, his letters −20". */
function partsLine(parts: { label: string; value: number }[]): string {
  return parts
    .filter((p) => p.value !== 0)
    .map(
      (p) =>
        `${p.label} ${p.value > 0 ? "+" : "−"}${Math.round(Math.abs(p.value) * 100)}`,
    )
    .join("; ");
}

function pay(g: ConquestGame, life: Life, n: number, label: string): void {
  withFlow(g, { key: "chair:petition", label }, () => spend(g, life, n));
}

const CHAIR_EVENTS: LifeEventDef[] = [
  {
    key: "chair-lt",
    pool: "raised",
    cooldown: 0,
    scene: "governor",
    title: "The lieutenancy",
    body: (g, life, ctx) => {
      const gov = govOf(g, ctx.n);
      const ill =
        infirmity(g.s, g.w, gov, chairOf(g.s, ctx.n)) ?? "not what he was";
      return `${charName(gov)} is ${ill}, and the Board of Trade wants a lieutenant governor of ${short(g, ctx.n)} who can take the chair at need. It offers you the crown's commission: you would act as governor in his absence (and draw his pay while you do), and succeed him if the chair falls empty. The fees are ${LT.fees} a month, and it is no bar to the seat you hold.`;
    },
    choices: [
      {
        label: "Accept the commission",
        tip: "Lieutenant governor: you act in his absence and succeed him.",
        apply: (g, life, ctx) => answerLt(g, life, ctx.n, true),
      },
      {
        label: "Decline it, with thanks",
        tip: "It goes to one of the council. Not offered again for two years.",
        apply: (g, life, ctx) => answerLt(g, life, ctx.n, false),
      },
    ],
  },
  {
    key: "chair-petition",
    pool: "raised",
    cooldown: 0,
    scene: "governor",
    title: "A petition against you",
    body: (g, life, ctx) => {
      const pet = chairOf(g.s, ctx.n)?.petition;
      if (!pet) return "The petition is no more.";
      const o = recallOdds(g.s, ctx.n, pet, pet.by);
      return `${nameOf(g, pet.by)} has retained an agent in London and is getting up a petition to the crown for your recall. It sails on ${formatDate(pet.sails)}, and the answer should come about ${formatDate(pet.answer)}.\nAs it stands the crown would recall you ${pctWords(o.total)}: ${partsLine(o.parts)}. The names ${pet.names.length ? `on it so far: ${pet.names.length}` : "aren't on it yet"}.`;
    },
    choices: [
      {
        label: "Let your record speak for itself",
        tip: "Do nothing: the crown judges on what it hears.",
        apply: (g, life) =>
          journal(g, life, "You let the petition take its course."),
      },
      {
        label: `Answer it with letters of your own to London (${PETITION.answerCost} coins)`,
        tip: `Letters: landed, they take ${Math.round(PETITION.answerPass * 100)} off its chance in a hundred; otherwise ${Math.round(PETITION.answerFail * 100)}.`,
        check: { skill: "letters", dc: PETITION.answerDc },
        blocked: (g, life) =>
          life.purse < PETITION.answerCost
            ? `You have only ${Math.floor(life.purse)} coins`
            : null,
        apply: (g, life, ctx, pass) => {
          pay(g, life, PETITION.answerCost, "Letters answering a petition");
          answerPetition(g, life, ctx.n, "letters", pass);
        },
      },
      {
        label: (g, life, ctx) => {
          const pet = chairOf(g.s, ctx.n)?.petition;
          return `Send for ${pet ? nameOf(g, pet.by) : "them"} and make your peace`;
        },
        tip: "Persuasion: won round, they drop it.",
        check: { skill: "persuasion", dc: 9 },
        blocked: (g, life, ctx) => {
          const pet = chairOf(g.s, ctx.n)?.petition;
          return !pet
            ? "It's gone"
            : isPlayed(g.s, pet.by)
              ? "Another player: write to them instead"
              : null;
        },
        apply: (g, life, ctx, pass) =>
          answerPetition(g, life, ctx.n, "peace", pass),
      },
      {
        label: (g, life, ctx) => {
          const pet = chairOf(g.s, ctx.n)?.petition;
          return `Write to ${pet ? nameOf(g, pet.by) : "them"}, offering to make peace`;
        },
        tip: "They decide whether to drop it.",
        blocked: (g, life, ctx) => {
          const pet = chairOf(g.s, ctx.n)?.petition;
          return !pet
            ? "It's gone"
            : !isPlayed(g.s, pet.by)
              ? "Send for them instead"
              : null;
        },
        apply: (g, life, ctx) => answerPetition(g, life, ctx.n, "ask", true),
      },
    ],
  },
  {
    key: "chair-peace",
    pool: "raised",
    cooldown: 0,
    scene: "letter",
    title: "The governor would make peace",
    body: (g, life, ctx) =>
      `${nameOf(g, ctx.c)} writes, offering to make peace if you let your petition for ${govOf(g, ctx.n)?.female ? "her" : "his"} recall drop.`,
    choices: [
      {
        label: "Press on with the petition",
        tip: "It goes on to London.",
        apply: (g, life, ctx) => answerPeace(g, life, ctx.n, false),
      },
      {
        label: "Let it drop, and take the governor's hand",
        tip: "The petition ends; your agent keeps his fee.",
        apply: (g, life, ctx) => answerPeace(g, life, ctx.n, true),
      },
    ],
  },
  {
    key: "chair-sign",
    pool: "raised",
    cooldown: 0,
    scene: "governor",
    title: "A petition against the governor",
    body: (g, life, ctx) => {
      const pet = chairOf(g.s, ctx.n)?.petition;
      const gov = govOf(g, ctx.n);
      if (!pet) return "The petition is no more.";
      return `${nameOf(g, pet.by)} is getting up a petition to the crown for ${charName(gov)}'s recall, and asks for your name to it (${pet.names.length} so far). A councillor's name counts for ${Math.round(0.06 * 100)} in a hundred of its chance, a member's ${Math.round(0.03 * 100)}. If the governor hears of it, he won't forget.`;
    },
    choices: [
      {
        label: "Keep your name off it",
        tip: "Stay out of it.",
        apply: (g, life, ctx) => answerSign(g, life, ctx.n, false),
      },
      {
        label: "Put your name to it",
        tip: "Its chance rises; the governor will know.",
        apply: (g, life, ctx) => answerSign(g, life, ctx.n, true),
      },
    ],
  },
  {
    key: "chair-term",
    pool: "raised",
    cooldown: 0,
    scene: "governor",
    title: "Your commission runs out",
    body: (g, life, ctx) => {
      const ch = chairOf(g.s, ctx.n);
      if (!ch) return "Your commission is settled.";
      const o = renewOdds(g.s, ctx.n);
      return `Your commission as governor of ${short(g, ctx.n)} runs out on ${formatDate(ch.ends)}. Then the crown renews it for a few years more, or names your successor.\nAs things stand it would renew it ${pctWords(o.total)}: ${partsLine(o.parts)}.`;
    },
    choices: [
      {
        label: "Make ready to hand over",
        tip: "Let the crown decide on your record.",
        apply: (g, life) =>
          journal(
            g,
            life,
            "You put your papers in order for whoever comes after.",
          ),
      },
      {
        label: "Ask the crown for another term (2 coins)",
        tip: "Letters: landed, +15 in a hundred to its chance; otherwise +5.",
        check: { skill: "letters", dc: 8 },
        blocked: (g, life) =>
          life.purse < 2 ? "You have nothing for the postage" : null,
        apply: (g, life, ctx, pass) => {
          pay(g, life, 2, "Letters asking for another term");
          const ch = chairOf(g.s, ctx.n);
          if (!ch) return;
          g.nation(ctx.n);
          ch.renewAsk = Math.max(ch.renewAsk ?? 0, pass ? 0.15 : 0.05);
          journal(
            g,
            life,
            pass
              ? "Your letters land well at the Board of Trade: they'll weigh another term for you."
              : "Your letters go off to London. They may be read.",
            pass ? "good" : undefined,
          );
        },
      },
    ],
  },
  {
    key: "chair-address",
    pool: "raised",
    cooldown: 0,
    scene: "governor",
    title: "The house's address",
    body: (g, life, ctx) => {
      const a = chairOf(g.s, ctx.n)?.address;
      if (!a || a.stage !== "carried") return "The house's address is settled.";
      return `The house has carried ${nameOf(g, a.by)}'s address against you, ${a.ayes} to ${a.noes}: ${[a.salary ? "your salary withheld" : "", a.supply ? `supply refused (the colony's revenue down ${Math.round(-ADDRESS.supply.tax * 100)} in a hundred, its militia unpaid, and London blaming you)` : ""].filter(Boolean).join(", and ")}, until ${formatDate(a.until)}. The crown has heard of it.`;
    },
    choices: [
      {
        label: "Hold out",
        tip: "It stands until its year is out.",
        apply: (g, life, ctx) => answerAddress(g, ctx.n, "hold"),
      },
      {
        label: "Give way to the house",
        tip: "The taxes come down a step; your salary and supply are voted again. London thinks you weak (favour −3 for a year).",
        apply: (g, life, ctx) => answerAddress(g, ctx.n, "yield"),
      },
      {
        label: "Dissolve the house",
        tip: "A new election within the month; the address dies with the house. Unrest +2.",
        blocked: (g, life, ctx) => {
          const pol = g.s.polities[ctx.n];
          return !pol || pol.election - g.s.day <= 40
            ? "The election is upon you already"
            : null;
        },
        apply: (g, life, ctx) => answerAddress(g, ctx.n, "dissolve"),
      },
    ],
  },
  {
    key: "chair-address-vote",
    pool: "raised",
    cooldown: 0,
    scene: "governor",
    title: "An address against the governor",
    body: (g, life, ctx) => {
      const a = chairOf(g.s, ctx.n)?.address;
      if (!a || a.stage !== "moved") return "The house has divided.";
      const o = addressAnswerOdds(g.s, ctx.n);
      return `${nameOf(g, a.by)} has moved an address against ${charName(govOf(g, ctx.n))}: ${[a.salary ? "his salary withheld" : "", a.supply ? "supply refused" : ""].filter(Boolean).join(" and ")}. The house divides on ${formatDate(a.divide)}.${isPlayed(g.s, govOf(g, ctx.n)?.id ?? -1) ? "" : ` Carried, the governor would likely ${o.yield >= o.hold && o.yield >= o.dissolve ? "give way" : o.dissolve >= o.hold ? "dissolve the house" : "hold out"}.`}`;
    },
    choices: [
      {
        label: "Keep out of the division",
        tip: "Abstain.",
        apply: (g, life, ctx) => voteAddress(g, life, ctx.n, 0),
      },
      {
        label: "Vote for the address",
        tip: "Aye.",
        apply: (g, life, ctx) => voteAddress(g, life, ctx.n, 1),
      },
      {
        label: "Vote against it",
        tip: "No.",
        apply: (g, life, ctx) => voteAddress(g, life, ctx.n, -1),
      },
    ],
  },
  {
    key: "chair-capital",
    pool: "raised",
    cooldown: 0,
    scene: "governor",
    title: "The government moves",
    body: (g, life, ctx) => {
      const to = g.map.provinces[ctx.to]?.name ?? "the new capital";
      const from = g.map.provinces[ctx.from]?.name ?? "the old capital";
      return `${from} is lost. The governor, the council and the house have gone to ${to}, and the colony's business with them. Your household can follow the government there (a cart for the goods and passage for the family), or stay where it is.`;
    },
    choices: [
      {
        label: "Stay where you are",
        tip: "Your household stays put.",
        apply: (g, life) =>
          journal(g, life, "Your household stays where it is."),
      },
      {
        label: (g, life, ctx) =>
          `Follow the government to ${g.map.provinces[ctx.to]?.name ?? "the new capital"} (${followCost(g.s, life)} coins)`,
        tip: "You travel there, and your household moves in when you arrive.",
        blocked: (g, life) =>
          life.purse < followCost(g.s, life)
            ? "You can't pay for the move"
            : null,
        apply: (g, life) => {
          const err = followGovernment(g, life);
          if (err) journal(g, life, err, "bad");
        },
      },
    ],
  },
];

/** The scenes, for LifeEvents' lookup (added the first time it looks). */
export function chairEvents(): LifeEventDef[] {
  return CHAIR_EVENTS;
}

/** The quiet course each scene takes if it's left unanswered (a choice's index). */
export function chairQuiet(): Record<string, number> {
  return {
    "chair-lt": 1,
    "chair-petition": 0,
    "chair-peace": 0,
    "chair-sign": 0,
    "chair-term": 0,
    "chair-address": 0,
    "chair-address-vote": 0,
    "chair-capital": 0,
  };
}
