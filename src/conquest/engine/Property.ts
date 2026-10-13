// What a character owns: a roof (from a cottage to a mansion, or a lodge to
// a great longhouse), land let to tenants, and a business of their own (the
// farm, the shop, the mill, the press, the ship, the inn) with hired hands,
// who cost wages and bring in takings. Houses and land cost upkeep; gifts to
// the town (a church bell, a school, a mended road, a feast) buy renown.
// Money has somewhere to go, and coming by it takes some doing.

import {
  bestHands,
  bizSettled,
  freshCustom,
  handCount,
  northern,
  propertyInput,
  propertyView,
} from "./Business"; // BUSINESS (r15)
import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import {
  extrasWorth,
  houseCoins,
  houseComforts,
  LEASE_RENT,
  ratesOn,
  SERVANTS,
} from "./HouseRules"; // HOME (r12)
import { setFlow, type FlowTag } from "./LedgerCore"; // LEDGER (r15)
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
  hasKit,
  isNativeChar,
  lifeIsNative,
  meOf,
  no,
  yes,
} from "./LifeQueries";
import {
  BUSINESS_HANDS,
  BUSINESS_UPKEEP,
  ENDOWMENTS,
  EXPAND_COST,
  HAND_WAGE,
  HouseDef,
  HOUSES,
  JOBS,
  LAND_LOT,
  LODGES,
  SHIP_UPKEEP_MULT,
} from "./LifeRules";
import { ageOf, charName } from "./Queries";
import { addFavor } from "./Standing"; // POLLS (r16)
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
  return Math.max(0, (BUSINESS_HANDS[pr.level] ?? 0) - handCount(pr)); // BUSINESS (r15): hands from the town too
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
  /** HOME (r12): a particular house (1 cottage to 4 mansion), else the next one up. */
  want?: number,
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
  // HOME (r12): a house you rent is no house of your own: you can buy it.
  const have = ownedHouse(life, life.prov);
  const level = have?.level ?? 0;
  const next = defs[(want ?? level + 1) - 1] ?? null;
  if (!next)
    return { check: no("You have the finest house there is."), next, level };
  if (want !== undefined && want <= level)
    return {
      check: no(
        want === level
          ? "That's the house you have."
          : "You have a better one.",
      ),
      next,
      level,
    };
  const cost = housePrice(s, life, want);
  if (life.purse < cost)
    return { check: no(`${next.name}: ${cost} coins.`), next, level };
  return { check: yes, next, level };
}

/** HOME (r12): a house here you own (not one you rent). */
export function ownedHouse(life: Life, p: number): Property | undefined {
  const h = houseOf(life, p);
  return h && !h.leased ? h : undefined;
}

/** The price of the next house here (or a given one), less half the old one's worth. */
export function housePrice(s: GameState, life: Life, want?: number): number {
  const defs = houseDefs(lifeIsNative(s, life));
  const have = ownedHouse(life, life.prov);
  const level = have?.level ?? 0;
  const next = defs[(want ?? level + 1) - 1];
  if (!next) return 0;
  return next.cost - (have ? Math.round(defs[level - 1].cost * 0.5) : 0);
}

