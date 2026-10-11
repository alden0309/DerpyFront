// A player's life in the world: making the character, the days on the road,
// the months of work and wages and growing older, the choices that come, and
// what happens at the end of it: an heir carries on, or the story ends and
// the player watches (or takes over someone else, or begins anew).

import { ambitionsMonthly, setAmbition } from "./Ambitions";
import { asLook, sitForLikeness, validateLook } from "./Appearance";
import { areasOf } from "./Areas";
import { dateOf, formatDate } from "./Calendar";
import { kill, makeCharacter, succession } from "./Characters";
import { seedLocals } from "./Folk";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { doInteraction, workOffered } from "./Interactions";
import { leadCommand } from "./Leads"; // WORLD r11
import { doAct } from "./LifeActs";
import {
  addRenown,
  addStress,
  beginOutcome,
  earn,
  endOutcome,
  gainTrait,
  gainXp,
  heal,
  hurt,
  journal,
  milestone,
  rollCheck,
  spend,
  touchLife,
} from "./LifeCore";
import { answerLifeEvent, lifeEventsDaily, raiseLifeEvent } from "./LifeEvents";
import {
  allowanceDue,
  atPost,
  carried,
  hasPlace,
  heirOf,
  hopDaysFor,
  isChildLife,
  isNativeChar,
  isPlayed,
  lifeIsNative,
  lifeOfChar,
  lifeOfSeat,
  meOf,
  monthlyBudget,
  nationByKey,
  npcSkill,
  officesOf,
  opinionOf,
  paceOf,
  skillLevel,
  travelRoute,
  wageOf,
} from "./LifeQueries";
import {
  BACKGROUNDS,
  BASE_SKILL,
  CHARGES,
  checkChance,
  COMMAND_RANK,
  CREATION_TRAITS,
  DIVISIONS,
  EUROPE_FORTUNE,
  faithsFor,
  FRAME_COLORS,
  INDENTURE_YEARS,
  JOBS,
  KIT,
  LIFE_MAX_AGE,
  LIFE_MAX_TRAITS,
  LIFE_MIN_AGE,
  LIFE_STAT_MAX,
  LIFE_STAT_MIN,
  LIFE_TRAIT_POINTS,
  LIFESTYLE,
  LIFESTYLES,
  MOTTO_MAX,
  RECRUIT_COST,
  ROAD_RISK,
  ROLES,
  SKILL_STAT,
  skillPointsFor,
  skillStepCost,
  START_HEALTH,
  START_SKILL_MAX,
  START_STRESS,
  statPointsFor,
  STRESS_HIGH,
  TINCTURES,
} from "./LifeRules";
import { isWinter } from "./Map";
import { marketTrade, present } from "./Markets"; // WORLD r11
import { cashVenture, moneyMonthly, sellKit } from "./Money";
import { LETTER_KEYS, letterWriter } from "./MoreEvents";
import { ensureOffices } from "./Offices"; // SOCIETY (r11)
import {
  buyHouse,
  buyLand,
  dismissHand,
  endow,
  expandBusiness,
  propertyMonthly,
  sellProperty,
} from "./Property";
import { ageOf, atWar, charName, hasTrait, settlers, stat } from "./Queries";
import { DAYS_PER_YEAR, deathRiskByAge, STAT_START, TRAITS } from "./Rules";
import { societyCommand } from "./Society"; // SOCIETY (r11)
import { sendLetter, travellersDaily, travellersMonthly } from "./Travellers";
import {
  Army,
  BattleReport,
  Character,
  JobKind,
  Life,
  LifeCommand,
  LifePlan,
  Skill,
  Skills,
  SKILLS,
  STATS,
} from "./Types";
import { militaryCommand } from "./War";
// LIFE (r11): the pace (skip ahead), boats, and the round-11 life's hooks.
import { landBoat, nextLegDays } from "./Boats";
import {
  carryLimit,
  lifeR11Ended,
  lifeR11Succeeded,
  roadRiskFactor,
} from "./LifeR11";
import { wake } from "./Pace";
import { crookedStart } from "./Trades";
import { employerFor, leaveJob, takeJob, workDaily, workMonthly } from "./Work";

// ---------------------------------------------------------------- making a character

export interface PlanBudget {
  statsUsed: number;
  statsBudget: number;
  skillsUsed: number;
  skillsBudget: number;
  traitsUsed: number;
  traitsBudget: number;
}

const zeroSkills = (): Skills =>
  Object.fromEntries(SKILLS.map((k) => [k, 0])) as Skills;

/** Skills a plan begins with: everyone's base, the background, and points bought. */
export function planSkills(plan: LifePlan): Skills {
  const out = zeroSkills();
  const bg = BACKGROUNDS[plan.background];
  for (const k of SKILLS)
    out[k] =
      BASE_SKILL + (bg?.skills[k] ?? 0) + Math.max(0, plan.skills?.[k] ?? 0);
  return out;
}

export function planBudget(plan: LifePlan): PlanBudget {
  let statsUsed = 0;
  for (const st of STATS) {
    const v = plan.stats?.[st] ?? STAT_START;
    statsUsed += v - STAT_START;
  }
  let skillsUsed = 0;
  const bg = BACKGROUNDS[plan.background];
  for (const k of SKILLS) {
    const from = BASE_SKILL + (bg?.skills[k] ?? 0);
    const bought = Math.max(0, plan.skills?.[k] ?? 0);
    for (let l = from; l < from + bought; l++) skillsUsed += skillStepCost(l);
  }
  const traitsUsed = (plan.traits ?? []).reduce(
    (m, t) => m + (TRAITS[t]?.cost ?? 0),
    0,
  );
  return {
    statsUsed,
    statsBudget: statPointsFor(plan.age),
    skillsUsed,
    skillsBudget: skillPointsFor(plan.age) + (bg?.bonusPoints ?? 0),
    traitsUsed,
    traitsBudget: LIFE_TRAIT_POINTS,
  };
}

/** Where someone of a people could begin: their nation's own land, today. */
export function homeChoices(
  s: ConquestGame["state"],
  origin: string,
): number[] {
  const n = nationByKey(s, origin);
  const nation = s.nations[n];
  if (!nation?.alive || (nation.kind !== "power" && nation.kind !== "native"))
    return [];
  const out: number[] = [];
  s.provinces.forEach((pr, p) => {
    if (pr.owner !== n || pr.occupier >= 0) return;
    if (nation.kind === "power" && settlers(pr) < 50) return;
    out.push(p);
  });
  return out;
}

