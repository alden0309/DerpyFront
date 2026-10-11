// Movements: people with a grievance and a cause. History's own appear when
// their time comes (Bacon's Rebellion in Virginia, Leisler's in New York, the
// Regulators, the Sons of Liberty, the Pueblo Revolt, Pontiac's War and
// more); players can join them, rise in them, or found their own. A rising
// is real war: the movement's host takes the field as a nation of its own,
// with an army and a war, and the map changes if it wins.

import { dayOf } from "./Calendar";
import { kill, makeCharacter, succession } from "./Characters";
import { cede, declareIndependence } from "./Crown";
import { merge } from "./Economy";
import { risingWon } from "./Founding"; // SOCIETY (r11)
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import {
  addRenown,
  addStress,
  gainXp,
  journal,
  milestone,
  remembers,
  setCooldown,
  spend,
  touchLife,
} from "./LifeCore";
import { raiseLifeEvent } from "./LifeEvents";
import {
  Check,
  isChildLife,
  isNativeChar,
  lifeIsNative,
  lifeOfChar,
  meOf,
  no,
  yes,
} from "./LifeQueries";
import { kmBetween } from "./Map";
import {
  armyMen,
  charName,
  holder,
  provincesOf,
  settlers,
  tribesfolk,
} from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { rumour } from "./Rumours";
import { blankNation } from "./Setup";
import type {
  Army,
  Character,
  GameState,
  Life,
  LifeCommand,
  Movement,
  MovementGoal,
  Regiment,
} from "./Types";
import { endWar, startWar } from "./War";

export const GOAL_NAMES: Record<MovementGoal, string> = {
  reform: "Reform the colony's government",
  overthrow: "Overthrow the governor",
  independence: "Independence from the crown",
  expel: "Drive the colonists out",
};

export const GOAL_TEXT: Record<MovementGoal, string> = {
  reform:
    "Win, and the governor must give way: taxes cut, grievances heard, and the leaders pardoned and made much of.",
  overthrow:
    "Win, and the governor is gone: the movement's leader governs in his place, and the crown is furious.",
  independence:
    "Win, and the colony declares itself free; the crown will send armies to say otherwise.",
  expel:
    "Win, and the land the rising holds goes back to the people it was taken from.",
};

/** Support needed to rise, and members (leader included). */
export const RISE_SUPPORT = 40;
export const RISE_MEMBERS = 3;

interface Historic {
  key: string;
  name: string;
  goal: MovementGoal;
  /** The power it rises against. */
  against: string;
  /** A native movement's people. */
  people?: string;
  region: string[];
  from: [number, number];
  rise: [number, number];
  until: number;
  leader: { first: string; family: string; female?: boolean; age: number };
  text: string;
}

