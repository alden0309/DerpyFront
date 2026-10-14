// LIFE (r21): the How to Play's words for round 21: skills on thirty levels
// and teaching, health with age and strain, winning people over, positions
// for your own people, a duel to the death, and the bawdy house. Every table
// is made from the engine's own (LifeRules' curve and tiers, Body's tables,
// Regard's WARMTH, Retinue's POSTS, Duels' DEATH, Bawdy's BAWDY, Teach's
// TEACH), so the guide can't drift from what the game does.

import { BAWDY } from "../../engine/Bawdy";
import { HEALTH_AGE, HEALTH_MARKS, STRESS_TIERS } from "../../engine/Body";
import { DEATH, DOWN } from "../../engine/Duels";
import { COWARD_DAYS, MARK_OPINION, STUDY } from "../../engine/LifeR21Core";
import {
  LESSONS,
  SKILL_MAX,
  SKILL_TIERS,
  xpToNext,
  xpToReach,
} from "../../engine/LifeRules";
import { chanceWords } from "../../engine/Odds";
import { REGARD, WARMTH } from "../../engine/Regard";
import { POST_ORDER, postEffect, POSTS } from "../../engine/Retinue";
import { TEACH, teachRate } from "../../engine/Teach";
import type { Chapter } from "./Chapters";

const n = (v: number) => v.toLocaleString("en-US");

/** The thirty levels: what each stretch is called and what it costs. */
function levelsTable(): string {
  const rows = SKILL_TIERS.map((t, i) => {
    const to = SKILL_TIERS[i + 1]?.from ?? SKILL_MAX + 1;
    const last = Math.min(to - 1, SKILL_MAX);
    const per =
      t.from >= SKILL_MAX
        ? "the most there is"
        : `${n(xpToNext(t.from))} to ${n(xpToNext(Math.min(last, SKILL_MAX - 1)))}`;
    return `| ${t.from === last ? t.from : `${t.from}–${last}`} | ${t.name} | ${per} | ${n(xpToReach(t.from))} | ${t.text} |`;
  });
  return `| Levels | Called | XP for each level | XP from nothing to the first of them | |
|---|---|---|---|---|
${rows.join("\n")}`;
}

/** How a teacher's level against yours sets their rate. */
function teachTable(): string {
  const rows = [3, 5, 8, 11, 13, 15].map(
    (gap) =>
      `| ${gap} above you | ×${teachRate(gap, 0)} | ${Math.round(TEACH.base * teachRate(gap, 0) * 10) / 10} |`,
  );
  return `| They stand | They teach at | XP a month (living where you do) |
|---|---|---|
| 1 or 2 above you | ×${TEACH.close} | ${Math.round(TEACH.base * TEACH.close * 10) / 10} |
${rows.join("\n")}`;
}

