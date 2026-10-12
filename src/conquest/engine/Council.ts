// POWER (r12): the governor's council as a cabinet. Eight seats with real
// portfolios (the secretary, the treasurer or receiver-general, the
// attorney general, the surveyor-general, the militia's general, the
// commissioner for the native nations, the chaplain, and the speaker of the
// assembly), each with things it can do to the colony through the nation's
// own engine: the treasury, the laws, land, forts, treaties and presents.
// Councillors vote on measures, sit with the governor's friends or the
// country party, rise and fall in the governor's favour, and are dismissed
// or disgraced. The governor appoints and dismisses them, issues
// proclamations, and answers the council and the assembly.

import { chooseSpeaker } from "./Assembly";
import { kill, makeNotable } from "./Characters";
import { seatHolderId, seatsOf, seatTitle } from "./CouncilTitles";
import { diplomacyCommand } from "./Diplomacy";
import { economyCommand } from "./Economy";
import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import { raiseEvent } from "./Hooks";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  journal,
  meet,
  milestone,
  remembers,
  touchLife,
} from "./LifeCore";
import {
  Check,
  isPlayed,
  lifeOfChar,
  meOf,
  no,
  officesOf,
  opinionOf,
  skillLevel,
  yes,
} from "./LifeQueries";
import { SKILL_NAMES } from "./LifeRules";
import { giveUpWarning, takingPost } from "./OneOffice";
import { pdice, power, powerChanged } from "./PowerCore";
import { ageOf, charName, provincesOf, settlers, stat } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { rumour } from "./Rumours";
import { hash01 } from "./SocietyCore";
import { accuse, graceTrials, prosecute } from "./Trials";
import type {
  Breakdown,
  Cabinet,
  Character,
  CouncilMatter,
  CouncilSeat,
  GameState,
  Life,
  MapDef,
  ModFx,
  Nation,
  Skill,
  Stat,
} from "./Types";
import { SEATS } from "./Types";
import { militaryCommand } from "./War";

// ---------------------------------------------------------------- the cabinet

/** A nation's cabinet record, made (and its colony's own seats filled) the first time. */
export function ensureCabinet(g: ConquestGame, n: number): Cabinet {
  const ps = power(g);
  let c = ps.cabinets[n];
  if (!c) {
    c = ps.cabinets[n] = {
      n,
      attorney: -1,
      surveyor: -1,
      speaker: -1,
      favour: {},
      faction: {},
      matters: [],
      bills: [],
      proclaimed: {},
      scandal: {},
    };
    powerChanged(g, `c${n}`);
  }
  c.bills ??= [];
  return c;
}

/** Everyone who sits now: seat and character. */
export function councillors(
  s: GameState,
  n: number,
): { seat: CouncilSeat; c: number }[] {
  const out: { seat: CouncilSeat; c: number }[] = [];
  for (const seat of seatsOf(s.nations[n])) {
    const id = seatHolderId(s, n, seat);
    if (id >= 0 && s.chars[id]?.alive) out.push({ seat, c: id });
  }
  return out;
}

/** What each seat tests: the skill a player needs, the stat a character brings. */
export const SEAT_SKILL: Record<CouncilSeat, [Skill, Stat]> = {
  spymaster: ["letters", "int"],
  treasurer: ["trade", "ste"],
  attorney: ["letters", "dip"],
  surveyor: ["woodcraft", "ste"],
  marshal: ["leadership", "mar"],
  envoy: ["persuasion", "dip"],
  chaplain: ["faith", "lea"],
  speaker: ["persuasion", "dip"],
};

/** How fit someone is for a seat, as the governor sees them (0 to about 20). */
export function seatFit(s: GameState, c: Character, seat: CouncilSeat): number {
  const life = lifeOfChar(s, c.id);
  const [sk, st] = SEAT_SKILL[seat];
  return life ? skillLevel(s, life, sk) : stat(s, c, st) * 1.6;
}

/** The governor's favour toward a councillor (0 to 100). */
export function favourOf(s: GameState, n: number, c: number): number {
  const v = s.power?.cabinets[n]?.favour[c];
  return v ?? 50;
}

export function factionOf(
  s: GameState,
  n: number,
  c: number,
): "court" | "country" {
  // A governor's council leans his way: most sit with his friends.
  return (
    s.power?.cabinets[n]?.faction[c] ??
    (hash01(c * 7919 + n * 104729, 77) < 0.68 ? "court" : "country")
  );
}

function setFavour(g: ConquestGame, n: number, c: number, dv: number): void {
  const cab = ensureCabinet(g, n);
  cab.favour[c] = Math.max(
    0,
    Math.min(100, Math.round((favourOf(g.s, n, c) + dv) * 10) / 10),
  );
  powerChanged(g, `c${n}`);
}

/** The papers (or anything else) move a councillor in the governor's favour. */
export function favourNudge(
  g: ConquestGame,
  n: number,
  c: number,
  dv: number,
): void {
  if (!councillors(g.s, n).some((x) => x.c === c)) return;
  setFavour(g, n, c, dv);
}

export function seatName(s: GameState, n: number, seat: CouncilSeat): string {
  return seatTitle(s, n, seat);
}

const shortName = (n: Nation) => n.name.replace(/^the /, "");

// ---------------------------------------------------------------- reaching a seat

/** The bar a claim must clear for an empty seat, and to unseat someone. */
export const CLAIM_BAR = 25;
export const UNSEAT_BAR = 45;

/** Your case for a seat: renown, favour at home, the governor's regard, connections, fitness. */
export function seatClaim(
  s: GameState,
  life: Life,
  n: number,
  seat: CouncilSeat,
): Breakdown {
  const e = new Explain();
  const me = meOf(s, life);
  const nation = s.nations[n];
  if (!me || !nation) return e.done(0);
  e.add(`Renown (${Math.floor(life.renown)})`, Math.min(20, life.renown / 3));
  if (life.favor > 0)
    e.add(
      nation.kind === "native" ? "The elders' regard" : "Favour at home",
      Math.min(12, life.favor / 4),
    );
  const gov = s.chars[nation.ruler];
  if (gov?.alive && gov.id !== me.id) {
    const op = opinionOf(s, gov, life).total;
    e.add(`What ${gov.first} thinks of you (${op})`, Math.round(op / 3));
    if (gov.spouse === me.id || gov.children.includes(me.id))
      e.add("The governor's own family", 15);
  }
  // Connections: a patron, friends at the table, a place at court.
  if (life.patron >= 0 && s.chars[life.patron]?.alive) e.add("A patron", 6);
  const friends = councillors(s, n).filter(
    (x) => life.ties[x.c] === "friend",
  ).length;
  if (friends) e.add("Friends on the council", Math.min(12, friends * 4));
  if (nation.court.includes(me.id)) e.add("Received at court", 5);
  const offices = officesOf(s, me.id);
  if (offices.some((o) => o.kind === "assembly"))
    e.add("A seat in the house", 6);
  else if (offices.some((o) => o.kind === "local" && o.level >= 1))
    e.add("A county office", 4);
  const [sk] = SEAT_SKILL[seat];
  const lvl = skillLevel(s, life, sk);
  e.add(
    `Your ${SKILL_NAMES[sk].toLowerCase()} (${lvl})`,
    Math.max(-10, Math.min(12, (lvl - 6) * 2)),
  );
  if (ageOf(s, me) < 25) e.add("Young for it", -8);
  if (life.scandal && life.scandal.until > s.day) e.add("The scandal", -20);
  if ((life.crime?.heat[n] ?? 0) >= 20) e.add("Wanted by the law", -25);
  if (life.lifestyle === "frugal") e.add("Not a gentleman's way of living", -6);
  return e.done(0);
}

/** Can you ask the governor for a seat (at the capital, in person). */
export function seekSeatCheck(
  s: GameState,
  life: Life,
  seat: CouncilSeat,
): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  const n = me.nation;
  const nation = s.nations[n];
  if (!nation?.alive || (nation.kind !== "power" && nation.kind !== "native"))
    return no("Your people keep no council.");
  if (!seatsOf(nation).includes(seat)) return no("No such seat here.");
  if (seat === "speaker")
    return no("The house chooses its speaker from its members.");
  if (nation.ruler === me.id) return no("You govern: you appoint.");
  if (seatHolderId(s, n, seat) === me.id) return no("You sit there.");
  if (life.travel || life.prov !== nation.capital)
    return no(`At the governor's house in the capital.`);
  if (ageOf(s, me) < 21) return no("Not before 21.");
  if (
    seat === "chaplain" &&
    me.religion === "native" &&
    nation.kind !== "native"
  )
    return no("A churchman's seat.");
  const left = (life.cooldowns[`seek-seat:${n}`] ?? 0) - s.day;
  if (left > 0) return no(`You asked lately (again in ${left} days).`);
  return yes;
}

/** What it would take: the claim against the bar, and whoever sits now. */
export function seatOdds(
  s: GameState,
  life: Life,
  n: number,
  seat: CouncilSeat,
): { claim: Breakdown; bar: number; holder: number } {
  const claim = seatClaim(s, life, n, seat);
  const holder = seatHolderId(s, n, seat);
  const h = s.chars[holder];
  let bar = CLAIM_BAR;
  if (h?.alive && holder !== life.c)
    bar = isPlayed(s, holder)
      ? Infinity
      : Math.max(
          UNSEAT_BAR,
          Math.round(seatFit(s, h, seat) * 2 + favourOf(s, n, holder) / 3),
        );
  return { claim, bar, holder };
}

