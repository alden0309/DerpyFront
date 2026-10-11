// HOME (r12): the rules of a household. What rooms and grounds a house can
// have added (a parlour, a garden, a kitchen garden, a study, a nursery, a
// stable, a storehouse, servants' quarters), how it can be furnished, which
// servants can be kept and what each does, what a house lets for or rents
// at, the lodgings of those who have no house, and what all of it costs and
// gives a month. Pure data and arithmetic: Property.ts settles the months,
// Household.ts does the things.

import type { Explain } from "./Explain";
import { HOUSE_RATES, HOUSES, KIT, LODGES } from "./LifeRules";
import type { HomeRoomId, Lifestyle, Property, ServantKind } from "./Types";

// ---------------------------------------------------------------- rooms and grounds

export interface RoomDef {
  id: HomeRoomId;
  name: string;
  /** What it's called among the native peoples (null: not their way). */
  nativeName: string | null;
  cost: number;
  nativeCost: number;
  /** Coins a month to keep up. */
  upkeep: number;
  /** The house (1 cottage to 4 mansion) it needs. */
  minLevel: number;
  /** What it gives, in a line. */
  text: string;
  nativeText?: string;
}

export const ROOMS: Record<HomeRoomId, RoomDef> = {
  garden: {
    id: "garden",
    name: "A flower garden",
    nativeName: "A garden of healing plants",
    cost: 6,
    nativeCost: 2,
    upkeep: 0.05,
    minLevel: 1,
    text: "Roses, pinks and a bench under the pear tree: an easier mind every month.",
    nativeText:
      "Sweetgrass, sage and the plants the healers use: an easier mind every month.",
  },
  kitchen: {
    id: "kitchen",
    name: "A kitchen garden",
    nativeName: "A field of the three sisters",
    cost: 5,
    nativeCost: 1.5,
    upkeep: 0,
    minLevel: 1,
    text: "Cabbages, beans, onions and a few hens: the table costs less, and you eat better.",
    nativeText:
      "Corn, beans and squash planted together: the kettle costs less, and you eat better.",
  },
  store: {
    id: "store",
    name: "A storehouse",
    nativeName: "Storage pits",
    cost: 8,
    nativeCost: 2,
    upkeep: 0.05,
    minLevel: 1,
    text: "A dry cellar and a loft: room to keep 30 more loads of goods at home.",
    nativeText:
      "Bark-lined pits for corn and furs: room to keep 30 more loads at home.",
  },
  stable: {
    id: "stable",
    name: "A stable",
    nativeName: null,
    cost: 10,
    nativeCost: 0,
    upkeep: 0.1,
    minLevel: 1,
    text: "Your own hay and a stall: a horse kept here costs half as much.",
  },
  parlour: {
    id: "parlour",
    name: "A parlour",
    nativeName: "A guest platform",
    cost: 15,
    nativeCost: 4,
    upkeep: 0.1,
    minLevel: 2,
    text: "A room for receiving: guests think better of a house with a parlour (gatherings go better), and the town notices.",
    nativeText:
      "A raised place for guests at your fire: gatherings go better, and the village notices.",
  },
  study: {
    id: "study",
    name: "A study",
    nativeName: "A quiet place apart",
    cost: 18,
    nativeCost: 4,
    upkeep: 0.1,
    minLevel: 2,
    text: "A desk, a shelf of books and a door that shuts: study at home goes twice as far.",
    nativeText:
      "A place to sit apart and think: what you study at home goes twice as far.",
  },
  nursery: {
    id: "nursery",
    name: "A nursery and schoolroom",
    nativeName: "A children's lodge",
    cost: 12,
    nativeCost: 3,
    upkeep: 0.05,
    minLevel: 2,
    text: "Slates, a hornbook and a rocking horse: teaching the children goes further, and costs you less patience.",
  },
  quarters: {
    id: "quarters",
    name: "Servants' quarters",
    nativeName: null,
    cost: 20,
    nativeCost: 0,
    upkeep: 0.1,
    minLevel: 2,
    text: "Rooms in the attic and over the kitchen: keep more than one servant.",
  },
};

export const ROOM_ORDER: HomeRoomId[] = [
  "garden",
  "kitchen",
  "store",
  "stable",
  "parlour",
  "study",
  "nursery",
  "quarters",
];

/** A room as your people know it, or null if it isn't their way. */
export function roomFor(
  id: HomeRoomId,
  native: boolean,
): { name: string; cost: number; text: string } | null {
  const r = ROOMS[id];
  if (!native) return { name: r.name, cost: r.cost, text: r.text };
  if (!r.nativeName) return null;
  return {
    name: r.nativeName,
    cost: r.nativeCost,
    text: r.nativeText ?? r.text,
  };
}

