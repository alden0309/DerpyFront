// LABOUR2 (r21): bondage in businesses and trade, run month by month. The
// household's overseer (taken on, given orders, paid; he sets the work and
// minds the place while the holder is away), those held set to work at a
// business of the household's (they live there, are counted among its hands,
// draw no wage but cost their keep, and run every risk the household's
// people run), and the house in the trade (BondTrade.ts). Game.ts loads this,
// so each part registers its commands and hooks.
//
// Rolls are on LABOUR2's own dice (the overseer's word from the quarters);
// a game where nobody holds anyone rolls and changes nothing new.

import { bdice, boundOf, hashOf, isBound, r2, seatSalt } from "./BondCore";
import { boundHooks } from "./Business";
import "./BondTrade";
import { makeCharacter } from "./Characters";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import {
  bizBoundInput,
  bizChoices,
  bizRoom,
  bizWorkCheck,
  hireOverseerCheck,
  overseerCandidates,
  overseerPlan,
  partedBy,
} from "./Labour2Core";
import {
  atBusiness,
  leaveBusiness,
  MANNERS,
  overseerOf,
  shareOf,
} from "./Labour2Rules";
import { affairNews } from "./Ledger";
import { withFlow } from "./LedgerCore";
import { journal, remembers, spend, touchLife } from "./LifeCore";
import { lifeIsNative } from "./LifeQueries";
import type {
  Character,
  GameState,
  Labour2Command,
  Life,
  LifeCommand,
  OverseerOrders,
  Part,
} from "./Types";
import type { World } from "./Map";
import { bondForecast, fieldsOf } from "./BondCore";

/** LABOUR2's own dice (salted apart from LABOUR r15's and every other track's). */
export function l2dice(s: GameState, salt: number) {
  return bdice(s, (0x22a0000 + salt) | 0);
}

// ---------------------------------------------------------------- the overseer

const WORK_WORDS: Record<string, [string, string]> = {
  fields: ["to the fields", "to the fields"],
  house: ["to the house", "to the house"],
  craft: ["hired out in town", "hired out in town"],
  biz: ["to your business", "to your businesses"],
  rest: ["to rest", "to rest"],
};

/** "3 to the fields, 1 to the house". */
export function overseerWorkWords(moved: { work: string; n: number }[]): string {
  return moved
    .map((m) => `${m.n} ${WORK_WORDS[m.work]?.[m.n === 1 ? 0 : 1] ?? m.work}`)
    .join(", ");
}

/** Take an overseer on, from those for hire at the household's home this month. */
function hireOverseer(
  g: ConquestGame,
  life: Life,
  slot: number,
  pay: "wage" | "share",
): string | null {
  const s = g.s;
  const cand = overseerCandidates(s, g.map, life).find((x) => x.slot === slot);
  const check = hireOverseerCheck(s, life, cand);
  if (!check.ok) return check.why;
  const b = life.bondage!;
  const key = `bond2:ov:${b.home}:${Math.floor(s.day / 30)}:${slot}`;
  if (life.cooldowns[key]) return "He's taken another place.";
  const home = b.home;
  const owner = s.nations[s.provinces[home].owner];
  const rng = l2dice(s, hashOf(seatSalt(life.seat), slot, 0x1e5));
  const c = makeCharacter(s, rng, {
    nation: owner.id,
    culture: owner.culture,
    religion: owner.religion,
    female: false,
    age: cand!.age,
    first: cand!.first,
    family: cand!.family,
  });
  // A working man of the town, at work in the fields: shown there.
  c.role = "labourer";
  c.home = home;
  g.touchChar(c);
  const list = s.locals[home] ?? [];
  s.locals[home] = [...list, c.id];
  g.localsChanged(home);
  touchLife(g, life).cooldowns[key] = s.day + 40;
  b.overseer = {
    c: c.id,
    manner: cand!.manner,
    skill: cand!.skill,
    pay,
    wage: cand!.wage,
    shares: cand!.shares,
    since: s.day,
    orders: { work: "assign", rule: "his", report: true },
  };
  remembers(g, life, c, "Took me on as overseer", 10, 3);
  journal(
    g,
    life,
    `You engage ${c.first} ${c.family} (${cand!.note}) as overseer of your household at ${g.map.provinces[home].name}: ${MANNERS[cand!.manner].name.toLowerCase()}, for ${pay === "wage" ? `${cand!.wage} coins a month` : `${cand!.shares === 1 ? "a share" : `${cand!.shares} shares`} of the crop`}. He's to set the work as he sees fit; you can give him other orders.`,
  );
  return null;
}

