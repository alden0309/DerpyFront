// CHAMBER (r16): the council's business. A councillor used to vote aye or no
// on the same few measures ("Presents for the Haudenosaunee" four times in
// fourteen months). Now the governor (or a county, or a councillor) brings
// business that differs and matters: war and peace with the nations beyond
// the line, the colony's quota for the crown's war, a boundary disputed with
// a neighbour, petitions from the counties, an inquiry into the treasury, a
// guard ship against the pirates, a quarantine, a college, a lottery, the
// bounty on naval stores, the inspection of the staple, a new county; and
// the old business too (taxes, presents, forts, grants, the remittance).
//
// No kind of business comes before the council twice in a year (the
// docket), and each says which factions care which way, so they remember.

import { cdice } from "./ChamberCore";
import {
  disgrace,
  dismissCouncillor,
  ensureCabinet,
  neighboursOf,
  registerBusiness,
  registerDocketWait,
  registerMeasures,
  relate,
  type MeasureDef,
} from "./Council";
import { seatHolderId } from "./CouncilTitles";
import { frontierProv } from "./Factions";
import type { ConquestGame } from "./Game";
import { isPlayed } from "./LifeQueries";
import { powerChanged } from "./PowerCore";
import {
  atWar,
  charName,
  provincesOf,
  settlers,
  strengthOf,
  treatyBetween,
  warriorsOf,
} from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { hash01 } from "./SocietyCore";
import type { FactionKey, GameState, MapDef, ModFx, Nation } from "./Types";
import { militaryCommand } from "./War";

/** No kind of business twice in a year. */
export const DOCKET_REST = 365;

type G = { s: GameState; map: MapDef };

/** A kind of business, as the council's docket knows it. */
export interface BusinessDef {
  key: string;
  /** What it is, for the guide: "War against a nation beyond the line". */
  label: string;
  /** When it comes, for the guide. */
  due: string;
  /** If it's due now, what it's about (a province, a nation, -1), else null. */
  when: (g: ConquestGame, n: number) => number | null;
  /** How likely, among what's due. */
  weight: number;
  /** Which way each faction leans on an aye (+ for, − against, 1 or 2). */
  cares: Partial<Record<FactionKey, number>>;
  /** Who brings it (a character); the governor if not given. */
  by?: (g: ConquestGame, n: number, arg: number) => number;
  /** Its key on the docket (one petition of each kind a year, not one in all). */
  docket?: (arg: number) => string;
  /** Only ever once in a colony. */
  once?: boolean;
}

// ---------------------------------------------------------------- helpers

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

const Y = DAYS_PER_YEAR;
const yearOfDay = (day: number) => 1607 + Math.floor(day / Y);
const shortName = (x: Nation | undefined) =>
  (x?.name ?? "them").replace(/^the /, "");

const relationValue = (s: GameState, of: number, about: number) =>
  (s.nations[of]?.relations[about] ?? [])
    .filter((m) => m.until === 0 || m.until > s.day)
    .reduce((t, m) => t + m.value, 0);

const avgUnrest = (s: GameState, n: number) => {
  const provs = provincesOf(s, n);
  return (
    provs.reduce((m, p) => m + s.provinces[p].unrest, 0) /
    Math.max(1, provs.length)
  );
};

const atWarAny = (s: GameState, n: number) =>
  s.wars.some((w) => w.a === n || w.b === n);

const spend = (g: ConquestGame, n: number, gold: number): boolean => {
  if (g.s.nations[n].gold < gold) return false;
  g.nation(n).gold -= gold;
  return true;
};

/** A colony's counties on the frontier (a native nation or open country next door), by name. */
function frontierCounties(g: G, n: number): number[] {
  return provincesOf(g.s, n)
    .filter((p) => frontierProv(g.s, p))
    .sort((a, b) => a - b);
}

/** The native nations next door, worst relations first. */
function nativesNear(g: ConquestGame, n: number): number[] {
  return neighboursOf(g, n)
    .filter((o) => g.s.nations[o].kind === "native")
    .sort(
      (a, b) => relationValue(g.s, a, n) - relationValue(g.s, b, n) || a - b,
    );
}

/** A colony at war with a power in Europe's quarrel: who. */
function crownEnemy(s: GameState, n: number): number {
  const w = s.wars.find(
    (x) =>
      x.europe &&
      (x.a === n || x.b === n) &&
      s.nations[x.a === n ? x.b : x.a]?.kind === "power",
  );
  return w ? (w.a === n ? w.b : w.a) : -1;
}

/** A member of the house who lives in a county (the computer's), or -1. */
function memberFor(s: GameState, n: number, p: number): number {
  const list = (s.polities[n]?.assembly ?? []).filter(
    (c) => s.chars[c]?.alive && s.chars[c].home === p && !isPlayed(s, c),
  );
  return list.length ? Math.min(...list) : -1;
}