/** Kitchen garden: coins a month off the table. */
export const KITCHEN_SAVING = 0.4;
/** Loads a house keeps without a storehouse, and with one. */
export const STORE_BASE = 10;
export const STORE_MORE = 30;

// ---------------------------------------------------------------- furnishing

export interface FurnishDef {
  name: string;
  nativeName: string;
  /** What it costs to come up to this from the one below. */
  cost: number;
  stress: number;
  renown: number;
  text: string;
}

/** Bare (0) to handsomely furnished (3). Native costs are a third. */
export const FURNISH: FurnishDef[] = [
  {
    name: "Bare",
    nativeName: "Bare",
    cost: 0,
    stress: 0,
    renown: 0,
    text: "A bed, a chest and a stool.",
  },
  {
    name: "Plainly furnished",
    nativeName: "Mats and robes",
    cost: 4,
    stress: -1,
    renown: 0,
    text: "A deal table, rush chairs, a press for linen.",
  },
  {
    name: "Well furnished",
    nativeName: "Painted hides and fine mats",
    cost: 18,
    stress: -1,
    renown: 0.1,
    text: "Walnut chairs, a looking-glass, pewter on the dresser.",
  },
  {
    name: "Handsomely furnished",
    nativeName: "Trade blankets, kettles and wampum",
    cost: 55,
    stress: -2,
    renown: 0.3,
    text: "Mahogany, a clock, silver on the sideboard and paintings on the walls.",
  },
];

/** The best a house can be furnished: a cottage holds no mahogany. */
export function furnishCap(level: number): number {
  return Math.min(3, Math.max(1, level));
}

export function furnishCost(level: number, native: boolean): number {
  const c = FURNISH[level]?.cost ?? 0;
  return native ? Math.round(c * 0.35 * 10) / 10 : c;
}

// ---------------------------------------------------------------- servants

export interface ServantDef {
  kind: ServantKind;
  name: string;
  /** Coins a month. */
  wage: number;
  text: string;
}

export const SERVANTS: Record<ServantKind, ServantDef> = {
  maid: {
    kind: "maid",
    name: "A maid of all work",
    wage: 0.6,
    text: "Fires laid, floors scrubbed, the washing done: an easier mind every month.",
  },
  cook: {
    kind: "cook",
    name: "A cook",
    wage: 0.8,
    text: "Good dinners: better health every month, and gatherings at home go better.",
  },
  manservant: {
    kind: "manservant",
    name: "A manservant",
    wage: 1,
    text: "A man at the door in a good coat: a little renown every month.",
  },
  nurse: {
    kind: "nurse",
    name: "A nurse for the children",
    wage: 0.6,
    text: "The little ones minded: they think better of home, and you sleep at night.",
  },
  groom: {
    kind: "groom",
    name: "A groom",
    wage: 0.6,
    text: "Your horse fed, shod and walked: it costs half as much to keep.",
  },
  gardener: {
    kind: "gardener",
    name: "A gardener",
    wage: 0.5,
    text: "The garden and the kitchen garden give twice what they did.",
  },
};

export const SERVANT_ORDER: ServantKind[] = [
  "maid",
  "cook",
  "nurse",
  "gardener",
  "groom",
  "manservant",
];

/** How many servants a house can keep: one, or more with quarters. */
export function servantRoom(pr: Property): number {
  return (pr.rooms ?? []).includes("quarters") ? pr.level + 2 : 1;
}

// ---------------------------------------------------------------- letting, leasing, lodgers

/** What a house lets for a month (a tenant pays the rates). */
export const LET_RENT = [0.5, 1.4, 3.6, 8];
/** What renting a house costs a month (more than it lets for: the agent's cut). */
export const LEASE_RENT = [0.6, 1.7, 4.2, 9.5];
/** A lodger's rent a month, and how many a house can take (by level). */
export const LODGER_RENT = 0.4;
export function lodgerRoom(level: number): number {
  return Math.max(1, level);
}

// ---------------------------------------------------------------- lodgings (no house)

/** Where you lodge without a house of your own, by the way you live. */
export const LODGINGS: Record<Lifestyle, { colonist: string; native: string }> =
  {
    frugal: {
      colonist: "A straw pallet in a tavern garret, shared with a carter",
      native: "A corner of a kinsman's lodge",
    },
    modest: {
      colonist: "A room in a widow's house, with your dinner at her table",
      native: "A place at your clan's fire",
    },
    comfortable: {
      colonist: "Two rooms over a shop, and a girl who does for you",
      native: "A compartment of the longhouse of your own",
    },
    genteel: {
      colonist: "A set of rooms at the best inn in town",
      native: "Your own end of the longhouse, with room for guests",
    },
    grand: {
      colonist: "A whole house, rented furnished, with its servants",
      native: "A lodge kept for you and your guests",
    },
  };

