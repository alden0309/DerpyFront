// CHAIR (r16): marks of greatness. What a governor (or anyone with money
// and a name) can buy to be remembered by: a great house with gardens and
// his name over the gate, a coach and four in his livery, portraits by the
// limners of the day, and endowments that carry his name (a grammar school, a
// charity for the poor, a scholarship at the college, a ring of bells, a library for
// the colony). Each costs what's on its button, some cost a little a month
// (a line in the month's figure), and each does something real: renown,
// favour at home, the regard of the council and the governor, the colony's
// order or its learning, and a line in the story of your life.

import { councillors } from "./Council";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { withFlow } from "./LedgerCore";
import {
  addRenown,
  addStress,
  gainXp,
  journal,
  milestone,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import {
  Check,
  hasKit,
  isChildLife,
  isPlayed,
  lifeIsNative,
  meOf,
  no,
  yes,
} from "./LifeQueries";
import type { World } from "./Map";
import { buyKit, kitPrice } from "./Money";
import { buyHouse, houseOf, housePrice, ownedHouse } from "./Property";
import { ageOf, charName, yearOf } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import type {
  ChairCommand,
  GameState,
  Life,
  LifeCommand,
  ModFx,
} from "./Types";

/** A mark of greatness: what it is, what it costs, what it does, what it leaves. */
export interface GreatDef {
  key: string;
  /** The kind of thing, for grouping on the page. */
  kind: "house" | "portrait" | "endowment";
  /** What it is, for anyone ("A grammar school in your name"). */
  title: string;
  /** Its own price (a hall also wants a mansion, a coach a carriage). */
  base: number;
  /** Its name, for you ("Lee Hall", "The Lee Grammar School"). */
  name: (s: GameState, w: World, life: Life) => string;
  /** What it is, in a line. */
  text: string;
  /** What else it does, in words (beyond its renown and favour). */
  does: string;
  /** What it costs here and now. */
  cost: (s: GameState, life: Life) => number;
  /** Its keep a month while it stands. */
  upkeep?: number;
  renown: number;
  favor?: number;
  /** Renown a month while it stands. */
  glow?: number;
  /** Why it can't be had now (beyond the money). */
  needs?: (s: GameState, w: World, life: Life) => string | null;
  /** The line in your life's story. */
  legacy: (s: GameState, w: World, life: Life) => string;
  /** Whatever else it does when it's bought. */
  apply?: (g: ConquestGame, life: Life) => void;
}

const familyOf = (s: GameState, life: Life) =>
  meOf(s, life)?.family ?? life.name;
const homeName = (w: World, life: Life) =>
  w.map.provinces[life.home]?.name ?? "home";

/** The hall's gardens and grounds, beyond the mansion's own keep. */
const HALL_EXTRA = 140;
/** The coach's four horses, coachman and liveries, beyond a carriage. */
const COACH_EXTRA = 110;

function natMod(
  g: ConquestGame,
  n: number,
  key: string,
  label: string,
  years: number,
  fx: Partial<Record<ModFx, number>>,
): void {
  const x = g.nation(n);
  x.mods = x.mods.filter((m) => m.key !== key);
  x.mods.push({
    key,
    label,
    until: g.s.day + Math.round(years * DAYS_PER_YEAR),
    fx,
  });
}

function provMod(
  g: ConquestGame,
  p: number,
  key: string,
  label: string,
  years: number,
  fx: Partial<Record<ModFx, number>>,
): void {
  const pr = g.prov(p);
  pr.mods = pr.mods.filter((m) => m.key !== key);
  pr.mods.push({
    key,
    label,
    until: g.s.day + Math.round(years * DAYS_PER_YEAR),
    fx,
  });
}

/** The great of the colony (its governor and council) remember a kindness. */
function theGreatRemember(
  g: ConquestGame,
  life: Life,
  why: string,
  value: number,
): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return;
  const n = me.nation;
  const ids = new Set<number>(councillors(s, n).map((x) => x.c));
  ids.add(s.nations[n]?.ruler ?? -1);
  for (const id of [...ids].sort((a, b) => a - b)) {
    const c = s.chars[id];
    if (!c?.alive || c.id === me.id || isPlayed(s, c.id)) continue;
    remembers(g, life, g.char(c.id), why, value, 4);
  }
}

// ---------------------------------------------------------------- the limners and the colleges

