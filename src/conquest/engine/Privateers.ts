// SEA (r15): the privateering company. In wartime, at a port whose colony
// is at war, a player gets up a company to fit out a privateer: a ship new
// from the yard (or a boat of their own, put in at what she'd fetch), a
// letter of marque from the governor, and the owners' articles. Other
// players subscribe (in person, or by letter when they're asked), and the
// town's merchants will take up what's left. Signed, it's a partnership
// like any other (Firms.ts, the Partnerships page: shares by what each put
// in, the chest, the books, votes, buying out, winding up), holding a ship
// instead of a shop.
//
// Its managing partner sends her on cruises: commanding her in person, or
// with a hired captain; partners who are players sign aboard as officers or
// hands and sail with her on the map (Cruises.ts). Her prizes go to the
// prize court at home: the court's fees, then half to her company by their
// parts and half to the owners, paid out at once by share. The risks: she's
// taken or founders (the company keeps its chest and may buy another
// ship), the peace voids her commission, and a captain who takes a neutral
// makes pirates of them all (her commission's forfeit).

import { BOATS, boatPrice, boatyard, sellPrice } from "./Boats";
import { formatDate } from "./Calendar";
import { CRUISE, GROUND_BY_KEY } from "./CruiseData";
import { chanceOdds, chancesIn, prizeCounts, type CruisePlan } from "./CruiseOdds";
import {
  CRUISE_LOST,
  CRUISE_OWNERS,
  cruiseById,
  enemiesOf,
  groundFlags,
  groundsFrom,
  marqueFee,
  newCruise,
  ownOutfit,
  privateersFitHere,
} from "./Cruises";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { affairNews } from "./Ledger";
import { withFlow } from "./LedgerCore";
import { earn, journal, spend, touchLife } from "./LifeCore";
import {
  type Check,
  isChildLife,
  lifeOfChar,
  meOf,
  no,
  skillLevel,
  yes,
} from "./LifeQueries";
import type { World } from "./Map";
import { chanceWords, type OddsOutcome, type OddsView } from "./Odds";
import { wake } from "./Pace";
import {
  firmById,
  firmLine,
  firmsOf,
  firmsWith,
  managerOf,
  MAX_FIRMS,
  MAX_PARTNERS,
  NPC_MAX_FIRMS,
  partnerIn,
  partners,
  partnersChanged,
} from "./PartnersCore";
import { householdsOf } from "./Folk";
import { charName } from "./Queries";
import { ROLES } from "./LifeRules";
import { aRig, seaChanged, seaOf, seaState } from "./SeaCore";
import type {
  BoatKind,
  Character,
  Cruise,
  Firm,
  FirmPartner,
  GameState,
  Life,
  LifeCommand,
  Part,
  PrivateerFit,
  Subscription,
} from "./Types";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- the numbers

export const COMPANY = {
  /** The least a subscriber puts in. */
  minStake: 5,
  /** A subscription stays open this long. */
  openDays: 45,
  /** Days a company's cruise fits out (time for partners to sign aboard). */
  fitting: 3,
  /** The ships a company may fit out (a privateer wants guns). */
  kinds: ["sloop", "schooner", "brig", "ship"] as BoatKind[],
};

// ---------------------------------------------------------------- who and what

/** The subscriptions open (or lately closed) at a port. */
export function subsAt(s: GameState, p: number): Subscription[] {
  return seaOf(s).subs.filter((x) => x.prov === p && x.status === "open");
}

export function subById(s: GameState, id: number): Subscription | undefined {
  return seaOf(s).subs.find((x) => x.id === id);
}

/** The privateering companies a character is a partner in. */
export function companiesOf(s: GameState, c: number): Firm[] {
  return firmsWith(s, c).filter((f) => f.hold === "privateer" && !!f.sea);
}

/** Coins put in (a boat counted at what she'd fetch). */
export function subTotal(sub: Subscription): number {
  return r2(sub.stakes.reduce((m, x) => m + x.coins, 0));
}

/** Coins in hand (not a boat). */
function subCash(sub: Subscription): number {
  return r2(sub.stakes.filter((x) => x.boat === undefined).reduce((m, x) => m + x.coins, 0));
}

/** What the company must have in coin to sign: the ship (if new), the commission, a first cruise's victuals. */
export function subNeeded(s: GameState, w: World, sub: Subscription): number {
  const fee = marqueFee(sub.kind);
  const nation = commissionAt(s, w, sub.prov);
  const best = bestGround(s, w, sub.kind, sub.prov, nation);
  const near = groundsFrom(s, w.map, sub.prov, sub.kind).find((x) => x.g.key === best);
  const outfit = ownOutfit(sub.kind, false, CRUISE.hunt.short, near?.days ?? 5);
  return r2((sub.boat === undefined ? sub.price : 0) + fee + outfit);
}

/** The nation whose commission a company at this port would carry, or -1 (no war). */
export function commissionAt(s: GameState, w: World, p: number): number {
  return privateersFitHere(s, w, p);
}

// ---------------------------------------------------------------- the odds

