// Politics for people who aren't born to rule: the colony's assembly, filled
// at elections every few years by freeholders and men of renown; a place at
// the governor's court and a seat on the council; the governorship itself,
// which the crown hands out when it falls empty; and for native characters,
// the council fire. A governor (or a native leader) gets a few levers on the
// nation the computer otherwise runs.

import { formatDate, pollDay } from "./Calendar"; // FIXES (r15)
import { makeCharacter } from "./Characters";
import { crownLine } from "./Chatter"; // CHAMBER (r16)
import { crownCommand } from "./Crown";
import { economyCommand } from "./Economy";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import {
  addRenown,
  gainXp,
  journal,
  meet,
  milestone,
  touchLife,
} from "./LifeCore";
import {
  Check,
  isChildLife,
  isNativeChar,
  isPlayed,
  lifeIsNative,
  meOf,
  no,
  officesOf,
  opinionOf,
  yes,
} from "./LifeQueries";
import { ROLES } from "./LifeRules";
import { localCampaign, localOfficesOf, localScore } from "./Offices"; // SOCIETY (r11)
// POWER (r12): one office at a time, the council, the speaker, the papers.
import { chooseSpeaker } from "./Assembly";
import {
  councilAdvice,
  govAppoint,
  offerCouncilSeat,
  overruled,
} from "./Council";
import { takingPost } from "./OneOffice";
import { swayOf } from "./PowerCore";
import { ageOf, charName, provincesOf, stat } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import type {
  BuildingKind,
  GameState,
  GovLever,
  Life,
  LifeCommand,
  ModFx,
  Polity,
} from "./Types";
import { SEATS } from "./Types";
import { militaryCommand } from "./War";

const ASSEMBLY_NAMES: Record<string, string> = {
  english: "the House of Burgesses",
  french: "the Sovereign Council",
  spanish: "the Cabildo",
  dutch: "the Council of Nine Men",
  swedish: "the Council of New Sweden",
  portuguese: "the Câmara",
};

export const ELECTION_YEARS = 3;

/** Every nation's assembly (or council fire), made at the start. */
export function makePolities(g: ConquestGame): void {
  const s = g.s;
  for (const n of s.nations) {
    if (!n.alive || (n.kind !== "power" && n.kind !== "native")) continue;
    if (s.polities[n.id]) continue;
    const native = n.kind === "native";
    const seats = native ? 4 : 6;
    const assembly: number[] = [];
    const provs = provincesOf(s, n.id);
    for (let i = 0; i < seats; i++) {
      const c = makeCharacter(s, g.rng, {
        nation: n.id,
        culture: n.culture,
        religion: n.religion,
        female: native ? g.rng.chance(0.4) : false,
        age: g.rng.int(32, 60),
      });
      c.home = provs.length ? provs[g.rng.int(0, provs.length - 1)] : n.capital;
      c.role = native
        ? g.rng.pick(["elder", "sachem", "warleader"] as const)!
        : g.rng.pick(["planter", "merchant", "lawyer", "planter"] as const)!;
      assembly.push(c.id);
    }
    s.polities[n.id] = {
      nation: n.id,
      name: native
        ? `the council fire of the ${n.name}`
        : (ASSEMBLY_NAMES[n.culture] ?? "the Assembly"),
      assembly,
      seats,
      election: s.day + g.rng.int(60, ELECTION_YEARS * DAYS_PER_YEAR),
      candidates: [],
    };
  }
}

// ---------------------------------------------------------------- standing for the assembly

/** Who may stand: grown, of the nation, living in it, with land or a name. */
export function standCheck(s: GameState, life: Life): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  const n = me.nation;
  const nation = s.nations[n];
  const pol = s.polities[n];
  if (!pol || !nation?.alive) return no("Your people have no assembly.");
  if (pol.assembly.includes(me.id))
    return no("You sit already; you'll stand again at the election.");
  if (life.campaign) return no("You're standing already.");
  if (s.provinces[life.home]?.owner !== n)
    return no("You must live in the colony.");
  if (nation.ruler === me.id) return no("Governors don't sit in the assembly.");
  const native = nation.kind === "native";
  const property =
    !!(
      life.job &&
      ((life.job.kind === "farmer" && life.job.rank >= 1) ||
        ([
          "millhand",
          "craftsman",
          "clerk",
          "innkeeper",
          "newsman",
          "law",
          "official",
          "trapper",
        ].includes(life.job.kind) &&
          life.job.rank >= 2) ||
        (life.job.kind === "sailor" && life.job.rank >= 3))
    ) ||
    life.purse >= 40 ||
    life.background === "gentry" ||
    localOfficesOf(s, me.id).length > 0; // SOCIETY (r11): local office is a step up
  if (native) {
    const speaker = life.job?.kind === "speaker" && life.job.rank >= 1;
    if (!speaker && life.renown < 15)
      return no("The elders listen to speakers, and to people of renown (15).");
    return yes;
  }
  if (!property && life.renown < 20)
    return no(
      "Only freeholders, men of property (40 coins), or the well known (renown 20) may stand.",
    );
  if (me.female && !native)
    return no("The assembly, alas, admits only men in this century.");
  return yes;
}

