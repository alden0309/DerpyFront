// LIFE (r11): work for a sword, or a company, for hire. Contracts are
// offered at the tavern (escorts, outlaw hunts, guard duty, finding
// someone, exploring), at the governor's house (raids on the enemy in
// wartime, punitive expeditions) and at the watch-house (rewards for wanted
// rogues), and now and then by letter. Take one, get there in time, and see
// it through: the fight weighs your strength (you, the people with you,
// your company) against theirs.

import { kill, makeCharacter } from "./Characters";
import { addHeat } from "./Crime";
import { peopleOf, strengthOf } from "./Followers";
import type { ConquestGame } from "./Game";
import { raiseEvent } from "./Hooks";
import {
  addRenown,
  addStress,
  beginOutcome,
  earn,
  endOutcome,
  gainXp,
  hurt,
  journal,
  outcomeMeta,
  remembers,
  touchLife,
} from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import {
  Check,
  hasPlace,
  isChildLife,
  meOf,
  no,
  skillLevel,
  yes,
} from "./LifeQueries";
import type { World } from "./Map";
import { wake } from "./Pace";
import { atWar, charName, settlers } from "./Queries";
import { Rng } from "./Rng";
import type {
  Contract,
  ContractKind,
  GameState,
  Life,
  LifeCommand,
  PlaceKind,
} from "./Types";

export const CONTRACT_NAMES: Record<ContractKind, string> = {
  escort: "Escort",
  outlaws: "Outlaw hunt",
  guard: "Guard duty",
  raid: "A raid",
  explore: "Exploring",
  find: "Find someone",
  bounty: "A reward",
};

/** Contracts you can hold at once. */
export const MAX_CONTRACTS = 2;

function hashOf(...xs: number[]): number {
  let h = 2166136261 | 0;
  for (const x of xs) {
    h = Math.imul(h ^ (x | 0), 16777619);
    h ^= h >>> 13;
  }
  return h | 0;
}

/** Provinces by hops over land from p, up to `max` hops. */
function ring(w: World, p: number, min: number, max: number): number[] {
  const seen = new Map<number, number>([[p, 0]]);
  let front = [p];
  for (let hop = 1; hop <= max && front.length; hop++) {
    const next: number[] = [];
    for (const q of front)
      for (const [r] of w.map.provinces[q].nb)
        if (!seen.has(r)) {
          seen.set(r, hop);
          next.push(r);
        }
    front = next;
  }
  return [...seen.entries()].filter(([, h]) => h >= min).map(([q]) => q);
}

const OUTLAWS = [
  "the Harpe brothers",
  "Black Tom's gang",
  "a band of deserters",
  "the Swamp Fox's cousins (no relation)",
  "horse thieves out of the hills",
  "a gang of runaway bondsmen turned robbers",
  "the Red Hand",
  "wreckers who light false beacons",
];

const ESCORTS = [
  "a merchant's pack train",
  "a wagonload of the colony's silver",
  "a minister and his family",
  "a surveyor's party",
  "a widow with her late husband's money",
  "a herd of cattle for market",
];