/** A computer councillor in a seat, or the governor. */
const seatOrGov =
  (seat: "marshal" | "envoy" | "surveyor" | "attorney" | "treasurer") =>
  (g: ConquestGame, n: number) => {
    const id = seatHolderId(g.s, n, seat);
    return id >= 0 && g.s.chars[id]?.alive && !isPlayed(g.s, id)
      ? id
      : g.s.nations[n].ruler;
  };

// ---------------------------------------------------------------- petitions from the counties

/** What a county petitions for. */
export const PETITIONS = [
  {
    key: "relief",
    what: "relief after a hard year",
    cost: 8,
    does: "the county's unrest −4 for a year",
  },
  {
    key: "rangers",
    what: "rangers against raiders",
    cost: 8,
    does: "the county's unrest −3 and its people steadier for a year",
  },
  {
    key: "ferry",
    what: "a ferry and a road to the landing",
    cost: 10,
    does: "the county's trade +4% for ten years",
  },
  {
    key: "courthouse",
    what: "a court-house and a prison",
    cost: 10,
    does: "the county's unrest −2 for five years",
  },
] as const;

const petitionOf = (arg: number) => ({
  p: Math.floor(arg / 8),
  need: PETITIONS[arg % 8] ?? PETITIONS[3],
});

/** The county that most wants something, and what (as one number: county × 8 + need). */
function petitionDue(g: ConquestGame, n: number): number | null {
  const s = g.s;
  const provs = provincesOf(s, n).filter((p) => settlers(s.provinces[p]) > 0);
  if (!provs.length) return null;
  const out: { p: number; need: number; w: number }[] = [];
  for (const p of provs) {
    const pr = s.provinces[p];
    if (pr.devastation > 0.08 || pr.unrest > 30)
      out.push({ p, need: 0, w: 3 + pr.unrest / 20 });
    if (frontierProv(s, p) && atWarAny(s, n)) out.push({ p, need: 1, w: 2.5 });
    else if (frontierProv(s, p)) out.push({ p, need: 1, w: 0.6 });
    if (g.map.provinces[p]?.coastal) out.push({ p, need: 2, w: 0.8 });
    out.push({ p, need: 3, w: 0.5 });
  }
  // The same county isn't always first: the month's own pick, weighted.
  const r = cdice(s, 11, n, Math.floor(s.day / 30)).next();
  const total = out.reduce((m, x) => m + x.w, 0);
  let roll = r * total;
  for (const x of out) {
    roll -= x.w;
    if (roll <= 0) return x.p * 8 + x.need;
  }
  const last = out[out.length - 1];
  return last.p * 8 + last.need;
}

// ---------------------------------------------------------------- the treasury

/** Whether the treasury's keeper (the computer's) has a hand in the till. */
function treasurerGuilty(s: GameState, n: number): boolean {
  const id = seatHolderId(s, n, "treasurer");
  const c = s.chars[id];
  if (!c?.alive) return false;
  if (c.scheme?.kind === "embezzle") return true;
  return (
    c.traits.includes("greedy") || hash01(id, n, yearOfDay(s.day), 19) < 0.3
  );
}

// ---------------------------------------------------------------- the measures

