// EVENTS (r21): where things happen. Every event in the game says where it
// can come: at home or abroad; in a colonial town, a native town, open
// country, on the road or at sea; and in which of a place's places (the
// tavern, home, the docks, the church, the fields, the woods...). A drawn
// event comes only where it fits, so nobody on a Kalinago island hears the
// tavern's gossip or is called home to a sick child; and what happens in a
// place comes more readily while you're in it (go into the tavern, and the
// tavern's goings-on find you). A scene is set in a place that's really
// there.
//
// New events say where they happen with `where` on their definition
// (LifeEvents.ts); the events from before this round are tagged here, one by
// one, after reading each (WHERE below). Raised events (a matter at work, a
// letter, a duel, a trial) are raised by the game where they belong; they
// keep a tag too, which sets their scene.

import { areasOf, playerArea } from "./Areas";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import type { LifeEventDef } from "./LifeEvents";
import { meOf } from "./LifeQueries";
import { PLACES } from "./LifeRules";
import { settlers } from "./Queries";
import type {
  EventPool,
  GameState,
  Life,
  PlaceKind,
  PropertyKind,
} from "./Types";
import { worldRng } from "./WorldRng";

// ---------------------------------------------------------------- the words

/**
 * The kind of place a life is in: a colonial town (a power's, fifty settlers
 * or more: a tavern and a market), a native nation's town, open country, on
 * the road, at sea.
 */
export type Settle = "town" | "native" | "wild" | "road" | "sea";

/** Where an event can happen. Everything left out is "anywhere". */
export interface Where {
  /** Only in your home province ("home"), or only away from it ("abroad"). */
  reach?: "home" | "abroad";
  /** The kinds of place it fits (left out: anywhere on land). */
  in?: Settle[];
  /**
   * The places it happens in: one of them must be here (your home counts
   * only where you have one). The scene is set in the first one that is.
   */
  at?: PlaceKind[];
  /** Only while you're in one of `at` (what happens in the place itself). */
  inside?: boolean;
  /** Only where your work is (your trade's town, or with your regiment). */
  job?: boolean;
  /** Only in a province your own nation holds. */
  ours?: boolean;
  /** Only where you have one of these (your business, land, house, boat). */
  has?: (PropertyKind | "boat")[];
  /** Only where your household's bound people are (LABOUR r15). */
  bond?: boolean;
}

export const LAND: Settle[] = ["town", "native", "wild"];

const SETTLES = new Set<Settle>(["town", "native", "wild", "road", "sea"]);
const KINDS = new Set<string>(["house", "land", "business", "boat"]);

/**
 * A tag in a few words, for the table: "home", "abroad"; the kinds of place
 * ("town,native", "land" for all three on land, "settled" for town and
 * native); "@tavern,village" for the places; "inside", "job", "ours",
 * "bond"; "has:business,land".
 */
export function tag(spec: string): Where {
  const w: Where = {};
  for (const tok of spec.trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok === "home" || tok === "abroad") w.reach = tok;
    else if (tok === "inside") w.inside = true;
    else if (tok === "job") w.job = true;
    else if (tok === "ours") w.ours = true;
    else if (tok === "bond") w.bond = true;
    else if (tok.startsWith("@")) {
      const at = tok.slice(1).split(",") as PlaceKind[];
      for (const p of at)
        if (!(p in PLACES)) throw new Error(`EventPlaces: no place "${p}"`);
      w.at = at;
    } else if (tok.startsWith("has:")) {
      const has = tok.slice(4).split(",");
      for (const k of has)
        if (!KINDS.has(k)) throw new Error(`EventPlaces: can't have "${k}"`);
      w.has = has as Where["has"];
    } else {
      const out: Settle[] = [];
      for (const k of tok.split(",")) {
        if (k === "land") out.push("town", "native", "wild");
        else if (k === "settled") out.push("town", "native");
        else if (SETTLES.has(k as Settle)) out.push(k as Settle);
        else throw new Error(`EventPlaces: unknown word "${k}" in "${spec}"`);
      }
      w.in = [...new Set(out)];
    }
  }
  return w;
}

// ---------------------------------------------------------------- the table

/**
 * The events from before this round, each read and tagged. The daily draw
 * (things that happen to a settled life), then the road and the sea. A
 * trade's matters, the den's jobs and the law's rounds are raised at work
 * and tagged by rule (below), as are letters and the other raised scenes.
 */