function stand(g: ConquestGame, life: Life): string | null {
  const check = standCheck(g.s, life);
  if (!check.ok) return check.why;
  const me = meOf(g.s, life)!;
  const pol = g.s.polities[me.nation];
  touchLife(g, life).campaign = { nation: me.nation, points: 0 };
  journal(
    g,
    life,
    `You put your name forward for ${pol.name}. The election is on ${dateText(pol.election)}: canvass, treat the voters, print broadsides.`,
  );
  return null;
}

/** FIXES (r15): the day the count is held (it was a month guessed by 30.42-day steps, often the month before). */
function dateText(day: number): string {
  return formatDate(pollDay(day));
}

/** A campaign gains ground (a round, a speech, a broadside). */
export function campaignBoost(
  g: ConquestGame,
  life: Life,
  points: number,
  why: string,
): void {
  // SOCIETY (r11): a local poll gains too.
  const local = localCampaign(g, life, points);
  if (!life.campaign) {
    if (local)
      journal(g, life, `Your campaign gains from ${why} (+${points}).`);
    return;
  }
  touchLife(g, life).campaign!.points += points;
  journal(g, life, `Your campaign gains from ${why} (+${points}).`);
}

/** A candidate's standing at the count. */
export function candidateScore(s: GameState, c: number): number {
  const ch = s.chars[c];
  if (!ch?.alive) return -999;
  const life = s.lives.find((l) => l.c === c);
  const rumours = ch.memories.filter(
    (m) => m.of === -2 && m.until > s.day,
  ).length;
  if (life) {
    let v =
      life.renown * 0.6 + (life.campaign?.points ?? 0) + life.skills.persuasion;
    if (life.job?.kind === "law") v += 4;
    if (life.lifestyle === "comfortable") v += 2;
    v += Math.min(10, life.tally.topRank * 2);
    v += Math.min(12, localScore(s, c) / 2); // SOCIETY (r11)
    v += swayOf(s, c); // POWER (r12): the papers
    return v - rumours * 10;
  }
  const status = ch.role ? ROLES[ch.role].status : 3;
  return status * 4 + stat(s, ch, "dip") + 6 - rumours * 10 + swayOf(s, c); // POWER (r12)
}

