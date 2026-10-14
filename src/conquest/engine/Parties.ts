// SHIPS (r21): travelling together. Ask another player whether you may
// travel with them, or ask them to travel with you ("p2p-party-ask",
// "p2p-party-invite"): once agreed, wherever the leader sets out for from
// where you both are, you go too. In the leader's own boat you take one of
// her berths for nothing; on a passage or the road you pay your own way.
// Everyone aboard a ship of a player's (her company, her owner's guests)
// follows her, hop by hop (`followDaily`), whoever commands her; anyone can
// get off at the next stop on the way (the "halt" command: `leaveCompany`).
//
// And where there's no port: the ship that landed you by passage lies off
// the shore a while (`Life.lying`), and you can go back aboard her; after
// she's gone, a passing coaster can be hailed, a few days' wait
// (`strandEmbark`). An island without a port no longer strands anyone.

import { BOATS } from "./Boats";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { visit } from "./Life";
import { journal, spend, touchLife } from "./LifeCore";
import {
  type Check,
  hasPlace,
  hopDaysFor,
  isChildLife,
  lifeIsNative,
  lifeOfSeat,
  meOf,
  no,
  paceOf,
  purseWords,
  yes,
} from "./LifeQueries";
import {
  ROAD_COST_PER_DAY,
  SEA_FARE_BASE,
  SEA_FARE_PER_100KM,
} from "./LifeRules";
import { wake } from "./Pace";
import { charName } from "./Queries";
import { berthsOf, boatOf } from "./Ships";
import { BEACHED, COASTER, LIE_DAYS } from "./ShipsData";
import type { GameState, Life, LifeCommand, MapDef, Travel } from "./Types";

const r1 = (v: number) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------- who's with whom

/** The player you travel with, if you're in a party. */
export function partyLead(s: GameState, life: Life): Life | undefined {
  const seat = life.party?.lead;
  if (!seat) return undefined;
  const l = lifeOfSeat(s, seat);
  return l && l.c >= 0 && !l.watching ? l : undefined;
}

/** The players travelling with you (you lead). */
export function partyMembers(s: GameState, leader: Life): Life[] {
  return s.lives.filter(
    (l) => l.party?.lead === leader.seat && l.c >= 0 && !l.watching,
  );
}

/** Why someone can't go travelling with anyone now, or ok. */
function free(s: GameState, l: Life): Check {
  if (!meOf(s, l) || l.watching) return no("Watching.");
  if (isChildLife(s, l)) return no("A child goes where the family goes.");
  if (l.crime?.jail) return no("In a cell.");
  if ((l.job?.army ?? -1) >= 0) return no("Marching with the army.");
  if (l.job?.kind === "servant" && (l.job.until ?? 0) > s.day)
    return no("A servant goes where the master says.");
  return yes;
}

/** Whether you can ask (or invite) another player here to travel together. */
export function partyCheck(
  s: GameState,
  life: Life,
  other: Life | undefined,
  invite: boolean,
): Check {
  if (!other || other === life) return no("Nobody to travel with.");
  const a = free(s, life);
  if (!a.ok) return a;
  const b = free(s, other);
  if (!b.ok)
    return no(`They can't: ${b.why.replace(/\.$/, "").toLowerCase()}.`);
  if (life.travel || other.travel)
    return no("Not while either of you is on the road.");
  if (life.prov !== other.prov)
    return no("You'd have to be in the same place.");
  const lead = invite ? life : other;
  const member = invite ? other : life;
  if (member.party?.lead === lead.seat)
    return no("You travel together already.");
  if (partyMembers(s, member).length)
    return no(
      invite
        ? "They lead a party of their own."
        : "You lead a party of your own.",
    );
  if (lead.party)
    return no(
      invite
        ? "You travel with someone else."
        : "They travel with someone else.",
    );
  const key = invite ? "p2p-party-invite" : "p2p-party-ask";
  if (other.events.some((e) => e.key === key && e.ctx.c === life.c))
    return no("They have your asking already.");
  return yes;
}