/** Who'd paint you, by the year and your people. */
export function limnerOf(s: GameState, w: World, life: Life): string {
  const me = meOf(s, life);
  const y = yearOf(s);
  const culture = me ? s.nations[me.nation]?.culture : "english";
  if (culture === "french") return "a painter lately come from Paris";
  if (culture === "spanish") return "a painter of the Mexican school";
  if (culture === "dutch") return "a painter from Amsterdam";
  if (culture === "swedish") return "a painter from Stockholm";
  if (culture === "portuguese") return "a painter from Lisbon";
  const lat = w.map.provinces[life.home]?.lat ?? 38;
  if (y < 1680) return "a travelling limner who paints in the old way";
  if (y < 1700) return "Captain Thomas Smith of Boston";
  if (y < 1708) return "a portrait painter lately come from London";
  if (y < 1729)
    return lat < 36
      ? "Henrietta Johnston, in pastels"
      : lat < 40
        ? "Justus Engelhardt Kühn"
        : "Gerardus Duyckinck";
  if (y < 1749) return "John Smibert";
  if (y < 1758) return "John Wollaston";
  if (y < 1766) return "Joseph Blackburn";
  return lat < 40.2 ? "Charles Willson Peale" : "John Singleton Copley";
}

/** The college a scholarship would be at, by the year and where you live. */
export function collegeOf(s: GameState, w: World, life: Life): string {
  const me = meOf(s, life);
  const y = yearOf(s);
  const culture = me ? s.nations[me.nation]?.culture : "english";
  if (culture === "french") return "the Jesuits' college at Quebec";
  if (culture === "spanish") return "the Royal University of Mexico";
  if (culture === "dutch") return "the University of Leiden";
  if (culture === "swedish") return "the University of Uppsala";
  if (culture === "portuguese") return "the University of Coimbra";
  const lat = w.map.provinces[life.home]?.lat ?? 38;
  if (lat >= 41.5) return "Harvard College";
  if (lat >= 40.5)
    return y >= 1754
      ? "King's College in New York"
      : y >= 1701
        ? "the collegiate school at New Haven"
        : "Harvard College";
  if (lat >= 39.5 && y >= 1755) return "the College of Philadelphia";
  return y >= 1693 ? "the College of William and Mary" : "Harvard College";
}

// ---------------------------------------------------------------- the marks

const named = (s: GameState, life: Life): string | null =>
  life.renown < 30
    ? "Something to bear your name wants a name to bear (renown 30)"
    : null;