export const WHERE: Record<string, string> = {
  // ------------------------------------------------ body and mind
  fever: "settled", // "Half the street has it"
  smallpox: "settled", // "The speckled monster is in Jamestown"
  breakdown: "land",
  "old-age": "land",
  gout: "land",
  "drunk-reform": "town", // a hayloft, a temperance preacher in town
  "prime-forty": "land", // a look in the glass
  "age-rheum": "settled",
  "age-spectacles": "town @market", // a peddler's tray
  // ------------------------------------------------ hearth and family
  admirer: "settled", // passing your door
  "spouse-quarrel": "home @home",
  "child-sick": "home @home",
  "child-trade": "home @home",
  "child-match": "home @church,village,home", // the match's family come calling
  "spouse-surprise": "home @home",
  "child-apprentice": "home @home",
  "lover-scandal": "home @home", // your wife has heard something
  "house-relatives": "has:house @home",
  "kin-anniversary": "home @home",
  "kin-first-steps": "home @home",
  "kin-question": "home @home",
  "kin-black-eye": "home @home",
  "kin-suitor": "home @home",
  "kin-in-laws": "home @home",
  "kin-cousin-money": "land", // a letter from a cousin
  "kin-ague": "home @home",
  "kin-bible": "home @home", // clearing out the chest
  "kin-brother": "home @home", // at the door
  "kin-grandchild": "home @home",
  "kin-sampler": "home @home",
  "kin-naming": "home native @village",
  "kin-grandmother": "home native @village,councilfire",
  "age-memoirs": "town", // the printer asks
  "age-will": "home @home", // the attorney at your table
  legacy: "land", // a letter from a lawyer in the old country
  "gambling-debt": "home @home", // waiting on your step
  "season-hungry": "home @home", // the root cellar
  "role-almsgiving": "home @home", // beggars at your gate
  "role-hard-times": "home @home",
  "role-holiday": "home @tavern,home", // your people ask for a day off
  "role-war-billet": "home has:house @home",
  "wthr-thunder": "home has:house @home",
  "wthr-first-snow": "home settled",
  "wthr-flood": "home settled", // the river in the lower street
  "home-roof": "home has:house @home",
  fire: "home settled @home", // sparks onto your roof
  "youth-stray": "home @home",
  // ------------------------------------------------ friends, rivals, love
  "rival-insult": "home @tavern,village", // people laugh when you come in
  "friend-loan": "home @tavern,village,home", // comes to you grey-faced
  "friend-debt": "home @tavern,village,home",
  "friend-visit": "home @home",
  "mentor-lesson": "home",
  "rival-challenge": "land", // the rival lives here (its own rule)
  "nemesis-plot": "home town @market", // behind you since the market
  "sweetheart-asks": "home @church,village",
  "patron-notice": "settled", // invited to dine by someone here
  "movement-recruiter": "land",
  "young-old-hand": "settled",
  "young-second": "town", // a friend who lives here
  "role-admirer": "settled", // following you about the town
  // ------------------------------------------------ the town
  portrait: "town", // a limner has come to town
  "lost-purse": "town @market", // by the market cross
  "fortune-teller": "town @market",
  lottery: "town @tavern", // tickets on sale here
  "dancing-master": "town",
  "electric-show": "town", // the court house hired
  "coffee-house": "town @tavern",
  "preacher-witch": "town @church",
  revival: "town @church",
  whitefield: "town @church",
  almanac: "town @market",
  zenger: "town @tavern",
  "town-fire-bell": "town @market",
  "town-found-purse": "town @market",
  "town-subscription": "home town @tavern", // the town's own paper going round
  "town-slander": "home town @tavern",
  "town-stocks": "town @market",
  "town-punch": "home town ours @tavern", // a freeholder's vote
  "town-tooth": "town @market",
  "town-ballad": "town ours @market",
  "town-runaway": "town @market",
  "town-vendue": "town @market",
  "town-watch-turn": "home town ours @market", // every householder's turn
  "town-hog-reeve": "home town ours @church", // the town meeting elects you
  "town-short-weight": "town @market",
  "town-orrery": "town @tavern",
  "church-pew": "home town @church", // your own pew
  "twelfth-night": "town @tavern",
  "harvest-home": "town @fields",
  "front-land-jobber": "town @tavern",
  "age-advice": "town @tavern",
  "young-assembly": "town @tavern",
  "young-wager": "town @tavern",
  "young-first-wages": "town @market",
  "youth-dare": "town",
  "youth-hornbook": "town @church",
  "youth-apples": "town @fields",
  "youth-punch": "town @market",
  "youth-fishing": "settled",
  "wthr-skating": "town", // the millpond, half the town on it
  "wthr-dog-days": "settled",
  "wthr-indian-summer": "land @woods",
  "wthr-mosquitoes": "land",
  "season-thaw": "settled", // the river in the lower streets
  // ------------------------------------------------ the tavern, the market, the docks (in them)
  "tavern-sharper": "town @tavern inside",
  "tavern-recruiter": "town @tavern inside",
  "market-thief": "town @market inside",
  "docks-pressgang": "town @docks inside",
  "governor-ball": "town @governor", // an invitation to the capital's ball
  // ------------------------------------------------ the port
  "port-news": "settled @docks",
  "port-parrot": "settled @docks",
  "port-wreckage": "settled @docks",
  "port-yellow-flag": "town @docks",
  "port-letter-home": "town @docks",
  acadians: "town @docks",
  blackbeard: "town @docks",
  // ------------------------------------------------ the colony and the times
  comet: "land",
  eclipse: "land",
  hurricane: "settled", // the sea in the streets
  earthquake: "town", // chimneys down all over town
  "great-snow": "settled",
  "stamp-act": "town ours", // the effigy on the common
  "tea-party": "town ours @docks",
  "war-news": "town ours", // the recruiting party is here
  "patriot-or-loyal": "town ours", // a toast at dinner
  "braddock-wagons": "home ours", // the postmaster's handbills
  "wolf-bounty": "town ours", // the selectmen pay
  tithingman: "home town @church", // the town meeting makes you one
  // ------------------------------------------------ your station
  "role-petitioner": "home @governor,home",
  "role-office-gift": "home @governor,home",
  "role-tenant": "has:land,house @fields,home",
  "role-careen": "has:boat @docks",
  "role-rival-shop": "has:business town @market",
  "role-horse-race": "town @fields",
  "business-thief": "has:business",
  "business-order": "has:business",
  "land-squatters": "has:land @fields",
  // ------------------------------------------------ the frontier
  "front-cabin": "town,wild", // settlers raise a roof, not on a native island
  "front-panther": "home land @woods", // your springhouse
  "front-rumour": "town,wild",
  "front-neighbours": "home town,wild @woods", // your clearing
  "front-salt-lick": "land @woods",
  // ------------------------------------------------ the peoples
  vision: "land", // a dream comes anywhere
  "green-corn": "native @village",
  "trade-rum": "native @village",
  missionary: "home native @village",
  "ball-game": "home native @village,fields",
  "hunter-white-deer": "native,wild @woods",
  condolence: "native @councilfire,village",
  "mourning-war": "home native @councilfire",
  midwinter: "native @village",
  "maple-sugar": "native @woods",
  strawberry: "native @village",
  "land-deed": "home native @councilfire",
  "black-robe": "home native @village",
  "nat-name-earned": "home native @councilfire",
  "nat-stories": "home native @village",
  "nat-dream": "home native @village",
  "nat-adoptee": "home native @village",
  "nat-weights": "native @market,village",
  "nat-plum-stones": "native @village",
  "nat-rum": "home native @village",
  "nat-giveaway": "home native @village",
  "nat-clan-mother": "home native @councilfire",
  "nat-children-games": "native @village",
  // ------------------------------------------------ at work (drawn): only where you work
  "farm-drought": "job @fields",
  "farm-bumper": "job @fields",
  "farm-fence": "job @fields",
  "farm-hogs": "job @fields",
  "farm-price": "job @fields",
  "mill-accident": "job @workshop,village",
  "master-offer": "job @workshop",
  "mill-wages": "job @workshop",
  "craft-commission": "job @workshop,village",
  "press-scandal": "job @press",
  "press-kite": "job @press",
  "press-retraction": "job @press",
  "soldier-bully": "job @fort",
  "soldier-pay": "job @fort,councilfire",
  "soldier-orders": "land", // on campaign, wherever the army is
  "camp-fever": "land",
  "soldier-deserter": "job @fort,councilfire",
  "soldier-inspection": "job @fort",
  "sailor-smuggle": "job @docks",
  "merchant-venture": "job @market,docks,tavern",
  "preacher-sermon": "job @church",
  "preacher-dancing": "job @church",
  "physician-patient": "job @apothecary,village",
  "physician-inoculation": "job @apothecary,village",
  "official-bribe": "job @governor",
  "clerk-ledger": "job @market,governor",
  "law-case": "job @governor",
  "trapper-bear": "job @woods",
  "trapper-poachers": "job @woods",
  "warrior-raid": "job @councilfire,village",
  "warrior-captive": "job @village",
  "trader-rivals": "job @village,market",
  "speaker-wampum": "job @councilfire",
  "treaty-council": "job @councilfire",
  "servant-master": "job @fields",
  "servant-bolt": "job @fields",
  "tavern-brawl": "job @tavern",
  "innkeeper-guest": "job @tavern",
  // ------------------------------------------------ bondage (LABOUR r15): where those you hold are
  "bond-woolman": "bond @home", // a night under your roof
  "bond-germantown": "bond @church",
  "bond-awakening": "land", // a minister writes
  "bond-neighbour": "bond @market",
  "bond-pass": "bond @fields",
  "bond-fire": "bond @home",
  "bond-market": "bond town @market",
  "bond-captives": "bond town @market",
  "bond-panic": "bond town @tavern",
  "bond-somerset": "land", // the papers
  "bond-dunmore": "bond",
};

