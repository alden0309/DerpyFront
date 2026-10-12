// BUSINESS (r15): the How to Play's chapter on starting a business: what
// makes one pay (the town's custom, your skill, being there, the hands, the
// months it takes to build custom, the season, the keep and the excise), the
// Start a business window, each business's page, a manager, going in with a
// partner, and a trading company for particular goods. The tables are made
// from the engine's own numbers (TRADE_CUSTOM, CO_GOODS...), so they can't
// drift from what the game reckons.

import {
  MASTER_TAKINGS,
  OVERFLOW,
  RAMP,
  SEASONS,
  skillFactor,
  TRADE_CUSTOM,
  UNMINDED,
} from "../../engine/Business";
import {
  CO_CUT,
  CO_EVERY,
  CO_FACTOR,
  CO_GOODS,
  CO_LANDING,
  CO_LOADS,
  CO_MARGIN,
  CO_RISK,
  CO_SETUP,
  CO_SPOIL,
} from "../../engine/Company";
import {
  BUSINESS_HANDS,
  BUSINESS_UPKEEP,
  EXCISE,
  EXPAND_COST,
  HAND_TAKINGS,
  HAND_WAGE,
  JOBS,
  SHIP_UPKEEP_MULT,
  SKILL_NAMES,
  VENTURE_WAR_PRICE,
} from "../../engine/LifeRules";
import { bizCost, bizJobs } from "../../engine/PartnersCore";
import type { JobKind } from "../../engine/Types";
import type { Chapter } from "./Chapters";

const n = (v: number) => String(Math.round(v * 100) / 100);
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** The months a trade is busiest. */
function busiest(job: JobKind): string {
  const t = TRADE_CUSTOM[job];
  if (!t) return "all year";
  const v = SEASONS[t.season];
  const top = Math.max(...v);
  const list = v
    .map((x, i) => (Math.abs(x - top) < 0.06 ? MONTHS[i] : ""))
    .filter(Boolean);
  return list.length > 2
    ? `${list[0]} to ${list[list.length - 1]}`
    : list.join(", ");
}

