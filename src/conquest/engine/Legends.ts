// DLC (r21): "Legends": hunting American legends (LegendsData.ts has them
// and the reasons for how real each is). Only a seat whose account owns
// Legends hears of them (the server sets Life.dlc.legends after checking;
// server/conquest/ConquestDlc.ts), in any game from any start date.
//
// - Talk of a legend comes rarely: about once in six years of a life, more
//   often in the legend's own country; or go asking after old stories at a
//   tavern, the docks or a native town (Persuasion, a round of drinks, once
//   a season). A sacred place is spoken of only among its people, or to
//   someone who speaks their tongue.
// - Each legend is a trail of steps, each worked at its own place with a
//   skill check at a master's difficulty (14 to 19 on LIFE r21's scale),
//   for a cost; failing, you try again after a season, and three failures
//   at one step and the trail goes cold.
// - At the journey's end, its outcomes come at the chances shown.
//
// What you've heard and found is your own (Life.legends, redacted for the
// other seats like the rest of a player's secrets), except the finding,
// which the world hears of. The rolls are on Legends' own dice
// (0x2d1d0000 up), so the world's luck doesn't move.

import { areasOf } from "./Areas";
import { dateOf } from "./Calendar";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { secretNote } from "./IntrigueCore";
import { withFlow } from "./LedgerCore";
import {
  FOUNTAIN,
  LEGEND_BY_KEY,
  LEGEND_RULES,
  type LegendDef,
  type LegendOutcome,
  LEGENDS,
  SACRED_PLACE,
} from "./LegendsData";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  heal,
  hurt,
  journal,
  milestone,
  spend,
  touchLife,
} from "./LifeCore";
import {
  type Check,
  isChildLife,
  meOf,
  no,
  skillLevel,
  yes,
} from "./LifeQueries";
import { checkChance, SKILL_NAMES } from "./LifeRules";
import type { World } from "./Map";
import { ageOf } from "./Queries";
import { rumour } from "./Rumours";
import { knows, motherTongue } from "./Tongues";
import type {
  GameState,
  LegendProgress,
  LegendsState,
  Life,
  LifeCommand,
  MapDef,
  PlaceKind,
} from "./Types";
import { worldRng } from "./WorldRng";

export { FOUNTAIN, LEGEND_RULES, LEGENDS };

/** Legends' own dice (0x2d1d0000 up). */
export function ldice(s: GameState, salt: number, ...xs: number[]) {
  let k = salt | 0;
  for (const x of xs) k = (Math.imul(k, 31) + (x | 0)) | 0;
  return worldRng(s, 0x2d1d0000 + (k & 0xfffff));
}

/** Whether this seat's account owns Legends (the server says). */
export function legendsOn(life: Life): boolean {
  return !!life.dlc?.legends;
}

/** The server sets it when a seat sits down: who owns Legends hears of them. */
export function setLegendsOwned(
  g: ConquestGame,
  seat: string,
  on: boolean,
): void {
  const life = g.s.lives.find((l) => l.seat === seat);
  if (!life || !!life.dlc?.legends === on) return;
  touchLife(g, life).dlc = { ...(life.dlc ?? {}), legends: on };
}

function stateOf(g: ConquestGame, life: Life): LegendsState {
  return (touchLife(g, life).legends ??= { list: [] });
}

export function progressOf(
  life: Life,
  key: string,
): LegendProgress | undefined {
  return life.legends?.list.find((x) => x.key === key);
}

const provIndex = new WeakMap<MapDef, Map<string, number>>();
function provNamed(map: MapDef, name: string): number {
  let m = provIndex.get(map);
  if (!m) {
    m = new Map(map.provinces.map((p, i) => [p.name, i]));
    provIndex.set(map, m);
  }
  return m.get(name) ?? -1;
}

/** The nation whose sacred place it is. */
function peopleOf(s: GameState, def: LegendDef): number {
  return def.people ? s.nations.findIndex((n) => n.key === def.people) : -1;
}

// ---------------------------------------------------------------- hearing of one

