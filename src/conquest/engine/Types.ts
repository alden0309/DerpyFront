// Derpy Conquest: the shapes of the map, the game state, player commands
// and what the game reports back. The state is plain JSON so the server can
// save it, send it to players as-is, and players' browsers can run the same
// queries on their copy.

export type Terrain =
  | "plains"
  | "forest"
  | "hills"
  | "mountains"
  | "jungle"
  | "desert"
  | "marsh"
  | "tundra";

/** Everything the colonies make, eat, wear, ship and shoot. */
export type Good =
  | "grain"
  | "fish"
  | "furs"
  | "tobacco"
  | "sugar"
  | "timber"
  | "silver"
  | "tools"
  | "guns"
  | "cloth";

export const GOODS: readonly Good[] = [
  "grain",
  "fish",
  "furs",
  "tobacco",
  "sugar",
  "timber",
  "silver",
  "tools",
  "guns",
  "cloth",
];

/** Goods that come out of the land (a province's resource is one of these). */
export type RawGood =
  | "grain"
  | "fish"
  | "furs"
  | "tobacco"
  | "sugar"
  | "timber"
  | "silver";

/** The old map's goods, as written in americas.json. */
export type MapGood = RawGood | "cotton" | "cattle";

/** A neighbour: [province, km between them, crosses a river, across a strait]. */
export type Neighbour = [number, number, number, number];

export interface ProvinceDef {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Where the name and armies are drawn, in map units. */
  x: number;
  y: number;
  terrain: Terrain;
  good: MapGood;
  areaKm2: number;
  coastal: boolean;
  /** Who holds it at the start: a power or native nation key, or null. */
  owner: string | null;
  nb: Neighbour[];
  /** Coastal provinces reachable by sea: [province, km], nearest first. */
  sea: [number, number][];
  /** Off the board: drawn dark, never travelled to or held (WORLD r11: Alaska). */
  closed?: boolean;
}

export interface PowerDef {
  id: string;
  name: string;
  adjective: string;
  color: string;
  provinces: number[];
}

export interface NativeDef {
  id: string;
  name: string;
  color: string;
  horse: boolean;
  strong: boolean;
  provinces: number[];
}

export interface MapDef {
  version: number;
  width: number;
  height: number;
  /** The longest crossing an army can make by sea. */
  seaLaneKm: number;
  provinces: ProvinceDef[];
  powers: PowerDef[];
  natives: NativeDef[];
}

// ---------------------------------------------------------------- explaining

/** One cause of a number: "+3 Governor's stewardship". */
export interface Part {
  label: string;
  value: number;
  /** A multiplier (×1.2) rather than an amount added. */
  mul?: boolean;
}

/** A number together with everything that made it. */
export interface Breakdown {
  total: number;
  parts: Part[];
}

// ---------------------------------------------------------------- characters

export type Stat = "dip" | "mar" | "ste" | "int" | "lea";
export const STATS: readonly Stat[] = ["dip", "mar", "ste", "int", "lea"];
export type Stats = Record<Stat, number>;

export type TraitId =
  | "ambitious"
  | "content"
  | "honest"
  | "deceitful"
  | "brave"
  | "craven"
  | "greedy"
  | "generous"
  | "diligent"
  | "lazy"
  | "zealous"
  | "tolerant"
  | "just"
  | "cruel"
  | "robust"
  | "sickly"
  | "educated"
  | "charming"
  // Picked up in a life rather than chosen at birth.
  | "strong"
  | "shrewd"
  | "drunkard"
  | "scarred"
  | "famous"
  | "wounded"
  | "gouty";

export type Seat = "treasurer" | "marshal" | "envoy" | "spymaster" | "chaplain";
export const SEATS: readonly Seat[] = [
  "treasurer",
  "marshal",
  "envoy",
  "spymaster",
  "chaplain",
];

export type Ambition = "governorship" | "wealth" | "glory" | "faith" | "peace";

export type SchemeKind = "slander" | "embezzle" | "incite" | "murder";

export interface Scheme {
  kind: SchemeKind;
  /** Whose governor it's aimed at. */
  target: number;
  started: number;
  /** 0 to 100; it happens at 100. */
  progress: number;
  /** Found out: the governor knows, and can act. */
  exposed: boolean;
}

/** Something a character remembers about another, for or against. */
export interface Memory {
  /** Who it's about (character id), or -1 for the governor's office. */
  of: number;
  why: string;
  value: number;
  /** Day it's forgotten; 0 = never. */
  until: number;
}

export interface Character {
  id: number;
  first: string;
  family: string;
  /** Shown instead of a personal name (e.g. "the Mamanatowick"). */
  title: string | null;
  female: boolean;
  /** Day they were born (negative: before 1 January 1607). */
  born: number;
  nation: number;
  culture: string;
  religion: Religion;
  stats: Stats;
  traits: TraitId[];
  alive: boolean;
  died: { day: number; cause: string } | null;
  spouse: number;
  father: number;
  mother: number;
  children: number[];
  ambition: Ambition | null;
  scheme: Scheme | null;
  memories: Memory[];
  /** Days a marriage or birth last happened, to space them. */
  lastBirth: number;
  /** A governor the player made (not generated). */
  made: boolean;
  /** The likeness the player chose for them (index into the first portraits; unused since). */
  face?: number;
  /** Where they live, if not at their nation's capital (locals, families). */
  home?: number;
  /** What a local does for a living (the tavern keeper, the sergeant). */
  role?: RoleId;
  /** Gone to Europe for good: out of the Americas. */
  abroad?: boolean; /** How they look, if a player drew it or it came down their family (else generated). */
  look?: import("./Appearance").Appearance;
}

// ---------------------------------------------------------------- lives

/** What a played character is good at, 0 to 20, learned by doing. */
export type Skill =
  | "fighting"
  | "leadership"
  | "persuasion"
  | "trade"
  | "craft"
  | "farming"
  | "seamanship"
  | "woodcraft"
  | "letters"
  | "faith"
  | "medicine"
  | "stealth";

export const SKILLS: readonly Skill[] = [
  "fighting",
  "leadership",
  "persuasion",
  "trade",
  "craft",
  "farming",
  "seamanship",
  "woodcraft",
  "letters",
  "faith",
  "medicine",
  "stealth",
];

export type Skills = Record<Skill, number>;

/** Where in a province something can be done. */
export type PlaceKind =
  | "tavern"
  | "market"
  | "church"
  | "councilfire"
  | "docks"
  | "fort"
  | "workshop"
  | "press"
  | "fields"
  | "governor"
  | "village"
  | "woods"
  | "apothecary"
  /** Your own house, where your family is (only in your home province). */
  | "home"
  // LIFE (r11): the watch-house and gaol; the thieves' den (found, not seen).
  | "gaol"
  | "den";

/** A trade with a ladder to climb. */
export type JobKind =
  | "farmer"
  | "millhand"
  | "newsman"
  | "soldier"
  | "sailor"
  | "clerk"
  | "official"
  | "law"
  | "craftsman"
  | "trapper"
  | "servant"
  | "preacher"
  | "physician"
  | "innkeeper"
  | "hunter"
  | "warrior"
  | "grower"
  | "healer"
  | "trader"
  | "speaker"
  | "maker"
  // LIFE (r11): more trades, the law, arms, the wrong side of the law.
  | R11JobKind;

/** What the people of a place do, and so what they can offer you. */
export type RoleId =
  | "innkeeper"
  | "preacher"
  | "merchant"
  | "captain"
  | "sergeant"
  | "master"
  | "printer"
  | "planter"
  | "physician"
  | "official"
  | "lawyer"
  | "sachem"
  | "healer"
  | "hunter"
  | "elder"
  | "trader"
  | "maker"
  | "warleader"
  // Common folk, so the fort, the docks and the fields aren't empty.
  | "soldier"
  | "sailor"
  | "labourer"
  | "youngwarrior"
  // LIFE (r11): the high constable at the gaol; the fence at the den.
  | "constable"
  | "fence";

export type BackgroundId =
  | "farmer"
  | "millhand"
  | "newsman"
  | "soldier"
  | "sailor"
  | "clerk"
  | "craftsman"
  | "trapper"
  | "servant"
  | "preacher"
  | "physician"
  | "lawyer"
  | "gentry"
  | "hunter"
  | "warrior"
  | "grower"
  | "healer"
  | "trader"
  | "speaker"
  | "maker"
  // LIFE (r11): more ways to have been brought up.
  | R11BackgroundId;

