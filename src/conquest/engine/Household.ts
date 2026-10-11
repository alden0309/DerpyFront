// HOME (r12): the heart of a household. What you do at home: buy or rent a
// house (or lodge, until you do), add rooms and grounds, furnish it, keep
// servants, let it or take in lodgers, keep goods there, make it your home,
// and live in it: an evening with the family, time with your husband or
// wife, playing with the children, teaching them (what they learn goes
// with them, into an heir's skills), study, and rest. Each is a command
// ("home"), checked first so the page can say why not, and each makes a
// scene of what came of it.

import { homeHere } from "./Areas";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import {
  furnishCap,
  furnishCost,
  HOME_COOLDOWN,
  LEASE_RENT,
  LET_RENT,
  lodgerRoom,
  roomFor,
  ROOMS,
  servantRoom,
  SERVANTS,
  STORE_BASE,
  STORE_MORE,
  TEACH_AGES,
  TEACH_MAX,
} from "./HouseRules";
import {
  addStress,
  beginOutcome,
  endOutcome,
  gainXp,
  heal,
  journal,
  outcomeMeta,
  remembers,
  setCooldown,
  spend,
  touchLife,
} from "./LifeCore";
import {
  carried,
  Check,
  isChildLife,
  lifeIsNative,
  meOf,
  no,
  skillLevel,
  yes,
} from "./LifeQueries";
import { carryLimit } from "./LifeR11";
import { SKILL_NAMES } from "./LifeRules";
import {
  buyHouse,
  houseOf,
  leaseHouse,
  moveHousehold,
  propertyOf,
} from "./Property";
import { ageOf, charName } from "./Queries";
import type {
  Character,
  GameState,
  Good,
  HomeCommand,
  HomeRoomId,
  Life,
  LifeCommand,
  Property,
  ServantKind,
  Skill,
  WareId,
} from "./Types";
import { GOODS, SKILLS } from "./Types";
import { WARES } from "./Wares";

// ---------------------------------------------------------------- where you are

/** The house you're in now (owned or rented), if any. */
export function houseHere(life: Life): Property | undefined {
  return houseOf(life, life.prov);
}

/** The house you live in (at home), if any. */
export function homeHouse(life: Life): Property | undefined {
  return houseOf(life, life.home);
}

function settled(s: GameState, life: Life): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (life.travel) return no("You're on the road.");
  if (!homeHere(life, life.prov)) return no("You have no home here.");
  return yes;
}

function grown(s: GameState, life: Life): Check {
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  return yes;
}

function cooling(s: GameState, life: Life, key: string): Check {
  const left = Math.max(0, (life.cooldowns[key] ?? 0) - s.day);
  return left > 0 ? no(`Again in ${left} day${left === 1 ? "" : "s"}.`) : yes;
}

const all = (...checks: (() => Check)[]): Check => {
  for (const c of checks) {
    const r = c();
    if (!r.ok) return r;
  }
  return yes;
};

/** A house here you can build on (your own, not rented). */
function ownHouse(life: Life): Property | undefined {
  const h = houseHere(life);
  return h && !h.leased ? h : undefined;
}

// ---------------------------------------------------------------- the family at home

/** Your husband or wife, if living and at home with you. */
export function spouseAtHome(s: GameState, life: Life): Character | undefined {
  const me = meOf(s, life);
  const sp = me ? s.chars[me.spouse] : undefined;
  if (!sp?.alive || sp.abroad) return undefined;
  if (sp.home !== undefined && sp.home !== life.home) return undefined;
  return sp;
}

/** Your children living at home (under 16 by default). */
export function kidsAtHome(
  s: GameState,
  life: Life,
  maxAge = 15,
  minAge = 0,
): Character[] {
  const me = meOf(s, life);
  if (!me) return [];
  return me.children
    .map((id) => s.chars[id])
    .filter(
      (c): c is Character =>
        !!c?.alive &&
        !c.abroad &&
        (c.home === undefined || c.home === life.home) &&
        ageOf(s, c) <= maxAge &&
        ageOf(s, c) >= minAge,
    );
}

