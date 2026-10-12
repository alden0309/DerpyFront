// LABOUR (r15): bondage in the household, month by month. Buying people at
// the ports where they were sold (and servants' indentures), setting them to
// work, the household's policies, their lives (health and spirits, births
// and deaths, families made and broken), flight and risings, freedom (by
// deed, by petition, by will, by their own purchase, at the end of a term),
// and what passes to an heir. The model and its odds are in BondCore.ts and
// the law in BondLaw.ts; the scenes are in BondEvents.ts.
//
// Every roll here is on the track's own dice (bdice), so a game where nobody
// holds anyone rolls nothing and goes exactly as it did.

import {
  allowanceOf,
  bdice,
  birthChance,
  bondForecast,
  bondName,
  boundOf,
  buyCheck,
  CROP_EXCISE,
  CROP_LUCK,
  customaryPolicy,
  deathChance,
  familyAway,
  fieldsOf,
  flightChance,
  freeCheck,
  freeCost,
  FREEDOM_DUES,
  freeSurname,
  hashOf,
  healthTarget,
  heldAdults,
  HIRE_LUCK,
  hiredOf,
  isBound,
  isHeld,
  leftBehind,
  moodTarget,
  nameFor,
  note,
  r1,
  r2,
  refugeOdds,
  RISE_OUTCOMES,
  riseChance,
  saleAt,
  saleFamily,
  seatSalt,
  SECRET_MARK,
  selfPrice,
  sellCheck,
  sellWorth,
  willCheck,
  workOf,
  type SalePerson,
} from "./BondCore";
import {
  bondLaw,
  colonyOf,
  holdingLawful,
  lawOf,
  REFUGE_NAMES,
  type Refuge,
} from "./BondLaw";
import { dateOf } from "./Calendar";
import { kill, makeCharacter } from "./Characters";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { withFlow } from "./LedgerCore";
import {
  addRenown,
  addStress,
  earn,
  heal,
  hurt,
  journal,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import { lifeIsNative, meOf } from "./LifeQueries";
import { nextTurn } from "./Odds";
import { ageOf } from "./Queries";
import { Rng } from "./Rng";
import { DAYS_PER_YEAR } from "./Rules";
import type {
  AffairItem,
  Bondage,
  BondPolicy,
  BondWork,
  Character,
  GameState,
  LabourCommand,
  Life,
  LifeCommand,
} from "./Types";

// ---------------------------------------------------------------- the household

/** The household's bondage, made if it has none (its home: yours). */
export function bondageFor(g: ConquestGame, life: Life): Bondage {
  touchLife(g, life);
  life.bondage ??= {
    people: [],
    policy: customaryPolicy(g.s, g.map, life.home),
    home: life.home,
    log: [],
  };
  return life.bondage;
}

function people(g: ConquestGame, life: Life): Character[] {
  return boundOf(g.s, life);
}

/** A journal line only the household's own player is sent. */
function secretly(
  g: ConquestGame,
  life: Life,
  text: string,
  tone?: "good" | "bad",
) {
  journal(g, life, SECRET_MARK + text, tone, false);
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- buying

/** Someone from a sale becomes a person in the world, in your household. */
function makePerson(
  g: ConquestGame,
  life: Life,
  rng: Rng,
  x: SalePerson,
  kind: "held" | "indenture",
  paid: number,
): Character {
  const s = g.s;
  const b = life.bondage!;
  const pr = s.provinces[b.home];
  const owner =
    s.nations[
      pr && pr.owner >= 0 ? pr.owner : Math.max(0, meOf(s, life)!.nation)
    ];
  const c = makeCharacter(s, rng, {
    nation: owner.id,
    culture: owner.culture,
    religion: owner.religion,
    female: x.female,
    age: x.age,
    first: x.first,
    family: x.family ?? "",
  });
  c.bond = {
    status: kind,
    seat: life.seat,
    at: b.home,
    origin: x.origin,
    faith: x.faith,
    health: x.health,
    mood: 35,
    sk: { ...x.sk },
    work: x.age < 12 ? "rest" : kind === "indenture" ? "fields" : "fields",
    since: s.day,
    paid,
    ...(x.born ? { born: x.born } : {}),
    ...(x.term ? { until: s.day + x.term * DAYS_PER_YEAR } : {}),
  };
  g.touchChar(c);
  b.people.push(c.id);
  return c;
}

function buy(g: ConquestGame, life: Life, key: string): string | null {
  const s = g.s;
  const [pStr] = key.split(":");
  const p = Number(pStr);
  const lot = saleAt(s, g.map, p).find((x) => x.key === key);
  const check = buyCheck(s, g.map, life, lot);
  if (!check.ok) return check.why;
  const b = bondageFor(g, life);
  // Those bought live where the household does (your home, the first time).
  if (
    !b.people.length &&
    b.home !== life.home &&
    holdingLawful(s, g.map, life.home)
  ) {
    b.home = life.home;
    b.policy = customaryPolicy(s, g.map, life.home);
  }
  const rng = new Rng({ rng: hashOf(s.settings.seed, s.day, p, key, 0xb0b) });
  const list: Character[] = [];
  withFlow(
    g,
    {
      key: "bond:buy",
      label:
        lot!.kind === "indenture" ? "An indenture bought" : "Bought at a sale",
    },
    () => spend(g, life, lot!.price),
  );
  for (const x of lot!.people)
    list.push(
      makePerson(
        g,
        life,
        rng,
        x,
        lot!.kind,
        Math.round(lot!.price / lot!.people.length),
      ),
    );
  // Husband and wife, and their children.
  const head = list[0];
  const partner = list.find((_, i) => lot!.people[i].rel === "partner");
  if (partner) {
    head.spouse = partner.id;
    partner.spouse = head.id;
  }
  const mother = head.female ? head : partner;
  const father = head.female ? partner : head;
  list.forEach((c, i) => {
    if (lot!.people[i].rel !== "child") return;
    if (mother) {
      c.mother = mother.id;
      mother.children.push(c.id);
    }
    if (father && father !== mother) {
      c.father = father.id;
      father.children.push(c.id);
    }
  });
  // Someone sold out of an estate leaves family behind there.
  if (
    lot!.kind === "held" &&
    lot!.people.length === 1 &&
    head.bond!.origin === "creole" &&
    rng.chance(0.55)
  )
    familyLeftBehind(g, life, rng, head, p);
  (b.bought ??= []).push(key);
  b.bought = b.bought.filter(
    (k) =>
      Number(k.split(":")[1]) >=
      dateOf(s.day).year * 12 + dateOf(s.day).month - 1,
  );
  for (const c of list)
    note(b, { day: s.day, k: "bought", c: c.id, n: c.bond!.paid });
  const where = g.map.provinces[p].name;
  const names = list.map((c) => bondName(c)).join(", ");
  journal(
    g,
    life,
    lot!.kind === "indenture"
      ? `You buy the indenture of ${names} at ${where}: ${Math.round((head.bond!.until! - s.day) / DAYS_PER_YEAR)} years to serve, for ${lot!.price} coins.`
      : `At ${where} you buy ${names}, for ${lot!.price} coins. ${list.length > 1 ? "They come" : `${head.female ? "She comes" : "He comes"}`} to your household at ${g.map.provinces[b.home].name}.`,
  );
  return null;
}

/** A husband, a wife or a mother left on the estate someone was sold from. */
function familyLeftBehind(
  g: ConquestGame,
  life: Life,
  rng: Rng,
  c: Character,
  p: number,
): void {
  const s = g.s;
  const age = ageOf(s, c);
  const owner = s.nations[c.nation];
  const asPartner = age >= 20 && c.spouse < 0 && rng.chance(0.6);
  const female = asPartner ? !c.female : true;
  const n = nameFor(rng, "creole", female, owner?.culture ?? "english");
  const x = makeCharacter(s, rng, {
    nation: c.nation,
    culture: c.culture,
    religion: c.religion,
    female,
    age: asPartner
      ? Math.max(18, age + rng.int(-6, 4))
      : age + 18 + rng.int(0, 10),
    first: n.first,
    family: "",
  });
  x.bond = {
    status: "held",
    by: -1,
    at: p,
    origin: "creole",
    faith: rng.chance(0.4) ? "christian" : "own",
    health: 65,
    mood: 35,
    sk: { field: 4, house: 3, craft: 2 },
    work: "fields",
    since: s.day,
  };
  if (asPartner) {
    c.spouse = x.id;
    x.spouse = c.id;
  } else {
    c.mother = x.id;
    x.children.push(c.id);
  }
  g.touchChar(x);
  g.touchChar(c);
}

// ---------------------------------------------------------------- the household's choices

const POLICY_KEYS = [
  "food",
  "housing",
  "regime",
  "families",
  "passes",
  "church",
  "letters",
  "punish",
] as const;

function setPolicy(
  g: ConquestGame,
  life: Life,
  kind: string,
  arg: number,
): string | null {
  const s = g.s;
  if (!(POLICY_KEYS as readonly string[]).includes(kind))
    return "No such policy.";
  const b = life.bondage;
  if (!b) return "You hold no one.";
  const law = bondLaw(s, g.map, b.home);
  const pol: BondPolicy = { ...b.policy };
  switch (kind) {
    case "food":
    case "housing":
    case "punish":
      if (arg !== 0 && arg !== 1 && arg !== 2) return "No such choice.";
      pol[kind] = arg as 0 | 1 | 2;
      break;
    case "regime":
      pol.regime = arg ? "task" : "gang";
      break;
    case "church":
      if (!arg && law.church === "required")
        return `${law.code}: religious instruction is required here.`;
      pol.church = !!arg;
      break;
    case "letters":
      if (arg && !law.reading)
        return law.lettersWhy ?? "The law forbids it here.";
      pol.letters = !!arg;
      break;
    case "families":
      if (!arg && !law.apart)
        return `${law.code}: families may not be sold apart here.`;
      pol.families = !!arg;
      break;
    case "passes":
      pol.passes = !!arg;
      break;
  }
  touchLife(g, life);
  b.policy = pol;
  return null;
}

function setWork(
  g: ConquestGame,
  life: Life,
  c: Character | undefined,
  kind: string,
): string | null {
  const s = g.s;
  if (!c || !isBound(c) || c.bond!.seat !== life.seat)
    return "Not in your household.";
  const w = kind as BondWork;
  if (!["fields", "house", "craft", "rest"].includes(w)) return "No such work.";
  if (w !== "rest" && ageOf(s, c) < 12) return "A child: no work.";
  g.touchChar(c).bond = { ...c.bond!, work: w };
  touchLife(g, life);
  return null;
}

// ---------------------------------------------------------------- freedom

/** Someone becomes free: a person of the world, living where the law allows. */
export function setFree(
  g: ConquestGame,
  life: Life,
  c: Character,
  how: string,
  leave = false,
): void {
  const s = g.s;
  const b = life.bondage!;
  const rng = bdice(s, hashOf(c.id, 0xf2ee));
  const was = c.bond!;
  let home = was.at;
  if (leave) home = refugeHome(g, "north", was.at) ?? home;
  const ch = g.touchChar(c);
  ch.bond = {
    ...was,
    status: "free",
    work: "rest",
    at: home,
    freed: { day: s.day, how },
    will: undefined,
  };
  delete ch.bond.will;
  if (!ch.family) {
    const owner = s.nations[ch.nation];
    ch.family = freeSurname(rng, ch, owner?.culture ?? "english");
  }
  becomeLocal(g, ch, home);
  b.people = b.people.filter((x) => x !== c.id);
  (b.freed ??= []).push(c.id);
  note(b, { day: s.day, k: "freed", c: c.id });
  remembers(g, life, ch, "Freed me", 40, 0);
  // Their family still held hope for it too.
  for (const f of people(g, life))
    if (
      f.id === c.spouse ||
      f.mother === c.id ||
      f.father === c.id ||
      c.mother === f.id ||
      c.father === f.id
    )
      g.touchChar(f).bond = {
        ...f.bond!,
        mood: Math.min(100, f.bond!.mood + 8),
      };
}

/** A free person lives somewhere: a townsman (or woman) of that place. */
function becomeLocal(g: ConquestGame, c: Character, p: number): void {
  const s = g.s;
  c.home = p;
  const list = s.locals[p] ?? [];
  if (!list.includes(c.id)) {
    s.locals[p] = [...list, c.id];
    g.localsChanged(p);
  }
}

/** A place someone free might go: Philadelphia or another northern town, St. Augustine... */
function refugeHome(
  g: ConquestGame,
  to: Refuge,
  from: number,
): number | undefined {
  const s = g.s;
  const map = g.map;
  const byId = (id: string) => map.provinces.findIndex((x) => x.id === id);
  const english = (p: number) =>
    p >= 0 && lawOf(s, p).law !== "native" && lawOf(s, p).law !== "none";
  switch (to) {
    case "florida": {
      const p = byId("st-augustine");
      return lawOf(s, p).law === "spanish" ? p : undefined;
    }
    case "north":
    case "town": {
      const want =
        to === "north"
          ? ["upland", "new-amsterdam", "massachusetts-bay", "narragansett"]
          : [];
      for (const id of want) {
        const p = byId(id);
        if (p >= 0 && p !== from && english(p)) return p;
      }
      // The biggest colonists' town in reach.
      let best = -1;
      let most = 0;
      const lat = map.provinces[from]?.lat ?? 0;
      const lon = map.provinces[from]?.lon ?? 0;
      s.provinces.forEach((pr, p) => {
        const d = map.provinces[p];
        if (!d || p === from || !english(p)) return;
        if (Math.abs(d.lat - lat) > 6 || Math.abs(d.lon - lon) > 8) return;
        const n = pr.pops.reduce(
          (m, x) => m + (x.cls === "tribe" ? 0 : x.size),
          0,
        );
        if (n > most) {
          most = n;
          best = p;
        }
      });
      return best >= 0 ? best : undefined;
    }
    case "nations": {
      const lat = map.provinces[from]?.lat ?? 0;
      const lon = map.provinces[from]?.lon ?? 0;
      let best = -1;
      let dist = 1e9;
      s.provinces.forEach((pr, p) => {
        const n = pr.owner >= 0 ? s.nations[pr.owner] : undefined;
        if (n?.kind !== "native") return;
        const d = map.provinces[p];
        const k = Math.hypot(d.lat - lat, d.lon - lon);
        if (k < dist) {
          dist = k;
          best = p;
        }
      });
      return best >= 0 ? best : undefined;
    }
    default:
      return undefined;
  }
}

function free(
  g: ConquestGame,
  life: Life,
  c: Character | undefined,
): string | null {
  const s = g.s;
  const check = freeCheck(s, g.map, life, c);
  if (!check.ok) return check.why;
  const b = life.bondage!;
  const ch = c!;
  if (ch.bond!.status === "indenture") {
    setFree(g, life, ch, "released from the indenture");
    journal(
      g,
      life,
      `You release ${bondName(ch)} from the rest of the indenture. ${ch.female ? "She" : "He"} is free.`,
      "good",
    );
    return null;
  }
  const fc = freeCost(s, g.map, life);
  const r = fc.rule;
  if (r.kind === "petition") {
    withFlow(g, { key: "bond:free", label: "Fees: freeing someone" }, () =>
      spend(g, life, fc.fee),
    );
    const odds = petitionOdds(r.petition!.odds, ch);
    (b.petitions ??= []).push({
      c: ch.id,
      day: s.day,
      due: s.day + r.petition!.days,
      who: r.petition!.who,
      odds,
    });
    note(b, { day: s.day, k: "petition", c: ch.id });
    journal(
      g,
      life,
      `You petition ${r.petition!.who} to free ${bondName(ch)} (${r.law})${ch.bond!.merit ? `, for ${ch.bond!.merit}` : ""}. The answer will come in about ${Math.round(r.petition!.days / 30)} months.`,
    );
    return null;
  }
  freeNow(g, life, ch, "by deed");
  return null;
}

/** A petition's chance: the law's own, and much better for a meritorious service. */
export function petitionOdds(base: number, c: Character): number {
  return Math.min(0.9, c.bond?.merit ? base + 0.5 : base);
}

/** Free someone now, past the law's hurdles (fees, passage, security, allowance). */
function freeNow(
  g: ConquestGame,
  life: Life,
  c: Character,
  how: string,
  estate = false,
): boolean {
  const s = g.s;
  const b = life.bondage!;
  const fc = freeCost(s, g.map, life);
  const r = fc.rule;
  if (life.purse < fc.need) return false;
  withFlow(
    g,
    {
      key: "bond:free",
      label: estate ? "Fees: freed by will" : "Fees: freeing someone",
    },
    () => spend(g, life, fc.fee + fc.passage),
  );
  if (fc.security) (b.bonds ??= []).push({ c: c.id, sum: fc.security });
  if (fc.allowance) (b.allowance ??= []).push(c.id);
  const leave = !!r.leave;
  setFree(g, life, c, how, leave);
  const name = bondName(c);
  const left = leftBehind(s, life, [c]);
  journal(
    g,
    life,
    `${name} is free${estate ? ", as your will asked" : ""}: ${r.law}${fc.security ? `; you stand bond for ${fc.security} coins that ${c.female ? "she" : "he"} will never come on the town` : ""}${fc.allowance ? `; the law has you pay ${c.female ? "her" : "him"} ${Math.round(fc.allowance)} coins a year` : ""}.${leave ? ` The law sends ${c.female ? "her" : "him"} out of the colony within ${r.leave} months: ${c.female ? "she" : "he"} goes to ${g.map.provinces[c.bond!.at]?.name ?? "the north"}${left.length ? `, and ${left.map((x) => bondName(x)).join(" and ")} stay${left.length === 1 ? "s" : ""} behind` : ""}.` : ""}`,
    "good",
  );
  for (const f of left)
    if (leave) g.touchChar(f).bond = { ...f.bond!, grief: s.day + 240 };
  return true;
}

function setWill(
  g: ConquestGame,
  life: Life,
  c: Character | undefined,
): string | null {
  const check = willCheck(g.s, g.map, life, c);
  if (!check.ok) return check.why;
  const ch = g.touchChar(c!);
  const on = !ch.bond!.will;
  ch.bond = { ...ch.bond!, will: on };
  if (!on) delete ch.bond.will;
  touchLife(g, life);
  journal(
    g,
    life,
    on
      ? `You write into your will that ${bondName(ch)} is to be freed at your death.`
      : `You strike ${bondName(ch)}'s freedom out of your will.`,
  );
  if (on) remembers(g, life, ch, "Promised me freedom in a will", 15, 5);
  else remembers(g, life, ch, "Took back a promise of freedom", -25, 5);
  return null;
}

/** Let someone who has saved their price buy their freedom. */
export function selfPurchase(
  g: ConquestGame,
  life: Life,
  c: Character | undefined,
  waive = false,
): string | null {
  const s = g.s;
  if (!c || !isHeld(c) || c.bond!.seat !== life.seat)
    return "Not held in your household.";
  const priceNow = selfPrice(s, g.map, life, c);
  const saved = c.bond!.saved ?? 0;
  if (!waive && saved < priceNow)
    return `${bondName(c)} has saved ${r1(saved)} of ${priceNow}.`;
  const fc = freeCost(s, g.map, life);
  if (fc.rule.kind === "none") return fc.rule.text;
  if (fc.rule.kind === "petition") {
    // Their money paid, the petition goes in as any other.
    if (!waive)
      withFlow(g, { key: "bond:self", label: "A freedom bought" }, () =>
        earn(g, life, priceNow),
      );
    g.touchChar(c).bond = {
      ...c.bond!,
      saved: waive ? saved : r1(saved - priceNow),
    };
    return free(g, life, c);
  }
  if (life.purse + (waive ? 0 : priceNow) < fc.need)
    return `The law's fees and security: ${fc.need} coins in hand.`;
  if (!waive)
    withFlow(g, { key: "bond:self", label: "A freedom bought" }, () =>
      earn(g, life, priceNow),
    );
  g.touchChar(c).bond = {
    ...c.bond!,
    saved: waive ? saved : r1(saved - priceNow),
  };
  freeNow(
    g,
    life,
    c,
    waive ? "by deed, the price forgiven" : "by buying their own freedom",
  );
  return null;
}

// ---------------------------------------------------------------- selling

/** Sell someone (with their family, if `all`): the price, and what it breaks. */
export function sellPerson(
  g: ConquestGame,
  life: Life,
  c: Character,
  all: boolean,
): string | null {
  const s = g.s;
  const check = sellCheck(s, g.map, life, c, all);
  if (!check.ok) return check.why;
  const b = life.bondage!;
  const list = all ? saleFamily(s, life, c) : [c];
  const left = leftBehind(s, life, list);
  const worth = sellWorth(s, g.map, life, list);
  const rng = bdice(s, hashOf(c.id, 0x5e11));
  const away = elsewhere(g, b.home, rng);
  for (const x of list) {
    g.touchChar(x).bond = {
      ...x.bond!,
      seat: undefined,
      by: -1,
      at: away,
      will: undefined,
      grief: s.day + 365,
    };
    delete x.bond!.seat;
    delete x.bond!.will;
    b.people = b.people.filter((id) => id !== x.id);
    note(b, { day: s.day, k: "sold", c: x.id });
  }
  withFlow(g, { key: "bond:sell", label: "Sold" }, () => earn(g, life, worth));
  for (const f of left) {
    g.touchChar(f).bond = {
      ...f.bond!,
      grief: s.day + 365,
      mood: Math.max(0, f.bond!.mood - 15),
    };
    remembers(g, life, f, "Sold my family away", -40, 0);
  }
  // Everyone in the household knows it could be them.
  for (const x of people(g, life))
    g.touchChar(x).bond = { ...x.bond!, mood: Math.max(0, x.bond!.mood - 5) };
  const names = list.map((x) => bondName(x)).join(", ");
  journal(
    g,
    life,
    `You sell ${names}, for ${worth} coins, to a buyer from ${g.map.provinces[away]?.name ?? "elsewhere"}.${left.length ? ` ${left.map((x) => bondName(x)).join(" and ")} ${left.length === 1 ? "is" : "are"} left behind.` : ""}`,
    "bad",
  );
  addStress(g, life, left.length ? 6 : 2);
  return null;
}

/** Another estate, somewhere in the colony (or the next one). */
function elsewhere(g: ConquestGame, p: number, rng: Rng): number {
  const map = g.map;
  const col = colonyOf(map, p);
  const same = map.provinces
    .map((_, i) => i)
    .filter(
      (i) => i !== p && colonyOf(map, i) === col && holdingLawful(g.s, map, i),
    );
  return same.length ? same[rng.int(0, same.length - 1)] : p;
}

// ---------------------------------------------------------------- the command

function bondCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "bond") return undefined;
  const cmd = c as LabourCommand;
  const s = g.s;
  if (lifeIsNative(s, life) && cmd.act !== "hear")
    return "Your people's ways have nothing to do with this.";
  const ch = cmd.c !== undefined ? s.chars[cmd.c] : undefined;
  switch (cmd.act) {
    case "buy":
      return typeof cmd.key === "string" ? buy(g, life, cmd.key) : "Which lot?";
    case "work":
      return setWork(g, life, ch, cmd.kind ?? "");
    case "policy":
      return setPolicy(g, life, cmd.kind ?? "", Number(cmd.arg ?? 0));
    case "free":
      return free(g, life, ch);
    case "will":
      return setWill(g, life, ch);
    case "purchase":
      return selfPurchase(g, life, ch, cmd.arg === 1);
    case "sell": {
      if (!ch) return "Who?";
      const all = cmd.key === "all";
      const check = sellCheck(s, g.map, life, ch, all);
      if (!check.ok) return check.why;
      // Selling someone from their family is put to you as a scene first.
      if (
        cmd.arg !== 1 &&
        leftBehind(s, life, all ? saleFamily(s, life, ch) : [ch]).length
      ) {
        raiseEvent(g, life, "bond-plea", { c: ch.id, all: all ? 1 : 0 });
        return null;
      }
      return sellPerson(g, life, ch, all);
    }
    case "hear": {
      if (!ch || !isBound(ch) || ch.bond!.seat !== life.seat)
        return "Not in your household.";
      const key = `bond:hear:${ch.id}`;
      if ((life.cooldowns[key] ?? 0) > s.day)
        return `You heard ${bondName(ch)} lately: ${(life.cooldowns[key] ?? 0) - s.day} days.`;
      touchLife(g, life).cooldowns[key] = s.day + 60;
      raiseEvent(g, life, "bond-voice", {
        c: ch.id,
        t: voiceTopic(g, life, ch),
      });
      return null;
    }
    default:
      return "Unknown.";
  }
}

