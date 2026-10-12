// How to Play's chapters (r11 wave 2). Written in the guide's light markup
// (see Guide.ts). Every number here is checked against the engine; where a
// table can be made from the game's own rules (the trades and their ladders,
// the county offices, the boats, the gatherings) it is, so it can't drift.

import { BOATS, CREW_WAGE } from "../../engine/Boats";
import { CONTRACT_PLACES, MAX_CONTRACTS } from "../../engine/Contracts";
import {
  DOWN,
  DUEL_DAYS,
  DUEL_DEATH_HEAT,
  DUEL_HEAT,
} from "../../engine/Duels"; // HOME (r12)
import { COMPANY_BOUNTY, COMPANY_PAY, SIGNING } from "../../engine/Followers";
import { FOUND, TERMS as SETTLE_TERMS } from "../../engine/Founding";
import { GATHERINGS, SCALE } from "../../engine/Gatherings";
import {
  FURNISH,
  HOME_COOLDOWN,
  LEASE_RENT,
  LET_RENT,
  LODGER_RENT,
  LODGING_SHARE,
  ROOM_ORDER,
  ROOMS,
  SERVANT_ORDER,
  SERVANTS,
  STORE_BASE,
  STORE_MORE,
  TEACH_AGES,
  TEACH_MAX,
} from "../../engine/HouseRules"; // HOME (r12)
import { JOB_GROUPS, jobGroupOf } from "../../engine/JobsData";
import { CARRY } from "../../engine/LifeQueries";
import {
  AWAY_DAYS,
  BENEATH_RENOWN,
  BENEATH_STRESS,
  ENDOWMENTS,
  EUROPE_FORTUNE,
  HOUSES,
  JOBS,
  KIT,
  LAND_GRANT,
  LAND_LOT,
  LESSONS,
  LIFE_COINS,
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
import { RISE_MEMBERS, RISE_SUPPORT } from "../../engine/Movements";
import { OFFICES } from "../../engine/Offices";
// POWER (r12): office powers, the council, bills, trials, the press.
import { BILLS } from "../../engine/Assembly";
import { POWERS } from "../../engine/Authority";
import {
  CLAIM_BAR,
  PROCLAMATIONS,
  SEAT_ACTIONS,
  UNSEAT_BAR,
} from "../../engine/Council";
import {
  COUNCIL_ORDER,
  SEAT_PORTFOLIO,
  seatTitleOf,
} from "../../engine/CouncilTitles";
import { SKIP_DAYS_PER_SECOND, SKIP_MAX_DAYS } from "../../engine/Pace";
import {
  FOUND_COST,
  MAX_WRITERS,
  PAPER_YEAR,
  WRITER_WAGE,
} from "../../engine/Press";
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
import { STAGE_DAYS } from "../../engine/Trials";
// MAP (r12): seasons and achievements, for their chapters.
import {
  ACHIEVEMENT_COINS,
  ACHIEVEMENT_GROUPS,
  ACHIEVEMENTS,
} from "../../engine/Achievements";
import { HARVEST_BONUS } from "../../engine/Seasons";
import type { FirmDecisionKey, JobKind, Nation } from "../../engine/Types";
// EDU (r13): schools, apprenticeships, colleges and the peoples' own ways.
import {
  BIND_AGES,
  CALLINGS,
  COLLEGE_AGES,
  COLLEGE_RANKS,
  COLLEGE_SURETY,
  COLLEGE_YEARS,
  COLLEGES,
  COURSE_ORDER,
  COURSES,
  DEGREE_RENOWN,
  MASTER_CAP,
  PATHS,
  SCHOOLS,
  type Gains,
} from "../../engine/EduData";
// DICE (r14): Liar's dice, for its chapter.
import { BIG_POT, XP_MAX, XP_ROUND, XP_TABLE } from "../../engine/Dice";
import {
  DICE_EACH,
  MAX_SEATS as DICE_MAX,
  MIN_SEATS as DICE_MIN,
  numberWord,
  OPEN_DAYS,
  STAKES,
  STALL_SECONDS,
} from "../../engine/DiceCore";
// PARTNERS (r13): partnerships, for their chapter.
import { DECISIONS, MAX_DEBT } from "../../engine/Firms";
import { BAILIFFS_AT } from "../../engine/Money";
import {
  bizCost,
  bizJobs,
  bizRoom,
  CALLS,
  CARGOES,
  FIRE_SALE,
  LAWYER_FEE,
  LOANS,
  MAX_FIRMS,
  MAX_PARTNERS,
  MAX_ROUNDS,
  OFFER_DAYS,
  VOTE_DAYS,
} from "../../engine/PartnersCore";

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
  { id: "people", title: "You and others" },
  { id: "power", title: "Standing and power" },
  { id: "world", title: "The world" },
  { id: "reference", title: "Reference" },
];

// ---------------------------------------------------------------- tables made from the rules

const n = (v: number) => String(Math.round(v * 100) / 100);
/** "+1", "−1", "0". */
const sg = (v: number) => (v > 0 ? `+${n(v)}` : v < 0 ? `−${n(-v)}` : "0");
const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const cap1 = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
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
  if (d.ownNation) out.push("in your own nation's land");
  if (d.native === true) out.push("for the native peoples");
  if (d.native === false) out.push("for colonists");
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

// ---- POWER (r12): tables made from the track's rules

function powersTable(native: boolean): string {
  const every = (d: number) =>
    d >= 365 ? `${n(d / 365)} year${d >= 730 ? "s" : ""}` : `${d} days`;
  const rows: string[] = [];
  for (const o of Object.values(OFFICES)) {
    if (!!o.native !== native) continue;
    for (const p of POWERS[o.key] ?? [])
      rows.push(
        `| ${o.name} | **${p.label}** | ${p.text} | ${every(p.cooldown)} |`,
      );
  }
  return `| Office | Power | What it does | Once in |\n|---|---|---|---|\n${rows.join("\n")}`;
}

const asNation = (culture: string, religion = "anglican") =>
  ({ kind: "power", culture, religion }) as unknown as Nation;

function seatsTable(): string {
  return `| Seat | English | French | Spanish | Dutch | Its portfolio | What it can do |\n|---|---|---|---|---|---|---|\n${COUNCIL_ORDER.map(
    (seat) =>
      `| ${seat === "spymaster" ? "Secretary" : seatTitleOf(asNation("english"), seat).replace(/ of the .*$/, "")} | ${seatTitleOf(asNation("english"), seat)} | ${seatTitleOf(asNation("french", "catholic"), seat)} | ${seatTitleOf(asNation("spanish", "catholic"), seat)} | ${seatTitleOf(asNation("dutch", "reformed"), seat)} | ${SEAT_PORTFOLIO[seat]} | ${
        SEAT_ACTIONS.filter((a) => a.seat === seat)
          .map((a) => `${a.label}${a.measure ? " (a measure)" : ""}`)
          .join("; ") || "steer the house's bills; carry its address"
      } |`,
  ).join("\n")}`;
}

function proclamationsTable(): string {
  return `| Proclamation | What it does | How often |\n|---|---|---|\n${PROCLAMATIONS.map(
    (p) =>
      `| **${p.label}** | ${p.text} | every ${n(p.cooldown / 365)} year${p.cooldown > 365 ? "s" : ""} |`,
  ).join("\n")}`;
}

function billsTable(): string {
  return `| Bill | What it does as law | |\n|---|---|---|\n${Object.values(
    BILLS,
  )
    .map(
      (b) =>
        `| **${b.title.replace("{county}", "your county")}** | ${b.does} | ${b.money ? "a money vote: no assent wanted" : b.gov < 0 ? "governors dislike it" : b.gov > 0 ? "governors like it" : ""} |`,
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
        `| **${l.name}** (${l.nativeName.toLowerCase()}) | ${n(l.cost)} / ${n(l.nativeCost)} | ${sg(l.health)} | ${sg(l.stress)} | ${sg(l.renown)} |`,
    )
    .join("\n")}`;
}

// HOME (r12): rooms and servants, from the house rules.
function roomsTable(): string {
  return `| Room or ground | Colonists | Native peoples | Upkeep a month | Needs | What it does |\n|---|---|---|---|---|---|\n${ROOM_ORDER.map(
    (id) => {
      const r = ROOMS[id];
      return `| **${r.name}** | ${r.cost} | ${r.nativeName ? `${r.nativeName} (${r.nativeCost})` : "not their way"} | ${r.upkeep || "none"} | ${r.minLevel > 1 ? `a ${HOUSES[r.minLevel - 1].name.toLowerCase()}` : "any house"} | ${r.text} |`;
    },
  ).join("\n")}`;
}