/** The skills you could teach a child: those you know well enough. */
export function teachable(s: GameState, life: Life, kid: Character): Skill[] {
  return SKILLS.filter((k) => {
    const mine = skillLevel(s, life, k);
    const got = kid.taught?.[k] ?? 0;
    return mine >= 4 && got < TEACH_MAX && mine >= got * 2 + 4;
  });
}

// ---------------------------------------------------------------- checks

/** Whether something can be done at home now, and if not, why. */
export function homeCheck(
  s: GameState,
  life: Life,
  c: Omit<HomeCommand, "k">,
): Check {
  const native = lifeIsNative(s, life);
  switch (c.act) {
    case "evening":
      return all(
        () => settled(s, life),
        () =>
          life.prov === life.home ? yes : no("Your family is at your home."),
        () => cooling(s, life, "home:evening"),
      );
    case "spouse": {
      return all(
        () => settled(s, life),
        () => grown(s, life),
        () =>
          spouseAtHome(s, life)
            ? life.prov === life.home
              ? yes
              : no("They're at your home.")
            : no("You have no husband or wife at home."),
        () => cooling(s, life, "home:spouse"),
      );
    }
    case "children":
      return all(
        () => settled(s, life),
        () => grown(s, life),
        () =>
          kidsAtHome(s, life, 13).length
            ? life.prov === life.home
              ? yes
              : no("They're at your home.")
            : no("No little ones at home."),
        () => cooling(s, life, "home:children"),
      );
    case "teach": {
      const kid = s.chars[c.c ?? -1];
      return all(
        () => settled(s, life),
        () => grown(s, life),
        () => (life.prov === life.home ? yes : no("They're at your home.")),
        () =>
          kid &&
          kidsAtHome(s, life, TEACH_AGES[1], TEACH_AGES[0]).some(
            (k) => k.id === kid.id,
          )
            ? yes
            : no(
                `Children from ${TEACH_AGES[0]} to ${TEACH_AGES[1]}, at home, can be taught.`,
              ),
        () => {
          if (!c.kind) return yes;
          const sk = c.kind as Skill;
          if (!SKILLS.includes(sk)) return no("No such skill.");
          if ((kid!.taught?.[sk] ?? 0) >= TEACH_MAX)
            return no(`${kid!.first} knows all you can teach of it.`);
          return teachable(s, life, kid!).includes(sk)
            ? yes
            : no("You don't know it well enough to teach it.");
        },
        () => cooling(s, life, `home:teach:${c.c}`),
      );
    }
    case "study":
      return all(
        () => settled(s, life),
        () =>
          !c.kind || SKILLS.includes(c.kind as Skill)
            ? yes
            : no("No such skill."),
        () => cooling(s, life, "home:study"),
      );
    case "rest":
      return all(
        () => settled(s, life),
        () => cooling(s, life, "home:rest"),
      );
    case "buy":
    case "lease":
      return no("Checked by the house rules.");
    case "move": {
      const h = houseHere(life);
      return all(
        () => settled(s, life),
        () => grown(s, life),
        () => (h ? yes : no("You have no house here.")),
        () => (life.home !== life.prov ? yes : no("You live here already.")),
      );
    }
    case "room": {
      const h = ownHouse(life);
      const id = c.kind as HomeRoomId;
      const r = ROOMS[id] ? roomFor(id, native) : null;
      return all(
        () => settled(s, life),
        () => grown(s, life),
        () =>
          h
            ? yes
            : houseHere(life)
              ? no("It isn't yours to build on: you rent it.")
              : no("You have no house here."),
        () => (r ? yes : no("Not your people's way.")),
        () =>
          (h!.rooms ?? []).includes(id) ? no("You have one already.") : yes,
        () =>
          h!.level >= ROOMS[id].minLevel
            ? yes
            : no(
                `Needs a bigger house (a ${houseWord(s, life, ROOMS[id].minLevel)}).`,
              ),
        () => (life.purse >= r!.cost ? yes : no(`Costs ${r!.cost} coins.`)),
      );
    }
    case "furnish": {
      const h = houseHere(life);
      const next = (h?.furnish ?? 0) + 1;
      const cost = furnishCost(next, native);
      return all(
        () => settled(s, life),
        () => grown(s, life),
        () => (h ? yes : no("You have no house here.")),
        () =>
          next <= furnishCap(h!.level)
            ? yes
            : next > 3
              ? no("As fine as furniture goes.")
              : no("A bigger house would hold finer things."),
        () => (life.purse >= cost ? yes : no(`Costs ${cost} coins.`)),
      );
    }
    case "servant": {
      const h = houseHere(life);
      const k = c.kind as ServantKind;
      return all(
        () => settled(s, life),
        () => grown(s, life),
        () =>
          native ? no("Your people share the work; nobody is kept.") : yes,
        () => (h ? yes : no("You have no house here.")),
        () => (SERVANTS[k] ? yes : no("No such servant.")),
        () =>
          (h!.servants ?? []).includes(k) ? no("You keep one already.") : yes,
        () =>
          (h!.servants ?? []).length < servantRoom(h!)
            ? yes
            : no(
                (h!.rooms ?? []).includes("quarters")
                  ? "No room for more."
                  : "No room for more: build servants' quarters.",
              ),
        () =>
          life.purse >= SERVANTS[k].wage * 2
            ? yes
            : no(`A month's wages in hand: ${SERVANTS[k].wage * 2} coins.`),
      );
    }
    case "dismiss": {
      const h = houseHere(life);
      return h && (h.servants ?? []).includes(c.kind as ServantKind)
        ? yes
        : no("No such servant here.");
    }
    case "let": {
      const h = propertyOf(life).find((x) => x.id === c.id);
      return all(
        () => grown(s, life),
        () => (h?.kind === "house" ? yes : no("No such house.")),
        () => (h!.leased ? no("You rent it yourself.") : yes),
        () => (h!.let ? no("It's let already.") : yes),
        () =>
          h!.prov === life.home
            ? no("You live there. Make another house your home first.")
            : yes,
        () =>
          Object.values(h!.store ?? {}).some((v) => (v ?? 0) > 0)
            ? no("Take out what you keep there first.")
            : yes,
        () => (native ? no("Not your people's way.") : yes),
      );
    }
    case "unlet": {
      const h = propertyOf(life).find((x) => x.id === c.id);
      return h?.let ? yes : no("It isn't let.");
    }
    case "lodger": {
      const h = ownHouse(life);
      return all(
        () => settled(s, life),
        () => grown(s, life),
        () => (native ? no("Not your people's way.") : yes),
        () => (h ? yes : no("You need a house of your own here.")),
        () =>
          (h!.lodgers ?? 0) < lodgerRoom(h!.level)
            ? yes
            : no("No room for another."),
      );
    }
    case "nolodger": {
      const h = houseHere(life);
      return (h?.lodgers ?? 0) > 0 ? yes : no("No lodgers.");
    }
    case "store":
    case "take": {
      const h = houseHere(life);
      const item = c.item ?? "";
      const qty = Math.max(1, Math.round(c.qty ?? 1));
      return all(
        () => settled(s, life),
        () => (h ? yes : no("You have no house here.")),
        () => (isItem(item) ? yes : no("No such goods.")),
        () => {
          if (c.act === "store") {
            if (heldOf(life, item) < qty) return no("You haven't that many.");
            if (storedLoads(h!) + qty > storeRoom(h!))
              return no(
                (h!.rooms ?? []).includes("store")
                  ? "No room left in the house."
                  : "No room left: a storehouse holds more.",
              );
            return yes;
          }
          if ((h!.store?.[item] ?? 0) < qty) return no("Not that many kept.");
          if (carried(life) + qty > carryLimit(s, life, life.prov))
            return no("You can't carry that much.");
          return yes;
        },
      );
    }
    default:
      return no("Unknown.");
  }
}

