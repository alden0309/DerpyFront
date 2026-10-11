// The ledger's tabs and their pages (r11 wave 2). Eight tabs, each with the
// same pages every time you open it (a page with nothing in it says so, and
// how to get something), so nothing moves and everything has one home:
//
//   Here     the place you're in, its places, what you can do, who's there
//   You      yourself, what you're after, your family, your tongues
//   People   everyone you know; the people in your service
//   Work     your work, finding work, contracts, the law
//   Estate   your purse, house and land, boats, goods
//   Society  standing and favour, office, letters, gatherings, causes, a colony
//   Journal  your diary (and what waits on you), leads, the story so far
//   World    wars, causes, the colonies and nations, the other players

import { html, nothing, TemplateResult } from "lit";
import { myGatherings } from "../../engine/Gatherings";
import { promotionView } from "../../engine/LifeQueries";
import type { Life } from "../../engine/Types";
import {
  EstateIcon,
  HereIcon,
  JournalIcon,
  PeopleIcon,
  SelfIcon,
  SocietyIcon,
  WorkIcon,
  WorldIcon,
} from "../Icons";
import type { DrawerView, GameUi, Tab } from "./Context";
import { postCounts } from "./Society";

export interface SubDef {
  id: string;
  label: string;
  /** The guide's chapter for this page. */
  guide: string;
}

export interface TabDef {
  id: Tab;
  label: string;
  /** What the tab holds, for its tooltip and the top of its pages. */
  blurb: string;
  icon: () => TemplateResult;
  subs: SubDef[];
  guide: string;
}

export const TAB_DEFS: TabDef[] = [
  {
    id: "here",
    label: "Here",
    blurb: "Where you are: its places, what you can do there, and who's about",
    icon: HereIcon,
    subs: [],
    guide: "places",
  },
  {
    id: "you",
    label: "You",
    blurb: "Yourself, what you're after, your family and your tongues",
    icon: SelfIcon,
    subs: [
      { id: "self", label: "Yourself", guide: "you" },
      { id: "ambition", label: "Ambition", guide: "you" },
      { id: "family", label: "Family", guide: "family" },
      { id: "tongues", label: "Tongues", guide: "languages" },
    ],
    guide: "you",
  },
  {
    id: "people",
    label: "People",
    blurb: "Everyone you know, and the people in your service",
    icon: PeopleIcon,
    subs: [
      { id: "known", label: "People you know", guide: "people" },
      { id: "yours", label: "Your people", guide: "followers" },
    ],
    guide: "people",
  },
  {
    id: "work",
    label: "Work",
    blurb: "Your work and its ladder, finding work, contracts, and the law",
    icon: WorkIcon,
    subs: [
      { id: "job", label: "Your work", guide: "work" },
      { id: "find", label: "Find work", guide: "trades" },
      { id: "contracts", label: "Contracts", guide: "followers" },
      { id: "law", label: "The law", guide: "crime" },
    ],
    guide: "work",
  },
  {
    id: "estate",
    label: "Estate",
    blurb: "Your purse and how you live, house and land, boats, and goods",
    icon: EstateIcon,
    subs: [
      { id: "purse", label: "Purse", guide: "money" },
      { id: "house", label: "House & land", guide: "property" },
      { id: "boats", label: "Boats", guide: "boats" },
      { id: "goods", label: "Goods", guide: "markets" },
    ],
    guide: "money",
  },
  {
    id: "society",
    label: "Society",
    blurb:
      "Standing and favour, office, the council, the press, letters, gatherings, causes, a colony",
    icon: SocietyIcon,
    subs: [
      { id: "standing", label: "Standing", guide: "favour" },
      { id: "office", label: "Office", guide: "office" },
      { id: "council", label: "Council", guide: "council" }, // POWER (r12)
      { id: "press", label: "Press", guide: "press" }, // POWER (r12)
      { id: "letters", label: "Letters", guide: "letters" },
      { id: "gatherings", label: "Gatherings", guide: "gatherings" },
      { id: "causes", label: "Causes", guide: "movements" },
      { id: "colony", label: "Colony", guide: "founding" },
    ],
    guide: "standing",
  },
  {
    id: "journal",
    label: "Journal",
    blurb:
      "Your diary and what waits on you, leads, the story so far, and achievements",
    icon: JournalIcon,
    subs: [
      { id: "diary", label: "Diary", guide: "journal" },
      { id: "leads", label: "Leads", guide: "leads" },
      { id: "story", label: "The story", guide: "end" },
      { id: "achievements", label: "Achievements", guide: "coins" }, // MAP (r12)
    ],
    guide: "journal",
  },
  {
    id: "world",
    label: "World",
    blurb: "Wars, causes, the colonies and nations, and the other players",
    icon: WorldIcon,
    subs: [],
    guide: "world",
  },
];

