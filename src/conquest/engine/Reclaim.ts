// WAR (r17): lost towns, and the people who live in them.
//
// When a town changes hands its old owner gets a claim on it, weighted by
// the town's size, whether it was their capital, how long it was theirs and
// whether its people are still their own. A claim worth a war makes the
// computer's nations go to war for it when they're strong enough, march on
// it, and ask for it at the peace; it fades within a generation, and a war
// lost for it halves it, so there's no endless war and no ping-pong.
//
// A town held by rulers who aren't its people's own ferments: another tongue
// and faith, a thin garrison, harsh rule, hunger, the first years, and the
// old owner's army near or at war push it up; a strong garrison, tolerance
// and the years bring it down. Past 70 a plot may form; on its day it rises
// through the movements' own machinery (a host as a nation of its own, at
// war with the rulers). Its first night is rolled from the odds shown: found
// out, beaten in the streets, or the town taken. Held three months, the town
// goes back to its old owner (or, with nobody to go back to, stands alone).
// A player living there is asked in a scene to join it, lead it, inform on
// it or keep out, and can stir the town up.
//
// It also mends what kept St. Augustine stuck for good: an occupation with
// no war behind it ends (or, with no owner left, becomes the occupier's,
// with a claim for the people who live there).

import { kill, makeCharacter } from "./Characters";
import { cede } from "./Crown";
import { merge } from "./Economy";
import { risingWon } from "./Founding";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent, skipped, takenHow } from "./Hooks";
import { affairNews } from "./Ledger";
import { withFlow } from "./LedgerCore";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  journal,
  milestone,
  remembers,
  setCooldown,
  touchLife,
} from "./LifeCore";
import {
  isChildLife,
  lifeIsNative,
  lifeOfChar,
  meOf,
  skillLevel,
} from "./LifeQueries";
import { checkChance } from "./LifeRules";
import { kmBetween } from "./Map";
import { endRising, joinCheck, joinMovement } from "./Movements";
import { makePolities } from "./Politics";
import {
  armyMen,
  atWar,
  charName,
  enemiesOf,
  pairKey,
  people,
  provincesOf,
  tribesfolk,
  warCheck,
} from "./Queries";
import {
  CLAIM,
  claimLive,
  claimOf,
  claimParts,
  claimsOn,
  FERMENT,
  fermentTarget,
  garrisonOf,
  kinShare,
  nm,
  plotChance,
  rdice,
  reclaimChanged,
  reclaimOf,
  reclaimState,
  RISING,
  risingOdds,
  townRisingOf,
  yokeOf,
} from "./ReclaimCore";
import { DAYS_PER_YEAR, WARRIOR_SHARE } from "./Rules";
import { rumour } from "./Rumours";
import { blankNation } from "./Setup";
import { addFavor } from "./Standing";
import type {
  Claim,
  Life,
  LifeCommand,
  Movement,
  Nation,
  TownRising,
  Yoke,
} from "./Types";
import { startWar } from "./War";

const town = (g: ConquestGame, p: number) =>
  g.map.provinces[p]?.name ?? "the town";
const named = (g: ConquestGame, n: number) => g.s.nations[n]?.name ?? "someone";
const isRealm = (x: Nation | undefined) =>
  !!x && (x.kind === "power" || x.kind === "native");

// ---------------------------------------------------------------- a town changes hands

/** A capital lost today, so the claim can count it (the capital moves before we hear). */
const CAPITAL = new WeakMap<
  ConquestGame,
  { n: number; p: number; day: number }
>();

hooks.capitalMoved.push((g, n, from) => {
  CAPITAL.set(g, { n, p: from, day: g.s.day });
});

/** The players whose town it is: living there, or there now. */
function livesIn(g: ConquestGame, p: number): Life[] {
  return g.s.lives.filter(
    (l) =>
      l.c >= 0 &&
      !l.watching &&
      !!meOf(g.s, l)?.alive &&
      (l.prov === p || l.home === p),
  );
}

