// POWER (r12): newspapers. Found a press where the law allows one (or buy
// a paper, or rise to publisher in the printer's trade), hire writers, set
// its line, and print pieces for or against candidates, causes, officials
// and the governor. Pieces really move things: a candidate's chances at the
// polls, a cause's support, a councillor's standing with the governor, a
// town's temper. They also bring libel suits, the governor's anger, and in
// the years of licensing, a press shut by order. Each piece goes out as
// talk from the paper's town (it reaches the news), and a reader of the
// gazette reads the papers within reach.

import { favourNudge, mySeat } from "./Council";
import { Explain } from "./Explain";
import { householdsOf } from "./Folk";
import type { ConquestGame } from "./Game";
import { raiseEvent } from "./Hooks";
import { afterHearing } from "./Leads";
import { withFlow, type FlowTag } from "./LedgerCore"; // LEDGER (r15)
import {
  addRenown,
  earn,
  gainXp,
  journal,
  milestone,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import {
  Check,
  hasPlace,
  isChildLife,
  isPlayed,
  lifeOfChar,
  meOf,
  no,
  opinionOf,
  skillLevel,
  yes,
} from "./LifeQueries";
import { kmBetween, type World } from "./Map";
import { localOfficesOf } from "./Offices";
import { addSway, pdice, power, powerChanged } from "./PowerCore";
import { ageOf, charName, provincesOf, settlers, stat } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { rumour } from "./Rumours";
import { hash01 } from "./SocietyCore";
import { openTrial } from "./Trials";
import type {
  Breakdown,
  Character,
  GameState,
  Life,
  Movement,
  Paper,
  Piece,
} from "./Types";

/** A newspaper's first year among each people (the press itself may come sooner). */
export const PAPER_YEAR: Record<string, number> = {
  english: 1704,
  spanish: 1722,
  dutch: 1725,
  french: 1764,
  portuguese: 1808,
  swedish: 9999,
};
export const FOUND_COST = 60;
export const WRITER_WAGE = 1.5;
export const MAX_WRITERS = 3;
/** Coins a reader brings in a month. */
export const READER_PRICE = 0.012;

const year = (s: GameState) => 1607 + Math.floor(s.day / DAYS_PER_YEAR);

export const paperOf = (s: GameState, c: number): Paper | undefined =>
  (s.power?.papers ?? []).find((x) => x.owner === c);
export const papersIn = (s: GameState, p: number): Paper[] =>
  (s.power?.papers ?? []).filter((x) => x.p === p);
export const paperById = (s: GameState, id: number): Paper | undefined =>
  (s.power?.papers ?? []).find((x) => x.id === id);

/** Does the law want a licence to print in this colony now. */
export function licenceNeeded(s: GameState, n: number): boolean {
  const nation = s.nations[n];
  if (!nation || nation.kind !== "power") return false;
  const laws = nation.laws ?? [];
  if (laws.includes("freepress")) return false;
  if (laws.includes("licensing")) return true;
  if (nation.independent || nation.gov) return false;
  if (nation.culture === "english") return year(s) < 1721;
  return true;
}

/** Why licensing is (or isn't) wanted, in a line. */
export function licenceLine(s: GameState, n: number): string {
  const nation = s.nations[n];
  const laws = nation?.laws ?? [];
  if (!licenceNeeded(s, n))
    return laws.includes("freepress")
      ? "The press is free here by law."
      : "No licence is wanted to print here now.";
  if (laws.includes("licensing"))
    return "The Licensing of the press is the law: nothing printed without the secretary's leave.";
  if (nation.culture === "english")
    return "Until the 1720s the governor's instructions want every press licensed.";
  return "The crown and the church license every press in its colonies.";
}

const NAMES: Record<string, string[]> = {
  english: [
    "The {town} Gazette",
    "The {town} News-Letter",
    "The {town} Journal",
    "The {town} Mercury",
    "The {town} Courant",
    "The {town} Chronicle",
    "The {town} Post-Boy",
    "The {town} Evening Post",
  ],
  spanish: ["Gaceta de {town}", "Mercurio de {town}", "Diario de {town}"],
  french: ["La Gazette de {town}", "Le Courrier de {town}"],
  dutch: ["De {town}sche Courant", "Het {town}s Nieuwsblad"],
  portuguese: ["Gazeta de {town}", "Correio de {town}"],
  swedish: ["{town}s Tidningar"],
};

export function paperNameFor(
  s: GameState,
  town: string,
  culture: string,
  salt: number,
): string {
  const list = NAMES[culture] ?? NAMES.english;
  const taken = new Set((s.power?.papers ?? []).map((x) => x.name));
  for (let i = 0; i < list.length; i++) {
    const name = list[
      (Math.floor(hash01(salt, i) * list.length) + i) % list.length
    ].replace("{town}", town);
    if (!taken.has(name)) return name;
  }
  return `${list[0].replace("{town}", town)} (${salt % 97})`;
}

// ---------------------------------------------------------------- getting a paper

export function foundCheck(s: GameState, w: World, life: Life): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're grown.");
  if (paperOf(s, me.id)) return no("You have a paper already.");
  if (life.travel) return no("Not from the road.");
  if (!hasPlace(s, w, life.prov, "press"))
    return no(
      "Only where there's a printing house (a capital, or a town of 2,500).",
    );
  const owner = s.provinces[life.prov].owner;
  const nation = s.nations[owner];
  if (
    (PAPER_YEAR[nation?.culture ?? ""] ?? 9999) > year(s) &&
    !nation?.independent &&
    !nation?.gov
  )
    return no(
      `No newspaper is allowed among the ${nation?.adjective ?? "colonists"} before ${PAPER_YEAR[nation?.culture ?? ""] ?? "a free press"}.`,
    );
  if (papersIn(s, life.prov).length >= 3)
    return no("The town has all the papers it can read.");
  if (skillLevel(s, life, "letters") < 3)
    return no("Letters 3: you must be able to write it.");
  if (life.purse < FOUND_COST)
    return no(`A press, type and paper: ${FOUND_COST} coins.`);
  return yes;
}