function holdElection(g: ConquestGame, pol: Polity): void {
  const s = g.s;
  const nation = s.nations[pol.nation];
  const native = nation.kind === "native";
  const field = new Map<number, number>();
  // Sitting members stand again (unless they're dead or gone).
  for (const c of pol.assembly) {
    const ch = s.chars[c];
    if (ch?.alive && !ch.abroad) field.set(c, candidateScore(s, c) + 6);
  }
  // Players who stood.
  for (const life of s.lives) {
    if (life.campaign?.nation !== pol.nation || life.c < 0) continue;
    field.set(life.c, candidateScore(s, life.c));
  }
  // Challengers from among the colony's people of standing.
  const provs = provincesOf(s, pol.nation);
  const challengers = 2 + g.rng.int(0, 2);
  for (let i = 0; i < challengers; i++) {
    const c = makeCharacter(s, g.rng, {
      nation: pol.nation,
      culture: nation.culture,
      religion: nation.religion,
      female: native ? g.rng.chance(0.4) : false,
      age: g.rng.int(28, 55),
    });
    c.home = provs.length
      ? provs[g.rng.int(0, provs.length - 1)]
      : nation.capital;
    c.role = native
      ? "elder"
      : g.rng.pick(["planter", "merchant", "lawyer"] as const)!;
    g.touchChar(c);
    field.set(c.id, candidateScore(s, c.id) + g.rng.int(-4, 8));
  }
  const ranked = [...field.entries()].sort(
    (a, b) => b[1] - a[1] || a[0] - b[0],
  );
  const winners = ranked.slice(0, pol.seats).map(([c]) => c);
  const before = new Set(pol.assembly);
  // POWER (r12): one office at a time: a new member gives up the others.
  for (const c of winners)
    if (!before.has(c)) takingPost(g, c, { kind: "assembly", n: pol.nation });
  pol.assembly = winners;
  pol.candidates = [];
  pol.election = s.day + ELECTION_YEARS * DAYS_PER_YEAR;
  g.politiesChanged(pol.nation);
  chooseSpeaker(g, pol.nation); // POWER (r12): the new house chooses its speaker
  g.event({
    k: "news",
    local: true,
    day: s.day,
    n: pol.nation,
    text: `${native ? "The council fire has chosen its speakers" : `Elections to ${pol.name}`}: ${winners
      .slice(0, 3)
      .map((c) => charName(s.chars[c]))
      .join(", ")} and others.`,
  });
  for (const life of s.lives) {
    if (life.c < 0) continue;
    const stood = life.campaign?.nation === pol.nation || before.has(life.c);
    if (!stood) continue;
    const won = winners.includes(life.c);
    touchLife(g, life).campaign = null;
    if (won) {
      life.tally.elections++;
      life.tally.topOffice = Math.max(life.tally.topOffice, 1);
      addRenown(g, life, before.has(life.c) ? 2 : 6);
      journal(
        g,
        life,
        before.has(life.c)
          ? `Returned to ${pol.name}.`
          : `Elected to ${pol.name}!`,
        "good",
      );
      if (!before.has(life.c))
        milestone(g, life, "office", `Elected to ${pol.name}`);
    } else {
      journal(g, life, `You lost the election to ${pol.name}.`, "bad");
    }
  }
}

// ---------------------------------------------------------------- court and council

/** Ask to be one of the people the council is chosen from. */
export function seekCourt(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const me = meOf(s, life)!;
  const p = life.prov;
  const n = s.provinces[p].owner;
  const nation = s.nations[n];
  if (!nation || n !== me.nation) return "Only among your own people.";
  if (nation.capital !== p) return "That's done at the capital.";
  if (nation.ruler === me.id) return "You rule here.";
  if (
    nation.court.includes(me.id) ||
    SEATS.some((st) => nation.council[st] === me.id)
  )
    return "You're at court already.";
  const native = nation.kind === "native";
  const ruler = s.chars[nation.ruler];
  const op = ruler?.alive ? opinionOf(s, ruler, life).total : 0;
  const offices = officesOf(s, me.id);
  if (life.renown < 20 && !offices.length)
    return native
      ? "The council fire hears people of renown (20)."
      : "The governor sees people of some renown (20), or who sit in the assembly.";
  if (op < 15)
    return `${charName(ruler)} doesn't think well enough of you yet (opinion ${op} of 15).`;
  const nn = g.nation(n);
  if (!native) nn.court = [...nn.court, me.id];
  if (ruler?.alive) meet(g, life, ruler.id);
  journal(
    g,
    life,
    native
      ? `The council fire of the ${nation.name} will hear you when it chooses its war chief and speaker.`
      : `You're received at court. When a council seat falls empty, ${charName(ruler)} may think of you.`,
    "good",
  );
  // A seat already empty, or held by someone much weaker, may come at once.
  offerSeat(g, life);
  return null;
}

/**
 * The ruler considers a player at court for an empty (or weakly held) seat.
 * POWER (r12): the offer comes as a letter to accept or decline, weighing
 * renown, favour, the ruler's regard, connections and fitness for the seat.
 */
function offerSeat(g: ConquestGame, life: Life): void {
  offerCouncilSeat(g, life);
}

/** Letters home: the crown remembers who writes well. */
export function writeToCrown(
  g: ConquestGame,
  life: Life,
  pass: boolean,
): string | null {
  gainXp(g, life, "letters", 6);
  touchLife(g, life);
  if (pass) {
    life.favor = Math.min(100, life.favor + 6);
    journal(
      g,
      life,
      crownLine(g, life, true), // CHAMBER (r16): the colony's own city, a larger pool
      "good",
    );
  } else {
    life.favor = Math.min(100, life.favor + 1);
    journal(
      g,
      life,
      crownLine(g, life, false), // CHAMBER (r16)
    );
  }
  return null;
}