/** Ask the governor for a seat. */
export function seekSeat(
  g: ConquestGame,
  life: Life,
  seat: CouncilSeat,
): string | null {
  const s = g.s;
  const check = seekSeatCheck(s, life, seat);
  if (!check.ok) return check.why;
  const me = meOf(s, life)!;
  const n = me.nation;
  const nation = s.nations[n];
  touchLife(g, life).cooldowns[`seek-seat:${n}`] = s.day + 90;
  const gov = s.chars[nation.ruler];
  if (gov?.alive) meet(g, life, gov.id);
  const govLife = gov ? lifeOfChar(s, gov.id) : undefined;
  if (govLife) {
    // Another player governs: it's their decision.
    raiseEvent(g, govLife, "council-asked", {
      c: me.id,
      seat: COUNCIL_INDEX[seat],
      n,
    });
    journal(
      g,
      life,
      `You ask ${charName(gov)} for the place of ${lowerFirst(seatName(s, n, seat))}. ${gov.female ? "She" : "He"} will let you know.`,
    );
    return null;
  }
  const o = seatOdds(s, life, n, seat);
  if (o.claim.total < o.bar) {
    journal(
      g,
      life,
      `${charName(gov)} hears you out, and keeps ${o.holder >= 0 ? "the present holder" : "the seat empty a while longer"}. (Your case ${Math.round(o.claim.total)}; it would take ${o.bar === Infinity ? "the holder's leaving" : o.bar}.)`,
      "bad",
    );
    return null;
  }
  seatCouncillor(g, n, seat, me.id, `appointed by ${charName(gov)}`);
  return null;
}

/** Index of each seat, for event contexts (numbers only). */
export const COUNCIL_INDEX: Record<CouncilSeat, number> = {
  spymaster: 0,
  treasurer: 1,
  attorney: 2,
  surveyor: 3,
  marshal: 4,
  envoy: 5,
  chaplain: 6,
  speaker: 7,
};
export const SEAT_BY_INDEX: CouncilSeat[] = [
  "spymaster",
  "treasurer",
  "attorney",
  "surveyor",
  "marshal",
  "envoy",
  "chaplain",
  "speaker",
];

/** Seat someone (resigning their other office, unseating the holder). */
export function seatCouncillor(
  g: ConquestGame,
  n: number,
  seat: CouncilSeat,
  c: number,
  how: string,
): void {
  const s = g.s;
  const nation = g.nation(n);
  const cab = ensureCabinet(g, n);
  const prev = seatHolderId(s, n, seat);
  if (prev === c) return;
  takingPost(g, c, { kind: "council", n, seat });
  if (prev >= 0 && s.chars[prev]?.alive)
    dismissCouncillor(g, n, seat, "replaced");
  // Off any other seat they had (takingPost did it for players; the
  // computer's people too).
  for (const st of SEATS) if (nation.council[st] === c) nation.council[st] = -1;
  if (cab.attorney === c) cab.attorney = -1;
  if (cab.surveyor === c) cab.surveyor = -1;
  if (seat === "attorney" || seat === "surveyor") cab[seat] = c;
  else if (seat !== "speaker") nation.council[seat] = c;
  nation.court = nation.court.filter((x) => x !== c);
  const life = lifeOfChar(s, c);
  const gov = s.chars[nation.ruler];
  cab.favour[c] = life
    ? Math.max(
        30,
        Math.min(80, 45 + (gov?.alive ? opinionOf(s, gov, life).total / 3 : 0)),
      )
    : 45 + Math.round(hash01(c, n, s.day) * 20);
  cab.faction[c] ??= life ? "court" : factionOf(s, n, c);
  powerChanged(g, `c${n}`);
  const title = `${seatName(s, n, seat)} of ${shortName(nation)}`;
  if (life) {
    touchLife(g, life).tally.topOffice = Math.max(life.tally.topOffice, 2);
    addRenown(g, life, 6);
    journal(g, life, `You're made ${title}, ${how}.`, "good");
    milestone(g, life, "office", `Made ${title}`);
    if (gov?.alive && gov.id !== c)
      remembers(g, life, g.char(gov.id), "Gave me a seat", 0, 0);
  } else if (gov?.alive && gov.id !== c) {
    g.char(c).memories.push({
      of: -1,
      why: `Made ${lowerFirst(seatName(s, n, seat))}`,
      value: 15,
      until: s.day + 3 * DAYS_PER_YEAR,
    });
  }
  rumour(
    g,
    s.nations[n].capital,
    `${charName(s.chars[c])} is made ${title}.`,
    c,
    "good",
    false,
    true,
  );
}

/** Put someone off the council. */
export function dismissCouncillor(
  g: ConquestGame,
  n: number,
  seat: CouncilSeat,
  why: string,
): void {
  const s = g.s;
  const id = seatHolderId(s, n, seat);
  if (id < 0) return;
  const nation = g.nation(n);
  const cab = ensureCabinet(g, n);
  if (seat === "attorney" || seat === "surveyor" || seat === "speaker")
    cab[seat] = -1;
  else nation.council[seat] = -1;
  if (
    nation.kind === "power" &&
    s.chars[id]?.alive &&
    !nation.court.includes(id)
  )
    nation.court.push(id);
  powerChanged(g, `c${n}`);
  const life = lifeOfChar(s, id);
  const title = `${seatName(s, n, seat)} of ${shortName(nation)}`;
  if (life) journal(g, life, `You are no longer ${title}: ${why}.`, "bad");
  else if (s.chars[id]?.alive)
    g.char(id).memories.push({
      of: -1,
      why: `Put off the council (${why})`,
      value: -20,
      until: s.day + 3 * DAYS_PER_YEAR,
    });
}

/**
 * The governor (the computer) thinks of a player at court, or one with a
 * good name, when a seat is empty or poorly held: a letter offering it.
 */
export function offerCouncilSeat(g: ConquestGame, life: Life): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me?.alive || life.watching) return;
  const n = me.nation;
  const nation = s.nations[n];
  if (!nation?.alive || (nation.kind !== "power" && nation.kind !== "native"))
    return;
  if (nation.ruler === me.id || isPlayed(s, nation.ruler)) return;
  if (councillors(s, n).some((x) => x.c === me.id)) return;
  if (life.events.some((e) => e.key === "council-offer")) return;
  if ((life.cooldowns["council-offer"] ?? 0) > s.day) return;
  // Only the grown, of some name, and received at court (the council fire
  // among the native peoples hears warriors and speakers of renown).
  if (ageOf(s, me) < 25 || life.renown < 20) return;
  const atCourt = nation.court.includes(me.id);
  if (!atCourt && nation.kind !== "native") return;
  // Native peoples: a warrior of rank for the war chief, a speaker for the speaker.
  const native = nation.kind === "native";
  for (const seat of seatsOf(nation)) {
    if (seat === "speaker") continue;
    if (native) {
      const fit =
        seat === "marshal"
          ? life.job?.kind === "warrior" && life.job.rank >= 2
          : seat === "envoy"
            ? (life.job?.kind === "speaker" && life.job.rank >= 1) ||
              life.renown >= 35
            : false;
      if (!fit) continue;
    }
    const o = seatOdds(s, life, n, seat);
    if (o.claim.total < o.bar) continue;
    // Someone not at court is only thought of for an empty seat.
    if (!atCourt && o.holder >= 0 && nation.kind !== "native") continue;
    touchLife(g, life).cooldowns["council-offer"] = s.day + 120;
    raiseEvent(g, life, "council-offer", { seat: COUNCIL_INDEX[seat], n });
    return;
  }
}

/** Accept an offered seat (from the letter). */
export function acceptSeat(
  g: ConquestGame,
  life: Life,
  n: number,
  seat: CouncilSeat,
): void {
  const s = g.s;
  const me = meOf(s, life);
  const nation = s.nations[n];
  if (!me || !nation?.alive || me.nation !== n) return;
  const holder = seatHolderId(s, n, seat);
  if (holder >= 0 && isPlayed(s, holder) && holder !== me.id) {
    journal(g, life, "Someone else took the seat before your answer came.");
    return;
  }
  const gov = s.chars[nation.ruler];
  seatCouncillor(
    g,
    n,
    seat,
    me.id,
    gov?.alive ? `at ${charName(gov)}'s invitation` : "by the council's choice",
  );
}

/** The warning for taking a seat (or null). */
export function seatWarning(
  s: GameState,
  w: Parameters<typeof giveUpWarning>[1],
  life: Life,
  n: number,
  seat: CouncilSeat,
): string | null {
  return giveUpWarning(s, w, life.c, { kind: "council", n, seat });
}

// ---------------------------------------------------------------- the portfolios

export type TargetKind = "nation" | "native" | "prov" | "person" | "none";

export interface SeatActionDef {
  key: string;
  seat: CouncilSeat;
  label: string;
  text: string;
  cooldown: number;
  target: TargetKind;
  /** A skill test, with the odds on the button. */
  check?: { skill: Skill; dc: number };
  /** A measure the council must carry (and the governor sign). */
  measure?: string;
  /** Why it can't be done now (beyond the cooldown and the target). */
  blocked?: (s: GameState, n: number) => string | null;
  /** The computer's councillors do it when this says so (a target, or 0 for none). */
  ai?: (g: ConquestGame, n: number) => number | null;
  run: (
    g: ConquestGame,
    n: number,
    by: number,
    t: number,
    pass: boolean,
  ) => string;
}

const natMod = (
  g: ConquestGame,
  n: number,
  key: string,
  label: string,
  days: number,
  fx: Partial<Record<ModFx, number>>,
) => {
  const x = g.nation(n);
  x.mods = x.mods.filter((m) => m.key !== key);
  x.mods.push({ key, label, until: g.s.day + days, fx });
};

/** Nations bordering a colony (by land). */
export function neighboursOf(
  g: { s: GameState; map: { provinces: { nb: number[][] }[] } },
  n: number,
): number[] {
  const s = g.s;
  const out = new Set<number>();
  for (const p of provincesOf(s, n))
    for (const [q] of g.map.provinces[p].nb) {
      const o = s.provinces[q]?.owner ?? -1;
      if (o >= 0 && o !== n && s.nations[o]?.alive) out.add(o);
    }
  return [...out].sort((a, b) => a - b);
}