/** The road's events (the pool decides: only while on the road). */
export const ROAD_KEYS = [
  "road-bandits",
  "road-river",
  "road-stranger",
  "road-hunters",
  "road-lost",
  "road-wolves",
  "road-deserters",
  "road-peddler",
  "road-fever-village",
  "trv-swamp-fever",
  "trv-gator",
  "trv-rattlesnake",
  "trv-tropic-rains",
  "trv-snow-pass",
  "trv-blizzard",
  "trv-rockslide",
  "trv-mountain-fog",
  "trv-ford-spate",
  "trv-ferryman",
  "trv-native-welcome",
  "trv-native-toll",
  "trv-condolence",
  "trv-native-shortcut",
  "trv-spanish-patrol",
  "trv-mission",
  "trv-maroons",
  "trv-coureurs",
  "trv-bison",
  "trv-prairie-fire",
  "trv-bear",
  "trv-thirst",
  "trv-enemy-patrol",
  "trv-refugees",
  "trv-coach-wreck",
  "trv-ordinary",
  "trv-tollgate",
  "trv-post-rider",
  "trv-smallpox-town",
  "trv-lost-child",
  "trv-field-preacher",
  "trv-surveyors",
  "trv-mud",
  "trv-ice-crossing",
  "trv-frostbite",
  "trv-harvest-hands",
  "way-bedfellow",
  "way-tinker",
  "way-wagon-mired",
  "way-meeting-house",
  "way-strangers-fire",
];

