// BUSINESS (r15): the articles of copartnership made easy. Four (and a
// fifth) common partnerships, each filled in at a click with a fair split
// and who runs it, and said back in plain words: "You put in 30; you get 30
// in a hundred of what it makes (about +1.2 a month once it's going); Agnes
// runs it." The articles can still be changed clause by clause after.

import { mindingOf } from "./Business";
import { bizName } from "./Firms";
import { charSkill, lifeOfChar, skillLevel } from "./LifeQueries";
import { JOBS } from "./LifeRules";
import type { World } from "./Map";
import type { HoldChoice } from "./Partners";
import {
  articlesForecast,
  fairShares,
  holdChoices,
  suggestTerms,
} from "./Partners";
import type {
  Character,
  CompanyPlan,
  FirmTerms,
  GameState,
  JobKind,
  Life,
  Property,
} from "./Types";

export type PresetKey = "silent" | "found" | "mine" | "cargo" | "company";

export interface Preset {
  key: PresetKey;
  label: string;
  /** What it is, in a line. */
  text: string;
  /** Why it can't be had with them (shown greyed), if so. */
  why?: string;
}

export const PRESET_ORDER: PresetKey[] = [
  "silent",
  "found",
  "mine",
  "cargo",
  "company",
];

const LABELS: Record<PresetKey, string> = {
  silent: "Put money into their business as a silent partner",
  found: "Found a business together",
  mine: "Take on a partner in mine",
  cargo: "Pool money for cargoes",
  company: "A trading company together",
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const round5 = (v: number) => Math.max(0, Math.floor(v / 5) * 5);

/** Your skill in a trade's main skill, and theirs. */
function skills(
  s: GameState,
  life: Life,
  c: Character,
  job: JobKind,
): [number, number] {
  const main = JOBS[job].main;
  return [skillLevel(s, life, main), charSkill(s, c, main)];
}

/** Whether you could mind a new business here yourself (no other work in the way). */
function youCanMind(s: GameState, life: Life, job: JobKind): boolean {
  const pseudo: Property = {
    id: -1,
    kind: "business",
    prov: life.prov,
    level: 1,
    job,
    place: JOBS[job].places[0],
    hands: [],
    since: s.day,
    name: JOBS[job].business ?? "business",
  };
  return mindingOf(s, { ...life, property: [pseudo] }, pseudo).minded;
}

/** The partnerships you could draw up with someone, and why not when not. */
export function presetsFor(
  s: GameState,
  w: World,
  life: Life,
  c: Character,
): Preset[] {
  const all = holdChoices(s, w, life, c);
  const theirs = all.find((x) => x.key.startsWith("theirs:"));
  const mine = all.find((x) => x.key.startsWith("mine:"));
  const found = all.filter((x) => x.key.startsWith("found:"));
  const company = all.find((x) => x.key === "company");
  const out: Preset[] = [];
  for (const key of PRESET_ORDER) {
    const p: Preset = { key, label: LABELS[key], text: "" };
    switch (key) {
      case "silent":
        p.text = theirs
          ? `Your money in ${theirs.label.replace(/ at .*$/, "")}; they run it and you share what it makes.`
          : "Your money in their business: they run it, you share what it makes.";
        if (!theirs) p.why = `${c.first} has no business of their own`;
        else if (theirs.why) p.why = theirs.why;
        break;
      case "found":
        p.text =
          "A new business here, paid for between you; whoever knows the trade and is free runs it.";
        if (!found.length)
          p.why = life.travel
            ? "Not from the road"
            : "This town has no place for a new business";
        break;
      case "mine":
        p.text = mine
          ? `They put money into ${mine.label.replace(/^Your /, "your ").replace(/ at .*$/, "")} for a share; you go on running it.`
          : "They put money into your business for a share; you go on running it.";
        if (!mine) p.why = "You have no business of your own";
        else if (mine.why) p.why = mine.why;
        break;
      case "cargo":
        p.text =
          "A chest between you for cargoes on the next ships out; what they bring home is shared.";
        break;
      case "company":
        p.text =
          "A company to buy and ship particular goods on a cycle, with factors at its ports.";
        if (!company || company.why)
          p.why = company?.why ?? "Not from a port with a market and docks";
        break;
    }
    out.push(p);
  }
  return out;
}

/** The best new business for the two of you here: the trade one of you knows, that pays. */
export function bestFounding(
  s: GameState,
  w: World,
  life: Life,
  c: Character,
  level = 1,
): JobKind | null {
  const found = holdChoices(s, w, life, c).filter((x) =>
    x.key.startsWith("found:"),
  );
  let best: { job: JobKind; v: number } | null = null;
  for (const ch of found) {
    const t = presetBuild(s, w, life, c, ch, level, "found");
    const v = articlesForecast(s, t, undefined, w).profit;
    if (!best || v > best.v) best = { job: ch.job!, v };
  }
  return best?.job ?? null;
}

/** Fill in the articles from a choice, with who runs it and a fair split. */
function presetBuild(
  s: GameState,
  w: World,
  life: Life,
  c: Character,
  ch: HoldChoice,
  level: number,
  key: PresetKey,
): FirmTerms {
  const t = suggestTerms(s, w, life, c, ch, level);
  // Who runs it: whoever knows the trade better and is free to (a new
  // business, cargoes, a company); their own business stays theirs to run,
  // and yours yours.
  let youRun = t.sides[0].role === "managing";
  if (key === "found" && ch.job) {
    const [a, b] = skills(s, life, c, ch.job);
    const free = youCanMind(s, life, ch.job);
    youRun = free && (a >= b || !!lifeOfChar(s, c.id));
  } else if (key === "cargo" || key === "company") {
    const [a, b] = [skillLevel(s, life, "trade"), charSkill(s, c, "trade")];
    youRun = a >= b || !!lifeOfChar(s, c.id);
  } else if (key === "silent") youRun = false;
  else if (key === "mine") youRun = true;
  t.sides[0].role = youRun ? "managing" : "silent";
  t.sides[1].role = youRun ? "silent" : "managing";
  // What you put in: no more than you have (the articles say if it's short).
  if (key === "silent" || key === "mine" || key === "cargo") {
    const most = round5(life.purse);
    if (t.sides[0].cap > most) t.sides[0].cap = Math.max(5, most);
  }
  const fair = fairShares(s, t)[0];
  t.sides[0].share = Math.max(5, Math.min(95, Math.floor(fair / 5) * 5));
  t.sides[1].share = 100 - t.sides[0].share;
  return t;
}

/**
 * The articles for a preset, filled in fairly; null if it can't be had.
 * `job`, `level`: a new business's trade and size; `co`: a company's trade.
 */
export function presetTerms(
  s: GameState,
  w: World,
  life: Life,
  c: Character,
  key: PresetKey,
  o: { job?: JobKind | null; level?: number; co?: CompanyPlan } = {},
): FirmTerms | null {
  const all = holdChoices(s, w, life, c);
  const level = o.level ?? 1;
  let ch: HoldChoice | undefined;
  switch (key) {
    case "silent":
      ch = all.find((x) => x.key.startsWith("theirs:") && !x.why);
      break;
    case "mine":
      ch = all.find((x) => x.key.startsWith("mine:") && !x.why);
      break;
    case "cargo":
      ch = all.find((x) => x.key === "venture");
      break;
    case "company": {
      const base = all.find((x) => x.key === "company" && !x.why);
      ch = base && o.co ? { ...base, co: { ...o.co } } : base;
      break;
    }
    case "found": {
      const job = o.job ?? bestFounding(s, w, life, c, level);
      ch = all.find((x) => x.key === `found:${job}`);
      break;
    }
  }
  if (!ch) return null;
  return presetBuild(s, w, life, c, ch, level, key);
}

/** Which preset a set of articles is (for the window's highlight), if any. */
export function presetOf(t: FirmTerms, life: Life): PresetKey | null {
  if (t.hold === "venture") return "cargo";
  if (t.hold === "company") return "company";
  if (t.hold !== "biz") return null;
  if (t.holder < 0) return "found";
  if (t.holder === life.c) return "mine";
  return t.sides[0].role === "silent" ? "silent" : null;
}

/**
 * The articles in plain words: "You put in 30; you get 30 in a hundred of
 * what it makes (about +1.2 a month once it's going); Agnes runs it."
 */
export function termsSummary(
  s: GameState,
  w: World,
  life: Life,
  t: FirmTerms,
): string {
  const [a, b] = t.sides;
  const them = s.chars[b.c];
  const name = them?.first ?? "they";
  const what = t.job ? bizName(t.job, t.level ?? 1) : "business";
  const their = them?.female ? "her" : "his";
  const yours = (side: typeof a, you: boolean) => {
    const parts: string[] = [];
    if (t.holder === side.c && t.hold === "biz")
      parts.push(`${you ? "your" : their} ${what}`);
    if (t.holder === side.c && t.hold === "paper")
      parts.push(`${you ? "your" : their} paper`);
    if (side.cap > 0 || !parts.length) parts.unshift(`${side.cap}`);
    return parts.join(" and ");
  };
  const fc = articlesForecast(s, t, undefined, w).profit;
  const mine = r1((fc * a.share) / 100);
  const cargoes = t.hold === "venture" || t.hold === "company";
  const runs =
    a.role === "managing"
      ? cargoes
        ? "you choose its cargoes"
        : "you run it"
      : cargoes
        ? `${name} chooses its cargoes`
        : `${name} runs it`;
  const make =
    t.hold === "venture"
      ? "of what its cargoes bring home (and of any loss)"
      : `of what it makes${fc ? ` (about ${mine >= 0 ? "+" : "−"}${Math.abs(mine)} a month once it's going)` : ""}, and of any loss`;
  return `You put in ${yours(a, true)}; ${name} puts in ${yours(b, false)}. You get ${a.share} in a hundred ${make}; ${runs}.`;
}