export type Lifestyle =
  | "frugal"
  | "modest"
  | "comfortable"
  | "genteel"
  | "grand";

/** Things a character keeps that aren't property: a horse, good tools, a pew. */
export type KitKey = "tools" | "horse" | "carriage" | "pew";

/** Money put out to work: a cargo ventured on a ship, shares in a company. */
export interface Venture {
  id: number;
  kind: "cargo" | "shares";
  /** What was put in. */
  stake: number;
  /** What it's worth now (shares go up and down; a cargo is at sea). */
  value: number;
  /** Bought or sent. */
  day: number;
  /** A cargo comes home (or doesn't) on this day; shares: -1. */
  due: number;
  /** "Tobacco for London", "the South Sea Company". */
  name: string;
}

export interface Job {
  kind: JobKind;
  /** Rung on the ladder, 0 first. */
  rank: number;
  /** Where the post is. */
  prov: number;
  place: PlaceKind;
  /** Who took you on (a character), or -1. */
  employer: number;
  /** The nation served (soldiers, officials), or -1. */
  nation: number;
  /** The army a soldier marches with, or -1 (in garrison). */
  army: number;
  since: number;
  /** Months worked in this rank (promotion needs some). */
  months: number;
  /** Months away from the post in a row (two and you're let go). */
  away: number;
  /** Indentured servants: the day the indenture is served. */
  until?: number;
  /** Your own farm, shop, press, ship or trapline: nobody's hand but yours. */
  own?: boolean;
  /** Days worked at the post this month (wages are paid by them). */
  worked?: number;
  /** Days in a row away from the post (too many and you're let go). */
  awayDays?: number;
}

/** On the road (or at sea): the hops still to go, like an army's march. */
export interface Travel {
  dest: number;
  /** Provinces still ahead, next first. */
  path: number[];
  /** For each hop in `path`: by sea. */
  sea: boolean[];
  /** Day you left `prov` for path[0], and the day you reach it. */
  depart: number;
  arrive: number;
  /** The whole journey's cost, already paid. */
  cost: number;
  /** LIFE (r11): sailing in your own boat (its id); it stays where you land. */
  boat?: number;
}

export interface JournalEntry {
  day: number;
  text: string;
  tone?: "good" | "bad";
  /** The character it happened to (lives span generations). */
  c: number;
}

export type MilestoneKind =
  | "born"
  | "begin"
  | "job"
  | "promoted"
  | "married"
  | "child"
  | "moved"
  | "voyage"
  | "battle"
  | "wounded"
  | "renown"
  | "office"
  | "movement"
  | "rising"
  | "europe"
  | "died"
  | "heir"
  | "takeover"
  | "watching"
  | "end"
  // LIFE (r11): a conviction at the quarter sessions.
  | "convicted";

export interface LifeMilestone {
  day: number;
  kind: MilestoneKind;
  c: number;
  text: string;
  /** Where it happened. */
  p?: number;
}

/** Someone you owe, and by when. */
export interface Debt {
  to: number;
  amount: number;
  due: number;
}

/** An event in a life waiting for a choice. */
export interface LifeEventPending {
  id: number;
  key: string;
  day: number;
  title: string;
  body: string;
  choices: EventChoice[];
  ctx: Record<string, number>;
  /** Day it's decided for you (the first choice it can take). */
  expires: number;
  /** The backdrop for its scene (a place, "road", "deck", "battle"...). */
  scene?: string;
  /** The other character in it, or -1. */
  c?: number;
}

/** Totals over a whole line of characters, for the story and the coins. */
export interface LifeTally {
  /** Days lived as a played character, all generations together. */
  days: number;
  jobs: number;
  promotions: number;
  /** Highest rung reached on any ladder (0, 1, 2…). */
  topRank: number;
  /** Highest office: 0 none, 1 assembly or council fire, 2 council, 3 governor or sachem. */
  topOffice: number;
  peakRenown: number;
  peakPurse: number;
  earned: number;
  children: number;
  marriages: number;
  battles: number;
  battlesWon: number;
  wounds: number;
  events: number;
  generations: number;
  takeovers: number;
  provinces: number;
  risings: number;
  risingsWon: number;
  elections: number;
  /** Ambitions fulfilled. */
  ambitions?: number;
  /** Went to Europe, and why. */
  europe: EuropeWhy | null;
}

export type Tincture =
  | "or"
  | "argent"
  | "gules"
  | "azure"
  | "vert"
  | "sable"
  | "purpure"
  | "tenne";

export type Division =
  | "plain"
  | "pale"
  | "fess"
  | "bend"
  | "chevron"
  | "quarterly"
  | "saltire"
  | "cross"
  | "chief";

export type Charge =
  | "none"
  | "star"
  | "lion"
  | "fleur"
  | "anchor"
  | "tree"
  | "ship"
  | "key"
  | "crescent"
  | "heart"
  | "bird"
  | "wheat"
  | "tower"
  | "sword"
  | "beaver"
  | "turtle"
  | "wolf"
  | "bear"
  | "deer"
  | "feather";

/** A family's arms (or a native clan's sign). */
export interface Sigil {
  field: Tincture;
  division: Division;
  tincture: Tincture;
  charge: Charge;
  chargeTincture: Tincture;
}

export type Tie = "friend" | "rival" | "lover" | "mentor" | "nemesis";

/** What just happened, for the scene the browser shows: an act, an interaction, an event answered. */
export interface Outcome {
  /** Counts up, so a browser knows a new one has come. */
  n: number;
  kind: "act" | "person" | "event" | "proposal";
  key: string;
  title: string;
  /** The backdrop: a place kind or "road", "deck", "battle"... */
  scene: string;
  /** The other character in the scene, or -1. */
  c: number;
  /** It went your way (true), didn't (false), or there was no question (null). */
  ok: boolean | null;
  /** What it came to, as written in the journal. */
  lines: string[];
  /** What changed: "+3 renown", "−5 coins"... */
  fx?: string[];
  /** The choice made, when an event was answered. */
  choice?: string;
  day: number;
}

export type PropertyKind = "house" | "land" | "business";

/** Something a character owns: a house, land, or a business with hands. */
export interface Property {
  id: number;
  kind: PropertyKind;
  prov: number;
  /** Houses 1 (cottage) to 4 (mansion); land in lots of ten acres; businesses 1 to 3. */
  level: number;
  /** A business: the trade it's in, and where it's worked. */
  job?: JobKind;
  place?: PlaceKind;
  /** Hired hands (character ids). */
  hands: number[];
  since: number;
  name: string;
}

/** A goal a character has set themselves. */
export interface AmbitionState {
  key: string;
  since: number;
  /** What it's measured against (the rank, renown or purse when it was set). */
  base: number;
  /** A skill or other choice it's about, if any. */
  arg?: string;
}

export type EuropeWhy =
  | "fortune"
  | "parliament"
  | "army"
  | "recalled"
  | "exile";

/**
 * A player's life in the world: the character they play now, and everything
 * a character sheet holds. Kept per seat across heirs and takeovers, so the
 * line's journal and story run on.
 */