function servantsTable(): string {
  return `| Servant | Wages a month | What they do |\n|---|---|---|\n${SERVANT_ORDER.map(
    (k) =>
      `| **${SERVANTS[k].name}** | ${SERVANTS[k].wage} | ${SERVANTS[k].text} |`,
  ).join("\n")}`;
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

/** MAP (r12): every achievement and what it pays, from the rules. */
// PARTNERS (r13): what a business costs to found together, and what can be put to the partners.
function partnersTable(): string {
  const rows = bizJobs().map((k) => {
    const def = JOBS[k];
    return `| **${def.business}** (${lower(def.name)}) | ${placeName(def.places[0])} | ${SKILL_NAMES[def.main]} | ${[1, 2, 3].map((lv) => bizCost(k, lv)).join(" / ")} |`;
  });
  return `| Business | Where | The manager's skill | Cost: I / II / III |
|---|---|---|---|
${rows.join("\n")}

Sizes I, II and III have room for ${[1, 2, 3].map((lv) => bizRoom(lv)).join(", ")} hands. A farm at size III is a plantation.`;
}

function decisionsTable(): string {
  const extra: Partial<Record<FirmDecisionKey, string>> = {
    loan: `${LOANS.join(", ")} coins; up to ${MAX_DEBT} owed`,
    goods: `${CARGOES.join(", ")} coins; one at sea at a time`,
    call: `${CALLS.join(", ")} coins`,
    admit: "a share of 5 to 50, for capital",
  };
  return `| Matter | What it does | How much |
|---|---|---|
${(Object.keys(DECISIONS) as FirmDecisionKey[])
  .map(
    (k) =>
      `| **${DECISIONS[k].label}** | ${DECISIONS[k].text} | ${extra[k] ?? ""} |`,
  )
  .join("\n")}`;
}

function achievementsTable(): string {
  return ACHIEVEMENT_GROUPS.map(
    (g) =>
      `**${g.name}**\n\n| Achievement | How | Coins |\n|---|---|---|\n${ACHIEVEMENTS.filter(
        (a) => a.group === g.id,
      )
        .map((a) => `| ${a.name} | ${a.how} | ${a.coins} |`)
        .join("\n")}`,
  ).join("\n\n");
}

// ---------------------------------------------------------------- EDU (r13): tables

/** "letters +3.5, persuasion +0.5". */
function gains(g: Gains): string {
  return Object.entries(g)
    .map(
      ([k, v]) =>
        `${lower(SKILL_NAMES[k as keyof typeof SKILL_NAMES])} +${n(v ?? 0)}`,
    )
    .join(", ");
}

const SEXES = { boys: "boys", girls: "girls", both: "boys and girls" };

function schoolsTable(native: boolean): string {
  return `| School | Ages | Years | For | A month | Teaches |\n|---|---|---|---|---|---|\n${SCHOOLS.filter(
    (d) => d.native === native,
  )
    .map(
      (d) =>
        `| **${d.name}** | ${d.ages[0]} to ${d.ages[1]} | ${d.years} | ${SEXES[d.sex]}${d.faiths ? " (Catholic)" : ""} | ${n(d.fee)}${d.board ? ` (+${n(d.board)} board away)` : ""} | ${gains(d.skills)} |`,
    )
    .join("\n")}`;
}

function callingsTable(): string {
  return `| Trade | For | The ladder it leads to | Taught by | Premium | Years | Teaches |\n|---|---|---|---|---|---|---|\n${CALLINGS.map(
    (c) =>
      `| **${c.name}** | ${SEXES[c.sex]} | ${c.job ? `${JOBS[c.job].name} (as ${lower(JOBS[c.job].ranks[1]?.title ?? "a journeyman")})` : "none: a household of her own"} | ${c.mistress ? "a mistress of the town" : c.roles.map((r) => lower(ROLES[r].title)).join(" or ")} | ${c.premium || "none"} | ${c.years} | ${gains(c.skills)} |`,
  ).join("\n")}`;
}

function collegesTable(abroad: boolean): string {
  return `| College | Where | Opens | Whose | A month | Courses |\n|---|---|---|---|---|---|\n${COLLEGES.filter(
    (c) => (c.prov === null) === abroad,
  )
    .map(
      (c) =>
        `| **${c.name}** | ${c.town} | ${c.from < 1500 ? "long before" : c.from}${c.to ? ` (to ${c.to})` : ""} | ${c.nativeOnly ? "Native scholars" : `${c.powers.map((k) => k[0].toUpperCase() + k.slice(1)).join(", ")}${c.natives ? ", Native scholars" : ""}`}${c.faiths && c.faiths.length < 4 ? ` (${c.faiths.join(", ")})` : ""} | ${c.fee ? n(c.fee) : "free"} | ${c.courses.map((k) => lower(COURSES[k].name)).join(", ")}${c.physicFrom ? ` (physic from ${c.physicFrom})` : ""} |`,
    )
    .join("\n")}`;
}

function coursesTable(): string {
  return `| Course | The degree | Teaches over ${COLLEGE_YEARS} years | Opens the door to |\n|---|---|---|---|\n${COURSE_ORDER.map(
    (k) =>
      `| **${COURSES[k].name}** | ${COURSES[k].degree} | ${gains(COURSES[k].skills)} | ${COURSES[k].door ? `${JOBS[COURSES[k].door!].name}, as ${lower(JOBS[COURSES[k].door!].ranks[COURSES[k].doorRank]?.title ?? "")}` : "any learned trade a rung up"} |`,
  ).join("\n")}`;
}

function pathsTable(): string {
  return `| Path | Ages | Years | For | Taught by | Teaches |\n|---|---|---|---|---|---|\n${PATHS.map(
    (p) =>
      `| **${p.name}** | ${p.ages[0]} to ${p.ages[1]} | ${p.years} | ${SEXES[p.sex]} | ${p.roles.map((r) => lower(ROLES[r].title)).join(" or ")} | ${gains(p.skills)} |`,
  ).join("\n")}`;
}

function missionsList(): string {
  const m = SCHOOLS.find((d) => d.key === "mission")!;
  return (m.places ?? [])
    .map(
      (p) =>
        `- ${p.name[0].toUpperCase()}${p.name.slice(1)} (${p.from} to ${p.to})`,
    )
    .join("\n");
}

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
- **Skills**: twelve, from fighting to stealth. You have 8 to 16 points by your age (more for some upbringings); the highest levels cost 2 points each. They grow by doing.

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
4. After 24 months as a yeoman, with farming 9 and renown 6, you're a **freeholder** (6.5). Stand as **selectman** or **churchwarden** at the county's poll (Society › Office), and do the duty every month. Then stand for the assembly at the governor's house.
5. After 36 months as a freeholder, with farming 11 and renown 15, buy a **plantation** (90): a **planter**, 11 a month, and the station of gentlefolk: they live comfortably, under a roof of their own. Live up to it, and your children start well.

## A soldier (French, Quebec, 1700)
1. Enlist with the sergeant at the fort: **private**, 2.5 a month. You march with the army wherever it goes, and share its battles: wounds, renown, promotion.
2. Drill at the fort to raise fighting and leadership. Corporal after 8 months as a private, sergeant after 16 more as a corporal, each with the skills it asks.
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
- A watch-house at 500 (and at capitals and court towns); a den at 900, at capitals, and in coastal towns of 400.
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
  // MAP (r12): the seasons.
  {
    id: "seasons",
    part: "living",
    title: "The seasons",
    line: "Winter roads and frozen harbours, mud and floods, the harvest, fevers and hurricanes: what each season does, and where.",
    where:
      "The season's sign by the date in the banner (point at it, or tap it, for what it brings where you are); the map itself.",
    body: `The year turns the same for everyone (December to February is winter, and so on), but what each season brings depends on where you are. Its sign stands beside the date: a snowflake, a shoot, the sun, a falling leaf, and in the Caribbean from August to October the whirl of the hurricane. Point at it (or tap it) for what the season brings where you are now.

## Winter
- **The northern roads** (New England, New York, New France, the lakes) are slower in the snow: a third again as long, more in the hills, and over half as long again in the far north. In the south and the islands it's the dry season: good roads and healthy months.
- **The rivers freeze**: in the deep winter you cross them on the ice instead of waiting for a ferry (on the road, the ice may not hold).
- **Harbours ice up**: the St. Lawrence and its gulf from December to April, Hudson's Bay and Labrador longer, the lakes through the deep winter. No ship sails in or out (the travel choices go overland instead), boats there do little work, and sailors, shipwrights and smugglers in an ice-bound port earn less. Boston, Halifax and St. John's stay open.
- **Colds and pleurisy** go round the north: a chill on the chest may come to you (rest by the fire, send for the physician, or work through it and risk pleurisy). Living frugally makes it likelier; good living, and a robust nature, less.
- **Fewer people on the roads**; the trappers' furs are prime (trappers and hunters earn more), the fishing boats stay in (fishermen and whalers earn less), and there's little to do in the fields.

## Spring
- **Mud season**: the thaw turns the northern roads to soup in March and April (a fifth to a third slower).
- **The rivers in flood**: a river crossing takes twice as long, and the river may come up into the town.
- **The hungry months** (February to April): last year's corn runs low. Corn is dearest at market in March; in the north it costs more to live (a little more after a good harvest, a quarter more after a poor one).

## Summer
- **The campaigning season**: the roads at their best, and the most people out on them.
- **Fevers in the south**: in the Carolinas, Florida, the Gulf, the islands and New Spain, agues and worse from June to October. A fever may come to you (Jesuit's bark, bleeding, or sweating it out).

## Autumn
- **The harvest** (September and October; in the islands and the south, the cane and the tobacco from January to March). Each country's harvest comes in **good, fair or poor** (neighbours share theirs: the weather comes over whole regions), and the same years are hard in every game (the great frost of 1709).
  - Farmers, field hands and planters (and the native growers) earn **harvest wages** on top of their pay: ${Math.round(HARVEST_BONUS.good * 100)}% more in a good year, ${Math.round(HARVEST_BONUS.fair * 100)}% in a fair one, ${Math.round(HARVEST_BONUS.poor * 100)}% in a poor one. Millers are busy grinding it through the autumn.
  - Anyone can **Help bring in the harvest** at the fields: a stint at harvest wages (by your farming, and the year), the farmer's thanks, and sometimes an invitation to the **harvest frolic** after ([[gatherings|Gatherings]]); a frolic is merrier after a good harvest.
  - Corn is cheap after the harvest; after a poor one it stays dear all year.
- **Hurricane season** in the Caribbean and the Gulf (August to October): storms at sea and on the coasts, and you can see them wheel across the map.

## On the road
Besides the snow, the passes and the fords, the seasons bring their own scenes: the mud of the thaw (take to the woods, hire oxen or slog on), a frozen river to cross, frostbite in a northern winter, and a farmer by the road wanting hands at the harvest.

## On the map
Snow over a winter's country (deeper in the far north), ice along the frozen shores and lakes and white frozen rivers, brown mud in the thaw and swollen rivers, the green of May, a fever haze over the hot lowlands, gold over the farm country at harvest, the woods turning in autumn, and the hurricanes.

> Tip: Travel north in summer and autumn; sail out of Quebec before December. A stint at the harvest in a good year is good money for anyone, and the farmer may ask you to the frolic.`,
    glossary: [
      [
        "Mud season",
        "The thaw, when the northern roads turn to mud.",
        "seasons",
      ],
      [
        "The hungry months",
        "Late winter, when last year's corn runs low and bread is dear.",
        "seasons",
      ],
      [
        "Ice-bound",
        "A harbour shut by ice: no ships until the spring.",
        "seasons",
      ],
    ],
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
- **Your own business**: at the top rungs of many trades you're your own master, with hands to hire (offer anyone work from their card): the business's takings come to you, less its upkeep and the hands' wages.

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
  // ---- HOME (r12): house and property
  {
    id: "property",
    part: "living",
    title: "Your house, your household and your property",
    line: "Lodgings or a house of your own, its rooms, furniture and servants, letting and lodgers, land, a business, and gifts to the town.",
    where:
      "Here › Home (your lodgings or your house); Estate › House & land; the market or a village (a house), the fields (land), the governor's house (a grant).",
    body: `## Home
Every town you live in has a **Home** among its places (Here). Before you own a house it's **your lodgings**: where you lodge goes with the way you live (a straw pallet in a tavern garret when frugal, a room in a widow's house when modest, rooms of your own when comfortable, the best inn when genteel, a whole house rented furnished when grand), and your rent is part of your living (about ${Math.round(LODGING_SHARE * 100)}% of it). Live better and you lodge better (Estate › Purse).

Once you have a house, Home is that house: its card shows the house, its rank (I to IV) and what it gives you each month, and everything you can do there.

## A house of your own
At Home you can **buy any house outright**, or **rent one by the month**; at the market or a native village, or on Estate › House & land, you can buy the next one up. It stands in the town you're in, and your household moves in with you. A better one replaces the old for its price less half the old one's worth.

${housesTable()}

A house eases the mind every month (more for a better one); from a house up it adds a little renown, and a fine house or a mansion your health too. From gentlefolk up your station expects a house **at your home** (the town you live in). Colonists' towns levy rates on houses you own and live in.

**Renting** (colonists only): ${LEASE_RENT.map((r, i) => `${HOUSES[i].name.toLowerCase()} ${r}`).join(", ")} coins a month, with the first month and a month's surety in hand. No upkeep and no rates, but nothing to sell, and you can't build on it. Fail to pay the rent and your things are put in the street. Buying the house you rent ends the lease.

You can own houses in several towns. **Make this your home** (at the house) moves your household there.

## Rooms and grounds
Added at Home, once each:

${roomsTable()}

## Furniture
${FURNISH.slice(1)
  .map(
    (f, i) =>
      `- **${f.name}** (${f.cost} coins${i + 1 > 1 ? `; a ${HOUSES[i].name.toLowerCase()} or better` : ""}): ${f.text} −${-f.stress} stress a month${f.renown ? `, +${f.renown} renown` : ""}.`,
  )
  .join("\n")}

Native lodges are furnished with mats, painted hides and trade blankets, for about a third of the price.

## Servants
Colonists keep servants (one, or more with servants' quarters: the house's rank plus two). Each is paid monthly; one who can't be paid leaves.

${servantsTable()}

A parlour, good furniture and a cook give a gathering at home a better start.

## Letting, lodgers and stores
- **Let a house** you don't live in: ${LET_RENT.map((r, i) => `${HOUSES[i].name.toLowerCase()} ${r}`).join(", ")} coins a month, and the tenant pays the rates. A tenant may give notice (about one in thirty a month). End the let to use it again.
- **Take in lodgers** (in a house you own): ${LODGER_RENT} coins a month each, and a point of stress a month each. As many as the house's rank.
- **Keep goods at home**: ${STORE_BASE} loads in any house, ${STORE_MORE} more with a storehouse. Goods kept at home don't count against what you carry. Take them out before you sell the house.

## At home
- **An evening with the family**, **time with your husband or wife**, **playing with the children**: an easier mind, and they think the better of you ([[family|Family and heirs]]).
- **Teach a child** (five to fifteen) something you know well: it stays with them, and an heir starts with it in their skills.
- **Rest and recover**: health and calm (more with a cook, good furniture and a garden). **Study**: experience in any skill, twice as much with a study. **Hire a tutor**.
- **Give a gathering**, **give a dinner**, **write a letter**.
- **What else money buys, and where**: land, a horse, a carriage, good tools, a pew, a boat, shares, people in your service, a land grant, each with the way to the place that sells it.

## Land
- **Ten acres** for ${LAND_LOT.cost} coins (Estate › House & land, or the fields), up to ${LAND_LOT.max * 10} acres in a town. Let to tenants: ${LAND_LOT.rent} a month in rent for each ten acres. Any land or house of your own makes you a freeholder, fit for the offices the freeholders elect.
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
  .join("\n")}

> Tip: A cottage and a kitchen garden pay for themselves in calm and a cheaper table. Add a garden early; servants and a parlour when your station asks for them.

! Pitfall: Servants, rooms and rent are paid every month whether you're home or not. Check the house's monthly figure (point at it) before you add more.`,
  },
  // ---- end HOME (r12)
  // ---- PARTNERS (r13): business partnerships
  {
    id: "partners",
    part: "living",
    title: "Partnerships",
    line: "Going into business with someone: articles of copartnership, shares and capital, the books, votes, and what goes wrong.",
    where:
      "Estate › Partnerships; anyone's card (In business › Propose a partnership); the market (Partnerships); a firm's name on its place's tile (Here).",
    body: `Two (or up to ${MAX_PARTNERS}) people go into business as one **firm**, under articles of copartnership, in the period's way: "Ashby & Cole". Each **partner** holds a **share** of the profit and loss (shares make a hundred), has a **capital account** (what they brought in), and is either the **managing partner** (who does the work and keeps the books) or a **silent partner** (who only puts in money). You can be in ${MAX_FIRMS} partnerships at a time.

## What a firm can hold
- **A business one of you brings in**: your own (the shop, the inn, the farm, the mill, the press, the ship that came with your trade's top rungs), or theirs. A computer character with a trade of their own (an innkeeper, a merchant, a planter, a ship's captain, a master craftsman, a printer, a trader) brings their business, and wants to go on running it.
- **A new business, founded together**, where you are: any trade with a business of its own, at any of three sizes. Setting it up is paid from what you both put in:

${partnersTable()}

- **Your newspaper**: you keep it and run it; your partners have their shares of what it makes.
- **Cargoes only**: a company that pools money to buy goods and ship them.

## Drawing up the articles
On anyone's card (or at the market, under Partnerships): **Propose a partnership**. In person if they're here; by post if they're not (the articles go as a letter, and can be lost at sea). The articles say:
- **I.** what the firm holds; **II.** its name ("Drackley & Cole", or your own); **III.** the shares (with the fair split marked: what each brings, and a fifth more for the one who does the work); **IV.** the capital each puts in; **V.** who manages, and whether matters are decided **by the greater part** (shares over half) or **all together**; **VI.** who draws them up.
- **A lawyer** (an attorney or a law clerk in town, ${LAWYER_FEE.attorney} or ${LAWYER_FEE.clerk} coins, or yourself if you're in the law) draws up articles that **lean your way when partners fall out**: at arbitration, and in court. Another player who's a lawyer is paid the fee.

**A computer character** signs or refuses there and then, with every reason shown, as with any interaction: what they think of you, your name, whether it's their trade, what the business should make, whether the terms are fair to them (the strongest reason of all), whether they could afford their part, who'd run it, their nature, and how many partnerships they're in already. By post, their answer comes back by post.

**Another player** gets the articles as a scene: **sign**, **decline**, or send back **terms of their own** (the shares and what each puts in), back and forth up to ${MAX_ROUNDS} times. By post if you're in different places, so it works from one colony to another. Unanswered articles lapse after ${OFFER_DAYS} days.

## The books
Each month the firm's business is reckoned exactly as a business of your own would be: takings from its hands (more with the **managing partner's skill** in the trade, and a good deal less if they're away from the town or busy with other work: a managing partner who works for someone else minds only a business in their own trade), less wages, upkeep, excise and interest. A hand is taken on each month while there's room and money in the chest.
- **Profit is divided by share** straight into the partners' purses. Your share shows in Estate › Purse.
- **A loss comes out of the firm's chest**, and when the chest is empty it's **called from the partners** by share (into debt, if need be).
- Estate › Partnerships shows the firm's sign, the partners and their shares, the chest and the debt, a year of months as a chart, the last few as a ledger, and what your share is worth.

## Putting things to the partners
Any partner can put a matter to the others; computer partners vote by their own interests (with their reasons), players vote in a scene or on the page. Matters left unanswered for ${VOTE_DAYS} days count against.

${decisionsTable()}

## When things go wrong
- **Two sets of books**: the managing partner can keep a quarter of the takings out of the books (a computer partner with a deceitful or greedy nature may too). The others may find it out, the sooner the better they know trade and letters (and if their lawyer drew the articles): then **say nothing**, **demand it back** (persuasion), **take them to law** (a suit in the county court, played out as a [[trials|trial]]: win, and they pay it back and are put out of the firm), or **dissolve the partnership**.
- **A quarrel over the accounts**, with a partner who's soured on you or after bad months: **give way and pay**, **go to arbitration** (two merchants hear you; your lawyer's articles help), **let them sue**, or **dissolve**.
- **A partner fails** (a player's purse past ${-BAILIFFS_AT} in debt, or a computer partner's ruin): their creditors seize the share to sell for ${Math.round(FIRE_SALE * 100)} in a hundred of its worth. **Buy it yourself**, let **a creditor's man** take it (a silent stranger in the firm), or **wind up**.
- **War and the sea**: a firm's ship can be wrecked, or taken by privateers in wartime (a good master loses fewer); cargoes are lost more often in war. A town in the enemy's hands takes nothing, and still pays its hands.
- **A partner dies**: the share passes to their heir (a player's heir, or the eldest grown child, or the widow). You may **welcome the heir**, **buy them out** at a fair price, or put the **winding up** to the partners. With no heir, the share goes to the rest.

## Winding up
When a firm is wound up (sold up by vote, or forced): the business is sold, a cargo at sea is sold as it lies, **debts are paid first, then each partner's capital, then what's left is shared by share** (or a shortfall called by share). If buy-outs leave one partner, the partnership ends and **the business is theirs alone**.

> Tip: Pooling money is the point: two can set up a mill or a ship that neither could alone. Let the one who knows the trade manage it, and have a lawyer draw up the articles if you're the silent partner.

! Pitfall: A business nobody minds makes little. If the managing partner is away, or has other work, change the managing partner (a vote), or the books will show it.`,
    glossary: [
      [
        "Copartnership",
        "Two or more people in business together as one firm, under articles that set out each one's share, capital and part in the work.",
        "partners",
      ],
      [
        "Managing partner",
        "The partner who runs a firm's business and keeps its books; their skill in the trade makes the takings.",
        "partners",
      ],
      [
        "Silent partner",
        "A partner who puts in money and takes their share, and leaves the running of the business to the others.",
        "partners",
      ],
      [
        "Capital account",
        "What a partner brought into a firm. When a firm is wound up, debts are paid first, then each partner's capital, then the rest by share.",
        "partners",
      ],
    ],
  },
  // ---- end PARTNERS (r13)
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
Taken up, you wait in the gaol for the quarter sessions. You can bribe the gaoler or break out (a fugitive, with more heat); there's gaol fever. The sessions are played out as scenes ([[trials|Trials]]): the charge (counsel, or your own wits), the witnesses, your plea (**guilty** is lighter; **not guilty** goes to the jury; **benefit of clergy**, if you can read, under English law, once: a brand on the thumb instead of the rope), the jury (speak, let counsel speak, or **buy the court**), and the verdict.

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
    part: "people",
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
    part: "people",
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

A duel is played out as a run of scenes, from the seconds to the field at dawn ([[duels|Duels]]).

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
  // ---- HOME (r12): family and heirs, duels
  {
    id: "family",
    part: "people",
    title: "Family and heirs",
    line: "Your family tree, time at home, teaching the children, your heir, your line, and what passes on when you die.",
    where:
      "You › Family (the family tree); Here › Home (time with your family).",
    body: `## The family tree
You › Family opens with your family set down as a genealogist would: your grandparents and parents, your brothers and sisters, your husband or wife (and any before them), lovers who gave you children, your children and their husbands and wives, your grandchildren, and your in-laws. Each is a portrait with their name, their years (or their age) and how they're kin to you. The dead are shown in sepia with a cross; **your heir** wears a gold ribbon.
- **Moving about**: drag (or a finger) to move, the mouse wheel or a pinch to come closer, or the + and − buttons; **All** shows the whole family, **You** goes back to you. **Open it large** gives it the whole screen.
- **Click anyone** (or tap them) for their card.
- Husbands and wives are joined by a double rule; lovers by a red one; a child you never owned to hangs by a broken line.

## Time at home
At Home (Here):
- **An evening with the family** (every ${HOME_COOLDOWN.evening} days): stress falls; your husband or wife and the children remember it.
- **Time with your husband or wife** (every ${HOME_COOLDOWN.spouse} days): more stress gone, and they think a good deal better of you. If they're another player, they get the evening too.
- **Play with the children** (every ${HOME_COOLDOWN.children} days, children under fourteen): they love you for it.
- **Teach a child** (from ${TEACH_AGES[0]} to ${TEACH_AGES[1]}, once a month each): pick one of your own skills (you need 4 or more, and well ahead of them) and they learn a point of it, up to ${TEACH_MAX}. A nursery and schoolroom makes it two points for a parent of 8 or more in the skill, and spares your patience. **What you teach stays with them: if they become your heir, they start with it in their skills.**

## Children
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
- Your houses and land, your boats, and some of your people.
- About a third of your renown, and less than a third of your favour.
- Not your skills: the heir has their own (and what you taught them). Not your friendships, your patron, your ambitions or your offices.

Your heir starts with good health and a clear head, at their own home.

## Your line
You › Family shows the generations before you. Each generation of the line counts toward your Derp Coins at the end.

> Tip: Name an heir early, and give them a good start: lessons at home in your best skill, a tutor, a trade, a good marriage. A child heir can't work until sixteen.`,
  },
  // ---- EDU (r13)
  {
    id: "schooling",
    part: "people",
    title: "Children: school, apprenticeship and college",
    line: "Sending your sons and daughters to a dame school, a grammar school, a tutor or a convent; binding them apprentice to a master; college at home or over the sea; and the peoples' own ways of teaching.",
    where:
      "You › Family: Schooling and trades (choose for each child); Here › Home (each child's schooling at a glance).",
    body: `## Choosing
You › Family lists every child of yours (and orphaned brothers and sisters in your care) with what they're at: a chip on their card, the year of the course, what they've learned so far, and the latest letter from away. **Choose…** beside a child opens their future: **School**, **A trade** and **College** (for the native peoples, **The people's ways** and **A mission school**). Every choice says where, with whom, what it costs a month or once, how long it takes and what it teaches, and greys with the reason when it can't be had (their age, a boys-only school, too little Latin, a test of religion, no master with room, too few coins). **Bring home** ends it early: what's been learned is kept.

The family tree shows each child's schooling on their card ("At Harvard", "Apprentice cooper", "Journeyman cooper"), and the bills are lines in the month's budget (Estate › Purse). Three months unpaid and the school sends them home.

## School
${schoolsTable(false)}

- **Dame schools** are in any colonial town, for a penny or two a week. **Latin grammar schools** are in a capital or a town of 2,000 with a church, in the English towns from 1635 (Boston's Latin school) and the Dutch from 1659; a boy boards at the nearest if there's none at home. **Sewing schools** are for girls, in towns of 800.
- **The Jesuits** teach Catholic boys for nothing but the board: at Quebec (1635 to 1768), Mexico, Santiago de Guatemala, Havana, and in Maryland. **Convent schools** board Catholic girls: the Ursulines at Quebec (1639), Trois-Rivières and New Orleans (1727), the Congrégation de Notre-Dame at Montreal (1658), and the convents of Mexico, Santiago, Havana and Santo Domingo.
- **A tutor** lives in and teaches any child from five to fifteen: dearer than a school, quicker than any, and the family's girls learn as much as the boys.
- Teaching them yourself at home ([[family|Family and heirs]]) goes on alongside.

## A trade: apprenticeship
From ${BIND_AGES[0]} to ${BIND_AGES[1]} (about twelve to fourteen), a child can be **bound apprentice by indenture** to a master of a town: a real person, the town's master craftsman, ship's captain, printer, physician, merchant, attorney or innkeeper for their trades, and for the girls' trades a mistress of the town (the merchant's or the innkeeper's wife, a goodwife). The page looks in your town and in the towns you know of your own colony, nearest first, and shows each master with what the town says of them (a kind master, a fair one, a hard one) and whether they've room (each takes ${MASTER_CAP} at most).
- **The indenture**: some seven years (five or six for most girls' trades), living in the master's house, who keeps them in meat, drink, lodging and clothes and teaches them the art and mystery of the trade (and to read and write). Some trades ask a **premium** paid once; most crafts in the colonies ask none. It's drawn up as the period's document (an *Indenture of Apprenticeship*, a *Brevet d'apprentissage* before a notary in New France, an *Escritura de aprendizaje* in New Spain, a *leercontract* among the Dutch).
- **Out at the end** with their freedom dues and a new suit, a **journeyman**: any master of the trade takes them on a rung up the ladder ([[trades|Every trade]]), and an heir with their time served steps straight into it.
- **What happens on the way**: a hard master (complain to the justices, fetch them home, or tell them to bear it), a good one (a gift of thanks), a flight in the night (a search and a notice in the gazette, or let them go; young Franklin ran from his brother's printing house in 1723), the master's death (the indenture is assigned to the widow or the next master of the trade, or they come home), and letters home in their own hand (or the master's, for a little one).

${callingsTable()}

## College
From ${COLLEGE_AGES[0]} to ${COLLEGE_AGES[1]}, for sons only (no college admitted women in these years), with **Latin and letters** enough to be admitted (5 at the colonies' colleges, 6 at a university; a grammar school, the Jesuits or a tutor gets them there). Each college opens in its own year and takes its own people (a test of religion at some: Oxford only Anglicans; after 1662 no dissenter takes a Cambridge degree). ${COLLEGE_YEARS} years to the degree.
- **The bill** is by the month for chamber, commons and tuition, and ${COLLEGE_SURETY} months' bills must be in hand to be admitted. Entered as ${COLLEGE_RANKS.map((r, i) => `**${lower(r.name)}** (${["half", "the ordinary", "twice the"][i]} cost)`).join(", ")}. Over the sea, the passage is paid going out, and letters take two months.
- **Classmates** are real people of the colony who go on with their lives: they remember your child, and an heir who studied with them knows them (the closest is a friend).
- **The degree**: the *educated* trait, ${DEGREE_RENOWN} renown for the family, and doors into the learned trades: taken on a rung up as a minister, a lawyer, a physician, an official, a schoolmaster or a surveyor, and two up through the course's own door.
- **What happens there**: scrapes and fines, tradesmen's bills, the Great Awakening (1740 to 1745 in the colleges here), a challenge to a duel, the smallpox abroad, and after too much trouble being sent down (a letter may turn it to rustication).

**In the colonies**

${collegesTable(false)}

**Over the sea**

${collegesTable(true)}

${coursesTable()}

## The native peoples
Children learn from the people around them, for nothing: a person of the village teaches each path.

${pathsTable()}

**Mission schools** board children of the nations who live near one, teaching letters in their own tongue and the colonists', with the catechism. Many families feared what the missionaries would take from their children; some sent one for the letters and the friendship it bought. A child who finishes speaks the colonists' tongue. Where and when:

${missionsList()}

A Native scholar with the letters can go on to **the Indian College at Harvard** (1655 to 1698) or **Dartmouth** (from 1769), at the charity's cost.

## Heirs and the family
- What a child learns, at school, at the bench or at college, **goes into their skills if they become your heir**, with what you taught them at home.
- A child away when you die **comes home as your heir**: an apprentice with most of the term served is released a journeyman, a scholar three years in is given the degree; otherwise they leave with what they've learned.
- Your heir pays for brothers and sisters already away.
- **Computer families** do the same, at no cost to anyone: the town's children go to the dame school, the master's sons are apprenticed, the gentry's go to college, so there are apprentices in the masters' houses and classmates at every college.

> Tip: A boy bound for college wants a grammar school from seven (or a tutor) and his Latin at 5 by fifteen. A girl's trade (mantua-maker, milliner, midwife) is a living of her own. Look at what the town says of a master before you sign: a kind master teaches faster, and a hard one is how apprentices run away.`,
  },
  {
    id: "duels",
    part: "people",
    title: "Duels",
    line: "A challenge given or taken, played out from the seconds to the field at dawn, and what comes after.",
    where:
      "Their card (Challenge to a duel); or they call you out (an insult, an affair found out, a quarrel at a gathering).",
    body: `A duel is played out as a run of scenes, each with its choices. Along the top of each: **I.** the challenge, **II.** the weapons, **III.** the field, **IV.** the exchanges, **V.** after.

## I. The challenge
You can call out a rival, a nemesis or anyone who hates you (their card, under Hostile); people call you out too. One duel at a time. First, a **second**: a friend in town (or someone who thinks well of you) to carry your terms and see fair play. A second adds a point to your odds and can talk for you on the field; going without costs a point.
- Called out, you can also **apologise** (−4 renown, nobody bleeds) or **refuse to meet them** (−6 renown, and "coward" on your door).
- Having called them out, you can **withdraw the challenge** (−3 renown).

## II. The weapons
By the code, **the one who was challenged chooses**.
- **Smallswords**: skill tells. Up to three passes; it ends when someone is badly hurt (${DOWN} wounds) or yields. Wounds are seldom mortal.
- **Pistols**: nearer a coin toss. One shot each, two at most if both miss; a ball can kill.
If they choose, your second can argue for the other (persuasion; it may not wash).

## III. The field at dawn
Take your ground; or a last **word of peace** through your second (persuasion against their pride: if they hear it, you shake hands and nobody bleeds); or, with pistols, **resolve to fire into the air** (if they do the same, honour is satisfied and the town thinks well of you both; if not, they fire at you at leisure); with swords, **ask that it end at first blood**.

## IV. The exchanges
Each choice shows your odds; point at them for why. They come from your **Fighting** against theirs, and from traits on both sides: brave, scarred (+1), craven (−2), an old wound, sickness, age past 55; a strong arm and a cruel streak with a sword; practice (diligent) or an unsteady hand (a drunkard) with pistols; your health and nerves; and your second.
- Swords: **keep your guard** (safer, lighter wounds either way), **press the attack**, or **feint, then thrust** (the deepest wound if it works; sly sorts do it better). After a pass you can **yield**.
- Pistols: **take careful aim** (the better shot; they fire as you do), **fire at the word** (worse, but if you hit first their shot goes wild), or **fire into the air**.

## V. After
- **Wounds** come off your health (a grave one can kill you, and your heir carries on). Their wounds may kill them.
- **Renown**: +6 for the victory (+4 if they died of it), +1 for standing and losing, +2 when honour is satisfied, +3 for firing into the air together; −3 for yielding. The loser remembers it.
- **The law's interest**: duelling is against the law in the colonies: a duel draws ${DUEL_HEAT} [[crime|heat]], a death ${DUEL_DEATH_HEAT}. After a death you can face it out (+2 renown), lie low (the heat cools a little; your nerves don't), or ask your patron to speak for you. Among the native peoples it's their custom, not the law's affair.
- If they live, you can offer them your hand: rivals no longer, if they'll take it.

Duels between players: the one challenged accepts or refuses (refusing costs renown); both then see the duel played out as a scene.

> Tip: Name a second, choose swords if you're the better fighter and pistols if you're not, and keep your guard until they're hurt.

! Pitfall: A scene left unanswered is decided for you by the seconds (the first choice you could take) after ${DUEL_DAYS} days.`,
  },
  // ---- end HOME (r12)
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
  // ---- DICE (r14): Liar's dice in the tavern
  {
    id: "dice",
    part: "people",
    title: "Liar's dice",
    line: "The tavern's game of nerve: five dice under a cup, bids on what lies under all the cups, and the call of Liar!",
    where:
      "The tavern: Things to do › Liar's dice… (or sit down at a table that's gathering there). A table you're sitting at waits at the top of the screen while you step away from it.",
    body: `## The game
- ${cap1(numberWord(DICE_MIN))} to ${numberWord(DICE_MAX)} at a table. Each puts in the **stake** (${STAKES.join(", ")} coins a seat), and together they make the [[dice|pot]].
- Everyone shakes **${numberWord(DICE_EACH)} dice** under a cup and looks only at their own.
- In turn round the table, each **bids** on how many dice of one face lie under *all* the cups, theirs and everyone else's: "four fives". Each bid must beat the last: **more dice** ("five twos" beats "four fives"), or **as many of a higher face** ("four sixes" beats "four fives").
- Instead of raising, call the last bid a lie: **Liar!** Every cup comes up and the dice are counted.
  - At least as many as the bid: it **stands**, and the one who called loses a die.
  - Fewer: it was a **lie**, and the one who bid it loses a die.
- The loser of the call **opens the next round**, and everyone shakes again.
- With no dice left, you're **out**. The **last with dice takes the pot**.

## Ones are wild
A one counts as **any face**: when "four fives" is called, every five and every one under the cups is counted. So nobody bids on ones, and your own ones count for whatever you bid.

## An example
Three at the table: fifteen dice. You hold five, five, one, two, six: two fives and a one, so **three that count as fives**. Ten dice are hidden from you, and about a third of any face's worth show among them: three or so more. So "four fives" is likely, "six fives" a stretch, "nine fives" a long shot.
Hal opens with "three fours". You raise: "four fives". Bea says "five fives". Hal looks hard at you both and says "Liar!" The cups come up: your three, Bea's five and one, Hal's single five: six that count. Five fives stands, so Hal loses a die, and opens the next round.

## Who sits down
Open a table: choose the stake, and ask up to five of the people in the tavern. Each of the town's people decides at once, with their reasons, as anyone does: their **means** (a labourer won't stake 25), **what they think of you**, their nature (a drunkard never says no; the greedy like a pot; the craven and the diligent hold back; a zealot calls dice the devil's bones) and their calling (a minister doesn't dice). Roll as soon as one has sat down. A table nobody rolls breaks up after ${OPEN_DAYS} days, every stake given back.
- **Getting up**: before the first roll, your stake comes back. In a game, between rounds you get up at once; mid-round you go when the cups are next lifted. Either way your stake stays in the pot.
- Setting out on the road, dying or becoming someone else takes you from the table; mid-round, that round is thrown in and rolled again.
- Nobody dices with a debtor. A drunkard plays on tick, into [[money|debt]].

## Playing with other players
Other players in the same tavern see the table on its tile ("Dice: 3 at the table") and among the people there. Ask them from the list and they get an invitation to accept or decline (left unanswered, it's a no); or they sit down on their own until the first roll.
- **Your dice are yours alone**: nobody else's game is ever sent your dice, nor theirs to you, until the cups are lifted.
- **Nobody can hold up the table.** Turns go by the dice, not the clock. In company each player has ${STALL_SECONDS} seconds to bid; then (or at once, if they've gone from the game) the table makes **the smallest raise** for them, or calls if that would be a long shot. The host's pace still rules the world, and the table plays on whether the world is running or paused.
- Alone, the world holds still while you sit at the table, as it does for a scene.

## Tips
- Bid what your own dice make likely: your matches and wild ones, and a third of the dice you can't see. The picker says how likely your bid is from what you can see: **certain**, **likely**, **a stretch** or **a long shot**.
- A bid that needs more dice than the table could hold for it is a lie: call it.
- Others' bids say something: whoever raises fives twice probably holds some.
- Bluff now and then; the town's people do. The deceitful, the ambitious and the bold bluff more, the honest and the craven less; the shrewd call more readily; and a sharp intrigue (their Stealth) makes any of them better at it.
- **Tells**: sometimes, as one of the town's people bids, you read their face ("Hal's hand strays to his cup: he isn't sure of it"). Whether you catch it, and whether you read it right, goes by your **Stealth** against theirs (a drunkard is an open book). More often right than not; never certain. Other players show no tells.

## What it comes to
- The winner takes the pot. A pot of ${BIG_POT} or more is talked about in town, and worth a little [[standing|renown]] (+1; +2 for 100 or more).
- An evening at the dice eases the mind (the winner −8 stress, −12 for a big pot; a small loss −3), but losing a big stake smarts (+6).
- It teaches **Stealth** (a straight face and a quick eye): ${XP_TABLE} experience, and ${XP_ROUND} more for each round you sit through, up to ${XP_MAX}; a third as much for any more tables that week.
- The town's people at the table remember it: "+5 A good night at the dice", or, if you took their money at a stake of 5 or more, "−5 Took my money at the dice".
- Two [[coins|achievements]]: **Down to the last die** (win with one die left under your cup) and **The whole table** (win against five others).
- Now and then in the tavern, once you've played at the dice: a stranger winning too often with loaded dice (a sharp eye catches him); and, after a big pot, a sore loser.

> Tip: Open at the face you hold most, a little under what you'd expect; raise on your own faces; and call when a bid needs more than half the dice you can't see.

! Pitfall: Every die you lose makes your bids weaker and everyone else's harder to judge. Don't call a bid that your own dice already nearly make.`,
    glossary: [
      [
        "Liar's dice",
        "A tavern game of bluff: bid on how many of a face lie under all the cups, or call the last bid a lie.",
        "dice",
      ],
      [
        "Wild (dice)",
        "At Liar's dice a one counts as any face; nobody bids on ones.",
        "dice",
      ],
    ],
  },
  // ---- end DICE (r14)
  // ================================================================ standing and power
  {
    id: "standing",
    part: "power",
    title: "Renown",
    line: "Who knows your name, and the doors it opens.",
    where: "The banner; Society › Standing.",
    body: `Renown is how many people know your name, and think it worth knowing. It's the key to most doors in public life.

## What it opens
| Renown | What it opens |
|---|---|
| 5 | the governor's levee (Pay your respects), for those without a rung or birth to get them in |
| 15 | founding a cause; standing at a native council fire |
| 20 | a place at court; standing for the assembly without property |
| 40 | a company of your own, without an officer's rank |
| 50 | (with favour 15) an invitation to Parliament may come |
| 60 / 150 | your station rises: gentlefolk, then the better sort |

It also weighs in nearly every answer: offices, petitions, recommendations, a governor's reprieve at the gallows, and being made governor.

## Winning it
Promotions and higher rungs (some trades bring renown every month at the top); office and its duties; gatherings that go well; gifts to the town and the great works; standing a round; contracts, battles won and leads that pay; speaking at the council; reaching an ambition; a newspaper of your own.

## Losing it
Above 15, renown slips back a little each month (a fiftieth of what's above 15) unless it's fed. Scandal, failed contracts, living beneath your station, debts unpaid and defeats cost it. Your heir starts with about a third of yours.`,
  },
  {
    id: "favour",
    part: "power",
    title: "Favour",
    line: "The crown's ear (or the elders' regard): what it does for you, and how to win it.",
    where:
      "The banner (Favour) and Society › Standing; write to the crown at the governor's house or the docks.",
    body: `Favour is whether your name is known and liked at home: in London, Paris, Madrid, Amsterdam or Stockholm. Among the native peoples it's the **elders' regard**. It runs from 0 to 100.

## What favour does for you
- **Being made governor.** When a governor dies or is recalled, the crown weighs everyone of standing: renown, plus favour counted **half again**, plus seats in the council (25) and the assembly (10), county offices, diplomacy and stewardship. It looks for about 100, and more than the council's best.
- **An invitation to Parliament**: with renown 50 and favour 15 (and 28 years or more), one may come in any month.
- **Petitions**: for a pardon or redress, favour adds up to 15 to the answer; for a charter for your settlement, up to 12; for an office in the governor's gift, up to 10.

## Winning it
- **Write to the crown** at the governor's house or the docks: 2 coins, once every 60 days, a test of your Letters. A well-judged letter wins 6 favour; a poor one, 1.
- **Gifts to the town** (Estate › House & land), and the great works.
- In office: a burgess's bill that passes (+3), carrying a wampum belt as a town's speaker (+5).
- Among the native peoples: tobacco and gifts at the council fire.
- Some choices in letters and events (siding with the crown wins favour and often costs you with your neighbours).

## Keeping it
Favour fades by 2% a month. Your heir keeps less than a third of it.

> Tip: Write to the crown every two months from the moment you can afford it. It's the cheapest road to a governor's chair.`,
  },
  {
    id: "office",
    part: "power",
    title: "Office",
    line: "County and town offices, the assembly, the council and the governor's chair.",
    where:
      "Society › Office (this county's offices); Society › Standing (the assembly, the council and the road to governor); the governor's house.",
    body: `## One office at a time
You hold one political office at a time. **Winning a poll, being appointed, or accepting a seat resigns the office you held**, at once, and your journal says so. Before you stand, seek or accept, the page (and the letter offering it) warns you which office you'd give up.

What counts: the county and town offices below; a seat in the assembly (a burgess's seat in the house, and the speaker's chair, are part of the one office); a seat on the governor's council; and the governor's (or a native leader's) chair. What doesn't: your work and its ladder (a watchman by trade, a sheriff's rank in the watch, an officer's commission), a militia rank, a company of your own, a place at court, being a settlement's proprietor, or leading a rising. A governor holds no other office. If you ever find yourself holding several (an old game, a character taken over), you keep the best and resign the rest on the next day.

## County and town offices
Every town has its offices, filled by real people of the town. Society › Office shows each one, who holds it, its pay, how it's filled, and whether you could have it.

${officesTable(false)}

Native towns have their own:

${officesTable(true)}

French, Spanish, Dutch and Swedish towns use their own titles (capitaine de milice, alcalde, schout and so on), and native titles follow the people (werowance, mico...).

- **Elected** offices: **Stand at the poll** on the offices page, then canvass (the tavern, the market, the council fire), print a broadside (the press, 2) and stand a round. The poll decides, every year or two (four for a native town council); an empty seat gets a special poll.
- **Appointed** offices are given by the justices, the county court, the sachem or the governor: **Seek an appointment** on their card, or petition them by letter.
- Each office has a **duty**, done once a month in the county (neglect it five months and you're warned; eight and an appointed officer is dismissed, an elected one loses renown), and a **lever** to pull now and then.
- An office in your gift is yours to fill when it falls empty.

Local office leads up: it counts toward standing for the assembly and being made governor, and a burgess sits in the colony's assembly.

## Real authority
Besides its duty and its lever, each office has powers of its own (on the county's page, under yours). Each has its cost, its risk and something to show for it: a patrol makes the watch sharper (rogues likelier caught) and the town quieter; a levy fills the colony's treasury and angers the county; a resolution moves a cause's support; a seizure, a curfew or a warning-out makes enemies.

${powersTable(false)}

Native towns:

${powersTable(true)}

French, Spanish and Dutch officers do the same under their own names (the alcalde feasts the cabildo, the schout collects the fines and the burgher fees, the capitaine de milice leads the habitants and their allies on a war party).

## Officers under you
Some offices name others: the justices name the constable and the watch, the sheriff names the collector of the rates, a city's mayor names its watch, the sachem the war captain and the speaker, the clan mothers the sachem, and the governor the justices, the sheriff and the county lieutenant. Offices in your gift are listed on Society › Office: fill a vacancy (you have two months before the county fills it), or **dismiss** whoever holds one (they'll remember it).

## The assembly
Each colony has an assembly (the House of Burgesses, the General Court...), with elections every 3 years. To stand: a freeholder (land, a trade of your own), a man of property (40 coins), a county officer, or someone well known (renown 20). The assembly, alas, admits only men in this century. Among the native peoples, the council fire hears speakers and people of renown (15). **Stand** at the governor's house (the council fire), then campaign until the count.

## The court and the council
**Seek a place at court** at the governor's house in the capital: renown 20 (or a seat in the assembly) and the governor's good opinion (15). When a council seat falls empty, the governor may offer it to someone at court he likes (a letter: accept or decline). The council itself, its seats and its politics are in [[council|The governor's council]].

## The governor's chair
When the governor dies or is recalled, the crown appoints a successor from among those of standing ([[favour|Favour]]). Among the native peoples, when the leader dies, the elders choose someone of great renown and regard (about 70, and more than the council's best).

## Governing
A governor's decisions are on Society › Office: taxes, how much of the revenue goes home to the crown (more pleases it; less keeps the colony rich), building (forts, churches, farms, ports, courthouses), calling out the militia, war and peace, laws (up to 4 at a time) and public works. The council's advice comes with each: going against it costs a little. Appointing and dismissing the council, proclamations, and the assembly's bills are on Society › Council ([[council|The governor's council]]).`,
  },
  // ---- POWER (r12): the council, trials, the press
  {
    id: "council",
    part: "power",
    title: "The governor's council",
    line: "Eight seats with real work, their politics, and the governor's hand; the assembly's bills.",
    where:
      "Society › Council (the chamber, your seat, the governor's hand, the assembly); the governor's house at the capital.",
    body: `## The seats
The council sits with the governor at the capital. Each seat has its title among its people and a portfolio of its own, and things it can do to the colony through its treasury, its laws, its land, its forts and its treaties.

${seatsTable()}

Native peoples keep their own fire: the war chief, the speaker, the keeper of stores, the scout and the healer.

## Reaching a seat
A seat is reached by your **case**: renown, favour at home, what the governor thinks of you, your connections (a patron, friends already at the table, a place at court, a seat in the house or a county office), and your fitness for the portfolio (the Secretary's letters, the Receiver-general's trade, the Surveyor-general's woodcraft...). Being young, in disgrace, wanted by the law or living poorly counts against you. Society › Council shows your case for every seat.
- An **empty** seat wants a case of ${CLAIM_BAR}; **unseating** someone wants ${UNSEAT_BAR} or more (more against a able holder the governor likes). Another player's seat can't be taken.
- **Ask the governor** for a seat at the governor's house in the capital (once in 90 days), or be received at court and wait for a letter offering one. A player governor decides for themselves.
- One office at a time: a seat on the council is your one office ([[office|Office]]).

## Council politics
- **Advice and votes.** Measures (paper money, farming out the customs, a fort, presents to a nation, a treaty of trade, a land grant, the taxes) are put to the council and divide a week later; you vote with the governor or against him. The governor's own decisions (war, taxes, laws, works, proclamations) come with the council's advice; a governor who goes against a majority pays a little (unrest, and councillors who remember).
- **Parties.** Each councillor sits with **the court party** (the governor's friends) or **the country party**; the speaker is the house's man. Your votes decide which you're counted with.
- **The governor's favour** (0 to 100) rises with votes for his measures and a seat well used, and falls with votes against, failures, scandal and the papers' attacks. Below 25 you're warned; below 15 a governor the computer plays may put you off the council.
- **Scandal.** Graft (land jobbing, the treasury's money lent to friends) pays, until it comes out: disgrace, a scandal, the governor's favour gone, perhaps dismissal and a trial for corruption.
- When no player holds a seat, the computer's councillors use theirs now and then, sensibly: audits when the treasury's low, treaties with an angry neighbour, a muster in wartime, a day of thanksgiving when the counties are restless.

## The governor's hand
A governor appoints anyone of the colony to a seat (a player is asked, and may refuse) and dismisses whoever has lost their confidence, issues proclamations, and answers the assembly.

${proclamationsTable()}

## The assembly
Members (burgesses, and those elected to the house) bring in **bills**; the house divides a month later, the court party against the country party (a member from the county a bill is for votes for it; the bringer's renown and persuasion, and the papers, sway the rest). A bill that passes goes to the governor, who **assents** (it's law) or **vetoes** it; a governor who says nothing for three weeks has assented, by custom.

${billsTable()}

- **The speaker** is chosen by the house from its members after each election (put your name forward for the chair), sits on the council, can **steer** a bill (bringing waverers round), and carries the house's address to the governor.
- A governor can **dissolve** the house (a new election within the month; unrest) or **prorogue** it for six months (no bills and no new laws until it sits; unrest).`,
  },
  {
    id: "trials",
    part: "power",
    title: "Trials",
    line: "Cases at law played out as scenes: the charge, the witnesses, the plea, the jury, the verdict.",
    where:
      "Scenes in the court-house (they wait in your diary); Society › Office (the court roll, and people you could bring before the court).",
    body: `## Who comes to trial
- **You**, for a crime: taken up by the watch, you wait in the gaol for the sessions ([[crime|Crime and the law]]).
- **Someone you accuse**: a constable brings people before the justices, a churchwarden presents sinners, the attorney general prosecutes for the crown, and anyone who knows another's secret (a crime, adultery, a child out of wedlock) can bring them to court (Society › Office).
- **A debtor**: a debt left unpaid twice over (six months) brings the lender's suit: the debtors' prison and your goods seized.
- **A duel's survivor**: a death at dawn may bring a trial for manslaughter.
- **A printer**, for libel (a person attacked in print sues) or seditious libel (the governor prosecutes) ([[press|Newspapers]]).
- **A councillor** in disgrace, for corruption.
- **Witchcraft** in the English colonies (above all New England) from 1640 to 1700, and **heresy** before the Holy Office in the Spanish and Portuguese colonies. Both are rare.

## The scenes
Each player in a case (the accused, the accuser, the judge) gets the scenes that are theirs, in the court-house; the computer plays everyone else. A scene waits about ${STAGE_DAYS} days for an answer; after that the court goes on without you.
1. **The charge.** Engage counsel (a better defence), answer it yourself, settle with a private accuser, or bribe the clerk to lose the papers. The accuser presses the charge, settles, or withdraws it.
2. **Witnesses and evidence.** Call your friends and family in the county, cross-examine (letters), pay a witness to forget (perjury if it fails), or say nothing. The accuser calls witnesses, or pays one to remember.
3. **The plea.** Not guilty (the jury decides); guilty (a lighter sentence, no jury); benefit of clergy (under English law, if you read, once). A witch may **confess and name others** (those who did were spared the rope at Salem); a heretic may **abjure** and do penance; a printer may plead **the truth** (juries listen, more so after Zenger's case in 1735).
4. **Before the jury.** Speak for yourself (persuasion), let counsel speak, throw yourself on the court's mercy, or buy the court (worse if it's found out).
5. **The verdict.** The jury (or a justice who's a player) decides, and the sentence is carried out when you've heard it.

The case's standing is the evidence against the defence and the jury's leaning (what the county thinks of the accused). The scenes say how it looks.

## Sentences
Crimes by their grade and your record, as in [[crime|Crime and the law]]: a fine, the pillory, the whip and the gaol, the brand, transportation, the rope (a governor may reprieve). Others: a presentment, a fine of 3 or the stocks; libel, a fine of 8 to 25 (and the pillory for the worst); seditious libel, the pillory, a fine of 30 and six months; debt, the debtors' prison and goods seized; corruption, dismissal from every office, a fine of 10 to 30 and, for the worst, six months; a death in a duel, manslaughter (burned on the thumb, and a year); witchcraft, the rope, or banishment, or a public penance for one who confessed; heresy, penance in the sanbenito, or half your goods and exile.

## Presiding
A **justice of the peace** who is a player presides over the county's cases: the sessions bring one now and then (a stolen hog, an assault, a disorderly house, a bastardy case), and anything the constable or the churchwardens bring. At the verdict you sum up for a conviction (the full sentence or a merciful one), direct an acquittal, leave it to the jury, or take the money someone has put in your way. Fees and renown come with it; a guilty man let go angers the town, and a justice who sells verdicts may be found out.`,
  },
  {
    id: "press",
    part: "power",
    title: "Newspapers",
    line: "A paper of your own: readers, writers, a line, and pieces that move elections, causes and governors.",
    where:
      "Society › Press; the printing house (in a capital, or a town of 2,500).",
    body: `## Getting a paper
- **Found one** at a printing house where the law allows a press: ${FOUND_COST} coins, letters 3. Newspapers come to the English colonies in ${PAPER_YEAR.english}, New Spain in ${PAPER_YEAR.spanish}, New Netherland's successors in ${PAPER_YEAR.dutch}, New France only in ${PAPER_YEAR.french}; a free nation of your own may print when it likes.
- **Buy one** from its printer, at its printing house (about its worth and a fifth).
- **Rise to it**: the printer's trade (News and print) ends at Publisher, with a press and a paper of your own.
- **Licensing.** In its years (the English colonies until the 1720s, the other crowns always, and wherever the governor has passed the Licensing of the press) a press wants the governor's licence; he gives it to people he likes, and to papers for the government. You may print without one, but every piece risks the press being seized.

## Running it
- **Readers** follow the town's size, the paper's line, its credit, the times (war sells) and its writers. Each reader brings in a little each month; writers cost ${WRITER_WAGE} a month each, the paper and ink 1.
- **Writers** (up to ${MAX_WRITERS}), hired from the townsfolk who can write: one more piece a month each, and the best one's wit makes every piece land harder.
- **The line**: for the government (an easy licence, fewer readers when the town is angry), open to all, or for the country party (readers in hard times, and the governor's suspicion). Changing it costs credit.
- **Credit** (0 to 100): how far the paper is believed. Pieces that land raise it.

## Pieces
Each month you may print one piece, and one more for each writer: **for or against** a person (a candidate, an officer, a councillor, another player), a cause, or the governor. The page shows how hard it will land and what it risks.
- **A person**: their chances at the polls move (for a county office and for the assembly), a councillor's standing with the governor moves, a player's renown moves.
- **A cause**: its support in the colony moves.
- **The governor**: praise calms the town and pleases him; an attack stirs the town and the causes against the government, and he remembers it.
- **The dangers**: a person attacked may **sue for libel** (a player decides for themselves: sue, answer in their own paper, or let it pass); the governor may **prosecute for seditious libel** or **shut the press** for a year; an unlicensed press may be seized and fined.

## In the news
Every piece goes out as talk from the paper's town, so it reaches the news of everyone within reach. **Reading the gazette** (the tavern or the printing house) gives you the latest pieces of the papers within reach, with the leads and the prices current; and a printer hears the stories behind leads first.`,
  },
  {
    id: "military",
    part: "power",
    title: "The army and war",
    line: "Enlisting, marching, battles, commissions, command, and war between nations.",
    where:
      "The fort (enlist, drill, take command); Work › Your work (under arms); an army's page (click it on the map).",
    body: `## Enlisting
Ask the officer who takes recruits at the fort (your own nation's): you're a **private**, 2.5 a month. With fighting 3 and no other work you can **buy a commission** (40) at your own nation's fort instead, and start a lieutenant. The **militia** is part-time: enrol at the tavern or the fort. Among the native peoples, young warriors join at the council fire.

## Marching with the army
When an army of yours musters where you serve, you fall in with it: where it goes, you go; when it fights, you fight. Your post goes where it goes, so being away doesn't count against you. Battles bring wounds, renown and promotion; a battle you're in comes as a dispatch explaining how it went. To come and go on your own, **stay behind in garrison** at a fort.

## Rising
Corporal, sergeant, then the commissions (lieutenant to general): a commission comes from the marshal, the governor or a patron who thinks well enough of you, or (up to major) can be bought. Officers keep themselves out of their pay. War is when soldiers rise.

## Command
A colonel or general (a war chief among the native peoples), the marshal or the governor can **take command** of an army where it stands (at its fort or council fire). Then **March to…** and pick a province on the map, or right-click one. You choose where it goes; it fights and besieges on its own. Split, merge and recruit from the army's page.

## Your own company
Captains can raise twenty men of their own and take the field with them ([[followers|Your people, your company]]).

## War between nations
The colonies and the native nations make war and peace on their own: over land, trade, old grudges and the wars in Europe. A war shows on World with its battles won. In wartime prices of guns, tools and food rise, and colonies at war are blockaded. A governor can declare war and offer peace (if the enemy would take it).`,
  },
  {
    id: "movements",
    part: "power",
    title: "Causes and risings",
    line: "Movements for reform, against the crown, or to drive the colonists out; and the risings they become.",
    where:
      "Society › Causes; the tavern or council fire (join, hold meetings); World (every cause abroad).",
    body: `History brings its risings (Bacon's, Leisler's, the Pueblo revolt, Pontiac's war, the Regulators, the Sons of Liberty), and you can found your own.

## Kinds of cause
- **Reform**: change how the colony is run.
- **Overthrow**: put the governor out, and someone else (you) in.
- **Independence**: break with the crown.
- **Drive them out**: among the native peoples, push the colony back.

## Joining or founding one
Join at a tavern or council fire where its people are (the place lists the causes there). To found your own (Society › Causes): renown 15, in a colony among its people (or, for the native peoples, where a colony presses on yours). Name it, or leave the name to the printers.

## Growing it
- **Hold a meeting** (a tavern or council fire, among its followers, every 30 days): support grows; informers listen.
- **Write a pamphlet** (the press, 1 coin): spreads the cause, and may bring the constable.
- **Put arms by** (the market, the docks or a village, 10 coins): a rising starts with more men.
- **Recruit** people from their card.

## The rising
At **${RISE_SUPPORT} support** and **${RISE_MEMBERS} sworn** (the leader among them), the leader may call the rising, where the enemy holds the land. There's no going back: a rising is a real war, with its own army in the field. Command it and march on the enemy's capital: hold out and win, or hang. If it wins, the map changes: an overthrow puts its leader in the governor's chair; independence frees the colony from the crown, with its leader at its head. Either way the leader frames the new government ([[founding|A colony of your own]]), and everyone sworn to it wins renown (the leader most).`,
  },
  {
    id: "founding",
    part: "power",
    title: "A colony of your own",
    line: "Planting a settlement, bringing families with you, and framing the government of a new nation.",
    where:
      "Society › Colony; on anyone's card, Ask them to come to your settlement.",
    body: `## Planting a settlement
1. **Choose a place**: no one's land, within three months' journey. Society › Colony lists the empty sites, with their land, their goods and the days to get there (and whether native people live there).
2. **Choose the terms** for the families: ${SETTLE_TERMS.map((t) => lower(t.name)).join("; ")}.
3. **Charter or not**: as a chartered colony, ask your governor at the capital (or petition by letter): they decide with reasons, weighing what they think of you, your renown, your favour and the families ready to go. Without one you go as squatters, or as **your own colony, answering to no crown** (the old colony won't like it).
4. **Begin** (${FOUND.start} coins).
5. **Gather families**: ask people (their card: Ask them to come to your settlement). They decide by how they like you, the terms and their own lot. You need at least ${FOUND.minHouses} households, at most ${FOUND.maxHouses}.
6. **Lay in supplies** (${FOUND.supplyBase} coins and ${FOUND.supplyPer} a household) and pay their passage (${FOUND.passagePer} a household).
7. **Set out** and lead them there. Get it together within two years, or it falls apart.

On arrival the site becomes a real province: you're its founder and governor under your crown, or an independent new nation if you went without a charter or broke with it.

## A new nation
After a rising you led wins (an overthrow or independence), or when an independent colony is planted, you frame the government: its **name** and adjective, its **flag** (colours, a division, a charge), its colour on the map, its **form** (republic, commonwealth, confederacy, kingdom), its capital, and its first officers. The new nation appears on the map, and the computer runs it alongside you.`,
  },
  {
    id: "europe",
    part: "power",
    title: "Europe",
    line: "Going home rich, or because you were asked (or ordered).",
    where: "Society › Standing (at the bottom); sail from a port's docks.",
    body: `## Going home rich
With **${EUROPE_FORTUNE} coins** you may sail for Europe from a port and live there as a person of means. Leave your heir behind and you carry on as them, with half the purse; take the whole family and your story in the Americas ends.

## Invitations
- **A seat in Parliament** (or its like): with renown 50 and favour 15, aged 28 or more.
- **A regiment in Flanders**: for a major or higher, while there's war in Europe.
- **A recall**: a governor whose colony has lost the crown's favour is called home to explain it. A recall isn't a request: ignore it and a new governor is sent anyway.
- **Exile**.

An invitation waits for an answer until its date; accept it from Society › Standing, or decline (except a recall). Among the native peoples, only an invitation takes anyone across the ocean.

Going to Europe is worth Derp Coins at the end ([[coins|Derp Coins]]).`,
  },
  // ================================================================ the world
  {
    id: "map",
    part: "world",
    title: "The map and the fog",
    line: "Reading the map, getting about on it, and the fog over what you haven't seen.",
    where:
      "The map: click a province to see it, right-click (or hold) to set out; the buttons at its top right; the map views at its foot.",
    body: `## On the map
- **You** are the medallion with your face, walking the roads when you travel. Other players have their own, with their names.
- **Your boats** lie at their ports, with their names when you zoom in.
- **Leads** are pinned with a red seal (gold once something's found there).
- Towns, forts, ports and armies show on the land; sieges and battles flare where they happen.
- **◎** finds you; **+** and **−** zoom (or the + and − keys, or the wheel).
- **Map views** at the foot: Nations (who holds what), Terrain, Economy (what each province's land yields) and People (how crowded).

Click any province for its page: who holds it, its places, the people you know there, and **The road there**. Right-click (or hold) a province to set out at once.

## Harbours and sea lanes
Every coastal province has a **harbour**, drawn on its shore: a wooden **pier** at a small colony's landing, a stone **quay** with piers at a port, a quay with a crane at a great one, **canoes drawn up** below a native village, and an **anchor** off a shore nobody holds. The great ports sit where they really were (Havana on the north coast, New York on its bay, Boston, Charles Town, Quebec on the river); inland lake country has its landings too.

Every boat on the map keeps to the water. A ship sails harbour to harbour along the sea lanes: whoever goes by sea walks down to the quay, sails, and on landing **walks up from the quay to the town**. So do armies at sea, the convoys for Europe (out from the harbour and away over the horizon), expeditions by canoe, your own boats at their moorings, and the boats working off each town. Crossings with no border between (the Sound, the Chesapeake, the islands) go by boat. Canoes go up and down the rivers (the Mississippi, the Ohio, the Columbia) and along the lakes and the coasts between neighbours; nobody paddles a frozen river.

In winter the northern harbours freeze: ice along the shore, and no boats out ([[seasons|The seasons]]).

## The fog of war
Each line of characters has its own map. You start knowing your own colony (or your people's land), the country two marches around home, and, if you're a sailor or a trader by upbringing or work, the sea lanes from home's ports. Everywhere you go, and everything you can see from there, is added for good. Heirs keep the line's map.

Country comes in three kinds:
- **Unknown**: dark parchment marked *Terra Incognita*. Nothing is shown there: no owners, towns, names, armies or travellers.
- **Known, but out of sight**: land, borders, towns and owners as you last saw them, under a faint veil. No armies, travellers, ships or sieges.
- **In sight**: everything, as it is now.

**How far you see**: your province and its neighbours within sight: about 210 km on plains, 160 in woods, 130 in jungle, 260 from hills and 280 from mountains; more along the coast, and from a fort's walls. On the road you see around both ends of the stage.

**Seeing further**: a governor (or a sachem) sees all of the colony or nation; an officer sees the country around the army; the marshal sees around all the nation's armies. Reading the gazette, listening in the tavern or the market, and hearing news at the docks put the places in the news on your map, and every lead marks its place.

Alaska is off the board, drawn dark and hatched.

> Tip: The gazette is the quickest way to fill in your map.`,
  },
  {
    id: "world",
    part: "world",
    title: "Nations, wars and news",
    line: "The colonies and the native nations, the crown, wars and risings, and how you hear of them.",
    where:
      "World; any nation's page (click its name); the News panel on the map.",
    body: `## The nations
The colonial powers (England, France, Spain, the Netherlands, Sweden, in their years) and some forty native nations, each with a leader, a council, provinces, armies and a treasury, run by the computer. A nation's page shows its leader and council, its provinces, its people, what it's known for, and its armies (those in sight).

The colonies grow: each founds a new settlement every few years (a small colony every four or five, a big rich one every year or two). Native nations take back their own former land in peace terms.

## The crown
Each colony answers to a crown at home, which wants revenue and obedience: its favour with the colony rises and falls with what's sent home, the laws passed, and the governor's conduct. A colony that has lost the crown's favour may see its governor recalled; one that has had enough of the crown may rise.

## War
Nations make war over land, trade, old grudges and the wars in Europe. World lists the wars: who against whom, why, since when, and the battles won. In wartime, armies march, towns are besieged and occupied, prices shift, and the sea is dangerous.

## Risings
Causes brew among the people, and some rise ([[movements|Causes and risings]]). A rising or an independence is proclaimed across the top of the screen.

## The news
The **News** panel on the map has the colonies' news as it reaches you: wars, battles, treaties, risings, successions. Click a battle for its report. In company, the other players' chat is there too. The talk in the taverns (Here) is the news that has reached that town; the gazette brings it faster, and with prices.`,
  },
  {
    id: "journal",
    part: "world",
    title: "The journal",
    line: "Your diary, the letters that wait on you, your leads, and the story so far.",
    where: "Journal.",
    body: `- **Diary**: everything that happened to you, newest first, across the generations. Show everything, or only the good or the bad. At the top, anything **waiting on you**: letters and events with choices, and when each decides itself.
- **Leads**: stories worth chasing ([[leads|Leads]]).
- **The story**: the moments that made your line (births, marriages, promotions, offices, battles, deaths), and **Your story, told**, as it will be told in ${END_YEAR}.
- **Achievements**: every achievement, earned and not, and the Derp Coins each pays once ([[coins|Derp Coins]]).`,
  },
  {
    id: "multiplayer",
    part: "world",
    title: "Playing with friends",
    line: "Several lives in the same world.",
    where:
      "The lobby: Start a game › With friends; or join an open game, or with a code or link.",
    body: `## Starting and joining
Choose **With friends** in the lobby and open a game room. List it under open games for anyone to join, or keep it private and share the code (or the invite link). Everyone makes a character in the room; when all are ready, the host sets out. Friends can also join a world already running: they make a character and drop into the world as it is.

## The clock
The host sets the speed. Anyone may pause; only the host starts the clock again. Skipping ahead needs everyone living a life to agree (click ⏩ to ask; the others click it to agree), and it stops for anyone's letters or news. A letter waits ${LETTER_SECONDS} seconds of running time for an answer before it decides itself.

## Other players
- **In your town** they stand in its places like anyone else (Here), marked **player** (or **rival player**, in red), and the top of Here says who's in town and where: click them to go to them. At their own home they're indoors, out of the town's places.
- **People** lists every other player: where they are as far as you can see (the fog of war holds for them too: out of sight is out of sight), what they are to you, and what they think of you. World lists them as well.
- **On the map** their medallions and walkers show where you can see them, with their names.
- Asking another player anything (friendship, courting, marriage, a favour, meeting in secret, a duel) goes to them, and they accept or refuse. A duel they accept is shown to you both as a scene ([[duels|Duels]]).
- You can sell them goods, write to them (they answer from their own letter case), invite them to your gatherings, hire them or work for them (wages come out of the master's purse), and, as a lawman, arrest them if they're wanted. A husband or wife who's another player shares your home, and an evening together.
- Chat goes in the News panel.

## Leaving and saving
Leaving keeps your character; the world goes on without you, and you can come back. Signed-in players' games save every few minutes and whenever the game is paused (and with Save now, in the menu).`,
  },
  {
    id: "death",
    part: "world",
    title: "Death, watching and taking over",
    line: "When a life ends, the line carries on, or you watch, take over someone, or begin again.",
    where: "Here (while watching); the menu.",
    body: `## Dying
Death comes from old age, illness and fever, accidents at dangerous work, battles, duels, the gallows, and at health 0. Good health and a robust nature make it less likely; age, low health and a sickly nature more.

When you die, **you carry on as your heir** ([[family|Family and heirs]]). The story goes on.

## Watching
With no heir, your story ends and you **watch the world**: the whole map, without fog. From Here you can:
- **Take over someone**: anyone living, sixteen or over, not already played, in a colony or a native nation. Click a person on any province's page to see them; take them over from their page or from the list.
- **Begin a new life**: make a new character in the register, and set out into the world as it is now.

## Your story
The menu's **Your story so far** tells the tale of your line: the roads you travelled and the moments that mattered.`,
  },
  {
    id: "end",
    part: "world",
    title: "1776 and the end",
    line: "Where the story stops, and how it's told.",
    body: `The world runs until **1 January ${END_YEAR}**. Then your story is told (the roads you travelled, the moments that mattered, the generations of your line) and paid in Derp Coins. In company, the lines are ranked by what they made of their lives.

The host can end a game sooner from the menu (End the game here): stories and coins are counted as they stand.

Reaching ${END_YEAR} with a character still living is worth coins of its own.`,
  },
  {
    id: "coins",
    part: "world",
    title: "Derp Coins",
    line: "What a line of lives earns at the end, and achievements as you go.",
    body: `When the game ends (in ${END_YEAR}, or when the host ends it), each player's line is paid in Derp Coins, if they're signed in to Derp Land and their line played at least two years. The end screen shows every line of the sum.

| For | Coins |
|---|---|
| Living a life | ${LIFE_COINS.played} |
| Years lived | ${LIFE_COINS.perTenYears} for every ten years (up to ${LIFE_COINS.maxYears}) |
| Rising in a trade | ${LIFE_COINS.perRank} for each rung of the highest reached (up to ${LIFE_COINS.maxRank}) |
| Office | ${LIFE_COINS.office[1]} for an assembly seat, ${LIFE_COINS.office[2]} for a council seat, ${LIFE_COINS.office[3]} for governing |
| Renown | ${LIFE_COINS.perTenRenown} for every ten of your highest renown (up to ${LIFE_COINS.maxRenown}) |
| Generations | ${LIFE_COINS.perGeneration} for each after the first (up to ${LIFE_COINS.maxGenerations}) |
| Children | ${LIFE_COINS.perChild} each (up to ${LIFE_COINS.maxChildren}) |
| Battles won | ${LIFE_COINS.perBattleWon} each (up to ${LIFE_COINS.maxBattles}) |
| A rising that won | ${LIFE_COINS.risingWon} |
| Going to Europe | ${LIFE_COINS.europe} |
| Living to see ${END_YEAR} | ${LIFE_COINS.reached1776} |

## Achievements
Besides what a line earns at the end, there are ${ACHIEVEMENTS.length} **achievements**, marks of a life across everything in the game (your first job to living to see ${END_YEAR}, the native peoples' own paths, the seasons). Each pays a few Derp Coins (${ACHIEVEMENT_COINS} for all of them) **the first time your account earns it, and never again**: earning it in another game, or the same game played again, pays nothing. They're paid the moment they're earned, with a scene to say so, if you're signed in to Derp Land; a guest is told, but not paid. **Journal › Achievements** has them all: on your account (and when), earned in this game, and how to earn the rest. Your Derp Land profile shows the ones you've earned.

${achievementsTable()}

> Tip: A dynasty that rose high pays a few dozen; a short life, a handful. Achievements are a one-time bonus on top: the easy ones come in your first years.`,
  },
  // ================================================================ reference
  {
    id: "keys",
    part: "reference",
    title: "Keys and shortcuts",
    line: "For quick hands.",
    body: `| Key | Does |
|---|---|
| Space | Pause, or start the clock |
| 1, 2, 3, 4 | Speed 1×, 2×, 4×, 8× |
| 5 | Skip ahead (again to stop) |
| + and − | Zoom the map |
| ? | This guide, at the page you're on |
| / | I want to… |
| Esc | Close what's open |

On the map: click a province to see it; right-click (or, on a phone, hold) to set out for it; click a person or an army to see them. Shift-click works as right-click.

Point at (or tap) any underlined number or word for what it means.`,
  },
];

/** Period words, for the glossary (with the chapter that explains each). */
export const WORDS: [string, string, string?][] = [
  [
    "Benefit of clergy",
    "Under English law, a first offender who could read was branded on the thumb instead of hanged. Once only.",
    "crime",
  ],
  [
    "Burgess",
    "A member of a colony's assembly; also the county office that sends one.",
    "office",
  ],
  [
    "Charter",
    "The crown's leave to plant a colony, asked of your governor.",
    "founding",
  ],
  [
    "Coin",
    "The game's money: the coins in your purse (not Derp Coins, which are paid at the end).",
    "money",
  ],
  [
    "Commission",
    "An officer's rank, given by the marshal, the governor or a patron, or bought.",
    "military",
  ],
  [
    "Coureur des bois",
    "A French woodsman trading furs in the north without a licence.",
    "travel",
  ],
  [
    "Council fire",
    "Where a native town's elders sit and decide: the place for speaking, gifts and war.",
    "places",
  ],
  [
    "Den",
    "The underworld's meeting place in a big town or port: hidden until you find it.",
    "crime",
  ],
  ["Factor", "A merchant's agent, buying and selling on his behalf.", "trades"],
  [
    "Freeholder",
    "Someone who owns land outright: a voter, and fit to stand for the assembly.",
    "property",
  ],
  [
    "Gazette",
    "The colony's newspaper: news, prices at the ports, and leads.",
    "leads",
  ],
  [
    "Headright",
    "A grant of land (fifty acres here) for the patent fees.",
    "property",
  ],
  [
    "Indenture",
    "Years of unpaid service for your passage and keep, with freedom dues at the end.",
    "trades",
  ],
  [
    "Letter of marque",
    "A government's leave to take enemy ships in wartime: a privateer's licence.",
    "boats",
  ],
  [
    "Levee",
    "The governor's reception, where the gentry and the council are met.",
    "office",
  ],
  [
    "Load",
    "A unit of goods: you carry 20, a boat's hold many more.",
    "markets",
  ],
  ["Marshal", "The council member in charge of a nation's armies.", "military"],
  [
    "Pillory",
    "A wooden frame in the market square for the head and hands: an hour of the neighbours' aim.",
    "crime",
  ],
  [
    "Privateer",
    "A private ship (or its captain) taking enemy merchantmen under a letter of marque.",
    "boats",
  ],
  [
    "Quarter sessions",
    "The county court that sits four times a year: where the gaol's prisoners are tried.",
    "crime",
  ],
  ["Sachem", "A native town's or nation's leader.", "office"],
  ["Selectman", "An elected officer of a New England town.", "office"],
  [
    "Transportation",
    "Being sent in chains to a far colony to serve as an indentured servant for seven years.",
    "crime",
  ],
  [
    "Wampum",
    "Shell beads: belts of them carry treaties and messages, and the Dutch take them as money.",
    "wares",
  ],
  [
    "Ware",
    "One of a people's own goods (woollens, brandy, wampum...), besides the ten common goods.",
    "wares",
  ],
  // ---- POWER (r12)
  [
    "Court party",
    "The governor's friends on the council and in the house; the country party is his opposition.",
    "council",
  ],
  [
    "Prorogue",
    "To send the assembly home for a time without dissolving it: no bills, and no new laws, until it sits again.",
    "council",
  ],
  [
    "Presentment",
    "A churchwarden's or constable's charge laid before the justices: drunkenness, swearing, a bastard child.",
    "trials",
  ],
  [
    "Seditious libel",
    "Printing anything that brings the government into contempt. Truth was no defence, until juries began to say otherwise (Zenger, 1735).",
    "press",
  ],
  [
    "Licensing",
    "The governor's (or the crown's) leave to print. Without it, a press may be seized.",
    "press",
  ],
  // ---- EDU (r13)
  [
    "Indenture",
    "A contract in two copies cut apart along a wavy line, each party keeping one: an apprentice's (or a servant's) term and terms.",
    "schooling",
  ],
  [
    "Journeyman",
    "A tradesman who has served an apprenticeship and works for wages by the day (journée), on the way to being a master.",
    "schooling",
  ],
  [
    "Premium",
    "A sum paid to a master, once, to take an apprentice: large for merchants, lawyers and surgeons, little or nothing for most crafts.",
    "schooling",
  ],
  [
    "Commencement",
    "A college's degree day: disputations in Latin before the public, and a feast after.",
    "schooling",
  ],
  [
    "Servitor",
    "A poor scholar who waits at table and runs errands for his keep (a sizar at Cambridge).",
    "schooling",
  ],
  [
    "Dame school",
    "A goodwife teaching small children their letters in her kitchen, for a penny or two a week.",
    "schooling",
  ],
];
