// GOV (r21): expeditions, the doing. A player gets one up (Work ›
// Expeditions): what kind, where, who leads (you, one of your people, or a
// man of the town you pay to go for you), how many hands, which of your
// people go, which players come too; then pays (or the treasury pays, for a
// governor's own, or a grant) and sets out. The party travels on the map,
// hop by hop, carrying the players with it; halfway out something happens
// (a scene for a player leader, the leader's own judgement otherwise); at
// the far end the work is done at the odds shown before it set out; and
// what it brings is shared when it's home.
//
// A raid on a native town is part of the period's history and is here as
// history had it: told without gore (the stores carried off, the fields
// burned, the people scattered into the woods), and never without its
// answer: the nation's anger, war or a war party on the colony's frontier,
// the frontier's fear, and the crown's displeasure at a raid in peacetime.

import { formatDate } from "./Calendar";
import { kill, remember } from "./Characters";
import { relate } from "./Council";
import { addHeat } from "./Crime";
import { merge } from "./Economy";
import {
  bandOf,
  busyLeading,
  canPlan,
  costOf,
  daysOut,
  draftOf,
  edice,
  expedById,
  expedChanged,
  expedState,
  expedWords,
  hirelings,
  KINDS,
  LOSS,
  menOf,
  menWords,
  MISSION_YEARS,
  myExped,
  myForming,
  PARTY,
  partyLives,
  plunderOf,
  PORT_SETTLERS,
  RAID,
  REWARD,
  startFor,
  targetCheck,
  TRADE_BACK,
  wayOf,
  workChance,
  type ExpedDraft,
} from "./ExpedCore";
import {
  expedScenes,
  farScene,
  raiseScene,
  resolveByLeader,
} from "./ExpedEvents";
import { answerGrant, askGrant, grantsDaily } from "./ExpedGrant";
import { fogged, reveal } from "./Fog";
import { peopleOf } from "./Followers";
import type { ConquestGame } from "./Game";
import { hooks, provinceTaken } from "./Hooks";
import { affairNews } from "./Ledger";
import { withFlow } from "./LedgerCore";
import { visit } from "./Life";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  hurt,
  journal,
  milestone,
  spend,
  touchLife,
} from "./LifeCore";
import {
  Check,
  isChildLife,
  lifeOfChar,
  lifeOfSeat,
  meOf,
  no,
  purseWords,
  yes,
} from "./LifeQueries";
import { checkChance } from "./LifeRules";
import { missionLeaders, surveyProvinces } from "./Missions";
import { ensureOffices } from "./Offices";
import { wake } from "./Pace";
import { atWar, charName, provincesOf } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { rumour } from "./Rumours";
import { settlerPops } from "./Setup";
import { addFavor } from "./Standing";
import type {
  ExpedCommand,
  Expedition,
  ExpedKind,
  ExpedPast,
  GameState,
  Life,
} from "./Types";
import { startWar } from "./War";

const name = (g: ConquestGame, p: number) =>
  g.map.provinces[p]?.name ?? "somewhere";
const clampInt = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.max(lo, Math.min(hi, Math.round(v)))
    : d;

// ---------------------------------------------------------------- the governor

/** Whom a player governs (a colony's index), or -1. */
export function governs(s: GameState, life: Life): number {
  const me = meOf(s, life);
  if (!me) return -1;
  return s.nations.findIndex(
    (n) => n.alive && n.kind === "power" && n.ruler === me.id,
  );
}

/** People of the court a governor could send at the treasury's charge (besides the town's men). */
export function courtLeaders(s: GameState, n: number) {
  return missionLeaders(s, n).filter(
    (c) => !lifeOfChar(s, c.id) && !busyLeading(s, c.id),
  );
}

// ---------------------------------------------------------------- planning

/** A plan as the player asked for it, checked. */
function draftFrom(
  s: GameState,
  life: Life,
  c: ExpedCommand,
  members: number,
  seats: string[],
): ExpedDraft | string {
  const me = meOf(s, life)!;
  const kind = c.kind as ExpedKind;
  if (!KINDS[kind]) return "What kind of expedition?";
  const from = startFor(s, life);
  if (from < 0) return "Get one up from a town of your own colony.";
  const p = typeof c.p === "number" ? c.p : -1;
  const leader =
    typeof c.leader === "number" && c.leader >= 0 ? c.leader : me.id;
  const hands = clampInt(c.hands, 0, PARTY.maxHands, KINDS[kind].hands);
  const people = Array.isArray(c.people)
    ? [...new Set(c.people.filter((x) => typeof x === "number"))]
    : [];
  const stake =
    kind === "trade"
      ? clampInt(c.stake, PARTY.stakeMin, PARTY.stakeMax, PARTY.stake)
      : undefined;
  return {
    kind,
    n: me.nation,
    from,
    target: p,
    leader,
    hands,
    people,
    members,
    stake,
    by: life.seat,
    seats,
  };
}

/** Whether this plan can go ahead (before it sets out), or why not. */
export function planCheck(
  s: GameState,
  w: import("./Map").World,
  life: Life,
  d: ExpedDraft,
  treasury: boolean,
): Check {
  const ok = canPlan(s, life);
  if (!ok.ok) return ok;
  const me = meOf(s, life)!;
  const def = KINDS[d.kind];
  if (!def) return no("What kind of expedition?");
  if (d.from < 0) return no("Get one up from a town of your own colony.");
  const t = targetCheck(s, w, d.kind, d.n, d.target, d.from);
  if (!t.ok) return t;
  const gov = governs(s, life);
  if (treasury && gov !== me.nation)
    return no("Only the governor sends one at the treasury's charge.");
  // The leader: you, one of your people, a man of the town, or (a governor's) one of the court.
  if (d.leader !== me.id) {
    const c = s.chars[d.leader];
    if (!c?.alive) return no("Choose who leads it.");
    const ok2 =
      hirelings(s, life, d.kind, 50).some((h) => h.c.id === c.id) ||
      (treasury && courtLeaders(s, me.nation).some((x) => x.id === c.id));
    if (!ok2) return no(`${charName(c)} won't lead it (or isn't here).`);
    if (d.people.includes(-1)) return no("Bad party.");
  }
  for (const id of d.people) {
    const f = peopleOf(life).find((x) => x.id === id);
    if (!f) return no("Only your own people.");
    if (f.task)
      return no(`${charName(s.chars[f.c])} is away on other business.`);
    if (f.c === d.leader)
      return no("They lead it: no need to name them twice.");
  }
  const men = menOf(d);
  if (men < def.minMen)
    return no(
      `${def.name} needs ${def.minMen} men at least (this party is ${men}).`,
    );
  if (def.treasury && !treasury && d.kind === "port")
    return no(
      "A port is founded at the colony's charge: the governor sends one, or grants you the money.",
    );
  return yes;
}

/** What it costs as it stands (a leader hired from the town is paid his fee; your own people aren't). */
export function costNow(
  s: GameState,
  w: import("./Map").World,
  life: Life,
  x: Expedition,
): number {
  const me = meOf(s, life);
  const own =
    !!me &&
    (x.leader === me.id ||
      !!lifeOfChar(s, x.leader) ||
      peopleOf(life).some((f) => f.c === x.leader));
  return costOf(s, w.map, draftOf(x), !own).total;
}