/** A nation's memory of another: what it thinks of them, for a while. */
export function relate(
  g: ConquestGame,
  of: number,
  about: number,
  why: string,
  value: number,
  years: number,
): void {
  const x = g.nation(of);
  (x.relations[about] ??= []).push({
    of: -1,
    why,
    value,
    until: g.s.day + Math.round(years * DAYS_PER_YEAR),
  });
}

const avgUnrest = (s: GameState, n: number) => {
  const provs = provincesOf(s, n);
  return (
    provs.reduce((m, p) => m + s.provinces[p].unrest, 0) /
    Math.max(1, provs.length)
  );
};

const relationValue = (s: GameState, of: number, about: number) =>
  (s.nations[of]?.relations[about] ?? [])
    .filter((m) => m.until === 0 || m.until > s.day)
    .reduce((t, m) => t + m.value, 0);

export const SEAT_ACTIONS: SeatActionDef[] = [
  // ---- the secretary
  {
    key: "letters",
    seat: "spymaster",
    label: "Read the intercepted letters",
    text: "The post-office keeps a few letters back for you. Plots against the governor come to light; the governor's favour with them.",
    cooldown: 90,
    target: "none",
    check: { skill: "letters", dc: 7 },
    ai: (g, n) => (courtPlotters(g.s, n).length ? 0 : null),
    run: (g, n, by, t, pass) => {
      const plot = courtPlotters(g.s, n)[0];
      if (pass && plot) {
        g.char(plot.id).scheme!.exposed = true;
        setFavour(g, n, by, 8);
        return `A letter in cipher, badly kept: ${charName(plot)} is plotting against the governor. The governor knows now.`;
      }
      if (pass) {
        setFavour(g, n, by, 2);
        return "Nothing but quarrels over pigs and prices. The colony is loyal, this month.";
      }
      return "The letters say nothing, or say it in a cipher you can't read.";
    },
  },
  {
    key: "records",
    seat: "spymaster",
    label: "Put the colony's records in order",
    text: "Patents, minutes, commissions, the laws: copied fair and kept. The colony governs itself a little better for a year.",
    cooldown: 365,
    target: "none",
    ai: () => 0,
    run: (g, n, by) => {
      natMod(g, n, "council:records", "The records kept", DAYS_PER_YEAR, {
        admin: 1,
      });
      setFavour(g, n, by, 3);
      return "The minute-books are copied fair and the patents indexed. The colony's business runs smoother for a year.";
    },
  },
  // ---- the treasurer
  {
    key: "audit",
    seat: "treasurer",
    label: "Audit the accounts",
    text: "Every collector's book, line by line. Arrears come in; an embezzler may come to light.",
    cooldown: 180,
    target: "none",
    check: { skill: "trade", dc: 7 },
    ai: (g, n) => (g.s.nations[n].gold < 25 ? 0 : null),
    run: (g, n, by, t, pass) => {
      if (!pass)
        return "The books are a thicket. You find nothing you can prove.";
      const gold = 4 + Math.round(settlersOf(g.s, n) / 4000);
      g.nation(n).gold += Math.min(15, gold);
      setFavour(g, n, by, 5);
      const thief = courtPlotters(g.s, n).find(
        (c) => c.scheme?.kind === "embezzle",
      );
      if (thief) g.char(thief.id).scheme!.exposed = true;
      return `Arrears recovered: ${Math.min(15, gold)} into the treasury.${thief ? ` And ${charName(thief)}'s hand in the till, in black and white.` : ""}`;
    },
  },
  {
    key: "customs",
    seat: "treasurer",
    label: "Farm out the customs",
    text: "Let a syndicate of merchants collect the duties for a fixed sum: 25 into the treasury now, less revenue for three years.",
    cooldown: 730,
    target: "none",
    measure: "customs",
    blocked: (s, n) =>
      s.nations[n].kind !== "power" ? "A colony's business." : null,
    run: () => "",
  },
  {
    key: "paper",
    seat: "treasurer",
    label: "Propose an emission of paper money",
    text: "Bills of credit, to be taken for taxes: 30 into the treasury now; a sinking currency and a frown from home for three years.",
    cooldown: 1460,
    target: "none",
    measure: "paper",
    blocked: (s, n) =>
      s.nations[n].kind !== "power" ? "A colony's business." : null,
    run: () => "",
  },
  // ---- the attorney general
  {
    key: "prosecute",
    seat: "attorney",
    label: "Prosecute for the crown",
    text: "Lay an information against someone the law wants (heat 15 and more) or a disgraced official: a trial at the next sessions, with you as prosecutor.",
    cooldown: 60,
    target: "person",
    run: (g, n, by, t) => prosecute(g, n, by, t),
  },
  {
    key: "draft",
    seat: "attorney",
    label: "Draft the colony's laws",
    text: "Statutes that say what they mean: the governor's laws pass sooner, and the courts run smoother for a year.",
    cooldown: 365,
    target: "none",
    ai: () => 0,
    run: (g, n, by) => {
      natMod(g, n, "council:draft", "Laws well drafted", DAYS_PER_YEAR, {
        admin: 1,
        unrest: -1,
      });
      setFavour(g, n, by, 3);
      const gov = lifeOfChar(g.s, g.s.nations[n].ruler);
      if (gov && (gov.cooldowns["gov:law"] ?? 0) > g.s.day)
        touchLife(g, gov).cooldowns["gov:law"] = Math.max(
          g.s.day,
          gov.cooldowns["gov:law"] - 45,
        );
      return "You put the colony's laws in good English and better Latin. The courts thank you; so does the governor.";
    },
  },
  // ---- the surveyor-general
  {
    key: "survey",
    seat: "surveyor",
    label: "Survey the backcountry",
    text: "Chains, a compass and a month in the woods: new land opened to settlers for three years. The nations whose hunting grounds it is won't thank you.",
    cooldown: 365,
    target: "none",
    check: { skill: "woodcraft", dc: 7 },
    ai: (g, n) =>
      g.s.nations[n].kind === "power" && g.s.nations[n].colonists < 60
        ? 0
        : null,
    run: (g, n, by, t, pass) => {
      if (!pass)
        return "Rain, fever and a lost compass. The survey comes home half done.";
      natMod(
        g,
        n,
        "council:survey",
        "The backcountry surveyed",
        3 * DAYS_PER_YEAR,
        { colonists: 0.1 },
      );
      for (const o of neighboursOf(g, n))
        if (g.s.nations[o].kind === "native")
          relate(g, o, n, "Surveyors on our hunting grounds", -4, 3);
      setFavour(g, n, by, 4);
      return "The lines are run and the plats drawn: land for a thousand families. The nations beyond the line watch the surveyors' blazes go up.";
    },
  },
  {
    key: "boundary",
    seat: "surveyor",
    label: "Run the boundary line",
    text: "With a neighbour's surveyors: settle where one colony ends and the next begins. Fewer quarrels.",
    cooldown: 730,
    target: "nation",
    check: { skill: "letters", dc: 8 },
    run: (g, n, by, t, pass) => {
      const o = g.s.nations[t];
      if (!pass) {
        relate(g, t, n, "A boundary dispute", -3, 3);
        return `The line with ${o.name} ends in a quarrel over a creek.`;
      }
      relate(g, t, n, "The boundary agreed", 8, 8);
      relate(g, n, t, "The boundary agreed", 8, 8);
      setFavour(g, n, by, 4);
      return `The line with ${o.name} is run and marked, and both sides sign the map.`;
    },
  },
  {
    key: "patents",
    seat: "surveyor",
    label: "Take up land for your friends",
    text: "Patents for good land to people who'll remember it: 10 coins for you. A scandal if it comes out.",
    cooldown: 730,
    target: "none",
    blocked: (s, n) =>
      s.nations[n].kind !== "power" ? "A colony's business." : null,
    run: (g, n, by) =>
      graft(
        g,
        n,
        by,
        10,
        "land jobbing",
        "Patents for the best bottom land, to the right people, and a purse for you.",
      ),
  },
  // ---- the marshal
  {
    key: "muster",
    seat: "marshal",
    label: "Muster the colony's militia",
    text: "Every county's men on the green, inspected and drilled: steadier militia and quieter counties for a year.",
    cooldown: 365,
    target: "none",
    ai: (g, n) => (atWar(g.s, n) ? 0 : null),
    run: (g, n, by) => {
      natMod(g, n, "council:muster", "A general muster", DAYS_PER_YEAR, {
        unrest: -1,
        morale: 0.05,
      });
      for (const a of g.s.armies)
        if (a.owner === n)
          for (const r of g.touch(a).regs)
            r.morale = Math.min(1, r.morale + 0.05);
      setFavour(g, n, by, 3);
      return "Drums on every green from the coast to the falls. The militia's steadier for it, and the counties quieter.";
    },
  },
  {
    key: "fort",
    seat: "marshal",
    label: "Propose a fort on the frontier",
    text: "A fort in a frontier county, built from the treasury (the council must carry it).",
    cooldown: 730,
    target: "prov",
    measure: "fort",
    blocked: (s, n) =>
      s.nations[n].kind !== "power" ? "A colony's business." : null,
    run: () => "",
  },
  {
    key: "regiment",
    seat: "marshal",
    label: "Raise a regiment",
    text: "In wartime: a regiment of militia raised in a county, from the treasury.",
    cooldown: 180,
    target: "prov",
    blocked: (s, n) =>
      s.wars.some((w) => w.a === n || w.b === n)
        ? null
        : "Only in time of war.",
    run: (g, n, by, t) => {
      const kind = g.s.nations[n].kind === "native" ? "warriors" : "militia";
      const err = militaryCommand(g, n, { k: "recruit", p: t, t: kind });
      if (err) return `!${err}`;
      setFavour(g, n, by, 3);
      return `A regiment of ${kind} is raised at ${g.map.provinces[t].name}.`;
    },
  },
  // ---- the envoy
  {
    key: "treat",
    seat: "envoy",
    label: "Treat with a neighbour",
    text: "A council under the trees (or at a governor's table): belts, speeches and promises. Better relations if it goes well.",
    cooldown: 180,
    target: "nation",
    check: { skill: "persuasion", dc: 8 },
    ai: (g, n) => {
      const bad = neighboursOf(g, n).find(
        (o) => relationValue(g.s, o, n) < -10,
      );
      return bad ?? null;
    },
    run: (g, n, by, t, pass) => {
      const o = g.s.nations[t];
      if (!pass) {
        relate(g, t, n, "A council that went badly", -3, 2);
        return `The talks with ${o.name} break up in hard words.`;
      }
      relate(g, t, n, "A treaty council", 10, 5);
      relate(g, n, t, "A treaty council", 6, 5);
      setFavour(g, n, by, 5);
      return `Belts given and taken, and the ${o.name} go home pleased. Peace is surer for it.`;
    },
  },
  {
    key: "presents",
    seat: "envoy",
    label: "Send presents to a nation",
    text: "Cloth, kettles, guns and powder from the treasury (10): the old way of keeping a friend.",
    cooldown: 365,
    target: "native",
    measure: "presents",
    run: () => "",
  },
  {
    key: "trade",
    seat: "envoy",
    label: "Propose a treaty of trade",
    text: "Open the paths and the markets with a neighbour, if they'll have it.",
    cooldown: 730,
    target: "nation",
    measure: "trade",
    run: () => "",
  },
  // ---- the chaplain
  {
    key: "thanksgiving",
    seat: "chaplain",
    label: "Call for a day of thanksgiving",
    text: "Every church full and every shop shut: the colony's quieter for half a year.",
    cooldown: 365,
    target: "none",
    ai: (g, n) => (avgUnrest(g.s, n) > 25 ? 0 : null),
    run: (g, n, by) => {
      natMod(g, n, "council:thanks", "A day of thanksgiving", 180, {
        unrest: -2,
      });
      setFavour(g, n, by, 2);
      return "Sermons from every pulpit, and a feast after. The colony counts its blessings, and grumbles less.";
    },
  },
  {
    key: "mission",
    seat: "chaplain",
    label: "Send a mission to a nation",
    text: "Missionaries and a schoolmaster to a native nation: friendship if they're welcome, and danger if they're not.",
    cooldown: 730,
    target: "native",
    run: (g, n, by, t) => {
      const o = g.s.nations[t];
      if (pdice(g).chance(0.15)) {
        relate(g, t, n, "Missionaries who wouldn't leave", -8, 3);
        return `The mission to the ${o.name} ends badly: the missionaries are sent home, or worse.`;
      }
      relate(g, t, n, "A mission and a school", 5, 5);
      setFavour(g, n, by, 3);
      return `A mission and a school among the ${o.name}. Some come to listen; more come for the school's bread.`;
    },
  },
  {
    key: "heresy",
    seat: "chaplain",
    label: "Inquire into witchcraft or heresy",
    text: "Where the law still hunts them: an accusation before the court. Fear, a trial, and whatever comes after.",
    cooldown: 365,
    target: "person",
    blocked: (s, n) =>
      huntsHeresy(s, n) ? null : "Not in this colony, in these years.",
    run: (g, n, by, t) => accuse(g, n, by, t),
  },
  // ---- the speaker
  {
    key: "address",
    seat: "speaker",
    label: "Present the house's address",
    text: "Carry the assembly's grievances to the governor in person. The country party loves you for it; the governor doesn't.",
    cooldown: 180,
    target: "none",
    run: (g, n, by) => {
      const gov = g.s.chars[g.s.nations[n].ruler];
      const life = lifeOfChar(g.s, by);
      if (life) addRenown(g, life, 3);
      setFavour(g, n, by, -6);
      if (gov?.alive && life)
        remembers(
          g,
          life,
          g.char(gov.id),
          "Read me the house's grievances",
          -6,
          2,
        );
      natMod(g, n, "council:address", "The house heard", 180, { unrest: -1 });
      return `You read the house's address to ${charName(gov)}: the roads, the quitrents, the fees. ${gov?.female ? "She" : "He"} listens with a face like a closed door. The counties are pleased you said it.`;
    },
  },
];

