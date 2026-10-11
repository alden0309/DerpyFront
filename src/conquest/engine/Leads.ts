// Leads: the stories that go round the colonies. Gold in the creeks of the
// back country, a galleon on the reef, a lost Spanish mine, Captain Kidd's
// chest, cheap land on the frontier, a ship short of hands, a reward for a
// highwayman, a valley thick with beaver, a pearl bed, a contested will, a
// healing spring. Each points at a real place. Some are true.
//
// You hear them in the gazette (better checked, so truer) or over a pot at
// the tavern (anything goes). Go there and work the lead (prospect, pan,
// mine, dive, dig, search, survey): it takes days, some coins, your skill,
// and a little courage. Whether a story is true is settled the first time
// anyone looks properly; a true strike can set off a rush, with prices and
// people pouring in, and others who heard the same story come to take
// their share.

import { reveal } from "./Fog";
import type { ConquestGame } from "./Game";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  heal,
  hurt,
  journal,
  spend,
  touchLife,
} from "./LifeCore";
import { raiseLifeEvent } from "./LifeEvents";
import { carried, CARRY, skillLevel } from "./LifeQueries";
import { checkChance, LAND_LOT } from "./LifeRules";
import { kmBetween, type World } from "./Map";
import { priceView, shockMarket } from "./Markets";
import { buyLand, landCheck } from "./Property";
import { settlers } from "./Queries";
import { heardHere, rumour, RUMOUR_KM_PER_DAY } from "./Rumours";
import { settlerPops } from "./Setup";
import type {
  GameState,
  LeadAct,
  LeadKind,
  Life,
  LifeLead,
  Skill,
  WorldLead,
} from "./Types";
import { worldRng } from "./WorldRng";

// ---------------------------------------------------------------- the kinds

export interface LeadActDef {
  label: string;
  days: number;
  cost: number;
  skill: Skill;
  dc: number;
  /** Chance of getting hurt each time. */
  risk: number;
  /** Share of what's left that a good day's work finds. */
  share: [number, number];
  text: string;
}

export const LEAD_ACTS: Record<LeadAct, LeadActDef> = {
  prospect: {
    label: "Prospect",
    days: 10,
    cost: 4,
    skill: "woodcraft",
    dc: 10,
    risk: 0.05,
    share: [0.2, 0.35],
    text: "Ten days with a pick and a pan along the creeks and outcrops.",
  },
  pan: {
    label: "Pan the creeks",
    days: 7,
    cost: 1.5,
    skill: "woodcraft",
    dc: 8,
    risk: 0.02,
    share: [0.08, 0.16],
    text: "A week knee-deep in cold water, swirling gravel. Slow, but safe.",
  },
  mine: {
    label: "Mine the claim",
    days: 20,
    cost: 12,
    skill: "craft",
    dc: 11,
    risk: 0.07,
    share: [0.25, 0.45],
    text: "Hire two hands, buy powder and timber, and go into the hill.",
  },
  dive: {
    label: "Dive",
    days: 6,
    cost: 5,
    skill: "seamanship",
    dc: 11,
    risk: 0.08,
    share: [0.25, 0.45],
    text: "Hire a boat and men who can hold their breath.",
  },
  dig: {
    label: "Dig",
    days: 5,
    cost: 2,
    skill: "letters",
    dc: 10,
    risk: 0.02,
    share: [0.6, 1],
    text: "Read the old map right, pace it out, and dig where it says.",
  },
  search: {
    label: "Search",
    days: 7,
    cost: 3,
    skill: "persuasion",
    dc: 9,
    risk: 0.03,
    share: [0.5, 1],
    text: "Ask around, follow the trail, see for yourself.",
  },
  survey: {
    label: "Survey",
    days: 8,
    cost: 3,
    skill: "woodcraft",
    dc: 9,
    risk: 0.02,
    share: [0.4, 0.8],
    text: "Walk the country with a compass and a notebook.",
  },
};

interface LeadDef {
  kind: LeadKind;
  title: string;
  /** Ways to work it, before anything's found. */
  acts: LeadAct[];
  /** Overrides for an act's label, skill and difficulty for this kind. */
  tune?: Partial<Record<LeadAct, Partial<LeadActDef>>>;
  where: (s: GameState, w: World, p: number) => boolean;
  /** Chance a story of this kind is true. */
  odds: (s: GameState, w: World, p: number) => number;
  worth: [number, number];
  /** How long it's talked about, in days. */
  days: number;
  weight: number;
  says: ((place: string, name: string) => string)[];
  /** A metal strike: can set off a rush. */
  boom?: boolean;
}

const owned = (s: GameState, p: number, kind: "power" | "native") =>
  s.provinces[p].owner >= 0 && s.nations[s.provinces[p].owner].kind === kind;
const caribbean = (w: World, p: number) => {
  const d = w.map.provinces[p];
  return d.lat < 30 && d.lon > -98;
};
const high = (w: World, p: number) =>
  w.map.provinces[p].terrain === "hills" ||
  w.map.provinces[p].terrain === "mountains";

