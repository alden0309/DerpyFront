// CHAMBER (r16): the How to Play's chapter on the council's business, the
// factions, the assembly's yearly session, what a seat's work comes to
// later, and the journal's small talk. Its tables are made from the
// engine's own (BUSINESS, the measures, the factions' names and leanings,
// QUESTIONS, LATER, the journal's caps), so they can't drift from the game.

import { GOSSIP_HEARINGS, JOURNAL_CAP } from "../../engine/Chatter";
import { MEASURES, SEAT_ACTION_BY_KEY } from "../../engine/Council";
import { seatTitleOf } from "../../engine/CouncilTitles";
import { BUSINESS, caresOf, DOCKET_REST } from "../../engine/Docket";
import {
  FACTION_KEYS,
  FACTION_WANTS,
  factionNamesOf,
  MARK_CAP,
  OPINION_PER_MARK,
} from "../../engine/Factions";
import { LATER } from "../../engine/Later";
import { chanceWords } from "../../engine/Odds";
import { QUESTIONS, SESSION_DAYS } from "../../engine/Session";
import type { FactionKey } from "../../engine/Types";
import type { Chapter } from "./Chapters";

const EN = factionNamesOf("english");
const up = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "the merchants, the planters". */
function caresCell(cares: Partial<Record<FactionKey, number>>, sign: 1 | -1) {
  const list = (Object.entries(cares) as [FactionKey, number][])
    .filter(([f, v]) => v * sign > 0 && f !== "court" && f !== "country")
    .map(([f]) => EN[f]);
  return list.length ? list.join(", ") : "–";
}

/** Every kind of business that comes before the council, from the docket. */
function businessTable(): string {
  const rows = BUSINESS.map((b) => {
    const m = MEASURES[b.key];
    const stakes = (m?.text ?? "").replace(/\|/g, "/");
    const cares = caresOf(b.key);
    return `| **${b.label}** | ${b.due} | ${stakes} | ${caresCell(cares, 1)} | ${caresCell(cares, -1)} |`;
  });
  return `| The business | When it comes | What's at stake | For it | Against it |
|---|---|---|---|---|
${rows.join("\n")}`;
}

/** The factions, by the names each people gives them. */
function factionsTable(): string {
  const peoples: [string, string][] = [
    ["english", "The English colonies"],
    ["puritan", "New England"],
    ["french", "New France"],
    ["spanish", "New Spain"],
    ["dutch", "New Netherland"],
  ];
  const rows = FACTION_KEYS.map(
    (f) =>
      `| **${up(EN[f])}** | ${peoples
        .slice(1)
        .map(([p]) => factionNamesOf(p)[f])
        .join(" | ")} | ${FACTION_WANTS[f]} |`,
  );
  return `| ${peoples[0][1]} | ${peoples
    .slice(1)
    .map(([, t]) => t)
    .join(" | ")} | What they want |
|---|---|---|---|---|---|
${rows.join("\n")}`;
}

/** The session's great questions, each with its choices and what they do. */
function sessionTable(): string {
  const rows = QUESTIONS.map((q) => {
    const choices = q.choices
      .map((c, i) => {
        const glad = (Object.entries(c.marks) as [FactionKey, number][])
          .filter(([, v]) => v >= 2)
          .map(([f]) => EN[f]);
        return `${i + 1}. ${c.label}: ${c.tip}${glad.length ? ` (Pleases ${glad.join(", ")}.)` : ""}`;
      })
      .join("<br>");
    return `| **${q.name}** | ${q.due} | ${choices.replace(/\|/g, "/")} |`;
  });
  return `| The question | When | The choices, and what each does if the house carries it |
|---|---|---|
${rows.join("\n")}`;
}

/** The seat powers whose work comes to something later. */
function laterTable(): string {
  const rows = Object.entries(LATER).map(([k, d]) => {
    const a = SEAT_ACTION_BY_KEY.get(k);
    const seat = a ? seatTitleOf(undefined, a.seat) : "";
    const odds = `${chanceWords(d.p)}${d.pWar !== undefined ? ` (${chanceWords(d.pWar)} ${d.war === "target" ? "at war with them" : "in a war"})` : ""}`;
    return `| **${a?.label ?? k}** (${seat}) | ${Math.round(d.days[0] / 30)} to ${Math.round(d.days[1] / 30)} months${d.needsPass ? ", if it went well" : ""} | ${odds} | ${d.well} | ${d.badly} |`;
  });
  return `| The power | Comes to something | Turns out well | Well | Badly |
|---|---|---|---|---|
${rows.join("\n")}`;
}