/** The sea's events (only at sea). */
export const SEA_KEYS = [
  "sea-storm",
  "sea-privateer",
  "sea-cards",
  "sailor-mutiny",
  "sailor-whale",
  "trv-hurricane",
  "trv-gale",
  "trv-fog-banks",
  "trv-ice",
  "trv-becalmed",
  "trv-pirates",
  "trv-guarda-costa",
  "trv-press-gang",
  "trv-man-overboard",
  "trv-scurvy",
  "trv-wreck",
  "trv-smugglers-lights",
  "trv-st-elmo",
  "trv-dolphins",
  "voy-flying-fish",
  "voy-serpent",
  "voy-stowaway",
  "voy-ship-cat",
];

/** Raised scenes, by the word their key begins with: where they're set. */
const RAISED_RULES: [RegExp, string][] = [
  // A trade's matters, the den's jobs and the law's rounds: at your work.
  [/^(work|rogue|law)-/, "job"],
  [/^crime-/, ""],
  // Letters find you anywhere.
  [/^(letter|loan|leave|edu|boss|europe|chair-peace|sea-sub)-/, ""],
  // What another player really did (a proposal, a challenge, a berth).
  [/^p2p-/, ""],
  // A gathering's turns, where the gathering is.
  [/^gather-/, ""],
  [/^(trial|council|bill|session|chair|crown|found-government)-/, "@governor"],
  [/^press-/, "@press"],
  [/^dice-/, "town @tavern"],
  [/^cards-/, "town @tavern"],
  [/^(sea|intr|pa|affair|duel|rising|bond|bawdy|season|lead|contract)-/, ""],
];

