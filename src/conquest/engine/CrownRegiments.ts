// CROWN (r18): regiments from Europe in wartime, and Spain's fortress
// garrisons.
//
// A crown whose colony goes to war in America may send regiments across:
// some when the war begins, then a reinforcement each spring while it lasts,
// by what it could spare in its age (MEANS) and what the war is to it (its
// stake: the crowns at war in Europe count most, a war to take back a lost
// town nearly as much, a war with a native nation little). They sail for
// six to ten weeks, land at the colony's port nearest the war's aim (or in
// force on a coast it doesn't hold), and join the colony's armies: the
// computer sends them first against the war's aims, a town of its own the
// enemy holds or a town it lost and claims. The colony pays their passage
// and their pay; they suffer the fevers as other troops do, and they go home
// at the peace.
//
// Spain's fortress ports (Havana, St. Augustine, Veracruz and the rest) keep
// a garrison of their own, renewed every year with the fleet while Spain
// holds the town. The computer never marches a garrison off.
//
// Every roll is on the track's own dice (kdice), never the world's.

import { dateOf } from "./Calendar";
import {
  CROSSING,
  crownAim,
  crownChanged,
  crownMen,
  crownRegs,
  crownState,
  crownWars,
  FORT_MONTH,
  fortPorts,
  garrisonArmy,
  inWords,
  kdice,
  landingFor,
  meansOf,
  PASSAGE,
  regimentsWords,
  SEASON_MONTH,
  sendOdds,
  sentRecord,
  warKey,
  warStake,
} from "./CrownCore";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { REGIMENTS } from "./Rules";
import { rumour } from "./Rumours";
import type { Army, CrownSailing, Regiment } from "./Types";

const town = (g: ConquestGame, p: number) =>
  g.map.provinces[p]?.name ?? "the coast";

// ---------------------------------------------------------------- making regiments

/** A regiment of the crown's, fresh off the ships. */
export function crownRegiment(
  type: "regulars" | "artillery",
  kind: "war" | "fort",
  men?: number,
): Regiment {
  return {
    type,
    men: men ?? REGIMENTS[type].men,
    morale: 0.85,
    home: -1,
    crown: kind,
  };
}

/** A new army of the colony's at a place, of the regiments given. */
export function newArmy(
  g: ConquestGame,
  n: number,
  p: number,
  regs: Regiment[],
): Army {
  return g.addArmy({
    id: g.nextId(),
    owner: n,
    prov: p,
    regs,
    path: [],
    depart: -1,
    arrive: -1,
    sea: false,
    retreating: false,
    arrived: g.s.day,
    from: -1,
    commander: -1,
    supply: 1,
  });
}

// ---------------------------------------------------------------- sailing and landing

/** Put regiments to sea for a colony: they land on the day set (shown coming in on the map). */
export function sail(
  g: ConquestGame,
  x: Omit<CrownSailing, "id" | "departed" | "arrive">,
  days?: number,
): CrownSailing {
  const s = g.s;
  const st = crownState(g);
  const crossing =
    days ?? kdice(s, 0x10, x.n, x.port, s.day).int(CROSSING.min, CROSSING.max);
  const sl: CrownSailing = {
    ...x,
    id: g.nextId(),
    departed: s.day,
    arrive: s.day + crossing,
  };
  st.sailing.push(sl);
  crownChanged(g);
  return sl;
}

/** Landed: what each kind of sailing does when it comes in (registered by the expeditions too). */
export const landers: ((g: ConquestGame, sl: CrownSailing) => boolean)[] = [];

function crownDaily(g: ConquestGame): void {
  const s = g.s;
  const st = s.crown;
  if (!st?.sailing?.length) return;
  const due = st.sailing.filter((x) => x.arrive <= s.day);
  if (!due.length) return;
  st.sailing = st.sailing.filter((x) => x.arrive > s.day);
  crownChanged(g);
  for (const sl of due) {
    if (!s.nations[sl.n]?.alive) continue;
    if (landers.some((f) => f(g, sl))) continue;
    if (sl.why === "fort") landDraft(g, sl);
    else landWar(g, sl);
  }
}