/** Would the governor license a new press of yours? */
export function licenceOdds(
  s: GameState,
  life: Life,
  n: number,
  stance: Paper["stance"],
): Breakdown {
  const e = new Explain();
  const gov = s.chars[s.nations[n]?.ruler ?? -1];
  e.add("Licences are given sparingly", -5);
  if (gov?.alive) {
    const op = opinionOf(s, gov, life).total;
    e.add(`What ${gov.first} thinks of you (${op})`, Math.round(op / 2));
  }
  if (life.favor > 0)
    e.add("Favour at home", Math.min(10, Math.round(life.favor / 4)));
  if (life.renown > 0)
    e.add("Your renown", Math.min(10, Math.round(life.renown / 10)));
  if (stance === "court") e.add("A paper for the government", 10);
  if (stance === "country") e.add("A paper for the country party", -15);
  return e.done(0);
}

/** Found a press and a paper here. */
export function foundPaper(
  g: ConquestGame,
  life: Life,
  stance: Paper["stance"],
  free = false,
): string | null {
  const s = g.s;
  if (!free) {
    const check = foundCheck(s, g.w, life);
    if (!check.ok) return check.why;
    spend(g, life, FOUND_COST);
  }
  const me = meOf(s, life)!;
  const p = free && life.job ? life.job.prov : life.prov;
  const n = s.provinces[p].owner;
  const nation = s.nations[n];
  const town = g.map.provinces[p].name;
  const need = licenceNeeded(s, n);
  const govPlayed = isPlayed(s, nation?.ruler ?? -1);
  const licensed =
    !need || (!govPlayed && licenceOdds(s, life, n, stance).total >= 0);
  const paper: Paper = {
    id: g.nextId(),
    name: paperNameFor(s, town, nation?.culture ?? "english", me.id + s.day),
    owner: me.id,
    p,
    nation: n,
    founded: s.day,
    stance,
    writers: [],
    readers: 80 + Math.round(settlers(s.provinces[p]) / 40),
    credit: 50,
    licensed,
    next: [],
    printed: [],
    issued: s.day,
  };
  power(g).papers.push(paper);
  powerChanged(g, "p");
  addRenown(g, life, 3);
  gainXp(g, life, "letters", 8);
  journal(
    g,
    life,
    `${paper.name} comes off your press at ${town}: four pages, a woodcut ship, the prices current, and whatever you choose to print.${need ? (licensed ? " The governor's licence hangs framed in the shop." : govPlayed ? " It wants the governor's licence: until he gives it, you print at your own risk." : " The governor refused a licence: you print at your own risk.") : ""}`,
    "good",
  );
  milestone(g, life, "renown", `Founded ${paper.name}`);
  rumour(
    g,
    p,
    `A new paper at ${town}: ${paper.name}.`,
    me.id,
    "good",
    false,
    true,
  );
  return null;
}

/** What a paper would fetch. */
export function paperValue(x: Paper): number {
  return Math.round(30 + x.readers / 10 + x.credit / 4 + x.writers.length * 4);
}

export function buyCheck(s: GameState, life: Life, id: number): Check {
  const me = meOf(s, life);
  const x = paperById(s, id);
  if (!me || !x) return no("No such paper.");
  if (isChildLife(s, life)) return no("Not until you're grown.");
  if (paperOf(s, me.id)) return no("You have a paper already.");
  if (isPlayed(s, x.owner))
    return no("Its owner is another player: write to them.");
  if (life.prov !== x.p || life.travel)
    return no(`At ${x.name}'s printing house.`);
  const price = Math.round(paperValue(x) * 1.2);
  if (life.purse < price) return no(`${price} coins.`);
  const owner = s.chars[x.owner];
  if (owner?.alive && opinionOf(s, owner, life).total < -10)
    return no(`${owner.first} won't sell to you.`);
  return yes;
}

export function buyPaper(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const s = g.s;
  const check = buyCheck(s, life, id);
  if (!check.ok) return check.why;
  const x = paperById(s, id)!;
  const price = Math.round(paperValue(x) * 1.2);
  spend(g, life, price);
  const was = s.chars[x.owner];
  x.owner = life.c;
  x.next = [];
  powerChanged(g, "p");
  addRenown(g, life, 2);
  journal(
    g,
    life,
    `You buy ${x.name} from ${charName(was)} for ${price} coins: the press, the type, the subscribers and the debts.`,
    "good",
  );
  milestone(g, life, "renown", `Bought ${x.name}`);
  return null;
}