/** The costs as they'd be paid: from your purse, or the treasury. */
export function payable(
  s: GameState,
  w: import("./Map").World,
  life: Life,
  x: Expedition,
): Check {
  const cost = costNow(s, w, life, x);
  if (x.grant === undefined && x.treasury > 0) {
    // The governor's own: the treasury pays it all.
    const gold = s.nations[x.n]?.gold ?? 0;
    if (gold < cost)
      return no(
        `The treasury holds ${Math.floor(gold)} gold; it costs ${cost}.`,
      );
    return yes;
  }
  const mine = Math.max(0, cost - x.treasury);
  if (life.purse < mine)
    return no(
      `It costs ${mine} coins${x.treasury ? ` after the grant's ${x.treasury}` : ""}; ${purseWords(life.purse)}.`,
    );
  return yes;
}

/** Get up an expedition (or change the one you're getting up). */
export function planExped(
  g: ConquestGame,
  life: Life,
  c: ExpedCommand,
): string | null {
  const s = g.s;
  const ok = canPlan(s, life);
  if (!ok.ok) return ok.why;
  const mine = myExped(s, life.seat);
  if (mine && mine.stage !== "forming")
    return "You're with an expedition already.";
  if (mine && mine.by !== life.seat)
    return "You've said you'll go with someone else's.";
  const old = myForming(s, life.seat);
  const seats = old ? old.members.map((m) => m.seat) : [];
  const d = draftFrom(s, life, c, old?.members.length ?? 0, seats);
  if (typeof d === "string") return d;
  const treasury = !!c.treasury;
  const check = planCheck(s, g.w, life, d, treasury);
  if (!check.ok) return check.why;
  const me = meOf(s, life)!;
  const st = expedState(g);
  const x: Expedition = old ?? {
    id: g.nextId(),
    kind: d.kind,
    n: d.n,
    by: life.seat,
    leader: d.leader,
    members: [],
    asked: [],
    hands: d.hands,
    men: 0,
    people: d.people,
    from: d.from,
    target: d.target,
    route: [],
    sea: [],
    legs: [],
    start: s.day,
    arrive: s.day,
    home: s.day,
    stage: "forming",
    cost: 0,
    treasury: 0,
    scenes: [],
    edge: 0,
    lost: 0,
  };
  // A grant was asked for one target and kind: changing them lets it lapse.
  if (old && (old.kind !== d.kind || old.target !== d.target)) {
    for (const a of st.asks)
      if (a.x === old.id && a.stage === "asked") a.stage = "refused";
    if (old.grant !== undefined) {
      returnGrant(g, old);
      old.grant = undefined;
      journal(
        g,
        life,
        "A grant is for the expedition it was asked for: it goes back to the treasury.",
      );
    }
  }
  x.kind = d.kind;
  x.target = d.target;
  x.from = d.from;
  x.n = d.n;
  x.leader = d.leader;
  x.lseat = d.leader === me.id ? life.seat : lifeOfChar(s, d.leader)?.seat;
  x.hands = d.hands;
  x.people = d.people;
  x.stake = d.stake;
  x.leave =
    governs(s, life) === d.n ? true : x.grant !== undefined ? true : undefined;
  if (treasury && x.grant === undefined) x.treasury = costNow(s, g.w, life, x);
  else if (x.grant === undefined) x.treasury = 0;
  if (!old) {
    st.list.push(x);
    journal(
      g,
      life,
      `You begin getting up ${expedWords(g.map, x)}. Ask others along, or a grant of the governor, then set out (Work › Expeditions).`,
    );
  }
  expedChanged(g);
  return null;
}

/** Give it up before it sets out. */
export function cancelExped(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const x = myForming(s, life.seat);
  if (!x) return "You're not getting one up.";
  const st = expedState(g);
  st.list = st.list.filter((y) => y.id !== x.id);
  for (const a of st.asks)
    if (a.x === x.id && a.stage === "asked") a.stage = "refused";
  returnGrant(g, x);
  for (const m of x.members) {
    const l = lifeOfSeat(s, m.seat);
    if (l)
      journal(
        g,
        l,
        `${charName(meOf(s, life))} has given up ${expedWords(g.map, x)}.`,
      );
  }
  journal(g, life, `You give up ${expedWords(g.map, x)}.`);
  expedChanged(g);
  return null;
}

// ---------------------------------------------------------------- other players

/** Whether you can ask another player along, or why not. */
export function inviteCheck(
  s: GameState,
  life: Life,
  other: Life | undefined,
): Check {
  const x = myForming(s, life.seat);
  if (!x) return no("Get an expedition up first.");
  if (!other || other.c < 0 || other.watching || other.seat === life.seat)
    return no("Ask another player.");
  if (isChildLife(s, other)) return no("A child.");
  if (x.members.some((m) => m.seat === other.seat))
    return no("They're coming.");
  if (x.asked.includes(other.seat)) return no("You've asked them.");
  if (x.lseat === other.seat) return no("They lead it.");
  const theirs = myExped(s, other.seat);
  if (theirs) return no("They're with an expedition of their own.");
  const me = meOf(s, life);
  const them = meOf(s, other);
  if (!me || !them) return no("Watching.");
  return yes;
}

export function inviteExped(
  g: ConquestGame,
  life: Life,
  seat: string,
): string | null {
  const s = g.s;
  const other = lifeOfSeat(s, seat ?? "");
  const ok = inviteCheck(s, life, other);
  if (!ok.ok) return ok.why;
  const x = myForming(s, life.seat)!;
  x.asked.push(seat);
  expedChanged(g);
  raiseScene(g, other!, "exped-invite", x, { by: meOf(s, life)!.id });
  journal(
    g,
    life,
    `You ask ${charName(meOf(s, other!))} to come with ${expedWords(g.map, x)}.`,
  );
  return null;
}

/** An invitation answered (the scene's choice). */
export function answerInvite(
  g: ConquestGame,
  life: Life,
  id: number,
  yesNo: boolean,
): string | null {
  const s = g.s;
  const x = expedById(s, id);
  if (!x || x.stage !== "forming" || !x.asked.includes(life.seat))
    return "That expedition has gone, or isn't asking now.";
  x.asked = x.asked.filter((y) => y !== life.seat);
  const org = lifeOfSeat(s, x.by);
  if (yesNo) {
    if (myExped(s, life.seat)) return "You're with another expedition.";
    x.members.push({ seat: life.seat, c: life.c, joined: s.day });
    journal(
      g,
      life,
      `You'll go with ${expedWords(g.map, x)}: be at ${name(g, x.from)} when it sets out.`,
      "good",
    );
    if (org)
      journal(
        g,
        org,
        `${charName(meOf(s, life))} will come with ${expedWords(g.map, x)}.`,
        "good",
      );
  } else if (org)
    journal(
      g,
      org,
      `${charName(meOf(s, life))} won't come with ${expedWords(g.map, x)}.`,
    );
  expedChanged(g);
  return null;
}

/** Leave an expedition: before it goes, or at the next stop on the way. */
export function leaveExped(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const x = myExped(s, life.seat);
  if (!x) return "You're with no expedition.";
  if (x.by === life.seat && x.stage === "forming") return cancelExped(g, life);
  if (x.lseat === life.seat && x.stage !== "forming")
    return "You lead it: the party won't go on without you. (Turn back at the far end, if you must.)";
  x.members = x.members.filter((m) => m.seat !== life.seat);
  if (life.travel?.exped === x.id) {
    touchLife(g, life).travel = null;
    journal(
      g,
      life,
      `You leave ${expedWords(g.map, x)} at ${name(g, life.prov)}.`,
    );
  } else
    journal(g, life, `You won't go with ${expedWords(g.map, x)} after all.`);
  expedChanged(g);
  return null;
}

