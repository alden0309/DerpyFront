// GOV (r21): breaking with the crown. A governor (a player) may put the
// question to the colony's assembly: "Resolved, that this colony is, and of
// right ought to be, free". The house debates a fortnight and divides: the
// computer's members by their party, the colony's quarrel with the crown and
// the governor's weight among them (the same reckoning the page shows);
// players in the house vote for themselves in a scene. Carried, the
// governor may declare it, and the existing machinery takes over: the war
// with the crown (Crown.ts: its armies land to crush it every ten months or
// so, and it's won in eight years or with three of them beaten, or lost when
// the capital is held half a year). The crown's own regiments already in
// the colony (CROWN r18: the war's drafts and the fortress garrisons) go
// over to the crown at once, and counties where the crown's friends are
// strong may hold for the King (their odds are shown before). Every player
// of the colony chooses a side, and is answered for it when it's over.

import { memberFaction } from "./Assembly";
import { formatDate } from "./Calendar";
import { chairOf } from "./ChairCore";
import { addHeat } from "./Crime";
import { declareIndependence } from "./Crown";
import { crownMen, meansOf } from "./CrownCore";
import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import { deskOf, deskView, governedBy } from "./GovDesk";
import { hooks, raiseEvent } from "./Hooks";
import { withFlow } from "./LedgerCore";
import { addRenown, journal, milestone, spend, touchLife } from "./LifeCore";
import { Check, lifeOfChar, meOf, no, skillLevel, yes } from "./LifeQueries";
import { kmBetween, type World } from "./Map";
import { cabinetOf } from "./PowerCore";
import {
  armiesOf,
  armyMen,
  charName,
  hasTrait,
  provincesOf,
  settlers,
} from "./Queries";
import { DAYS_PER_YEAR, REBELLION_WIN_DAYS, REGIMENTS } from "./Rules";
import { rumour } from "./Rumours";
import { hash01 } from "./SocietyCore";
import { addFavor } from "./Standing";
import type {
  Army,
  Breakdown,
  GameState,
  Life,
  Motion,
  RevSide,
} from "./Types";
import { worldRng } from "./WorldRng";