export function sellPaper(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const x = paperOf(s, life.c);
  if (!x) return "You own no paper.";
  const buyer =
    householdsOf(s, x.p).find(
      (c) => !isPlayed(s, c.id) && ageOf(s, c) >= 21 && c.role === "printer",
    ) ??
    householdsOf(s, x.p).find(
      (c) => !isPlayed(s, c.id) && ageOf(s, c) >= 21 && stat(s, c, "int") >= 5,
    );
  const price = paperValue(x);
  earn(g, life, price);
  if (buyer) {
    x.owner = buyer.id;
    x.writers = [];
    x.next = [];
  } else power(g).papers = power(g).papers.filter((y) => y !== x);
  powerChanged(g, "p");
  journal(
    g,
    life,
    `You sell ${x.name}${buyer ? ` to ${charName(buyer)}` : ", type and all,"} for ${price} coins.`,
  );
  return null;
}

// ---------------------------------------------------------------- running it

/** Townsfolk who could write for a paper. */
export function writerPool(s: GameState, x: Paper): Character[] {
  return householdsOf(s, x.p)
    .filter(
      (c) =>
        !isPlayed(s, c.id) &&
        ageOf(s, c) >= 18 &&
        !x.writers.includes(c.id) &&
        stat(s, c, "int") >= 4 &&
        !(s.power?.papers ?? []).some((y) => y.writers.includes(c.id)),
    )
    .sort((a, b) => stat(s, b, "int") - stat(s, a, "int") || a.id - b.id)
    .slice(0, 8);
}

export function hireWriter(
  g: ConquestGame,
  life: Life,
  c: number,
): string | null {
  const s = g.s;
  const x = paperOf(s, life.c);
  if (!x) return "You own no paper.";
  if (x.writers.length >= MAX_WRITERS)
    return `${MAX_WRITERS} writers is all a paper can feed.`;
  const ch = s.chars[c];
  if (!ch || !writerPool(s, x).some((y) => y.id === c))
    return "Choose someone of the town who can write.";
  x.writers.push(c);
  powerChanged(g, "p");
  remembers(g, life, g.char(c), "Gave me work on the paper", 8, 3);
  journal(
    g,
    life,
    `${charName(ch)} will write for ${x.name}, for ${WRITER_WAGE} coins a month.`,
  );
  return null;
}

export function fireWriter(
  g: ConquestGame,
  life: Life,
  c: number,
): string | null {
  const x = paperOf(g.s, life.c);
  if (!x || !x.writers.includes(c)) return "They don't write for you.";
  x.writers = x.writers.filter((y) => y !== c);
  powerChanged(g, "p");
  const ch = g.s.chars[c];
  if (ch?.alive)
    remembers(g, life, g.char(c), "Turned me off the paper", -8, 3);
  journal(g, life, `${charName(ch)} writes for ${x.name} no more.`);
  return null;
}

export const STANCE_NAMES: Record<Paper["stance"], string> = {
  court: "For the government",
  independent: "Open to all parties",
  country: "For the country party",
};

export function setStance(
  g: ConquestGame,
  life: Life,
  stance: Paper["stance"],
): string | null {
  const s = g.s;
  const x = paperOf(s, life.c);
  if (!x) return "You own no paper.";
  if (!STANCE_NAMES[stance]) return "What line?";
  if (x.stance === stance) return "That's its line already.";
  if ((life.cooldowns["paper-stance"] ?? 0) > s.day)
    return `Readers need time to trust a new line (again in ${life.cooldowns["paper-stance"] - s.day} days).`;
  touchLife(g, life).cooldowns["paper-stance"] = s.day + 180;
  x.stance = stance;
  x.credit = Math.max(0, x.credit - 8);
  // Turning against the government costs a licence where licences are wanted.
  if (
    stance === "country" &&
    licenceNeeded(s, x.nation) &&
    x.licensed &&
    pdice(g).chance(0.5)
  ) {
    x.licensed = false;
    journal(
      g,
      life,
      "The governor's secretary writes: a paper of the country party will not be licensed.",
      "bad",
    );
  }
  powerChanged(g, "p");
  journal(
    g,
    life,
    `${x.name}'s line, from now on: ${STANCE_NAMES[stance].toLowerCase()}.`,
  );
  return null;
}

/** Pieces a paper may print this month: one, and one more for each writer. */
export const piecesPerMonth = (x: Paper) => 1 + x.writers.length;

export function piecesThisMonth(s: GameState, x: Paper): number {
  const month = Math.floor(s.day / 30.42);
  return x.printed.filter((p) => Math.floor(p.day / 30.42) === month).length;
}

export function printCheck(s: GameState, life: Life): Check {
  const x = paperOf(s, life.c);
  if (!x) return no("You own no paper.");
  if (x.shut && x.shut > s.day)
    return no(
      `Shut by the governor's order until the press may run again (${x.shut - s.day} days).`,
    );
  const left = piecesPerMonth(x) - piecesThisMonth(s, x);
  if (left <= 0)
    return no("This month's issue is full: hire writers for more pieces.");
  return yes;
}

