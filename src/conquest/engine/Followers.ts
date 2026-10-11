// LIFE (r11): your own people. Clerks and factors who run trading trips for
// you (while you're elsewhere too), hands, swords for hire, a mate to skipper
// your boat, a native guide, rogues for a band, officers for a company of
// your own. Each is a real character with skills, wages (or a share of the
// take), loyalty and an opinion of you: paid and well led they stay and get
// better; unpaid or badly used they leave, or worse.

import { makeCharacter } from "./Characters";
import { addHeat, addNotoriety } from "./Crime";
import { lawAt } from "./CrimeQueries";
import type { ConquestGame } from "./Game";
import {
  beginOutcome,
  earn,
  endOutcome,
  gainXp,
  journal,
  outcomeMeta,
  spend,
  touchLife,
} from "./LifeCore";
import {
  Check,
  hasPlace,
  isChildLife,
  isPlayed,
  lifeIsNative,
  meOf,
  no,
  npcSkill,
  opinionOf,
  peopleHere,
  skillLevel,
  yes,
} from "./LifeQueries";
import { clanName, NATIVE_CLANS, NATIVE_NAMES } from "./LifeRules";
import type { World } from "./Map";
import { NAMES } from "./Names";
import { wake } from "./Pace";
import { ageOf, charName, enemiesOf, hasTrait } from "./Queries";
import { Rng } from "./Rng";
import type {
  Character,
  Company,
  Follower,
  FollowerKind,
  GameState,
  Life,
  LifeCommand,
  PlaceKind,
  Skill,
  Stat,
} from "./Types";

export interface FollowerKindDef {
  name: string;
  plural: string;
  ranks: string[];
  /** Coins a month at each rank (rogues work for a share instead). */
  wage: number[];
  /** Rogues: their share of the band's take at each rank. */
  share?: number[];
  skill: Skill;
  second: Skill;
  stat: Stat;
  /** Where people of this kind can be hired. */
  where: PlaceKind[];
  text: string;
  /** What they add to a fight (per point of skill). */
  fight: number;
}

export const FOLLOWER_KINDS: Record<FollowerKind, FollowerKindDef> = {
  clerk: {
    name: "Clerk",
    plural: "Clerks and factors",
    ranks: ["Clerk", "Factor", "Supercargo"],
    wage: [3, 4.5, 6.5],
    skill: "trade",
    second: "letters",
    stat: "ste",
    where: ["market", "docks"],
    text: "Runs trading trips with your money, here or far off, while you're elsewhere. Clever ones make you rich; dishonest ones vanish with the stake.",
    fight: 0.3,
  },
  hand: {
    name: "Hand",
    plural: "Hands",
    ranks: ["Hand", "Foreman"],
    wage: [1.5, 2.5],
    skill: "craft",
    second: "fighting",
    stat: "mar",
    where: ["tavern", "fields", "docks"],
    text: "A strong back: carries goods (four more loads each) and stands with you in a scrape.",
    fight: 1,
  },
  sword: {
    name: "Sword",
    plural: "Swords for hire",
    ranks: ["Sellsword", "Veteran", "Lieutenant"],
    wage: [3, 4.5, 6.5],
    skill: "fighting",
    second: "leadership",
    stat: "mar",
    where: ["tavern", "fort"],
    text: "Adventurers and old soldiers who fight beside you: escorts, outlaw hunts, raids and guard duty.",
    fight: 3,
  },
  rogue: {
    name: "Rogue",
    plural: "Your band",
    ranks: ["Cutpurse", "Rogue", "Lieutenant"],
    wage: [0, 0, 0],
    share: [0.1, 0.12, 0.15],
    skill: "stealth",
    second: "fighting",
    stat: "int",
    where: ["den"],
    text: "Rogues who pull jobs for a share of the take: robberies, smuggling runs, protection. The heat they draw is yours, and a rogue who's caught may talk.",
    fight: 2,
  },
  mate: {
    name: "Mate",
    plural: "Mates and skippers",
    ranks: ["Mate", "Skipper", "Captain"],
    wage: [3, 4.5, 6.5],
    skill: "seamanship",
    second: "leadership",
    stat: "mar",
    where: ["docks"],
    text: "Skippers your boat while you're ashore: fishing, trading, whaling or privateering without you.",
    fight: 1.5,
  },
  guide: {
    name: "Guide",
    plural: "Guides",
    ranks: ["Guide", "Scout"],
    wage: [2, 3.5],
    skill: "woodcraft",
    second: "fighting",
    stat: "int",
    where: ["village", "woods", "tavern"],
    text: "Knows the trails: journeys overland go quicker and the road's dangers are fewer. Good with the native peoples.",
    fight: 1.5,
  },
  officer: {
    name: "Officer",
    plural: "Officers",
    ranks: ["Sergeant", "Lieutenant", "Captain"],
    wage: [3, 5, 8],
    skill: "leadership",
    second: "fighting",
    stat: "mar",
    where: ["fort", "tavern"],
    text: "Drills your company and keeps it together: a well-officered company fights better and deserts less.",
    fight: 2,
  },
};

export const FOLLOWER_KIND_ORDER: FollowerKind[] = [
  "clerk",
  "hand",
  "sword",
  "rogue",
  "mate",
  "guide",
  "officer",
];

/** Signing money for someone new. */
export const SIGNING = 2;