export const TAB_BY_ID = new Map(TAB_DEFS.map((t) => [t.id, t]));

/** The page you last had open in each tab (opening a tab goes back to it). */
const lastSub: Partial<Record<Tab, string>> = {};

/** The page of a tab to show. */
export function subOf(v: { tab: Tab; sub?: string }): string {
  const def = TAB_BY_ID.get(v.tab);
  if (!def || !def.subs.length) return "";
  const want = v.sub ?? lastSub[v.tab];
  return def.subs.some((x) => x.id === want) ? want! : def.subs[0].id;
}

export function rememberSub(tab: Tab, sub: string): void {
  if (sub) lastSub[tab] = sub;
}

/**
 * Pages that used to stand alone now live in a tab: the letters, the
 * gatherings, your settlement and every trade. Old ways in still work.
 */
export function homeOf(v: DrawerView, life: Life | null): DrawerView {
  switch (v.k) {
    case "letters":
      return { k: "tab", tab: "society", sub: "letters" };
    case "gatherings":
      return { k: "tab", tab: "society", sub: "gatherings" };
    case "founding":
      return { k: "tab", tab: "society", sub: "colony" };
    case "life":
      return { k: "tab", tab: "work", sub: "find" };
    case "offices":
      return life && !life.watching && v.p === life.prov && !life.travel
        ? { k: "tab", tab: "society", sub: "office" }
        : v;
    case "tab":
      // Old saves of the UI's own state, and wave 1's "Affairs".
      if ((v.tab as string) === "affairs") return { k: "tab", tab: "work" };
      return v;
    default:
      return v;
  }
}

/** The guide's chapter for what's showing. */
export function guideFor(v: DrawerView | undefined): string {
  if (!v) return "start";
  switch (v.k) {
    case "tab": {
      const def = TAB_BY_ID.get(v.tab);
      if (!def) return "start";
      const sub = subOf(v);
      return def.subs.find((x) => x.id === sub)?.guide ?? def.guide;
    }
    case "prov":
      return "map";
    case "char":
      return "people";
    case "army":
      return "military";
    case "nation":
      return "world";
    case "offices":
      return "office";
    default:
      return "start";
  }
}

// ---------------------------------------------------------------- badges

