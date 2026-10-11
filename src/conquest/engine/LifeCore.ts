// Small things every part of a life does: write in the journal, mark a
// milestone, learn, grow famous, earn and spend, get hurt, be remembered by
// someone. Kept here so jobs, events, movements and politics share them.

import { kill } from "./Characters";
import type { ConquestGame } from "./Game";
import { meOf } from "./LifeQueries";
import { SKILL_MAX, SKILL_NAMES, xpToNext } from "./LifeRules";
import { charName, hasTrait } from "./Queries";
import { DAYS_PER_YEAR, TRAITS } from "./Rules";
import { rumour } from "./Rumours";
import type {
  Character,
  Life,
  MilestoneKind,
  Outcome,
  Skill,
  Tie,
  TraitId,
} from "./Types";

const MAX_JOURNAL = 400;
const MAX_MILESTONES = 200;

export function touchLife(g: ConquestGame, life: Life): Life {
  g.lifeChanged(life.seat);
  return life;
}

export function journal(
  g: ConquestGame,
  life: Life,
  text: string,
  tone?: "good" | "bad",
): void {
  touchLife(g, life);
  if (g.capture?.seat === life.seat) g.capture.lines.push(text);
  life.journal.push({
    day: g.s.day,
    text,
    ...(tone ? { tone } : {}),
    c: life.c,
  });
  if (life.journal.length > MAX_JOURNAL)
    life.journal.splice(0, life.journal.length - MAX_JOURNAL);
}

export function milestone(
  g: ConquestGame,
  life: Life,
  kind: MilestoneKind,
  text: string,
  p: number = life.prov,
): void {
  touchLife(g, life);
  life.milestones.push({ day: g.s.day, kind, c: life.c, text, p });
  if (life.milestones.length > MAX_MILESTONES)
    life.milestones.splice(0, life.milestones.length - MAX_MILESTONES);
  // People talk about it.
  if (TALKED_ABOUT.includes(kind) && life.c >= 0) {
    const name = charName(meOf(g.s, life));
    const said = text.startsWith(name)
      ? text
      : `${name} ${text[0].toLowerCase()}${text.slice(1)}`;
    rumour(g, p, `${said}.`, life.c, kind === "wounded" ? "bad" : "good");
  }
}

const TALKED_ABOUT: MilestoneKind[] = [
  "married",
  "promoted",
  "battle",
  "wounded",
  "renown",
  "office",
  "movement",
  "rising",
  "europe",
  // LIFE (r11): the whole town hears about a conviction.
  "convicted",
];

/** Learn by doing; levels come as the experience adds up. */
export function gainXp(
  g: ConquestGame,
  life: Life,
  sk: Skill,
  amount: number,
  work = false,
): void {
  const me = meOf(g.s, life);
  if (!me || amount <= 0) return;
  let mult = 1;
  if (work && hasTrait(me, "diligent")) mult *= 1.2;
  if (work && hasTrait(me, "lazy")) mult *= 0.8;
  if (sk === "letters" && hasTrait(me, "educated")) mult *= 1.2;
  touchLife(g, life);
  life.xp[sk] = (life.xp[sk] ?? 0) + amount * mult;
  while (
    life.skills[sk] < SKILL_MAX &&
    life.xp[sk] >= xpToNext(life.skills[sk])
  ) {
    life.xp[sk] -= xpToNext(life.skills[sk]);
    life.skills[sk]++;
    journal(
      g,
      life,
      `Your ${SKILL_NAMES[sk].toLowerCase()} has grown to ${life.skills[sk]}.`,
      "good",
    );
  }
  if (life.skills[sk] >= SKILL_MAX) life.xp[sk] = 0;
  life.xp[sk] = Math.round(life.xp[sk] * 10) / 10;
}

export function addRenown(g: ConquestGame, life: Life, n: number): void {
  if (n === 0) return;
  touchLife(g, life);
  const me = meOf(g.s, life);
  const mult = n > 0 && me && hasTrait(me, "famous") ? 1.2 : 1;
  life.renown = Math.max(0, Math.round((life.renown + n * mult) * 10) / 10);
  life.tally.peakRenown = Math.max(life.tally.peakRenown, life.renown);
  if (me && life.renown >= 60 && !me.traits.includes("famous")) {
    gainTrait(g, life, "famous");
    journal(
      g,
      life,
      "Your name is known from one end of the colonies to the other.",
      "good",
    );
    milestone(g, life, "renown", `${charName(me)} became famous`);
  }
}

export function earn(g: ConquestGame, life: Life, coins: number): void {
  touchLife(g, life);
  life.purse = Math.round((life.purse + coins) * 100) / 100;
  if (coins > 0) life.tally.earned += coins;
  life.tally.peakPurse = Math.max(life.tally.peakPurse, life.purse);
}

export function spend(g: ConquestGame, life: Life, coins: number): void {
  earn(g, life, -coins);
}

export function addStress(g: ConquestGame, life: Life, n: number): void {
  touchLife(g, life);
  life.stress = Math.max(0, Math.min(100, Math.round(life.stress + n)));
}