function onTaken(g: ConquestGame, p: number, from: number, to: number): void {
  const s = g.s;
  const R = reclaimState(g);
  const since = R.held[p];
  if (to >= 0) R.held[p] = s.day;
  else delete R.held[p];
  reclaimChanged(g);
  // A town back with its old owner: their claim is answered.
  const answered = R.claims.find((c) => c.by === to && c.p === p);
  if (answered) {
    const years = Math.round((s.day - answered.day) / DAYS_PER_YEAR);
    g.event({
      k: "news",
      day: s.day,
      n: to,
      p,
      text: `${nm(named(g, to))} has ${town(g, p)} back${years >= 1 ? ` after ${years} year${years === 1 ? "" : "s"}` : ""}.`,
    });
  }
  R.claims = R.claims.filter(
    (c) => c.p !== p || (c.by !== to && to >= 0 && c.by !== from),
  );
  // The loser's claim (a sale is no grievance; nor is a town nobody holds).
  const loser = s.nations[from];
  const taker = s.nations[to];
  if (
    from >= 0 &&
    to >= 0 &&
    takenHow.how !== "bought" &&
    isRealm(loser) &&
    isRealm(taker) &&
    loser.alive
  ) {
    const cap = CAPITAL.get(g);
    const wasCapital =
      !!cap && cap.n === from && cap.p === p && cap.day === s.day;
    const heldDays = since === undefined ? undefined : s.day - since;
    const { base, parts } = claimParts(s, p, from, heldDays, wasCapital);
    if (base >= CLAIM.minBase)
      R.claims.push({
        p,
        by: from,
        from: to,
        day: s.day,
        how: takenHow.how || "treaty",
        base,
        parts,
        tries: 0,
      });
  }
  // The town's own rising (if any) is moot now; the ferment starts again.
  R.yokes = R.yokes.filter((y) => y.p !== p || y.ruler === to);
  // Those who live there remember the day.
  for (const life of livesIn(g, p)) {
    const mine = meOf(s, life)?.nation;
    const text =
      to < 0
        ? `${town(g, p)} broke away from ${named(g, from)}`
        : mine === to && answered
          ? `${town(g, p)} went back to ${named(g, to)}`
          : `${town(g, p)} passed from ${named(g, from)} to ${named(g, to)}`;
    // STORY (r17) told the same day's change already ("your home was ceded"): one moment.
    if (
      life.milestones.some(
        (m) =>
          m.day === s.day &&
          m.p === p &&
          (m.kind === "home" || m.kind === "taken"),
      )
    )
      continue;
    milestone(g, life, "taken", text, p);
  }
}

hooks.provinceTaken.push(onTaken);

// ---------------------------------------------------------------- the month

hooks.monthEnd.push((g) => reclaimMonthly(g));

/** The month's turn: mend stuck occupations, claims, wars for them, the ferment, plots. */
export function reclaimMonthly(g: ConquestGame): void {
  mendOccupations(g);
  claimsMonthly(g);
  if (g.aiEnabled) claimWars(g);
  yokesMonthly(g);
}

/**
 * An occupation with no war behind it ends; a town with no owner but an
 * occupier becomes the occupier's, and the people who live there have a
 * claim on it. (Both used to last for ever: the Lenape in New Amsterdam,
 * the Muscogee in St. Augustine.)
 */
export function mendOccupations(g: ConquestGame): void {
  const s = g.s;
  for (let p = 0; p < s.provinces.length; p++) {
    const pr = s.provinces[p];
    const occ = pr.occupier;
    if (occ < 0) continue;
    const O = s.nations[occ];
    if (pr.owner >= 0 && O?.alive && atWar(s, pr.owner, occ)) continue;
    if (pr.owner < 0 && isRealm(O) && O!.alive) {
      // Theirs, as it has been in all but name.
      const people0 = kinNation(g, p, occ);
      // Theirs in law from today: the town takes it as newly taken.
      cede(g, p, occ);
      g.event({
        k: "news",
        day: s.day,
        n: occ,
        p,
        text: `${town(g, p)}, held by ${named(g, occ)} with nobody's leave, is theirs now in law.`,
      });
      if (people0 >= 0 && !claimOf(s, people0, p)) {
        const { base, parts } = claimParts(s, p, people0, undefined, false);
        if (base >= CLAIM.minBase) {
          reclaimState(g).claims.push({
            p,
            by: people0,
            from: occ,
            day: s.day,
            how: "mended",
            base,
            parts,
            tries: 0,
          });
          reclaimChanged(g);
        }
      }
      continue;
    }
    const x = g.prov(p);
    x.occupier = -1;
    x.siege = null;
    if (pr.owner >= 0)
      g.event({
        k: "news",
        day: s.day,
        n: pr.owner,
        p,
        text: `${nm(O?.name ?? "The occupiers")} march${O?.name.startsWith("the ") ? "" : "es"} out of ${town(g, p)}, having no war with ${named(g, pr.owner)}.`,
      });
  }
}

/** The living nation whose people are most of a town's (besides `not`), or -1. */
function kinNation(g: ConquestGame, p: number, not: number): number {
  const s = g.s;
  const pr = s.provinces[p];
  const by = new Map<string, number>();
  for (const pop of pr.pops)
    by.set(pop.culture, (by.get(pop.culture) ?? 0) + pop.size);
  let best = -1;
  let most = 0;
  for (const n of s.nations) {
    if (!n.alive || !isRealm(n) || n.id === not) continue;
    const k = by.get(n.culture) ?? 0;
    if (k > most) {
      most = k;
      best = n.id;
    }
  }
  return most >= people(pr) * FERMENT.kin ? best : -1;
}