const SHIPS = [
  "Nuestra Señora de la Concepción",
  "San Pedro",
  "Santa Margarita",
  "Atocha's sister",
  "Whydah",
  "Golden Hind's tender",
  "Sea Venture",
  "Fortuyn",
  "Saint-Esprit",
  "Henrietta Marie",
];
const OUTLAWS = [
  "Black Tom Reddy",
  "Gentleman Jack Sharpe",
  "Mad Peg Coolidge",
  "the Harpe brothers",
  "Silas Wren",
  "Long Ben Ashby",
  "Ezekiel Crane",
  "Molly Raike",
];
const CAPTAINS = [
  "Kidd",
  "Blackbeard",
  "Morgan",
  "Vane",
  "Bonnet",
  "Avery",
  "Low",
];

export const LEAD_DEFS: Record<LeadKind, LeadDef> = {
  gold: {
    kind: "gold",
    title: "Gold in the hills",
    acts: ["pan", "prospect"],
    where: (s, w, p) => high(w, p) && w.map.provinces[p].lat < 42,
    odds: (s, w, p) => (w.raw[p] === "silver" ? 0.4 : 0.22),
    worth: [80, 420],
    days: 540,
    weight: 3,
    boom: true,
    says: [
      (x) =>
        `A trapper came down from ${x} with a nugget the size of his thumb.`,
      (x) =>
        `There's gold in the creeks above ${x}, they say: colour in every pan.`,
      (x) =>
        `An old man swears his grandfather found gold at ${x} and never went back for it.`,
    ],
  },
  silver: {
    kind: "silver",
    title: "A silver lode",
    acts: ["prospect"],
    where: (s, w, p) => high(w, p) || w.raw[p] === "silver",
    odds: (s, w, p) => (w.raw[p] === "silver" ? 0.6 : 0.14),
    worth: [100, 500],
    days: 540,
    weight: 3,
    boom: true,
    says: [
      (x) => `Assayers in town are excited about ore brought down from ${x}.`,
      (x) => `A vein of silver shows white in a stream bed at ${x}, they say.`,
    ],
  },
  wreck: {
    kind: "wreck",
    title: "A wreck with cargo",
    acts: ["dive", "search"],
    tune: { search: { label: "Comb the shore", skill: "seamanship", dc: 9 } },
    where: (s, w, p) =>
      w.map.provinces[p].coastal &&
      (caribbean(w, p) || w.map.provinces[p].lat < 37),
    odds: () => 0.45,
    worth: [60, 320],
    days: 365,
    weight: 3,
    says: [
      (x, n) =>
        `The ${n} went down off ${x} in the last blow, with cargo still aboard.`,
      (x, n) =>
        `Fishermen at ${x} have pulled up coins: the ${n} lies there, they say.`,
    ],
  },
  mine: {
    kind: "mine",
    title: "A lost mine",
    acts: ["search"],
    tune: {
      search: { label: "Look for the old shaft", skill: "woodcraft", dc: 12 },
    },
    where: (s, w, p) =>
      w.map.provinces[p].terrain === "mountains" ||
      (high(w, p) && w.map.provinces[p].lon < -100),
    odds: () => 0.12,
    worth: [160, 600],
    days: 720,
    weight: 1.5,
    boom: true,
    says: [
      (x) =>
        `The Spaniards worked a silver mine at ${x} before the natives drove them out. Nobody has found the shaft since.`,
      (x) =>
        `A dying prospector drew a map to a mine at ${x}. The map is going round the taverns.`,
    ],
  },
  treasure: {
    kind: "treasure",
    title: "Buried treasure",
    acts: ["dig"],
    where: (s, w, p) =>
      w.map.provinces[p].coastal &&
      (caribbean(w, p) || w.map.provinces[p].areaKm2 < 40000),
    odds: () => 0.1,
    worth: [90, 500],
    days: 540,
    weight: 1.5,
    says: [
      (x, n) =>
        `Captain ${n} buried a chest at ${x}, and never came back for it.`,
      (x, n) =>
        `A sailor who sailed with ${n} is selling a map of ${x}, with an X on it.`,
    ],
  },
  land: {
    kind: "land",
    title: "Cheap land",
    acts: ["survey"],
    tune: { survey: { label: "See the surveyor", skill: "letters", dc: 7 } },
    where: (s, w, p) => owned(s, p, "power") && settlers(s.provinces[p]) < 1800,
    odds: () => 0.75,
    worth: [20, 40],
    days: 240,
    weight: 2,
    says: [
      (x) =>
        `The proprietors are granting land cheap at ${x} to anyone who'll settle it.`,
      (x) =>
        `Good bottomland going for half the usual at ${x}, if you're quick.`,
    ],
  },
  crew: {
    kind: "crew",
    title: "A ship needs hands",
    acts: ["search"],
    tune: {
      search: {
        label: "Sign on",
        skill: "seamanship",
        dc: 6,
        days: 30,
        cost: 0,
        risk: 0.06,
      },
    },
    where: (s, w, p) =>
      owned(s, p, "power") && (s.provinces[p].b.port ?? 0) > 0,
    odds: () => 0.85,
    worth: [18, 60],
    days: 90,
    weight: 2,
    says: [
      (x, n) =>
        `The ${n} at ${x} is short of hands and paying a bounty to sign.`,
      (x) =>
        `A privateer fitting out at ${x} wants men, shares of the prizes promised.`,
    ],
  },
  outlaw: {
    kind: "outlaw",
    title: "A price on a head",
    acts: ["search"],
    tune: {
      search: { label: "Hunt him down", skill: "fighting", dc: 12, risk: 0.12 },
    },
    where: (s, w, p) => owned(s, p, "power"),
    odds: () => 0.85,
    worth: [25, 90],
    days: 240,
    weight: 2,
    says: [
      (x, n) =>
        `${n} has robbed the post road near ${x} three times. The governor offers a reward.`,
      (x, n) => `Wanted, dead or alive: ${n}, last seen near ${x}.`,
    ],
  },
  furs: {
    kind: "furs",
    title: "A valley thick with beaver",
    acts: ["survey"],
    tune: { survey: { label: "Scout the valley", skill: "woodcraft", dc: 10 } },
    where: (s, w, p) =>
      !owned(s, p, "power") &&
      (w.raw[p] === "furs" || w.northern[p]) &&
      !w.map.provinces[p].closed,
    odds: () => 0.5,
    worth: [50, 200],
    days: 360,
    weight: 2,
    says: [
      (x) =>
        `A voyageur says the streams at ${x} are dammed every hundred yards: beaver nobody's trapped.`,
      (x) => `Furs are thick as moss in the valleys of ${x}, the Indians say.`,
    ],
  },
  pearls: {
    kind: "pearls",
    title: "A pearl bed",
    acts: ["dive"],
    where: (s, w, p) => w.map.provinces[p].coastal && w.tropical[p],
    odds: () => 0.35,
    worth: [60, 340],
    days: 360,
    weight: 1.5,
    says: [
      (x) =>
        `Oyster beds off ${x} are giving up pearls like peas, the divers say.`,
      (x) =>
        `A Spanish pearl fishery at ${x} was abandoned in a hurry. The beds are still there.`,
    ],
  },
  inheritance: {
    kind: "inheritance",
    title: "A disputed inheritance",
    acts: ["search"],
    tune: {
      search: { label: "Search the parish records", skill: "letters", dc: 11 },
    },
    where: (s, w, p) => owned(s, p, "power") && settlers(s.provinces[p]) >= 600,
    odds: () => 0.4,
    worth: [30, 200],
    days: 300,
    weight: 1.5,
    says: [
      (x, n) =>
        `An estate at ${x} lies unclaimed: old ${n.split(" ").pop()} died with no will, and the lawyers are looking for kin.`,
      (x) => `Notice: heirs of a merchant of ${x} sought. Apply to the court.`,
    ],
  },
  spring: {
    kind: "spring",
    title: "A mineral spring",
    acts: ["survey"],
    tune: { survey: { label: "Find the spring", skill: "woodcraft", dc: 8 } },
    where: (s, w, p) => high(w, p) && !w.tropical[p],
    odds: () => 0.55,
    worth: [20, 60],
    days: 360,
    weight: 1,
    says: [
      (x) =>
        `There's a warm spring at ${x} that cures the gout, the rheum and melancholy.`,
      (x) =>
        `Sick men go up to the waters at ${x} and come back dancing, they say.`,
    ],
  },
};