// ---------------------------------------------------------------- looking a tag up

const PARSED = new Map<string, Where>();
for (const [k, v] of Object.entries(WHERE)) PARSED.set(k, tag(v));
for (const k of ROAD_KEYS) PARSED.set(k, { in: ["road"] });
for (const k of SEA_KEYS) PARSED.set(k, { in: ["sea"] });

/** Tags given on events' own definitions (`where`), by key. */
const OWN = new Map<string, Where>();
let ownFrom = -1;

/** The game's events (LifeEvents.ts sets it): their own tags are read from them. */
export const eventList: { fn?: () => readonly LifeEventDef[] } = {};

function own(key: string): Where | undefined {
  const list = eventList.fn?.();
  if (list && list.length !== ownFrom) {
    ownFrom = list.length;
    for (const d of list) if (d.where) OWN.set(d.key, d.where);
  }
  return OWN.get(key);
}

/** Whether an event has been tagged by hand (on its definition, or in the table). */
export function tagged(key: string): boolean {
  return !!own(key) || PARSED.has(key);
}

/** Where an event can happen: its own tag, the table's, or the rule for raised scenes. */
export function whereOf(
  key: string,
  pool: EventPool,
  def?: { where?: Where },
): Where {
  const mine = def?.where ?? own(key) ?? PARSED.get(key);
  if (mine) return mine;
  if (pool === "road") return { in: ["road"] };
  if (pool === "sea") return { in: ["sea"] };
  for (const [re, spec] of RAISED_RULES) if (re.test(key)) return tag(spec);
  return {};
}

// ---------------------------------------------------------------- where a life is

/** Everything about where a life is that a tag can ask. */
export interface Spot {
  home: boolean;
  settle: Settle;
  places: Set<PlaceKind>;
  /** The place they're in now (where they went in, or somewhere sensible). */
  area: PlaceKind | null;
  job: boolean;
  ours: boolean;
  has: Set<string>;
  bond: boolean;
}

/** The kind of place a province is. */
export function settleOf(s: GameState, p: number): Settle {
  const pr = s.provinces[p];
  const owner = pr && pr.owner >= 0 ? s.nations[pr.owner] : undefined;
  if (owner?.kind === "power" && settlers(pr) >= 50) return "town";
  if (owner?.kind === "native") return "native";
  return "wild";
}

const SPOTS = new WeakMap<Life, { day: number; key: string; spot: Spot }>();

/** Where a life is today (worked out once a day and place). */
export function spotOf(g: ConquestGame, life: Life): Spot {
  const s = g.s;
  const key = `${life.prov}:${life.area ?? ""}:${life.travel ? (life.travel.sea[0] ? "s" : "r") : ""}:${life.job?.prov ?? ""}`;
  const was = SPOTS.get(life);
  if (was && was.day === s.day && was.key === key) return was.spot;
  const p = life.prov;
  const places = new Set(areasOf(s, g.w, p, life));
  const me = meOf(s, life);
  const owner = s.provinces[p]?.owner ?? -1;
  const has = new Set<string>();
  for (const x of life.property ?? []) if (x.prov === p) has.add(x.kind);
  for (const b of life.boats ?? [])
    if (b.prov === p && !b.away) has.add("boat");
  const spot: Spot = {
    home: p === life.home,
    settle: life.travel
      ? life.travel.sea[0]
        ? "sea"
        : "road"
      : settleOf(s, p),
    places,
    area: life.travel ? null : playerArea(s, g.w, life, places),
    job:
      !!life.job &&
      (life.job.prov === p || (life.job.army ?? -1) >= 0) &&
      !life.travel,
    ours: !!me && owner >= 0 && owner === me.nation,
    has,
    bond: !!life.bondage && life.bondage.home === p,
  };
  SPOTS.set(life, { day: s.day, key, spot });
  return spot;
}