export interface Life {
  seat: string;
  /** The player's name. */
  name: string;
  /** The character played now, or -1 while watching. */
  c: number;
  /** Characters this seat has played, in order. */
  line: number[];
  /** Power or native nation key they began as. */
  origin: string;
  background: BackgroundId;
  /** The province they're in (or leaving, while travelling). */
  prov: number;
  /** Where they (and their family) live. */
  home: number;
  travel: Travel | null;
  job: Job | null;
  purse: number;
  health: number;
  stress: number;
  renown: number;
  /** Standing with the crown (or the elders): letters, service, gifts. */
  favor: number;
  skills: Skills;
  xp: Skills;
  lifestyle: Lifestyle;
  /** Goods carried to sell elsewhere. */
  goods: Partial<Record<Good, number>>;
  /** The child named heir, or -1 for the eldest. */
  heir: number;
  /** Leave a third of the purse to a surviving spouse. */
  shareWithSpouse: boolean;
  sigil: Sigil;
  /** The colour of the portrait's frame ribbon and dress. */
  frame: string;
  motto: string;
  /** A patron who speaks for you (a character), or -1. */
  patron: number;
  journal: JournalEntry[];
  milestones: LifeMilestone[];
  /** Pending events with choices. */
  events: LifeEventPending[];
  /** Day each event, action or person-action may happen again. */
  cooldowns: Record<string, number>;
  /** People met, most recent last. */
  met: number[];
  /** Friends, rivals and lovers of the character played now. */
  ties: Record<number, Tie>;
  debts: Debt[];
  /** Provinces visited, in the order first seen. */
  visited: number[];
  /** Where they were: a point at every arrival (for the story map). */
  trail: { day: number; p: number; c: number }[];
  /** Standing for the assembly: whose, and the points won campaigning. */
  campaign: { nation: number; points: number } | null;
  /** An invitation to Europe waiting for an answer. */
  invite: { why: EuropeWhy; until: number } | null;
  /** Watching the world: the line has ended, until a takeover or a new life. */
  watching: boolean;
  /** Why the last character's story ended, while watching. */
  ended: { day: number; why: string } | null;
  /** The game day this seat first played. */
  joined: number;
  tally: LifeTally;
  /** Where in the province they are (the tavern, the church, at home). */
  area?: PlaceKind;
  /** The last thing that happened, for the scene. */
  outcome?: Outcome | null;
  property?: Property[];
  /** Kept things, and the day each was got (tools wear out). */
  kit?: Partial<Record<KitKey, number>>;
  /** Money put out to work. */
  ventures?: Venture[];
  /** Months in a row lived beneath your station (people talk). */
  beneath?: number;
  ambition?: AmbitionState | null;
  /** Ambitions fulfilled, by key, in order. */
  ambitionsDone?: string[];
  /** WORLD r11: provinces this line knows (explored), sorted; visited ones count too. */
  known?: number[];
  /** WORLD r11: who held each known province when it was last seen (-1 open country). */
  seenOwner?: Record<number, number>;
  /** WORLD r11: leads heard of in the papers and the taverns. */
  leads?: LifeLead[];
  /** WORLD r11: culture goods carried to sell (they count against the loads you can carry). */
  wares?: Partial<Record<WareId, number>>;
  /** LIFE (r11): how your work runs itself. */
  work?: WorkState;
  /** LIFE (r11): your name with the law and the underworld. */
  crime?: CrimeState;
  /** LIFE (r11): people in your service. */
  people?: Follower[];
  /** LIFE (r11): a company of your own under arms. */
  company?: Company | null;
  /** LIFE (r11): contracts offered to you, and those you've taken. */
  contracts?: Contract[];
  /** LIFE (r11): boats you own, each where you left it. */
  boats?: Boat[];
  /** LIFE (r11): counts up whenever something needs you (it stops a skip ahead). */
  wake?: number;
  /** LIFE (r11): what last needed you. */
  wakeWhy?: string;
  /** SOCIETY (r11): tongues learned by the character played now (points, 100 a level). */
  tongues?: { c: number; pts: Record<TongueId, number> };
  /** SOCIETY (r11): letters written and received. */
  post?: Letter[];
  /** SOCIETY (r11): lovers outside a marriage. */
  affairs?: Affair[];
  /** SOCIETY (r11): other people's secrets you know. */
  secrets?: Secret[];
  /** SOCIETY (r11): a scandal people are talking about. */
  scandal?: { until: number; text: string } | null;
  /** SOCIETY (r11): a settlement being got up. */
  founding?: Founding | null;
  /** SOCIETY (r11): a nation waiting for you to set up its government. */
  constitute?: { n: number; until: number; free: boolean } | null;
}

/** A character a player designs before they begin (or drop into a world). */
export interface LifePlan {
  /** Power or native nation key. */
  origin: string;
  /** Province index to begin in, held by that nation. */
  home: number;
  first: string;
  family: string;
  female: boolean;
  /** 16 to 40. */
  age: number;
  religion: Religion;
  face: number;
  /** How they look (Appearance.ts); generated if absent. */
  look?: import("./Appearance").Appearance;
  sigil: Sigil;
  frame: string;
  motto: string;
  background: BackgroundId;
  /** Attributes: 5 each to start, points moved between them. */
  stats: Stats;
  /** Points bought on top of the background. */
  skills: Partial<Record<Skill, number>>;
  traits: TraitId[];
}

// ---------------------------------------------------------------- movements and politics

export type MovementGoal = "reform" | "overthrow" | "independence" | "expel";

export interface Movement {
  id: number;
  /** "bacon", "liberty"... or "own" for one a character founded. */
  key: string;
  name: string;
  goal: MovementGoal;
  /** The nation it means to change, or to drive out. */
  against: number;
  /** A native movement: the people it fights for (a nation index), or -1. */
  people: number;
  /** Where it has its followers. */
  region: number[];
  founded: number;
  /** Who leads it (a character), or -1. */
  leader: number;
  members: number[];
  /** How many ordinary people back it, 0 to 100. */
  support: number;
  /** Muskets and powder put by. */
  arms: number;
  status: "brewing" | "risen" | "won" | "crushed" | "faded";
  /** The rebel host while risen (a nation index), or -1. */
  rebels: number;
  rose: number;
  ended: number;
  /** A historical movement rises by itself around this day, or -1. */
  due: number;
  /** It fades if it hasn't risen by this day. */
  fades: number;
  text: string;
}

/** A colony's (or native nation's) government that players can join. */
export interface Polity {
  nation: number;
  /** "House of Burgesses", "the council fire". */
  name: string;
  /** Members of the assembly (character ids). */
  assembly: number[];
  seats: number;
  /** Day of the next election. */
  election: number;
  /** Standing at the next election: characters and their campaign points. */
  candidates: { c: number; points: number }[];
}

// ---------------------------------------------------------------- people

export type PopClass =
  | "laborers"
  | "artisans"
  | "merchants"
  | "gentry"
  | "clergy"
  | "tribe";

export const POP_CLASSES: readonly PopClass[] = [
  "laborers",
  "artisans",
  "merchants",
  "gentry",
  "clergy",
  "tribe",
];

export type Religion =
  | "anglican"
  | "puritan"
  | "catholic"
  | "reformed"
  | "lutheran"
  | "native";

export interface Pop {
  cls: PopClass;
  culture: string;
  religion: Religion;
  size: number;
  /** Savings in gold. */
  wealth: number;
  /** Share of needs met last month: [food, everyday, luxury], 0 to 1. */
  met: [number, number, number];
  /** Income last month, in gold. */
  income: number;
}

// ---------------------------------------------------------------- places

export type BuildingKind =
  | "farm"
  | "plantation"
  | "tradingpost"
  | "mine"
  | "lumbercamp"
  | "port"
  | "fort"
  | "smithy"
  | "gunsmith"
  | "weaver"
  | "church"
  | "courthouse";

/** A temporary effect from an event or decision. */
export interface Modifier {
  key: string;
  label: string;
  until: number;
  fx: Partial<Record<ModFx, number>>;
}

export type ModFx =
  | "unrest"
  | "production"
  | "tax"
  | "favor"
  | "colonists"
  | "admin"
  | "morale"
  | "growth"
  | "disease"
  | "opinion"
  | "autonomy";

export interface Province {
  /** Nation index, or -1 for open wilderness. */
  owner: number;
  /** A nation at war with the owner holding it, or -1. */
  occupier: number;
  pops: Pop[];
  /** Building levels. */
  b: Partial<Record<BuildingKind, number>>;
  build: { kind: BuildingKind; start: number; done: number } | null;
  /** A colony being founded: by whom, and the days it started and is done. */
  colony: { by: number; start: number; done: number } | null;
  recruits: { type: RegType; start: number; done: number }[];
  /** A siege under way: by whom, and how far along (0 to 100). */
  siege: { by: number; start: number; progress: number } | null;
  /** 0 to 100; revolt at 100. Set monthly from its causes. */
  unrest: number;
  /** War damage, 0 to 1; production is cut by it, and it heals. */
  devastation: number;
  /** Day it's fully part of its owner's realm; 0 if it is. */
  integrate: number;
  /** How worn out the fur grounds are, 0 to 1. */
  depletion: number;
  /** A palisade outpost someone built here (it may not own the land). */
  outpost: { by: number; since: number } | null;
  /** A rich seam, run or soil: +50% of its good. Found by exploring. */
  rich: boolean;
  /** What it made last month (for the economy view). */
  made: Partial<Record<Good, number>>;
  mods: Modifier[];
}

// ---------------------------------------------------------------- nations