/** The part of your living that goes on your lodging (for showing). */
export const LODGING_SHARE = 0.4;

// ---------------------------------------------------------------- family and study

/** Days between the things done at home. */
export const HOME_COOLDOWN = {
  evening: 7,
  spouse: 14,
  children: 10,
  teach: 30,
  study: 14,
  rest: 21,
};

/** Most a parent can teach a child in one skill. */
export const TEACH_MAX = 4;
/** Ages a child can be taught at home. */
export const TEACH_AGES: [number, number] = [5, 15];

// ---------------------------------------------------------------- what a house costs and gives

export function houseDefsOf(native: boolean) {
  return native ? LODGES : HOUSES;
}

/** What the rooms, furniture and hands of a house are worth at a sale. */
export function extrasWorth(pr: Property, native: boolean): number {
  let v = 0;
  for (const r of pr.rooms ?? []) v += roomFor(r, native)?.cost ?? 0;
  for (let l = 1; l <= (pr.furnish ?? 0); l++) v += furnishCost(l, native);
  return Math.round(v * 0.5 * 10) / 10;
}

/** Monthly coins of a house beyond its upkeep and rates: rooms, servants, rent, lodgers. */
export function houseCoins(
  e: Explain,
  pr: Property,
  o: { native: boolean; home: boolean; horse: boolean },
): void {
  const name = pr.name.toLowerCase();
  const rooms = pr.rooms ?? [];
  const roomUp = rooms.reduce((m, r) => m + ROOMS[r].upkeep, 0);
  if (roomUp) e.add(`Upkeep: rooms and grounds (${name})`, -roomUp);
  if (pr.leased) e.add(`Rent: the ${name} you rent`, -LEASE_RENT[pr.level - 1]);
  if (pr.let) e.add(`Rent from your tenant (${name})`, pr.let.rent);
  if (pr.lodgers) e.add(`Lodgers (${pr.lodgers})`, pr.lodgers * LODGER_RENT);
  const servants = pr.servants ?? [];
  if (servants.length)
    e.add(
      `Wages: ${servants.length} servant${servants.length === 1 ? "" : "s"}`,
      -servants.reduce((m, k) => m + SERVANTS[k].wage, 0),
    );
  if (!o.home || pr.let) return;
  if (rooms.includes("kitchen")) {
    const g = servants.includes("gardener") ? 2 : 1;
    e.add("Your kitchen garden feeds the table", KITCHEN_SAVING * g);
  }
  // A horse kept at home: a stable or a groom halves its keep.
  if (o.horse && (rooms.includes("stable") || servants.includes("groom")))
    e.add("Your own stable", KIT.horse.upkeep * 0.5);
}

/** What living in a house does for you each month, beyond the house itself. */
export function houseComforts(
  pr: Property,
  o: { native: boolean; kids: number },
): { stress: number; renown: number; health: number } {
  const rooms = pr.rooms ?? [];
  const servants = pr.servants ?? [];
  const f = FURNISH[pr.furnish ?? 0] ?? FURNISH[0];
  let stress = f.stress;
  let renown = f.renown;
  let health = 0;
  const gardener = servants.includes("gardener") ? 2 : 1;
  if (rooms.includes("garden")) stress -= gardener;
  if (rooms.includes("kitchen") && servants.includes("gardener")) health += 1;
  if (rooms.includes("parlour")) renown += 0.1;
  if (servants.includes("maid")) stress -= 1;
  if (servants.includes("cook")) health += 1;
  if (servants.includes("manservant")) renown += 0.15;
  if (servants.includes("nurse") && o.kids > 0) stress -= 1;
  if (pr.lodgers) stress += pr.lodgers;
  return {
    stress,
    renown: Math.round(renown * 100) / 100,
    health,
  };
}

/** Rates on a house a month (colonists' towns levy them; villages don't; a tenant pays them). */
export function ratesOn(pr: Property, native: boolean): number {
  if (native || pr.let || pr.leased) return 0;
  return HOUSE_RATES[pr.level - 1] ?? 0;
}

/** How a gathering at home starts: a parlour, good furniture and a cook help. */
export function homeWelcome(pr: Property | undefined): number {
  if (!pr || pr.let) return 0;
  return (
    ((pr.rooms ?? []).includes("parlour") ? 1 : 0) +
    ((pr.furnish ?? 0) >= 2 ? 1 : 0) +
    ((pr.servants ?? []).includes("cook") ? 1 : 0)
  );
}