hooks.command.push(bondCommand);

/** What someone wants to say, when they're heard: the thing most on their mind. */
export function voiceTopic(g: ConquestGame, life: Life, c: Character): number {
  const s = g.s;
  const m = c.bond!;
  if (m.status === "indenture") return 7;
  if ((m.grief ?? 0) > s.day) return 1;
  if ((m.saved ?? 0) >= selfPrice(s, g.map, life, c)) return 5;
  if (familyAway(s, c).length && !life.bondage!.policy.passes) return 2;
  if (c.children.some((k) => s.chars[k]?.alive && isHeld(s.chars[k]))) return 3;
  if (m.faith === "islam") return 4;
  if (!m.lit && ageOf(s, c) < 40) return 6;
  if (m.origin !== "creole") return 0;
  return 8;
}

// ---------------------------------------------------------------- the month

/** A household's month (run at each month's turn, after the life's own). */
export function bondMonthly(g: ConquestGame, life: Life): void {
  const s = g.s;
  const b = life.bondage;
  if (!b) return;
  const salt = seatSalt(life.seat);
  // Those who've died, been freed or sold are no longer the household's.
  const before = b.people.length;
  b.people = b.people.filter((id) => {
    const c = s.chars[id];
    return (
      !!c?.alive &&
      c.bond?.seat === life.seat &&
      (isBound(c) || c.bond?.status === "fled")
    );
  });
  if (b.people.length !== before) touchLife(g, life);
  // The month's keep first, as the forecast had it, under its own name.
  const keep = bondForecast(s, life, g.w).find((x) => x.key === "bond:keep");
  if (keep)
    withFlow(g, { key: "bond:keep", label: keep.label }, () =>
      spend(g, life, -keep.value),
    );
  const short = life.purse < 0;
  payAllowances(g, life);
  settleFled(g, life);
  settlePetitions(g, life);
  callBonds(g, life);
  const list = people(g, life);
  if (!list.length) return;
  touchLife(g, life);
  followHome(g, life);
  work(g, life, salt);
  // Each person's month: health, spirits, skill, what they save.
  for (const c of list) personMonth(g, life, c, short);
  births(g, life, salt);
  marriages(g, life, salt);
  deaths(g, life, salt);
  flights(g, life, salt);
  rising(g, life, salt);
  servedOut(g, life);
  askToBuy(g, life);
  familyElsewhere(g, life, salt);
}

