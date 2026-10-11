// How to Play's chapters (r11 wave 2). Written in the guide's light markup
// (see Guide.ts). Every number here is checked against the engine; where a
// table can be made from the game's own rules (the trades and their ladders,
// the county offices, the boats, the gatherings) it is, so it can't drift.

import { BOATS, CREW_WAGE } from "../../engine/Boats";
import { CONTRACT_PLACES, MAX_CONTRACTS } from "../../engine/Contracts";
import { COMPANY_BOUNTY, COMPANY_PAY, SIGNING } from "../../engine/Followers";
import { GATHERINGS, SCALE } from "../../engine/Gatherings";
import { JOB_GROUPS, jobGroupOf } from "../../engine/JobsData";
import { CARRY } from "../../engine/LifeQueries";
import {
  AWAY_DAYS,
  BENEATH_RENOWN,
  BENEATH_STRESS,
  ENDOWMENTS,
  HOUSES,
  JOBS,
  KIT,
  LAND_GRANT,
  LAND_LOT,
  LESSONS,
  LIFE_MAX_AGE,
  LIFE_MAX_TRAITS,
  LIFE_MIN_AGE,
  LIFESTYLE,
  LODGES,
  PLACES,
  ROAD_COST_PER_DAY,
  ROLES,
  SEA_FARE_BASE,
  SEA_FARE_PER_100KM,
  SKILL_NAMES,
  STATION_NAMES,
  STATION_WAGE,
  WORK_DAYS,
  WORKS,
} from "../../engine/LifeRules";
import { MERCHANT_CUT, MIN_CUT } from "../../engine/Markets";
import { OFFICES } from "../../engine/Offices";
import { SKIP_DAYS_PER_SECOND, SKIP_MAX_DAYS } from "../../engine/Pace";
import { END_YEAR, LETTER_SECONDS } from "../../engine/Rules";
import {
  BOOK_COOLDOWN,
  BOOK_POINTS,
  LESSON_FEE,
  LESSON_POINTS,
  LEVEL_NAMES,
  LEVEL_POINTS,
  LIVING_POINTS,
  TALK_POINTS,
} from "../../engine/Tongues";
import { EFFORT_ORDER, EFFORTS } from "../../engine/Trades";
import type { JobKind } from "../../engine/Types";

export interface Chapter {
  id: string;
  part: string;
  title: string;
  /** One line under the title: what the chapter is about. */
  line: string;
  /** Where in the game it's found. */
  where?: string;
  body: string;
  /** Words for the glossary: [word, meaning, chapter]. */
  glossary?: [string, string, string?][];
}

export const PARTS: { id: string; title: string }[] = [
  { id: "start", title: "Getting started" },
  { id: "living", title: "Making a living" },
  { id: "people", title: "People" },
  { id: "power", title: "Standing and power" },
  { id: "world", title: "The world" },
  { id: "reference", title: "Reference" },
];

// ---------------------------------------------------------------- tables made from the rules

const n = (v: number) => String(Math.round(v * 100) / 100);
const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const placeName = (p: string) =>
  ({ gaol: "the watch-house", den: "the den" })[p] ??
  lower(PLACES[p as keyof typeof PLACES]?.name ?? p);

/** One trade's ladder: "Tenant farmer 2.5 · Yeoman 4.5 (or buy 20) · ...". */
function ladder(k: JobKind): string {
  return JOBS[k].ranks
    .map(
      (r) =>
        `${r.title} ${n(r.wage)}${r.buy ? ` (buy ${r.buy.cost})` : r.commission ? " (by commission)" : ""}${r.notoriety ? ` (notoriety ${r.notoriety})` : ""}${r.kit === "horse" ? " (a horse)" : ""}`,
    )
    .join(" › ");
}

/** How you get into a trade, from its rules. */
function wayIn(k: JobKind): string {
  const d = JOBS[k];
  const out: string[] = [];
  if (d.selfStart) out.push("take it up yourself");
  if (d.employer && ROLES[d.employer])
    out.push(
      `${d.selfStart ? "or " : ""}ask the ${lower(ROLES[d.employer].title)}`,
    );
  const skills = { ...(d.need ?? {}), ...(d.requires?.skills ?? {}) };
  for (const [sk, v] of Object.entries(skills))
    out.push(`${lower(SKILL_NAMES[sk as keyof typeof SKILL_NAMES])} ${v}`);
  const r = d.requires;
  if (r?.notoriety) out.push(`notoriety ${r.notoriety}`);
  if (r?.coastal) out.push("a port town");
  if (r?.north) out.push("the northern ports");
  if (r?.contacts === "underworld")
    out.push("friends in the underworld (know the den)");
  if (r?.contacts === "natives") out.push("friends among the nations");
  if (r?.contacts === "sea") out.push("friends at sea");
  if (r?.pirates) out.push("pirate waters");
  if (d.ownNation) out.push("your own nation's");
  if (d.native === true) out.push("the native peoples");
  return out.join("; ");
}

function tradesTables(): string {
  return JOB_GROUPS.map((g) => {
    const kinds = (Object.keys(JOBS) as JobKind[]).filter(
      (k) => jobGroupOf(k, JOBS[k]) === g.id && k !== "servant",
    );
    if (!kinds.length) return "";
    return `## ${g.name}\n${g.text}\n\n| Trade | Where | The ladder (coins a month) | Getting in |\n|---|---|---|---|\n${kinds
      .map(
        (k) =>
          `| **${JOBS[k].name}** | ${JOBS[k].places.map(placeName).join(", ")} | ${ladder(k)} | ${wayIn(k)} |`,
      )
      .join("\n")}`;
  })
    .filter(Boolean)
    .join("\n\n");
}

const HOW_FILLED: Record<string, string> = {
  elected: "elected by the freeholders",
  governor: "the governor's commission",
  court: "named by the county court",
  council: "chosen by the town council",
  clan: "raised up by the clan mothers",
};

function officesTable(native: boolean): string {
  const list = Object.values(OFFICES).filter(
    (o) => !!o.native === native && o.key !== "founder",
  );
  return `| Office | How it's filled | Pay | Renown a month | Needs | Its lever |\n|---|---|---|---|---|---|\n${list
    .map(
      (o) =>
        `| **${o.name}** | ${HOW_FILLED[o.how] ?? o.how}${o.years ? `, every ${o.years === 1 ? "year" : `${o.years} years`}` : ""} | ${n(o.pay)} | ${n(o.renown)} | renown ${o.needRenown}${o.orSkill ? ` (or ${lower(SKILL_NAMES[o.orSkill[0]])} ${o.orSkill[1]})` : ""}${o.freehold ? ", a freehold" : ""}${o.church ? ", a Christian" : ""}${o.sex === "women" ? ", a woman" : ""} | ${o.lever ? o.lever.label : "none"} |`,
    )
    .join("\n")}`;
}

function boatsTable(): string {
  return `| Boat | New | Hold (loads) | Berths | Crew | A month with her crew | Guns | Where |\n|---|---|---|---|---|---|---|---|\n${(
    Object.keys(BOATS) as (keyof typeof BOATS)[]
  )
    .map((k) => {
      const b = BOATS[k];
      const where =
        k === "canoe"
          ? "any docks; native villages on the shore"
          : k === "schooner"
            ? "a port (docks, port 1+)"
            : k === "brig" || k === "ship"
              ? "a great port (port 2+)"
              : "any docks";
      return `| **${b.name}** | ${b.price} | ${b.loads} | ${b.berths} | ${b.crew || "none"} | ${n(b.upkeep + b.crew * CREW_WAGE)} | ${b.guns || "none"} | ${where} |`;
    })
    .join("\n")}`;
}