/** A company's cruise, for the odds: a hired captain's skills, or yours if you'd command. */
function companyPlan(
  s: GameState,
  w: World,
  kind: BoatKind,
  port: number,
  nation: number,
  hull: number,
  long: boolean,
  captain?: Life,
  ground?: string,
): { plan: CruisePlan; passage: number; ground: string } | null {
  const near = groundsFrom(s, w.map, port, kind);
  const pick = ground
    ? near.find((x) => x.g.key === ground)
    : (near.find((x) => x.g.key === bestGround(s, w, kind, port, nation)) ?? near[0]);
  if (!pick) return null;
  const foes = enemiesOf(s, nation);
  const sk = (k: "seamanship" | "fighting" | "leadership") =>
    captain ? skillLevel(s, captain, k) : { seamanship: 9, fighting: 8, leadership: 8 }[k];
  return {
    plan: {
      flag: "privateer",
      nation,
      kind,
      guns: BOATS[kind].guns,
      hull,
      ground: pick.g.key,
      hunt: long ? CRUISE.hunt.long : CRUISE.hunt.short,
      sea: sk("seamanship"),
      fight: sk("fighting"),
      lead: sk("leadership"),
      war: foes.size > 0,
      lawful: (n) => foes.has(n),
      flags: groundFlags(s, pick.g),
    },
    passage: pick.days,
    ground: pick.g.key,
  };
}

/**
 * The ground a privateer from here would do best on (most prizes expected,
 * for the passage): where the enemy's ships pass. "" if none is in reach.
 */
export function bestGround(
  s: GameState,
  w: World,
  kind: BoatKind,
  port: number,
  nation: number,
): string {
  const foes = enemiesOf(s, nation);
  let best = "";
  let bestV = -1;
  for (const x of groundsFrom(s, w.map, port, kind)) {
    const plan: CruisePlan = {
      flag: "privateer",
      nation,
      kind,
      guns: BOATS[kind].guns,
      hull: 100,
      ground: x.g.key,
      hunt: CRUISE.hunt.short,
      sea: 9,
      fight: 8,
      lead: 8,
      war: foes.size > 0,
      lawful: (n) => foes.has(n),
      flags: groundFlags(s, x.g),
    };
    const c = chanceOdds(plan);
    const v = (c.prize * c.value * chancesIn(plan.hunt)) / (plan.hunt + x.days * 2);
    if (v > bestV + 1e-9) {
      bestV = v;
      best = x.g.key;
    }
  }
  return best;
}

/**
 * The owners' risk and reward of one cruise (what the company's half comes
 * to), and your part of it at a share: from the same table the cruise rolls.
 */
export function companyOdds(
  s: GameState,
  w: World,
  o: {
    kind: BoatKind;
    port: number;
    nation: number;
    hull?: number;
    long?: boolean;
    /** Your share of the company, 0 to 100. */
    share: number;
    /** What you'd put in. */
    stake: number;
    captain?: Life;
    /** The hunting ground (the best in reach if not given). */
    ground?: string;
  },
): OddsView | null {
  const cp = companyPlan(s, w, o.kind, o.port, o.nation, o.hull ?? 100, !!o.long, o.captain, o.ground);
  if (!cp) return null;
  const { plan, passage } = cp;
  const K = chancesIn(plan.hunt);
  const { counts, taken } = prizeCounts(plan, K);
  const c = chanceOdds(plan);
  const retake = plan.war ? CRUISE.retakeWar : CRUISE.retake;
  // The owners' half of what the court pays; your part of it by share.
  const mine = (1 - CRUISE.court) * CRUISE.owners * (o.share / 100) * (1 - retake);
  const outcomes: OddsOutcome[] = [
    { label: "nothing taken", p: counts[0] ?? 0, lo: 0, hi: 0, bad: true },
  ];
  if ((counts[1] ?? 0) > 0)
    outcomes.push({ label: "one prize", p: counts[1], lo: r1(c.lo * mine), hi: r1(c.hi * mine) });
  const more = counts.slice(2).reduce((m, p) => m + p, 0);
  if (more > 0.001)
    outcomes.push({ label: "two or more", p: more, lo: r1(c.lo * 2 * mine), hi: r1(c.hi * K * mine) });
  const mean = counts.reduce((m, p, n) => m + p * n, 0);
  const expected = r1(mean * c.value * mine);
  const outfit = ownOutfit(o.kind, false, plan.hunt, passage);
  const days = plan.hunt + passage * 2;
  const shipWorth = BOATS[o.kind].price * 0.6;
  return {
    title: `A cruise ${GROUND_BY_KEY.get(cp.ground)?.name ?? ""}: the owners' half, your ${r1(o.share)}%`,
    ok: true,
    costNow: r1(o.stake),
    costMonth: r1((BOATS[o.kind].upkeep * o.share) / 100),
    per: "trip",
    days: [days, days + 10],
    outcomes,
    expected,
    lo: 0,
    hi: r1(c.hi * K * mine),
    net: r1(((expected - (outfit * o.share) / 100) * 30) / Math.max(30, days)),
    risks: [
      {
        label: "She's taken by a man-of-war",
        p: taken,
        note: `the ship lost (your part of her, about ${r1((shipWorth * o.share) / 100)}), the chest kept`,
      },
      { label: "A prize retaken before she makes port", p: retake, note: "each prize sent in" },
      { label: "The peace", p: 0, note: "voids the commission: she can't cruise till the next war" },
    ],
    factors: [
      `The prize court takes ${Math.round(CRUISE.court * 100)} in a hundred; the owners have half of the rest, the company that sails her the other half.`,
      `Each cruise's victuals and powder come from the chest (about ${r1(outfit)} for this one), and her keep in port (${BOATS[o.kind].upkeep} a month).`,
      o.captain
        ? `You command her: your seamanship ${skillLevel(s, o.captain, "seamanship")}, fighting ${skillLevel(s, o.captain, "fighting")}, leadership ${skillLevel(s, o.captain, "leadership")}.`
        : "A hired captain commands her (seamanship 9, fighting 8, leadership 8): a partner who's a good seaman may do better.",
      `Only the enemy's ships are lawful prize; a neutral taken makes pirates of you all.`,
      `${chanceWords(1 - (counts[0] ?? 0))} that a cruise takes at least one prize.`,
    ],
  };
}