function houseWord(s: GameState, life: Life, level: number): string {
  const native = lifeIsNative(s, life);
  return (
    native
      ? ["wigwam", "lodge", "longhouse", "great longhouse"]
      : ["cottage", "house", "fine house", "mansion"]
  )[level - 1];
}

// ---------------------------------------------------------------- goods kept at home

function isItem(item: string): boolean {
  return GOODS.includes(item as Good) || isWare(item);
}

function isWare(item: string): boolean {
  return !GOODS.includes(item as Good) && item.length > 0 && item in WARE_SET;
}

const WARE_SET: Record<string, true> = Object.fromEntries(
  Object.keys(WARES).map((k) => [k, true]),
);

function heldOf(life: Life, item: string): number {
  return GOODS.includes(item as Good)
    ? (life.goods[item as Good] ?? 0)
    : (life.wares?.[item as WareId] ?? 0);
}

export function storedLoads(pr: Property): number {
  let n = 0;
  for (const v of Object.values(pr.store ?? {})) n += v ?? 0;
  return n;
}

export function storeRoom(pr: Property): number {
  return STORE_BASE + ((pr.rooms ?? []).includes("store") ? STORE_MORE : 0);
}

// ---------------------------------------------------------------- doing it

const EVENINGS = [
  "Supper, a story by the fire, and the children asleep at last. A good evening.",
  "You mend a chair while the household argues pleasantly about nothing.",
  "The little ones want the story about the bear again. You tell it better every time.",
  "A quiet evening at home. Nobody wants anything from you, which is the best of it.",
  "Music after supper: a fiddle, a song everyone knows, and one nobody does.",
];