function gatheringsTable(): string {
  return `| Gathering | For | Where | Cost (modest) |\n|---|---|---|---|\n${Object.values(
    GATHERINGS,
  )
    .map(
      (g) =>
        `| **${g.name}** | ${g.who === "any" ? "anyone" : g.who === "native" ? "the native peoples" : "colonists"} | ${g.venues.map(placeName).join(", ")} | ${g.base} |`,
    )
    .join("\n")}`;
}

function livingTable(): string {
  return `| Way of living | A month (colonists / native peoples) | Health a month | Stress a month | Renown a month |\n|---|---|---|---|---|\n${Object.values(
    LIFESTYLE,
  )
    .map(
      (l) =>
        `| **${l.name}** (${l.nativeName.toLowerCase()}) | ${n(l.cost)} / ${n(l.nativeCost)} | ${l.health > 0 ? "+" : ""}${l.health} | ${l.stress > 0 ? "+" : ""}${l.stress} | ${l.renown ? `+${l.renown}` : "0"} |`,
    )
    .join("\n")}`;
}

function housesTable(): string {
  return `| Colonists | Price | Native peoples | Price |\n|---|---|---|---|\n${HOUSES.map(
    (h, i) =>
      `| **${h.name}** | ${h.cost} | **${LODGES[i]?.name ?? ""}** | ${LODGES[i]?.cost ?? ""} |`,
  ).join("\n")}`;
}

function effortTable(): string {
  return `| How hard | Pay | Skill learned | Stress a month | Health |\n|---|---|---|---|---|\n${EFFORT_ORDER.map(
    (k) => {
      const e = EFFORTS[k];
      return `| **${e.name}** | ×${e.day} | ×${e.xp} | ${e.stress ? `${e.stress > 0 ? "+" : "−"}${Math.round(Math.abs(e.stress) * WORK_DAYS)}` : "0"} | ${e.health ? "suffers" : "no change"} |`;
    },
  ).join("\n")}`;
}

// ---------------------------------------------------------------- the chapters