/** The contracts on offer at a place this month (the same for everyone). */
export function contractOffers(
  s: GameState,
  w: World,
  p: number,
  place: PlaceKind,
): Contract[] {
  if (
    place !== "tavern" &&
    place !== "governor" &&
    place !== "gaol" &&
    place !== "councilfire"
  )
    return [];
  const pr = s.provinces[p];
  const owner = pr.owner >= 0 ? s.nations[pr.owner] : undefined;
  if (!owner) return [];
  const month = Math.floor(s.day / 30);
  const rng = new Rng({
    rng: hashOf(
      s.settings.seed,
      p,
      month,
      place.charCodeAt(0) * 7 + place.length,
    ),
  });
  const out: Contract[] = [];
  const near = ring(w, p, 1, 4).filter(
    (q) => s.provinces[q].owner >= 0 || rng.chance(0.3),
  );
  const far = ring(w, p, 3, 8).filter((q) => s.provinces[q].owner < 0);
  const giver = (s.locals[p] ?? [])
    .map((id) => s.chars[id])
    .find(
      (c) =>
        c?.alive &&
        (place === "tavern"
          ? c.role === "innkeeper" || c.role === "merchant"
          : place === "gaol"
            ? c.role === "constable" || c.role === "official"
            : place === "councilfire"
              ? c.role === "sachem" || c.role === "warleader"
              : c.role === "official"),
    );
  const giverId =
    place === "governor" && owner.capital === p
      ? owner.ruler
      : (giver?.id ?? -1);
  const count = 1 + rng.int(0, 2);
  const kinds: ContractKind[] =
    place === "tavern"
      ? ["escort", "outlaws", "guard", "find", "explore"]
      : place === "gaol"
        ? ["bounty", "bounty", "outlaws"]
        : ["raid", "outlaws", "explore", "escort"];
  for (let slot = 0; slot < count; slot++) {
    const kind = kinds[rng.int(0, kinds.length - 1)];
    const id = hashOf(p, month, place.length, slot) & 0x7fffffff;
    const make = (
      o: Partial<Contract> & {
        target: number;
        title: string;
        text: string;
        pay: number;
        foe: number;
        days: number;
      },
    ) =>
      out.push({
        id,
        kind,
        giver: giverId,
        from: p,
        target: o.target,
        pay: Math.round(o.pay),
        due: s.day + o.days,
        foe: Math.round(o.foe),
        title: o.title,
        text: o.text,
        status: "offered",
        until: (month + 1) * 30,
        ...(o.stay !== undefined ? { stay: o.stay } : {}),
      });
    const name = (q: number) => w.map.provinces[q].name;
    switch (kind) {
      case "escort": {
        const t = near[rng.int(0, Math.max(0, near.length - 1))];
        if (t === undefined) break;
        const what = ESCORTS[rng.int(0, ESCORTS.length - 1)];
        const foe = rng.chance(0.6) ? rng.int(10, 35) : 0;
        make({
          target: t,
          title: `Escort ${what} to ${name(t)}`,
          text: `See ${what} safe to ${name(t)}. ${foe ? "There's talk of robbers on the way." : "The road should be quiet."}`,
          pay: 8 + rng.int(0, 10),
          foe,
          days: 60,
        });
        break;
      }
      case "outlaws": {
        const t = near[rng.int(0, Math.max(0, near.length - 1))] ?? p;
        const who = OUTLAWS[rng.int(0, OUTLAWS.length - 1)];
        const foe = rng.int(18, 60);
        make({
          target: t,
          title: `Hunt down ${who}`,
          text: `${who[0].toUpperCase()}${who.slice(1)} have been robbing and burning around ${name(t)}. Break them.`,
          pay: 12 + foe / 3,
          foe,
          days: 90,
        });
        break;
      }
      case "guard": {
        const t = rng.chance(0.5)
          ? p
          : (near[rng.int(0, Math.max(0, near.length - 1))] ?? p);
        const stay = 20 + rng.int(0, 30);
        make({
          target: t,
          title: `Guard the warehouses at ${name(t)}`,
          text: `Stand guard at ${name(t)} for ${stay} days while the goods are got in. Thieves have been bold.`,
          pay: stay * 0.45,
          foe: rng.int(8, 30),
          days: 120,
          stay,
        });
        break;
      }
      case "find": {
        const t = near[rng.int(0, Math.max(0, near.length - 1))] ?? p;
        make({
          target: t,
          title: `Find a runaway son`,
          text: `A merchant's son ran off with a dancing master and his mother's pearls. Last seen near ${name(t)}. Bring back the son (the pearls would be nice).`,
          pay: 10 + rng.int(0, 8),
          foe: 0,
          days: 90,
        });
        break;
      }
      case "explore": {
        const t = far[rng.int(0, Math.max(0, far.length - 1))];
        if (t === undefined) break;
        make({
          target: t,
          title: `Explore the country about ${name(t)}`,
          text: `Go and see what's at ${name(t)}: the rivers, the soil, and who lives there. Come back alive with a map.`,
          pay: 14 + rng.int(0, 12),
          foe: 0,
          days: 160,
        });
        break;
      }
      case "raid": {
        const enemies = ring(w, p, 1, 6).filter((q) => {
          const o = s.provinces[q].owner;
          return o >= 0 && o !== owner.id && atWar(s, owner.id, o);
        });
        if (!enemies.length) {
          const t = near[rng.int(0, Math.max(0, near.length - 1))] ?? p;
          const foe = rng.int(25, 70);
          make({
            target: t,
            title: `A punitive expedition`,
            text: `Raiders struck the farms above ${name(t)}. The governor wants them punished, and is paying.`,
            pay: 18 + foe / 3,
            foe,
            days: 120,
          });
          break;
        }
        const t = enemies[rng.int(0, enemies.length - 1)];
        const prv = s.provinces[t];
        const foe =
          30 + (prv.b.fort ?? 0) * 35 + Math.min(60, settlers(prv) / 80);
        make({
          target: t,
          title: `Raid ${name(t)}`,
          text: `We're at war with ${s.nations[prv.owner].name}. Burn their stores at ${name(t)} and come back.`,
          pay: 25 + foe / 3,
          foe,
          days: 150,
        });
        break;
      }
      case "bounty": {
        const t = near[rng.int(0, Math.max(0, near.length - 1))] ?? p;
        const foe = rng.int(10, 45);
        const what = [
          "highway robbery",
          "horse theft",
          "murder",
          "piracy",
          "coining",
        ][rng.int(0, 4)];
        make({
          target: t,
          title: `Reward: a rogue wanted for ${what}`,
          text: `A rogue wanted for ${what}, last seen about ${name(t)}. ${10 + Math.round(foe / 2)} coins brought in alive.`,
          pay: 10 + foe / 2,
          foe,
          days: 90,
        });
        break;
      }
    }
  }
  return out;
}