hooks.lifeMonthly.push(bondMonthly);

function work(g: ConquestGame, life: Life, salt: number): void {
  const s = g.s;
  const map = g.map;
  const f = fieldsOf(s, map, life);
  if (f.workers.length) {
    const gross = f.workers.reduce((m, c) => m + workOf(s, map, life, c), 0);
    const roll = bdice(s, salt ^ 0xf1e1d).next();
    let acc = 0;
    let mul: number = CROP_LUCK[1].mul;
    for (const x of CROP_LUCK) {
      acc += x.p;
      if (roll < acc) {
        mul = x.mul;
        break;
      }
    }
    const take = r2(gross * mul);
    withFlow(
      g,
      {
        key: "bond:fields",
        label: `The fields: ${f.workers.length} at work`,
        chance: true,
        aff: "property",
      },
      () => {
        earn(g, life, take);
        spend(g, life, r2(take * CROP_EXCISE));
      },
    );
  }
  const hired = hiredOf(s, life);
  if (hired.length) {
    const gross = hired.reduce(
      (m, c) => m + workOf(s, map, life, c, "craft"),
      0,
    );
    const roll = bdice(s, salt ^ 0x41e3).next();
    let acc = 0;
    let mul: number = HIRE_LUCK[1].mul;
    for (const x of HIRE_LUCK) {
      acc += x.p;
      if (roll < acc) {
        mul = x.mul;
        break;
      }
    }
    const take = r2(gross * mul);
    withFlow(
      g,
      {
        key: "bond:hire",
        label: `Hired out in town: ${hired.length}`,
        chance: true,
        aff: "property",
      },
      () => {
        earn(g, life, take);
        spend(g, life, r2(take * CROP_EXCISE));
      },
    );
  }
  // House work: a household kept, an easier mind, better dinners.
  const house = people(g, life).filter(
    (c) => c.bond!.work === "house" && ageOf(s, c) >= 12,
  );
  if (house.length && life.prov === life.bondage!.home && !life.travel) {
    addStress(g, life, -Math.min(3, house.length));
    heal(g, life, Math.min(1, house.length * 0.5));
  }
}