// ---------------------------------------------------------------- getting it up

/** Whether you may get up a company here: a port at war, a ship to fit out, room for another firm. */
export function openCheck(
  s: GameState,
  w: World,
  life: Life,
  o: { kind?: BoatKind; boat?: number; stake: number },
): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're grown.");
  if (life.travel) return no("You're on the road.");
  const nation = commissionAt(s, w, life.prov);
  if (nation < 0) return no("Letters of marque are granted only where the colony is at war, at a port.");
  if (firmsWith(s, life.c).length >= MAX_FIRMS)
    return no(`You're in ${MAX_FIRMS} partnerships already.`);
  if (seaOf(s).subs.some((x) => x.by === life.c && x.status === "open"))
    return no("You're getting up a company already.");
  if (o.boat !== undefined) {
    const b = (life.boats ?? []).find((x) => x.id === o.boat);
    if (!b) return no("Not your boat.");
    if (b.prov !== life.prov) return no(`She lies at ${w.map.provinces[b.prov].name}.`);
    if (b.away) return no("She's away with her skipper.");
    if (!BOATS[b.kind].uses.includes("privateering")) return no("She's no privateer.");
    if (b.condition < 50) return no("Repair her first.");
    if (seaOf(s).cruises.some((c) => c.boat?.seat === life.seat && c.boat.id === b.id && c.phase !== "done" && c.phase !== "lost"))
      return no("She's on a cruise.");
    return yes;
  }
  const kind = o.kind;
  if (!kind || !COMPANY.kinds.includes(kind)) return no("Choose a ship.");
  if (!boatyard(s, w, life.prov).includes(kind))
    return no(`The yard here can't build a ${BOATS[kind].name.toLowerCase()}.`);
  if (o.stake < COMPANY.minStake) return no(`Put in ${COMPANY.minStake} at the least.`);
  if (life.purse < o.stake) return no(`You have ${Math.floor(life.purse)}.`);
  return yes;
}

/** Get up a company: open the subscription, with your stake (coins, or your boat). */
export function openCompany(
  g: ConquestGame,
  life: Life,
  o: { kind?: BoatKind; boat?: number; stake: number; name?: string },
): string | null {
  const s = g.s;
  const check = openCheck(s, g.w, life, o);
  if (!check.ok) return check.why;
  const me = meOf(s, life)!;
  const b = o.boat !== undefined ? life.boats!.find((x) => x.id === o.boat)! : undefined;
  const kind = b ? b.kind : o.kind!;
  const price = b ? sellPrice(b) : boatPrice(s, life, kind);
  const shipName = b ? b.name : (o.name?.trim().slice(0, 30) || defaultShipName(s, life));
  const sub: Subscription = {
    id: g.nextId(),
    by: life.c,
    prov: life.prov,
    name: `${me.family}'s privateer company`,
    kind,
    price,
    ...(b ? { boat: b.id } : {}),
    shipName,
    stakes: b ? [{ c: life.c, coins: price, boat: b.id }] : [{ c: life.c, coins: r2(o.stake) }],
    asked: [],
    opened: s.day,
    until: s.day + COMPANY.openDays,
    status: "open",
  };
  if (!b) withFlow(g, stakeFlow(sub), () => spend(g, life, o.stake));
  seaState(g).subs.push(sub);
  seaChanged(g);
  touchLife(g, life);
  journal(
    g,
    life,
    `You get up a company to fit out the ${shipName}, ${BOATS[kind].name.toLowerCase()} of ${BOATS[kind].guns} guns, as a privateer: ${b ? `your own boat put in at ${price} coins` : `${o.stake} coins of your own put in`}. It needs ${subNeeded(s, g.w, sub)} in coin to sign. The subscription is open till ${formatDate(sub.until)}.`,
  );
  return null;
}

/** A stake's money, for the month's books. */
function stakeFlow(sub: Subscription) {
  return { key: `sea:co:${sub.id}`, label: `A share in the ${sub.shipName} (a privateer)`, aff: "firm" as const };
}

const SHIP_NAMES = ["Revenge", "Tartar", "Defiance", "Dragon", "Charming Sally", "Prince Frederick", "Hawke", "Royal Hunter", "Lively", "Speedwell", "Fame", "Terrible"];

function defaultShipName(s: GameState, life: Life): string {
  return SHIP_NAMES[(life.c + s.day) % SHIP_NAMES.length];
}

