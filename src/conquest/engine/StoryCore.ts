// STORY (r17): the story of a life, kind by kind. Every moment a life is
// remembered for (a milestone) has a kind; this table says how each kind is
// told: its engraving, what it's called, how much it weighs in the story (a
// small thing several times a year is told in one line, the great moments are
// drawn larger), and how it usually went. Kinds this table doesn't know (a
// new system's) are told plainly, with a seal and their own words.
//
// Pure: it reads milestones and nothing else, so LifeCore (which records
// them) and the story's pages can both use it.

import type { LifeMilestone } from "./Types";

/** The engravings the story draws (client/ui/StoryIcons.ts). */
export type StoryIcon =
  | "cradle"
  | "quill"
  | "tools"
  | "chevron"
  | "rings"
  | "house"
  | "ship"
  | "muskets"
  | "bandage"
  | "laurel"
  | "seal"
  | "banner"
  | "urn"
  | "key"
  | "mask"
  | "eye"
  | "star"
  | "irons"
  | "fist"
  | "pistols"
  | "scales"
  | "chain"
  | "flag"
  | "storm"
  | "anchor"
  | "coin"
  | "bales"
  | "ballot"
  | "scroll"
  | "dagger"
  | "book"
  | "dice"
  | "medal"
  | "pick"
  | "wreath"
  | "tower";

export type Weight = 1 | 2 | 3;
export type Tone = "good" | "bad" | "";

export interface StoryKindDef {
  icon: StoryIcon;
  /** What a moment of this kind is (the key to the story's engravings). */
  name: string;
  /** Several of them, counted: "3 duels". */
  many: (n: number) => string;
  /**
   * 1: a small thing, several of which in a year are told in one line;
   * 2: a moment; 3: one of the great moments of a life, drawn larger.
   */
  weight: Weight;
  /** How it went, when the moment itself doesn't say. */
  tone?: Exclude<Tone, "">;
}

const n = (one: string, more: string) => (k: number) =>
  `${k} ${k === 1 ? one : more}`;