function personMonth(
  g: ConquestGame,
  life: Life,
  c: Character,
  short: boolean,
): void {
  const s = g.s;
  const map = g.map;
  const m = c.bond!;
  const rng = bdice(s, hashOf(c.id, 0x9e41));
  const ht = healthTarget(s, map, life, c).total - (short ? 10 : 0);
  const mt = moodTarget(s, map, life, c).total - (short ? 8 : 0);
  const health = Math.max(
    1,
    Math.min(
      100,
      Math.round(m.health + (ht - m.health) * 0.15 + rng.int(-2, 2)),
    ),
  );
  const mood = Math.max(
    0,
    Math.min(100, Math.round(m.mood + (mt - m.mood) * 0.2)),
  );
  const sk = { ...m.sk };
  const age = ageOf(s, c);
  if (age >= 12) {
    const k =
      m.work === "fields"
        ? "field"
        : m.work === "house"
          ? "house"
          : m.work === "craft"
            ? "craft"
            : null;
    if (k && sk[k] < 8 && rng.chance(0.06)) sk[k] += 1;
  }
  // Their own time (the task system, a trade hired out, Sundays) is theirs to save from.
  let saved = m.saved ?? 0;
  if (m.status === "held" && age >= 14) {
    const pol = life.bondage!.policy;
    saved +=
      (pol.regime === "task" ? 0.08 : 0.02) +
      (m.work === "craft" && hiredOf(s, life).includes(c) ? 0.15 : 0);
  }
  // Letters, where they're taught and the law allows.
  let lit = m.lit ?? 0;
  const law = bondLaw(s, map, life.bondage!.home);
  if (
    life.bondage!.policy.letters &&
    age >= 6 &&
    lit < (law.writing ? 2 : 1) &&
    rng.chance(0.04)
  )
    lit += 1;
  g.touchChar(c).bond = {
    ...m,
    health,
    mood,
    sk,
    ...(saved ? { saved: r2(saved) } : {}),
    ...(lit ? { lit } : {}),
  };
}

