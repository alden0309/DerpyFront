// CHAMBER (r16): the assembly's yearly session. Each spring (1 April) the
// house sits on the year's great question: a bill of supply, an address of
// grievances, the King's instruction for a fixed salary, bills of credit,
// petitions from the backcountry, a rate for the clergy, a disputed
// election, the Indian trade, men and money for the crown's war, roads and
// ferries. Every player in the house or on the council (the upper house) is
// asked where they stand, in a scene with three real choices and the
// chance to stand aside; a speech brings members over (the odds on the
// button). A month on (1 May) the house divides: its members vote by their
// party and interest, with the members the players' speeches brought over,
// and what carries is done. The factions remember who spoke for what.
//
// The house's levers against the governor (supply refused, his salary
// withheld, an address against him) are the governor's track's to carry
// out, through `hooks.houseLever`; with nobody listening, the session does
// what the house always could.

import { BILLS } from "./Assembly";
import { dateOf, dayOf, formatDate } from "./Calendar";
import { cdice, inHouse, lifeOfC, onCouncil, playedC } from "./ChamberCore";
import { ensureCabinet, neighboursOf, relate } from "./Council";
import {
  factionName,
  factionsOf,
  frontierProv,
  markFaction,
  partyOf,
} from "./Factions";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { addRenown, journal, remembers, touchLife } from "./LifeCore";
import { skillLevel } from "./LifeQueries";
import { ELECTION_YEARS } from "./Politics";
import { powerChanged } from "./PowerCore";
import { charName, provincesOf, settlers } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { rumour } from "./Rumours";
import { hash01 } from "./SocietyCore";
import type {
  FactionKey,
  GameState,
  HouseSession,
  Life,
  MapDef,
  ModFx,
} from "./Types";

type G = { s: GameState; map: MapDef };
const Y = DAYS_PER_YEAR;

/** The house sits on 1 April and divides on 1 May. */
export const SESSION_MONTH = 3;
export const SESSION_DAYS = 30;
/** The last few questions aren't asked again (if there's another). */
const SESSION_MEMORY = 3;

export interface SessionChoice {
  /** "Vote the supply as he asks". */
  label: string;
  /** Short, for the journal and the factions: "the supply as asked". */
  short: string;
  /** What it does if the house carries it. */
  tip: string;
  /** How each faction's members lean toward it. */
  lean: Partial<Record<FactionKey, number>>;
  /** How the factions remember a player who speaks for it. */
  marks: Partial<Record<FactionKey, number>>;
  /** The house carries it: what's done, in a line. `by`: the players who spoke for it. */
  carry: (g: ConquestGame, n: number, arg: number, by: number[]) => string;
}

export interface Question {
  key: string;
  title: (g: G, n: number, arg: number) => string;
  /** This year's question if it can be: its argument (or -1), else null. */
  when: (g: G, n: number) => number | null;
  weight: (g: G, n: number) => number;
  body: (g: G, n: number, arg: number) => string;
  choices: [SessionChoice, SessionChoice, SessionChoice];
}

// ---------------------------------------------------------------- helpers

const colonyMod = (
  g: ConquestGame,
  n: number,
  key: string,
  label: string,
  days: number,
  fx: Partial<Record<ModFx, number>>,
) => {
  const x = g.nation(n);
  x.mods = x.mods.filter((m) => m.key !== key);
  x.mods.push({ key, label, until: g.s.day + Math.round(days), fx });
};

const countyMod = (
  g: ConquestGame,
  p: number,
  key: string,
  label: string,
  days: number,
  fx: Partial<Record<ModFx, number>>,
) => {
  const pr = g.prov(p);
  pr.mods = pr.mods.filter((m) => m.key !== key);
  pr.mods.push({ key, label, until: g.s.day + Math.round(days), fx });
};

const atWarAny = (s: GameState, n: number) =>
  s.wars.some((w) => w.a === n || w.b === n);

/** The crown's enemy in a war from Europe, or -1. */
function crownEnemy(s: GameState, n: number): number {
  const w = s.wars.find(
    (x) =>
      x.europe &&
      (x.a === n || x.b === n) &&
      s.nations[x.a === n ? x.b : x.a]?.kind === "power",
  );
  return w ? (w.a === n ? w.b : w.a) : -1;
}

const pay = (g: ConquestGame, n: number, gold: number): boolean => {
  if (g.s.nations[n].gold < gold) return false;
  g.nation(n).gold -= gold;
  return true;
};

/** The governor (the computer's) remembers the players who stood against him. */
function govRemembers(
  g: ConquestGame,
  n: number,
  by: number[],
  why: string,
  v: number,
): void {
  const gov = g.s.chars[g.s.nations[n].ruler];
  if (!gov?.alive || playedC(g.s, gov.id)) return;
  for (const c of by) {
    const life = lifeOfC(g.s, c);
    if (life) remembers(g, life, gov, why, v, 2);
  }
}

/** The house's levers: the governor's track carries them out; failing that, the house's old ways. */
function lever(
  g: ConquestGame,
  n: number,
  kind: "supply" | "salary" | "address",
  by: number[],
): boolean {
  for (const h of hooks.houseLever) if (h(g, n, kind, by)) return true;
  return false;
}

