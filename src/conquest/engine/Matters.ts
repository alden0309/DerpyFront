// EVENTS (r15): many matters to a trade. Until now each trade had one task
// and one trouble, and a working life drew one or the other about once a
// month, so a fur trader saw "Robbed lines" three times a year. Now every
// trade has several of each (the classic pair among them), each with its
// own story, choices and outcomes; each rests a year and more after it
// comes; a trouble doesn't follow a trouble within two months; and a matter
// you've seen is drawn less readily than one you haven't. When everything
// is resting, nothing comes: a quiet month at work.
//
// The same goes for a rogue's big jobs (the den's tip-offs) and a lawman's
// rounds (a rogue caught in the act, a quiet offer of money).

import { addHeat, addNotoriety, crimeGrade, crimeState } from "./Crime";
import { lawAt } from "./CrimeQueries";
import { MATTER_REST, noteSeen, played, seenOf } from "./EventPacing";
import type { ConquestGame } from "./Game";
import { raiseEvent } from "./Hooks";
import {
  addRenown,
  addStress,
  earn,
  gainTrait,
  gainXp,
  heal,
  hurt,
  journal,
  milestone,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import { rankOf } from "./LifeQueries";
import { JOBS, SKILL_NAMES } from "./LifeRules";
import {
  coldOrMud,
  harvestHere,
  type MatterKind,
  type MChoice,
  type MFx,
  months,
  type Variant,
  winterHere,
} from "./MatterKit";
import { HONEST_MATTERS } from "./MattersHonest";
import { ROGUE_MATTERS } from "./MattersRogues";
import { charName } from "./Queries";
import { TRAITS } from "./Rules";
import type { JobKind, Life, Skill } from "./Types";
import { MATTERS } from "./WorkEvents";
import { worldRng } from "./WorldRng";

/** Every new variant, honest and crooked. */
export const VARIANTS: Variant[] = [...HONEST_MATTERS, ...ROGUE_MATTERS];

/** How long after a matter of a kind before another of that kind. */
export const KIND_REST: Record<MatterKind, number> = {
  task: 30,
  trouble: 60,
  score: 30,
  collar: 30,
  bribe: 60,
};

/** The classic pair, kept to the seasons their stories belong to. */
const CLASSIC_WHEN: Partial<
  Record<
    JobKind,
    Partial<
      Record<"task" | "trouble", (g: ConquestGame, life: Life) => boolean>
    >
  >
> = {
  // "Rain before the harvest": at the harvest.
  farmer: { task: harvestHere },
  // "Ice and branches have choked the mill race."
  millhand: { trouble: coldOrMud },
  // "Every farmer for miles has brought grain at once."
  miller: { task: harvestHere },
  // "Fever season is coming, and Jesuit's bark is short."
  apothecary: { task: months(3, 7) },
  // "Crows are taking the young corn."
  grower: { trouble: months(4, 7) },
  // "A sickness the old songs don't know has come with traders."
  // (any time); "Beaver on the far creek" (not with the creeks frozen hard)
  trapper: { task: (g, life) => !winterHere(g, life) },
};

// ---------------------------------------------------------------- the scenes

const here = (g: ConquestGame, life: Life) =>
  g.map.provinces[life.prov]?.name ?? "town";

/** Your master, if a computer character is; nobody else is put in a scene. */
function npcBoss(g: ConquestGame, life: Life) {
  const job = life.job;
  if (!job || job.own) return undefined;
  const b = g.s.chars[job.employer];
  return b?.alive && !played(g.s, b.id) ? b : undefined;
}

/** STORY (r17): a matter's outcome in a few words for the story: its first sentence. */
function firstWords(text: string): string {
  const one = text.split(/(?<=[.!?])\s/)[0].replace(/[.!]$/, "");
  const word = /^[A-Za-z]+/.exec(one)?.[0] ?? "";
  return COMMON_FIRST.test(word)
    ? one.charAt(0).toLowerCase() + one.slice(1)
    : one;
}
/** Words a sentence starts with that aren't names (a name keeps its capital). */
const COMMON_FIRST =
  /^(The|A|An|You|Your|It|Its|He|She|They|Their|His|Her|We|Our|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|No|Nothing|Nobody|Every|All|Some|Half|In|On|At|By|Over|Under|Through|Out|Down|Up|Into|Not|Both|Each|This|That|There|Then|Now|Well|Clean|Gone)$/;

function fill(g: ConquestGame, life: Life, text: string): string {
  const job = life.job;
  const master = job && !job.own ? g.s.chars[job.employer] : undefined;
  const boss = npcBoss(g, life);
  // A player who employs you isn't given words they never said.
  const who = boss
    ? charName(boss)
    : master?.alive
      ? "the foreman"
      : "your master";
  return text.replace(/\{boss\}/g, who).replace(/\{here\}/g, here(g, life));
}

function kindOfJob(life: Life): JobKind {
  return life.job?.kind ?? "farmer";
}

/** The skill a choice tests when it doesn't say. */
function skillOf(v: Variant, life: Life, c: MChoice): Skill {
  if (c.check?.skill) return c.check.skill;
  const def = JOBS[kindOfJob(life)];
  switch (v.kind) {
    case "trouble":
      return def?.second ?? "craft";
    case "collar":
      return "fighting";
    case "bribe":
      return "letters";
    default:
      return def?.main ?? "craft";
  }
}

/** How hard the bold way is: harder up the ladder, as the classic matters. */
function dcOf(v: Variant, life: Life, ctx: LCtx, c: MChoice): number {
  const rank = life.job?.rank ?? 0;
  const base =
    v.kind === "task"
      ? 5 + rank * 2
      : v.kind === "trouble"
        ? 6 + rank * 2
        : v.kind === "score"
          ? 7 + rank
          : v.kind === "collar"
            ? 4 + (ctx.g ?? 1) * 2
            : 6;
  return base + (c.check?.dc ?? 0);
}

function sceneOf(v: Variant, life: Life): string {
  if (v.scene) return v.scene;
  if (v.kind === "score")
    return life.job?.kind === "pirate"
      ? "deck"
      : life.job?.kind === "highwayman"
        ? "road"
        : "den";
  if (v.kind === "collar") return "gaol";
  return life.job?.place ?? "home";
}

/** Coins a reckoning comes to for this life (by its rung's wage). */
export function coinsOf(life: Life, f: MFx): number {
  const wage = rankOf(life)?.wage ?? 2;
  const raw = (f.coins ?? 0) + (f.pay ?? 0) * wage;
  let n = Math.round(raw);
  if (f.pay && f.pay > 0 && n < 1) n = 1;
  if (f.pay && f.pay < 0 && n > -1) n = -1;
  return n;
}

const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

/** A reckoning in words: "+6 coins, +1 renown, woodcraft". */
export function fxWords(
  g: ConquestGame,
  life: Life,
  v: Variant,
  c: MChoice,
  f: MFx,
): string {
  const out: string[] = [];
  const coins = coinsOf(life, f);
  if (coins) out.push(`${signed(coins)} coins`);
  if (f.renown) out.push(`${signed(f.renown)} renown`);
  if (f.health) out.push(`${signed(f.health)} health`);
  if (f.stress) out.push(`${signed(f.stress)} stress`);
  if (f.xp)
    out.push(`+${SKILL_NAMES[f.sk ?? skillOf(v, life, c)].toLowerCase()}`);
  if (f.boss && npcBoss(g, life))
    out.push(f.boss > 0 ? "your master pleased" : "your master put out");
  if (f.heat) out.push(f.heat > 0 ? "the law's eye on you" : "the law cools");
  if (f.name && f.name > 0) out.push("your name in the underworld");
  if (f.seize) out.push(`a ${Math.round(f.seize * 100)}% chance of the watch`);
  if (f.gain) out.push(TRAITS[f.gain].name.toLowerCase());
  return out.join(", ");
}

function tipOf(g: ConquestGame, life: Life, v: Variant, c: MChoice): string {
  const lead = c.tip ? `${c.tip}. ` : "";
  const w = fxWords(g, life, v, c, c.win);
  const l = c.lose ? fxWords(g, life, v, c, c.lose) : "";
  if (c.check && c.lose)
    return `${lead}Done well: ${w || "it's done"}. Botched: ${l || "nothing comes of it"}.`;
  if (c.odds !== undefined && c.lose)
    return `${lead}${Math.round(c.odds * 100)}% it comes off${w ? `: ${w}` : ""}; if not: ${l || "nothing comes of it"}.`;
  if (!w) return c.tip ? `${c.tip}.` : "Nothing lost, nothing gained.";
  return `${lead}${w[0].toUpperCase()}${w.slice(1)}.`;
}

/** What a choice comes to, done. */
function reckon(
  g: ConquestGame,
  life: Life,
  v: Variant,
  c: MChoice,
  f: MFx,
  ctx: LCtx,
): void {
  const coins = coinsOf(life, f);
  if (coins > 0) earn(g, life, coins);
  else if (coins < 0) spend(g, life, -coins);
  if (f.renown) addRenown(g, life, f.renown);
  if (f.stress) addStress(g, life, f.stress);
  if (f.xp) gainXp(g, life, f.sk ?? skillOf(v, life, c), f.xp, true);
  const boss = npcBoss(g, life);
  if (f.boss && boss)
    remembers(
      g,
      life,
      boss,
      f.boss > 0 ? "Did fine work" : "Botched a job",
      f.boss,
      0.5,
    );
  if (f.gain) gainTrait(g, life, f.gain);
  const nation = lawAt(g.s, life.prov);
  if (f.heat) addHeat(g, life, nation, f.heat);
  if (f.name) addNotoriety(g, life, f.name);
  const tone =
    (f.health ?? 0) < 0 || coins < 0 || (f.stress ?? 0) >= 5
      ? "bad"
      : coins > 0 || (f.renown ?? 0) > 0
        ? "good"
        : undefined;
  journal(g, life, fill(g, life, f.say), tone);
  // STORY (r17): a rogue's big job that came off goes in the story.
  if (v.kind === "score" && f === c.win && (coins > 0 || (f.name ?? 0) >= 2))
    milestone(
      g,
      life,
      "crime",
      `${v.title} at ${here(g, life)}: ${firstWords(fill(g, life, f.say))}`,
      life.prov,
      { quiet: true, tone: "good" },
    );
  if (f.health) {
    if (f.health > 0) heal(g, life, f.health);
    else hurt(g, life, -f.health, v.title.toLowerCase());
  }
  if (f.seize && life.c >= 0 && g.rng.chance(f.seize)) {
    const kind = kindOfJob(life);
    const rank = life.job?.rank ?? 0;
    raiseEvent(g, life, "crime-seized", {
      g: crimeGrade(kind, rank),
      n: ctx.n ?? nation,
      k: Object.keys(JOBS).indexOf(kind),
      r: rank,
    });
  }
  if (v.kind === "collar" && f === c.win && c.check) {
    const cs = crimeState(g, life);
    cs.arrests = (cs.arrests ?? 0) + 1;
  }
}

function choiceOf(v: Variant, c: MChoice): LifeEventDef["choices"][number] {
  return {
    label: c.cost ? `${c.label} (${c.cost} coins)` : c.label,
    tip: (g, life) => tipOf(g, life, v, c),
    check: c.check
      ? {
          skill: (g, life) => skillOf(v, life, c),
          dc: (g, life, ctx) => dcOf(v, life, ctx, c),
        }
      : undefined,
    blocked: c.cost
      ? (g, life) => (life.purse < c.cost! ? `Needs ${c.cost} coins` : null)
      : undefined,
    apply: (g, life, ctx, pass) => {
      if (c.cost) spend(g, life, c.cost);
      const good = c.check
        ? pass
        : c.odds !== undefined
          ? g.rng.chance(c.odds)
          : true;
      reckon(g, life, v, c, good ? c.win : (c.lose ?? c.win), ctx);
    },
  };
}

function defOf(v: Variant): LifeEventDef {
  return {
    key: v.key,
    pool: "raised",
    cooldown: 0,
    scene: (g, life) => sceneOf(v, life),
    title: v.title,
    body: (g, life) => fill(g, life, v.body),
    choices: v.choices.map((c) => choiceOf(v, c)),
  };
}

/** The variants as scenes, for LifeEvents. */
export const MATTER_EVENTS: LifeEventDef[] = VARIANTS.map(defOf);

// ---------------------------------------------------------------- which comes

interface Cand {
  /** What its rest and its showings are kept by. */
  id: string;
  key: string;
  ctx: LCtx;
}

function open(g: ConquestGame, life: Life, id: string): boolean {
  return (life.cooldowns[`wm:${id}`] ?? 0) <= g.s.day;
}

/** One of them, by weight (fading with showings), on the world's side dice. */
function choose(
  g: ConquestGame,
  life: Life,
  cands: Cand[],
  salt: number,
): Cand | undefined {
  if (!cands.length) return undefined;
  const ws = cands.map((c) => 1 / (1 + seenOf(life, c.id)));
  const total = ws.reduce((a, b) => a + b, 0);
  let roll = worldRng(g.s, salt + life.c * 131).next() * total;
  for (let i = 0; i < cands.length; i++) {
    roll -= ws[i];
    if (roll <= 0) return cands[i];
  }
  return cands[cands.length - 1];
}

function mark(g: ConquestGame, life: Life, c: Cand, kind: MatterKind): void {
  touchLife(g, life);
  life.cooldowns[`wm:${c.id}`] = g.s.day + MATTER_REST;
  life.cooldowns[`wm:${kind}`] = g.s.day + KIND_REST[kind];
  // A variant's showings are kept by its own key when it's raised; the
  // classic pair share their keys among the trades, so count them by trade.
  if (c.id !== c.key) noteSeen(g, life, c.id);
}

function variantsFor(
  g: ConquestGame,
  life: Life,
  kind: MatterKind,
  ctx: LCtx,
): Cand[] {
  const job = kindOfJob(life);
  return VARIANTS.filter(
    (v) =>
      v.kind === kind &&
      v.jobs.includes(job) &&
      (v.when ? v.when(g, life) : true),
  ).map((v) => ({ id: v.key, key: v.key, ctx }));
}

/** The matters of a kind that could come to this life now. */
export function matterCandidates(
  g: ConquestGame,
  life: Life,
  kind: "task" | "trouble",
): Cand[] {
  const job = kindOfJob(life);
  const out: Cand[] = [];
  const classic = MATTERS[job]?.[kind];
  const gate = CLASSIC_WHEN[job]?.[kind];
  if (classic && (!gate || gate(g, life)))
    out.push({
      id: `work-${kind}:${job}`,
      key: `work-${kind}`,
      ctx: { t: kind === "trouble" ? 1 : 0 },
    });
  out.push(...variantsFor(g, life, kind, {}));
  return out.filter((c) => open(g, life, c.id));
}

/**
 * A matter at work: one of the trade's own of the kind the day called for
 * (or the other kind, if those are all resting), or none if everything is.
 */
export function pickMatter(
  g: ConquestGame,
  life: Life,
  kind: "task" | "trouble",
): { key: string; ctx: LCtx } | null {
  if (!life.job) return null;
  const other = kind === "task" ? "trouble" : "task";
  for (const k of [kind, other] as const) {
    if ((life.cooldowns[`wm:${k}`] ?? 0) > g.s.day) continue;
    const c = choose(g, life, matterCandidates(g, life, k), 4243);
    if (c) {
      mark(g, life, c, k);
      return { key: c.key, ctx: c.ctx };
    }
  }
  return null;
}

/**
 * A big job for a rogue: the den's tip-off of the day, or (asked for at the
 * den, `force`) whatever there is, the old standby if nothing else.
 */
export function pickScore(
  g: ConquestGame,
  life: Life,
  nation: number,
  force = false,
): { key: string; ctx: LCtx } | null {
  const job = kindOfJob(life);
  const ctx = { n: nation };
  const classic: Cand = { id: `crime-score:${job}`, key: "crime-score", ctx };
  if (!force && (life.cooldowns["wm:score"] ?? 0) > g.s.day) return null;
  const cands = [classic, ...variantsFor(g, life, "score", ctx)].filter((c) =>
    open(g, life, c.id),
  );
  const c = choose(g, life, cands, 5381) ?? (force ? classic : undefined);
  if (!c) return null;
  mark(g, life, c, "score");
  return { key: c.key, ctx: c.ctx };
}

/** A lawman's round: a rogue caught, or money offered; one not seen lately. */
export function pickLaw(
  g: ConquestGame,
  life: Life,
  kind: "collar" | "bribe",
  grade: number,
): { key: string; ctx: LCtx } | null {
  const job = kindOfJob(life);
  const ctx = { g: grade };
  for (const k of [kind, kind === "collar" ? "bribe" : "collar"] as const) {
    if ((life.cooldowns[`wm:${k}`] ?? 0) > g.s.day) continue;
    const classic: Cand = { id: `law-${k}:${job}`, key: `law-${k}`, ctx };
    const cands = [classic, ...variantsFor(g, life, k, ctx)].filter((c) =>
      open(g, life, c.id),
    );
    const c = choose(g, life, cands, 7919);
    if (c) {
      mark(g, life, c, k);
      return { key: c.key, ctx: c.ctx };
    }
  }
  return null;
}