const HISTORIC: Historic[] = [
  {
    key: "powhatan",
    name: "Opechancanough's Uprising",
    goal: "expel",
    against: "england",
    people: "powhatan",
    region: [
      "Jamestown",
      "Pamunkey",
      "Appamattuck",
      "Nansemond",
      "Rappahannock",
      "Accomac",
    ],
    from: [1620, 0],
    rise: [1622, 2],
    until: 1626,
    leader: { first: "Opechancanough", family: "of the Powhatan", age: 50 },
    text: "The English take more land every year. The Powhatan remember what they were promised.",
  },
  {
    key: "kingphilip",
    name: "King Philip's War",
    goal: "expel",
    against: "england",
    people: "wampanoag",
    region: [
      "Plymouth",
      "Massachusetts Bay",
      "Narragansett",
      "Pequot",
      "Connecticut",
      "Pocumtuck",
    ],
    from: [1672, 0],
    rise: [1675, 5],
    until: 1678,
    leader: { first: "Metacom", family: "of the Wampanoag", age: 37 },
    text: "Metacom, whom the English call King Philip, has had enough of courts, fines and fences.",
  },
  {
    key: "bacon",
    name: "Bacon's Rebellion",
    goal: "overthrow",
    against: "england",
    region: [
      "Jamestown",
      "Pamunkey",
      "Appamattuck",
      "Nansemond",
      "Rappahannock",
      "St. Mary's",
    ],
    from: [1674, 6],
    rise: [1676, 5],
    until: 1678,
    leader: { first: "Nathaniel", family: "Bacon", age: 29 },
    text: "Frontier planters say the governor protects his fur-trading friends and not their farms.",
  },
  {
    key: "pueblo",
    name: "The Pueblo Revolt",
    goal: "expel",
    against: "spain",
    people: "pueblo",
    region: ["Santa Fe", "Taos", "Acoma", "Zuni", "Hopi", "Pecos"],
    from: [1677, 0],
    rise: [1680, 7],
    until: 1683,
    leader: { first: "Po'pay", family: "of Ohkay Owingeh", age: 50 },
    text: "Drought, raids, and friars who burn the kivas. The pueblos are sending knotted cords from village to village.",
  },
  {
    key: "leisler",
    name: "Leisler's Rebellion",
    goal: "overthrow",
    against: "england",
    region: ["New Amsterdam", "Fort Orange", "Esopus", "Paumanok", "Raritan"],
    from: [1688, 6],
    rise: [1689, 4],
    until: 1691,
    leader: { first: "Jacob", family: "Leisler", age: 49 },
    text: "King James has fled England. Who governs New York now, and in whose name?",
  },
  {
    key: "yamasee",
    name: "The Yamasee War",
    goal: "expel",
    against: "england",
    people: "muscogee",
    region: ["Charles Town", "Santa Elena", "Guale", "Congaree", "Winyah"],
    from: [1713, 0],
    rise: [1715, 3],
    until: 1718,
    leader: { first: "Chekilli", family: "of the Yamasee", age: 40 },
    text: "Carolina traders' debts, slaving raids and cheating weights have left the Yamasee and their allies desperate.",
  },
  {
    key: "natchez",
    name: "The Natchez Revolt",
    goal: "expel",
    against: "france",
    people: "natchez",
    region: ["Natchez", "Tunica", "Bayogoula"],
    from: [1727, 0],
    rise: [1729, 10],
    until: 1732,
    leader: { first: "Great Sun", family: "of the Natchez", age: 45 },
    text: "The French commandant wants the Natchez's own sacred village for his tobacco fields.",
  },
  {
    key: "pontiac",
    name: "Pontiac's War",
    goal: "expel",
    against: "england",
    people: "anishinaabe",
    region: [
      "Détroit",
      "Michilimackinac",
      "Niagara",
      "Forks of the Ohio",
      "Sandusky",
      "Saint-Joseph",
      "Kekionga",
    ],
    from: [1761, 0],
    rise: [1763, 4],
    until: 1766,
    leader: { first: "Obwandiyag", family: "of the Odawa", age: 43 },
    text: "The French are gone and the British give no gifts, sell no powder and build forts everywhere.",
  },
  {
    key: "regulators",
    name: "The Regulators",
    goal: "reform",
    against: "england",
    region: [
      "Albemarle",
      "Pamlico",
      "Tuscarora",
      "Catawba",
      "Saura",
      "Cape Fear",
      "Congaree",
    ],
    from: [1765, 0],
    rise: [1771, 4],
    until: 1772,
    leader: { first: "Herman", family: "Husband", age: 41 },
    text: "Backcountry farmers are sick of crooked sheriffs, fees and courts that answer only to the coast.",
  },
  {
    key: "liberty",
    name: "The Sons of Liberty",
    goal: "independence",
    against: "england",
    region: [
      "Massachusetts Bay",
      "Plymouth",
      "Connecticut",
      "Narragansett",
      "New Amsterdam",
      "Raritan",
      "Upland",
      "Jamestown",
      "Charles Town",
      "Piscataqua",
    ],
    from: [1765, 2],
    rise: [1775, 3],
    until: 1776,
    leader: { first: "Samuel", family: "Adams", age: 43 },
    text: "No taxation without representation: stamp acts, tea duties and redcoats in the streets.",
  },
];

// ---------------------------------------------------------------- reading

export function movementOf(s: GameState, c: number): Movement | undefined {
  return s.movements.find(
    (m) =>
      (m.status === "brewing" || m.status === "risen") &&
      (m.leader === c || m.members.includes(c)),
  );
}

export function activeMovements(s: GameState): Movement[] {
  return s.movements.filter(
    (m) => m.status === "brewing" || m.status === "risen",
  );
}

/** Movements someone could join where they are. */
export function movementsHere(s: GameState, p: number): Movement[] {
  return activeMovements(s).filter((m) => m.region.includes(p));
}

export function joinCheck(s: GameState, life: Life, m: Movement): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (movementOf(s, me.id)) return no("You belong to a movement already.");
  if (!m.region.includes(life.prov))
    return no(`Its people are in ${regionText(s, m)}.`);
  const native = isNativeChar(s, me);
  if (m.people >= 0 !== native)
    return no(
      m.people >= 0
        ? "It's a cause of the native peoples."
        : "It's a colonists' cause.",
    );
  if (s.nations[m.against]?.ruler === me.id) return no("It's against you.");
  return yes;
}

export function riseCheck(s: GameState, life: Life, m: Movement): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (m.leader !== me.id) return no("Only the leader can call the rising.");
  if (m.status !== "brewing") return no("It has already risen.");
  if (!m.region.includes(life.prov))
    return no("Go among your followers first.");
  const pr = s.provinces[life.prov];
  if (holder(pr) !== m.against)
    return no(`Rise where ${s.nations[m.against].name} holds the land.`);
  if (m.support < RISE_SUPPORT)
    return no(
      `Needs ${RISE_SUPPORT} support (it has ${Math.round(m.support)}).`,
    );
  if (m.members.length + 1 < RISE_MEMBERS)
    return no(
      `Needs ${RISE_MEMBERS} sworn members (it has ${m.members.length + 1}).`,
    );
  return yes;
}