export const GREAT: GreatDef[] = [
  {
    key: "hall",
    kind: "house",
    title: "A great house with your name",
    base: HALL_EXTRA,
    name: (s, w, life) => `${familyOf(s, life)} Hall`,
    text: "A mansion with gardens, a ballroom and your name over the gate.",
    does: "The great dine there: the governor's and the council's regard +6. A mansion's station, and renown while it stands.",
    cost: (s, life) =>
      (ownedHouse(life, life.home)?.level === 4
        ? 0
        : housePrice(s, { ...life, prov: life.home }, 4)) + HALL_EXTRA,
    upkeep: 1.5,
    renown: 12,
    glow: 0.3,
    needs: (s, w, life) => {
      if (life.prov !== life.home) return "At home: it's built where you live";
      if (lifeIsNative(s, life)) return "Not your people's way";
      return named(s, life);
    },
    legacy: (s, w, life) =>
      `Built ${familyOf(s, life)} Hall at ${homeName(w, life)}, with its gardens`,
    apply: (g, life) => {
      const s = g.s;
      if (ownedHouse(life, life.home)?.level !== 4) {
        const err = buyHouse(g, life, 4);
        if (err) throw new Error(err);
      }
      withFlow(g, { key: "great:hall", label: "Marks of greatness" }, () =>
        spend(g, life, HALL_EXTRA),
      );
      const h = houseOf(life, life.home);
      if (h) h.name = `${familyOf(s, life)} Hall`;
      theGreatRemember(g, life, `Dined at ${familyOf(s, life)} Hall`, 6);
    },
  },
  {
    key: "coach",
    kind: "house",
    title: "A coach and four",
    base: COACH_EXTRA,
    name: () => "A coach and four",
    text: "Four matched horses, a coachman and footmen in your livery, and your arms on the doors.",
    does: "Journeys at a carriage's pace; the town notices you pass (the council's regard +3), and renown while you keep it.",
    cost: (s, life) =>
      (hasKit(s, life, "carriage") ? 0 : kitPrice(s, life, "carriage")) +
      COACH_EXTRA,
    upkeep: 1.5,
    renown: 6,
    glow: 0.2,
    needs: (s, w, life) =>
      lifeIsNative(s, life) ? "Not your people's way" : null,
    legacy: (s, w, life) =>
      `Drove a coach and four with the ${familyOf(s, life)} arms on its doors`,
    apply: (g, life) => {
      if (!hasKit(g.s, life, "carriage")) {
        const err = buyKit(g, life, "carriage");
        if (err) throw new Error(err);
      }
      withFlow(g, { key: "great:coach", label: "Marks of greatness" }, () =>
        spend(g, life, COACH_EXTRA),
      );
      theGreatRemember(g, life, "Admired the coach and four", 3);
    },
  },
  {
    key: "portrait",
    kind: "portrait",
    title: "Your portrait",
    base: 30,
    name: (s, w, life) => `Your likeness by ${limnerOf(s, w, life)}`,
    text: "Sit for your portrait, in your best coat, with a column and a curtain behind.",
    does: "Calm (stress −3), and a likeness your heirs will hang.",
    cost: () => 30,
    renown: 3,
    legacy: (s, w, life) => `Sat to ${limnerOf(s, w, life)} for a likeness`,
    apply: (g, life) => addStress(g, life, -3),
  },
  {
    key: "portrait-spouse",
    kind: "portrait",
    title: "Your husband's or wife's portrait",
    base: 30,
    name: (s, w, life) => {
      const sp = s.chars[meOf(s, life)?.spouse ?? -1];
      return `${sp ? `${sp.first}'s` : "Your husband's or wife's"} likeness`;
    },
    text: "A portrait to hang beside yours.",
    does: "Your husband or wife thinks the better of you (+10).",
    cost: () => 30,
    renown: 2,
    needs: (s, w, life) => {
      const sp = s.chars[meOf(s, life)?.spouse ?? -1];
      return sp?.alive ? null : "You have no husband or wife living";
    },
    legacy: (s, w, life) => {
      const sp = s.chars[meOf(s, life)?.spouse ?? -1];
      return `Had ${sp ? charName(sp) : "a spouse"}'s likeness taken by ${limnerOf(s, w, life)}`;
    },
    apply: (g, life) => {
      const sp = g.s.chars[meOf(g.s, life)?.spouse ?? -1];
      if (sp?.alive && !isPlayed(g.s, sp.id))
        remembers(g, life, g.char(sp.id), "Had my likeness taken", 10, 8);
    },
  },
  {
    key: "portrait-family",
    kind: "portrait",
    title: "A family piece",
    base: 70,
    name: (s, w, life) =>
      `The ${familyOf(s, life)} family, a conversation piece`,
    text: "The whole family on one canvas: the dog, the spaniel, the view of the river.",
    does: "Calm (stress −4), and the family's regard; it hangs in the hall for generations.",
    cost: () => 70,
    renown: 5,
    needs: (s, w, life) => {
      const me = meOf(s, life);
      if (!s.chars[me?.spouse ?? -1]?.alive)
        return "You have no husband or wife living";
      if (!me?.children.some((c) => s.chars[c]?.alive))
        return "Children, for a family piece";
      return null;
    },
    legacy: (s, w, life) =>
      `Had the ${familyOf(s, life)} family painted by ${limnerOf(s, w, life)}`,
    apply: (g, life) => {
      addStress(g, life, -4);
      const me = meOf(g.s, life);
      for (const id of [me?.spouse ?? -1, ...(me?.children ?? [])]) {
        const c = g.s.chars[id];
        if (c?.alive && !isPlayed(g.s, c.id))
          remembers(g, life, g.char(c.id), "Painted with the family", 6, 8);
      }
    },
  },
  {
    key: "school",
    kind: "endowment",
    title: "A grammar school in your name",
    base: 180,
    name: (s, w, life) => `The ${familyOf(s, life)} Grammar School`,
    text: "A schoolhouse, a master's salary for ever to teach Latin and Greek to the colony's sons, and your name over the door.",
    does: "The colony's administration +1 for 25 years.",
    cost: () => 180,
    renown: 10,
    favor: 3,
    needs: (s, w, life) => named(s, life),
    legacy: (s, w, life) =>
      `Founded the ${familyOf(s, life)} Grammar School at ${homeName(w, life)}`,
    apply: (g, life) => {
      const me = meOf(g.s, life)!;
      natMod(
        g,
        me.nation,
        `great:school:${me.id}`,
        `The ${me.family} Grammar School`,
        25,
        { admin: 1 },
      );
    },
  },
  {
    key: "almshouse",
    kind: "endowment",
    title: "A charity for the poor in your name",
    base: 200,
    name: (s, w, life) => `The ${familyOf(s, life)} Charity`,
    text: "Bread, firewood and a physician for the poor of the parish every winter, for ever, paid from your endowment.",
    does: "Unrest in your county −3 for 25 years.",
    cost: () => 200,
    renown: 10,
    favor: 2,
    needs: (s, w, life) => named(s, life),
    legacy: (s, w, life) =>
      `Endowed the ${familyOf(s, life)} Charity for the poor of ${homeName(w, life)}`,
    apply: (g, life) => {
      const me = meOf(g.s, life)!;
      provMod(
        g,
        life.home,
        `great:alms:${me.id}`,
        `The ${me.family} Charity`,
        25,
        { unrest: -3 },
      );
    },
  },
  {
    key: "college",
    kind: "endowment",
    title: "A scholarship at the college",
    base: 260,
    name: (s, w, life) =>
      `The ${familyOf(s, life)} scholarship at ${collegeOf(s, w, life)}`,
    text: "A scholar's keep for ever, to be called by your name in every list of the college's benefactors.",
    does: "Favour at home (the crown likes a learned colony), and the colony's administration +1 for 30 years.",
    cost: () => 260,
    renown: 14,
    favor: 4,
    needs: (s, w, life) => named(s, life),
    legacy: (s, w, life) =>
      `Endowed the ${familyOf(s, life)} scholarship at ${collegeOf(s, w, life)}`,
    apply: (g, life) => {
      const me = meOf(g.s, life)!;
      natMod(
        g,
        me.nation,
        `great:college:${me.id}`,
        `The ${me.family} scholarship`,
        30,
        { admin: 1 },
      );
    },
  },
  {
    key: "bells",
    kind: "endowment",
    title: "A ring of bells for the church",
    base: 120,
    name: (s, w, life) =>
      `A ring of bells for the church at ${homeName(w, life)}`,
    text: "Six bells cast in London, with your name on the tenor.",
    does: "The parish's regard; unrest in your county −1 for 10 years.",
    cost: () => 120,
    renown: 8,
    favor: 1,
    needs: (s, w, life) => {
      const me = meOf(s, life);
      if (me?.religion === "native") return "Not your people's way";
      return named(s, life);
    },
    legacy: (s, w, life) =>
      `Gave the church at ${homeName(w, life)} its ring of bells`,
    apply: (g, life) => {
      const me = meOf(g.s, life)!;
      provMod(g, life.home, `great:bells:${me.id}`, "A ring of bells", 10, {
        unrest: -1,
      });
    },
  },
  {
    key: "library",
    kind: "endowment",
    title: "A library for the colony",
    base: 150,
    name: (s, w, life) =>
      `A library for ${s.nations[meOf(s, life)?.nation ?? -1]?.name.replace(/^the /, "") ?? "the colony"}`,
    text: "Divinity, law, physic and history, in a room anyone of the colony may read in.",
    does: "Your letters grow; the colony's administration +1 for 15 years.",
    cost: () => 150,
    renown: 8,
    favor: 2,
    needs: (s, w, life) => named(s, life),
    legacy: (s, w, life) =>
      `Gave ${s.nations[meOf(s, life)?.nation ?? -1]?.name.replace(/^the /, "") ?? "the colony"} a library`,
    apply: (g, life) => {
      const me = meOf(g.s, life)!;
      gainXp(g, life, "letters", 20);
      natMod(
        g,
        me.nation,
        `great:library:${me.id}`,
        "A library for the colony",
        15,
        { admin: 1 },
      );
    },
  },
];

