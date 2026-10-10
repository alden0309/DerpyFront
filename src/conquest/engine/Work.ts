// One job at a time, at one workplace, given by an employer: the innkeeper
// who takes you on as tapster, the sergeant who enlists you, the planter
// whose tobacco you hoe; or yourself, on your own land, trapline or shop.
// Every day at your post is a day's pay and a little more skill; too long
// away and your master gives your place to someone else. You're hired by
// asking (and they say yes or no, and why), promoted by your master when
// you've earned it, and you climb by buying into a business of your own.

import { crimeWorkDay, lawWorkDay } from "./Crime";
import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import { addRenown, gainXp, journal, milestone, touchLife } from "./LifeCore";
import {
  atPost,
  Check,
  commissionFriend,
  commissionOpinion,
  hasPlace,
  isChildLife,
  isNativeChar,
  meOf,
  no,
  opinionOf,
  promotionView,
  rankOf,
  skillLevel,
  startRank,
  yes,
} from "./LifeQueries";
import {
  AWAY_DAYS,
  AWAY_WARN_DAYS,
  FREEDOM_DUES,
  JOBS,
  OFFER_CHANCE,
  PROMOTION_CHANCE,
  roleJobs,
  ROLES,
  SKILL_NAMES,
  WORK_DAYS,
} from "./LifeRules";
import type { World } from "./Map";
import { wake } from "./Pace";
import { openBusiness } from "./Property";
import { charName, hasTrait } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import {
  effortDay,
  effortMonth,
  effortOf,
  jobGate,
  OVERTIME_SHARE,
  rungKit,
  shirkDay,
} from "./Trades";
import type {
  Breakdown,
  Character,
  GameState,
  Job,
  JobKind,
  Life,
  PlaceKind,
  Skill,
} from "./Types";
import { workMatter } from "./WorkEvents";

function provName(g: ConquestGame, p: number): string {
  return g.map.provinces[p]?.name ?? "somewhere";
}

// ---------------------------------------------------------------- who hires

/** The people of a province who take others on, and for which trades. */
export function employersIn(
  s: GameState,
  w: World,
  p: number,
): { c: Character; jobs: JobKind[]; place: PlaceKind }[] {
  const out: { c: Character; jobs: JobKind[]; place: PlaceKind }[] = [];
  for (const id of s.locals[p] ?? []) {
    const c = s.chars[id];
    if (!c?.alive || c.abroad || !c.role) continue;
    const jobs = roleJobs(c.role).filter((k) => k !== "servant");
    const place = ROLES[c.role].place;
    if (!jobs.length || !hasPlace(s, w, p, place)) continue;
    if (
      (s.travellers ?? []).some(
        (t) => t.c === c.id && !(t.depart < 0 && t.prov === p),
      )
    )
      continue;
    out.push({ c, jobs, place });
  }
  return out;
}

/** Whoever takes people on for a trade at a place here, if anyone. */
export function employerFor(
  s: GameState,
  w: World,
  p: number,
  kind: JobKind,
  place?: PlaceKind,
): Character | undefined {
  return employersIn(s, w, p).find(
    (e) => e.jobs.includes(kind) && (place === undefined || e.place === place),
  )?.c;
}

/** Your master: who took you on (or whoever holds their post now). */
export function bossOf(s: GameState, life: Life): Character | undefined {
  const job = life.job;
  if (!job || job.own) return undefined;
  const c = s.chars[job.employer];
  if (c?.alive && !c.abroad) return c;
  return undefined;
}

// ---------------------------------------------------------------- being taken on