const MEASURES_R16: Record<string, MeasureDef> = {
  "native-war": {
    title: (g, n, o) =>
      `War against the ${shortName(g.s.nations[o])} for the raids on the frontier`,
    text: "The militia and the rangers sent against them: the backcountry avenged, or a frontier in flames. A war the colony must then fight.",
    lean: { marshal: 3, envoy: -3, treasurer: -1, chaplain: -1 },
    country: 1,
    gov: 0,
    cares: { frontier: 2, merchants: -2, clergy: -1 },
    blocked: (s, n, o) =>
      s.nations[o]?.alive && s.nations[o].kind === "native"
        ? atWar(s, n, o)
          ? "At war with them already."
          : null
        : "They're gone.",
    apply: (g, n, o) => {
      const err = militaryCommand(g, n, { k: "war", n: o });
      if (err) return `!${err}`;
      return `War is declared on the ${shortName(g.s.nations[o])}. The drums beat on every green; in the backcountry they're loading their own.`;
    },
    lost: (g, n, o) => {
      for (const p of frontierCounties(g, n).slice(0, 3))
        countyMod(g, p, "council:nowar", "The council wouldn't avenge us", Y, {
          unrest: 2,
        });
      return `The backcountry hears that the council won't make war on the ${shortName(g.s.nations[o])}, and says what it thinks of councillors who sleep behind walls.`;
    },
  },
  "native-peace": {
    title: (g, n, o) => `Treat for peace with the ${shortName(g.s.nations[o])}`,
    text: "Belts, a fire, and a peace without land or tribute: the trade opened again, the frontier quieter, the war's dead unavenged.",
    lean: { envoy: 3, chaplain: 2, treasurer: 1, marshal: -2 },
    country: 1,
    gov: 1,
    cares: { merchants: 2, clergy: 2, frontier: -1 },
    blocked: (s, n, o) =>
      atWar(s, n, o) ? null : "There's no war with them to end.",
    apply: (g, n, o) => {
      const before = atWar(g.s, n, o);
      const err = militaryCommand(g, n, {
        k: "peace",
        n: o,
        terms: { take: [], give: [], gold: 0 },
      });
      if (err) return `!${err}`;
      if (before && atWar(g.s, n, o))
        return `!the ${shortName(g.s.nations[o])} send the belts back: they'll talk when they have more scalps or fewer warriors`;
      return `The council's commissioners smoke with the ${shortName(g.s.nations[o])}'s sachems. The war is over; the traders are packing their mules.`;
    },
  },
  "war-quota": {
    title: (g, n, o) =>
      `The colony's quota for the crown's war against ${g.s.nations[o]?.name ?? "the enemy"}`,
    text: "12 from the treasury in men and money for the King's expedition: the crown's favour +6 and steadier militia for two years. Refused, London notes the colony's reluctance.",
    lean: { marshal: 3, spymaster: 1, treasurer: -2 },
    country: -2,
    gov: 2,
    cares: { court: 2, frontier: 1, merchants: -1, planters: -2 },
    blocked: (s, n) =>
      s.nations[n].gold < 12 ? "The treasury can't find 12." : null,
    apply: (g, n, o) => {
      if (!spend(g, n, 12)) return "!the treasury can't find 12";
      colonyMod(g, n, "council:quota", "The colony's quota sent", 2 * Y, {
        favor: 6,
        morale: 0.05,
      });
      return `The colony's quota sails for the war against ${g.s.nations[o]?.name ?? "the enemy"}: two companies, their colours, and a great deal of salt pork. London is pleased.`;
    },
    lost: (g, n) => {
      colonyMod(g, n, "council:noquota", "The quota refused", 2 * Y, {
        favor: -4,
      });
      return "The council finds the colony can spare neither men nor money. A letter from the Board of Trade will say what London thinks of that.";
    },
  },
  militia: {
    title: (g, n, p) =>
      `Raise the militia of ${g.map.provinces[p]?.name ?? "the frontier"} against raiders`,
    text: "A regiment of militia raised in the county, from the treasury: the frontier held, the fields left to the women and boys.",
    lean: { marshal: 3, treasurer: -1 },
    country: 0,
    gov: 1,
    cares: { frontier: 2, planters: -1, merchants: -1 },
    blocked: (s, n, p) =>
      s.provinces[p]?.owner === n ? null : "That county isn't the colony's.",
    apply: (g, n, p) => {
      const err = militaryCommand(g, n, { k: "recruit", p, t: "militia" });
      if (err) return `!${err}`;
      return `A regiment of militia is raised at ${g.map.provinces[p].name}: every man from sixteen to sixty, and a few who lied about it.`;
    },
  },
  boundary: {
    title: (g, n, o) =>
      `The boundary with ${g.s.nations[o]?.name ?? "the neighbours"}: press the colony's claim`,
    text: "Aye presses the claim: the disputed land held, the neighbours affronted (relations −8), a border county quieter. No refers it to commissioners from both sides: 3 from the treasury and better relations.",
    lean: { surveyor: 2, marshal: 1, envoy: -2 },
    country: 1,
    gov: 0,
    cares: { frontier: 2, planters: 1, merchants: -1 },
    blocked: (s, n, o) =>
      s.nations[o]?.alive ? null : "There's nobody left to dispute it with.",
    apply: (g, n, o) => {
      relate(g, o, n, "A boundary claim pressed against us", -8, 4);
      relate(g, n, o, "A disputed boundary", -3, 4);
      const border = provincesOf(g.s, n).find((p) =>
        g.map.provinces[p].nb.some(([q]) => g.s.provinces[q]?.owner === o),
      );
      if (border !== undefined)
        countyMod(
          g,
          border,
          "council:boundary",
          "The colony's claim upheld",
          2 * Y,
          {
            unrest: -1,
          },
        );
      return `The colony stands on its claim against ${g.s.nations[o].name}. Surveyors with a guard of militia blaze the line where the colony says it runs; the neighbours' surveyors blaze theirs a mile off.`;
    },
    lost: (g, n, o) => {
      if (spend(g, n, 3)) {
        relate(g, o, n, "Commissioners for the boundary", 4, 4);
        relate(g, n, o, "Commissioners for the boundary", 4, 4);
        return `The governor refers the boundary with ${g.s.nations[o].name} to commissioners from both sides. They'll dine well, survey slowly and agree, eventually.`;
      }
      return `The council won't press the claim, and the treasury can't pay commissioners. The boundary with ${g.s.nations[o].name} stays where the last man with a gun said it was.`;
    },
  },
  petition: {
    title: (g, n, arg) => {
      const { p, need } = petitionOf(arg);
      return `A petition from ${g.map.provinces[p]?.name ?? "a county"} for ${need.what}`;
    },
    textOf: (g, n, arg) => {
      const { need } = petitionOf(arg);
      return `${need.cost} from the treasury: ${need.does}. Refused, the county is angrier for a year, and its people remember.`;
    },
    text: "A county's petition, from the treasury.",
    lean: { treasurer: -1, surveyor: 1, marshal: 1 },
    country: 2,
    gov: 0,
    cares: { planters: 1, frontier: 1, merchants: -1 },
    blocked: (s, n, arg) =>
      s.provinces[petitionOf(arg).p]?.owner === n
        ? null
        : "That county isn't the colony's now.",
    apply: (g, n, arg) => {
      const { p, need } = petitionOf(arg);
      const name = g.map.provinces[p].name;
      if (!spend(g, n, need.cost))
        return `!the treasury can't spare ${need.cost}`;
      if (need.key === "relief")
        countyMod(g, p, "council:relief", "The council's relief", Y, {
          unrest: -4,
        });
      else if (need.key === "rangers")
        countyMod(g, p, "council:rangers", "Rangers on the frontier", Y, {
          unrest: -3,
          morale: 0.05,
        });
      else if (need.key === "ferry")
        countyMod(g, p, "council:ferry", "A ferry and a road", 10 * Y, {
          production: 0.04,
        });
      else
        countyMod(g, p, "council:courthouse", "A court-house", 5 * Y, {
          unrest: -2,
        });
      return `${name} has its ${need.what.replace(/^a |^an /, "")}: ${need.does}.`;
    },
    lost: (g, n, arg) => {
      const { p, need } = petitionOf(arg);
      countyMod(
        g,
        p,
        "council:refused",
        "The council refused our petition",
        Y,
        {
          unrest: 2,
        },
      );
      return `The petitioners from ${g.map.provinces[p]?.name ?? "the county"} ride home without ${need.what}, composing remarks about the council on the way.`;
    },
  },
  treasury: {
    title: (g, n) => {
      const t = g.s.chars[seatHolderId(g.s, n, "treasurer")];
      return `An inquiry into the accounts of ${t ? charName(t) : "the treasury"}`;
    },
    text: "The receiver's books laid open before a committee of the council. If there's a hand in the till, it comes out (and the money with it); if there isn't, the receiver and his friends won't forget who asked.",
    lean: { attorney: 3, spymaster: 1, treasurer: -4 },
    country: 2,
    gov: -1,
    cares: { country: 2, merchants: 1, planters: 1, court: -1 },
    blocked: (s, n) => {
      const id = seatHolderId(s, n, "treasurer");
      if (!s.chars[id]?.alive)
        return "Nobody keeps the treasury to inquire into.";
      if (isPlayed(s, id)) return "A player keeps it.";
      return null;
    },
    apply: (g, n) => {
      const s = g.s;
      const id = seatHolderId(s, n, "treasurer");
      const c = s.chars[id];
      if (!c?.alive || isPlayed(s, id)) return "!nobody's books to open";
      if (treasurerGuilty(s, n)) {
        const back = 6 + Math.round(hash01(id, n, s.day) * 6);
        g.nation(n).gold += back;
        if (c.scheme) g.char(id).scheme!.exposed = true;
        disgrace(g, n, id, "a hand in the treasury");
        dismissCouncillor(g, n, "treasurer", "dismissed after the inquiry");
        return `The committee finds the receiver's ink dry where it should be wet and wet where it should be dry. ${charName(c)} is put off the council in disgrace, and ${back} come back into the treasury from places nobody will name.`;
      }
      return `The books balance to a farthing. ${charName(c)} demands an apology, receives a cold one, and remembers the names of everyone who asked.`;
    },
    lost: (g, n) => {
      if (!treasurerGuilty(g.s, n)) return "";
      colonyMod(g, n, "council:till", "A hand in the till", Y, { tax: -0.05 });
      return "The accounts go unexamined. Something in the treasury goes on smelling, and the revenue comes in thinner.";
    },
  },
  guardship: {
    title: () => "A guard ship against the pirates",
    text: "15 from the treasury for a sloop with guns to cruise off the capes: the colony's trade +2% for three years.",
    lean: { treasurer: -1, marshal: 2, envoy: 1 },
    country: 0,
    gov: 1,
    cares: { merchants: 2, planters: 1, frontier: -1 },
    blocked: (s, n) =>
      s.nations[n].gold < 15 ? "The treasury can't find 15." : null,
    apply: (g, n) => {
      if (!spend(g, n, 15)) return "!the treasury can't find 15";
      colonyMod(
        g,
        n,
        "council:guardship",
        "A guard ship off the capes",
        3 * Y,
        {
          production: 0.02,
        },
      );
      return "A guard ship is bought, gunned and manned. Her captain promises the pirates a rope; the merchants promise him a dinner.";
    },
  },
  quarantine: {
    title: (g, n, p) =>
      `A quarantine on ships from ${g.map.provinces[p]?.name ?? "the infected ports"}`,
    text: "Ships from where the sickness is ride at anchor forty days: the fever kept off, the colony's trade −2% for half a year.",
    lean: { chaplain: 2, treasurer: -1, spymaster: 1 },
    country: 0,
    gov: 1,
    cares: { merchants: -2, planters: 1, clergy: 1 },
    apply: (g, n) => {
      colonyMod(g, n, "council:quarantine", "A quarantine", 180, {
        production: -0.02,
      });
      for (const p of provincesOf(g.s, n)) {
        const pr = g.s.provinces[p];
        if (!pr.mods.some((m) => (m.fx.disease ?? 0) > 0)) continue;
        for (const m of g.prov(p).mods)
          if ((m.fx.disease ?? 0) > 0 && m.until > g.s.day)
            m.until = g.s.day + Math.ceil((m.until - g.s.day) / 2);
      }
      return "The yellow flag flies off the capes and the pilots turn the ships back. The sickness burns out sooner; the merchants' tempers don't.";
    },
  },
  college: {
    title: () => "A charter for a college",
    text: "20 from the treasury for a college to bring up ministers and gentlemen at home: the colony governed a little better for thirty years, and a name that outlasts everyone at this table.",
    lean: { chaplain: 3, spymaster: 1, treasurer: -2 },
    country: 0,
    gov: 1,
    cares: { clergy: 2, planters: 1, frontier: -1 },
    blocked: (s, n) =>
      s.nations[n].gold < 20 ? "The treasury can't find 20." : null,
    apply: (g, n) => {
      if (!spend(g, n, 20)) return "!the treasury can't find 20";
      colonyMod(g, n, "council:college", "A college", 30 * Y, {
        admin: 1,
        unrest: -1,
      });
      return "The college has its charter, its president, three scholars and a Latin motto nobody can agree how to translate.";
    },
  },
  lottery: {
    title: () => "A lottery for the public works",
    text: "A lottery licensed by the council: 8 into the treasury, and the ministers preaching against it from every pulpit.",
    lean: { treasurer: 2, chaplain: -3 },
    country: 0,
    gov: 0,
    cares: { merchants: 1, planters: 1, clergy: -2 },
    apply: (g, n) => {
      g.nation(n).gold += 8;
      return "The lottery is drawn at the court-house: 8 to the public works, a hundred pounds to a widow who'd never bought a ticket in her life, and a sermon against games of chance the Sunday after.";
    },
  },
  navalstores: {
    title: () => "A bounty on tar, pitch and turpentine",
    text: "6 from the treasury on top of the Navy Board's bounty: the pine counties boil tar, and the colony's trade +2% for five years.",
    lean: { treasurer: -1, surveyor: 1, envoy: 0 },
    country: 1,
    gov: 1,
    cares: { merchants: 1, planters: 1, frontier: 1 },
    blocked: (s, n) =>
      s.nations[n].gold < 6 ? "The treasury can't find 6." : null,
    apply: (g, n) => {
      if (!spend(g, n, 6)) return "!the treasury can't find 6";
      colonyMod(
        g,
        n,
        "council:navalstores",
        "A bounty on naval stores",
        5 * Y,
        {
          production: 0.02,
        },
      );
      return "The bounty is proclaimed. By autumn every pine in the colony has a box cut in it and a man waiting underneath.";
    },
  },
  inspection: {
    title: () => "An act for inspecting the colony's staple",
    text: "Inspectors at public warehouses burn the trash and pass the good: better prices abroad (trade +3% for ten years), and the small planters furious for a year.",
    lean: { treasurer: 2, spymaster: 1 },
    country: -1,
    gov: 1,
    cares: { merchants: 2, planters: -1, court: 1 },
    apply: (g, n) => {
      colonyMod(g, n, "council:inspection", "The staple inspected", 10 * Y, {
        production: 0.03,
      });
      colonyMod(
        g,
        n,
        "council:inspection-anger",
        "Trash burned at the warehouses",
        Y,
        {
          unrest: 1,
        },
      );
      return "Inspectors are named for every warehouse. The good crop fetches more in London; the bad is burned on the wharf in front of the men who grew it.";
    },
  },
  county: {
    title: (g, n, p) =>
      `Erect ${g.map.provinces[p]?.name ?? "the backcountry"} into a county of its own`,
    text: "Justices, a sheriff and a court of its own for the backcountry: its unrest −3 and its trade +2% for five years, and new places for the governor to fill.",
    lean: { surveyor: 2, attorney: 1 },
    country: 1,
    gov: 1,
    cares: { frontier: 2, planters: 1, court: 1 },
    blocked: (s, n, p) =>
      s.provinces[p]?.owner === n ? null : "That isn't the colony's.",
    apply: (g, n, p) => {
      countyMod(g, p, "council:county", "A county of its own", 5 * Y, {
        unrest: -3,
        production: 0.02,
      });
      return `${g.map.provinces[p].name} is a county now: a court day once a month, a sheriff with a new hat, and the first lawsuit before the paint is dry.`;
    },
  },
};

