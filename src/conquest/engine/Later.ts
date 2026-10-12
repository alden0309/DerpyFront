// CHAMBER (r16): a councillor's work comes to something later, and says so.
// The surveyor-general's survey opens a road through a backcountry county
// half a year on (trade up, the nation whose hunting grounds it crosses
// wary); a treaty's belts bring the traders down, or the young men didn't
// hold with it; the arrears an audit chased come in, or a collector runs
// for Carolina with his book. Each is settled on the chamber's own dice when
// the work is done, arrives in the councillor's journal when it's due, and
// is listed on the council's page (still to come, and what it came to).

import { cdice, lifeOfC } from "./ChamberCore";
import {
  ensureCabinet,
  neighboursOf,
  registerLaterWork,
  relate,
  SEAT_ACTION_BY_KEY,
} from "./Council";
import { frontierProv } from "./Factions";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { addRenown, journal, touchLife } from "./LifeCore";
import { powerChanged } from "./PowerCore";
import { atWar, provincesOf, settlers } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import type { GameState, LaterWork, MapDef, ModFx } from "./Types";

type G = { s: GameState; map: MapDef };

const Y = DAYS_PER_YEAR;

export interface LaterDef {
  /** What it comes to, for the guide: well, and badly. */
  well: string;
  badly: string;
  /** Days until it comes to something: the least and the most. */
  days: [number, number];
  /** Only if the work went well (a survey that came home half done comes to nothing). */
  needsPass: boolean;
  /** The chance it turns out well; in a war (with anyone, or with its target), `pWar`. */
  p: number;
  pWar?: number;
  war?: "any" | "target";
  /** What it's about besides its target: a county (a road's), or a nation (who watches). */
  arg2?: (g: ConquestGame, n: number, arg: number) => number;
  /** Where it's going, for the page ("a road through Henrico"). */
  pending: (g: G, n: number, w: LaterWork) => string;
  /** When it comes: what it does, and the line. */
  come: (g: ConquestGame, n: number, w: LaterWork) => string;
}

const colonyMod = (
  g: ConquestGame,
  n: number,
  key: string,
  label: string,
  days: number,
  fx: Partial<Record<ModFx, number>>,
) => {
  const x = g.nation(n);
  x.mods = x.mods.filter((m) => m.key !== key);
  x.mods.push({ key, label, until: g.s.day + Math.round(days), fx });
};

const countyMod = (
  g: ConquestGame,
  p: number,
  key: string,
  label: string,
  days: number,
  fx: Partial<Record<ModFx, number>>,
) => {
  const pr = g.prov(p);
  pr.mods = pr.mods.filter((m) => m.key !== key);
  pr.mods.push({ key, label, until: g.s.day + Math.round(days), fx });
};

const nameOf = (g: G, o: number) =>
  (g.s.nations[o]?.name ?? "the nations").replace(/^the /, "");
const county = (g: G, p: number) =>
  g.map.provinces[p]?.name ?? "the backcountry";

/** The backcountry county a survey would open: the most settled on the frontier. */
function roadCounty(g: ConquestGame, n: number): number {
  const s = g.s;
  const f = provincesOf(s, n)
    .filter((p) => frontierProv(s, p))
    .sort(
      (a, b) => settlers(s.provinces[b]) - settlers(s.provinces[a]) || a - b,
    );
  return f[0] ?? s.nations[n].capital;
}

/** The native nation next door whose hunting grounds a road would cross, or -1. */
function watcher(g: ConquestGame, n: number, p: number): number {
  const s = g.s;
  for (const [q] of g.map.provinces[p]?.nb ?? []) {
    const o = s.provinces[q]?.owner ?? -1;
    if (o >= 0 && s.nations[o]?.kind === "native" && s.nations[o].alive)
      return o;
  }
  const near = neighboursOf(g, n).find((o) => s.nations[o].kind === "native");
  return near ?? -1;
}