function claimsMonthly(g: ConquestGame): void {
  const s = g.s;
  const R = reclaimState(g);
  const keep: Claim[] = [];
  for (const c of R.claims) {
    const owner = s.provinces[c.p]?.owner ?? -1;
    if (!s.nations[c.by]?.alive || owner < 0 || owner === c.by) continue;
    if (c.from !== owner) c.from = owner;
    // A war for it that ended without it.
    if (c.war !== undefined && !atWar(s, c.by, owner)) {
      delete c.war;
      c.tries++;
      if (c.tries >= CLAIM.maxTries) {
        g.event({
          k: "news",
          day: s.day,
          n: c.by,
          p: c.p,
          text: `${nm(named(g, c.by))} gives up its claim to ${town(g, c.p)}.`,
        });
        continue;
      }
    }
    if (claimLive(s, c).total < CLAIM.minLive) continue;
    keep.push(c);
  }
  R.claims = keep;
  reclaimChanged(g);
}

/** Fighting men a nation could bring: armies, and for a native nation its warriors. */
function mightOf(g: ConquestGame, n: number): number {
  const s = g.s;
  let men = 0;
  for (const a of s.armies) if (a.owner === n) men += armyMen(a);
  if (s.nations[n]?.kind === "native")
    for (const p of provincesOf(s, n))
      men += tribesfolk(s.provinces[p]) * WARRIOR_SHARE * 0.3;
  return men;
}

/** The computer's nations go to war for a claim when they're strong enough. */
function claimWars(g: ConquestGame): void {
  const s = g.s;
  const R = reclaimOf(s);
  if (!R.claims.length) return;
  for (const n of s.nations) {
    if (!n.alive || !isRealm(n) || n.player !== null) continue;
    if (n.rebelling || skipped(g, n.ruler)) continue;
    if (enemiesOf(s, n.id).length > 0) continue;
    // Its strongest claim worth a war.
    let best: Claim | undefined;
    let bestLive = 0;
    for (const c of R.claims) {
      if (c.by !== n.id) continue;
      const h = s.provinces[c.p].owner;
      const H = s.nations[h];
      if (!isRealm(H) || !H!.alive) continue;
      let live = claimLive(s, c).total;
      const tr = risingHolding(g, c.p);
      if (tr) live += CLAIM.risingBoost;
      const need =
        n.kind === "power" && H!.kind === "power" ? CLAIM.warPower : CLAIM.war;
      if (live < need || !warCheck(s, n.id, h).ok) continue;
      if (live > bestLive) {
        best = c;
        bestLive = live;
      }
    }
    if (!best) continue;
    const h = s.provinces[best.p].owner;
    const H = s.nations[h];
    const rising = !!risingHolding(g, best.p);
    const mine = mightOf(g, n.id);
    const theirs = mightOf(g, h);
    if (mine < theirs * (rising ? 1 : CLAIM.edge) || mine < 300) continue;
    const powers = n.kind === "power" && H.kind === "power";
    const chance =
      (powers ? CLAIM.warChancePower : CLAIM.warChance) * (bestLive / 50);
    if (rdice(g, 0x100 + n.id * 977 + best.p).next() >= chance) continue;
    claimWar(g, n.id, h, best);
  }
}

/** A town whose own people hold it in a rising, today. */
function risingHolding(g: ConquestGame, p: number): TownRising | undefined {
  const s = g.s;
  const pr = s.provinces[p];
  if (pr.occupier < 0 || s.nations[pr.occupier]?.kind !== "rebels") return;
  const m = s.movements.find((x) => x.rebels === pr.occupier);
  return m ? townRisingOf(s, m) : undefined;
}

/** War to take a town back. */
export function claimWar(
  g: ConquestGame,
  n: number,
  h: number,
  c: Claim,
): void {
  const s = g.s;
  startWar(g, n, h, `To take back ${town(g, c.p)}`, false);
  const t = g.nation(h);
  (t.relations[n] ??= []).push({
    of: -1,
    why: "They attacked us",
    value: -30,
    until: s.day + 10 * DAYS_PER_YEAR,
  });
  const A = s.nations[n];
  if (A.kind === "power" && t.kind === "power") {
    const k = pairKey(n, h);
    s.europe.tension[k] = Math.min(100, (s.europe.tension[k] ?? 0) + 20);
    g.europeChanged();
    if (s.europe.wars[k] === undefined && !A.independent)
      g.nation(n).mods.push({
        key: "unsanctioned-war",
        label: "Started a war the crown didn't want",
        until: s.day + 2 * DAYS_PER_YEAR,
        fx: { favor: -10 },
      });
  }
  // Every town it claims from them is fought for in this war (and each one
  // not won back at the peace is the weaker for it): two lost wars and the
  // lot are given up, so neighbours don't fight for ever.
  for (const x of reclaimState(g).claims)
    if (x.by === n && s.provinces[x.p].owner === h) x.war = s.day;
  c.war = s.day;
  reclaimChanged(g);
  rumour(g, c.p, `${nm(A.name)} has gone to war to take back ${town(g, c.p)}.`);
}