export const SEAT_ACTION_BY_KEY = new Map(SEAT_ACTIONS.map((a) => [a.key, a]));

function settlersOf(s: GameState, n: number): number {
  return provincesOf(s, n).reduce((m, p) => m + settlers(s.provinces[p]), 0);
}

function courtPlotters(s: GameState, n: number): Character[] {
  const nation = s.nations[n];
  const ids = new Set<number>([
    ...nation.court,
    ...(Object.values(nation.council) as number[]),
  ]);
  return [...ids]
    .map((id) => s.chars[id])
    .filter(
      (c): c is Character => !!c?.alive && !!c.scheme && !c.scheme.exposed,
    )
    .sort((a, b) => a.id - b.id);
}

/** Where heresy or witchcraft is still hunted, in these years. */
export function huntsHeresy(
  s: GameState,
  n: number,
): "witchcraft" | "heresy" | null {
  const nation = s.nations[n];
  if (!nation || nation.kind !== "power") return null;
  const year = 1607 + Math.floor(s.day / DAYS_PER_YEAR);
  if (nation.culture === "spanish" || nation.culture === "portuguese")
    return year < 1776 ? "heresy" : null;
  if (
    (nation.religion === "puritan" || nation.culture === "english") &&
    year >= 1640 &&
    year <= 1700
  )
    return "witchcraft";
  return null;
}

/** Money in your own pocket, and a scandal if it comes out. */
function graft(
  g: ConquestGame,
  n: number,
  by: number,
  coins: number,
  what: string,
  text: string,
): string {
  const life = lifeOfChar(g.s, by);
  if (life) earn(g, life, coins);
  const caught = pdice(g).chance(
    life
      ? Math.max(0.12, 0.35 - skillLevel(g.s, life, "stealth") * 0.015)
      : 0.25,
  );
  if (!caught) return `${text} (+${coins} coins)`;
  disgrace(g, n, by, what);
  return `${text} (+${coins} coins.) And then it's all over the colony: ${what}.`;
}

/** A councillor disgraced: the governor's favour gone, and the talk. */
export function disgrace(
  g: ConquestGame,
  n: number,
  c: number,
  what: string,
): void {
  const s = g.s;
  const cab = ensureCabinet(g, n);
  cab.scandal[c] = s.day + DAYS_PER_YEAR;
  setFavour(g, n, c, -30);
  const life = lifeOfChar(s, c);
  if (life) {
    touchLife(g, life).scandal = {
      until: s.day + DAYS_PER_YEAR,
      text: `Disgraced: ${what}`,
    };
    addRenown(g, life, -5);
  }
  rumour(
    g,
    s.nations[n].capital,
    `${charName(s.chars[c])} of the council is disgraced: ${what}.`,
    c,
    "bad",
  );
}

/** The seat you hold on your nation's council, if any. */
export function mySeat(s: GameState, life: Life): CouncilSeat | null {
  const me = meOf(s, life);
  if (!me) return null;
  return councillors(s, me.nation).find((x) => x.c === me.id)?.seat ?? null;
}

/** Targets for a seat's action. */
export function actionTargets(
  s: GameState,
  map: { provinces: { name: string; nb: number[][] }[] },
  life: Life,
  a: SeatActionDef,
): { id: number; label: string }[] {
  const me = meOf(s, life);
  if (!me) return [];
  const n = me.nation;
  switch (a.target) {
    case "nation":
    case "native":
      return neighboursOf({ s, map }, n)
        .filter((o) => a.target === "nation" || s.nations[o].kind === "native")
        .map((o) => ({ id: o, label: s.nations[o].name.replace(/^the /, "") }));
    case "prov":
      return provincesOf(s, n).map((p) => ({
        id: p,
        label: map.provinces[p].name,
      }));
    case "person":
      return prosecutable(s, n, me.id).map((c) => ({
        id: c.id,
        label: charName(c),
      }));
    default:
      return [];
  }
}

/** People the colony's law could bring to trial: the wanted, the disgraced, the suspect. */
export function prosecutable(
  s: GameState,
  n: number,
  except: number,
): Character[] {
  const out = new Map<number, Character>();
  for (const l of s.lives) {
    const c = s.chars[l.c];
    if (!c?.alive || c.id === except || l.watching) continue;
    if (
      (l.crime?.heat[n] ?? 0) >= 15 ||
      (l.scandal && l.scandal.until > s.day && c.nation === n)
    )
      out.set(c.id, c);
  }
  const cab = s.power?.cabinets[n];
  for (const [id, until] of Object.entries(cab?.scandal ?? {}))
    if (until > s.day && s.chars[Number(id)]?.alive && Number(id) !== except)
      out.set(Number(id), s.chars[Number(id)]);
  // Townsfolk of the capital, for the chaplain's inquiries.
  if (huntsHeresy(s, n))
    for (const id of s.locals[s.nations[n].capital] ?? []) {
      const c = s.chars[id];
      if (
        c?.alive &&
        c.id !== except &&
        ageOf(s, c) >= 18 &&
        !isPlayed(s, c.id)
      )
        out.set(c.id, c);
      if (out.size > 16) break;
    }
  return [...out.values()].sort((a, b) => a.id - b.id);
}

/** Can you use a seat's power now. */
export function seatActionCheck(s: GameState, life: Life, key: string): Check {
  const a = SEAT_ACTION_BY_KEY.get(key);
  const me = meOf(s, life);
  if (!a || !me) return no("No such power.");
  if (mySeat(s, life) !== a.seat) return no("It isn't your seat's to do.");
  const n = me.nation;
  if (life.travel) return no("You're on the road.");
  const why = a.blocked?.(s, n);
  if (why) return no(why);
  const left = (life.cooldowns[`seat:${key}`] ?? 0) - s.day;
  if (left > 0) return no(`Again in ${left} days.`);
  if (
    a.measure &&
    s.power?.cabinets[n]?.matters.some(
      (m) => m.status === "open" && m.key === a.measure,
    )
  )
    return no("It's before the council already.");
  if (a.measure === "presents" && s.nations[n].gold < 10)
    return no("The treasury can't spare 10.");
  return yes;
}