/** Who a paper can print about. */
export function pieceTargets(
  s: GameState,
  life: Life,
  on: Piece["on"],
): { id: number; label: string; note: string }[] {
  const x = paperOf(s, life.c);
  if (!x) return [];
  const n = x.nation;
  if (on === "g") {
    const gov = s.chars[s.nations[n]?.ruler ?? -1];
    return gov?.alive
      ? [
          {
            id: n,
            label: `${charName(gov)}'s government`,
            note: `Governor of ${s.nations[n].name.replace(/^the /, "")}`,
          },
        ]
      : [];
  }
  if (on === "m")
    return activeCauses(s, n).map((m) => ({
      id: m.id,
      label: m.name,
      note: `${Math.round(m.support)} support`,
    }));
  const out = new Map<number, { id: number; label: string; note: string }>();
  const add = (c: number, note: string) => {
    const ch = s.chars[c];
    if (!ch?.alive || c === life.c || out.has(c)) return;
    out.set(c, { id: c, label: charName(ch), note });
  };
  // People at the polls: players standing, the sitting members, county officers.
  for (const l of s.lives) {
    const c = s.chars[l.c];
    if (!c?.alive || l.watching || c.nation !== n) continue;
    if (l.campaign) add(l.c, "standing for the assembly");
  }
  for (const list of Object.values(s.society?.offices ?? {}))
    for (const o of list) {
      if (o.nation !== n) continue;
      for (const cand of o.candidates) add(cand.c, "standing at a county poll");
      if (o.holder >= 0 && (o.prov === x.p || o.key === "burgess"))
        add(o.holder, "in county office");
    }
  for (const c of s.polities[n]?.assembly ?? []) add(c, "in the assembly");
  const nation = s.nations[n];
  for (const id of Object.values(nation.council) as number[])
    add(id, "on the council");
  const cab = s.power?.cabinets[n];
  if (cab)
    for (const id of [cab.attorney, cab.surveyor, cab.speaker])
      add(id, "on the council");
  for (const l of s.lives)
    if (s.chars[l.c]?.nation === n && !l.watching) add(l.c, "a player");
  return [...out.values()].slice(0, 30);
}

function activeCauses(s: GameState, n: number): Movement[] {
  const provs = new Set(provincesOf(s, n));
  return s.movements.filter(
    (m) =>
      (m.status === "brewing" || m.status === "risen") &&
      (m.against === n || m.region.some((p) => provs.has(p))),
  );
}

/** How hard a piece of yours would land. */
export function pieceForce(s: GameState, life: Life, x: Paper): Breakdown {
  const e = new Explain();
  const lv = skillLevel(s, life, "letters");
  e.add("A piece in the paper", 1, true);
  e.add(`Your letters (${lv})`, Math.round(lv * 2.5) / 10);
  const best = Math.max(0, ...x.writers.map((c) => stat(s, s.chars[c], "int")));
  if (best) e.add("Your best writer", Math.round(best * 5) / 10);
  e.add(
    `Readers (${x.readers})`,
    Math.min(4, Math.round((x.readers / 250) * 10) / 10),
  );
  e.add(
    `Credit (${Math.round(x.credit)})`,
    Math.round((x.credit - 50) / 10) / 1,
  );
  if (x.shut && x.shut > s.day) e.add("Shut by order", -99);
  return e.done(1, 0);
}

/** The risks of a piece: a suit for libel, the governor's anger, an unlicensed press seized. */
export function pieceRisk(
  s: GameState,
  life: Life,
  x: Paper,
  on: Piece["on"],
  id: number,
  side: number,
): Breakdown {
  const e = new Explain();
  if (side > 0 && on !== "m") return e.done(0);
  const nation = s.nations[x.nation];
  if (on === "c" && side < 0) {
    e.add("Attacking a person in print", 8, true);
    const official =
      localOfficesOf(s, id).length > 0 ||
      (Object.values(nation.council) as number[]).includes(id) ||
      (s.polities[x.nation]?.assembly ?? []).includes(id);
    if (official) e.add("A person of office, with friends", 8);
    if (x.credit < 40) e.add("A paper few believe", 8);
    if (skillLevel(s, life, "letters") >= 10) e.add("Carefully worded", -5);
  }
  if (on === "g" && side < 0) {
    e.add("Attacking the governor", 12, true);
    if (licenceNeeded(s, x.nation))
      e.add("A colony that licenses the press", 12);
    if (
      nation.culture === "spanish" ||
      nation.culture === "french" ||
      nation.culture === "portuguese"
    )
      e.add("A crown that brooks no criticism", 15);
    if (x.stance === "court") e.add("Biting the hand that licenses you", 5);
    if (year(s) >= 1735 && nation.culture === "english")
      e.add("Juries remember Zenger", -5);
  }
  if (on === "m") {
    const m = s.movements.find((y) => y.id === id);
    if (m && side > 0 && m.against === x.nation && m.goal !== "reform")
      e.add("Sedition: a cause against the crown", 15, true);
  }
  if (licenceNeeded(s, x.nation) && !x.licensed)
    e.add("An unlicensed press", 15);
  return e.done(0, 0, 90);
}