/** Whether a life could hear of this legend now. */
export function canHear(
  s: GameState,
  w: World,
  life: Life,
  def: LegendDef,
): boolean {
  const map = w.map;
  const me = meOf(s, life);
  if (!me || life.watching || !legendsOn(life)) return false;
  if (ageOf(s, me) < LEGEND_RULES.age) return false;
  if (def.from !== undefined && dateOf(s.day).year < def.from) return false;
  const had = progressOf(life, def.key);
  if (had) {
    const done = had.cold ?? had.found;
    if (done === undefined) return false;
    if (done + LEGEND_RULES.coldRest > s.day) return false;
  }
  if (def.kind === "sacred") {
    const n = peopleOf(s, def);
    const nation = s.nations[n];
    if (!nation?.alive) return false;
    if (me.nation === n) return true;
    if (s.provinces[life.prov]?.owner === n) return true;
    return knows(s, map, me, motherTongue(nation.culture)) >= 1;
  }
  return true;
}

/** Is this life in the legend's own country? */
function inRegion(map: MapDef, life: Life, def: LegendDef): boolean {
  return def.region.some((name) => provNamed(map, name) === life.prov);
}

/** The month's chance that talk of a legend reaches this life, and of which. */
export function rumourChance(
  s: GameState,
  w: World,
  life: Life,
): { total: number; weights: { def: LegendDef; w: number }[] } {
  const weights = LEGENDS.filter((d) => canHear(s, w, life, d)).map((def) => ({
    def,
    w: inRegion(w.map, life, def) ? LEGEND_RULES.region : 1,
  }));
  if (!weights.length) return { total: 0, weights };
  const near = weights.some((x) => x.w > 1);
  return {
    total: LEGEND_RULES.rumour * (near ? LEGEND_RULES.region : 1),
    weights,
  };
}

function pickLegend(
  weights: { def: LegendDef; w: number }[],
  roll: number,
): LegendDef | undefined {
  const total = weights.reduce((m, x) => m + x.w, 0);
  let r = roll * total;
  for (const x of weights) {
    r -= x.w;
    if (r < 0) return x.def;
  }
  return weights[weights.length - 1]?.def;
}

/** Talk of a legend reaches a life: the scene asks whether to remember it. */
function hearOf(g: ConquestGame, life: Life, def: LegendDef, from: string) {
  const i = LEGENDS.indexOf(def);
  raiseEvent(g, life, "legend-rumour", { i, at: life.prov });
  void from;
}

/** Remember a rumour (the scene's first choice): the trail begins. */
export function rememberRumour(
  g: ConquestGame,
  life: Life,
  i: number,
  at: number,
): void {
  const def = LEGENDS[i];
  if (!def) return;
  const st = stateOf(g, life);
  st.list = st.list.filter((x) => x.key !== def.key);
  st.list.push({
    key: def.key,
    heard: g.s.day,
    from: g.map.provinces[at]?.name ?? "somewhere",
    step: 0,
    tries: 0,
    next: g.s.day,
  });
  secretNote(
    g,
    life,
    `You note down what you heard of ${def.name}. Journal › Legends has the trail.`,
    "good",
  );
}

hooks.lifeMonthly.push((g, life) => {
  const s = g.s;
  if (!legendsOn(life) || life.watching || life.c < 0) return;
  const st = life.legends;
  // A sacred place you've walked: in time, someone means it harm.
  for (const x of st?.list ?? []) {
    if (x.keepDue !== undefined && x.keepDue <= s.day && !st?.kept?.[x.key]) {
      touchLife(g, life);
      delete x.keepDue;
      raiseEvent(g, life, "legend-keep", {
        i: LEGENDS.findIndex((d) => d.key === x.key),
      });
    }
  }
  if (life.events.some((e) => e.key === "legend-rumour")) return;
  const { total, weights } = rumourChance(s, g.w, life);
  if (total <= 0) return;
  const d = ldice(s, 0x01, life.c, s.day);
  if (!d.chance(total)) return;
  const def = pickLegend(weights, d.next());
  if (def) hearOf(g, life, def, "talk");
});

