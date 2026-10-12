// SEA (r15): the trades that travel, gone in person. Before, a merchant
// sailor's voyages, a whaler's season on the grounds, the fur trader's
// brigade to the posts and a surveyor's patents in the backcountry were
// all worked at home. Now, every month or two, the work itself comes to
// you as a choice (a scene): go with it, physically, across the map; or
// stay ashore (or send word, or your deputy) for less.
//
// - A merchant sailor (a deckhand to a ship's captain): the ship sails for
//   a port down the coast or in the islands. Go aboard (with a private
//   venture of your own, the sailor's "privilege"), a few days ashore at
//   the far end (be aboard when she sails home, or she goes without you),
//   and home. Wages as ever; the venture comes home with you.
// - A whaler: a season on the grounds (off Nantucket, on the Banks, in the
//   Strait of Belle Isle), paid by the lay: your part of the catch, by rank.
// - The fur trade (a fur trader or a company partner; a native trader): the
//   brigade goes up to the posts with trade goods and comes back with furs.
//   Go with it, or send your goods with it and take a smaller part.
// - A surveyor: run the lines of a patent out in the backcountry, for a
//   fee; or send your deputy for half of it.
//
// The soldier already marches with his army; the trades nobody follows
// here (a drover, a pedlar, a post rider) aren't jobs in the game.
//
// The sea's own dice decide the luck; a scene's choice rolls as every
// scene does.