export const LEAD_KINDS = Object.keys(LEAD_DEFS) as LeadKind[];

/** How you work a lead of a kind (with its own label, skill and difficulty). */
export function leadAct(kind: LeadKind, act: LeadAct): LeadActDef {
  return { ...LEAD_ACTS[act], ...(LEAD_DEFS[kind].tune?.[act] ?? {}) };
}

/** The ways open to you now: once a strike's found, it can be mined. */
export function actsFor(lead: WorldLead, ll: LifeLead): LeadAct[] {
  const def = LEAD_DEFS[lead.kind];
  if (ll.status === "found" && def.boom) return ["mine"];
  if (ll.status === "found" && lead.kind === "furs") return ["survey"];
  return def.acts;
}

// ---------------------------------------------------------------- stories going round

/** At most this many stories at once. */
const MAX_LEADS = 30;
/** The gazette's news comes by the post, quicker than talk. */
const POST_SPEED = 2.5;

export function leadOf(s: GameState, id: number): WorldLead | undefined {
  return s.leads?.find((l) => l.id === id);
}

/** Make up a new story (it may be true) about a real place. */
export function newLead(
  g: ConquestGame,
  kind: LeadKind,
  p: number,
  rngSalt = 0,
): WorldLead {
  const s = g.s;
  const rng = worldRng(s, 31 + rngSalt);
  const def = LEAD_DEFS[kind];
  const place = g.map.provinces[p].name;
  const name =
    kind === "wreck" || kind === "crew"
      ? rng.pick(SHIPS)!
      : kind === "outlaw"
        ? rng.pick(OUTLAWS)!
        : kind === "treasure"
          ? rng.pick(CAPTAINS)!
          : kind === "inheritance"
            ? rng.pick(OUTLAWS)!.replace(/^the /, "")
            : "";
  const say = rng.pick(def.says)!;
  const lead: WorldLead = {
    id: g.nextId(),
    kind,
    p,
    day: s.day,
    until: s.day + def.days,
    text: say(place, name),
    odds: Math.round(def.odds(s, g.w, p) * 100) / 100,
    real: null,
    worth: Math.round(
      def.worth[0] + rng.next() * (def.worth[1] - def.worth[0]),
    ),
    taken: 0,
    rush: 0,
    c: -1,
  };
  (s.leads ??= []).push(lead);
  g.leadsChanged();
  return lead;
}