/** Every business: what brings its custom, when it's busiest, and what it costs. */
function customTable(): string {
  const rows = bizJobs().map((k) => {
    const def = JOBS[k];
    const t = TRADE_CUSTOM[k];
    const boost = [
      t?.port ? "a port" : "",
      t?.inland ? `little without a port` : "",
      t?.raw ? `the country's ${t.raw.good.join(" or ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    return `| **${def.business}** | ${t?.what ?? "the town's trade"} | ${n(t?.w ?? 0.8)}${boost ? ` (more with ${boost})` : ""} | ${busiest(k)} | ${SKILL_NAMES[def.main]} | ${[1, 2, 3].map((lv) => bizCost(k, lv)).join(" / ")} |`;
  });
  return `| Business | Its custom | Hands' worth for each unit of town | Busiest | Skill | Cost: I / II / III |
|---|---|---|---|---|---|
${rows.join("\n")}`;
}

/** The goods a company may trade, and the laws of trade on them. */
function goodsTable(): string {
  const rows = Object.entries(CO_GOODS).map(([k, g]) => {
    const spoil = CO_SPOIL[k as keyof typeof CO_SPOIL] ?? 0.02;
    return `| **${g!.name}** | ${Math.round(spoil * 100)} in 100 | ${g!.enumerated ? `enumerated from ${g!.enumerated}: English ports only` : "free to any port of your own nation"} |`;
  });
  return `| Goods | Spoils on a voyage | Under the Navigation Acts |
|---|---|---|
${rows.join("\n")}`;
}

export const BUSINESS_CHAPTER: Chapter = {
  id: "business",
  part: "living",
  title: "Starting a business",
  line: "A shop, an inn, a forge, a mill, a store, a ship or a farm of your own; what makes it pay, its page, a manager, a partner; and a trading company for particular goods.",
  where:
    "Estate › Business (Start a business…); the market (Start a business…); Work › Find work (A business of your own); anyone's card (In business) for a partner.",
  body: `A business pays when it's **run sensibly**: a trade you know, in a town with custom for it, at a size the town can use, with you (or a manager) there to mind it. Then it makes money from its first months and pays for itself within a year or two. Badly chosen it loses, and the game says why, before you pay and every month after.

## What makes it pay
- **The town's custom.** Each town has custom for each trade, in hands' worth: more in a bigger town, more for some trades at a port, more where the country makes what the trade works (a mill among wheat fields, a cooperage where fish and tobacco go out in casks). **Rivals** take their share: the innkeeper's own inn, another player's store, a partnership's shop. A hand past the custom brings in only ${Math.round(OVERFLOW * 100)} in a hundred of a hand's takings.
- **Your skill** in the trade: each hand brings in ${n(HAND_TAKINGS)} × (0.6 + skill ÷ 20) a month at full custom (${n(HAND_TAKINGS * skillFactor(4))} at skill 4, ${n(HAND_TAKINGS * skillFactor(10))} at 10), against a wage of ${HAND_WAGE}. Below skill 4 a hand barely earns their wage.
- **Your own work.** Minding it yourself with no other work, your own hand at the counter or the forge brings in about ${MASTER_TAKINGS} a month at skill 8 (more for a master). If it's your own trade's business (the storekeeper's store), your work there is paid as your wage instead.
- **Being there.** Nobody minding it (you're away from the town, or busy with other work) and it takes **${UNMINDED}** of what it should: then a hand doesn't earn their wage, and it loses money. Put in a **manager**.
- **Building custom.** A new business has ${RAMP.map((x) => `${Math.round(x * 100)}`).join(", ")} in a hundred of its custom in its first ${RAMP.length} months, then all of it.
- **The season.** A farm makes most of its year at the harvest, an inn in the travelling months, a ship or a fishing shallop in summer (in the north; less so in the south).
- **The keep and the excise.** A place costs ${BUSINESS_UPKEEP.slice(1).join(", ")} a month to keep at sizes I, II and III (a ship ${SHIP_UPKEEP_MULT} times that), whether or not the custom fills it; the excise takes ${Math.round(EXCISE * 100)} in a hundred of the takings (none in native country).

${customTable()}

Sizes I, II and III have room for ${[1, 2, 3].map((lv) => BUSINESS_HANDS[lv]).join(", ")} hands. A town's size is reckoned from its people (a hamlet about 2, a great port 8).

## The Start a business window
From Estate › Business, the market or Work › Find work:
- **I. What kind, and how big**: every trade the town has the place for, each with its cost and what it should make a month once it's going; and sizes I, II and III. It's set up where you are.
- **II. Its months, one by one**: what it costs to set up (on the button), what it should make once it's going, the month it starts making money and the month it's **paid for itself**, a chart of two years (each month's profit, and a line of all told from what it cost), and the first six months in figures. Nothing in a business runs on dice: the months go as the plan says, unless something changes (a rival, a war, you leave town).
- **III. What drives its takings** and **IV. the risks**, in plain words for this town and for you.
- **Alone** (Set it up) or **with a partner** (Articles…, filled in by the "Found a business together" preset: whoever knows the trade and is free runs it, and the split is fair).

## Each business's page
Estate › Business has a page for every business of yours:
- **The sign**: who minds it, its hands, whether its custom is still building.
- **Last month**, **a month as it stands** (point at it for the takings, wages, keep and excise), **the town's custom** (and its rivals) and what it **would sell for** (half what it cost).
- **The month's account**: a year of months as a chart (from the month's statements), and the last five line by line.
- **Why it makes what it makes**: plain advice, the worst first ("Losing money: nobody minds it (you're busy with other work), so it takes ${UNMINDED} of its takings"; "Too many hands for the trade here"; "Too big for the town"; "Another hand would pay").
- **Running it**: take on a hand from the town (${HAND_WAGE} a month) or let one go; **hands as they pay** (one taken on or let go a month as custom allows; on unless you turn it off); **a manager**; **grow it** (${EXPAND_COST.slice(1).join(", then ")} coins); **sell it**.
- **A warning**: lose money two months running, with no better month ahead, and your journal says so, with why. Losing businesses are listed at the top of the page.

Partnerships' businesses are on the page too, with their advice and how they make money; and your trading companies.

## A manager
One of your people (People › Your people) can **mind a business** for you while you're away or busy: put them in on its page. Their skill in the trade (a clerk's trade, a hand's craft, a mate's seamanship come with their calling) makes its takings, and their own work counts as the master's. You pay their wage as before. Take it back whenever you like.

## Going in with a partner
The articles have **presets** at the top: **Put money into their business as a silent partner**; **Found a business together**; **Take on a partner in mine**; **Pool money for cargoes**; **A trading company together**. Each fills in what the firm holds, who runs it, what each puts in, and the **fair split** (what each brings, a business valued at the more of 0.6 of its cost or twenty months of what it makes, and a share for the work), and says it in plain words: "You put in 30; Agnes puts in her inn. You get 15 in a hundred of what it makes (about +1.2 a month once it's going); Agnes runs it." Change any clause after. See [[partners|Partnerships]].

## A trading company for particular goods
A company buys one kind of goods at its port, ships them, and sells them where you send them, on a cycle you set: **tobacco, sugar and rum, furs, deerskins, salt fish, timber and naval stores, flour, Indian corn, bar iron, cloth, wine, brandy, cacao, spices, dyewood, buffalo robes** and the rest a port's market sells.
- **Setting it up**: ${CO_SETUP} coins for the counting room and its books, and a chest for its cargoes (two cargoes' worth keeps it sailing while the first is at sea). Alone, or with partners as a firm of its own kind.
- **Its trade**: the goods, where it sells (Europe: London, La Rochelle, Cádiz or Seville, Amsterdam, by the nation; or the nearest ports of the Americas), **${CO_LOADS.join(", ")} loads** a cargo, a cargo **every ${CO_EVERY.join(", ")} months**. Its managing partner can change it on its card.
- **Its factors**: one at each port of the Americas it uses (${CO_FACTOR} a month each, and ${Math.round(CO_CUT * 100)} in a hundred on what they buy and sell). Where the country makes the goods they buy from the planters, trappers and millers at their landings, for goods and credit, at ${Math.round(CO_LANDING * 100)} in a hundred of the market's price.
- **The markets' real prices**: its buying dears the price at its port and its selling cheapens it where it sells (Europe's prices sag a little with every load landed). At a fast pace its own trade keeps the prices against it: the odds show what a voyage makes **once it's going**. Its factors **hold a cargo back** while it wouldn't make ${Math.round(CO_MARGIN * 100)} in a hundred, risks and all, and tell you.
- **At sea**: wrecked (about ${Math.round((CO_RISK.wreck.base + CO_RISK.wreck.perDay * 60) * 100)} in 100 across the Atlantic, less along the coast); **taken by a privateer** (${Math.round(CO_RISK.privateer * 100)} in 100) when a nation at either end is at war with a sea power, and freight and insurance dearer; **seized by the customs** (${Math.round(CO_RISK.laws * 100)} in 100) where the laws of trade forbid the voyage; **spoiled in part** (a third lost).
- **Gluts and embargoes**: no ship sails between enemies. The Hudson's Bay Company keeps the Bay to itself (from 1670); the Company of the Indies takes a licence on Louisiana's trade (1719 to 1731).
- **Every voyage** is in its books and your own news (Estate › Ledger), and its cargoes at sea are in the tracker.

${goodsTable()}

Spain's colonies trade only with Spain, and France's only with France (the Exclusif): a cargo from or to them is smuggling, richly paid and sometimes seized. No trade in people: that's no business of a company here.

## Why a business loses money
Measured over many games, these are what lose new businesses money, and what to do:
- **Nobody minds it**: you took other work, or went travelling. It takes ${UNMINDED} of its takings, and its hands don't earn their wages. Mind it, or put a manager in.
- **Not your trade**: below skill 4 a hand barely earns their wage. Start a business in a trade you know, or let a partner who knows it run it.
- **Too big for the town**: a great place costs ${BUSINESS_UPKEEP[3]} a month to keep, and a small town's custom keeps only a few hands busy. Start small; grow when the custom is there.
- **Its first months**: custom takes ${RAMP.length} months to build, and a farm's winter or a ship's frozen harbour bring in little. The plan shows them before you pay.
- **Cargoes in wartime**: privateers take more of them. A cargo that gets through fetches war prices (${n(VENTURE_WAR_PRICE)} times), so a venture about pays, but its luck swings harder.

> Tip: The best start is a small business of your own trade in a town with custom for it, minded by you: it pays from the first months. Point at any figure on its page to see how it's made.

! Pitfall: Taking a job with someone else, or a long journey, leaves your business unminded: it'll say so, and lose money until you're back or a manager is in.`,
  glossary: [
    [
      "Custom",
      "The trade a town has for a business of a kind, in hands' worth: more in a bigger town or a port, less with rivals. Hands past it bring in little.",
      "business",
    ],
    [
      "Minding a business",
      "Being there to run it: its owner in the town with no other work (or at their own trade there), a managing partner who's free, or a manager. Nobody minding it, it takes 0.6 of its takings.",
      "business",
    ],
    [
      "Factor",
      "A trading company's agent at a port: buys and sells its goods for a commission and a small retainer, and holds a cargo back while prices wouldn't pay.",
      "business",
    ],
  ],
};