/** Get off at the next stop on the way (the "halt" command): you're out of the party. */
export function alightExped(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const t = life.travel;
  if (!t || t.exped === undefined) return null;
  const x = expedById(s, t.exped);
  if (x && x.lseat === life.seat)
    return "You lead the party: it won't go on without you. (Turn back at the far end, if you must.)";
  touchLife(g, life);
  delete t.exped;
  if (x) {
    x.members = x.members.filter((m) => m.seat !== life.seat);
    expedChanged(g);
    journal(
      g,
      life,
      `You'll leave ${expedWords(g.map, x)} at ${name(g, t.path[0] ?? life.prov)}.`,
    );
  }
  return null;
}

// ---------------------------------------------------------------- setting out

/** Everything needed to set out now, or why not. */
export function goCheck(
  s: GameState,
  w: import("./Map").World,
  life: Life,
  x: Expedition,
): Check {
  if (x.stage !== "forming") return no("It's set out.");
  const d = draftOf(x);
  const check = planCheck(
    s,
    w,
    life,
    d,
    x.treasury > 0 && x.grant === undefined,
  );
  if (!check.ok) return check;
  if (life.prov !== x.from || life.travel)
    return no(`Be at ${w.map.provinces[x.from]?.name} to send it off.`);
  const leader = lifeOfChar(s, x.leader);
  if (leader && (leader.prov !== x.from || leader.travel))
    return no("Its leader isn't here.");
  if (x.asked.length)
    return no(
      "Wait for the answers (or set out without them: ask them no more).",
    );
  return payable(s, w, life, x);
}

/** Off it goes. */
export function goExped(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const x = myForming(s, life.seat);
  if (!x) return "You're not getting one up.";
  const ok = goCheck(s, g.w, life, x);
  if (!ok.ok) return ok.why;
  const me = meOf(s, life)!;
  // Players asked along who aren't here are left behind.
  for (const m of [...x.members]) {
    const l = lifeOfSeat(s, m.seat);
    if (!l || l.c < 0 || l.prov !== x.from || l.travel || l.crime?.jail) {
      x.members = x.members.filter((y) => y.seat !== m.seat);
      if (l)
        journal(
          g,
          l,
          `${expedWords(g.map, x)} set out from ${name(g, x.from)} without you.`,
          "bad",
        );
    }
  }
  const ownPerson = peopleOf(life).some((f) => f.c === x.leader);
  const total = costNow(s, g.w, life, x);
  // The money: the governor's own from the treasury; a grant (already in its chest) first, the rest from your purse.
  let fromTreasury = 0;
  if (x.grant === undefined && x.treasury > 0) {
    fromTreasury = total;
    const n = g.nation(x.n);
    n.gold = Math.max(0, n.gold - total);
  } else if (x.grant !== undefined) {
    fromTreasury = Math.min(total, x.treasury);
    // What the grant doesn't need goes back to the treasury.
    if (x.treasury > total) g.nation(x.n).gold += x.treasury - total;
  }
  const mine = total - fromTreasury;
  if (mine > 0)
    withFlow(
      g,
      {
        key: `exped:${x.id}`,
        label: `${KINDS[x.kind].name}: fitting out`,
        aff: "expedition",
      },
      () => spend(g, life, mine),
    );
  x.cost = mine;
  x.treasury = fromTreasury;
  if (x.grant !== undefined) {
    const a = expedState(g).asks.find((y) => y.id === x.grant);
    if (a) a.stage = "granted";
  }
  for (const a of expedState(g).asks)
    if (a.x === x.id && a.stage === "asked") a.stage = "refused";
  // The way, and the days (as a nation's party: on foot, by canoe across water).
  const way = wayOf(g.map, x.from, x.target);
  const days = daysOut(s, g.map, draftOf(x)).total;
  const sum = way.legs.reduce((a, b) => a + b, 0);
  x.route = way.route;
  x.sea = way.sea;
  x.legs = way.legs.map((v) =>
    sum > 0 ? Math.round(((v * days) / sum) * 10) / 10 : days,
  );
  x.start = s.day;
  x.arrive = s.day + days;
  x.home = x.arrive + KINDS[x.kind].work + days;
  x.stage = "out";
  x.men = menOf({ ...draftOf(x), men: undefined });
  x.next = s.day + Math.max(1, Math.floor(days / 2));
  x.scenes = [];
  x.asked = [];
  // Your people go with it.
  for (const id of x.people) {
    const f = peopleOf(life).find((y) => y.id === id);
    if (f)
      f.task = {
        kind: "wait",
        p: x.target,
        back: x.home + 3650,
        what: "expedition",
      };
  }
  if (ownPerson) {
    const f = peopleOf(life).find((y) => y.c === x.leader);
    if (f)
      f.task = {
        kind: "wait",
        p: x.target,
        back: x.home + 3650,
        what: "expedition",
      };
  }
  touchLife(g, life);
  // The players go: the party carries them.
  for (const l of partyLives(s, x)) {
    carry(g, l, x);
    journal(
      g,
      l,
      `${l.seat === x.lseat ? "You set out at the head of" : "You set out with"} ${expedWords(g.map, x)}: ${x.men} men, about ${days} days there${KINDS[x.kind].work ? `, ${KINDS[x.kind].work} days' work` : ""} and as many back.`,
      "good",
    );
  }
  if (!partyLives(s, x).some((l) => l.seat === life.seat))
    journal(
      g,
      life,
      `${expedWords(g.map, x)} sets out from ${name(g, x.from)} under ${charName(s.chars[x.leader])}: ${x.men} men, about ${days} days there. Word will come back with them.`,
    );
  rumour(
    g,
    x.from,
    `${charName(s.chars[x.leader])} has set out with ${x.men} men on ${expedWords(g.map, x)}.`,
    x.leader,
  );
  g.event({
    k: "news",
    day: s.day,
    n: x.n,
    p: x.from,
    text: `${charName(s.chars[x.leader])} sets out from ${name(g, x.from)} on ${expedWords(g.map, x)}.`,
  });
  expedChanged(g);
  return null;
}

// ---------------------------------------------------------------- on the way

/** Where the party is on its way out (or back): the hop it's on, and the provinces ahead. */
function wayNow(
  x: Expedition,
  day: number,
): {
  at: number;
  next: number;
  ahead: number[];
  sea: boolean[];
  depart: number;
  arrive: number;
} {
  const out = x.stage !== "back";
  const route = out ? x.route : [...x.route].reverse();
  const legs = out ? x.legs : [...x.legs].reverse();
  const sea = out ? x.sea : [...x.sea].reverse();
  const t0 = out ? x.start : x.home - legs.reduce((a, b) => a + b, 0);
  let t = t0;
  let k = 0;
  while (k < legs.length && day >= t + legs[k]) {
    t += legs[k];
    k++;
  }
  const at = route[Math.min(k, route.length - 1)];
  const ahead = route.slice(k + 1);
  return {
    at,
    next: ahead[0] ?? at,
    ahead,
    sea: sea.slice(k),
    depart: Math.floor(t),
    arrive: Math.ceil(t + (legs[k] ?? 0)),
  };
}