/** Ask to travel with another player (they lead), or ask them to travel with you (you lead). */
export function askParty(
  g: ConquestGame,
  life: Life,
  seat: string,
  invite: boolean,
): string | null {
  const s = g.s;
  const other = lifeOfSeat(s, seat);
  const check = partyCheck(s, life, other, invite);
  if (!check.ok) return check.why;
  raiseEvent(g, other!, invite ? "p2p-party-invite" : "p2p-party-ask", {
    c: life.c,
  });
  wake(
    g,
    other!,
    `${charName(meOf(s, life))} ${invite ? "asks you to travel with them" : "asks to travel with you"}.`,
  );
  journal(
    g,
    life,
    invite
      ? `You ask ${charName(meOf(s, other!))} to travel with you.`
      : `You ask ${charName(meOf(s, other!))} whether you may travel with them.`,
  );
  return null;
}

/** Agreed: `member` travels with `lead` from now on. */
export function joinParty(
  g: ConquestGame,
  member: Life,
  lead: Life,
): string | null {
  const s = g.s;
  if (member.prov !== lead.prov) return "You're no longer in the same place.";
  const a = free(s, member);
  if (!a.ok) return a.why;
  if (partyMembers(s, member).length)
    return "They lead a party of their own now.";
  touchLife(g, member).party = { lead: lead.seat, since: s.day };
  touchLife(g, lead);
  journal(
    g,
    member,
    `You travel with ${charName(meOf(s, lead))} now: wherever they set out for from where you both are, you go too.`,
    "good",
  );
  journal(
    g,
    lead,
    `${charName(meOf(s, member))} travels with you now.`,
    "good",
  );
  return null;
}

/** Leave the party you travel with (or the leader parts with you). */
export function leaveParty(g: ConquestGame, member: Life, why?: string): void {
  const s = g.s;
  const lead = partyLead(s, member);
  touchLife(g, member).party = null;
  journal(
    g,
    member,
    why ??
      `You go your own way${lead ? `, leaving ${charName(meOf(s, lead))}` : ""}.`,
  );
  if (lead)
    journal(g, lead, `${charName(meOf(s, member))} goes their own way.`);
}

/** Get off at the next stop: off the ship, or out of the party, there. */
export function leaveCompany(g: ConquestGame, life: Life): void {
  const t = life.travel;
  if (!t?.with) return;
  touchLife(g, life);
  const next = t.path[0];
  const where =
    next !== undefined
      ? ` at ${g.map.provinces[next]?.name ?? "the next stop"}`
      : "";
  if (
    life.party &&
    (t.with.boat === undefined || t.with.seat === life.party.lead)
  )
    leaveParty(g, life, `You'll leave the party${where}.`);
  else journal(g, life, `You'll go ashore${where}.`);
  delete t.with;
  if (next !== undefined) {
    t.path = [next];
    t.sea = [t.sea[0] ?? false];
    t.dest = next;
  }
}

// ---------------------------------------------------------------- setting out together

/** What a member pays to go along: the road's costs and passages' fares (nothing in the leader's own boat). */
export function fareAlong(
  s: GameState,
  map: MapDef,
  member: Life,
  from: number,
  t: Travel,
): number {
  if (t.boat !== undefined || t.with?.boat !== undefined) return 0;
  const sailor = member.job?.kind === "sailor";
  const native = lifeIsNative(s, member);
  let cost = 0;
  let at = from;
  t.path.forEach((q, i) => {
    if (t.sea[i]) {
      if (!sailor && !native) {
        const lane = map.provinces[at].sea.find(([x]) => x === q);
        cost += SEA_FARE_BASE + ((lane?.[1] ?? 0) / 100) * SEA_FARE_PER_100KM;
      }
    } else {
      const d = hopDaysFor(map, at, q, false, paceOf(s, member), s.day);
      cost += Math.max(0, d) * ROAD_COST_PER_DAY;
    }
    at = q;
  });
  return r1(cost);
}

/** Players aboard a ship of a player's now (her company and guests). */
export function aboardNow(s: GameState, seat: string, boat: number): Life[] {
  return s.lives.filter(
    (l) => l.travel?.with?.seat === seat && l.travel.with.boat === boat,
  );
}

