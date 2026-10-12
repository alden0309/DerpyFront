// INTRIGUE (r15): weddings planned as events. A proposal accepted is a
// betrothal; then you plan the wedding: the day (the banns read on three
// Sundays, or a licence bought to marry sooner), the place (the church, the
// meeting house, a nuptial mass, at home before the minister, or the council
// fire by the people's own rites), how grand (just the families, or a feast
// for six, twelve or twenty-four), and the guests (anyone, players too). On
// the day it's a gathering played as scenes: the vows, the dowry settled, the
// wedding breakfast, the dancing, the toasts, and a mishap (an objection, a
// drunk uncle, rain). A betrothal can be broken, at a price. And anyone who'd
// rather not make an event of it can still be married quietly before the
// minister, there and then.

import { marry } from "./Characters";
import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import {
  gatheringById,
  gatheringCost,
  invitables,
  invite,
  pushGathering,
} from "./Gatherings";
import { hooks } from "./Hooks";
import { wed } from "./Interactions";
import {
  ADULT_AGE,
  betrothalOf,
  betrothedTo,
  closeKin,
  grown,
  idice,
  intrigue,
  intrigueChanged,
  intrigueOf,
  standing,
} from "./IntrigueCore";
import { withFlow } from "./LedgerCore";
import {
  addRenown,
  addStress,
  earn,
  journal,
  milestone,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import {
  Check,
  hasPlace,
  lifeOfChar,
  meOf,
  no,
  opinionOf,
  peopleHere,
  weddingCost,
  yes,
} from "./LifeQueries";
import type { World } from "./Map";
import { ageOf, charName, hasTrait } from "./Queries";
import { rumour } from "./Rumours";
import type {
  Betrothal,
  Character,
  GameState,
  Gathering,
  Life,
  PlaceKind,
  WeddingRite,
} from "./Types";

export interface RiteDef {
  label: string;
  text: string;
  /** Where it's held (a place the town must have, or your home). */
  venue: PlaceKind;
  /** The banns are read first (three Sundays), unless a licence is bought. */
  banns: boolean;
}

export const RITES: Record<WeddingRite, RiteDef> = {
  church: {
    label: "In church, before the minister",
    text: "The Book of Common Prayer, the ring, the register signed in the vestry.",
    venue: "church",
    banns: true,
  },
  meeting: {
    label: "At the meeting house",
    text: "Intentions published, then the couple declared before the congregation and the magistrate: plain, and binding.",
    venue: "church",
    banns: true,
  },
  mass: {
    label: "A nuptial mass",
    text: "The banns, then the mass and the blessing: incense, Latin, and the whole parish in its best.",
    venue: "church",
    banns: true,
  },
  home: {
    label: "At home, before the minister",
    text: "In your own front room, the minister fetched, the neighbours crowded at the door.",
    venue: "home",
    banns: true,
  },
  fire: {
    label: "At the council fire, by your people's rites",
    text: "The families agree, the gifts are exchanged and the couple's blankets joined, as your people have always done.",
    venue: "councilfire",
    banns: false,
  },
};

export const RITE_KEYS = Object.keys(RITES) as WeddingRite[];

/** How grand: guests, and the scenes the couple play on the day. */
export const TIERS = [
  { name: "Just the families", guests: 4, feast: 0 },
  { name: "Modest", guests: 6, feast: 1 },
  { name: "Handsome", guests: 12, feast: 2 },
  { name: "Grand", guests: 24, feast: 3 },
] as const;

/** A marriage licence, to marry without waiting for the banns. */
export const LICENCE = 4;
/** Three Sundays' banns. */
export const BANNS_DAYS = 21;
/** A betrothal with no wedding planned lapses after this long. */
export const BETROTHAL_DAYS = 730;

export function betrothalById(s: GameState, id: number): Betrothal | undefined {
  return intrigueOf(s).betrothals.find((b) => b.id === id);
}

/** The ways this couple may be married, by your faith. */
export function ritesFor(s: GameState, life: Life): WeddingRite[] {
  const me = meOf(s, life);
  if (!me) return [];
  switch (me.religion) {
    case "native":
      return ["fire"];
    case "catholic":
      return ["mass", "home"];
    case "puritan":
      return ["meeting", "home"];
    default:
      return ["church", "home"];
  }
}

/** Where a rite would be held here (a church, your home, the council fire), or null. */
export function riteVenue(
  s: GameState,
  w: World,
  life: Life,
  rite: WeddingRite,
): PlaceKind | null {
  const def = RITES[rite];
  if (def.venue === "home") return life.home === life.prov ? "home" : null;
  if (hasPlace(s, w, life.prov, def.venue)) return def.venue;
  if (rite === "fire" && hasPlace(s, w, life.prov, "village")) return "village";
  return null;
}

/** What the wedding costs: the minister's fee and the ring, the feast, a licence. */
export function weddingPlanCost(
  s: GameState,
  life: Life,
  venue: PlaceKind,
  tier: number,
  licence: boolean,
  paid = 0,
): { fee: number; feast: number; licence: number; total: number } {
  const fee = weddingCost(s, life);
  const t = TIERS[Math.max(0, Math.min(3, tier))];
  const feast = t.feast ? gatheringCost("wedding", venue, t.feast) : 0;
  const lic = licence ? LICENCE : 0;
  return {
    fee,
    feast,
    licence: lic,
    total: Math.max(0, fee + feast + lic - paid),
  };
}

/** The dowry the bride's (or groom's) family settles at the wedding. */
export function dowryOf(s: GameState, c: Character): number {
  return Math.max(0, standing(s, c) - 1) * 4;
}

/** What breaking it off would cost you: their family's damages. */
export function breachCost(s: GameState, c: Character | undefined): number {
  return c ? 5 + standing(s, c) * 3 : 5;
}

// ---------------------------------------------------------------- promising

/** A proposal accepted: a betrothal, and a wedding to plan. */
export function betroth(
  g: ConquestGame,
  life: Life,
  c: Character,
): string | null {
  const s = g.s;
  const me = meOf(s, life)!;
  const b: Betrothal = {
    id: g.nextId(),
    a: me.id,
    b: c.id,
    since: s.day,
    status: "promised",
  };
  intrigue(g).betrothals.push(b);
  intrigueChanged(g);
  remembers(g, life, g.char(c.id), "Asked for my hand", 15, 3);
  addStress(g, life, -6);
  journal(
    g,
    life,
    `${charName(c)} says yes: you're promised. Plan the wedding (the day, the place, the guests) on Society › Intrigue, or be married quietly before the minister.`,
    "good",
  );
  milestone(g, life, "married", `Betrothed to ${charName(c)}`);
  const other = lifeOfChar(s, c.id);
  if (other)
    journal(
      g,
      other,
      `You're promised to ${charName(me)}. The wedding is theirs to plan, or yours.`,
      "good",
    );
  return null;
}

/** Can they be promised (both free, grown, not kin). */
export function betrothCheck(s: GameState, me: Character, c: Character): Check {
  if (ageOf(s, me) < ADULT_AGE) return no("Not until you're eighteen.");
  if (!grown(s, c)) return no("Not until they're eighteen.");
  if (closeKin(s, me, c)) return no("Too close kin.");
  const mine = betrothalOf(s, me.id);
  if (mine)
    return no(
      `You're promised to ${charName(s.chars[betrothedTo(mine, me.id)])} already.`,
    );
  if (betrothalOf(s, c.id)) return no("They're promised to another.");
  return yes;
}

// ---------------------------------------------------------------- planning the day

export interface PlanView {
  check: Check;
  rites: WeddingRite[];
  venue: PlaceKind | null;
  cost: ReturnType<typeof weddingPlanCost>;
  /** The soonest day (days from now): the banns, or a licence. */
  soonest: number;
  maxGuests: number;
}

export function planView(
  s: GameState,
  w: World,
  life: Life,
  id: number,
  rite: WeddingRite,
  tier: number,
  days: number,
  licence: boolean,
): PlanView {
  const b = betrothalById(s, id);
  const me = meOf(s, life);
  const rites = ritesFor(s, life);
  const venue = RITES[rite] ? riteVenue(s, w, life, rite) : null;
  const banns = RITES[rite]?.banns ?? true;
  const soonest = banns && !licence ? BANNS_DAYS : 3;
  const cost = weddingPlanCost(
    s,
    life,
    venue ?? "church",
    tier,
    licence && banns,
  );
  const maxGuests = TIERS[Math.max(0, Math.min(3, tier))]?.guests ?? 4;
  let check: Check = yes;
  if (!me || !b || (b.a !== me.id && b.b !== me.id))
    check = no("No such promise.");
  else if (b.status !== "promised")
    check = no("The wedding's planned already.");
  else if (life.travel) check = no("Not from the road.");
  else if (!rites.includes(rite)) check = no("Not your church's way.");
  else if (!venue)
    check = no(
      RITES[rite].venue === "home"
        ? "Only at your own home: plan it there."
        : "There's no such place here.",
    );
  else if (!Number.isInteger(tier) || tier < 0 || tier > 3)
    check = no("How grand?");
  else if (!Number.isInteger(days) || days < soonest || days > 120)
    check = no(
      days < soonest
        ? banns
          ? "The banns take three Sundays: three weeks, or buy a licence."
          : "Give the families three days."
        : "Within four months.",
    );
  else {
    const other = s.chars[betrothedTo(b, me.id)];
    if (!other?.alive) check = no("They're gone.");
    else if (life.purse < cost.total)
      check = no(`It will cost ${cost.total} coins.`);
  }
  return { check, rites, venue, cost, soonest, maxGuests };
}

/** Set the day, the place, how grand, and who's asked. */
export function planWedding(
  g: ConquestGame,
  life: Life,
  id: number,
  rite: WeddingRite,
  tier: number,
  days: number,
  licence: boolean,
  guests: number[],
): string | null {
  const s = g.s;
  const v = planView(s, g.w, life, id, rite, tier, days, licence);
  if (!v.check.ok) return v.check.why;
  const b = betrothalById(s, id)!;
  const me = meOf(s, life)!;
  const other = g.char(betrothedTo(b, me.id));
  withFlow(g, { key: "intr:wedding", label: "Your wedding" }, () =>
    spend(g, life, v.cost.total),
  );
  const t = TIERS[tier];
  const gid = g.nextId();
  const scenes = sceneList(s, b, tier, gid);
  const gat: Gathering = {
    id: gid,
    kind: "wedding",
    host: me.id,
    prov: life.prov,
    venue: v.venue!,
    day: s.day + days,
    scale: Math.max(1, t.feast),
    cost: v.cost.total,
    invited: [other.id],
    rsvp: { [other.id]: { yes: true, why: "the bride or groom" } },
    about: [b.a, b.b],
    status: "planned",
    mood: t.feast >= 2 ? 1 : 0,
    played: [],
    turns: {},
    lines: [],
    bet: b.id,
    turnsHost: scenes.length,
  };
  pushGathering(g, gat);
  b.status = "planned";
  b.gat = gat.id;
  b.rite = rite;
  b.tier = tier;
  b.licence = licence && RITES[rite].banns;
  b.day = gat.day;
  b.paid = v.cost.total;
  intrigueChanged(g);
  const can = new Map(invitables(s, g.w, life).map((x) => [x.c.id, x.c]));
  const list = [...new Set(guests)]
    .filter((x) => x !== other.id && can.has(x))
    .slice(0, t.guests);
  for (const x of list) invite(g, life, gat, can.get(x)!);
  touchLife(g, life).cooldowns["wed-feast"] = s.day + 400;
  const where = g.map.provinces[life.prov]?.name ?? "here";
  journal(
    g,
    life,
    `The wedding is set: ${RITES[rite].label.toLowerCase()} at ${where}, in ${days} days${b.licence ? " (by licence)" : RITES[rite].banns ? " (the banns to be read three Sundays)" : ""}. ${t.name}${list.length ? `, ${list.length} asked` : ""}.`,
    "good",
  );
  const ol = lifeOfChar(s, other.id);
  if (ol)
    journal(
      g,
      ol,
      `The day is set: you marry ${charName(me)} at ${where} in ${days} days. Be there.`,
      "good",
    );
  if (RITES[rite].banns && !b.licence)
    rumour(
      g,
      life.prov,
      `The banns are read for ${charName(me)} and ${charName(other)}.`,
      me.id,
      "good",
      false,
      true,
    );
  return null;
}

/** The scenes the couple play on the day, in order: a mishap among them. */
export function sceneList(
  s: GameState,
  b: Betrothal,
  tier: number,
  salt: number,
): string[] {
  const mishap = ["w-objection", "w-uncle", "w-rain"][
    Math.abs((b.id * 7 + salt) | 0) % 3
  ];
  const npc = [b.a, b.b].some((x) => !lifeOfChar(s, x));
  const out: string[] = [];
  if (mishap !== "w-uncle") out.push(mishap);
  out.push("w-vows");
  if (npc) out.push("w-dowry");
  if (tier >= 1) out.push("w-feast");
  if (tier >= 2) out.push("w-dance");
  if (tier >= 3) out.push("w-toasts");
  if (mishap === "w-uncle") out.push(mishap);
  return out;
}

// ---------------------------------------------------------------- the day

/** The vows said: they're married (the money was paid when it was planned). */
export function solemnize(g: ConquestGame, b: Betrothal): boolean {
  const s = g.s;
  if (b.vows) return true;
  const a = s.chars[b.a];
  const c = s.chars[b.b];
  if (!a?.alive || !c?.alive || a.spouse >= 0 || c.spouse >= 0) return false;
  const la = lifeOfChar(s, a.id);
  const lb = lifeOfChar(s, c.id);
  if (la && !lb) wed(g, la, g.char(c.id), { paid: true, dowry: false });
  else if (lb && !la) wed(g, lb, g.char(a.id), { paid: true, dowry: false });
  else if (la && lb) {
    marry(s, g.touchChar(a), g.touchChar(c));
    touchLife(g, lb).home = la.home;
    g.touchChar(c).home = la.home;
    for (const [x, y] of [
      [la, c],
      [lb, a],
    ] as const) {
      touchLife(g, x).tally.marriages++;
      addStress(g, x, -10);
      journal(g, x, `You married ${charName(y)}.`, "good");
      milestone(g, x, "married", `Married ${charName(y)}`);
    }
  } else return false;
  b.vows = true;
  b.status = "wed";
  b.ended = s.day;
  intrigueChanged(g);
  return true;
}

/** The dowry settled: so much of it as is pressed for, or given back. */
export function settleDowry(
  g: ConquestGame,
  life: Life,
  b: Betrothal,
  mult: number,
): number {
  const s = g.s;
  if (b.dowry) return 0;
  b.dowry = true;
  intrigueChanged(g);
  const other = s.chars[betrothedTo(b, life.c)];
  if (!other || lifeOfChar(s, other.id)) return 0;
  const n = Math.round(dowryOf(s, other) * mult);
  if (n > 0)
    withFlow(g, { key: "intr:dowry", label: "A dowry" }, () =>
      earn(g, life, n),
    );
  return n;
}

/** The couple's next scene, or null when they've played them all. */
function coupleTurn(
  g: ConquestGame,
  life: Life,
  gat: Gathering,
  here: Character[],
): { key: string; c: number } | null | undefined {
  if (gat.bet === undefined || !gat.about.includes(life.c)) return undefined;
  const s = g.s;
  const b = betrothalById(s, gat.bet);
  if (!b || b.status === "broken") return null;
  const list = sceneList(s, b, b.tier ?? 0, gat.id);
  const key = list.find((k) => !gat.played.includes(k));
  if (!key) return null;
  const other = s.chars[betrothedTo(b, life.c)];
  const guests = here.filter((c) => c.id !== other?.id && ageOf(s, c) >= 16);
  const pick = (xs: Character[]) =>
    xs.length
      ? xs[Math.abs(gat.id + gat.played.length * 13) % xs.length].id
      : -1;
  let c = other?.id ?? -1;
  switch (key) {
    case "w-dowry": {
      const kin = [other?.father, other?.mother]
        .map((x) => (x !== undefined ? s.chars[x] : undefined))
        .find((x) => x?.alive && !lifeOfChar(s, x.id));
      c = kin?.id ?? other?.id ?? -1;
      break;
    }
    case "w-feast":
    case "w-toasts":
      c = pick(guests) >= 0 ? pick(guests) : c;
      break;
    case "w-uncle": {
      const men = guests.filter((x) => !x.female);
      const drunk = men.filter((x) => hasTrait(x, "drunkard"));
      const who = pick(drunk.length ? drunk : men.length ? men : guests);
      c = who >= 0 ? who : c;
      break;
    }
    case "w-objection": {
      const folk = peopleHere(s, gat.prov, life).filter(
        (x) =>
          !gat.invited.includes(x.id) &&
          x.id !== gat.host &&
          ageOf(s, x) >= 18 &&
          !lifeOfChar(s, x.id),
      );
      const who = pick(folk.length ? folk : guests);
      c = who >= 0 ? who : c;
      break;
    }
  }
  // Another player is never stood in a scene for what they didn't do.
  if (c >= 0 && c !== other?.id && lifeOfChar(s, c)) c = -1;
  return { key, c };
}

hooks.gatherTurn.push(coupleTurn);

/** The day comes: the couple must both be there; they're married at the vows. */
hooks.weddingBegins.push((g, gat) => {
  if (gat.bet === undefined) return undefined;
  const s = g.s;
  const b = betrothalById(s, gat.bet);
  if (!b || b.status !== "planned") return false;
  const [a, c] = [s.chars[b.a], s.chars[b.b]];
  if (!a?.alive || !c?.alive || a.spouse >= 0 || c.spouse >= 0) return false;
  // A player who isn't there: put off a month (twice), as for the host.
  const away = [a, c]
    .map((x) => lifeOfChar(s, x.id))
    .find((l) => l && (l.prov !== gat.prov || l.travel));
  if (away) {
    if (gat.played.filter((k) => k === "put-off").length >= 2) return false;
    gat.day = s.day + 30;
    gat.played.push("put-off");
    b.day = gat.day;
    intrigueChanged(g);
    g.societyChanged("g");
    for (const x of [a, c]) {
      const l = lifeOfChar(s, x.id);
      if (l)
        journal(
          g,
          l,
          `${charName(meOf(s, away)!)} wasn't at ${g.map.provinces[gat.prov]?.name} for the wedding: it's put off a month.`,
          "bad",
        );
    }
    return "wait";
  }
  return true;
});

/** Over: if the vows weren't played out, they were said all the same. */
hooks.gatherHeld.push((g, gat) => {
  if (gat.bet === undefined) return;
  const s = g.s;
  const b = betrothalById(s, gat.bet);
  if (!b || b.status !== "planned") return;
  if (!solemnize(g, b)) return;
  for (const id of [b.a, b.b]) {
    const l = lifeOfChar(s, id);
    if (l && !b.dowry) settleDowry(g, l, b, 1);
  }
});

// ---------------------------------------------------------------- quietly, or not at all

/** Married there and then, before the minister: no event made of it. */
export function quietCheck(s: GameState, life: Life, id: number): Check {
  const b = betrothalById(s, id);
  const me = meOf(s, life);
  if (!b || !me || (b.a !== me.id && b.b !== me.id))
    return no("No such promise.");
  if (b.status !== "promised" && b.status !== "planned")
    return no("It's settled.");
  const other = s.chars[betrothedTo(b, me.id)];
  if (!other?.alive) return no("They're gone.");
  if (life.travel) return no("Not from the road.");
  if (!peopleHere(s, life.prov, life).some((x) => x.id === other.id))
    return no(`${other.first} isn't here.`);
  const cost = b.status === "planned" ? 0 : weddingCost(s, life);
  if (life.purse < cost) return no(`It costs ${cost} coins.`);
  return yes;
}

export function quietWedding(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const s = g.s;
  const ck = quietCheck(s, life, id);
  if (!ck.ok) return ck.why;
  const b = betrothalById(s, id)!;
  const me = meOf(s, life)!;
  const other = g.char(betrothedTo(b, me.id));
  const planned = b.status === "planned";
  const gat = b.gat !== undefined ? gatheringById(s, b.gat) : undefined;
  if (gat && gat.status === "planned") {
    gat.status = "cancelled";
    g.societyChanged("g");
    for (const [c, r] of Object.entries(gat.rsvp))
      if (
        r.yes &&
        Number(c) !== other.id &&
        s.chars[Number(c)]?.alive &&
        !lifeOfChar(s, Number(c))
      )
        remembers(
          g,
          life,
          g.char(Number(c)),
          "Married quietly after all",
          -2,
          1,
        );
  }
  const ol = lifeOfChar(s, other.id);
  if (ol) {
    b.status = "planned";
    if (!planned) spend(g, life, weddingCost(s, life));
    solemnize(g, b);
  } else {
    wed(g, life, other, { paid: planned });
    b.vows = true;
    b.dowry = true;
    b.status = "wed";
    b.ended = s.day;
  }
  intrigueChanged(g);
  journal(g, life, "A quiet wedding, before the minister and two witnesses.");
  return null;
}

/** Break it off: their family's damages, hard feelings, and talk. */
export function jiltCheck(s: GameState, life: Life, id: number): Check {
  const b = betrothalById(s, id);
  const me = meOf(s, life);
  if (!b || !me || (b.a !== me.id && b.b !== me.id))
    return no("No such promise.");
  if (b.status !== "promised" && b.status !== "planned")
    return no("It's settled.");
  const other = s.chars[betrothedTo(b, me.id)];
  const cost = lifeOfChar(s, other?.id ?? -1) ? 0 : breachCost(s, other);
  if (life.purse < cost) return no(`Their family's damages: ${cost} coins.`);
  return yes;
}

export function jilt(
  g: ConquestGame,
  life: Life,
  id: number,
  atAltar = false,
): string | null {
  const s = g.s;
  const ck = jiltCheck(s, life, id);
  if (!ck.ok && !atAltar) return ck.why;
  const b = betrothalById(s, id)!;
  const me = meOf(s, life)!;
  const other = s.chars[betrothedTo(b, me.id)];
  b.status = "broken";
  b.by = me.id;
  b.ended = s.day;
  intrigueChanged(g);
  const gat = b.gat !== undefined ? gatheringById(s, b.gat) : undefined;
  if (gat && gat.status === "planned") {
    gat.status = "cancelled";
    g.societyChanged("g");
  }
  const ol = other ? lifeOfChar(s, other.id) : undefined;
  if (other?.alive && !ol) {
    const cost = breachCost(s, other);
    if (!atAltar && cost)
      withFlow(
        g,
        { key: "intr:breach", label: "Damages for breach of promise" },
        () => spend(g, life, Math.min(cost, Math.max(0, life.purse))),
      );
    remembers(g, life, g.char(other.id), "Jilted me", -50, 5);
    for (const k of [other.father, other.mother]) {
      const kc = s.chars[k];
      if (kc?.alive && !lifeOfChar(s, kc.id))
        remembers(g, life, g.char(kc.id), "Jilted our child", -25, 5);
    }
  }
  if (ol) {
    journal(g, ol, `${charName(me)} has broken off your engagement.`, "bad");
    addStress(g, ol, 10);
  }
  addRenown(g, life, atAltar ? -4 : -2);
  addStress(g, life, 6);
  rumour(
    g,
    life.prov,
    atAltar
      ? `${charName(me)} left ${charName(other)} at the altar!`
      : `${charName(me)} has broken off the match with ${charName(other)}.`,
    me.id,
    "bad",
  );
  journal(
    g,
    life,
    atAltar
      ? `You bolt from the church. ${other?.first ?? "They"} will never forgive it, and the town will never forget it.`
      : `You break it off with ${charName(other)}.${!ol ? ` Their family wants damages for the breach of promise.` : ""}`,
    "bad",
  );
  return null;
}

// ---------------------------------------------------------------- the months

/** A computer character who no longer likes you cries off; a betrothal left too long lapses. */
export function betrothalsMonthly(g: ConquestGame, life: Life): void {
  const s = g.s;
  const st = s.intrigue;
  if (!st?.betrothals.length || life.c < 0) return;
  for (const b of st.betrothals) {
    if (b.status !== "promised" && b.status !== "planned") continue;
    if (b.a !== life.c && b.b !== life.c) continue;
    const other = s.chars[betrothedTo(b, life.c)];
    const me = meOf(s, life)!;
    const end = (why: string) => {
      b.status = "broken";
      b.by = other?.id ?? -1;
      b.ended = s.day;
      intrigueChanged(g);
      const gat = b.gat !== undefined ? gatheringById(s, b.gat) : undefined;
      if (gat && gat.status === "planned") {
        gat.status = "cancelled";
        g.societyChanged("g");
      }
      journal(g, life, why, "bad");
    };
    if (!other?.alive || other.abroad || me.spouse >= 0 || other.spouse >= 0) {
      end(`The promise to ${charName(other)} can't be kept now.`);
      continue;
    }
    // The wedding gathering was called off (nobody came, or you weren't there).
    const gat = b.gat !== undefined ? gatheringById(s, b.gat) : undefined;
    if (b.status === "planned" && (!gat || gat.status === "cancelled")) {
      b.status = "promised";
      b.gat = undefined;
      intrigueChanged(g);
      journal(
        g,
        life,
        `The wedding didn't happen. You're still promised to ${charName(other)}: plan it again.`,
        "bad",
      );
      continue;
    }
    if (lifeOfChar(s, other.id)) continue;
    if (opinionOf(s, other, life).total < -10) {
      end(
        `${charName(other)} sends back your letters and cries off: the match is broken.`,
      );
      addRenown(g, life, -1);
      continue;
    }
    if (b.status === "promised" && s.day - b.since > BETROTHAL_DAYS)
      end(
        `Two years promised and no wedding: ${charName(other)}'s family has found another match.`,
      );
  }
}

hooks.death.push((g, c) => {
  const st = g.s.intrigue;
  if (!st) return;
  for (const b of st.betrothals) {
    if (b.status !== "promised" && b.status !== "planned") continue;
    if (b.a !== c.id && b.b !== c.id) continue;
    b.status = "broken";
    b.ended = g.s.day;
    intrigueChanged(g);
    const l = lifeOfChar(g.s, betrothedTo(b, c.id));
    if (l) {
      journal(
        g,
        l,
        `${charName(c)}, to whom you were promised, is dead.`,
        "bad",
      );
      addStress(g, l, 15);
    }
  }
});

/** The chance of a mishap's scene going one way: the track's own dice. */
export function weddingLuck(g: ConquestGame, p: number): boolean {
  return idice(g).chance(p);
}

void Explain;