/** What wants looking at, by tab and by page ("work", "work.job"). */
export function badges(ui: GameUi): Map<string, number> {
  const out = new Map<string, number>();
  const life = ui.life;
  if (!life || life.c < 0) {
    if (life?.watching) out.set("here", 1);
    return out;
  }
  if (life.watching) {
    out.set("here", 1);
    return out;
  }
  const add = (tab: Tab, sub: string, n: number) => {
    if (n <= 0) return;
    out.set(`${tab}.${sub}`, (out.get(`${tab}.${sub}`) ?? 0) + n);
    out.set(tab, (out.get(tab) ?? 0) + n);
  };
  const s = ui.s;
  if (life.job && promotionView(s, life).check.ok) add("work", "job", 1);
  if (life.crime?.jail) add("work", "law", 1);
  const people = life.people ?? [];
  add(
    "people",
    "yours",
    people.filter((f) => (f.owed ?? 0) > 0 || f.loyalty < 20).length +
      (life.company?.owed ? 1 : 0),
  );
  add("estate", "boats", (life.boats ?? []).filter((b) => b.owed).length);
  const { ask } = postCounts(life);
  add("society", "letters", ask);
  const me = ui.me;
  if (me) {
    const asked = myGatherings(s, life).filter(
      (x) => x.host !== me.id && x.status === "planned" && !x.rsvp[me.id],
    ).length;
    add("society", "gatherings", asked);
  }
  if (life.invite) add("society", "standing", 1);
  if (life.constitute && life.constitute.until > s.day)
    add("society", "colony", 1);
  // POWER (r12): bills waiting on a governor's assent.
  const govN = s.nations.findIndex((n) => n.alive && n.ruler === life.c);
  if (govN >= 0)
    add(
      "society",
      "council",
      (s.power?.cabinets[govN]?.bills ?? []).filter(
        (b) => b.stage === "governor",
      ).length,
    );
  add("journal", "diary", life.events.length);
  return out;
}

// ---------------------------------------------------------------- the pages' heads

/**
 * The top of a tab: its name, what's in it, and its pages as tabs of their
 * own. The row is always the same for a tab, so nothing jumps.
 */
export function tabHead(
  ui: GameUi,
  tab: Tab,
  sub: string,
  marks: Map<string, number>,
): TemplateResult {
  const def = TAB_BY_ID.get(tab)!;
  return html`<div class="cq-tabhead">
    <p class="cq-tabhead-kicker">
      <span class="cq-tabhead-name">${def.label}</span>
      <span class="cq-tabhead-blurb">${def.blurb}</span>
    </p>
    ${def.subs.length
      ? html`<nav class="cq-subtabs" aria-label=${`${def.label}: pages`}>
          ${def.subs.map((x) => {
            const n = marks.get(`${tab}.${x.id}`) ?? 0;
            return html`<button
              class="cq-subtab ${x.id === sub ? "on" : ""}"
              aria-current=${x.id === sub ? "page" : "false"}
              @click=${() => ui.open({ k: "tab", tab, sub: x.id })}
            >
              ${x.label}${n
                ? html`<i class="cq-subtab-n" aria-label="needs you">${n}</i>`
                : nothing}
            </button>`;
          })}
        </nav>`
      : nothing}
  </div>`;
}

/** A page's own heading: a title and a line on what it's for. */
export function pageHead(
  title: string | TemplateResult,
  line: string | TemplateResult,
  extra?: TemplateResult,
): TemplateResult {
  return html`<header class="cq-panel-head cq-page-head">
    <h2 class="cq-h1">${title}</h2>
    <p class="cq-muted small">${line}</p>
    ${extra ?? nothing}
  </header>`;
}

/**
 * When a page has nothing to show yet: what it would hold, how to get it,
 * and a button to the place to start.
 */
export function howTo(
  text: string | TemplateResult,
  steps: (string | TemplateResult)[],
  go?: { label: string; run: () => void },
  /** Numbered, when the points are steps to take in order. */
  ordered = false,
): TemplateResult {
  return html`<div class="cq-howto">
    <p>${text}</p>
    ${steps.length
      ? ordered
        ? html`<ol class="cq-howto-steps">
            ${steps.map((x) => html`<li>${x}</li>`)}
          </ol>`
        : html`<ul class="cq-howto-points">
            ${steps.map((x) => html`<li>${x}</li>`)}
          </ul>`
      : nothing}
    ${go
      ? html`<div class="cq-btnrow">
          <button class="cq-btn small" @click=${go.run}>${go.label}</button>
        </div>`
      : nothing}
  </div>`;
}