export interface Market {
  /** Price of each good this month. */
  price: Record<Good, number>;
  /** In the warehouses, carried into next month. */
  stock: Record<Good, number>;
  /** Last month: made here, shipped in, and traded in from natives. */
  supply: Record<Good, number>;
  /** Last month: wanted by people, workshops and soldiers. */
  demand: Record<Good, number>;
  /** Last month, good by good: where it came from and where it went. */
  flow: GoodsFlow;
}

/** A month of goods: made here, used up (eaten, worn out, spoiled, built with), came in, went out. */
export interface GoodsFlow {
  made: Record<Good, number>;
  used: Record<Good, number>;
  /** Shipped in from Europe, traded in from natives or other nations. */
  came: Record<Good, number>;
  /** Shipped to Europe, traded away. */
  went: Record<Good, number>;
}

/** Ships crossing the Atlantic for one of the colonies. */
export interface Convoy {
  id: number;
  /** Port it sails from or back to. */
  port: number;
  /** Heading for Europe (true) or home to the colony (false). */
  out: boolean;
  departed: number;
  arrive: number;
  cargo: Partial<Record<Good, number>>;
  /** What the cargo cost in the colony (out) or in Europe (home). */
  paid: number;
  /** Outbound: what to buy in Europe for the trip home. */
  orders: Partial<Record<Good, number>>;
  /** Goods the governor bought in Europe (already paid for). */
  ordered?: boolean;
}

export interface LedgerLine {
  label: string;
  value: number;
}

export interface Ledger {
  income: LedgerLine[];
  spending: LedgerLine[];
  net: number;
}

export interface NationStats {
  coloniesFounded: number;
  battlesWon: number;
  battlesLost: number;
  provincesConquered: number;
  provincesLost: number;
  goldEarned: number;
  remitted: number;
  peakProvinces: number;
  peakPeople: number;
  landBought: number;
  /** Provinces held when the game began. */
  startProvinces: number;
}

export type TaxLevel = 0 | 1 | 2;

/** What the crown wants from a colony right now. */
export interface CrownDemand {
  key: "money" | "war" | "mission" | "levy";
  label: string;
  /** Gold, or a nation to fight, or a province for a mission. */
  amount: number;
  target: number;
  made: number;
  due: number;
}

export interface EventChoice {
  label: string;
  /** What it does, in words. */
  tip: string;
}

export interface PendingEvent {
  id: number;
  key: string;
  day: number;
  /** Day the council decides for you (the first choice) if you haven't. */
  expires: number;
  title: string;
  body: string;
  choices: EventChoice[];
  ctx: Record<string, number>;
}

/** A party sent into the wilds: to survey land, or to build an outpost. */
export interface Mission {
  id: number;
  kind: "explore" | "outpost";
  /** The character leading it. */
  leader: number;
  /** Where they set out from, and where they're going. */
  from: number;
  target: number;
  start: number;
  /** Day they reach the target, and the day they're home again. */
  arrive: number;
  home: number;
  /** Heading out, or on the way back. */
  stage: "out" | "back";
  /** Men in the party; hardship thins it, and at 0 it's lost. */
  men: number;
  /** Set when something on the way has already happened. */
  incident: boolean;
  /** The way there, province by province (from first, target last). */
  route: number[];
  /** For each hop of the route: by boat (true) or on foot. */
  sea: boolean[];
  /** Days each hop takes. */
  legs: number[];
}

/** One year's mark in a nation's history, for the end-of-game chart. */
export interface YearMark {
  year: number;
  provinces: number;
  settlers: number;
  gold: number;
  score: number;
}

/** Goods and gold changing hands between two nations. */
export interface TradeTerms {
  /** What the proposer hands over. */
  give: Partial<Record<Good, number>>;
  /** What the proposer gets. */
  get: Partial<Record<Good, number>>;
  /** Gold the proposer pays (negative: the other side pays). */
  gold: number;
}

export interface TradeOffer {
  id: number;
  from: number;
  to: number;
  day: number;
  terms: TradeTerms;
}

export type StartYear = 1607 | 1650 | 1700;

export type NationKind = "power" | "native" | "crown" | "rebels";

export interface Nation {
  id: number;
  key: string;
  /**
   * A crown only enters play to crush a colony's rebellion; rebels are a
   * movement's host under arms. Both have armies and no land of their own.
   */
  kind: NationKind;
  name: string;
  adjective: string;
  color: string;
  alive: boolean;
  /** Crowns: the colony they rule; rebels: the nation they rose against (-1 otherwise). */
  colony: number;
  /** Rebels: their movement's id. */
  movement?: number;
  /** The seat of the human playing it, or null for the computer. */
  player: string | null;
  playerName: string | null;
  culture: string;
  religion: Religion;
  /** Governor (powers) or chief (natives): a character id. */
  ruler: number;
  heir: number;
  council: Record<Seat, number>;
  /** Notables at court who could serve or scheme. */
  court: number[];
  gold: number;
  capital: number;
  horse: boolean;
  strong: boolean;

  // Powers.
  favor: number;
  autonomy: number;
  /** Share of income sent home to the crown, 0 to 0.5. */
  remit: number;
  independent: boolean;
  /** At war with its own crown for independence. */
  rebelling: boolean;
  rebellion: {
    since: number;
    /** Armies the crown has sent, and how many were beaten. */
    expeditions: number;
    beaten: number;
    /** Day the crown took the capital, or -1. */
    capitalLost: number;
  } | null;
  /** Royal honours: 0 none, 1 knight, 2 baronet, 3 baron, 4 earl. */
  title: number;
  tax: TaxLevel;
  /** Goods the governor won't let leave, or come in. */
  noExport: Good[];
  noImport: Good[];
  market: Market;
  convoys: Convoy[];
  /** Day the last convoy sailed for Europe. */
  lastConvoy: number;
  colonists: number;
  nextColonist: number;
  demand: CrownDemand | null;
  warExhaustion: number;

  /** How it feels about every other nation (memories, newest last). */
  relations: Record<number, Memory[]>;
  mods: Modifier[];
  events: PendingEvent[];
  /** Provinces this colony has surveyed (it knows what they yield). */
  explored: number[];
  /** Expeditions and outpost parties out in the wilds. */
  missions: Mission[];
  /** Natives: the colony they pay tribute to, or -1. */
  overlord: number;
  /** Laws a governor has passed (keys). */
  laws?: string[];
  /** SOCIETY (r11): a flag its founders made (else the crown's or the people's). */
  flag?: NationFlag;
  /** SOCIETY (r11): the form of government its founders chose. */
  gov?: GovForm;
  /** SOCIETY (r11): founded by a player's settlement or set up after a rising. */
  founded?: number;
  /** The big moments of its history, for the end of the game. */
  milestones: GameEvent[];
  /** How it stood on each 1 January. */
  yearly: YearMark[];
  /** Day each event key may fire again. */
  cooldowns: Record<string, number>;
  ledger: Ledger;
  stats: NationStats;
  /** Victory points, updated monthly. */
  score: number;
}

// ---------------------------------------------------------------- armies

export type RegType =
  | "militia"
  | "regulars"
  | "dragoons"
  | "artillery"
  | "warriors"
  | "riders";

export interface Regiment {
  type: RegType;
  men: number;
  /** 0 (broken) to 1 (fresh). */
  morale: number;
  /** The province the men were drafted from (they go home when disbanded). */
  home: number;
}

export interface Army {
  id: number;
  owner: number;
  /** Where it is, or where it's leaving from while on the move. */
  prov: number;
  regs: Regiment[];
  /** Provinces still to go to, next first. */
  path: number[];
  /** Day it left `prov` for path[0], or -1 when not moving. */
  depart: number;
  /** Day it reaches path[0]. */
  arrive: number;
  /** The current hop is by sea. */
  sea: boolean;
  /** Fleeing a lost battle: won't fight until it gets where it's going. */
  retreating: boolean;
  /** Day it arrived where it is (decides who defends in a battle). */
  arrived: number;
  /** Where it came from (-1 if raised here), for river crossings. */
  from: number;
  /** Leading it: a character, or -1. */
  commander: number;
  /** Food on hand, 0 (starving) to 1 (full wagons). */
  supply: number;
}

// ---------------------------------------------------------------- diplomacy

export interface War {
  a: number;
  b: number;
  /** Who declared it. */
  by: number;
  start: number;
  /** Why, in words ("Land encroachment", "War in Europe"). */
  why: string;
  /** Battles won and men lost by each side: [a's, b's]. */
  won: [number, number];
  lost: [number, number];
  /** Declared by the crowns in Europe. */
  europe: boolean;
}