/** The two members a disputed return is between: one of each party (the computer's). */
function disputed(s: GameState, n: number): [number, number] | null {
  const members = (s.polities[n]?.assembly ?? [])
    .filter((c) => s.chars[c]?.alive && !playedC(s, c))
    .sort((a, b) => a - b);
  const court = members.find((c) => partyOf(s, n, c) === "court");
  const country = members.find((c) => partyOf(s, n, c) === "country");
  return court !== undefined && country !== undefined ? [court, country] : null;
}

const nameC = (s: GameState, c: number) => charName(s.chars[c]);

/** The county a frontier petition comes from: the most settled on the frontier. */
function frontierCounty(s: GameState, n: number): number {
  const f = provincesOf(s, n)
    .filter((p) => frontierProv(s, p))
    .sort(
      (a, b) => settlers(s.provinces[b]) - settlers(s.provinces[a]) || a - b,
    );
  return f[0] ?? -1;
}

const nativesNear = (g: G, n: number) =>
  neighboursOf(g, n).filter((o) => g.s.nations[o].kind === "native");

// ---------------------------------------------------------------- the questions

export const QUESTIONS: Question[] = [
  {
    key: "supply",
    title: () => "A bill of supply",
    when: () => -1,
    weight: (g, n) => (atWarAny(g.s, n) ? 4 : 2),
    body: (g, n) => {
      const enemy = crownEnemy(g.s, n);
      return `The governor's speech from the chair asks the house for ${supplyOf(g.s, n)} for the forts and the militia${enemy >= 0 ? `, and for the colony's part in the war against ${g.s.nations[enemy].name}` : ""}. The country members want to know who will spend it; the court party wants to know why anyone would ask.`;
    },
    choices: [
      {
        label: "Vote the supply as he asks",
        short: "the supply as the governor asked",
        tip: "The treasury +the sum asked, and steadier militia for a year. The court party is pleased; the country party isn't.",
        lean: { court: 2, frontier: 1, planters: -1, country: -1 },
        marks: { court: 5, frontier: 2, country: -3 },
        carry: (g, n) => {
          const sum = supplyOf(g.s, n);
          g.nation(n).gold += sum;
          colonyMod(g, n, "session:supply", "The house's supply", Y, {
            morale: 0.03,
          });
          return `The house votes the governor his ${sum}. He thanks it in a speech nobody listens to; the forts get their powder.`;
        },
      },
      {
        label: "Vote it, with the house's own commissioners to spend it",
        short: "the house's own commissioners for the supply",
        tip: "The treasury gets seven-tenths of it, the colony more say in its own affairs (+2) for two years. The country party and the merchants approve.",
        lean: { country: 1, merchants: 1, planters: 1 },
        marks: { country: 3, merchants: 2, court: -1 },
        carry: (g, n) => {
          const sum = Math.round(supplyOf(g.s, n) * 0.7);
          g.nation(n).gold += sum;
          colonyMod(
            g,
            n,
            "session:commissioners",
            "The house's commissioners",
            2 * Y,
            {
              autonomy: 2,
            },
          );
          return `The house votes ${sum}, to be spent by its own commissioners. The governor's secretary is heard to say something about republicans.`;
        },
      },
      {
        label: "Refuse supply until the grievances are redressed",
        short: "refusing supply",
        tip: "No supply this year: the governor's hand is weakened and he won't forget who did it. The country party's finest hour; the court party's worst.",
        lean: { country: 2, planters: 1, court: -3 },
        marks: { country: 6, planters: 1, court: -6 },
        carry: (g, n, arg, by) => {
          govRemembers(g, n, by, "Refused me supply", -8);
          if (!lever(g, n, "supply", by))
            colonyMod(g, n, "session:nosupply", "Supply refused", Y, {
              tax: -0.08,
            });
          return "The house refuses supply. The forts will go without powder until the governor goes without his pride.";
        },
      },
    ],
  },
  {
    key: "grievances",
    title: () => "An address of grievances",
    when: () => -1,
    weight: (g, n) => {
      const provs = provincesOf(g.s, n);
      const unrest =
        provs.reduce((m, p) => m + g.s.provinces[p].unrest, 0) /
        Math.max(1, provs.length);
      return 1 + (unrest > 25 ? 1.5 : 0) + (g.s.nations[n].tax >= 2 ? 1 : 0);
    },
    body: () =>
      "The country members have drawn up an address: the fees of the secretary's office, the quitrents, the sheriffs the governor names, and his friends in every place of profit. It wants a mover, and the house wants to know who'll sign it.",
    choices: [
      {
        label: "Sign it and carry it to the governor",
        short: "the address of grievances",
        tip: "The counties pleased (unrest −1 for a year) and a little renown for those who carried it; the governor less so.",
        lean: { country: 2, court: -3 },
        marks: { country: 6, court: -5 },
        carry: (g, n, arg, by) => {
          govRemembers(g, n, by, "Carried the house's grievances to me", -5);
          if (!lever(g, n, "address", by))
            colonyMod(g, n, "session:address", "The house heard", Y, {
              unrest: -1,
            });
          for (const c of by) {
            const life = lifeOfC(g.s, c);
            if (life) addRenown(g, life, 2);
          }
          return "The house carries its address to the governor's door, two by two, in its best coats.";
        },
      },
      {
        label: "Soften it into a humble petition",
        short: "a humble petition in place of the address",
        tip: "Half the grievances, none of the offence: unrest −1 for half a year. Nobody's enemy, nobody's hero.",
        lean: { planters: 1, clergy: 1, court: 0.5, country: 0.5 },
        marks: { court: 1, country: 1, planters: 1 },
        carry: (g, n) => {
          colonyMod(
            g,
            n,
            "session:petition",
            "A humble petition granted",
            Y / 2,
            {
              unrest: -1,
            },
          );
          return "The address becomes a humble petition, so humble the governor can grant two-thirds of it without noticing.";
        },
      },
      {
        label: "Speak against it",
        short: "laying the address on the table",
        tip: "The address is shelved. The court party remembers who did it; so does the country party.",
        lean: { court: 2, merchants: 0.5 },
        marks: { court: 5, country: -5 },
        carry: () =>
          "The address is laid on the table, which is the house's way of putting it in a drawer.",
      },
    ],
  },
  {
    key: "salary",
    title: () => "His Majesty's instruction: a fixed salary for the governor",
    when: (g, n) => {
      const cab = g.s.power?.cabinets[n];
      return (cab?.unpaid ?? 0) > g.s.day ? null : -1;
    },
    weight: () => 0.8,
    body: () =>
      "The governor lays before the house the King's instruction: a fixed salary, settled for his whole time in the chair, so he needn't come to the house every year with his hat in his hand. The house rather likes his hat in his hand.",
    choices: [
      {
        label: "Settle it for his whole term",
        short: "the governor's fixed salary",
        tip: "The crown's favour +5 for three years, and the governor grateful. The country party will call it a surrender.",
        lean: { court: 3, country: -3 },
        marks: { court: 8, country: -6 },
        carry: (g, n, arg, by) => {
          colonyMod(g, n, "session:salary", "A salary settled", 3 * Y, {
            favor: 5,
          });
          govRemembers(g, n, by, "Settled my salary", 8);
          return "The house settles the salary. The governor is so moved he dines the whole house, and London writes to say it expected nothing less.";
        },
      },
      {
        label: "Vote him a present for this year, as the house always has",
        short: "a present for the year, as the house always has",
        tip: "The old way: paid this year, asked again next. The crown's favour −2 for a year.",
        lean: { country: 1, planters: 1, merchants: 1, court: -1 },
        marks: { country: 3, court: -2 },
        carry: (g, n) => {
          colonyMod(g, n, "session:present", "No salary settled", Y, {
            favor: -2,
          });
          return "The house votes the governor a handsome present for the year, and not a penny for the next. Everyone understands everyone perfectly.";
        },
      },
      {
        label: "Refuse it, and withhold his salary until he learns",
        short: "withholding the governor's salary",
        tip: "The governor goes unpaid for a year: the house's oldest weapon. He won't forget it.",
        lean: { country: 2, court: -3 },
        marks: { country: 6, court: -8 },
        carry: (g, n, arg, by) => {
          govRemembers(g, n, by, "Stopped my salary", -10);
          if (!lever(g, n, "salary", by)) {
            const bill = BILLS.salary;
            const dummy = {
              id: -1,
              key: "salary",
              title: bill.title,
              by: by[0] ?? -1,
              p: -1,
              day: g.s.day,
              stage: "law" as const,
              until: g.s.day,
              ayes: 0,
              noes: 0,
            };
            bill.apply(g, n, dummy);
          }
          return "The house refuses the instruction, and the salary with it. The governor dines alone, on credit.";
        },
      },
    ],
  },
  {
    key: "currency",
    title: () => "Bills of credit",
    when: () => -1,
    weight: (g, n) => (g.s.nations[n].gold < 25 ? 2 : 1),
    body: () =>
      "The planters want paper money to pay their debts in; the merchants who hold their debts want it in silver. The treasury wants anything at all.",
    choices: [
      {
        label: "Emit 25 in bills of credit",
        short: "an emission of bills of credit",
        tip: "25 into the treasury; taxes −4% and the crown's favour −3 for three years as the bills sink. The planters cheer; the merchants count their losses.",
        lean: { planters: 2, frontier: 1, merchants: -3 },
        marks: { planters: 5, frontier: 2, merchants: -5 },
        carry: (g, n) => {
          g.nation(n).gold += 25;
          colonyMod(g, n, "session:bills", "Bills of credit", 3 * Y, {
            tax: -0.04,
            favor: -3,
          });
          return "The bills are printed, signed and spent before the ink is dry. The Board of Trade's letter takes longer.";
        },
      },
      {
        label: "A small emission, with a sinking fund",
        short: "a small emission with a sinking fund",
        tip: "10 into the treasury, and a tax to sink it in five years; the crown's favour −1 for two years.",
        lean: { planters: 1, merchants: 0.5, court: 1 },
        marks: { planters: 2, merchants: 1 },
        carry: (g, n) => {
          g.nation(n).gold += 10;
          colonyMod(g, n, "session:sinking", "A sinking fund", 2 * Y, {
            favor: -1,
          });
          return "Ten in bills, with a tax to sink them in five years. Neither side is pleased, which the clerk says is the sign of good law.";
        },
      },
      {
        label: "Hard money only",
        short: "hard money",
        tip: "No paper: the colony's credit sound in London (trade +1% for two years), and the planters paying their debts in tobacco.",
        lean: { merchants: 2, court: 0.5, planters: -2 },
        marks: { merchants: 5, planters: -4 },
        carry: (g, n) => {
          colonyMod(g, n, "session:hard", "Credit sound in London", 2 * Y, {
            production: 0.01,
          });
          return "No paper. The merchants' credit is good in London; the planters pay their debts in tobacco, and their tempers in kind.";
        },
      },
    ],
  },
  {
    key: "frontier",
    title: (g, n, p) =>
      `Petitions from ${g.map.provinces[p]?.name ?? "the backcountry"} and the frontier counties`,
    when: (g, n) => {
      const p = frontierCounty(g.s, n);
      return p >= 0 ? p : null;
    },
    weight: (g, n) => (atWarAny(g.s, n) ? 2.5 : 1),
    body: (g, n, p) =>
      `Petitions from ${g.map.provinces[p]?.name ?? "the backcountry"} and the frontier counties: rangers against raiders, a fort on the river, and a word with the governor about the Indian traders who sell the raiders their powder.`,
    choices: [
      {
        label: "Vote rangers and a fort (14 from the treasury)",
        short: "rangers and a fort for the frontier",
        tip: "The frontier county's unrest −3 and its people steadier for two years, if the treasury has 14. The backcountry men remember it.",
        lean: { frontier: 3, merchants: -1 },
        marks: { frontier: 6, merchants: -2 },
        carry: (g, n, p) => {
          if (!pay(g, n, 14))
            return "The house votes rangers and a fort, and the treasurer reports that the house has voted nothing, since there's nothing to vote it from.";
          countyMod(g, p, "session:rangers", "Rangers and a fort", 2 * Y, {
            unrest: -3,
            morale: 0.05,
          });
          return "The house votes rangers for the frontier: forty men, forty horses and one good map between them.";
        },
      },
      {
        label: "Treat with the nations instead (6 from the treasury)",
        short: "a treaty with the nations instead of rangers",
        tip: "Presents and a treaty: the native nations next door +5 toward the colony. The backcountry men say it's paying the raiders.",
        lean: { clergy: 2, merchants: 1, frontier: -2 },
        marks: { clergy: 3, merchants: 2, frontier: -4 },
        carry: (g, n) => {
          if (!pay(g, n, 6))
            return "The house votes presents for the nations, and finds the treasury can't buy them. A letter is sent instead.";
          for (const o of nativesNear(g, n))
            relate(g, o, n, "The house's presents", 5, 3);
          return "The house votes presents and a treaty. The backcountry men say the presents will come back at them as powder and ball.";
        },
      },
      {
        label: "Refer it to the council",
        short: "referring the frontier's petitions to the council",
        tip: "Nothing done. The backcountry remembers.",
        lean: { court: 1, planters: 1 },
        marks: { frontier: -4, court: 1 },
        carry: (g, n, p) => {
          countyMod(g, p, "session:referred", "Our petitions referred", Y, {
            unrest: 1,
          });
          return "The petitions are referred to the council, where petitions go to grow old.";
        },
      },
    ],
  },
  {
    key: "church",
    title: () => "An act for the better support of the clergy",
    when: (g, n) => (g.s.nations[n].culture === "english" ? -1 : null),
    weight: () => 0.8,
    body: (g, n) =>
      g.s.nations[n].religion === "puritan"
        ? "A rate on every town for its minister's salary, paid in corn and firewood, and the town meeting to choose him. The Baptists and the Quakers ask why they should pay for a pulpit they don't sit under."
        : "A rate on every tithable for the ministers' salaries, paid in the colony's staple, and the vestries to choose the ministers (or the bishop's commissary, depending who's asked). The dissenters ask why they should pay for a pulpit they don't sit under.",
    choices: [
      {
        label: "For it: every parish its minister",
        short: "the clergy's rate",
        tip: "Every parish its minister: unrest −1 for three years, taxes −2% (the rate). The clergy are grateful; the dissenters aren't.",
        lean: { clergy: 3, court: 1, country: -1 },
        marks: { clergy: 6, country: -2 },
        carry: (g, n) => {
          colonyMod(
            g,
            n,
            "session:clergy",
            "Every parish its minister",
            3 * Y,
            {
              unrest: -1,
              tax: -0.02,
            },
          );
          return "Every parish its minister, and every minister his salary, paid in the staple at a rate the ministers think low and the parishes high.";
        },
      },
      {
        label: "Pass it, with the dissenters exempted",
        short: "the clergy's rate with the dissenters let off",
        tip: "The same, without the quarrel: unrest −1 for two years.",
        lean: { clergy: 1, country: 1, merchants: 1 },
        marks: { clergy: 2, country: 2 },
        carry: (g, n) => {
          colonyMod(
            g,
            n,
            "session:clergy",
            "The clergy paid, dissenters let off",
            2 * Y,
            {
              unrest: -1,
            },
          );
          return "The act passes with the dissenters let off. The Quakers thank the house in plain speech; the commissary in a very long letter.";
        },
      },
      {
        label: "Against it: let the parishes pay their own",
        short: "letting the parishes pay their own ministers",
        tip: "Nothing done. The clergy remember it from every pulpit.",
        lean: { country: 2, planters: 1, clergy: -3 },
        marks: { country: 3, planters: 2, clergy: -6 },
        carry: () =>
          "The bill is thrown out. Next Sunday's sermons, across the colony, are on the subject of ingratitude.",
      },
    ],
  },
  {
    key: "election",
    title: (g, n) => {
      const d = disputed(g.s, n);
      const p = d ? (g.s.chars[d[0]]?.home ?? -1) : -1;
      return `A disputed return${p >= 0 ? ` from ${g.map.provinces[p]?.name}` : ""}`;
    },
    when: (g, n) => {
      const pol = g.s.polities[n];
      if (!pol || !disputed(g.s, n)) return null;
      // The first session after an election: the returns are still warm.
      return pol.election - g.s.day > (ELECTION_YEARS - 1) * Y ? -1 : null;
    },
    weight: () => 1.2,
    body: (g, n) => {
      const d = disputed(g.s, n);
      if (!d) return "The committee of privileges has nothing before it.";
      return `The committee of privileges hears the election at ${g.map.provinces[g.s.chars[d[0]]?.home ?? -1]?.name ?? "the county"}: ${nameC(g.s, d[0])} of the court party against ${nameC(g.s, d[1])} of the country party, with treating on one side, a sheriff's thumb on the scale on the other, and a great many affidavits about rum.`;
    },
    choices: [
      {
        label: "Seat the court party's man",
        short: "seating the court party's man",
        tip: "He keeps the seat and owes you; the other side remembers.",
        lean: { court: 2, country: -2 },
        marks: { court: 4, country: -4 },
        carry: (g, n, arg, by) => {
          const d = disputed(g.s, n);
          if (!d) return "";
          for (const c of by) {
            const life = lifeOfC(g.s, c);
            if (life) {
              remembers(g, life, g.char(d[0]), "Kept me my seat", 10, 4);
              remembers(
                g,
                life,
                g.char(d[1]),
                "Voted me out of my seat",
                -10,
                4,
              );
            }
          }
          return `${nameC(g.s, d[0])} keeps the seat, and the committee's report is printed with all the rum left in.`;
        },
      },
      {
        label: "Seat the country party's man",
        short: "seating the country party's man",
        tip: "He keeps the seat and owes you; the other side remembers.",
        lean: { country: 2, court: -2 },
        marks: { country: 4, court: -4 },
        carry: (g, n, arg, by) => {
          const d = disputed(g.s, n);
          if (!d) return "";
          for (const c of by) {
            const life = lifeOfC(g.s, c);
            if (life) {
              remembers(g, life, g.char(d[1]), "Kept me my seat", 10, 4);
              remembers(
                g,
                life,
                g.char(d[0]),
                "Voted me out of my seat",
                -10,
                4,
              );
            }
          }
          return `${nameC(g.s, d[1])} keeps the seat. The sheriff is censured, and goes home to count his affidavits.`;
        },
      },
      {
        label: "Void it, and send the county to the poll again",
        short: "a new poll for the disputed county",
        tip: "Neither man's friend, and nobody's enemy: a little renown for fairness.",
        lean: { planters: 1, clergy: 1, merchants: 1 },
        marks: { clergy: 2, planters: 1, merchants: 1 },
        carry: (g, n, arg, by) => {
          for (const c of by) {
            const life = lifeOfC(g.s, c);
            if (life) addRenown(g, life, 2);
          }
          return "The return is voided and the county goes to the poll again. Both candidates order more rum.";
        },
      },
    ],
  },
  {
    key: "indiantrade",
    title: () => "An act to regulate the Indian trade",
    when: (g, n) => (nativesNear(g, n).length ? -1 : null),
    weight: () => 0.9,
    body: () =>
      "After the last troubles, a bill to license the traders, fix fair weights and keep rum out of the villages. The traders say it'll ruin them; the frontier says the traders ruined it first.",
    choices: [
      {
        label: "Pass it: licensed traders and fair weights",
        short: "licensing the Indian traders",
        tip: "The native nations next door +4 toward the colony for three years; the colony's trade −1% for two.",
        lean: { clergy: 2, frontier: 1, merchants: -2 },
        marks: { clergy: 4, frontier: 2, merchants: -4 },
        carry: (g, n) => {
          for (const o of nativesNear(g, n))
            relate(g, o, n, "Fair weights and no rum", 4, 3);
          colonyMod(
            g,
            n,
            "session:trade-act",
            "The Indian trade licensed",
            2 * Y,
            {
              production: -0.01,
            },
          );
          return "The traders are licensed and their weights sealed. The sachems are pleased; the traders find out how many ways a sealed weight can still be wrong.";
        },
      },
      {
        label: "Give the trade to a company",
        short: "a company for the Indian trade",
        tip: "6 into the treasury for the charter; the nations next door −2 toward the colony (a monopoly's prices).",
        lean: { merchants: 2, court: 1, frontier: -1 },
        marks: { merchants: 3, court: 2, frontier: -2 },
        carry: (g, n) => {
          g.nation(n).gold += 6;
          for (const o of nativesNear(g, n))
            relate(g, o, n, "A company's prices", -2, 3);
          return "The Indian trade goes to a company with a charter, a seal and a warehouse. Its prices go up the river faster than its goods.";
        },
      },
      {
        label: "Leave the trade alone",
        short: "leaving the Indian trade alone",
        tip: "Nothing done.",
        lean: { merchants: 1, country: 1 },
        marks: { merchants: 2 },
        carry: () => "The bill dies in committee, of natural causes.",
      },
    ],
  },
  {
    key: "war",
    title: (g, n, o) =>
      `Men and money for the King's expedition against ${g.s.nations[o]?.name ?? "the enemy"}`,
    when: (g, n) => {
      const o = crownEnemy(g.s, n);
      return o >= 0 ? o : null;
    },
    weight: () => 4,
    body: (g, n, o) =>
      `The crown asks the colony for men and money for an expedition against ${g.s.nations[o]?.name ?? "the enemy"}: ships from England, soldiers from the colonies, and glory for whoever comes back.`,
    choices: [
      {
        label: "Vote men and money (15 from the treasury)",
        short: "men and money for the King's expedition",
        tip: "The crown's favour +6 and steadier militia for two years, if the treasury has 15.",
        lean: { court: 3, frontier: 1, planters: -1 },
        marks: { court: 6, frontier: 2, country: -2 },
        carry: (g, n) => {
          if (!pay(g, n, 15))
            return "The house votes men and money, and sends the men. The money will follow, it says, when there is some.";
          colonyMod(
            g,
            n,
            "session:expedition",
            "Men and money for the King",
            2 * Y,
            {
              favor: 6,
              morale: 0.05,
            },
          );
          return "The colony's companies march to the transports with the house's blessing and the treasury's last shilling.";
        },
      },
      {
        label: "Money, but no men (8 from the treasury)",
        short: "money but no men for the expedition",
        tip: "The crown's favour +2 for two years.",
        lean: { merchants: 1, planters: 1, court: 0.5 },
        marks: { merchants: 2, planters: 2, court: 1 },
        carry: (g, n) => {
          if (!pay(g, n, 8))
            return "The house votes money, and finds there isn't any. It sends its compliments instead.";
          colonyMod(g, n, "session:money", "Money for the King", 2 * Y, {
            favor: 2,
          });
          return "The house sends money and its compliments. The crown would rather have had the men.";
        },
      },
      {
        label: "Neither: the colony has its own frontier to keep",
        short: "keeping the colony's men at home",
        tip: "The crown's favour −5 for two years. The backcountry approves.",
        lean: { country: 2, frontier: 1, court: -2 },
        marks: { country: 4, frontier: 2, court: -5 },
        carry: (g, n) => {
          colonyMod(
            g,
            n,
            "session:noexpedition",
            "The King's expedition refused",
            2 * Y,
            {
              favor: -5,
            },
          );
          return "The house regrets it can spare neither. London does not regret saying so.";
        },
      },
    ],
  },
  {
    key: "roads",
    title: () => "A bill for roads and ferries",
    when: () => -1,
    weight: () => 0.8,
    body: () =>
      "Every county wants a road to its landing and a ferry over its river, and none of them wants to pay for the next county's.",
    choices: [
      {
        label: "A road for every county (20 from the treasury)",
        short: "roads for every county",
        tip: "The colony's trade +3% for ten years, if the treasury has 20.",
        lean: { planters: 3, frontier: 1, merchants: 1, court: -1 },
        marks: { planters: 5, frontier: 2 },
        carry: (g, n) => {
          if (!pay(g, n, 20))
            return "Roads for every county, voted with great enthusiasm and no money. The surveyors are told to wait.";
          colonyMod(g, n, "session:roads", "Roads for every county", 10 * Y, {
            production: 0.03,
          });
          return "Roads for every county: the surveyors are out with their chains, and the taverns along the routes are already raising their prices.";
        },
      },
      {
        label: "Only the post road (8 from the treasury)",
        short: "the post road",
        tip: "The colony's trade +1% for ten years, if the treasury has 8.",
        lean: { merchants: 2, court: 1 },
        marks: { merchants: 4 },
        carry: (g, n) => {
          if (!pay(g, n, 8))
            return "The post road is voted and not built. The post rides on as it always has, slowly.";
          colonyMod(g, n, "session:postroad", "The post road", 10 * Y, {
            production: 0.01,
          });
          return "The post road is mended from one end to the other. The letters come a day sooner, and so do the bills.";
        },
      },
      {
        label: "Let the counties pay for their own",
        short: "letting the counties pay for their own roads",
        tip: "Nothing from the treasury. The planters remember.",
        lean: { country: 2, merchants: 0.5, planters: -2 },
        marks: { country: 3, planters: -4 },
        carry: () =>
          "Each county is left to build its own road, which most of them will begin next year.",
      },
    ],
  },
];