/** Every kind of moment the story knows. */
export const STORY_KINDS: Record<string, StoryKindDef> = {
  born: {
    icon: "cradle",
    name: "Born, or begun",
    many: n("beginning", "beginnings"),
    weight: 3,
  },
  begin: {
    icon: "quill",
    name: "A life begun",
    many: n("beginning", "beginnings"),
    weight: 3,
  },
  job: {
    icon: "tools",
    name: "Work",
    many: n("trade taken up", "trades taken up"),
    weight: 2,
  },
  promoted: {
    icon: "chevron",
    name: "Rising in a trade",
    many: n("promotion", "promotions"),
    weight: 2,
    tone: "good",
  },
  married: {
    icon: "rings",
    name: "Marriage",
    many: n("marriage", "marriages"),
    weight: 3,
    tone: "good",
  },
  child: {
    icon: "cradle",
    name: "Children",
    many: n("child born", "children born"),
    weight: 2,
    tone: "good",
  },
  moved: {
    icon: "house",
    name: "A new home",
    many: n("move", "moves"),
    weight: 2,
  },
  voyage: {
    icon: "ship",
    name: "Voyages",
    many: n("voyage", "voyages"),
    weight: 2,
  },
  battle: {
    icon: "muskets",
    name: "Battles and sieges",
    many: n("battle or siege", "battles and sieges"),
    weight: 2,
  },
  wounded: {
    icon: "bandage",
    name: "Wounds",
    many: n("wound", "wounds"),
    weight: 2,
    tone: "bad",
  },
  renown: {
    icon: "laurel",
    name: "Renown",
    many: n("mark of renown", "marks of renown"),
    weight: 2,
    tone: "good",
  },
  office: {
    icon: "seal",
    name: "Offices",
    many: n("office", "offices"),
    weight: 2,
    tone: "good",
  },
  movement: {
    icon: "banner",
    name: "Causes",
    many: n("cause", "causes"),
    weight: 2,
  },
  rising: {
    icon: "banner",
    name: "Risings",
    many: n("rising", "risings"),
    weight: 3,
  },
  europe: {
    icon: "ship",
    name: "Home to Europe",
    many: n("passage home", "passages home"),
    weight: 3,
  },
  died: { icon: "urn", name: "Deaths", many: n("death", "deaths"), weight: 3 },
  heir: {
    icon: "key",
    name: "An heir goes on",
    many: n("heir", "heirs"),
    weight: 3,
  },
  takeover: {
    icon: "mask",
    name: "A life taken up",
    many: n("life taken up", "lives taken up"),
    weight: 3,
  },
  watching: {
    icon: "eye",
    name: "The line ends",
    many: n("ending", "endings"),
    weight: 3,
  },
  end: { icon: "star", name: "1776", many: n("ending", "endings"), weight: 3 },
  convicted: {
    icon: "irons",
    name: "Convictions",
    many: n("conviction", "convictions"),
    weight: 2,
    tone: "bad",
  },
  // ---- STORY (r17)
  fight: {
    icon: "fist",
    name: "Brawls",
    many: n("brawl", "brawls"),
    weight: 1,
  },
  duel: { icon: "pistols", name: "Duels", many: n("duel", "duels"), weight: 2 },
  crime: {
    icon: "mask",
    name: "Big jobs",
    many: n("big job pulled off", "big jobs pulled off"),
    weight: 1,
  },
  arrest: {
    icon: "irons",
    name: "Taken up",
    many: n("arrest", "arrests"),
    weight: 2,
    tone: "bad",
  },
  trial: {
    icon: "scales",
    name: "Trials",
    many: n("trial", "trials"),
    weight: 2,
  },
  escape: {
    icon: "chain",
    name: "Escapes",
    many: n("escape", "escapes"),
    weight: 2,
    tone: "good",
  },
  prize: {
    icon: "flag",
    name: "Prizes at sea",
    many: n("prize taken", "prizes taken"),
    weight: 1,
    tone: "good",
  },
  storm: {
    icon: "storm",
    name: "Hurricanes",
    many: n("hurricane", "hurricanes"),
    weight: 2,
  },
  wreck: {
    icon: "anchor",
    name: "Wrecked or taken at sea",
    many: n("ship lost", "ships lost"),
    weight: 2,
    tone: "bad",
  },
  business: {
    icon: "coin",
    name: "Businesses",
    many: n("business begun", "businesses begun"),
    weight: 2,
  },
  company: {
    icon: "bales",
    name: "A company's voyages",
    many: n("great voyage", "great voyages"),
    weight: 2,
  },
  election: {
    icon: "ballot",
    name: "Polls",
    many: n("poll", "polls"),
    weight: 2,
  },
  petition: {
    icon: "scroll",
    name: "Petitions and addresses",
    many: n("petition", "petitions"),
    weight: 2,
  },
  plot: {
    icon: "dagger",
    name: "Plots",
    many: n("plot", "plots"),
    weight: 2,
    tone: "bad",
  },
  school: {
    icon: "book",
    name: "Schooling",
    many: n("step in schooling", "steps in schooling"),
    weight: 2,
    tone: "good",
  },
  freed: {
    icon: "chain",
    name: "Freedom",
    many: n("person freed", "people freed"),
    weight: 2,
    tone: "good",
  },
  dice: {
    icon: "dice",
    name: "Liar's dice",
    many: n("table won at Liar's dice", "tables won at Liar's dice"),
    weight: 1,
    tone: "good",
  },
  achievement: {
    icon: "medal",
    name: "Achievements",
    many: n("achievement", "achievements"),
    weight: 1,
    tone: "good",
  },
  find: {
    icon: "pick",
    name: "Strikes and finds",
    many: n("find", "finds"),
    weight: 2,
    tone: "good",
  },
  loss: {
    icon: "wreath",
    name: "Bereavements",
    many: n("loss", "losses"),
    weight: 2,
    tone: "bad",
  },
  home: {
    icon: "tower",
    name: "Home in war",
    many: n("town lost", "towns lost"),
    weight: 2,
  },
};