export const GREAT_BY_KEY = new Map(GREAT.map((x) => [x.key, x]));

/** Whether a mark you have still stands (a hall still yours, a coach still kept). */
export function greatStands(s: GameState, life: Life, key: string): boolean {
  if (life.chair?.great?.[key] === undefined) return false;
  if (key === "hall") return ownedHouse(life, life.home)?.level === 4;
  if (key === "coach") return hasKit(s, life, "carriage");
  return true;
}

/**
 * Whether you have this mark now: a hall or a coach while it stands; a
 * portrait if it's of you (an heir sits for their own); an endowment once
 * for the line (it carries the family's name).
 */
export function greatHad(s: GameState, life: Life, key: string): boolean {
  const def = GREAT_BY_KEY.get(key);
  if (!def || life.chair?.great?.[key] === undefined) return false;
  if (def.kind === "house") return greatStands(s, life, key);
  if (def.kind === "portrait") return life.chair.sitter?.[key] === life.c;
  return true;
}

/** Can you have this mark of greatness now. */
export function greatCheck(
  s: GameState,
  w: World,
  life: Life,
  key: string,
): Check {
  const def = GREAT_BY_KEY.get(key);
  if (!def) return no("No such thing.");
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (isChildLife(s, life) || ageOf(s, me) < 18)
    return no("Not until you're grown.");
  if (life.travel) return no("Not from the road.");
  if (greatHad(s, life, key))
    return no(def.kind === "house" ? "You have it." : "You've done it.");
  const why = def.needs?.(s, w, life);
  if (why) return no(why);
  const cost = def.cost(s, life);
  if (life.purse < cost) return no(`It costs ${cost} coins.`);
  return yes;
}