// ---------------------------------------------------------------- the ferment

function yokesMonthly(g: ConquestGame): void {
  const s = g.s;
  const R = reclaimState(g);
  const before = new Map(R.yokes.map((y) => [y.p, y]));
  const now: Yoke[] = [];
  for (let p = 0; p < s.provinces.length; p++) {
    const pr = s.provinces[p];
    const ruler = pr.owner;
    if (ruler < 0 || !isRealm(s.nations[ruler])) continue;
    if (people(pr) < 30) continue;
    // Whose people they are: the strongest claim on it whose people live there.
    let old = -1;
    for (const c of claimsOn(s, p)) {
      if (c.by === ruler || !s.nations[c.by]?.alive) continue;
      if (claimLive(s, c).total < CLAIM.minLive) continue;
      if (kinShare(s, pr, c.by) < FERMENT.kin) continue;
      old = c.by;
      break;
    }
    const was = before.get(p);
    if (old < 0) {
      // No claim left: the ferment dies down, but a rising under way goes on.
      if (was?.m !== undefined && liveMovement(g, was.m)) now.push(was);
      continue;
    }
    const y: Yoke = was ?? {
      p,
      ruler,
      old,
      ferment: 0,
      target: 0,
      parts: [],
    };
    y.ruler = ruler;
    y.old = old;
    settlePlot(g, y);
    const t = fermentTarget(s, g.w, p, ruler, old, y.cowed ?? 0);
    if (!was) y.ferment = Math.min(30, t.total);
    y.target = t.total;
    y.parts = t.parts;
    y.ferment =
      Math.round(
        Math.max(
          0,
          Math.min(100, y.ferment + (y.target - y.ferment) * FERMENT.step),
        ) * 10,
      ) / 10;
    plotMonthly(g, y);
    now.push(y);
  }
  R.yokes = now;
  reclaimChanged(g);
}

function liveMovement(g: ConquestGame, id: number): Movement | undefined {
  return g.s.movements.find(
    (m) => m.id === id && (m.status === "brewing" || m.status === "risen"),
  );
}

/** A plot that's over: crushed or found out, the town is cowed; faded or won, it rests. */
function settlePlot(g: ConquestGame, y: Yoke): void {
  const s = g.s;
  if (y.m === undefined || liveMovement(g, y.m)) return;
  const m = s.movements.find((x) => x.id === y.m);
  if (m && m.status === "crushed") {
    y.cowed = s.day + FERMENT.cowedYears * DAYS_PER_YEAR;
    y.rest = y.cowed;
    y.ferment = Math.min(y.ferment, 15);
  } else y.rest = s.day + 2 * DAYS_PER_YEAR;
  delete y.m;
}

/** A plot forming, or one under way kept in step with the town. */
function plotMonthly(g: ConquestGame, y: Yoke): void {
  const s = g.s;
  if (y.m !== undefined) {
    const m = liveMovement(g, y.m);
    // A computer's plot grows with the town's temper (a player's with their work).
    if (m && m.status === "brewing" && !lifeOfChar(s, m.leader)) {
      const want = Math.max(25, y.ferment - 30);
      m.support =
        Math.round(
          (m.support < want
            ? m.support + (want - m.support) * 0.3
            : m.support - Math.min(1, m.support - want)) * 10,
        ) / 10;
      g.movementsChanged();
    }
    return;
  }
  if ((y.rest ?? 0) > s.day) return;
  const chance = plotChance(y.ferment);
  if (chance <= 0) return;
  if (rdice(g, 0x200 + y.p).next() >= chance) return;
  formPlot(g, y);
}

/** People who'd lead a town's people, and be sworn first: townsfolk of theirs, or new faces. */
function plotters(g: ConquestGame, y: Yoke): number[] {
  const s = g.s;
  const O = s.nations[y.old];
  const native = O.kind === "native";
  const dice = rdice(g, 0x300 + y.p);
  const out: number[] = [];
  for (const id of s.locals[y.p] ?? []) {
    const c = s.chars[id];
    if (!c?.alive || c.abroad || lifeOfChar(s, id)) continue;
    if (c.culture !== O.culture) continue;
    if (s.day - c.born < 20 * DAYS_PER_YEAR) continue;
    if (s.movements.some((m) => m.leader === id || m.members.includes(id)))
      continue;
    out.push(id);
    if (out.length >= 3) break;
  }
  while (out.length < 3) {
    const c = makeCharacter(s, dice, {
      nation: y.old,
      culture: O.culture,
      religion: O.religion,
      female: native ? dice.chance(0.25) : false,
      age: dice.int(26, 52),
      traits: [dice.pick(["brave", "zealous", "ambitious", "just"] as const)!],
    });
    c.home = y.p;
    c.role = native
      ? "warleader"
      : dice.pick(["planter", "merchant", "labourer"] as const)!;
    g.touchChar(c);
    (s.locals[y.p] ??= []).push(c.id);
    g.localsChanged(y.p);
    out.push(c.id);
  }
  return out;
}