export function peopleOf(life: Life): Follower[] {
  return life.people ?? [];
}

/** How many people you can keep: more with leadership, and as a boss. */
export function followerCap(s: GameState, life: Life): number {
  const lead = skillLevel(s, life, "leadership");
  let cap = 2 + Math.floor(lead / 3);
  const job = life.job;
  if (job?.kind === "thief" && job.rank >= 4) cap += 3;
  if (
    (job?.kind === "militia" && job.rank >= 5) ||
    (job?.kind === "soldier" && job.rank >= 4)
  )
    cap += 2;
  if (job?.kind === "pirate" && job.rank >= 3) cap += 3;
  return Math.min(12, cap);
}

/** A follower's skill at their own work. */
export function followerSkill(s: GameState, f: Follower, sk?: Skill): number {
  const c = s.chars[f.c];
  if (!c) return 0;
  const def = FOLLOWER_KINDS[f.kind];
  const k = sk ?? def.skill;
  return Math.min(
    20,
    npcSkill(s, c, k) + (k === def.skill ? 2 + f.rank * 2 : 0),
  );
}

export function followerTitle(f: Follower): string {
  const def = FOLLOWER_KINDS[f.kind];
  return def.ranks[Math.min(f.rank, def.ranks.length - 1)];
}

/** What a follower costs a month, in words. */
export function followerCost(f: Follower): string {
  return f.kind === "rogue"
    ? `${Math.round(f.share * 100)}% of the take`
    : `${f.wage} a month`;
}

/** What they're doing now, in words. */
export function followerDoing(
  g: { map: { provinces: { name: string }[] } },
  f: Follower,
  day: number,
): string {
  const t = f.task;
  if (!t) return "with you";
  const at = g.map.provinces[t.p]?.name ?? "somewhere";
  const left = Math.max(0, t.back - day);
  switch (t.kind) {
    case "trade":
      return `trading out of ${at} with ${t.stake} coins, back in ${left} days${t.repeat ? " (and again)" : ""}`;
    case "job":
      return `on a job (${t.what ?? "robbery"}) at ${at}, back in ${left} days`;
    case "boat":
      return `skippering your boat at ${at}`;
    case "wait":
      return `waiting at ${at}`;
  }
}

/** Their strength in a fight. */
export function fightOf(s: GameState, f: Follower): number {
  return FOLLOWER_KINDS[f.kind].fight * followerSkill(s, f, "fighting");
}

/** Your side's strength in a fight: you, those with you, and your company. */
export function strengthOf(s: GameState, life: Life): number {
  let v =
    skillLevel(s, life, "fighting") * 3 + skillLevel(s, life, "leadership");
  for (const f of peopleOf(life)) if (!f.task) v += fightOf(s, f);
  const co = life.company;
  if (co && co.army < 0 && co.men > 0)
    v += co.men * (0.6 + co.drill) * (0.5 + co.morale / 2);
  return Math.round(v);
}

/** Goods a band of hands can carry beside your own. */
export function extraCarry(life: Life): number {
  return peopleOf(life).filter((f) => !f.task && f.kind === "hand").length * 4;
}

/** A guide with you: quicker overland, fewer bad turns on the road. */
export function guideWithYou(s: GameState, life: Life): Follower | undefined {
  return peopleOf(life).find(
    (f) => !f.task && f.kind === "guide" && s.chars[f.c]?.alive,
  );
}

// ---------------------------------------------------------------- people for hire

export interface Candidate {
  slot: number;
  kind: FollowerKind;
  first: string;
  family: string;
  female: boolean;
  age: number;
  stats: Record<Stat, number>;
  skill: number;
  wage: number;
  share: number;
  /** A line about them. */
  note: string;
}

function hashOf(...xs: number[]): number {
  let h = 2166136261 | 0;
  for (const x of xs) {
    h = Math.imul(h ^ (x | 0), 16777619);
    h ^= h >>> 13;
  }
  return h | 0;
}

const NOTES: Record<FollowerKind, string[]> = {
  clerk: [
    "a neat hand and a long memory",
    "lately with a Bristol house",
    "knows every captain on the coast",
    "honest, they say",
  ],
  hand: [
    "strong as an ox",
    "willing and sober",
    "a good man with a cart",
    "eats for two, works for three",
  ],
  sword: [
    "an old soldier of the Flanders wars",
    "a Scots veteran with a broadsword",
    "a frontiersman with a long rifle",
    "a quiet one with a knife",
  ],
  rogue: [
    "light fingers and lighter morals",
    "knows every back alley",
    "out of the gaol last month",
    "can open any lock",
  ],
  mate: [
    "twenty years before the mast",
    "knows the coast like his hand",
    "lately mate of a Salem schooner",
    "can navigate by the stars",
  ],
  guide: [
    "knows the trails to the western waters",
    "speaks three tongues",
    "never lost in the woods",
    "a hunter of the country",
  ],
  officer: [
    "an old sergeant of the line",
    "a half-pay ensign",
    "a militia captain without a company",
    "a drillmaster",
  ],
};

