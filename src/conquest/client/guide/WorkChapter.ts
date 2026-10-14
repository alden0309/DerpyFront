// WORK (r21): the How to Play's chapters on the work itself (your duties by
// rung, your master's wish, the people you work beside and what they and
// your master ask of you, leaving from anywhere) and on staff, partners'
// offers and companies (a business's staff by name, a new business both
// ways, no cap, buying out and selling up by offer, a company's trade and
// the markets). The tables are made from the engine's own (DutiesData.ts,
// Staff.ts, Buyouts.ts), so they can't drift.

import { BID_DAYS } from "../../engine/Buyouts";
import { CO_MOVE } from "../../engine/Company";
import { DUTIES, USUAL_TEXT } from "../../engine/DutiesData";
import { JOB_GROUPS, jobGroupOf } from "../../engine/JobsData";
import { JOBS } from "../../engine/LifeRules";
import { LURCH_MONTHS, NOTICE_DAYS, NOTICE_WORKED } from "../../engine/Notice";
import { chanceWords } from "../../engine/Odds";
import { MAX_ROUNDS } from "../../engine/PartnersCore";
import { STAFF_FX, staffRoles } from "../../engine/Staff";
import type { JobKind } from "../../engine/Types";
import {
  COLLEAGUE_CHANCE,
  FAMILY_DAYS,
  MASTER_CHANCE,
  SCENE_REST,
} from "../../engine/WorkDay";
import type { Chapter } from "./Chapters";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Whether a duty is one of a family's (by the family, or one of its trades). */
function inFamily(d: (typeof DUTIES)[number], group: string): boolean {
  return d.for.some(
    (x) =>
      x === group ||
      (x in JOBS && jobGroupOf(x as JobKind, JOBS[x as JobKind]) === group),
  );
}