export const QUESTION_BY_KEY = new Map(QUESTIONS.map((q) => [q.key, q]));

/** What the governor asks in a bill of supply. */
export function supplyOf(s: GameState, n: number): number {
  return atWarAny(s, n) ? 20 : 15;
}

// ---------------------------------------------------------------- who sits, and their voices

/** The players who sit in the house or on the council of a colony. */
export function sessionPlayers(s: GameState, n: number): Life[] {
  return s.lives.filter(
    (l) =>
      !l.watching &&
      l.c >= 0 &&
      s.chars[l.c]?.alive &&
      s.chars[l.c].nation === n &&
      (inHouse(s, n, l.c) || onCouncil(s, n, l.c)),
  );
}

/** What a player's speech can do: the chance it lands, and the members it brings over. */
export function speechOf(
  s: GameState,
  n: number,
  life: Life,
): { chance: number; pass: number; fail: number } {
  const persuasion = skillLevel(s, life, "persuasion");
  // Renown counts, a little, and no more than it should.
  const chance = Math.max(
    0.1,
    Math.min(0.9, 0.35 + persuasion * 0.04 + Math.min(0.12, life.renown / 800)),
  );
  const speaker = s.power?.cabinets[n]?.speaker === life.c;
  return {
    chance: Math.round(chance * 100) / 100,
    pass: 2 + Math.floor(persuasion / 4) + (speaker ? 2 : 0),
    fail: speaker ? 1 : 0,
  };
}