export function foundCheck(s: GameState, life: Life): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (movementOf(s, me.id)) return no("You belong to a movement already.");
  if (life.renown < 15) return no("Nobody follows an unknown (renown 15).");
  if (life.travel) return no("Not on the road.");
  const target = foundTarget(s, life);
  if (target < 0)
    return no(
      lifeIsNative(s, life)
        ? "No colony presses on your people here."
        : "Found a movement in a colony, among its people.",
    );
  if (s.nations[target].ruler === me.id) return no("Against yourself?");
  return yes;
}

/** Who a new movement would stand against, from where its founder is. */
export function foundTarget(s: GameState, life: Life): number {
  const me = meOf(s, life);
  if (!me) return -1;
  const pr = s.provinces[life.prov];
  const owner = pr.owner >= 0 ? s.nations[pr.owner] : undefined;
  if (!lifeIsNative(s, life))
    return owner?.kind === "power" && owner.id === me.nation ? owner.id : -1;
  // Native: the colony that holds land here or next door.
  if (owner?.kind === "power") return owner.id;
  return -1;
}

function regionText(s: GameState, m: Movement): string {
  void s;
  return m.region.length > 3 ? `${m.region.length} provinces` : "its region";
}

// ---------------------------------------------------------------- appearing

function nationKey(s: GameState, key: string): number {
  return s.nations.findIndex((n) => n.key === key);
}

function provinceNamed(g: ConquestGame, name: string): number {
  return g.map.provinces.findIndex((p) => p.name === name);
}

function newMovement(
  g: ConquestGame,
  o: Omit<
    Movement,
    | "id"
    | "founded"
    | "status"
    | "rebels"
    | "rose"
    | "ended"
    | "arms"
    | "members"
  > & {
    members?: number[];
  },
): Movement {
  const m: Movement = {
    id: g.nextId(),
    founded: g.s.day,
    status: "brewing",
    rebels: -1,
    rose: -1,
    ended: -1,
    arms: 0,
    members: o.members ?? [],
    ...o,
  };
  g.s.movements.push(m);
  g.movementsChanged();
  return m;
}

function historicDue(g: ConquestGame): void {
  const s = g.s;
  for (const h of HISTORIC) {
    if (s.movements.some((m) => m.key === h.key)) continue;
    const from = dayOf(h.from[0], h.from[1]);
    if (s.day < from || s.day >= dayOf(h.until)) continue;
    const against = nationKey(s, h.against);
    if (against < 0 || !s.nations[against].alive) continue;
    const region = h.region
      .map((n) => provinceNamed(g, n))
      .filter((p) => p >= 0);
    const held = region.filter((p) => s.provinces[p].owner === against);
    if (held.length === 0) continue;
    const people = h.people ? nationKey(s, h.people) : -1;
    if (h.people && people < 0) continue;
    // The leader, among their people.
    const home = held[0];
    const ln = people >= 0 ? s.nations[people] : s.nations[against];
    const leader = makeCharacter(s, g.rng, {
      nation: people >= 0 ? people : against,
      culture: ln.culture,
      religion: people >= 0 ? "native" : ln.religion,
      female: h.leader.female ?? false,
      age: h.leader.age,
      first: h.leader.first,
      family: h.leader.family,
      traits: [
        "ambitious",
        g.rng.pick(["brave", "charming", "just", "zealous"] as const)!,
      ],
    });
    leader.home = home;
    leader.role = people >= 0 ? "warleader" : "planter";
    g.touchChar(leader);
    (s.locals[home] ??= []).push(leader.id);
    g.localsChanged(home);
    const m = newMovement(g, {
      key: h.key,
      name: h.name,
      goal: h.goal,
      against,
      people,
      region,
      leader: leader.id,
      support: 25,
      due: dayOf(h.rise[0], h.rise[1]),
      fades: dayOf(h.until),
      text: h.text,
    });
    g.event({
      k: "news",
      day: s.day,
      n: against,
      text: `${m.name}: ${h.text}`,
      p: home,
    });
  }
}

// ---------------------------------------------------------------- the months

export function movementsMonthly(g: ConquestGame): void {
  const s = g.s;
  historicDue(g);
  for (const m of [...s.movements]) {
    if (m.status === "brewing") brewing(g, m);
    else if (m.status === "risen") risen(g, m);
  }
}

