// What a character owns: a roof (from a cottage to a mansion, or a lodge to
// a great longhouse), land let to tenants, and a business of their own (the
// farm, the shop, the mill, the press, the ship, the inn) with hired hands,
// who cost wages and bring in takings. Houses and land cost upkeep; gifts to
// the town (a church bell, a school, a mended road, a feast) buy renown.
// Money has somewhere to go, and coming by it takes some doing.

import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import {
  addRenown,
  addStress,
  earn,
  heal,
  journal,
  milestone,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import {
  Check,
  isNativeChar,
  lifeIsNative,
  meOf,
  no,
  skillLevel,
  yes,
} from "./LifeQueries";
import {
  BUSINESS_HANDS,
  ENDOWMENTS,
  EXPAND_COST,
  HAND_TAKINGS,
  HAND_WAGE,
  HOUSES,
  HouseDef,
  JOBS,
  LAND_LOT,
  LODGES,
  WORK_DAYS,
} from "./LifeRules";
import { ageOf, charName } from "./Queries";
import type {
  Breakdown,
  Character,
  GameState,
  Job,
  Life,
  Property,
} from "./Types";

export function propertyOf(life: Life): Property[] {
  return life.property ?? [];
}

function props(g: ConquestGame, life: Life): Property[] {
  touchLife(g, life);
  life.property ??= [];
  return life.property;
}

export function houseDefs(native: boolean): HouseDef[] {
  return native ? LODGES : HOUSES;
}

/** Your house in a province (your home, unless you say otherwise). */
export function houseOf(
  life: Life,
  p: number = life.home,
): Property | undefined {
  return propertyOf(life).find((x) => x.kind === "house" && x.prov === p);
}

export function landOf(life: Life, p?: number): Property | undefined {
  return propertyOf(life).find(
    (x) => x.kind === "land" && (p === undefined || x.prov === p),
  );
}

/** Your business here (at this place, if given). */
export function businessOf(
  life: Life,
  p?: number,
  place?: string,
): Property | undefined {
  return propertyOf(life).find(
    (x) =>
      x.kind === "business" &&
      (p === undefined || x.prov === p) &&
      (place === undefined || x.place === place),
  );
}

/** Hands a business has room for still. */
export function handRoom(pr: Property): number {
  return Math.max(0, (BUSINESS_HANDS[pr.level] ?? 0) - pr.hands.length);
}

/** Whose business someone works at as a hand, if anyone's. */
export function handOf(
  s: GameState,
  c: number,
): { life: Life; pr: Property } | undefined {
  for (const life of s.lives)
    for (const pr of life.property ?? [])
      if (pr.kind === "business" && pr.hands.includes(c)) return { life, pr };
  return undefined;
}

// ---------------------------------------------------------------- houses

/** Why nobody settles down here just now: on campaign, or in taken country. */
function unsettled(s: GameState, life: Life): string | null {
  if ((life.job?.army ?? -1) >= 0) return "Not while you march with the army.";
  if ((s.provinces[life.prov]?.occupier ?? -1) >= 0)
    return "Not while the enemy holds the place.";
  return null;
}

/** Whether a house (or a better one) can be had here, and its price. */
export function houseCheck(
  s: GameState,
  life: Life,
): { check: Check; next: HouseDef | null; level: number } {
  const me = meOf(s, life);
  if (!me) return { check: no("You're watching."), next: null, level: 0 };
  if (ageOf(s, me) < 16)
    return { check: no("Not until you're sixteen."), next: null, level: 0 };
  if (life.travel)
    return { check: no("You're on the road."), next: null, level: 0 };
  const away = unsettled(s, life);
  if (away) return { check: no(away), next: null, level: 0 };
  const defs = houseDefs(lifeIsNative(s, life));
  const have = houseOf(life, life.prov);
  const level = have?.level ?? 0;
  const next = defs[level] ?? null;
  if (!next)
    return { check: no("You have the finest house there is."), next, level };
  const cost = next.cost - (have ? Math.round(defs[level - 1].cost * 0.5) : 0);
  if (life.purse < cost)
    return { check: no(`${next.name}: ${cost} coins.`), next, level };
  return { check: yes, next, level };
}

/** The price of the next house here (less half the old one's worth). */
export function housePrice(s: GameState, life: Life): number {
  const defs = houseDefs(lifeIsNative(s, life));
  const have = houseOf(life, life.prov);
  const level = have?.level ?? 0;
  const next = defs[level];
  if (!next) return 0;
  return next.cost - (have ? Math.round(defs[level - 1].cost * 0.5) : 0);
}

/** Buy a house here, or a better one; your household moves here with you. */
export function buyHouse(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const v = houseCheck(s, life);
  if (!v.check.ok) return v.check.why;
  const cost = housePrice(s, life);
  const list = props(g, life);
  let house = houseOf(life, life.prov);
  spend(g, life, cost);
  const def = v.next!;
  const here = g.map.provinces[life.prov].name;
  if (house) {
    house.level++;
    house.name = def.name;
    journal(
      g,
      life,
      `You move into a ${def.name.toLowerCase()} at ${here}, for ${cost} coins and the old place.`,
      "good",
    );
  } else {
    house = {
      id: g.nextId(),
      kind: "house",
      prov: life.prov,
      level: 1,
      hands: [],
      since: s.day,
      name: def.name,
    };
    list.push(house);
    journal(
      g,
      life,
      `You buy a ${def.name.toLowerCase()} at ${here} for ${cost} coins: a roof of your own.`,
      "good",
    );
  }
  if (house.level >= 3)
    milestone(
      g,
      life,
      "renown",
      `Built a ${def.name.toLowerCase()} at ${here}`,
    );
  if (life.home !== life.prov) {
    life.home = life.prov;
    const me = meOf(s, life)!;
    g.touchChar(me).home = life.prov;
    for (const id of [me.spouse, ...me.children]) {
      const c = s.chars[id];
      if (c?.alive && !c.abroad && (id === me.spouse || ageOf(s, c) < 21))
        g.touchChar(c).home = life.prov;
    }
    journal(g, life, `Your household moves to ${here}.`);
  }
  return null;
}

// ---------------------------------------------------------------- land

export function landCheck(s: GameState, life: Life): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (ageOf(s, me) < 16) return no("Not until you're sixteen.");
  if (lifeIsNative(s, life))
    return no("Land isn't bought and sold among your people.");
  if (life.job?.kind === "servant" && (life.job.until ?? 0) > s.day)
    return no("Servants can't own land.");
  const away = unsettled(s, life);
  if (away) return no(away);
  const lots = landOf(life, life.prov)?.level ?? 0;
  if (lots >= LAND_LOT.max) return no("There's no more to be had here.");
  if (life.purse < LAND_LOT.cost)
    return no(`Ten acres cost ${LAND_LOT.cost} coins.`);
  return yes;
}

