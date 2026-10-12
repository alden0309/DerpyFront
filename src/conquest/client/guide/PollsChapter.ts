// POLLS (r16): the How to Play's chapter on polls and the canvass, and on
// renown and favour's curve. Every number comes from the engine's own tables
// (POLL, RENOWN_CURVE, FAVOUR_CURVE, PUFF), so the guide says what the count
// and the month really do.

import { CANVASS_POINTS, POLL } from "../../engine/Canvass";
import { SEAT_CASE } from "../../engine/Council";
import { chanceWords } from "../../engine/Odds";
import { PUFF } from "../../engine/Press";
import { seatSlip } from "../../engine/Standing";
import {
  afterGain,
  FAVOUR_CURVE,
  gainFactor,
  monthlyFade,
  RENOWN_CURVE,
  settlesAt,
} from "../../engine/StandingCurve";
import type { Chapter } from "./Chapters";

const n = (v: number) => String(Math.round(v * 10) / 10);
const pct = (v: number) => `${Math.round(v * 100)} in 100`;

/** What a candidate's standing is made of, line by line, from POLL. */
function linesTable(): string {
  return `| Line | What it counts | Up to |
|---|---|---|
| Your name on the list | everyone has it | ${POLL.base} |
| Renown | ${POLL.renownPer} a point | ${POLL.renownCap} |
| Your station | ${POLL.stationPer} a step, the same for the computer's people | ${n(4 * POLL.stationPer)} |
| A householder of the county | living there | ${POLL.householder} |
| Persuasion | ${POLL.persuasionPer} a level (the computer's people: their address, ${POLL.addressPer} a point of diplomacy) | ${POLL.persuasionCap} |
| Canvassing | its points, with diminishing returns; a tenth fades each week | ${POLL.canvassCap} |
| Treating | ${POLL.treatPoints} points a treat, with diminishing returns; 1 in 20 fades each week | ${POLL.treatCap} |
| The county's regard | its people's opinion of you, ÷ ${POLL.regardDiv} (the computer's people: by their station and family) | ±${POLL.regardCap} |
| Party | your party, by how far the county leans its way (a county near the middle, only a little) | ±${POLL.party} |
| The governor's friends | for a court man he likes; against the country party, or one he dislikes | +${POLL.govFor} / −${POLL.govAgainst} |
| The sheriff | he runs the poll: his opinion of you ÷ 10; his goodwill bought | ±${POLL.sheriffLean}, +${POLL.sheriffBought} |
| A patron | your own, in the colony; a great man's interest bought | +${POLL.patronOwn} / +${POLL.patronBought} |
| A freeholder · sitting already | the computer's merchants, planters and better are freeholders too | +${POLL.freeholder} · +${POLL.sitting} |
| Living out of the county · a scandal | | ${POLL.away} · ${POLL.scandal} |
| The papers | pieces for or against you | ±${POLL.swayCap} |
| Talked about in the town | each rumour against you | ${POLL.rumour} |
| Luck at the count | each side | ±${POLL.luck} |`;
}

/** Renown's curve, from the engine: what a gain counts for, what a month takes, where a steady gain settles. */
function curveTable(): string {
  const rows = [20, 40, 60, 80, 100, 120, 150].map(
    (v) =>
      `| ${v} | ${pct(gainFactor(RENOWN_CURVE, v))} | ${n(monthlyFade(RENOWN_CURVE, v))} | ${v <= 100 ? `${pct(gainFactor(FAVOUR_CURVE, v))}, fades ${n(v <= FAVOUR_CURVE.knee ? v * FAVOUR_CURVE.fade : monthlyFade(FAVOUR_CURVE, v))}` : "never so high"} |`,
  );
  return `| At | Renown: a point gained counts | Renown: a month takes | Favour: a point gained counts, a month takes |
|---|---|---|---|
${rows.join("\n")}

A steady renown a month settles about ${settlesAt(RENOWN_CURVE, 1)}; two a month about ${settlesAt(RENOWN_CURVE, 2)}; four about ${settlesAt(RENOWN_CURVE, 4)}; six (a busy politician's) about ${settlesAt(RENOWN_CURVE, 6)}. Twenty renown gained at 50 takes you to ${n(afterGain(RENOWN_CURVE, 50, 20))}, at 100 to ${n(afterGain(RENOWN_CURVE, 100, 20))}. Favour from two a month settles about ${settlesAt(FAVOUR_CURVE, 2)}, from three about ${settlesAt(FAVOUR_CURVE, 3)}.`;
}