/** The people for hire at a place this month (the same for everyone). */
export function candidatesAt(
  s: GameState,
  w: World,
  life: Life,
  p: number,
  place: PlaceKind,
): Candidate[] {
  const kinds = FOLLOWER_KIND_ORDER.filter((k) =>
    FOLLOWER_KINDS[k].where.includes(place),
  );
  if (!kinds.length) return [];
  const pr = s.provinces[p];
  const owner = pr.owner >= 0 ? s.nations[pr.owner] : undefined;
  if (!owner) return [];
  const month = Math.floor(s.day / 30);
  const native = owner.kind === "native";
  const rng = new Rng({
    rng: hashOf(
      s.settings.seed,
      p,
      month,
      place.length * 31 + place.charCodeAt(0),
    ),
  });
  const names = native
    ? {
        male: NATIVE_NAMES.male,
        female: NATIVE_NAMES.female,
        family: NATIVE_CLANS.map(clanName),
      }
    : (NAMES[owner.culture] ?? NAMES.english);
  const out: Candidate[] = [];
  const count = 2 + rng.int(0, 2);
  for (let slot = 0; slot < count; slot++) {
    let kind = kinds[rng.int(0, kinds.length - 1)];
    // Natives hire guides and swords; colonists everyone.
    if (native && kind !== "guide" && kind !== "sword" && kind !== "hand")
      kind = "guide";
    const def = FOLLOWER_KINDS[kind];
    const female =
      kind === "clerk" || kind === "guide" || kind === "rogue"
        ? rng.chance(0.2)
        : rng.chance(0.06);
    const stats = {
      dip: rng.int(3, 8),
      mar: rng.int(3, 8),
      ste: rng.int(3, 8),
      int: rng.int(3, 8),
      lea: rng.int(3, 8),
    };
    stats[def.stat] = Math.min(13, stats[def.stat] + rng.int(1, 5));
    const skill = 1 + Math.max(0, stats[def.stat] - 3) + 2;
    const better = skill >= 9 ? 1 : 0;
    const wage = def.wage[0]
      ? Math.round((def.wage[0] + better * 0.8) * 10) / 10
      : 0;
    out.push({
      slot,
      kind,
      first: rng.pick(female ? names.female : names.male)!,
      family: rng.pick(names.family)!,
      female,
      age: rng.int(18, 46),
      stats,
      skill,
      wage,
      share: def.share?.[0] ?? 0,
      note: rng.pick(NOTES[kind])!,
    });
  }
  return out;
}

export function hireCheck(
  s: GameState,
  w: World,
  life: Life,
  place: PlaceKind,
): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (life.crime?.jail) return no("Not from a cell.");
  if (life.travel) return no("You're on the road.");
  if (!hasPlace(s, w, life.prov, place))
    return no("There's no such place here.");
  if (peopleOf(life).length >= followerCap(s, life))
    return no(
      `You can keep ${followerCap(s, life)} people (more with leadership).`,
    );
  return yes;
}

/** Take someone for hire into your service. */
export function hireFollower(
  g: ConquestGame,
  life: Life,
  slot: number,
): string | null {
  const s = g.s;
  const place = life.area;
  if (!place) return "Go into a place first.";
  const check = hireCheck(s, g.w, life, place);
  if (!check.ok) return check.why;
  const cand = candidatesAt(s, g.w, life, life.prov, place).find(
    (c) => c.slot === slot,
  );
  if (!cand) return "They've gone.";
  const key = `people:hired:${life.prov}:${Math.floor(s.day / 30)}:${place}:${slot}`;
  if (life.cooldowns[key]) return "They work for you already.";
  if (life.purse < SIGNING) return `Signing money: ${SIGNING} coins.`;
  const pr = s.provinces[life.prov];
  const owner = s.nations[pr.owner >= 0 ? pr.owner : 0];
  const native = owner.kind === "native";
  const c = makeCharacter(s, g.rng, {
    nation: owner.id,
    culture: owner.culture,
    religion: native ? "native" : owner.religion,
    female: cand.female,
    age: cand.age,
    first: cand.first,
    family: cand.family,
    stats: cand.stats,
  });
  c.home = life.home;
  g.touchChar(c);
  spend(g, life, SIGNING);
  touchLife(g, life).cooldowns[key] = s.day + 40;
  addFollower(g, life, c, cand.kind, cand.wage, cand.share);
  journal(
    g,
    life,
    `${charName(c)} (${cand.note}) signs on as your ${FOLLOWER_KINDS[cand.kind].ranks[0].toLowerCase()}: ${cand.kind === "rogue" ? `${Math.round(cand.share * 100)}% of the take` : `${cand.wage} coins a month`}.`,
    "good",
  );
  return null;
}

function addFollower(
  g: ConquestGame,
  life: Life,
  c: Character,
  kind: FollowerKind,
  wage: number,
  share: number,
): Follower {
  touchLife(g, life);
  life.people ??= [];
  const f: Follower = {
    id: g.nextId(),
    c: c.id,
    kind,
    rank: 0,
    wage,
    share,
    loyalty: 55,
    joined: g.s.day,
    task: null,
  };
  life.people.push(f);
  return f;
}