// ---------------------------------------------------------------- the governorship

/** A player's case to be made governor (or leader of their people). */
export function governorScore(s: GameState, life: Life): number {
  const me = meOf(s, life);
  if (!me) return -999;
  const offices = officesOf(s, me.id);
  const council = offices.some((o) => o.kind === "council") ? 25 : 0;
  const assembly = offices.some((o) => o.kind === "assembly") ? 10 : 0;
  return (
    life.renown +
    life.favor * 1.5 +
    council +
    assembly +
    Math.min(30, localScore(s, me.id)) + // SOCIETY (r11): offices in the counties
    stat(s, me, "dip") +
    stat(s, me, "ste")
  );
}

/** The crown (or the elders) choose: a player of standing, if one stands out. */
function chooseSuccessor(g: ConquestGame, n: number): number {
  const s = g.s;
  const nation = s.nations[n];
  const native = nation.kind === "native";
  let best: Life | null = null;
  let bestScore = -1;
  for (const life of s.lives) {
    const me = meOf(s, life);
    if (!me?.alive || me.abroad || life.watching) continue;
    if (me.nation !== n || ageOf(s, me) < 25) continue;
    if (native !== isNativeChar(s, me)) continue;
    const score = governorScore(s, life);
    if (score > bestScore) {
      best = life;
      bestScore = score;
    }
  }
  if (!best) return -1;
  // The best of the council, as the crown sees them.
  const rivals = SEATS.map((st) => s.chars[nation.council[st]])
    .filter((c) => c?.alive && c.id !== best!.c && !isPlayed(s, c.id))
    .map((c) => (stat(s, c!, "ste") + stat(s, c!, "dip")) * 3 + 10);
  const bar = Math.max(native ? 70 : 100, ...rivals);
  if (bestScore < bar) return -1;
  const me = meOf(s, best)!;
  takingPost(g, me.id, { kind: "governor", n }); // POWER (r12): one office at a time
  touchLife(g, best).tally.topOffice = 3;
  addRenown(g, best, 15);
  const title = native
    ? `leader of the ${nation.name}`
    : `governor of ${nation.name.replace(/^the /, "")}`;
  journal(
    g,
    best,
    native
      ? `The council fire has chosen you: you are ${title}.`
      : `A commission arrives from the crown: you are ${title}. The levers are few and the expectations many.`,
    "good",
  );
  milestone(g, best, "office", `${charName(me)} became ${title}`);
  return me.id;
}

// ---------------------------------------------------------------- laws and works

export interface LawDef {
  name: string;
  /** Colonies' laws, or the council fire's. */
  native: boolean;
  text: string;
  fx: Partial<Record<ModFx, number>>;
  /** Laws that can't stand together. */
  against?: string;
}

export const LAWS: Record<string, LawDef> = {
  toleration: {
    name: "Act of Toleration",
    native: false,
    text: "Dissenters may worship as they please. Quieter streets; a frown from the bishops at home.",
    fx: { unrest: -5, favor: -3 },
  },
  navigation: {
    name: "Enforce the Navigation Acts",
    native: false,
    text: "Customs men at every wharf and no Dutch hulls in the harbour. The crown is delighted; the merchants aren't.",
    fx: { tax: 0.1, favor: 5, unrest: 4 },
  },
  headrights: {
    name: "Headright grants",
    native: false,
    text: "Fifty acres for every settler brought over. Ships fill; the frontier creeps into other people's country.",
    fx: { colonists: 0.25, unrest: 2 },
  },
  militia: {
    name: "Militia Act",
    native: false,
    text: "Every man between sixteen and sixty drills on muster days. The colony looks after itself, and knows it.",
    fx: { autonomy: 5, production: -0.03 },
  },
  licensing: {
    name: "Licensing of the press",
    native: false,
    text: "Nothing printed without the secretary's leave. Fewer pamphlets, fewer riots, more favour.",
    fx: { unrest: -3, favor: 2, autonomy: -3 },
    against: "freepress",
  },
  freepress: {
    name: "A free press",
    native: false,
    text: "Print what you like and answer for it after. Lively, clever, and very hard to govern.",
    fx: { unrest: 2, autonomy: 5, admin: 1 },
    against: "licensing",
  },
  sabbath: {
    name: "Sabbath laws",
    native: false,
    text: "No work, no drink and no fun on Sundays, by order. Godly; dull; the crown approves.",
    fx: { unrest: 1, favor: 2, production: -0.02 },
  },
  tradepaths: {
    name: "Open the trading paths",
    native: true,
    text: "Traders of every nation welcome at the fire. Kettles and cloth come in; so do fevers.",
    fx: { production: 0.05, disease: 0.1 },
  },
  mothers: {
    name: "The clan mothers' voice",
    native: true,
    text: "No war without the clan mothers' consent, and they choose who sits at the fire.",
    fx: { unrest: -3, admin: 1 },
  },
  nolandsale: {
    name: "No land to be sold",
    native: true,
    text: "The land is not ours to sell. The colonists won't like it; the young men will.",
    fx: { unrest: -2, autonomy: 5 },
  },
};