/** Whether you can ask someone for work at all (they'll still decide). */
export function hireGates(
  s: GameState,
  w: World,
  life: Life,
  boss: Character,
  kind: JobKind,
): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (life.crime?.jail) return no("Not from a cell.");
  if (life.travel) return no("You're on the road.");
  if (!roleJobs(boss.role).includes(kind))
    return no("They don't take people on.");
  const place = ROLES[boss.role!].place;
  if (!hasPlace(s, w, life.prov, place))
    return no("There's no such place here.");
  if (life.job) {
    if (life.job.kind === "servant" && (life.job.until ?? 0) > s.day)
      return no("You're bound to your master until your indenture is served.");
    const title = rankOf(life)?.title.toLowerCase() ?? "something";
    return no(`You work as ${title} already: hand in your notice first.`);
  }
  const def = JOBS[kind];
  const native = isNativeChar(s, me);
  if (def.native !== null && def.native !== native)
    return no(
      def.native
        ? "That's work among the native peoples."
        : "That's colonists' work.",
    );
  // LIFE (r11): a port, the north, contacts, a name in the underworld.
  return jobGate(s, w, life, kind, life.prov);
}

const HEAVY: JobKind[] = [
  "farmer",
  "millhand",
  "soldier",
  "sailor",
  "craftsman",
  "warrior",
  "grower",
  "hunter",
];

/** What someone thinks of taking you on, and why: above nothing, they will. */
export function hireAcceptance(
  s: GameState,
  w: World,
  life: Life,
  boss: Character,
  kind: JobKind,
): Breakdown {
  const me = meOf(s, life);
  const e = new Explain();
  if (!me) return e.done(0);
  const def = JOBS[kind];
  const nativeWork = def.native === true;
  e.add(nativeWork ? "Many hands make the work light" : "Hands are wanted", 10);
  const op = opinionOf(s, boss, life).total;
  e.add(`What they think of you (${op})`, Math.round(op / 2));
  for (const [sk, v] of Object.entries(def.need ?? {}) as [Skill, number][]) {
    const have = skillLevel(s, life, sk);
    if (have < v)
      e.add(
        `Can't do the work: ${SKILL_NAMES[sk].toLowerCase()} ${have} of ${v}`,
        -40,
      );
  }
  const main = skillLevel(s, life, def.main);
  if (main >= 4)
    e.add(
      `Your ${SKILL_NAMES[def.main].toLowerCase()} (${main})`,
      Math.min(15, (main - 3) * 2),
    );
  else if (main <= 1)
    e.add(`No ${SKILL_NAMES[def.main].toLowerCase()} to speak of`, -5);
  const pr = s.provinces[life.prov];
  const holder = pr.occupier >= 0 ? pr.occupier : pr.owner;
  if (def.ownNation && holder !== me.nation)
    e.add(
      `Only ${s.nations[holder]?.adjective ?? "local"} people serve here`,
      -100,
    );
  if (def.ownFaith && s.nations[holder]?.religion !== me.religion)
    e.add("A church of another faith", -100);
  if (hasTrait(me, "diligent")) e.add("Hard-working", 10);
  if (hasTrait(me, "lazy")) e.add("Idle", -10);
  if (hasTrait(me, "drunkard")) e.add("Smells of drink", -10);
  if (hasTrait(me, "honest")) e.add("An honest face", 5);
  if (hasTrait(me, "strong") && HEAVY.includes(kind)) e.add("Strong back", 5);
  if (life.renown >= 10)
    e.add(
      "Your name goes before you",
      Math.min(10, Math.floor(life.renown / 5)),
    );
  if (
    life.background === "gentry" &&
    HEAVY.includes(kind) &&
    kind !== "soldier"
  )
    e.add("A gentleman's child, at this?", -10);
  // LIFE (r11): the underworld wants a name; the law wants a clean one.
  const notoriety = life.crime?.notoriety ?? 0;
  if (def.crime) {
    if (notoriety >= 5)
      e.add(
        `Known in the underworld (${Math.floor(notoriety)})`,
        Math.min(20, Math.floor(notoriety / 3)),
      );
    else e.add("Nobody here knows you", -5);
    if (hasTrait(me, "honest")) e.add("Too honest a face for this", -10);
    if (life.job && JOBS[life.job.kind].law)
      e.add("You smell of the watch-house", -60);
  }
  if (def.law || def.ownNation) {
    if ((life.crime?.record.length ?? 0) > 0)
      e.add(
        `A record (${life.crime!.record.length} conviction${life.crime!.record.length === 1 ? "" : "s"})`,
        -15 * life.crime!.record.length,
      );
    if (life.crime?.branded) e.add("Branded a felon", -25);
    if (def.law && notoriety >= 20)
      e.add("Known to keep bad company", -Math.floor(notoriety / 3));
  }
  return e.done(0);
}