export const CHAPTERS: Chapter[] = [
  // ================================================================ getting started
  {
    id: "start",
    part: "start",
    title: "Your first hour",
    line: "What Derpy Conquest is, what's on the screen, and what to do first.",
    body: `You are one person in the Americas, from your start year (1607, 1650 or 1700) until ${END_YEAR}. The colonies and the native nations go on around you, run by the computer: they trade, quarrel, found towns, make war and peace. What you make of your life is up to you. There is no single goal; a good life might be a farm and a large family, a governor's chair, a fortune in furs, a pirate's hoard, or the rising that throws off the crown.

## The screen
- **The banner** along the top: your portrait and name (click it for You), the date and the clock, your purse, health, stress, renown and favour, and on the right **I want to…**, your letters (the quill), and the menu.
- **The tabs** down the left (along the bottom on a phone): Here, You, People, Work, Estate, Society, Journal and World. Each opens a page beside the map; most have pages of their own along the top. See [[screen|Finding your way]].
- **The map** fills the rest. You're the medallion with your face on it. Click a province to see it; right-click (or hold) to set out for it.
- **The News** panel, bottom right, has the colonies' news as it happens.

## The first hour
1. **Read Here.** It opens on the town you start in: its places (the tavern, the church, the market, the fields...), who's about, and what you can do at each. Your work is marked "your work".
2. **Your work runs itself.** If your upbringing gave you a trade, you're already in it, and every working day at your post is worked for you. Wages come at the month's end. You needn't keep any page open. Choose how hard to work on Work › Your work.
3. **Look around.** Click the places. Drink and listen at the tavern, pray at the church, read the gazette. Meet people: click anyone to see their card, what they think of you, and what you could do with them.
4. **Set an ambition** (You › Ambition). It gives the first years a shape, and reaching it is worth renown.
5. **Let time run.** The clock starts paused. Press the play button or Space. At 1× a day takes three seconds; faster speeds and **skip ahead** are there for the quiet stretches ([[time|Time and pace]]).
6. **Answer your letters.** Things that happen to you arrive as letters with choices. Alone, the game pauses for them.

> Tip: Don't know where something is? Press **I want to…** (or the / key) and type what you want: "buy a house", "hire men", "learn Spanish". Every page also has a **?** that opens its chapter of this guide, and every number can be pointed at (or tapped) for what it means and how to raise it.

## What to aim at, early on
- Climb the first rungs of your trade: wages rise fast at first.
- Make two or three friends: friends forgive, lend and stand by you.
- Put a little by. A house of your own (a cottage is ${HOUSES[0].cost} coins) eases the mind and lifts how people see you.
- Marry, if you want heirs: when you die you carry on as your heir, and with no heir your story ends.
- Keep stress under 70 and health above half.

! Pitfall: Living beneath your station costs you stress and renown every month once you could afford better. Check Estate › Purse when your work moves up a rung.`,
  },
  {
    id: "maker",
    part: "start",
    title: "Making a character",
    line: "The register: your people, who you are, your arms, your upbringing, what you're good at, and what you're like.",
    where: "The register, before you set out (and when you begin a new life).",
    body: `The register has six parts. Every part has a **Roll** button: make as much or as little of it as you like, then **Sign the register** and set out.

## I. Your people
Choose a colonial power (England, France, Spain, the Netherlands or Sweden, where each has colonies in your start year) or one of the forty-odd native nations, then the place you're born. Your people decide your tongue, your faith, the trades open to you, who your neighbours are, and which nation's law you live under. Each start year has its own map: in 1607 there's very little of the colonies; by 1700 the coast is crowded.

## II. Who you are
Your name, man or woman, your age (${LIFE_MIN_AGE} to ${LIFE_MAX_AGE}) and your faith. Young characters get fewer points but a long life ahead; seasoned ones more points and fewer years. Then **your likeness**: a gallery of real portraits of the 1600s and 1700s. Filter by years, people, station, hair, what's on the head and dress, pick the closest face, then tune the hair and clothes' colours, the shade, when you grey, and which way you face. You can sit for a new likeness at any time later (You › Yourself, under your name).

## III. Your arms
A coat of arms (or, for the native peoples, your clan's sign), your colours and a motto. Your colours frame your portrait and banner.

## IV. How you were brought up
Your upbringing sets the work you start in (if your home has the place for it), your purse, your first skills and how well known you are. Upbringings are grouped: the land, crafts, the sea, trade and taverns, the learned and genteel, arms, the law, the wrong side of the law, and your people's work. Crooked upbringings start with a name in the underworld and know the den. Any trade can be taken up later in life, too.

## V. What you're good at
- **Attributes**: diplomacy, martial, stewardship, intrigue and learning. Each starts at 5; you have 3 points to raise them (4 from age 25, 5 from 33). They add to the skills they govern.
- **Skills**: twelve, from fighting to stealth. You have 8 to 16 points by your age (more for some upbringings); skills above 7 cost 2 points each. They grow by doing.

## VI. What you're like
Up to ${LIFE_MAX_TRAITS} traits, paid for with 2 trait points. A flaw gives points back. Others (scarred, famous, a drunkard...) are earned along the way.

> Tip: The trade you start in matters less than you'd think: every trade can be found or taken up later. Choose the people and the place you'd like to live among.`,
  },
  {
    id: "lives",
    part: "start",
    title: "Five example lives",
    line: "How a life can go: a farmer's rise, a soldier, a merchant captain, a rogue, and a native trader turned diplomat.",
    body: `None of these is a recipe; they show how the parts of the game fit together.

## A farmer's rise (English, Virginia, 1650)
1. You start a **tenant farmer** (2.5 a month) for a planter. Work hard for the first year: you learn faster and promotion comes sooner.
2. After 12 months and farming 6, buy **a freehold of your own** for 20 coins at the fields: you're a **yeoman** (4.5), your own master, and a freeholder can vote and stand for the assembly.
3. Buy a cottage, then ten acres at a time (${LAND_LOT.cost} each) to let to tenants. Marry, and name your eldest your heir.
4. Stand as **selectman** or **churchwarden** at the county's poll (Society › Office); do the duty every month. Then stand for the assembly at the governor's house.
5. At 36 months as a freeholder, farming 11 and renown 15, buy a **plantation** (90): a **planter**, 11 a month, and the station of gentlefolk: they live comfortably, under a roof of their own. Live up to it, and your children start well.

## A soldier (French, Quebec, 1700)
1. Enlist with the sergeant at the fort: **private**, 2.5 a month. You march with the army wherever it goes, and share its battles: wounds, renown, promotion.
2. Drill at the fort to raise fighting and leadership. Corporal at 8 months, sergeant at 16.
3. A commission (lieutenant and up) comes from the marshal, the governor or a patron who thinks well of you, or can be bought: a lieutenancy is 40 coins.
4. As a **captain** you can raise a company of your own; as a **colonel** you can take command of an army where it stands and march it yourself.
5. Wartime is when soldiers rise. In peace, garrison life is slow: take contracts, or stay behind in garrison to travel.

## A merchant captain (Dutch, New Amsterdam, 1650)
1. Sign on at the docks as a **deckhand**. Sea passage is free while you sail.
2. Buy and sell between ports as you go: buy where a good is made, sell where it's wanted, spread your loads ([[markets|Markets]]).
3. Buy a boat of your own: a shallop (18) for the bays, then a sloop (70). Sign on a crew; in port, put her to the coasting trade.
4. Hire a **mate** to skipper her while you're ashore, and a **clerk** to run trading trips with your stake.
5. Venture cargoes on the next ship out (the docks) and buy company shares (the market). A ship of your own (90 at the captain's rung) makes you a **ship's captain**.

## A rogue (English, Boston, 1700)
1. Pick a pocket at the market, or listen for the underworld at the tavern to find the den.
2. Take up **thieving** (pickpocket) at the market or the den; once you know the den, **smuggling** at the docks too. Every crooked day draws heat; watch the badge on your work and Work › The law.
3. When the heat climbs, lie low at the den (4 coins) or leave that colony for a while.
4. Notoriety opens the higher rungs: cutpurse, housebreaker, master thief, gang boss. A gang boss keeps more people: a band of rogues pulls jobs for a share.
5. Get caught and it's the gaol and the quarter sessions. Plead well, or buy the court; a record makes the next sentence worse.

## A native trader turned diplomat (Lenape, the Delaware, 1650)
1. Start a **trader** at the village or the trading ground: buy what the colonists make, sell furs and deerskins.
2. Learn the colonists' tongue: lessons from a fluent trader (4 coins), and talk with them as you trade.
3. Carry gifts to the council fire; speak at the council. Your **elders' regard** (favour) and renown grow.
4. Take up **speaking between peoples** (Work › Find work shows what it asks): go-between, interpreter, sworn interpreter, then **agent to the nations**. The colonies and your own council both need someone who speaks for both.
5. Sit at the council fire, become a speaker, and when the leader dies the elders may choose you.`,
  },
  {
    id: "screen",
    part: "start",
    title: "Finding your way",
    line: "The tabs and their pages, I want to…, the ? on every page, and the words that explain themselves.",
    body: `Everything has one home. Each tab always shows the same pages along its top, so things stay where you left them.

| Tab | Its pages | What's there |
|---|---|---|
| **Here** | (the town's places) | The town you're in: its places, your work there, what you can do at each place (with costs), who's about, and the rarer things (work to be had, people for hire, contracts, the boatyard, the underworld) under headings that open |
| **You** | Yourself · Ambition · Family · Tongues | Your health, stress, renown and favour, skills and traits; what you've set your heart on; your spouse, children, heir and friends; your languages |
| **People** | People you know · Your people | Everyone you know and what they think of you; those in your service, your company, and who's for hire in town |
| **Work** | Your work · Find work · Contracts · The law | Your place and its ladder; everyone hiring in town and every trade; contracts; heat, notoriety, the den and the watch |
| **Estate** | Purse · House & land · Boats · Goods | Money in and out and how you live; houses, land and gifts to the town; boats; what you carry and owe |
| **Society** | Standing · Office · Letters · Gatherings · Causes · Colony | Renown, favour, the assembly and the road to governor; the county's offices; letters; gatherings; movements; founding a settlement |
| **Journal** | Diary · Leads · The story | What happened to you; leads worth chasing; the story so far |
| **World** | | Wars, risings, the colonies and nations, the other players |

## I want to…
The **I want to…** button (in the banner, on every page's top bar, and the / key) is a searchable list of the things people come to do: buy a house, find work, hire men, buy a boat, write a letter, host a feast, stand for office, learn a language, found a colony and many more. Each says where it's done and what it takes, ticks off what you have, and takes you there.

## The ? on every page
Every page's top bar has a **?** that opens this guide at its chapter. The ? key does the same.

## Words and numbers that explain themselves
Anything underlined with dots can be pointed at (or tapped, or tabbed to): a number shows what made it, line by line; a word like renown or favour says what it is, what it's for, and how to raise it. Every greyed-out button says why, and what would open it.

## Notices that lead somewhere
News of your own life slides down from the top. When it's something to act on (a letter, a lead, an invitation, your work, your people, your boats) it has a › and clicking it takes you there.`,
  },
  {
    id: "places",
    part: "start",
    title: "Places and things to do",
    line: "The Here page: a town's places, what each offers, and who's about.",
    where: "Here (and any town you click on the map, for a look from afar).",
    body: `A town has its places, and what you can do depends on where you stand. Click a place to step into it (it costs nothing).

| Place | What it's for |
|---|---|
${(
  [
    "tavern",
    "market",
    "church",
    "docks",
    "fort",
    "workshop",
    "press",
    "fields",
    "governor",
    "apothecary",
    "woods",
    "village",
    "councilfire",
    "home",
  ] as const
)
  .map(
    (k) => `| **${PLACES[k].name.replace(/^The /, "")}** | ${PLACES[k].text} |`,
  )
  .join("\n")}
| **Watch-house** | The watch and the gaol: make amends, raid the den, join the watch, hunt rewards. |
| **Den** | The underworld: lie low, buy papers, square the watch, plan a big job, crooked trades. Found, not seen. |

## Which towns have what
- Every colonial town of 50 or more has a tavern, a market and the fields.
- A church where there's one built (or 400 people); docks where there's a port; a fort where there's one built, and at the capital.
- The governor's house at the capital (and courthouse towns); the printing house at the capital or a town of 2,500, once printing has come.
- An apothecary at the capital or a town of 1,500; workshops at 600 or with a smithy, mill or the like.
- A watch-house at 500 (and at capitals and court towns); a den at 900, at capitals, and in ports of 400.
- Native towns have the village, the council fire, the fields and the woods, and a trading ground on the coast or at the capital.

## What a place shows
1. **Your work**, if this is your workplace: the month's days, how hard you're working, the next rung.
2. **Things to do**, grouped: work and trade, passing the time, learning, buying, and society, office and causes. A small coin on a button shows what it costs; odds (a percentage) show a skill check. Greyed buttons say why.
3. **Here now**: who's in the place, what they're doing, and what they think of you. Click anyone for their card.
4. Under headings that open, with how many: **Work to be had**, **People for hire**, **Contracts**, **The boatyard**, **The den's business** or **The law**, **Causes** and **Under arms here**.
5. **The talk here**: news and rumours that have reached the place.

> Tip: You needn't click through every place to find work or men: Work › Find work and People › Your people list everything in town.`,
  },
  // ================================================================ making a living
  {
    id: "time",
    part: "living",
    title: "Time and pace",
    line: "The clock, the speeds, skipping ahead, and letters that wait for an answer.",
    where:
      "The clock in the banner: pause, 1×, 2×, 4×, 8× and skip ahead (keys Space, 1–4 and 5).",
    body: `The world runs day by day. At **1×** a day takes three seconds; **2×**, **4×** and **8×** run two, four and eight days in the same time. Space pauses.

## Skip ahead
The **⏩** button (key 5) runs the days fast (${SKIP_DAYS_PER_SECOND} a second) until something needs you, then drops back to the speed you had. It stops for a letter or event to answer, arriving somewhere, a matter at work, a promotion or the sack, the court, your people coming home or leaving, news of your boats, your company, a birth or death in the family, and a battle you're in. It never runs more than ${SKIP_MAX_DAYS} days at a stretch, and can't start while letters are waiting for an answer.

## Work while time runs
Your days at your post are worked for you; wages come at the month's end. You don't need to keep any page open, and you can be anywhere else in the same town.

## Letters that wait for an answer
What happens to you comes as a letter with choices, and the odds of each. Alone, the game pauses when one arrives. In company, a letter waits ${LETTER_SECONDS} seconds of running time for your answer; then it decides itself (the countdown shows on it).

## In company
The host sets the speed. Anyone may pause, but only the host starts the clock again. To skip ahead, everyone living a life must agree: the first click asks, and the others click the same button to agree.

> Tip: Use skip ahead for long quiet stretches (a voyage, a winter at your post). It always stops when something needs you.`,
  },
  {
    id: "work",
    part: "living",
    title: "Work",
    line: "Your place, how hard you work, matters at work, and climbing the ladder.",
    where: "Work › Your work; and Here, at your workplace.",
    body: `Every trade is a ladder of rungs, each paying more. You hold one job at a time.

## Your days at your post
Each working day at your post is worked for you (Sundays off): ${WORK_DAYS} days make a month's wage, paid at the month's end. Days away from your post count against you: after about three weeks you're warned, and at ${AWAY_DAYS} days away the place is gone (except in work that goes to sea, takes the road, or can be done anywhere). Soldiers march with their army; their post goes where it goes.

## How hard you work
${effortTable()}

Working hard brings promotion sooner; shirking puts it off, and your master may catch you at it. In crooked work, harder work also draws more of the law's heat.

## Matters at work
About once a month (more if you work hard) a matter comes to you as a letter: a task to take on (a skill check, for coins, renown and a good word from your master) or trouble to handle (a fault in the work, a quarrel, a theft). Each trade has its own.

## Climbing
Work › Your work shows the ladder and what the next rung needs: months at your rung, your skills, sometimes renown, your master's good opinion, or coins. When everything's ticked, promotion comes with a good month's work, or ask for it (your master's card, or the button at your workplace).
- **Bought rungs**: a freehold, a shop, a press, a ship. Buy it at your workplace (Buy …) when the rest is ticked.
- **Commissions** (officers): given by the marshal, the governor or a patron who thinks well enough of you; some can also be bought.
- **Your own business**: at the top rungs of many trades you're your own master, with hands to hire (offer anyone work from their card) and takings that pay better than wages.

## Leaving
Hand in your notice (your master's card, or Work › Your work). Leaving soon after starting doesn't go down well. An indentured servant is bound until the indenture is served (or runs away from the fields).

> Tip: Work hard in your first years, then ease to steady when stress climbs past 50.`,
  },
  {
    id: "trades",
    part: "living",
    title: "Every trade",
    line: "Every line of work in the Americas: where it's done, its ladder, and how to get in.",
    where:
      "Work › Find work (who's hiring in town, what you can take up yourself, and the full list).",
    body: `Work is given, not found: a master, a planter, a sergeant or a merchant takes you on (ask them; they'll say yes, or why not). Some trades you can simply **take up** yourself: traplines, fishing, the watch, the militia, thieving, the road. Work › Find work lists everyone who hires in the town you're in, with their answer before you ask, and what you can take up on your own.

The ladders below are the rungs and their pay a month. "Buy" is the price of a rung that can be bought.

${tradesTables()}

> Note: Indentured servants (Indenture, at the fields) are bound for years for their keep and their passage, with freedom dues at the end.`,
  },
  {
    id: "money",
    part: "living",
    title: "Money, station and living",
    line: "Your purse, the month's money in and out, how you live, and what your station expects.",
    where:
      "Estate › Purse (and the purse in the banner: point at it for the month's sums).",
    body: `Point at your purse in the banner for the month's money line by line. Estate › Purse has the full ledger.

## Coming in, going out
- **In**: wages (by the days you've worked), rents from land, a business's takings, office fees, dividends, your family's allowance while you're young.
- **Out**: how you live, your family's keep, tithes and church rates (6 in a hundred of what you earn, for Christian colonists), the colony's taxes on earnings (2 to 7 in a hundred), rates on a house, excise and upkeep on a business, wages to your people, and the keep of a horse, a carriage, a pew and your boats.

## How you live
${livingTable()}

## Station
Where the town ranks you: ${STATION_NAMES.join(", ")}. It's set by what your rung pays (${STATION_WAGE.map((w) => `${w}`).join(", ")} coins a month or more lift you a station each), the offices you hold (the assembly, the council, the governor's chair), your renown (60 and 150), and a fine house or a mansion. Each station expects a way of living, and from gentlefolk up a house (any roof of your own, then a fine house, then a mansion).

Live beneath your station while you could afford better (twice the expected living in your purse) and it costs **${BENEATH_STRESS} stress and ${BENEATH_RENOWN} renown a month for each step short**. When money's short, people pity you rather than talk.

## Things to buy
| Thing | Price | Keep a month | What it does | Where |
|---|---|---|---|---|
| **${KIT.tools.name}** | ${KIT.tools.cost} | none | ${KIT.tools.text} | a workshop, the market, a village |
| **${KIT.horse.name}** | ${KIT.horse.cost} | ${KIT.horse.upkeep} | Overland journeys take two thirds the time | the market, the fields, a village |
| **${KIT.carriage.name}** | ${KIT.carriage.cost} | ${KIT.carriage.upkeep} | Journeys take half the time; does half the work of living genteelly | the market |
| **${KIT.pew.name}** | ${KIT.pew.cost} | ${KIT.pew.upkeep} | ${KIT.pew.text} | the church |
| **A tutor** | ${LESSONS.cost} | | A month of evenings on what your next rung needs most (every ${LESSONS.cooldown} days) | home, the church |

## Money at work
- **Venture a cargo** (the docks): your stake rides on the next ship out and comes home months later: lost at sea, sold at a loss, at a fair price, or for a fortune. More are lost in wartime.
- **Shares in a company** (the market): a small dividend every month, a price that rises and falls, and now and then a bubble that bursts. Sell on Estate › Purse.
- **Borrow** from someone who likes you (their card): repaid with a fifth again within the year.

An officer keeps himself out of his commission's pay (mess bills, uniforms, horses and servants): about a fifth of it.

! Pitfall: Debts come due, and are paid from your purse on the day. If you can't pay, the lender holds it against you for three years, you lose a little renown and gain stress, and the debt comes due again in three months.`,
  },
  {
    id: "property",
    part: "living",
    title: "Houses, land and gifts",
    line: "A house of your own, land to let, a business, and gifts to the town.",
    where:
      "Estate › House & land; or the market, a village or your home (a house), the fields (land), the governor's house (a grant).",
    body: `## A house of your own
Buy one wherever you're settled: on Estate › House & land, or at the market, a village or your home. It's in the town you're in; your household moves in with you. A better one replaces it for its price less half the old one's worth.

${housesTable()}

A house eases the mind every month (more for a better one); from a house up it adds a little renown, and a fine house or a mansion your health too. From gentlefolk up your station expects a house **at your home** (the town you live in). Colonists' towns levy rates on houses.

## Land
- **Ten acres** for ${LAND_LOT.cost} coins (Estate › House & land, or the fields), up to ${LAND_LOT.max * 10} acres in a town. Let to tenants: ${LAND_LOT.rent} a month in rent for each ten acres. Land makes you a freeholder, with a vote.
- **A land grant** (${LAND_GRANT.lots * 10} acres for ${LAND_GRANT.fee} in patent fees): petition at the governor's house, if the governor thinks well of you (opinion ${LAND_GRANT.opinion}); once in three years.
- Land isn't bought and sold among the native peoples.

## A business
At the top rungs of many trades the shop, the press, the mill, the tavern or the ship is yours. Hire hands for it (offer anyone work from their card): each costs wages and brings in takings. Grow it (45, then 120 coins) for room for more hands.

## Gifts to the town
Once a year each, on Estate › House & land:
${Object.values(ENDOWMENTS)
  .map(
    (e) =>
      `- **${e.label}** (${e.cost} coins): +${e.renown} renown, a little favour. ${e.text}`,
  )
  .join("\n")}

And the great works, at the church (an almshouse, a church) and the governor's house (a college):
${Object.values(WORKS)
  .map(
    (w) =>
      `- **${w.label}** (${w.cost} coins): +${w.renown} renown${w.need ? `; you need renown ${w.need} to be taken seriously` : ""}. ${w.text}`,
  )
  .join("\n")}`,
  },
  {
    id: "markets",
    part: "living",
    title: "Markets and trade",
    line: "Buying and selling goods between towns, and why prices move.",
    where:
      "A town's market or docks, or a native village: Buy and sell goods. What you carry: Estate › Goods.",
    body: `Every market has its own prices. The market page shows each good with your buying and selling price, a little chart of the last months, and whether the town has it, has plenty, is glutted or short. A line at the top says what's moving prices here now.

## How prices behave
- **Every load you buy makes the next dearer; every load you sell makes the next cheaper.** Selling the same good again and again in one place drives its price right down.
- Prices drift back to normal over two or three months.
- **Seasons**: corn is cheap after the harvest and dear in spring; prime furs come in spring; tobacco after the cure; sugar during the grinding; fish dear in a northern winter.
- **War** makes guns, tools and food dearer. A colony at war is blockaded: imports dearer, exports cheaper. A besieged or occupied town is dear for everything.
- **News** shakes prices: failed or bumper harvests, a glut of furs, no ship from home, a fire in the warehouses. It's talked about in the taverns.
- Merchants take a cut on each side (${Math.round(MERCHANT_CUT * 100)} in a hundred); trade skill and a shrewd nature shave it, never below ${Math.round(MIN_CUT * 100)}.

## Making a deal
Click a good, choose buy or sell and how many loads; the deal box shows the total, the average a load, and how the price here will move, before you confirm.

## Carrying
You can carry ${CARRY} loads (goods and wares together); hands in your service carry more, and your own boat's hold more still.

> Tip: Buy where a good is made, sell where it's wanted, and spread your loads across several towns. Ports take more of the export goods. Read the gazette for prices at the nearest ports.`,
  },
  {
    id: "wares",
    part: "living",
    title: "Each people's own goods",
    line: "Wares only one people makes, cheap at home and dear where they're wanted.",
    where:
      "Shown with small pictures in a market; and as \"Known for\" on every province's and nation's page.",
    body: `Besides the ten common goods (grain, fish, furs, tobacco, sugar, timber, silver, guns, tools, cloth), each people has wares of its own.

| People | Their wares |
|---|---|
| English | woollens; tobacco from Virginia |
| French | brandy and wine; furs |
| Spanish | cochineal and chocolate, wine; silver |
| Dutch | fine cloth, spices and gin |
| Portuguese | brazilwood (in the big ports) |
| Swedish | iron |
| The northeast coast peoples | wampum |
| The farming peoples | maize |
| The southeast | deerskins |
| The north woods | birchbark canoes |
| The pueblos and the south | pottery |
| The plains | buffalo robes |

They're cheap where they're made and fetch most where they're wanted: the native peoples prize woollens, iron, fine cloth, brandy and gin; colonists pay for wine, spices, chocolate, deerskins and canoes (the French voyageurs above all); the Dutch take wampum as money.

## Gifts at a council fire
At a native village's council fire, **Lay gifts before the council** (also at the bottom of the village market) gives a load to the elders: the chief remembers it, the nation thinks better of your people, and you gain renown. Woollens, iron, fine cloth, brandy and wampum count double. Once a month.`,
  },
  {
    id: "leads",
    part: "living",
    title: "Leads: news worth chasing",
    line: "Gold in the hills, a wreck on the reef, cheap land, a price on an outlaw's head. Some of it's even true.",
    where:
      "Journal › Leads (each is also pinned on the map with a red seal). Hear them at the press, the tavern, the market, a village and the docks.",
    body: `## Hearing of one
- **Read the gazette** (the printing house or the tavern): up to two leads a time, and the better-checked stories.
- **Drink and listen** (the tavern) and **Listen to the talk** (the tavern, the market, a village, the docks): one about half the time, and anything goes.
- **News from Europe** (the docks).

Leads reach a place at the speed of talk (the gazette's faster, by post). Each lead shows what the story is, where (with the distance), when and from whom you heard it, and how far you'd trust it (a percentage: better Letters judges print better, better Persuasion judges talk better).

## Kinds
Gold in the hills, a silver lode, a wreck with cargo, a lost mine, buried pirate treasure, cheap land, a ship needing hands, a price on an outlaw's head, a valley thick with beaver, a pearl bed, a disputed inheritance, a mineral spring.

## Working a lead
Go to the place: **Your leads here** appears at the top of the Here page, with the ways to work it, each with its odds, days and cost.

| Way | Days | Cost | Skill |
|---|---|---|---|
| Pan the creeks | 7 | 1.5 | woodcraft (safe) |
| Prospect | 10 | 4 | woodcraft |
| Mine the claim (after a strike) | 20 | 12 | craft |
| Dive | 6 | 5 | seamanship (risky) |
| Dig | 5 | 2 | letters |
| Search, sign on, hunt him down, search the records | 7 | 3 | by kind |
| Survey, scout the valley, find the spring, see the surveyor | 8 | 3 | by kind |

You must stay until it's done; leaving abandons the work.

## What comes of it
Whether the story was ever true is settled the first time anyone works it. False: nothing (and a little stress). True: by your skill check, a good share of what's there, a little, or nothing this time (try again). Others who heard the same story come too, and take their share as time goes on.
- **Gold and silver**: a strike brings a letter: keep it quiet and keep digging, ride into town and shout it (renown, and a rush), or sell the claim to a company for about a third of what's left.
- **Furs**: loads of furs, and the valley is known to be rich from then on.
- **Cheap land**: ten acres at half price. **A ship needing hands**: a month's voyage for wages. **An outlaw**: the reward and renown (and danger). **An inheritance**: coins after the lawyers. **A spring**: health, calm and renown.

> Tip: Read the gazette every ten days or so. A lead near home that you'd trust 40% or more is worth a week.`,
  },
  {
    id: "boats",
    part: "living",
    title: "Boats of your own",
    line: "Buy a boat, crew her, sail her for no fare, and put her to work.",
    where:
      "Estate › Boats; a port's docks (The boatyard); canoes also at native villages on the shore.",
    body: `${boatsTable()}

Second-hand boats are cheaper, each with a condition and a quirk ("leaks a little", "quick off the wind", "crank in a blow"). Shipwrights build their own a quarter cheaper; native peoples pay ${"1.5"} for a canoe. A family can see to four boats at most.

## She stays where you leave her
A boat never follows you on her own: she lies at the port you last sailed her to, shown on the map with her name when you zoom in.

## Crew
Sign hands (${"1"} coin each) up to what she needs; they're paid ${CREW_WAGE} a month each, on top of her keep. Unpaid, they mutter, then go ashore for good. Repair her at a yard, sell her for her worth by her condition, or rename her.

## Sailing in her
From the travel choices on the map, or any coastal province's **The road there**: "In the *Name*, so many days". No fare (only the wages you already pay), your goods in her hold as well as your own carry, and your people with you. She stays at the port you sail to.

## Putting her to work
While you're aboard in port, or with a **mate** of yours as skipper while you're away:
- **Fishing**: steady, best where the fish are thick, poor in winter.
- **Whaling** (sloop and up, the northern ports): rich voyages and stove boats.
- **Coasting trade**: profit by the size of her hold and her skipper's skill.
- **Smuggling**: twice the profit, the law's heat, and the risk of seizure.
- **Privateering** (sloop and up): with a war on, prizes; without one, piracy.

She can be damaged, wrecked, captured or seized.

> Tip: A canoe or a shallop is the cheapest way along the coast. A mate lets your boat earn while you're elsewhere.`,
  },
  {
    id: "travel",
    part: "living",
    title: "The road and the sea",
    line: "Getting about: overland, by sea, in your own boat; and what happens on the way.",
    where:
      "Click a province on the map, then The road there. Right-click (or hold) a province to set out at once.",
    body: `## Ways to go
- **Overland**: on foot, ${ROAD_COST_PER_DAY} coins a day for food and lodging. A horse makes journeys take two thirds the time; a carriage, half. A guide in your service makes them quicker and safer.
- **By sea**, from a port: a passage costs ${SEA_FARE_BASE} coins and ${SEA_FARE_PER_100KM} for every hundred kilometres. Sailors travel free while they sail; the native peoples go by canoe.
- **In your own boat**: no fare at all ([[boats|Boats]]).

The road's page gives the days and the cost of each before you go. On the way, **Stop at the next place** (Here) halts you there. Places and people open up when you arrive.

You can't travel alone while you march with an army (stay behind in garrison at a fort to come and go), and an army's commander marches it instead.

## What happens on the way
Each day of a journey may bring an event, chosen by where you are, the season, wars and who rules the land: fever and rattlesnakes in the southern swamps, snow on the mountain passes, fords in spate, the native peoples' lands (a welcome, a party barring the path), Spanish patrols in Florida, coureurs des bois in the north, buffalo and prairie fire in the west, enemy horsemen in wartime; and at sea, hurricanes in the southern summer and autumn, gales, fog and ice on the Banks, the doldrums, pirates in the Caribbean, a press gang. Each is a scene with two or three choices, with skill checks shown as odds. Days lost, goods or coins lost, wounds and fevers, friends among the nations, a find.

> Tip: Letters sent by sea can be lost; so can you. Hurricane season in the Caribbean is summer and autumn.`,
  },
  {
    id: "followers",
    part: "living",
    title: "Your people, your company, contracts",
    line: "Clerks, hands, swords, mates, guides, rogues and officers in your service; a company of your own; and contracts for hire.",
    where:
      "People › Your people (who you have, and who's for hire in town); Work › Contracts.",
    body: `## Hiring
People for hire are listed on People › Your people (for every place in town) and on the place itself: clerks and factors at the market and the docks; hands at the tavern, the fields and the docks; swords at the tavern and the fort; mates at the docks; guides at a village, the woods or the tavern; officers at the fort and the tavern; rogues at the den (for a share of the take, not wages). A new lot comes each month. Each is a real person with skills, a wage, a loyalty and an opinion of you. Signing costs ${SIGNING} coins; wages run from 1.5 to 8 a month by kind and rank.

Or ask a friend, or anyone without a post, to join you (their card: **Ask them to join you**).

**How many**: 2, and one more for every 3 points of leadership (more as a gang boss, an army or militia captain, or a pirate captain), at most 12.

## What they do
- **Clerks** run trading trips with your stake while you're elsewhere, and may come back rich, poor, robbed, or not at all.
- **Hands** carry four loads each and stand with you.
- **Swords** fight beside you on contracts.
- **Mates** skipper your boat while you're ashore.
- **Guides** make overland journeys quicker and safer.
- **Rogues** form a band that pulls jobs (a robbery, a smuggling run, protection) for a share, drawing heat that's yours; a rogue who's caught may talk.
- **Officers** drill your company.

Promote them, give a bonus, recall or let them go. Watch their loyalty: unpaid, they grumble, then leave; disloyal ones may betray you.

## A company of your own
A militia captain, an army captain, a war leader, or anyone with renown 40 can raise **twenty men** (${20 * COMPANY_BOUNTY} coins in bounties) among their own people, and twenty more at a time. Pay them every month: ${COMPANY_PAY.militia} a man for militia, ${COMPANY_PAY.rangers} for rangers, ${COMPANY_PAY.regulars} for regulars, ${COMPANY_PAY.warriors} for warriors.
- **In quarters** they drill (officers help), and count toward your strength on contracts.
- **Take the field** and they march as a real army of your nation under you: march it from its page; it fights and besieges like any other. In wartime the colony pays them, and you a captain's allowance (3 coins and a little a man); a won battle brings spoils.
- **Unpaid**, a quarter desert each month; three months and the company is gone. Stand them down to bring them home.

## Contracts
Posted at ${CONTRACT_PLACES.map((p) => placeName(p)).join(", ")}, a few each month: escorts, outlaw hunts, guard duty, raids, exploring, finding someone, rewards for a wanted man. You may hold ${MAX_CONTRACTS} at a time. Get to the place before the date; a fight weighs your **strength** (you, the people with you, your company) against theirs, shown as odds. Pay comes on success; a contract let lapse costs a little renown. A reward for a wanted man can be taken by a thief-taker, the watch, anyone without other work, or anyone strong enough (strength 20).

> Tip: A clerk with a stake is how a merchant gets rich without leaving home. A mercenary captain's money comes in wartime: raise the company when there's a war to sell it to.`,
  },
  {
    id: "crime",
    part: "living",
    title: "Crime and the law",
    line: "The underworld, the watch, the gaol and the courts; and serving the law instead.",
    where:
      "Work › The law; the den (found by listening at the tavern); the watch-house.",
    body: `## Heat and notoriety
- **Heat** is how much a nation's law wants you, from 0 to 100; each nation keeps its own. It cools every day: about a third a month while you keep at crooked work, nearly half when you don't. From 20 they're looking for you; from 25 lawmen (players too) can arrest you where they serve; at 45 you're wanted.
- **Notoriety** is your name in the underworld. It opens the higher crooked rungs, the fence's door (10) and the big jobs (5), and frightens honest folk. It fades by half a point a month when you're out of crooked work.

## The crooked trades
Thieving, fencing, smuggling, the road, coining and piracy ([[trades|Every trade]]). Each crooked day draws heat (less with stealth) and may bring **the watch's hand on your collar**: likelier with more heat, a sharper watch in a big town, and less stealth. Then you choose: go quietly, bribe them, run for it, or fight your way out (a graver charge if it fails).

## The den
Found, not seen: **Listen for the underworld** at the tavern (crooked upbringings start knowing it). At the den:
- **Lie low** (4 coins): the law here forgets you a little.
- **Square the watch** (10 and half your heat): some of the heat goes.
- **Buy forged papers** (25, heat 10 or more): the law here loses track of you.
- **Plan a big job** (notoriety 5): rich, and risky.

At the tavern or the market you can pick a pocket; at the watch-house, **make amends** (pay back and a fee) to cool the heat.

## The gaol and the court
Taken up, you wait in the gaol for the quarter sessions. You can bribe the gaoler or break out (a fugitive, with more heat); there's gaol fever. At the trial: **plead guilty** (lighter), **plead not guilty** (persuasion, renown, a patron), **benefit of clergy** (if you can read, under English law, once: a brand on the thumb instead of the rope), or **buy the court**.

## Sentences
By the crime and your record: a fine of 10, an hour in the pillory, a whipping and three months' gaol, branding, **transportation for seven years** (in chains to your nation's farthest colony as an indentured servant, your money and goods forfeit to the Crown), or **hanging** (your heir carries on; a governor's reprieve sometimes comes at the gallows foot).
- Only the hanging matters can hang: highway robbery, piracy, coining, a gang boss's work, killing a watchman; and a record (one prior is enough) or fighting the watch makes them hang.
- Petty theft, smuggling and small receiving stop at the whip; housebreaking with a record means transportation.
- Pleading guilty makes it a step lighter, but a felony is never let off with just a fine. Trying to buy the court and being found out makes it a step worse.

## The law's side
The watch (watchman up to high sheriff) and the thief-takers (fighting 4) work from the watch-house. Watchmen collar rogues and are offered bribes (take or refuse); the watch and thief-takers can **raid the den**; thief-takers earn rewards by the head. A lawman can **arrest another player** who's wanted where he serves (their card).

! Pitfall: When your heat badge turns red, lie low or leave that nation's land. Heat with one nation means nothing to another's law.`,
  },
  {
    id: "you",
    part: "living",
    title: "Skills, traits and ambitions",
    line: "What you're good at, what you're like, and what you've set your heart on.",
    where: "You › Yourself (skills, attributes and traits); You › Ambition.",
    body: `## Skills
Twelve: fighting, leadership, persuasion, trade, craft, farming, seamanship, woodcraft, letters, faith, medicine and stealth. Every check in the game leans on one (the odds are shown as a percentage), and trades need them to climb. Point at a skill for what makes it up.

Skills grow by doing: your work (working hard teaches faster, overtime faster still), study (with the minister at the church, at the bench in the workshops, physic at the apothecary), a tutor (${LESSONS.cost} coins, every ${LESSONS.cooldown} days, at home or the church), someone who'll teach you (their card: Ask them to teach you), and the acts that practise them (drill, hunt, read the gazette, sit at the council fire). Diligent people learn faster at work; the educated learn letters faster.

## Attributes
Diplomacy, martial, stewardship, intrigue and learning add to the skills they govern: diplomacy to persuasion; martial to fighting, leadership and seamanship; stewardship to trade, craft and farming; intrigue to woodcraft and stealth; learning to letters, faith and medicine.

## Traits
What you're like: brave or craven, honest or deceitful, ambitious or content, robust or sickly and so on. They colour what people think of you and how things go. Some are earned along the way: scarred, famous, a drunkard, gouty (from comfortable living after 45).

## Ambitions
Set your heart on something (You › Ambition): rise in your trade, make a fortune, a fine house, marry well, raise a family, make a name, true friends, win office, glory in battle, see the country, master a skill, ruin your rival, lead a cause, and more. The page shows how far along you are. Getting there is worth renown (3 to 10) and peace of mind; giving one up stings.`,
  },
  {
    id: "health",
    part: "living",
    title: "Health and stress",
    line: "Keeping body and mind together.",
    where: "The banner (point at health or stress), You › Yourself.",
    body: `## Health
From 0 to 100; at 0 you die, and low health makes a sudden death likelier (below 45 the risk rises, below 25 it triples). It mends a little each month by itself, faster when it's low.
- **Wears it down**: age (from 45, more from 55 and 65), tropical summers, a frugal winter in the north, wounds and fevers, overtime, stress of 70 or more, and traits (sickly, a drunkard, gouty).
- **Mends it**: rest at home (every 21 days), physic at the apothecary (3 coins), the healer in a village (0.5), living comfortably or better, a fine house.

## Stress
From 0 to 100. At 70 or more it costs you a point of health a month; at 95 strain can hurt you outright.
- **Raises it**: hard work and overtime, debt, grief, scandal, threats, living beneath your station.
- **Eases it**: rest at home, a room at the tavern (1 coin), prayer, drink and listen, an evening with your family, shirking at work, a gift to the town, living comfortably, a house of your own, reaching an ambition.

> Tip: When stress passes 60, ease to steady work and spend a week at home. It's cheaper than physic.`,
  },
  // ================================================================ people
  {
    id: "people",
    part: "people",
    title: "People and what they think of you",
    line: "Opinions, ties, patrons, and everything you can do with someone.",
    where:
      "Anyone's card: click them in Here › Here now, on People, or anywhere their name is underlined.",
    body: `Everyone in the game is a person with a name, an age, a family, a trade, traits and a tongue, and an **opinion** of you from −100 to +100. Point at the number to see every reason: kin, faith, your people, your renown, gifts, quarrels, favours, scandal, what you've done together.

## Ties
Beyond what they think today, some people are something to you: **friend**, **rival**, **nemesis**, **lover**, **betrothed**, your **patron**. Friends ease your cares and stand by you; rivals and nemeses work against you; a patron (someone of standing who backs you) speaks for you for promotions, commissions, appointments, and at the gallows.

## What you can do with someone
Their card lists what you could do, each with its verdict before you try: **will accept** or **will refuse** (and why, line by line) for asking, or the **odds** for anything that's a matter of skill. Some take a while before you can try again.

| Kind | What you can do |
|---|---|
| Friendly | Talk; flatter; give a gift; offer friendship; ask them to teach you their trade; take lessons in their tongue |
| Romance | Court (in secret, if either of you is married); propose marriage; meet in secret (lovers) |
| Work | Ask for work; ask for promotion; hand in your notice; offer them work at your business; seek an appointment to an office in their gift |
| Favours | Borrow money (a fifth again within the year); ask for patronage; grease their palm |
| Causes | Recruit them to your cause; join theirs; ask them to come to your settlement |
| Hostile | Insult; spread a rumour; challenge to a duel; pry into their affairs; blackmail |

And on everyone's card: **Write a letter** (wherever they are), **Ask them to join you** (into your service), and for lawmen **Arrest them**.

## Tongues
Most of this needs words. With no tongue in common you can only talk by signs; with a few words most things are harder ([[languages|Languages]]).

## Other players
With another player's character, asking goes to them: they accept or refuse themselves. You can also offer them goods for sale.

> Tip: Small kindnesses add up. Talking costs nothing and can be done every week; a gift every month. Invite the people you want to like you to a gathering.`,
  },
  {
    id: "love",
    part: "people",
    title: "Courting, marriage and lovers",
    line: "Walking out, proposing, a wedding, and the affairs of the heart that are nobody's business.",
    where:
      "Their card (Court, Propose marriage, Meet in secret); the church's Seek a match; Society › Gatherings for a wedding.",
    body: `## Finding someone
**Seek a match** at the church (or the council fire) introduces you to the unmarried of the parish. Anyone else you meet will do, too.

## Courting
**Court** someone (their card) to walk out together: a matter of your persuasion, harder the higher they stand. Done well, it may become love; sweethearts are likelier to say yes.

## Proposing
**Propose marriage** when they think well enough of you. What weighs with them: their opinion of you, being sweethearts, your prospects (your rung and your renown), whether you're beneath their family, a house of your own, living comfortably, and debts. A wedding costs more the higher you stand. They come to live in your home. A wedding can be a gathering, with guests and a toast ([[gatherings|Gatherings]]).

Far off? Write **a love letter**, or **a proposal of marriage**, by post ([[letters|Letters]]).

## Lovers, married or not
Courting is allowed while either of you is married: it becomes **Court in secret**, and with a lover you can **Meet in secret**. Stealth and intrigue keep it quiet. Every meeting, and every letter, may be noticed:
- **Your husband or wife** finds out: forgive, beg, end it, divorce or live apart.
- **Their husband or wife** finds out: a challenge at dawn, paying them off, denying it, or leaving town.
- **The whole town** finds out: a scandal, renown lost and opinions down, fading over the months.

A child may come of it; you can acknowledge them, or keep the secret. Your secret affairs are on You › Family. **Pry into their affairs** may turn up someone else's secret, and **Blackmail** uses it; people can blackmail you too, by letter.

Divorce is possible where the church allows it (puritan, reformed and Lutheran colonies, and among the native peoples); elsewhere, a separation.

! Pitfall: Keep a secret lover far from your spouse's friends.`,
  },
  {
    id: "family",
    part: "people",
    title: "Family and heirs",
    line: "Children, your heir, your line, and what passes on when you die.",
    where: "You › Family.",
    body: `## Children
Married couples have children (and lovers, sometimes). Children grow up in your home and think well of you as their parent. Under sixteen a child can't work, marry or hold office, but can learn.

## Your heir
When you die, **you carry on as your heir**. You › Family shows who that is:
1. the child you've named your heir (name heir, beside them), if they're living and here;
2. or your eldest living child;
3. or your eldest living grandchild.
With no heir, your story ends and you watch ([[death|Death and watching]]).

## What passes on
- **The purse**, less a third to your widow or widower if you chose to leave them one (the box on You › Family).
- **The family business**, if your work was your own: an heir of sixteen or more takes it up at once; a younger one comes into it at sixteen.
- Your boats, and some of your people.
- About a third of your renown, and less than a third of your favour.
- Not your skills: the heir has their own. Not your friendships, your patron, your ambitions or your offices.

Your heir starts with good health and a clear head, at their own home.

## Your line
You › Family shows the generations before you. Each generation of the line counts toward your Derp Coins at the end.

> Tip: Name an heir early, and give them a good start: a tutor, a trade, a good marriage. A child heir can't work until sixteen.`,
  },
  {
    id: "languages",
    part: "people",
    title: "Languages",
    line: "The tongues of the Americas, how well you speak them, and how to learn.",
    where:
      "You › Tongues; on anyone's card, what they speak and how well you can talk.",
    body: `English, French, Spanish, Dutch, Swedish, Portuguese and German; about twenty native families (Algonquian of the coast and of the lakes, Iroquoian, Cherokee, Muskogean, Siouan, Nahuatl, Mayan and others); and the trade jargons in their years (Mobilian, the Delaware jargon, Basque pidgin).

## Levels
${LEVEL_NAMES.map((l, i) => `**${l}**${i ? ` (${i * LEVEL_POINTS} points)` : ""}`).join(", ")}.
- With **no tongue in common** you can only talk by signs, and most things can't be said at all.
- With **a few words** every approach is harder.
- **Conversational** is enough for most things; **fluent** for everything.
- Kindred tongues help each other (Spanish and Portuguese, Dutch and German).
- An **interpreter** nearby (a go-between, a missionary, a trader) lets you talk through them, at a penalty.

## Learning
- **Lessons** from anyone fluent: ${LESSON_FEE} coins a lesson (their card), ${LESSON_POINTS} points.
- **Books**: a grammar or a dictionary, 4 to 7 coins, sold in the towns of the colonies that print them (You › Tongues shows any sold where you are): ${BOOK_POINTS} points, once every ${BOOK_COOLDOWN} days, and only up to conversational.
- **Living among speakers**: ${LIVING_POINTS} points a month.
- **Talking** with them: ${TALK_POINTS} points a conversation.

Your Learning speeds it all. Townsfolk speak their own tongue and sometimes a neighbour's or a jargon; the educated often have a second European tongue.

> Tip: Learn the tongue of the people next door before you need it: a few words opens trade, conversational opens friendship.`,
  },
  {
    id: "letters",
    part: "people",
    title: "Letters",
    line: "Writing to anyone, anywhere; the post; and answering what comes.",
    where:
      "Society › Letters; the quill in the banner; Write a letter on anyone's card.",
    body: `Write to anyone you know or know of, wherever they are: family, friends, rivals, people you've met, anyone in the town you're in, other players, every ruler and council member, and the office holders of your own nation.

## Kinds of letter
A friendly letter; ask a favour (a loan, with a sum); propose a venture (your stake); a love letter; a proposal of marriage; a threat; a recommendation (of someone, to them); a petition (for an office, redress, a charter, a pardon); an invitation to one of your gatherings; an introduction.

## The post
The writing desk shows the letter as it will read, the route (by road, or by sea with the number of crossings), the days on the road, the postage and the chance it's lost. In the same town it's 0.2 and a day; overland or by sea about 1 to 3 coins. Each sea crossing adds about six days, and sea letters can be lost, more in hurricane season and in wartime.

## Answers
Replies come back by the same road, with their decision and the reasons, laid out line by line. Other players get your letter in their own case and answer it themselves.

## Letters to you
People write to you too: lovers, rivals with threats, friends asking for a loan, merchants with ventures, people petitioning you when you hold office, invitations to gatherings, offers of office, and blackmail. Those that want an answer wait 60 days. The quill shows a count of what's unread and what wants an answer; Society › Letters has **Received**, **Sent** and **On the road**.

> Tip: Letters by sea are slow and chancy: send the important ones overland when you can.`,
  },
  {
    id: "gatherings",
    part: "people",
    title: "Gatherings",
    line: "Dinners, feasts, balls, hunts, frolics, weddings and councils: who comes, and how it goes.",
    where:
      "Society › Gatherings; or Give a gathering here… at your home, the tavern, the church, the fields, the woods, the governor's house, a village or the council fire.",
    body: `## Giving one
Choose the kind, the place, the day, the scale and the guests.

${gatheringsTable()}

| Scale | Guests | Cost |
|---|---|---|
${SCALE.map((x) => `| **${x.name}** | up to ${x.guests} | the kind's cost ×${x.mult} |`).join("\n")}

The tavern adds 3 coins a scale for the room; the governor's house 6; the church 1.

## The guests
Invite anyone, anywhere: people elsewhere get a letter, and need the time to travel. Everyone answers yes or no, with their reasons.

## On the day
**Be there.** A host who isn't loses the guests' good opinion (a wedding is put off a month instead). The evening runs as a few scenes: toasts, a quarrel, a drunk, an insult, a romance, business, a fight, a dish gone wrong, a ghost story, a dance, cards, the wedding toast, the eulogy, the council's speeches. What you choose moves opinions and renown. Grander gatherings bring more renown, if they go well.

## Being invited
Others give gatherings too, and invite you (by letter if you're away): your neighbours' weddings among them. Answer on Society › Gatherings, and be there on the day if you said yes.

> Tip: Invite people who like each other. A quarrel at your table costs you more than it costs them.`,
  },
];