/** A plot forms among a town's people. */
export function formPlot(g: ConquestGame, y: Yoke): Movement {
  const s = g.s;
  const O = s.nations[y.old];
  const native = O.kind === "native";
  const aim: TownRising["aim"] = native ? "expel" : "restore";
  const [leader, ...members] = plotters(g, y);
  const dice = rdice(g, 0x400 + y.p);
  const due = s.day + dice.int(60, 150);
  const name = native
    ? `The ${O.adjective} rising at ${town(g, y.p)}`
    : `The ${O.adjective} party at ${town(g, y.p)}`;
  const m: Movement = {
    id: g.nextId(),
    key: `town-${y.p}`,
    name,
    goal: aim,
    against: y.ruler,
    people: native ? y.old : -1,
    region: [y.p],
    founded: s.day,
    leader,
    members,
    support: Math.max(25, Math.min(70, Math.round(y.ferment - 30))),
    arms: 0,
    status: "brewing",
    rebels: -1,
    rose: -1,
    ended: -1,
    due,
    fades: due + DAYS_PER_YEAR,
    text: native
      ? `${O.adjective} families who never gave up ${town(g, y.p)} to ${named(g, y.ruler)}.`
      : `${O.adjective} townsfolk who never took to ${s.nations[y.ruler].adjective} rule.`,
  };
  s.movements.push(m);
  g.movementsChanged();
  const R = reclaimState(g);
  R.risings.push({ m: m.id, p: y.p, old: y.old, aim });
  y.m = m.id;
  reclaimChanged(g);
  rumour(
    g,
    y.p,
    `Whispers in ${town(g, y.p)}: the ${O.adjective} townsfolk meet at night.`,
    -1,
    undefined,
    false,
    true,
  );
  // Those who live there hear of it, and choose.
  for (const life of livesIn(g, y.p)) {
    if (isChildLife(s, life)) continue;
    if (s.nations[y.ruler]?.ruler === life.c) continue;
    raiseEvent(g, life, "town-plot", { m: m.id, p: y.p });
  }
  return m;
}

// ---------------------------------------------------------------- the rising

/** A town's rising takes the field: its first night, rolled from the odds shown. */
hooks.risingBegins.push((g, m) => {
  const s = g.s;
  const tr = townRisingOf(s, m);
  if (!tr || tr.night) return;
  const odds = risingOdds(s, g.w, m);
  const u = rdice(g, 0x500 + m.id).next();
  const R = reclaimState(g);
  reclaimChanged(g);
  if (u < odds.found) {
    tr.night = "found";
    brokenUp(g, m, tr, "found");
    return false;
  }
  if (u < odds.found + odds.seize) {
    tr.night = "seized";
    // The garrison is beaten in the streets and marches out.
    marchOut(g, tr.p, m.against);
    for (const c of [m.leader, ...m.members]) {
      const life = lifeOfChar(s, c);
      if (life)
        affairNews(
          g,
          life,
          "cause",
          `The night came, and ${town(g, tr.p)} is ours: the ${s.nations[m.against].adjective} garrison is beaten in the streets. Now hold it ${RISING.holdMonths} months.`,
          "good",
        );
    }
    void R;
    return true;
  }
  tr.night = "beaten";
  brokenUp(g, m, tr, "beaten");
  return false;
});

/** The rulers' soldiers in a town, beaten, march out to their nearest town. */
function marchOut(g: ConquestGame, p: number, ruler: number): void {
  const s = g.s;
  const home = provincesOf(s, ruler)
    .filter((q) => q !== p)
    .sort((a, b) => kmBetween(g.map, p, a) - kmBetween(g.map, p, b))[0];
  for (const a of [...s.armies]) {
    if (a.owner !== ruler || a.prov !== p || a.depart >= 0) continue;
    const x = g.touch(a);
    for (const r of x.regs) r.men = Math.round(r.men * 0.7 * 10) / 10;
    x.regs = x.regs.filter((r) => r.men >= 10);
    if (!x.regs.length || home === undefined) {
      g.removeArmy(a);
      continue;
    }
    x.prov = home;
    x.path = [];
    x.depart = -1;
    x.retreating = false;
    x.arrived = s.day;
    for (const r of x.regs) r.morale = Math.min(r.morale, 0.3);
  }
}