/** A family's duties, as a table. */
function dutiesTable(group: string): string {
  const rows = DUTIES.filter((d) => inFamily(d, group)).map((d) => {
    const learns = d.xp
      .map(
        ([k, w]) =>
          `${k === "main" ? "its main skill" : k === "second" ? "its second" : k} ${w}`,
      )
      .join(", ");
    const rung =
      d.to !== undefined ? `${d.from + 1} to ${d.to + 1}` : `${d.from + 1} up`;
    const money = [
      d.bonus
        ? `${chanceWords(d.bonus.p)}: ${d.bonus.what.toLowerCase()} (+${pct(d.bonus.x)} of a month's wage)`
        : "",
      d.mishap
        ? `${chanceWords(d.mishap.p)}: ${d.mishap.what.toLowerCase()}${d.mishap.hurt ? ` (−${d.mishap.hurt} health)` : ""}${d.mishap.x ? ` (−${pct(d.mishap.x)} of a month's wage)` : ""}${d.mishap.heat ? ` (+${d.mishap.heat} heat)` : ""}`
        : "",
    ]
      .filter(Boolean)
      .join("; ");
    const other = [
      d.boss ? `your master +${d.boss.v}` : "",
      d.promo && d.promo > 1 ? `next rung ×${d.promo}` : "",
      d.renown ? `renown +${Math.round(d.renown * 12 * 10) / 10} a year` : "",
      d.biz ? `your business there +${pct(d.biz)}` : "",
      d.heat ? `heat ×${d.heat}` : "",
      d.stress
        ? `stress ${d.stress > 0 ? "+" : "−"}${Math.abs(d.stress)} a month`
        : "",
      d.own ? "for your own good (never asked for)" : "",
    ]
      .filter(Boolean)
      .join("; ");
    const trades = d.for.filter((x) => x !== group);
    return `| **${d.name}**${trades.length ? ` (${trades.join(", ")})` : ""}${d.not?.length ? ` (not ${d.not.join(", ")})` : ""} | ${rung} | ${learns} | ${money || "–"} | ${other || "–"} |`;
  });
  return `| Duty | Rungs | What a month teaches | The month's luck | Besides |
|---|---|---|---|---|
| **The usual work** | all | its main skill 7, its second 3 | – | ${USUAL_TEXT[group as keyof typeof USUAL_TEXT]} |
${rows.join("\n")}`;
}

/** The duties of every family, each under its name. */
function allDuties(): string {
  return JOB_GROUPS.map((g) => `**${g.name}**\n\n${dutiesTable(g.id)}`).join(
    "\n\n",
  );
}

function staffTable(): string {
  const rows = staffRoles("shopkeeper").map(
    (r) =>
      `| **${r.key === "hand" ? "Hand" : r.key === "skilled" ? "Skilled hand" : r.title}** | ${r.pay} | ${Object.entries(
        r.skills,
      )
        .map(([k, w]) => `${k}${(w ?? 0) < 1 ? ` ${pct(w ?? 0)}` : ""}`)
        .join(", ")
        .replace(
          "trade",
          "the trade's skill (a store's: trade)",
        )} | ${r.need} | ${r.text} |`,
  );
  return `| Role | Going pay a month | Skills that count | Least to take it (the computer's people) | What they do |
|---|---|---|---|---|
${rows.join("\n")}`;
}

export const WORKDAY_CHAPTER: Chapter = {
  id: "workday",
  part: "living",
  title: "The work itself",
  line: "What you do at your post, by your rung; your master's wish; the people you work beside; leaving from anywhere.",
  where:
    "Work › Your work (under how hard you work: Your duties; the people you work beside; Hand in your notice). Scenes come as letters.",
  body: `Every trade's days are worked for you ([[work|Work]]); what you choose is how hard you go at it, and now **what you put yourself to**.

## Your duties
Under how hard you work, **Your duties**: the usual work, or one of your trade's duties. Some come only from a rung up and some only below one: an apprentice fetches and carries and watches the master; a journeyman takes orders of his own; a master teaches and keeps the books. A duty:
- **turns what the month teaches** towards other skills (the usual: your trade's main skill 7, its second 3, by the days worked and how hard you work);
- may bring **a little more money** (tips, a piece-rate, a commission, a prize) or **a risk** (a fall, a fever, a cargo spoiled), each with its chance a month, rolled on its own dice (so the world's luck doesn't move), from the same table the page shows. The money is reckoned against a month's wage at your rung; it's in the month's figure as a chance line;
- may please your master, bring **renown**, the **next rung sooner**, a better month for **your own business** there, or (a crooked living) **less heat or more**;
- changes back to the usual when your rung leaves it behind.

${allDuties()}

## Your master's wish
A computer master wants a particular duty of you each month (Work › Your work says which, and marks it *wanted*). Do it that month and he remembers it (+4, for a season). Another player who employs you asks for themselves.

## The people you work beside
Work › Your work names them (up to four): the town's people whose work is at your place, the grown family of your master and of those who work there, and in a small town the labouring families round about. Another player is never one of them in a scene.

Now and then, on a working day at your post with no letters waiting, something comes up: at most about one every ${Math.round(10 / (24 * COLLEAGUE_CHANCE)) / 10} months with the people you work beside, and one every ${Math.round(10 / (24 * MASTER_CHANCE)) / 10} with a computer master. Each scene rests ${SCENE_REST} days; those with the people you work beside rest together ${FAMILY_DAYS.colleagues} days, your master's ${FAMILY_DAYS.masters}:

| Scene | With | What it asks |
|---|---|---|
| A favour | a fellow | Take their turn for a sick child (a friend at work, a long day) or not |
| A trick of the trade | a fellow | Stand them a drink for it, practise it, or know your own way |
| A grievance | a fellow | Talk it through (persuasion), give them the credit, or tell them where to go |
| A rival for the next rung | a fellow | Outwork them, a word in the master's ear (stealth), or let the better one win |
| A collection | a fellow who's hurt (and short) | A day's pay, half a coin, or keep your coin |
| After the week's work | your fellows | A drink at the tavern (half a coin, an easier mind), or home |
| A new boy put under you (rung 3 up) | your master | Teach him properly (leadership), or set him sweeping |
| Work on the Sabbath | your master | Come in for double a day's pay, or keep the Sabbath |
| Mind the place (rung 2 up) | your master | Mind it while he's away (your trade's skill), or say you're not ready |
| Not quite honest | your master | Do as you're told (1 in 6 it comes out), refuse, or refuse and tell the magistrate (1 in 3 he turns you off) |
| A debt to collect | your master | Talk the debtor round (persuasion), lean on him (fighting), or say it's not your work |

Left unanswered, each takes its quiet course (nothing ventured, nobody informed on).

## Leaving your work
**Hand in your notice** on Work › Your work (or at your workplace), from anywhere, whoever your master is:
- **At once**: in person if your master is here, **by letter** if he isn't. In your first ${LURCH_MONTHS} months, a computer master remembers being left in the lurch (−10, for two years).
- **A fortnight's notice**: you work ${NOTICE_DAYS} days more, paid as before, then go. Worked out (${NOTICE_WORKED} working days at your post), your master remembers fair notice given (+4). Take it back while it runs if you change your mind.
- **Another player** who employs you is told (and woken); a place in a player's outfit (a ship's company, a business's staff) is left the same way, and you're off its books.
- An indenture binds until it's served; soldiers don't give notice (in wartime, leaving the colours is desertion); your own trade is simply given up.

> Tip: A duty your master wants, done well, is the quickest way to his good opinion, and his good opinion is half of the next rung.`,
  glossary: [
    [
      "Duty",
      "What you put yourself to at your post: the usual work, or a duty your rung allows. It turns what you learn, and may bring a little money, a risk, renown or your master's good opinion.",
      "workday",
    ],
    [
      "Notice",
      "Leaving your place: at once (in person or by letter), or with a fortnight's notice worked out, which leaves you on good terms.",
      "workday",
    ],
  ],
};

export const STAFF_CHAPTER: Chapter = {
  id: "staff",
  part: "living",
  title: "Staff, partners' offers and companies",
  line: "Your businesses' staff by name (role, pay, promotion), a new business both ways, buying out and selling up by offer, and a company's trade in the markets.",
  where:
    "Estate › Business (each business's card: Its staff by name; the Start a business window); Estate › Partners (each firm: Buying out, selling, selling up); anyone's card (Offer them work).",
  body: `There's no limit to how many businesses, ships and partnerships you own or are in.

## Its staff by name
Besides hands taken on from the town, you can take people on into a business **by name**, each with a role and the pay you set, the way a ship's company is ([[ships|Ships and their companies]]):

${staffTable()}

- **The hands' titles are the trade's own**: a farm's farmhand and husbandman, a shop's apprentice and journeyman, a store's shop boy and shopman, a ship's deckhand and able seaman, a tavern's pot-boy and tapster.
- **A hand by name** is one of its hands, in place of a hand from the town (one is let go if it's full); worth ×${STAFF_FX.hand.base} of a town hand with no skill, up to ×${STAFF_FX.hand.base + STAFF_FX.hand.most}. **A skilled hand** is worth ×${STAFF_FX.skilled.base} to ×${STAFF_FX.skilled.base + STAFF_FX.skilled.most}. **A clerk** puts the takings up to ${pct(STAFF_FX.clerk.most)}; **a foreman** (a middling place or bigger) every hand's up to ${pct(STAFF_FX.foreman.most)}; **a manager** minds it when you don't (it takes all its takings, not 0.6). Each only while at work: the computer's people always are; a player when they're in the town.
- **The town's people**: on its card, in its town, those free to take a place: their skills, the place they'd look for, and for each role and pay whether they'd sign, and why (the pay against what they'd ask, what they think of you, a role beneath them, whether they're up to it): the same reckoning they decide by, with no dice. From anyone's card, **Offer them work** brings you here with them first.
- **Another player**: **Offer a place to a player** (from anywhere, any business of yours), at the role and pay you choose. They're asked in a scene; taken, it's their work (their Work page), paid from your purse by the days they're at their post, and they leave from the usual job menu.
- **Promote, demote, raise or cut the pay, or let them go** whenever you like. The computer's people remember it; a player is told.
- **The month**: their pay is its own line in the month's figure and the books ("Store: its staff's pay"), and in the business's account. Paid under what they're worth, they look about them; unpaid two months, they walk out.

## A new business, both ways
The Start a business window reckons its plan as things stand. If you have other work, that means nobody would mind it, and it would look poor; so it now shows it **both ways**: with **you minding it** (if you gave up your other work), with **a manager** on its staff (the best the town would give, at his pay, in the figures), and with **nobody minding it**: a month once it's going, when it's paid for itself, and two years all told.

## Buying out, selling, selling up
On a partnership's page, **by offer**, not by vote:
- **Buy them out**: name a price for a partner's whole share. **Sell them your share**: name your price. They accept, decline, or name their own price, and you can answer that, up to ${MAX_ROUNDS} rounds. An offer stands ${BID_DAYS} days.
- **Sell up the whole business**: every partner must agree; one who won't may offer to buy you out instead (at a fair price).
- **A computer partner** decides by their interests, and the page shows **the least they'd take** (or **the most they'd pay**) before you offer, from the same reckoning: a fair price (what the share would fetch wound up, and a year of its profit), less if it's losing money, more if it's their living or they're greedy, more or less by what they think of you, and never more than they can find. Within three quarters of their price, they come back with it.
- **Another player** gets a scene: accept, decline, or a quarter more (a fifth less when buying); any price from the page.
- **Nobody can force it**, unless the articles have **the buy-out clause** (a box in the articles): then a partner holding more than half may buy another out at a fair price or more, or sell up, without their consent. Partnerships signed before had no such clause.

## A company's trade and the markets
A trading company's cargo bought at its port moves the price there **as buying the same loads yourself would** (each load counts in full: it used to count ${pct(0.5)}); selling it moves the price where it's sold. Its card says what its trade does to each port's price, and its books and your news say so when a cargo sails and sells. (Now ×${CO_MOVE} a load.)

> Tip: A manager on the staff is what lets a business pay while you work at something else: put the both-ways figures side by side before you start one.`,
  glossary: [
    [
      "Staff by name",
      "People taken into a business of yours by name, each in a role (hand, skilled hand, clerk, foreman, manager) at the pay you set.",
      "staff",
    ],
    [
      "Buy-out clause",
      "A clause in the articles: a partner holding more than half may buy another out at a fair price, or sell up, without their consent.",
      "staff",
    ],
  ],
};