export function heal(g: ConquestGame, life: Life, n: number): void {
  touchLife(g, life);
  life.health = Math.max(0, Math.min(100, Math.round(life.health + n)));
}

/** Health lost; at nothing, death. Returns whether they died. */
export function hurt(
  g: ConquestGame,
  life: Life,
  n: number,
  cause: string,
): boolean {
  heal(g, life, -n);
  if (life.health > 0) return false;
  const me = meOf(g.s, life);
  if (me?.alive) kill(g, me, cause);
  return true;
}

/** Someone remembers what the player's character did. */
export function remembers(
  g: ConquestGame,
  life: Life,
  c: Character,
  why: string,
  value: number,
  years = 5,
): void {
  if (life.c < 0) return;
  const ch = g.touchChar(c);
  // The same reason again refreshes it rather than piling up.
  ch.memories = ch.memories.filter((m) => !(m.of === life.c && m.why === why));
  ch.memories.push({
    of: life.c,
    why,
    value,
    until: years > 0 ? g.s.day + Math.round(years * DAYS_PER_YEAR) : 0,
  });
  if (ch.memories.length > 24) ch.memories.splice(0, ch.memories.length - 24);
}

export function setTie(
  g: ConquestGame,
  life: Life,
  c: number,
  tie: Tie | null,
): void {
  touchLife(g, life);
  if (tie) life.ties[c] = tie;
  else delete life.ties[c];
}

export function gainTrait(g: ConquestGame, life: Life, t: TraitId): void {
  const me = meOf(g.s, life);
  if (!me || me.traits.includes(t)) return;
  const opp = TRAITS[t].opposite;
  const ch = g.touchChar(me);
  if (opp) ch.traits = ch.traits.filter((x) => x !== opp);
  ch.traits.push(t);
  touchLife(g, life);
}

export function loseTrait(g: ConquestGame, life: Life, t: TraitId): void {
  const me = meOf(g.s, life);
  if (!me || !me.traits.includes(t)) return;
  g.touchChar(me).traits = me.traits.filter((x) => x !== t);
  touchLife(g, life);
}

export function meet(g: ConquestGame, life: Life, c: number): void {
  if (life.met.includes(c)) return;
  touchLife(g, life);
  life.met.push(c);
  if (life.met.length > 200) life.met.splice(0, life.met.length - 200);
}

export function cooldownLeft(g: ConquestGame, life: Life, key: string): number {
  return Math.max(0, (life.cooldowns[key] ?? 0) - g.s.day);
}

export function setCooldown(
  g: ConquestGame,
  life: Life,
  key: string,
  days: number,
): void {
  touchLife(g, life);
  life.cooldowns[key] = g.s.day + days;
}

/** A skill check, rolled on the game's own dice. */
export function rollCheck(g: ConquestGame, chance: number): boolean {
  return g.rng.next() < chance;
}

// ---------------------------------------------------------------- what just happened

/** Start noting what an act or a choice writes, for its scene. */
export function beginOutcome(g: ConquestGame, life: Life): void {
  g.capture = { seat: life.seat, lines: [], meta: {}, before: gauges(life) };
}

const GAUGES = ["coins", "renown", "stress", "health", "favour"];

function gauges(life: Life): number[] {
  return [life.purse, life.renown, life.stress, life.health, life.favor];
}

/** What changed between two readings, in words: "+3 renown", "−5 coins". */
function changes(before: number[], after: number[]): string[] {
  const out: string[] = [];
  after.forEach((v, i) => {
    const d = Math.round((v - before[i]) * 10) / 10;
    if (Math.abs(d) < 0.5) return;
    const n = Math.abs(d) >= 10 ? Math.round(Math.abs(d)) : Math.abs(d);
    out.push(`${d > 0 ? "+" : "\u2212"}${n} ${GAUGES[i]}`);
  });
  return out;
}

/** Say what the scene should show (the other person, the backdrop, how it went). */
export function outcomeMeta(
  g: ConquestGame,
  life: Life,
  meta: Partial<Omit<Outcome, "n" | "lines" | "day">>,
): void {
  if (g.capture?.seat !== life.seat) return;
  Object.assign(g.capture.meta, meta);
}

/** Done: keep it on the life for the browser. Dropped if it failed. */
export function endOutcome(
  g: ConquestGame,
  life: Life,
  kind: Outcome["kind"],
  failed: boolean,
): void {
  const cap = g.capture?.seat === life.seat ? g.capture : null;
  g.capture = null;
  if (!cap || failed) return;
  const m = cap.meta;
  touchLife(g, life).outcome = {
    n: (life.outcome?.n ?? 0) + 1,
    kind: m.kind ?? kind,
    key: m.key ?? "",
    title: m.title ?? "",
    scene: m.scene ?? life.area ?? "tavern",
    c: m.c ?? -1,
    ok: m.ok === undefined ? null : m.ok,
    lines: cap.lines.slice(-6),
    fx: life.c >= 0 ? changes(cap.before, gauges(life)) : [],
    ...(m.choice ? { choice: m.choice } : {}),
    day: g.s.day,
  };
}