/** The leader has just set out: those of the party with them go too. */
function setOutTogether(g: ConquestGame, lead: Life): void {
  const s = g.s;
  const t = lead.travel;
  if (!t || t.ship !== undefined || t.depart !== s.day) return;
  // In their own boat (sailing her, or aboard her on a charter): her berths, for nothing.
  const own = t.boat ?? (t.with?.seat === lead.seat ? t.with.boat : undefined);
  const b = own !== undefined ? boatOf(lead, own) : undefined;
  if (t.with && !b) return; // the leader follows someone else: the party isn't theirs to take
  for (const m of partyMembers(s, lead)) {
    if (m.travel || m.prov !== lead.prov || !free(s, m).ok) continue;
    if (b) {
      const taken =
        aboardNow(s, lead.seat, b.id).filter((l) => !l.job?.berth).length -
        (t.with ? 1 : 0);
      if (taken >= berthsOf(b)) {
        journal(
          g,
          m,
          `The ${b.name} has no berth left for you: ${charName(meOf(s, lead))} sails without you.`,
          "bad",
        );
        continue;
      }
    }
    const cost = fareAlong(s, g.map, m, lead.prov, t);
    if (m.purse < cost) {
      journal(
        g,
        m,
        `You couldn't pay your way (${cost} coins; ${purseWords(m.purse)}): ${charName(meOf(s, lead))} goes without you.`,
        "bad",
      );
      continue;
    }
    if (cost) spend(g, m, cost);
    touchLife(g, m).travel = {
      dest: t.dest,
      path: [...t.path],
      sea: [...t.sea],
      depart: t.depart,
      arrive: t.arrive,
      cost,
      with: b ? { seat: lead.seat, boat: b.id } : { seat: lead.seat },
    };
    journal(
      g,
      m,
      `You set out with ${charName(meOf(s, lead))} for ${g.map.provinces[t.dest].name}${b ? `, aboard the ${b.name}` : cost ? ` (${cost} coins, your own way)` : ""}.`,
    );
  }
}

hooks.afterCommand.push((g, life) => {
  if (life.travel && life.travel.depart === g.s.day) setOutTogether(g, life);
});

// ---------------------------------------------------------------- going where they go

interface Where {
  prov: number;
  /** Under way: the hops ahead and their days; null when they've come in. */
  way: Pick<Travel, "path" | "sea" | "depart" | "arrive" | "dest"> | null;
  /** Who, in words ("the Swallow", "Alden Hale"). */
  name: string;
}

/** Where whoever (or whatever ship) someone travels with is now. */
function whereIs(
  s: GameState,
  w: NonNullable<Travel["with"]>,
  depth = 0,
): Where | null {
  const lead = lifeOfSeat(s, w.seat);
  if (!lead || lead.c < 0) return null;
  if (w.boat !== undefined) {
    const b = boatOf(lead, w.boat);
    if (!b) return null;
    const name = `the ${b.name}`;
    if (b.way) return { prov: b.way.prov, way: b.way, name };
    if (lead.travel?.boat === b.id)
      return { prov: lead.prov, way: lead.travel, name };
    return { prov: b.prov, way: null, name };
  }
  const name = charName(meOf(s, lead));
  const t = lead.travel;
  if (!t) return { prov: lead.prov, way: null, name };
  if (t.with && depth < 3) {
    const up = whereIs(s, t.with, depth + 1);
    return up ? { ...up, name } : { prov: lead.prov, way: t, name };
  }
  return { prov: lead.prov, way: t, name };
}

/** Each day: everyone travelling with someone goes where they go, and comes in with them. */
export function followDaily(g: ConquestGame): void {
  const s = g.s;
  for (const l of s.lives) {
    const t = l.travel;
    if (!t?.with || l.c < 0 || l.watching) continue;
    const at = whereIs(s, t.with);
    if (!at) {
      // Whoever (or whatever ship) they were with is gone: ashore at the next stop.
      touchLife(g, l);
      delete t.with;
      if (!t.path.length) l.travel = null;
      continue;
    }
    if (at.prov !== l.prov) {
      touchLife(g, l).prov = at.prov;
      visit(g, l, at.prov);
    }
    if (!at.way || !at.way.path.length) {
      touchLife(g, l).travel = null;
      const where = g.map.provinces[l.prov].name;
      journal(g, l, `You arrive at ${where} with ${at.name}.`);
      wake(g, l, `You arrive at ${where}.`);
      continue;
    }
    const wy = at.way;
    if (
      t.arrive !== wy.arrive ||
      t.dest !== wy.dest ||
      t.path.length !== wy.path.length ||
      t.path[0] !== wy.path[0]
    ) {
      touchLife(g, l);
      t.path = [...wy.path];
      t.sea = [...wy.sea];
      t.depart = wy.depart;
      t.arrive = wy.arrive;
      t.dest = wy.dest;
    }
  }
  // A party whose leader's gone (their line ended, they left the game) is no party.
  for (const l of s.lives)
    if (l.party && !partyLead(s, l)) touchLife(g, l).party = null;
}