import { BOATS, boatRoute } from "./Boats";
import { formatDate } from "./Calendar";
import { reveal } from "./Fog";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { affairNews } from "./Ledger";
import { withFlow } from "./LedgerCore";
import {
  addRenown,
  earn,
  gainXp,
  hurt,
  journal,
  milestone,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import {
  type Check,
  hasPlace,
  hopDaysFor,
  isChildLife,
  lifeIsNative,
  lifeOfSeat,
  meOf,
  no,
  skillLevel,
  travelRoute,
  yes,
} from "./LifeQueries";
import type { World } from "./Map";
import type { OddsOutcome, OddsView } from "./Odds";
import { chanceWords } from "./Odds";
import { wake } from "./Pace";
import { charName, settlers } from "./Queries";
import { kmApart, sdice, seaChanged, seaOf, seaState } from "./SeaCore";
import { passageHopDays } from "./SeaSpeed";
import { madeReady, STORM_AT_SEA, stormName } from "./Storms";
import type {
  GameState,
  JobKind,
  Life,
  LifeCommand,
  MapDef,
  Storm,
  Voyage,
  VoyageKind,
} from "./Types";
import { bossOf } from "./Work";

const r1 = (v: number) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------- the table

/** What a voyage's luck can come to: a venture's (or a brigade's goods') return, times the stake. */
export const VENTURE_LUCK: { p: number; x: number; label: string }[] = [
  { p: 0.08, x: 0, label: "lost: a wreck, a seizure, a glut nobody would buy" },
  { p: 0.25, x: 0.9, label: "a poor market" },
  { p: 0.45, x: 1.3, label: "a fair one" },
  { p: 0.22, x: 1.7, label: "a rich one" },
];

/** The fur brigade's luck with the trade goods. */
export const FUR_LUCK: { p: number; x: number; label: string }[] = [
  { p: 0.06, x: 0, label: "robbed on the portage, or the canoes lost in a rapid" },
  { p: 0.24, x: 1.1, label: "a thin year at the posts" },
  { p: 0.46, x: 1.6, label: "a fair trade" },
  { p: 0.24, x: 2.2, label: "prime winter beaver, and plenty of it" },
];

export interface VoyageDef {
  name: string;
  /** Days between offers, at the least. */
  every: number;
  /** Days at the far end (ashore, or on the grounds). */
  stay: [number, number];
  /** Coins you may put into a venture, by rank (0 for none). */
  stakes: number[];
  text: string;
}

export const VOYAGE_DEFS: Record<VoyageKind, VoyageDef> = {
  merchant: {
    name: "A voyage",
    every: 45,
    stay: [4, 8],
    stakes: [5, 10, 20, 40, 40],
    text: "The ship you serve in sails for another port. Go aboard (with a little venture of your own: the sailor's privilege), see the far port a few days, and come home with her. Or stay ashore and work the quay.",
  },
  whaling: {
    name: "A whaling voyage",
    every: 60,
    stay: [24, 40],
    stakes: [0, 0, 0, 0],
    text: "A season on the whaling grounds, paid by the lay: your part of the catch, by rank. Or stay ashore and work alongshore.",
  },
  furs: {
    name: "The brigade to the posts",
    every: 75,
    stay: [5, 9],
    stakes: [0, 0, 20, 40, 60],
    text: "The canoe brigade goes up to the far posts with trade goods and comes back with furs. Go with it, or send your goods with it and take a smaller part.",
  },
  survey: {
    name: "A survey in the backcountry",
    every: 70,
    stay: [6, 10],
    stakes: [0, 0, 0, 0],
    text: "A patent to run in the backcountry: chain, compass and the woods, for a fee. Or send your deputy for half of it.",
  },
};

/** A whale taken: what the catch is worth (oil and bone). */
export const WHALE_VALUE: [number, number] = [110, 190];
/** The lay: a whaleman's part of the catch, by rank (greenhand to master). */
export const LAY = [1 / 60, 1 / 35, 1 / 20, 1 / 10];
/** A chance at a whale every so many days on the grounds, and the chance one's taken. */
export const WHALE_CHANCE_DAYS = 6;
export const WHALE_TAKEN = 0.38;
/** A surveyor's fee, by rank, for a patent run; the deputy takes half. */
export const SURVEY_FEE = [8, 12, 18, 26];
/** Sending your goods with the brigade: its master's cut. */
export const SEND_SHARE = 0.6;

/** The trade a voyage belongs to, for a job. */
export function voyageKindOf(job: JobKind, rank: number, native: boolean): VoyageKind | null {
  if (job === "sailor" && rank <= 3) return "merchant";
  if (job === "whaler") return "whaling";
  if (job === "trapper" && rank >= 2) return "furs";
  if (job === "trader" && native && rank >= 1) return "furs";
  if (job === "surveyor") return "survey";
  return null;
}

// ---------------------------------------------------------------- where to

/** Whaling grounds: the stations whalers worked out of the northern ports. */
const WHALING_GROUNDS = ["plymouth", "narragansett", "paumanok", "avalon", "chebucto"];

/** Where a voyage would go from here, or -1 (the same for everyone this month). */
export function destinationOf(
  s: GameState,
  w: World,
  kind: VoyageKind,
  from: number,
  salt: number,
): number {
  const map = w.map;
  const r = sdiceFor(s, from, salt);
  const here = map.provinces[from];
  if (kind === "merchant" || kind === "whaling") {
    const list: number[] = [];
    map.provinces.forEach((d, p) => {
      if (p === from || !d.coastal || d.closed) return;
      if (kind === "whaling") {
        if (!WHALING_GROUNDS.includes(d.id)) return;
      } else if ((s.provinces[p].b.port ?? 0) <= 0 || settlers(s.provinces[p]) < 300) return;
      const km = kmApart(here.lat, here.lon, d.lat, d.lon);
      if (kind === "merchant" && (km < 350 || km > 3200)) return;
      if (kind === "whaling" && km > 1600) return;
      if (!boatRoute(map, from, p, "brig")) return;
      list.push(p);
    });
    return r.pick(list) ?? -1;
  }
  // Overland: the far posts (a native town), or the backcountry (open country).
  const route = (p: number) => travelRoute(s, map, from, p, false, kind === "furs");
  const list: number[] = [];
  map.provinces.forEach((d, p) => {
    if (p === from || d.closed) return;
    const km = kmApart(here.lat, here.lon, d.lat, d.lon);
    if (km < 250 || km > 900) return;
    const owner = s.provinces[p].owner;
    if (kind === "furs") {
      if (owner < 0 || s.nations[owner]?.kind !== "native") return;
    } else if (owner >= 0 && settlers(s.provinces[p]) > 400) return;
    list.push(p);
  });
  // A few tried, nearest first, for one with a road.
  const sorted = list.sort(
    (a, b) =>
      kmApart(here.lat, here.lon, map.provinces[a].lat, map.provinces[a].lon) -
      kmApart(here.lat, here.lon, map.provinces[b].lat, map.provinces[b].lon),
  );
  const pickFrom = sorted.slice(0, 8);
  for (let i = 0; i < 4 && pickFrom.length; i++) {
    const p = pickFrom.splice(r.int(0, pickFrom.length - 1), 1)[0];
    const rt = route(p);
    if (rt && rt.path.length >= 2 && rt.path.length <= 9) return p;
  }
  return -1;
}

function sdiceFor(s: GameState, p: number, salt: number) {
  const month = Math.floor(s.day / 30);
  let h = (s.settings.seed | 0) ^ Math.imul(p + 31, 0x9e3779b1) ^ Math.imul(month + salt, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  const holder = { rng: h | 0 };
  return new (class {
    next = () => {
      holder.rng = (Math.imul(holder.rng, 1664525) + 1013904223) | 0;
      return ((holder.rng >>> 0) % 1000000) / 1000000;
    };
    int = (lo: number, hi: number) => lo + Math.floor(this.next() * (hi - lo + 1));
    pick = <T>(xs: readonly T[]): T | undefined => (xs.length ? xs[this.int(0, xs.length - 1)] : undefined);
  })();
}

/** Days for one leg of a voyage: a ship at a passage's pace, a brigade on the rivers, a party on foot. */
function legDays(map: MapDef, from: number, to: number, sea: boolean, kind: VoyageKind, day: number): number {
  if (sea) {
    const lane = map.provinces[from].sea.find(([q]) => q === to);
    return lane ? passageHopDays(lane[1], true) : 3;
  }
  const d = hopDaysFor(map, from, to, false, 1, day);
  const days = d < 0 ? 4 : d;
  // Canoes on the rivers go quicker than walking.
  return kind === "furs" ? Math.max(1, Math.round(days * 0.75)) : days;
}

/** The way from one place to another for a voyage: by sea for a ship, overland for the rest. */
function routeOf(
  s: GameState,
  map: MapDef,
  kind: VoyageKind,
  from: number,
  to: number,
): { path: number[]; sea: boolean[]; days: number } | null {
  if (kind === "merchant" || kind === "whaling") {
    const r = boatRoute(map, from, to, "brig");
    if (!r) return null;
    return { path: r.path, sea: r.path.map(() => true), days: r.days };
  }
  const r = travelRoute(s, map, from, to, false, kind === "furs");
  if (!r) return null;
  return {
    path: r.path,
    sea: r.sea,
    days: Math.round(r.days * (kind === "furs" ? 0.75 : 1)),
  };
}

// ---------------------------------------------------------------- who goes

/** A voyage of your trade could be offered here now: your job, your post, nothing else afoot. */
export function voyageReady(s: GameState, w: World, life: Life): VoyageKind | null {
  const job = life.job;
  if (!job || life.travel || life.crime?.jail || isChildLife(s, life)) return null;
  if (job.army >= 0) return null;
  const kind = voyageKindOf(job.kind, job.rank, lifeIsNative(s, life));
  if (!kind) return null;
  if (life.prov !== job.prov) return null;
  if (kind === "merchant" || kind === "whaling") {
    if (!hasPlace(s, w, life.prov, "docks")) return null;
  }
  if (seaOf(s).voyages.some((v) => v.seat === life.seat && v.phase !== "done")) return null;
  if (seaOf(s).cruises.some((c) => c.phase !== "done" && c.phase !== "lost" && c.hands.some((h) => h.seat === life.seat)))
    return null;
  if ((life.cooldowns[`voy:${kind}`] ?? 0) > s.day) return null;
  return kind;
}

/** The stake you may put in a venture, by your rank. */
export function stakeFor(life: Life, kind: VoyageKind): number {
  const r = life.job?.rank ?? 0;
  const list = VOYAGE_DEFS[kind].stakes;
  return list[Math.min(r, list.length - 1)] ?? 0;
}

/** The lay (whaling), by rank. */
export function layOf(life: Life): number {
  return LAY[Math.min(life.job?.rank ?? 0, LAY.length - 1)];
}

// ---------------------------------------------------------------- the odds

/** What a voyage stands to bring you, before you go (or stay). */
export function voyageOdds(
  s: GameState,
  w: World,
  life: Life,
  kind: VoyageKind,
  to: number,
  go: boolean,
): OddsView {
  const def = VOYAGE_DEFS[kind];
  const from = life.prov;
  const rt = to >= 0 ? routeOf(s, w.map, kind, from, to) : null;
  const passage = rt ? rt.days : 10;
  const days: [number, number] = [passage * 2 + def.stay[0], passage * 2 + def.stay[1]];
  const outcomes: OddsOutcome[] = [];
  let expected = 0;
  let cost = 0;
  let hi = 0;
  const risks: OddsView["risks"] = [];
  const factors: string[] = [];
  if (kind === "merchant" || kind === "furs") {
    const stake = stakeFor(life, kind);
    const luck = kind === "furs" ? FUR_LUCK : VENTURE_LUCK;
    const mult = go ? 1 : SEND_SHARE;
    cost = stake;
    for (const l of luck)
      outcomes.push({
        label: l.label,
        p: l.p,
        lo: r1(stake * l.x * mult),
        hi: r1(stake * l.x * mult),
        bad: l.x < 1,
      });
    expected = r1(luck.reduce((m, l) => m + l.p * l.x * stake * mult, 0));
    hi = r1(stake * luck[luck.length - 1].x * mult);
    factors.push(
      kind === "furs"
        ? go
          ? "Going with the brigade, the whole of the trade is yours."
          : `Sent with the brigade, its master takes his cut: you get ${Math.round(SEND_SHARE * 100)} in a hundred.`
        : "Your rank sets the venture: a deckhand's privilege is small, a captain's large.",
    );
  } else if (kind === "whaling") {
    const chances = Math.floor(((def.stay[0] + def.stay[1]) / 2) / WHALE_CHANCE_DAYS);
    const mean = chances * WHALE_TAKEN;
    const lay = layOf(life);
    const each = ((WHALE_VALUE[0] + WHALE_VALUE[1]) / 2) * lay;
    const p0 = Math.pow(1 - WHALE_TAKEN, chances);
    outcomes.push({ label: "a dry voyage: no whale", p: p0, lo: 0, hi: 0, bad: true });
    const p1 = chances * WHALE_TAKEN * Math.pow(1 - WHALE_TAKEN, chances - 1);
    outcomes.push({ label: "one whale", p: p1, lo: r1(WHALE_VALUE[0] * lay), hi: r1(WHALE_VALUE[1] * lay) });
    outcomes.push({
      label: "two or more",
      p: Math.max(0, 1 - p0 - p1),
      lo: r1(WHALE_VALUE[0] * lay * 2),
      hi: r1(WHALE_VALUE[1] * lay * chances),
    });
    expected = go ? r1(mean * each) : 0;
    hi = r1(WHALE_VALUE[1] * lay * chances);
    risks.push({ label: "A stove boat (a wound)", p: 0.12, note: "a whale's flukes" });
    factors.push(`Your lay is 1/${Math.round(1 / lay)} of the catch: it grows with your rank.`);
    if (!go) {
      outcomes.length = 0;
      factors.unshift("Staying ashore, you work alongshore at your wage: no lay.");
    }
  } else {
    const fee = SURVEY_FEE[Math.min(life.job?.rank ?? 0, SURVEY_FEE.length - 1)];
    outcomes.push({ label: go ? "the patent run, and your fee" : "your deputy's half of the fee", p: 1, lo: go ? fee : fee / 2, hi: go ? fee : fee / 2 });
    expected = go ? fee : fee / 2;
    hi = expected;
    if (go) factors.push("Going yourself: the whole fee, renown with the gentry, and the woods' skill.");
  }
  if (go) {
    if (kind === "merchant" || kind === "whaling")
      risks.push(
        { label: "Storms, and in their season hurricanes", p: 0.15, note: "the ship damaged, days lost, a wound" },
        { label: "Left behind if you're not aboard when she sails home", p: 0, note: "be at the quay on the day" },
      );
    else
      risks.push({ label: "The road's dangers: rivers, robbers, a fever", p: 0.2, note: "a few days lost, a wound" });
    factors.push("Your wages go on as at your post.");
  }
  return {
    title: `${def.name}${to >= 0 ? ` to ${w.map.provinces[to].name}` : ""}${go ? "" : ", staying"}`,
    ok: true,
    costNow: cost,
    costMonth: 0,
    per: "trip",
    days,
    outcomes,
    expected,
    lo: 0,
    hi,
    net: r1((expected - cost) / Math.max(1, (days[0] + days[1]) / 60)),
    risks,
    factors: factors.map((f) => f.replace("1 in", chanceWords(0.1) === "" ? "1 in" : "1 in")),
  };
}

// ---------------------------------------------------------------- going and staying

/** The offer: the work comes to you (a scene), every month or two at your post. */
function offerDaily(g: ConquestGame, life: Life): void {
  const s = g.s;
  const kind = voyageReady(s, g.w, life);
  if (!kind) return;
  if (life.events.some((e) => e.key === "sea-voyage")) return;
  if (!sdice(g).chance(1 / 20)) return;
  const to = destinationOf(s, g.w, kind, life.prov, life.c);
  if (to < 0) {
    life.cooldowns[`voy:${kind}`] = s.day + 30;
    return;
  }
  touchLife(g, life);
  life.cooldowns[`voy:${kind}`] = s.day + VOYAGE_DEFS[kind].every;
  const k = Object.keys(VOYAGE_DEFS).indexOf(kind);
  const boss = bossOf(s, life);
  raiseEvent(g, life, "sea-voyage", {
    k,
    to,
    c: boss && !s.lives.some((l) => l.c === boss.id) ? boss.id : -1,
  });
}

/** Go: the voyage begins (the ship sails, the brigade sets off). */
export function goVoyage(
  g: ConquestGame,
  life: Life,
  kind: VoyageKind,
  to: number,
  stake: boolean,
): string | null {
  const s = g.s;
  if (life.travel) return "You're on the road.";
  const rt = routeOf(s, g.map, kind, life.prov, to);
  if (!rt || !rt.path.length) return "There's no way there now.";
  const amount = stake ? stakeFor(life, kind) : 0;
  if (amount > life.purse) return `The venture is ${amount} coins.`;
  const def = VOYAGE_DEFS[kind];
  const r = sdice(g);
  const boss = bossOf(s, life);
  const v: Voyage = {
    id: g.nextId(),
    kind,
    seat: life.seat,
    c: life.c,
    ship:
      kind === "merchant" || kind === "whaling"
        ? (r.pick(["Swallow", "Endeavour", "Speedwell", "Hopewell", "Dolphin", "Two Brothers", "Good Intent", "Sea Flower"]) ?? "Swallow")
        : kind === "furs"
          ? "the brigade"
          : "the survey party",
    master: boss?.id ?? -1,
    from: life.prov,
    to,
    phase: "out",
    way: {
      prov: life.prov,
      path: [...rt.path],
      sea: [...rt.sea],
      depart: s.day,
      arrive: s.day + legDays(g.map, life.prov, rt.path[0], rt.sea[0], kind, s.day),
    },
    sails: 0,
    start: s.day,
    stake: amount,
    take: 0,
    log: [],
  };
  if (amount)
    withFlow(g, { key: `voy:${v.id}`, label: `${def.name}: your venture`, aff: "sea" }, () =>
      spend(g, life, amount),
    );
  seaState(g).voyages.push(v);
  seaChanged(g);
  syncVoyage(g, v);
  const where = g.map.provinces[to].name;
  journal(
    g,
    life,
    kind === "merchant"
      ? `You go aboard the ${v.ship} for ${where}${amount ? `, with a venture of ${amount} coins in her hold` : ""}: about ${rt.days} days out.`
      : kind === "whaling"
        ? `You ship aboard the ${v.ship} for the whaling grounds off ${where}, on a lay of 1/${Math.round(1 / layOf(life))}.`
        : kind === "furs"
          ? `You set off with the brigade for the posts at ${where}${amount ? `, with ${amount} coins of trade goods` : ""}: about ${rt.days} days up.`
          : `You set off to run the lines of a patent near ${where}: about ${rt.days} days into the backcountry.`,
  );
  milestone(g, life, "voyage", `${def.name} to ${where}`);
  return null;
}

/** Stay: send word (your goods with the brigade, your deputy to the survey), or simply stay. */
export function stayVoyage(
  g: ConquestGame,
  life: Life,
  kind: VoyageKind,
  send: boolean,
): string | null {
  const s = g.s;
  if (kind === "furs" && send) {
    const stake = stakeFor(life, kind);
    if (!stake || life.purse < stake) return `Trade goods: ${stake} coins.`;
    withFlow(g, { key: `voy:send:${s.day}`, label: "Goods sent with the brigade", aff: "sea" }, () =>
      spend(g, life, stake),
    );
    // It comes back with the brigade, about two months on.
    (life.ventures ??= []).push({
      id: g.nextId(),
      kind: "cargo",
      stake,
      value: stake,
      day: s.day,
      due: s.day + 60,
      name: "Trade goods sent up with the fur brigade",
    });
    touchLife(g, life);
    journal(g, life, `You send ${stake} coins of trade goods up with the brigade; its master takes his cut of what comes back.`);
    return null;
  }
  if (kind === "survey" && send) {
    const fee = SURVEY_FEE[Math.min(life.job?.rank ?? 0, SURVEY_FEE.length - 1)] / 2;
    withFlow(g, { key: `voy:deputy:${s.day}`, label: "A survey run by your deputy", aff: "sea" }, () =>
      earn(g, life, fee),
    );
    journal(g, life, `Your deputy runs the patent's lines while you stay: half the fee, ${fee} coins.`);
    return null;
  }
  journal(g, life, kind === "whaling" ? "You stay ashore this season and work alongshore." : "You stay ashore: the next one will do.");
  return null;
}

/** Your travel is the voyage's way (so the map shows you on it). */
function syncVoyage(g: ConquestGame, v: Voyage): void {
  const life = lifeOfSeat(g.s, v.seat);
  if (!life || life.c !== v.c || life.watching) return;
  touchLife(g, life);
  const w = v.way;
  if (w && w.path.length && (v.phase === "out" || v.phase === "home")) {
    life.prov = w.prov;
    life.travel = {
      dest: v.phase === "out" ? v.to : v.from,
      path: [...w.path],
      sea: [...w.sea],
      depart: w.depart,
      arrive: Math.max(w.arrive, g.s.day + 1),
      cost: 0,
      ship: v.id,
    };
  } else if (life.travel?.ship === v.id) life.travel = null;
}

/** A day of each voyage: the way, the far end, home. */
export function voyagesDaily(g: ConquestGame): void {
  const s = g.s;
  const list = s.sea?.voyages;
  if (!list?.length) return;
  for (const v of [...list]) {
    const life = lifeOfSeat(s, v.seat);
    if (v.phase !== "done" && (!life || life.c !== v.c || life.watching)) {
      v.phase = "done";
      v.end = "Ended with the life.";
      seaChanged(g);
      continue;
    }
    switch (v.phase) {
      case "out": {
        if (arrived(g, v)) atFarEnd(g, v, life!);
        else syncVoyage(g, v);
        break;
      }
      case "there":
        if (v.kind === "whaling") whalingDay(g, v, life!);
        if (s.day >= v.sails) sailHome(g, v, life!);
        break;
      case "home":
        if (arrived(g, v)) homeAgain(g, v, life!);
        else syncVoyage(g, v);
        break;
      case "done":
        if (s.day - (v.log[v.log.length - 1]?.day ?? v.start) > 60) {
          seaState(g).voyages = seaState(g).voyages.filter((x) => x !== v);
          seaChanged(g);
        }
        break;
    }
  }
}

function arrived(g: ConquestGame, v: Voyage): boolean {
  const w = v.way;
  if (!w || !w.path.length) return true;
  if (g.s.day < w.arrive) return false;
  const next = w.path.shift()!;
  const wasSea = w.sea.shift()!;
  w.prov = next;
  const life = lifeOfSeat(g.s, v.seat);
  if (life && life.c === v.c) {
    reveal(g, life, [next]);
    gainXp(g, life, wasSea ? "seamanship" : "woodcraft", 3);
    life.trail.push({ day: g.s.day, p: next, c: life.c });
    if (life.trail.length > 400) life.trail.splice(0, life.trail.length - 400);
  }
  if (w.path.length) {
    w.depart = g.s.day;
    w.arrive = g.s.day + legDays(g.map, next, w.path[0], w.sea[0], v.kind, g.s.day);
  }
  seaChanged(g);
  return w.path.length === 0;
}

function logV(g: ConquestGame, v: Voyage, text: string): void {
  v.log.push({ day: g.s.day, text });
  if (v.log.length > 20) v.log.splice(0, v.log.length - 20);
  seaChanged(g);
}

/** At the far end: ashore a few days (be aboard when she sails), or on the grounds. */
function atFarEnd(g: ConquestGame, v: Voyage, life: Life): void {
  const s = g.s;
  const def = VOYAGE_DEFS[v.kind];
  const r = sdice(g);
  v.phase = "there";
  v.sails = s.day + r.int(def.stay[0], def.stay[1]);
  touchLife(g, life);
  life.prov = v.to;
  const where = g.map.provinces[v.to].name;
  if (v.kind === "whaling") {
    // On the grounds, aboard: the ship cruises off the coast.
    life.travel = {
      dest: v.to,
      path: [v.to],
      sea: [true],
      depart: s.day,
      arrive: v.sails,
      cost: 0,
      ship: v.id,
    };
    affairNews(g, life, "sea", `The ${v.ship} is on the whaling grounds off ${where}: lookouts at the masthead, the boats ready.`);
  } else {
    life.travel = null;
    life.area = v.kind === "merchant" ? "docks" : life.area;
    affairNews(
      g,
      life,
      "sea",
      v.kind === "merchant"
        ? `The ${v.ship} makes ${where}. A few days ashore while she unloads and takes on her cargo: she sails for home on ${formatDate(v.sails)}. Be aboard.`
        : v.kind === "furs"
          ? `The brigade reaches the posts at ${where}. The trading takes some days: it starts back on ${formatDate(v.sails)}.`
          : `You're at ${where}: running the lines takes some days; you start back on ${formatDate(v.sails)}.`,
    );
    wake(g, life, `You've reached ${where}.`);
  }
  logV(g, v, `Reached ${where}.`);
  seaChanged(g);
}

/** A day on the whaling grounds: a whale, now and then (the first a scene). */
function whalingDay(g: ConquestGame, v: Voyage, life: Life): void {
  const s = g.s;
  const since = s.day - (v.sails - VOYAGE_DEFS.whaling.stay[1]);
  if (since <= 0 || since % WHALE_CHANCE_DAYS !== 0) return;
  const r = sdice(g);
  if (!v.log.some((l) => l.text.startsWith("There she blows")) && !life.events.length) {
    logV(g, v, "There she blows!");
    raiseEvent(g, life, "sea-whale", { v: v.id });
    return;
  }
  if (r.chance(WHALE_TAKEN)) {
    const value = Math.round(WHALE_VALUE[0] + r.next() * (WHALE_VALUE[1] - WHALE_VALUE[0]));
    v.take += value;
    logV(g, v, `A whale taken: about ${value} coins of oil and bone.`);
    journal(g, life, `"There she blows!" The boats are away, and the ${v.ship} has a whale alongside to cut in: about ${value} coins of oil and bone.`, "good");
  }
}

/** A whale hunt you're in: take the harpoon yourself, pull an oar, or stay with the ship. */
export function whaleNow(g: ConquestGame, life: Life, how: "harpoon" | "oar" | "ship", pass: boolean): void {
  const v = seaOf(g.s).voyages.find((x) => x.seat === life.seat && x.phase === "there" && x.kind === "whaling");
  if (!v) return;
  const r = sdice(g);
  const value = Math.round(WHALE_VALUE[0] + r.next() * (WHALE_VALUE[1] - WHALE_VALUE[0]));
  if (how === "harpoon") {
    if (pass) {
      v.take += value;
      addRenown(g, life, 1);
      gainXp(g, life, "fighting", 6);
      journal(g, life, `Your iron went home first time. A whale alongside: about ${value} coins of oil and bone.`, "good");
    } else {
      hurt(g, life, 10 + r.int(0, 10), "a whale's flukes");
      journal(g, life, "The whale sounded, came up under the boat and stove her in. You were pulled out of the sea half drowned.", "bad");
    }
  } else if (how === "oar") {
    if (r.chance(WHALE_TAKEN + 0.1)) {
      v.take += value;
      journal(g, life, `You pulled till your hands bled, and the steersman's iron held: a whale, about ${value} coins of oil and bone.`, "good");
    } else journal(g, life, "A long pull, and the whale was gone.");
    gainXp(g, life, "seamanship", 4);
  } else journal(g, life, "You stayed with the ship while the boats went after her.");
  seaChanged(g);
}

/** She sails home (be aboard): or you're left at the far end. */
function sailHome(g: ConquestGame, v: Voyage, life: Life): void {
  const s = g.s;
  const aboard = life.prov === v.to && (!life.travel || life.travel.ship === v.id) && !life.crime?.jail;
  if (!aboard) {
    v.phase = "done";
    v.end = "Left behind.";
    logV(g, v, "Sailed home without you.");
    affairNews(g, life, "sea", v.kind === "merchant" ? `The ${v.ship} sailed home without you. Your venture is still in her hold: it'll be settled, less what the master charges for the trouble.` : `The ${v.ship === "the brigade" ? "brigade" : v.ship} went home without you.`, "bad");
    // A venture left aboard comes home without you, at a discount.
    if (v.stake) settleStake(g, v, life, 0.8);
    const boss = s.chars[v.master];
    if (boss?.alive && !s.lives.some((l) => l.c === boss.id))
      remembers(g, life, g.char(boss.id), "Missed the ship", -10, 2);
    return;
  }
  const rt = routeOf(s, g.map, v.kind, v.to, v.from);
  if (!rt || !rt.path.length) {
    v.phase = "done";
    v.end = "No way home.";
    life.travel = null;
    journal(g, life, "There's no way home with them now: you'll have to find your own.", "bad");
    seaChanged(g);
    return;
  }
  v.phase = "home";
  v.way = {
    prov: v.to,
    path: [...rt.path],
    sea: [...rt.sea],
    depart: s.day,
    arrive: s.day + legDays(g.map, v.to, rt.path[0], rt.sea[0], v.kind, s.day),
  };
  logV(g, v, "Homeward.");
  syncVoyage(g, v);
  journal(g, life, `Homeward from ${g.map.provinces[v.to].name}.`);
}

/** Home: the venture, the lay or the fee paid. */
function homeAgain(g: ConquestGame, v: Voyage, life: Life): void {
  const s = g.s;
  v.phase = "done";
  touchLife(g, life);
  life.travel = null;
  life.prov = v.from;
  life.area = v.kind === "merchant" || v.kind === "whaling" ? "docks" : undefined;
  const home = g.map.provinces[v.from].name;
  const lines: string[] = [];
  if (v.kind === "whaling") {
    const lay = layOf(life);
    const pay = Math.round(v.take * lay * 10) / 10;
    if (pay > 0)
      withFlow(g, { key: `voy:${v.id}`, label: `The ${v.ship}'s voyage: your lay`, chance: true, aff: "sea" }, () =>
        earn(g, life, pay),
      );
    lines.push(v.take ? `the catch fetched ${Math.round(v.take)} coins; your lay of 1/${Math.round(1 / lay)} is ${pay}` : "a dry voyage: no lay to pay");
  } else if (v.kind === "survey") {
    const fee = SURVEY_FEE[Math.min(life.job?.rank ?? 0, SURVEY_FEE.length - 1)];
    withFlow(g, { key: `voy:${v.id}`, label: "A patent surveyed: your fee", aff: "sea" }, () =>
      earn(g, life, fee),
    );
    addRenown(g, life, 1);
    gainXp(g, life, "letters", 6);
    lines.push(`the plat is drawn and the fee paid: ${fee} coins`);
  }
  if (v.stake) lines.push(settleStake(g, v, life, 1));
  v.end = lines.join("; ") || "Home.";
  logV(g, v, `Home: ${v.end}.`);
  affairNews(g, life, "sea", `Home at ${home}: ${v.end}.`, "good");
  wake(g, life, `You're home at ${home}.`);
  for (const m of v.mail ?? []) raiseEvent(g, life, m.key, m.ctx);
  v.mail = [];
}

/** A venture's (or the brigade's goods') return. */
function settleStake(g: ConquestGame, v: Voyage, life: Life, mult: number): string {
  const luck = v.kind === "furs" ? FUR_LUCK : VENTURE_LUCK;
  const r = sdice(g);
  let roll = r.next();
  let pick = luck[luck.length - 1];
  for (const l of luck) {
    if (roll < l.p) {
      pick = l;
      break;
    }
    roll -= l.p;
  }
  const back = Math.round(v.stake * pick.x * mult * 10) / 10;
  if (back > 0)
    withFlow(g, { key: `voy:${v.id}`, label: `${VOYAGE_DEFS[v.kind].name}: your venture`, chance: true, aff: "sea" }, () =>
      earn(g, life, back),
    );
  return `your ${v.kind === "furs" ? "trade goods" : "venture"} of ${v.stake}: ${pick.label}, ${back} coins back`;
}

// ---------------------------------------------------------------- storms and letters

STORM_AT_SEA.unshift((g, life, st: Storm) => {
  const v = seaOf(g.s).voyages.find((x) => x.seat === life.seat && x.c === life.c && x.phase !== "done" && life.travel?.ship === x.id);
  if (!v) return false;
  if (madeReady(life, st)) {
    journal(g, life, `The ${v.ship} lay snug in harbour while ${stormName(st)} blew itself out.`, "good");
    return true;
  }
  raiseEvent(g, life, "sea-storm-ship", { v: v.id, st: st.id, f: Math.round(st.force * 10) / 10 });
  return true;
});

/** A hurricane at sea on a voyage: run before it, or heave to. */
export function voyageStorm(g: ConquestGame, life: Life, v: Voyage, force: number, how: "run" | "heave", pass: boolean): void {
  const r = sdice(g);
  const delay = how === "heave" ? 3 : 1;
  if (v.way) v.way.arrive += delay + (pass ? 0 : 2);
  if (!pass) hurt(g, life, 5 + r.int(0, Math.round(force * 3)), "a hurricane");
  if (v.stake && !pass && r.chance(0.25)) {
    v.stake = Math.round(v.stake * 0.5);
    journal(g, life, "Half your venture went over the side to lighten her.", "bad");
  }
  life.cooldowns["ev:trv-hurricane"] = Math.max(life.cooldowns["ev:trv-hurricane"] ?? 0, g.s.day + 330);
  gainXp(g, life, "seamanship", 8);
  logV(g, v, pass ? "Rode out a hurricane." : "Battered by a hurricane.");
  syncVoyage(g, v);
}

hooks.holdLetter.push((g, life, key, ctx) => {
  const v = seaOf(g.s).voyages.find((x) => x.seat === life.seat && x.phase !== "done" && life.travel?.ship === x.id);
  if (!v) return false;
  (v.mail ??= []).push({ key, ctx });
  seaChanged(g);
  return true;
});

/** Gone on a voyage of your own trade is a day at your post. */
hooks.atPost.push((s, life) => {
  const v = seaOf(s).voyages.find((x) => x.seat === life.seat && x.c === life.c && x.phase !== "done");
  if (!v || !life.job) return undefined;
  return voyageKindOf(life.job.kind, life.job.rank, lifeIsNative(s, life)) === v.kind ? true : undefined;
});

/** At sea (or on the trail) with a voyage, the things of the town wait. */
const ASHORE = new Set(["travel", "halt", "sail", "act", "job", "takeup", "enter", "trade", "market", "lead", "present", "crime", "law", "dice", "property", "boat", "home"]);
hooks.gate.push((g, life, c) => {
  const id = life.travel?.ship;
  if (id === undefined) return null;
  const v = seaOf(g.s).voyages.find((x) => x.id === id && x.phase !== "done");
  if (!v || !ASHORE.has(c.k)) return null;
  return v.kind === "merchant" || v.kind === "whaling"
    ? `You're at sea aboard the ${v.ship}: that waits till you're ashore.`
    : `You're on the trail with ${v.ship}: that waits till you're back.`;
});

/** LEDGER (r15): a voyage in the tracker. */
hooks.affairs.push((s, w, life) =>
  seaOf(s)
    .voyages.filter((v) => v.seat === life.seat && v.c === life.c && v.phase !== "done")
    .map((v) => ({
      kind: "sea" as const,
      id: `voy:${v.id}`,
      title: v.kind === "merchant" || v.kind === "whaling" ? `The ${v.ship}` : VOYAGE_DEFS[v.kind].name,
      what: `${VOYAGE_DEFS[v.kind].name} to ${w.map.provinces[v.to]?.name ?? "far off"}${v.stake ? `, ${v.stake} coins ventured` : ""}`,
      status: v.phase === "out" ? "outward" : v.phase === "there" ? "at the far end" : "homeward",
      p: v.way?.prov ?? v.to,
      due: v.phase === "there" ? v.sails : undefined,
      ...(v.stake
        ? {
            expected: {
              value: r1(v.stake * (v.kind === "furs" ? FUR_LUCK : VENTURE_LUCK).reduce((m, l) => m + l.p * l.x, 0)),
              lo: 0,
              hi: r1(v.stake * (v.kind === "furs" ? 2.2 : 1.7)),
              per: "home" as const,
            },
          }
        : {}),
      go: { tab: "work", sub: "sea" },
    })),
);

/** A voyage's commands (going and staying are a scene's choices). */
function voyageCommand(g: ConquestGame, life: Life, c: LifeCommand): string | null | undefined {
  if (c.k !== "sea") return undefined;
  if (c.act !== "aboard") return undefined;
  // Back aboard at the far end, before she sails (nothing to do: being at the quay is enough).
  const v = seaOf(g.s).voyages.find((x) => x.seat === life.seat && x.phase === "there");
  if (!v) return "You're on no voyage.";
  if (life.prov !== v.to) return `She lies at ${g.map.provinces[v.to].name}.`;
  return null;
}

hooks.command.push(voyageCommand);
hooks.daily.push((g) => {
  voyagesDaily(g);
  for (const life of g.s.lives)
    if (!life.watching && life.c >= 0 && meOf(g.s, life)) offerDaily(g, life);
});

export { BOATS, charName, skillLevel };
export type { Check };
void no;
void yes;