/**
 * Where to land now: the port first chosen while it's still the colony's,
 * or the colony's port nearest the war's aim, or in force on a coast.
 */
export function landingNow(
  g: ConquestGame,
  sl: CrownSailing,
): { port: number; force: boolean } | null {
  const s = g.s;
  const pr = s.provinces[sl.port];
  if (!sl.force && pr && pr.owner === sl.n && pr.occupier < 0)
    return { port: sl.port, force: false };
  if (sl.force) return { port: sl.port, force: true };
  return landingFor(s, g.map, sl.n, crownAim(s, sl.n));
}

/** Regiments of the crown's at war land, and join the colony's armies. */
function landWar(g: ConquestGame, sl: CrownSailing): void {
  const s = g.s;
  const nation = s.nations[sl.n];
  if (!meansOf(s, sl.n) || crownWars(s, sl.n).length === 0) {
    // The war ended while they were at sea: they put about for home.
    const rec = sentRecord(g, sl.n);
    rec.home += sl.foot + sl.guns;
    crownChanged(g);
    return;
  }
  const at = landingNow(g, sl);
  if (!at) return;
  const regs: Regiment[] = [];
  for (let i = 0; i < sl.foot; i++) regs.push(crownRegiment("regulars", "war"));
  for (let i = 0; i < sl.guns; i++)
    regs.push(crownRegiment("artillery", "war"));
  newArmy(g, sl.n, at.port, regs);
  noteLanding(g, sl.n, at.port, sl.foot + sl.guns, at.force);
  const text = `${regimentsWords(nation.adjective, sl.foot, sl.guns)} landed at ${town(g, at.port)}${at.force ? " in force" : ""}, sent by the crown for the war.`;
  g.event({ k: "news", day: s.day, n: sl.n, p: at.port, text });
  rumour(g, at.port, text, -1);
}

/** Book a landing to the colony's record. */
export function noteLanding(
  g: ConquestGame,
  n: number,
  p: number,
  regs: number,
  force: boolean,
): void {
  const rec = sentRecord(g, n);
  rec.total += regs;
  rec.war += regs;
  rec.landings++;
  rec.last = { day: g.s.day, p, regs, ...(force ? { force: true } : {}) };
  crownChanged(g);
}

// ---------------------------------------------------------------- the crown sends for a war

/** What the colony pays toward their passage: what the treasury has, never into debt. */
export function payPassage(g: ConquestGame, n: number, regs: number): number {
  const nation = g.nation(n);
  const owed = regs * PASSAGE;
  const paid = Math.max(0, Math.min(owed, Math.floor(nation.gold)));
  nation.gold = Math.round((nation.gold - paid) * 10) / 10;
  const rec = sentRecord(g, n);
  rec.gold += paid;
  crownChanged(g);
  return paid;
}

/** Regiments of the crown's at sea, bound for a colony's war. */
function atSea(g: ConquestGame, n: number): number {
  let k = 0;
  for (const x of crownState(g).sailing)
    if (x.n === n && x.why !== "fort") k += x.foot + x.guns;
  return k;
}

/** The crown answers a war: send regiments, or not (by its means and the stake). */
function sendFor(
  g: ConquestGame,
  n: number,
  stake: number,
  first: boolean,
  salt: number,
): void {
  const s = g.s;
  const m = meansOf(s, n);
  if (!m) return;
  const o = sendOdds(m, stake, first);
  if (o.regs <= 0 || o.chance <= 0) return;
  if (kdice(s, first ? 0x20 : 0x21, n, salt).next() >= o.chance) return;
  const room = m.max - crownRegs(s, n, "war") - atSea(g, n);
  const regs = Math.min(o.regs, room);
  if (regs <= 0) return;
  const at = landingFor(s, g.map, n, crownAim(s, n));
  if (!at) return;
  const guns = Math.floor(regs / 4);
  payPassage(g, n, regs);
  sail(g, {
    n,
    port: at.port,
    ...(at.force ? { force: true } : {}),
    foot: regs - guns,
    guns,
    men: (regs - guns) * 100 + guns * REGIMENTS.artillery.men,
    why: "war",
  });
}