export const SKILLS_BODY = `## Skills
Twelve: fighting, leadership, persuasion, trade, craft, farming, seamanship, woodcraft, letters, faith, medicine and stealth. Every check in the game leans on one (the odds are shown as a percentage), and trades need them to climb. Point at a skill for what makes it up.

### Thirty levels, each dearer than the last
A skill runs from 0 to **${SKILL_MAX}**. The first ten levels cost what they always did; from 10 each level costs more again, by the square of how far past 9 it is. Under each skill's bar is how far you are toward the next level and what it costs ("120 / 238 to 13").

${levelsTable()}

So a working life spent at a trade makes you skilled, and in time expert; to be a master (20) takes a career's focus and study besides; the ten levels above that are a lifetime's devotion. A check stops at 95 in 100 whatever your level, and in any sum with no ceiling (a hand's takings, a fee, a harvest's pay, your strength in a fight) a level above 20 counts half.

### How skills grow
By doing: your work (working hard teaches faster, overtime faster still), study (with the minister at the church, at the bench in the workshops, physic at the apothecary, an evening in your own study), a tutor (${LESSONS.cost} coins, every ${LESSONS.cooldown} days, at home or the church), someone who'll teach you, and the acts that practise them (drill, hunt, read the gazette, sit at the council fire). Diligent people learn faster at work; the educated learn letters faster.

### Someone to teach you
Their card: **Ask them to teach you**. Before you ask, the window shows the skill they'd teach (their trade's), their level against yours, the **rate** they'd teach at, and a forecast: the next level with them and without, and where a year with them leaves you. They take you on only if they stand at least ${TEACH.gap} above you, and the further above you they stand, the more they teach. As you catch them up it slows; level with them, it stops, and the journal says so.

${teachTable()}

Living elsewhere, they teach a third as much (by letter, and visits).

### Study with the minister
At the church: **Study with the minister: letters, learning, faith** (the priest, or the dominie, by your church). Half a coin a lesson, once a week: letters (10) and faith (3) grow, and every ${STUDY.per / STUDY.pts} lessons your **Learning** grows a point, ${STUDY.most} at most in a life (and never past ${STUDY.ceiling}). The sheet says how many lessons to the next.

## Attributes
Diplomacy, martial, stewardship, intrigue and learning add to the skills they govern: diplomacy to persuasion; martial to fighting, leadership and seamanship; stewardship to trade, craft and farming; intrigue to woodcraft and stealth; learning to letters, faith and medicine.

## Traits
What you're like: brave or craven, honest or deceitful, ambitious or content, robust or sickly and so on. They colour what people think of you and how things go. Some are earned along the way: scarred, famous, a drunkard, gouty (from comfortable living after 45). Some marks last a while: **called a coward** (you ran from a duel to the death), **known at the bawdy house**, **the French pox**.

## Ambitions
Set your heart on something (You › Ambition): rise in your trade, make a fortune, a fine house, marry well, raise a family, make a name, true friends, win office, glory in battle, see the country, master a skill, ruin your rival, lead a cause, and more. The page shows how far along you are. Getting there is worth renown (3 to 10) and peace of mind; giving one up stings.

> Tip: The cheapest way up a skill is a good teacher well above you: a master to a beginner teaches at ×${TEACH.most}.`;

/** The most health there is, by age. */
function ageTable(): string {
  return `| Age | ${HEALTH_AGE.map(([a]) => String(a)).join(" | ")} |
|---|${HEALTH_AGE.map(() => "---").join("|")}|
| The most your health can be | ${HEALTH_AGE.map(([, h]) => String(h)).join(" | ")} |`;
}

function stressTable(): string {
  return `| Stress | ${STRESS_TIERS.map((t, i) => `${t.from}${STRESS_TIERS[i + 1] ? `–${STRESS_TIERS[i + 1].from - 1}` : "+"}`).join(" | ")} |
|---|${STRESS_TIERS.map(() => "---").join("|")}|
| Called | ${STRESS_TIERS.map((t) => t.name).join(" | ")} |
| A hurt takes | ${STRESS_TIERS.map((t) => `×${t.mult}`).join(" | ")} |`;
}

export const HEALTH_BODY = `## Health
From 0 to 100; at 0 you die, and low health makes a sudden death likelier (below 45 the risk rises, below 25 it triples). It mends a little each month by itself, faster when it's low.

### The most it can be
Past 45 the body holds less: the most your health can be falls slowly with the years, between these points. The banner's health bar has a red mark where it stands for you now; point at the number for why.

${ageTable()}

What you carry lowers it further: ${HEALTH_MARKS.map((m) => `${m.label.toLowerCase()} ${m.value}`).join(", ")}. It never falls below 20.

- **Wears it down**: age (from 45, more from 55 and 65), tropical summers, a frugal winter in the north, wounds and fevers, overtime, stress of 70 or more, and traits (sickly, a drunkard, gouty).
- **Mends it**: rest at home (every 21 days), physic at the apothecary (3 coins), the healer in a village (0.5), living comfortably or better, a fine house, a physician of your own.

## Stress
From 0 to 100. At 70 or more it costs you a point of health a month; at 95 strain can hurt you outright.

### Strain makes every hurt worse
Whatever takes health (a wound, a fever, a brawl, a month's wear) takes more of it the more stressed you are. A 10-point wound at ease takes 10; at breaking point, 20.

${stressTable()}

- **Raises it**: hard work and overtime, debt, grief, scandal, threats, living beneath your station.
- **Eases it**: rest at home, a room at the tavern (1 coin), prayer, drink and listen, an evening with your family, shirking at work, a gift to the town, living comfortably, a house of your own, reaching an ambition, a chaplain, an evening at the bawdy house.

> Tip: When stress passes 40, every wound costs half as much again: ease to steady work and spend a week at home before you fight anyone.`;