/** Whether you may put money into a company being got up. */
export function joinCheck(s: GameState, w: World, life: Life, sub: Subscription | undefined, coins: number): Check {
  if (!sub || sub.status !== "open") return no("The subscription's closed.");
  if (!meOf(s, life) || life.watching) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're grown.");
  if (sub.stakes.some((x) => x.c === life.c)) return no("You've put in already.");
  if (life.prov !== sub.prov && !sub.asked.includes(life.c))
    return no(`It's got up at ${w.map.provinces[sub.prov].name}: be there, or be asked.`);
  if (sub.stakes.length >= MAX_PARTNERS) return no(`${MAX_PARTNERS} owners is as many as it can hold.`);
  if (firmsWith(s, life.c).length >= MAX_FIRMS) return no(`You're in ${MAX_FIRMS} partnerships already.`);
  if (!Number.isFinite(coins) || coins < COMPANY.minStake) return no(`Put in ${COMPANY.minStake} at the least.`);
  if (life.purse < coins) return no(`You have ${Math.floor(life.purse)}.`);
  return yes;
}

/** Put money into a company being got up (taken now; given back if it never signs). */
export function joinCompany(g: ConquestGame, life: Life, id: number, coins: number): string | null {
  const s = g.s;
  const sub = subById(s, id);
  const check = joinCheck(s, g.w, life, sub, coins);
  if (!check.ok) return check.why;
  coins = r2(coins);
  withFlow(g, stakeFlow(sub!), () => spend(g, life, coins));
  sub!.stakes.push({ c: life.c, coins });
  seaChanged(g);
  journal(g, life, `You put ${coins} coins into the ${sub!.shipName}, a privateer being fitted out at ${g.map.provinces[sub!.prov].name}.`);
  const by = lifeOfChar(s, sub!.by);
  if (by && by !== life) {
    journal(g, by, `${charName(meOf(s, life))} puts ${coins} coins into the ${sub!.shipName}.`, "good");
    wake(g, by, `${charName(meOf(s, life))} has subscribed.`);
  }
  return null;
}

/** Ask another player's character to subscribe (a letter: they may put in from wherever they are). */
export function askToJoin(g: ConquestGame, life: Life, id: number, c: number): string | null {
  const s = g.s;
  const sub = subById(s, id);
  if (!sub || sub.status !== "open") return "The subscription's closed.";
  if (sub.by !== life.c) return "It's not your company.";
  const them = lifeOfChar(s, c);
  if (!them || them.watching || them === life) return "Choose another player.";
  if (sub.asked.includes(c) || sub.stakes.some((x) => x.c === c)) return "They've been asked.";
  sub.asked.push(c);
  seaChanged(g);
  raiseEvent(g, them, "sea-sub-invite", { c: life.c, sub: id });
  journal(g, life, `You write to ${charName(s.chars[c])} asking them to take a share in the ${sub.shipName}.`);
  return null;
}

/** The richest merchant of the town nobody plays, who'd take up a share. */
export function townMerchant(s: GameState, sub: Subscription): Character | undefined {
  return householdsOf(s, sub.prov)
    .filter(
      (c) =>
        c.alive &&
        !lifeOfChar(s, c.id) &&
        !sub.stakes.some((x) => x.c === c.id) &&
        !!c.role &&
        ROLES[c.role].wealth >= 30 &&
        firmsWith(s, c.id).length < NPC_MAX_FIRMS,
    )
    .sort((a, b) => ROLES[b.role!].wealth - ROLES[a.role!].wealth || a.id - b.id)[0];
}

/** The town's merchants take up what's still wanting (one of them, as a silent owner). */
export function merchantsTakeUp(g: ConquestGame, life: Life, id: number): string | null {
  const s = g.s;
  const sub = subById(s, id);
  if (!sub || sub.status !== "open") return "The subscription's closed.";
  if (sub.by !== life.c) return "It's not your company.";
  if (sub.stakes.length >= MAX_PARTNERS) return `${MAX_PARTNERS} owners is as many as it can hold.`;
  const want = r2(subNeeded(s, g.w, sub) - subCash(sub));
  if (want <= 0) return "It has what it needs.";
  const m = townMerchant(s, sub);
  if (!m) return "No merchant here has money for it.";
  const coins = Math.max(COMPANY.minStake, Math.ceil(want));
  sub.stakes.push({ c: m.id, coins });
  seaChanged(g);
  journal(g, life, `${charName(m)}, merchant, takes up the rest: ${coins} coins, for a silent share.`);
  return null;
}

/** Whether the company can sign its articles now. */
export function signCheck(s: GameState, w: World, life: Life, sub: Subscription | undefined): Check {
  if (!sub || sub.status !== "open") return no("The subscription's closed.");
  if (sub.by !== life.c) return no("It's not your company.");
  if (life.prov !== sub.prov) return no(`Be at ${w.map.provinces[sub.prov].name}.`);
  if (commissionAt(s, w, sub.prov) < 0) return no("The war's over: no letters of marque are granted.");
  const need = subNeeded(s, w, sub);
  const cash = subCash(sub);
  if (cash < need) return no(`It wants ${need} in coin and has ${cash}.`);
  if (sub.boat !== undefined) {
    const b = (life.boats ?? []).find((x) => x.id === sub.boat);
    if (!b || b.prov !== sub.prov || b.away) return no("Your boat must be here.");
  }
  return yes;
}

