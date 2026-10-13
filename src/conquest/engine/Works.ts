// TOWNS (r17): a town's government builds, repairs and rebuilds its public
// works by vote. A player who holds local office puts a work to the town's
// body (the county court, the town meeting, the cabildo, the council fire);
// anyone else of the town petitions for one. On the day the body sits each
// computer member votes by their interest, what they think of the mover,
// the levy and the town's need, as the odds shown before; players vote for
// themselves. Carried, it's paid by a levy (the town grows a little more
// restless) and a subscription the town's people of means and any player
// may pay into; then it's built over some months, and stands.
//
// When a town is taken its places aren't wiped: what was burned or left to
// rot is remembered as ruins, and can be repaired by vote for half the cost
// of building new. A native nation that takes a port keeps its landing.

import { formatDate } from "./Calendar";
import type { ConquestGame } from "./Game";
import { withFlow } from "./LedgerCore";
import {
  addRenown,
  journal,
  milestone,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import { meOf } from "./LifeQueries";
import { ROLES } from "./LifeRules";
import { BUILDINGS, DAYS_PER_YEAR } from "./Rules";
import { rumour } from "./Rumours";
import { delivered } from "./Standing";
import { tdice, townFolk, townsChanged, townsState } from "./TownsCore";
import type {
  BuildingKind,
  Life,
  TownRuin,
  TownsCommand,
  TownWork,
  TownWorkKey,
} from "./Types";
import {
  bodyOf,
  carryChance,
  doneOn,
  isMember,
  lc,
  leansOn,
  levyFor,
  memberName,
  membersOf,
  nextSitting,
  proposeCheck,
  REPAIR,
  RUIN_WORK,
  ruinOf,
  stillWanted,
  subscribeCheck,
  subscribed,
  TOWN_WORKS,
  voteCheck,
  workCost,
  workFits,
  workName,
  type Motion,
} from "./WorksCore";

// ---------------------------------------------------------------- the rules

/** The town's people of means subscribe this share of their wealth (an aye a little more). */
export const SUBS = {
  /** Of a member who voted aye. */
  aye: 0.25,
  /** Of a member who voted no, or any other householder of means. */
  other: 0.08,
  /** Each month after, until it's subscribed, they add a tenth of what they gave. */
  drip: 0.1,
  /** Then the subscription closes and a second levy raises the rest. */
  days: 180,
} as const;

/** A computer member brings the repair of a ruin, a month (and a wharf or a church where a town lacks one). */
export const NPC_BRINGS = { ruin: 1 / 8, want: 1 / 36 } as const;

/** Renown for the mover: carried, and done. */
const RENOWN = { carried: 2, done: 3, sub: 0.1, subCap: 3 } as const;

// ---------------------------------------------------------------- a proposal

function motionOf(work: TownWork): Motion {
  return {
    p: work.p,
    key: work.key,
    repair: work.repair,
    by: work.by,
    petition: work.petition,
    levy: work.levy,
    pledge: work.pledge,
    seed: work.id,
  };
}

function townName(g: ConquestGame, p: number): string {
  return g.map.provinces[p]?.name ?? "the town";
}

/** Players who live in a town, or are there, or sit on its body. */
function townLives(g: ConquestGame, p: number, also: number[] = []): Life[] {
  const s = g.s;
  const members = new Set(membersOf(s, p));
  return s.lives.filter(
    (l) =>
      l.c >= 0 &&
      !l.watching &&
      meOf(s, l)?.alive &&
      (l.home === p ||
        (l.prov === p && !l.travel) ||
        members.has(l.c) ||
        also.includes(l.c)),
  );
}

function tellTown(
  g: ConquestGame,
  p: number,
  text: string,
  tone?: "good" | "bad",
  also: number[] = [],
): void {
  for (const l of townLives(g, p, also)) journal(g, l, text, tone, false);
}

/** Put a work to the town's body, or petition for it. */
export function propose(
  g: ConquestGame,
  life: Life,
  key: TownWorkKey,
  pledge = 0,
): string | null {
  const s = g.s;
  if (!(key in TOWN_WORKS)) return "No such work.";
  const coins = Math.max(0, Math.round(pledge));
  const check = proposeCheck(s, g.w, life, key, coins);
  if (!check.ok) return check.why;
  const p = life.prov;
  const member = isMember(s, p, life);
  const work = putWork(g, p, key, life.c, !member, coins);
  touchLife(g, life);
  const body = bodyOf(s, p, key);
  const odds = carryChance(leansOn(s, motionOf(work), work.cast));
  journal(
    g,
    life,
    `${member ? "You put" : "You petition"} ${body.name} for ${lc(workName(s, p, key))}${work.repair ? " (a repair)" : ""}: ${work.cost} coins, ${work.levy} of it by ${body.levy}${coins ? `, and ${coins} you'll put down yourself if it carries` : ""}. It sits on ${formatDate(work.sits)}; as it stands, ${oddsWords(odds)} it carries.`,
  );
  tellTown(
    g,
    p,
    `Before ${body.name} on ${formatDate(work.sits)}: ${lc(workName(s, p, key))}${work.repair ? " to repair what was ruined" : ""}, ${member ? "brought" : "petitioned for"} by ${memberName(s, life.c)}.`,
  );
  return null;
}

function putWork(
  g: ConquestGame,
  p: number,
  key: TownWorkKey,
  by: number,
  petition: boolean,
  pledge: number,
): TownWork {
  const s = g.s;
  const t = townsState(g);
  const cost = workCost(s, p, key);
  const work: TownWork = {
    id: g.nextId(),
    p,
    key,
    repair: cost.repair,
    by,
    petition,
    nation: s.provinces[p].owner,
    stage: "proposed",
    day: s.day,
    sits: nextSitting(s.day),
    cost: cost.cost,
    levy: levyFor(s, p, cost.cost),
    pledge: Math.min(pledge, cost.cost),
    subs: {},
    cast: petition ? {} : { [by]: 1 },
  };
  t.works.push(work);
  townsChanged(g);
  return work;
}

/** "3 in 4", "1 in 3", "9 in 10". */
export function oddsWords(p: number): string {
  if (p >= 0.995) return "it's sure";
  if (p <= 0.005) return "there's no chance";
  const fr: [number, number][] = [
    [1, 20],
    [1, 10],
    [1, 6],
    [1, 5],
    [1, 4],
    [1, 3],
    [2, 5],
    [1, 2],
    [3, 5],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [9, 10],
    [19, 20],
  ];
  let best = fr[0];
  for (const f of fr)
    if (Math.abs(f[0] / f[1] - p) < Math.abs(best[0] / best[1] - p)) best = f;
  return `${best[0]} in ${best[1]}`;
}

/** A member votes, before the sitting. */
function vote(
  g: ConquestGame,
  life: Life,
  id: number,
  v: number,
): string | null {
  const s = g.s;
  const work = townsState(g).works.find((x) => x.id === id);
  if (!work) return "No such proposal.";
  const check = voteCheck(s, life, work);
  if (!check.ok) return check.why;
  work.cast[life.c] = v > 0 ? 1 : -1;
  townsChanged(g);
  touchLife(g, life);
  journal(
    g,
    life,
    `You'll vote ${v > 0 ? "for" : "against"} ${lc(workName(s, work.p, work.key))} when ${bodyOf(s, work.p, work.key).name} sits on ${formatDate(work.sits)}.`,
  );
  return null;
}

/** Pay into a carried work's subscription. */
function subscribe(
  g: ConquestGame,
  life: Life,
  id: number,
  coins: number,
): string | null {
  const s = g.s;
  const work = townsState(g).works.find((x) => x.id === id);
  if (!work) return "No such work.";
  const want = stillWanted(work);
  const pay = Math.min(Math.round(coins * 10) / 10, want);
  const check = subscribeCheck(s, life, work, pay);
  if (!check.ok) return check.why;
  const name = workName(s, work.p, work.key);
  withFlow(
    g,
    {
      key: `towns:${work.id}`,
      label: `Subscribed: ${lc(name)} at ${townName(g, work.p)}`,
    },
    () => spend(g, life, pay),
  );
  work.subs[life.c] = Math.round(((work.subs[life.c] ?? 0) + pay) * 10) / 10;
  addRenown(g, life, Math.min(RENOWN.subCap, pay * RENOWN.sub));
  const me = meOf(s, life);
  for (const id2 of membersOf(s, work.p)) {
    const c = s.chars[id2];
    if (c && me && c.id !== me.id && !s.lives.some((l) => l.c === c.id))
      remembers(
        g,
        life,
        c,
        `Subscribed to ${lc(name)}`,
        Math.min(8, 2 + pay / 5),
        4,
      );
  }
  townsChanged(g);
  journal(
    g,
    life,
    `You subscribe ${pay} coins to ${lc(name)} at ${townName(g, work.p)}.${stillWanted(work) <= 0 ? " That's the whole of it." : ` ${stillWanted(work)} still wanted.`}`,
    "good",
  );
  if (stillWanted(work) <= 0) begin(g, work);
  return null;
}

/** The mover takes it back before the sitting. */
function withdraw(g: ConquestGame, life: Life, id: number): string | null {
  const t = townsState(g);
  const work = t.works.find((x) => x.id === id);
  if (!work) return "No such proposal.";
  if (work.by !== life.c) return "It isn't yours to withdraw.";
  if (work.stage !== "proposed") return "It's been voted on.";
  close(g, work, "lapsed");
  journal(g, life, `You withdraw ${lc(workName(g.s, work.p, work.key))}.`);
  return null;
}

function close(
  g: ConquestGame,
  work: TownWork,
  stage: TownWork["stage"],
): void {
  const t = townsState(g);
  work.stage = stage;
  t.works = t.works.filter((x) => x !== work);
  t.past.push(work);
  // The last few of each town are kept for the record.
  const mine = t.past.filter((x) => x.p === work.p);
  if (mine.length > 6) {
    const drop = new Set(mine.slice(0, mine.length - 6));
    t.past = t.past.filter((x) => !drop.has(x));
  }
  townsChanged(g);
}

export function townsCommand(
  g: ConquestGame,
  life: Life,
  c: { k: string },
): string | null | undefined {
  if (c.k !== "towns") return undefined;
  const x = c as TownsCommand;
  if (!meOf(g.s, life) || life.watching)
    return "You're watching the world now.";
  switch (x.act) {
    case "propose":
      return x.key ? propose(g, life, x.key, x.coins ?? 0) : "Choose a work.";
    case "vote":
      return vote(g, life, x.id ?? -1, x.v ?? 0);
    case "subscribe":
      return subscribe(g, life, x.id ?? -1, x.coins ?? 0);
    case "withdraw":
      return withdraw(g, life, x.id ?? -1);
    default:
      return "Unknown command.";
  }
}

// ---------------------------------------------------------------- the sitting

function sit(g: ConquestGame, work: TownWork): void {
  const s = g.s;
  const r = tdice(g);
  const leans = leansOn(s, motionOf(work), work.cast);
  work.odds = Math.round(carryChance(leans) * 1000) / 1000;
  const votes = leans.map((l) => {
    const v = l.player ? (l.cast ?? 0) : r.chance(l.p) ? 1 : -1;
    const lines = l.lines.filter((x) => (v > 0 ? x.v > 0 : x.v < 0));
    return {
      c: l.c,
      v,
      why: l.player ? "" : (lines[0]?.why ?? l.lines[0]?.why ?? ""),
    };
  });
  work.votes = votes;
  work.ayes = votes.filter((v) => v.v > 0).length;
  work.noes = votes.filter((v) => v.v < 0).length;
  const body = bodyOf(s, work.p, work.key);
  const name = lc(workName(s, work.p, work.key));
  const carried = work.ayes > work.noes;
  const reasons = votes
    .filter((v) => v.why && (carried ? v.v > 0 : v.v < 0))
    .slice(0, 2)
    .map((v) => `${memberName(s, v.c)}: ${lc(v.why)}`)
    .join("; ");
  const head = `${cap(body.name)} sat on ${name} at ${townName(g, work.p)}: ${carried ? "carried" : "thrown out"}, ${work.ayes} to ${work.noes}`;
  if (!carried) {
    close(g, work, "lost");
    tellTown(g, work.p, `${head}${reasons ? ` (${reasons})` : ""}.`, "bad", [
      work.by,
    ]);
    return;
  }
  work.stage = "carried";
  work.until = s.day + SUBS.days;
  // The levy: the town grows a little more restless for a year.
  levy(g, work, work.levy, body.levy);
  // The mover's pledge, and what the town's people of means put down.
  const mover = s.lives.find((l) => l.c === work.by);
  if (mover && work.pledge > 0 && meOf(s, mover)?.alive) {
    const pay = Math.min(work.pledge, Math.max(0, Math.floor(mover.purse)));
    if (pay > 0) {
      withFlow(
        g,
        {
          key: `towns:${work.id}`,
          label: `Pledged: ${name} at ${townName(g, work.p)}`,
        },
        () => spend(g, mover, pay),
      );
      work.subs[mover.c] = pay;
    }
  }
  for (const [c, coins] of npcSubscriptions(g, work, votes))
    work.subs[c] = coins;
  if (mover) {
    addRenown(g, mover, RENOWN.carried);
    for (const v of votes) {
      const c = s.chars[v.c];
      if (
        c &&
        v.v > 0 &&
        c.id !== mover.c &&
        !s.lives.some((l) => l.c === c.id)
      )
        remembers(g, mover, c, `Brought ${name}`, 3, 3);
    }
  }
  townsChanged(g);
  tellTown(
    g,
    work.p,
    `${head}${reasons ? ` (${reasons})` : ""}. ${work.levy} by ${body.levy}; the town's people of means subscribe ${subscribed(work)}${stillWanted(work) > 0 ? `, and ${stillWanted(work)} is still wanted (Society › Town)` : ""}.`,
    "good",
    [work.by],
  );
  rumour(
    g,
    work.p,
    `${cap(body.name)} at ${townName(g, work.p)} has voted ${name}.`,
    -1,
    "good",
    false,
    true,
  );
  if (stillWanted(work) <= 0) begin(g, work);
}

function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function levy(
  g: ConquestGame,
  work: TownWork,
  coins: number,
  words: string,
): void {
  if (coins <= 0) return;
  const s = g.s;
  const folk = Math.max(100, townFolk(s, work.p));
  const unrest = Math.max(1, Math.min(5, Math.round(coins / (folk / 100))));
  const pr = g.prov(work.p);
  const key = `town-levy-${work.id}`;
  pr.mods = pr.mods.filter((m) => m.key !== key);
  pr.mods.push({
    key,
    label: `${cap(words)} for ${lc(workName(s, work.p, work.key))}`,
    until: s.day + DAYS_PER_YEAR,
    fx: { unrest },
  });
}

/** What the town's people of means put down when a work carries: members by their vote, the rest a little. */
function npcSubscriptions(
  g: ConquestGame,
  work: TownWork,
  votes: { c: number; v: number }[],
): [number, number][] {
  const s = g.s;
  const out: [number, number][] = [];
  const voted = new Map(votes.map((v) => [v.c, v.v]));
  const want = Math.max(0, work.cost - work.levy - subscribed(work));
  let total = 0;
  for (const id of s.locals[work.p] ?? []) {
    const c = s.chars[id];
    if (!c?.alive || s.lives.some((l) => l.c === c.id)) continue;
    const wealth = wealthOf(c);
    if (wealth <= 0) continue;
    const share = voted.get(c.id) === 1 ? SUBS.aye : SUBS.other;
    const coins = Math.round(wealth * share * 10) / 10;
    if (coins < 0.5) continue;
    out.push([c.id, coins]);
    total += coins;
  }
  // Never more than the work wants.
  if (total > want && total > 0) {
    const k = want / total;
    for (const x of out) x[1] = Math.round(x[1] * k * 10) / 10;
  }
  return out.filter((x) => x[1] > 0);
}

/** What one of the town's people has to give: a post's wealth, a person of note's. */
function wealthOf(c: { role?: string; came?: { as: string } }): number {
  if (c.role) {
    const w = ROLE_WEALTH[c.role];
    if (w !== undefined) return w;
  }
  if (
    c.came?.as &&
    /gentleman|hidalgo|fidalgo|standing|good family/.test(c.came.as)
  )
    return 40;
  return c.came?.as ? 6 : 0;
}

/** Wealth by post, from the townsfolk's own table. */
const ROLE_WEALTH: Record<string, number> = Object.fromEntries(
  Object.entries(ROLES).map(([k, v]) => [k, v.wealth]),
);

/** The subscription is in (or the second levy has raised the rest): work begins. */
function begin(g: ConquestGame, work: TownWork): void {
  const s = g.s;
  if (work.stage !== "carried") return;
  const def = TOWN_WORKS[work.key];
  const months = work.repair
    ? Math.max(1, Math.ceil(def.months * REPAIR.time))
    : def.months;
  work.stage = "building";
  work.begun = s.day;
  work.done = doneOn(s.day, months);
  townsChanged(g);
  tellTown(
    g,
    work.p,
    `Work begins on ${lc(workName(s, work.p, work.key))} at ${townName(g, work.p)}; it should be finished about ${formatDate(work.done)}.`,
  );
}

/** A work is finished: it stands, and does what it does. */
function finish(g: ConquestGame, work: TownWork): void {
  const s = g.s;
  const t = townsState(g);
  const def = TOWN_WORKS[work.key];
  const p = work.p;
  const pr = g.prov(p);
  const ruin = ruinOf(s, p, work.key) ?? ruinFor(s, p, def.b);
  if (def.b) {
    const max = def.native ? 1 : BUILDINGS[def.b].max;
    const now = pr.b[def.b] ?? 0;
    const to = Math.min(max, ruin ? now + ruin.lvl : Math.max(now, 1));
    pr.b[def.b] = Math.max(now, to);
    (t.built[p] ??= {})[def.b] = pr.b[def.b];
  } else {
    (t.kept[p] ??= {})[work.key] = s.day;
    const key = `town:${work.key}`;
    pr.mods = pr.mods.filter((m) => m.key !== key);
    pr.mods.push({
      key,
      label: workName(s, p, work.key),
      until: s.day + 200 * DAYS_PER_YEAR,
      fx: { ...(def.fx ?? {}) },
    });
  }
  if (ruin) dropRuin(g, p, ruin);
  work.stage = "done";
  close(g, work, "done");
  const name = workName(s, p, work.key);
  const text = `${name} at ${townName(g, p)} is finished${work.repair ? ", repaired from its ruins" : ""}: ${def.does}.`;
  tellTown(g, p, text, "good", [work.by]);
  rumour(
    g,
    p,
    `${name} at ${townName(g, p)} is finished.`,
    -1,
    "good",
    false,
    true,
  );
  const mover = s.lives.find((l) => l.c === work.by);
  if (mover && meOf(s, mover)?.alive) {
    addRenown(g, mover, RENOWN.done);
    milestone(
      g,
      mover,
      work.petition ? "renown" : "office",
      `${work.petition ? "Petitioned for" : "Brought"} ${lc(name)} at ${townName(g, p)}${work.repair ? ", rebuilt" : ""}`,
      p,
    );
    if (!work.petition) delivered(g, mover, `${lc(name)} at ${townName(g, p)}`); // POLLS (r16): something delivered
  }
}

function ruinFor(
  s: ConquestGame["s"],
  p: number,
  b: BuildingKind | undefined,
): TownRuin | undefined {
  const key = b ? RUIN_WORK[b] : undefined;
  return key ? ruinOf(s, p, key) : undefined;
}

function dropRuin(g: ConquestGame, p: number, ruin: TownRuin): void {
  const t = townsState(g);
  t.ruins[p] = (t.ruins[p] ?? []).filter((r) => r !== ruin);
  if (!t.ruins[p].length) delete t.ruins[p];
  townsChanged(g);
}

// ---------------------------------------------------------------- the month

/** Sittings, subscriptions, building, and the computer's members bringing works. */
export function worksMonthly(g: ConquestGame): void {
  const s = g.s;
  const t = townsState(g);
  for (const work of [...t.works]) {
    const pr = s.provinces[work.p];
    if (!pr || pr.owner !== work.nation) {
      lapse(g, work, "the town changed hands");
      continue;
    }
    if (work.stage === "proposed" && work.sits <= s.day) {
      if (pr.occupier >= 0) {
        work.sits = nextSitting(s.day);
        townsChanged(g);
        continue;
      }
      sit(g, work);
      continue;
    }
    if (work.stage === "carried") {
      // The town's people of means add a little each month; then a second levy.
      const first = Object.entries(work.subs).filter(
        ([c]) => !s.lives.some((l) => l.c === Number(c)),
      );
      for (const [c, v] of first) {
        const add = Math.round(v * SUBS.drip * 10) / 10;
        if (add > 0 && stillWanted(work) > 0)
          work.subs[Number(c)] =
            Math.round((v + Math.min(add, stillWanted(work))) * 10) / 10;
      }
      if (stillWanted(work) > 0 && s.day >= (work.until ?? s.day)) {
        const rest = stillWanted(work);
        work.levy += rest;
        levy(g, work, rest, `a second ${lc(bodyOf(s, work.p, work.key).levy)}`);
      }
      townsChanged(g);
      if (stillWanted(work) <= 0) begin(g, work);
      continue;
    }
    if (work.stage === "building") {
      // Nothing is built in a town held by an enemy.
      if (pr.occupier >= 0) {
        work.done = (work.done ?? s.day) + 30;
        townsChanged(g);
        continue;
      }
      if ((work.done ?? 0) <= s.day) finish(g, work);
    }
  }
  computerBrings(g);
}

function lapse(g: ConquestGame, work: TownWork, why: string): void {
  close(g, work, "lapsed");
  tellTown(
    g,
    work.p,
    `${workName(g.s, work.p, work.key)} at ${townName(g, work.p)} will not be built: ${why}.`,
    "bad",
    [work.by],
  );
}

/** Every work of a town lapses (it's been taken). */
export function lapseWorks(g: ConquestGame, p: number, why: string): void {
  for (const work of [...townsState(g).works])
    if (work.p === p) lapse(g, work, why);
}

/**
 * The town's own people bring what it most wants, where nobody has: the
 * repair of a ruin first, now and then a wharf or a church a town lacks.
 * Only in towns someone has lived in (those with a government of their own).
 */
function computerBrings(g: ConquestGame): void {
  const s = g.s;
  const r = tdice(g);
  for (const key of Object.keys(s.locals)) {
    const p = Number(key);
    const pr = s.provinces[p];
    if (!pr || pr.owner < 0 || pr.occupier >= 0) continue;
    if (!s.society?.offices[p]?.length) continue;
    if ((s.towns?.works ?? []).some((x) => x.p === p)) continue;
    const ruins = (s.towns?.ruins[p] ?? []).filter((x) => x.lvl > 0);
    let want: TownWorkKey | undefined;
    const native = s.nations[pr.owner]?.kind === "native";
    for (const ru of ruins) {
      const k = native && ru.key === "wharf" ? "landing" : ru.key;
      if (workFits(s, g.w, p, k).ok) {
        want = k;
        break;
      }
    }
    if (want && !r.chance(NPC_BRINGS.ruin)) want = undefined;
    if (!want && r.chance(NPC_BRINGS.want)) {
      const k: TownWorkKey = native
        ? "landing"
        : g.map.provinces[p].coastal
          ? "wharf"
          : "church";
      if (workFits(s, g.w, p, k).ok && townFolk(s, p) >= 300) want = k;
    }
    if (!want) continue;
    // The member who most wants it brings it.
    const members = membersOf(s, p).filter(
      (c) => !s.lives.some((l) => l.c === c),
    );
    if (!members.length) continue;
    const probe: Motion = {
      p,
      key: want,
      repair: !!ruinOf(s, p, want),
      by: -1,
      petition: false,
      levy: levyFor(s, p, workCost(s, p, want).cost),
      pledge: 0,
      seed: s.day,
    };
    const leans = leansOn(s, probe);
    const by = members.sort(
      (a, b) =>
        (leans.find((l) => l.c === b)?.total ?? 0) -
          (leans.find((l) => l.c === a)?.total ?? 0) || a - b,
    )[0];
    const work = putWork(g, p, want, by, false, 0);
    const body = bodyOf(s, p, want);
    tellTown(
      g,
      p,
      `${memberName(s, by)} brings ${lc(workName(s, p, want))}${work.repair ? " (a repair of what was ruined)" : ""} before ${body.name}; it sits on ${formatDate(work.sits)}.`,
    );
  }
}