function brewing(g: ConquestGame, m: Movement): void {
  const s = g.s;
  const target = s.nations[m.against];
  const leader = s.chars[m.leader];
  if (!target?.alive)
    return fade(g, m, `${target?.name ?? "Its enemy"} is gone`);
  // Leaderless: the most renowned member takes it on, or it dies.
  if (!leader?.alive || leader.abroad) {
    const next = m.members.find((c) => s.chars[c]?.alive && !s.chars[c].abroad);
    if (next === undefined)
      return fade(g, m, "With its leader gone, it faded away");
    m.leader = next;
    m.members = m.members.filter((c) => c !== next);
    const life = lifeOfChar(s, next);
    if (life) journal(g, life, `You now lead ${m.name}.`, "good");
  }
  m.members = m.members.filter((c) => s.chars[c]?.alive && !s.chars[c].abroad);
  // Support follows grievance: unrest where it's strong.
  const held = m.region.filter((p) => s.provinces[p].owner === m.against);
  if (held.length === 0)
    return fade(g, m, "The land it fought over is no longer in dispute");
  const unrest =
    held.reduce((a, p) => a + s.provinces[p].unrest, 0) / held.length;
  let d = unrest / 25 - 1;
  if (m.due >= 0 && s.day >= m.due - DAYS_PER_YEAR) d += 3;
  if (lifeOfChar(s, m.leader)) d += 0.5;
  m.support = Math.max(0, Math.min(100, Math.round((m.support + d) * 10) / 10));
  // Agitation stirs the provinces.
  if (m.support >= 50)
    for (const p of held) {
      const pr = g.prov(p);
      pr.mods = pr.mods.filter((x) => x.key !== `agitation-${m.id}`);
      pr.mods.push({
        key: `agitation-${m.id}`,
        label: `Agitation by ${m.name}`,
        until: s.day + 40,
        fx: { unrest: 8 },
      });
    }
  g.movementsChanged();
  // History's rising comes when its time comes (unless a player leads it).
  if (
    m.due >= 0 &&
    s.day >= m.due &&
    !lifeOfChar(s, m.leader) &&
    m.support >= 25
  ) {
    rise(g, m);
    return;
  }
  if (m.due >= 0 && s.day >= m.due && lifeOfChar(s, m.leader)) {
    const life = lifeOfChar(s, m.leader)!;
    if (!life.cooldowns[`hour:${m.id}`])
      raiseLifeEvent(g, life, "movement-hour", { m: m.id });
    setCooldown(g, life, `hour:${m.id}`, 365);
  }
  if (s.day >= m.fades) fade(g, m, "Its moment passed");
}

function fade(g: ConquestGame, m: Movement, why: string): void {
  m.status = "faded";
  m.ended = g.s.day;
  g.movementsChanged();
  for (const c of [m.leader, ...m.members]) {
    const life = lifeOfChar(g.s, c);
    if (life) journal(g, life, `${m.name}: ${why}.`);
  }
}

// ---------------------------------------------------------------- rising

function rebelColor(g: ConquestGame, m: Movement): string {
  if (m.people >= 0) return g.s.nations[m.people].color;
  return "#4a3a2c";
}

/** The rising: a host takes the field, at war with the colony. */
export function rise(g: ConquestGame, m: Movement): void {
  const s = g.s;
  const target = s.nations[m.against];
  const leader = s.chars[m.leader];
  const leaderLife = lifeOfChar(s, m.leader);
  // Where: the leader's province if it's in the region and held by the target.
  let p =
    leaderLife && m.region.includes(leaderLife.prov) ? leaderLife.prov : -1;
  if (p < 0 || holder(s.provinces[p]) !== m.against)
    p =
      m.region
        .filter((q) => holder(s.provinces[q]) === m.against)
        .sort(
          (a, b) =>
            settlers(s.provinces[b]) +
            tribesfolk(s.provinces[b]) -
            (settlers(s.provinces[a]) + tribesfolk(s.provinces[a])),
        )[0] ?? -1;
  if (p < 0) return fade(g, m, "There was nowhere left to rise");
  const id = s.nations.length;
  const native = m.people >= 0;
  const rebels = blankNation(
    id,
    `rebels-${m.id}`,
    "rebels",
    m.name,
    "rebel",
    rebelColor(g, m),
    {
      culture: leader?.culture ?? target.culture,
      religion: leader?.religion ?? target.religion,
      capital: p,
      gold: 0,
      player: null,
      playerName: null,
    },
  );
  rebels.colony = m.against;
  rebels.movement = m.id;
  rebels.ruler = m.leader;
  s.nations.push(rebels);
  g.nation(id);
  const count = Math.max(
    2,
    Math.min(
      10,
      2 +
        Math.floor(m.support / 20) +
        Math.floor(m.members.length / 2) +
        Math.floor(m.arms / 10),
    ),
  );
  const regs: Regiment[] = [];
  for (let i = 0; i < count; i++)
    regs.push({
      type: native ? "warriors" : "militia",
      men: 100,
      morale: 0.85,
      home: p,
    });
  // The men come from the province's people.
  const pr = g.prov(p);
  let need = count * 100;
  for (const pop of pr.pops) {
    if (need <= 0) break;
    if (native ? pop.cls !== "tribe" : pop.cls !== "laborers") continue;
    const take = Math.min(pop.size * 0.4, need);
    pop.size -= take;
    need -= take;
  }
  merge(pr.pops);
  const army: Army = {
    id: g.nextId(),
    owner: id,
    prov: p,
    regs,
    path: [],
    depart: -1,
    arrive: -1,
    sea: false,
    retreating: false,
    arrived: s.day,
    from: -1,
    commander: m.leader,
    supply: 1,
  };
  g.addArmy(army);
  startWar(g, id, m.against, m.name, false);
  // The rising seizes its own province unless soldiers stand there.
  if (!s.armies.some((a) => a.prov === p && a.owner === m.against)) {
    pr.occupier = id;
    pr.siege = null;
  }
  m.status = "risen";
  m.rebels = id;
  m.rose = s.day;
  g.movementsChanged();
  g.event({
    k: "news",
    day: s.day,
    n: m.against,
    text: `${m.name} has risen in arms at ${g.map.provinces[p].name}!`,
    p,
  });
  for (const c of [m.leader, ...m.members]) {
    const life = lifeOfChar(s, c);
    if (!life) continue;
    touchLife(g, life).tally.risings++;
    milestone(
      g,
      life,
      "rising",
      `${m.name} rose at ${g.map.provinces[p].name}`,
      p,
    );
    journal(
      g,
      life,
      c === m.leader
        ? `You raise the standard at ${g.map.provinces[p].name}: ${count * 100} men under arms. March them on ${target.name.replace(/^the /, "")}'s capital (or wherever the cause needs them).`
        : `${m.name} has risen at ${g.map.provinces[p].name}. Go there to take up arms with them.`,
      "good",
    );
    raiseLifeEvent(g, life, "rising-standard", { m: m.id });
  }
  rumour(g, p, `${m.name} has risen in arms at ${g.map.provinces[p].name}.`);
  // Everyone else in its country hears the drums and must choose.
  const sworn = new Set([m.leader, ...m.members]);
  for (const life of s.lives) {
    if (life.c < 0 || life.watching || sworn.has(life.c)) continue;
    if (!m.region.includes(life.prov) || isChildLife(s, life)) continue;
    raiseLifeEvent(g, life, "rising-call", { m: m.id });
  }
}