export function takeCheck(
  s: GameState,
  w: World,
  life: Life,
  c: Contract,
): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (life.crime?.jail) return no("Not from a cell.");
  if ((life.contracts ?? []).some((x) => x.id === c.id))
    return no("You've taken it.");
  if (
    (life.contracts ?? []).filter((x) => x.status === "taken").length >=
    MAX_CONTRACTS
  )
    return no(`You can hold ${MAX_CONTRACTS} contracts at once.`);
  if (
    c.kind === "bounty" &&
    life.job &&
    !["thieftaker", "watch"].includes(life.job.kind) &&
    strengthOf(s, life) < 20
  )
    return no(
      "Rewards go to thief-takers, or those strong enough to take a rogue (strength 20).",
    );
  return yes;
}

export function takeContract(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const s = g.s;
  const place = life.area;
  if (!place || life.travel) return "Go into a place first.";
  const offer = contractOffers(s, g.w, life.prov, place).find(
    (c) => c.id === id,
  );
  if (!offer) return "That's been taken, or never was.";
  const check = takeCheck(s, g.w, life, offer);
  if (!check.ok) return check.why;
  touchLife(g, life);
  life.contracts ??= [];
  const c: Contract = { ...offer, status: "taken" };
  if (c.kind === "bounty" || c.kind === "find") {
    const pr = s.provinces[c.target];
    const n = s.nations[pr.owner >= 0 ? pr.owner : s.provinces[c.from].owner];
    const who = makeCharacter(s, g.rng, {
      nation: n.id,
      culture: n.culture,
      religion: n.kind === "native" ? "native" : n.religion,
      female: c.kind === "bounty" ? g.rng.chance(0.15) : false,
      age: g.rng.int(18, 40),
    });
    who.home = c.target;
    g.touchChar(who);
    c.c = who.id;
    c.title =
      c.kind === "bounty"
        ? `${c.title.replace(/^Reward: a rogue/, `Reward: ${charName(who)},`)}`
        : `Find ${charName(who)}`;
  }
  life.contracts.push(c);
  if (life.contracts.length > 8)
    life.contracts.splice(0, life.contracts.length - 8);
  journal(
    g,
    life,
    `You take on a contract: ${c.title}. ${c.pay} coins, by ${dateText(g, c.due)}.`,
  );
  return null;
}