/** The month's turn for a colony's crown: a new war answered, the spring's reinforcement, the peace. */
function colonyMonthly(g: ConquestGame, n: number): void {
  const s = g.s;
  const wars = crownWars(s, n);
  const m = meansOf(s, n);
  if (!m) {
    // On its own now (independent, or in rebellion): the crown's men are gone.
    sendHome(g, n, true);
    return;
  }
  const rec = s.crown?.sent?.[n];
  if (!wars.length) {
    if (crownRegs(s, n, "war") > 0) sendHome(g, n, false);
    if (rec && (rec.war || rec.wars.length)) {
      rec.war = 0;
      rec.wars = [];
      crownChanged(g);
    }
    return;
  }
  const r = sentRecord(g, n);
  if (!r.wars.length && r.war === 0) r.since = s.day;
  // Each new war is answered once, at the stake it has.
  const keys = new Set(wars.map(warKey));
  const fresh = wars.filter((w) => !r.wars.includes(warKey(w)));
  r.wars = r.wars.filter((k) => keys.has(k));
  for (const w of fresh) {
    r.wars.push(warKey(w));
    crownChanged(g);
    sendFor(g, n, warStake(s, n, w).total, true, w.start);
  }
  // Each spring, a reinforcement for the war that matters most.
  const d = dateOf(s.day);
  if (d.month === SEASON_MONTH && r.season !== d.year) {
    r.season = d.year;
    crownChanged(g);
    let stake = 0;
    let oldest = Infinity;
    for (const w of wars) {
      if (s.day - w.start < 120) continue;
      stake = Math.max(stake, warStake(s, n, w).total);
      oldest = Math.min(oldest, w.start);
    }
    if (stake > 0) sendFor(g, n, stake, false, d.year * 7 + (oldest | 0));
  }
}

/** At the peace the crown's regiments go home (and all of them, if the colony is on its own). */
function sendHome(g: ConquestGame, n: number, all: boolean): void {
  const s = g.s;
  let k = 0;
  const where = new Map<number, number>();
  for (const a of [...s.armies]) {
    if (a.owner !== n) continue;
    const go = a.regs.filter((r) => r.crown === "war" || (all && r.crown));
    if (!go.length) continue;
    const x = g.touch(a);
    x.regs = x.regs.filter((r) => !go.includes(r));
    k += go.length;
    where.set(a.prov, (where.get(a.prov) ?? 0) + go.length);
    if (!x.regs.length) g.removeArmy(a);
  }
  if (all) {
    const st = crownState(g);
    for (const f of Object.values(st.forts))
      if (f.n === n && f.army !== undefined) delete f.army;
  }
  if (!k) return;
  const rec = sentRecord(g, n);
  rec.home += k;
  crownChanged(g);
  const p = [...where.entries()].sort(
    (a, b) => b[1] - a[1] || a[0] - b[0],
  )[0][0];
  const nation = s.nations[n];
  g.event({
    k: "news",
    day: s.day,
    n,
    p,
    text: `${inWords(k)} regiment${k === 1 ? "" : "s"} of the ${nation.adjective} crown's ${all ? "leave" : "sail home from"} ${town(g, p)}${all ? ": the colony stands on its own now" : " at the peace"}.`,
  });
}

// ---------------------------------------------------------------- the fortress garrisons

/** Men a garrison is short of. */
function garrisonShort(g: ConquestGame, p: number, full: number): number {
  const a = garrisonArmy(g.s, p);
  let men = 0;
  if (a) for (const r of a.regs) men += r.men;
  return Math.max(0, full - Math.round(men));
}