/** Let the overseer go: he stays a man of the town. */
function dismissOverseer(g: ConquestGame, life: Life): string | null {
  const o = overseerOf(g.s, life);
  if (!o) return "You have no overseer.";
  const c = g.s.chars[o.c];
  touchLife(g, life);
  life.bondage!.overseer = null;
  if (c) remembers(g, life, c, "Turned me off", -10, 3);
  journal(
    g,
    life,
    `You let ${c ? `${c.first} ${c.family}` : "your overseer"} go. ${life.bondage!.people.length ? "The household's work is yours to set again." : ""}`,
  );
  return null;
}

/** Give the overseer his orders. */
function setOrders(
  g: ConquestGame,
  life: Life,
  orders: Partial<OverseerOrders>,
): string | null {
  const o = overseerOf(g.s, life);
  if (!o) return "You have no overseer.";
  const next: OverseerOrders = { ...o.orders };
  if (orders.work === "assign" || orders.work === "keep") next.work = orders.work;
  if (orders.rule === "restraint" || orders.rule === "his") next.rule = orders.rule;
  if (typeof orders.report === "boolean") next.report = orders.report;
  touchLife(g, life);
  life.bondage!.overseer = { ...o, orders: next };
  return null;
}

/** Change how the overseer's paid (once in six months: it's a new bargain). */
function setPay(
  g: ConquestGame,
  life: Life,
  pay: "wage" | "share" | undefined,
): string | null {
  const o = overseerOf(g.s, life);
  if (!o) return "You have no overseer.";
  if (pay !== "wage" && pay !== "share") return "Wages, or shares?";
  if (o.pay === pay) return null;
  const key = "bond2:ovpay";
  if ((life.cooldowns[key] ?? 0) > g.s.day)
    return `A new bargain in ${(life.cooldowns[key] ?? 0) - g.s.day} days.`;
  touchLife(g, life).cooldowns[key] = g.s.day + 180;
  life.bondage!.overseer = { ...o, pay };
  const c = g.s.chars[o.c];
  journal(
    g,
    life,
    `${c?.first ?? "Your overseer"} is paid ${pay === "wage" ? `wages now, ${o.wage} coins a month` : `by ${o.shares === 1 ? "a share" : `${o.shares} shares`} of the crop now`}.`,
  );
  return null;
}

// ---------------------------------------------------------------- work at a business

/** Set someone of the household to work at a business of yours (or bring them home: id -1). */
export function setBiz(
  g: ConquestGame,
  life: Life,
  c: Character | undefined,
  id: number,
  quiet = false,
): string | null {
  const s = g.s;
  if (!c || !isBound(c) || c.bond!.seat !== life.seat)
    return "Not in your household.";
  if (id < 0) {
    if (!atBusiness(c)) return null;
    const was = (life.property ?? []).find((x) => x.id === c.bond!.biz);
    leaveBusiness(g, life, c);
    journal(
      g,
      life,
      `${c.first} comes back from your ${was?.name ?? "business"} to the household at ${g.map.provinces[life.bondage!.home]?.name ?? "home"}.`,
    );
    return null;
  }
  const pr = (life.property ?? []).find((x) => x.id === id);
  // A hand from the town makes way, if the place is full.
  if (pr?.kind === "business" && bizRoom(pr) <= 0 && (pr.biz?.extra ?? 0) > 0) {
    const check = bizWorkCheck(s, g.map, life, c, {
      ...pr,
      biz: { ...pr.biz, extra: (pr.biz!.extra ?? 1) - 1 },
    });
    if (!check.ok) return check.why;
    pr.biz!.extra = (pr.biz!.extra ?? 1) - 1;
    if (!pr.biz!.extra) delete pr.biz!.extra;
  } else {
    const check = bizWorkCheck(s, g.map, life, c, pr);
    if (!check.ok) return check.why;
  }
  leaveBusiness(g, life, c);
  touchLife(g, life);
  const parted = partedBy(s, c, pr!);
  const ch = g.touchChar(c);
  ch.bond = {
    ...ch.bond!,
    work: "biz",
    biz: pr!.id,
    at: pr!.prov,
    ...(parted.length ? { grief: s.day + 180, mood: Math.max(0, ch.bond!.mood - 8) } : {}),
  };
  for (const f of parted)
    g.touchChar(f).bond = {
      ...f.bond!,
      grief: Math.max(f.bond!.grief ?? 0, s.day + 180),
      mood: Math.max(0, f.bond!.mood - 6),
    };
  pr!.biz ??= {};
  pr!.biz.bound = [...(pr!.biz.bound ?? []), c.id];
  const town = g.map.provinces[pr!.prov]?.name ?? "the town";
  if (!quiet)
    journal(
    g,
    life,
    `${c.first} is set to work at your ${pr!.name} at ${town}${parted.length ? `, and goes to live there, away from ${parted.map((x) => x.first).join(" and ")}` : ""}. ${c.female ? "She" : "He"} draws no wage; the business keeps ${c.female ? "her" : "him"}.`,
    parted.length ? "bad" : undefined,
  );
  return null;
}