export interface Truce {
  a: number;
  b: number;
  until: number;
}

export type TreatyKind = "trade" | "alliance" | "access";

export interface Treaty {
  kind: TreatyKind;
  a: number;
  b: number;
  since: number;
}

/** What a peace would settle: provinces each side hands over, and gold. */
export interface PeaceTerms {
  /** Provinces the receiver gives to the proposer. */
  take: number[];
  /** Provinces the proposer gives back to the receiver. */
  give: number[];
  /** Gold the receiver pays (negative: the proposer pays). */
  gold: number;
  /** A native receiver becomes the proposer's tributary. */
  subjugate?: boolean;
}

export interface PeaceOffer {
  id: number;
  from: number;
  to: number;
  day: number;
  terms: PeaceTerms;
}

export interface Marriage {
  a: number;
  b: number;
  day: number;
}

// ---------------------------------------------------------------- battles

export interface BattleFactor {
  label: string;
  /** Multiplier on that side's strength: 1.2 = +20%. */
  value: number;
}

export interface BattleSide {
  nations: number[];
  commander: string | null;
  regs: Partial<Record<RegType, number>>;
  men: number;
  lost: number;
  moraleEnd: number;
  factors: BattleFactor[];
  /** Fighting strength at the start: men × training × morale × factors. */
  power: number;
}

export interface BattleReport {
  id: number;
  day: number;
  prov: number;
  attacker: BattleSide;
  defender: BattleSide;
  /** Each day's fighting: what each side lost. */
  rounds: { lost: [number, number]; note: string | null }[];
  /** 0: the attacker won; 1: the defender held. */
  winner: 0 | 1;
  /** Luck with a name: the weather and commanders' moments. */
  luck: string[];
  outcome: "retreated" | "destroyed";
}

// ---------------------------------------------------------------- events

export type GameEvent =
  | { k: "colony"; day: number; n: number; p: number }
  | {
      k: "built";
      day: number;
      n: number;
      p: number;
      b: BuildingKind;
      lvl: number;
    }
  | { k: "raised"; day: number; n: number; p: number; t: RegType }
  | {
      k: "battle";
      day: number;
      id: number;
      p: number;
      a: number[];
      d: number[];
      w: 0 | 1;
    }
  | { k: "siege"; day: number; n: number; p: number; from: number }
  | { k: "occupied"; day: number; n: number; p: number; from: number }
  | { k: "freed"; day: number; n: number; p: number }
  | { k: "ceded"; day: number; n: number; p: number; from: number }
  | { k: "razed"; day: number; n: number; p: number; from: number }
  | { k: "war"; day: number; n: number; on: number; why: string }
  | { k: "peace"; day: number; n: number; with: number }
  | { k: "offer"; day: number; n: number; to: number }
  | { k: "refused"; day: number; n: number; by: number }
  | { k: "treaty"; day: number; n: number; with: number; t: TreatyKind }
  | { k: "untreaty"; day: number; n: number; with: number; t: TreatyKind }
  | {
      k: "bought";
      day: number;
      n: number;
      p: number;
      from: number;
      gold: number;
    }
  | { k: "gift"; day: number; n: number; to: number; gold: number }
  | { k: "fallen"; day: number; n: number; by: number }
  | { k: "colonists"; day: number; n: number; count: number }
  | { k: "convoy"; day: number; n: number; out: boolean; gold: number }
  | { k: "revolt"; day: number; n: number; p: number }
  | { k: "died"; day: number; n: number; c: number; cause: string }
  | { k: "born"; day: number; n: number; c: number }
  | { k: "married"; day: number; n: number; a: number; b: number }
  | { k: "succession"; day: number; n: number; c: number; how: string }
  | {
      k: "scheme";
      day: number;
      n: number;
      c: number;
      s: SchemeKind;
      done: boolean;
    }
  | { k: "story"; day: number; n: number; title: string; text: string }
  | { k: "crown"; day: number; n: number; text: string }
  | { k: "europe"; day: number; a: number; b: number; war: boolean }
  | { k: "independence"; day: number; n: number; won: boolean | null }
  | { k: "over"; day: number; winner: number }
  | {
      k: "mission";
      day: number;
      n: number;
      p: number;
      kind: "explore" | "outpost";
      /** "back" (home safe), "done" (arrived), "lost" (never came back). */
      result: "done" | "back" | "lost";
      c: number;
      text: string;
    }
  | {
      k: "deal";
      day: number;
      n: number;
      with: number;
      status: "done" | "refused" | "offered";
      terms: TradeTerms;
    }
  | { k: "tributary"; day: number; n: number; by: number; free: boolean }
  | { k: "abandoned"; day: number; n: number; p: number }
  | {
      k: "news";
      day: number;
      n: number;
      text: string;
      p?: number;
      /** Only news to the nation's own people (an election). */
      local?: boolean;
    }
  | {
      k: "ordered";
      day: number;
      n: number;
      goods: Partial<Record<Good, number>>;
      gold: number;
    };

// ---------------------------------------------------------------- the game

export type Difficulty = "easy" | "normal" | "hard";

export interface GameSettings {
  /** The game ends on 1 January of this year (1776). */
  endYear: number;
  difficulty: Difficulty;
  seed: number;
  /** The year it begins (1 January); 1607 if not given. */
  start?: StartYear;
}

/** A player at the start: the character they made. */
export interface PlayerSeat {
  seat: string;
  name: string;
  plan: LifePlan;
}

export interface Europe {
  /** Price of each good on the home markets. */
  price: Record<Good, number>;
  /** How much of each good reached Europe lately (prices sag under it). */
  glut: Record<Good, number>;
  /** Tension between the crowns, by power index pair "a-b", 0 to 100. */
  tension: Record<string, number>;
  /** Crowns at war in Europe: "a-b" pairs and when it started. */
  wars: Record<string, number>;
}

export interface GameState {
  version: number;
  settings: GameSettings;
  /** Days since 1 January 1607. */
  day: number;
  /** The day the game began. */
  startDay: number;
  endDay: number;
  rng: number;
  nextId: number;
  provinces: Province[];
  nations: Nation[];
  chars: Record<number, Character>;
  armies: Army[];
  wars: War[];
  truces: Truce[];
  treaties: Treaty[];
  offers: PeaceOffer[];
  /** Trade proposals waiting on another player. */
  deals: TradeOffer[];
  europe: Europe;
  /** Most recent battles, newest last. */
  battles: BattleReport[];
  over: boolean;
  winner: number;
  /** The players' lives, one per seat that has played. */
  lives: Life[];
  /** Townsfolk met in each province (character ids), seeded on a first visit. */
  locals: Record<number, number[]>;
  movements: Movement[];
  /** Assemblies and councils, by nation index. */
  polities: Record<number, Polity>;
  /** People on the road between towns (merchants, preachers, messengers). */
  travellers?: Traveller[];
  /** What people are saying, spreading out from where it happened. */
  rumours?: Rumour[];
  /** WORLD r11: each province's own market, where anyone has traded or something has shaken it. */
  markets?: Record<number, ProvMarket>;
  /** WORLD r11: stories going round (gold, wrecks, treasure), true or not. */
  leads?: WorldLead[];
  /** SOCIETY (r11): local offices and gatherings. */
  society?: SocietyState;
}

export type TravellerKind =
  | "merchant"
  | "trader"
  | "preacher"
  | "pedlar"
  | "official"
  | "messenger"
  | "family"
  | "drover"
  | "envoy";

export type TravelMode = "foot" | "wagon" | "pack" | "horse" | "ship" | "canoe";

/** Someone of the world on a journey, stopping a while, then going home. */
export interface Traveller {
  id: number;
  c: number;
  kind: TravellerKind;
  mode: TravelMode;
  home: number;
  /** Where they are (or are leaving, while on the road). */
  prov: number;
  path: number[];
  sea: boolean[];
  /** On the road: the day they left `prov` and the day they reach path[0]; -1 when stopped. */
  depart: number;
  arrive: number;
  /** Stopped: the day they move on. */
  until: number;
  dest: number;
  /** On the way home. */
  back: boolean;
  /** A letter for a player: their seat, and the event it brings. */
  letter?: { seat: string; key: string; from: number };
}