/** Where a rebel host marches: the target's capital, or the nearest land it holds in the region. */
export function rebelTarget(g: ConquestGame, rebels: number): number {
  const s = g.s;
  const n = s.nations[rebels];
  const m = s.movements.find((x) => x.id === n.movement);
  if (!m) return -1;
  const target = s.nations[m.against];
  if (m.goal === "expel") {
    const left = m.region.filter(
      (p) =>
        s.provinces[p].owner === m.against && holder(s.provinces[p]) !== rebels,
    );
    const army = s.armies.find((a) => a.owner === rebels);
    if (!army) return left[0] ?? -1;
    return (
      left.sort(
        (a, b) =>
          kmBetween(g.map, army.prov, a) - kmBetween(g.map, army.prov, b),
      )[0] ?? -1
    );
  }
  return target.capital;
}

function risen(g: ConquestGame, m: Movement): void {
  const s = g.s;
  const rebels = s.nations[m.rebels];
  const target = s.nations[m.against];
  if (!rebels?.alive) return;
  const armies = s.armies.filter((a) => a.owner === m.rebels && armyMen(a) > 0);
  if (armies.length === 0 || !target.alive) return crushed(g, m);
  const held = s.provinces.flatMap((pr, p) =>
    pr.occupier === m.rebels ? [p] : [],
  );
  const months = (s.day - m.rose) / 30;
  let win: boolean;
  if (m.goal === "expel") {
    const theirs = m.region.filter((p) => s.provinces[p].owner === m.against);
    const mine = theirs.filter((p) => held.includes(p));
    win = theirs.length > 0 && mine.length >= Math.ceil(theirs.length / 2);
  } else {
    win =
      held.includes(target.capital) ||
      (held.length >= Math.max(2, Math.ceil(m.region.length / 2)) &&
        months >= 12);
  }
  if (win) return won(g, m);
  if (months >= 30) return disperse(g, m);
}

function endRising(g: ConquestGame, m: Movement): void {
  const s = g.s;
  for (const a of [...s.armies]) if (a.owner === m.rebels) g.removeArmy(a);
  for (let p = 0; p < s.provinces.length; p++) {
    const pr = s.provinces[p];
    if (pr.occupier === m.rebels) {
      const x = g.prov(p);
      x.occupier = -1;
      x.siege = null;
    } else if (pr.siege?.by === m.rebels) g.prov(p).siege = null;
  }
  endWar(g, m.rebels, m.against, true);
  g.nation(m.rebels).alive = false;
  m.ended = s.day;
  g.movementsChanged();
}