/** The party carries a player: where it is, where it's going. */
function carry(g: ConquestGame, l: Life, x: Expedition): void {
  const w = wayNow(x, g.s.day);
  if (l.prov !== w.at) {
    touchLife(g, l).prov = w.at;
    visit(g, l, w.at);
  }
  const dest = x.stage === "back" ? x.from : x.target;
  const t = l.travel;
  if (
    t &&
    t.exped === x.id &&
    t.dest === dest &&
    t.path.length === w.ahead.length &&
    t.arrive === w.arrive
  )
    return;
  touchLife(g, l).travel = {
    dest,
    path: [...w.ahead],
    sea: [...w.sea],
    depart: w.depart,
    arrive: w.arrive,
    cost: 0,
    exped: x.id,
  };
}

/** A scene for this party waits on its leader's answer. */
function waiting(s: GameState, x: Expedition): boolean {
  if (!x.lseat) return false;
  const l = lifeOfSeat(s, x.lseat);
  return !!l && l.events.some((e) => e.ctx.x === x.id);
}

/** Days lost on the way (a carry round the rapids, a camp in the snow). */
export function delayExped(g: ConquestGame, x: Expedition, days: number): void {
  if (days <= 0) return;
  if (x.stage === "out") {
    x.arrive += days;
    x.home += days;
    // The hops still ahead take longer.
    const w = wayNow(x, g.s.day);
    const k = x.route.indexOf(w.at);
    if (k >= 0 && k < x.legs.length) x.legs[k] += days;
  } else if (x.stage === "back") {
    x.home += days;
    const w = wayNow(x, g.s.day);
    const k = x.route.indexOf(w.at) - 1;
    if (k >= 0 && k < x.legs.length) x.legs[k] += days;
  } else {
    x.home += days;
  }
  x.lost += days;
  expedChanged(g);
}

/** Men lost on the way. */
export function loseMen(g: ConquestGame, x: Expedition, share: number): number {
  const lose = Math.min(x.hands, Math.round(x.hands * share));
  x.hands -= lose;
  x.men = Math.max(1, x.men - lose);
  expedChanged(g);
  return lose;
}

/** The leader hurt: a player's health, or one of the computer's who may die of it. */
export function hurtLeader(
  g: ConquestGame,
  x: Expedition,
  amount: number,
  cause: string,
  dies: number,
): string {
  const s = g.s;
  const c = s.chars[x.leader];
  if (!c?.alive) return "";
  const l = lifeOfChar(s, c.id);
  if (l) {
    const dead = hurt(g, l, amount, cause);
    return dead
      ? `${charName(c)} died of it.`
      : `${charName(c)} was hurt (${amount} health).`;
  }
  if (edice(s, 0x51, x.id, amount).chance(dies)) {
    kill(g, c, cause);
    return `${charName(c)} died of it.`;
  }
  return `${charName(c)} was hurt.`;
}

/** Tell everyone with the party (and its organiser at home) what happened. */
export function tell(
  g: ConquestGame,
  x: Expedition,
  text: string,
  tone?: "good" | "bad",
): void {
  const s = g.s;
  const seen = new Set<string>();
  for (const l of partyLives(s, x)) {
    seen.add(l.seat);
    journal(g, l, text, tone);
  }
  if (x.by && !seen.has(x.by)) {
    const org = lifeOfSeat(s, x.by);
    if (org && org.c >= 0)
      affairNews(
        g,
        org,
        "expedition",
        `Word from ${expedWords(g.map, x)}: ${text}`,
        tone,
      );
  }
}

/** Each day: parties move, things happen on the way, the work's done, and they come home. */
export function expedDaily(g: ConquestGame): void {
  const s = g.s;
  if (!s.exped) return;
  const st = expedState(g);
  for (const x of [...st.list]) {
    if (x.stage === "forming") {
      // Two years of talk and nobody went.
      if (s.day - x.start > 2 * DAYS_PER_YEAR)
        dropForming(g, x, "two years of talk");
      else if (!lifeOfSeat(s, x.by) || lifeOfSeat(s, x.by)!.c < 0)
        dropForming(g, x, "its organiser is gone");
      continue;
    }
    // Waiting on the leader's word: the party stays where it is.
    if (waiting(s, x)) {
      x.start++;
      x.arrive++;
      x.home++;
      if (x.next !== undefined) x.next++;
      expedChanged(g);
      continue;
    }
    const leader = s.chars[x.leader];
    if (!leader?.alive && x.stage !== "back") leaderLost(g, x);
    // Players who've gone their own way are no longer with it.
    for (const m of [...x.members]) {
      const l = lifeOfSeat(s, m.seat);
      if (
        !l ||
        l.c < 0 ||
        l.c !== m.c ||
        (x.stage !== "there" && l.travel?.exped !== x.id)
      ) {
        x.members = x.members.filter((y) => y.seat !== m.seat);
        expedChanged(g);
      }
    }
    if (x.stage === "out") {
      if (x.next !== undefined && s.day >= x.next && !x.scenes.length) {
        x.next = undefined;
        trouble(g, x);
        if (waiting(s, x)) continue;
      }
      if (s.day >= x.arrive) {
        arriveAt(g, x);
        continue;
      }
      for (const l of partyLives(s, x)) carry(g, l, x);
    } else if (x.stage === "there") {
      if (x.result && s.day >= x.arrive + KINDS[x.kind].work) turnHome(g, x);
    } else if (x.stage === "back") {
      if (x.next !== undefined && s.day >= x.next) {
        x.next = undefined;
        trouble(g, x);
        if (waiting(s, x)) continue;
      }
      if (s.day >= x.home) {
        homecoming(g, x);
        continue;
      }
      for (const l of partyLives(s, x)) carry(g, l, x);
    }
  }
  reprisalsDaily(g);
  grantsDaily(g);
}

hooks.daily.push(expedDaily);

/** A grant not spent goes back to the treasury. */
function returnGrant(g: ConquestGame, x: Expedition): void {
  if (x.grant !== undefined && x.treasury > 0) {
    g.nation(x.n).gold += x.treasury;
    x.treasury = 0;
  }
}

function dropForming(g: ConquestGame, x: Expedition, why: string): void {
  const st = expedState(g);
  st.list = st.list.filter((y) => y.id !== x.id);
  returnGrant(g, x);
  for (const a of st.asks)
    if (a.x === x.id && a.stage === "asked") a.stage = "refused";
  const org = lifeOfSeat(g.s, x.by);
  if (org && org.c >= 0)
    journal(g, org, `${expedWords(g.map, x)} comes to nothing: ${why}.`, "bad");
  expedChanged(g);
}

/** The leader's dead: the senior hand brings what's left of the party home. */
function leaderLost(g: ConquestGame, x: Expedition): void {
  if (x.stage === "out" || x.stage === "there") {
    if (!x.result) {
      x.result = "failed";
      x.note = `With ${charName(g.s.chars[x.leader])} dead, the party turned for home.`;
    }
    tell(g, x, x.note ?? "The leader is dead.", "bad");
    if (x.stage === "out") {
      // Back from where they are: the way they came.
      const w = wayNow(x, g.s.day);
      const k = Math.max(1, x.route.indexOf(w.at));
      x.route = x.route.slice(0, k + 1);
      x.sea = x.sea.slice(0, k);
      x.legs = x.legs.slice(0, k);
      x.target = x.route[x.route.length - 1];
      x.arrive = g.s.day;
      x.home = g.s.day + x.legs.reduce((a, b) => a + b, 0);
    }
    x.stage = "back";
    x.lseat = undefined;
    x.next = undefined;
    expedChanged(g);
  }
}