// ---------------------------------------------------------------- asking after old stories

const ASK_PLACES: PlaceKind[] = ["tavern", "docks", "village", "councilfire"];

export function askCheck(s: GameState, w: World, life: Life): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (!legendsOn(life)) return no("Legends are in the Derp Store.");
  if (isChildLife(s, life)) return no("Not as a child.");
  if (life.travel) return no("Not on the road.");
  if (!areasOf(s, w, life.prov, life).some((a) => ASK_PLACES.includes(a)))
    return no("Ask at a tavern, the docks or a native town.");
  const next = (life.legends?.asked ?? -Infinity) + LEGEND_RULES.ask.rest;
  if (next > s.day) return no("You asked lately: give it a season.");
  if (!LEGENDS.some((d) => canHear(s, w, life, d)))
    return no("You've heard every story there is to hear for now.");
  if (life.purse < LEGEND_RULES.ask.cost) return no("A round costs a coin.");
  return yes;
}

/** The odds of hearing something worth following, asking. */
export function askOdds(s: GameState, life: Life): number {
  const A = LEGEND_RULES.ask;
  return checkChance(skillLevel(s, life, A.skill), A.dc) * A.then;
}

function ask(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const ok = askCheck(s, g.w, life);
  if (!ok.ok) return ok.why;
  const A = LEGEND_RULES.ask;
  stateOf(g, life).asked = s.day;
  withFlow(
    g,
    { key: "legend:ask", label: "A round, for the old stories" },
    () => spend(g, life, A.cost),
  );
  gainXp(g, life, "persuasion", 6);
  const d = ldice(s, 0x02, life.c, s.day);
  const pass = d.chance(checkChance(skillLevel(s, life, A.skill), A.dc));
  if (!pass || !d.chance(A.then)) {
    secretNote(
      g,
      life,
      "You stand a round and ask after the old stories. You hear a good many, and none worth following.",
    );
    return null;
  }
  const weights = LEGENDS.filter((x) => canHear(s, g.w, life, x)).map(
    (def) => ({ def, w: inRegion(g.map, life, def) ? LEGEND_RULES.region : 1 }),
  );
  const def = pickLegend(weights, d.next());
  if (def) hearOf(g, life, def, "asking");
  return null;
}

// ---------------------------------------------------------------- the trail

/** Where a step of a legend's trail can be worked (province indices). */
export function stepProvinces(
  s: GameState,
  w: World,
  def: LegendDef,
  step: number,
): number[] {
  const map = w.map;
  const st = def.steps[step];
  if (!st) return [];
  if (def.kind === "sacred" && step === def.steps.length - 1) {
    const p = provNamed(map, SACRED_PLACE[def.key] ?? "");
    return p >= 0 ? [p] : [];
  }
  if (st.at.people) {
    const n = peopleOf(s, def);
    return s.provinces.flatMap((pr, p) => (pr.owner === n ? [p] : []));
  }
  return (st.at.provs ?? [])
    .map((name) => provNamed(map, name))
    .filter((p) => p >= 0);
}

/** Whether this life can work the next step of a legend here, now. */
export function workCheck(
  s: GameState,
  w: World,
  life: Life,
  key: string,
): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (!legendsOn(life)) return no("Legends are in the Derp Store.");
  const def = LEGEND_BY_KEY.get(key);
  const x = progressOf(life, key);
  if (!def || !x) return no("You haven't heard of that.");
  if (x.found !== undefined) return no("You've followed it to its end.");
  if (x.cold !== undefined) return no("The trail has gone cold.");
  const step = def.steps[x.step];
  if (!step) return no("There's nothing more to do.");
  if (life.travel) return no("Not on the road.");
  if (!stepProvinces(s, w, def, x.step).includes(life.prov))
    return no(`${step.title}: not here.`);
  if (step.at.place) {
    if (!areasOf(s, w, life.prov, life).includes(step.at.place))
      return no(`${step.title}: there's no ${step.at.place} here.`);
  }
  if (def.kind === "sacred" && x.step < def.steps.length - 1) {
    const n = peopleOf(s, def);
    if (
      s.wars.some(
        (x) =>
          (x.a === n && x.b === me.nation) || (x.b === n && x.a === me.nation),
      )
    )
      return no("Not while your people are at war with theirs.");
  }
  if (x.next > s.day) return no("Give it a season before trying again.");
  if (life.purse < step.cost) return no(`It costs ${step.cost} coins.`);
  return yes;
}