function won(g: ConquestGame, m: Movement): void {
  const s = g.s;
  const target = g.nation(m.against);
  const leader = s.chars[m.leader];
  const held = s.provinces.flatMap((pr, p) =>
    pr.occupier === m.rebels ? [p] : [],
  );
  let text: string;
  if (m.goal === "expel") {
    const people = g.nation(m.people);
    const taken = held.filter((p) => s.provinces[p].owner === m.against);
    endRising(g, m);
    for (const p of taken) {
      const pr = g.prov(p);
      // Settlers flee to the colony's nearest land.
      const refuge = provincesOf(s, m.against).find((q) => q !== p);
      const fleeing = pr.pops.filter((x) => x.cls !== "tribe");
      pr.pops = pr.pops.filter((x) => x.cls === "tribe");
      pr.b = {};
      if (refuge !== undefined) {
        const dest = g.prov(refuge);
        for (const pop of fleeing)
          dest.pops.push({ ...pop, size: pop.size * 0.8 });
        merge(dest.pops);
      }
      if (!people.alive) {
        people.alive = true;
        people.capital = p;
      }
      cede(g, p, m.people);
    }
    if (leader?.alive && !lifeOfChar(s, leader.id))
      people.council.marshal = leader.id;
    text = `${m.name} has driven the ${target.adjective} out of ${taken.map((p) => g.map.provinces[p].name).join(", ")}.`;
  } else if (m.goal === "reform") {
    endRising(g, m);
    for (const p of m.region) {
      if (s.provinces[p].owner !== m.against) continue;
      g.prov(p).mods.push({
        key: `reformed-${m.id}`,
        label: `Concessions to ${m.name}`,
        until: s.day + 3 * DAYS_PER_YEAR,
        fx: { unrest: -25 },
      });
    }
    target.tax = 0;
    target.mods.push({
      key: `conceded-${m.id}`,
      label: `Gave way to ${m.name}`,
      until: s.day + 2 * DAYS_PER_YEAR,
      fx: { favor: -10 },
    });
    text = `${target.name} gives way to ${m.name}: fees cut, sheriffs replaced, grievances heard.`;
  } else {
    const keepArmies = s.armies.filter((a) => a.owner === m.rebels);
    for (const a of keepArmies) {
      g.touch(a).owner = m.against;
      a.commander = leader?.alive ? leader.id : -1;
    }
    endRising(g, m);
    const old = s.chars[target.ruler];
    if (leader?.alive) {
      if (old?.alive && old.id !== leader.id) {
        // A governor played by someone is turned out, not shipped off.
        const deposed = lifeOfChar(s, old.id);
        if (deposed)
          journal(
            g,
            deposed,
            `${m.name} has turned you out of the governor's house. You're a private person again, with enemies.`,
            "bad",
          );
        else old.abroad = true;
        g.touchChar(old);
      }
      target.ruler = leader.id;
      target.court = target.court.filter((x) => x !== leader.id);
      for (const seat of Object.keys(
        target.council,
      ) as (keyof typeof target.council)[])
        if (target.council[seat] === leader.id) target.council[seat] = -1;
      g.touchChar(leader);
      g.event({
        k: "succession",
        day: s.day,
        n: m.against,
        c: leader.id,
        how: `seized power at the head of ${m.name}`,
      });
    } else if (old?.alive) {
      kill(g, old, `the fury of ${m.name}`);
    } else succession(g, m.against, `after ${m.name}`);
    target.mods.push({
      key: `overthrown-${m.id}`,
      label: `A governor the crown didn't choose`,
      until: s.day + 3 * DAYS_PER_YEAR,
      fx: { favor: -25 },
    });
    if (m.goal === "independence" && !target.independent && !target.rebelling) {
      declareIndependence(g, m.against);
      text = `${m.name} has carried the colony: ${target.name} declares itself free of the crown!`;
    } else
      text = `${m.name} has carried the day: the governor is gone, and ${charName(leader)} governs ${target.name}.`;
  }
  m.status = "won";
  g.event({ k: "news", day: s.day, n: m.against, text });
  // SOCIETY (r11): the leader sets up the new government.
  if ((m.goal === "overthrow" || m.goal === "independence") && leader?.alive)
    risingWon(g, m.against, leader.id, m.goal === "independence");
  for (const c of [m.leader, ...m.members]) {
    const life = lifeOfChar(s, c);
    if (!life) continue;
    touchLife(g, life).tally.risingsWon++;
    addRenown(g, life, c === m.leader ? 30 : 10);
    journal(g, life, text, "good");
    milestone(g, life, "rising", `${m.name} won`);
    raiseLifeEvent(g, life, "rising-victory", { m: m.id });
  }
  rumour(g, s.nations[m.against]?.capital ?? m.region[0] ?? -1, text);
}

function crushed(g: ConquestGame, m: Movement): void {
  const s = g.s;
  endRising(g, m);
  m.status = "crushed";
  for (const p of m.region)
    if (s.provinces[p].owner === m.against)
      g.prov(p).mods.push({
        key: `crushed-${m.id}`,
        label: `${m.name} crushed`,
        until: s.day + 2 * DAYS_PER_YEAR,
        fx: { unrest: -20 },
      });
  g.event({
    k: "news",
    day: s.day,
    n: m.against,
    text: `${m.name} is crushed. The hangmen are busy.`,
  });
  for (const c of [m.leader, ...m.members]) {
    const ch = s.chars[c];
    if (!ch?.alive) continue;
    const life = lifeOfChar(s, c);
    if (life) {
      journal(g, life, `${m.name} is crushed.`, "bad");
      addRenown(g, life, -5);
      raiseLifeEvent(
        g,
        life,
        c === m.leader ? "rebel-caught" : "rebel-hunted",
        { m: m.id },
      );
    } else if (c === m.leader && g.rng.chance(0.7)) {
      kill(g, ch, `the hangman, after ${m.name}`);
    }
  }
}