function dateText(g: ConquestGame, day: number): string {
  const left = day - g.s.day;
  return left > 60
    ? `${Math.round(left / 30)} months from now`
    : `${left} days from now`;
}

export function dropContract(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const c = (life.contracts ?? []).find(
    (x) => x.id === id && x.status === "taken",
  );
  if (!c) return "No such contract.";
  touchLife(g, life);
  c.status = "failed";
  addRenown(g, life, -1);
  const giver = g.s.chars[c.giver];
  if (giver?.alive) remembers(g, life, giver, "Broke a contract", -8, 2);
  journal(g, life, `You give up the contract: ${c.title}.`, "bad");
  return null;
}

// ---------------------------------------------------------------- seeing it through

function done(g: ConquestGame, life: Life, c: Contract, text: string): void {
  touchLife(g, life);
  c.status = "done";
  earn(g, life, c.pay);
  addRenown(g, life, 1 + Math.round(c.foe / 25));
  const giver = g.s.chars[c.giver];
  if (giver?.alive) remembers(g, life, giver, "Kept a hard bargain", 10, 3);
  for (const f of peopleOf(life))
    if (!f.task) {
      f.deeds = (f.deeds ?? 0) + 1;
      f.loyalty = Math.min(100, f.loyalty + 4);
    }
  journal(g, life, `${text} Paid ${c.pay} coins.`, "good");
  wake(g, life, `Contract done: ${c.title}.`);
}

function failed(g: ConquestGame, life: Life, c: Contract, text: string): void {
  touchLife(g, life);
  c.status = "failed";
  addRenown(g, life, -2);
  const giver = g.s.chars[c.giver];
  if (giver?.alive) remembers(g, life, giver, "Failed me", -8, 2);
  journal(g, life, text, "bad");
  wake(g, life, `Contract failed: ${c.title}.`);
}

/** Each day: arriving where the work is, guard days, deadlines. */
export function contractsDaily(g: ConquestGame, life: Life): void {
  const s = g.s;
  for (const c of life.contracts ?? []) {
    if (c.status !== "taken") continue;
    if (s.day > c.due) {
      failed(g, life, c, `Too late: the contract (${c.title}) has lapsed.`);
      continue;
    }
    if (life.travel || life.prov !== c.target || life.crime?.jail) continue;
    if (life.events.some((e) => e.key.startsWith("contract-"))) continue;
    switch (c.kind) {
      case "guard":
        touchLife(g, life);
        c.stay = (c.stay ?? 0) - 1;
        if (c.stay <= 0)
          done(g, life, c, "Your watch is over and nothing was lost.");
        else if (g.rng.chance(1 / 25))
          raiseEvent(g, life, "contract-fight", { i: c.id });
        break;
      case "explore":
        gainXp(g, life, "woodcraft", 15);
        done(
          g,
          life,
          c,
          `You've seen the country about ${g.map.provinces[c.target].name}, and mapped it.`,
        );
        break;
      case "escort":
        if (c.foe <= 0) done(g, life, c, "Delivered safe and sound.");
        else if ((c.stay ?? 0) <= s.day)
          raiseEvent(g, life, "contract-fight", { i: c.id });
        break;
      case "find":
        if ((c.stay ?? 0) <= s.day)
          raiseEvent(g, life, "contract-find", { i: c.id });
        break;
      default:
        if ((c.stay ?? 0) <= s.day)
          raiseEvent(g, life, "contract-fight", { i: c.id });
    }
  }
}

