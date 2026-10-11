// POWER (r12): the assembly at work. A member brings in a bill (a road for
// the county, a bounty on wolves, paper money, the governor's salary...);
// the house divides on it a month later, the court party against the
// country party; a bill that passes goes to the governor, who assents or
// vetoes. The house chooses its speaker from among its members, and the
// speaker sits on the governor's council. The governor can dissolve the
// house (a new election) or prorogue it (send it home for half a year).

import type { ConquestGame } from "./Game";
import {
  addRenown,
  addStress,
  gainXp,
  journal,
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
  skillLevel,
  yes,
} from "./LifeQueries";
import { LAWS, MAX_LAWS } from "./Politics";
import { pdice, power, powerChanged, swayOf } from "./PowerCore";
import { charName, stat } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { rumour } from "./Rumours";
import { hash01 } from "./SocietyCore";
import type { Bill, Cabinet, GameState, Life, ModFx } from "./Types";

export interface BillDef {
  key: string;
  /** "A road and bridges for {county}". */
  title: string;
  text: string;
  /** For the member's own county. */
  county?: boolean;
  /** How the house leans: the court party likes it (+) or the country party (−). */
  court: number;
  /** How much the house likes it before anyone speaks. */
  appeal: number;
  /** How a governor the computer plays leans. */
  gov: number;
  /** Treasury it costs (or brings, if negative) when it becomes law. */
  cost?: number;
  /** A money bill: the house's alone, no assent wanted. */
  money?: boolean;
  /** Why it can't be brought in now. */
  blocked?: (s: GameState, n: number) => string | null;
  /** What it does as law, in a line. */
  does: string;
  apply: (g: ConquestGame, n: number, b: Bill) => void;
}

const natMod = (
  g: ConquestGame,
  n: number,
  key: string,
  label: string,
  years: number,
  fx: Partial<Record<ModFx, number>>,
) => {
  const x = g.nation(n);
  x.mods = x.mods.filter((m) => m.key !== key);
  x.mods.push({
    key,
    label,
    until: g.s.day + Math.round(years * DAYS_PER_YEAR),
    fx,
  });
};

const provMod = (
  g: ConquestGame,
  p: number,
  key: string,
  label: string,
  years: number,
  fx: Partial<Record<ModFx, number>>,
) => {
  const pr = g.prov(p);
  pr.mods = pr.mods.filter((m) => m.key !== key);
  pr.mods.push({
    key,
    label,
    until: g.s.day + Math.round(years * DAYS_PER_YEAR),
    fx,
  });
};