export const MAX_LAWS = 4;

export interface ProjectDef {
  name: string;
  native: boolean;
  cost: number;
  years: number;
  text: string;
  fx: Partial<Record<ModFx, number>>;
}

export const PROJECTS: Record<string, ProjectDef> = {
  road: {
    name: "A king's highway",
    native: false,
    cost: 80,
    years: 15,
    text: "A proper road between the towns, with bridges. Carts move, and so does trade.",
    fx: { production: 0.04 },
  },
  college: {
    name: "A college",
    native: false,
    cost: 150,
    years: 30,
    text: "Latin, divinity and the sons of planters. In time, clerks who can spell.",
    fx: { admin: 2 },
  },
  lighthouse: {
    name: "A lighthouse",
    native: false,
    cost: 70,
    years: 20,
    text: "A light on the point: fewer wrecks, more ships willing to call.",
    fx: { tax: 0.04 },
  },
  granary: {
    name: "A public granary",
    native: false,
    cost: 60,
    years: 15,
    text: "Corn put by against the hungry years. Fewer fevers in a bad winter, fewer riots in a bad harvest.",
    fx: { disease: -0.15, unrest: -2 },
  },
  palisade: {
    name: "A new palisade",
    native: true,
    cost: 25,
    years: 15,
    text: "A stout double wall of logs around the town. The young men sleep easier.",
    fx: { unrest: -2, autonomy: 3 },
  },
  feast: {
    name: "The great feast of the dead",
    native: true,
    cost: 30,
    years: 10,
    text: "The bones of the dead gathered and honoured together, and every village bound closer.",
    fx: { unrest: -4, admin: 1 },
  },
};

export function lawCheck(
  s: GameState,
  n: number,
  law: string,
  on: boolean,
  life: Life,
): Check {
  const def = LAWS[law];
  const nation = s.nations[n];
  if (!def || !nation) return no("No such law.");
  if (def.native !== (nation.kind === "native"))
    return no("That isn't for your people.");
  const laws = nation.laws ?? [];
  if (on && laws.includes(law)) return no("It's law already.");
  if (!on && !laws.includes(law)) return no("It isn't law.");
  if (on && laws.length >= MAX_LAWS)
    return no(`No more than ${MAX_LAWS} great laws at once: repeal one first.`);
  if (on && def.against && laws.includes(def.against))
    return no(`It can't stand with ${LAWS[def.against].name}.`);
  if ((life.cooldowns["gov:law"] ?? 0) > s.day)
    return no("The assembly won't sit again so soon.");
  // POWER (r12): an assembly sent home passes no laws.
  if ((s.power?.cabinets[n]?.prorogued ?? 0) > s.day)
    return no("You've prorogued the assembly: it isn't sitting.");
  return yes;
}

export function projectCheck(s: GameState, n: number, key: string): Check {
  const def = PROJECTS[key];
  const nation = s.nations[n];
  if (!def || !nation) return no("No such work.");
  if (def.native !== (nation.kind === "native"))
    return no("That isn't for your people.");
  if (nation.mods.some((m) => m.key === `project:${key}`))
    return no("It's built already.");
  if (nation.gold < def.cost)
    return no(`It costs ${def.cost} gold from the treasury.`);
  return yes;
}

// ---------------------------------------------------------------- the levers

export function rulerLife(s: GameState, n: number): Life | undefined {
  const r = s.nations[n]?.ruler;
  return r !== undefined && r >= 0 ? s.lives.find((l) => l.c === r) : undefined;
}