/** Someone you know who'd join you: grown, unplayed, without a post, and fond enough of you. */
export function recruitCheck(s: GameState, life: Life, c: Character): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (c.id === me.id || !c.alive || c.abroad) return no("Not them.");
  if (isPlayed(s, c.id)) return no("Another player is them.");
  if (ageOf(s, c) < 16) return no("A child.");
  if (peopleOf(life).some((f) => f.c === c.id))
    return no("They're with you already.");
  if (
    c.role &&
    !["soldier", "sailor", "labourer", "youngwarrior"].includes(c.role)
  )
    return no("They have a post of their own.");
  if (
    s.nations.some(
      (n) => n.ruler === c.id || Object.values(n.council).includes(c.id),
    )
  )
    return no("They serve their nation.");
  if (me.spouse === c.id || me.children.includes(c.id))
    return no("Family helps family without wages.");
  if (peopleOf(life).length >= followerCap(s, life))
    return no(
      `You can keep ${followerCap(s, life)} people (more with leadership).`,
    );
  const op = opinionOf(s, c, life).total;
  if (op < 20 && life.ties[c.id] !== "friend")
    return no(`They'd need to like you more (${op} of 20).`);
  return yes;
}

/** The kind of follower someone would make, by what they're best at. */
export function kindFor(s: GameState, c: Character): FollowerKind {
  if (c.role === "sailor") return "mate";
  if (c.role === "soldier") return "sword";
  if (c.role === "youngwarrior") return "sword";
  const best = (
    [
      "trade",
      "fighting",
      "seamanship",
      "woodcraft",
      "stealth",
      "leadership",
    ] as Skill[]
  )
    .map((sk) => [sk, npcSkill(s, c, sk)] as const)
    .sort((a, b) => b[1] - a[1])[0][0];
  switch (best) {
    case "trade":
      return "clerk";
    case "seamanship":
      return "mate";
    case "woodcraft":
      return "guide";
    case "stealth":
      return "rogue";
    case "leadership":
      return "officer";
    default:
      return "sword";
  }
}

export function recruit(
  g: ConquestGame,
  life: Life,
  cId: number,
  kind?: FollowerKind,
): string | null {
  const s = g.s;
  const c = s.chars[cId];
  if (!c) return "Nobody.";
  if (!peopleHere(s, life.prov, life).some((x) => x.id === cId))
    return "They're not here.";
  const check = recruitCheck(s, life, c);
  if (!check.ok) return check.why;
  const k = kind && FOLLOWER_KINDS[kind] ? kind : kindFor(s, c);
  const def = FOLLOWER_KINDS[k];
  const f = addFollower(
    g,
    life,
    g.touchChar(c),
    k,
    def.wage[0],
    def.share?.[0] ?? 0,
  );
  f.loyalty = 70;
  if (c.role) {
    // The common folk leave their place to follow you.
    const list = s.locals[c.home ?? life.prov];
    if (list?.includes(c.id)) {
      s.locals[c.home ?? life.prov] = list.filter((x) => x !== c.id);
      g.localsChanged(c.home ?? life.prov);
    }
    delete g.touchChar(c).role;
  }
  c.home = life.home;
  journal(
    g,
    life,
    `${charName(c)} throws in with you, as your ${def.ranks[0].toLowerCase()}.`,
    "good",
  );
  return null;
}

// ---------------------------------------------------------------- what they do

/** Send a clerk trading with a stake from your purse. */
export function sendTrading(
  g: ConquestGame,
  life: Life,
  id: number,
  stake: number,
  repeat: boolean,
): string | null {
  const f = peopleOf(life).find((x) => x.id === id);
  if (!f) return "Not one of your people.";
  if (f.kind !== "clerk") return "Only clerks and factors trade for you.";
  if (f.task) return "They're busy.";
  if (!Number.isFinite(stake) || stake < 10)
    return "A stake of 10 coins at least.";
  if (life.purse < stake) return `You have ${Math.floor(life.purse)} coins.`;
  if (life.travel) return "Not from the road.";
  spend(g, life, stake);
  const days = 30 + g.rng.int(0, 30);
  touchLife(g, life);
  f.task = {
    kind: "trade",
    p: life.prov,
    back: g.s.day + days,
    stake: Math.round(stake),
    repeat,
  };
  journal(
    g,
    life,
    `${charName(g.s.chars[f.c])} sets out trading with ${Math.round(stake)} coins of yours: back in about ${days} days.`,
  );
  return null;
}

/** Send your band (or one rogue) on a job. */
export function sendJob(
  g: ConquestGame,
  life: Life,
  what: string,
): string | null {
  const band = peopleOf(life).filter((f) => f.kind === "rogue" && !f.task);
  if (!band.length) return "You have no rogues free.";
  if (!["robbery", "smuggling", "protection"].includes(what))
    return "No such job.";
  if (life.travel) return "Not from the road.";
  if (what === "smuggling" && !g.map.provinces[life.prov].coastal)
    return "Smuggling runs go from the coast.";
  const s = g.s;
  const back = s.day + 10 + g.rng.int(0, 10);
  touchLife(g, life);
  for (const f of band) f.task = { kind: "job", p: life.prov, back, what };
  journal(
    g,
    life,
    `Your band goes out on a ${what === "protection" ? "round of protection" : what === "smuggling" ? "smuggling run" : "robbery"}: ${band.length} of them.`,
  );
  return null;
}

/** Recall someone from what they're doing (a trading stake comes back as it is). */
export function recall(g: ConquestGame, life: Life, id: number): string | null {
  const f = peopleOf(life).find((x) => x.id === id);
  if (!f?.task) return "They're with you.";
  touchLife(g, life);
  if (f.task.kind === "trade") {
    f.task.repeat = false;
    return null;
  }
  if (f.task.kind === "boat") {
    for (const b of life.boats ?? [])
      if (b.away?.skipper === f.id) b.away = null;
  }
  f.task = null;
  return null;
}