/** A councillor uses their seat's power (or puts a measure to the council). */
export function useSeatAction(
  g: ConquestGame,
  life: Life,
  key: string,
  t: number,
): string | null {
  const s = g.s;
  const check = seatActionCheck(s, life, key);
  if (!check.ok) return check.why;
  const a = SEAT_ACTION_BY_KEY.get(key)!;
  const me = meOf(s, life)!;
  const n = me.nation;
  if (
    a.target !== "none" &&
    !actionTargets(s, g.map, life, a).some((x) => x.id === t)
  )
    return "Choose whom (or where).";
  touchLife(g, life).cooldowns[`seat:${key}`] = s.day + a.cooldown;
  if (a.measure) {
    const m = putMeasure(g, n, a.measure, t, me.id);
    if (typeof m === "string") {
      delete life.cooldowns[`seat:${key}`];
      return m;
    }
    journal(
      g,
      life,
      `You lay a measure before the council: ${m.title}. It divides on ${m.until - s.day} days from now.`,
    );
    return null;
  }
  let pass = true;
  if (a.check) {
    const lvl = skillLevel(s, life, a.check.skill);
    pass = pdice(g).chance(
      Math.max(0.08, Math.min(0.95, 0.6 + (lvl - a.check.dc) * 0.07)),
    );
    gainXp(g, life, a.check.skill, 6);
  }
  const text = a.run(g, n, me.id, t, pass);
  if (text.startsWith("!")) {
    delete life.cooldowns[`seat:${key}`];
    return text.slice(1);
  }
  if (!pass) addStress(g, life, 2);
  else addRenown(g, life, 1);
  journal(g, life, text, pass ? "good" : "bad");
  return null;
}

// ---------------------------------------------------------------- measures and votes

export interface MeasureDef {
  title: (g: { s: GameState; map: MapDef }, n: number, arg: number) => string;
  text: string;
  /** How a seat leans on it (+ aye), before party and favour. */
  lean: Partial<Record<CouncilSeat, number>>;
  /** The court party follows the governor; this is how the country party feels. */
  country: number;
  /** How the governor (the computer) leans. */
  gov: number;
  blocked?: (s: GameState, n: number, arg: number) => string | null;
  /** Only the council's advice on a governor's own decision (not put to a vote). */
  advice?: boolean;
  apply: (g: ConquestGame, n: number, arg: number) => string;
}

export const MEASURES: Record<string, MeasureDef> = {
  customs: {
    title: () => "Farm out the customs",
    text: "25 into the treasury now; revenue −6% for three years.",
    lean: { treasurer: 3, spymaster: 1 },
    country: -1,
    gov: 1,
    apply: (g, n) => {
      g.nation(n).gold += 25;
      natMod(
        g,
        n,
        "council:customs",
        "The customs farmed out",
        3 * DAYS_PER_YEAR,
        { tax: -0.06 },
      );
      return "The customs are farmed out: 25 into the treasury, less to come.";
    },
  },
  paper: {
    title: () => "An emission of paper money",
    text: "30 into the treasury; taxes −5%, favour at home −4, for three years.",
    lean: { treasurer: 2, attorney: -1, spymaster: -1 },
    country: 2,
    gov: -2,
    apply: (g, n) => {
      g.nation(n).gold += 30;
      natMod(g, n, "council:paper", "Bills of credit", 3 * DAYS_PER_YEAR, {
        tax: -0.05,
        favor: -4,
      });
      return "Bills of credit are printed and the treasury's full, for now.";
    },
  },
  fort: {
    title: (g, n, p) =>
      `A fort at ${g.map.provinces[p]?.name ?? "the frontier"}`,
    text: "A fort built in a county, from the treasury.",
    lean: { marshal: 3, treasurer: -1 },
    country: 0,
    gov: 1,
    blocked: (s, n, p) =>
      s.provinces[p]?.owner === n ? null : "That isn't the colony's.",
    apply: (g, n, p) => {
      const err = economyCommand(g, n, { k: "build", p, b: "fort" });
      return err ? `!${err}` : `A fort is begun at ${g.map.provinces[p].name}.`;
    },
  },
  presents: {
    title: (g, n, o) => `Presents for the ${g.s.nations[o]?.name ?? "nation"}`,
    text: "10 from the treasury in cloth, kettles and powder.",
    lean: { envoy: 3, treasurer: -1, marshal: 1 },
    country: -1,
    gov: 1,
    apply: (g, n, o) => {
      const s = g.s;
      if (s.nations[n].gold < 10) return "!The treasury can't spare it.";
      g.nation(n).gold -= 10;
      relate(g, o, n, "Presents from the council", 8, 3);
      return `Presents go to the ${s.nations[o].name}, with a fine speech.`;
    },
  },
  trade: {
    title: (g, n, o) =>
      `A treaty of trade with ${g.s.nations[o]?.name ?? "them"}`,
    text: "Open the markets with a neighbour, if they'll have it.",
    lean: { envoy: 2, treasurer: 2 },
    country: 1,
    gov: 1,
    apply: (g, n, o) => {
      const err = diplomacyCommand(g, n, { k: "treaty", n: o, t: "trade" });
      return err ? `!${err}` : `A treaty of trade with ${g.s.nations[o].name}.`;
    },
  },
  taxup: {
    title: () => "Raise the taxes",
    text: "More revenue, and more grumbling in the counties.",
    lean: { treasurer: 2, marshal: 1, speaker: -2 },
    country: -3,
    gov: 1,
    blocked: (s, n) =>
      s.nations[n].tax >= 2 ? "Taxes are as high as they go." : null,
    apply: (g, n) => {
      const err = economyCommand(g, n, {
        k: "tax",
        level: Math.min(2, g.s.nations[n].tax + 1) as 0 | 1 | 2,
      });
      return err ? `!${err}` : "The taxes go up.";
    },
  },
  taxdown: {
    title: () => "Lower the taxes",
    text: "Quieter counties, a thinner treasury.",
    lean: { treasurer: -2, speaker: 2 },
    country: 3,
    gov: -1,
    blocked: (s, n) =>
      s.nations[n].tax <= 0 ? "Taxes are as low as they go." : null,
    apply: (g, n) => {
      const err = economyCommand(g, n, {
        k: "tax",
        level: Math.max(0, g.s.nations[n].tax - 1) as 0 | 1 | 2,
      });
      return err ? `!${err}` : "The taxes come down.";
    },
  },
  thanksgiving: {
    title: () => "A day of public thanksgiving",
    text: "Unrest −2 across the colony for half a year.",
    lean: { chaplain: 3 },
    country: 1,
    gov: 1,
    apply: (g, n) => {
      natMod(g, n, "council:thanks", "A day of thanksgiving", 180, {
        unrest: -2,
      });
      return "A day of thanksgiving is proclaimed.";
    },
  },
  grant: {
    title: () => "A land grant to a company of adventurers",
    text: "Settlers come faster for two years; the nations beyond the line take it ill.",
    lean: { surveyor: 3, envoy: -2, treasurer: 1 },
    country: 1,
    gov: 1,
    apply: (g, n) => {
      natMod(
        g,
        n,
        "council:grant",
        "A land company's grant",
        2 * DAYS_PER_YEAR,
        { colonists: 0.15 },
      );
      for (const o of neighboursOf(g, n))
        if (g.s.nations[o].kind === "native")
          relate(g, o, n, "Land given away that was ours", -5, 4);
      return "The land company has its grant, and its agents are already in the backcountry.";
    },
  },
  war: {
    title: () => "War",
    text: "A declaration of war.",
    lean: { marshal: 3, envoy: -2, treasurer: -2, chaplain: -1 },
    country: -1,
    gov: 0,
    advice: true,
    apply: () => "!",
  },
  project: {
    title: () => "A public work",
    text: "A public work from the treasury.",
    lean: { treasurer: -1, surveyor: 1, chaplain: 1 },
    country: 0,
    gov: 1,
    advice: true,
    apply: () => "!",
  },
  law: {
    title: () => "A law",
    text: "A law of the colony.",
    lean: { attorney: 1, spymaster: 1 },
    country: -1,
    gov: 1,
    advice: true,
    apply: () => "!",
  },
  remit: {
    title: () => "Send more of the revenue home",
    text: "The crown's favour, and less in the colony's treasury.",
    lean: { spymaster: 1, treasurer: -2 },
    country: -3,
    gov: 1,
    blocked: (s, n) =>
      s.nations[n].independent || s.nations[n].remit >= 0.5 ? "Not now." : null,
    apply: (g, n) => {
      const x = g.nation(n);
      x.remit = Math.min(0.5, Math.round((x.remit + 0.05) * 100) / 100);
      return "More of the revenue goes home in the next ship.";
    },
  },
};

/** How a councillor would vote on a measure, and why. */
export function councillorVote(
  s: GameState,
  n: number,
  key: string,
  seat: CouncilSeat,
  c: number,
  by: number,
): { v: number; why: string } {
  const def = MEASURES[key];
  if (!def) return { v: 0, why: "" };
  const nation = s.nations[n];
  const governors = by === nation.ruler;
  const court = factionOf(s, n, c) === "court";
  let v = def.lean[seat] ?? 0;
  let why = def.lean[seat]
    ? def.lean[seat]! > 0
      ? "It's in their portfolio's interest"
      : "It cuts against their portfolio"
    : "";
  if (court) {
    v += governors ? 3 : def.gov;
    if (governors) why ||= "The governor's friend";
  } else {
    v += def.country;
    if (governors) v -= 1;
    if (!why)
      why =
        def.country > 0
          ? "The country party likes it"
          : def.country < 0
            ? "The country party is against it"
            : "";
  }
  if (c === by) return { v: 10, why: "Brought it" };
  // A councillor in disfavour sulks.
  const fav = favourOf(s, n, c);
  if (governors) v += (fav - 50) / 25;
  v += hash01(c, key.length, n, Math.floor(s.day / 30)) * 2 - 1;
  return { v: v > 0.2 ? 1 : v < -0.2 ? -1 : 0, why: why || "On the merits" };
}