/** A governor's (or native leader's) few levers on their nation. */
function govLever(g: ConquestGame, life: Life, lever: GovLever): string | null {
  const s = g.s;
  const me = meOf(s, life)!;
  const n = s.nations.findIndex((x) => x.ruler === me.id && x.alive);
  if (n < 0) return "You govern nothing.";
  const nation = s.nations[n];
  if (!lever || typeof lever !== "object") return "Bad order.";
  switch (lever.l) {
    case "tax": {
      if (nation.kind !== "power") return "Your people pay no taxes.";
      const was = nation.tax;
      const err = economyCommand(g, n, { k: "tax", level: lever.level });
      // POWER (r12): the council's advice, taken or not.
      if (!err && lever.level !== was)
        overruled(
          g,
          life,
          n,
          councilAdvice(s, n, lever.level > was ? "taxup" : "taxdown", me.id),
          lever.level > was ? "You raise the taxes" : "You lower the taxes",
        );
      return err;
    }
    case "remit":
      return crownCommand(g, n, { k: "remit", share: lever.share });
    case "raise": {
      const t = nation.kind === "native" ? "warriors" : "militia";
      const err = militaryCommand(g, n, { k: "recruit", p: lever.p, t });
      if (!err)
        journal(
          g,
          life,
          `You call out the ${t} at ${g.map.provinces[lever.p].name}.`,
        );
      return err;
    }
    case "build": {
      const allowed: BuildingKind[] = [
        "fort",
        "church",
        "farm",
        "port",
        "courthouse",
      ];
      if (!allowed.includes(lever.b)) return "That's for others to decide.";
      if (nation.kind !== "power") return "Your people build in their own way.";
      const err = economyCommand(g, n, { k: "build", p: lever.p, b: lever.b });
      if (!err)
        journal(
          g,
          life,
          `You order a ${lever.b} built at ${g.map.provinces[lever.p].name}.`,
        );
      return err;
    }
    case "war": {
      const advice = councilAdvice(s, n, "war", me.id); // POWER (r12)
      const err = militaryCommand(g, n, { k: "war", n: lever.n });
      if (!err) {
        overruled(g, life, n, advice, `War on ${s.nations[lever.n].name}`);
        journal(
          g,
          life,
          `You declare war on ${s.nations[lever.n].name}.`,
          "bad",
        );
        milestone(
          g,
          life,
          "office",
          `Declared war on ${s.nations[lever.n].name}`,
        );
      }
      return err;
    }
    case "peace": {
      const err = militaryCommand(g, n, {
        k: "peace",
        n: lever.n,
        terms: { take: [], give: [], gold: 0 },
      });
      if (!err)
        journal(
          g,
          life,
          `You offer ${s.nations[lever.n].name} peace as things stand.`,
        );
      return err;
    }
    case "law": {
      const check = lawCheck(s, n, lever.law, !!lever.on, life);
      if (!check.ok) return check.why;
      const def = LAWS[lever.law];
      const x = g.nation(n);
      touchLife(g, life).cooldowns["gov:law"] = s.day + 90;
      overruled(
        g,
        life,
        n,
        councilAdvice(s, n, "law", me.id),
        lever.on ? def.name : `Repealing ${def.name}`,
      ); // POWER (r12)
      if (lever.on) {
        x.laws = [...(x.laws ?? []), lever.law];
        x.mods.push({
          key: `law:${lever.law}`,
          label: def.name,
          until: s.endDay + 1,
          fx: { ...def.fx },
        });
        journal(g, life, `${def.name}: it's the law now. ${def.text}`, "good");
        milestone(g, life, "office", `Passed ${def.name}`);
      } else {
        x.laws = (x.laws ?? []).filter((k) => k !== lever.law);
        x.mods = x.mods.filter((m) => m.key !== `law:${lever.law}`);
        journal(g, life, `You repeal ${def.name}.`);
      }
      return null;
    }
    case "appoint":
      // POWER (r12): through the council (a player is asked; one office at a time).
      return govAppoint(g, life, lever.seat, lever.c);
    case "project": {
      const check = projectCheck(s, n, lever.key);
      if (!check.ok) return check.why;
      const def = PROJECTS[lever.key];
      const x = g.nation(n);
      overruled(g, life, n, councilAdvice(s, n, "project", me.id), def.name); // POWER (r12)
      x.gold -= def.cost;
      x.mods.push({
        key: `project:${lever.key}`,
        label: def.name,
        until: s.day + def.years * DAYS_PER_YEAR,
        fx: { ...def.fx },
      });
      addRenown(g, life, 4);
      journal(
        g,
        life,
        `${def.name}, paid from the treasury: ${def.text}`,
        "good",
      );
      milestone(
        g,
        life,
        "office",
        `Built ${def.name.toLowerCase().replace(/^an? /, "a ")}`,
      );
      return null;
    }
    default:
      return "Unknown order.";
  }
}