export const BILLS: Record<string, BillDef> = {
  road: {
    key: "road",
    title: "A road and bridges for {county}",
    text: "A cart road to the courthouse and the landing, with bridges over the creeks, paid from the colony's treasury.",
    county: true,
    court: 0,
    appeal: 2,
    gov: 1,
    cost: 20,
    does: "The county's trade +4% for 15 years (20 from the treasury).",
    apply: (g, n, b) =>
      provMod(g, b.p, `bill:road:${b.id}`, "A road and bridges", 15, {
        production: 0.04,
      }),
  },
  wolves: {
    key: "wolves",
    title: "A bounty on wolves in {county}",
    text: "Ten shillings a head for every wolf brought to the court-house. The flocks will thank you.",
    county: true,
    court: 0,
    appeal: 3,
    gov: 1,
    cost: 6,
    does: "The county's farms +2% for 5 years (6 from the treasury).",
    apply: (g, n, b) =>
      provMod(g, b.p, "bill:wolves", "A bounty on wolves", 5, {
        production: 0.02,
      }),
  },
  poor: {
    key: "poor",
    title: "An act for the relief of the poor",
    text: "Overseers of the poor in every parish, and a rate to keep them. Fewer beggars, fewer riots.",
    court: -0.3,
    appeal: 1,
    gov: 0,
    does: "Unrest −2 across the colony and taxes −2%, for 3 years.",
    apply: (g, n) =>
      natMod(g, n, "bill:poor", "A poor law", 3, { unrest: -2, tax: -0.02 }),
  },
  militia: {
    key: "militia",
    title: "A bill of supply for the militia",
    text: "Powder, ball and pay for the militia, voted by the house: the colony looks to its own defence.",
    court: 0.5,
    appeal: 1,
    gov: 2,
    cost: 12,
    does: "The colony's say in its own affairs +3, and its militia steadier, for 2 years (12 from the treasury).",
    apply: (g, n) => {
      natMod(g, n, "bill:militia", "The militia supplied", 2, {
        autonomy: 3,
        morale: 0.05,
      });
    },
  },
  paper: {
    key: "paper",
    title: "An emission of bills of credit",
    text: "Paper money, to be taken for taxes: easy money now, a sinking value later, and a frown from the Board of Trade.",
    court: -0.5,
    appeal: 2,
    gov: -2,
    cost: -30,
    does: "30 into the treasury; taxes −5% and favour at home −4 for 3 years.",
    apply: (g, n) =>
      natMod(g, n, "bill:paper", "Bills of credit", 3, {
        tax: -0.05,
        favor: -4,
        unrest: -1,
      }),
  },
  quitrents: {
    key: "quitrents",
    title: "An act to ease the quitrents",
    text: "Lighter rents on the land, owed to the crown and the proprietors. Popular in every county, and nowhere in London.",
    court: -1,
    appeal: 3,
    gov: -3,
    does: "Taxes −6%, unrest −3 and favour at home −3, for 3 years.",
    apply: (g, n) =>
      natMod(g, n, "bill:quitrents", "Quitrents eased", 3, {
        tax: -0.06,
        unrest: -3,
        favor: -3,
      }),
  },
  press: {
    key: "press",
    title: "An act for the liberty of the press",
    text: "No licence wanted to print, and no printer to be taken up for the truth.",
    court: -0.8,
    appeal: 0,
    gov: -3,
    blocked: (s, n) => {
      const laws = s.nations[n]?.laws ?? [];
      if (laws.includes("freepress")) return "The press is free already.";
      if (laws.filter((k) => k !== "licensing").length >= MAX_LAWS)
        return `The colony has ${MAX_LAWS} great laws already.`;
      return null;
    },
    does: "A free press (licensing ends): lively, clever and hard to govern.",
    apply: (g, n) => {
      const x = g.nation(n);
      x.laws = (x.laws ?? []).filter((k) => k !== "licensing");
      x.mods = x.mods.filter((m) => m.key !== "law:licensing");
      if (!x.laws.includes("freepress")) {
        x.laws.push("freepress");
        x.mods.push({
          key: "law:freepress",
          label: LAWS.freepress.name,
          until: g.s.endDay + 1,
          fx: { ...LAWS.freepress.fx },
        });
      }
    },
  },
  salary: {
    key: "salary",
    title: "A vote to withhold the governor's salary",
    text: "The house holds the purse. No salary for His Excellency until he learns to listen.",
    court: -1.5,
    appeal: -1,
    gov: -10,
    money: true,
    does: "The governor goes unpaid for a year: the house's oldest weapon.",
    apply: (g, n) => {
      const cab = power(g).cabinets[n];
      if (cab) {
        cab.unpaid = g.s.day + DAYS_PER_YEAR;
        powerChanged(g, `c${n}`);
      }
      const gov = g.s.chars[g.s.nations[n].ruler];
      const life = gov ? lifeOfChar(g.s, gov.id) : undefined;
      if (life)
        journal(
          g,
          life,
          "The house has voted to withhold your salary for a year.",
          "bad",
        );
    },
  },
};

export const BILL_KEYS = Object.keys(BILLS);

/** A bill's title, with its county. */
export function billTitle(
  g: { map: { provinces: { name: string }[] } },
  b: Bill,
): string {
  return b.title.replace(
    "{county}",
    g.map.provinces[b.p]?.name ?? "the county",
  );
}

/** Days the house takes to divide; the governor has this long to answer. */
export const BILL_DAYS = 30;
export const ASSENT_DAYS = 20;