/** Halfway: what the country throws at them. */
function trouble(g: ConquestGame, x: Expedition): void {
  const sc = expedScenes(g, x);
  if (!sc) return;
  x.scenes.push(sc.key);
  expedChanged(g);
  const l = x.lseat ? lifeOfSeat(g.s, x.lseat) : undefined;
  if (l && l.c === x.leader) raiseScene(g, l, sc.key, x);
  else resolveByLeader(g, x, sc);
}

/** At the far end: the work, by the leader's judgement. */
function arriveAt(g: ConquestGame, x: Expedition): void {
  const s = g.s;
  x.stage = "there";
  expedChanged(g);
  // The players are there: free to look about while the work's done.
  for (const l of partyLives(s, x)) {
    touchLife(g, l).travel = null;
    if (l.prov !== x.target) {
      l.prov = x.target;
      visit(g, l, x.target);
    }
    wake(g, l, `${expedWords(g.map, x)} has reached ${name(g, x.target)}.`);
  }
  tell(g, x, `The party has reached ${name(g, x.target)}.`);
  const sc = farScene(x.kind);
  const l = x.lseat ? lifeOfSeat(s, x.lseat) : undefined;
  if (l && l.c === x.leader) raiseScene(g, l, sc.key, x);
  else resolveByLeader(g, x, sc);
}

/** The work's done: the party turns for home. */
function turnHome(g: ConquestGame, x: Expedition): void {
  const s = g.s;
  x.stage = "back";
  const back = x.legs.reduce((a, b) => a + b, 0);
  x.home = s.day + back;
  x.next =
    back >= 15 && edice(s, 0x52, x.id).chance(0.4)
      ? s.day + Math.floor(back / 2)
      : undefined;
  for (const l of partyLives(s, x)) {
    if (l.prov !== x.target || (l.travel && l.travel.exped !== x.id)) {
      // Gone their own way at the far end: the party goes home without them.
      x.members = x.members.filter((m) => m.seat !== l.seat);
      if (l.seat === x.lseat) x.lseat = undefined;
      journal(g, l, `${expedWords(g.map, x)} turns for home without you.`);
      continue;
    }
    carry(g, l, x);
  }
  expedChanged(g);
}

// ---------------------------------------------------------------- the work at the far end

/** How the work went: its effects in the world now; what it brings is shared at home. */
export function workDone(
  g: ConquestGame,
  x: Expedition,
  band: "won" | "half" | "failed" | "turned",
  how: {
    mult?: number;
    regard?: number;
    tribute?: boolean;
    wide?: boolean;
  } = {},
): string {
  const s = g.s;
  const p = x.target;
  const pr = s.provinces[p];
  const place = name(g, p);
  x.result = band;
  let text = "";
  const owner = pr.owner;
  const native = owner >= 0 && s.nations[owner]?.kind === "native";
  const nat = native ? s.nations[owner] : undefined;
  switch (x.kind) {
    case "discover": {
      text =
        band === "won"
          ? `They surveyed ${place} and the country round about${how.wide ? ", and pushed on beyond it" : ""}.`
          : band === "half"
            ? `They saw ${place} and a little of the country round it, and turned back short of stores.`
            : band === "turned"
              ? `They turned back at ${place}.`
              : `They lost their way short of ${place}, and saw little.`;
      break;
    }
    case "river": {
      text =
        band === "won"
          ? `They followed the river at ${place} for weeks, sounding its fords and sketching its falls and forks.`
          : band === "half"
            ? `They followed the river a little way and turned back at the first great falls.`
            : `The canoes were lost at the falls; they walked home with half a map.`;
      break;
    }
    case "trade": {
      const stake = x.stake ?? 0;
      const back =
        band === "turned"
          ? stake
          : Math.round(
              stake *
                TRADE_BACK[band] *
                (band === "failed" ? 1 : (how.mult ?? 1)),
            );
      x.haul = back;
      const rv = how.regard ?? (band === "won" ? 8 : band === "half" ? 3 : -3);
      if (nat && rv)
        relate(
          g,
          owner,
          x.n,
          rv > 0 ? "Traders who dealt fairly" : "Traders who cheated us",
          rv,
          5,
        );
      text =
        band === "won"
          ? `The ${nat?.name ?? "town"} traded gladly: ${back} coins' worth of furs and deerskins for the goods.`
          : band === "half"
            ? `Hard trading and a poor season: ${back} coins' worth of skins for the goods.`
            : band === "turned"
              ? "They brought the goods home again."
              : `The trade went badly: ${back} coins' worth for the goods, and ill feeling.`;
      // A governor's own: a treaty of trade, if they'll make one.
      if (band === "won" && nat && x.treasury > 0 && x.grant === undefined) {
        const err = g.command(x.n, { k: "treaty", n: owner, t: "trade" });
        if (!err)
          text += ` The ${nat.name} will trade with the colony by treaty.`;
      }
      break;
    }
    case "mission": {
      if (band === "won" || band === "half") {
        const pm = g.prov(p);
        pm.mods = pm.mods.filter((m) => m.key !== "r21:mission");
        pm.mods.push({
          key: "r21:mission",
          label: `A ${s.nations[x.n]?.adjective ?? ""} mission`,
          until:
            s.day +
            Math.round(
              (band === "won" ? MISSION_YEARS : MISSION_YEARS / 2) *
                DAYS_PER_YEAR,
            ),
          fx: {},
        });
      }
      const rv = how.regard ?? (band === "won" ? 6 : band === "half" ? 2 : -5);
      if (nat)
        relate(
          g,
          owner,
          x.n,
          rv > 0 ? "A mission welcomed" : "Missionaries who would not be told",
          rv,
          8,
        );
      text =
        band === "won"
          ? `The council of ${place} heard them, and a chapel and a school are going up at the edge of the town.`
          : band === "half"
            ? `A few listened, and a small mission stays on at ${place}, on sufferance.`
            : `The council of ${place} sent them away with presents, politely and finally.`;
      break;
    }
    case "outpost": {
      if (band === "won" || band === "half") {
        if (!pr.outpost && (owner < 0 || native)) {
          g.prov(p).outpost = { by: x.n, since: s.day };
          surveyProvinces(g, x.n, [
            p,
            ...g.map.provinces[p].nb.map(([q]) => q),
          ]);
          if (nat)
            relate(
              g,
              owner,
              x.n,
              `Built a fort on our land at ${place}`,
              how.regard ?? -15,
              10,
            );
          text =
            band === "won"
              ? `A palisade and a blockhouse stand at ${place}, flying the colony's colours.`
              : `A rough stockade stands at ${place}: it will do.`;
        } else {
          x.result = "failed";
          text = `${place} was taken before they got there.`;
        }
      } else
        text = `They couldn't hold the ground at ${place}: the timbers were left where they lay.`;
      break;
    }
    case "port": {
      if (band === "won" || band === "half") {
        if (owner === x.n) {
          const pm = g.prov(p);
          pm.b.port = Math.max(1, pm.b.port ?? 0);
          text = `A wharf and a storehouse stand at ${place}: ships can call.`;
        } else if (owner < 0 && !pr.colony) {
          const pm = g.prov(p);
          pm.owner = x.n;
          pm.integrate = 0;
          pm.colony = null;
          pm.siege = null;
          const nation = s.nations[x.n];
          pm.pops.push(
            ...settlerPops(nation.culture, nation.religion, PORT_SETTLERS),
          );
          merge(pm.pops);
          pm.b.port = 1;
          g.nation(x.n).stats.coloniesFounded++;
          g.event({ k: "colony", day: s.day, n: x.n, p });
          provinceTaken(g, p, -1, x.n);
          ensureOffices(g, p);
          text = `A wharf, a storehouse and a street of cabins at ${place}: the colony has a new port, and a new town with it.`;
        } else {
          x.result = "failed";
          text = `${place} was someone else's before they got there.`;
        }
      } else text = `Storms and sickness: the work at ${place} was given up.`;
      break;
    }
    case "raid":
      text = raidDone(g, x, band, how);
      break;
  }
  if (band === "failed") {
    const share =
      LOSS.men[0] + edice(s, 0x53, x.id).next() * (LOSS.men[1] - LOSS.men[0]);
    const lost = loseMen(g, x, share);
    if (lost) text += ` ${menWords(lost)} lost.`;
    const hurtP = x.kind === "raid" ? LOSS.hurt.raid : LOSS.hurt.other;
    if (edice(s, 0x54, x.id).chance(hurtP)) {
      const amt =
        LOSS.hurtBy[0] +
        Math.floor(
          edice(s, 0x55, x.id).next() * (LOSS.hurtBy[1] - LOSS.hurtBy[0]),
        );
      const t = hurtLeader(
        g,
        x,
        amt,
        x.kind === "raid"
          ? "a wound taken on a raid"
          : "hardship on an expedition",
        x.kind === "raid" ? LOSS.npcDies.raid : LOSS.npcDies.other,
      );
      if (t) text += ` ${t}`;
    }
  }
  x.note = text;
  tell(
    g,
    x,
    text,
    band === "won" ? "good" : band === "failed" ? "bad" : undefined,
  );
  // The players with it see the country.
  if (x.kind === "discover" || x.kind === "river")
    for (const l of partyLives(s, x)) reveal(g, l, surveyed(g, x));
  expedChanged(g);
  return text;
}