/** The council's advice on a measure: each councillor's vote. */
export function councilAdvice(
  s: GameState,
  n: number,
  key: string,
  by: number,
): {
  ayes: number;
  noes: number;
  votes: { c: number; seat: CouncilSeat; v: number; why: string }[];
} {
  const votes = councillors(s, n).map(({ seat, c }) => ({
    c,
    seat,
    ...councillorVote(s, n, key, seat, c, by),
  }));
  return {
    ayes: votes.filter((x) => x.v > 0).length,
    noes: votes.filter((x) => x.v < 0).length,
    votes,
  };
}

/** Put a measure before the council: it divides in a week. */
export function putMeasure(
  g: ConquestGame,
  n: number,
  key: string,
  arg: number,
  by: number,
): CouncilMatter | string {
  const s = g.s;
  const def = MEASURES[key];
  if (!def || def.advice) return "No such measure.";
  const why = def.blocked?.(s, n, arg);
  if (why) return why;
  const cab = ensureCabinet(g, n);
  if (cab.matters.some((m) => m.status === "open" && m.key === key))
    return "It's before the council already.";
  const m: CouncilMatter = {
    id: g.nextId(),
    key,
    title: def.title(g, n, arg),
    text: def.text,
    by,
    arg,
    day: s.day,
    until: s.day + 7,
    votes: {},
    status: "open",
  };
  // The computer's councillors make up their minds at once.
  for (const { seat, c } of councillors(s, n)) {
    if (isPlayed(s, c)) continue;
    m.votes[c] = councillorVote(s, n, key, seat, c, by).v;
  }
  if (isPlayed(s, by)) m.votes[by] = 1;
  cab.matters.push(m);
  cab.matters = cab.matters
    .filter((x) => x.status === "open" || s.day - x.day < 2 * DAYS_PER_YEAR)
    .slice(-12);
  powerChanged(g, `c${n}`);
  // Players at the table are asked.
  for (const { c } of councillors(s, n)) {
    if (c === by) continue;
    const life = lifeOfChar(s, c);
    if (life) raiseEvent(g, life, "council-vote", { m: m.id, n });
  }
  return m;
}

/** A player's vote on an open matter. */
export function voteMatter(
  g: ConquestGame,
  life: Life,
  n: number,
  id: number,
  v: number,
): string | null {
  const s = g.s;
  const cab = s.power?.cabinets[n];
  const m = cab?.matters.find((x) => x.id === id && x.status === "open");
  if (!cab || !m) return "It's been decided.";
  if (!councillors(s, n).some((x) => x.c === life.c))
    return "You don't sit on the council.";
  m.votes[life.c] = v > 0 ? 1 : v < 0 ? -1 : 0;
  powerChanged(g, `c${n}`);
  // With the governor, or against.
  const gov = s.nations[n].ruler;
  if (m.by === gov && v !== 0) {
    setFavour(g, n, life.c, v > 0 ? 4 : -6);
    record(g, n, life.c, v > 0 ? 1 : -1);
    if (v < 0) addRenown(g, life, 1);
  }
  journal(
    g,
    life,
    v > 0
      ? `You vote aye: ${m.title}.`
      : v < 0
        ? `You vote no: ${m.title}.`
        : `You abstain on ${m.title}.`,
  );
  return null;
}

/** A player's record of votes with (+) and against (−) the governor: it decides their party. */
function record(g: ConquestGame, n: number, c: number, v: number): void {
  const cab = ensureCabinet(g, n);
  cab.record ??= {};
  const r = (cab.record[c] = Math.max(
    -4,
    Math.min(4, (cab.record[c] ?? 0) + v),
  ));
  const was = cab.faction[c];
  if (r >= 2) cab.faction[c] = "court";
  else if (r <= -2) cab.faction[c] = "country";
  if (was !== cab.faction[c]) {
    const life = lifeOfChar(g.s, c);
    if (life)
      journal(
        g,
        life,
        cab.faction[c] === "court"
          ? "You're counted among the governor's friends now (the court party)."
          : "You're counted with the country party now: the governor's opposition.",
      );
  }
  powerChanged(g, `c${n}`);
}

/** The council divides on its open matters. */
function decideMatters(g: ConquestGame, n: number): void {
  const s = g.s;
  const cab = s.power?.cabinets[n];
  if (!cab) return;
  for (const m of cab.matters) {
    if (m.status !== "open" || s.day < m.until) continue;
    const ayes = Object.values(m.votes).filter((v) => v > 0).length;
    const noes = Object.values(m.votes).filter((v) => v < 0).length;
    const nation = s.nations[n];
    const govPlayed = isPlayed(s, nation.ruler);
    const fromGov = m.by === nation.ruler;
    let carried = ayes > noes;
    // The governor signs what the council carries: a player governor
    // brought it or will be asked; the computer signs unless it's against
    // his instructions and the mover is out of favour.
    if (carried && !fromGov && !govPlayed) {
      const def = MEASURES[m.key];
      if (def.gov < 0 && favourOf(s, n, m.by) < 60) carried = false;
    }
    if (carried && !fromGov && govPlayed) {
      const gl = lifeOfChar(s, nation.ruler)!;
      m.status = "open";
      m.until = s.day + 15;
      if (!gl.events.some((e) => e.key === "council-assent"))
        raiseEvent(g, gl, "council-assent", { m: m.id, n });
      m.votes[-1] = 0;
      continue;
    }
    settleMatter(g, n, m, carried, ayes, noes);
  }
}

/** FIXES (r15): a title mid-sentence: only its first letter lowered. */
const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** A matter carried (and done) or lost. */
export function settleMatter(
  g: ConquestGame,
  n: number,
  m: CouncilMatter,
  carried: boolean,
  ayes: number,
  noes: number,
): void {
  const s = g.s;
  let text = "";
  let undone = false; // FIXES (r15): carried, but it couldn't be done
  if (carried) {
    const out = MEASURES[m.key].apply(g, n, m.arg);
    if (out.startsWith("!")) {
      carried = false;
      undone = true;
      text = out.slice(1);
    } else text = out;
  }
  // FIXES (r15): "presents for the Haudenosaunee", not "the haudenosaunee".
  const title = lowerFirst(m.title);
  m.status = carried ? "carried" : "lost";
  powerChanged(g, `c${n}`);
  for (const { c } of councillors(s, n)) {
    const life = lifeOfChar(s, c);
    if (!life) continue;
    journal(
      g,
      life,
      carried
        ? `The council carries ${title} (${ayes} to ${noes}). ${text}`
        : undone
          ? `The council carries ${title} (${ayes} to ${noes}), but it can't be done: ${lowerFirst(text)}`
          : `The council throws out ${title} (${noes} against${ayes ? `, ${ayes} for` : ""}).${text ? ` ${text}` : ""}`,
      carried ? "good" : "bad",
    );
  }
  const by = lifeOfChar(s, m.by);
  if (by && !councillors(s, n).some((x) => x.c === m.by))
    journal(
      g,
      by,
      carried
        ? `The council carries ${title}.`
        : undone
          ? `The council carries ${title}, but it can't be done: ${lowerFirst(text)}`
          : `The council throws out ${title}.`,
    );
  if (carried && m.by !== s.nations[n].ruler) setFavour(g, n, m.by, 3);
}

/** A player governor signs (or refuses) what the council carried. */
export function signMatter(
  g: ConquestGame,
  life: Life,
  n: number,
  id: number,
  yes2: boolean,
): string | null {
  const s = g.s;
  if (s.nations[n]?.ruler !== life.c) return "Only the governor signs.";
  const m = s.power?.cabinets[n]?.matters.find(
    (x) => x.id === id && x.status === "open",
  );
  if (!m) return "It's been settled.";
  const ayes = Object.entries(m.votes).filter(
    ([k, v]) => Number(k) >= 0 && v > 0,
  ).length;
  const noes = Object.entries(m.votes).filter(
    ([k, v]) => Number(k) >= 0 && v < 0,
  ).length;
  delete m.votes[-1];
  if (!yes2) {
    setFavour(g, n, m.by, -4);
    settleMatter(g, n, m, false, ayes, noes);
    journal(g, life, `You refuse to sign ${lowerFirst(m.title)}.`);
    return null;
  }
  settleMatter(g, n, m, true, ayes, noes);
  journal(g, life, `You sign ${lowerFirst(m.title)}.`, "good");
  return null;
}

// ---------------------------------------------------------------- the governor's hand

export interface ProclamationDef {
  key: string;
  label: string;
  text: string;
  cooldown: number;
  cost?: number;
  /** Needs a county (martial law). */
  county?: boolean;
  blocked?: (s: GameState, n: number) => string | null;
  /** How the council takes it (for the advice): the key of a similar measure, or the leanings. */
  lean: Partial<Record<CouncilSeat, number>>;
  country: number;
  apply: (g: ConquestGame, n: number, p: number) => string;
}

const atWar = (s: GameState, n: number) =>
  s.wars.some((w) => w.a === n || w.b === n);