/** The odds of a step (the skill, its bonus, the difficulty): what the step rolls. */
export function stepOdds(
  s: GameState,
  w: World,
  life: Life,
  def: LegendDef,
  step: number,
): { chance: number; level: number; bonus: number; dc: number } {
  const st = def.steps[step];
  if (!st) return { chance: 0, level: 0, bonus: 0, dc: 0 };
  const level = skillLevel(s, life, st.skill);
  let bonus = 0;
  const me = meOf(s, life);
  if (def.kind === "sacred" && me) {
    const n = peopleOf(s, def);
    const nation = s.nations[n];
    if (
      nation &&
      (me.nation === n ||
        knows(s, w.map, me, motherTongue(nation.culture)) >=
          LEGEND_RULES.tongue.level)
    )
      bonus = LEGEND_RULES.tongue.bonus;
  }
  return {
    chance: checkChance(level + bonus, st.dc),
    level,
    bonus,
    dc: st.dc,
  };
}

/** The chance of the whole trail from here, all its steps passed first time (for the page). */
export function trailOdds(
  s: GameState,
  w: World,
  life: Life,
  def: LegendDef,
  from = 0,
): number {
  let p = 1;
  for (let i = from; i < def.steps.length; i++)
    p *= stepOdds(s, w, life, def, i).chance;
  return p;
}

/** Pick an outcome by its chance (the roll in [0, 1)). */
export function pickOutcome(def: LegendDef, roll: number): LegendOutcome {
  let r = roll;
  for (const o of def.outcomes) {
    r -= o.chance;
    if (r < 0) return o;
  }
  return def.outcomes[def.outcomes.length - 1];
}

function work(g: ConquestGame, life: Life, key: string): string | null {
  const s = g.s;
  const ok = workCheck(s, g.w, life, key);
  if (!ok.ok) return ok.why;
  const def = LEGEND_BY_KEY.get(key)!;
  const x = progressOf(life, key)!;
  const i = x.step;
  const step = def.steps[i];
  touchLife(g, life);
  if (step.cost > 0)
    withFlow(g, { key: `legend:${key}`, label: def.name }, () =>
      spend(g, life, step.cost),
    );
  const odds = stepOdds(s, g.w, life, def, i);
  const d = ldice(s, 0x03, life.c, s.day, LEGENDS.indexOf(def), i);
  const pass = d.chance(odds.chance);
  gainXp(g, life, step.skill, pass ? 25 : 10);
  if (!pass) {
    x.tries++;
    x.next = s.day + LEGEND_RULES.retry;
    if (x.tries >= LEGEND_RULES.tries) {
      x.cold = s.day;
      secretNote(
        g,
        life,
        `${step.failed} The trail of ${def.name} goes cold.`,
        "bad",
      );
    } else secretNote(g, life, `${def.name}: ${step.failed}`, "bad");
    return null;
  }
  x.step++;
  x.tries = 0;
  x.next = s.day + LEGEND_RULES.next;
  if (x.step < def.steps.length) {
    secretNote(g, life, `${def.name}: ${step.found}`, "good");
    return null;
  }
  // The journey's end.
  const out = pickOutcome(def, d.next());
  found(g, life, def, out);
  if (def.fever && d.chance(def.fever.chance)) {
    journal(g, life, "You come back with the swamp fever in you.", "bad");
    hurt(g, life, def.fever.health, "a fever caught in the Florida interior");
  }
  return null;
}