/** Where the household lives follows yours, where the law allows; families are parted by it. */
function followHome(g: ConquestGame, life: Life): void {
  const s = g.s;
  const b = life.bondage!;
  if (b.home === life.home) return;
  if (!holdingLawful(s, g.map, life.home)) return;
  const from = b.home;
  b.home = life.home;
  const parted: Character[] = [];
  for (const c of people(g, life)) {
    const away = familyAway(s, c).filter(
      (f) => f.bond?.at === from || f.home === from,
    );
    g.touchChar(c).bond = {
      ...c.bond!,
      at: life.home,
      ...(away.length ? { grief: s.day + 300 } : {}),
    };
    if (away.length) parted.push(c);
  }
  journal(
    g,
    life,
    `Those in your household go with you to ${g.map.provinces[life.home].name}.${parted.length ? ` ${parted.map((x) => bondName(x)).join(", ")} leave${parted.length === 1 ? "s" : ""} family behind at ${g.map.provinces[from].name}.` : ""}`,
    parted.length ? "bad" : undefined,
  );
}

function births(g: ConquestGame, life: Life, salt: number): void {
  const s = g.s;
  const b = life.bondage!;
  for (const mother of people(g, life)) {
    if (!isHeld(mother)) continue;
    const p = birthChance(s, mother);
    if (!p || !bdice(s, salt ^ hashOf(mother.id, 0xb1e7)).chance(p)) continue;
    const father = s.chars[mother.spouse];
    const rng = bdice(s, hashOf(mother.id, 0x6a1e));
    const female = rng.chance(0.5);
    const tradition =
      mother.bond!.origin === "creole" || mother.bond!.origin === "europe"
        ? "creole"
        : mother.bond!.origin;
    const n = nameFor(rng, tradition, female, mother.culture);
    const kid = makeCharacter(s, rng, {
      nation: mother.nation,
      culture: mother.culture,
      religion: mother.religion,
      female,
      age: 0,
      first: n.first,
      family: "",
      father: father?.id ?? -1,
      mother: mother.id,
    });
    kid.born = s.day;
    mother.children.push(kid.id);
    if (father) father.children.push(kid.id);
    g.touchChar(mother).lastBirth = s.day;
    if (father) g.touchChar(father);
    // The law made a child bond or free by its mother's condition.
    kid.bond = {
      status: "held",
      seat: life.seat,
      at: b.home,
      origin: "creole",
      faith: mother.bond!.faith === "christian" ? "christian" : "own",
      health: 70,
      mood: 60,
      sk: { field: 0, house: 0, craft: 0 },
      work: "rest",
      since: s.day,
      ...(n.born ? { born: n.born } : {}),
    };
    g.touchChar(kid);
    b.people.push(kid.id);
    note(b, { day: s.day, k: "born", c: kid.id });
    const law = bondLaw(s, g.map, b.home);
    journal(
      g,
      life,
      `${bondName(mother)} has a ${female ? "daughter" : "son"}${father ? ` by ${bondName(father)}` : ""}: ${bondName(kid)}${n.born && n.born !== kid.first ? `, whom ${mother.female ? "she" : "he"} calls ${n.born}` : ""}. Under ${law.law === "english" ? "the law that a child follows its mother's condition" : law.code}, the child is held as ${mother.female ? "she" : "he"} is.`,
    );
  }
}

function marriages(g: ConquestGame, life: Life, salt: number): void {
  const s = g.s;
  const singles = people(g, life).filter(
    (c) => c.spouse < 0 && isHeld(c) && ageOf(s, c) >= 17 && ageOf(s, c) <= 40,
  );
  const rng = bdice(s, salt ^ 0x3a1);
  if (!rng.chance(0.03)) return;
  const a = singles.find((c) => !c.female);
  const b2 = singles.find(
    (c) =>
      c.female &&
      a &&
      (c.mother < 0 || c.mother !== a.mother) &&
      c.father !== a.id &&
      a.father !== c.id &&
      c.mother !== a.id &&
      a.mother !== c.id,
  );
  if (!a || !b2) return;
  g.touchChar(a).spouse = b2.id;
  g.touchChar(b2).spouse = a.id;
  note(life.bondage!, { day: s.day, k: "married", c: a.id, n: b2.id });
  journal(
    g,
    life,
    `${bondName(a)} and ${bondName(b2)} are married: a marriage ${bondLaw(s, g.map, life.bondage!.home).law === "english" ? "no English colony's law recognises" : "the Church blesses"}, and that they keep.`,
  );
}

function deaths(g: ConquestGame, life: Life, salt: number): void {
  const s = g.s;
  const b = life.bondage!;
  for (const c of people(g, life)) {
    const p = deathChance(s, g.map, life, c);
    if (!bdice(s, salt ^ hashOf(c.id, 0xdead)).chance(p)) continue;
    const age = ageOf(s, c);
    const cause =
      age < 2
        ? "a fever in infancy"
        : age >= 60
          ? `old age at ${age}`
          : c.bond!.health < 40
            ? `a long sickness at ${age}`
            : `a fever at ${age}`;
    kill(g, c, cause);
    note(b, { day: s.day, k: "died", c: c.id });
    for (const f of people(g, life))
      if (
        f.id === c.spouse ||
        f.mother === c.id ||
        f.father === c.id ||
        c.mother === f.id ||
        c.father === f.id ||
        c.children.includes(f.id)
      )
        g.touchChar(f).bond = { ...f.bond!, grief: s.day + 300 };
    journal(g, life, `${bondName(c)} has died: ${cause}.`, "bad");
  }
}

function flights(g: ConquestGame, life: Life, salt: number): void {
  const s = g.s;
  const map = g.map;
  const b = life.bondage!;
  for (const c of people(g, life)) {
    const p = flightChance(s, map, life, c).total;
    if (!p || !bdice(s, salt ^ hashOf(c.id, 0xf1ed)).chance(p)) continue;
    const rng = bdice(s, hashOf(c.id, 0x2e7));
    const refs = refugeOdds(s, map, life, c);
    let r = rng.next();
    let to = refs[0]?.to ?? "town";
    for (const x of refs) {
      r -= x.pick;
      if (r <= 0) {
        to = x.to;
        break;
      }
    }
    const was = c.bond!.status === "indenture" ? "indenture" : "held";
    g.touchChar(c).bond = {
      ...c.bond!,
      status: "fled",
      fled: { day: s.day, to, was, due: s.day + 25 + rng.int(0, 35) },
    };
    note(b, { day: s.day, k: "fled", c: c.id });
    journal(
      g,
      life,
      `${bondName(c)} is gone in the night, making (they say) for ${REFUGE_NAMES[to]}.`,
      "bad",
    );
    raiseEvent(g, life, "bond-fled", { c: c.id });
    // A freedom seeker may come to another player's door.
    doorFor(g, life, c, to);
  }
}

/** Another player's household a freedom seeker might come to, on the way. */
function doorFor(g: ConquestGame, life: Life, c: Character, to: Refuge): void {
  if (to !== "town" && to !== "north" && to !== "sea") return;
  const s = g.s;
  const map = g.map;
  const from = map.provinces[life.bondage!.home];
  const near = s.lives
    .filter(
      (l) =>
        l.seat !== life.seat &&
        !l.watching &&
        l.c >= 0 &&
        !l.travel &&
        !lifeIsNative(s, l) &&
        l.home !== life.bondage!.home &&
        lawOf(s, l.home).law !== "native",
    )
    .map((l) => {
      const d = map.provinces[l.home];
      return { l, k: Math.hypot(d.lat - from.lat, (d.lon - from.lon) * 0.8) };
    })
    .filter((x) => x.k < 7)
    .sort((a, b) => a.k - b.k);
  if (!near.length) return;
  if (!bdice(s, hashOf(c.id, 0xd00e)).chance(0.6)) return;
  raiseEvent(g, near[0].l, "bond-door", { c: c.id });
}