/** A rising that wins nothing in two and a half years melts away. */
function disperse(g: ConquestGame, m: Movement): void {
  endRising(g, m);
  m.status = "faded";
  g.event({
    k: "news",
    day: g.s.day,
    n: m.against,
    text: `${m.name} melts away; its men go home to their farms.`,
  });
  for (const c of [m.leader, ...m.members]) {
    const life = lifeOfChar(g.s, c);
    if (life)
      journal(
        g,
        life,
        `${m.name} has melted away. An amnesty is proclaimed for those who go home quietly.`,
      );
  }
}

// ---------------------------------------------------------------- what players do

export function joinMovement(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const s = g.s;
  const m = s.movements.find((x) => x.id === id);
  if (!m || (m.status !== "brewing" && m.status !== "risen"))
    return "No such movement.";
  const check = joinCheck(s, life, m);
  if (!check.ok) return check.why;
  m.members.push(life.c);
  g.movementsChanged();
  m.support = Math.min(100, m.support + 1 + life.renown / 20);
  journal(
    g,
    life,
    `You swear yourself to ${m.name}. ${GOAL_NAMES[m.goal]}.`,
    "good",
  );
  milestone(g, life, "movement", `Joined ${m.name}`);
  // Joining a rising in its own country: take up arms with its host.
  if (m.status === "risen") {
    const army = s.armies.find(
      (a) => a.owner === m.rebels && a.prov === life.prov,
    );
    if (army) {
      life.job = {
        kind: lifeIsNative(s, life) ? "warrior" : "soldier",
        rank: 2,
        prov: life.prov,
        place: lifeIsNative(s, life) ? "councilfire" : "fort",
        employer: m.leader,
        nation: m.rebels,
        army: army.id,
        since: s.day,
        months: 0,
        away: 0,
      };
      journal(g, life, "You take up a musket with the rising's host.");
    }
  }
  return null;
}

function foundMovement(
  g: ConquestGame,
  life: Life,
  goal: MovementGoal | undefined,
  name: string | undefined,
): string | null {
  const s = g.s;
  const check = foundCheck(s, life);
  if (!check.ok) return check.why;
  const me = meOf(s, life)!;
  const native = lifeIsNative(s, life);
  const against = foundTarget(s, life);
  const g2: MovementGoal = native
    ? "expel"
    : goal && goal !== "expel"
      ? goal
      : "reform";
  const here = g.map.provinces[life.prov].name;
  const region = [
    life.prov,
    ...g.map.provinces[life.prov].nb
      .map(([q]) => q)
      .filter((q) => s.provinces[q].owner === against),
  ].slice(0, 7);
  const fallback: Record<MovementGoal, string> = {
    reform: `The ${here} Association`,
    overthrow: `The Friends of ${here}`,
    independence: `The Sons of Liberty of ${here}`,
    expel: `The ${s.nations[me.nation].name} Alliance`,
  };
  const clean = (name ?? "").replace(/[<>]/g, "").trim().slice(0, 48);
  const m = newMovement(g, {
    key: "own",
    name: clean.length >= 3 ? clean : fallback[g2],
    goal: g2,
    against,
    people: native ? me.nation : -1,
    region,
    leader: me.id,
    support: Math.min(40, 10 + life.renown / 5),
    due: -1,
    fades: s.day + 15 * DAYS_PER_YEAR,
    text: `Founded by ${charName(me)} at ${here}.`,
  });
  addRenown(g, life, 2);
  journal(
    g,
    life,
    `You found ${m.name}: ${GOAL_NAMES[g2].toLowerCase()}. Recruit followers, print pamphlets, hold meetings, put arms by; at ${RISE_SUPPORT} support and ${RISE_MEMBERS} sworn members you can rise.`,
    "good",
  );
  milestone(g, life, "movement", `Founded ${m.name}`);
  g.event({
    k: "news",
    day: s.day,
    n: against,
    text: `${m.name} is founded at ${here}.`,
    p: life.prov,
  });
  return null;
}

function leaveMovement(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const m = movementOf(s, life.c);
  if (!m) return "You belong to no movement.";
  if (m.status === "risen") return "There's no leaving a rising: win, or hang.";
  if (m.leader === life.c) {
    const next = m.members[0];
    if (next === undefined) {
      fade(g, m, "Its founder gave it up");
      return null;
    }
    m.leader = next;
    m.members = m.members.slice(1);
  } else m.members = m.members.filter((c) => c !== life.c);
  g.movementsChanged();
  journal(g, life, `You leave ${m.name}.`);
  return null;
}