const SPOUSE_TIMES = [
  "A walk by the water at dusk, the two of you, talking of nothing and everything.",
  "An evening by the fire with a bottle you'd been saving. You remember why you married.",
  "You read aloud; {they} laughs in the wrong places, on purpose.",
  "A day off from everything: the market, a long dinner, and home by moonlight.",
];

const PLAY = [
  "Hide and seek in the orchard; you're found first, every time.",
  "You carve a little boat, and the whole afternoon goes on sailing it.",
  "Leapfrog, a kite that won't fly, and a kite that does.",
  "A tale of pirates told with the fire-irons for cutlasses.",
];

function say(g: ConquestGame, life: Life, text: string, tone?: "good" | "bad") {
  journal(g, life, text, tone);
}

function doHome(g: ConquestGame, life: Life, c: HomeCommand): string | null {
  const s = g.s;
  const me = meOf(s, life)!;
  const native = lifeIsNative(s, life);
  const here = g.map.provinces[life.prov].name;
  switch (c.act) {
    case "buy":
      return buyHouse(g, life, c.arg);
    case "lease":
      return leaseHouse(g, life, c.arg ?? 1);
  }
  const check = homeCheck(s, life, c);
  if (!check.ok) return check.why;
  touchLife(g, life);
  const h = houseHere(life);
  switch (c.act) {
    case "evening": {
      setCooldown(g, life, "home:evening", HOME_COOLDOWN.evening);
      const f = h && !h.let ? (h.furnish ?? 0) : 0;
      addStress(g, life, -(8 + (f >= 2 ? 2 : 0)));
      const sp = spouseAtHome(s, life);
      if (sp) {
        remembers(g, life, g.char(sp.id), "Time together", 6, 1);
        outcomeMeta(g, life, { c: sp.id });
      }
      for (const k of kidsAtHome(s, life))
        remembers(g, life, g.char(k.id), "Played with me", 5, 1);
      say(g, life, g.rng.pick(EVENINGS)!, "good");
      return null;
    }
    case "spouse": {
      setCooldown(g, life, "home:spouse", HOME_COOLDOWN.spouse);
      const sp = spouseAtHome(s, life)!;
      outcomeMeta(g, life, { c: sp.id, ok: true });
      addStress(g, life, -6);
      remembers(g, life, g.char(sp.id), "Time together, the two of us", 10, 1);
      const they = sp.female ? "she" : "he";
      say(g, life, g.rng.pick(SPOUSE_TIMES)!.replace("{they}", they), "good");
      // Another player's husband or wife has the evening too.
      const other = s.lives.find((l) => l.c === sp.id && !l.watching);
      if (other) {
        addStress(g, other, -4);
        journal(
          g,
          other,
          `An evening with ${charName(me)}, just the two of you.`,
          "good",
        );
      }
      return null;
    }
    case "children": {
      setCooldown(g, life, "home:children", HOME_COOLDOWN.children);
      const kids = kidsAtHome(s, life, 13);
      addStress(g, life, -6);
      for (const k of kids)
        remembers(g, life, g.char(k.id), "Played with me", 6, 2);
      if (kids.length === 1) outcomeMeta(g, life, { c: kids[0].id });
      say(g, life, g.rng.pick(PLAY)!, "good");
      return null;
    }
    case "teach": {
      const kid = g.char(c.c!);
      const sk = (c.kind as Skill) ?? teachable(s, life, kid)[0];
      if (!sk) return "You don't know anything well enough to teach.";
      setCooldown(g, life, `home:teach:${kid.id}`, HOME_COOLDOWN.teach);
      const nursery = (h?.rooms ?? []).includes("nursery");
      const nurse = (h?.servants ?? []).includes("nurse");
      const mine = skillLevel(s, life, sk);
      const gain = 1 + (nursery && mine >= 8 ? 1 : 0);
      kid.taught = { ...(kid.taught ?? {}) };
      kid.taught[sk] = Math.min(TEACH_MAX, (kid.taught[sk] ?? 0) + gain);
      remembers(g, life, kid, "Taught me at home", 8, 3);
      gainXp(g, life, sk, 4);
      addStress(g, life, nursery || nurse ? -2 : 2);
      outcomeMeta(g, life, { c: kid.id, ok: true });
      say(
        g,
        life,
        `You teach ${kid.first} ${SKILL_NAMES[sk].toLowerCase()}: ${
          kid.taught[sk] >= TEACH_MAX
            ? `${kid.female ? "she" : "he"} has all you can give now.`
            : `${kid.female ? "she" : "he"} is getting the hang of it.`
        }`,
        "good",
      );
      return null;
    }
    case "study": {
      setCooldown(g, life, "home:study", HOME_COOLDOWN.study);
      const sk = (c.kind as Skill) ?? "letters";
      const room = (h?.rooms ?? []).includes("study");
      const xp = room ? 30 : h ? 15 : 10;
      gainXp(g, life, sk, xp);
      addStress(g, life, -1);
      say(
        g,
        life,
        room
          ? `An evening in your study over ${SKILL_NAMES[sk].toLowerCase()}, the door shut and the candles trimmed.`
          : `You study ${SKILL_NAMES[sk].toLowerCase()} by the fire, as the house goes to bed around you.`,
        "good",
      );
      return null;
    }
    case "rest": {
      setCooldown(g, life, "home:rest", HOME_COOLDOWN.rest);
      const cook = (h?.servants ?? []).includes("cook");
      const garden = (h?.rooms ?? []).includes("garden");
      const f = h ? (h.furnish ?? 0) : 0;
      const health = h ? 5 + (cook ? 3 : 0) + (f >= 2 ? 2 : 0) : 3;
      const stress = h ? 10 + (garden ? 3 : 0) : 6;
      heal(g, life, health);
      addStress(g, life, -stress);
      say(
        g,
        life,
        h
          ? `A week by your own fire${cook ? ", fed like a lord" : ""}${garden ? ", mornings in the garden" : ""}. Health and calm return.`
          : "A few quiet days in your lodgings. It isn't home, but it's a bed.",
        "good",
      );
      return null;
    }
    case "move":
      moveHousehold(g, life);
      outcomeMeta(g, life, { ok: true });
      return null;
    case "room": {
      const id = c.kind as HomeRoomId;
      const r = roomFor(id, native)!;
      spend(g, life, r.cost);
      h!.rooms = [...(h!.rooms ?? []), id];
      say(
        g,
        life,
        `${r.name} at your ${h!.name.toLowerCase()} in ${here}, for ${r.cost} coins.`,
        "good",
      );
      return null;
    }
    case "furnish": {
      const next = (h!.furnish ?? 0) + 1;
      const cost = furnishCost(next, native);
      spend(g, life, cost);
      h!.furnish = next;
      say(
        g,
        life,
        `Your ${h!.name.toLowerCase()} is ${native ? "furnished now: " : ""}${furnishName(next, native).toLowerCase()} (${cost} coins).`,
        "good",
      );
      return null;
    }
    case "servant": {
      const k = c.kind as ServantKind;
      h!.servants = [...(h!.servants ?? []), k];
      say(
        g,
        life,
        `${SERVANTS[k].name} comes into your service: ${SERVANTS[k].wage} coins a month.`,
        "good",
      );
      return null;
    }
    case "dismiss": {
      const k = c.kind as ServantKind;
      h!.servants = (h!.servants ?? []).filter((x) => x !== k);
      say(
        g,
        life,
        `You let ${SERVANTS[k].name.replace(/^A /, "your ").replace(/^An /, "your ")} go.`,
      );
      return null;
    }
    case "let": {
      const pr = propertyOf(life).find((x) => x.id === c.id)!;
      pr.let = { since: s.day, rent: LET_RENT[pr.level - 1] };
      pr.lodgers = 0;
      say(
        g,
        life,
        `Your ${pr.name.toLowerCase()} at ${g.map.provinces[pr.prov].name} is let: ${pr.let.rent} coins a month, and the tenant pays the rates.`,
        "good",
      );
      return null;
    }
    case "unlet": {
      const pr = propertyOf(life).find((x) => x.id === c.id)!;
      pr.let = null;
      say(
        g,
        life,
        `You give your tenant at the ${pr.name.toLowerCase()} notice. The house is yours to use again.`,
      );
      return null;
    }
    case "lodger": {
      h!.lodgers = (h!.lodgers ?? 0) + 1;
      say(
        g,
        life,
        "You take in a lodger: a clerk with a cough and a trunk of books. The rent will be welcome.",
      );
      return null;
    }
    case "nolodger": {
      h!.lodgers = Math.max(0, (h!.lodgers ?? 0) - 1);
      say(g, life, "Your lodger packs the trunk and goes.");
      return null;
    }
    case "store":
    case "take": {
      const item = c.item!;
      const qty = Math.max(1, Math.round(c.qty ?? 1));
      const sign = c.act === "store" ? 1 : -1;
      h!.store = { ...(h!.store ?? {}) };
      h!.store[item] = (h!.store[item] ?? 0) + sign * qty;
      if (!h!.store[item]) delete h!.store[item];
      if (GOODS.includes(item as Good)) {
        const g0 = item as Good;
        life.goods[g0] = (life.goods[g0] ?? 0) - sign * qty;
        if (!life.goods[g0]) delete life.goods[g0];
      } else {
        const w = item as WareId;
        life.wares = { ...(life.wares ?? {}) };
        life.wares[w] = (life.wares[w] ?? 0) - sign * qty;
        if (!life.wares[w]) delete life.wares[w];
      }
      say(
        g,
        life,
        c.act === "store"
          ? `You put ${qty} load${qty === 1 ? "" : "s"} away at home.`
          : `You take ${qty} load${qty === 1 ? "" : "s"} from the house.`,
      );
      return null;
    }
    default:
      return "Unknown.";
  }
}