function contractOf(life: Life, ctx: LCtx): Contract | undefined {
  return (life.contracts ?? []).find((c) => c.id === ctx.i);
}

/** The odds of a fight, as a skill check the scene can show. */
function fightDc(g: ConquestGame, life: Life, ctx: LCtx): number {
  const c = contractOf(life, ctx);
  const mine = strengthOf(g.s, life);
  const p = mine / Math.max(1, mine + (c?.foe ?? 20));
  return skillLevel(g.s, life, "fighting") + Math.round((0.6 - p) / 0.07);
}

export const CONTRACT_EVENTS: LifeEventDef[] = [
  {
    key: "contract-fight",
    pool: "raised",
    cooldown: 0,
    scene: (g, life, ctx) => {
      const c = contractOf(life, ctx);
      return c?.kind === "raid"
        ? "battle"
        : c?.kind === "guard"
          ? "docks"
          : "woods";
    },
    title: (g, life, ctx) => contractOf(life, ctx)?.title ?? "A fight",
    body: (g, life, ctx) => {
      const c = contractOf(life, ctx);
      const mine = strengthOf(g.s, life);
      const where = g.map.provinces[life.prov].name;
      const with_ = peopleOf(life).filter((f) => !f.task).length;
      const co =
        life.company && life.company.army < 0
          ? ` and ${life.company.men} men of ${life.company.name}`
          : "";
      const what =
        c?.kind === "guard"
          ? `Shapes in the dark by the warehouses at ${where}: thieves, a good many of them.`
          : c?.kind === "escort"
            ? `Men step out across the road short of ${where}. They want what you're guarding.`
            : c?.kind === "raid"
              ? `The enemy's stores at ${where} lie before you, and so do their guards.`
              : c?.kind === "bounty"
                ? `You've run your rogue to ground at ${where}, and they're not alone.`
                : `You've found them, near ${where}.`;
      return `${what} Your strength: ${mine} (you${with_ ? `, ${with_} of your people` : ""}${co}); theirs: about ${c?.foe ?? "?"}.`;
    },
    choices: [
      {
        label: "Attack",
        tip: "Win: the pay, renown, and your people's respect. Lose: wounds, and some of your people may fall.",
        check: { skill: "fighting", dc: fightDc },
        apply: (g, life, ctx, pass) => {
          const c = contractOf(life, ctx);
          if (!c) return;
          gainXp(g, life, "fighting", 12);
          gainXp(g, life, "leadership", 8);
          if (pass) {
            if (c.kind === "raid") {
              const n = g.s.provinces[c.target].owner;
              if (n >= 0) addHeat(g, life, n, 20);
            }
            if (c.kind === "bounty" && c.c !== undefined && g.s.chars[c.c])
              g.char(c.c).abroad = true;
            done(
              g,
              life,
              c,
              c.kind === "bounty"
                ? "Taken alive, and handed to the constable."
                : "You carried it.",
            );
            if (g.rng.chance(0.3)) hurt(g, life, g.rng.int(3, 10), "a fight");
          } else {
            hurt(g, life, g.rng.int(10, 25), "a fight gone wrong");
            for (const f of [...peopleOf(life)])
              if (!f.task && g.rng.chance(0.2)) {
                const ch = g.s.chars[f.c];
                if (ch?.alive) {
                  life.people = peopleOf(life).filter((x) => x !== f);
                  journal(g, life, `${charName(ch)} fell beside you.`, "bad");
                  kill(g, ch, "killed in a fight");
                }
              }
            if (life.company && life.company.army < 0)
              life.company.men = Math.max(
                0,
                Math.round(life.company.men * 0.75),
              );
            failed(g, life, c, "Beaten, and lucky to get away.");
          }
        },
      },
      {
        label: "Parley",
        tip: "Talk them into going away (or paying up). Half the pay if it works.",
        check: { skill: "persuasion", dc: 8 },
        apply: (g, life, ctx, pass) => {
          const c = contractOf(life, ctx);
          if (!c) return;
          if (pass) {
            c.pay = Math.round(c.pay / 2);
            done(g, life, c, "Words did what swords might not.");
          } else {
            addStress(g, life, 5);
            touchLife(g, life);
            // A guard keeps counting the days; anyone else comes back to it.
            if (c.kind !== "guard") c.stay = g.s.day + 7;
            journal(
              g,
              life,
              "They laughed at you. You'll have to come back to it.",
              "bad",
            );
          }
        },
      },
      {
        label: "Withdraw",
        tip: "Live to fight another day. The contract is lost.",
        apply: (g, life, ctx) => {
          const c = contractOf(life, ctx);
          if (c) failed(g, life, c, "You pulled back. The contract is lost.");
        },
      },
    ],
  },
  {
    key: "contract-find",
    pool: "raised",
    cooldown: 0,
    scene: "tavern",
    title: (g, life, ctx) => contractOf(life, ctx)?.title ?? "Someone to find",
    body: (g, life, ctx) => {
      const c = contractOf(life, ctx);
      const who = c?.c !== undefined ? g.s.chars[c.c] : undefined;
      return `${who ? charName(who) : "Your quarry"} was seen hereabouts. Somebody knows where.`;
    },
    choices: [
      {
        label: "Ask in the taverns",
        tip: "Persuade someone to talk.",
        check: { skill: "persuasion", dc: 7 },
        apply: (g, life, ctx, pass) => findResult(g, life, ctx, pass),
      },
      {
        label: "Track them",
        tip: "Read the trail out of town.",
        check: { skill: "woodcraft", dc: 7 },
        apply: (g, life, ctx, pass) => findResult(g, life, ctx, pass),
      },
      {
        label: "Give it up",
        tip: "The contract is lost.",
        apply: (g, life, ctx) => {
          const c = contractOf(life, ctx);
          if (c) failed(g, life, c, "You give up the search.");
        },
      },
    ],
  },
];