/** What a discovery or a river's mapping saw. */
export function surveyed(g: ConquestGame, x: Expedition): number[] {
  const p = x.target;
  const map = g.map;
  if (x.result === "failed" || x.result === "turned") return [p];
  if (x.kind === "river") {
    const want = x.result === "won" ? 8 : 4;
    const seen = new Set<number>([p]);
    let edge = [p];
    while (edge.length && seen.size < want) {
      const next: number[] = [];
      for (const q of edge)
        for (const [r, , river] of map.provinces[q].nb)
          if (river === 1 && !seen.has(r) && seen.size < want) {
            seen.add(r);
            next.push(r);
          }
      edge = next;
    }
    return [...seen];
  }
  const near = map.provinces[p].nb.map(([q]) => q);
  if (x.result === "half") return [p, ...near];
  const wide = new Set<number>([p, ...near]);
  for (const q of near) for (const [r] of map.provinces[q].nb) wide.add(r);
  return [...wide];
}

// ---------------------------------------------------------------- a raid and its answer

function raidDone(
  g: ConquestGame,
  x: Expedition,
  band: "won" | "half" | "failed" | "turned",
  how: { tribute?: boolean; regard?: number },
): string {
  const s = g.s;
  const p = x.target;
  const pr = s.provinces[p];
  const place = name(g, p);
  const owner = pr.owner;
  const nat = s.nations[owner];
  if (!nat || nat.kind !== "native")
    return `${place} was empty when they got there.`;
  const atPeace = !atWar(s, owner, x.n);
  let text = "";
  if (band === "turned") {
    relate(g, owner, x.n, `Armed men came to ${place}`, -8, 5);
    return `They looked at ${place} from the tree line, and turned for home. The town saw them go.`;
  }
  if (how.tribute) {
    if (band === "won" || band === "half") {
      const pl = Math.round(plunderOf(s, p) * (band === "won" ? 0.5 : 0.25));
      x.haul = pl;
      relate(g, owner, x.n, `Tribute demanded at ${place} under arms`, -15, 8);
      text = `The elders of ${place} paid rather than fight: ${pl} coins' worth of skins and corn. They'll remember the muskets.`;
      return text;
    }
    relate(g, owner, x.n, `Threats at ${place}`, -20, 8);
    // Refused: no fight, but no forgetting.
    text = `The elders of ${place} refused, and the warriors were ready. The party withdrew.`;
    queueAnswer(g, x, 0.5);
    return text;
  }
  if (band === "won" || band === "half") {
    const pl =
      band === "won" ? plunderOf(s, p) : Math.round(plunderOf(s, p) * 0.4);
    x.haul = pl;
    const pm = g.prov(p);
    pm.devastation = Math.min(
      1,
      pm.devastation + (band === "won" ? RAID.townRuin : RAID.townRuin / 2),
    );
    if (band === "won")
      for (const pop of pm.pops)
        if (pop.culture === nat.culture)
          pop.size = Math.max(1, Math.round(pop.size * (1 - RAID.townFled)));
    relate(
      g,
      owner,
      x.n,
      `The raid on ${place}`,
      band === "won" ? RAID.regard : RAID.regardHalf,
      RAID.years,
    );
    text =
      band === "won"
        ? `They fell on ${place} at first light. Its people fled into the woods; the corn stores and the furs were carried off and the fields burned. ${pl} coins' worth of plunder.`
        : `${place} was half-ready: the warriors held the town while its people got away, and the party carried off what it could from the outlying fields: ${pl} coins' worth.`;
  } else {
    relate(
      g,
      owner,
      x.n,
      `The raid on ${place}`,
      RAID.regardFailed,
      RAID.years,
    );
    text = `The warriors of ${place} were waiting. The party was beaten off and fell back through the woods.`;
  }
  raidOpinions(g, x);
  // The colony's frontier waits for the answer.
  const n = g.nation(x.n);
  n.mods = n.mods.filter((m) => m.key !== "r21:fear");
  n.mods.push({
    key: "r21:fear",
    label: `The frontier fears the ${nat.name}`,
    until: s.day + DAYS_PER_YEAR,
    fx: { unrest: RAID.fear },
  });
  if (atPeace) {
    if (!x.leave) {
      // A private raid in peacetime: the law's business, and London's.
      for (const l of partyLives(s, x)) {
        addFavor(g, l, RAID.privateFavour);
        addHeat(g, l, x.n, RAID.privateHeat);
      }
      n.mods.push({
        key: "r21:raid-shame",
        label: "Raiders the governor didn't stop",
        until: s.day + DAYS_PER_YEAR,
        fx: { favor: -3 },
      });
      text +=
        " The governor never gave leave for it, and the law will want words.";
    } else {
      n.mods.push({
        key: "r21:raid-shame",
        label: "A raid in peacetime",
        until: s.day + DAYS_PER_YEAR,
        fx: { favor: -2 },
      });
    }
    queueAnswer(g, x, 1);
  }
  g.event({
    k: "news",
    day: s.day,
    n: x.n,
    p,
    text:
      band === "failed"
        ? `Raiders from ${s.nations[x.n].name} were beaten off at ${place}.`
        : `Raiders from ${s.nations[x.n].name} fell on ${place} of the ${nat.name}.`,
  });
  rumour(
    g,
    x.from,
    band === "failed"
      ? `The raid on ${place} was beaten off.`
      : `${charName(s.chars[x.leader])}'s men burned ${place}. Everyone's asking what the ${nat.name} will do.`,
    x.leader,
  );
  return text;
}