/** Be taken on: the start of work at a place, for an employer or yourself. */
export function startJob(
  g: ConquestGame,
  life: Life,
  kind: JobKind,
  place: PlaceKind,
  rank = 0,
  employer = -1,
  own = false,
): Job {
  const s = g.s;
  const def = JOBS[kind];
  const pr = s.provinces[life.prov];
  const holder = pr.occupier >= 0 ? pr.occupier : pr.owner;
  const me = meOf(s, life)!;
  const job: Job = {
    kind,
    rank,
    prov: life.prov,
    place,
    employer,
    nation: def.ownNation ? holder : me.nation,
    army: -1,
    since: s.day,
    months: 0,
    away: 0,
    worked: 0,
    awayDays: 0,
    ...(own ? { own: true } : {}),
  };
  touchLife(g, life).job = job;
  life.area = place;
  life.tally.jobs++;
  life.tally.topRank = Math.max(life.tally.topRank, rank);
  const boss = s.chars[employer];
  milestone(
    g,
    life,
    "job",
    `Took up work as ${def.ranks[rank].title.toLowerCase()} at ${provName(g, life.prov)}`,
  );
  journal(
    g,
    life,
    own
      ? `You set up on your own as ${def.ranks[rank].title.toLowerCase()} at ${provName(g, life.prov)}.`
      : `${boss ? `${charName(boss)} takes you on` : "You're taken on"} as ${def.ranks[rank].title.toLowerCase()} at ${provName(g, life.prov)}: ${def.ranks[rank].wage} coins a month, paid by the days you work.`,
    "good",
  );
  return job;
}

/**
 * Be taken on by whoever hires for a trade at a place here, leaving any
 * work you had (an offer made in an event, a background's first job).
 */
export function takeJob(
  g: ConquestGame,
  life: Life,
  place: PlaceKind,
  kind: JobKind,
): string | null {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return "You're watching.";
  const def = JOBS[kind];
  if (!def) return "No such work.";
  if (isChildLife(s, life)) return "Not until you're sixteen.";
  if (!def.places.includes(place) || !hasPlace(s, g.w, life.prov, place))
    return "There's no such place here.";
  if (def.native !== null && def.native !== isNativeChar(s, me))
    return def.native
      ? "That's work among the native peoples."
      : "That's colonists' work.";
  // LIFE (r11): a port, the north, contacts: some trades can't be had everywhere.
  const gate = jobGate(s, g.w, life, kind, life.prov);
  if (!gate.ok) return gate.why;
  const boss = employerFor(s, g.w, life.prov, kind, place);
  if (!boss && !def.selfStart) return "There's nobody here to take you on.";
  if (life.job) leaveJob(g, life, "for other work");
  startJob(
    g,
    life,
    kind,
    place,
    startRank(s, life, kind),
    boss?.id ?? -1,
    !boss,
  );
  return null;
}

/** Leaving a post; soldiers at war who walk off are deserters. */
export function leaveJob(g: ConquestGame, life: Life, why: string): void {
  const job = life.job;
  if (!job) return;
  const s = g.s;
  const def = JOBS[job.kind];
  if (
    (job.kind === "soldier" || job.kind === "warrior") &&
    s.wars.some((w) => w.a === job.nation || w.b === job.nation) &&
    why !== "discharged"
  ) {
    addRenown(g, life, -5);
    journal(
      g,
      life,
      "You left the colours in wartime. Men call it desertion.",
      "bad",
    );
  }
  const army = s.armies.find((a) => a.commander === life.c);
  if (army && (job.kind === "soldier" || job.kind === "warrior"))
    g.touch(army).commander = -1;
  journal(
    g,
    life,
    `You left your work as ${def.ranks[job.rank].title.toLowerCase()} ${why}.`,
  );
  // A player who worked for another player: off the books.
  const boss = s.lives.find((l) => l.c === job.employer);
  if (boss)
    for (const pr of boss.property ?? [])
      if (pr.hands.includes(life.c)) {
        touchLife(g, boss);
        pr.hands = pr.hands.filter((x) => x !== life.c);
      }
  touchLife(g, life).job = null;
}

