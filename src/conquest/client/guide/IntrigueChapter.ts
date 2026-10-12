// INTRIGUE (r15): the How to Play's chapter on hearts and schemes: winning
// someone (a lover, or someone kept), courting your own husband or wife, a
// promise to marry and the wedding planned as an event, going to a gathering
// you're asked to, plots to kill, and letters to other players in your own
// words. The tables are made from the engine's own (PLOT_METHODS, RITES,
// TIERS, VIGNETTES), so they can't drift from what the game rolls.

import { SPARE_DAYS } from "../../engine/Attendance";
import { gatheringCost } from "../../engine/Gatherings";
import { ADULT_AGE } from "../../engine/IntrigueCore";
import { VIGNETTE_CHANCE, VIGNETTES } from "../../engine/IntrigueEvents";
import {
  NOTE_MAX,
  NOTES_A_DAY,
  NOTES_A_MONTH,
  SUBJECT_MAX,
} from "../../engine/Notes";
import { chanceWords } from "../../engine/Odds";
import { PLOT, PLOT_METHOD_KEYS, PLOT_METHODS } from "../../engine/Plots";
import { FOND, SEDUCE } from "../../engine/Seduction";
import type { GatheringKind } from "../../engine/Types";
import {
  BANNS_DAYS,
  BETROTHAL_DAYS,
  LICENCE,
  RITE_KEYS,
  RITES,
  TIERS,
} from "../../engine/Weddings";
import type { Chapter } from "./Chapters";

const pc = (p: number) => `${Math.round(p * 1000) / 10}%`;

const PLACE_NAMES: Record<string, string> = {
  apothecary: "an apothecary",
  tavern: "a tavern",
  docks: "docks",
};

/** The ways to have someone killed, from the table the engine rolls from. */
function methodsTable(): string {
  const rows = PLOT_METHOD_KEYS.map((k) => {
    const m = PLOT_METHODS[k];
    return `| **${m.label}** | ${m.cost} | ${m.weeks} | ${m.base} in 100 | ${pc(m.find)} | ${chanceWords(m.trace)} | ${m.needs ? (PLACE_NAMES[m.needs] ?? m.needs) : "nothing"}${m.men ? "; only against a man" : ""} |`;
  });
  return `| How | Costs | Weeks | Comes off, to begin with | Found out, a week | Traced, if it fails | The town needs |
|---|---|---|---|---|---|---|
${rows.join("\n")}`;
}

/** How a wedding may be made. */
function ritesTable(): string {
  const who: Record<string, string> = {
    church: "Anglicans, and most Protestants",
    meeting: "Puritans",
    mass: "Catholics",
    home: "anyone, at their own home",
    fire: "the peoples of the land",
  };
  return `| The rite | For | Where | The banns first |
|---|---|---|---|
${RITE_KEYS.map(
  (r) =>
    `| **${RITES[r].label}** | ${who[r]} | ${RITES[r].venue === "home" ? "your home" : RITES[r].venue === "councilfire" ? "the council fire (or the village)" : "the church"} | ${RITES[r].banns ? `three Sundays (${BANNS_DAYS} days), or a licence for ${LICENCE}` : "no: a few days for the families"} |`,
).join("\n")}`;
}

/** How grand a wedding, and what its feast costs in a church. */
function tiersTable(): string {
  return `| How grand | Asked | The feast | The day's scenes |
|---|---|---|---|
${TIERS.map(
  (t, i) =>
    `| **${t.name}** | up to ${t.guests} | ${t.feast ? `${gatheringCost("wedding", "church", t.feast)} coins (in church)` : "none"} | the vows${i >= 1 ? ", the wedding breakfast" : ""}${i >= 2 ? ", the dancing" : ""}${i >= 3 ? ", the toasts" : ""}; the dowry settled; a mishap |`,
).join("\n")}`;
}

const KIND_NAMES: Partial<Record<GatheringKind, string>> = {
  dinner: "dinners",
  feast: "feasts",
  ball: "balls",
  cards: "card parties",
  social: "socials",
  frolic: "frolics",
  raising: "raisings",
  wedding: "weddings",
  christening: "christenings",
  hunt: "hunts",
  funeral: "funerals",
  nfeast: "feasts in a village",
  dance: "dances",
  council: "councils",
  greencorn: "the green corn",
};

/** The evening's vignettes. */
function vignettesTable(): string {
  return `| A vignette | At | What it can come to |
|---|---|---|
${VIGNETTES.map((v) => {
  const title =
    typeof v.def.title === "string" ? v.def.title : v.key.replace(/^v-/, "");
  const at =
    v.kinds === "any"
      ? "any gathering"
      : v.kinds.length > 8
        ? "most gatherings"
        : v.kinds.map((k) => KIND_NAMES[k] ?? k).join(", ");
  const what = v.def.choices
    .map((c) => (typeof c.label === "string" ? c.label : "Ask them to dance"))
    .join("; ");
  return `| **${title}** | ${at} | ${what} |`;
}).join("\n")}`;
}