/** Sign the owners' articles: the ship bought (or yours put in), her commission taken, the company formed. */
export function signCompany(g: ConquestGame, life: Life, id: number): string | null {
  const s = g.s;
  const sub = subById(s, id);
  const check = signCheck(s, g.w, life, sub);
  if (!check.ok) return check.why;
  const x = sub!;
  const nation = commissionAt(s, g.w, x.prov);
  const total = subTotal(x);
  // Shares by what each put in, to a tenth, summing to a hundred.
  const shares = x.stakes.map((st) => Math.round((st.coins / total) * 1000) / 10);
  const drift = r1(100 - shares.reduce((m, v) => m + v, 0));
  shares[0] = r1(shares[0] + drift);
  let hull = 100;
  if (x.boat !== undefined) {
    const b = life.boats!.find((y) => y.id === x.boat)!;
    hull = b.condition;
    life.boats = life.boats!.filter((y) => y !== b);
    for (const f of life.people ?? []) if (f.task?.kind === "boat" && f.task.boat === b.id) f.task = null;
    touchLife(g, life);
  }
  const fee = marqueFee(x.kind);
  const cost = (x.boat === undefined ? x.price : 0) + fee;
  const f: Firm = {
    id: g.nextId(),
    name: `The ${x.shipName}'s owners`,
    hold: "privateer",
    biz: null,
    prov: x.prov,
    partners: x.stakes.map(
      (st, i): FirmPartner => ({
        c: st.c,
        share: shares[i],
        role: st.c === x.by ? "managing" : "silent",
        capital: r2(st.coins),
        since: s.day,
        drawn: 0,
      }),
    ),
    chest: r2(subCash(x) - cost),
    debt: 0,
    rule: "majority",
    lawyer: -1,
    drafted: -1,
    founded: s.day,
    status: "trading",
    cargo: null,
    books: [],
    decisions: [],
    lines: [],
    sea: {
      ship: x.shipName,
      kind: x.kind,
      guns: BOATS[x.kind].guns,
      hull,
      commission: { nation, day: s.day },
      cruise: -1,
      cruises: 0,
      taken: 0,
      fetched: 0,
      at: x.prov,
      // The ship is capital (her worth is in the firm's assets); the fees are the month's.
      outMonth: fee,
    },
  };
  partners(g).firms.push(f);
  partnersChanged(g, "f");
  x.status = "signed";
  seaChanged(g);
  const foes = [...enemiesOf(s, nation)].map((n) => s.nations[n].name).join(" and ");
  firmLine(
    g,
    f,
    `Owners' articles signed for the ${x.shipName}, ${BOATS[x.kind].name.toLowerCase()} of ${BOATS[x.kind].guns} guns, ${x.boat !== undefined ? `put in by ${charName(s.chars[x.by])}` : `bought for ${x.price}`}; ${aRig(`${s.nations[nation]?.adjective ?? ""} letter`)} of marque against ${foes} (${fee} in fees).`,
  );
  for (const p of f.partners) {
    const l = lifeOfChar(s, p.c);
    if (!l || l.watching) continue;
    affairNews(
      g,
      l,
      "firm",
      `The ${x.shipName}'s owners have signed: your share is ${p.share}%. She has her letter of marque against ${foes}; ${managerOf(f)?.c === p.c ? "send her on a cruise from Work › At sea" : "her managing owner sends her cruising"}.`,
      "good",
    );
  }
  return null;
}

/** Each day: subscriptions that lapse give their money back. */
function subsDaily(g: ConquestGame): void {
  const s = g.s;
  for (const x of s.sea?.subs ?? []) {
    if (x.status !== "open" || s.day <= x.until) continue;
    x.status = "lapsed";
    seaChanged(g);
    for (const st of x.stakes) {
      const l = lifeOfChar(s, st.c);
      if (!l || st.boat !== undefined) continue;
      withFlow(g, stakeFlow(x), () => earn(g, l, st.coins));
      journal(g, l, `The ${x.shipName} never signed her articles: your ${st.coins} coins are given back.`);
    }
  }
  // Old ones forgotten.
  const before = s.sea?.subs.length ?? 0;
  if (s.sea && before)
    s.sea.subs = s.sea.subs.filter((x) => x.status === "open" || s.day - x.until < 60);
  if (s.sea && s.sea.subs.length !== before) seaChanged(g);
}

// ---------------------------------------------------------------- her cruises

/** The company's ship, if she's afloat and in port. */
export function shipInPort(f: Firm): PrivateerFit | null {
  const x = f.sea;
  if (!x || x.lost || x.cruise >= 0) return null;
  return x;
}

/** Whether the managing owner may send her on a cruise now. */
export function cruiseCheck(
  s: GameState,
  w: World,
  life: Life,
  f: Firm | undefined,
  ground: string,
  command: boolean,
): Check {
  if (!f || f.status !== "trading" || !f.sea) return no("No such company.");
  if (managerOf(f)?.c !== life.c) return no("Her managing owner sends her out.");
  const x = f.sea;
  if (x.lost) return no(`The ${x.ship} is lost: buy another ship first.`);
  if (x.cruise >= 0) return no(`The ${x.ship} is at sea.`);
  if (!x.commission || enemiesOf(s, x.commission.nation).size === 0)
    return no("Her letter of marque lapsed with the peace.");
  if (x.hull < 40) return no(`Her hull is at ${Math.round(x.hull)}: she wants repairs first.`);
  if (!groundsFrom(s, w.map, x.at, x.kind).some((gr) => gr.g.key === ground))
    return no("Out of her reach (or out of season).");
  if (command) {
    if (life.travel || life.prov !== x.at) return no(`To command her, be at ${w.map.provinces[x.at].name}.`);
    if (seaOf(s).cruises.some((c) => c.phase !== "done" && c.phase !== "lost" && c.hands.some((h) => h.seat === life.seat)))
      return no("You're bound on another cruise.");
    if (skillLevel(s, life, "seamanship") < 2) return no("Needs seamanship 2 at the least to command her.");
  }
  return yes;
}