/** How the computer's members lean, choice by choice, before anyone speaks. */
export function houseLean(
  s: GameState,
  n: number,
  sess: HouseSession,
): number[] {
  const q = QUESTION_BY_KEY.get(sess.key);
  const out = [0, 0, 0];
  if (!q) return out;
  for (const c of s.polities[n]?.assembly ?? []) {
    if (!s.chars[c]?.alive || playedC(s, c)) continue;
    const fs = factionsOf(s, n, c);
    let best = 0;
    let top = -Infinity;
    q.choices.forEach((ch, i) => {
      let v = 0;
      for (const f of fs) v += ch.lean[f] ?? 0;
      v += (hash01(c, sess.id, i, 53) * 2 - 1) * 1.2;
      if (v > top) {
        top = v;
        best = i;
      }
    });
    out[best]++;
  }
  return out;
}

/** The division as it would fall now: the members, the players' own votes and the members their speeches brought over. */
export function divisionNow(
  s: GameState,
  n: number,
  sess: HouseSession,
): number[] {
  const votes = houseLean(s, n, sess);
  for (const [k, i] of Object.entries(sess.stands)) {
    const c = Number(k);
    if (i < 0 || i > 2) continue;
    if (inHouse(s, n, c)) votes[i]++;
    let bring = sess.swayed[c] ?? 0;
    while (bring > 0) {
      // Members come over from the largest of the other sides.
      let from = -1;
      for (let j = 0; j < 3; j++)
        if (j !== i && votes[j] > 0 && (from < 0 || votes[j] > votes[from]))
          from = j;
      if (from < 0) break;
      votes[from]--;
      votes[i]++;
      bring--;
    }
  }
  return votes;
}