/** Each month: old stories die away, new ones start, and the rushes grow. */
export function leadsMonthly(g: ConquestGame): void {
  const s = g.s;
  const w = g.w;
  s.leads ??= [];
  const before = s.leads.length;
  const working = new Set<number>();
  for (const life of s.lives)
    for (const ll of life.leads ?? [])
      if (ll.work || ll.status === "found") working.add(ll.id);
  s.leads = s.leads.filter(
    (l) =>
      l.until > s.day || working.has(l.id) || (l.boom ?? -1e9) > s.day - 365,
  );
  let changed = s.leads.length !== before;
  const rng = worldRng(s, 29);
  // Word gets about: others come to try their luck.
  for (const l of s.leads) {
    if (l.real === false || l.taken >= l.worth) continue;
    const age = (s.day - l.day) / 30;
    const pull = (l.boom ? 0.6 : 0.12) + Math.min(0.2, age * 0.02);
    if (rng.chance(pull)) {
      l.rush++;
      if (l.real) l.taken = Math.min(l.worth, l.taken + l.worth * 0.04);
      changed = true;
    }
  }
  // New stories.
  const fresh = rng.int(1, 3);
  for (let i = 0; i < fresh && s.leads.length < MAX_LEADS; i++) {
    const total = LEAD_KINDS.reduce((m, k) => m + LEAD_DEFS[k].weight, 0);
    let roll = rng.next() * total;
    let kind: LeadKind = "gold";
    for (const k of LEAD_KINDS) {
      roll -= LEAD_DEFS[k].weight;
      if (roll <= 0) {
        kind = k;
        break;
      }
    }
    const options: number[] = [];
    for (let p = 0; p < s.provinces.length; p++) {
      const def = w.map.provinces[p];
      if (def.closed) continue;
      if (s.leads.some((l) => l.p === p && l.kind === kind)) continue;
      if (LEAD_DEFS[kind].where(s, w, p)) options.push(p);
    }
    const p = rng.pick(options);
    if (p === undefined) continue;
    const lead = newLead(g, kind, p, i);
    rumour(g, p, lead.text);
    changed = true;
  }
  if (changed) g.leadsChanged();
}

/** Whether talk of a story has reached a province (the post is quicker). */
export function storyReached(
  w: World,
  l: WorldLead,
  p: number,
  day: number,
  post: boolean,
): boolean {
  if (l.p === p) return true;
  const km = kmBetween(w.map, l.p, p);
  return km <= (day - l.day) * RUMOUR_KM_PER_DAY * (post ? POST_SPEED : 1);
}

export type LeadSource = "gazette" | "tavern" | "docks" | "letter" | "talk";

const SOURCE_NAMES: Record<LeadSource, string> = {
  gazette: "the gazette",
  tavern: "talk in the tavern",
  docks: "sailors at the docks",
  letter: "a letter",
  talk: "talk about the town",
};

/** Hear of a story: it goes in your leads, and its place on your map. */
export function hearLead(
  g: ConquestGame,
  life: Life,
  lead: WorldLead,
  from: LeadSource,
): LifeLead | null {
  const s = g.s;
  if (life.c < 0) return null;
  const leads = (life.leads ??= []);
  if (leads.some((x) => x.id === lead.id)) return null;
  touchLife(g, life);
  // How far you believe it: the truth's odds, blurred by how well you read
  // people and print.
  const judge =
    from === "gazette" || from === "letter"
      ? skillLevel(s, life, "letters")
      : skillLevel(s, life, "persuasion");
  const blur = Math.max(6, 34 - judge * 1.6);
  const printed = from === "gazette" ? 10 : 0;
  const trust = Math.round(
    Math.max(
      5,
      Math.min(95, lead.odds * 100 + printed + (g.rng.next() * 2 - 1) * blur),
    ),
  );
  const ll: LifeLead = {
    id: lead.id,
    heard: s.day,
    from: SOURCE_NAMES[from],
    trust,
    status: "open",
    tries: 0,
  };
  leads.push(ll);
  if (leads.length > 24) {
    const drop = leads.findIndex((x) => !x.work && x.status !== "found");
    if (drop >= 0) leads.splice(drop, 1);
  }
  reveal(g, life, [lead.p]);
  return ll;
}