/** Fill a fortress's garrison up by so many men (a new army if there's none). */
function fillGarrison(
  g: ConquestGame,
  p: number,
  n: number,
  men: number,
): void {
  const st = crownState(g);
  const f = st.forts[p];
  let a = garrisonArmy(g.s, p);
  if (a && a.prov !== p) {
    // Marched off (a player governor's doing): it's an army like any other now.
    delete f.army;
    a = undefined;
  }
  let left = men;
  if (a) {
    const x = g.touch(a);
    for (const r of x.regs) {
      if (left <= 0) break;
      if (r.type !== "regulars") continue;
      const add = Math.min(left, 100 - r.men);
      if (add > 0) {
        r.men = Math.round((r.men + add) * 10) / 10;
        left -= add;
      }
    }
    while (left > 0) {
      const k = Math.min(100, left);
      x.regs.push(crownRegiment("regulars", "fort", k));
      left -= k;
    }
  } else {
    const regs: Regiment[] = [];
    while (left > 0) {
      const k = Math.min(100, left);
      regs.push(crownRegiment("regulars", "fort", k));
      left -= k;
    }
    a = newArmy(g, n, p, regs);
    f.army = a.id;
  }
  f.renewed = g.s.day;
  crownChanged(g);
}

/** A garrison's yearly draft comes in. */
function landDraft(g: ConquestGame, sl: CrownSailing): void {
  const s = g.s;
  const p = sl.fort ?? sl.port;
  const f = crownState(g).forts[p];
  const pr = s.provinces[p];
  if (!f || pr.owner !== f.n || pr.occupier >= 0) return;
  fillGarrison(g, p, f.n, sl.men);
}

/** The fortresses, each month: held, renewed with the fleet; lost, their garrison gone. */
function fortsMonthly(g: ConquestGame, first = false): void {
  const s = g.s;
  const st = crownState(g);
  const d = dateOf(s.day);
  for (const { p, f: def } of fortPorts(g.map)) {
    const n = s.nations.findIndex((x) => x.key === def.key);
    if (n < 0) continue;
    const pr = s.provinces[p];
    const holds =
      pr.owner === n &&
      !!meansOf(s, n) &&
      d.year >= def.from &&
      s.nations[n].alive;
    const f = st.forts[p];
    if (!holds) {
      const a = f ? garrisonArmy(s, p) : undefined;
      if (f && a) {
        // The town lost: its garrison sails for home.
        const x = g.touch(a);
        x.regs = x.regs.filter((r) => r.crown !== "fort");
        if (!x.regs.length) g.removeArmy(a);
        delete f.army;
        crownChanged(g);
        if (pr.owner !== n)
          g.event({
            k: "news",
            day: s.day,
            n,
            p,
            text: `The ${s.nations[n].adjective} garrison of ${def.name} sails for home.`,
            local: true,
          });
      }
      continue;
    }
    if (pr.occupier >= 0) continue;
    if (!f) {
      // On the books from the start (or since an old save's first month).
      st.forts[p] = { p, n, renewed: s.day };
      fillGarrison(g, p, n, def.men);
      continue;
    }
    if (first) continue;
    const a = garrisonArmy(s, p);
    if (a && a.prov !== p) delete f.army;
    // The yearly draft sails with the fleet.
    if (d.month !== FORT_MONTH) continue;
    if (st.sailing.some((x) => x.why === "fort" && x.fort === p)) continue;
    const short = garrisonShort(g, p, def.men);
    if (short < 10) continue;
    payPassage(g, n, short / 100);
    sail(g, {
      n,
      port: p,
      fort: p,
      foot: Math.ceil(short / 100),
      guns: 0,
      men: short,
      why: "fort",
    });
  }
}

// ---------------------------------------------------------------- the rounds

/** CROWN (r18): the month's turn: the fortresses, and each colony's crown. */
export function crownMonthly(g: ConquestGame): void {
  const s = g.s;
  if (!s.crown && !s.nations.some((n) => meansOf(s, n.id))) return;
  fortsMonthly(g);
  for (const nation of s.nations)
    if (nation.kind === "power" && nation.alive) colonyMonthly(g, nation.id);
}

hooks.daily.push(crownDaily);
hooks.monthEnd.push(crownMonthly);
// The fortresses' garrisons stand from the first day of a new game.
hooks.created.push((g) => fortsMonthly(g, true));

export { crownMen, inWords, regimentsWords };