// ---------------------------------------------------------------- climbing

export function promote(g: ConquestGame, life: Life): void {
  const job = life.job!;
  const def = JOBS[job.kind];
  job.rank++;
  job.months = 0;
  touchLife(g, life);
  life.tally.promotions++;
  life.tally.topRank = Math.max(life.tally.topRank, job.rank);
  addRenown(g, life, 2 + job.rank);
  const title = def.ranks[job.rank].title;
  journal(
    g,
    life,
    `You're made ${title.toLowerCase()}: ${def.ranks[job.rank].wage} coins a month.`,
    "good",
  );
  milestone(g, life, "promoted", `Rose to ${title.toLowerCase()}`);
  wake(g, life, `You're made ${title.toLowerCase()}.`);
}

/** Who could give you your next rung: your master, or for a commission the great. */
export function canPromote(s: GameState, life: Life, c: Character): boolean {
  const job = life.job;
  if (!job) return false;
  const next = JOBS[job.kind].ranks[job.rank + 1];
  if (!next) return false;
  if (next.commission) {
    const n = s.nations[job.nation >= 0 ? job.nation : 0];
    return (
      n?.ruler === c.id || n?.council.marshal === c.id || life.patron === c.id
    );
  }
  return !job.own && job.employer === c.id;
}

/** What your master thinks of moving you up a rung, and why. */
export function promotionAcceptance(
  s: GameState,
  life: Life,
  c: Character,
): Breakdown {
  const e = new Explain();
  const job = life.job;
  if (!job) return e.done(0);
  const def = JOBS[job.kind];
  const next = def.ranks[job.rank + 1];
  if (!next) return e.add("The top of the ladder", -100).done(0);
  e.add("Promotion has to be earned", -10);
  const now = def.ranks[job.rank].title.toLowerCase();
  if (job.months >= next.months) e.add("You've served your time", 10);
  else e.add(`Only ${job.months} of ${next.months} months as ${now}`, -30);
  const main = skillLevel(s, life, def.main);
  if (next.skill > 0)
    e.add(
      `${SKILL_NAMES[def.main]} ${main} (needs ${next.skill})`,
      main >= next.skill ? 10 : -30,
    );
  if (next.second) {
    const sec = skillLevel(s, life, def.second);
    e.add(
      `${SKILL_NAMES[def.second]} ${sec} (needs ${next.second})`,
      sec >= next.second ? 5 : -25,
    );
  }
  if (next.renown > 0)
    e.add(
      `Renown ${Math.floor(life.renown)} (needs ${next.renown})`,
      life.renown >= next.renown ? 5 : -20,
    );
  const op = opinionOf(s, c, life).total;
  e.add(`What they think of you (${op})`, Math.round(op / 2));
  if (next.opinion !== undefined && op < next.opinion)
    e.add(`They'd want to trust you more (${next.opinion})`, -20);
  if (next.commission) {
    const want = commissionOpinion(job.rank + 1);
    if (op < want) e.add(`A commission needs their good word (${want})`, -25);
  }
  const me = meOf(s, life);
  if (hasTrait(me, "diligent")) e.add("Hard-working", 10);
  if (hasTrait(me, "lazy")) e.add("Idle", -10);
  if ((job.awayDays ?? 0) > 7) e.add("Often away from your post", -15);
  else if ((job.worked ?? 0) >= 12) e.add("Never misses a day", 5);
  // LIFE (r11): how hard you go at it.
  if (effortOf(life) === "shirk") e.add("Known to shirk", -20);
  else if (effortOf(life) === "hard" || effortOf(life) === "overtime")
    e.add("Works harder than anyone", 10);
  const kit = rungKit(s, life, job.rank + 1);
  if (!kit.ok) e.add(kit.why, -100);
  if (next.buy && !next.commission)
    e.add(`That rung is bought: ${next.buy.what}`, -100);
  return e.done(0);
}