/** How a flight ends, when its day comes: freedom, or taken and brought back. */
function settleFled(g: ConquestGame, life: Life): void {
  const s = g.s;
  const b = life.bondage!;
  for (const id of [...b.people]) {
    const c = s.chars[id];
    const f = c?.bond?.fled;
    if (!c?.alive || c.bond!.status !== "fled" || !f || f.out || f.due > s.day)
      continue;
    const odds =
      refugeOdds(s, g.map, life, c).find((x) => x.to === f.to)?.free ?? 0.3;
    const p = Math.max(0.02, Math.min(0.95, odds + (f.aid ?? 0)));
    const freeNowRoll = bdice(s, hashOf(c.id, 0xf7ee)).chance(p);
    if (freeNowRoll) reachedFreedom(g, life, c);
    else takenBack(g, life, c);
  }
}

/** They got clear: a free person in the world (or beyond it, in the swamp or the mountains). */
export function reachedFreedom(
  g: ConquestGame,
  life: Life,
  c: Character,
  where?: number,
): void {
  const s = g.s;
  const b = life.bondage!;
  const f = c.bond!.fled!;
  const home = where ?? refugeHome(g, f.to, b.home);
  const ch = g.touchChar(c);
  ch.bond = {
    ...ch.bond!,
    status: "free",
    work: "rest",
    fled: { ...f, out: "free" },
    freed: { day: s.day, how: `fled to ${REFUGE_NAMES[f.to].split(",")[0]}` },
    ...(home !== undefined ? { at: home } : {}),
  };
  if (home !== undefined) {
    if (!ch.family)
      ch.family = freeSurname(
        bdice(s, c.id),
        ch,
        s.nations[ch.nation]?.culture ?? "english",
      );
    becomeLocal(g, ch, home);
  }
  b.people = b.people.filter((x) => x !== c.id);
  note(b, { day: s.day, k: "free", c: c.id });
  for (const fam of people(g, life))
    if (
      fam.id === c.spouse ||
      c.children.includes(fam.id) ||
      c.mother === fam.id
    )
      g.touchChar(fam).bond = { ...fam.bond!, grief: s.day + 200 };
  journal(
    g,
    life,
    f.to === "florida"
      ? `Word comes that ${bondName(c)} reached St. Augustine: under the king of Spain's edict, ${c.female ? "she" : "he"} is free.`
      : `Nothing more is heard of ${bondName(c)}. ${c.female ? "She" : "He"} is free, by ${c.female ? "her" : "his"} own hand.`,
  );
}

/** Taken up and brought back: the law's fees paid, and a household that knows it. */
export function takenBack(
  g: ConquestGame,
  life: Life,
  c: Character,
  by?: string,
): void {
  const s = g.s;
  const b = life.bondage!;
  const f = c.bond!.fled!;
  const ch = g.touchChar(c);
  ch.bond = {
    ...ch.bond!,
    status: f.was,
    at: b.home,
    fled: { ...f, out: by ? "returned" : "taken" },
    grief: s.day + 240,
    mood: Math.max(0, ch.bond!.mood - 15),
    ...(f.was === "indenture" && ch.bond!.until
      ? { until: ch.bond!.until + 2 * (s.day - f.day) + 60 }
      : {}),
  };
  note(b, { day: s.day, k: "taken", c: c.id });
  withFlow(
    g,
    { key: "bond:taken", label: "Fees: a freedom seeker taken up" },
    () => spend(g, life, 2),
  );
  if (b.policy.punish === 2)
    for (const x of people(g, life))
      g.touchChar(x).bond = { ...x.bond!, mood: Math.max(0, x.bond!.mood - 6) };
  journal(
    g,
    life,
    `${bondName(c)} is ${by ?? "taken up by a patrol"} and brought back to you; the county's fees for it are 2 coins.${f.was === "indenture" ? " The law adds the time away, twice over, to the indenture." : ""}`,
    "bad",
  );
}

function rising(g: ConquestGame, life: Life, salt: number): void {
  const s = g.s;
  const map = g.map;
  const p = riseChance(s, map, life).total;
  if (!p || !bdice(s, salt ^ 0x215e).chance(p)) return;
  const b = life.bondage!;
  const rng = bdice(s, salt ^ 0x215f);
  const adults = heldAdults(s, life).sort(
    (a, c) => a.bond!.mood - c.bond!.mood,
  );
  const betrayed = rng.next() < RISE_OUTCOMES[0].p;
  const leaders = adults.slice(
    0,
    Math.max(1, Math.min(3, Math.round(adults.length / 4))),
  );
  if (betrayed) {
    for (const c of leaders) {
      kill(g, c, "condemned by the colony's court for a plot to rise");
      note(b, { day: s.day, k: "plot", c: c.id });
    }
    for (const x of people(g, life))
      g.touchChar(x).bond = {
        ...x.bond!,
        grief: s.day + 300,
        mood: Math.max(0, x.bond!.mood - 10),
      };
    journal(
      g,
      life,
      `A plot to rise in your household is found out before it begins. The colony's court tries ${leaders.map((x) => bondName(x)).join(", ")}, and condemns ${leaders.length === 1 ? "him" : "them"}.`,
      "bad",
    );
    raiseEvent(g, life, "bond-rising", { k: 0, n: leaders.length });
    addStress(g, life, 12);
    return;
  }
  // They rise: the barns burn, and they go, the bitterest first, with their families.
  const going = new Set<number>();
  for (const c of adults)
    if (c.bond!.mood < 45 || leaders.includes(c)) going.add(c.id);
  for (const id of [...going]) {
    const c = s.chars[id];
    for (const k of c.children)
      if (s.chars[k]?.alive && isBound(s.chars[k])) going.add(k);
    if (s.chars[c.spouse]?.alive && isBound(s.chars[c.spouse]))
      going.add(c.spouse);
  }
  const damage = 8 + rng.int(0, 12);
  withFlow(
    g,
    { key: "bond:rising", label: "A rising: barns and stores burnt" },
    () => spend(g, life, damage),
  );
  if (life.prov === b.home && !life.travel && rng.chance(0.5))
    hurt(g, life, 10 + rng.int(0, 10), "the night your household rose");
  let free = 0;
  let lost = 0;
  const refs = refugeOdds(s, map, life);
  const best = refs.sort((a, c) => c.free - a.free)[0];
  for (const id of going) {
    const c = s.chars[id];
    const was = c.bond!.status === "indenture" ? "indenture" : "held";
    g.touchChar(c).bond = {
      ...c.bond!,
      status: "fled",
      fled: { day: s.day, to: best?.to ?? "nations", was, due: s.day },
    };
    if (rng.chance((best?.free ?? 0.3) * 0.7)) {
      reachedFreedom(g, life, c);
      free++;
    } else {
      kill(g, c, "killed by the militia, or condemned after the rising");
      b.people = b.people.filter((x) => x !== id);
      lost++;
    }
  }
  note(b, { day: s.day, k: "rose", n: going.size });
  journal(
    g,
    life,
    `Your household rises in the night: the barns and the tobacco house burn, and ${plural(going.size, "person", "people")} go, making for ${best ? REFUGE_NAMES[best.to] : "freedom"}. The militia is called out. ${free ? `${free} ${free === 1 ? "gets" : "get"} clear` : "None get clear"}${lost ? `; ${lost} ${lost === 1 ? "is" : "are"} killed, or condemned by the court` : ""}.`,
    "bad",
  );
  addStress(g, life, 20);
  addRenown(g, life, -2);
  raiseEvent(g, life, "bond-rising", { k: 1, n: going.size, f: free });
}