function claimLead(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const m = movementOf(s, life.c);
  if (!m) return "You belong to no movement.";
  if (m.leader === life.c) return "You lead it already.";
  const leader = s.chars[m.leader];
  if (leader?.alive && !leader.abroad && lifeOfChar(s, leader.id))
    return "Another player leads it.";
  if (leader?.alive && !leader.abroad && life.renown < 40)
    return `${charName(leader)} leads it; you'd need renown 40 to take it from them.`;
  if (leader?.alive) m.members.push(leader.id);
  m.members = m.members.filter((c) => c !== life.c);
  m.leader = life.c;
  if (m.status === "risen") {
    const n = g.nation(m.rebels);
    n.ruler = life.c;
    const army = s.armies.find((a) => a.owner === m.rebels);
    if (army) g.touch(army).commander = life.c;
  }
  g.movementsChanged();
  journal(g, life, `You take the lead of ${m.name}.`, "good");
  milestone(g, life, "movement", `Took the lead of ${m.name}`);
  return null;
}

/** Bring someone into the cause (the check was rolled by the caller). */
export function recruitInto(
  g: ConquestGame,
  life: Life,
  c: Character,
  pass: boolean,
): string | null {
  const s = g.s;
  const m = movementOf(s, life.c)!;
  gainXp(g, life, "persuasion", 6);
  gainXp(g, life, "leadership", 3);
  if (pass) {
    m.members.push(c.id);
    m.support = Math.min(100, m.support + 1.5);
    g.movementsChanged();
    remembers(g, life, c, "Brought me into the cause", 8, 3);
    journal(g, life, `${charName(c)} is sworn to ${m.name}.`, "good");
    return null;
  }
  remembers(g, life, c, "Tried to draw me into sedition", -8, 2);
  const loyal =
    c.role === "official" || c.role === "sergeant" || c.role === "lawyer";
  if (loyal && g.rng.chance(0.5)) {
    journal(
      g,
      life,
      `${charName(c)} refused, and went straight to the magistrate.`,
      "bad",
    );
    raiseLifeEvent(g, life, "informed-upon", { m: m.id, c: c.id });
  } else journal(g, life, `${charName(c)} wants no part of it.`);
  return null;
}

/** A pamphlet for the cause. */
export function movementPamphlet(
  g: ConquestGame,
  life: Life,
  m: Movement,
  pass: boolean,
): void {
  const publisher = life.job?.kind === "newsman" && life.job.rank >= 2;
  m.support = Math.min(100, m.support + (pass ? (publisher ? 7 : 4) : 1));
  g.movementsChanged();
  journal(
    g,
    life,
    pass
      ? `Your pamphlet for ${m.name} is passed hand to hand. Support grows.`
      : `Your pamphlet for ${m.name} fell flat.`,
    pass ? "good" : "bad",
  );
  if (g.rng.chance(pass ? 0.12 : 0.25))
    raiseLifeEvent(g, life, "seditious-libel", { m: m.id });
}

/** A meeting of the cause at the tavern (or the council fire). */
export function holdMeeting(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const m = movementOf(s, life.c);
  if (!m) return "You belong to no movement.";
  if (!m.region.includes(life.prov))
    return "Hold meetings among your followers.";
  m.support = Math.min(100, m.support + 2.5);
  g.movementsChanged();
  gainXp(g, life, "leadership", 5);
  addRenown(g, life, 0.5);
  journal(
    g,
    life,
    `A meeting of ${m.name} in a back room: loud speeches, louder cheers. Support grows.`,
  );
  if (g.rng.chance(0.08))
    raiseLifeEvent(g, life, "informed-upon", { m: m.id, c: -1 });
  return null;
}

/** Muskets and powder put by for the day. */
export function buyArms(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const m = movementOf(s, life.c);
  if (!m) return "You belong to no movement.";
  if (life.purse < 10) return "Ten coins buys a crate of muskets.";
  spend(g, life, 10);
  m.arms += 10;
  g.movementsChanged();
  journal(
    g,
    life,
    `You put by muskets and powder for ${m.name} (${m.arms} stand of arms).`,
  );
  return null;
}

export function riseFor(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const m = movementOf(s, life.c);
  if (!m) return "You belong to no movement.";
  const check = riseCheck(s, life, m);
  if (!check.ok) return check.why;
  rise(g, m);
  addStress(g, life, 10);
  return null;
}

function movementCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "movement") return undefined;
  switch (c.act) {
    case "join":
      return joinMovement(g, life, c.id ?? -1);
    case "found":
      return foundMovement(g, life, c.goal, c.name);
    case "leave":
      return leaveMovement(g, life);
    case "lead":
      return claimLead(g, life);
    case "rise":
      return riseFor(g, life);
    default:
      return "Unknown.";
  }
}

hooks.command.push(movementCommand);