/** Send her on a cruise: the outfit from the chest, a hired captain or you in command. */
export function companyCruise(
  g: ConquestGame,
  life: Life,
  id: number,
  ground: string,
  long: boolean,
  command: boolean,
): string | null {
  const s = g.s;
  const f = firmById(s, id);
  const check = cruiseCheck(s, g.w, life, f, ground, command);
  if (!check.ok) return check.why;
  const x = f!.sea!;
  const gd = GROUND_BY_KEY.get(ground)!;
  const passage = groundsFrom(s, g.w.map, x.at, x.kind).find((gr) => gr.g.key === ground)!.days;
  const hunt = long ? CRUISE.hunt.long : CRUISE.hunt.short;
  const outfit = ownOutfit(x.kind, false, hunt, passage);
  if (f!.chest < outfit)
    return `Her victuals and powder are ${outfit} coins; the chest has ${Math.floor(f!.chest)}: call in capital first.`;
  const me = meOf(s, life)!;
  const cr = newCruise(
    g,
    {
      key: `f:${f!.id}`,
      flag: "privateer",
      nation: x.commission!.nation,
      ship: x.ship,
      kind: x.kind,
      guns: x.guns,
      captain: command ? life.c : -1,
      cname: command ? charName(me) : HIRED[(f!.id + x.cruises) % HIRED.length],
      owner: "firm",
      port: x.at,
      ground,
      hunt,
      passage,
      sails: s.day + COMPANY.fitting,
      aboard: [],
    },
    { firm: f!.id, hull: x.hull },
  );
  if (command) cr.hands.push({ seat: life.seat, c: life.c, role: "captain", joined: s.day });
  f!.chest = r2(f!.chest - outfit);
  x.outMonth = r2((x.outMonth ?? 0) + outfit);
  x.cruise = cr.id;
  partnersChanged(g, "f");
  seaChanged(g);
  firmLine(g, f!, `The ${x.ship} fits out for a cruise ${gd.name} (${outfit} for victuals and powder), ${command ? `${charName(me)} in command` : `under ${cr.cname}`}; she sails on ${formatDate(cr.sails)}.`);
  for (const p of f!.partners) {
    const l = lifeOfChar(s, p.c);
    if (!l || l.watching) continue;
    affairNews(
      g,
      l,
      "firm",
      `The ${x.ship} fits out at ${g.map.provinces[x.at].name} for a cruise ${gd.name}, sailing ${formatDate(cr.sails)}${l === life ? "" : ": owners may sign aboard at the quay"}.`,
    );
  }
  return null;
}

const HIRED = ["Captain Josiah Penhallow", "Captain Elias Thorne", "Captain Walter Kemp", "Captain Samuel Fenn", "Captain Thomas Gale", "Captain Ezekiel Dare"];

/** Buy her a new ship (she was lost), from the chest. */
export function buyShip(g: ConquestGame, life: Life, id: number, kind: BoatKind, name?: string): string | null {
  const s = g.s;
  const f = firmById(s, id);
  if (!f?.sea || f.status !== "trading") return "No such company.";
  if (managerOf(f)?.c !== life.c) return "Her managing owner buys for the company.";
  if (!f.sea.lost) return "She's afloat.";
  if (life.prov !== f.prov) return `Be at ${g.map.provinces[f.prov].name}.`;
  if (!COMPANY.kinds.includes(kind) || !boatyard(s, g.w, f.prov).includes(kind)) return "The yard can't build her.";
  const price = BOATS[kind].price;
  if (f.chest < price) return `She's ${price}; the chest has ${Math.floor(f.chest)}: call in capital first.`;
  f.chest = r2(f.chest - price);
  f.sea = {
    ...f.sea,
    ship: name?.trim().slice(0, 30) || SHIP_NAMES[(f.id + s.day) % SHIP_NAMES.length],
    kind,
    guns: BOATS[kind].guns,
    hull: 100,
    cruise: -1,
    at: f.prov,
  };
  delete f.sea.lost;
  partnersChanged(g, "f");
  firmLine(g, f, `A new ship bought for the company: the ${f.sea.ship}, ${BOATS[kind].name.toLowerCase()} of ${BOATS[kind].guns} guns (${price}).`);
  return null;
}