const HEADS: Record<string, string[]> = {
  "c+": [
    "A word for {x}",
    "{x}: a friend to the county",
    "The integrity of {x}",
    "Why the freeholders should trust {x}",
  ],
  "c-": [
    "Questions for {x}",
    "{x} and the public money",
    "The conduct of {x} examined",
    "Is {x} fit for public trust?",
  ],
  "m+": [
    "The cause of {x} is the people's cause",
    "For {x}: a letter from a farmer",
    "The justice of {x}",
  ],
  "m-": [
    "{x}: sedition in a new coat",
    "Against {x}",
    "Where {x} would lead us",
  ],
  "g+": [
    "His Excellency's care for the colony",
    "The governor's wise government",
    "Peace, plenty and good government",
  ],
  "g-": [
    "Cato on arbitrary power",
    "The grievances of the country",
    "Letters from a farmer on the governor's conduct",
    "Liberty and the governor",
  ],
};

function headline(
  s: GameState,
  x: Paper,
  on: Piece["on"],
  id: number,
  side: number,
): string {
  const list = HEADS[`${on}${side > 0 ? "+" : "-"}`];
  const name =
    on === "c"
      ? charName(s.chars[id])
      : on === "m"
        ? (s.movements.find((m) => m.id === id)?.name ?? "the cause")
        : "the governor";
  return list[Math.floor(hash01(x.id, id, s.day) * list.length)].replace(
    "{x}",
    name,
  );
}

/** Print a piece: for or against someone or something. */
export function printPiece(
  g: ConquestGame,
  life: Life,
  on: Piece["on"],
  id: number,
  side: number,
): string | null {
  const s = g.s;
  const check = printCheck(s, life);
  if (!check.ok) return check.why;
  const x = paperOf(s, life.c)!;
  if (on !== "c" && on !== "m" && on !== "g") return "About what?";
  if (!pieceTargets(s, life, on).some((t) => t.id === id)) return "About whom?";
  const sd = side > 0 ? 1 : -1;
  const force = pieceForce(s, life, x).total;
  const risk = pieceRisk(s, life, x, on, id, sd).total;
  const r = pdice(g);
  const landed = r.chance(
    Math.max(
      0.15,
      Math.min(
        0.9,
        0.45 + skillLevel(s, life, "letters") * 0.03 + x.writers.length * 0.05,
      ),
    ),
  );
  const piece: Piece = {
    on,
    id,
    side: sd,
    head: headline(s, x, on, id, sd),
    force: Math.round(force * (landed ? 1 : 0.5) * 10) / 10,
    day: s.day,
  };
  gainXp(g, life, "letters", 6);
  gainXp(g, life, "persuasion", 3);
  x.credit = Math.max(0, Math.min(100, x.credit + (landed ? 1.5 : -1)));
  journal(
    g,
    life,
    `${x.name} prints "${piece.head}".${landed ? " It's talked of in every tavern." : " It falls a little flat."}`,
    landed ? "good" : undefined,
  );
  applyPiece(g, x, piece, life);
  // The dangers.
  if (r.chance(risk / 100)) danger(g, life, x, piece);
  return null;
}

/** What a piece does in the world. */
export function applyPiece(
  g: ConquestGame,
  x: Paper,
  piece: Piece,
  byLife?: Life,
): void {
  const s = g.s;
  const f = piece.force;
  x.printed.push(piece);
  if (x.printed.length > 12) x.printed.splice(0, x.printed.length - 12);
  powerChanged(g, "p");
  rumour(
    g,
    x.p,
    `${x.name}: "${piece.head}"`,
    piece.on === "c" ? piece.id : -1,
    piece.side > 0 ? "good" : "bad",
  );
  if (piece.on === "c") {
    addSway(g, piece.id, piece.side * f);
    const target = lifeOfChar(s, piece.id);
    if (target) {
      addRenown(g, target, (piece.side * f) / 3);
      journal(
        g,
        target,
        `${x.name} prints "${piece.head}".`,
        piece.side > 0 ? "good" : "bad",
      );
      if (
        piece.side < 0 &&
        byLife &&
        target !== byLife &&
        !target.events.some((e) => e.key === "press-libelled")
      )
        raiseEvent(g, target, "press-libelled", { p: x.id, c: x.owner });
    }
    favourNudge(
      g,
      x.nation,
      piece.id,
      piece.side * f * (piece.side > 0 ? 0.3 : 0.6),
    );
    return;
  }
  if (piece.on === "m") {
    const m = s.movements.find((y) => y.id === piece.id);
    if (m) {
      m.support = Math.max(
        0,
        Math.min(100, Math.round((m.support + piece.side * f * 0.6) * 10) / 10),
      );
      g.movementsChanged();
    }
    return;
  }
  // The governor.
  const n = piece.id;
  const gov = s.chars[s.nations[n]?.ruler ?? -1];
  const pr = g.prov(x.p);
  pr.mods = pr.mods.filter((m) => m.key !== "press:governor");
  pr.mods.push({
    key: "press:governor",
    label:
      piece.side > 0
        ? "The papers praise the governor"
        : "The papers against the governor",
    until: s.day + 90,
    fx: { unrest: piece.side > 0 ? -0.5 : 1 },
  });
  if (piece.side < 0)
    for (const m of s.movements)
      if (
        (m.status === "brewing" || m.status === "risen") &&
        m.against === n &&
        m.region.includes(x.p)
      ) {
        m.support = Math.min(100, Math.round((m.support + f * 0.3) * 10) / 10);
        g.movementsChanged();
      }
  if (gov?.alive && byLife && gov.id !== byLife.c) {
    if (isPlayed(s, gov.id)) {
      const gl = lifeOfChar(s, gov.id)!;
      journal(
        g,
        gl,
        `${x.name} prints "${piece.head}".`,
        piece.side > 0 ? "good" : "bad",
      );
    } else
      remembers(
        g,
        byLife,
        g.char(gov.id),
        piece.side > 0 ? "Praised me in print" : "Attacked me in print",
        piece.side > 0 ? Math.round(f * 1.5) : -Math.round(f * 3),
        3,
      );
  }
}