// ---------------------------------------------------------------- what's due

/** The council's business: what each kind needs before the governor brings it. */
export const BUSINESS: BusinessDef[] = [
  // The old business, as the governor used to bring it.
  {
    key: "taxup",
    label: "Raise the taxes",
    due: "the treasury under 30",
    weight: 2,
    cares: { court: 1, planters: -2, merchants: -1, frontier: -1 },
    when: (g, n) => {
      const x = g.s.nations[n];
      return x.gold < 30 && x.tax < 2 ? -1 : null;
    },
  },
  {
    key: "taxdown",
    label: "Lower the taxes",
    due: "the counties restless (unrest over 35)",
    weight: 2,
    cares: { country: 2, planters: 2, merchants: 1 },
    when: (g, n) =>
      avgUnrest(g.s, n) > 35 && g.s.nations[n].tax > 0 ? -1 : null,
  },
  {
    key: "thanksgiving",
    label: "A day of public thanksgiving",
    due: "the counties restless (unrest over 20)",
    weight: 1,
    cares: { clergy: 2, merchants: -1 },
    when: (g, n) => (avgUnrest(g.s, n) > 20 ? -1 : null),
  },
  {
    key: "remit",
    label: "Send more of the revenue home",
    due: "the crown's favour under 35",
    weight: 1,
    cares: { court: 1, country: -2, merchants: -1, planters: -1 },
    when: (g, n) => {
      const x = g.s.nations[n];
      return x.favor < 35 && x.remit < 0.5 && !x.independent ? -1 : null;
    },
  },
  {
    key: "presents",
    label: "Presents for a nation beyond the line",
    due: "a native nation next door, and 20 in the treasury",
    weight: 1,
    cares: { merchants: 1, clergy: 1, frontier: -1 },
    by: seatOrGov("envoy"),
    when: (g, n) => {
      const near = nativesNear(g, n);
      return near.length && g.s.nations[n].gold >= 20 ? near[0] : null;
    },
  },
  {
    key: "fort",
    label: "A fort on the frontier",
    due: "a war",
    weight: 2,
    cares: { frontier: 2, merchants: -1 },
    by: seatOrGov("marshal"),
    when: (g, n) => {
      if (!atWarAny(g.s, n)) return null;
      const p = provincesOf(g.s, n).find(
        (q) => !(g.s.provinces[q].b.fort ?? 0),
      );
      return p ?? null;
    },
  },
  {
    key: "grant",
    label: "A land grant to a company of adventurers",
    due: "few colonists coming",
    weight: 1,
    cares: { planters: 1, frontier: -1, clergy: 0 },
    by: seatOrGov("surveyor"),
    when: (g, n) => (g.s.nations[n].colonists < 50 ? -1 : null),
  },
  {
    key: "customs",
    label: "Farm out the customs",
    due: "the treasury under 20",
    weight: 0.6,
    cares: { court: 1, merchants: -1 },
    by: seatOrGov("treasurer"),
    when: (g, n) =>
      g.s.nations[n].gold < 20 && g.s.nations[n].kind === "power" ? -1 : null,
  },
  {
    key: "trade",
    label: "A treaty of trade",
    due: "a friendly neighbour without one",
    weight: 0.7,
    cares: { merchants: 2, frontier: -1 },
    by: seatOrGov("envoy"),
    when: (g, n) => {
      const o = neighboursOf(g, n).find(
        (x) =>
          relationValue(g.s, x, n) > 5 &&
          !treatyBetween(g.s, n, x, "trade") &&
          !atWar(g.s, n, x),
      );
      return o ?? null;
    },
  },
  // ---- the new business
  {
    key: "native-war",
    label: "War against a nation beyond the line",
    due: "a native nation next door hostile (relations under −20), and the colony strong enough",
    weight: 1.5,
    cares: MEASURES_R16["native-war"].cares!,
    by: seatOrGov("marshal"),
    when: (g, n) => {
      const s = g.s;
      const o = nativesNear(g, n).find(
        (x) =>
          relationValue(s, x, n) < -20 &&
          !atWar(s, n, x) &&
          strengthOf(s, n) > warriorsOf(s, x) * 0.6,
      );
      return o ?? null;
    },
  },
  {
    key: "native-peace",
    label: "Treat for peace with a nation",
    due: "a war with a native nation going on ten months",
    weight: 2.5,
    cares: MEASURES_R16["native-peace"].cares!,
    by: seatOrGov("envoy"),
    when: (g, n) => {
      const s = g.s;
      const w = s.wars.find(
        (x) =>
          (x.a === n || x.b === n) &&
          s.nations[x.a === n ? x.b : x.a]?.kind === "native" &&
          s.day - x.start > 300,
      );
      return w ? (w.a === n ? w.b : w.a) : null;
    },
  },
  {
    key: "war-quota",
    label: "The colony's quota for the crown's war",
    due: "the crowns at war in Europe, and 12 in the treasury",
    weight: 3,
    cares: MEASURES_R16["war-quota"].cares!,
    when: (g, n) => {
      const o = crownEnemy(g.s, n);
      return o >= 0 && g.s.nations[n].gold >= 12 ? o : null;
    },
  },
  {
    key: "militia",
    label: "Raise the militia of a frontier county",
    due: "a war, and a frontier county of 200 settlers",
    weight: 1.5,
    cares: MEASURES_R16.militia.cares!,
    by: seatOrGov("marshal"),
    when: (g, n) => {
      if (!atWarAny(g.s, n)) return null;
      const f = frontierCounties(g, n).filter(
        (p) => settlers(g.s.provinces[p]) > 200,
      );
      return f.length ? f[Math.floor(g.s.day / 97) % f.length] : null;
    },
  },
  {
    key: "boundary",
    label: "A boundary dispute with a neighbouring colony",
    due: "another crown's colony next door, at peace",
    weight: 1,
    cares: MEASURES_R16.boundary.cares!,
    by: seatOrGov("surveyor"),
    when: (g, n) => {
      const powers = neighboursOf(g, n).filter(
        (o) =>
          g.s.nations[o].kind === "power" &&
          !atWar(g.s, n, o) &&
          !treatyBetween(g.s, n, o, "alliance"),
      );
      return powers.length ? powers[yearOfDay(g.s.day) % powers.length] : null;
    },
  },
  {
    key: "petition",
    label: "A petition from a county",
    due: "always: relief after a hard year, rangers against raiders, a ferry and a road, or a court-house",
    weight: 3,
    cares: MEASURES_R16.petition.cares!,
    by: (g, n, arg) => {
      const m = memberFor(g.s, n, petitionOf(arg).p);
      return m >= 0 ? m : g.s.nations[n].ruler;
    },
    docket: (arg) => `petition:${petitionOf(arg).need.key}`,
    when: (g, n) => petitionDue(g, n),
  },
  {
    key: "treasury",
    label: "An inquiry into the treasury's accounts",
    due: "talk of a hand in the till, or a thin year",
    weight: 1.2,
    cares: MEASURES_R16.treasury.cares!,
    by: seatOrGov("attorney"),
    when: (g, n) => {
      const s = g.s;
      const id = seatHolderId(s, n, "treasurer");
      if (!s.chars[id]?.alive || isPlayed(s, id)) return null;
      // Talk of the treasury: a guilty receiver, or a thin year.
      return treasurerGuilty(s, n) || s.nations[n].gold < 15 ? -1 : null;
    },
  },
  {
    key: "guardship",
    label: "A guard ship against the pirates",
    due: "the pirate years (1680 to 1730), a coast, and 15 in the treasury",
    weight: 1,
    cares: MEASURES_R16.guardship.cares!,
    when: (g, n) => {
      const y = yearOfDay(g.s.day);
      const coast = provincesOf(g.s, n).some((p) => g.map.provinces[p].coastal);
      return y >= 1680 && y <= 1730 && coast && g.s.nations[n].gold >= 15
        ? -1
        : null;
    },
  },
  {
    key: "quarantine",
    label: "A quarantine",
    due: "a sickness in one of the colony's towns",
    weight: 2,
    cares: MEASURES_R16.quarantine.cares!,
    when: (g, n) => {
      const sick = provincesOf(g.s, n).find((p) =>
        g.s.provinces[p].mods.some(
          (m) => (m.fx.disease ?? 0) > 0 && m.until > g.s.day,
        ),
      );
      return sick ?? null;
    },
  },
  {
    key: "college",
    label: "A charter for a college",
    due: "from 1690, with 30 in the treasury; once in a colony",
    weight: 0.5,
    once: true,
    cares: MEASURES_R16.college.cares!,
    when: (g, n) =>
      yearOfDay(g.s.day) >= 1690 && g.s.nations[n].gold >= 30 ? -1 : null,
  },
  {
    key: "lottery",
    label: "A lottery for the public works",
    due: "the treasury under 25",
    weight: 0.6,
    cares: MEASURES_R16.lottery.cares!,
    by: seatOrGov("treasurer"),
    when: (g, n) => (g.s.nations[n].gold < 25 ? -1 : null),
  },
  {
    key: "navalstores",
    label: "A bounty on tar, pitch and turpentine",
    due: "the English colonies from 1705",
    weight: 0.7,
    cares: MEASURES_R16.navalstores.cares!,
    when: (g, n) => {
      const x = g.s.nations[n];
      return yearOfDay(g.s.day) >= 1705 &&
        x.culture === "english" &&
        x.gold >= 10
        ? -1
        : null;
    },
  },
  {
    key: "inspection",
    label: "An act for inspecting the colony's staple",
    due: "from 1712; once in a colony",
    weight: 0.6,
    once: true,
    cares: MEASURES_R16.inspection.cares!,
    when: (g, n) => (yearOfDay(g.s.day) >= 1712 ? -1 : null),
  },
  {
    key: "county",
    label: "Erect a backcountry county",
    due: "a frontier county of 400 settlers",
    weight: 0.8,
    cares: MEASURES_R16.county.cares!,
    by: seatOrGov("surveyor"),
    docket: () => "county",
    when: (g, n) => {
      const f = frontierCounties(g, n).filter(
        (p) =>
          settlers(g.s.provinces[p]) > 400 &&
          !g.s.provinces[p].mods.some((m) => m.key === "council:county"),
      );
      return f.length ? f[0] : null;
    },
  },
];