/** A plot found out, or beaten in the streets: the ringleaders taken. */
function brokenUp(
  g: ConquestGame,
  m: Movement,
  tr: TownRising,
  how: "found" | "beaten" | "informed",
): void {
  const s = g.s;
  m.status = "crushed";
  m.ended = s.day;
  g.movementsChanged();
  const R = s.nations[m.against];
  const dice = rdice(g, 0x600 + m.id);
  const text =
    how === "beaten"
      ? `${m.name} rose in the night and was beaten in the streets by the ${R.adjective} garrison. The ringleaders are taken.`
      : `${m.name} was found out before it could rise. The ringleaders are taken.`;
  g.event({ k: "news", day: s.day, n: m.against, p: tr.p, text });
  rumour(g, tr.p, text, -1, "bad");
  if (how === "beaten") {
    const x = g.prov(tr.p);
    x.devastation = Math.min(1, x.devastation + 0.05);
    for (const a of s.armies)
      if (a.owner === m.against && a.prov === tr.p && a.depart < 0) {
        const y = g.touch(a);
        for (const r of y.regs) r.men = Math.max(10, Math.round(r.men * 0.9));
      }
  }
  for (const c of [m.leader, ...m.members]) {
    const ch = s.chars[c];
    if (!ch?.alive) continue;
    const life = lifeOfChar(s, c);
    if (life) {
      affairNews(g, life, "cause", text, "bad");
      raiseEvent(g, life, c === m.leader ? "rebel-caught" : "rebel-hunted", {
        m: m.id,
      });
    } else if (c === m.leader && dice.chance(0.6)) {
      kill(g, ch, `the hangman, after ${m.name}`);
    }
  }
}

/** A town's rising has won when it has held its town three months. */
hooks.risingWin.push((g, m, held, months) => {
  const tr = townRisingOf(g.s, m);
  if (!tr) return undefined;
  return held.includes(tr.p) && months >= RISING.holdMonths;
});

/** What a town's rising does when it wins. */
hooks.risingWon.push((g, m) => {
  const s = g.s;
  const tr = townRisingOf(s, m);
  if (!tr) return undefined;
  const p = tr.p;
  const ruler = m.against;
  const R = s.nations[ruler];
  for (const c of [m.leader, ...m.members]) {
    const life = lifeOfChar(s, c);
    if (life)
      affairNews(
        g,
        life,
        "cause",
        `${m.name} has held ${town(g, p)} ${RISING.holdMonths} months: it's won.`,
        "good",
      );
  }
  endRising(g, m);
  if (s.provinces[p].owner !== ruler)
    return `${m.name} has carried the day at ${town(g, p)}.`;
  // Its rulers let it be for some years, as after a peace: no taking it
  // straight back (and no taking it back again after that).
  const settled = (to: number): void => {
    if (to === ruler || to < 0 || atWar(s, ruler, to)) return;
    s.truces.push({
      a: ruler,
      b: to,
      until: s.day + RISING.truceYears * DAYS_PER_YEAR,
    });
    g.trucesChanged();
  };
  const O = s.nations[tr.old];
  let aim = tr.aim;
  if (aim === "restore" && !O?.alive) aim = "free";
  if (aim === "expel") {
    // The colonists go to their own people's nearest town; the town goes back.
    const pr = g.prov(p);
    const refuge = provincesOf(s, ruler)
      .filter((q) => q !== p)
      .sort((a, b) => kmBetween(g.map, p, a) - kmBetween(g.map, p, b))[0];
    const fleeing = pr.pops.filter((x) => x.cls !== "tribe");
    pr.pops = pr.pops.filter((x) => x.cls === "tribe");
    if (refuge !== undefined) {
      const dest = g.prov(refuge);
      for (const pop of fleeing)
        dest.pops.push({ ...pop, size: pop.size * 0.8 });
      merge(dest.pops);
    }
    const people0 = g.nation(tr.old);
    if (!people0.alive) {
      people0.alive = true;
      people0.capital = p;
    }
    takenHow.how = "rising";
    cede(g, p, tr.old);
    takenHow.how = "";
    settled(tr.old);
    return `${m.name} has driven the ${R.adjective} out of ${town(g, p)}; it is ${O.name.replace(/^the /, "the ")}'s again.`;
  }
  if (aim === "restore") {
    takenHow.how = "rising";
    cede(g, p, tr.old);
    takenHow.how = "";
    settled(tr.old);
    return `${town(g, p)} has risen and given itself back to ${O.name}: the ${R.adjective} garrison is gone.`;
  }
  const free = freeTown(g, m, p);
  settled(free);
  return `${town(g, p)} has risen and stands alone: ${s.nations[free].name}, under ${charName(s.chars[m.leader])}.`;
});