export const POLLS_CHAPTER: Chapter = {
  id: "polls",
  part: "power",
  title: "Polls and the canvass",
  line: "How a poll is won (and lost): the canvass week by week, money laid out on it, rivals with patrons, the governor's friends; and why renown alone won't carry it.",
  where:
    "Society › Office (the canvass, at the top while you stand, and each office's row); Society › Standing (renown and favour); Society › Press (a piece for yourself).",
  body: `## A poll is a contest
At a county poll (selectman, mayor, burgess, churchwarden...) and at an election to the assembly, every candidate's **standing** is made of the same lines, yours and the computer's people's alike. The highest standing at the count wins the office. **A seat in the house is fought in your county**: beat the man put up against you there and you sit; lose to him and he takes it. Point at any standing for its lines.

${linesTable()}

**Renown counts, but lightly and only so far.** A famous man who doesn't canvass, isn't liked in the county, belongs to the wrong party or has the governor's friends against him **loses** to a planter of the county with a great man's interest behind him. (Renown still helps a little more by the back door: people think better of the well known, and fame raises your station.)

## The computer's candidates
They're people of the county, and they fight: each **canvasses** for the last half-year before a poll, harder some than others; **treats** the voters with his own money (a merchant or a planter more than a smith); many have **a great man's interest** behind them (a councillor's, or the county's justice's); the sheriff may be their kinsman; a court-party man has the governor's friends. The county's people fight a great office (a mayor, a burgess) at ${pct(0.8)} of what they'd put into a seat in the house, a lesser one (a churchwarden, a selectman) at half.

**A challenger for the house.** When you stand for the assembly (or sit, and the count is half a year off), the other interest puts up one or two of your county's people of standing against you, and you're told who and with whose interest:
- he's **the other party's man** where the county has one (against a member of no party, the county's own lean);
- **a great man of his party always stands behind him**, and **his backers pay his treating** (at least ${pct(POLL.challengerTreat)} of what treating can do);
- he **canvasses hard**, building from the day he's put up;
- a county with nobody free to stand sees a newcomer of standing come forward (a planter, a merchant or a lawyer lately settled there).

Nobody is returned unopposed by accident: if you never canvassed for the house (you stood days before, or canvassed for a county office first), a man is put up against you at the last moment, with a quarter of a canvass.

## The canvass, week by week
While you stand (or sit, and the count is less than half a year off), **Society › Office** shows the canvass at the top: your standing against the strongest rival (for the house, the challenger in your county), **your chance at the count** (from the luck at the count, ±${POLL.luck} on each side: the same numbers the count rolls), a chart of both, week by week, **what moved it this week** (your canvassing, his treating, the county's regard...), and both sides line by line.

## Money for the poll
On the canvass, each with its cost on its button and what it would do to your standing now:
- **Print a broadside** (once a month, at a press): 2 coins; ${CANVASS_POINTS.broadside} canvass points (your name and promises on every tavern door).
- **Treat the voters** (once a week, in the county): punch at the hustings and a dinner for the freeholders, 3 coins in a small county and up to 9 in a great town. Each treat counts for less than the one before; it fades 1 in 20 a week.
- **A present for the sheriff** (once a poll, in the county): 4 and 2 for each step of his station (10 to 14); +${POLL.sheriffBought} at the count (he opens and closes the poll to suit you). A plain man takes it amiss ${chanceWords(0.15)}, an honest one ${chanceWords(0.85)}: then he sends it back, and remembers it.
- **A great man's interest** (once a poll): a councillor's, or a county grandee's, if he thinks well enough of you (10); his price is 6 and 4 for each step of his station (about 22 to 26). +${POLL.patronBought} (or +${POLL.patronBought - POLL.patronOwn} more if you have a patron already).

**Canvass the voters** (every two weeks, at a tavern or a market) is free and on the canvass too: ${CANVASS_POINTS.pass} canvass points if it goes well (on your persuasion), ${CANVASS_POINTS.fail} if not; standing a round at the tavern brings ${CANVASS_POINTS.round}. They're worth as much as the money, but they fade unless they're kept up. A sitting member, or a county office's holder, canvasses for the count ahead the same way in its last half-year. Standing for two at once (a county office and the house), your canvass is for the one counted first. The money spent shows in Estate › Ledger under the poll's name.

## The governor's friends
A colony's governor (the computer's) and his friends take a side. A court-party man he thinks well of (20) has them working for him (+${POLL.govFor}); **a member of the country party, or anyone he dislikes, has them working against him** (−${POLL.govAgainst}), and you're told when they start. You're of the court party when you're received at court, or when your votes on the council say so; of the country party when they say that.

## At the count
Each side has its luck (±${POLL.luck}), and the highest standing wins. **Your journal says why**: the two or three lines that made the difference ("Edward's canvass, +11 to your +4; Colonel Byrd's interest behind Edward, +7; the governor's friends worked against you"), and the County offices page keeps your last poll's result and its reasons. A candidate who no longer may stand at the count (not a freeholder now, say) is struck off the list, and told why.

## The Speaker's chair
The house chooses its speaker from its members: persuasion, letters and renown (to 12), a bid for the chair, the man in it already, and **party**: the house's majority party prefers its own man (+4, the minority's −4).

## Your own paper
A paper may print **for its own proprietor** (Society › Press, About: Yourself), never against. It persuades your own readers more than a piece about anyone else: ${PUFF.here} times its force at a poll in the paper's county (up to ${PUFF.max}), for a year and a half. At polls elsewhere it raises eyebrows (a third of it against you, up to ${PUFF.elsewhereMax}). If there's a rival paper in the colony it may **mock it** (${chanceWords(PUFF.mock)}; ${chanceWords(PUFF.mock + PUFF.mockLowCredit)} for a paper few believe; more with more rivals): the puff half spoiled, renown −2, your paper's credit −3.

## Renown and favour on a curve
Up to 60, every point of renown or favour gained counts in full and fades as it always did. Above 60 **each gain counts for less**, and **it fades faster the higher it stands**: the great are forgotten fast, and the crown's ear must be kept.

${curveTable()}

**Favour in an unchanged seat.** Each year in the same seat (a county office, the house, the speaker's chair, a council seat, the governor's chair), if nothing was **delivered** from it (a bill of yours made law, a public work or a market day, bread for the poor, the militia mustered, an office's or a seat's power carried, a measure of yours through the council, a governor's law or work), favour slips: ${seatSlip(1)} the first idle year, then ${seatSlip(2)}, ${seatSlip(3)}, up to ${seatSlip(9)}. A year with something delivered and it holds (your journal says which).

Thresholds are set for the curve: **Famous** (the achievement) is 100 renown, and so is the station of "someone so famous"; **Make a name** asks twenty more below 60, and fewer above it; a council seat's **case** counts renown up to ${SEAT_CASE.renownCap * SEAT_CASE.renownDiv} (a fifth of it) and favour up to ${SEAT_CASE.favourCap * SEAT_CASE.favourDiv} (a fifth of it), so the years above 60 still make a case. Everything else that asks for renown or favour asks for 60 or less, where the curve doesn't reach.

> Tip: Stand where you live, keep canvassing, treat the voters a few times as the poll nears, and buy a great man's interest if the canvass is close. If the governor's friends are against you, a patron and the sheriff can still carry it.

! Pitfall: Canvassing done a year before the poll has mostly faded by the count. Put the effort into the last few months.`,
  glossary: [
    [
      "Canvass",
      "Your standing at a poll as it moves week by week, against the strongest rival (Society › Office). Canvassing, treating and broadsides raise it; they fade unless kept up.",
      "polls",
    ],
    [
      "Treating",
      "Punch and dinners for the voters, at your charge: a few coins a time, once a week, for a place in their memory at the poll.",
      "polls",
    ],
    [
      "The governor's friends",
      "The governor's party at the polls: for a court man he likes, against the country party and anyone he dislikes.",
      "polls",
    ],
    [
      "A great man's interest",
      "A councillor's or a grandee's word to his tenants and friends: at a price, it counts at the poll.",
      "polls",
    ],
    [
      "Delivered",
      "Something to show for a year in a seat: a law, a work, a power or a measure carried. Without it favour slips.",
      "polls",
    ],
  ],
};