// ---------------------------------------------------------------- the year's round

/** This year's question for a colony: what's due, the last few kept back. */
function chooseQuestion(
  g: ConquestGame,
  n: number,
): { key: string; arg: number } | null {
  const s = g.s;
  const recent = s.power?.cabinets[n]?.sessions ?? [];
  const due: { key: string; arg: number; w: number }[] = [];
  for (const q of QUESTIONS) {
    const arg = q.when(g, n);
    if (arg === null) continue;
    due.push({ key: q.key, arg, w: q.weight(g, n) });
  }
  const fresh = due.filter((x) => !recent.includes(x.key));
  const pool = fresh.length ? fresh : due;
  if (!pool.length) return null;
  const total = pool.reduce((m, x) => m + x.w, 0);
  let r = cdice(s, 31, n, dateOf(s.day).year).next() * total;
  for (const x of pool) {
    r -= x.w;
    if (r <= 0) return { key: x.key, arg: x.arg };
  }
  const last = pool[pool.length - 1];
  return { key: last.key, arg: last.arg };
}

/** 1 April: the house sits, where players sit in it or on the council. */
function openSessions(g: ConquestGame): void {
  const s = g.s;
  for (const nation of s.nations) {
    if (!nation.alive || nation.kind !== "power") continue;
    const n = nation.id;
    const pol = s.polities[n];
    if (!pol?.assembly.length) continue;
    const players = sessionPlayers(s, n);
    if (!players.length) continue;
    const cab = ensureCabinet(g, n);
    const year = dateOf(s.day).year;
    if (cab.session?.year === year) continue;
    if ((cab.prorogued ?? 0) > s.day) {
      for (const life of players)
        journal(
          g,
          life,
          `The governor has sent ${pol.name} home: there's no spring session this year, and nobody to complain to about it.`,
          "bad",
        );
      continue;
    }
    const q = chooseQuestion(g, n);
    if (!q) continue;
    cab.session = {
      id: g.nextId(),
      year,
      key: q.key,
      arg: q.arg,
      opened: s.day,
      until: s.day + SESSION_DAYS,
      stands: {},
      swayed: {},
    };
    cab.sessions = [...(cab.sessions ?? []), q.key].slice(-SESSION_MEMORY);
    powerChanged(g, `c${n}`);
    for (const life of players)
      raiseEvent(g, life, "session-sits", { n, id: cab.session.id });
  }
}