/**
 * Reading or listening somewhere: maybe a lead or two. The gazette prints
 * the better-checked stories (and more of them); the tavern tells anything.
 */
export function leadsFrom(
  g: ConquestGame,
  life: Life,
  from: LeadSource,
): LifeLead[] {
  const s = g.s;
  const post = from === "gazette";
  const mine = new Set((life.leads ?? []).map((x) => x.id));
  const pool = (s.leads ?? []).filter(
    (l) =>
      !mine.has(l.id) &&
      l.until > s.day &&
      l.real !== false &&
      storyReached(g.w, l, life.prov, s.day, post) &&
      (!post || l.odds >= 0.2 || l.boom !== undefined),
  );
  // Nearer stories first, booms always.
  pool.sort(
    (a, b) =>
      Number(!!b.boom) - Number(!!a.boom) ||
      kmBetween(g.map, life.prov, a.p) - kmBetween(g.map, life.prov, b.p) ||
      a.id - b.id,
  );
  const n = post ? 2 : from === "docks" ? 1 : g.rng.chance(0.55) ? 1 : 0;
  const out: LifeLead[] = [];
  for (const l of pool.slice(0, n)) {
    const ll = hearLead(g, life, l, from);
    if (!ll) continue;
    out.push(ll);
    journal(
      g,
      life,
      `${post ? "In the gazette" : from === "docks" ? "On the docks" : "Over a pot"}: ${l.text} (A lead, noted in your journal.)`,
      "good",
    );
  }
  return out;
}

// ---------------------------------------------------------------- working a lead

export type Check = { ok: true } | { ok: false; why: string };

export function leadCheck(
  s: GameState,
  life: Life,
  id: number,
  act: LeadAct,
): Check {
  const ll = life.leads?.find((x) => x.id === id);
  const lead = leadOf(s, id);
  if (!ll || !lead) return { ok: false, why: "That story's gone cold." };
  if (!actsFor(lead, ll).includes(act))
    return { ok: false, why: "That's not how this one's worked." };
  if (ll.work) return { ok: false, why: "You're at it already." };
  if (ll.status === "dry" || ll.status === "done" || ll.status === "faded")
    return { ok: false, why: "There's nothing more to be had there." };
  if (life.travel) return { ok: false, why: "Not on the road." };
  if (life.prov !== lead.p)
    return { ok: false, why: "Go there first: you work a lead on the spot." };
  if ((life.leads ?? []).some((x) => x.work))
    return { ok: false, why: "You're working another lead." };
  const def = leadAct(lead.kind, act);
  if (life.purse < def.cost)
    return {
      ok: false,
      why: `It needs ${def.cost} coins for supplies and hands.`,
    };
  return { ok: true };
}

/** The odds of a good day's work, for the button. */
export function leadOdds(
  s: GameState,
  life: Life,
  lead: WorldLead,
  act: LeadAct,
): number {
  const def = leadAct(lead.kind, act);
  return checkChance(skillLevel(s, life, def.skill), def.dc);
}

/** Set to work on a lead (or drop it). */
export function leadCommand(
  g: ConquestGame,
  life: Life,
  id: number,
  act: LeadAct | "drop",
): string | null {
  const s = g.s;
  if (act === "drop") {
    const ll = life.leads?.find((x) => x.id === id);
    if (!ll) return "No such lead.";
    touchLife(g, life);
    life.leads = life.leads!.filter((x) => x !== ll);
    return null;
  }
  const check = leadCheck(s, life, id, act);
  if (!check.ok) return check.why;
  const lead = leadOf(s, id)!;
  const ll = life.leads!.find((x) => x.id === id)!;
  const def = leadAct(lead.kind, act);
  touchLife(g, life);
  if (def.cost) spend(g, life, def.cost);
  ll.work = { act, until: s.day + def.days };
  if (ll.status !== "found") ll.status = "working";
  journal(
    g,
    life,
    `You set to work at ${g.map.provinces[lead.p].name}: ${def.label.toLowerCase()}. ${def.days} days, if all goes well.`,
  );
  return null;
}

/** Each day: work that's done is reckoned up; leaving abandons it. */
export function leadsDaily(g: ConquestGame): void {
  const s = g.s;
  for (const life of s.lives) {
    if (!life.leads?.length || life.c < 0) continue;
    for (const ll of life.leads) {
      if (!ll.work) continue;
      const lead = leadOf(s, ll.id);
      if (!lead) {
        touchLife(g, life);
        ll.status = "faded";
        ll.work = undefined;
        continue;
      }
      if (life.prov !== lead.p || life.travel) {
        touchLife(g, life);
        ll.work = undefined;
        if (ll.status === "working") ll.status = "open";
        ll.note = "You left before the work was done.";
        continue;
      }
      if (ll.work.until <= s.day) finishWork(g, life, ll, lead);
    }
  }
}