function found(
  g: ConquestGame,
  life: Life,
  def: LegendDef,
  out: LegendOutcome,
): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return;
  const x = progressOf(life, def.key)!;
  x.found = s.day;
  x.outcome = out.key;
  if (out.renown) addRenown(g, life, out.renown);
  if (out.coins) {
    const d = ldice(s, 0x04, life.c, s.day);
    const coins = d.int(out.coins[0], out.coins[1]);
    withFlow(
      g,
      { key: `legend:${def.key}`, label: def.name, chance: true },
      () => earn(g, life, coins),
    );
  }
  if (out.health) {
    if (out.health > 0) heal(g, life, out.health);
    else hurt(g, life, -out.health, def.name);
  }
  if (out.stress) addStress(g, life, out.stress);
  for (const [k, v] of Object.entries(out.xp ?? {}))
    gainXp(g, life, k as Parameters<typeof gainXp>[2], v ?? 0);
  const st = stateOf(g, life);
  if (out.waters) st.waters = me.id;
  if (out.keep) {
    const [lo, hi] = LEGEND_RULES.keepAfter;
    x.keepDue = s.day + ldice(s, 0x05, life.c, s.day).int(lo, hi);
  }
  milestone(
    g,
    life,
    "find",
    def.kind === "sacred"
      ? `Walked ${def.name.replace(/,.*$/, "")} with its people`
      : `Followed the legend of ${def.name} to its end`,
    life.prov,
    { big: true },
  );
  rumour(
    g,
    life.prov,
    def.kind === "sacred"
      ? `${me.first} ${me.family} has been taken to ${def.name.replace(/,.*$/, "")} by its people.`
      : `${me.first} ${me.family} has followed the legend of ${def.name} to its end, they say.`,
    me.id,
    "good",
  );
  raiseEvent(g, life, "legend-found", {
    i: LEGENDS.indexOf(def),
    o: def.outcomes.indexOf(out),
  });
}

/** Stand up for a sacred place (the "legend-keep" scene). */
export function keepPlace(
  g: ConquestGame,
  life: Life,
  i: number,
  kept: boolean,
): void {
  const def = LEGENDS[i];
  if (!def) return;
  const st = stateOf(g, life);
  if (kept) {
    st.kept = { ...(st.kept ?? {}), [def.key]: g.s.day };
    addRenown(g, life, 4);
    gainXp(g, life, "faith", 10);
    milestone(
      g,
      life,
      "find",
      `Spoke for ${def.name.replace(/,.*$/, "")}, and it was kept`,
    );
  }
}

function drop(g: ConquestGame, life: Life, key: string): string | null {
  const x = progressOf(life, key);
  if (!x || x.found !== undefined || x.cold !== undefined)
    return "There's no trail of that to give up.";
  touchLife(g, life);
  x.cold = g.s.day;
  secretNote(
    g,
    life,
    `You give up the trail of ${LEGEND_BY_KEY.get(key)?.name}.`,
  );
  return null;
}

hooks.command.push((g, life, c: LifeCommand) => {
  if (c.k !== "legend") return undefined;
  switch (c.act) {
    case "ask":
      return ask(g, life);
    case "work":
      return work(g, life, String(c.key ?? ""));
    case "drop":
      return drop(g, life, String(c.key ?? ""));
    default:
      return "Unknown command.";
  }
});

export { watersYears } from "./LegendsCore";

// ---------------------------------------------------------------- secrets

/** Legends are a player's own: what they've heard and how far they've got. */
export function legendKey(key: string): boolean {
  return key.startsWith("legend-") || key.startsWith("legend:");
}

export function legendsHaveSecrets(l: Partial<Life>): boolean {
  return !!l.legends;
}

/** Another player's life, with their legends taken out. */
export function legendsForOthers<T extends Partial<Life>>(l: T, out: T): void {
  if (l.legends) out.legends = undefined;
  if (out.r76 && (out.r76.spied !== undefined || out.r76.reports !== undefined))
    out.r76 = { ...out.r76, spied: undefined, reports: undefined };
}

/** The words of a step's skill, for the page. */
export function skillWord(def: LegendDef, step: number): string {
  const st = def.steps[step];
  return st ? SKILL_NAMES[st.skill] : "";
}