/** A player stands for a choice (0 to 2), or aside (-1). */
export function standInSession(
  g: ConquestGame,
  life: Life,
  n: number,
  id: number,
  choice: number,
): string | null {
  const s = g.s;
  const cab = s.power?.cabinets[n];
  const sess = cab?.session;
  if (!cab || !sess || sess.id !== id || sess.carried !== undefined)
    return "The house has divided.";
  if (!inHouse(s, n, life.c) && !onCouncil(s, n, life.c))
    return "You sit in neither house.";
  if (sess.stands[life.c] !== undefined) return "You've spoken already.";
  const q = QUESTION_BY_KEY.get(sess.key);
  if (!q) return "No such question.";
  touchLife(g, life);
  sess.stands[life.c] = choice >= 0 && choice <= 2 ? choice : -1;
  powerChanged(g, `c${n}`);
  if (sess.stands[life.c] < 0) {
    journal(
      g,
      life,
      `You keep your seat and your counsel on ${lowerQ(q, g, n, sess.arg)}.`,
    );
    return null;
  }
  const ch = q.choices[choice];
  const sp = speechOf(s, n, life);
  const pass = cdice(s, 41, n, sess.id, life.c).next() < sp.chance;
  sess.swayed[life.c] = pass ? sp.pass : sp.fail;
  const year = dateOf(s.day).year;
  for (const [f, dv] of Object.entries(ch.marks) as [FactionKey, number][])
    markFaction(g, cab, life.c, f, dv, `you spoke for ${ch.short} (${year})`);
  addRenown(g, life, pass ? 2 : 1);
  const lean = divisionNow(s, n, sess);
  journal(
    g,
    life,
    pass
      ? `You speak for ${ch.short}, and the house listens: ${sess.swayed[life.c]} members come over. As it stands, ${leanWords(q, lean)}.`
      : `You speak for ${ch.short}. The house hears you out politely, which is worse than heckling.${sess.swayed[life.c] ? ` A member or so comes over.` : ""} As it stands, ${leanWords(q, lean)}.`,
    pass ? "good" : undefined,
  );
  return null;
}