/** Ten acres more here, let to tenants. */
export function buyLand(g: ConquestGame, life: Life): string | null {
  const check = landCheck(g.s, life);
  if (!check.ok) return check.why;
  spend(g, life, LAND_LOT.cost);
  let land = landOf(life, life.prov);
  if (land) land.level++;
  else {
    land = {
      id: g.nextId(),
      kind: "land",
      prov: life.prov,
      level: 1,
      hands: [],
      since: g.s.day,
      name: "Land",
    };
    props(g, life).push(land);
  }
  journal(
    g,
    life,
    `You buy ten acres at ${g.map.provinces[life.prov].name}: ${land.level * 10} acres now, let to tenants.`,
    "good",
  );
  return null;
}

// ---------------------------------------------------------------- businesses

/** Bought into your own trade: the business is yours now. */
export function openBusiness(g: ConquestGame, life: Life, job: Job): Property {
  const list = props(g, life);
  const have = businessOf(life, job.prov, job.place);
  const name = JOBS[job.kind].business ?? JOBS[job.kind].name.toLowerCase();
  if (have) {
    have.level = Math.min(3, have.level + 1);
    have.name = name;
    return have;
  }
  const pr: Property = {
    id: g.nextId(),
    kind: "business",
    prov: job.prov,
    level: 1,
    job: job.kind,
    place: job.place,
    hands: [],
    since: g.s.day,
    name,
  };
  list.push(pr);
  return pr;
}

export function expandCheck(life: Life, pr: Property | undefined): Check {
  if (!pr || pr.kind !== "business") return no("You have no business to grow.");
  const cost = EXPAND_COST[pr.level];
  if (cost === undefined) return no("It's as big as it gets.");
  if (life.purse < cost) return no(`Growing it costs ${cost} coins.`);
  if (life.prov !== pr.prov) return no("That's done where the business is.");
  return yes;
}