export const INTRIGUE_CHAPTER: Chapter = {
  id: "intrigue",
  part: "people",
  title: "Hearts and schemes",
  line: "Winning someone, a lover kept, courting your own husband or wife, a wedding planned as an event, going to a gathering, plots to kill, and letters in your own words.",
  where:
    "Anyone's card: Hearts and schemes (Seduce…, Plot against…, Court your wife or husband, Write in your own words…); Society › Intrigue; Society › Gatherings for an invitation's journey; Society › Letters.",
  body: `Everything here is **your own business**: other players are sent none of it (not a plot, not a private letter, not even that a warning came) unless it comes out. And nothing of it is ever done to **another player's character** without their own answer in a scene.

## Winning someone
**Seduce…** on someone's card sets about winning them: a few weeks of attentions, and then they decide.
- **Who:** grown people only, **${ADULT_AGE} and over, both of you**, and **never close kin** (parents and grandparents, children and grandchildren, brothers and sisters and half ones, uncles and aunts, nephews and nieces, first cousins, a step-parent or step-child). They must be here, of the other sex, and you need a few words of their tongue. What happens behind the door isn't told.
- **What you're after:** **as lovers**, or **to keep**: a mistress, or a kept man, with rooms of their own and an allowance of 2 coins a month and more for someone of standing (you'll want two months of it in hand). The allowance is a line of its own in the month's figure.
- **The odds,** shown before you begin, are the ones rolled: ${SEDUCE.base} in 100 to begin with, +${SEDUCE.persuasion} for each point of your persuasion and +${SEDUCE.dip} for each point of diplomacy over 5; half of what they think of you (up to ±25); charming +10; godly −20, upright, honest or content −5, few scruples or fond of a glass +5; married −15 (you married, −5); the same faith +3, a puritan conscience −10; twenty years between you −10; halting talk −5 or −10. To keep: little to live on +15, someone of standing −25. Never surer than ${SEDUCE.max} in 100, nor less than ${SEDUCE.min}.
- **The weeks:** ${SEDUCE.weeks}, more for the great and fewer for the persuasive (2 to 8). A week either of you is away, it waits (six weeks at most).
- **If either of you is married,** each week there's a chance (about ${pc(SEDUCE.find)}, less with stealth, more with a godly husband or wife) that **people notice** before it comes to anything: talk about the town, renown lost, your husband or wife's anger, the minister's, and a husband may call you out.
- **Turned down:** they think the less of you (−20), and won't be asked again for half a year. A godly or upright one tells the town.
- **Won:** you're lovers (an affair, with an affair's risks, if either of you is married: [[love|Courting, marriage and lovers]]). Someone kept is paid on the first of the month; two months unpaid and it's over. **End it** on Society › Intrigue.
- **A child** may come of it. Acknowledge them (yours in law: they may inherit), provide for them quietly (10 coins), or say nothing (the lover won't forgive it, and the town talks).
- **Another player's character** is asked in a scene of their own (with what you offer, if it's to keep), and decides.

## Your own husband or wife
**Court your wife** (or husband), on their card or Society › Intrigue, once in ${FOND.again} days: supper, a walk, the door closed on the world. They think the better of you, and for ${Math.round(FOND.days / 30)} months a child is ${FOND.mul}× likelier (the chance a year is shown). Another player is asked.

## Promised: a wedding planned as an event
**Ask for their hand** (Interactions on their card) costs nothing yet: a yes makes you **betrothed**, and the wedding is yours to plan on **Society › Intrigue** (Plan the wedding…). Or choose **A quiet wedding before the minister**, there and then, for the wedding's fee.

${ritesTable()}

${tiersTable()}

- **The day:** within four months. Besides the feast, the minister's fee and the ring (by your station); a licence if you buy one. It's all paid when you set the day, on the button.
- **The guests:** anyone you could ask to a gathering, players too (people far off are sent a letter).
- **On the day** it's a gathering, and the two of you play its scenes: **the vows** (you're married when they're said; you can bolt for the door), **the settlement** (their family counts out the marriage portion, about 4 coins a step of their standing above a labourer's: accept it, press for half again, or give it back), the wedding breakfast, the dancing and the toasts as grand as you made it, and **a mishap**: an objection at the back of the church, rain, or an uncle on a bench. Your guests have their own evening.
- **Both of you must be there.** A player who isn't puts it off a month (twice; then it's called off, and you're still promised).
- **Breaking it off** costs their family's damages (5 coins and 3 a step of their standing) and their goodwill, and the town talks; at the altar, worse. One of the computer's people who comes to think ill of you cries off; ${Math.round(BETROTHAL_DAYS / 365)} years with no wedding and their family finds another match.

## Going to a gathering you're asked to
On **Society › Gatherings**, an invitation somewhere else shows the journey: the days by the quicker way (road or sea), and the fare there (and home, if you tick **Come home after**). **Accept, and go** (or **Set out for it**, if you've said yes): you set out in good time, ${SPARE_DAYS} days to spare; travel on the map, with the road's adventures; arrive (a scene: a room at the inn, the host, or the town); play the evening; and come home afterwards if you asked to. Leave of your own accord and nothing fetches you back; **Don't go after all** stays put. Other players going are named on the invitation: you'll see each other there.

Besides the gathering's own turns, about ${chanceWords(VIGNETTE_CHANCE)} turns after the first is a **vignette**, about one of the computer's people there. Each rests a while, and kinds of them rest together, with the [[events|event pacing]]:

${vignettesTable()}

## Plots
**Plot against…** on someone's card: whom, and how. The window shows the cost, the weeks, the chance it comes off and the chance it's found out on the way, before you begin: the same numbers that are rolled.
- **Whom:** anyone grown you know (met, or of public note) who's within reach where you are. **Never a child**, nor your husband or wife, nor your own blood. Two plots at a time at most.

${methodsTable()}

- **What changes it:** your skill for the way (×1.5) and your intrigue against their wits (×1.5 each); someone of standing has servants and friends about them (−4 a step over a yeoman's, and a week longer for the great); a strong constitution, a brave man, a drunkard, a coward who may refuse the challenge; and **guards** on them (half the chance). It's never surer than ${PLOT.max} in 100.
- **Found out, a week:** less with your stealth; more with each accomplice (+${pc(PLOT.helperFind)}), each who refused to join (+${pc(PLOT.leakFind)}), sharp wits, and a great household.
- **Accomplices** (Draw someone in…): people here who think well of you. A grudge against them, debts or greed make them willing; honesty, an upright conscience and fear of the rope don't. Their fee (4 coins and 2 a step of their standing) is paid only if they're in; each makes it likelier to come off (+${PLOT.helper} in 100) and to be found out. Up to ${PLOT.maxHelpers}.
- **Done:** they die by the world's own death (a line goes to its heir, offices fall vacant), and the town says it was no accident. It may be traced to you after.
- **Foiled:** they live, know someone wants them dead, and are your enemy for life. It may be traced to you.
- **Found out:** the constable, and a trial ([[trials|Trials]]): for conspiring to murder (transportation for seven years), or for murder if it was done (hanging). Talk goes round either way.

**Against a player,** it's never a simple death. As it ripens they may hear something (a friend's whisper, a strange taste, a man across the street: ${chanceWords(0.15)} a week, more with sharp wits and stealth), and they're **always warned before the moment**. Warned, they can hire men to watch over them (${PLOT.guardCost} coins for ${PLOT.guardDays} days: whoever comes meets them first, and it's foiled), try to find out who (then confront them, or lay an information before the justice), leave town for a while, or put it out of mind. When the moment comes it's **a scene**: three ways to meet it, each a test of a skill, harder the better the plot was laid. Pass and they live; fail and it may be their death (${chanceWords(PLOT.death)}), and then they go on as their heir, as with any death.

## Letters in your own words
**Society › Letters › In your own words, to a player…** (or their card, or **Write back** on one of theirs): a subject if you like (up to ${SUBJECT_MAX} characters) and up to **${NOTE_MAX} characters** of plain text. It goes by the post like any letter: the days of the road or the sea, the postage on the button, and a ship can be lost. They find it in their letter case and read it on letter paper (**Read it**). ${NOTES_A_DAY} a day and ${NOTES_A_MONTH} in thirty days at most. **Only you and they are ever sent the words.**

> Tip: A plot laid with two good accomplices against someone who doesn't know you is likelier to come off, and likelier to come out. Against a player, assume they'll hear of it.

! Pitfall: Courting while married is noticed sooner the longer it takes. Persuasion shortens it; stealth keeps it quiet.`,
  glossary: [
    [
      "Scheme",
      "Something you have going on someone, over weeks: winning them, or a plot. Society › Intrigue shows each as it ripens, with its odds.",
      "intrigue",
    ],
    [
      "Kept",
      "A lover kept at a monthly allowance: a mistress, or a kept man.",
      "intrigue",
    ],
    [
      "Betrothed",
      "Promised to marry, with the wedding still to be planned (or a quiet one before the minister).",
      "intrigue",
    ],
    [
      "Banns",
      "The intention to marry, read out in church on three Sundays before a wedding. A licence lets you marry without waiting.",
      "intrigue",
    ],
    [
      "Vignette",
      "A turn of an evening at a gathering you're at: an introduction, gossip, a match proposed, cards, a song.",
      "intrigue",
    ],
  ],
};