/** Buy the next rung: land, a shop, a press, a commission. It's yours now. */
export function buyRank(g: ConquestGame, life: Life): string | null {
  const job = life.job;
  if (!job) return "You have no trade to buy into.";
  const next = JOBS[job.kind].ranks[job.rank + 1];
  if (!next?.buy) return "That rung can't be bought.";
  if (life.prov !== job.prov && job.army < 0)
    return "That's done where you work.";
  const view = promotionView(g.s, life);
  const unmet = view.needs.filter(
    (x) =>
      !x.met &&
      !x.label.includes("coins for") &&
      !x.label.includes("a word from"),
  );
  if (unmet.length) return `Needs ${unmet[0].label}.`;
  if (life.purse < next.buy.cost)
    return `You need ${next.buy.cost} coins (you have ${Math.floor(life.purse)}).`;
  const s = g.s;
  touchLife(g, life);
  life.purse = Math.round((life.purse - next.buy.cost) * 100) / 100;
  journal(g, life, `You paid ${next.buy.cost} coins for ${next.buy.what}.`);
  promote(g, life);
  // Land, a shop, a press, a ship: your own now (a commission isn't).
  if (!next.commission) {
    const boss = s.chars[job.employer];
    job.own = true;
    job.employer = -1;
    openBusiness(g, life, job);
    if (boss?.alive)
      journal(
        g,
        life,
        `You're your own master now; ${charName(boss)} wishes you well, mostly.`,
      );
  }
  return null;
}

// ---------------------------------------------------------------- the days

const SUNDAY = (day: number) => ((day % 7) + 7) % 7 === 0;

/** A day at your post (or away from it). Raises a letter, or a dismissal. */
export function workDaily(
  g: ConquestGame,
  life: Life,
  raise: (key: string, ctx: Record<string, number>) => void,
): void {
  const s = g.s;
  const job = life.job;
  if (!job) return;
  if (atPost(s, g.w, life)) {
    if (job.awayDays) {
      job.awayDays = 0;
      touchLife(g, life);
    }
    if (!SUNDAY(s.day)) {
      // LIFE (r11): the day is worked for you, as hard as you go at it.
      job.worked = Math.round(((job.worked ?? 0) + effortDay(life)) * 10) / 10;
      shirkDay(g, life, raise);
      if (JOBS[job.kind].crime) crimeWorkDay(g, life, raise);
      if (JOBS[job.kind].law) lawWorkDay(g, life, raise);
      workMatter(g, life, raise);
    }
    // The sheet sees the week's work on Saturdays.
    if (((s.day % 7) + 7) % 7 === 6) touchLife(g, life);
    return;
  }
  job.awayDays = (job.awayDays ?? 0) + 1;
  if (job.own || job.kind === "servant" || job.army >= 0) return;
  const boss = bossOf(s, life);
  if (job.awayDays === AWAY_WARN_DAYS) {
    touchLife(g, life);
    if (boss) raise("boss-where", { c: boss.id });
    else
      journal(
        g,
        life,
        `You've been away from your post three weeks. Another three and it's gone.`,
        "bad",
      );
  }
  if (job.awayDays >= AWAY_DAYS) {
    if (boss) {
      g.char(boss.id).memories.push({
        of: life.c,
        why: "Walked off the job",
        value: -10,
        until: s.day + 2 * DAYS_PER_YEAR,
      });
      raise("boss-dismissed", { c: boss.id });
    }
    journal(
      g,
      life,
      `You were away from your post too long and lost it.`,
      "bad",
    );
    leaveJob(g, life, "for being absent");
    wake(g, life, "You've lost your place for being away too long.");
  }
}