/** Have it. */
export function buyGreat(
  g: ConquestGame,
  life: Life,
  key: string,
): string | null {
  const s = g.s;
  const check = greatCheck(s, g.w, life, key);
  if (!check.ok) return check.why;
  const def = GREAT_BY_KEY.get(key)!;
  const cost = def.cost(s, life);
  const name = def.name(s, g.w, life);
  try {
    if (def.apply && (key === "hall" || key === "coach")) def.apply(g, life);
    else {
      withFlow(g, { key: `great:${key}`, label: "Marks of greatness" }, () =>
        spend(g, life, cost),
      );
      def.apply?.(g, life);
    }
  } catch (e) {
    return (e as Error).message;
  }
  touchLife(g, life);
  life.chair ??= {};
  life.chair.great = { ...(life.chair.great ?? {}), [key]: s.day };
  if (def.kind === "portrait")
    life.chair.sitter = { ...(life.chair.sitter ?? {}), [key]: life.c };
  addRenown(g, life, def.renown);
  if (def.favor)
    life.favor = Math.min(100, Math.round((life.favor + def.favor) * 10) / 10);
  journal(g, life, `${name}: ${def.text} (${cost} coins.)`, "good");
  milestone(g, life, "renown", def.legacy(s, g.w, life), life.home);
  return null;
}

/** Your marks of greatness, for your story: name and the day each was had. */
export function legacyOf(
  s: GameState,
  w: World,
  life: Life,
): { key: string; day: number; text: string }[] {
  const got = life.chair?.great ?? {};
  return Object.entries(got)
    .map(([key, day]) => ({
      key,
      day,
      text: GREAT_BY_KEY.get(key)?.legacy(s, w, life) ?? key,
    }))
    .sort((a, b) => a.day - b.day);
}

// ---------------------------------------------------------------- the months

/** Their keep, in the month's figure. */
function greatBudget(
  s: GameState,
  life: Life,
): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  for (const def of GREAT) {
    if (!def.upkeep || !greatStands(s, life, def.key)) continue;
    out.push({
      label:
        def.key === "hall"
          ? "Keep: the hall's gardens and grounds"
          : "Keep: the coach's four and the liveries",
      value: -def.upkeep,
    });
  }
  return out;
}

/** What still stands keeps your name in people's mouths. */
function greatMonthly(g: ConquestGame, life: Life): void {
  const s = g.s;
  if (life.watching || life.c < 0) return;
  let glow = 0;
  for (const def of GREAT)
    if (def.glow && greatStands(s, life, def.key)) glow += def.glow;
  if (glow) addRenown(g, life, glow);
}

function greatCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "chair") return undefined;
  const x = c as ChairCommand;
  if (x.act !== "great") return undefined;
  return buyGreat(g, life, x.key ?? "");
}

hooks.command.push(greatCommand);
hooks.budget.push(greatBudget);
hooks.lifeMonthly.push(greatMonthly);