/** Talk that spreads from where something happened, at a rider's pace. */
export interface Rumour {
  id: number;
  day: number;
  p: number;
  text: string;
  /** Who it's about, or -1. */
  about: number;
  tone?: "good" | "bad";
}

// ---------------------------------------------------------------- commands

export type Command =
  | { k: "colonize"; p: number }
  | { k: "build"; p: number; b: BuildingKind }
  | { k: "recruit"; p: number; t: RegType }
  | { k: "move"; a: number; to: number }
  | { k: "stop"; a: number }
  | { k: "split"; a: number }
  | { k: "merge"; a: number; b: number }
  | { k: "disband"; a: number }
  | { k: "lead"; a: number; c: number }
  | { k: "war"; n: number }
  | { k: "peace"; n: number; terms: PeaceTerms }
  | { k: "answer"; offer: number; yes: boolean }
  | { k: "treaty"; n: number; t: TreatyKind }
  | { k: "untreaty"; n: number; t: TreatyKind }
  | { k: "gift"; n: number; gold: number }
  | { k: "buy"; p: number }
  | { k: "tax"; level: TaxLevel }
  | { k: "remit"; share: number }
  | { k: "ban"; good: Good; export: boolean; on: boolean }
  | { k: "appoint"; seat: Seat; c: number }
  | { k: "dismiss"; seat: Seat }
  | { k: "marry"; a: number; b: number }
  | { k: "confront"; c: number }
  | { k: "event"; id: number; choice: number }
  | { k: "demand"; pay: boolean }
  | { k: "independence" }
  | { k: "expedition"; c: number; p: number }
  | { k: "outpost"; c: number; p: number }
  | { k: "deal"; n: number; terms: TradeTerms }
  | { k: "dealAnswer"; deal: number; yes: boolean }
  | { k: "order"; goods: Partial<Record<Good, number>> }
  | { k: "abandon"; p: number }
  | { k: "tribute"; n: number }
  | { k: "release"; n: number };

/** Things done to or with another person. */
export type PersonAct =
  | "talk"
  | "flatter"
  | "insult"
  | "work"
  | "borrow"
  | "gift"
  | "befriend"
  | "court"
  | "propose"
  | "rumour"
  | "duel"
  | "recruit"
  | "patron"
  | "bribe"
  | "join"
  | "mentor"
  | "promote"
  | "quit"
  | "hire"
  | "trade"
  // SOCIETY (r11)
  | "tryst"
  | "pry"
  | "blackmail"
  | "seek"
  | "tongue"
  | "settle";

export const PERSON_ACTS: readonly PersonAct[] = [
  "talk",
  "flatter",
  "gift",
  "befriend",
  "mentor",
  "court",
  "propose",
  "work",
  "promote",
  "quit",
  "hire",
  "trade",
  "borrow",
  "patron",
  "bribe",
  "recruit",
  "join",
  "rumour",
  "insult",
  "duel",
  // SOCIETY (r11)
  "tryst",
  "tongue",
  "seek",
  "settle",
  "pry",
  "blackmail",
];

/** The few things a governor (or sachem) decides for their nation. */
export type GovLever =
  | { l: "tax"; level: TaxLevel }
  | { l: "raise"; p: number }
  | { l: "build"; p: number; b: BuildingKind }
  | { l: "war"; n: number }
  | { l: "peace"; n: number }
  | { l: "remit"; share: number }
  /** Pass or repeal a law. */
  | { l: "law"; law: string; on: boolean }
  /** Put someone on the council. */
  | { l: "appoint"; seat: Seat; c: number }
  /** Pay for a public work. */
  | { l: "project"; key: string; p: number };

export type MovementAct = "join" | "leave" | "found" | "rise" | "lead";

/** What a player's character can do; the server runs these for their seat. */
export type LifeCommand =
  /** Set out for a province (by sea from a port where it's quicker). */
  | { k: "travel"; to: number; bySea?: boolean }
  /** Stop at the next place on the road. */
  | { k: "halt" }
  /** Something to do at a place here (pray, gamble, write a pamphlet). */
  | { k: "act"; place: PlaceKind; act: string; arg?: number }
  /** Take a job a place here offers. */
  | { k: "job"; place: PlaceKind; job: JobKind }
  | { k: "quit" }
  | {
      k: "person";
      c: number;
      act: PersonAct;
      arg?: number;
      /** Trading with another player: goods for coins. */
      good?: Good;
      qty?: number;
    }
  | { k: "lifestyle"; v: Lifestyle }
  | { k: "heir"; c: number }
  | { k: "will"; share: boolean }
  | { k: "event"; id: number; choice: number }
  /** Buy (qty > 0) or sell (qty < 0) goods at the market here. */
  | { k: "trade"; good: Good; qty: number }
  | { k: "repay"; to: number }
  /** Watching: become someone in the world. */
  | { k: "takeover"; c: number }
  /** Go into a place here (the tavern, the church, home). */
  | { k: "enter"; area: PlaceKind }
  /** Set yourself a goal (or give it up with null). */
  | { k: "ambition"; key: string | null; arg?: string }
  /** Buy, improve or sell property; let a hand go. */
  | {
      k: "property";
      act:
        | "house"
        | "land"
        | "expand"
        | "sell"
        | "dismiss"
        | "endow"
        /** Sell shares (a venture), or sell off a kept thing. */
        | "cash"
        | "unkit";
      /** The kept thing to sell off. */
      kit?: KitKey;
      id?: number;
      c?: number;
      what?: string;
    }
  /** The army you command: split it, merge another into it, raise volunteers, storm a siege. */
  | {
      k: "army";
      act: "split" | "merge" | "recruit" | "assault";
      b?: number;
    }
  /** Take command of an army (or -1 to give it up). */
  | { k: "command"; army: number }
  /** March the army you command. */
  | { k: "march"; to: number }
  | {
      k: "movement";
      act: MovementAct;
      id?: number;
      goal?: MovementGoal;
      name?: string;
    }
  /** Stand for the assembly at the next election. */
  | { k: "stand" }
  | { k: "gov"; lever: GovLever }
  /** Sail for Europe (taking the heir, or leaving them to carry on). */
  | { k: "europe"; takeHeir: boolean }
  /** Turn down an invitation to Europe. */
  | { k: "decline" }
  // WORLD (r11): the province market, leads, gifts of goods.
  /** Buy (qty > 0) or sell (qty < 0) a good or a ware at the market here. */
  | { k: "market"; item: TradeItem; qty: number }
  /** Work a lead here (prospect, pan, dive...), or forget it. */
  | { k: "lead"; id: number; act: LeadAct | "drop" }
  /** Present a load of goods to the council or the elders here (native gift-giving). */
  | { k: "present"; item: TradeItem }
  // ---- ART (r11)
  /** Sit for a new likeness: a portrait from the gallery, tuned (Appearance.ts). */
  | { k: "likeness"; look: import("./Appearance").Appearance }
  // LIFE (r11): work that runs itself, trades taken up, crime and the law,
  // your people, your boats, contracts.
  | { k: "effort"; v: Effort }
  | { k: "takeup"; job: JobKind; place: PlaceKind }
  | { k: "crime"; act: string; c?: number; arg?: number }
  | { k: "law"; act: string; c?: number; arg?: number }
  | {
      k: "people";
      act: string;
      id?: number;
      c?: number;
      arg?: number;
      to?: number;
      kind?: string;
    }
  | {
      k: "boat";
      act: string;
      id?: number;
      kind?: string;
      arg?: number;
      use?: string;
      name?: string;
    }
  | { k: "sail"; to: number; boat: number }
  | { k: "contract"; act: string; id: number; arg?: number }
  // SOCIETY (r11): letters, gatherings, local office, tongues, settlements.
  | SocietyCommand;