export function dismiss(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const f = peopleOf(life).find((x) => x.id === id);
  if (!f) return "Not one of your people.";
  if (f.task?.kind === "trade") return "Wait until they're back from trading.";
  touchLife(g, life);
  life.people = peopleOf(life).filter((x) => x !== f);
  for (const b of life.boats ?? []) if (b.away?.skipper === f.id) b.away = null;
  const c = g.s.chars[f.c];
  journal(
    g,
    life,
    `You let ${charName(c)} go${f.owed ? ", their wages still owing" : ""}.`,
  );
  return null;
}

export function promoteCheck(s: GameState, f: Follower): Check {
  const def = FOLLOWER_KINDS[f.kind];
  if (f.rank >= def.ranks.length - 1) return no("As high as they go.");
  const need = 3 * (f.rank + 1);
  if ((f.deeds ?? 0) < need)
    return no(`They've done ${f.deeds ?? 0} of ${need} things worth it.`);
  return yes;
}

export function promoteFollower(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const f = peopleOf(life).find((x) => x.id === id);
  if (!f) return "Not one of your people.";
  const check = promoteCheck(g.s, f);
  if (!check.ok) return check.why;
  touchLife(g, life);
  f.rank++;
  const def = FOLLOWER_KINDS[f.kind];
  f.wage = def.wage[f.rank] ?? f.wage;
  f.share = def.share?.[f.rank] ?? f.share;
  f.loyalty = Math.min(100, f.loyalty + 15);
  journal(
    g,
    life,
    `${charName(g.s.chars[f.c])} is your ${def.ranks[f.rank].toLowerCase()} now.`,
    "good",
  );
  return null;
}

/** A coin or two over their wages: loyalty bought, honestly. */
export function bonus(g: ConquestGame, life: Life, id: number): string | null {
  const f = peopleOf(life).find((x) => x.id === id);
  if (!f) return "Not one of your people.";
  const cost = Math.max(2, Math.round(f.wage || 3));
  if (life.purse < cost) return `Costs ${cost} coins.`;
  if ((life.cooldowns[`people:bonus:${id}`] ?? 0) > g.s.day)
    return "You gave them something lately.";
  spend(g, life, cost);
  touchLife(g, life).cooldowns[`people:bonus:${id}`] = g.s.day + 60;
  f.loyalty = Math.min(100, f.loyalty + 12);
  f.owed = 0;
  return null;
}

// ---------------------------------------------------------------- a company of your own

export const COMPANY_PAY: Record<Company["kind"], number> = {
  militia: 0.25,
  rangers: 0.35,
  regulars: 0.45,
  warriors: 0.15,
};
/** Bounty per man raised. */
export const COMPANY_BOUNTY = 2;
export const COMPANY_MAX = 600;

/** Whether you may raise a company: an officer, a war leader, or a famous captain of adventurers. */
export function raiseCheck(s: GameState, life: Life): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (life.company) return no("You have a company already.");
  if (life.travel) return no("Not from the road.");
  if (life.crime?.jail) return no("Not from a cell.");
  const job = life.job;
  const ok =
    (job?.kind === "militia" && job.rank >= 5) ||
    (job?.kind === "soldier" && job.rank >= 4) ||
    (job?.kind === "warrior" && job.rank >= 2) ||
    life.renown >= 40;
  if (!ok)
    return no(
      "Only a militia captain, an army captain, a war leader, or someone with renown 40 can raise a company.",
    );
  const pr = s.provinces[life.prov];
  if (pr.owner !== me.nation || pr.occupier >= 0)
    return no("Raise men among your own people.");
  if (life.purse < 20 * COMPANY_BOUNTY)
    return no(`Bounties for twenty men: ${20 * COMPANY_BOUNTY} coins.`);
  return yes;
}

export function raiseCompany(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const check = raiseCheck(s, life);
  if (!check.ok) return check.why;
  const me = meOf(s, life)!;
  const native = lifeIsNative(s, life);
  const job = life.job;
  const kind: Company["kind"] = native
    ? "warriors"
    : job?.kind === "soldier"
      ? "regulars"
      : job?.kind === "militia"
        ? "militia"
        : "rangers";
  spend(g, life, 20 * COMPANY_BOUNTY);
  touchLife(g, life).company = {
    name: native
      ? `${me.first}'s war party`
      : `${me.family}'s ${kind === "rangers" ? "Rangers" : "Company"}`,
    kind,
    men: 20,
    drill: kind === "regulars" ? 0.5 : 0.3,
    morale: 0.7,
    raised: s.day,
    army: -1,
  };
  journal(
    g,
    life,
    `You beat the drum at ${g.map.provinces[life.prov].name}: twenty men take your bounty and your name.`,
    "good",
  );
  return null;
}

/** Twenty more men, if the country has them. */
export function recruitMen(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const co = life.company;
  if (!co) return "You have no company.";
  if (co.army >= 0) return "Not while they're in the field.";
  if (co.men >= COMPANY_MAX) return "As many men as you can lead.";
  const me = meOf(s, life)!;
  const pr = s.provinces[life.prov];
  if (pr.owner !== me.nation) return "Raise men among your own people.";
  const cost = 20 * COMPANY_BOUNTY;
  if (life.purse < cost) return `Bounties for twenty men: ${cost} coins.`;
  if ((life.cooldowns["company:recruit"] ?? 0) > s.day)
    return "The country's been drained of willing men lately.";
  spend(g, life, cost);
  touchLife(g, life).cooldowns["company:recruit"] = s.day + 20;
  co.men += 20;
  co.drill = Math.max(0.2, co.drill - 0.05);
  journal(g, life, "Twenty more men take your bounty.");
  return null;
}

