// New settlements and new nations. Get up a settlement of your own: money,
// the governor's leave (or none: squatters), families who like you enough to
// come on your terms, and supplies; pick an empty place and lead them there.
// It becomes a real province, with you its proprietor, under your crown, or
// your own colony if you dare. And after a rising carries the day (or a free
// settlement is planted) its leader sets up the government: the nation's
// name, its flag, its colour, what kind of state it is, its capital and its
// first officers.

import { dateOf } from "./Calendar";
import { characterCommand, nationCharacters } from "./Characters";
import { declareIndependence } from "./Crown";
import { merge } from "./Economy";
import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import {
  addRenown,
  journal,
  meet,
  milestone,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import { raiseLifeEvent } from "./LifeEvents";
import {
  Check,
  familyAtHome,
  isChildLife,
  lifeIsNative,
  lifeOfChar,
  meOf,
  no,
  opinionOf,
  travelRoute,
  yes,
} from "./LifeQueries";
import { CHARGES, ROLES } from "./LifeRules";
import type { World } from "./Map";
import { ensureOffices } from "./Offices";
import { makePolities } from "./Politics";
import { ageOf, charName, provincesOf, tribesfolk } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { rumour } from "./Rumours";
import { blankNation, settlerPops } from "./Setup";
import { FLAG_COLORS, FLAG_DIVISIONS, GOV_FORMS } from "./SocietyRules";
import type {
  Breakdown,
  Character,
  Charge,
  Founding,
  GameState,
  GovForm,
  Life,
  Nation,
  NationFlag,
  Seat,
} from "./Types";
import { SEATS } from "./Types";

/** What it takes: households, and supplies for each. */
export const FOUND = {
  /** Coins to begin getting it up. */
  start: 25,
  minHouses: 3,
  maxHouses: 12,
  /** Supplies: a base and so much a household. */
  supplyBase: 12,
  supplyPer: 5,
  /** Passage for each household, on top of your own. */
  passagePer: 2,
  /** Settlers each household brings with it (servants, kin, followers). */
  people: 22,
  /** Days to get it together before it falls apart. */
  lapse: 2 * DAYS_PER_YEAR,
};

export const TERMS = [
  { name: "No land promised", acres: 0, text: "Come for the adventure." },
  {
    name: "Fifty acres a family",
    acres: 50,
    text: "A farm of their own: the usual headright.",
  },
  {
    name: "A hundred acres a family",
    acres: 100,
    text: "Generous: more than they'd get anywhere else.",
  },
  {
    name: "Two hundred acres and their passage",
    acres: 200,
    text: "Princely terms: hard to refuse, and costly to keep.",
  },
];

const NAME_RE = /^[\p{L}\p{M}' .-]+$/u;

// ---------------------------------------------------------------- planning a settlement

/** Empty places a settlement could go: no one's land, reachable, and not too far. */
export function settlementSites(
  s: GameState,
  w: World,
  life: Life,
): { p: number; days: number; natives: boolean; sea: boolean }[] {
  const out: { p: number; days: number; natives: boolean; sea: boolean }[] = [];
  const from = life.prov;
  for (let p = 0; p < s.provinces.length; p++) {
    const pr = s.provinces[p];
    if (pr.owner >= 0 || pr.colony || pr.outpost) continue;
    const near =
      w.map.provinces[p].nb.some(([q]) => s.provinces[q].owner >= 0) ||
      w.map.provinces[p].coastal;
    if (!near) continue;
    const route = travelRoute(s, w.map, from, p, true, false, false, 1);
    if (!route || route.days > 90) continue;
    out.push({
      p,
      days: Math.ceil(route.days),
      natives: tribesfolk(pr) > 0,
      sea: route.sea.some(Boolean),
    });
  }
  return out.sort((a, b) => a.days - b.days || a.p - b.p).slice(0, 24);
}

export function foundCheck(s: GameState, w: World, life: Life): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're grown.");
  if (lifeIsNative(s, life))
    return no(
      "Your people found new towns in their own way: move the village.",
    );
  if (life.founding) return no("You're getting one up already.");
  if (s.nations[me.nation]?.kind !== "power")
    return no("Only a colonist plants a settlement.");
  if (life.purse < FOUND.start)
    return no(`It takes ${FOUND.start} coins to begin.`);
  void w;
  return yes;
}

export function planSettlement(
  g: ConquestGame,
  life: Life,
  p: number,
  independent: boolean,
  terms: number,
): string | null {
  const s = g.s;
  const check = foundCheck(s, g.w, life);
  if (!check.ok) return check.why;
  if (!settlementSites(s, g.w, life).some((x) => x.p === p))
    return "Choose an empty place within reach.";
  if (!Number.isInteger(terms) || terms < 0 || terms >= TERMS.length)
    return "What terms?";
  spend(g, life, FOUND.start);
  const f: Founding = {
    target: p,
    charter: "none",
    independent: !!independent,
    settlers: [],
    terms,
    supplies: 0,
    stage: "planning",
    since: s.day,
  };
  touchLife(g, life).founding = f;
  journal(
    g,
    life,
    `You begin getting up a settlement at ${g.map.provinces[p].name}: find families willing to come (ask them, Settlement), lay in supplies, and ${independent ? "keep your plans quiet: this one answers to no crown" : "ask the governor for a charter, or go without one"}.`,
  );
  return null;
}

/** The governor's view of your settlement. */
export function charterAcceptance(
  s: GameState,
  w: World,
  life: Life,
  gov: Character,
  byLetter = false,
): Breakdown {
  const e = new Explain().add("The crown is careful with its land", -10);
  const op = opinionOf(s, gov, life).total;
  e.add(`What ${gov.first} thinks of you (${op})`, Math.round(op / 2));
  e.add(
    `Your renown (${Math.floor(life.renown)})`,
    Math.min(15, Math.floor(life.renown / 3)),
  );
  if (life.favor > 0)
    e.add("Favour at home", Math.min(12, Math.round(life.favor / 3)));
  const f = life.founding;
  if (f) {
    e.add(
      `Families ready to go (${f.settlers.length})`,
      Math.min(12, f.settlers.length * 2),
    );
    const pr = s.provinces[f.target];
    if (pr && tribesfolk(pr) > 0)
      e.add("Native people live there: trouble", -6);
    if (f.independent) e.add("Rumours of independent notions", -20);
  }
  if (byLetter) e.add("Asked by letter", -5);
  void w;
  return e.done(0);
}

export function grantCharter(
  g: ConquestGame,
  life: Life,
  gov: Character,
): void {
  if (!life.founding) return;
  touchLife(g, life).founding!.charter = "granted";
  remembers(g, life, g.char(gov.id), "Granted them a charter", 5, 3);
  journal(
    g,
    life,
    `${charName(gov)} grants your charter: the settlement will be the crown's, and lawful.`,
    "good",
  );
}

/** Ask the governor for a charter, in person. */
export function askCharter(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const f = life.founding;
  if (!f) return "You're not getting up a settlement.";
  if (f.charter === "granted") return "You have it.";
  const me = meOf(s, life)!;
  const n = s.nations[me.nation];
  const gov = s.chars[n?.ruler ?? -1];
  if (!gov?.alive) return "There's no governor to ask.";
  if (gov.id === me.id) {
    touchLife(g, life).founding!.charter = "granted";
    journal(g, life, "You grant yourself a charter. It looks very official.");
    return null;
  }
  if (life.prov !== n.capital || life.travel)
    return "Ask at the governor's house in the capital (or write a petition).";
  if ((life.cooldowns["charter"] ?? 0) > s.day) return "You asked lately.";
  touchLife(g, life).cooldowns["charter"] = s.day + 120;
  meet(g, life, gov.id);
  const b = charterAcceptance(s, g.w, life, gov);
  if (b.total > 0) grantCharter(g, life, gov);
  else
    journal(
      g,
      life,
      `${charName(gov)} won't grant a charter: ${worst(b)}.`,
      "bad",
    );
  return null;
}

function worst(b: Breakdown): string {
  const p = [...b.parts]
    .filter((x) => !x.mul && x.value < 0)
    .sort((a, x) => a.value - x.value)[0];
  return p
    ? p.label.replace(/ \(.*\)$/, "").toLowerCase()
    : "they'd rather not";
}

/** Would someone come with you to the settlement? */
export function settleAcceptance(
  s: GameState,
  life: Life,
  c: Character,
): Breakdown {
  const f = life.founding!;
  const e = new Explain().add("Leaving everything for the wilderness", -25);
  const op = opinionOf(s, c, life).total;
  e.add(`What they think of you (${op})`, Math.round(op / 2));
  const terms = TERMS[f.terms];
  if (terms.acres) e.add(terms.name, f.terms * 9);
  const status = c.role ? ROLES[c.role].status : 1;
  if (status <= 1) e.add("Nothing to lose", 12);
  else if (status >= 4) e.add("Too much to leave behind", -15);
  if (hasTraitC(c, "ambitious")) e.add("Ambitious", 8);
  if (hasTraitC(c, "brave")) e.add("Brave", 5);
  if (hasTraitC(c, "craven")) e.add("Craven", -10);
  if (hasTraitC(c, "content")) e.add("Content where they are", -8);
  if (life.ties[c.id] === "friend") e.add("A friend", 12);
  if (f.charter === "none")
    e.add(
      f.independent ? "No crown's protection at all" : "No charter: squatters",
      f.independent ? -10 : -6,
    );
  if (ageOf(s, c) >= 50) e.add("Too old for it", -15);
  const pr = s.provinces[f.target];
  if (pr && tribesfolk(pr) > 0) e.add("Natives live there", -5);
  return e.done(0);
}

function hasTraitC(c: Character, t: Character["traits"][number]): boolean {
  return c.traits.includes(t);
}

export function settleCheck(s: GameState, life: Life, c: Character): Check {
  const f = life.founding;
  if (!f) return no("You're not getting up a settlement.");
  if (f.stage !== "planning") return no("You've set out.");
  if (f.settlers.includes(c.id)) return no("They're coming.");
  if (f.settlers.length >= FOUND.maxHouses)
    return no(`${FOUND.maxHouses} households is all you can lead.`);
  if (ageOf(s, c) < 18) return no("A child.");
  if (lifeOfChar(s, c.id)) return no("They're a player.");
  if (c.home === undefined) return no("They've no household to bring.");
  const n = s.nations[c.nation];
  if (!n || n.kind !== "power") return no("A colonist's venture.");
  if (n.ruler === c.id || SEATS.some((st) => n.council[st] === c.id))
    return no("They have the colony to run.");
  return yes;
}

export function addSettler(g: ConquestGame, life: Life, c: Character): void {
  touchLife(g, life).founding!.settlers.push(c.id);
  remembers(
    g,
    life,
    g.char(c.id),
    "Going to the new settlement together",
    10,
    0,
  );
  journal(
    g,
    life,
    `${charName(c)} and their household will come to ${g.map.provinces[life.founding!.target].name}.`,
    "good",
  );
}

export function supplyCost(f: Founding): number {
  return FOUND.supplyBase + FOUND.supplyPer * f.settlers.length;
}

export function layInSupplies(
  g: ConquestGame,
  life: Life,
  coins: number,
): string | null {
  const f = life.founding;
  if (!f || f.stage !== "planning")
    return "You're not getting up a settlement.";
  const need = supplyCost(f) - f.supplies;
  const amount = Math.min(Math.max(1, Math.round(coins)), Math.max(1, need));
  if (life.purse < amount) return `That's ${amount} coins.`;
  spend(g, life, amount);
  // Grain, tools and guns carried count for something.
  touchLife(g, life).founding!.supplies += amount;
  journal(
    g,
    life,
    `You lay in ${amount} coins' worth of seed corn, tools, nails, powder and salt pork.`,
  );
  return null;
}

export function setOutCheck(s: GameState, w: World, life: Life): Check {
  const f = life.founding;
  if (!f) return no("You're not getting up a settlement.");
  if (f.stage !== "planning") return no("You're on your way.");
  if (life.travel) return no("You're on the road.");
  if (f.settlers.length < FOUND.minHouses)
    return no(
      `At least ${FOUND.minHouses} households (you have ${f.settlers.length}).`,
    );
  if (f.supplies < supplyCost(f))
    return no(
      `Supplies: ${Math.floor(f.supplies)} of ${supplyCost(f)} coins' worth.`,
    );
  const pr = s.provinces[f.target];
  if (pr.owner >= 0 || pr.colony)
    return no("Someone has taken the place already.");
  const passage = FOUND.passagePer * f.settlers.length;
  if (life.purse < passage)
    return no(`Passage for the families: ${passage} coins.`);
  void w;
  return yes;
}

/** Off you go, at the head of the expedition. */
export function setOut(
  g: ConquestGame,
  life: Life,
  travel: (to: number) => string | null,
): string | null {
  const s = g.s;
  const check = setOutCheck(s, g.w, life);
  if (!check.ok) return check.why;
  const f = life.founding!;
  if (life.prov !== f.target) {
    const err = travel(f.target);
    if (err) return err;
  }
  spend(g, life, FOUND.passagePer * f.settlers.length);
  touchLife(g, life).founding!.stage = "underway";
  journal(
    g,
    life,
    `The expedition sets out for ${g.map.provinces[f.target].name}: ${f.settlers.length} households, wagons, cattle, seed corn and hope.`,
    "good",
  );
  if (life.prov === f.target) completeSettlement(g, life);
  return null;
}

export function abandonSettlement(
  g: ConquestGame,
  life: Life,
  why: string,
): void {
  const f = life.founding;
  if (!f) return;
  touchLife(g, life).founding = null;
  journal(
    g,
    life,
    `The settlement at ${g.map.provinces[f.target].name} comes to nothing: ${why}.`,
    "bad",
  );
}

/** Arrived: the settlement is planted. */
export function completeSettlement(g: ConquestGame, life: Life): void {
  const s = g.s;
  const f = life.founding;
  const me = meOf(s, life);
  if (!f || !me) return;
  const p = f.target;
  const pr0 = s.provinces[p];
  if (pr0.owner >= 0 || pr0.colony) {
    abandonSettlement(g, life, "someone got there first");
    return;
  }
  const old = me.nation;
  const oldNation = s.nations[old];
  let n = old;
  if (f.independent) n = newNation(g, life, p, oldNation);
  const nation = s.nations[n];
  const pr = g.prov(p);
  pr.owner = n;
  pr.integrate = 0;
  pr.colony = null;
  pr.siege = null;
  pr.pops.push(
    ...settlerPops(
      nation.culture,
      me.religion,
      50 + FOUND.people * f.settlers.length,
    ),
  );
  merge(pr.pops);
  g.nation(n).stats.coloniesFounded++;
  g.event({ k: "colony", day: s.day, n, p });
  // The neighbours notice.
  const seen = new Set<number>();
  for (const [q] of g.map.provinces[p].nb) {
    const owner = s.provinces[q].owner;
    if (owner >= 0 && s.nations[owner].kind === "native" && !seen.has(owner)) {
      seen.add(owner);
      (g.nation(owner).relations[n] ??= []).push({
        of: -1,
        why: `Settlers took ${g.map.provinces[p].name}`,
        value: -10,
        until: s.day + 365 * 12,
      });
    }
  }
  if (!f.independent && f.charter === "none") {
    pr.mods.push({
      key: "squatters",
      label: "Squatters without a charter",
      until: s.day + 3 * DAYS_PER_YEAR,
      fx: { unrest: 6 },
    });
    const gov = s.chars[oldNation.ruler];
    if (gov?.alive && gov.id !== me.id)
      remembers(g, life, g.char(gov.id), "Settled without leave", -15, 3);
    touchLife(g, life).favor = Math.max(0, life.favor - 5);
  }
  // The families move in.
  s.locals[p] ??= [];
  const moving = new Set<number>();
  for (const id of f.settlers) {
    const c = s.chars[id];
    if (!c?.alive || c.abroad) continue;
    for (const x of [
      c,
      s.chars[c.spouse],
      ...c.children.map((k) => s.chars[k]),
    ]) {
      if (!x?.alive || x.abroad || lifeOfChar(s, x.id)) continue;
      if (x !== c && x.home !== c.home) continue;
      moving.add(x.id);
    }
    for (const [k, list] of Object.entries(s.locals))
      if (Number(k) !== p && list.includes(id)) {
        s.locals[Number(k)] = list.filter((y) => y !== id);
        g.localsChanged(Number(k));
      }
    if (!s.locals[p].includes(id)) s.locals[p].push(id);
  }
  for (const id of moving) {
    const x = g.char(id);
    x.home = p;
    if (f.independent) x.nation = n;
  }
  g.localsChanged(p);
  // And you: home is here now.
  touchLife(g, life).home = p;
  g.touchChar(me).home = p;
  for (const c of familyAtHome(s, life)) {
    g.char(c.id).home = p;
    if (f.independent) c.nation = n;
  }
  const name = g.map.provinces[p].name;
  if (!f.independent) {
    const list = ensureOffices(g, p);
    if (!list.some((o) => o.key === "founder"))
      list.push({
        id: g.nextId(),
        key: "founder",
        prov: p,
        nation: n,
        holder: me.id,
        since: s.day,
        election: -1,
        candidates: [],
        duty: s.day,
      });
    else list.find((o) => o.key === "founder")!.holder = me.id;
    g.societyChanged(`o${p}`);
  }
  touchLife(g, life).founding = null;
  addRenown(g, life, f.independent ? 15 : 10);
  life.tally.topOffice = Math.max(life.tally.topOffice, f.independent ? 3 : 1);
  milestone(
    g,
    life,
    "office",
    f.independent
      ? `Founded ${nation.name} at ${name}`
      : `Founded the settlement at ${name}`,
    p,
  );
  journal(
    g,
    life,
    f.independent
      ? `You plant your colony at ${name}, answerable to no crown. Now give it a name, a flag and a government (Affairs).`
      : `The settlement at ${name} is planted: cabins up, fields marked out, and you its proprietor. Name its officers and see it grow.`,
    "good",
  );
  rumour(
    g,
    p,
    `${charName(me)} has planted a ${f.independent ? "free colony" : "settlement"} at ${name}.`,
    me.id,
    "good",
  );
  if (f.independent) {
    touchLife(g, life).constitute = {
      n,
      until: s.day + DAYS_PER_YEAR,
      free: true,
    };
    raiseLifeEvent(g, life, "found-government", { n });
  } else raiseLifeEvent(g, life, "found-planted", { p });
}

/** A nation of your own, made through the same machinery as any other. */
function newNation(
  g: ConquestGame,
  life: Life,
  p: number,
  from: Nation,
): number {
  const s = g.s;
  const me = meOf(s, life)!;
  const id = s.nations.length;
  const name = `the Free Colony of ${g.map.provinces[p].name}`;
  const n = blankNation(
    id,
    `free-${id}`,
    "power",
    name,
    "Free",
    life.frame || "#5b7f3a",
    {
      culture: from.culture,
      religion: me.religion,
      capital: p,
      gold: 20,
      player: null,
      playerName: null,
    },
  );
  n.independent = true;
  n.ruler = me.id;
  n.founded = s.day;
  n.favor = 0;
  // Prices to start from: the old colony's.
  n.market = JSON.parse(JSON.stringify(from.market));
  for (const k of Object.keys(n.market.stock))
    (n.market.stock as Record<string, number>)[k] = 0;
  s.nations.push(n);
  g.nation(id);
  // The old colony takes it badly.
  (g.nation(from.id).relations[id] ??= []).push({
    of: -1,
    why: "Broke away without leave",
    value: -35,
    until: s.day + 365 * 15,
  });
  g.touchChar(me).nation = id;
  makePolities(g);
  return id;
}

// ---------------------------------------------------------------- setting up a government

export function constituteCheck(s: GameState, life: Life): Check {
  const me = meOf(s, life);
  const c = life.constitute;
  if (!me || !c) return no("There's no new government to set up.");
  if (c.until <= s.day) return no("The moment has passed.");
  const n = s.nations[c.n];
  if (!n?.alive) return no("That nation is no more.");
  if (n.ruler !== me.id) return no("You don't lead it.");
  return yes;
}

/** Characters who could take a first seat on the new council. */
export function firstOfficers(s: GameState, n: number): Character[] {
  const nation = s.nations[n];
  if (!nation) return [];
  const seen = new Set<number>();
  const out: Character[] = [];
  const add = (c: Character | undefined) => {
    if (!c?.alive || c.abroad || seen.has(c.id) || c.id === nation.ruler)
      return;
    if (ageOf(s, c) < 21 || lifeOfChar(s, c.id)) return;
    seen.add(c.id);
    out.push(c);
  };
  for (const c of nationCharacters(s, n)) add(c);
  for (const id of s.polities[n]?.assembly ?? []) add(s.chars[id]);
  for (const p of provincesOf(s, n))
    for (const id of s.locals[p] ?? []) {
      const c = s.chars[id];
      if (c && (c.role ? ROLES[c.role].status : 1) >= 2) add(c);
    }
  return out.slice(0, 30);
}

export interface Constitution {
  name: string;
  adjective: string;
  color: string;
  flag: NationFlag;
  gov: GovForm;
  capital: number;
  offices: Partial<Record<Seat, number>>;
  /** After an overthrow: break with the crown too. */
  free: boolean;
}

export function validFlag(f: unknown): f is NationFlag {
  const x = f as NationFlag;
  return (
    !!x &&
    typeof x === "object" &&
    FLAG_COLORS.includes(x.field) &&
    FLAG_COLORS.includes(x.second) &&
    FLAG_COLORS.includes(x.chargeColor) &&
    FLAG_DIVISIONS.includes(x.division) &&
    typeof x.charge === "string" &&
    x.charge in CHARGES
  );
}

export function constitutionProblem(
  s: GameState,
  life: Life,
  c: Constitution,
): string | null {
  const check = constituteCheck(s, life);
  if (!check.ok) return check.why;
  const n = life.constitute!.n;
  const name = (c.name ?? "").trim();
  const adj = (c.adjective ?? "").trim();
  if (name.length < 3 || name.length > 40 || !NAME_RE.test(name))
    return "A name of 3 to 40 letters.";
  if (adj.length < 2 || adj.length > 20 || !NAME_RE.test(adj))
    return 'An adjective of 2 to 20 letters ("Columbian").';
  if (
    s.nations.some(
      (x) =>
        x.id !== n && x.alive && x.name.toLowerCase() === name.toLowerCase(),
    )
  )
    return "Another nation has that name.";
  if (!/^#[0-9a-f]{6}$/i.test(c.color ?? "") || !FLAG_COLORS.includes(c.color))
    return "Choose a colour.";
  if (!validFlag(c.flag)) return "Your flag isn't right.";
  if (!(c.gov in GOV_FORMS)) return "Choose a form of government.";
  if (s.provinces[c.capital]?.owner !== n)
    return "The capital must be your own land.";
  const can = new Set(firstOfficers(s, n).map((x) => x.id));
  for (const [seat, id] of Object.entries(c.offices ?? {})) {
    if (!SEATS.includes(seat as Seat)) return "No such seat.";
    if (id === undefined || id < 0) continue;
    if (!can.has(id)) return "Choose officers from among your own people.";
  }
  const ids = Object.values(c.offices ?? {}).filter(
    (x) => x !== undefined && x >= 0,
  );
  if (new Set(ids).size !== ids.length) return "One seat each.";
  return null;
}

/** Proclaim the new government. */
export function constitute(
  g: ConquestGame,
  life: Life,
  c: Constitution,
): string | null {
  const s = g.s;
  const problem = constitutionProblem(s, life, c);
  if (problem) return problem;
  const me = meOf(s, life)!;
  const n = life.constitute!.n;
  const nation = g.nation(n);
  const was = nation.name;
  nation.name = c.name.trim();
  nation.adjective = c.adjective.trim();
  nation.color = c.color;
  nation.flag = { ...c.flag };
  nation.gov = c.gov;
  nation.founded ??= s.day;
  if (c.capital !== nation.capital) nation.capital = c.capital;
  nation.mods = nation.mods.filter((m) => !m.key.startsWith("gov:"));
  nation.mods.push({
    key: `gov:${c.gov}`,
    label: `A ${GOV_FORMS[c.gov].name.toLowerCase()}`,
    until: s.endDay + 1,
    fx: { ...GOV_FORMS[c.gov].fx },
  });
  for (const [seat, id] of Object.entries(c.offices ?? {}))
    if (id !== undefined && id >= 0) {
      characterCommand(g, n, { k: "appoint", seat: seat as Seat, c: id });
      remembers(
        g,
        life,
        g.char(id),
        "Made me one of the first officers",
        15,
        0,
      );
    }
  if (
    c.free &&
    !nation.independent &&
    !nation.rebelling &&
    nation.kind === "power"
  )
    declareIndependence(g, n);
  touchLife(g, life).constitute = null;
  const title = GOV_FORMS[c.gov].ruler[me.female ? 1 : 0];
  addRenown(g, life, 8);
  milestone(
    g,
    life,
    "office",
    `Proclaimed ${nation.name}, its first ${title.toLowerCase()}`,
  );
  journal(
    g,
    life,
    `${was === nation.name ? "" : `What was ${was} is now `}${nation.name}: a ${GOV_FORMS[c.gov].name.toLowerCase()}, under its own flag, with you its ${title.toLowerCase()}.`,
    "good",
  );
  g.event({
    k: "news",
    day: s.day,
    n,
    text: `${nation.name} is proclaimed at ${g.map.provinces[nation.capital]?.name}: a ${GOV_FORMS[c.gov].name.toLowerCase()}, with ${charName(me)} its ${title.toLowerCase()}.`,
    p: nation.capital,
  });
  rumour(
    g,
    nation.capital,
    `${nation.name} has been proclaimed, with ${charName(me)} its ${title.toLowerCase()}.`,
    me.id,
    "good",
  );
  return null;
}

/** After a rising carries the day: its leader sets up the government. */
export function risingWon(
  g: ConquestGame,
  n: number,
  leader: number,
  free: boolean,
): void {
  const life = lifeOfChar(g.s, leader);
  if (!life || life.watching) return;
  touchLife(g, life).constitute = { n, until: g.s.day + DAYS_PER_YEAR, free };
  raiseLifeEvent(g, life, "found-government", { n });
}

/** A default flag from a seed, for the maker to start from. */
export function defaultFlag(seed: number): NationFlag {
  const pick = <T>(xs: readonly T[], k: number) =>
    xs[Math.abs(seed * 31 + k * 17) % xs.length];
  const charges: Charge[] = [
    "star",
    "tree",
    "ship",
    "anchor",
    "beaver",
    "wheat",
    "none",
  ];
  return {
    field: pick(FLAG_COLORS.slice(2), 1),
    division: pick(FLAG_DIVISIONS, 2),
    second: FLAG_COLORS[0],
    charge: pick(charges, 3),
    chargeColor: FLAG_COLORS[5],
  };
}

export function monthName(day: number): string {
  return [
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
  ][dateOf(day).month];
}