/** Take anyone no longer the household's (dead, fled, sold, freed) off a business's books. */
function tidyBusinesses(g: ConquestGame, life: Life): void {
  const s = g.s;
  for (const pr of life.property ?? []) {
    const list = pr.biz?.bound;
    if (!list?.length) continue;
    const keep = list.filter((id) => {
      const c = s.chars[id];
      return (
        !!c?.alive &&
        isBound(c) &&
        c.bond!.seat === life.seat &&
        c.bond!.work === "biz" &&
        c.bond!.biz === pr.id
      );
    });
    if (keep.length !== list.length) {
      touchLife(g, life);
      if (keep.length) pr.biz!.bound = keep;
      else delete pr.biz!.bound;
    }
  }
  // Someone whose business is gone (sold, lost) comes home.
  for (const c of boundOf(s, life))
    if (atBusiness(c) && !(life.property ?? []).some((x) => x.id === c.bond!.biz))
      leaveBusiness(g, life, c);
}

// ---------------------------------------------------------------- the month

/** The overseer's month: his pay, the work he sets, his word while you're away. */
function overseerMonth(g: ConquestGame, life: Life): void {
  const s = g.s;
  const b = life.bondage;
  if (!b?.overseer) return;
  const o = overseerOf(s, life);
  if (!o || life.watching || life.c < 0) {
    // He's died, or there's nobody to answer to.
    touchLife(g, life);
    b.overseer = null;
    return;
  }
  touchLife(g, life);
  const c = s.chars[o.c]!;
  // Wages (shares come out of the crop, in the fields' month).
  if (o.pay === "wage") {
    if (life.purse >= o.wage) {
      withFlow(
        g,
        { key: "bond:overseer", label: `${c.first} ${c.family}, overseer: his wages` },
        () => spend(g, life, o.wage),
      );
      if (o.owed) b.overseer = { ...o, owed: 0 };
    } else {
      const owed = (o.owed ?? 0) + 1;
      if (owed >= 2) {
        b.overseer = null;
        remembers(g, life, c, "Never paid me", -20, 3);
        journal(
          g,
          life,
          `${c.first} ${c.family} leaves your service: two months unpaid. The household's work is yours to set again.`,
          "bad",
        );
        return;
      }
      b.overseer = { ...o, owed };
      journal(
        g,
        life,
        `You couldn't pay ${c.first}, your overseer, this month (${o.wage} coins). He'll not wait another.`,
        "bad",
      );
    }
  }
  const now = b.overseer!;
  // The work, as he sets it.
  if (now.orders.work === "assign") {
    const plan = overseerPlan(s, g.map, life);
    const moved: { work: string; n: number }[] = [];
    for (const x of plan) {
      const p = s.chars[x.c];
      if (!p?.bond) continue;
      if (p.bond.work === x.work && (x.work !== "biz" || p.bond.biz === x.biz))
        continue;
      if (x.work === "biz") {
        if (setBiz(g, life, p, x.biz!, true) !== null) continue;
      } else {
        leaveBusiness(g, life, p);
        g.touchChar(p).bond = { ...p.bond!, work: x.work };
      }
      const m = moved.find((y) => y.work === x.work);
      if (m) m.n++;
      else moved.push({ work: x.work, n: 1 });
    }
    if (moved.length)
      journal(
        g,
        life,
        `${c.first}, your overseer, sets the work: ${overseerWorkWords(moved)}.`,
        undefined,
        false,
      );
  }
  // His word, each season, while you're away.
  const away = life.travel || life.prov !== b.home;
  if (now.orders.report && away && s.day - (now.told ?? 0) >= 90) {
    b.overseer = { ...b.overseer!, told: s.day };
    const people = boundOf(s, life);
    const f = fieldsOf(s, g.map, life);
    const ill = people.filter((x) => x.bond!.health < 40).map((x) => x.first);
    const low = people.filter((x) => x.bond!.mood < 20).map((x) => x.first);
    affairNews(
      g,
      life,
      "property",
      `${c.first} writes from ${g.map.provinces[b.home]?.name ?? "home"}: ${f.workers.length} at work in the fields; ${people.length} in the household${ill.length ? `; ${ill.join(", ")} poorly` : ""}${low.length ? `; ${low.join(", ")} in despair` : ""}.`,
      ill.length || low.length ? "bad" : undefined,
    );
  }
  // The quarters' word about him: a hard man, or one paid by the crop, let do as he likes.
  if (
    (now.manner === "hard" || now.pay === "share") &&
    now.orders.rule === "his" &&
    people(s, life).length >= 2 &&
    l2dice(s, hashOf(seatSalt(life.seat), 0x0bad)).chance(0.05)
  )
    raiseEvent(g, life, "bond-ov-word", { c: someone(s, life) });
}