/** The company marches as an army of your nation, under you: the war engine takes it from there. */
export function takeTheField(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const co = life.company;
  const me = meOf(s, life);
  if (!co || !me) return "You have no company.";
  if (co.army >= 0) return "They're in the field already.";
  if (life.travel) return "Not from the road.";
  if (s.armies.some((a) => a.commander === me.id))
    return "You command an army already.";
  if (co.men < 10) return "Too few men to take the field.";
  const nation =
    life.job?.nation !== undefined && life.job.nation >= 0
      ? life.job.nation
      : me.nation;
  const n = s.nations[nation];
  if (!n?.alive) return "Your nation is gone.";
  const type =
    co.kind === "warriors"
      ? "warriors"
      : co.kind === "regulars"
        ? "regulars"
        : "militia";
  const army = g.addArmy({
    id: g.nextId(),
    owner: nation,
    prov: life.prov,
    regs: [
      { type, men: co.men, morale: Math.max(0.2, co.morale), home: life.prov },
    ],
    path: [],
    depart: -1,
    arrive: -1,
    sea: false,
    retreating: false,
    arrived: s.day,
    from: -1,
    commander: me.id,
    supply: 1,
  });
  touchLife(g, life);
  co.army = army.id;
  journal(
    g,
    life,
    `${co.name} takes the field under you: ${co.men} men. March them from the army's page (Affairs): where there's war, they fight and besiege like any army.`,
    "good",
  );
  return null;
}

/** Bring the company home from the field: what's left of it. */
export function standDown(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const co = life.company;
  if (!co || co.army < 0) return "Your company isn't in the field.";
  const a = s.armies.find((x) => x.id === co.army);
  touchLife(g, life);
  if (a) {
    if (a.depart >= 0) return "Halt them first.";
    co.men = Math.round(a.regs.reduce((m, r) => m + r.men, 0));
    co.morale = a.regs.length
      ? a.regs.reduce((m, r) => m + r.morale, 0) / a.regs.length
      : co.morale;
    g.removeArmy(a);
  }
  co.army = -1;
  journal(g, life, `${co.name} stands down: ${co.men} men come home.`);
  return null;
}

export function disband(g: ConquestGame, life: Life): string | null {
  const co = life.company;
  if (!co) return "You have no company.";
  if (co.army >= 0) return "Stand them down first.";
  touchLife(g, life).company = null;
  journal(g, life, `You pay off ${co.name} and send the men home.`);
  return null;
}

// ---------------------------------------------------------------- the months

/** Wages, loyalty, trading trips and band jobs coming home, a company kept. */
export function peopleMonthly(g: ConquestGame, life: Life): void {
  const s = g.s;
  const list = peopleOf(life);
  if (list.length) {
    touchLife(g, life);
    let owed = 0;
    for (const f of [...list]) {
      const c = s.chars[f.c];
      if (!c?.alive || c.abroad) {
        life.people = peopleOf(life).filter((x) => x !== f);
        journal(
          g,
          life,
          `${charName(c)}, your ${followerTitle(f).toLowerCase()}, is dead.`,
          "bad",
        );
        wake(g, life, `${charName(c)} is dead.`);
        continue;
      }
      if (f.wage > 0) {
        if (life.purse >= f.wage) {
          spend(g, life, f.wage);
          f.owed = 0;
          f.loyalty = Math.min(100, f.loyalty + 2);
        } else {
          owed++;
          f.owed = (f.owed ?? 0) + 1;
          f.loyalty = Math.max(0, f.loyalty - 15);
        }
      }
      const op = opinionOf(s, c, life).total;
      f.loyalty = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            f.loyalty +
              op / 25 +
              (hasTrait(c, "honest") ? 1 : 0) -
              (hasTrait(c, "deceitful") ? 1 : 0),
          ),
        ),
      );
      if (f.kind === "rogue") {
        const heat = Object.values(life.crime?.heat ?? {}).reduce(
          (m, v) => Math.max(m, v),
          0,
        );
        if (heat > 50) f.loyalty = Math.max(0, f.loyalty - 3);
      }
      if ((f.owed ?? 0) >= 2 || (f.loyalty < 15 && g.rng.chance(0.3))) {
        leave(g, life, f, (f.owed ?? 0) >= 2 ? "unpaid" : "disloyal");
        continue;
      }
    }
    if (owed)
      journal(
        g,
        life,
        `You couldn't pay ${owed} of your people this month. They're talking.`,
        "bad",
      );
  }
  companyMonthly(g, life);
}

