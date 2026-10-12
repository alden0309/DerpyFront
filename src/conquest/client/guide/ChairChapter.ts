// CHAIR (r16): the How to Play's chapter on the governor's chair: where you
// are on the road, the crown's commission and its term, the lieutenant
// governor, a petition for the governor's recall, the house's address
// against him, the capital's fall and following the government, presents
// for a council seat, the speaker's chair, and marks of greatness. Its
// tables are made from the engine's own (ChairCore, ChairRules, Grandeur),
// so they can't drift from what the game rolls.

import {
  ADDRESS,
  FOLLOW,
  LAPSE_DAYS,
  LATELY,
  LT,
  PETITION,
  RECALL,
  RECALLED,
  RENEW,
  TERM,
} from "../../engine/ChairCore";
import {
  SEAT_PRESENTS,
  SPEAKER_AGE,
  SPEAKER_YEARS,
  SPEAKER_YOUNG,
} from "../../engine/ChairRules";
import { GREAT } from "../../engine/Grandeur";
import { HOUSES, KIT } from "../../engine/LifeRules";
import type { CouncilSeat } from "../../engine/Types";
import type { Chapter } from "./Chapters";

const hundred = (v: number) => `${Math.round(v * 100)}`;
const signed = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.round(Math.abs(v) * 100)}`;

/** The presents each council seat expects, from the table the engine charges. */
function presentsTable(): string {
  const names: Partial<Record<CouncilSeat, string>> = {
    treasurer: "The treasurer (receiver-general)",
    spymaster: "The secretary of the colony",
    attorney: "The attorney general",
    marshal: "The militia's general",
    envoy: "The commissioner for the native nations",
    surveyor: "The surveyor-general",
    chaplain: "The chaplain",
  };
  return `| The seat | Presents to the governor's friends |
|---|---|
${(Object.keys(names) as CouncilSeat[]).map((k) => `| ${names[k]} | ${SEAT_PRESENTS[k]} coins |`).join("\n")}`;
}

/** What moves the crown to recall a governor, from the table recallOdds reads. */
function recallTable(): string {
  const R = RECALL;
  return `| What | In 100 |
|---|---|
| The crown is slow to recall a governor | ${signed(R.base)} |
| The crown's trust in him (the colony's favour): 50 counts for nothing, each point below adds and each above takes off | up to ${signed(R.trustMax)} either way |
| Unrest in the colony above ${R.unrestFrom}, a point at a time | up to ${signed(R.unrestMax)} |
| Each town lost while he governed | ${signed(R.lost)} (up to ${signed(R.lostMax)}) |
| Each grievance the crown has heard (an address carried, a petition near-run) | ${signed(R.grievance)} (up to ${signed(R.grievanceMax)}) |
| In disgrace at court | ${signed(R.disgrace)} each (up to ${signed(R.disgraceMax)}) |
| Your own favour at home | a point in ${Math.round(1 / R.favorPer / 100)} (up to ${signed(R.favorMax)}) |
| Each councillor's name on it | ${signed(R.council)} (up to ${signed(R.councilMax)}) |
| Each member's name on it | ${signed(R.house)} (up to ${signed(R.houseMax)}) |
| Each friend at court who'll speak for it | ${signed(R.court)} (up to ${PETITION.maxCourt}) |
| His own friends at court (each step of his honours) | ${signed(R.honour)} |
| He was sent out less than two years ago | ${signed(R.fresh)} |
| His term ends within the year (the crown would rather wait) | ${signed(R.ending)} |
| His own letters against it (if he answers it) | ${signed(-PETITION.answerPass)} if they land, ${signed(-PETITION.answerFail)} if not |

Never more than ${hundred(R.max)} in 100, nor less than 3.`;
}

/** Marks of greatness, from Grandeur's own table. */
function greatTable(): string {
  const cost = (key: string, base: number) =>
    key === "hall"
      ? `${base}, and a mansion (${HOUSES[3].cost}) if you haven't one at home`
      : key === "coach"
        ? `${base}, and a carriage (${KIT.carriage.cost}) if you don't keep one`
        : String(base);
  return `| What | Costs (coins) | Keep a month | Renown | Favour at home | What else it does |
|---|---|---|---|---|---|
${GREAT.map(
  (d) =>
    `| ${d.title} | ${cost(d.key, d.base)} | ${d.upkeep ?? "–"} | +${d.renown}${d.glow ? " (and a little each month it stands)" : ""} | ${d.favor ? `+${d.favor}` : "–"} | ${d.does} |`,
).join("\n")}`;
}