/** How an achievement is told in the story. */
export function achievementText(name: string): string {
  return `Achievement: ${name}`;
}

/** A kind the table doesn't know (another system's): a seal and its own words. */
export const PLAIN_KIND: StoryKindDef = {
  icon: "seal",
  name: "Other moments",
  many: n("moment", "moments"),
  weight: 2,
};

/** The beginnings and endings of lives: never trimmed away. */
const KEEP = new Set([
  "born",
  "begin",
  "died",
  "heir",
  "takeover",
  "watching",
  "end",
  "europe",
]);

/**
 * The kind a moment is told as. Moments recorded before round 17 often went
 * under a broad kind ("renown" for a duel won, "job" for a business set up):
 * their words say which.
 */
export function storyKind(m: Pick<LifeMilestone, "kind" | "text">): string {
  const t = m.text;
  switch (m.kind) {
    case "renown":
      if (/\bduel\b/i.test(t)) return "duel";
      if (/^(Founded|Bought) /.test(t)) return "business";
      if (/^Built an? /.test(t)) return "home";
      return "renown";
    case "job":
      if (/^Ran away from an indenture/.test(t)) return "escape";
      if (/^Served out an indenture/.test(t)) return "freed";
      if (/^(Set up |Went into partnership)/.test(t)) return "business";
      if (/^Bought a freehold/.test(t)) return "home";
      return "job";
    case "office":
      if (/^(Elected to|Lost the (election|poll))/.test(t)) return "election";
      if (/^Petitioned /.test(t)) return "petition";
      return "office";
    case "convicted":
      if (/pardon/i.test(t)) return "trial";
      return "convicted";
    default:
      return m.kind;
  }
}

export function kindDef(kind: string): StoryKindDef {
  return STORY_KINDS[kind] ?? PLAIN_KIND;
}

/** How a moment went: its own word, or its words, or its kind's. */
export function storyTone(
  m: Pick<LifeMilestone, "kind" | "text" | "tone">,
): Tone {
  if (m.tone) return m.tone;
  const t = m.text;
  switch (m.kind) {
    case "died":
      return "bad";
    case "battle":
      return /^Lost\b/.test(t) ? "bad" : "good";
    case "rising":
      return /crushed|hanged|failed|lost/i.test(t) ? "bad" : "good";
    case "married":
      return /^Divorced/.test(t) ? "bad" : "good";
    case "office":
      return /^(Recalled|Lost|Put off|Dismissed|No longer)/.test(t)
        ? "bad"
        : "good";
    case "convicted":
      return /pardon/i.test(t) ? "good" : "bad";
    default:
      return kindDef(storyKind(m)).tone ?? "";
  }
}

/** How much a moment weighs in the story: 3 is one of the great moments. */
export function storyWeight(
  m: Pick<LifeMilestone, "kind" | "text" | "big">,
): Weight {
  if (m.big) return 3;
  const t = m.text;
  if (
    m.kind === "office" &&
    /became (governor|sachem)|^Served as governor/.test(t)
  )
    return 3;
  if (m.kind === "renown" && /became famous/.test(t)) return 3;
  if (m.kind === "duel" && /died of it|killed/i.test(t)) return 3;
  return kindDef(storyKind(m)).weight;
}

/**
 * Over the limit: the least of the oldest moments go first (the small things,
 * then the moments), never a life's beginning or end.
 */
export function trimMoments(list: LifeMilestone[], max: number): void {
  while (list.length > max) {
    let at = -1;
    let least: Weight = 4 as Weight;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (KEEP.has(m.kind)) continue;
      const w = storyWeight(m);
      if (w < least) {
        least = w;
        at = i;
        if (w === 1) break;
      }
    }
    if (at < 0) at = 0;
    list.splice(at, 1);
  }
}