export function expandBusiness(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const pr = propertyOf(life).find((x) => x.id === id);
  const check = expandCheck(life, pr);
  if (!check.ok) return check.why;
  const cost = EXPAND_COST[pr!.level];
  spend(g, life, cost);
  touchLife(g, life);
  pr!.level++;
  journal(
    g,
    life,
    `You put ${cost} coins into the ${pr!.name}: room for ${BUSINESS_HANDS[pr!.level]} hands now.`,
    "good",
  );
  addRenown(g, life, 1);
  return null;
}

/** Whether someone could be taken on as a hand at your business. */
export function hireCheck(s: GameState, life: Life, c: Character): Check {
  const pr = businessOf(life, life.prov);
  if (!pr)
    return no("You'd need a business of your own here to take on hands.");
  if (handRoom(pr) <= 0)
    return no(`Your ${pr.name} has all the hands it can use.`);
  if (ageOf(s, c) < 14) return no("A child.");
  if (handOf(s, c.id)) return no("They work for someone already.");
  if (isNativeChar(s, c) !== lifeIsNative(s, life) && pr.job !== "trapper")
    return no("They wouldn't fit in at your place.");
  return yes;
}

/** Take someone on at your business. */
export function hireHand(
  g: ConquestGame,
  life: Life,
  c: Character,
): string | null {
  const check = hireCheck(g.s, life, c);
  if (!check.ok) return check.why;
  const pr = businessOf(life, life.prov)!;
  touchLife(g, life);
  pr.hands.push(c.id);
  remembers(g, life, g.char(c.id), "Gave me work", 10, 3);
  journal(
    g,
    life,
    `${charName(c)} comes to work at your ${pr.name}, for ${HAND_WAGE} coins a month.`,
    "good",
  );
  return null;
}

export function dismissHand(
  g: ConquestGame,
  life: Life,
  c: number,
): string | null {
  const pr = propertyOf(life).find((x) => x.hands.includes(c));
  if (!pr) return "They don't work for you.";
  touchLife(g, life);
  pr.hands = pr.hands.filter((x) => x !== c);
  const ch = g.s.chars[c];
  if (ch?.alive) remembers(g, life, g.char(c), "Turned me off", -15, 2);
  // A player hand loses their place.
  const other = g.s.lives.find((l) => l.c === c);
  if (other?.job && other.job.employer === life.c) {
    touchLife(g, other).job = null;
    journal(g, other, `${charName(meOf(g.s, life))} has let you go.`, "bad");
  }
  journal(g, life, `You let ${charName(ch)} go.`);
  return null;
}

/** Sell something: half of what it cost. */
export function sellProperty(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const pr = propertyOf(life).find((x) => x.id === id);
  if (!pr) return "You don't own that.";
  if (life.travel) return "Not from the road.";
  let worth: number;
  if (pr.kind === "house") {
    const defs = houseDefs(lifeIsNative(g.s, life));
    worth = Math.round(defs[pr.level - 1].cost * 0.5);
  } else if (pr.kind === "land")
    worth = Math.round(pr.level * LAND_LOT.cost * 0.7);
  else {
    if (
      life.job?.own &&
      life.job.prov === pr.prov &&
      life.job.place === pr.place
    )
      return "You work it yourself: give up the trade first.";
    worth =
      20 + EXPAND_COST.slice(0, pr.level).reduce((a, b) => a + b, 0) * 0.5;
  }
  for (const h of [...pr.hands]) dismissHand(g, life, h);
  touchLife(g, life);
  life.property = propertyOf(life).filter((x) => x !== pr);
  earn(g, life, worth);
  journal(g, life, `You sell the ${pr.name.toLowerCase()} for ${worth} coins.`);
  return null;
}

// ---------------------------------------------------------------- gifts to the town

export function endowCheck(s: GameState, life: Life, what: string): Check {
  const e = ENDOWMENTS[what];
  if (!e) return no("No such gift.");
  if (!meOf(s, life)) return no("You're watching.");
  if ((life.cooldowns[`endow:${what}`] ?? 0) > s.day)
    return no("You gave lately: let them miss you a little.");
  if (life.purse < e.cost) return no(`Costs ${e.cost} coins.`);
  return yes;
}