/** The colony's cabinet (made if missing: Council.ts fills it). */
function cab(g: ConquestGame, n: number): Cabinet {
  const ps = power(g);
  ps.cabinets[n] ??= {
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
  return ps.cabinets[n];
}

/** Can you bring in this bill now. */
export function billCheck(
  s: GameState,
  life: Life,
  n: number,
  key: string,
): Check {
  const def = BILLS[key];
  const me = meOf(s, life);
  if (!def || !me) return no("No such bill.");
  const pol = s.polities[n];
  if (!pol || s.nations[n]?.kind !== "power")
    return no("Only a colony's assembly passes bills.");
  if (!pol.assembly.includes(me.id))
    return no("Only a member of the house can bring in a bill.");
  const c = s.power?.cabinets[n];
  if (c?.prorogued && c.prorogued > s.day)
    return no("The governor has sent the house home (prorogued).");
  if (c?.bills.some((b) => b.by === me.id && b.stage === "house"))
    return no("You have a bill before the house already.");
  if (
    c?.bills.some(
      (b) => b.key === key && (b.stage === "house" || b.stage === "governor"),
    )
  )
    return no("A bill like it is before the house already.");
  if (key === "salary" && c?.unpaid && c.unpaid > s.day)
    return no("The governor's salary is withheld already.");
  const why = def.blocked?.(s, n);
  if (why) return no(why);
  return yes;
}

/** A member brings in a bill: the house divides on it in a month. */
export function bringBill(
  g: ConquestGame,
  life: Life,
  n: number,
  key: string,
  p: number,
): string | null {
  const s = g.s;
  const check = billCheck(s, life, n, key);
  if (!check.ok) return check.why;
  const def = BILLS[key];
  const c = cab(g, n);
  const bill: Bill = {
    id: g.nextId(),
    key,
    title: def.title,
    by: life.c,
    p: def.county ? p : -1,
    day: s.day,
    stage: "house",
    until: s.day + BILL_DAYS,
    ayes: 0,
    noes: 0,
  };
  c.bills.push(bill);
  trimBills(c, s.day);
  powerChanged(g, `c${n}`);
  gainXp(g, life, "persuasion", 4);
  journal(
    g,
    life,
    `You bring in ${lower(billTitle(g, bill))}. The house will divide on it about ${dateWord(bill.until)}: speak for it, and win the speaker over.`,
  );
  return null;
}

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const dateWord = (day: number) => {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const inYear = ((day % 365) + 365) % 365;
  return `the end of ${months[Math.min(11, Math.floor(inYear / 30.42))]}`;
};

function trimBills(c: Cabinet, day: number): void {
  // Keep what's live, and the last few settled for the record.
  const live = c.bills.filter(
    (b) => b.stage === "house" || b.stage === "governor",
  );
  const done = c.bills
    .filter(
      (b) =>
        b.stage !== "house" &&
        b.stage !== "governor" &&
        day - b.day < 3 * DAYS_PER_YEAR,
    )
    .slice(-8);
  c.bills = [...done, ...live];
}

/** A member's side in the house: the court party (the governor's friends) or the country party. */
export function memberFaction(
  s: GameState,
  n: number,
  c: number,
): "court" | "country" {
  const f = s.power?.cabinets[n]?.faction[c];
  if (f) return f;
  return hash01(c, n, 77) < 0.45 ? "court" : "country";
}

/** How one member leans on a bill: positive is aye. */
export function memberLean(
  s: GameState,
  b: Bill,
  n: number,
  c: number,
): number {
  const def = BILLS[b.key];
  if (!def) return 0;
  if (c === b.by) return 10;
  const side = memberFaction(s, n, c) === "court" ? 1 : -1;
  let v = def.appeal + def.court * side * 3;
  // A member from the county the bill is for votes for it.
  if (b.p >= 0 && s.chars[c]?.home === b.p) v += 4;
  // The bringer's name in the house.
  const by = lifeOfChar(s, b.by);
  if (by)
    v += Math.min(4, by.renown / 15) + skillLevel(s, by, "persuasion") / 6;
  else v += stat(s, s.chars[b.by], "dip") / 4;
  v += swayOf(s, b.by) / 4;
  v += hash01(c, b.id) * 6 - 3;
  return v;
}

/** The house divides: the ayes and noes as they'd fall today. */
export function division(
  s: GameState,
  n: number,
  b: Bill,
): { ayes: number; noes: number } {
  const pol = s.polities[n];
  let ayes = 0;
  let noes = 0;
  for (const c of pol?.assembly ?? []) {
    if (!s.chars[c]?.alive) continue;
    if (memberLean(s, b, n, c) > 0) ayes++;
    else noes++;
  }
  // The speaker's word, and a speaker steering it.
  const steer = s.power?.cabinets[n]?.steer?.[b.id] ?? 0;
  ayes += steer;
  noes = Math.max(0, noes - steer);
  return { ayes, noes };
}

/** How a governor the computer plays would answer a bill. */
export function governorLean(s: GameState, n: number, b: Bill): number {
  const def = BILLS[b.key];
  const nation = s.nations[n];
  const gov = s.chars[nation?.ruler ?? -1];
  let v = def.gov;
  const by = lifeOfChar(s, b.by);
  if (gov?.alive && by) {
    const m = gov.memories.filter((x) => x.of === b.by);
    v += m.reduce((t, x) => t + x.value, 0) / 15;
  }
  if ((def.cost ?? 0) > 0 && nation.gold < (def.cost ?? 0) * 2) v -= 2;
  if ((def.cost ?? 0) < 0 && nation.gold < 30) v += 3;
  v += hash01(b.id, n, 3) * 4 - 2;
  return v;
}

function becomeLaw(g: ConquestGame, n: number, b: Bill): void {
  const s = g.s;
  const def = BILLS[b.key];
  const nation = g.nation(n);
  if ((def.cost ?? 0) > 0 && nation.gold < def.cost!) {
    b.stage = "lost";
    const life = lifeOfChar(s, b.by);
    if (life)
      journal(
        g,
        life,
        `${billTitle(g, b)} is law, but the treasury can't pay for it: it lapses.`,
        "bad",
      );
    return;
  }
  nation.gold -= def.cost ?? 0;
  b.stage = "law";
  def.apply(g, n, b);
  const life = lifeOfChar(s, b.by);
  if (life) {
    addRenown(g, life, 4);
    touchLife(g, life).favor = Math.min(
      100,
      life.favor + (def.gov > 0 ? 2 : 0),
    );
    journal(g, life, `${billTitle(g, b)} is law: ${def.does}`, "good");
    milestone(g, life, "office", `Passed ${lower(billTitle(g, b))}`);
  }
  rumour(
    g,
    s.nations[n].capital,
    `${billTitle(g, b)} is law in ${nation.name.replace(/^the /, "")}.`,
    b.by,
    "good",
  );
}

/** The governor's answer to a bill (a player's, or the computer's). */
export function answerBill(
  g: ConquestGame,
  n: number,
  id: number,
  assent: boolean,
): string | null {
  const s = g.s;
  const c = s.power?.cabinets[n];
  const b = c?.bills.find((x) => x.id === id);
  if (!c || !b || b.stage !== "governor") return "That's been settled.";
  const gov = s.chars[s.nations[n].ruler];
  powerChanged(g, `c${n}`);
  if (assent) {
    becomeLaw(g, n, b);
    return null;
  }
  b.stage = "vetoed";
  const life = lifeOfChar(s, b.by);
  if (life) {
    journal(
      g,
      life,
      `${charName(gov)} vetoes ${lower(billTitle(g, b))}. The country party is furious, and you're its hero for a week.`,
      "bad",
    );
    addRenown(g, life, 1);
    if (gov?.alive) remembers(g, life, g.char(gov.id), "Vetoed my bill", -3, 2);
  }
  rumour(
    g,
    s.nations[n].capital,
    `The governor has vetoed ${lower(billTitle(g, b))}.`,
    b.by,
    "bad",
  );
  return null;
}

// ---------------------------------------------------------------- the speaker

/** The house chooses its speaker: the member it most respects. */
export function chooseSpeaker(g: ConquestGame, n: number): void {
  const s = g.s;
  const pol = s.polities[n];
  if (!pol || s.nations[n]?.kind !== "power") return;
  const c = cab(g, n);
  let best = -1;
  let score = -Infinity;
  for (const id of pol.assembly) {
    const ch = s.chars[id];
    if (!ch?.alive) continue;
    const life = lifeOfChar(s, id);
    let v = life
      ? life.renown / 4 +
        skillLevel(s, life, "persuasion") +
        skillLevel(s, life, "letters") / 2
      : stat(s, ch, "dip") * 2 + stat(s, ch, "int");
    if (c.speakerBid?.includes(id)) v += 8;
    if (id === c.speaker) v += 4;
    v += hash01(id, n, pol.election) * 6;
    if (v > score) {
      score = v;
      best = id;
    }
  }
  const was = c.speaker;
  c.speaker = best;
  c.speakerBid = [];
  powerChanged(g, `c${n}`);
  if (best >= 0 && best !== was) {
    const life = lifeOfChar(s, best);
    if (life) {
      addRenown(g, life, 5);
      touchLife(g, life).tally.topOffice = Math.max(life.tally.topOffice, 2);
      journal(
        g,
        life,
        `The house chooses you its speaker: you take the chair, and a seat at the governor's council.`,
        "good",
      );
      milestone(g, life, "office", `Chosen speaker of ${pol.name}`);
    }
  }
  const lost = lifeOfChar(s, was);
  if (lost && was !== best && was >= 0)
    journal(g, lost, "The house has chosen another speaker.", "bad");
}

/** Put your name forward for the speaker's chair at the next choosing. */
export function bidForSpeaker(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return "You're watching.";
  const pol = s.polities[me.nation];
  if (!pol?.assembly.includes(me.id)) return "Only a member of the house.";
  const c = cab(g, me.nation);
  if (c.speaker === me.id) return "You're in the chair.";
  if (c.speakerBid?.includes(me.id)) return "Your name is down already.";
  (c.speakerBid ??= []).push(me.id);
  powerChanged(g, `c${me.nation}`);
  journal(
    g,
    life,
    "You let it be known you'd take the chair. The house chooses after the next election (or when the chair falls empty).",
  );
  return null;
}

/** The speaker leans on the house for a bill. */
export function steerBill(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return "You're watching.";
  const c = s.power?.cabinets[me.nation];
  if (!c || c.speaker !== me.id) return "Only the speaker steers the house.";
  const b = c.bills.find((x) => x.id === id && x.stage === "house");
  if (!b) return "No such bill before the house.";
  const key = `steer:${me.nation}`;
  if ((life.cooldowns[key] ?? 0) > s.day)
    return `Again in ${life.cooldowns[key] - s.day} days.`;
  touchLife(g, life).cooldowns[key] = s.day + 60;
  const pass = pdice(g).chance(0.45 + skillLevel(s, life, "persuasion") * 0.03);
  c.steer ??= {};
  c.steer[b.id] = (c.steer[b.id] ?? 0) + (pass ? 3 : 1);
  powerChanged(g, `c${me.nation}`);
  gainXp(g, life, "persuasion", 5);
  journal(
    g,
    life,
    pass
      ? `From the chair you bring the waverers round on ${lower(billTitle(g, b))}.`
      : `You lean on the house over ${lower(billTitle(g, b))}; a member or so comes round.`,
  );
  return null;
}

// ---------------------------------------------------------------- the governor and the house

/** A governor dissolves the assembly: a new election within the month. */
export function dissolve(g: ConquestGame, n: number): string | null {
  const s = g.s;
  const pol = s.polities[n];
  if (!pol) return "There's no assembly.";
  if (pol.election - s.day <= 40) return "The election is upon you already.";
  pol.election = s.day + 30;
  g.politiesChanged(n);
  const c = cab(g, n);
  for (const b of c.bills) if (b.stage === "house") b.stage = "lost";
  powerChanged(g, `c${n}`);
  natMod(g, n, "dissolved", "The assembly dissolved", 1, { unrest: 2 });
  for (const life of s.lives) {
    if (life.c < 0 || !pol.assembly.includes(life.c)) continue;
    journal(
      g,
      life,
      `The governor has dissolved ${pol.name}: a new election within the month. Stand again if you'd sit.`,
      "bad",
    );
    addStress(g, life, 3);
  }
  rumour(
    g,
    s.nations[n].capital,
    `The governor has dissolved ${pol.name}.`,
    -1,
    "bad",
  );
  return null;
}

/** A governor prorogues the assembly: no bills, and no new laws, for half a year. */
export function prorogue(g: ConquestGame, n: number): string | null {
  const s = g.s;
  const c = cab(g, n);
  if (c.prorogued && c.prorogued > s.day) return "It's prorogued already.";
  c.prorogued = s.day + 180;
  for (const b of c.bills) if (b.stage === "house") b.stage = "lost";
  powerChanged(g, `c${n}`);
  natMod(g, n, "prorogued", "The assembly sent home", 0.5, { unrest: 2 });
  rumour(
    g,
    s.nations[n].capital,
    `The governor has prorogued ${s.polities[n]?.name ?? "the assembly"} for six months.`,
    -1,
    "bad",
  );
  return null;
}

// ---------------------------------------------------------------- the months

/** The house divides on its bills; the governor answers; the speaker is chosen. */
export function assemblyDaily(g: ConquestGame): void {
  const s = g.s;
  const ps = s.power;
  if (!ps) return;
  for (const c of Object.values(ps.cabinets)) {
    for (const b of c.bills) {
      if (b.stage === "house" && s.day >= b.until) {
        const d = division(s, c.n, b);
        b.ayes = d.ayes;
        b.noes = d.noes;
        powerChanged(g, `c${c.n}`);
        const life = lifeOfChar(s, b.by);
        if (d.ayes <= d.noes) {
          b.stage = "lost";
          if (life)
            journal(
              g,
              life,
              `The house throws out ${lower(billTitle(g, b))}, ${d.noes} to ${d.ayes}.`,
              "bad",
            );
          continue;
        }
        if (life)
          journal(
            g,
            life,
            `The house passes ${lower(billTitle(g, b))}, ${d.ayes} to ${d.noes}.`,
            "good",
          );
        if (BILLS[b.key]?.money) {
          becomeLaw(g, c.n, b);
          continue;
        }
        b.stage = "governor";
        b.until = s.day + ASSENT_DAYS;
      } else if (b.stage === "governor" && s.day >= b.until) {
        // A governor who doesn't answer has assented, by custom.
        const played = isPlayed(s, s.nations[c.n]?.ruler ?? -1);
        answerBill(g, c.n, b.id, played ? true : governorLean(s, c.n, b) >= 0);
      }
    }
    if (c.steer)
      for (const k of Object.keys(c.steer))
        if (!c.bills.some((b) => b.id === Number(k) && b.stage === "house"))
          delete c.steer[Number(k)];
    trimBills(c, s.day);
  }
}

/** A member the computer plays brings in a bill now and then, where players sit or govern. */
export function npcBills(g: ConquestGame): void {
  const s = g.s;
  const r = pdice(g);
  for (const n of s.nations) {
    if (!n.alive || n.kind !== "power") continue;
    const pol = s.polities[n.id];
    if (!pol?.assembly.length) continue;
    const played =
      isPlayed(s, n.ruler) || pol.assembly.some((c) => isPlayed(s, c));
    if (!played || !r.chance(0.15)) continue;
    const c = cab(g, n.id);
    if (c.prorogued && c.prorogued > s.day) continue;
    if (c.bills.some((b) => b.stage === "house")) continue;
    const by = pol.assembly.filter((x) => !isPlayed(s, x) && s.chars[x]?.alive);
    const who = by[r.int(0, by.length - 1)];
    if (who === undefined) continue;
    const keys = BILL_KEYS.filter(
      (k) =>
        !BILLS[k].blocked?.(s, n.id) &&
        !(k === "salary" && (!isPlayed(s, n.ruler) || (c.unpaid ?? 0) > s.day)),
    );
    const key = keys[r.int(0, keys.length - 1)];
    const home = s.chars[who].home ?? n.capital;
    c.bills.push({
      id: g.nextId(),
      key,
      title: BILLS[key].title,
      by: who,
      p: BILLS[key].county ? home : -1,
      day: s.day,
      stage: "house",
      until: s.day + BILL_DAYS,
      ayes: 0,
      noes: 0,
    });
    powerChanged(g, `c${n.id}`);
  }
}