/** A piece brings trouble: a libel suit, the governor's hand, an unlicensed press seized. */
function danger(g: ConquestGame, life: Life, x: Paper, piece: Piece): void {
  const s = g.s;
  const n = x.nation;
  const nation = s.nations[n];
  const govLife = lifeOfChar(s, nation.ruler);
  // An unlicensed press is simply seized.
  if (licenceNeeded(s, n) && !x.licensed && pdice(g).chance(0.5)) {
    shutPaper(g, x, 365, "printing without a licence");
    spend(g, life, 10);
    journal(
      g,
      life,
      "The constable seizes your type for printing without a licence: shut for a year, and a fine of 10.",
      "bad",
    );
    return;
  }
  if (piece.on === "c" && piece.side < 0) {
    // A person of the computer's sues (a player decides for themselves, in a scene).
    if (isPlayed(s, piece.id)) return;
    libelSuit(g, x, piece.id);
    return;
  }
  if ((piece.on === "g" && piece.side < 0) || piece.on === "m") {
    if (govLife && govLife.c !== life.c) {
      if (!govLife.events.some((e) => e.key === "press-seditious"))
        raiseEvent(g, govLife, "press-seditious", { p: x.id, c: x.owner });
      return;
    }
    if (pdice(g).chance(0.55)) seditionTrial(g, x);
    else shutPaper(g, x, 365, "seditious libel");
  }
}

/** A libel suit against a paper's owner. */
export function libelSuit(g: ConquestGame, x: Paper, by: number): void {
  const s = g.s;
  if (
    (s.power?.trials ?? []).some((t) => t.stage < 5 && t.defendant === x.owner)
  )
    return;
  openTrial(g, {
    kind: "libel",
    defendant: x.owner,
    accuser: by,
    p: x.p,
    nation: x.nation,
    charge: `libelling ${charName(s.chars[by])} in ${x.name}`,
    grade: localOfficesOf(s, by).length ? 2 : 1,
    evidence: 7 - x.credit / 25,
  });
}

/** The crown prosecutes a paper's owner for seditious libel. */
export function seditionTrial(g: ConquestGame, x: Paper): void {
  const s = g.s;
  if (
    (s.power?.trials ?? []).some((t) => t.stage < 5 && t.defendant === x.owner)
  )
    return;
  const ag = s.power?.cabinets[x.nation]?.attorney ?? -1;
  openTrial(g, {
    kind: "sedition",
    defendant: x.owner,
    accuser: ag >= 0 && s.chars[ag]?.alive ? ag : -1,
    p: x.p,
    nation: x.nation,
    charge: `seditious libel against the governor in ${x.name}`,
    grade: 3,
    evidence: 8,
  });
}

/** The governor shuts a paper. */
export function shutPaper(
  g: ConquestGame,
  x: Paper,
  days: number,
  why: string,
): void {
  const s = g.s;
  x.shut = s.day + days;
  x.credit = Math.max(0, x.credit - 5);
  powerChanged(g, "p");
  const owner = lifeOfChar(s, x.owner);
  if (owner)
    journal(
      g,
      owner,
      `${x.name} is shut by the governor's order, for ${why}.`,
      "bad",
    );
  rumour(
    g,
    x.p,
    `${x.name} has been shut by order of the governor.`,
    x.owner,
    "bad",
    false,
    true,
  );
}

/** The governor (a player) or the colony's secretary licenses a paper, or takes its licence away. */
export function licensePaper(
  g: ConquestGame,
  life: Life,
  id: number,
  yes2: boolean,
): string | null {
  const s = g.s;
  const x = paperById(s, id);
  const me = meOf(s, life);
  if (!x || !me) return "No such paper.";
  const governs = s.nations[x.nation]?.ruler === me.id;
  const secretary = mySeat(s, life) === "spymaster" && me.nation === x.nation;
  if (!governs && !secretary)
    return "Only the governor or the colony's secretary licenses the press.";
  if (!licenceNeeded(s, x.nation)) return "No licence is wanted here.";
  if (x.licensed === yes2)
    return yes2 ? "It's licensed." : "It has no licence.";
  x.licensed = yes2;
  powerChanged(g, "p");
  const owner = lifeOfChar(s, x.owner);
  if (owner && owner !== life)
    journal(
      g,
      owner,
      yes2
        ? `${x.name} is licensed by the governor's leave.`
        : `${x.name}'s licence is withdrawn: print at your peril.`,
      yes2 ? "good" : "bad",
    );
  journal(
    g,
    life,
    yes2 ? `You license ${x.name}.` : `You withdraw ${x.name}'s licence.`,
  );
  return null;
}