/** Indentures served: freedom dues, and a free person in the world. */
function servedOut(g: ConquestGame, life: Life): void {
  const s = g.s;
  for (const c of people(g, life)) {
    if (c.bond!.status !== "indenture" || (c.bond!.until ?? Infinity) > s.day)
      continue;
    withFlow(g, { key: "bond:dues", label: "Freedom dues" }, () =>
      spend(g, life, FREEDOM_DUES),
    );
    setFree(g, life, c, "the indenture served");
    note(life.bondage!, { day: s.day, k: "served", c: c.id });
    journal(
      g,
      life,
      `${bondName(c)}'s indenture is served. You pay the freedom dues (${FREEDOM_DUES} coins: clothes, tools, a barrel of corn), and ${c.female ? "she" : "he"} goes free.`,
    );
  }
}

/** Someone who has saved their price asks to buy their freedom. */
function askToBuy(g: ConquestGame, life: Life): void {
  const s = g.s;
  for (const c of people(g, life)) {
    if (!isHeld(c) || (c.bond!.saved ?? 0) < selfPrice(s, g.map, life, c))
      continue;
    const key = `bond:ask:${c.id}`;
    if ((life.cooldowns[key] ?? 0) > s.day) continue;
    life.cooldowns[key] = s.day + 365;
    raiseEvent(g, life, "bond-buyfree", { c: c.id });
    return;
  }
}

function settlePetitions(g: ConquestGame, life: Life): void {
  const s = g.s;
  const b = life.bondage!;
  const list = b.petitions ?? [];
  if (!list.length) return;
  const keep = [];
  for (const pet of list) {
    if (pet.due > s.day) {
      keep.push(pet);
      continue;
    }
    const c = s.chars[pet.c];
    if (!c?.alive || !isHeld(c)) continue;
    const granted = bdice(s, hashOf(c.id, pet.day, 0x9e7)).chance(pet.odds);
    if (granted) {
      const fc = freeCost(s, g.map, life);
      setFree(
        g,
        life,
        c,
        pet.will ? "by will, with the council's licence" : "by petition",
      );
      if (fc.rule.leave) {
        withFlow(g, { key: "bond:free", label: "Fees: freeing someone" }, () =>
          spend(g, life, fc.passage),
        );
        const away = refugeHome(g, "north", b.home);
        if (away !== undefined) becomeLocal(g, g.touchChar(c), away);
      }
      journal(
        g,
        life,
        `${pet.who.replace(/^\w/, (m) => m.toUpperCase())} grant${pet.who.startsWith("the") ? "" : "s"} the petition: ${bondName(c)} is free.`,
        "good",
      );
    } else {
      g.touchChar(c).bond = {
        ...c.bond!,
        mood: Math.max(0, c.bond!.mood - 12),
      };
      note(b, { day: s.day, k: "denied", c: c.id });
      journal(
        g,
        life,
        `${pet.who.replace(/^\w/, (m) => m.toUpperCase())} refuse${pet.who.startsWith("the") ? "" : "s"} the petition to free ${bondName(c)}${c.bond!.merit ? "" : ": no meritorious service was shown"}.`,
        "bad",
      );
    }
  }
  b.petitions = keep;
}

function payAllowances(g: ConquestGame, life: Life): void {
  const s = g.s;
  const b = life.bondage!;
  const list = (b.allowance ?? []).filter((id) => s.chars[id]?.alive);
  if (list.length !== (b.allowance ?? []).length) b.allowance = list;
  for (const id of list) {
    const c = s.chars[id];
    withFlow(
      g,
      {
        key: `bond:allow:${id}`,
        label: `Allowance to ${bondName(c)}, freed (the act of 1712)`,
      },
      () => spend(g, life, allowanceOf()),
    );
  }
}

/** Once a year the town may call on a bond given for someone freed who has come to want. */
function callBonds(g: ConquestGame, life: Life): void {
  const s = g.s;
  const b = life.bondage!;
  if (!b.bonds?.length || dateOf(s.day).month !== 0) return;
  b.bonds = b.bonds.filter((x) => s.chars[x.c]?.alive);
  for (const x of b.bonds) {
    const c = s.chars[x.c];
    const age = ageOf(s, c);
    const p = age >= 60 ? 0.15 : age >= 50 ? 0.06 : 0.02;
    if (!bdice(s, hashOf(c.id, 0xb0d5)).chance(p)) continue;
    const sum = Math.round(x.sum / 4);
    withFlow(
      g,
      { key: "bond:security", label: "The town calls on a bond" },
      () => spend(g, life, sum),
    );
    journal(
      g,
      life,
      `${bondName(c)}, whom you freed, has come to want in ${c.female ? "her" : "his"} age: the town calls on your bond for ${sum} coins.`,
    );
  }
}

/** Family held on other estates live their own lives (and die of age, in time). */
function familyElsewhere(g: ConquestGame, life: Life, salt: number): void {
  const s = g.s;
  const seen = new Set<number>();
  for (const c of people(g, life))
    for (const f of familyAway(s, c)) {
      if (seen.has(f.id) || f.bond?.seat || !f.bond || f.bond.status !== "held")
        continue;
      seen.add(f.id);
      const age = ageOf(s, f);
      const p = age < 50 ? 0.002 : age < 65 ? 0.006 : 0.02;
      if (!bdice(s, salt ^ hashOf(f.id, 0xe15e)).chance(p)) continue;
      kill(g, f, `a fever at ${age}`);
      for (const x of people(g, life))
        if (
          x.spouse === f.id ||
          x.mother === f.id ||
          x.father === f.id ||
          f.children.includes(x.id)
        )
          g.touchChar(x).bond = { ...x.bond!, grief: s.day + 300 };
      journal(
        g,
        life,
        `Word comes from ${g.map.provinces[f.bond.at]?.name ?? "another estate"} that ${bondName(f)}, ${c.first}'s ${kinWord(c, f)}, has died.`,
        "bad",
      );
    }
}

function kinWord(c: Character, f: Character): string {
  if (c.spouse === f.id) return f.female ? "wife" : "husband";
  if (c.mother === f.id) return "mother";
  if (c.father === f.id) return "father";
  if (c.children.includes(f.id)) return f.female ? "daughter" : "son";
  return "kin";
}

// ---------------------------------------------------------------- an heir, and the end of a line

/**
 * The holder has died and an heir takes up the line: those named in the
 * will are freed as the law then allows (or the executors petition for
 * them); the rest pass to the heir, as the law treated them.
 */
function bondHeir(g: ConquestGame, life: Life, heir: Character): void {
  const s = g.s;
  const b = life.bondage;
  if (!b) return;
  executeWill(g, life);
  const rest = people(g, life);
  if (rest.length)
    journal(
      g,
      life,
      `${plural(rest.length, "person", "people")} held by the family pass to ${heir.first} with the estate${bondLaw(s, g.map, b.home).colony === "virginia" && dateOf(s.day).year >= 1705 ? ", as real estate under Virginia's code of 1705" : ""}.`,
    );
}

hooks.heir.push(bondHeir);