/** The reckoning the house divides by, and the war's estimate. */
export const REV = {
  /** The house debates this long before it divides; a motion lost can't be moved again for a year. */
  debate: 14,
  /** In the war: the colony's generals go at the crown's men on its soil when they're no more than this many to one of theirs. */
  attackAt: 1.1,
  rest: DAYS_PER_YEAR,
  /** Carried: the governor has this long to declare it. */
  declareWithin: 60,
  /** How a member leans: his party, the colony's quarrel with the crown, the governor's weight, his nature. */
  country: 2,
  court: -3,
  autonomyFrom: 40,
  autonomyPer: 1 / 10,
  favourFrom: 45,
  favourPer: 1 / 10,
  defied: 1,
  crushed: -3,
  swayRenownPer: 1 / 60,
  swayRenownMax: 1.5,
  swayPersuasionPer: 1 / 10,
  swayPersuasionMax: 1,
  loyal: -1,
  bold: 1,
  craven: -1.5,
  noise: 2,
  /** A motion lost: the crown hears of it. */
  lostFavor: -10,
  lostYears: 2,
  /** Declared: the governor's renown; at the end, the patriots' and the loyalists' lot. */
  renown: 10,
  wonRenown: 8,
  loyalLost: 1 / 3,
  loyalLostRenown: -5,
  crushedHeat: 40,
  crushedFavour: -20,
  crushedRenown: -5,
  loyalWonFavour: 15,
  loyalWonRenown: 5,
  /** A county holds for the King: a chance, and a garrison of the crown's friends. */
  hold: {
    base: 0.08,
    favourFrom: 40,
    favourPer: 1 / 200,
    newcomers: 0.1,
    capital: -0.05,
    port: 0.03,
    min: 0.02,
    max: 0.6,
    regs: 1,
  },
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** The track's own dice (0x2210000 up: EVENTS r21 has 0x21e0000). */
function rdice(s: GameState, salt: number, ...xs: number[]) {
  let k = salt | 0;
  for (const x of xs) k = (Math.imul(k, 31) + (x | 0)) | 0;
  return worldRng(s, 0x2210000 + (k & 0xfffff));
}

/** The crown that rules a colony (its nation index), or -1. */
export function crownFor(s: GameState, n: number): number {
  return s.nations.findIndex((x) => x.kind === "crown" && x.colony === n);
}

// ---------------------------------------------------------------- the house

/** The colony's quarrel with the crown, as the house feels it. */
export function quarrel(s: GameState, n: number): Breakdown {
  const nation = s.nations[n];
  const e = new Explain();
  if (!nation) return e.done(1);
  const a = (nation.autonomy - REV.autonomyFrom) * REV.autonomyPer;
  e.add(
    `The colony's own mind (autonomy ${Math.round(nation.autonomy)})`,
    Math.round(a * 10) / 10,
  );
  const f = (REV.favourFrom - nation.favor) * REV.favourPer;
  e.add(
    `The crown's favour (${Math.round(nation.favor)})`,
    Math.round(f * 10) / 10,
  );
  const defied = nation.mods.filter(
    (m) => m.key === "defied" && m.until > s.day,
  ).length;
  if (defied) e.add("The crown's demands defied", defied * REV.defied);
  if (nation.mods.some((m) => m.key === "crushed-rebellion" && m.until > s.day))
    e.add("The gallows after the last rising", REV.crushed);
  return e.done(1);
}

/** The governor's weight in the house. */
function sway(s: GameState, by: number): number {
  const life = lifeOfChar(s, by);
  if (!life) return 0;
  return (
    Math.min(REV.swayRenownMax, life.renown * REV.swayRenownPer) +
    Math.min(
      REV.swayPersuasionMax,
      skillLevel(s, life, "persuasion") * REV.swayPersuasionPer,
    )
  );
}

/** How one of the computer's members leans: positive is aye. */
export function revLean(
  s: GameState,
  n: number,
  c: number,
  by: number,
  salt: number,
): number {
  const ch = s.chars[c];
  let v = memberFaction(s, n, c) === "country" ? REV.country : REV.court;
  v += quarrel(s, n).total + sway(s, by);
  if (hasTrait(ch, "content") || hasTrait(ch, "honest")) v += REV.loyal;
  if (hasTrait(ch, "ambitious") || hasTrait(ch, "brave")) v += REV.bold;
  if (hasTrait(ch, "craven")) v += REV.craven;
  v += hash01(c, n, salt, 0x76) * REV.noise * 2 - REV.noise;
  return v;
}

/** How the house would divide today (players vote for themselves; those yet to vote are undecided). */
export function revDivision(
  s: GameState,
  n: number,
  by: number,
  salt: number,
  votes: Record<number, number> = {},
): { ayes: number; noes: number; abstain: number; undecided: number } {
  let ayes = 1;
  let noes = 0;
  let abstain = 0;
  let undecided = 0;
  for (const c of s.polities[n]?.assembly ?? []) {
    if (c === by || !s.chars[c]?.alive) continue;
    if (lifeOfChar(s, c)) {
      const v = votes[c];
      if (v === undefined) undecided++;
      else if (v > 0) ayes++;
      else if (v < 0) noes++;
      else abstain++;
      continue;
    }
    if (revLean(s, n, c, by, salt) > 0) ayes++;
    else noes++;
  }
  return { ayes, noes, abstain, undecided };
}

/** Whether a governor can put the question now, or why not. */
export function motionCheck(s: GameState, life: Life): Check {
  const n = governedBy(s, life);
  if (n < 0) return no("Only the governor puts the question.");
  const nation = s.nations[n];
  if (nation.independent) return no("The colony answers to no crown already.");
  if (nation.rebelling) return no("The war with the crown is on.");
  if (crownFor(s, n) < 0) return no("No crown to break with.");
  const pol = s.polities[n];
  if (!pol?.assembly.length)
    return no("The colony has no assembly to put it to.");
  if ((cabinetOf(s, n)?.prorogued ?? 0) > s.day)
    return no("The house is prorogued: it isn't sitting.");
  const d = deskView(s, n);
  if (d.motion && !d.motion.result) return no("The house is debating it now.");
  if (
    d.motion?.result?.carried &&
    s.day - d.motion.divides <= REV.declareWithin
  )
    return no("The house has carried it: declare it, or let it lie.");
  const next = (d.lastMotion ?? -Infinity) + REV.rest;
  if (next > s.day) return no(`Not again before ${formatDate(next)}.`);
  return yes;
}

/** Put the question to the house. */
export function moveMotion(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const ok = motionCheck(s, life);
  if (!ok.ok) return ok.why;
  const n = governedBy(s, life);
  const me = meOf(s, life)!;
  const m: Motion = {
    by: me.id,
    day: s.day,
    divides: s.day + REV.debate,
    votes: {},
    salt: s.day & 0xffff,
  };
  const d = deskOf(g, n);
  d.motion = m;
  d.lastMotion = s.day;
  journal(
    g,
    life,
    `You put the question to the house: that the colony is, and of right ought to be, free. It divides about ${formatDate(m.divides)}.`,
    "good",
  );
  milestone(g, life, "office", "Put the question of independence to the house");
  g.event({
    k: "news",
    day: s.day,
    n,
    text: `${charName(me)} puts the question of independence to the house.`,
  });
  rumour(
    g,
    s.nations[n].capital,
    `The governor has asked the house to break with the crown!`,
    me.id,
  );
  for (const c of s.polities[n]?.assembly ?? []) {
    const l = lifeOfChar(s, c);
    if (l && l !== life) raiseEvent(g, l, "gov-rev-vote", { n });
  }
  return null;
}

/** A member's vote (a player in the house). */
export function voteMotion(
  g: ConquestGame,
  life: Life,
  vote: number,
): string | null {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return "Watching.";
  const n = me.nation;
  const m = s.nations[n]?.desk?.motion;
  if (!m || m.result) return "Nothing's before the house.";
  if (!s.polities[n]?.assembly.includes(me.id))
    return "You don't sit in the house.";
  deskOf(g, n).motion!.votes[me.id] = Math.sign(vote);
  journal(
    g,
    life,
    vote > 0
      ? "You'll vote aye: for independence."
      : vote < 0
        ? "You'll vote no: for the crown."
        : "You'll keep your seat when the house divides.",
  );
  return null;
}

/** The house divides. */
function divide(g: ConquestGame, n: number): void {
  const s = g.s;
  const d = deskOf(g, n);
  const m = d.motion!;
  const div = revDivision(s, n, m.by, m.salt, m.votes);
  const carried = div.ayes > div.noes;
  m.result = {
    ayes: div.ayes,
    noes: div.noes,
    abstain: div.abstain + div.undecided,
    carried,
  };
  const gov = lifeOfChar(s, m.by);
  g.event({
    k: "news",
    day: s.day,
    n,
    text: `The house of ${s.nations[n].name} divides on independence: ${div.ayes} for, ${div.noes} against. ${carried ? "Carried." : "Lost."}`,
  });
  for (const l of s.lives)
    if (l.c >= 0 && s.chars[l.c]?.nation === n && l !== gov)
      journal(
        g,
        l,
        `The house divides on independence, ${div.ayes} to ${div.noes}: ${carried ? "carried. It's for the governor to declare it." : "lost."}`,
        carried ? "good" : undefined,
      );
  if (carried) {
    if (gov && s.nations[n].ruler === m.by)
      raiseEvent(g, gov, "gov-rev-carried", { n });
  } else {
    // The crown hears of it.
    const x = g.nation(n);
    x.mods.push({
      key: "r21:treason-talk",
      label: "Treason talked in the house",
      until: s.day + REV.lostYears * DAYS_PER_YEAR,
      fx: { favor: REV.lostFavor },
    });
    const ch = chairOf(s, n);
    if (ch) ch.grievances = (ch.grievances ?? 0) + 1;
    if (gov)
      journal(
        g,
        gov,
        `The house won't have it, ${div.ayes} to ${div.noes}. London will hear of the question, and of who put it.`,
        "bad",
      );
  }
}

// ---------------------------------------------------------------- the war at home

/**
 * In a rising the governor declared, where one of the colony's armies goes
 * (the computer's generals): at the crown's men on the colony's own soil
 * when it's the stronger, the nearest first; else home to the capital,
 * which is never left empty for the crown to walk into. Its other wars wait.
 * Undefined when there's no such rising (the ordinary campaign, then).
 */
export function risingAim(
  g: ConquestGame,
  n: number,
  a: Army,
): number | undefined {
  const s = g.s;
  const nation = s.nations[n];
  if (!nation?.rebelling || !nation.desk?.rev) return undefined;
  const crown = crownFor(s, n);
  const men = armyMen(a);
  let best = -1;
  let bestKm = Infinity;
  for (const x of s.armies) {
    if (x.owner !== crown || s.provinces[x.prov]?.owner !== n) continue;
    const foes = s.armies
      .filter((y) => y.prov === x.prov && y.owner === crown)
      .reduce((m, y) => m + armyMen(y), 0);
    if (foes > men * REV.attackAt) continue;
    const km = kmBetween(g.map, a.prov, x.prov);
    if (km < bestKm) {
      bestKm = km;
      best = x.prov;
    }
  }
  return best >= 0 ? best : nation.capital;
}

// ---------------------------------------------------------------- declared

/** A county's chance to hold for the King when the colony declares. */
export function holdOdds(
  s: GameState,
  w: World,
  n: number,
  p: number,
): Breakdown {
  const H = REV.hold;
  const nation = s.nations[n];
  const pr = s.provinces[p];
  const e = new Explain().add(
    "The King's friends in every county",
    H.base,
    true,
  );
  if (!nation || !pr) return e.done(2, 0, 0);
  const fort = s.crown?.forts?.[p];
  if (fort && fort.n === n && fort.army !== undefined)
    return new Explain()
      .add("The crown's own garrison holds the fort", 1, true)
      .done(2, 0, 1);
  const f = (nation.favor - H.favourFrom) * H.favourPer;
  if (f)
    e.add(
      `The crown's favour (${Math.round(nation.favor)})`,
      Math.round(f * 100) / 100,
    );
  if (pr.integrate > s.day)
    e.add("Newcomers, loyal to the old country", H.newcomers);
  if (nation.capital === p)
    e.add("The capital: the patriots are strong here", H.capital);
  if ((pr.b.port ?? 0) > 0) e.add("A port the navy can reach", H.port);
  return e.done(2, H.min, H.max);
}

/** The war's estimate: the colony against the crown (the war itself decides). */
export function warOdds(s: GameState, w: World, n: number): Breakdown {
  const nation = s.nations[n];
  const e = new Explain().add("A colony against its crown", 0.35, true);
  if (!nation) return e.done(2, 0, 0);
  const men =
    armiesOf(s, n).reduce((m, a) => m + armyMen(a), 0) - crownMen(s, n);
  // The crown's first two armies are about 700 and 900 men.
  const ratio = men / 800;
  e.add(
    `${Math.round(men)} men under arms (the crown's first army is about 700)`,
    Math.round(clamp((ratio - 1) * 0.15, -0.2, 0.2) * 100) / 100,
  );
  const people = provincesOf(s, n).reduce(
    (m, p) => m + settlers(s.provinces[p]),
    0,
  );
  e.add(
    `${Math.round(people).toLocaleString("en-US")} settlers to raise more`,
    Math.round(Math.min(0.15, people / 200000) * 100) / 100,
  );
  const means = meansOf(s, n);
  if (means)
    e.add(
      `The crown can spare ${means.max} regiments for America`,
      -Math.round(Math.min(0.2, means.max / 100) * 100) / 100,
    );
  const busy = Object.keys(s.europe.wars).some((k) =>
    k.split("-").map(Number).includes(n),
  );
  if (busy) e.add("The crown is at war in Europe", 0.1);
  const regs = crownMen(s, n);
  if (regs > 0)
    e.add(
      `The crown's own ${regs} men in the colony go over to it`,
      -Math.round(Math.min(0.15, regs / 2000) * 100) / 100,
    );
  // The capital never holds for the King (the declaration's roll leaves it out).
  const expect = provincesOf(s, n)
    .filter((p) => p !== nation.capital)
    .reduce((m, p) => m + holdOdds(s, w, n, p).total, 0);
  if (expect >= 0.5)
    e.add(
      `Counties likely to hold for the King (about ${Math.round(expect)})`,
      -Math.round(Math.min(0.15, expect * 0.04) * 100) / 100,
    );
  return e.done(2, 0.05, 0.8);
}

/** Declare it (or let the house's vote lie). */
export function declareRev(
  g: ConquestGame,
  life: Life,
  go: boolean,
): string | null {
  const s = g.s;
  const n = governedBy(s, life);
  if (n < 0) return "Only the governor declares it.";
  const d = deskView(s, n);
  const m = d.motion;
  if (!m?.result?.carried) return "The house hasn't carried it.";
  if (s.day - m.divides > REV.declareWithin)
    return "The moment has passed: put it to the house again.";
  const nation = s.nations[n];
  if (nation.independent || nation.rebelling) return "It's done.";
  const me = meOf(s, life)!;
  if (!go) {
    deskOf(g, n).motion = null;
    journal(
      g,
      life,
      "You let the house's vote lie. The colony waits; so does London.",
    );
    return null;
  }
  const crown = crownFor(s, n);
  // Each county's chance of holding for the King, as the page showed it:
  // reckoned before the declaration, which sets the crown's favour to nothing.
  const shown = provincesOf(s, n)
    .filter((p) => p !== nation.capital)
    .map((p) => ({ p, odds: holdOdds(s, g.w, n, p).total }));
  declareIndependence(g, n);
  // The crown's own regiments in the colony go over to it.
  if (crown >= 0) defect(g, n, crown);
  // Counties where the crown's friends are strong hold for the King.
  const holds: number[] = [];
  for (const { p, odds } of shown) {
    if (odds <= 0) continue;
    if (odds >= 1 || rdice(s, 0x90, p, n).chance(odds)) {
      holds.push(p);
      if (crown >= 0) holdForKing(g, n, crown, p);
    }
  }
  const desk = deskOf(g, n);
  desk.motion = null;
  desk.rev = {
    day: s.day,
    by: me.id,
    holds,
    sides: { [life.seat]: "patriot" },
  };
  addRenown(g, life, REV.renown);
  milestone(
    g,
    life,
    "rising",
    `Declared ${nation.name} free of the crown`,
    nation.capital,
    { big: true },
  );
  journal(
    g,
    life,
    `You declare the colony free. The crown will send its armies; ${holds.length ? `${holds.map((p) => g.map.provinces[p].name).join(", ")} ${holds.length === 1 ? "holds" : "hold"} for the King already. ` : ""}Hold the capital, beat what lands, and in ${Math.round(REBELLION_WIN_DAYS / DAYS_PER_YEAR)} years it's won.`,
    "good",
  );
  g.event({
    k: "news",
    day: s.day,
    n,
    text: `${charName(me)} declares ${nation.name} free of the crown.${holds.length ? ` ${holds.map((p) => g.map.provinces[p].name).join(", ")} ${holds.length === 1 ? "holds" : "hold"} for the King.` : ""}`,
  });
  rumour(
    g,
    nation.capital,
    `Independence! The governor has declared it, and the bells are ringing.`,
    me.id,
    "good",
  );
  // Every player of the colony chooses a side.
  for (const l of s.lives)
    if (l.c >= 0 && !l.watching && l !== life && s.chars[l.c]?.nation === n)
      raiseEvent(g, l, "gov-rev-sides", { n });
  return null;
}

/** The crown's regiments in the colony (its war drafts and its fortress garrisons) go over to the crown. */
function defect(g: ConquestGame, n: number, crown: number): void {
  const s = g.s;
  for (const a of [...s.armies]) {
    if (a.owner !== n) continue;
    const theirs = a.regs.filter((r) => r.crown);
    if (!theirs.length) continue;
    const keep = a.regs.filter((r) => !r.crown);
    if (keep.length) {
      g.touch(a).regs = keep;
      addArmyAt(
        g,
        crown,
        a.prov,
        theirs.map((r) => ({ ...r, crown: undefined })),
      );
    } else {
      // The whole army is the crown's: it changes its colours.
      const x = g.touch(a);
      x.owner = crown;
      x.commander = -1;
      x.regs = theirs.map((r) => ({ ...r, crown: undefined }));
    }
  }
  const forts = s.crown?.forts;
  if (forts)
    for (const [p, f] of Object.entries(forts))
      if (f.n === n) {
        const pr = g.prov(Number(p));
        if (pr.owner === n) pr.occupier = crown;
      }
}

function addArmyAt(
  g: ConquestGame,
  owner: number,
  p: number,
  regs: Army["regs"],
): Army {
  return g.addArmy({
    id: g.nextId(),
    owner,
    prov: p,
    regs,
    path: [],
    depart: -1,
    arrive: -1,
    sea: false,
    retreating: false,
    arrived: g.s.day,
    from: -1,
    commander: -1,
    supply: 1,
  });
}

/** A county holds for the King: the crown's friends take the town, a company of them under arms. */
function holdForKing(
  g: ConquestGame,
  n: number,
  crown: number,
  p: number,
): void {
  const s = g.s;
  const pr = g.prov(p);
  pr.occupier = crown;
  pr.siege = null;
  const regs = Array.from({ length: REV.hold.regs }, () => ({
    type: "militia" as const,
    men: REGIMENTS.militia.men,
    morale: 0.8,
    home: -1,
  }));
  addArmyAt(g, crown, p, regs);
  g.event({
    k: "news",
    day: s.day,
    n: crown,
    p,
    text: `${g.map.provinces[p].name} holds for the King.`,
  });
}

/** A player's side. */
export function revSide(
  g: ConquestGame,
  life: Life,
  side: string,
): string | null {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return "Watching.";
  const n = me.nation;
  const rev = s.nations[n]?.desk?.rev;
  if (!rev || !s.nations[n].rebelling) return "There's no war with the crown.";
  if (side !== "patriot" && side !== "loyal" && side !== "neutral")
    return "Which side?";
  deskOf(g, n).rev!.sides[life.seat] = side as RevSide;
  touchLife(g, life);
  if (side === "patriot") {
    addRenown(g, life, 3);
    journal(
      g,
      life,
      "You stand with the patriots: your name is on the committee's list, and on the crown's.",
      "good",
    );
  } else if (side === "loyal") {
    addFavor(g, life, 5);
    journal(
      g,
      life,
      "You stand with the King. Your neighbours have seen which way you went.",
      "good",
    );
  } else
    journal(g, life, "You keep your head down and your counsel to yourself.");
  return null;
}

// ---------------------------------------------------------------- how it ends

hooks.gameEvent.push((g, e) => {
  if (e.k !== "independence" || e.won === null) return;
  const s = g.s;
  const n = e.n;
  const rev = s.nations[n]?.desk?.rev;
  if (!rev) return;
  const won = e.won;
  for (const l of s.lives) {
    if (l.c < 0 || l.watching || s.chars[l.c]?.nation !== n) continue;
    const side = rev.sides[l.seat] ?? "neutral";
    touchLife(g, l);
    if (won) {
      if (side === "patriot") {
        addRenown(g, l, REV.wonRenown);
        journal(
          g,
          l,
          "The crown has given up the war: the colony is free, and you stood for it.",
          "good",
        );
        milestone(
          g,
          l,
          "rising",
          `Stood with the patriots: ${s.nations[n].name} won its freedom`,
        );
      } else if (side === "loyal") {
        const lose = Math.floor(l.purse * REV.loyalLost);
        if (lose > 0)
          withFlow(
            g,
            { key: "rev:confiscated", label: "Confiscated by the committee" },
            () => spend(g, l, lose),
          );
        addRenown(g, l, REV.loyalLostRenown);
        journal(
          g,
          l,
          `The colony is free, and the committee remembers who stood with the King: ${lose} coins of your property confiscated.`,
          "bad",
        );
      } else
        journal(
          g,
          l,
          "The war with the crown is won. The colony is free.",
          "good",
        );
    } else {
      if (side === "patriot") {
        addHeat(g, l, n, REV.crushedHeat);
        addFavor(g, l, REV.crushedFavour);
        addRenown(g, l, REV.crushedRenown);
        journal(
          g,
          l,
          "The rebellion is crushed. The crown's officers have lists of names, and yours is on them.",
          "bad",
        );
      } else if (side === "loyal") {
        addFavor(g, l, REV.loyalWonFavour);
        addRenown(g, l, REV.loyalWonRenown);
        journal(
          g,
          l,
          "The rebellion is crushed, and the crown remembers its friends.",
          "good",
        );
      } else
        journal(
          g,
          l,
          "The rebellion is crushed. You kept your head down, and you keep it on.",
        );
    }
  }
  // The patriots' governor sets up the new government (Society › Colony).
  if (won) {
    const gov = lifeOfChar(s, rev.by);
    if (gov && s.nations[n].ruler === rev.by && gov.c === rev.by) {
      touchLife(g, gov).constitute = {
        n,
        until: s.day + DAYS_PER_YEAR,
        free: false,
      };
      raiseEvent(g, gov, "found-government", { n });
    }
  }
  deskOf(g, n).rev = null;
});

// ---------------------------------------------------------------- the days

hooks.daily.push((g) => {
  const s = g.s;
  for (const nation of s.nations) {
    const m = nation.desk?.motion;
    if (!m || m.result || m.divides > s.day) continue;
    if (!nation.alive || nation.ruler !== m.by) {
      deskOf(g, nation.id).motion = null;
      continue;
    }
    divide(g, nation.id);
  }
});