function findResult(
  g: ConquestGame,
  life: Life,
  ctx: LCtx,
  pass: boolean,
): void {
  const c = contractOf(life, ctx);
  if (!c) return;
  if (pass) done(g, life, c, "Found, and brought home, sheepish.");
  else {
    touchLife(g, life);
    c.stay = g.s.day + 10;
    journal(g, life, "No luck yet. You'll try again in a few days.");
  }
}

// ---------------------------------------------------------------- commands

export function contractCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "contract") return undefined;
  if (c.act === "drop") return dropContract(g, life, c.id);
  if (c.act !== "take") return "Unknown.";
  beginOutcome(g, life);
  let err: string | null = null;
  try {
    outcomeMeta(g, life, {
      key: "contract-take",
      title: "A contract",
      scene: life.area ?? "tavern",
      c: -1,
      ok: null,
    });
    err = takeContract(g, life, c.id);
    const taken = (life.contracts ?? []).find((x) => x.id === c.id);
    if (!err && taken && taken.giver >= 0)
      outcomeMeta(g, life, { c: taken.giver });
  } finally {
    endOutcome(g, life, "act", err !== null);
  }
  return err;
}

/** Where contracts are offered. */
export const CONTRACT_PLACES: PlaceKind[] = [
  "tavern",
  "governor",
  "gaol",
  "councilfire",
];

export function offeredHere(
  s: GameState,
  w: World,
  life: Life,
  place: PlaceKind,
): Contract[] {
  if (!CONTRACT_PLACES.includes(place) || !hasPlace(s, w, life.prov, place))
    return [];
  return contractOffers(s, w, life.prov, place).filter(
    (c) => !(life.contracts ?? []).some((x) => x.id === c.id),
  );
}