/** A month's work: skill and standing by the days worked, a rung if it's earned. */
export function workMonthly(
  g: ConquestGame,
  life: Life,
  raise: (key: string, ctx: Record<string, number>) => void,
): void {
  const s = g.s;
  const job = life.job;
  if (!job) return;
  touchLife(g, life);
  const def = JOBS[job.kind];
  // LIFE (r11): overtime earns more; how hard you went at it, what you learned.
  const share = Math.min(
    effortOf(life) === "overtime" ? OVERTIME_SHARE : 1,
    (job.worked ?? 0) / WORK_DAYS,
  );
  const learn = effortMonth(g, life) * Math.min(1, share);
  if (share >= 0.5) job.months++;
  if (share > 0) {
    gainXp(g, life, def.main, Math.round(7 * learn * 10) / 10, true);
    gainXp(g, life, def.second, Math.round(3 * learn * 10) / 10, true);
    const fame = (def.fame ?? 0) * Math.max(0, job.rank - 1) * share;
    if (fame > 0) addRenown(g, life, fame);
  }
  job.worked = 0;
  job.away = job.awayDays ? Math.floor(job.awayDays / 30) : 0;
  // The master's post passes on: whoever holds it now keeps you on.
  if (!job.own && job.employer >= 0 && !s.chars[job.employer]?.alive) {
    const role = s.chars[job.employer]?.role;
    const next = (s.locals[job.prov] ?? [])
      .map((id) => s.chars[id])
      .find((c) => c?.alive && c.role === role);
    if (next) {
      job.employer = next.id;
      journal(g, life, `${charName(next)} keeps you on.`);
    }
  }
  // Indentures end.
  if (job.kind === "servant" && (job.until ?? 0) <= s.day) {
    life.job = null;
    touchLife(g, life).purse += FREEDOM_DUES;
    journal(
      g,
      life,
      `Your indenture is served. You're free, with ${FREEDOM_DUES} coins of freedom dues and a suit of clothes.`,
      "good",
    );
    milestone(g, life, "job", "Served out an indenture");
    wake(g, life, "Your indenture is served.");
    return;
  }
  // The next rung.
  const view = promotionView(s, life);
  if (!view.check.ok || !view.next) return;
  if (view.next.buy && !view.next.commission) return;
  if (!rungKit(s, life, job.rank + 1).ok) return;
  const me = meOf(s, life)!;
  // LIFE (r11): hard work brings the next rung sooner; shirking puts it off.
  const keen =
    effortOf(life) === "hard" || effortOf(life) === "overtime"
      ? 1.3
      : effortOf(life) === "shirk"
        ? 0.5
        : 1;
  if (job.own) {
    let chance = PROMOTION_CHANCE * keen;
    if (hasTrait(me, "ambitious")) chance *= 1.3;
    if (hasTrait(me, "content")) chance *= 0.8;
    if (g.rng.chance(chance)) promote(g, life);
    return;
  }
  if (view.next.commission) {
    const friend = commissionFriend(s, life);
    if (friend < commissionOpinion(job.rank + 1)) return;
    const n = s.nations[job.nation >= 0 ? job.nation : me.nation];
    const giver = [n?.council.marshal, n?.ruler, life.patron]
      .map((id) => (id !== undefined && id >= 0 ? s.chars[id] : undefined))
      .find(
        (c) =>
          c?.alive &&
          opinionOf(s, c, life).total >= commissionOpinion(job.rank + 1),
      );
    if (giver && g.rng.chance(0.25)) raise("commission-offer", { c: giver.id });
    return;
  }
  const boss = bossOf(s, life);
  if (boss && g.rng.chance(OFFER_CHANCE * keen))
    raise("boss-promotion", { c: boss.id });
  else if (!boss && g.rng.chance(PROMOTION_CHANCE * keen)) promote(g, life);
}

