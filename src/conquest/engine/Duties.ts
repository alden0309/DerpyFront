// WORK (r21): what you do at your post (DutiesData.ts has them all). You
// choose your duty on the Work page, from those your rung allows; it turns
// what the month teaches towards other skills, and may bring a little more
// money, a risk, your master's good opinion, renown, the next rung sooner, a
// better month for your own business there, or (a crooked living) less heat
// or more. A computer master also wants a particular duty each month: do it,
// and he remembers. The month's luck is rolled on WORK's own dice, so the
// world's dice don't move, and the odds shown are the ones it's rolled from.

import { takeHooks } from "./Business";
import { DUTIES, type DutyDef, dutyFor, USUAL } from "./DutiesData";
import { npc, played } from "./EventPacing";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { jobGroupOf } from "./JobsData";
import { withFlow } from "./LedgerCore";
import {
  addRenown,
  addStress,
  earn,
  hurt,
  journal,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import { atPost, type Check, no, rankOf, yes } from "./LifeQueries";
import { type JobDef, JOBS, SKILL_NAMES, WORK_DAYS } from "./LifeRules";
import type { World } from "./Map";
import { chanceWords } from "./Odds";
import { charName } from "./Queries";
import type { Rng } from "./Rng";
import type {
  Character,
  GameState,
  Life,
  LifeCommand,
  Part,
  Property,
  Skill,
} from "./Types";
import { worldRng } from "./WorldRng";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** WORK's own dice, from the seed, the day and the life (salts 0x21b0000+). */
export function wdice(s: GameState, salt: number, ...xs: number[]): Rng {
  let k = salt | 0;
  for (const x of xs) k = (Math.imul(k, 31) + (x | 0)) | 0;
  return worldRng(s, 0x21b0000 + (k & 0xffff));
}

// ---------------------------------------------------------------- which duties

/** Whether a duty is one of a life's trade's (its family, or named). */
function forTrade(d: DutyDef, life: Life): boolean {
  const job = life.job;
  if (!job) return false;
  return dutyFor(d, job.kind, jobGroupOf(job.kind, JOBS[job.kind]));
}

/** Every duty of your trade, and whether your rung allows it now (and why not). */
export function dutiesFor(life: Life): { def: DutyDef; check: Check }[] {
  const job = life.job;
  if (!job) return [];
  const titles = JOBS[job.kind].ranks;
  return DUTIES.filter((d) => forTrade(d, life)).map((def) => ({
    def,
    check:
      job.rank < def.from
        ? no(`From ${titles[def.from]?.title.toLowerCase() ?? "a higher rung"}`)
        : def.to !== undefined && job.rank > def.to
          ? no(`Beneath ${titles[job.rank]?.title.toLowerCase() ?? "you"} now`)
          : yes,
  }));
}

/** The duty you're doing now (if your rung still allows it), or the usual. */
export function dutyOf(life: Life): DutyDef | undefined {
  const key = life.work?.duty;
  if (!key || key === USUAL) return undefined;
  const d = DUTIES.find((x) => x.key === key);
  if (!d || !forTrade(d, life)) return undefined;
  const rank = life.job!.rank;
  if (rank < d.from || (d.to !== undefined && rank > d.to)) return undefined;
  return d;
}

/** Set your duty (or the usual). */
export function setDuty(
  g: ConquestGame,
  life: Life,
  key: string,
): string | null {
  if (!life.job) return "You have no work.";
  if (key !== USUAL) {
    const d = dutiesFor(life).find((x) => x.def.key === key);
    if (!d) return "Not a duty of your trade.";
    if (!d.check.ok) return `${d.check.why}.`;
  }
  touchLife(g, life);
  life.work ??= { effort: "steady" };
  if ((life.work.duty ?? USUAL) === key) return null;
  life.work.duty = key;
  const d = DUTIES.find((x) => x.key === key);
  journal(
    g,
    life,
    d
      ? `At work, you put yourself to it: ${d.name.toLowerCase()}.`
      : "Back to the usual work.",
  );
  return null;
}

// ---------------------------------------------------------------- what it does

/** A skill reference, as the trade's skill. */
function skillOfRef(def: JobDef, ref: DutyDef["xp"][number][0]): Skill {
  return ref === "main" ? def.main : ref === "second" ? def.second : ref;
}

/** What a month's work teaches, by skill (the usual: the trade's main 7, its second 3). */
export function dutyXp(life: Life): [Skill, number][] {
  const job = life.job;
  if (!job) return [];
  const def = JOBS[job.kind];
  const d = dutyOf(life);
  const list: [Skill, number][] = d
    ? d.xp.map(([k, w]) => [skillOfRef(def, k), w])
    : [
        [def.main, 7],
        [def.second, 3],
      ];
  const out = new Map<Skill, number>();
  for (const [k, w] of list) out.set(k, (out.get(k) ?? 0) + w);
  return [...out];
}

/** × on the month's chance of the next rung. */
export function dutyPromo(life: Life): number {
  return dutyOf(life)?.promo ?? 1;
}

/** × on the heat a crooked day's work draws. */
export function dutyHeat(life: Life): number {
  return dutyOf(life)?.heat ?? 1;
}

/** × on the takings of your own business at your post (Business.ts asks). */
export function dutyBizX(s: GameState, life: Life, pr: Property): number {
  const job = life.job;
  const d = dutyOf(life);
  if (!job || !d?.biz) return 1;
  if (pr.prov !== job.prov || pr.job !== job.kind) return 1;
  return 1 + d.biz;
}

/** A month's wage at your rung (what the duty's money is reckoned against). */
export function rungWage(life: Life): number {
  return rankOf(life)?.wage ?? 0;
}

/** One outcome of a duty's month, with its chance and money. */
export interface DutyOutcome {
  label: string;
  p: number;
  coins: number;
  hurt?: number;
  heat?: number;
}

/** A duty's month, as its odds: the outcomes, and the money it's expected to bring (or cost). */
export function dutyOdds(
  life: Life,
  d: DutyDef | undefined = dutyOf(life),
): { outcomes: DutyOutcome[]; expected: number; lo: number; hi: number } {
  const wage = rungWage(life);
  const outcomes: DutyOutcome[] = [];
  let expected = 0;
  let lo = 0;
  let hi = 0;
  if (d?.bonus) {
    const coins = r2(wage * d.bonus.x);
    outcomes.push({ label: d.bonus.what, p: d.bonus.p, coins });
    expected += d.bonus.p * coins;
    hi += coins;
  }
  if (d?.mishap) {
    const coins = r2(-wage * (d.mishap.x ?? 0));
    outcomes.push({
      label: d.mishap.what,
      p: d.mishap.p,
      coins,
      ...(d.mishap.hurt ? { hurt: d.mishap.hurt } : {}),
      ...(d.mishap.heat ? { heat: d.mishap.heat } : {}),
    });
    expected += d.mishap.p * coins;
    lo += coins;
  }
  return { outcomes, expected: r2(expected), lo: r2(lo), hi: r2(hi) };
}

// ---------------------------------------------------------------- your master's wish

/** Your master: a computer character who took you on (players ask for themselves). */
export function npcMaster(s: GameState, life: Life): Character | undefined {
  const job = life.job;
  if (!job || job.own || job.berth) return undefined;
  const c = s.chars[job.employer];
  return c?.alive && !c.abroad ? npc(s, c) : undefined;
}

/** What your master wants of you this month (a computer master only). */
export function masterWants(s: GameState, life: Life): DutyDef | undefined {
  if (!npcMaster(s, life)) return undefined;
  const open = dutiesFor(life).filter((x) => x.check.ok && !x.def.own);
  if (!open.length) return undefined;
  const month = Math.floor(s.day / 30.4);
  return open[
    wdice(s, 1, life.c, month, life.job!.since).int(0, open.length - 1)
  ].def;
}

// ---------------------------------------------------------------- the month

/**
 * A month of your duty, after its learning (Work.ts): the chance of more
 * money and of a mishap, your master's view, stress and renown, and whether
 * you did what he wanted. `share`: the share of the month you worked.
 */
export function dutyMonth(g: ConquestGame, life: Life, share: number): void {
  const s = g.s;
  const d = dutyOf(life);
  const boss = npcMaster(s, life);
  const want = masterWants(s, life);
  if (share < 0.5) return;
  if (boss && want && d?.key === want.key)
    remembers(g, life, boss, "Did as I asked", 4, 0.25);
  if (!d) return;
  const r = wdice(s, 2, life.c, s.day);
  const wage = rungWage(life) * Math.min(1, share);
  const flow = {
    key: "duty",
    label: `Your duties: ${d.name.toLowerCase()}`,
    chance: true as const,
  };
  if (d.bonus && r.chance(d.bonus.p)) {
    const coins = r2(wage * d.bonus.x);
    if (coins > 0) {
      withFlow(g, flow, () => earn(g, life, coins));
      journal(
        g,
        life,
        `${d.bonus.what}: ${coins} coins over your wage.`,
        "good",
      );
    }
  }
  if (d.mishap && r.chance(d.mishap.p)) {
    const m = d.mishap;
    if (m.x) {
      const coins = r2(wage * m.x);
      withFlow(g, flow, () => spend(g, life, coins));
      journal(g, life, `${m.what}: it cost you ${coins} coins.`, "bad");
    }
    if (m.hurt) {
      journal(g, life, `${m.what}.`, "bad");
      hurt(g, life, m.hurt, m.what.toLowerCase());
    }
    if (m.heat) {
      journal(g, life, `${m.what}: the law hears of it.`, "bad");
      for (const h of heatHooks()) h(g, life, m.heat);
    }
  }
  if (life.c < 0) return;
  if (boss && d.boss) remembers(g, life, boss, d.boss.why, d.boss.v, 0.25);
  if (d.stress) addStress(g, life, d.stress);
  if (d.renown) addRenown(g, life, d.renown * Math.min(1, share));
}

/** A crooked duty's mishap draws the law's heat (Crime.ts adds itself, so this needn't import it). */
export function heatHooks(): ((
  g: ConquestGame,
  life: Life,
  n: number,
) => void)[] {
  const f = heatHooks as unknown as {
    l?: ((g: ConquestGame, life: Life, n: number) => void)[];
  };
  return (f.l ??= []);
}

takeHooks().push(dutyBizX);

// ---------------------------------------------------------------- the month's figure

hooks.forecast.push((s, life, w) => {
  const out: Part[] = [];
  if (life.c < 0 || life.watching || !life.job || !w) return out;
  const d = dutyOf(life);
  if (!d || (!d.bonus && !d.mishap?.x)) return out;
  if (!atPost(s, w, life)) return out;
  const o = dutyOdds(life, d);
  if (!o.expected && !o.lo && !o.hi) return out;
  out.push({
    key: "duty",
    label: `Your duties: ${d.name.toLowerCase()}`,
    value: o.expected,
    chance: [o.lo, o.hi],
  });
  return out;
});

// ---------------------------------------------------------------- the command

hooks.command.push((g, life, c: LifeCommand) => {
  if (c.k !== "duty") return undefined;
  return setDuty(g, life, c.key ?? USUAL);
});

// ---------------------------------------------------------------- words

/** What a duty does, in short phrases (for its button and the guide); coins at a month's wage of `wage`. */
export function dutyWords(def: JobDef, d: DutyDef, wage?: number): string[] {
  const out: string[] = [];
  const coins = (x: number) =>
    wage !== undefined
      ? `${r1(wage * x)} coins`
      : `${Math.round(x * 100)}% of a month's wage`;
  out.push(
    `learns ${d.xp
      .map(([k]) => SKILL_NAMES[skillOfRef(def, k)].toLowerCase())
      .filter((x, i, a) => a.indexOf(x) === i)
      .join(", ")}`,
  );
  if (d.bonus)
    out.push(
      `${chanceWords(d.bonus.p)} a month: ${d.bonus.what.toLowerCase()} (+${coins(d.bonus.x)})`,
    );
  if (d.mishap)
    out.push(
      `${chanceWords(d.mishap.p)} a month: ${d.mishap.what.toLowerCase()}${d.mishap.hurt ? ` (−${d.mishap.hurt} health)` : ""}${d.mishap.x ? ` (−${coins(d.mishap.x)})` : ""}${d.mishap.heat ? ` (+${d.mishap.heat} heat)` : ""}`,
    );
  if (d.boss) out.push(`your master likes it (+${d.boss.v})`);
  if (d.promo && d.promo > 1)
    out.push(
      `the next rung ${Math.round((d.promo - 1) * 100)}% likelier each month`,
    );
  if (d.renown) out.push(`renown +${r1(d.renown * 12)} a year`);
  if (d.biz)
    out.push(`your own business here +${Math.round(d.biz * 100)}% takings`);
  if (d.heat && d.heat !== 1)
    out.push(`${d.heat < 1 ? "less" : "more"} heat (×${d.heat})`);
  if (d.stress)
    out.push(`stress ${d.stress > 0 ? "+" : "−"}${Math.abs(d.stress)} a month`);
  return out;
}

/** Whether a life's work is the kind with duties (any trade, at a post). */
export function hasDuties(life: Life): boolean {
  return dutiesFor(life).length > 0;
}

/** The working days a month (for the page's sums). */
export const MONTH_DAYS = WORK_DAYS;

/** The master's name, for the page (a player master asks for themselves). */
export function masterName(s: GameState, life: Life): string | undefined {
  const c = npcMaster(s, life);
  return c && !played(s, c.id) ? charName(c) : undefined;
}

/** For the Work page: each duty's month at your rung, with its odds. */
export function dutyRows(
  s: GameState,
  w: World,
  life: Life,
): {
  def: DutyDef;
  check: Check;
  words: string[];
  odds: ReturnType<typeof dutyOdds>;
  wanted: boolean;
}[] {
  const job = life.job;
  if (!job) return [];
  const def = JOBS[job.kind];
  const want = masterWants(s, life);
  void w;
  return dutiesFor(life).map((x) => ({
    ...x,
    words: dutyWords(def, x.def, rungWage(life)),
    odds: dutyOdds(life, x.def),
    wanted: want?.key === x.def.key,
  }));
}