function leave(
  g: ConquestGame,
  life: Life,
  f: Follower,
  why: "unpaid" | "disloyal",
): void {
  const s = g.s;
  const c = s.chars[f.c];
  touchLife(g, life);
  life.people = peopleOf(life).filter((x) => x !== f);
  for (const b of life.boats ?? []) if (b.away?.skipper === f.id) b.away = null;
  // A rogue with a grudge sells you to the watch.
  if (f.kind === "rogue" && why === "disloyal" && g.rng.chance(0.4)) {
    addHeat(g, life, lawAt(s, life.prov), 35);
    journal(
      g,
      life,
      `${charName(c)} has left the band, and gone straight to the constable with your name.`,
      "bad",
    );
    wake(g, life, `${charName(c)} has betrayed you to the watch.`);
    return;
  }
  journal(
    g,
    life,
    `${charName(c)} has left your service${why === "unpaid" ? ": no wages, no work" : ""}.`,
    "bad",
  );
  wake(g, life, `${charName(c)} has left your service.`);
}

/** The company's month: pay, drill, morale, deserters; in the field, the army's fate. */
function companyMonthly(g: ConquestGame, life: Life): void {
  const s = g.s;
  const co = life.company;
  if (!co) return;
  touchLife(g, life);
  if (co.army >= 0) {
    const a = s.armies.find((x) => x.id === co.army);
    if (!a) {
      journal(g, life, `${co.name} is no more: broken in the field.`, "bad");
      wake(g, life, `${co.name} has been destroyed.`);
      life.company = null;
      return;
    }
    co.men = Math.round(a.regs.reduce((m, r) => m + r.men, 0));
  }
  const pay = Math.round(co.men * COMPANY_PAY[co.kind] * 10) / 10;
  // In the field in wartime, the colony takes the company into its pay,
  // with an allowance for its captain.
  const field = co.army >= 0 ? s.armies.find((x) => x.id === co.army) : null;
  const crown = field ? s.nations[field.owner] : null;
  const inPay =
    !!field &&
    !!crown &&
    enemiesOf(s, field.owner).length > 0 &&
    crown.gold >= pay + 3 + co.men * 0.05;
  if (inPay !== !!co.inPay) {
    journal(
      g,
      life,
      inPay
        ? `${crown!.name} takes ${co.name} into its pay while the war lasts, with a captain's allowance for you.`
        : `${co.name} is off the colony's pay: the wages are yours again.`,
      inPay ? "good" : undefined,
    );
    if (inPay) co.inPay = true;
    else delete co.inPay;
  }
  if (inPay) {
    const allowance = Math.round((3 + co.men * 0.05) * 10) / 10;
    g.nation(field!.owner).gold -= Math.round((pay + allowance) * 10) / 10;
    earn(g, life, allowance);
    co.owed = 0;
    co.morale = Math.min(1, co.morale + 0.05);
  } else if (life.purse >= pay) {
    spend(g, life, pay);
    co.owed = 0;
    co.morale = Math.min(1, co.morale + 0.05);
  } else {
    co.owed = (co.owed ?? 0) + 1;
    co.morale = Math.max(0, co.morale - 0.2);
    const gone = Math.round(co.men * 0.25);
    co.men -= gone;
    journal(g, life, `No pay for ${co.name}: ${gone} men desert.`, "bad");
    if ((co.owed ?? 0) >= 3 || co.men < 5) {
      if (co.army >= 0) {
        const a = s.armies.find((x) => x.id === co.army);
        if (a) g.removeArmy(a);
      }
      life.company = null;
      journal(g, life, "Your company has melted away.", "bad");
      wake(g, life, "Your company has melted away.");
      return;
    }
  }
  if (co.army < 0) {
    const officers = peopleOf(life).filter(
      (f) => f.kind === "officer" && !f.task,
    ).length;
    co.drill = Math.min(
      1,
      Math.round((co.drill + 0.03 + officers * 0.02) * 100) / 100,
    );
  } else {
    const a = s.armies.find((x) => x.id === co.army);
    if (a)
      for (const r of a.regs) r.morale = Math.max(r.morale, co.morale * 0.8);
  }
}

/** Each day: trading trips and band jobs come home. */
export function peopleDaily(g: ConquestGame, life: Life): void {
  const s = g.s;
  for (const f of [...peopleOf(life)]) {
    const t = f.task;
    if (!t || t.back > s.day) continue;
    if (t.kind === "trade") tradeHome(g, life, f);
    else if (t.kind === "job") jobHome(g, life, f);
  }
}

const TRADE_LUCK = [
  { p: 0.08, x: 0, text: "lost: robbed on the road, or the cargo went down" },
  { p: 0.22, x: 0.85, text: "sold into a poor market" },
  { p: 0.48, x: 1.22, text: "a fair trip" },
  { p: 0.22, x: 1.6, text: "a rich trip" },
];