export const CHAIR_CHAPTER: Chapter = {
  id: "chair",
  part: "power",
  title: "The governor's chair",
  line: "Where you are on the road to it; the crown's commission and its term; the lieutenant governor; a petition for the governor's recall; the house's address; the capital's fall; marks of greatness.",
  where:
    "Society › Standing (the road, and the governor's chair as it stands); Society › Office (your own commission, if you govern); Society › Council (a seat, and its presents); Estate › House & land (marks of greatness).",
  body: `In the early years the ladder is quick: a county office, a place at court, a seat in the house and on the council can all come within a year or three. The governor's chair is the last step, and the crown's to give. It falls empty when the governor dies, when his commission runs out, or when the crown recalls him; and you can bring that day nearer.

## Where you are on the road
**Society › Standing** shows the road from where you stand: each step ticked with the day you reached it, the step you're on ("you are here"), and what each needs with your own numbers beside it. Under it, **what would bring the chair nearer**: a petition for his recall (with its chance as things stand), the house's address if you're the speaker, and the lieutenancy when he grows old or ill.

## The crown's commission
A royal governor holds the crown's **commission** for **${TERM.min} to ${TERM.max} years**. When it runs out, the crown either renews it for **${TERM.againMin} to ${TERM.againMax} years** more or names another man, who comes out from home (or is one of the council, or you).
- **The odds of renewal** start at ${hundred(RENEW.base)} in 100 (most governors served one term) and move with the crown's trust in the colony (its favour: ${RENEW.trustMid} counts for nothing; up to ${hundred(RENEW.trustMax)} either way), the grievances it has heard against him (an address carried, a petition near-run: each ${signed(RENEW.grievance)}), towns lost while he governed (${signed(RENEW.lost)} each), each term served already (${signed(RENEW.term)}), his age (over ${RENEW.oldAge}: ${signed(RENEW.old)}), honours (${signed(RENEW.honour)}), and his own letters asking for another term. Never more than ${hundred(RENEW.max)} in 100.
- **Society › Standing** shows his commission's end and the odds; if you govern, **Society › Office** shows yours. Three months before it runs out you're asked whether to **ask the crown for another term** (Letters: landed, ${signed(RENEW.askPass)} in 100; otherwise ${signed(RENEW.askFail)}).
- A governor whose term is done sails for home; if it's you, you stay in the colony, a private gentleman with a governor's name. The crown looks elsewhere for the chair for **${Math.round(LATELY / 365)} years** after.

## The lieutenant governor
When the governor grows **old (${LT.age}) or ill** (gouty, sickly, never well since a wound, failing, laid up), the crown names a **lieutenant governor**: the best case in the colony, **${LT.bar}** or more, is offered the commission first (the same case the crown weighs for the chair); if nobody's is, one of the council.
- He **acts as governor** when the governor is laid up or away from the colony a month or more: presiding at the council, with renown and favour each month, and the acting governor's pay (**${LT.acting} a month** besides his fees of **${LT.fees}**).
- When the chair falls empty, **the lieutenant governor succeeds** (a player lieutenant always; one of the computer's, unless a player's case clears the crown's bar).
- It's no bar to the seat you hold, and it adds 20 to your case for the chair. It lapses if you leave the colony.

## A petition for the governor's recall
Anyone of standing can get up a petition to the crown for his recall: a councillor, a member of the house, or a name the crown knows (renown ${PETITION.renown}), ${PETITION.age} or older, living in the colony; not in his first year, and not within ${Math.round(PETITION.rest / 365)} years of a petition of yours the crown threw out.
- **It costs** an agent's fee in London (**${PETITION.fee}**) and his retainer (**${PETITION.retainer} a month**) while it runs. It gathers names for **${Math.round(PETITION.gather / 30)} months**, sails, and the crown's answer comes about **${Math.round(PETITION.voyage / 30)} months** later.
- **The odds are shown before you begin**, and as it goes. A recall is a long shot: a well-got-up petition against a governor who has done nothing much wrong lands about 1 in 3; against one who has lost a town or let the counties boil, better than even. What makes them:

${recallTable()}
- **As it goes:** **ask the council and the house for names** (Persuasion, every three weeks: two names if it goes well, one if not, and then word reaches him); **write to friends at court** (Letters, ${PETITION.postage} coins postage, every six weeks); or **let it drop**.
- **If it's granted** the governor is recalled and the chair falls empty (the lieutenant governor succeeds, or the crown chooses): renown +8, favour +5.
- **If it's thrown out** he is your enemy for ten years, he may put you off his council, and your favour at home falls 6. A near thing (2 in 5 or better) still leaves the crown a grievance against him.
- **A governor the crown recalls** is passed over for the chair for **${Math.round(RECALLED / 365)} years** (one whose term ran out, ${Math.round(LATELY / 365)}).
- **Against a player who governs** it's a contest: they're told at once, see the odds, and can answer it with letters of their own (Letters: ${hundred(PETITION.answerPass)} off its chance if they land, ${hundred(PETITION.answerFail)} if not), or offer to make peace (you decide whether to drop it). Other players at the table are asked for their names, and answer for themselves.
- **The computer's rivals** get up petitions too, where it would stand a chance: an ambitious councillor, or one who can't bear the governor.

## The house's address
The **speaker** can move the house's **address** against the governor: **withhold his salary**, **refuse supply**, or both. The page shows how the house would divide as it stands (the country party leans for it, the court party against; what the house holds against him: high taxes, unrest, vetoes, a house sent home, a governor the crown distrusts) and how he'd likely answer. The house divides **${ADDRESS.divide} days** later; one address a year.
- **Carried**, it stands **a year**: his salary unpaid, and if supply is refused the colony's revenue falls ${hundred(-ADDRESS.supply.tax)} in 100, its militia goes unpaid, unrest rises and London blames him (favour ${ADDRESS.supply.favor}). The crown hears of it: a grievance against him.
- **He answers**: **gives way** (taxes down a step, salary and supply voted again, London thinks him weak), **dissolves the house** (a new election within the month), or **holds out**. A player governor chooses; the computer's governor answers by the odds the page shows.
- The computer's houses move addresses of their own against a governor they can't bear.

## When the capital falls
When a colony's capital is taken, the government goes to **the biggest town left**. Everyone of the colony is told where it went and what became of their seats: the council, the house and the governor's chair stand; offices of the lost town lapse with it. If your home is under another flag, your seats in the house and on the council (and a lieutenant's commission) **lapse in ${LAPSE_DAYS} days** unless your household lives in the colony again. **Follow the government** (Society › Standing, or the scene that comes with the news) moves your household to the new capital: a cart and passage, **${FOLLOW.base} coins and ${FOLLOW.each} for each of the family at home**; you travel there and they move in when you arrive.

## A seat on the council, and the speaker's chair
A new councillor makes **presents to the governor's friends**, paid when the seat is his (it's on the button; nothing where a player governs, or at a native council fire):

${presentsTable()}

The colony's own three seats (the attorney general, the surveyor-general and the speaker) are filled from the start of a game, like the old five.

The house chooses its **speaker** from among its members: **${SPEAKER_AGE}** at the least, and under **${SPEAKER_YOUNG}** only after **${SPEAKER_YEARS} years** in the house.

## Marks of greatness
What a governor (or anyone with money and a name) can buy to be remembered by (**Estate › House & land**). Each is a line in the story of your life; the endowments carry your name, and want a name to carry (renown 30).

${greatTable()}

Portraits are by the limners of the day (Henrietta Johnston at Charles Town, Kühn at Annapolis, Duyckinck at New York, then Smibert, Wollaston, Blackburn, Copley and Peale); a scholarship is at the college of your colony (Harvard, William and Mary, Yale, King's, Philadelphia).

> Tip: The surest road to the chair is the lieutenancy: be the best case in the colony when the governor grows old. The quickest is a petition when he's down: a town lost, unrest, the crown cooling on him. Count the names before you send it.`,
  glossary: [
    [
      "Commission",
      "The crown's appointment of a governor, for three to eight years; then renewed, or another named.",
      "chair",
    ],
    [
      "Lieutenant governor",
      "Named when the governor grows old or ill: acts in his absence, and succeeds him.",
      "chair",
    ],
    [
      "Petition for recall",
      "A petition to the crown, got up over months, to have the governor recalled.",
      "chair",
    ],
    [
      "Address",
      "The house's resolution against the governor: his salary withheld, supply refused.",
      "chair",
    ],
  ],
};