/** The governor shuts a paper (by order), or lets it print again. */
export function orderShut(
  g: ConquestGame,
  life: Life,
  id: number,
  shut: boolean,
): string | null {
  const s = g.s;
  const x = paperById(s, id);
  const me = meOf(s, life);
  if (!x || !me) return "No such paper.";
  if (s.nations[x.nation]?.ruler !== me.id)
    return "Only the governor shuts a press.";
  if (shut) {
    if (x.shut && x.shut > s.day) return "It's shut already.";
    shutPaper(g, x, 365, "the governor's displeasure");
    const n = x.nation;
    const nn = g.nation(n);
    nn.mods = nn.mods.filter((m) => m.key !== "press:shut");
    nn.mods.push({
      key: "press:shut",
      label: "A press shut by order",
      until: s.day + DAYS_PER_YEAR,
      fx: { unrest: 1, autonomy: -1 },
    });
    journal(g, life, `You order ${x.name} shut.`);
    return null;
  }
  if (!x.shut || x.shut <= s.day) return "It's printing.";
  x.shut = undefined;
  powerChanged(g, "p");
  journal(g, life, `${x.name} may print again.`);
  return null;
}

// ---------------------------------------------------------------- reading the papers

/** The papers a reader can get: their own colony's, and any printed within 700 km. */
export function papersWithin(
  s: GameState,
  map: Parameters<typeof kmBetween>[0],
  p: number,
  n: number,
): Paper[] {
  return (s.power?.papers ?? []).filter(
    (x) =>
      (x.nation === n || kmBetween(map, x.p, p) <= 700) &&
      !(x.shut && x.shut > s.day),
  );
}

/** Reading the gazette: the latest from the papers within reach. */
export function readPapers(g: ConquestGame, life: Life): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return;
  const papers = papersWithin(s, g.map, life.prov, me.nation).slice(0, 3);
  for (const x of papers) {
    const last = [...x.printed].reverse().slice(0, 2);
    if (!last.length) continue;
    journal(
      g,
      life,
      `In ${x.name}: ${last.map((p) => `"${p.head}"`).join("; ")}.`,
    );
  }
}

// ---------------------------------------------------------------- the months

/** Readers, income, the computer's papers, and printers who hear things first. */
export function pressMonthly(g: ConquestGame): void {
  const s = g.s;
  const ps = power(g);
  const r = pdice(g);
  // New papers of the computer's, in capitals with a press, in their years.
  for (const nation of s.nations) {
    if (!nation.alive || nation.kind !== "power") continue;
    if ((PAPER_YEAR[nation.culture] ?? 9999) > year(s)) continue;
    const p = nation.capital;
    if (!hasPlace(s, g.w, p, "press") || papersIn(s, p).length) continue;
    if (!r.chance(0.2)) continue;
    const printer =
      householdsOf(s, p).find(
        (c) => c.role === "printer" && !isPlayed(s, c.id),
      ) ??
      householdsOf(s, p)
        .filter((c) => !isPlayed(s, c.id) && ageOf(s, c) >= 25)
        .sort(
          (a, b) => stat(s, b, "int") - stat(s, a, "int") || a.id - b.id,
        )[0];
    if (!printer) continue;
    ps.papers.push({
      id: g.nextId(),
      name: paperNameFor(
        s,
        g.map.provinces[p].name,
        nation.culture,
        printer.id,
      ),
      owner: printer.id,
      p,
      nation: nation.id,
      founded: s.day,
      stance: hash01(printer.id, 5) < 0.6 ? "court" : "independent",
      writers: [],
      readers: 150 + Math.round(settlers(s.provinces[p]) / 30),
      credit: 55,
      licensed: true,
      next: [],
      printed: [],
      issued: s.day,
    });
    powerChanged(g, "p");
  }
  // Publishers by trade have a paper of their own.
  for (const life of s.lives) {
    if (life.c < 0 || life.watching) continue;
    if (
      life.job?.kind === "newsman" &&
      life.job.rank >= 3 &&
      !paperOf(s, life.c) &&
      hasPlace(s, g.w, life.job.prov, "press")
    )
      foundPaper(g, life, "independent", true);
  }
  for (const x of [...ps.papers]) {
    const owner = s.chars[x.owner];
    const ol = lifeOfChar(s, x.owner);
    if (!owner?.alive || s.provinces[x.p]?.owner !== x.nation) {
      // The owner's gone (or the town has changed hands): the paper passes to the town's printer, or folds.
      const heir = householdsOf(s, x.p).find(
        (c) => !isPlayed(s, c.id) && ageOf(s, c) >= 21,
      );
      if (heir && s.provinces[x.p]?.owner === x.nation) {
        x.owner = heir.id;
        x.writers = [];
      } else ps.papers = ps.papers.filter((y) => y !== x);
      powerChanged(g, "p");
      continue;
    }
    x.writers = x.writers.filter((c) => s.chars[c]?.alive);
    const shut = !!x.shut && x.shut > s.day;
    if (x.shut && x.shut <= s.day) x.shut = undefined;
    // Readers follow the town, the line, the paper's credit and the times.
    const pr = s.provinces[x.p];
    const unrest = pr.unrest;
    const fit =
      x.stance === "country"
        ? 1 + unrest / 80
        : x.stance === "court"
          ? 1.1 - unrest / 160
          : 1;
    const war = s.wars.some((w) => w.a === x.nation || w.b === x.nation)
      ? 1.2
      : 1;
    const target = shut
      ? 0
      : Math.max(
          60,
          Math.min(
            3000,
            (settlers(pr) / 12) *
              fit *
              war *
              (0.5 + x.credit / 100) *
              (1 + x.writers.length * 0.15),
          ),
        );
    x.readers = Math.round(x.readers + (target - x.readers) * 0.25);
    // Income, for a player's paper.
    if (ol) {
      const income =
        Math.round(
          (x.readers * READER_PRICE - x.writers.length * WRITER_WAGE - 1) * 100,
        ) / 100;
      x.income = income;
      // LEDGER (r15): the paper's month, in its owner's books and news.
      withFlow(g, paperFlow(x), () =>
        income >= 0 ? earn(g, ol, income) : spend(g, ol, -income),
      );
      // A printer hears things first.
      if (s.day % 3 === 0 || hash01(x.id, s.day) < 0.34)
        afterHearing(g, ol, "gazette");
    } else if (!shut && r.chance(0.4)) npcPiece(g, x);
    powerChanged(g, "p");
  }
}