export const PROCLAMATIONS: ProclamationDef[] = [
  {
    key: "thanksgiving",
    label: "A day of public thanksgiving",
    text: "Unrest −3 across the colony for half a year; a day's work lost.",
    cooldown: 365,
    lean: { chaplain: 3 },
    country: 1,
    apply: (g, n) => {
      natMod(g, n, "proc:thanks", "A day of thanksgiving", 180, { unrest: -3 });
      return "A day of public thanksgiving is proclaimed: sermons, a feast, and a quieter colony.";
    },
  },
  {
    key: "fast",
    label: "A day of fasting and humiliation",
    text: "In war or sickness: the colony bears it better (unrest −2 and steadier men for half a year).",
    cooldown: 365,
    lean: { chaplain: 2, marshal: 1 },
    country: 0,
    blocked: (s, n) =>
      atWar(s, n) ||
      s.provinces[s.nations[n].capital]?.mods.some(
        (m) => (m.fx.disease ?? 0) > 0,
      )
        ? null
        : "Only in war or sickness.",
    apply: (g, n) => {
      natMod(g, n, "proc:fast", "A day of fasting", 180, {
        unrest: -2,
        morale: 0.05,
      });
      return "A day of fasting and humiliation: the colony prays, and steadies.";
    },
  },
  {
    key: "wolves",
    label: "A bounty on wolves",
    text: "6 from the treasury: the colony's farms +2% for two years.",
    cooldown: 730,
    cost: 6,
    lean: { treasurer: -1, surveyor: 1 },
    country: 2,
    apply: (g, n) => {
      natMod(g, n, "proc:wolves", "A bounty on wolves", 2 * DAYS_PER_YEAR, {
        production: 0.02,
      });
      return "A bounty on wolves is proclaimed. The court-house doors are soon nailed with ears.";
    },
  },
  {
    key: "frontier",
    label: "Close the frontier to settlement",
    text: "No settling beyond the line: the native nations +8 toward you, settlers −20% and the backcountry angry (unrest +3), for three years.",
    cooldown: 1460,
    lean: { envoy: 3, surveyor: -3, marshal: 1 },
    country: -3,
    blocked: (s, n) =>
      s.nations[n].kind === "power" ? null : "A colony's proclamation.",
    apply: (g, n) => {
      natMod(g, n, "proc:frontier", "The frontier closed", 3 * DAYS_PER_YEAR, {
        colonists: -0.2,
        unrest: 3,
      });
      for (const o of neighboursOf(g, n))
        if (g.s.nations[o].kind === "native")
          relate(g, o, n, "The governor's line", 8, 3);
      return "The governor's proclamation draws a line: no settling beyond it. The nations are glad; the backcountry is furious.";
    },
  },
  {
    key: "reward",
    label: "A reward for taking rogues",
    text: "10 from the treasury: the law hunts harder (heat +8 for everyone wanted in the colony), and the counties are quieter for a year.",
    cooldown: 365,
    cost: 10,
    lean: { attorney: 2, treasurer: -1 },
    country: 1,
    apply: (g, n) => {
      natMod(g, n, "proc:reward", "Rewards for rogues", DAYS_PER_YEAR, {
        unrest: -1,
      });
      for (const l of g.s.lives) {
        const h = l.crime?.heat[n] ?? 0;
        if (h >= 10 && l.crime) {
          touchLife(g, l).crime!.heat[n] = Math.min(100, h + 8);
          journal(
            g,
            l,
            "A reward is posted for rogues in the colony: the law hunts harder.",
            "bad",
          );
        }
      }
      return "Rewards are posted on every court-house door for highwaymen, pirates and coiners.";
    },
  },
  {
    key: "grace",
    label: "An act of grace (a general pardon)",
    text: "Every rogue's slate wiped clean with the colony's law and the waiting trials dropped: unrest −2, favour at home −3.",
    cooldown: 1460,
    lean: { attorney: -2, chaplain: 2 },
    country: 2,
    apply: (g, n) => {
      const s = g.s;
      for (const l of s.lives) {
        if (l.crime?.heat[n]) {
          delete touchLife(g, l).crime!.heat[n];
          journal(
            g,
            l,
            "The governor's act of grace: your slate with the colony's law is wiped clean.",
            "good",
          );
        }
      }
      graceTrials(g, n);
      natMod(g, n, "proc:grace", "An act of grace", DAYS_PER_YEAR, {
        unrest: -2,
        favor: -3,
      });
      return "An act of grace: the gaols open, and the rogues of the colony start again with clean names.";
    },
  },
  {
    key: "martial",
    label: "Martial law in a county",
    text: "In war or a rising: unrest −15 in the county for half a year; its trade −10%, and people remember it.",
    cooldown: 365,
    county: true,
    lean: { marshal: 3, attorney: -1 },
    country: -3,
    blocked: (s, n) =>
      atWar(s, n) ||
      s.movements.some((m) => m.status === "risen" && m.against === n)
        ? null
        : "Only in war or a rising.",
    apply: (g, n, p) => {
      const pr = g.prov(p);
      pr.mods = pr.mods.filter((m) => m.key !== "proc:martial");
      pr.mods.push({
        key: "proc:martial",
        label: "Martial law",
        until: g.s.day + 180,
        fx: { unrest: -15, production: -0.1 },
      });
      return `Martial law at ${g.map.provinces[p].name}: soldiers at every crossroads, and quiet of a kind.`;
    },
  },
];

export const PROCLAMATION_BY_KEY = new Map(
  PROCLAMATIONS.map((x) => [x.key, x]),
);

/** The council's advice on a proclamation. */
export function proclamationAdvice(
  s: GameState,
  n: number,
  key: string,
): {
  ayes: number;
  noes: number;
  votes: { c: number; seat: CouncilSeat; v: number; why: string }[];
} {
  const def = PROCLAMATION_BY_KEY.get(key);
  const votes = councillors(s, n).map(({ seat, c }) => {
    let v = def?.lean[seat] ?? 0;
    const court = factionOf(s, n, c) === "court";
    v += court ? 2 : (def?.country ?? 0);
    v += (favourOf(s, n, c) - 50) / 30;
    v += hash01(c, key.length, n) * 2 - 1;
    const why = def?.lean[seat]
      ? def.lean[seat]! > 0
        ? "It's in their portfolio's interest"
        : "It cuts against their portfolio"
      : court
        ? "The governor's friend"
        : "The country party's view";
    return { c, seat, v: v > 0.2 ? 1 : v < -0.2 ? -1 : 0, why };
  });
  return {
    ayes: votes.filter((x) => x.v > 0).length,
    noes: votes.filter((x) => x.v < 0).length,
    votes,
  };
}

export function proclaimCheck(s: GameState, life: Life, key: string): Check {
  const def = PROCLAMATION_BY_KEY.get(key);
  const me = meOf(s, life);
  if (!def || !me) return no("No such proclamation.");
  const n = s.nations.findIndex((x) => x.alive && x.ruler === me.id);
  if (n < 0) return no("Only the governor proclaims.");
  if (s.nations[n].kind !== "power" && s.nations[n].kind !== "native")
    return no("Not now.");
  const why = def.blocked?.(s, n);
  if (why) return no(why);
  const left = (life.cooldowns[`proc:${key}`] ?? 0) - s.day;
  if (left > 0) return no(`Again in ${left} days.`);
  if (def.cost && s.nations[n].gold < def.cost)
    return no(`It costs ${def.cost} from the treasury.`);
  return yes;
}

/** The governor proclaims (with the council's advice, taken or not). */
export function proclaim(
  g: ConquestGame,
  life: Life,
  key: string,
  p: number,
): string | null {
  const s = g.s;
  const check = proclaimCheck(s, life, key);
  if (!check.ok) return check.why;
  const def = PROCLAMATION_BY_KEY.get(key)!;
  const me = meOf(s, life)!;
  const n = s.nations.findIndex((x) => x.alive && x.ruler === me.id);
  if (def.county && s.provinces[p]?.owner !== n)
    return "Choose a county of the colony.";
  touchLife(g, life).cooldowns[`proc:${key}`] = s.day + def.cooldown;
  if (def.cost) g.nation(n).gold -= def.cost;
  const advice = proclamationAdvice(s, n, key);
  const text = def.apply(g, n, p);
  const cab = ensureCabinet(g, n);
  cab.proclaimed[key] = s.day + def.cooldown;
  powerChanged(g, `c${n}`);
  journal(g, life, text, "good");
  overruled(g, life, n, advice, def.label);
  rumour(
    g,
    s.nations[n].capital,
    `The governor proclaims ${def.label.toLowerCase()}.`,
    me.id,
  );
  return null;
}

/** The governor went against the council's advice: it costs a little. */
export function overruled(
  g: ConquestGame,
  life: Life,
  n: number,
  advice: { ayes: number; noes: number; votes: { c: number; v: number }[] },
  what: string,
): void {
  if (advice.noes <= advice.ayes || advice.noes < 2) return;
  const s = g.s;
  natMod(g, n, "council:overruled", "The council overruled", DAYS_PER_YEAR, {
    unrest: 1,
  });
  for (const x of advice.votes)
    if (x.v < 0 && s.chars[x.c]?.alive && !isPlayed(s, x.c))
      g.char(x.c).memories.push({
        of: -1,
        why: "Overruled in council",
        value: -8,
        until: s.day + 2 * DAYS_PER_YEAR,
      });
  journal(
    g,
    life,
    `${what}: against the council's advice (${advice.noes} against, ${advice.ayes} for). The councillors who opposed it won't forget.`,
    "bad",
  );
}

/** Who a governor could put on the council. */
export function seatPool(s: GameState, n: number): Character[] {
  const nation = s.nations[n];
  const ids = new Set<number>(nation.court);
  for (const c of s.polities[n]?.assembly ?? []) ids.add(c);
  for (const l of s.lives) {
    const c = s.chars[l.c];
    if (c?.alive && c.nation === n && !l.watching) ids.add(c.id);
  }
  for (const list of Object.values(s.society?.offices ?? {}))
    for (const o of list)
      if (o.nation === n && o.holder >= 0) ids.add(o.holder);
  const seated = new Set(councillors(s, n).map((x) => x.c));
  return [...ids]
    .map((id) => s.chars[id])
    .filter(
      (c): c is Character =>
        !!c?.alive &&
        !c.abroad &&
        c.nation === n &&
        c.id !== nation.ruler &&
        !seated.has(c.id) &&
        ageOf(s, c) >= 21,
    )
    .sort(
      (a, b) =>
        Number(isPlayed(s, b.id)) - Number(isPlayed(s, a.id)) || a.id - b.id,
    );
}