function warmthTable(): string {
  const rows = Object.entries(WARMTH).map(([why, w]) => {
    let t = 0;
    const steps: number[] = [];
    for (let i = 0; i < 4; i++) {
      t = Math.min(
        w.cap,
        Math.round((t + w.base * REGARD.again ** i) * 10) / 10,
      );
      steps.push(t);
    }
    return `| ${w.act} | "${why}" | +${w.base} | ${steps.map((x) => `+${x}`).join(", ")} | +${w.cap} | ${w.years} year${w.years === 1 ? "" : "s"} | ${w.was} |`;
  });
  return `| Kindness | Remembered as | The first time | The first four times, all told | At most | Remembered | Before round 21 |
|---|---|---|---|---|---|---|
${rows.join("\n")}`;
}

export const OPINION_SECTION = `## Winning people over
Liking takes time. Each kindness is remembered, and **doing it again while they still remember the last adds less each time** (${Math.round(REGARD.again * 10)} in 10 of what the last added), up to a most for each kind:

${warmthTable()}

A gift's first worth goes by its size against their standing (a townsman: 5 coins is +4, 20 coins +11; the great want more). **Everything kind someone remembers of you, all together, counts in full to ${REGARD.soft} and half beyond** ("Kindnesses only go so far" in their opinion's reasons). Unkindness isn't softened.

**Friendship** asks more: "Friendship takes time" (${REGARD.friendTime}), and until you've talked ${REGARD.knowTalks} times "You hardly know each other" (${REGARD.stranger}); talk ${REGARD.manyTalks} times or more and "You've passed many an hour" (+5). In practice: a few months of talk, a gift or two and a kind word, and someone who already thinks fairly well of you.

## Their stats
Anyone's card has **Their stats**: in a fight (their fighting, their health or how they look, the traits that tell in a duel, your odds against them with swords and pistols and to the death), their attributes and skills, and what they think of you. You see what you'd know: your family, friends, lovers, a rival, your teacher, your own people and your master exactly; those you've talked with often within 1; those you've met within 3; a stranger only their trade's skill, roughly. A sharp eye (Intrigue 9 or more) reads people a step better. Where you're guessing, the odds are rounded.`;

export const DUEL_DEATH_SECTION = `## To the death
On their card, beside **Challenge to a duel**, is **Challenge to the death**, with the chance they'd take your terms (brave and cruel men lean in, the craven and the content hold back, a man who'd likely lose thinks twice, a sworn enemy wants it). If they won't, it's the ordinary terms. Called out, a challenge comes to the death when the insult weighs enough: a sworn enemy, hatred of ${DEATH.demand} or worse (a cruel man at −50), or ${DEATH.demandGrave} over a wife's honour. Another player is asked, and accepts or refuses.

- **No first blood, no shots into the air, no yielding, no "honour is satisfied"**: with swords it goes on pass after pass until one of you is down (${DOWN} wounds), and the one who's down **dies**; with pistols the seconds load again until someone falls, ${DEATH.pistolRounds} exchanges at most.
- **The odds of the whole of it** are in every scene ("if it goes on: 64% you walk off the field, 36% you're carried off it"), worked out from the same passes and wounds the scenes roll.
- **Run for it**: losing, after the first pass, you may run: you live, but lose ${-DEATH.runRenown} renown, are **called a coward** for ${COWARD_DAYS / 365} years (everyone thinks ${MARK_OPINION.coward.value} the worse of you, the brave and the soldiers ${MARK_OPINION.coward.proud}), the town talks of it, and ${chanceWords(DEATH.runCut)} they cut you as you go. A craven foe who's losing badly may run from you.
- **A dead man's kin**: kill someone in a duel and a grown son or brother may come for you weeks later. A bodyguard stands between you; or face him (fighting), or pay the blood price.`;