export const CHAMBER_CHAPTER: Chapter = {
  id: "chamber",
  part: "power",
  title: "The council's business, the factions and the session",
  line: "What comes before the council (war and peace, petitions, scandals and more), the factions that remember your votes, the assembly's yearly session, and what your seat's work comes to later.",
  where:
    "Society › Council: the matters before the council (who cares which way), the session, the factions and what they think of you, and what your work comes to. Scenes for a vote in council and for the session wait at the top of the screen.",
  body: `## The council's business
The governor (or a county, or the councillor whose business it is) brings matters before the council about once in three months, where players sit. They differ and they matter: war and peace, the crown's demands, boundaries, the counties' petitions, a scandal in the treasury. **No kind of business comes before the council twice in ${DOCKET_REST} days**, whoever brings it: a councillor's own measure waits too (the button says how long). Some come only once in a colony. A matter the council throws out can do something as well: a county refused its petition is angrier for a year, a boundary not pressed goes to commissioners.

${businessTable()}

The old measures a seat brings (farming out the customs, paper money, a fort, presents, a treaty of trade) are among them. The council divides a week after a matter is brought; a governor the computer plays may refuse to sign a measure carried against his instructions by someone out of his favour ("carried, but the governor won't sign it").

## The factions
Everyone in a colony's politics (the governor, his council, the house and the people at court) belongs to a **party** and an **interest**. The two parties are the governor's friends and the house's men; the four interests are the merchants, the landed men, the backcountry and the church. Each people has its own names for them:

${factionsTable()}

- **They remember your votes.** Voting aye or no in council on a matter an interest cares about moves its regard for you (three for each step of its leaning, either way); the court party remembers whether you stood with the governor's measures, and the country party the reverse. Where you stand at the session moves them too.
- **They think the better or the worse of you for it.** Each member's opinion of you has a line for it, with the reasons ("The merchants remember: you voted against paper money"): a quarter of the faction's regard (which runs from −${MARK_CAP} to ${MARK_CAP}), so at most ${Math.round(MARK_CAP * OPINION_PER_MARK)} either way. The governor is of the court party: what it remembers is in his opinion of you, and so in your case for a seat.
- **Their councillors lean your way** (or against you) on the measures you bring.
- Memories fade by a fifth each January.
- Society › Council lists the factions, how many of each are in the colony's politics, what each thinks of you and why. You're counted with a party by your votes in council (two more with the governor than against, or the reverse), or by what the two parties think of you.

## The session
Each spring (**1 April**) the house sits on the year's great question, and divides ${SESSION_DAYS} days later. Every player who sits in the house, or on the council (the upper house, with no vote below but a voice that carries), is asked where they stand, in a scene:

${sessionTable()}

- **Your speech** brings members over: its chance (on the button) is your persuasion (4 in 100 a point, from 35 in 100), and a little for renown (no more than 12 in 100); a good speech brings 2 members and one more for every 4 points of persuasion (the speaker 2 more), a poor one none (the speaker 1).
- **The house divides** by its members' parties and interests, with your own vote if you sit there, and the members the speeches brought over. The most votes carries; a tie goes to the middle way.
- **The factions remember where you stood**, win or lose, and you gain a little renown for speaking. Standing aside (or not answering) offends nobody: nobody speaks in your name.
- Refusing supply, withholding the governor's salary and carrying an address against him are the house's levers against a governor ([[council|The governor's council]]).
- Society › Council shows this year's question, how the house leans now, your stand, and what it carried.

## What your seat's work comes to
Some of a seat's powers come to something months later, and say so in your journal and on Society › Council (what's still to come, and what it came to). How it turns out is settled the day you do it.

${laterTable()}

## Small talk in the journal
The governor's talk and flattery, the tavern round, the talk of the town, the levee, alms and pamphlets draw from larger pools, and a line rests a while once it's been said.
- **News comes first** and always goes in the journal: a war, the matter before the council, the bill before the house, the session's question, the governor's gout (if he has it), the price of tobacco at home. Each piece is told once, not every week.
- **Flavour goes in the journal the first few times a year** (${Object.entries(
    JOURNAL_CAP,
  )
    .map(
      ([k, v]) =>
        `${v} for ${k === "drink" ? "the talk of the town" : k === "talk" ? "small talk with each person" : k}`,
    )
    .join(
      ", ",
    )}). After that it's said when you do it (you see it in the scene) but not written down.
- **The town's old stories** are heard at most ${GOSSIP_HEARINGS === 2 ? "twice" : `${GOSSIP_HEARINGS} times`} in a life, a couple of years apart; some belong to their years (Captain Kidd, Blackbeard, the South Sea Bubble, Mr Whitefield). When there's nothing new, nothing is written.
- **The levee** names everyone the first time; after that it's "the usual company", naming only who's new and who's missed.

> Tip: The factions remember both ways. A vote that pleases the merchants may cost you the planters; the session is where you choose your friends for the year.

! Pitfall: Pressing a war vote on the frontier pleases the backcountry men, and then the colony must fight it.`,
  glossary: [
    [
      "Faction",
      "A party (the governor's friends, or the house's men) or an interest (the merchants, the landed men, the backcountry, the church) in a colony's politics. It remembers how you vote.",
      "chamber",
    ],
    [
      "The session",
      "The assembly's yearly sitting on its great question (1 April, dividing a month later). Players in the house or on the council say where they stand.",
      "chamber",
    ],
    [
      "The docket",
      "The council's business. No kind of it comes before the council twice in a year.",
      "chamber",
    ],
  ],
};