/** Whether an event fits where a life is (the rule a tag sets). */
export function fitsSpot(w: Where, at: Spot): boolean {
  if (w.reach === "home" && !at.home) return false;
  if (w.reach === "abroad" && at.home) return false;
  const kinds = w.in ?? LAND;
  if (!kinds.includes(at.settle)) return false;
  if (w.job && !at.job) return false;
  if (w.ours && !at.ours) return false;
  if (w.bond && !at.bond) return false;
  if (w.has && !w.has.some((k) => at.has.has(k))) return false;
  if (w.at) {
    if (!w.at.some((p) => at.places.has(p))) return false;
    if (w.inside && (!at.area || !w.at.includes(at.area))) return false;
  }
  return true;
}

/** Whether an event can happen to a life where it is now. */
export function fitsHere(
  g: ConquestGame,
  life: Life,
  key: string,
  pool: EventPool,
): boolean {
  if (pool === "raised") return true;
  return fitsSpot(whereOf(key, pool), spotOf(g, life));
}

/** What happens in a place comes this much more readily while you're in it. */
export const PLACE_BOOST = 3;

/** A drawn event's weight where you are: nothing where it doesn't fit, more in its own place. */
export function placeWeight(
  g: ConquestGame,
  life: Life,
  key: string,
  pool: EventPool,
  w: number,
): number {
  if (pool === "raised" || w <= 0) return w;
  const where = whereOf(key, pool);
  const at = spotOf(g, life);
  if (!fitsSpot(where, at)) return 0;
  if (where.at && at.area && where.at.includes(at.area)) return w * PLACE_BOOST;
  return w;
}

// ---------------------------------------------------------------- the scene

const PLACE_LIST = Object.keys(PLACES) as PlaceKind[];
const PLACE_KINDS = new Set<string>(PLACE_LIST);

/**
 * The scene an event is set in, made to fit: a place that isn't here (the
 * docks on an island without a port, home where you have none, a tavern in
 * a native town) gives way to the first of the event's places that is, or
 * where you are.
 */
export function fitScene(
  g: ConquestGame,
  life: Life,
  key: string,
  pool: EventPool,
  scene: string,
): string {
  if (!PLACE_KINDS.has(scene) || life.travel) return scene;
  const at = spotOf(g, life);
  if (at.places.has(scene as PlaceKind)) return scene;
  const w = whereOf(key, pool);
  const alt = w.at?.find((p) => at.places.has(p));
  return alt ?? at.area ?? scene;
}

// ---------------------------------------------------------------- going into a place

/** Days after something happens on going in somewhere before it can again. */
export const ENTER_REST = 30;
/** The chance something happens as you go in, when it can. */
export const ENTER_CHANCE = 0.2;

/** Drawn events that belong to a place (they list it), that could come here now. */
export function placeEventsAt(
  g: ConquestGame,
  life: Life,
  place: PlaceKind,
  list: readonly LifeEventDef[],
): { def: LifeEventDef; w: number }[] {
  const out: { def: LifeEventDef; w: number }[] = [];
  for (const def of list) {
    if (def.pool !== "any") continue;
    const w = whereOf(def.key, def.pool, def);
    if (!w.at?.includes(place)) continue;
    out.push({ def, w: def.weight ?? 1 });
  }
  return out;
}

hooks.eventWeight.push((g, life, key, pool, _ctx, w) =>
  placeWeight(g, life, key, pool, w),
);

const ENTERED = new WeakMap<Life, PlaceKind>();

hooks.gate.push((g, life, c) => {
  if (c.k === "enter" && life.area !== c.area) ENTERED.set(life, c.area);
  return null;
});

/** The draw on going in: set by LifeEvents (which owns the events and firing). */
export const enterDraw: {
  fn?: (g: ConquestGame, life: Life, place: PlaceKind) => void;
} = {};

hooks.afterCommand.push((g, life) => {
  const place = ENTERED.get(life);
  if (!place) return;
  ENTERED.delete(life);
  if (life.area !== place || life.travel || life.watching || life.c < 0) return;
  if ((life.cooldowns["pl:enter"] ?? 0) > g.s.day) return;
  const salt = 0x21e0000 + life.c * 31 + PLACE_LIST.indexOf(place);
  if (!worldRng(g.s, salt).chance(ENTER_CHANCE)) return;
  enterDraw.fn?.(g, life, place);
});