hooks.daily.push(followDaily);

// ---------------------------------------------------------------- a shore with no port

/** Where a player can take ship from a shore with no port: the ship that landed them, or a coaster hailed. */
export function strandEmbark(
  s: GameState,
  map: MapDef,
  life: Life,
): { p: number; wait: number; why: string } | undefined {
  const p = life.prov;
  const def = map.provinces[p];
  if (!def?.coastal || (s.provinces[p]?.b.port ?? 0) > 0) return undefined;
  if (lifeIsNative(s, life)) return undefined;
  const ly = life.lying;
  if (ly && ly.p === p && ly.until > s.day)
    return {
      p,
      wait: 0,
      why: `the ${ly.ship} lies off the shore until she sails`,
    };
  const settled = (s.provinces[p]?.owner ?? -1) >= 0;
  return {
    p,
    wait: settled ? COASTER.settled : COASTER.wild,
    why: `no port here: a passing coaster can be hailed (about ${settled ? COASTER.settled : COASTER.wild} days' wait)`,
  };
}

const LYING_SHIPS = [
  "Hopewell",
  "Sea Flower",
  "Two Sisters",
  "Endeavour",
  "Dove",
  "Mary Ann",
  "Swift",
  "Prosperity",
];

// Landed by a passage where there's no port: her master runs her up on the
// strand or anchors off, puts you ashore in her boat, and lies a while.
hooks.landed.push((g, life, p, sea, boat) => {
  if (!sea || boat !== undefined) return;
  const s = g.s;
  if (!g.map.provinces[p]?.coastal || hasPlace(s, g.w, p, "docks")) return;
  if ((s.provinces[p]?.b.port ?? 0) > 0 || lifeIsNative(s, life)) return;
  const h = Math.abs((s.settings.seed * 31 + s.day * 7 + p) | 0);
  const ship = LYING_SHIPS[h % LYING_SHIPS.length];
  const kind = h % 3 === 0 ? "brig" : "sloop";
  const until = s.day + LIE_DAYS;
  touchLife(g, life).lying = { ship, kind, p, until };
  const where = g.map.provinces[p].name;
  journal(
    g,
    life,
    BEACHED.includes(kind)
      ? `There's no quay at ${where}: the master of the ${BOATS[kind].name.toLowerCase()} ${ship} runs her up on the strand and you wade ashore. She lies there ${LIE_DAYS} days, trading with the shore; you can go back aboard her when you leave. After that, a passing coaster can be hailed.`
      : `There's no quay at ${where}: the ${BOATS[kind].name.toLowerCase()} ${ship} anchors offshore and her boat puts you on the beach. She lies off ${LIE_DAYS} days, trading with the shore; you can go back aboard her when you leave. After that, a passing coaster can be hailed.`,
  );
});

// ---------------------------------------------------------------- commands

export function partyCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "party") return undefined;
  const s = g.s;
  switch (c.act) {
    case "ask":
      return askParty(g, life, c.seat ?? "", false);
    case "invite":
      return askParty(g, life, c.seat ?? "", true);
    case "leave":
      if (!life.party) return "You travel with nobody.";
      if (life.travel?.with && life.travel.with.boat === undefined)
        leaveCompany(g, life);
      else leaveParty(g, life);
      return null;
    case "part": {
      const m = lifeOfSeat(s, c.seat ?? "");
      if (!m || m.party?.lead !== life.seat)
        return "They don't travel with you.";
      if (m.travel?.with?.seat === life.seat) leaveCompany(g, m);
      if (m.party)
        leaveParty(g, m, `${charName(meOf(s, life))} parts company with you.`);
      return null;
    }
    case "alight":
      if (!life.travel?.with) return "You're not travelling with anyone.";
      leaveCompany(g, life);
      return null;
    default:
      return "Unknown.";
  }
}

hooks.command.push(partyCommand);