/** A hard day at your post: more skill, a good word from your master, a tired back. */
/** What a long day's work is like, wherever it's done. */
const HARD_DAYS: Partial<Record<PlaceKind, string[]>> = {
  fields: [
    "In the rows from first light until you can't tell a weed from a seedling.",
    "You walk the furrows behind the plough until the ox looks sorrier for you than for itself.",
    "Hoeing, carting, a fence that wouldn't stand and then did. Your back will tell you about it tomorrow.",
  ],
  workshop: [
    "Sawdust in your hair, a blister on every finger, and one piece of work you're proud of.",
    "The forge never cools: you keep it fed and keep your eyebrows, mostly.",
    "You finish the order a day early and start the next before supper.",
  ],
  fort: [
    "Drill, sentry, drill again, and a sergeant who has opinions about your buttons.",
    "You dig a ditch, fill a ditch, and dig it again somewhere the captain prefers.",
    "Twelve hours on the wall, watching trees that never once attack.",
  ],
  docks: [
    "Hogsheads up the gangway, salt cod down it, and the tide waiting for nobody.",
    "You splice rope until your hands forget any other shape.",
    "A ship in, a ship out, and a manifest that adds up for once.",
  ],
  market: [
    "Ledgers, scales and haggling from opening to the last candle.",
    "You count the takings twice. They come out the same both times, which is a first.",
    "Every farmer in the county wants credit today. You give it to the honest-looking ones.",
  ],
  press: [
    "Inked to the elbows: four pages set, proofed, pulled and hung to dry.",
    "You set the type for a sermon, a sale of land and a reward for a runaway mare.",
  ],
  church: [
    "Two sermons written, one funeral, three visits to the sick and a vestry meeting that would try a saint.",
    "You catechise the children until they can say it backwards. Some of them do.",
  ],
  governor: [
    "Copying, filing, sealing. The colony is governed on paper, and you are the paper.",
    "Petitions all day: land, fences, cows and a widow's pension. You read them all.",
  ],
  apothecary: [
    "Three fevers, a broken arm and a child who swallowed a button. All alive tonight.",
    "You grind simples and roll pills until the shop smells of you.",
  ],
  woods: [
    "Twenty miles of trapline, walked and reset, and three pelts to show for it.",
    "Out before dawn, back after dark, cold to the bone and rich in beaver.",
  ],
  village: [
    "From the cornfields to the drying racks and back: there is always more to do before winter.",
    "You work the hides with the others, talking and laughing until the light goes.",
  ],
  councilfire: [
    "You sit at the fire from morning until the stars, listening more than you speak.",
  ],
  tavern: [
    "Pots to scour, barrels to broach, drunks to steer gently into the street.",
  ],
};

export function hardDay(g: ConquestGame, life: Life): string | null {
  const job = life.job;
  if (!job) return "You have no work.";
  const def = JOBS[job.kind];
  touchLife(g, life);
  const flavour = HARD_DAYS[job.place];
  if (flavour) journal(g, life, g.rng.pick(flavour)!);
  gainXp(g, life, def.main, 4, true);
  gainXp(g, life, def.second, 1.5, true);
  job.worked = (job.worked ?? 0) + 1;
  const boss = bossOf(g.s, life);
  const me = meOf(g.s, life)!;
  if (boss) {
    const ch = g.touchChar(boss);
    ch.memories = ch.memories.filter(
      (m) => !(m.of === me.id && m.why === "Works hard"),
    );
    ch.memories.push({
      of: me.id,
      why: "Works hard",
      value: 8,
      until: g.s.day + 180,
    });
    journal(g, life, `${charName(boss)} noticed.`, "good");
  } else journal(g, life, "Your own work, and it shows.", "good");
  return null;
}

/** Anyone can set their own traplines, if they've no other work. */
export function selfStartCheck(
  s: GameState,
  w: World,
  life: Life,
  kind: JobKind,
): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (!JOBS[kind].selfStart) return no("Someone has to take you on.");
  if (life.job) {
    const title = rankOf(life)?.title.toLowerCase() ?? "something";
    return no(`You work as ${title} already: give it up first.`);
  }
  if (!hasPlace(s, w, life.prov, JOBS[kind].places[0]))
    return no("There's nowhere for that here.");
  return yes;
}

/** A nation's great men who could sign a commission, present or not. */
export function commissionGivers(s: GameState, life: Life): Character[] {
  const job = life.job;
  const me = meOf(s, life);
  if (!job || !me) return [];
  const n = s.nations[job.nation >= 0 ? job.nation : me.nation];
  const out: Character[] = [];
  for (const id of [n?.ruler, n?.council.marshal, life.patron]) {
    const c = id !== undefined && id >= 0 ? s.chars[id] : undefined;
    if (c?.alive && !out.includes(c)) out.push(c);
  }
  return out;
}