/** A town that rose with nobody to go back to: a free town of its own. */
function freeTown(g: ConquestGame, m: Movement, p: number): number {
  const s = g.s;
  const from = s.nations[m.against];
  const leader = s.chars[m.leader];
  const id = s.nations.length;
  const n = blankNation(
    id,
    `free-${id}`,
    "power",
    `the Free Town of ${town(g, p)}`,
    "Free",
    "#6d5a36",
    {
      culture: leader?.culture ?? from.culture,
      religion: leader?.religion ?? from.religion,
      capital: p,
      gold: 10,
      player: null,
      playerName: null,
    },
  );
  n.independent = true;
  n.ruler = leader?.alive ? leader.id : -1;
  n.founded = s.day;
  n.favor = 0;
  n.market = JSON.parse(JSON.stringify(from.market));
  for (const k of Object.keys(n.market.stock))
    (n.market.stock as Record<string, number>)[k] = 0;
  s.nations.push(n);
  g.nation(id);
  (g.nation(from.id).relations[id] ??= []).push({
    of: -1,
    why: "Rose against us",
    value: -35,
    until: s.day + 15 * DAYS_PER_YEAR,
  });
  if (leader?.alive) g.touchChar(leader).nation = id;
  makePolities(g);
  takenHow.how = "rising";
  cede(g, p, id);
  takenHow.how = "";
  if (leader?.alive && lifeOfChar(s, leader.id))
    risingWon(g, id, leader.id, true);
  return id;
}

// ---------------------------------------------------------------- what players do

/** The town a player is in, if it's under foreign rule. */
export function yokeHere(g: ConquestGame, life: Life): Yoke | undefined {
  if (life.travel) return undefined;
  return yokeOf(g.s, life.prov);
}

/** The plot (or rising) of a town's people, if there's one. */
export function plotOf(
  g: ConquestGame | { s: import("./Types").GameState },
  y: Yoke | undefined,
): Movement | undefined {
  if (y?.m === undefined) return undefined;
  return g.s.movements.find(
    (m) => m.id === y.m && (m.status === "brewing" || m.status === "risen"),
  );
}

/** Stirring the town up: the check, as rolled. */
export const STIR = {
  skill: "persuasion" as const,
  dc: 7,
  days: FERMENT.stirDays,
};

export function stirOdds(s: import("./Types").GameState, life: Life): number {
  return checkChance(skillLevel(s, life, STIR.skill), STIR.dc);
}

/** The chance stirring the town gets you informed upon (well, or poorly done). */
export const STIR_RISK = { pass: 0.08, fail: 0.2 };

export function stirTown(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const y = yokeHere(g, life);
  if (!y) return "This town is content under its rulers.";
  if (isChildLife(s, life)) return "Not until you're sixteen.";
  if (s.nations[y.ruler]?.ruler === life.c) return "Against your own rule?";
  if ((life.cooldowns["reclaim:stir"] ?? 0) > s.day)
    return "You've stirred them up lately: give it a month.";
  const dice = rdice(g, 0x700 + life.c);
  const pass = dice.next() < stirOdds(s, life);
  const add = pass ? FERMENT.stir : FERMENT.stirPoor;
  y.ferment = Math.min(100, Math.round((y.ferment + add) * 10) / 10);
  reclaimChanged(g);
  setCooldown(g, life, "reclaim:stir", STIR.days);
  gainXp(g, life, "persuasion", 4);
  addStress(g, life, 2);
  const O = s.nations[y.old];
  journal(
    g,
    life,
    pass
      ? `In the taverns and at the church door you speak for ${O.name.replace(/^the /, "the ")}: heads nod. ${town(g, y.p)} stirs (ferment ${Math.round(y.ferment)}).`
      : `You speak against the ${s.nations[y.ruler].adjective}, and most look at their boots. A little stirs (ferment ${Math.round(y.ferment)}).`,
    pass ? "good" : undefined,
  );
  if (pass) addRenown(g, life, 0.5);
  if (dice.next() < (pass ? STIR_RISK.pass : STIR_RISK.fail))
    raiseEvent(g, life, "informed-upon", { m: y.m ?? -1, c: -1 });
  return null;
}

/** Why a player can't join (or lead) a town's plot now, or null. */
export function plotCheck(
  s: import("./Types").GameState,
  life: Life,
  y: Yoke | undefined,
): string | null {
  const m = y ? plotOf({ s }, y) : undefined;
  if (!y || !m) return "There's no plot here.";
  if (isChildLife(s, life)) return "Not until you're sixteen.";
  if (s.nations[m.against]?.ruler === life.c) return "It's against you.";
  const j = joinCheck(s, life, m);
  if (!j.ok && !(m.leader === life.c || m.members.includes(life.c)))
    return j.why;
  return null;
}