const lowerQ = (q: Question, g: G, n: number, arg: number) => {
  const t = q.title(g, n, arg);
  return t.charAt(0).toLowerCase() + t.slice(1);
};

/** "14 for the supply as asked, 9 for commissioners, 6 for refusing it". */
export function leanWords(q: Question, votes: number[]): string {
  return q.choices.map((c, i) => `${votes[i]} for ${c.short}`).join(", ");
}

/** 1 May: the house divides, and what carries is done. */
function divide(g: ConquestGame, n: number): void {
  const s = g.s;
  const cab = s.power?.cabinets[n];
  const sess = cab?.session;
  if (!cab || !sess || sess.carried !== undefined) return;
  const q = QUESTION_BY_KEY.get(sess.key);
  const pol = s.polities[n];
  if (!q || !pol) return;
  const votes = divisionNow(s, n, sess);
  let carried = 0;
  for (let i = 1; i < 3; i++) if (votes[i] > votes[carried]) carried = i;
  // A tie: the middle way.
  if (
    votes.filter((v) => v === votes[carried]).length > 1 &&
    votes[1] === votes[carried]
  )
    carried = 1;
  const by = Object.entries(sess.stands)
    .filter(([, i]) => i === carried)
    .map(([c]) => Number(c))
    .sort((a, b) => a - b);
  sess.votes = votes;
  sess.carried = carried;
  sess.text = q.choices[carried].carry(g, n, sess.arg, by);
  powerChanged(g, `c${n}`);
  const head = `${pol.name.replace(/^the /, "The ")} divides on ${lowerQ(q, g, n, sess.arg)}: ${leanWords(q, votes)}. It carries ${q.choices[carried].short}.`;
  for (const life of sessionPlayers(s, n)) {
    // A scene still waiting: the house didn't wait for you.
    const waiting = life.events.some(
      (e) => e.key === "session-sits" && e.ctx.id === sess.id,
    );
    if (waiting) {
      touchLife(g, life);
      life.events = life.events.filter(
        (e) => !(e.key === "session-sits" && e.ctx.id === sess.id),
      );
    }
    const mine = sess.stands[life.c];
    const yours =
      mine === undefined
        ? " The house divided without you."
        : mine < 0
          ? " You stood aside."
          : mine === carried
            ? " Your side carried it."
            : ` You spoke for ${q.choices[mine].short}, and lost.`;
    journal(
      g,
      life,
      `${head}${yours} ${sess.text}`.trim(),
      mine === carried
        ? "good"
        : mine !== undefined && mine >= 0
          ? "bad"
          : undefined,
    );
  }
  rumour(
    g,
    s.nations[n].capital,
    `${pol.name.replace(/^the /, "The ")} has carried ${q.choices[carried].short}.`,
    -1,
  );
}