const people = (s: GameState, life: Life) =>
  boundOf(s, life).filter((c) => c.bond!.at === life.bondage!.home);

/** Someone of the household at home, grown (to speak for the rest). */
function someone(s: GameState, life: Life): number {
  const list = people(s, life)
    .filter((c) => c.bond!.status === "held")
    .sort((a, c) => a.bond!.mood - c.bond!.mood);
  return list[0]?.id ?? -1;
}

hooks.lifeMonthly.push((g, life) => {
  if (!life.bondage) return;
  tidyBusinesses(g, life);
  overseerMonth(g, life);
});

hooks.lifeDaily.push((g, life) => {
  // Businesses keep the right names on their books between months.
  if (life.bondage?.people.length && (life.property ?? []).some((x) => x.biz?.bound))
    tidyBusinesses(g, life);
});

// ---------------------------------------------------------------- the command

function labour2Command(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "bond2") return undefined;
  const cmd = c as Labour2Command;
  const s = g.s;
  if (lifeIsNative(s, life))
    return "Your people's ways have nothing to do with this.";
  switch (cmd.act) {
    case "hire":
      return hireOverseer(g, life, cmd.c ?? -1, cmd.pay === "share" ? "share" : "wage");
    case "dismiss":
      return dismissOverseer(g, life);
    case "orders":
      return setOrders(g, life, cmd.orders ?? {});
    case "pay":
      return setPay(g, life, cmd.pay);
    case "biz":
      return setBiz(g, life, s.chars[cmd.c ?? -1], cmd.id ?? -1);
    default:
      return undefined;
  }
}

hooks.command.push(labour2Command);

// ---------------------------------------------------------------- the ledger and the businesses

hooks.forecast.push((s: GameState, life: Life, w?: World): Part[] => {
  const o = overseerOf(s, life);
  if (!o || life.c < 0) return [];
  const c = s.chars[o.c];
  const who = c ? `${c.first} ${c.family}, overseer` : "Your overseer";
  if (o.pay === "wage")
    return [{ key: "bond:overseer", label: `${who}: his wages`, value: -o.wage }];
  if (!w) return [];
  // His shares of the crop: the fields' line's own odds, his part of each.
  const fields = bondForecast(s, life, w).find((x) => x.key === "bond:fields");
  const k = shareOf(o.shares, fieldsOf(s, w.map, life).workers.length);
  if (!fields || !k) return [];
  return [
    {
      key: "bond:overseer",
      label: `${who}: his shares of the crop`,
      value: -r2(fields.value * k),
      ...(fields.chance
        ? { chance: [-r2(fields.chance[1] * k), -r2(fields.chance[0] * k)] as [number, number] }
        : {}),
    },
  ];
});

boundHooks().push((s, life, pr) => bizBoundInput(s, life, pr));

/** The businesses someone could be sent to, for the page (re-exported). */
export { bizChoices };