/** The nation's answer to a raid in peacetime: war at once, or a war party on the frontier. */
function queueAnswer(g: ConquestGame, x: Expedition, weight: number): void {
  const s = g.s;
  const owner = s.provinces[x.target].owner;
  const nat = s.nations[owner];
  if (!nat || atWar(s, owner, x.n)) return;
  const r = edice(s, 0x60, x.id, owner);
  const pWar = Math.min(
    0.9,
    (RAID.war + (nat.strong ? RAID.warStrong : 0)) * weight,
  );
  if (r.chance(pWar)) {
    startWar(g, owner, x.n, `Revenge for ${name(g, x.target)}`, false);
    g.event({
      k: "news",
      day: s.day,
      n: owner,
      p: x.target,
      text: `The ${nat.name} take up the hatchet against ${s.nations[x.n].name}: revenge for ${name(g, x.target)}.`,
    });
    tell(
      g,
      x,
      `The ${nat.name} have gone to war with the colony over it.`,
      "bad",
    );
    return;
  }
  if (!r.chance(RAID.reprisal * weight)) return;
  // The colony's county nearest the raided town.
  const county = frontierCounty(g, x.n, x.target);
  if (county < 0) return;
  const [lo, hi] = RAID.reprisalDays;
  expedState(g).reprisals.push({
    n: owner,
    against: x.n,
    p: county,
    day: s.day + lo + Math.floor(r.next() * (hi - lo)),
    from: x.target,
  });
  expedChanged(g);
}

/** The colony's county nearest a place (its frontier there). */
export function frontierCounty(
  g: ConquestGame,
  n: number,
  near: number,
): number {
  let best = -1;
  let bestKm = Infinity;
  for (const p of provincesOf(g.s, n)) {
    const a = g.map.provinces[p];
    const b = g.map.provinces[near];
    const km = Math.hypot(a.x - b.x, a.y - b.y);
    if (km < bestKm) {
      bestKm = km;
      best = p;
    }
  }
  return best;
}

/** The chance the frontier's rangers meet a war party and turn it. */
export function rangersTurn(s: GameState, n: number): number {
  const r = s.nations[n]?.desk?.rangers ?? 0;
  return Math.min(RAID.rangerMax, r * RAID.rangerTurns);
}

function reprisalsDaily(g: ConquestGame): void {
  const s = g.s;
  const st = expedState(g);
  const due = st.reprisals.filter((r) => r.day <= s.day);
  if (!due.length) return;
  st.reprisals = st.reprisals.filter((r) => r.day > s.day);
  expedChanged(g);
  for (const r of due) {
    const nat = s.nations[r.n];
    const col = s.nations[r.against];
    if (!nat?.alive || !col?.alive || s.provinces[r.p]?.owner !== r.against)
      continue;
    if (atWar(s, r.n, r.against)) continue; // the war is the answer
    const place = name(g, r.p);
    if (edice(s, 0x61, r.p, r.day).chance(rangersTurn(s, r.against))) {
      g.event({
        k: "news",
        day: s.day,
        n: r.against,
        p: r.p,
        text: `The colony's rangers met a war party of the ${nat.name} near ${place} and turned it back.`,
      });
      continue;
    }
    const pm = g.prov(r.p);
    pm.devastation = Math.min(1, pm.devastation + RAID.ruin);
    pm.unrest = Math.min(100, pm.unrest + RAID.unrest);
    for (const pop of pm.pops)
      if (pop.culture === col.culture)
        pop.size = Math.max(1, Math.round(pop.size * (1 - RAID.settlersLost)));
    g.event({
      k: "news",
      day: s.day,
      n: r.n,
      p: r.p,
      text: `A war party of the ${nat.name} fell on the farms about ${place}: the answer for ${name(g, r.from)}.`,
    });
    for (const l of s.lives) {
      if (l.c < 0 || l.watching) continue;
      if (l.home === r.p || (l.prov === r.p && !l.travel))
        raiseScene(g, l, "exped-reprisal", null, {
          p: r.p,
          n: r.n,
          from: r.from,
        });
    }
  }
}

// ---------------------------------------------------------------- home again

function homecoming(g: ConquestGame, x: Expedition): void {
  const s = g.s;
  const st = expedState(g);
  st.list = st.list.filter((y) => y.id !== x.id);
  const band = x.result ?? "failed";
  const r = REWARD[x.kind];
  const k = band === "won" ? 0 : band === "half" ? 1 : -1;
  const players = partyLives(s, x);
  // Home: the party breaks up.
  for (const l of players) {
    touchLife(g, l).travel = null;
    if (l.prov !== x.from) {
      l.prov = x.from;
      visit(g, l, x.from);
    }
    wake(g, l, `You're home at ${name(g, x.from)}.`);
  }
  const org = x.by ? lifeOfSeat(s, x.by) : undefined;
  if (org)
    for (const f of peopleOf(org))
      if (
        f.task?.what === "expedition" &&
        (x.people.includes(f.id) || f.c === x.leader)
      ) {
        touchLife(g, org);
        f.task = null;
        f.deeds = (f.deeds ?? 0) + 1;
        f.loyalty = Math.min(100, f.loyalty + 3);
      }
  // What the colony gets: the maps.
  let found: number[] = [];
  if ((x.kind === "discover" || x.kind === "river") && k >= 0) {
    found = surveyProvinces(g, x.n, surveyed(g, x));
    for (const l of s.lives)
      if (fogged(l) && s.chars[l.c]?.nation === x.n)
        reveal(g, l, surveyed(g, x));
  }
  const rich = found.filter((p) => s.provinces[p].rich);
  // The haul: a governor's own goes to the treasury (half of a raid's); the rest is the players'.
  let haul = x.haul ?? 0;
  if (haul > 0 && x.treasury > 0 && x.grant === undefined) {
    const toT = x.kind === "raid" ? Math.round(haul / 2) : haul;
    g.nation(x.n).gold += toT;
    haul -= toT;
  }
  const sharers = [...new Set([...(org ? [org] : []), ...players])].filter(
    (l) => l.c >= 0,
  );
  const each = sharers.length
    ? Math.floor((haul / sharers.length) * 10) / 10
    : 0;
  // Renown, favour and skill: the leader in full, the rest half.
  const leaderLife = lifeOfChar(s, x.leader);
  for (const l of sharers) {
    const lead = l.c === x.leader;
    const share = lead ? 1 : 0.5;
    if (each > 0)
      withFlow(
        g,
        {
          key: `exped:${x.id}:back`,
          label: `${KINDS[x.kind].name}: what it brought`,
          chance: true,
          aff: "expedition",
        },
        () => earn(g, l, each),
      );
    if (k === 0 || k === 1) {
      const went = players.includes(l);
      const ren = Math.round(
        r.renown[k] * share * (went || l === org ? 1 : 0.5) +
          (lead ? Math.min(6, rich.length * 2) : 0),
      );
      if (ren) addRenown(g, l, ren);
      const fav =
        x.kind === "raid" &&
        !x.leave &&
        !atWar(s, s.provinces[x.target].owner, x.n)
          ? 0
          : Math.round(
              r.favour[k] * share + (lead ? Math.min(3, rich.length) : 0),
            );
      if (fav) addFavor(g, l, fav);
      if (went) gainXp(g, l, KINDS[x.kind].skill, Math.round(r.xp[k] * share));
    } else if (players.includes(l)) {
      addStress(g, l, 6);
      gainXp(g, l, KINDS[x.kind].skill, 8);
    }
  }
  // A line in the story: the leader's, and the organiser's.
  const words = storyWords(g, x, band, rich.length);
  if (leaderLife && leaderLife.c === x.leader)
    milestone(g, leaderLife, "voyage", words, x.target, {
      tone: band === "failed" ? "bad" : "good",
      big:
        band === "won" &&
        (x.kind === "river" || x.kind === "port" || rich.length > 0),
    });
  if (org && org !== leaderLife)
    milestone(
      g,
      org,
      "voyage",
      `Sent ${expedWords(g.map, x)}: ${band === "won" ? "it went well" : band === "half" ? "a poor showing" : band === "turned" ? "turned back" : "it failed"}`,
      x.target,
      { tone: band === "failed" ? "bad" : "good" },
    );
  // Everyone's told.
  const words0 = expedWords(g.map, x);
  const summary = `${words0[0].toUpperCase()}${words0.slice(1)} is home at ${name(g, x.from)}: ${band === "won" ? "it went well" : band === "half" ? "a poor showing" : band === "turned" ? "they turned back" : "it failed"}.${rich.length ? ` Rich land found: ${rich.map((p) => name(g, p)).join(", ")}.` : ""}${each > 0 ? ` ${each} coins each from what it brought.` : ""}`;
  tell(
    g,
    x,
    summary,
    band === "won" ? "good" : band === "failed" ? "bad" : undefined,
  );
  if (org && !players.includes(org)) wake(g, org, summary);
  if (k >= 0 || x.kind === "raid")
    g.event({
      k: "news",
      day: s.day,
      n: x.n,
      p: x.target,
      text: `${charName(s.chars[x.leader])}'s ${KINDS[x.kind].name.toLowerCase()} is home: ${x.note ?? ""}`,
    });
  const past: ExpedPast = {
    id: x.id,
    kind: x.kind,
    n: x.n,
    by: x.by,
    leader: x.leader,
    target: x.target,
    start: x.start,
    end: s.day,
    result: band,
    note: x.note ?? "",
    members: x.members.map((m) => m.seat),
  };
  st.past.push(past);
  if (st.past.length > 40) st.past.splice(0, st.past.length - 40);
  expedChanged(g);
}