/** One of a few lines for what a work came to (by the work: no dice). */
const pick = (w: LaterWork, lines: string[]) =>
  lines[Math.abs(w.id * 7 + w.due) % lines.length];

export const LATER: Record<string, LaterDef> = {
  survey: {
    well: "a road through a backcountry county: its trade +5% for six years; the nation whose hunting grounds it crosses wary (−4)",
    badly: "a road that's a mire: the county's unrest +1 for a year",
    days: [150, 270],
    needsPass: true,
    p: 0.8,
    arg2: (g, n) => roadCounty(g, n),
    pending: (g, n, w) => `a road through ${county(g, w.arg2)}`,
    come: (g, n, w) => {
      const p = w.arg2;
      const o = watcher(g, n, p);
      if (!w.good) {
        countyMod(g, p, "later:mire", "A road that's a mire", Y, { unrest: 1 });
        return pick(w, [
          `The road you surveyed through ${county(g, p)} is a mire from the first rains to the last. The settlers curse it by name: yours.`,
          `The road you surveyed through ${county(g, p)} washes out in the first spring flood. The settlers ford it, and name the ford after you.`,
        ]);
      }
      countyMod(g, p, "later:road", "A road through the backcountry", 6 * Y, {
        production: 0.05,
      });
      if (o >= 0) relate(g, o, n, "A road through our hunting grounds", -4, 4);
      return pick(w, [
        `Your road through ${county(g, p)} is open: trade up${o >= 0 ? `, the ${nameOf(g, o)} wary` : ""}.`,
        `The road you surveyed through ${county(g, p)} has its first wagons, its first tavern and its first quarrel over a toll${o >= 0 ? `. The ${nameOf(g, o)} watch it from the tree line` : ""}.`,
        `Carts go down your road from ${county(g, p)} to the landing with the crop, and the land along it doubles in price${o >= 0 ? `. The ${nameOf(g, o)} count the new chimneys` : ""}.`,
      ]);
    },
  },
  boundary: {
    well: "the line holds: both sides +3 toward each other",
    badly: "the marks are cut down and the quarrel starts again (−3)",
    days: [300, 400],
    needsPass: true,
    p: 0.75,
    pWar: 0.2,
    war: "target",
    pending: (g, n, w) => `the line with ${g.s.nations[w.arg]?.name ?? "them"}`,
    come: (g, n, w) => {
      const o = w.arg;
      if (!g.s.nations[o]?.alive) return "";
      if (w.good && !atWar(g.s, n, o)) {
        relate(g, o, n, "The line holds", 3, 4);
        relate(g, n, o, "The line holds", 3, 4);
        return pick(w, [
          `The line you ran with ${g.s.nations[o].name} holds: a year without a quarrel over the creeks, which is a record.`,
          `The line you ran with ${g.s.nations[o].name} is still where you put it, and the surveyors on both sides drink to it at the boundary oak.`,
        ]);
      }
      relate(g, o, n, "The line's marks cut down", -3, 3);
      return pick(w, [
        `The marks you blazed on the line with ${g.s.nations[o].name} are cut down by someone's hogs and someone else's axe. The quarrel starts again where it left off.`,
        `A settler builds his cabin squarely across the line you ran with ${g.s.nations[o].name}. Both sides tax him, he pays neither, and the quarrel is back.`,
      ]);
    },
  },
  audit: {
    well: "the arrears come in: 3 to 6 more into the treasury",
    badly: "a collector runs off with 2 of the colony's money",
    days: [240, 330],
    needsPass: true,
    p: 0.7,
    pending: () => "the arrears your audit chased",
    come: (g, n, w) => {
      if (w.good) {
        const more = 3 + (w.id % 4);
        g.nation(n).gold += more;
        return pick(w, [
          `The collectors you shamed pay up: ${more} more into the treasury, and a great deal of injured feeling.`,
          `The arrears your audit chased come in at last: ${more} into the treasury, most of it in tobacco and some of it in apologies.`,
        ]);
      }
      if (g.s.nations[n].gold >= 2) g.nation(n).gold -= 2;
      return pick(w, [
        "One of the collectors you audited has gone to Carolina with his book, his horse and a little of the colony's money.",
        "A collector you audited loses his books in a kitchen fire he swears was an accident. The colony is out 2, and he is out of a kitchen.",
      ]);
    },
  },
  records: {
    well: "the courts cite your books: unrest −1 for a year, and renown +1",
    badly: "the mice get half of them: nothing",
    days: [300, 400],
    needsPass: false,
    p: 0.8,
    pending: () => "the fair copies of the colony's records",
    come: (g, n, w) => {
      if (!w.good)
        return pick(w, [
          "Half the minute-books you had copied fair are eaten by mice in the secretary's office. The other half are very well kept.",
          "The fair copies you had made are lent to a councillor who leaves them out in the rain. The rain reads them first.",
        ]);
      colonyMod(g, n, "later:records", "Records that settle suits", Y, {
        unrest: -1,
      });
      const life = lifeOfC(g.s, w.by);
      if (life) addRenown(g, life, 1);
      return pick(w, [
        "The fair copies you made settle a land suit no court could: the colony's judges cite your books now, and the counties are quieter for it.",
        "A widow's title to her land turns on a page of the minutes you had copied fair. She wins, the court cites your books, and the counties are quieter for it.",
      ]);
    },
  },
  draft: {
    well: "the laws hold in the courts: unrest −1 for a year",
    badly: "a hole in the act: unrest +1 for half a year",
    days: [180, 270],
    needsPass: false,
    p: 0.8,
    pending: () => "the laws you drafted, tried in the courts",
    come: (g, n, w) => {
      if (!w.good) {
        colonyMod(g, n, "later:loophole", "A hole in the act", Y / 2, {
          unrest: 1,
        });
        return pick(w, [
          "A clever lawyer finds a hole in the act you drafted big enough to drive a cart of tobacco through, and drives one.",
          "A word you left out of the act you drafted turns out to have been the important one. The courts argue about it for six months.",
        ]);
      }
      colonyMod(g, n, "later:draft", "Laws that hold", Y, { unrest: -1 });
      return pick(w, [
        "The laws you drafted are tried at the general court and hold: the lawyers grumble, the counties obey.",
        "The act you drafted is tried in three county courts and means the same thing in each, which the old judges call unheard of.",
      ]);
    },
  },
  muster: {
    well: "the militia turns out quicker: steadier, and unrest −1 for a year",
    badly: "the drill's forgotten: nothing",
    days: [120, 240],
    needsPass: false,
    p: 0.6,
    pWar: 0.8,
    war: "any",
    pending: () => "the militia you mustered",
    come: (g, n, w) => {
      if (!w.good)
        return pick(w, [
          "The drill from your muster is half forgotten by the harvest; the sergeants swear it never happened.",
          "The militia you mustered remembers the drink better than the drill.",
        ]);
      colonyMod(g, n, "later:muster", "A militia that knows its drums", Y, {
        morale: 0.03,
        unrest: -1,
      });
      return pick(w, [
        "The militia you mustered turns out quicker now: the counties know their drums, and the drummers know the counties.",
        "When the alarm comes, the militia you mustered is on the green within the hour with its powder dry. The counties sleep better for it.",
      ]);
    },
  },
  treat: {
    well: "their traders come down (or a neighbouring colony's sloops come in): +4 toward the colony, trade +1% for two years",
    badly:
      "raiders from over the line strike a frontier county anyway: −3, and the county's unrest +2",
    days: [180, 365],
    needsPass: true,
    p: 0.7,
    arg2: (g, n) => roadCounty(g, n),
    pending: (g, n, w) =>
      g.s.nations[w.arg]?.kind === "native"
        ? `the belts you gave the ${nameOf(g, w.arg)}`
        : `the treaty you made with ${g.s.nations[w.arg]?.name ?? "the neighbours"}`,
    come: (g, n, w) => {
      const o = w.arg;
      const x = g.s.nations[o];
      if (!x?.alive) return "";
      // A crown's colony: its traders and its governor, not belts and young men.
      if (x.kind !== "native") {
        if (w.good) {
          relate(g, o, n, "A treaty remembered", 4, 4);
          colonyMod(
            g,
            n,
            "later:treat",
            `${x.adjective} traders in the ports`,
            2 * Y,
            {
              production: 0.01,
            },
          );
          return pick(w, [
            `The treaty you made with ${x.name} holds: ${x.adjective} sloops come into ${county(g, g.s.nations[n].capital)} with their cargoes, and the frontier is quieter.`,
            `The ${x.adjective} governor writes to thank the colony for the treaty you made; his merchants write more warmly still, with bills of lading.`,
          ]);
        }
        relate(g, o, n, "A treaty broken on the frontier", -3, 3);
        countyMod(g, w.arg2, "later:raid", "Raided, treaty or no treaty", Y, {
          unrest: 2,
        });
        return `The ${x.adjective} commandant on the frontier didn't hold with the treaty you made: raiders from over the line in ${county(g, w.arg2)}, whatever his governor promised.`;
      }
      if (w.good) {
        relate(g, o, n, "A treaty remembered", 4, 4);
        colonyMod(
          g,
          n,
          "later:treat",
          "Traders down from the interior",
          2 * Y,
          {
            production: 0.01,
          },
        );
        return pick(w, [
          `The belts you gave the ${nameOf(g, o)} are remembered: their traders come down to ${county(g, g.s.nations[n].capital)} with furs, and the paths are open.`,
          `The ${nameOf(g, o)}'s traders come down to ${county(g, g.s.nations[n].capital)} with furs and the belt you gave them, and show it to anyone who'll look.`,
        ]);
      }
      relate(g, o, n, "Young men who didn't hold with the treaty", -3, 3);
      countyMod(g, w.arg2, "later:raid", "Raided, treaty or no treaty", Y, {
        unrest: 2,
      });
      return pick(w, [
        `The ${nameOf(g, o)}'s young men didn't hold with the treaty you made: a raid on ${county(g, w.arg2)}, whatever their elders promised.`,
        `A party of the ${nameOf(g, o)}'s young men raid ${county(g, w.arg2)} all the same. Their sachems send word that they're sorry, and that young men are young men.`,
      ]);
    },
  },
  mission: {
    well: "a school among them: +4 toward the colony",
    badly: "the mission comes home: −3",
    days: [365, 600],
    needsPass: false,
    p: 0.65,
    pending: (g, n, w) => `the mission among the ${nameOf(g, w.arg)}`,
    come: (g, n, w) => {
      const o = w.arg;
      if (!g.s.nations[o]?.alive) return "";
      if (w.good) {
        relate(g, o, n, "A school among us", 4, 5);
        return pick(w, [
          `The mission you sent among the ${nameOf(g, o)} has a school with a dozen scholars and a grammar of their tongue. Their sachems speak warmly of you, and correct the missionary's grammar.`,
          `The mission you sent among the ${nameOf(g, o)} has a schoolhouse, a garden and the sachems' grandchildren reading in two tongues.`,
        ]);
      }
      relate(g, o, n, "Missionaries who preached more than they taught", -3, 3);
      return pick(w, [
        `The mission you sent among the ${nameOf(g, o)} comes home thin and frightened: the sachems wanted the school and not the sermons, and said so at length.`,
        `The mission you sent among the ${nameOf(g, o)} is asked to leave, politely, after the missionary tells a council its dreams are the Devil's.`,
      ]);
    },
  },
  address: {
    well: "a grievance redressed: unrest −1 for a year, and renown +2",
    badly: "four pages of thanks and nothing conceded",
    days: [60, 150],
    needsPass: false,
    p: 0.5,
    pending: () => "the governor's answer to the house's address",
    come: (g, n, w) => {
      if (w.good) {
        colonyMod(g, n, "later:address", "The house's grievances heard", Y, {
          unrest: -1,
        });
        const life = lifeOfC(g.s, w.by);
        if (life) addRenown(g, life, 2);
        return pick(w, [
          "The governor answers the house's address you carried: the fees of the secretary's office are cut, and the counties drink your health.",
          "The governor grants two of the grievances in the house's address you carried and promises a third. The counties drink your health.",
          "Word comes that the sheriffs' fees are cut, as the house's address you carried asked. You're toasted in every county town.",
        ]);
      }
      return pick(w, [
        "The governor's answer to the house's address you carried arrives: four pages thanking the house for its loyalty, and conceding nothing.",
        "The governor answers the house's address you carried by conceding nothing, at length, in a beautiful hand. The court party calls it statesmanship.",
      ]);
    },
  },
};