export function endow(
  g: ConquestGame,
  life: Life,
  what: string,
): string | null {
  const check = endowCheck(g.s, life, what);
  if (!check.ok) return check.why;
  const e = ENDOWMENTS[what];
  spend(g, life, e.cost);
  touchLife(g, life).cooldowns[`endow:${what}`] = g.s.day + 365;
  addRenown(g, life, e.renown);
  life.favor += e.favor;
  addStress(g, life, -4);
  journal(g, life, `${e.label}: ${e.cost} coins. ${e.text}`, "good");
  if (e.cost >= 35)
    milestone(
      g,
      life,
      "renown",
      `${e.label.replace(/^(\w)/, (m) => m.toUpperCase())} at ${g.map.provinces[life.prov].name}`,
    );
  return null;
}

// ---------------------------------------------------------------- the months

/** A month of property: upkeep, rents, wages and takings, a good roof. */
export function propertyBudget(s: GameState, life: Life): Breakdown {
  const e = new Explain();
  const native = lifeIsNative(s, life);
  for (const pr of propertyOf(life)) {
    if (pr.kind === "house") {
      const def = houseDefs(native)[pr.level - 1];
      if (def) e.add(`Upkeep: ${def.name.toLowerCase()}`, -def.upkeep);
    } else if (pr.kind === "land") {
      e.add(
        `Rents: ${pr.level * 10} acres`,
        pr.level * (LAND_LOT.rent - LAND_LOT.upkeep),
      );
    } else if (pr.hands.length) {
      const paid = pr.hands.filter(
        (h) => !s.lives.some((l) => l.c === h),
      ).length;
      if (paid)
        e.add(`Wages: ${paid} hand${paid === 1 ? "" : "s"}`, -paid * HAND_WAGE);
      e.add(`Takings: ${pr.name}`, takings(s, life, pr));
    }
  }
  return e.done(1);
}

function takings(s: GameState, life: Life, pr: Property): number {
  const def = pr.job ? JOBS[pr.job] : null;
  const sk = def ? skillLevel(s, life, def.main) : 5;
  const minding =
    life.job?.own &&
    life.job.prov === pr.prov &&
    (life.job.worked ?? WORK_DAYS) >= WORK_DAYS / 2;
  const per = HAND_TAKINGS * (0.8 + sk / 25) * (minding ? 1 : 0.6);
  return Math.round(per * pr.hands.length * 10) / 10;
}

export function propertyMonthly(g: ConquestGame, life: Life): void {
  const s = g.s;
  const list = propertyOf(life);
  if (!list.length) return;
  touchLife(g, life);
  const native = lifeIsNative(s, life);
  // Hands who've died or gone, and those who won't work unpaid.
  for (const pr of list) {
    if (pr.kind !== "business") continue;
    pr.hands = pr.hands.filter((h) => s.chars[h]?.alive && !s.chars[h].abroad);
    for (const h of [...pr.hands]) {
      const other = s.lives.find((l) => l.c === h);
      if (other) {
        // A player hand who has moved on.
        if (other.job?.employer !== life.c)
          pr.hands = pr.hands.filter((x) => x !== h);
        continue;
      }
      if (life.purse < HAND_WAGE) {
        pr.hands = pr.hands.filter((x) => x !== h);
        remembers(g, life, g.char(h), "Couldn't pay my wages", -20, 3);
        journal(
          g,
          life,
          `${charName(s.chars[h])} has left your ${pr.name}: no wages, no work.`,
          "bad",
        );
        continue;
      }
      spend(g, life, HAND_WAGE);
    }
    const take = takings(s, life, pr);
    if (take > 0) earn(g, life, take);
  }
  for (const pr of list) {
    if (pr.kind === "house") {
      const def = houseDefs(native)[pr.level - 1];
      if (!def) continue;
      spend(g, life, def.upkeep);
      if (pr.prov === life.home) {
        if (def.renown) addRenown(g, life, def.renown);
        if (def.stress) addStress(g, life, def.stress);
        if (def.health) heal(g, life, def.health);
      }
    } else if (pr.kind === "land") {
      earn(
        g,
        life,
        Math.round(pr.level * (LAND_LOT.rent - LAND_LOT.upkeep) * 100) / 100,
      );
    }
  }
}