/** Buy a house here, or a better one; your household moves here with you. */
export function buyHouse(
  g: ConquestGame,
  life: Life,
  /** HOME (r12): straight to a given house, else the next one up. */
  want?: number,
): string | null {
  const s = g.s;
  const v = houseCheck(s, life, want);
  if (!v.check.ok) return v.check.why;
  const cost = housePrice(s, life, want);
  const list = props(g, life);
  let house = houseOf(life, life.prov);
  spend(g, life, cost);
  const def = v.next!;
  const here = g.map.provinces[life.prov].name;
  if (house) {
    const rented = !!house.leased;
    // The house bought: as asked, or the next one up from the one you own
    // (a house you only rent counts for nothing).
    house.level = want ?? v.level + 1;
    house.name = def.name;
    delete house.leased;
    house.let = null;
    journal(
      g,
      life,
      rented
        ? `You buy a ${def.name.toLowerCase()} at ${here} for ${cost} coins, and give up the one you rented.`
        : `You move into a ${def.name.toLowerCase()} at ${here}, for ${cost} coins and the old place.`,
      "good",
    );
  } else {
    house = {
      id: g.nextId(),
      kind: "house",
      prov: life.prov,
      level: want ?? 1,
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
  moveHousehold(g, life);
  return null;
}

/** HOME (r12): your household comes to live where you are. */
export function moveHousehold(g: ConquestGame, life: Life): void {
  const s = g.s;
  if (life.home === life.prov) return;
  const here = g.map.provinces[life.prov].name;
  touchLife(g, life).home = life.prov;
  const me = meOf(s, life)!;
  g.touchChar(me).home = life.prov;
  for (const id of [me.spouse, ...me.children]) {
    const c = s.chars[id];
    if (c?.alive && !c.abroad && (id === me.spouse || ageOf(s, c) < 21))
      g.touchChar(c).home = life.prov;
  }
  journal(g, life, `Your household moves to ${here}.`);
  milestone(g, life, "moved", `Made a new home at ${here}`, life.prov, {
    quiet: true,
  }); // STORY (r17)
}

/** HOME (r12): rent a house here by the month, rather than buy one. */
export function leaseCheck(s: GameState, life: Life, want: number): Check {
  const v = houseCheck(s, life, want);
  if (!v.next) return v.check;
  if (lifeIsNative(s, life))
    return no("Among your people a lodge is built, not rented.");
  const have = houseOf(life, life.prov);
  if (have && !have.leased) return no("You own a house here already.");
  if (have?.leased && have.level === want) return no("You rent it already.");
  const rent = LEASE_RENT[want - 1];
  if (life.purse < rent * 2)
    return no(`A month in hand and a month's surety: ${rent * 2} coins.`);
  if (!v.check.ok && !/coins/.test(v.check.why)) return v.check;
  return yes;
}

export function leaseHouse(
  g: ConquestGame,
  life: Life,
  want: number,
): string | null {
  const s = g.s;
  const check = leaseCheck(s, life, want);
  if (!check.ok) return check.why;
  const def = houseDefs(false)[want - 1];
  const rent = LEASE_RENT[want - 1];
  spend(g, life, rent);
  const here = g.map.provinces[life.prov].name;
  let house = houseOf(life, life.prov);
  if (house) {
    house.level = want;
    house.name = def.name;
  } else {
    house = {
      id: g.nextId(),
      kind: "house",
      prov: life.prov,
      level: want,
      hands: [],
      since: s.day,
      name: def.name,
      leased: true,
    };
    props(g, life).push(house);
  }
  journal(
    g,
    life,
    `You take a ${def.name.toLowerCase()} at ${here} on a lease: ${rent} coins a month, the first paid now.`,
    "good",
  );
  moveHousehold(g, life);
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
  // BUSINESS (r15): it opens with the town's custom reckoned, and the hands
  // that pay taken on from the town (it used to open with none, and only cost).
  pr.biz = {
    custom: freshCustom(g.s, g.w, job.prov, job.kind, { prop: pr.id }),
    north: northern(g.w, job.prov),
    auto: true,
  };
  const start = bestHands({ ...propertyInput(g.s, life, pr), month: -1 });
  if (start > 0) {
    pr.biz.extra = start;
    journal(
      g,
      life,
      `${start === 1 ? "A hand" : `${start} hands`} from the town come${start === 1 ? "s" : ""} to work at your ${name}, at ${HAND_WAGE} coins a month${start === 1 ? "" : " each"}.`,
    );
  }
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
  // BUSINESS (r15): a hand taken on by name takes a town hand's place.
  if ((BUSINESS_HANDS[pr.level] ?? 0) - pr.hands.length <= 0)
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
  // BUSINESS (r15): a hand from the town makes way for them, if it's full.
  if (handCount(pr) > (BUSINESS_HANDS[pr.level] ?? 0) && pr.biz?.extra) {
    pr.biz.extra--;
    if (!pr.biz.extra) delete pr.biz.extra;
  }
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

/**
 * LEDGER (r15): what a property would sell for (half of what it cost; land
 * 0.7 of it), so the Sell button can say so. sellProperty pays exactly this.
 */
export function propertyWorth(s: GameState, life: Life, pr: Property): number {
  if (pr.kind === "house") {
    const native = lifeIsNative(s, life);
    const defs = houseDefs(native);
    return pr.leased
      ? 0
      : Math.round(defs[pr.level - 1].cost * 0.5) + extrasWorth(pr, native);
  }
  if (pr.kind === "land") return Math.round(pr.level * LAND_LOT.cost * 0.7);
  return 20 + EXPAND_COST.slice(0, pr.level).reduce((a, b) => a + b, 0) * 0.5;
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
  if (pr.kind === "house") {
    // HOME (r12): what's stored there comes out first; rooms and furniture go with it.
    if (Object.values(pr.store ?? {}).some((v) => (v ?? 0) > 0))
      return "Take out what you keep there first.";
  } else if (
    pr.kind !== "land" &&
    life.job?.own &&
    life.job.prov === pr.prov &&
    life.job.place === pr.place
  )
    return "You work it yourself: give up the trade first.";
  const worth = propertyWorth(g.s, life, pr); // LEDGER (r15): one reckoning
  for (const h of [...pr.hands]) dismissHand(g, life, h);
  touchLife(g, life);
  life.property = propertyOf(life).filter((x) => x !== pr);
  earn(g, life, worth);
  journal(
    g,
    life,
    pr.leased
      ? `You give up the lease on the ${pr.name.toLowerCase()}.`
      : `You sell the ${pr.name.toLowerCase()} for ${worth} coins.`,
  );
  // STORY (r17): a business (or a great house) sold is in the story.
  if (
    !pr.leased &&
    (pr.kind === "business" || (pr.kind === "house" && pr.level >= 3))
  )
    milestone(
      g,
      life,
      pr.kind === "business" ? "business" : "moved",
      `Sold the ${pr.name.toLowerCase()} at ${g.map.provinces[pr.prov]?.name ?? "home"} for ${worth} coins`,
      pr.prov,
      { quiet: true },
    );
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
  addFavor(g, life, e.favor); // POLLS (r16): on the curve
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

/** Rates on a house a month (colonists' towns levy them; villages don't). */
export function houseRates(s: GameState, life: Life, pr: Property): number {
  return ratesOn(pr, lifeIsNative(s, life)); // HOME (r12): not on a let or rented house
}

/** A business's upkeep a month: repairs, rent of the yard, a ship's caulking. */
export function businessUpkeep(pr: Property): number {
  return (
    (BUSINESS_UPKEEP[pr.level] ?? 0) *
    (pr.job === "sailor" ? SHIP_UPKEEP_MULT : 1)
  );
}

/** A month of property: upkeep, rates, rents, wages, takings and duties. */
export function propertyBudget(s: GameState, life: Life): Breakdown {
  const e = new Explain();
  const native = lifeIsNative(s, life);
  for (const pr of propertyOf(life)) {
    if (pr.kind === "house") {
      const def = houseDefs(native)[pr.level - 1];
      if (def && !pr.leased)
        e.add(`Upkeep: ${def.name.toLowerCase()}`, -def.upkeep);
      const rates = houseRates(s, life, pr);
      if (rates) e.add(`Rates: ${pr.name.toLowerCase()}`, -rates);
      // HOME (r12): rooms, servants, rent paid and taken, the kitchen garden.
      houseCoins(e, pr, {
        native,
        home: pr.prov === life.home,
        horse: hasKit(s, life, "horse"),
      });
    } else if (pr.kind === "land") {
      e.add(`Rents: ${pr.level * 10} acres`, pr.level * LAND_LOT.rent);
      e.add("Quitrents", -pr.level * LAND_LOT.upkeep);
    } else {
      // BUSINESS (r15): one reckoning for every business (Business.ts).
      const v = propertyView(s, life, pr);
      if (v.upkeep) e.add(`Upkeep: ${pr.name}`, -v.upkeep);
      const paid = v.input.paid ?? v.input.hands;
      if (paid) e.add(`Wages: ${paid} hand${paid === 1 ? "" : "s"}`, -v.wages);
      if (v.takings || v.input.hands)
        e.add(
          `Takings: ${pr.name}${v.master ? " (your own work too)" : ""}`,
          v.takings,
        );
      if (v.excise) e.add("Excise and duties", -v.excise);
    }
  }
  return e.done(1);
}

export function propertyMonthly(g: ConquestGame, life: Life): void {
  const s = g.s;
  const list = propertyOf(life);
  if (!list.length) return;
  touchLife(g, life);
  const native = lifeIsNative(s, life);
  const was = setFlow(g, null); // LEDGER (r15)
  // Hands who've died or gone, and those who won't work unpaid.
  for (const pr of list) {
    if (pr.kind !== "business") continue;
    setFlow(g, propertyFlow(g, pr)); // LEDGER (r15): this property's money
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
    // BUSINESS (r15): hands from the town, paid or gone.
    const st = pr.biz;
    while ((st?.extra ?? 0) > 0 && life.purse < HAND_WAGE) {
      st!.extra = (st!.extra ?? 0) - 1;
      journal(
        g,
        life,
        `A hand has left your ${pr.name}: no wages, no work.`,
        "bad",
      );
    }
    if (st?.extra) spend(g, life, st.extra * HAND_WAGE);
    else if (st) delete st.extra;
    // The month just worked, reckoned as its forecast was (Business.ts).
    const v = propertyView(s, life, pr, {
      days: life.job?.lastWorked, // LEDGER (r15)
      day: s.day - 1,
    });
    if (v.takings > 0) {
      earn(g, life, v.takings);
      if (v.excise) spend(g, life, v.excise);
    }
    spend(g, life, v.upkeep);
    bizSettled(g, life, pr, v, handCount(pr)); // BUSINESS (r15)
  }
  for (const pr of list) {
    setFlow(g, propertyFlow(g, pr)); // LEDGER (r15)
    if (pr.kind === "house") {
      const def = houseDefs(native)[pr.level - 1];
      if (!def) continue;
      spend(g, life, (pr.leased ? 0 : def.upkeep) + houseRates(s, life, pr));
      houseMonth(g, life, pr, native); // HOME (r12)
      if (pr.prov === life.home && !pr.let) {
        if (def.renown) addRenown(g, life, def.renown);
        if (def.stress) addStress(g, life, def.stress);
        if (def.health) heal(g, life, def.health);
        // HOME (r12): the rooms, the furniture and the servants.
        const me = meOf(s, life);
        const kids = (me?.children ?? []).filter((k) => {
          const c = s.chars[k];
          return !!c?.alive && ageOf(s, c) < 12;
        }).length;
        const fx = houseComforts(pr, { native, kids });
        if (fx.renown) addRenown(g, life, fx.renown);
        if (fx.stress) addStress(g, life, fx.stress);
        if (fx.health) heal(g, life, fx.health);
      }
    } else if (pr.kind === "land") {
      // Good harvests and bad: the tenants pay what they can.
      const year = 0.6 + g.rng.next() * 0.8;
      earn(
        g,
        life,
        Math.round(pr.level * (LAND_LOT.rent * year - LAND_LOT.upkeep) * 100) /
          100,
      );
    }
  }
  setFlow(g, was); // LEDGER (r15)
}

/** LEDGER (r15): the name a property's money goes under in the month's books. */
export function propertyFlow(
  g: { map: { provinces: { name: string }[] } },
  pr: Property,
): FlowTag {
  const at = g.map.provinces[pr.prov]?.name ?? "";
  if (pr.kind === "land")
    return {
      key: `p:${pr.id}`,
      label: `Rents less quitrents: ${pr.level * 10} acres at ${at}`,
      chance: true,
      aff: "property",
    };
  const name = pr.name.replace(/^\w/, (m) => m.toUpperCase());
  return {
    key: `p:${pr.id}`,
    label: `${name}${pr.let ? " (let)" : pr.leased ? " (rented)" : ""} at ${at}`,
  };
}

/**
 * HOME (r12): a month of a house's extras: servants who can't be paid
 * leave, then rooms, servants, rent paid and taken and the kitchen garden
 * are settled as the budget says; a tenant may give notice; a lease that
 * can't be paid ends.
 */
function houseMonth(
  g: ConquestGame,
  life: Life,
  pr: Property,
  native: boolean,
): void {
  const s = g.s;
  const name = pr.name.toLowerCase();
  // A lease that can't be paid: out you go.
  if (pr.leased && life.purse < LEASE_RENT[pr.level - 1]) {
    life.property = propertyOf(life).filter((x) => x !== pr);
    journal(
      g,
      life,
      `You can't pay the rent on the ${name}: the landlord has your things put in the street.`,
      "bad",
    );
    addStress(g, life, 8);
    return;
  }
  // Servants who'd go unpaid give notice.
  const wages = () =>
    (pr.servants ?? []).reduce((m, k) => m + SERVANTS[k].wage, 0);
  while ((pr.servants ?? []).length && life.purse < wages()) {
    const gone = pr.servants!.pop()!;
    journal(
      g,
      life,
      `${SERVANTS[gone].name.replace(/^A /, "Your ")} has left: no wages, no work.`,
      "bad",
    );
  }
  const e = new Explain();
  houseCoins(e, pr, {
    native,
    home: pr.prov === life.home,
    horse: hasKit(s, life, "horse"),
  });
  const total = Math.round(e.total * 100) / 100;
  if (total) earn(g, life, total);
  // A tenant may move on.
  if (pr.let && g.rng.chance(0.03)) {
    pr.let = null;
    journal(g, life, `Your tenant at the ${name} has given notice and gone.`);
  }
}