// ---------------------------------------------------------------- the months

export function politicsMonthly(g: ConquestGame): void {
  const s = g.s;
  for (const pol of Object.values(s.polities)) {
    const nation = s.nations[pol.nation];
    if (!nation?.alive) continue;
    // The dead and departed leave empty seats until the election.
    const sitting = pol.assembly.filter(
      (c) => s.chars[c]?.alive && !s.chars[c].abroad,
    );
    if (sitting.length !== pol.assembly.length) {
      pol.assembly = sitting;
      g.politiesChanged(pol.nation);
    }
    if (s.day >= pol.election) holdElection(g, pol);
  }
  for (const life of s.lives) {
    const me = meOf(s, life);
    if (!me || life.watching) continue;
    const nation = s.nations[me.nation];
    if (!nation?.alive) continue;
    // At court: a seat may be offered.
    if (
      (nation.court.includes(me.id) || nation.kind === "native") &&
      g.rng.chance(0.25)
    )
      offerSeat(g, life);
    // A warrior who reaches war chief is offered the war chief's seat.
    if (
      life.job?.kind === "warrior" &&
      life.job.rank >= 3 &&
      nation.kind === "native" &&
      g.rng.chance(0.3)
    )
      offerSeat(g, life);
    // Invitations to Europe for those the crown has noticed.
    if (!life.invite && !lifeIsNative(s, life) && ageOf(s, me) >= 28) {
      const governor = nation.ruler === me.id;
      if (
        governor &&
        nation.kind === "power" &&
        nation.favor < 22 &&
        g.rng.chance(0.08)
      ) {
        invite(g, life, "recalled");
      } else if (life.renown >= 50 && life.favor >= 15 && g.rng.chance(0.03)) {
        invite(g, life, "parliament");
      } else if (
        life.job?.kind === "soldier" &&
        life.job.rank >= 5 &&
        Object.keys(s.europe.wars).length > 0 &&
        g.rng.chance(0.04)
      ) {
        invite(g, life, "army");
      }
    }
    if (life.invite && life.invite.until <= s.day) {
      if (life.invite.why === "recalled") {
        // A recall isn't a request.
        journal(
          g,
          life,
          "You ignored the crown's recall. A new governor is on the way.",
          "bad",
        );
        touchLife(g, life).invite = null;
        const nn = g.nation(nation.id);
        nn.mods.push({
          key: "defied-recall",
          label: "A governor who defied a recall",
          until: s.day + 2 * DAYS_PER_YEAR,
          fx: { favor: -15 },
        });
      } else {
        touchLife(g, life).invite = null;
        journal(g, life, "The invitation to Europe lapsed.");
      }
    }
  }
}

const INVITE_TEXT: Record<string, string> = {
  parliament:
    "Friends at home have found you a seat in Parliament (or its like). They want a colonial voice, and a vote they can count on.",
  army: "The army in Flanders wants officers who've seen real fighting. A regiment of your own is offered, with the rank to match.",
  recalled:
    "The crown is not pleased with the colony, and has recalled you to London to explain yourself.",
};

function invite(
  g: ConquestGame,
  life: Life,
  why: "parliament" | "army" | "recalled",
): void {
  touchLife(g, life).invite = { why, until: g.s.day + 180 };
  journal(
    g,
    life,
    `${INVITE_TEXT[why]} (Sail for Europe from a port within six months, or decline.)`,
    why === "recalled" ? "bad" : "good",
  );
}

// ---------------------------------------------------------------- commands

function politicsCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k === "stand") return stand(g, life);
  if (c.k === "gov") return govLever(g, life, c.lever);
  return undefined;
}

hooks.command.push(politicsCommand);
hooks.successor.push(chooseSuccessor);