/** What a stretch of work came to. */
export function finishWork(
  g: ConquestGame,
  life: Life,
  ll: LifeLead,
  lead: WorldLead,
): void {
  const s = g.s;
  const act = ll.work!.act;
  const def = leadAct(lead.kind, act);
  const place = g.map.provinces[lead.p].name;
  touchLife(g, life);
  ll.work = undefined;
  ll.tries++;
  gainXp(g, life, def.skill, 6 + def.days / 2);
  // The first proper look settles whether it was ever true.
  if (lead.real === null) {
    lead.real = g.rng.chance(lead.odds);
    g.leadsChanged();
  }
  // An accident, true story or not.
  if (g.rng.chance(def.risk)) {
    const harm = g.rng.int(8, 22);
    const what =
      act === "dive"
        ? "The sea nearly had you: you came up blue and coughing."
        : act === "mine"
          ? "A timber gave way in the drift. They dug you out."
          : act === "search" && lead.kind === "outlaw"
            ? "He saw you first. The ball took you in the side."
            : "You fell among the rocks and broke something.";
    journal(g, life, what, "bad");
    if (hurt(g, life, harm, `working a lead at ${place}`)) return;
  }
  if (!lead.real) {
    ll.status = "dry";
    ll.note = dryNote(lead);
    addStress(g, life, 4);
    journal(
      g,
      life,
      `${LEAD_DEFS[lead.kind].title} at ${place}: ${ll.note}`,
      "bad",
    );
    return;
  }
  const left = Math.max(0, lead.worth - lead.taken);
  if (left < 3) {
    ll.status = "done";
    ll.note = "Others have picked it clean before you.";
    journal(g, life, `At ${place}: ${ll.note}`, "bad");
    return;
  }
  const pass = g.rng.chance(leadOdds(s, life, lead, act));
  const crowd = Math.min(0.6, lead.rush * 0.08);
  const [lo, hi] = def.share;
  const share = pass
    ? lo + g.rng.next() * (hi - lo)
    : g.rng.chance(0.5)
      ? 0.04
      : 0;
  const got = Math.round(left * share * (1 - crowd) * 10) / 10;
  lead.taken = Math.round((lead.taken + got) * 10) / 10;
  g.leadsChanged();
  if (crowd > 0.15 && g.rng.chance(crowd))
    journal(
      g,
      life,
      `You weren't alone at ${place}: ${lead.rush} others had heard the same story, and they took their share.`,
    );
  reward(g, life, ll, lead, got, pass);
}

function dryNote(lead: WorldLead): string {
  switch (lead.kind) {
    case "gold":
    case "silver":
    case "mine":
      return "fool's gold and mica. Whoever started that story never saw the place.";
    case "wreck":
    case "pearls":
      return "nothing but weed and sand. The sea keeps its own counsel.";
    case "treasure":
      return "a hole, and then a bigger hole. The map was a fake, sold to a dozen fools before you.";
    case "land":
      return "the grants were all taken months ago.";
    case "crew":
      return "the ship sailed without you.";
    case "outlaw":
      return "he's long gone, if he was ever here.";
    case "furs":
      return "trapped out years ago. The beaver are gone.";
    case "inheritance":
      return "no claim of yours, the court says. The lawyers send their bill.";
    case "spring":
      return "a muddy seep and a smell of eggs. Nobody's cured of anything.";
  }
}