/** Take out a new letter of marque (a new war), from the chest. */
export function companyMarque(g: ConquestGame, life: Life, id: number): string | null {
  const s = g.s;
  const f = firmById(s, id);
  if (!f?.sea || f.status !== "trading") return "No such company.";
  if (managerOf(f)?.c !== life.c) return "Her managing owner takes out her commission.";
  if (life.prov !== f.prov) return `Be at ${g.map.provinces[f.prov].name}.`;
  const nation = commissionAt(s, g.w, f.prov);
  if (nation < 0) return "The colony isn't at war: no letters of marque are granted.";
  if (f.sea.commission && enemiesOf(s, f.sea.commission.nation).size > 0) return "She has her commission.";
  const fee = marqueFee(f.sea.kind);
  if (f.chest < fee) return `The fees are ${fee}; the chest has ${Math.floor(f.chest)}.`;
  f.chest = r2(f.chest - fee);
  f.sea.commission = { nation, day: s.day };
  f.sea.outMonth = r2((f.sea.outMonth ?? 0) + fee);
  partnersChanged(g, "f");
  firmLine(g, f, `A new letter of marque for the ${f.sea.ship} (${fee} in fees).`);
  return null;
}

// ---------------------------------------------------------------- what comes home

/** The firm a cruise belongs to. */
function firmOf(s: GameState, cr: Cruise): Firm | undefined {
  return cr.owner === "firm" && cr.firm !== undefined ? firmById(s, cr.firm) : undefined;
}

/** A partner's flow, for the month's books. */
function prizeFlow(f: Firm) {
  return { key: `firm:${f.id}:prizes`, label: `The ${f.sea?.ship ?? "ship"}'s prizes: your share`, chance: true as const, aff: "firm" as const };
}

// The owners' half: into the chest and out again at once, by share.
CRUISE_OWNERS.push((g, cr, coins) => {
  const s = g.s;
  const f = firmOf(s, cr);
  if (!f?.sea) return;
  const x = f.sea;
  const n = cr.prizes.filter((p) => p.status === "sold" && (p.sold ?? 0) > 0).length;
  x.fetched = r2(x.fetched + coins);
  x.taken += n;
  x.inMonth = r2((x.inMonth ?? 0) + coins);
  let paid = 0;
  for (const p of f.partners) {
    const a = r2((coins * p.share) / 100);
    if (!a) continue;
    paid += a;
    p.drawn = r2(p.drawn + a);
    const l = lifeOfChar(s, p.c);
    if (l && !l.watching) {
      withFlow(g, prizeFlow(f), () => earn(g, l, a));
      affairNews(g, l, "firm", `The ${x.ship}'s prizes are condemned: the owners' half is ${r1(coins)} coins, and your ${p.share}% is ${a}.`, "good");
    }
  }
  f.chest = r2(f.chest + coins - paid);
  firmLine(g, f, `The ${x.ship}'s cruise: ${n} prize${n === 1 ? "" : "s"} condemned; the owners' half, ${r1(coins)}, paid out by share.`);
  partnersChanged(g, "f");
});

// Taken or foundered: the company keeps its chest.
CRUISE_LOST.push((g, cr) => {
  const s = g.s;
  const f = firmOf(s, cr);
  if (!f?.sea) return;
  f.sea.lost = cr.end ?? "Lost.";
  f.sea.cruise = -1;
  f.sea.hull = 0;
  partnersChanged(g, "f");
  firmLine(g, f, `The ${f.sea.ship} is lost: ${f.sea.lost}`);
  for (const p of f.partners) {
    const l = lifeOfChar(s, p.c);
    if (l && !l.watching) {
      affairNews(g, l, "firm", `${f.name}: the ${f.sea.ship} is lost (${f.sea.lost.replace(/\.$/, "")}). The company keeps its chest; it may buy another ship, or wind up.`, "bad");
      wake(g, l, `The ${f.sea.ship} is lost.`);
    }
  }
});

/** Each day: a company's ship home from her cruise (and her commission's state). */
function companiesDaily(g: ConquestGame): void {
  const s = g.s;
  for (const f of firmsOf(s)) {
    const x = f.sea;
    if (!x || f.status !== "trading") continue;
    if (x.cruise >= 0) {
      const cr = cruiseById(s, x.cruise);
      if (!cr || cr.phase === "done") {
        x.cruise = -1;
        x.cruises++;
        if (cr) {
          x.hull = Math.max(1, Math.round(cr.hull));
          x.at = cr.port;
          // A captain who took a neutral made pirates of them: the commission's forfeit.
          if (cr.flag === "pirate" && x.commission) {
            x.commission = null;
            firmLine(g, f, `Her captain took a ship her commission didn't cover: the letter of marque is forfeit.`);
          }
        }
        partnersChanged(g, "f");
      }
    }
    // The peace voids the commission.
    if (x.commission && enemiesOf(s, x.commission.nation).size === 0) {
      x.commission = null;
      partnersChanged(g, "f");
      firmLine(g, f, `The peace: the ${x.ship}'s letter of marque is void.`);
    }
  }
}