export const BUSINESS_BY_KEY = new Map(BUSINESS.map((b) => [b.key, b]));

/** A matter's key on the docket (a petition by its need). */
export function docketKey(key: string, arg: number): string {
  return BUSINESS_BY_KEY.get(key)?.docket?.(arg) ?? key;
}

/** When a kind of business may next come before the council (0: now). */
export function docketFree(
  s: GameState,
  n: number,
  key: string,
  arg: number,
): number {
  const cab = s.power?.cabinets[n];
  const def = BUSINESS_BY_KEY.get(key);
  if (def?.once && cab?.docket?.[`once:${key}`] !== undefined) return Infinity;
  const last = cab?.docket?.[docketKey(key, arg)];
  return last === undefined ? 0 : Math.max(0, last + DOCKET_REST - s.day);
}

/** What's due before the council now, and how likely each. */
export function businessDue(
  g: ConquestGame,
  n: number,
): { key: string; arg: number; w: number }[] {
  const out: { key: string; arg: number; w: number }[] = [];
  for (const def of BUSINESS) {
    const arg = def.when(g, n);
    if (arg === null) continue;
    if (docketFree(g.s, n, def.key, arg) > 0) continue;
    const open = g.s.power?.cabinets[n]?.matters.some(
      (m) => m.status === "open" && m.key === def.key,
    );
    if (open) continue;
    out.push({ key: def.key, arg, w: def.weight });
  }
  return out;
}