/** The governor appoints to a seat (a player is asked; anyone else takes it). */
export function govAppoint(
  g: ConquestGame,
  life: Life,
  seat: CouncilSeat,
  c: number,
): string | null {
  const s = g.s;
  const me = meOf(s, life);
  const n = s.nations.findIndex((x) => x.alive && x.ruler === me?.id);
  if (!me || n < 0) return "Only the governor appoints.";
  if (seat === "speaker") return "The house chooses its speaker.";
  if (!seatsOf(s.nations[n]).includes(seat)) return "No such seat.";
  if (!seatPool(s, n).some((x) => x.id === c))
    return "Choose someone of the colony (not already at the table).";
  const other = lifeOfChar(s, c);
  if (other) {
    if (other.events.some((e) => e.key === "council-offer"))
      return "They have an offer waiting already.";
    raiseEvent(g, other, "council-offer", {
      seat: COUNCIL_INDEX[seat],
      n,
      by: me.id,
    });
    journal(
      g,
      life,
      `You offer ${charName(s.chars[c])} the place of ${lowerFirst(seatName(s, n, seat))}. They'll answer.`,
    );
    return null;
  }
  seatCouncillor(g, n, seat, c, `by ${charName(me)}'s appointment`);
  remembers(g, life, g.char(c), "Raised me to the council", 15, 5);
  journal(
    g,
    life,
    `You appoint ${charName(s.chars[c])} ${lowerFirst(seatName(s, n, seat))}.`,
  );
  return null;
}

export function govDismiss(
  g: ConquestGame,
  life: Life,
  seat: CouncilSeat,
): string | null {
  const s = g.s;
  const me = meOf(s, life);
  const n = s.nations.findIndex((x) => x.alive && x.ruler === me?.id);
  if (!me || n < 0) return "Only the governor dismisses.";
  if (seat === "speaker")
    return "The house chooses its speaker: dissolve the house instead.";
  const id = seatHolderId(s, n, seat);
  if (id < 0) return "Nobody sits there.";
  dismissCouncillor(g, n, seat, `dismissed by ${charName(me)}`);
  const other = lifeOfChar(s, id);
  if (other)
    remembers(g, other, g.char(me.id), "Dismissed me from the council", -25, 5);
  journal(g, life, `You dismiss ${charName(s.chars[id])} from the council.`);
  return null;
}

// ---------------------------------------------------------------- the months

/** The councils' round: the colony's seats filled, favour, dismissals, scandal, the computer's councillors at work. */
export function councilMonthly(g: ConquestGame): void {
  const s = g.s;
  const r = pdice(g);
  for (const nation of s.nations) {
    if (!nation.alive || (nation.kind !== "power" && nation.kind !== "native"))
      continue;
    const n = nation.id;
    const cab = ensureCabinet(g, n);
    const govPlayed = isPlayed(s, nation.ruler);
    // The colony's own seats: a governor the computer plays fills them.
    if (nation.kind === "power" && !govPlayed)
      for (const seat of ["attorney", "surveyor"] as const) {
        const id = cab[seat];
        if (id >= 0 && s.chars[id]?.alive && !s.chars[id].abroad) continue;
        if (id >= 0) {
          cab[seat] = -1;
          powerChanged(g, `c${n}`);
        }
        // The governor sends for a man of name from home (the court itself is
        // left as it was: its people are the governor's to raise).
        const who = makeNotable(
          s,
          pdice(g),
          n,
          seat === "attorney" ? "spymaster" : "treasurer",
        );
        seatCouncillor(g, n, seat, who.id, "appointed");
      }
    // The speaker: chosen again if the chair's empty.
    if (
      nation.kind === "power" &&
      cab.speaker >= 0 &&
      !(s.polities[n]?.assembly ?? []).includes(cab.speaker)
    ) {
      cab.speaker = -1;
      powerChanged(g, `c${n}`);
    }
    if (
      nation.kind === "power" &&
      cab.speaker < 0 &&
      s.polities[n]?.assembly.length
    )
      chooseSpeaker(g, n);
    // Favour drifts toward what the governor thinks of them; the
    // computer's governor puts out the ones he's lost faith in.
    for (const { seat, c } of councillors(s, n)) {
      const life = lifeOfChar(s, c);
      const gov = s.chars[nation.ruler];
      const base =
        life && gov?.alive ? 50 + opinionOf(s, gov, life).total / 2 : 50;
      const cur = favourOf(s, n, c);
      const next = Math.round((cur + (base - cur) * 0.08) * 10) / 10;
      if (next !== cur) {
        cab.favour[c] = next;
        powerChanged(g, `c${n}`);
      }
      if ((cab.scandal[c] ?? 0) <= s.day) delete cab.scandal[c];
      if (govPlayed || seat === "speaker") continue;
      if (
        life &&
        next < 25 &&
        next >= 15 &&
        !(life.cooldowns["council-cool"] > s.day)
      ) {
        touchLife(g, life).cooldowns["council-cool"] = s.day + 120;
        journal(
          g,
          life,
          `${charName(gov)} has cooled toward you: the governor's favour is ${Math.round(next)}. Below 15 you may be put off the council.`,
          "bad",
        );
      }
      const disgraced = (cab.scandal[c] ?? 0) > s.day;
      if ((next < 15 && r.chance(0.35)) || (disgraced && r.chance(0.3)))
        dismissCouncillor(
          g,
          n,
          seat,
          disgraced
            ? "dismissed in disgrace"
            : "the governor has lost faith in you",
        );
    }
    // Scandal finds the computer's councillors now and then.
    for (const { c } of councillors(s, n)) {
      if (isPlayed(s, c) || cab.scandal[c]) continue;
      const ch = s.chars[c];
      if (r.chance(ch.traits.includes("greedy") ? 0.006 : 0.002))
        disgrace(
          g,
          n,
          c,
          ch.traits.includes("greedy")
            ? "a hand in the treasury"
            : "debts and a mistress, and letters about both",
        );
    }
    // The colony's own seats age like anyone (the nation's round doesn't see them).
    for (const seat of ["attorney", "surveyor"] as const) {
      const ch = s.chars[cab[seat]];
      if (!ch?.alive || isPlayed(s, ch.id)) continue;
      const age = ageOf(s, ch);
      if (age >= 78 || r.chance(age >= 60 ? 0.006 : 0.0015))
        kill(g, ch, age >= 60 ? `old age at ${age}` : `a fever at ${age}`);
    }
    // The computer's councillors use their seats, now and then, where
    // players live to see it.
    const watched = s.lives.some(
      (l) =>
        !l.watching &&
        l.c >= 0 &&
        (s.chars[l.c]?.nation === n || s.provinces[l.prov]?.owner === n),
    );
    for (const { seat, c } of councillors(s, n)) {
      if (!watched || isPlayed(s, c) || !r.chance(0.1)) continue;
      const acts = SEAT_ACTIONS.filter(
        (a) => a.seat === seat && a.ai && !a.measure && !a.blocked?.(s, n),
      );
      for (const a of acts) {
        const key = `ai:${a.key}`;
        if ((cab.last?.[key] ?? 0) > s.day) continue;
        const t = a.ai!(g, n);
        if (t === null) continue;
        const pass = r.chance(0.6);
        const out = a.run(g, n, c, t, pass);
        (cab.last ??= {})[key] = s.day + a.cooldown;
        powerChanged(g, `c${n}`);
        void out;
        break;
      }
    }
    // Measures the governor puts to a council where players sit.
    const players = councillors(s, n).filter((x) => isPlayed(s, x.c));
    if (
      players.length &&
      !govPlayed &&
      !cab.matters.some((m) => m.status === "open") &&
      r.chance(0.3)
    ) {
      const key = govMeasure(g, n, r.next());
      if (key) putMeasure(g, n, key.key, key.arg, nation.ruler);
    }
    decideMatters(g, n);
  }
}

/** What a governor the computer plays would put to the council. */
function govMeasure(
  g: ConquestGame,
  n: number,
  roll: number,
): { key: string; arg: number } | null {
  const s = g.s;
  const nation = s.nations[n];
  const out: { key: string; arg: number }[] = [];
  if (nation.kind !== "power") return null;
  if (nation.gold < 30 && nation.tax < 2) out.push({ key: "taxup", arg: -1 });
  if (avgUnrest(s, n) > 35 && nation.tax > 0)
    out.push({ key: "taxdown", arg: -1 });
  if (avgUnrest(s, n) > 20) out.push({ key: "thanksgiving", arg: -1 });
  if (nation.favor < 35 && nation.remit < 0.5 && !nation.independent)
    out.push({ key: "remit", arg: -1 });
  const natives = neighboursOf(g, n).filter(
    (o) => s.nations[o].kind === "native",
  );
  if (natives.length && nation.gold >= 20)
    out.push({ key: "presents", arg: natives[0] });
  if (atWar(s, n)) {
    const frontier = provincesOf(s, n).find(
      (p) => !(s.provinces[p].b.fort ?? 0),
    );
    if (frontier !== undefined) out.push({ key: "fort", arg: frontier });
  }
  if (nation.colonists < 50) out.push({ key: "grant", arg: -1 });
  if (!out.length) return null;
  return out[Math.floor(roll * out.length)];
}

/** A governor (a player) asked for a seat by another player. */
export function answerSeatAsk(
  g: ConquestGame,
  gov: Life,
  c: number,
  seat: CouncilSeat,
  yes2: boolean,
): void {
  const s = g.s;
  const asker = lifeOfChar(s, c);
  const n = s.nations.findIndex((x) => x.alive && x.ruler === gov.c);
  if (n < 0 || !asker) return;
  if (!yes2) {
    journal(
      g,
      asker,
      `${charName(s.chars[gov.c])} has no place for you on the council.`,
      "bad",
    );
    return;
  }
  seatCouncillor(g, n, seat, c, `by ${charName(s.chars[gov.c])}'s appointment`);
}