/** Each day: the session opens on 1 April, and divides a month on. */
function sessionDaily(g: ConquestGame): void {
  const s = g.s;
  const d = dateOf(s.day);
  if (d.month === SESSION_MONTH && d.day === 1) openSessions(g);
  for (const cab of Object.values(s.power?.cabinets ?? {}))
    if (
      cab.session &&
      cab.session.carried === undefined &&
      s.day >= cab.session.until
    )
      divide(g, cab.n);
}

/** When the next session sits (for the page). */
export function nextSessionDay(s: GameState): number {
  const d = dateOf(s.day);
  const thisYear = dayOf(d.year, SESSION_MONTH, 1);
  return s.day < thisYear ? thisYear : dayOf(d.year + 1, SESSION_MONTH, 1);
}

/** The faction each choice pleases most, for the scene: "the court party, the backcountry men". */
export function pleases(
  s: GameState,
  n: number,
  ch: SessionChoice,
): { glad: string[]; sore: string[] } {
  const marks = Object.entries(ch.marks) as [FactionKey, number][];
  return {
    glad: marks.filter(([, v]) => v >= 2).map(([f]) => factionName(s, n, f)),
    sore: marks.filter(([, v]) => v <= -2).map(([f]) => factionName(s, n, f)),
  };
}

hooks.daily.push(sessionDaily);

export { formatDate };