export function furnishName(level: number, native: boolean): string {
  const names = native
    ? [
        "Bare",
        "Mats and robes",
        "Painted hides and fine mats",
        "Trade blankets, kettles and wampum",
      ]
    : ["Bare", "Plainly furnished", "Well furnished", "Handsomely furnished"];
  return names[level] ?? names[0];
}

/** The scene for something done at home: quiet ones need none. */
const QUIET = new Set([
  "store",
  "take",
  "dismiss",
  "unlet",
  "nolodger",
  "move",
  "let",
]);

const TITLES: Record<string, string> = {
  evening: "An evening with the family",
  spouse: "The two of you",
  children: "With the children",
  teach: "Lessons at home",
  study: "Study",
  rest: "Rest",
  room: "Building",
  furnish: "Furnishing",
  servant: "A new servant",
  lodger: "A lodger",
  buy: "A house of your own",
  lease: "A house to rent",
};

function homeCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "home") return undefined;
  if (QUIET.has(c.act)) return doHome(g, life, c);
  beginOutcome(g, life);
  let err: string | null = null;
  try {
    outcomeMeta(g, life, {
      key: `home-${c.act}`,
      title: TITLES[c.act] ?? "At home",
      scene: "home",
      c: -1,
      ok: null,
    });
    err = doHome(g, life, c);
  } finally {
    endOutcome(g, life, "act", err !== null);
  }
  return err;
}

hooks.command.push(homeCommand);

// ---------------------------------------------------------------- for the pages

/** The price of renting each house here a month. */
export function leaseRent(level: number): number {
  return LEASE_RENT[level - 1] ?? 0;
}

/** Everything you own that's a house, your home first. */
export function housesOf(life: Life): Property[] {
  return propertyOf(life)
    .filter((x) => x.kind === "house")
    .sort(
      (a, b) =>
        Number(b.prov === life.home) - Number(a.prov === life.home) ||
        a.id - b.id,
    );
}