/** What changed since the last delta, for sending to players. */
export interface GameDelta {
  day: number;
  prov?: Record<number, Province>;
  /** Changed armies; null means it's gone. */
  armies?: Record<number, Army | null>;
  nations?: Record<number, Nation>;
  chars?: Record<number, Character>;
  wars?: War[];
  truces?: Truce[];
  treaties?: Treaty[];
  offers?: PeaceOffer[];
  deals?: TradeOffer[];
  europe?: Europe;
  battles?: BattleReport[];
  events?: GameEvent[];
  over?: { winner: number };
  /** Lives that changed, by seat. */
  lives?: Record<string, Life>;
  /** Provinces whose townsfolk changed. */
  locals?: Record<number, number[]>;
  movements?: Movement[];
  polities?: Record<number, Polity>;
  travellers?: Traveller[];
  rumours?: Rumour[];
  /** WORLD r11: markets that changed; null means it's back to normal. */
  markets?: Record<number, ProvMarket | null>;
  /** WORLD r11: the leads going round, when any changed. */
  leads?: WorldLead[];
  /** WORLD r11: only the changed fields of provinces, nations and lives already sent. */
  provPatch?: Record<number, Partial<Province>>;
  nationPatch?: Record<number, Partial<Nation>>;
  lifePatch?: Record<string, Partial<Life>>;
  /** SOCIETY (r11): offices and gatherings that changed. */
  society?: SocietyDelta;
}

// ---- WORLD (r11)

/** Culture-specific goods, on top of the colonies' ten goods (Wares.ts). */
export type WareId =
  | "woollens"
  | "brandy"
  | "wine"
  | "cochineal"
  | "chocolate"
  | "finecloth"
  | "spices"
  | "gin"
  | "brazilwood"
  | "iron"
  | "wampum"
  | "maize"
  | "deerskins"
  | "canoes"
  | "pottery"
  | "robes";

/** Anything bought and sold at a market: one of the ten goods, or a ware. */
export type TradeItem = Good | WareId;

/** A sudden turn in a market: a poor harvest, a glut, a scare, a strike nearby. */
export interface MarketShock {
  /** What it touches: an item, "food", or "all". */
  item: TradeItem | "food" | "all";
  /** Price multiplier while it lasts. */
  mul: number;
  until: number;
  why: string;
}

/** A province's own market: what's been bought and sold there lately. */
export interface ProvMarket {
  /**
   * Loads sold in (positive, a glut) or bought out (negative) by players and
   * traders, as of day `d`; it eases back to nothing as the town eats, makes
   * and ships things.
   */
  net: Partial<Record<TradeItem, number>>;
  d: number;
  /** Prices at the start of each recent month, oldest first (up to 6). */
  hist?: Partial<Record<TradeItem, number[]>>;
  shocks?: MarketShock[];
}

export type LeadKind =
  | "gold"
  | "silver"
  | "wreck"
  | "mine"
  | "treasure"
  | "land"
  | "crew"
  | "outlaw"
  | "furs"
  | "pearls"
  | "inheritance"
  | "spring";

/** Ways of working a lead once you're there. */
export type LeadAct =
  | "prospect"
  | "pan"
  | "mine"
  | "dive"
  | "dig"
  | "search"
  | "survey";

/** A story going round: gold in the hills, a wreck on the reef. Some are true. */
export interface WorldLead {
  id: number;
  kind: LeadKind;
  p: number;
  day: number;
  /** Talk of it dies away after this day. */
  until: number;
  text: string;
  /** The chance it's true, as first told (0 to 1). */
  odds: number;
  /** Decided the first time anyone works it properly (null until then). */
  real: boolean | null;
  /** What there is to be had, in coins, if it's real. */
  worth: number;
  /** Taken so far, by everyone. */
  taken: number;
  /** Others who've heard and come (they take their share). */
  rush: number;
  /** The day a strike set off a rush, if it did. */
  boom?: number;
  /** Someone in it (an outlaw, an heir), or -1. */
  c: number;
}

/** A lead a life has heard of, and how it's going. */
export interface LifeLead {
  /** The world lead's id. */
  id: number;
  heard: number;
  /** Where you heard it: "the gazette", "talk at the tavern"... */
  from: string;
  /** How far you believe it, 0 to 100 (wiser readers judge closer to the truth). */
  trust: number;
  status: "open" | "working" | "found" | "dry" | "done" | "faded";
  /** Working it now: how, and the day it's done. */
  work?: { act: LeadAct; until: number };
  tries: number;
  /** What came of it last time. */
  note?: string;
}

// ---- ART (r11)
// The portrait gallery's kinds of sitter and a character's look live in
// Sitters.ts and Appearance.ts; `Character.look` and `LifePlan.look` hold a
// look (a gallery portrait and its tuning).

// ---- LIFE (r11)

/** The trades, offices of the law and lines of work added in round 11. */
export type R11JobKind =
  | "blacksmith"
  | "cooper"
  | "tanner"
  | "ropewalker"
  | "shipwright"
  | "carpenter"
  | "miller"
  | "brewer"
  | "distiller"
  | "fisherman"
  | "whaler"
  | "surveyor"
  | "schoolmaster"
  | "midwife"
  | "apothecary"
  | "shopkeeper"
  | "interpreter"
  | "guide"
  | "counsellor"
  | "watch"
  | "militia"
  | "thieftaker"
  | "thief"
  | "fence"
  | "smuggler"
  | "highwayman"
  | "counterfeiter"
  | "pirate";

export type R11BackgroundId =
  | "blacksmith"
  | "cooper"
  | "tanner"
  | "ropewalker"
  | "shipwright"
  | "carpenter"
  | "miller"
  | "brewer"
  | "distiller"
  | "fisherman"
  | "whaler"
  | "surveyor"
  | "schoolmaster"
  | "midwife"
  | "apothecary"
  | "shopkeeper"
  | "tapster"
  | "watchman"
  | "militiaman"
  | "thieftaker"
  | "pickpocket"
  | "smuggler"
  | "footpad"
  | "coiner"
  | "pirate"
  | "guide"
  | "interpreter";

/** How hard you go at your work, day in, day out. */
export type Effort = "shirk" | "steady" | "hard" | "overtime";

/** Your work running itself while you're at your post. */
export interface WorkState {
  effort: Effort;
  /** The day the last matter at work came up. */
  matter?: number;
  /** Shirking: days you got away with it this month, and the last day you were caught. */
  caught?: number;
  /** A task taken on: its key, the day it's due, and what it pays. */
  task?: { key: string; due: number; pay: number; skill: Skill } | null;
}

/** Someone the law wants: a rogue with a price on their head. */
export interface Wanted {
  c: number;
  /** Province last seen in. */
  p: number;
  crime: string;
  bounty: number;
  since: number;
}

/** A conviction on the record. */
export interface Conviction {
  day: number;
  crime: string;
  sentence: string;
  p: number;
}

/** Your name with the law and the underworld. */
export interface CrimeState {
  /** How well the underworld knows you, 0 to 100. */
  notoriety: number;
  /** How hard each nation's law is looking for you (by nation index), 0 to 100. */
  heat: Record<number, number>;
  /** Provinces whose den you know. */
  dens: number[];
  record: Conviction[];
  /** In the gaol: where, until when, why, and whether the trial is still to come. */
  jail: {
    p: number;
    until: number;
    charge: string;
    grade: number;
    trial: boolean;
    nation: number;
  } | null;
  /** Burned on the thumb: the mark of a felon spared. */
  branded?: boolean;
  /** Bound and shipped away: until when. */
  transported?: number;
  /** For a lawman: rogues taken up, and bribes taken. */
  arrests?: number;
  bribes?: number;
}

export type FollowerKind =
  | "clerk"
  | "hand"
  | "sword"
  | "rogue"
  | "mate"
  | "guide"
  | "officer";

/** What one of your people is doing while not at your side. */
export interface FollowerTask {
  kind: "trade" | "job" | "boat" | "wait";
  /** Where they are, and the day they're back (or the job's done). */
  p: number;
  back: number;
  /** Trading: the money they took; a band's job: what it is; a boat: its id. */
  stake?: number;
  what?: string;
  boat?: number;
  /** Go again when they're back. */
  repeat?: boolean;
}

/** Someone in your service: a real character, with wages, loyalty and work of their own. */
export interface Follower {
  id: number;
  c: number;
  kind: FollowerKind;
  rank: number;
  /** Coins a month, or (rogues) a share of the take. */
  wage: number;
  share: number;
  /** 0 to 100: below 20 they may leave, or worse. */
  loyalty: number;
  joined: number;
  task: FollowerTask | null;
  /** Months unpaid. */
  owed?: number;
  /** What they've done for you (trips, jobs, fights). */
  deeds?: number;
}

/** A company of your own under arms: raised, paid and led by you. */
export interface Company {
  name: string;
  kind: "militia" | "rangers" | "regulars" | "warriors";
  men: number;
  /** 0 to 1: how well drilled. */
  drill: number;
  /** 0 to 1. */
  morale: number;
  raised: number;
  /** Taken the field: the army it marches as, or -1. */
  army: number;
  /** Months unpaid. */
  owed?: number;
  /** In the field in wartime, paid by the colony rather than you. */
  inPay?: boolean;
}