/** The governor's (the computer's) choice of business: what comes before the council next. */
function chooseBusiness(
  g: ConquestGame,
  n: number,
  roll: number,
): { key: string; arg: number; by?: number } | null {
  if (g.s.nations[n]?.kind !== "power") return null;
  const due = businessDue(g, n);
  if (!due.length) return null;
  const total = due.reduce((m, x) => m + x.w, 0);
  let r = roll * total;
  let pick = due[due.length - 1];
  for (const x of due) {
    r -= x.w;
    if (r <= 0) {
      pick = x;
      break;
    }
  }
  const def = BUSINESS_BY_KEY.get(pick.key)!;
  const by = def.by?.(g, n, pick.arg);
  return { key: pick.key, arg: pick.arg, ...(by !== undefined ? { by } : {}) };
}

/** Note a matter on the docket (whoever brought it). */
function noteDocket(
  g: ConquestGame,
  n: number,
  key: string,
  arg: number,
): void {
  const cab = ensureCabinet(g, n);
  cab.docket ??= {};
  cab.docket[docketKey(key, arg)] = g.s.day;
  if (BUSINESS_BY_KEY.get(key)?.once) cab.docket[`once:${key}`] = g.s.day;
  // Keep it small: forget what's long past.
  for (const [k, d] of Object.entries(cab.docket))
    if (!k.startsWith("once:") && g.s.day - d > 2 * DOCKET_REST)
      delete cab.docket[k];
  powerChanged(g, `c${n}`);
}

/** Which factions care which way about a kind of business (for votes, the page and the guide). */
export function caresOf(key: string): Partial<Record<FactionKey, number>> {
  return (
    BUSINESS_BY_KEY.get(key)?.cares ??
    MEASURES_R16[key]?.cares ??
    OLD_CARES[key] ??
    {}
  );
}

/** The measures a councillor's seat brings, which the governor doesn't. */
const OLD_CARES: Record<string, Partial<Record<FactionKey, number>>> = {
  paper: { planters: 2, frontier: 1, merchants: -2, court: -1 },
};

// The council learns of the new business when this module loads.
registerMeasures(MEASURES_R16);
registerBusiness({ choose: chooseBusiness, note: noteDocket });
registerDocketWait((s, n, key) => {
  const d = docketFree(s, n, key, -1);
  return Number.isFinite(d) ? d : 9999;
});

/** Every kind of business, for the guide: its title as it reads, and who cares. */
export function businessKinds(): { key: string; once: boolean }[] {
  return BUSINESS.map((b) => ({ key: b.key, once: !!b.once }));
}