function storyWords(
  g: ConquestGame,
  x: Expedition,
  band: string,
  rich: number,
): string {
  const place = name(g, x.target);
  if (band === "failed") return `Led ${expedWords(g.map, x)}; it failed`;
  if (band === "turned") return `Led ${expedWords(g.map, x)}, and turned back`;
  switch (x.kind) {
    case "discover":
      return `Explored the country about ${place}${rich ? " and found rich land" : ""}`;
    case "river": {
      const seen = surveyed(g, x);
      const last = seen[seen.length - 1];
      return `Mapped the river from ${place}${last !== x.target ? ` to ${name(g, last)}` : ""}`;
    }
    case "trade":
      return `Opened trade with ${place}`;
    case "outpost":
      return `Raised an outpost at ${place}`;
    case "mission":
      return `Founded a mission at ${place}`;
    case "raid":
      return `Led a raid on ${place}`;
    case "port":
      return `Founded the port at ${place}`;
  }
}

// ---------------------------------------------------------------- a grant from the treasury

export { grantOdds } from "./ExpedGrant";

// ---------------------------------------------------------------- commands

export function expedCommand(
  g: ConquestGame,
  life: Life,
  c: ExpedCommand,
): string | null {
  if (!meOf(g.s, life) || life.watching) return "You're watching.";
  switch (c.act) {
    case "plan":
      return planExped(g, life, c);
    case "go": {
      if (c.kind) {
        const err = planExped(g, life, c);
        if (err) return err;
      }
      return goExped(g, life);
    }
    case "cancel":
      return cancelExped(g, life);
    case "invite":
      return inviteExped(g, life, c.seat ?? "");
    case "uninvite": {
      const x = myForming(g.s, life.seat);
      if (!x) return "You're not getting one up.";
      x.asked = x.asked.filter((y) => y !== c.seat);
      x.members = x.members.filter((m) => m.seat !== c.seat);
      expedChanged(g);
      return null;
    }
    case "answer":
      return answerInvite(g, life, c.id ?? -1, !!c.yes);
    case "leave":
      return leaveExped(g, life);
    case "ask":
      return askGrant(g, life, c.gold ?? 0);
    case "grant":
      return answerGrant(g, life, c.id ?? -1, c.give ?? "none");
    default:
      return "Unknown order.";
  }
}

hooks.command.push((g, life, c) =>
  c.k === "exped" ? expedCommand(g, life, c) : undefined,
);

// ---------------------------------------------------------------- out working

hooks.affairs.push((s, w, life) => {
  const x = myExped(s, life.seat);
  if (!x || x.stage === "forming") return [];
  const place = w.map.provinces[x.target]?.name ?? "?";
  return [
    {
      kind: "expedition",
      id: `exped:${x.id}`,
      title: `${KINDS[x.kind].name}: ${place}`,
      what: `${x.men} men under ${charName(s.chars[x.leader])}`,
      status:
        x.stage === "out"
          ? "on the way there"
          : x.stage === "there"
            ? "at work there"
            : "on the way home",
      due: x.stage === "out" ? x.arrive : x.home,
      cost: 0,
      go: { tab: "work", sub: "expeditions" },
    },
  ];
});

/** When the party's due back, in words. */
export function dueWords(x: Expedition): string {
  return x.stage === "out"
    ? `there about ${formatDate(x.arrive)}`
    : x.stage === "there"
      ? `at work; home about ${formatDate(x.home)}`
      : `home about ${formatDate(x.home)}`;
}

/** The far end's roll for a party led by one of the computer's people, at the shown odds (and an approach's shift). */
export function farRoll(
  g: ConquestGame,
  x: Expedition,
  dcShift = 0,
): "won" | "half" | "failed" {
  const s = g.s;
  const ch = workChance(s, g.w, draftOf(x), s.day);
  const p = checkChance(ch.skill.total, ch.dc.total + dcShift);
  return bandOf(p, edice(s, 0x70, x.id).next());
}

/** A remembered kindness or grudge for the characters who care about a raid. */
export function raidOpinions(g: ConquestGame, x: Expedition): void {
  const s = g.s;
  const leader = s.chars[x.leader];
  if (!leader) return;
  for (const id of s.locals[x.from] ?? []) {
    const c = s.chars[id];
    if (!c?.alive || c.id === leader.id) continue;
    if (c.traits.includes("tolerant") || c.traits.includes("just"))
      remember(g, c, {
        of: leader.id,
        why: "Led a raid on a native town",
        value: -10,
        years: 5,
      });
    else if (c.traits.includes("cruel") || c.role === "soldier")
      remember(g, c, {
        of: leader.id,
        why: "Led a raid on a native town",
        value: 5,
        years: 3,
      });
  }
}