/** The company's ship, in its books: her keep in port, prize money and outfits, the call if the chest is bare. */
hooks.firmMonth.push((g, f) => {
  const x = f.sea;
  if (!x) return undefined;
  const keep = x.lost ? 0 : BOATS[x.kind].upkeep;
  f.chest = r2(f.chest - keep);
  const takings = r2(x.inMonth ?? 0);
  const costs = r2((x.outMonth ?? 0) + keep);
  // The bare chest is called from the owners by share.
  if (f.chest < 0) {
    const short = r2(-f.chest);
    for (const p of f.partners) {
      const a = r2((short * p.share) / 100);
      if (!a) continue;
      const l = lifeOfChar(g.s, p.c);
      if (l) {
        spend(g, l, a);
        journal(g, l, `${f.name}: the chest is bare and the ${x.ship}'s keep is due: your part, ${a} coins, is called from you.`, "bad");
      }
    }
    f.chest = 0;
  }
  f.books.push({
    day: g.s.day,
    takings,
    costs,
    profit: r2(takings - costs),
    note: x.lost ? "the ship lost" : x.cruise >= 0 ? "at sea" : "in port",
  });
  if (f.books.length > 24) f.books.splice(0, f.books.length - 24);
  x.inMonth = 0;
  x.outMonth = 0;
  partnersChanged(g, "f");
  return r2(takings - costs);
});

/** What the ship would fetch, for a winding up or a buyout. */
hooks.firmAssets.push((_s, f) => {
  const x = f.sea;
  if (!x || x.lost) return 0;
  return r2(BOATS[x.kind].price * (x.hull / 100) * 0.6);
});

/** LEDGER (r15): your share of her keep when the chest can't pay it, and her prizes by luck. */
hooks.forecast.push((s, life, w) => {
  const out: Part[] = [];
  for (const f of companiesOf(s, life.c)) {
    const p = partnerIn(f, life.c)!;
    const x = f.sea!;
    const keep = x.lost ? 0 : BOATS[x.kind].upkeep;
    const call = Math.max(0, keep - Math.max(0, f.chest));
    if (call > 0)
      out.push({ key: `firm:${f.id}`, label: `${f.name}: her keep, called (${p.share}%)`, value: -r2((call * p.share) / 100) });
    if (!w || x.lost || !x.commission) continue;
    const v = companyOdds(s, w, { kind: x.kind, port: x.at, nation: x.commission.nation, hull: x.hull, share: p.share, stake: 0 });
    if (!v) continue;
    const month = r2((v.expected * 30) / Math.max(30, v.days?.[0] ?? 45));
    if (month > 0)
      out.push({ key: `firm:${f.id}:prizes`, label: `The ${x.ship}'s prizes (${p.share}%)`, value: month, chance: [0, r1(v.hi)] });
  }
  return out;
});

/** LEDGER (r15): the company in the tracker. */
hooks.affairs.push((s, w, life) =>
  companiesOf(s, life.c).map((f) => {
    const p = partnerIn(f, life.c)!;
    const x = f.sea!;
    const cr = x.cruise >= 0 ? cruiseById(s, x.cruise) : undefined;
    const v = !x.lost && x.commission ? companyOdds(s, w, { kind: x.kind, port: x.at, nation: x.commission.nation, hull: x.hull, share: p.share, stake: 0 }) : null;
    return {
      kind: "firm" as const,
      id: `co:${f.id}`,
      title: `The ${x.ship} (${p.share}%)`,
      what: `${BOATS[x.kind].name} of ${x.guns} guns, ${x.commission ? `${s.nations[x.commission.nation]?.adjective ?? ""} letter of marque` : "no commission"}; ${x.cruises} cruise${x.cruises === 1 ? "" : "s"}, ${x.taken} prize${x.taken === 1 ? "" : "s"}, ${r1(x.fetched)} to the owners`,
      status: x.lost ? "lost" : cr ? (cr.phase === "fitting" ? "fitting out" : cr.phase === "selling" ? "the prize court" : "on a cruise") : "in port",
      p: x.at,
      ...(cr ? { due: cr.phase === "selling" ? cr.court : cr.until } : {}),
      ...(x.lost ? { warn: "the ship's lost: buy another, or wind up" } : !x.commission ? { warn: "no letter of marque: she can't cruise" } : {}),
      cost: -r2(((x.lost ? 0 : BOATS[x.kind].upkeep) * p.share) / 100),
      ...(v ? { expected: { value: v.expected, lo: 0, hi: v.hi, per: "trip" as const } } : {}),
      go: { tab: "work", sub: "sea" },
    };
  }),
);

/** The company's commands. */
function companyCommand(g: ConquestGame, life: Life, c: LifeCommand): string | null | undefined {
  if (c.k !== "sea") return undefined;
  switch (c.act) {
    case "co-open":
      return openCompany(g, life, {
        kind: (c.key as BoatKind | undefined) ?? undefined,
        boat: c.id,
        stake: c.arg ?? 0,
        name: c.name,
      });
    case "co-join":
      return joinCompany(g, life, c.id ?? -1, c.arg ?? 0);
    case "co-ask":
      return askToJoin(g, life, c.id ?? -1, c.c ?? -1);
    case "co-merchants":
      return merchantsTakeUp(g, life, c.id ?? -1);
    case "co-sign":
      return signCompany(g, life, c.id ?? -1);
    case "co-cruise":
      return companyCruise(g, life, c.id ?? -1, c.key ?? "", (c.arg ?? 0) > 0, c.name === "command");
    case "co-ship":
      return buyShip(g, life, c.id ?? -1, (c.key ?? "sloop") as BoatKind, c.name);
    case "co-marque":
      return companyMarque(g, life, c.id ?? -1);
  }
  return undefined;
}

hooks.command.push(companyCommand);
hooks.daily.push((g) => {
  subsDaily(g);
  companiesDaily(g);
});