export function plotJoin(g: ConquestGame, life: Life): string | null {
  const y = yokeHere(g, life);
  const why = plotCheck(g.s, life, y);
  if (why) return why;
  const m = plotOf(g, y)!;
  if (m.leader === life.c || m.members.includes(life.c))
    return "You're sworn to it already.";
  const err = joinMovement(g, life, m.id);
  if (err) return err;
  affairNews(
    g,
    life,
    "cause",
    `You're sworn to ${m.name}. ${m.status === "risen" ? "It's in arms." : "It rises when its day comes."}`,
  );
  return null;
}

export function plotLead(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const y = yokeHere(g, life);
  const why = plotCheck(s, life, y);
  if (why) return why;
  const m = plotOf(g, y)!;
  if (m.leader === life.c) return "You lead it already.";
  if (m.status !== "brewing") return "It has risen already: join it.";
  if (lifeOfChar(s, m.leader)) return "Another player leads it.";
  if (life.renown < 10) return "They won't follow an unknown (renown 10).";
  m.members = [...m.members.filter((c) => c !== life.c), m.leader];
  m.leader = life.c;
  g.movementsChanged();
  milestone(g, life, "movement", `Took the lead of ${m.name}`);
  affairNews(
    g,
    life,
    "cause",
    `You lead ${m.name}. Call the rising from Society › Causes when it's ready (support 40, three sworn); its first night's odds are shown there and on the town's page.`,
    "good",
  );
  return null;
}

/** What a player who informs on a plot is paid by its rulers. */
export const INFORM = { reward: 4, favour: 3, renown: -1, known: 1 / 3 };

export function plotInform(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const y = yokeHere(g, life);
  const m = plotOf(g, y);
  if (!y || !m) return "There's no plot here.";
  if (m.status !== "brewing") return "It has risen: it's past informing on.";
  if (m.leader === life.c || m.members.includes(life.c))
    return "You're sworn to it.";
  if (isChildLife(s, life)) return "Not until you're sixteen.";
  const tr = townRisingOf(s, m);
  if (tr) tr.night = "found";
  brokenUp(
    g,
    m,
    tr ?? { m: m.id, p: y.p, old: y.old, aim: "restore" },
    "informed",
  );
  withFlow(
    g,
    { key: "reclaim:inform", label: "A reward for information" },
    () => earn(g, life, INFORM.reward),
  );
  if (meOf(s, life)?.nation === y.ruler) addFavor(g, life, INFORM.favour);
  addRenown(g, life, INFORM.renown);
  milestone(g, life, "movement", `Informed on ${m.name}`);
  const dice = rdice(g, 0x800 + life.c);
  const known = dice.next() < INFORM.known;
  journal(
    g,
    life,
    `You lay an information against ${m.name}. The ${s.nations[y.ruler].adjective} take its ringleaders in the night, and pay you ${INFORM.reward} coins.${known ? " Word of who talked gets out: its people won't forget it." : ""}`,
  );
  if (known) {
    const O = s.nations[y.old];
    for (const id of s.locals[y.p] ?? []) {
      const c = s.chars[id];
      if (c?.alive && c.culture === O?.culture && !lifeOfChar(s, id))
        remembers(g, life, c, "Informed on the rising", -20, 10);
    }
  }
  return null;
}

function setAim(
  g: ConquestGame,
  life: Life,
  aim: "restore" | "free" | undefined,
): string | null {
  const s = g.s;
  const y = yokeHere(g, life);
  const m = plotOf(g, y);
  if (!m || m.leader !== life.c) return "You don't lead a rising here.";
  const tr = townRisingOf(s, m);
  if (!tr || tr.aim === "expel")
    return "Its people mean to have their land back.";
  if (aim !== "restore" && aim !== "free") return "Restore it, or a free town?";
  if (aim === "restore" && !s.nations[tr.old]?.alive)
    return "There's nobody left to give it back to.";
  tr.aim = aim;
  m.goal = aim;
  g.movementsChanged();
  reclaimChanged(g);
  return null;
}

function reclaimCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "reclaim") return undefined;
  if (life.c < 0 || life.watching) return "You're watching.";
  touchLife(g, life);
  switch (c.act) {
    case "stir":
      return stirTown(g, life);
    case "join":
      return plotJoin(g, life);
    case "lead":
      return plotLead(g, life);
    case "inform":
      return plotInform(g, life);
    case "aim":
      return setAim(g, life, c.aim);
    default:
      return "Unknown.";
  }
}

hooks.command.push(reclaimCommand);

/** For the scenes: is this life a native? (the plot's people must be theirs to join). */
export function nativeLife(g: ConquestGame, life: Life): boolean {
  return lifeIsNative(g.s, life);
}

export { claimOf, garrisonOf };