/** Coins, goods, renown, and (for a strike) the choice of what to do about it. */
function reward(
  g: ConquestGame,
  life: Life,
  ll: LifeLead,
  lead: WorldLead,
  got: number,
  pass: boolean,
): void {
  const s = g.s;
  const place = g.map.provinces[lead.p].name;
  const def = LEAD_DEFS[lead.kind];
  if (ll.status === "working") ll.status = "open";
  if (!pass) {
    if (got > 0) earn(g, life, got);
    ll.note =
      got > 0
        ? `A little: ${got} coins' worth. Not what you hoped; it might be worth another go.`
        : "Nothing this time. It might be worth another go.";
    journal(g, life, `At ${place}: ${ll.note}`);
    return;
  }
  switch (lead.kind) {
    case "crew":
      earn(g, life, got);
      gainXp(g, life, "seamanship", 20);
      ll.status = "done";
      ll.note = `A voyage done: ${got} coins in wages and a share.`;
      journal(
        g,
        life,
        `You signed on at ${place} and came back with ${got} coins in your pocket and salt in your hair.`,
        "good",
      );
      return;
    case "outlaw":
      earn(g, life, got);
      addRenown(g, life, 4);
      gainXp(g, life, "fighting", 10);
      ll.status = "done";
      ll.note = `Brought in: ${got} coins' reward.`;
      journal(
        g,
        life,
        `You brought the outlaw in at ${place}. The reward, ${got} coins, and your name in the gazette.`,
        "good",
      );
      rumour(
        g,
        lead.p,
        `The outlaw who haunted ${place} has been taken.`,
        life.c,
        "good",
      );
      return;
    case "land": {
      ll.status = "done";
      // Ten acres at half the usual price, or the place in the queue sold on.
      if (landCheck(s, life).ok && buyLand(g, life) === null) {
        earn(g, life, Math.round(LAND_LOT.cost / 2));
        ll.note = `Ten acres granted at half the usual price.`;
      } else {
        earn(g, life, Math.round(got));
        ll.note = `You sold your place in the land office queue to a speculator for ${Math.round(got)} coins.`;
      }
      journal(g, life, `At ${place}: ${ll.note}`, "good");
      return;
    }
    case "spring":
      heal(g, life, 25);
      addStress(g, life, -15);
      addRenown(g, life, 4);
      ll.status = "done";
      ll.note =
        "Found: warm, clear and tasting of iron. You feel ten years younger.";
      journal(g, life, `At ${place}: the spring is real. ${ll.note}`, "good");
      g.prov(lead.p).mods.push({
        key: "spa",
        label: "The mineral springs",
        until: s.day + 365 * 30,
        fx: { growth: 0.1 },
      });
      rumour(
        g,
        lead.p,
        `There really is a healing spring at ${place}. Folk are flocking to the waters.`,
        life.c,
        "good",
      );
      return;
    case "inheritance":
      earn(g, life, got);
      ll.status = "done";
      ll.note = `The court found for you: ${got} coins, after the lawyers.`;
      journal(g, life, `At ${place}: ${ll.note}`, "good");
      return;
    case "furs": {
      const pr = g.prov(lead.p);
      const loads = Math.max(
        0,
        Math.min(CARRY - carried(life), Math.round(got / 4)),
      );
      if (loads > 0) life.goods.furs = (life.goods.furs ?? 0) + loads;
      const rest = Math.round((got - loads * 4) * 10) / 10;
      if (rest > 0) earn(g, life, rest);
      if (!pr.rich) {
        pr.rich = true;
        shockMarket(g, lead.p, {
          item: "furs",
          mul: 0.8,
          until: s.day + 180,
          why: "trappers flooding in",
        });
      }
      ll.status = "found";
      ll.note = `Beaver everywhere: ${loads} loads of furs${rest > 0 ? ` and ${rest} coins` : ""}. There's more for the taking.`;
      journal(g, life, `At ${place}: ${ll.note}`, "good");
      return;
    }
    default:
      break;
  }
  // Metal, wrecks, pearls and treasure: coins (an assayer or a fence buys on the spot).
  earn(g, life, got);
  const big = got >= 60 || got >= lead.worth * 0.3;
  if (def.boom && ll.status !== "found") {
    ll.status = "found";
    ll.note = `A strike: ${got} coins' worth, and more in the hill.`;
    addRenown(g, life, 2);
    raiseLifeEvent(g, life, "lead-strike", { lead: lead.id, got });
    return;
  }
  if (def.boom) {
    ll.note = `Another ${got} coins' worth out of the claim.`;
    journal(g, life, `At ${place}: ${ll.note}`, "good");
    if (lead.rush >= 3 && g.rng.chance(0.25))
      raiseLifeEvent(g, life, "lead-jumpers", { lead: lead.id });
    return;
  }
  ll.status = big ? "done" : "open";
  ll.note = big
    ? `A fortune: ${got} coins.`
    : `Something: ${got} coins. There may be more.`;
  if (big) addRenown(g, life, 3);
  journal(g, life, `${def.title} at ${place}: ${ll.note}`, "good");
}

// ---------------------------------------------------------------- rushes

/** A true strike made public: prices jump, people pour in, everyone hears. */
export function startBoom(
  g: ConquestGame,
  lead: WorldLead,
  finder: number,
): void {
  const s = g.s;
  if (lead.boom !== undefined) return;
  lead.boom = s.day;
  lead.rush += 4;
  lead.until = Math.max(lead.until, s.day + 365);
  g.leadsChanged();
  const place = g.map.provinces[lead.p].name;
  const metal = lead.kind === "gold" ? "Gold" : "Silver";
  const around = [lead.p, ...g.map.provinces[lead.p].nb.map(([q]) => q)];
  const until = s.day + 365;
  for (const p of around) {
    const near = p === lead.p;
    shockMarket(g, p, {
      item: "tools",
      mul: near ? 1.6 : 1.3,
      until,
      why: "a strike nearby",
    });
    shockMarket(g, p, {
      item: "food",
      mul: near ? 1.45 : 1.2,
      until,
      why: "a strike nearby",
    });
    shockMarket(g, p, {
      item: "cloth",
      mul: near ? 1.3 : 1.15,
      until,
      why: "a strike nearby",
    });
    if (near)
      shockMarket(g, p, {
        item: "silver",
        mul: 0.8,
        until,
        why: "a strike nearby",
      });
  }
  // People come: settlers to a colony's land, a boomtown on open country.
  const pr = g.prov(lead.p);
  const owner = pr.owner >= 0 ? s.nations[pr.owner] : undefined;
  if (owner?.kind === "power") {
    pr.pops.push(...settlerPops(owner.culture, owner.religion, 450));
    mergePops(pr.pops);
  }
  rumour(
    g,
    lead.p,
    `${metal} has been found at ${place}! Everyone's going.`,
    finder,
    "good",
  );
  if (owner)
    g.event({
      k: "news",
      day: s.day,
      n: owner.id,
      text: `${metal} has been struck at ${place}. Men are leaving their farms for the diggings.`,
      p: lead.p,
    });
}