/** LEDGER (r15): the name a paper's month goes under in its owner's books. */
export function paperFlow(x: { id: number; name: string }): FlowTag {
  return {
    key: `np:${x.id}`,
    label: `${x.name}: the month's profit`,
    aff: "paper",
  };
}

/** A paper of the computer's prints something, in its line. */
function npcPiece(g: ConquestGame, x: Paper): void {
  const s = g.s;
  const n = x.nation;
  const r = pdice(g);
  const causes = activeCauses(s, n);
  const unrest = s.provinces[x.p].unrest;
  let piece: Piece | null = null;
  const mk = (on: Piece["on"], id: number, side: number): Piece => ({
    on,
    id,
    side,
    head: headline(s, x, on, id, side),
    force: 1.5 + x.credit / 50,
    day: s.day,
  });
  if (x.stance === "court") {
    const against = causes.find((m) => m.against === n);
    piece = against && r.chance(0.6) ? mk("m", against.id, -1) : mk("g", n, 1);
  } else if (x.stance === "country") {
    const reform = causes.find((m) => m.goal === "reform");
    piece =
      reform && r.chance(0.5)
        ? mk("m", reform.id, 1)
        : unrest > 15 || s.nations[n].tax >= 2
          ? mk("g", n, -1)
          : null;
  } else {
    // An independent paper writes about whoever stands at the polls.
    const standing = s.lives.find(
      (l) => l.campaign?.nation === n && s.chars[l.c]?.alive,
    );
    if (standing)
      piece = mk(
        "c",
        standing.c,
        hash01(x.id, standing.c, s.day) < 0.6 ? 1 : -1,
      );
  }
  if (!piece) return;
  applyPiece(g, x, piece);
  // A paper of the computer's that attacks a player: the player may sue.
  if (piece.on === "c" && piece.side < 0) {
    const target = lifeOfChar(s, piece.id);
    if (target && !target.events.some((e) => e.key === "press-libelled"))
      raiseEvent(g, target, "press-libelled", { p: x.id, c: x.owner });
  }
}

/** A player answers a paper's attack. */
export function answerLibel(
  g: ConquestGame,
  life: Life,
  id: number,
  how: "sue" | "print" | "ignore",
): void {
  const s = g.s;
  const x = paperById(s, id);
  if (!x) return;
  if (how === "sue") {
    libelSuit(g, x, life.c);
    journal(g, life, `You sue the owner of ${x.name} for libel.`);
    return;
  }
  if (how === "print") {
    const mine = paperOf(s, life.c);
    if (mine) {
      applyPiece(
        g,
        mine,
        {
          on: "c",
          id: life.c,
          side: 1,
          head: `A reply to ${x.name}`,
          force: pieceForce(s, life, mine).total,
          day: s.day,
        },
        life,
      );
      journal(g, life, `${mine.name} prints your reply to ${x.name}.`);
      return;
    }
  }
  addRenown(g, life, -0.5);
  journal(
    g,
    life,
    `You let ${x.name}'s piece pass. Most people will forget it.`,
  );
}

/** A governor (a player) answers a seditious piece. */
export function answerSedition(
  g: ConquestGame,
  life: Life,
  id: number,
  how: "prosecute" | "shut" | "pass",
): void {
  const s = g.s;
  const x = paperById(s, id);
  if (!x) return;
  if (how === "prosecute") {
    seditionTrial(g, x);
    journal(
      g,
      life,
      `You have the printer of ${x.name} prosecuted for seditious libel.`,
    );
    return;
  }
  if (how === "shut") {
    orderShut(g, life, id, true);
    return;
  }
  addRenown(g, life, 1);
  journal(
    g,
    life,
    `You let ${x.name} say what it likes. Some call it weakness; some call it liberty.`,
  );
}