/** The chance a work turns out well, as things stand. */
export function laterChance(
  s: GameState,
  n: number,
  def: LaterDef,
  arg: number,
): number {
  if (def.pWar === undefined) return def.p;
  const war =
    def.war === "target"
      ? atWar(s, n, arg)
      : s.wars.some((w) => w.a === n || w.b === n);
  return war ? def.pWar : def.p;
}

/** What a councillor's work still has to come, and what it came to lately (this nation). */
export function laterOf(s: GameState, n: number): LaterWork[] {
  return s.power?.cabinets[n]?.later ?? [];
}

/** Work is done: if it comes to something later, put it on the list. */
function scheduleLater(
  g: ConquestGame,
  n: number,
  by: number,
  key: string,
  arg: number,
  pass: boolean,
  text: string,
): void {
  const def = LATER[key];
  if (!def || (def.needsPass && !pass)) return;
  // A mission sent home at once (or worse) has nothing to come to.
  if (key === "mission" && /ends badly/.test(text)) return;
  const s = g.s;
  const cab = ensureCabinet(g, n);
  const id = g.nextId();
  const r = cdice(s, 21, n, id);
  const [lo, hi] = def.days;
  const w: LaterWork = {
    id,
    key,
    by,
    arg,
    arg2: def.arg2?.(g, n, arg) ?? -1,
    day: s.day,
    due: s.day + lo + Math.floor(r.next() * (hi - lo + 1)),
    good: r.next() < laterChance(g.s, n, def, arg),
  };
  cab.later = [...(cab.later ?? []), w];
  powerChanged(g, `c${n}`);
}