/** Every post, what it does by skill, and its extra pay. */
function postsTable(): string {
  const rows = POST_ORDER.map((k) => {
    const p = POSTS[k];
    return `| **${p.name}** | ${p.skill} | ${postEffect(k, 6).words} | ${postEffect(k, 12).words} | +${p.extra} |`;
  });
  return `| Post | Their skill | At 6 | At 12 | A month over their wages |
|---|---|---|---|---|
${rows.join("\n")}`;
}

export const POSTS_SECTION = `## Posts in your household
Like a great house's offices, each of your people can be given a **post** (People › Your people, the picker under each): one person to a post, and each post one person. What they do for you goes by their own skill in it; each post pays a little over their wages (on the picker, and in the month's figure). Someone with no post does what they always did (carry, fight beside you, trade or skipper when sent) and nothing more. Away on a task, a post does nothing until they're back.

${postsTable()}

Hire the learned at the apothecary (**physicians**) and at the church or the press (**tutors**, who also make good secretaries and chaplains); clerks make good stewards and clerks of your accounts; a sword or an old soldier the best bodyguard; a guide the best scout.`;

export const BAWDY_CHAPTER: Chapter = {
  id: "bawdy",
  part: "people",
  title: "The bawdy house",
  line: "An evening at the house by the water: what it eases, and what it risks.",
  where:
    "Here, in a great port or a colony's capital (a town of 1,500 settlers or more): The bawdy house › Spend an evening at the house.",
  body: `In every great port and colonial capital there was a house by the water with its shutters closed by day. The game keeps it plainly and without detail: **only grown people, eighteen and over, on both sides of the door; never anyone held in bondage or bound by indenture** (the house is kept by free women and men who work for themselves, and a bound servant has no evenings to spend); and the scene fades out at the door.

## An evening there
Once a fortnight, a scene with three choices, each with its odds on the button:
- **Punch, cards and a song** (${BAWDY.parlour.cost} coin): stress ${BAWDY.parlour.stress}; ${chanceWords(BAWDY.parlour.seen)} someone sees you.
- **Company for the evening** (${BAWDY.company.cost.join(", ")} coins by your station): stress ${BAWDY.company.stress}; ${chanceWords(BAWDY.company.seen)} you're seen; ${chanceWords(BAWDY.company.pox)} the French pox.
- **Think better of it, and go home.**
Your stealth makes it less likely you're seen (${BAWDY.stealthPer * 100} in 100 a point, to ${BAWDY.seenLeast * 100} in 100 at least).

## What it comes to
- **Seen**: the town talks; the minister thinks 15 the worse of you; for a year you're **known at the bawdy house** (the godly ${MARK_OPINION.rake.godly}, everyone else ${MARK_OPINION.rake.value}); married, it's a scandal. Now and then the minister calls, hat in hand: promise to mend your ways, argue scripture with him, or show him the door.
- **Your husband or wife hears of it** (if you're seen: ${chanceWords(BAWDY.spouseHears)} when they live in the same town, a quarter of that from afar). One of the computer's people confronts you: beg forgiveness (persuasion), deny it (stealth), or brazen it out. Another player is only told what the town is saying, and decides for themselves.
- **The French pox**: it shows itself in two to five weeks: ${BAWDY.poxHealth} health at once, and the most your health can be is 10 less **for good**. Mercury from the apothecary (6 coins) eases the worst of it; it doesn't leave.

> Tip: The parlour is the safe evening. If you're married, remember the town is small.`,
};