export type ContractKind =
  | "escort"
  | "outlaws"
  | "guard"
  | "raid"
  | "explore"
  | "find"
  | "bounty";

/** Work for a sword (or a company) for hire. */
export interface Contract {
  id: number;
  kind: ContractKind;
  /** Who offers it. */
  giver: number;
  /** Where it was offered, and where it's done. */
  from: number;
  target: number;
  pay: number;
  /** Done by this day, or forfeit. */
  due: number;
  /** Strength of the opposition (0 for none). */
  foe: number;
  title: string;
  text: string;
  status: "offered" | "taken" | "done" | "failed";
  /** Guard: days still to stand; the person to escort or find. */
  stay?: number;
  c?: number;
  /** Offered until this day. */
  until: number;
}

export type BoatKind =
  | "canoe"
  | "shallop"
  | "sloop"
  | "schooner"
  | "brig"
  | "ship";

export type BoatUse =
  | "idle"
  | "fishing"
  | "whaling"
  | "trading"
  | "smuggling"
  | "privateering";

/** A boat of your own: it stays in the port where you left it. */
export interface Boat {
  id: number;
  kind: BoatKind;
  name: string;
  /** The port (or shore) where it lies. */
  prov: number;
  /** 0 (a wreck) to 100. */
  condition: number;
  /** Hands aboard (paid by you), and how they feel, 0 to 100. */
  crew: number;
  morale: number;
  use: BoatUse;
  bought: number;
  /** Months the crew's gone unpaid. */
  owed?: number;
  /** A quirk of a second-hand boat ("leaks", "quick"). */
  quirk?: string;
  /** Away on its own work with a skipper (a follower id), back on this day. */
  away?: { back: number; skipper: number; p: number } | null;
}

// ---- SOCIETY (r11)
// Lovers outside a marriage, letters to anyone, local offices, tongues,
// gatherings, and new settlements and nations.

/** A tongue people speak (see Tongues.ts for the list). */
export type TongueId = string;

/** How well a tongue is known: none, a few words, conversational, fluent. */
export type TongueLevel = 0 | 1 | 2 | 3;

export type LetterKind =
  | "friendly"
  | "favour"
  | "business"
  | "love"
  | "marriage"
  | "threat"
  | "recommend"
  | "petition"
  | "invite"
  | "introduce"
  | "reply"
  | "blackmail"
  | "news";

/** A letter written, carried and (perhaps) answered. */
export interface Letter {
  id: number;
  kind: LetterKind;
  /** Writer and reader (character ids). */
  from: number;
  to: number;
  /** Where it set out from, and where it's bound. */
  origin: number;
  dest: number;
  sent: number;
  /** The day it's read (or was to be). */
  arrive: number;
  /** Some of the way by ship (and so it may be lost). */
  bySea: boolean;
  status: "transit" | "delivered" | "lost";
  /** What it says. */
  text: string;
  /** Coins asked or offered, an office or gathering id, a petition's kind. */
  arg?: number;
  /** Who it's about (a recommendation, an introduction). */
  about?: number;
  /** A letter answering this one. */
  re?: number;
  /** It wants a yes or no from its reader. */
  ask?: boolean;
  /** The answer, once given: yes or no, the reasons, and the words. */
  answer?: { yes: boolean; why: Breakdown; text: string; day: number };
  /** Read by its reader (a player). */
  read?: boolean;
  /** Its reader (a player) has answered, or let it lapse. */
  done?: boolean;
}

/** A love outside a marriage, and what's known of it. */
export interface Affair {
  /** The lover. */
  c: number;
  since: number;
  /** 0 to 100: how much people suspect; found out at 100 (or by bad luck). */
  exposure: number;
  /** Found out: by your spouse, theirs, or the whole town. */
  known: ("spouse" | "theirs" | "town")[];
  /** Children of it. */
  kids: number[];
  /** Last secret meeting. */
  met: number;
  /** Someone who knows and wants paying for silence, or -1. */
  blackmailer: number;
  /** It's over (kept a while for the record). */
  ended?: number;
}

/** Something someone would rather nobody knew, and you do. */
export interface Secret {
  of: number;
  /** A lover, or -1. */
  with: number;
  kind: "affair" | "child" | "debt" | "crime";
  learned: number;
  /** The last day they paid you to keep quiet. */
  paid?: number;
}

export type OfficeKey =
  | "watch"
  | "constable"
  | "selectman"
  | "mayor"
  | "justice"
  | "sheriff"
  | "lieutenant"
  | "burgess"
  | "collector"
  | "warden"
  | "council"
  | "warcaptain"
  | "speaker"
  | "sachem"
  | "clanmother"
  | "founder";

/** An office in a town or county (or a native town). */
export interface LocalOffice {
  id: number;
  key: OfficeKey;
  prov: number;
  /** The nation it serves (offices fall vacant when the land changes hands). */
  nation: number;
  /** Who holds it, or -1. */
  holder: number;
  since: number;
  /** Elected: the day of the next election; appointed: -1. */
  election: number;
  /** Standing at the next election (players), with their points. */
  candidates: { c: number; points: number }[];
  /** The last day its holder did its duty. */
  duty: number;
}

export type GatheringKind =
  | "dinner"
  | "feast"
  | "ball"
  | "cards"
  | "hunt"
  | "social"
  | "frolic"
  | "raising"
  | "wedding"
  | "christening"
  | "funeral"
  | "nfeast"
  | "dance"
  | "council"
  | "greencorn";

/** A dinner, a ball, a wedding: a host, a place, a day and the guests. */
export interface Gathering {
  id: number;
  kind: GatheringKind;
  host: number;
  prov: number;
  venue: PlaceKind;
  day: number;
  /** 1 modest, 2 handsome, 3 grand. */
  scale: number;
  /** What it cost the host. */
  cost: number;
  invited: number[];
  /** Answers: who comes, and the main reason either way. */
  rsvp: Record<number, { yes: boolean; why: string }>;
  /** A wedding's couple, a christening's child, a funeral's dead. */
  about: number[];
  status: "planned" | "on" | "held" | "cancelled";
  /** How it's going: 0 middling, up is good. */
  mood: number;
  /** Turns played (sub-event keys), so none comes twice. */
  played: string[];
  /** Players taking part (seats) and the turns each has still to play. */
  turns: Record<string, number>;
  /** What happened, for the record. */
  lines: string[];
}

/** A settlement being got up: where, under whose leave, who's coming. */
export interface Founding {
  target: number;
  /** The governor's leave, or none (squatters). */
  charter: "granted" | "none";
  /** Your own colony, answering to nobody. */
  independent: boolean;
  /** Heads of household who've agreed to come. */
  settlers: number[];
  /** Acres offered each family: 0 none, 1 fifty, 2 a hundred, 3 two hundred and their passage. */
  terms: number;
  /** Coins laid out on supplies. */
  supplies: number;
  stage: "planning" | "underway";
  since: number;
}

export type GovForm = "republic" | "commonwealth" | "confederacy" | "kingdom";

/** A new nation's flag: a field, a division in a second colour, a charge. */
export interface NationFlag {
  field: string;
  division:
    | "plain"
    | "pale"
    | "fess"
    | "bend"
    | "cross"
    | "saltire"
    | "canton"
    | "triband"
    | "stripes";
  second: string;
  charge: Charge;
  chargeColor: string;
}

/** Everything of society kept outside the lives. */
export interface SocietyState {
  /** Town and county offices, by province. */
  offices: Record<number, LocalOffice[]>;
  gatherings: Gathering[];
}

/** What changed in society since the last delta. */
export interface SocietyDelta {
  offices?: Record<number, LocalOffice[]>;
  gatherings?: Gathering[];
}

/** A command for letters, gatherings, offices, tongues and settlements. */
export interface SocietyCommand {
  k: "society";
  act: string;
  id?: number;
  c?: number;
  kind?: string;
  arg?: number;
  about?: number;
  p?: number;
  venue?: PlaceKind;
  /** Days from now. */
  days?: number;
  yes?: boolean;
  list?: number[];
  name?: string;
  adjective?: string;
  color?: string;
  flag?: NationFlag;
  gov?: GovForm;
  offices?: Partial<Record<Seat, number>>;
  free?: boolean;
}