/** Free those the will names: by deed, or a petition by the executors, or not at all. */
function executeWill(g: ConquestGame, life: Life): void {
  const s = g.s;
  const b = life.bondage!;
  const named = people(g, life).filter((c) => c.bond!.will && isHeld(c));
  if (!named.length) return;
  const fc = freeCost(s, g.map, life);
  const r = fc.rule;
  for (const c of named) {
    g.touchChar(c).bond = { ...c.bond!, will: undefined };
    delete c.bond!.will;
    if (!r.will || r.kind === "none") {
      g.touchChar(c).bond = {
        ...c.bond!,
        mood: Math.max(0, c.bond!.mood - 25),
        grief: s.day + 300,
      };
      journal(
        g,
        life,
        `The will's freeing of ${bondName(c)} is void under ${r.law}: ${c.female ? "she" : "he"} passes to the heir.`,
        "bad",
      );
      continue;
    }
    if (r.kind === "petition") {
      const odds = petitionOdds(r.petition!.odds, c);
      (b.petitions ??= []).push({
        c: c.id,
        day: s.day,
        due: s.day + r.petition!.days,
        who: r.petition!.who,
        odds,
        will: true,
      });
      journal(
        g,
        life,
        `As the will asked, the executors petition ${r.petition!.who} to free ${bondName(c)}.`,
      );
      continue;
    }
    if (!freeNow(g, life, c, "by will", true))
      journal(
        g,
        life,
        `The estate can't give the law's security for ${bondName(c)}'s freedom (${fc.need} coins): ${c.female ? "she" : "he"} passes to the heir.`,
        "bad",
      );
  }
}

/** A line that ends with nobody to carry it on: the will, then the rest pass with the estate to kin. */
function settleEndedLines(g: ConquestGame): void {
  const s = g.s;
  for (const life of s.lives) {
    if (!life.watching || !life.bondage) continue;
    const b = life.bondage;
    const list = b.people
      .map((id) => s.chars[id])
      .filter(
        (c): c is Character =>
          !!c?.alive && isBound(c) && c.bond!.seat === life.seat,
      );
    if (!list.length && !b.petitions?.length) continue;
    touchLife(g, life);
    // The will first (the estate's money is in the purse still).
    const fc = freeCost(s, g.map, life);
    for (const c of list) {
      if (
        c.bond!.will &&
        fc.rule.will &&
        fc.rule.kind !== "petition" &&
        fc.rule.kind !== "none" &&
        life.purse >= fc.need
      ) {
        freeNow(g, life, c, "by will", true);
        continue;
      }
      if (c.bond!.status === "indenture") {
        setFree(g, life, c, "the master's death");
        continue;
      }
      g.touchChar(c).bond = {
        ...c.bond!,
        seat: undefined,
        by: -1,
        will: undefined,
      };
      delete c.bond!.seat;
      delete c.bond!.will;
    }
    b.people = [];
    b.petitions = [];
    journal(
      g,
      life,
      "Those your family held pass with the estate to kin in the colony.",
    );
  }
}

hooks.monthEnd.push(settleEndedLines);

/** A child born (by the world's own round) to a woman held: held as she is. */
hooks.birth.push((g, kid, mother) => {
  if (!isHeld(mother)) return;
  const seat = mother.bond!.seat;
  kid.bond = {
    status: "held",
    ...(seat ? { seat } : { by: -1 }),
    at: mother.bond!.at,
    origin: "creole",
    faith: "own",
    health: 70,
    mood: 60,
    sk: { field: 0, house: 0, craft: 0 },
    work: "rest",
    since: g.s.day,
  };
  delete kid.home;
  g.touchChar(kid);
  const life = seat ? g.s.lives.find((l) => l.seat === seat) : undefined;
  if (life?.bondage) {
    touchLife(g, life);
    life.bondage.people.push(kid.id);
  }
});

// ---------------------------------------------------------------- for the scenes

/** A door opened to someone fleeing (another player's choice): hide them, help them on, or send for the constable. */
export function answerDoor(
  g: ConquestGame,
  at: Life,
  c: Character,
  how: "help" | "hide" | "constable",
): void {
  const s = g.s;
  const holder = s.lives.find((l) => l.seat === c.bond?.seat);
  const f = c.bond?.fled;
  if (!holder?.bondage || !f || f.out || c.bond!.status !== "fled") return;
  const ch = g.touchChar(c);
  if (how === "help") {
    ch.bond = { ...ch.bond!, fled: { ...f, aid: (f.aid ?? 0) + 0.15 } };
    secretly(
      g,
      at,
      `You gave ${bondName(c)} bread and a blanket at the back door, and the road north.`,
      "good",
    );
    return;
  }
  if (how === "hide") {
    ch.bond = { ...ch.bond!, fled: { ...f, due: s.day } };
    reachedFreedom(g, holder, c, at.home);
    secretly(
      g,
      at,
      `You hid ${bondName(c)} in the loft until the hue and cry died down. ${c.female ? "She" : "He"} lives free at ${g.map.provinces[at.home].name} now.`,
      "good",
    );
    // Word may get out.
    if (bdice(s, hashOf(c.id, 0x7a1e)).chance(0.2)) {
      const fine = 10;
      withFlow(g, { key: "bond:fine", label: "A fine for harbouring" }, () =>
        spend(g, at, fine),
      );
      journal(
        g,
        at,
        `Word got out that you sheltered someone fleeing their bondage: the justices fine you ${fine} coins under the law.`,
        "bad",
      );
      journal(
        g,
        holder,
        `Word reaches you that ${bondName(c)} was sheltered by ${meOf(s, at) ? `${meOf(s, at)!.first} ${meOf(s, at)!.family}` : "a neighbour"} at ${g.map.provinces[at.home].name}; the justices have fined them.`,
      );
    }
    return;
  }
  ch.bond = { ...ch.bond!, fled: { ...f, due: s.day } };
  takenBack(g, holder, c, "taken up by a neighbour's constable");
  journal(
    g,
    at,
    `You sent for the constable. ${bondName(c)} was taken back to the household ${c.female ? "she" : "he"} fled.`,
  );
  addStress(g, at, 4);
}

// ---------------------------------------------------------------- the ledger

hooks.forecast.push((s, life, w) => bondForecast(s, life, w));

hooks.affairs.push((s, w, life) => {
  const b = life.bondage;
  if (!b || life.c < 0 || life.watching) return [];
  const out: AffairItem[] = [];
  const go = { tab: "estate", sub: "bondage" };
  const list = boundOf(s, life);
  const parts = bondForecast(s, life, w);
  const keep = -(parts.find((x) => x.key === "bond:keep")?.value ?? 0);
  const at = w.map.provinces[b.home]?.name ?? "home";
  const f = fieldsOf(s, w.map, life);
  const fields = parts.find((x) => x.key === "bond:fields");
  if (list.length)
    out.push({
      kind: "property",
      id: "bond:household",
      title: `Your household at ${at}`,
      what: f.workers.length
        ? `${f.workers.length} at work in the fields (${f.acres} acres)`
        : `${plural(list.length, "person", "people")}, none in the fields`,
      status: minded(life) ? "at work" : "unminded",
      ...(f.idle.length
        ? {
            warn: `${f.idle.length} with no fields to work: buy land, or set them to other work`,
          }
        : {}),
      p: b.home,
      due: nextTurn(s.day),
      cost: -keep,
      ...(fields?.chance
        ? {
            expected: {
              value: fields.value,
              lo: fields.chance[0],
              hi: fields.chance[1],
              per: "month" as const,
            },
          }
        : {}),
      go,
    });
  for (const pet of b.petitions ?? []) {
    const c = s.chars[pet.c];
    if (!c) continue;
    out.push({
      kind: "property",
      id: `bond:pet:${pet.c}`,
      title: `A petition to free ${bondName(c)}`,
      what: `before ${pet.who}${pet.will ? ", as your will asked" : ""}`,
      status: "waiting",
      due: pet.due,
      go,
    });
  }
  return out;
});

function minded(life: Life): boolean {
  return !!life.bondage && !life.travel && life.prov === life.bondage.home;
}

/** Every life's household as it stands (for tests and the page). */
export function householdOf(s: GameState, life: Life): Character[] {
  return boundOf(s, life);
}