/** Land a strike has made worth settling (the colonies' governors look at it). */
export function boomAt(s: GameState, p: number): boolean {
  return (s.leads ?? []).some(
    (l) => l.p === p && l.boom !== undefined && s.day - l.boom < 3 * 365,
  );
}

function mergePops(pops: GameState["provinces"][number]["pops"]): void {
  for (let i = 0; i < pops.length; i++)
    for (let j = pops.length - 1; j > i; j--) {
      const a = pops[i];
      const b = pops[j];
      if (
        a.cls === b.cls &&
        a.culture === b.culture &&
        a.religion === b.religion
      ) {
        a.size += b.size;
        a.wealth += b.wealth;
        pops.splice(j, 1);
      }
    }
}

// ---------------------------------------------------------------- for the journal

export interface LeadView {
  ll: LifeLead;
  lead: WorldLead;
  def: LeadDef;
  place: string;
  /** km from where you are. */
  km: number;
  acts: { act: LeadAct; def: LeadActDef; check: Check; odds: number }[];
  /** Days of work left, if working. */
  left: number | null;
}

export function leadViews(s: GameState, w: World, life: Life): LeadView[] {
  const out: LeadView[] = [];
  for (const ll of life.leads ?? []) {
    const lead = leadOf(s, ll.id);
    if (!lead) continue;
    out.push({
      ll,
      lead,
      def: LEAD_DEFS[lead.kind],
      place: w.map.provinces[lead.p].name,
      km: kmBetween(w.map, life.prov, lead.p),
      acts: actsFor(lead, ll).map((act) => ({
        act,
        def: leadAct(lead.kind, act),
        check: leadCheck(s, life, ll.id, act),
        odds: leadOdds(s, life, lead, act),
      })),
      left: ll.work ? Math.max(0, ll.work.until - s.day) : null,
    });
  }
  const rank = (v: LeadView) =>
    v.ll.work
      ? 0
      : v.ll.status === "found"
        ? 1
        : v.ll.status === "open"
          ? 2
          : 3;
  return out.sort((a, b) => rank(a) - rank(b) || b.ll.heard - a.ll.heard);
}

/** Leads at the place you're standing in. */
export function leadsHere(s: GameState, w: World, life: Life): LeadView[] {
  return leadViews(s, w, life).filter((v) => v.lead.p === life.prov);
}

/** For the gazette: prices current at the nearest ports, a trader's best friend. */
export function pricesCurrent(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const ports = s.provinces
    .map((pr, p) => ({ pr, p }))
    .filter(
      ({ pr, p }) =>
        p !== life.prov &&
        (pr.b.port ?? 0) > 0 &&
        pr.owner >= 0 &&
        s.nations[pr.owner].kind === "power" &&
        kmBetween(g.map, life.prov, p) < 900,
    )
    .sort(
      (a, b) =>
        kmBetween(g.map, life.prov, a.p) - kmBetween(g.map, life.prov, b.p),
    )
    .slice(0, 2);
  if (!ports.length) return null;
  const goods = ["furs", "tobacco", "sugar", "tools", "cloth", "guns"] as const;
  return ports
    .map(
      ({ p }) =>
        `at ${g.map.provinces[p].name}, ${goods
          .map((x) => `${x} ${priceView(s, g.w, p, x).price.toFixed(1)}`)
          .join(", ")}`,
    )
    .join("; ");
}

/**
 * What reading the gazette or listening in the tavern turns up: leads, the
 * places in the news (they go on your map), and in the gazette the prices
 * current at the nearest ports.
 */
export function afterHearing(
  g: ConquestGame,
  life: Life,
  how: LeadSource,
): void {
  if (life.c < 0) return;
  const heard = heardHere(g.s, g.map, life.prov).slice(
    0,
    how === "gazette" ? 6 : 3,
  );
  reveal(
    g,
    life,
    heard.map((r) => r.p),
  );
  leadsFrom(g, life, how);
  if (how === "gazette") {
    const prices = pricesCurrent(g, life);
    if (prices) journal(g, life, `The gazette's prices current: ${prices}.`);
  }
}