function tradeHome(g: ConquestGame, life: Life, f: Follower): void {
  const s = g.s;
  const t = f.task!;
  const c = s.chars[f.c];
  const stake = t.stake ?? 0;
  touchLife(g, life);
  f.task = null;
  // A disloyal clerk keeps the money.
  if (f.loyalty < 25 && g.rng.chance(0.35)) {
    life.people = peopleOf(life).filter((x) => x !== f);
    journal(
      g,
      life,
      `${charName(c)} never came back from trading, and neither did your ${stake} coins.`,
      "bad",
    );
    wake(g, life, `${charName(c)} has run off with your money.`);
    return;
  }
  const skill = followerSkill(s, f);
  const war = s.wars.some((w) => w.a === c?.nation || w.b === c?.nation);
  let roll = g.rng.next() - Math.min(0.15, skill * 0.012);
  if (war) roll += 0.05;
  let pick = TRADE_LUCK[TRADE_LUCK.length - 1];
  for (const luck of TRADE_LUCK) {
    if (roll < luck.p) {
      pick = luck;
      break;
    }
    roll -= luck.p;
  }
  const back = Math.round(stake * pick.x * 10) / 10;
  if (back > 0) earn(g, life, back);
  f.deeds = (f.deeds ?? 0) + (back > stake ? 1 : 0);
  f.loyalty = Math.max(0, Math.min(100, f.loyalty + (back > stake ? 3 : -2)));
  journal(
    g,
    life,
    `${charName(c)} is back from trading: ${pick.text}. ${back > 0 ? `${back} coins from your ${stake}.` : `Your ${stake} coins are gone.`}`,
    back >= stake ? "good" : "bad",
  );
  gainXp(g, life, "trade", 4);
  if (t.repeat && back >= 10) {
    const again = Math.min(back, stake);
    spend(g, life, again);
    f.task = {
      kind: "trade",
      p: t.p,
      back: s.day + 30 + g.rng.int(0, 30),
      stake: Math.round(again),
      repeat: true,
    };
  } else if (t.repeat) {
    journal(
      g,
      life,
      `${charName(c)} waits for a new stake before going out again.`,
    );
  }
}

function jobHome(g: ConquestGame, life: Life, f: Follower): void {
  const s = g.s;
  const t = f.task!;
  const band = peopleOf(life).filter(
    (x) =>
      x.kind === "rogue" &&
      x.task?.kind === "job" &&
      x.task.back === t.back &&
      x.task.what === t.what,
  );
  touchLife(g, life);
  for (const x of band) x.task = null;
  const skill = band.reduce((m, x) => m + followerSkill(s, x), 0);
  const nation = lawAt(s, t.p);
  const base = t.what === "protection" ? 1.5 : t.what === "smuggling" ? 2.5 : 2;
  const take = Math.round(
    (base * band.length + skill * 0.25) * (0.5 + g.rng.next()),
  );
  const shares = band.reduce((m, x) => m + x.share, 0);
  const mine = Math.round(take * Math.max(0.3, 1 - shares) * 10) / 10;
  earn(g, life, mine);
  addHeat(g, life, nation, 4 + band.length * 2);
  addNotoriety(g, life, 1);
  for (const x of band) {
    x.deeds = (x.deeds ?? 0) + 1;
    x.loyalty = Math.min(100, x.loyalty + 2);
  }
  journal(
    g,
    life,
    `Your band is back from the ${t.what}: ${take} coins taken, ${mine} of them yours.`,
    "good",
  );
  // Someone's caught: they may talk.
  if (g.rng.chance(0.12)) {
    const caught = band[g.rng.int(0, band.length - 1)];
    const c = s.chars[caught.c];
    life.people = peopleOf(life).filter((x) => x !== caught);
    if (caught.loyalty < 45 && g.rng.chance(0.5)) {
      addHeat(g, life, nation, 30);
      journal(
        g,
        life,
        `${charName(c)} was taken by the watch, and gave them your name to save their neck.`,
        "bad",
      );
    } else
      journal(
        g,
        life,
        `${charName(c)} was taken by the watch, and said nothing. They'll hang, or be transported.`,
        "bad",
      );
    wake(g, life, `${charName(c)} was taken by the watch.`);
  }
}

// ---------------------------------------------------------------- commands

export function peopleCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "people") return undefined;
  if (isChildLife(g.s, life)) return "Not as a child.";
  const run = (): string | null => {
    switch (c.act) {
      case "hire":
        return hireFollower(g, life, c.arg ?? -1);
      case "recruit":
        return recruit(g, life, c.c ?? -1, c.kind as FollowerKind | undefined);
      case "trade":
        return sendTrading(g, life, c.id ?? -1, c.arg ?? 0, false);
      case "trade-again":
        return sendTrading(g, life, c.id ?? -1, c.arg ?? 0, true);
      case "job":
        return sendJob(g, life, c.kind ?? "robbery");
      case "recall":
        return recall(g, life, c.id ?? -1);
      case "dismiss":
        return dismiss(g, life, c.id ?? -1);
      case "promote":
        return promoteFollower(g, life, c.id ?? -1);
      case "bonus":
        return bonus(g, life, c.id ?? -1);
      case "raise":
        return raiseCompany(g, life);
      case "men":
        return recruitMen(g, life);
      case "field":
        return takeTheField(g, life);
      case "standdown":
        return standDown(g, life);
      case "disband":
        return disband(g, life);
      default:
        return "Unknown.";
    }
  };
  const showy =
    c.act === "hire" ||
    c.act === "recruit" ||
    c.act === "raise" ||
    c.act === "field";
  if (!showy) return run();
  beginOutcome(g, life);
  let err: string | null = null;
  try {
    outcomeMeta(g, life, {
      key: `people-${c.act}`,
      title:
        c.act === "raise"
          ? "Raising a company"
          : c.act === "field"
            ? "Taking the field"
            : "Into your service",
      scene:
        c.act === "field" || c.act === "raise"
          ? "fort"
          : (life.area ?? "tavern"),
      c: c.c ?? -1,
      ok: null,
    });
    err = run();
    if (!err && c.act === "hire") {
      const last = peopleOf(life)[peopleOf(life).length - 1];
      if (last) outcomeMeta(g, life, { c: last.c });
    }
  } finally {
    endOutcome(g, life, "person", err !== null);
  }
  return err;
}