/** Each day: work that's due comes to something. */
function laterDaily(g: ConquestGame): void {
  const s = g.s;
  for (const cab of Object.values(s.power?.cabinets ?? {})) {
    if (!cab.later?.length) continue;
    let changed = false;
    for (const w of cab.later) {
      if (w.text !== undefined || s.day < w.due) continue;
      changed = true;
      const def = LATER[w.key];
      const nation = s.nations[cab.n];
      if (!def || !nation?.alive) {
        w.text = "";
        continue;
      }
      w.text = def.come(g, cab.n, w);
      w.tone = w.good ? "good" : "bad";
      const life = lifeOfC(s, w.by);
      if (life && w.text && s.chars[w.by]?.alive) {
        touchLife(g, life);
        journal(g, life, w.text, w.tone);
      }
    }
    if (!changed) continue;
    // Keep what's still to come, and the last few that came (two years).
    const open = cab.later.filter((w) => w.text === undefined);
    const done = cab.later
      .filter((w) => w.text && s.day - w.due < 2 * Y)
      .slice(-8);
    cab.later = [...done, ...open];
    powerChanged(g, `c${cab.n}`);
  }
}

/** For the page: "a road through Henrico". */
export function pendingWords(g: G, n: number, w: LaterWork): string {
  return (
    LATER[w.key]?.pending(g, n, w) ??
    SEAT_ACTION_BY_KEY.get(w.key)?.label ??
    w.key
  );
}

/** The seat powers whose work comes to something later, for the guide. */
export function laterKeys(): string[] {
  return Object.keys(LATER);
}

registerLaterWork(scheduleLater);
hooks.daily.push(laterDaily);