const NAME_RE = /^[\p{L}\p{M}' .-]+$/u;

/** Why a plan can't be played (in this world, today), or null. */
export function planProblem(
  s: ConquestGame["state"],
  raw: unknown,
): string | null {
  const plan = raw as LifePlan;
  if (!plan || typeof plan !== "object") return "No character.";
  const n = nationByKey(s, plan.origin);
  const nation = s.nations[n];
  if (!nation || (nation.kind !== "power" && nation.kind !== "native"))
    return "Choose a people to be born among.";
  if (!nation.alive) return `The ${nation.name} are gone from this world.`;
  if (!homeChoices(s, plan.origin).includes(plan.home))
    return "Choose a home among your own people's towns and villages.";
  for (const [label, v, max] of [
    ["First name", plan.first, 20],
    ["Family name", plan.family, 28],
  ] as const) {
    if (typeof v !== "string" || v.trim().length < 1 || v.length > max)
      return `${label}: 1 to ${max} letters.`;
    if (!NAME_RE.test(v)) return `${label}: letters only.`;
  }
  if (typeof plan.female !== "boolean") return "Choose man or woman.";
  if (
    !Number.isInteger(plan.age) ||
    plan.age < LIFE_MIN_AGE ||
    plan.age > LIFE_MAX_AGE
  )
    return `Age: ${LIFE_MIN_AGE} to ${LIFE_MAX_AGE}.`;
  const native = nation.kind === "native";
  if (!faithsFor(plan.origin, native).includes(plan.religion))
    return "That faith isn't open to your people here.";
  if (!Number.isInteger(plan.face) || plan.face < 0 || plan.face > 999)
    return "Choose a likeness.";
  if (
    plan.look !== undefined &&
    validateLook(plan.look, { female: plan.female, grown: true })
  )
    return validateLook(plan.look, { female: plan.female, grown: true });
  const sg = plan.sigil;
  if (
    !sg ||
    !(sg.field in TINCTURES) ||
    !(sg.tincture in TINCTURES) ||
    !(sg.chargeTincture in TINCTURES) ||
    !(sg.division in DIVISIONS) ||
    !(sg.charge in CHARGES)
  )
    return "Your arms aren't right.";
  if (typeof plan.frame !== "string" || !FRAME_COLORS.includes(plan.frame))
    return "Choose a frame colour.";
  if (typeof plan.motto !== "string" || plan.motto.length > MOTTO_MAX)
    return `A motto of up to ${MOTTO_MAX} letters.`;
  const bg = BACKGROUNDS[plan.background];
  if (!bg) return "Choose a background.";
  if (bg.native !== native)
    return native
      ? "That's a colonist's background."
      : "That's a background of the native peoples.";
  if (!plan.stats || typeof plan.stats !== "object")
    return "Set your attributes.";
  for (const st of STATS) {
    const v = plan.stats[st];
    if (!Number.isInteger(v) || v < LIFE_STAT_MIN || v > LIFE_STAT_MAX)
      return `Attributes run from ${LIFE_STAT_MIN} to ${LIFE_STAT_MAX}.`;
  }
  if (!plan.skills || typeof plan.skills !== "object")
    return "Set your skills.";
  for (const [k, v] of Object.entries(plan.skills)) {
    if (!SKILLS.includes(k as Skill)) return "Unknown skill.";
    if (!Number.isInteger(v) || (v as number) < 0)
      return "Skills can't go down.";
  }
  const start = planSkills(plan);
  if (SKILLS.some((k) => start[k] > START_SKILL_MAX))
    return `No skill above ${START_SKILL_MAX} at the start.`;
  if (!Array.isArray(plan.traits) || plan.traits.length > LIFE_MAX_TRAITS)
    return `Up to ${LIFE_MAX_TRAITS} traits.`;
  for (const t of plan.traits) {
    if (!CREATION_TRAITS.includes(t)) return "That trait can't be chosen.";
    const opp = TRAITS[t].opposite;
    if (opp && plan.traits.includes(opp))
      return `${TRAITS[t].name} and ${TRAITS[opp].name} don't go together.`;
  }
  if (new Set(plan.traits).size !== plan.traits.length) return "A trait twice?";
  const b = planBudget(plan);
  if (b.statsUsed > b.statsBudget)
    return "Those attributes cost more points than you have.";
  if (b.skillsUsed > b.skillsBudget)
    return "Those skills cost more points than you have.";
  if (b.traitsUsed > b.traitsBudget)
    return `Those traits cost more than your ${LIFE_TRAIT_POINTS} points: take a flaw to afford them.`;
  return null;
}

function blankTally(): Life["tally"] {
  return {
    days: 0,
    jobs: 0,
    promotions: 0,
    topRank: 0,
    topOffice: 0,
    peakRenown: 0,
    peakPurse: 0,
    earned: 0,
    children: 0,
    marriages: 0,
    battles: 0,
    battlesWon: 0,
    wounds: 0,
    events: 0,
    generations: 1,
    takeovers: 0,
    provinces: 0,
    risings: 0,
    risingsWon: 0,
    elections: 0,
    europe: null,
  };
}

/**
 * A new character steps into the world: at the start, or dropping into a
 * running one. A seat whose line has ended begins a new family.
 */
export function beginLife(
  g: ConquestGame,
  seat: string,
  name: string,
  plan: LifePlan,
): string | null {
  const s = g.s;
  if (s.over) return "The world has reached 1776.";
  const problem = planProblem(s, plan);
  if (problem) return problem;
  const existing = lifeOfSeat(s, seat);
  if (existing && !existing.watching) return "You're already living a life.";
  const n = nationByKey(s, plan.origin);
  const nation = s.nations[n];
  const c = makeCharacter(s, g.rng, {
    nation: n,
    culture: nation.culture,
    religion: plan.religion,
    female: plan.female,
    age: plan.age,
    first: plan.first.trim(),
    family: plan.family.trim(),
    stats: { ...plan.stats },
    traits: [...plan.traits],
    made: true,
  });
  c.face = plan.face;
  if (plan.look) c.look = asLook(plan.look, c, plan.age); // ART (r11): old drawn looks brought over
  c.home = plan.home;
  g.touchChar(c);
  const bg = BACKGROUNDS[plan.background];
  const life: Life = existing ?? {
    seat,
    name,
    c: -1,
    line: [],
    origin: plan.origin,
    background: plan.background,
    prov: plan.home,
    home: plan.home,
    travel: null,
    job: null,
    purse: 0,
    health: START_HEALTH,
    stress: START_STRESS,
    renown: 0,
    favor: 0,
    skills: zeroSkills(),
    xp: zeroSkills(),
    lifestyle: bg.lifestyle,
    goods: {},
    heir: -1,
    shareWithSpouse: true,
    sigil: { ...plan.sigil },
    frame: plan.frame,
    motto: plan.motto,
    patron: -1,
    journal: [],
    milestones: [],
    events: [],
    cooldowns: {},
    met: [],
    ties: {},
    debts: [],
    visited: [],
    trail: [],
    campaign: null,
    invite: null,
    watching: false,
    ended: null,
    joined: s.day,
    tally: blankTally(),
  };
  if (!existing) s.lives.push(life);
  Object.assign(life, {
    name,
    c: c.id,
    origin: plan.origin,
    background: plan.background,
    prov: plan.home,
    home: plan.home,
    travel: null,
    job: null,
    purse: bg.purse + Math.max(0, plan.age - 18) * 0.5,
    health: hasTrait(c, "sickly")
      ? 70
      : hasTrait(c, "robust")
        ? 95
        : START_HEALTH,
    stress: START_STRESS,
    renown: bg.renown,
    favor: 0,
    skills: planSkills(plan),
    xp: zeroSkills(),
    lifestyle: bg.lifestyle,
    goods: {},
    heir: -1,
    sigil: { ...plan.sigil },
    frame: plan.frame,
    motto: plan.motto.trim(),
    patron: -1,
    events: [],
    cooldowns: {},
    ties: {},
    debts: [],
    campaign: null,
    invite: null,
    watching: false,
    ended: null,
    property: [],
    ambition: null,
    outcome: null,
    area: undefined,
  });
  if (existing) existing.tally.generations++;
  life.line.push(c.id);
  touchLife(g, life);
  visit(g, life, plan.home);
  const place = formatPlace(g, plan.home);
  milestone(
    g,
    life,
    existing ? "begin" : "born",
    `${charName(c)}, ${bg.name.toLowerCase()}, ${plan.age}, at ${place}`,
  );
  journal(
    g,
    life,
    `${formatDate(s.day)}. ${charName(c)} begins: ${plan.age} years old, ${bg.name.toLowerCase()}, at ${place}.${plan.motto.trim() ? ` "${plan.motto.trim()}"` : ""}`,
  );
  // The background's own work, with whoever takes people on for it at home.
  life.area = undefined;
  // LIFE (r11): a crooked upbringing starts with a name and knows the den.
  crookedStart(g, life);
  if (bg.job) {
    const def = JOBS[bg.job];
    const at = def.places.find((pl) => hasPlace(s, g.w, life.prov, pl));
    const err = at ? takeJob(g, life, at, bg.job) : "nowhere";
    if (!err) {
      if (bg.job === "servant")
        life.job!.until = s.day + INDENTURE_YEARS * DAYS_PER_YEAR;
    } else {
      journal(
        g,
        life,
        `There's no ${def.name.toLowerCase()} to be had at ${place}: you'll have to find work. Ask whoever hires; they'll say yes or no, and why.`,
      );
    }
  }
  return null;
}

function formatPlace(g: ConquestGame, p: number): string {
  return g.map.provinces[p]?.name ?? "somewhere";
}

/** Arriving somewhere: it goes on the trail, and its people come to be. */
function visit(g: ConquestGame, life: Life, p: number): void {
  touchLife(g, life);
  life.trail.push({ day: g.s.day, p, c: life.c });
  // In at the door: your work if it's here, else the tavern (or the village).
  life.area =
    life.job && life.job.prov === p && hasPlace(g.s, g.w, p, life.job.place)
      ? life.job.place
      : hasPlace(g.s, g.w, p, "tavern")
        ? "tavern"
        : hasPlace(g.s, g.w, p, "village")
          ? "village"
          : undefined;
  if (life.trail.length > 400) life.trail.splice(0, life.trail.length - 400);
  if (!life.visited.includes(p)) {
    life.visited.push(p);
    life.tally.provinces = life.visited.length;
  }
  seedLocals(g, p);
  ensureOffices(g, p); // SOCIETY (r11): the county's officers
}

// ---------------------------------------------------------------- jobs

export { buyRank, leaveJob, startJob, takeJob } from "./Work";

// ---------------------------------------------------------------- travel

export function travelTo(
  g: ConquestGame,
  life: Life,
  to: number,
  bySea: boolean,
): string | null {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return "You're watching.";
  if (!Number.isInteger(to) || !g.map.provinces[to]) return "No such place.";
  if (life.job?.army !== undefined && life.job.army >= 0)
    return "You march with your army. Quit, or take leave, to travel alone.";
  if (s.armies.some((a) => a.commander === me.id))
    return "You command an army: march it, or give up the command.";
  if (life.job?.kind === "servant" && (life.job.until ?? 0) > s.day)
    return "Servants don't come and go as they please. (Running away is an act at the fields.)";
  if (to === life.prov && !life.travel) return "You're already here.";
  const from = life.travel ? life.travel.path[0] : life.prov;
  if (from === to) {
    // Turning round mid-hop: carry on to the next stop and stop there.
    touchLife(g, life).travel!.path = [to];
    life.travel!.sea = [life.travel!.sea[0]];
    life.travel!.dest = to;
    return null;
  }
  const native = lifeIsNative(s, life);
  const sailor = life.job?.kind === "sailor";
  const route = travelRoute(
    s,
    g.map,
    from,
    to,
    bySea,
    native,
    sailor,
    paceOf(s, life),
  );
  if (!route) return "There's no way there from here.";
  // LIFE (r11): a boat's hold of goods won't go overland on your back.
  const tooMuch = carryLimit(s, life, -1);
  if (carried(life) > tooMuch)
    return `You're carrying ${carried(life)} loads and can manage ${tooMuch} on the road: sell some, or sail in your own boat.`;
  if (life.purse < route.cost)
    return `The journey costs ${route.cost} coins; you have ${Math.floor(life.purse)}.`;
  spend(g, life, route.cost);
  if (life.travel) {
    life.travel.path = [life.travel.path[0], ...route.path];
    life.travel.sea = [life.travel.sea[0], ...route.sea];
    life.travel.dest = to;
    life.travel.cost += route.cost;
  } else {
    touchLife(g, life).travel = {
      dest: to,
      path: route.path,
      sea: route.sea,
      depart: s.day,
      arrive: s.day + route.legs[0],
      cost: route.cost,
    };
  }
  journal(
    g,
    life,
    `You set out for ${formatPlace(g, to)}${route.sea.some(Boolean) ? " by sea" : ""}: about ${Math.ceil(route.days)} days${route.cost ? `, ${route.cost} coins` : ""}.`,
  );
  return null;
}

function hop(g: ConquestGame, life: Life): void {
  const t = life.travel!;
  const s = g.s;
  const wasSea = t.sea[0];
  const next = t.path.shift()!;
  t.sea.shift();
  touchLife(g, life).prov = next;
  if (wasSea) gainXp(g, life, "seamanship", 4);
  else gainXp(g, life, "woodcraft", 2);
  visit(g, life, next);
  if (t.path.length === 0) {
    life.travel = null;
    journal(g, life, `You arrive at ${formatPlace(g, next)}.`);
    // LIFE (r11): an arrival stops a skip ahead; your boat stays where you land.
    wake(g, life, `You arrive at ${formatPlace(g, next)}.`);
    if (t.boat !== undefined) landBoat(g, life, t.boat, next);
    if (next !== life.home && g.rng.chance(0.15)) addRenown(g, life, 0.5);
    return;
  }
  // LIFE (r11): in your own boat, at her speed.
  const own = t.boat !== undefined ? nextLegDays(g, life, next, t.path[0]) : -1;
  const days = Math.max(
    1,
    own > 0
      ? own
      : hopDaysFor(g.map, next, t.path[0], t.sea[0], paceOf(s, life)),
  );
  t.depart = s.day;
  t.arrive = s.day + days;
}

/** The road's dangers: a few a year, worse in the wilds, at war or at sea. */
function roadRisk(g: ConquestGame, life: Life): void {
  const s = g.s;
  const t = life.travel!;
  const p = t.path[0];
  const pr = s.provinces[p];
  const me = meOf(s, life)!;
  let risk = ROAD_RISK.base;
  if (t.sea[0]) risk = ROAD_RISK.sea;
  else if (pr.owner < 0) risk = ROAD_RISK.wild;
  else if (atWar(s, pr.owner, me.nation)) risk = ROAD_RISK.hostile;
  // LIFE (r11): the land's own dangers, and a guide's eye on the trail.
  risk *= roadRiskFactor(g, life);
  if (g.rng.chance(risk)) lifeEventsDaily(g, life, t.sea[0] ? "sea" : "road");
}

// ---------------------------------------------------------------- the days

/** Raise an event, or send it by messenger if it's a letter from afar. */
function raiseOrSend(
  g: ConquestGame,
  life: Life,
  key: string,
  ctx: Record<string, number>,
): void {
  const from = g.s.chars[ctx.c];
  if (LETTER_KEYS.includes(key) && from?.alive)
    sendLetter(g, life, key, from, () => raiseLifeEvent(g, life, key, ctx));
  else raiseLifeEvent(g, life, key, ctx);
}

export function livesDaily(g: ConquestGame): void {
  travellersDaily(g, (life, key, ctx) => raiseLifeEvent(g, life, key, ctx));
  for (const life of g.s.lives) {
    if (life.watching || life.c < 0) continue;
    const me = g.s.chars[life.c];
    if (!me?.alive) continue;
    life.tally.days++;
    followArmy(g, life);
    if (life.travel) {
      if (g.s.day >= life.travel.arrive) hop(g, life);
      else roadRisk(g, life);
    }
    workDaily(g, life, (key, ctx) => raiseOrSend(g, life, key, ctx));
    if (!life.watching && life.c >= 0) lifeEventsDaily(g, life);
    // LIFE (r11): the law, your people, your boats, contracts.
    for (const h of hooks.lifeDaily)
      if (!life.watching && life.c >= 0) h(g, life);
  }
}

/** Soldiers go where their army goes; commanders too. */
function followArmy(g: ConquestGame, life: Life): void {
  const s = g.s;
  const job = life.job;
  let army: Army | undefined;
  if (job && job.army >= 0) {
    army = s.armies.find((a) => a.id === job.army);
    if (!army) {
      touchLife(g, life);
      job.army = -1;
      job.prov = life.prov;
      journal(
        g,
        life,
        "Your company is broken up; you're back in garrison.",
        "bad",
      );
    }
  }
  const led = s.armies.find((a) => a.commander === life.c);
  const a = led ?? army;
  if (a && !life.travel && life.prov !== a.prov) {
    touchLife(g, life).prov = a.prov;
    visit(g, life, a.prov);
  }
}

/** A soldier in garrison joins an army of theirs that's here. */
function joinArmyHere(g: ConquestGame, life: Life): void {
  const s = g.s;
  const job = life.job;
  if (!job || (job.kind !== "soldier" && job.kind !== "warrior")) return;
  if (job.army >= 0 || life.travel) return;
  const here = s.armies
    .filter(
      (a) =>
        a.owner === job.nation &&
        a.prov === life.prov &&
        a.depart < 0 &&
        a.regs.length > 0,
    )
    .sort((a, b) => b.regs.length - a.regs.length)[0];
  if (!here) return;
  touchLife(g, life);
  job.army = here.id;
  journal(
    g,
    life,
    `You fall in with the ${s.nations[here.owner].adjective} army at ${formatPlace(g, here.prov)}: ${here.regs.length} regiment${here.regs.length === 1 ? "" : "s"}.`,
  );
}

// ---------------------------------------------------------------- the months

export function livesMonthly(g: ConquestGame): void {
  for (const life of [...g.s.lives]) {
    if (life.watching || life.c < 0) continue;
    const me = g.s.chars[life.c];
    if (!me?.alive) continue;
    lifeMonth(g, life, me);
    if (life.watching || life.c < 0) continue;
    // LIFE (r11): wages for your people and crews, heat cooling, contracts.
    for (const h of hooks.lifeMonthly)
      if (!life.watching && life.c >= 0) h(g, life);
    // Letters from friends and family far off.
    const letter = letterWriter(g, life);
    if (letter) raiseOrSend(g, life, letter.key, { c: letter.from.id });
  }
  travellersMonthly(g);
}

function lifeMonth(g: ConquestGame, life: Life, me: Character): void {
  const s = g.s;
  const w = g.w;
  touchLife(g, life);
  const age = ageOf(s, me);
  // Money: wages (by the days worked) and stipends in, living out.
  const budget = monthlyBudget(s, w, life, true);
  payPlayerBoss(g, life);
  for (const part of budget.parts) {
    if (part.value > 0) earn(g, life, part.value);
    else spend(g, life, -part.value);
  }
  if (life.purse < -10) {
    addStress(g, life, 4);
    if (life.lifestyle !== "frugal") {
      life.lifestyle = "frugal";
      journal(
        g,
        life,
        "Your creditors are at the door: you cut back to the bare bones.",
        "bad",
      );
    }
  }
  // Work: skill by the days worked, the master's word, the next rung.
  const job = life.job;
  if (job) {
    workMonthly(g, life, (key, ctx) => raiseOrSend(g, life, key, ctx));
    joinArmyHere(g, life);
  } else if (allowanceDue(s, life) && age >= 16) {
    gainXp(g, life, "persuasion", 2);
  }
  propertyMonthly(g, life);
  moneyMonthly(g, life);
  tiesMonthly(g, life, me);
  ambitionsMonthly(g, life);
  // Body and mind.
  const ls = LIFESTYLE[life.lifestyle];
  let dh = ls.health;
  if (hasTrait(me, "robust")) dh += 1;
  if (hasTrait(me, "sickly")) dh -= 1;
  if (hasTrait(me, "drunkard")) dh -= 1;
  if (hasTrait(me, "gouty")) dh -= 1;
  if (age >= 65) dh -= 2;
  else if (age >= 55) dh -= 1;
  else if (age >= 45) dh -= 0.5;
  if (life.stress >= STRESS_HIGH) dh -= 1;
  // The body mends: a little always, more when it's low.
  if (life.health < 80) dh += 1;
  if (life.health < 55) dh += 2;
  if (life.health < 30) dh += 2;
  if (
    w.tropical[life.prov] &&
    dateOf(s.day).month >= 5 &&
    dateOf(s.day).month <= 9
  )
    dh -= 1;
  if (
    isWinter(g.map.provinces[life.prov].lat, dateOf(s.day).month) &&
    life.lifestyle === "frugal"
  )
    dh -= 1;
  heal(g, life, Math.round(dh));
  let ds = ls.stress - 6;
  if (age < 16) ds = -8;
  else {
    if (job) ds += JOBS[job.kind].stress;
    if (hasTrait(me, "content")) ds -= 2;
    if (hasTrait(me, "lazy")) ds -= 1;
    if (hasTrait(me, "ambitious")) ds += 1;
    if (hasTrait(me, "drunkard")) ds += 1;
    if (life.purse < 0) ds += 3;
    if (me.spouse >= 0) ds -= 1;
  }
  addStress(g, life, ds);
  if (
    life.lifestyle === "comfortable" &&
    age >= 45 &&
    !hasTrait(me, "gouty") &&
    g.rng.chance(0.004)
  )
    gainTrait(g, life, "gouty");
  // Fame fades unless it's fed; the crown forgets.
  if (life.renown > 15)
    life.renown =
      Math.round((life.renown - (life.renown - 15) * 0.02) * 10) / 10;
  if (life.favor > 0) life.favor = Math.round(life.favor * 0.98 * 10) / 10;
  // Debts come due.
  for (const d of life.debts) {
    if (d.due > s.day) continue;
    const lender = s.chars[d.to];
    if (life.purse >= d.amount) {
      spend(g, life, d.amount);
      journal(
        g,
        life,
        `You paid ${charName(lender)} the ${d.amount} coins you owed.`,
      );
      d.amount = 0;
    } else {
      if (lender?.alive)
        g.char(lender.id).memories.push({
          of: me.id,
          why: "Owes me money",
          value: -15,
          until: s.day + 3 * DAYS_PER_YEAR,
        });
      addRenown(g, life, -1);
      addStress(g, life, 3);
      d.due = s.day + 90;
      journal(
        g,
        life,
        `You couldn't pay ${charName(lender)}; they'll be back in three months.`,
        "bad",
      );
    }
  }
  life.debts = life.debts.filter((d) => d.amount > 0 && s.chars[d.to]?.alive);
  // An estate held in trust passes to a child heir at sixteen.
  const estate = life.cooldowns.estateKind;
  if (estate !== undefined && age >= 16 && !life.job) {
    const kind = Object.keys(JOBS)[estate] as JobKind;
    const rank = life.cooldowns.estateRank ?? 1;
    const place = JOBS[kind].places[0];
    life.job = {
      kind,
      rank,
      prov: life.home,
      place,
      employer: -1,
      nation: me.nation,
      army: -1,
      since: s.day,
      months: 0,
      away: 0,
      worked: 0,
      awayDays: 0,
      own: true,
    };
    delete life.cooldowns.estateKind;
    delete life.cooldowns.estateRank;
    journal(
      g,
      life,
      `At sixteen you come into the family's ${JOBS[kind].name.toLowerCase()}: ${JOBS[kind].ranks[rank].title.toLowerCase()}.`,
      "good",
    );
  }
  // Offices held.
  const level = Math.max(0, ...officesOf(s, me.id).map((o) => o.level));
  life.tally.topOffice = Math.max(life.tally.topOffice, level);
  // Death: age, health, the dangers of the work.
  let risk = deathRiskByAge(age);
  if (hasTrait(me, "robust")) risk *= 0.5;
  if (hasTrait(me, "sickly")) risk *= 2;
  if (life.health < 25) risk *= 3;
  else if (life.health < 45) risk *= 1.5;
  else if (life.health >= 75) risk *= 0.7;
  if (job && atPost(s, w, life)) {
    const atWarNow = s.wars.some(
      (x) => x.a === job.nation || x.b === job.nation,
    );
    risk += JOBS[job.kind].danger * (atWarNow && job.army >= 0 ? 2 : 1);
  }
  if (life.health <= 0 || g.rng.chance(risk / 12)) {
    const cause =
      life.health <= 0
        ? `a long decline at ${age}`
        : age >= 62
          ? `old age at ${age}`
          : w.tropical[life.prov] && g.rng.chance(0.5)
            ? `a fever at ${age}`
            : job && JOBS[job.kind].danger > 0.005 && g.rng.chance(0.4)
              ? `an accident at work, at ${age}`
              : `a sudden illness at ${age}`;
    kill(g, me, cause);
    return;
  }
  if (life.stress >= 95 && age >= 16 && g.rng.chance(0.3))
    hurt(g, life, 3, `strain and worry at ${age}`);
}

/** A player who works for another player is paid out of their master's purse. */
function payPlayerBoss(g: ConquestGame, life: Life): void {
  const job = life.job;
  if (!job || job.own) return;
  const boss = g.s.lives.find((l) => l.c === job.employer && l !== life);
  if (!boss) return;
  const due = wageOf(g.s, g.w, life, true);
  if (due <= 0) return;
  const paid = Math.max(0, Math.min(due, boss.purse));
  spend(g, boss, paid);
  if (paid < due) {
    journal(
      g,
      life,
      `${charName(meOf(g.s, boss))} couldn't pay your full wage.`,
      "bad",
    );
    // What they couldn't pay isn't paid.
    spend(g, life, due - paid);
  }
}

/** Friends ease your cares, rivals add to them, a mentor teaches, a nemesis plots. */
function tiesMonthly(g: ConquestGame, life: Life, me: Character): void {
  const s = g.s;
  let friends = 0;
  let foes = 0;
  for (const [key, tie] of Object.entries(life.ties)) {
    const id = Number(key);
    const c = s.chars[id];
    if (!c?.alive || c.abroad) {
      delete life.ties[id];
      continue;
    }
    if (tie === "friend" || tie === "lover") friends++;
    if (tie === "rival") foes++;
    if (tie === "nemesis") foes += 2;
    if (tie === "mentor") {
      const sk = c.role ? ROLES[c.role].skill : "persuasion";
      const near = c.home === life.prov || c.home === undefined;
      gainXp(g, life, sk, near ? 6 : 2);
    }
  }
  if (friends) addStress(g, life, -Math.min(4, friends * 1.5));
  if (foes) addStress(g, life, Math.min(5, foes));
  // A rival's hatred can harden.
  for (const [key, tie] of Object.entries(life.ties)) {
    if (tie !== "rival") continue;
    const c = s.chars[Number(key)];
    if (c && opinionOf(s, c, life).total <= -70 && g.rng.chance(0.15))
      raiseLifeEvent(g, life, "nemesis-sworn", { c: c.id });
  }
  void me;
}

// ---------------------------------------------------------------- war

/** A battle a player's army fought: wounds, death, glory and promotion. */
function lifeBattle(
  g: ConquestGame,
  r: BattleReport,
  attackers: Army[],
  defenders: Army[],
): void {
  const s = g.s;
  for (const life of s.lives) {
    const me = meOf(s, life);
    if (!me?.alive || life.watching) continue;
    const mine = (a: Army) =>
      a.commander === me.id || (life.job !== null && life.job.army === a.id);
    const att = attackers.find(mine);
    const def = defenders.find(mine);
    const a = att ?? def;
    if (!a) continue;
    const side = att ? 0 : 1;
    const won = r.winner === side;
    const rep = side === 0 ? r.attacker : r.defender;
    const share = rep.lost / Math.max(1, rep.men);
    const place = formatPlace(g, r.prov);
    const commanding = a.commander === me.id;
    const rank = life.job?.rank ?? 0;
    touchLife(g, life);
    life.tally.battles++;
    if (won) life.tally.battlesWon++;
    gainXp(g, life, "fighting", 25);
    gainXp(g, life, "leadership", commanding ? 35 : 12);
    if (life.job) life.job.months += won ? 6 : 3;
    let glory = (won ? 3 : 1) + (commanding ? 6 : rank);
    if (hasTrait(me, "brave")) glory += 2;
    addRenown(g, life, won ? glory : glory / 2);
    let wound = 0.12 + share * 0.9;
    let death = 0.015 + share * 0.1;
    if (hasTrait(me, "brave")) {
      wound *= 1.2;
      death *= 1.2;
    }
    if (hasTrait(me, "craven")) death *= 0.4;
    if (commanding || rank >= 3) death *= 0.6;
    const fight = Math.max(0, (life.skills.fighting - 6) * 0.01);
    wound = Math.max(0.03, wound - fight);
    const headline = `The battle of ${place}: ${won ? "we carried the day" : "we were beaten"}${commanding ? " under your command" : ""}.`;
    journal(g, life, headline, won ? "good" : "bad");
    milestone(
      g,
      life,
      "battle",
      `${won ? "Won" : "Lost"} the battle of ${place}`,
      r.prov,
    );
    if (g.rng.chance(death)) {
      kill(g, me, `battle at ${place}`);
      continue;
    }
    if (g.rng.chance(wound)) {
      const dmg = g.rng.int(12, 45);
      life.tally.wounds++;
      journal(
        g,
        life,
        dmg >= 35
          ? "A ball took you in the body. The surgeons say you'll live, mostly."
          : "You were cut and bruised, nothing that won't heal.",
        "bad",
      );
      if (dmg >= 30) {
        milestone(g, life, "wounded", `Wounded at ${place}`, r.prov);
        if (g.rng.chance(0.5)) gainTrait(g, life, "scarred");
        if (dmg >= 40 && g.rng.chance(0.5)) gainTrait(g, life, "wounded");
      }
      hurt(g, life, dmg, `wounds taken at ${place}`);
    }
  }
}

// ---------------------------------------------------------------- the end of a life

/** A character died: if a player played them, the line goes on or ends. */
function lifeDied(g: ConquestGame, c: Character, cause: string): void {
  const s = g.s;
  for (const life of s.lives) {
    const me = meOf(s, life);
    if (!me || me.id === c.id) continue;
    if (me.spouse === c.id || c.spouse === me.id) {
      journal(
        g,
        life,
        `Your ${c.female ? "wife" : "husband"} ${charName(c)} died: ${cause}.`,
        "bad",
      );
      addStress(g, life, 25);
    } else if (me.children.includes(c.id)) {
      journal(
        g,
        life,
        `Your ${c.female ? "daughter" : "son"} ${charName(c)} died: ${cause}.`,
        "bad",
      );
      addStress(g, life, 20);
    } else if (life.patron === c.id) {
      life.patron = -1;
      journal(g, life, `Your patron ${charName(c)} has died.`, "bad");
    }
  }
  const life = lifeOfChar(s, c.id);
  if (!life) return;
  journal(g, life, `${charName(c)} died: ${cause}.`, "bad");
  milestone(g, life, "died", `${charName(c)} died, ${cause}`);
  const heir = heirOf(s, life);
  if (heir >= 0) succeedTo(g, life, heir);
  else endLine(g, life, `${charName(c)} died (${cause}) leaving no heir`);
}

const PROPERTY: Partial<Record<JobKind, number>> = {
  farmer: 1,
  millhand: 3,
  newsman: 3,
  clerk: 2,
  craftsman: 2,
  innkeeper: 1,
  sailor: 3,
  trapper: 3,
};

/** What a child knows by the time they take over: their nature and their age. */
function heirSkills(
  s: ConquestGame["state"],
  c: Character,
  focus?: Skill,
): Skills {
  const out = zeroSkills();
  const age = ageOf(s, c);
  for (const k of SKILLS) {
    out[k] = Math.min(
      10,
      BASE_SKILL +
        Math.max(0, Math.floor((stat(s, c, SKILL_STAT[k]) - 5) / 2)) +
        Math.floor(Math.min(age, 30) / 10),
    );
  }
  if (focus && age >= 10)
    out[focus] = Math.min(12, out[focus] + 3 + Math.floor(age / 8));
  if (c.role)
    out[ROLES[c.role].skill] = Math.min(14, out[ROLES[c.role].skill] + 6);
  return out;
}

/** The heir takes up the line: the purse, a little of the name, the family business. */
export function succeedTo(
  g: ConquestGame,
  life: Life,
  heirId: number,
  how: "death" | "europe" = "death",
): void {
  const s = g.s;
  const old = meOf(s, life)!;
  const heir = g.char(heirId);
  touchLife(g, life);
  let purse = life.purse;
  const spouse = s.chars[old.spouse];
  if (
    how === "death" &&
    life.shareWithSpouse &&
    spouse?.alive &&
    spouse.id !== heirId &&
    purse > 3
  ) {
    const share = Math.round((purse / 3) * 10) / 10;
    purse -= share;
    journal(
      g,
      life,
      `A third of the estate, ${share} coins, went to ${charName(spouse)}.`,
    );
  }
  life.purse = Math.round(purse * 100) / 100;
  life.renown = Math.round(life.renown * 0.35 * 10) / 10;
  const job = life.job;
  const property =
    job &&
    (job.own ||
      (PROPERTY[job.kind] !== undefined && job.rank >= PROPERTY[job.kind]!))
      ? job
      : null;
  const heirAge = ageOf(s, heir);
  life.job = null;
  delete life.cooldowns.estateKind;
  life.skills = heirSkills(
    s,
    heir,
    property ? JOBS[property.kind].main : undefined,
  );
  life.xp = zeroSkills();
  life.c = heirId;
  life.line.push(heirId);
  life.heir = -1;
  life.ties = {};
  life.patron = -1;
  life.events = [];
  life.cooldowns = {};
  life.campaign = null;
  life.invite = null;
  life.travel = null;
  life.ambition = null;
  life.outcome = null;
  life.area = undefined;
  life.favor = Math.round(life.favor * 0.3);
  // LIFE (r11): the heir keeps the boats and (some of) the people; not the rest.
  lifeR11Succeeded(g, life);
  life.health = hasTrait(heir, "sickly") ? 70 : 82;
  life.stress = 20;
  heir.home ??= life.home;
  life.home = heir.home;
  life.prov = heir.home;
  life.tally.generations++;
  if (property) {
    if (heirAge >= 16) {
      life.job = {
        ...property,
        months: 0,
        away: 0,
        since: s.day,
        prov: life.home,
        army: -1,
        employer: -1,
      };
      journal(
        g,
        life,
        `${charName(heir)} takes over the family's ${JOBS[property.kind].name.toLowerCase()}.`,
      );
    } else {
      life.cooldowns.estateKind = Object.keys(JOBS).indexOf(property.kind);
      life.cooldowns.estateRank = property.rank;
      journal(
        g,
        life,
        `The family's ${JOBS[property.kind].name.toLowerCase()} is held in trust until ${charName(heir)} is sixteen.`,
      );
    }
  }
  const text =
    how === "europe"
      ? `${charName(heir)} stayed in America to carry on the family`
      : `${charName(heir)}, ${heirAge}, became head of the family`;
  milestone(g, life, "heir", text);
  journal(
    g,
    life,
    heirAge < 16
      ? `You are now ${charName(heir)}, a child of ${heirAge}. Until sixteen you can't work, marry or hold office, but you can learn.`
      : `You are now ${charName(heir)}, ${heirAge}.`,
  );
  visit(g, life, life.prov);
}

/** No one to carry on: the player watches the world until they take over someone, or begin again. */
export function endLine(g: ConquestGame, life: Life, why: string): void {
  touchLife(g, life);
  milestone(g, life, "watching", why);
  journal(g, life, `${why}. Your story ends here; the world goes on.`, "bad");
  life.c = -1;
  life.watching = true;
  life.ended = { day: g.s.day, why };
  life.job = null;
  life.travel = null;
  life.events = [];
  life.campaign = null;
  life.invite = null;
  life.ties = {};
  life.property = [];
  life.ambition = null;
  life.area = undefined;
  // LIFE (r11): nobody left to keep the boats, the people or the company.
  lifeR11Ended(g, life);
}

/** A watching player becomes someone already in the world. */
export function takeOver(
  g: ConquestGame,
  life: Life,
  cId: number,
): string | null {
  const s = g.s;
  if (!life.watching) return "You're living a life already.";
  if (s.over) return "The world has reached 1776.";
  const c = s.chars[cId];
  if (!c?.alive || c.abroad) return "They're not among the living here.";
  if (ageOf(s, c) < 16) return "Too young to take over.";
  if (isPlayed(s, cId)) return "Another player is them.";
  const nation = s.nations[c.nation];
  if (!nation || nation.kind === "crown") return "Not them.";
  touchLife(g, life);
  const home = c.home ?? (nation.capital >= 0 ? nation.capital : life.home);
  g.touchChar(c).home = home;
  const role = c.role ? ROLES[c.role] : undefined;
  life.c = cId;
  life.line.push(cId);
  life.watching = false;
  life.ended = null;
  life.origin = nation.key;
  life.background = isNativeChar(s, c) ? "speaker" : "gentry";
  life.home = home;
  life.prov = home;
  life.travel = null;
  life.job = null;
  life.skills = zeroSkills();
  for (const k of SKILLS) life.skills[k] = npcSkill(s, c, k);
  life.xp = zeroSkills();
  life.purse = Math.round(
    (role?.wealth ?? 20) * 0.5 + (nation.ruler === cId ? 60 : 0),
  );
  life.health = 80;
  life.stress = 20;
  life.renown =
    (role?.status ?? 2) * 4 +
    (nation.ruler === cId ? 30 : 0) +
    (officesOf(s, cId).length ? 10 : 0);
  life.favor = nation.ruler === cId ? 20 : 0;
  life.lifestyle =
    (role?.status ?? 2) >= 4 || nation.ruler === cId ? "comfortable" : "modest";
  life.heir = -1;
  life.patron = -1;
  life.events = [];
  life.cooldowns = {};
  life.ties = {};
  life.debts = [];
  life.campaign = null;
  life.invite = null;
  life.property = [];
  life.ambition = null;
  life.outcome = null;
  life.area = undefined;
  life.tally.takeovers++;
  life.tally.generations++;
  if (role?.becomes) {
    const [kind, rank] = role.becomes;
    const def = JOBS[kind];
    life.job = {
      kind,
      rank: Math.min(rank, def.ranks.length - 1),
      prov: home,
      place: role.place,
      employer: -1,
      nation: c.nation,
      army: -1,
      since: s.day,
      months: 0,
      away: 0,
      worked: 0,
      awayDays: 0,
      // The innkeeper, the planter, the master: their own business.
      ...(role.status >= 2 && role.job ? { own: true } : {}),
    };
  }
  milestone(
    g,
    life,
    "takeover",
    `Took up the life of ${charName(c)}, ${ageOf(s, c)}`,
    home,
  );
  journal(g, life, `You are now ${charName(c)}.`);
  visit(g, life, home);
  return null;
}

// ---------------------------------------------------------------- Europe

/**
 * Sailing for Europe: a fortune spent in London or Paris, a seat in
 * Parliament, a posting, or a recall. With an heir left behind the family
 * carries on in America; otherwise the story ends.
 */
export function leaveForEurope(
  g: ConquestGame,
  life: Life,
  takeHeir: boolean,
): string | null {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return "You're watching.";
  if (isChildLife(s, life)) return "Not as a child.";
  const why = life.invite?.why ?? "fortune";
  if (!life.invite) {
    if (lifeIsNative(s, life))
      return "Few of your people cross the ocean, and only when asked: wait for an invitation.";
    if (life.purse < EUROPE_FORTUNE)
      return `To live in Europe you need ${EUROPE_FORTUNE} coins (you have ${Math.floor(life.purse)}).`;
    if (!((s.provinces[life.prov].b.port ?? 0) > 0))
      return "Ships for Europe sail from a port.";
  }
  if (life.travel) return "Finish your journey first.";
  touchLife(g, life);
  const reason: Record<string, string> = {
    fortune: "to live on a fortune in Europe",
    parliament: "to take a seat in Parliament",
    army: "for a posting with the army in Flanders",
    recalled: "recalled by the crown to answer for the colony",
    exile: "into exile",
  };
  const text = `${charName(me)} sailed for Europe, ${reason[why]}`;
  life.tally.europe = why;
  milestone(g, life, "europe", text);
  journal(
    g,
    life,
    `${text}.`,
    why === "recalled" || why === "exile" ? "bad" : "good",
  );
  const heir = takeHeir ? -1 : heirOf(s, life);
  // Away go the traveller and spouse (and the children, if they all go).
  const going = [me.id];
  if (me.spouse >= 0 && s.chars[me.spouse]?.alive) going.push(me.spouse);
  if (takeHeir)
    for (const k of me.children)
      if (s.chars[k]?.alive && ageOf(s, s.chars[k]) < 21) going.push(k);
  const keep = why === "fortune" ? life.purse * (heir >= 0 ? 0.5 : 1) : 0;
  life.purse -= keep;
  life.invite = null;
  for (const id of going) vanish(g, id, "sailed for Europe");
  if (heir >= 0) {
    // The departing character's life goes on over there; the heir's here.
    life.c = me.id;
    succeedTo(g, life, heir, "europe");
  } else {
    endLine(
      g,
      life,
      takeHeir
        ? `${charName(me)} took the family to Europe`
        : `${charName(me)} sailed for Europe with no heir left behind`,
    );
  }
  return null;
}

/** Someone leaves the Americas for good: posts fall empty, a governor is replaced. */
export function vanish(g: ConquestGame, id: number, why: string): void {
  const s = g.s;
  const c = g.char(id);
  c.abroad = true;
  for (const n of s.nations) {
    if (!n.alive) continue;
    for (const seat of Object.keys(n.council) as (keyof typeof n.council)[])
      if (n.council[seat] === id) g.nation(n.id).council[seat] = -1;
    if (n.court.includes(id))
      g.nation(n.id).court = n.court.filter((x) => x !== id);
    const pol = s.polities[n.id];
    if (pol?.assembly.includes(id)) {
      pol.assembly = pol.assembly.filter((x) => x !== id);
      g.politiesChanged(n.id);
    }
    if (n.ruler === id) succession(g, n.id, why);
  }
  for (const a of s.armies) if (a.commander === id) g.touch(a).commander = -1;
}

// ---------------------------------------------------------------- commands

function commandArmy(
  g: ConquestGame,
  life: Life,
  armyId: number,
): string | null {
  const s = g.s;
  const me = meOf(s, life)!;
  const current = s.armies.find((a) => a.commander === me.id);
  if (armyId === -1) {
    if (!current) return "You command no army.";
    g.touch(current).commander = -1;
    journal(g, life, "You hand over your command.");
    return null;
  }
  const a = s.armies.find((x) => x.id === armyId);
  if (!a) return "No such army.";
  if (current && current !== a) return "You already command an army.";
  if (
    a.commander >= 0 &&
    a.commander !== me.id &&
    s.chars[a.commander]?.alive &&
    isPlayed(s, a.commander)
  )
    return "Another player commands it.";
  if (a.prov !== life.prov || life.travel) return "Go to where the army is.";
  const n = s.nations[a.owner];
  const job = life.job;
  const rankOk =
    job &&
    (job.kind === "soldier" || job.kind === "warrior") &&
    job.nation === a.owner &&
    job.rank >= (COMMAND_RANK[job.kind] ?? 99);
  const seatOk = n.council.marshal === me.id || n.ruler === me.id;
  if (!rankOk && !seatOk)
    return "Only a colonel or general (or a war chief, the marshal or the governor) may take command.";
  g.touch(a).commander = me.id;
  if (job && job.army !== a.id) job.army = a.id;
  journal(
    g,
    life,
    `You take command of the ${n.adjective} army at ${formatPlace(g, a.prov)}.`,
    "good",
  );
  milestone(
    g,
    life,
    "office",
    `Took command of an army of ${n.name.replace(/^the /, "")}`,
  );
  return null;
}

function marchArmy(g: ConquestGame, life: Life, to: number): string | null {
  const s = g.s;
  const a = s.armies.find((x) => x.commander === life.c);
  if (!a) return "You command no army.";
  return militaryCommand(g, a.owner, { k: "move", a: a.id, to });
}

/** Run an act or a choice, noting what it came to for the scene. */
function withOutcome(
  g: ConquestGame,
  life: Life,
  kind: "act" | "person" | "event",
  run: () => string | null,
): string | null {
  beginOutcome(g, life);
  let err: string | null = null;
  try {
    err = run();
  } finally {
    endOutcome(g, life, kind, err !== null);
  }
  return err;
}

function propertyCommand(
  g: ConquestGame,
  life: Life,
  c: Extract<LifeCommand, { k: "property" }>,
): string | null {
  if (life.travel) return "Not from the road.";
  switch (c.act) {
    case "house":
      return buyHouse(g, life);
    case "land":
      return buyLand(g, life);
    case "expand":
      return expandBusiness(g, life, c.id ?? -1);
    case "sell":
      return sellProperty(g, life, c.id ?? -1);
    case "dismiss":
      return dismissHand(g, life, c.c ?? -1);
    case "endow":
      return endow(g, life, c.what ?? "");
    case "cash":
      return cashVenture(g, life, c.id ?? -1);
    case "unkit":
      return c.kit && c.kit in KIT ? sellKit(g, life, c.kit) : "Unknown.";
    default:
      return "Unknown.";
  }
}

/** The army you command: split it, take another in, raise men, storm the walls. */
function armyCommand(
  g: ConquestGame,
  life: Life,
  act: "split" | "merge" | "recruit" | "assault",
  b?: number,
): string | null {
  const s = g.s;
  const a = s.armies.find((x) => x.commander === life.c);
  if (!a) return "You command no army.";
  const n = s.nations[a.owner];
  const here = g.map.provinces[a.prov].name;
  switch (act) {
    case "split": {
      const err = militaryCommand(g, a.owner, { k: "split", a: a.id });
      if (!err)
        journal(
          g,
          life,
          `You split the army at ${here}: half stays under your command, half goes its own way.`,
        );
      return err;
    }
    case "merge": {
      const other = s.armies.find((x) => x.id === b);
      if (!other || other.owner !== a.owner)
        return "Not one of your nation's armies.";
      if (
        other.commander >= 0 &&
        isPlayed(s, other.commander) &&
        other.commander !== life.c
      )
        return "Another player commands it.";
      const err = militaryCommand(g, a.owner, {
        k: "merge",
        a: a.id,
        b: other.id,
      });
      if (!err) {
        g.touch(a).commander = life.c;
        journal(
          g,
          life,
          `The army at ${here} falls in under your command.`,
          "good",
        );
      }
      return err;
    }
    case "recruit": {
      if (a.depart >= 0) return "Not on the march.";
      const pr = s.provinces[a.prov];
      if (pr.owner !== a.owner || pr.occupier >= 0)
        return "Raise men in your own nation's country.";
      const cost = RECRUIT_COST;
      if (life.purse < cost)
        return `Bounties and muskets for the men: ${cost} coins.`;
      if ((life.cooldowns["army:recruit"] ?? 0) > s.day)
        return "The country's been drained of willing men lately.";
      spend(g, life, cost);
      touchLife(g, life).cooldowns["army:recruit"] = s.day + 60;
      const t = n.kind === "native" ? "warriors" : "militia";
      g.touch(a).regs.push({ type: t, men: 500, morale: 0.7, home: a.prov });
      addRenown(g, life, 1);
      journal(
        g,
        life,
        `You beat the drum at ${here} and ${t === "militia" ? "five hundred volunteers" : "five hundred warriors"} come in.`,
        "good",
      );
      return null;
    }
    case "assault": {
      const pr = s.provinces[a.prov];
      if (!pr.siege || pr.siege.by !== a.owner)
        return "You're not besieging anything here.";
      if ((life.cooldowns["army:assault"] ?? 0) > s.day)
        return "The men need time before another assault.";
      touchLife(g, life).cooldowns["army:assault"] = s.day + 20;
      const odds = checkChance(skillLevel(s, life, "leadership"), 9);
      const won = rollCheck(g, odds);
      const x = g.touch(a);
      for (const r of x.regs) {
        r.men = Math.max(50, Math.round(r.men * (won ? 0.9 : 0.82)));
        r.morale = Math.max(0.1, r.morale - (won ? 0.05 : 0.2));
      }
      gainXp(g, life, "leadership", 12);
      if (won) {
        g.prov(a.prov).siege!.progress = Math.min(100, pr.siege.progress + 40);
        addRenown(g, life, 3);
        journal(
          g,
          life,
          `You led the assault at ${here} and the walls gave. The siege is nearly done.`,
          "good",
        );
      } else {
        journal(
          g,
          life,
          `The assault at ${here} broke against the walls. The ditch is full of good men.`,
          "bad",
        );
      }
      return null;
    }
  }
}

/** The life commands, run for a seat. Returns why it can't be done, or null. */
export function lifeCommand(
  g: ConquestGame,
  seat: string,
  c: LifeCommand,
): string | null {
  const s = g.s;
  if (s.over) return "The world has reached 1776.";
  if (!c || typeof c !== "object" || typeof c.k !== "string")
    return "Bad command.";
  const life = lifeOfSeat(s, seat);
  if (!life) return "You haven't made a character yet.";
  if (c.k === "takeover") return takeOver(g, life, c.c);
  const me = meOf(s, life);
  if (!me || life.watching) return "You're watching the world now.";
  const child = isChildLife(s, life);
  // LIFE (r11): some things can't be done from a cell (or in irons).
  for (const h of hooks.gate) {
    const why = h(g, life, c);
    if (why) return why;
  }
  switch (c.k) {
    case "travel":
      return travelTo(g, life, c.to, !!c.bySea);
    case "halt": {
      if (!life.travel) return "You're not on the road.";
      touchLife(g, life);
      life.travel.path = [life.travel.path[0]];
      life.travel.sea = [life.travel.sea[0]];
      life.travel.dest = life.travel.path[0];
      return null;
    }
    case "act":
      return withOutcome(g, life, "act", () =>
        doAct(g, life, c.place, c.act, c.arg),
      );
    case "job": {
      // Asking whoever hires for that trade there (they may say no).
      if (child) return "Not until you're sixteen.";
      const boss = employerFor(s, g.w, life.prov, c.job, c.place);
      if (!boss) return "There's nobody here to take you on.";
      const jobs = workOffered(boss);
      return withOutcome(g, life, "person", () =>
        doInteraction(
          g,
          life,
          boss.id,
          "work",
          Math.max(0, jobs.indexOf(c.job)),
        ),
      );
    }
    case "quit":
      if (!life.job) return "You have no work to leave.";
      if (life.job.kind === "servant" && (life.job.until ?? 0) > s.day)
        return "You're bound until your indenture is served. (You could run away.)";
      leaveJob(g, life, "of your own accord");
      return null;
    case "person":
      return withOutcome(g, life, "person", () =>
        doInteraction(g, life, c.c, c.act, c.arg, { good: c.good, qty: c.qty }),
      );
    case "enter": {
      if (life.travel) return "You're on the road.";
      if (!areasOf(s, g.w, life.prov, life).includes(c.area))
        return "There's no such place here.";
      if (life.area !== c.area) touchLife(g, life).area = c.area;
      return null;
    }
    case "ambition":
      return setAmbition(g, life, c.key, c.arg);
    case "property":
      if (child) return "Not as a child.";
      return propertyCommand(g, life, c);
    case "army":
      if (child) return "Not as a child.";
      return armyCommand(g, life, c.act, c.b);
    case "lifestyle":
      if (!LIFESTYLES.includes(c.v)) return "No such way of living.";
      touchLife(g, life).lifestyle = c.v;
      return null;
    case "heir": {
      const kid = s.chars[c.c];
      if (!kid?.alive || !me.children.includes(c.c))
        return "Only a living child of yours.";
      touchLife(g, life).heir = c.c;
      journal(g, life, `You name ${charName(kid)} your heir.`);
      return null;
    }
    case "will":
      touchLife(g, life).shareWithSpouse = !!c.share;
      return null;
    // ART (r11): a new likeness, chosen from the gallery.
    case "likeness":
      return sitForLikeness(g, me, c.look, ageOf(s, me));
    case "event":
      return withOutcome(g, life, "event", () =>
        answerLifeEvent(g, life, c.id, c.choice),
      );
    case "trade":
      return marketTrade(g, life, c.good, c.qty);
    // WORLD r11: the province's market, leads, and gifts at a council fire.
    case "market":
      return marketTrade(g, life, c.item, c.qty);
    case "lead":
      if (child && c.act !== "drop") return "Not until you're sixteen.";
      return leadCommand(g, life, c.id, c.act);
    case "present":
      if (child) return "Not until you're sixteen.";
      return withOutcome(g, life, "act", () => present(g, life, c.item));
    case "repay": {
      const d = life.debts.find((x) => x.to === c.to);
      if (!d) return "You owe them nothing.";
      if (life.purse < d.amount) return `You need ${d.amount} coins.`;
      spend(g, life, d.amount);
      life.debts = life.debts.filter((x) => x !== d);
      const lender = s.chars[c.to];
      if (lender?.alive)
        g.char(lender.id).memories.push({
          of: me.id,
          why: "Paid me back",
          value: 10,
          until: s.day + 2 * DAYS_PER_YEAR,
        });
      journal(g, life, `You paid back ${charName(lender)}.`);
      return null;
    }
    case "command":
      if (child) return "Not as a child.";
      return commandArmy(g, life, c.army);
    case "march":
      return marchArmy(g, life, c.to);
    case "movement":
    case "stand":
    case "gov":
      if (child) return "Not as a child.";
      for (const h of hooks.command) {
        const r = h(g, life, c);
        if (r !== undefined) return r;
      }
      return "Not yet.";
    case "europe":
      return leaveForEurope(g, life, !!c.takeHeir);
    case "society": // SOCIETY (r11)
      return societyCommand(g, life, c);
    case "decline":
      if (!life.invite) return "Nobody has asked.";
      touchLife(g, life).invite = null;
      journal(
        g,
        life,
        "You decline the invitation to Europe. America will do.",
      );
      return null;
    default:
      // LIFE (r11): work, the law, your people, boats and contracts.
      for (const h of hooks.command) {
        const r = h(g, life, c);
        if (r !== undefined) return r;
      }
      return "Unknown command.";
  }
}

/** The end of the world: everyone still living sees 1776. */
export function livesAtEnd(g: ConquestGame): void {
  for (const life of g.s.lives) {
    const me = meOf(g.s, life);
    if (!me) continue;
    milestone(g, life, "end", `${charName(me)} lived to see 1776`);
    journal(
      g,
      life,
      "It is 1776. Whatever comes next, your story ends here.",
      "good",
    );
  }
}

hooks.death.push(lifeDied);
hooks.battle.push(lifeBattle);
hooks.skip.push((g, c) => isPlayed(g.s, c));
hooks.birth.push((g, kid, mother, father) => {
  for (const life of g.s.lives) {
    if (life.c !== mother.id && life.c !== father.id) continue;
    touchLife(g, life);
    life.tally.children++;
    if (life.c === mother.id || life.c === father.id) kid.home ??= life.home;
    journal(
      g,
      life,
      `A ${kid.female ? "daughter" : "son"} is born: ${kid.first}.`,
      "good",
    );
    milestone(
      g,
      life,
      "child",
      `${kid.female ? "A daughter" : "A son"}, ${kid.first}, was born`,
    );
  }
});
