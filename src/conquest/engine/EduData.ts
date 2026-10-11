// EDU (r13): the schools, trades, colleges and paths a child can be sent
// to, as they were. Dame schools and Latin grammar schools in the English
// and Dutch towns; Jesuit colleges and convents (the Ursulines at Quebec,
// the Congrégation at Montreal) in New France and New Spain; tutors at home;
// apprenticeships by indenture to the game's own trades (JobsData.ts), with
// the girls' trades of the time (mantua-maker, milliner, seamstress,
// midwife, housewifery); the colleges, each opening in its real year, and
// the universities abroad; and among the native peoples the elders, the
// hunters, the makers and the healers, and the mission schools where and
// when they were. Plain data, read by the rules (Edu.ts).

import type { JobKind, Religion, RoleId, Skill } from "./Types";

export type Sex = "boys" | "girls" | "both";
export type Gains = Partial<Record<Skill, number>>;

/** The Protestant faiths (for colleges with a test of religion). */
export const PROTESTANT: Religion[] = [
  "anglican",
  "puritan",
  "reformed",
  "lutheran",
];

// ---------------------------------------------------------------- schools

/** A fixed school: a Jesuit college, a convent, a mission. */
export interface SchoolPlace {
  /** The province (by its name on the map). */
  prov: string;
  from: number;
  to: number;
  /** What it's called there. */
  name: string;
  /** The crown it belongs to (a nation key); it's shut while another holds the town. */
  power: string;
}

export interface SchoolDef {
  key: string;
  name: string;
  /** Its name among each people (by culture). */
  names?: Partial<Record<string, string>>;
  text: string;
  /** Ages it takes them, first and last. */
  ages: [number, number];
  years: number;
  sex: Sex;
  /** Coins a month; and board on top, away from home. */
  fee: number;
  board: number;
  /** What it teaches over the whole course. */
  skills: Gains;
  /** For native families (mission schools), or colonists. */
  native: boolean;
  /** Always lived in (a convent, a mission), wherever home is. */
  boards?: boolean;
  /** Kept in towns of a size, at fixed places, or at home (a tutor). */
  where: "town" | "fixed" | "home";
  /** Towns: settlers needed (a capital always has one); boarded at the nearest if not at home. */
  folk?: number;
  /** Towns: the peoples who keep them, and from what year. */
  since?: Partial<Record<string, number>>;
  /** Only in their own town (a dame school: nobody boards a five-year-old for one). */
  local?: boolean;
  faiths?: Religion[];
  places?: SchoolPlace[];
  /** A mission school teaches its crown's tongue. */
  tongue?: boolean;
}

export const SCHOOLS: SchoolDef[] = [
  {
    key: "dame",
    name: "A dame school",
    names: {
      english: "A dame school",
      dutch: "The schoolmistress's school",
      swedish: "The parish clerk's school",
      french: "A petite école",
      spanish: "An amiga school",
    },
    text: "A goodwife's kitchen, a hornbook and the catechism: the little ones learn their letters for a penny or two a week, boys and girls together.",
    ages: [4, 8],
    years: 3,
    sex: "both",
    fee: 0.1,
    board: 0,
    skills: { letters: 1.5, faith: 0.5 },
    native: false,
    where: "town",
    folk: 50,
    local: true,
  },
  {
    key: "grammar",
    name: "The Latin grammar school",
    names: { english: "The Latin grammar school", dutch: "The Latin school" },
    text: "Latin from dawn to dusk: Lily's grammar, Cato, Ovid and Cicero, a little Greek, and the birch for the slow. The road to college. Boys only.",
    ages: [7, 11],
    years: 6,
    sex: "boys",
    fee: 0.4,
    board: 0.6,
    skills: { letters: 3.5, persuasion: 0.5 },
    native: false,
    where: "town",
    folk: 2000,
    // Boston's Latin school, 1635; New Amsterdam's, 1659.
    since: { english: 1635, dutch: 1659 },
  },
  {
    key: "jesuit",
    name: "The Jesuit college",
    text: "The fathers teach grammar, the humanities and rhetoric by the Ratio Studiorum, for nothing but the board: Latin verse, disputations, a play at the prize-giving. The road to college or the priesthood. Boys only.",
    ages: [8, 12],
    years: 6,
    sex: "boys",
    fee: 0.1,
    board: 0.5,
    skills: { letters: 3.5, faith: 1, persuasion: 0.5 },
    native: false,
    where: "fixed",
    faiths: ["catholic"],
    places: [
      {
        prov: "Quebec",
        from: 1635,
        to: 1768,
        name: "the Jesuit college at Quebec",
        power: "france",
      },
      {
        prov: "Tenochtitlan",
        from: 1574,
        to: 1767,
        name: "the Colegio de San Pedro y San Pablo at Mexico",
        power: "spain",
      },
      {
        prov: "Santiago de Guatemala",
        from: 1608,
        to: 1767,
        name: "the Jesuit colegio at Santiago",
        power: "spain",
      },
      {
        prov: "Havana",
        from: 1724,
        to: 1767,
        name: "the Jesuit colegio at Havana",
        power: "spain",
      },
      {
        prov: "St. Mary's",
        from: 1677,
        to: 1765,
        name: "the Jesuits' school in Maryland",
        power: "england",
      },
    ],
  },
  {
    key: "needle",
    name: "A sewing school",
    names: {
      english: "A sewing school",
      dutch: "A needlework school",
      swedish: "A needlework school",
    },
    text: "Kept by a gentlewoman: plain work and marking linen, a sampler with the alphabet and a verse, a little writing and the household accounts. Girls only.",
    ages: [7, 11],
    years: 4,
    sex: "girls",
    fee: 0.25,
    board: 0.6,
    skills: { craft: 2, letters: 0.5, trade: 0.5 },
    native: false,
    where: "town",
    folk: 800,
    since: { english: 1630, dutch: 1650, swedish: 1640 },
  },
  {
    key: "convent",
    name: "The convent school",
    text: "The sisters take girls as boarders: reading, writing and reckoning, the catechism, needlework and embroidery, and manners for a seigneur's or a hidalgo's wife. Girls only.",
    ages: [7, 11],
    years: 5,
    sex: "girls",
    fee: 0.3,
    board: 0.5,
    skills: { letters: 2.5, faith: 2, craft: 1 },
    native: false,
    boards: true,
    where: "fixed",
    faiths: ["catholic"],
    places: [
      {
        prov: "Quebec",
        from: 1639,
        to: 1776,
        name: "the Ursulines at Quebec",
        power: "france",
      },
      {
        prov: "Hochelaga",
        from: 1658,
        to: 1776,
        name: "the Congrégation de Notre-Dame at Montreal",
        power: "france",
      },
      {
        prov: "Trois-Rivières",
        from: 1697,
        to: 1776,
        name: "the Ursulines at Trois-Rivières",
        power: "france",
      },
      {
        prov: "Bayogoula",
        from: 1727,
        to: 1776,
        name: "the Ursulines at New Orleans",
        power: "france",
      },
      {
        prov: "Tenochtitlan",
        from: 1548,
        to: 1776,
        name: "the Colegio de Niñas at Mexico",
        power: "spain",
      },
      {
        prov: "Santiago de Guatemala",
        from: 1578,
        to: 1776,
        name: "the convent of La Concepción at Santiago",
        power: "spain",
      },
      {
        prov: "Havana",
        from: 1644,
        to: 1776,
        name: "the convent of Santa Clara at Havana",
        power: "spain",
      },
      {
        prov: "Santo Domingo",
        from: 1560,
        to: 1776,
        name: "the convent of Regina Angelorum at Santo Domingo",
        power: "spain",
      },
    ],
  },
  {
    key: "tutor",
    name: "A tutor at home",
    text: "A young man fresh from college lodges with you and keeps school in the parlour: Latin and writing, accounts, a little French and dancing for the girls, and manners at table. Dear, and quicker than any school.",
    ages: [5, 15],
    years: 5,
    sex: "both",
    fee: 1.2,
    board: 0,
    skills: { letters: 6, persuasion: 1 },
    native: false,
    where: "home",
  },
  {
    key: "mission",
    name: "A mission school",
    text: "The missionaries board children of the nations and teach them to read and write in their own tongue and the colonists', with the catechism. Some families sent a child for the letters and the friendship it bought; many feared what the missionaries would take from them.",
    ages: [7, 12],
    years: 5,
    sex: "both",
    fee: 0,
    board: 0,
    skills: { letters: 2.5, faith: 2.5, craft: 0.5 },
    native: true,
    boards: true,
    where: "fixed",
    tongue: true,
    places: [
      {
        prov: "Quebec",
        from: 1637,
        to: 1776,
        name: "the Jesuit mission at Sillery (later Lorette)",
        power: "france",
      },
      {
        prov: "Hochelaga",
        from: 1667,
        to: 1776,
        name: "the Jesuit mission at Kahnawake",
        power: "france",
      },
      {
        prov: "Massachusetts Bay",
        from: 1651,
        to: 1700,
        name: "John Eliot's school at the praying town of Natick",
        power: "england",
      },
      {
        prov: "Plymouth",
        from: 1652,
        to: 1720,
        name: "the Mayhews' school on Martha's Vineyard",
        power: "england",
      },
      {
        prov: "Jamestown",
        from: 1723,
        to: 1776,
        name: "the Brafferton, the Indian school of William & Mary",
        power: "england",
      },
      {
        prov: "Pocumtuck",
        from: 1734,
        to: 1776,
        name: "John Sergeant's school at Stockbridge",
        power: "england",
      },
      {
        prov: "Pequot",
        from: 1754,
        to: 1769,
        name: "Moor's Indian Charity School at Lebanon",
        power: "england",
      },
      {
        prov: "Pennacook",
        from: 1770,
        to: 1776,
        name: "Moor's Indian Charity School at Hanover",
        power: "england",
      },
      {
        prov: "St. Augustine",
        from: 1600,
        to: 1704,
        name: "the Franciscan missions of Florida",
        power: "spain",
      },
      {
        prov: "Santa Fe",
        from: 1610,
        to: 1680,
        name: "the Franciscan missions of New Mexico",
        power: "spain",
      },
      {
        prov: "Santa Fe",
        from: 1693,
        to: 1776,
        name: "the Franciscan missions of New Mexico",
        power: "spain",
      },
      {
        prov: "Tenochtitlan",
        from: 1600,
        to: 1650,
        name: "the Colegio de Santa Cruz at Tlatelolco",
        power: "spain",
      },
    ],
  },
];

export const SCHOOL_BY_KEY = new Map(SCHOOLS.map((d) => [d.key, d]));

/** How far a family will send a child to board at school, a mission or a convent (km). */
export const BOARD_KM = 650;
/** How far a mission school's children come from (km). */
export const MISSION_KM = 500;

// ---------------------------------------------------------------- apprenticeship

/** A trade a child can be bound to, and the game's ladder it leads to. */
export interface CallingDef {
  key: string;
  name: string;
  /** In the indenture: "the art and mystery of a cooper". */
  art: string;
  /** The ladder it leads to (JobsData.ts / LifeRules.ts), or none. */
  job: JobKind | null;
  /** Who takes apprentices: the town's people of these roles. */
  roles: RoleId[];
  /** Taught by a mistress: a woman of the town (the goodwife, the milliner). */
  mistress?: boolean;
  sex: Sex;
  /** The premium paid to the master, once (0: none, as most crafts in the colonies). */
  premium: number;
  years: number;
  skills: Gains;
  /** Letters a master wants before taking them (reading and writing). */
  letters?: number;
  /** Only in a port town. */
  coastal?: boolean;
  text: string;
}

const craft = (extra: Gains = {}): Gains => ({
  craft: 6,
  trade: 1.5,
  letters: 0.5,
  ...extra,
});

export const CALLINGS: CallingDef[] = [
  {
    key: "smith",
    name: "Blacksmith",
    art: "the art and mystery of a blacksmith",
    job: "blacksmith",
    roles: ["master"],
    sex: "boys",
    premium: 3,
    years: 7,
    skills: craft({ fighting: 0.5 }),
    text: "Bellows, hammer and anvil from dawn: horseshoes, nails, plough irons and musket locks.",
  },
  {
    key: "cooper",
    name: "Cooper",
    art: "the art and mystery of a cooper",
    job: "cooper",
    roles: ["master"],
    sex: "boys",
    premium: 3,
    years: 7,
    skills: craft(),
    text: "Staves, hoops and hogsheads for tobacco, rum and flour: everything travels in a barrel.",
  },
  {
    key: "joiner",
    name: "Joiner and carpenter",
    art: "the art and mystery of a joiner",
    job: "carpenter",
    roles: ["master"],
    sex: "boys",
    premium: 3,
    years: 7,
    skills: craft(),
    text: "Frames raised, floors laid, chests and chairs made; houses go up under his hands.",
  },
  {
    key: "tanner",
    name: "Tanner",
    art: "the art and mystery of a tanner",
    job: "tanner",
    roles: ["master"],
    sex: "boys",
    premium: 2,
    years: 7,
    skills: craft(),
    text: "Hides limed, scraped and laid a year in oak bark. Good money in a smell nobody else will stand.",
  },
  {
    key: "miller",
    name: "Miller",
    art: "the art and mystery of a miller",
    job: "miller",
    roles: ["master"],
    sex: "boys",
    premium: 3,
    years: 7,
    skills: { craft: 5, trade: 2.5, letters: 0.5 },
    text: "The millstones dressed, the race kept clear, and the miller's toll taken from every sack.",
  },
  {
    key: "ropemaker",
    name: "Ropemaker",
    art: "the art and mystery of a ropemaker",
    job: "ropewalker",
    roles: ["master"],
    sex: "boys",
    premium: 2,
    years: 7,
    skills: { craft: 5.5, seamanship: 2, letters: 0.5 },
    coastal: true,
    text: "Walking backwards down the ropewalk spinning hemp into cable for the ships. Port towns only.",
  },
  {
    key: "distiller",
    name: "Distiller",
    art: "the art and mystery of a distiller",
    job: "distiller",
    roles: ["master"],
    sex: "boys",
    premium: 4,
    years: 7,
    skills: { craft: 5, trade: 2.5, letters: 0.5 },
    text: "Molasses into rum in a copper still: the colonies' busiest trade, and its thirstiest.",
  },
  {
    key: "shipwright",
    name: "Shipwright",
    art: "the art and mystery of a shipwright",
    job: "shipwright",
    roles: ["captain"],
    sex: "boys",
    premium: 4,
    years: 7,
    skills: { craft: 6, seamanship: 2, letters: 0.5 },
    coastal: true,
    text: "Keels laid and ribs raised in the yard. Every captain in port owes a shipwright.",
  },
  {
    key: "brewer",
    name: "Brewer",
    art: "the art and mystery of a brewer",
    job: "brewer",
    roles: ["innkeeper"],
    sex: "boys",
    premium: 3,
    years: 7,
    skills: { craft: 5, trade: 2.5, letters: 0.5 },
    text: "Malt, hops and the mash tun behind the tavern: small beer for every table.",
  },
  {
    key: "printer",
    name: "Printer",
    art: "the art and mystery of a printer",
    job: "newsman",
    roles: ["printer"],
    sex: "both",
    premium: 6,
    years: 7,
    skills: { letters: 3, craft: 3, persuasion: 1 },
    letters: 2,
    text: "Setting type backwards by candlelight, inking the forme, pulling the press. Young Franklin served his brother so (and ran away). Printers' daughters set type too.",
  },
  {
    key: "apothecary",
    name: "Apothecary",
    art: "the art and mystery of an apothecary",
    job: "apothecary",
    roles: ["physician"],
    sex: "boys",
    premium: 15,
    years: 7,
    skills: { medicine: 5, trade: 2, letters: 1 },
    letters: 2,
    text: "Simples ground and pills rolled, the Latin of the dispensatory, and drugs from London sold dear.",
  },
  {
    key: "surgeon",
    name: "Surgeon",
    art: "the art and mystery of a surgeon",
    job: "physician",
    roles: ["physician"],
    sex: "boys",
    premium: 20,
    years: 6,
    skills: { medicine: 6, letters: 1 },
    letters: 2,
    text: "Holding the basin, then the lancet: bleeding, bone-setting, the saw. Most colonial doctors learned so, not at a university.",
  },
  {
    key: "merchant",
    name: "Merchant's counting-house",
    art: "the business of a merchant",
    job: "clerk",
    roles: ["merchant"],
    sex: "boys",
    premium: 30,
    years: 7,
    skills: { trade: 5, letters: 2, persuasion: 1 },
    letters: 2,
    text: "Copying letters and invoices, keeping the books by double entry, learning bills of exchange and every captain in port. The dearest of premiums, and the road to a fortune.",
  },
  {
    key: "shopkeeper",
    name: "Shopkeeper",
    art: "the trade of a shopkeeper",
    job: "shopkeeper",
    roles: ["merchant"],
    sex: "both",
    premium: 8,
    years: 6,
    skills: { trade: 5, persuasion: 2 },
    letters: 1,
    text: "Behind the counter: pins, tea, cloth and powder, sold on credit and chalked on the board. Shopkeepers took girls as well as boys.",
  },
  {
    key: "lawyer",
    name: "Attorney's clerk",
    art: "the practice of the law, as clerk to an attorney",
    job: "law",
    roles: ["lawyer"],
    sex: "boys",
    premium: 25,
    years: 5,
    skills: { letters: 3, persuasion: 3 },
    letters: 3,
    text: "Articled clerk in an attorney's office: copying writs and deeds, reading Coke upon Littleton by night, and the county court by day.",
  },
  {
    key: "mariner",
    name: "Mariner",
    art: "the art of a mariner",
    job: "sailor",
    roles: ["captain"],
    sex: "boys",
    premium: 0,
    years: 7,
    skills: { seamanship: 6, fighting: 1, trade: 1 },
    coastal: true,
    text: "Bound to a master mariner: the rigging, the lead line, the stars, and every port from Barbados to Bristol.",
  },
  {
    key: "tailor",
    name: "Tailor",
    art: "the art and mystery of a tailor",
    job: "craftsman",
    roles: ["master"],
    sex: "boys",
    premium: 3,
    years: 7,
    skills: craft(),
    text: "Cross-legged on the board: coats, breeches and waistcoats cut and stitched for the town.",
  },
  {
    key: "cordwainer",
    name: "Cordwainer (shoemaker)",
    art: "the art and mystery of a cordwainer",
    job: "craftsman",
    roles: ["master"],
    sex: "boys",
    premium: 2,
    years: 7,
    skills: craft(),
    text: "Lasts, awls and waxed thread: shoes and boots for every foot in the county.",
  },
  {
    key: "silversmith",
    name: "Silversmith",
    art: "the art and mystery of a goldsmith and silversmith",
    job: "craftsman",
    roles: ["master"],
    sex: "boys",
    premium: 10,
    years: 7,
    skills: craft({ trade: 2, letters: 1 }),
    letters: 1,
    text: "Tankards, spoons and church plate raised from coin silver, and engraving besides. Paul Revere learned it from his father.",
  },
  {
    key: "wheelwright",
    name: "Wheelwright",
    art: "the art and mystery of a wheelwright",
    job: "craftsman",
    roles: ["master"],
    sex: "boys",
    premium: 3,
    years: 7,
    skills: craft(),
    text: "Hubs, spokes and felloes, and the iron tyre shrunk on hot: carts and coaches roll on his work.",
  },
  {
    key: "mantua",
    name: "Mantua-maker",
    art: "the art and mystery of a mantua-maker",
    job: "craftsman",
    roles: ["merchant", "master", "innkeeper"],
    mistress: true,
    sex: "girls",
    premium: 5,
    years: 5,
    skills: { craft: 5.5, trade: 2, persuasion: 0.5 },
    text: "Gowns cut, fitted and draped for the ladies of the town: the dressmaker's trade, and a woman's own business.",
  },
  {
    key: "milliner",
    name: "Milliner",
    art: "the art and mystery of a milliner",
    job: "shopkeeper",
    roles: ["merchant", "master", "innkeeper"],
    mistress: true,
    sex: "girls",
    premium: 8,
    years: 5,
    skills: { trade: 4, craft: 3, persuasion: 1 },
    text: "Hats, caps, ribbons, lace and gloves made up and sold in her own shop; milliners were among the colonies' women of business.",
  },
  {
    key: "seamstress",
    name: "Seamstress",
    art: "the art of a seamstress",
    job: "craftsman",
    roles: ["master", "merchant", "innkeeper", "planter"],
    mistress: true,
    sex: "girls",
    premium: 2,
    years: 5,
    skills: { craft: 5, trade: 1 },
    text: "Shirts, shifts and linen sewn, marked and mended by the piece for the town's households.",
  },
  {
    key: "midwife",
    name: "Midwife",
    art: "the art and mystery of a midwife",
    job: "midwife",
    roles: ["physician", "preacher", "master", "planter"],
    mistress: true,
    sex: "girls",
    premium: 3,
    years: 5,
    skills: { medicine: 5.5, persuasion: 1.5 },
    text: "Out at all hours at the midwife's side, learning the turnings of a birth and the herbs that ease it. Midwives were licensed, sworn and trusted.",
  },
  {
    key: "housewifery",
    name: "Housewifery",
    art: "housewifery",
    job: null,
    roles: ["planter", "master", "innkeeper", "preacher", "merchant"],
    mistress: true,
    sex: "girls",
    premium: 0,
    years: 6,
    skills: { craft: 2, farming: 2, trade: 1, medicine: 0.5 },
    text: "Bound out to a goodwife to learn to keep a house: spinning and dairying, the garden and the kitchen physic, brewing and the accounts. Many poor girls were put out so.",
  },
];

export const CALLING_BY_KEY = new Map(CALLINGS.map((d) => [d.key, d]));

/** Ages a child can be bound apprentice (about 12 to 14, a little either side). */
export const BIND_AGES: [number, number] = [11, 16];
/** Apprentices a master takes at once. */
export const MASTER_CAP = 2;
/** Towns looked in for a master: home and those known, nearest first. */
export const MASTER_TOWNS = 6;

/** What an apprenticeship contract is called among each people. */
export const INDENTURE_NAME: Record<string, string> = {
  english: "Indenture of Apprenticeship",
  dutch: "Leercontract",
  swedish: "Indenture of Apprenticeship",
  french: "Brevet d'apprentissage",
  spanish: "Escritura de aprendizaje",
};

// ---------------------------------------------------------------- college

export type Course = "arts" | "divinity" | "law" | "physic";

export const COURSES: Record<
  Course,
  {
    name: string;
    degree: string;
    text: string;
    skills: Gains;
    /** The trade it opens a door into, and the rung a graduate is taken on at. */
    door: JobKind | null;
    doorRank: number;
  }
> = {
  arts: {
    name: "The arts",
    degree: "Bachelor of Arts",
    text: "Latin, Greek and Hebrew, logic, rhetoric, ethics and natural philosophy, and disputations in Latin at Commencement.",
    skills: { letters: 3, persuasion: 1.5, leadership: 1 },
    door: null,
    doorRank: 0,
  },
  divinity: {
    name: "Divinity",
    degree: "Bachelor of Arts, for the ministry",
    text: "The arts, then the Scriptures in their tongues, the Fathers and the controversies: the road to a pulpit.",
    skills: { letters: 3, faith: 3, persuasion: 1 },
    door: "preacher",
    doorRank: 2,
  },
  law: {
    name: "Law",
    degree: "Bachelor of Laws",
    text: "The civil and the canon law, Justinian's Institutes and the commentators: the road to the courts.",
    skills: { letters: 3, persuasion: 2.5 },
    door: "law",
    doorRank: 1,
  },
  physic: {
    name: "Physic",
    degree: "Doctor of Physic",
    text: "Anatomy, botany and the materia medica, and the hospital wards: the road to a physician's practice.",
    skills: { letters: 2.5, medicine: 4 },
    door: "physician",
    doorRank: 2,
  },
};

export const COURSE_ORDER: Course[] = ["arts", "divinity", "law", "physic"];

/** How a student is entered: working for his keep, plain, or as a gentleman. */
export const COLLEGE_RANKS: { name: string; text: string; mult: number }[] = [
  {
    name: "A servitor",
    text: "Waits at table and runs errands for his keep: half the cost, and the gentlemen look straight through him.",
    mult: 0.5,
  },
  {
    name: "A commoner",
    text: "The ordinary student: commons in hall, a shared chamber, and the full course.",
    mult: 1,
  },
  {
    name: "A gentleman-commoner",
    text: "Dines with the fellows in a silk gown and is let off half his exercises: twice the cost, and friends worth having.",
    mult: 2,
  },
];

export interface CollegeDef {
  key: string;
  name: string;
  /** "Harvard": for chips and lists. */
  short: string;
  /** "Cambridge, by Boston". */
  town: string;
  /** The province (by name), or null over the sea. */
  prov: string | null;
  from: number;
  to?: number;
  /** Whose colonists may go (nation keys). */
  powers: string[];
  /** Takes native youth (free, at the charity's cost); only native youth. */
  natives?: boolean;
  nativeOnly?: boolean;
  /** Who may matriculate (a test of religion); and dissenters before a year. */
  faiths?: Religion[];
  /** Coins a month as a commoner (tuition, chamber and commons). */
  fee: number;
  /** Letters (Latin) to be admitted. */
  letters: number;
  courses: Course[];
  physicFrom?: number;
  /** Who admits them and signs the letter. */
  head: string;
  text: string;
}

export const COLLEGES: CollegeDef[] = [
  // ------------------------------------------------ in the colonies
  {
    key: "harvard",
    name: "Harvard College",
    short: "Harvard",
    town: "Cambridge, by Boston",
    prov: "Massachusetts Bay",
    from: 1636,
    powers: ["england"],
    faiths: PROTESTANT,
    fee: 2.5,
    letters: 5,
    courses: ["arts", "divinity"],
    head: "the President and Fellows of Harvard College",
    text: "Founded in 1636 to keep a learned ministry when the present ministers lie in the dust: Latin, Greek and Hebrew, logic and divinity, fines for every fault, and a Commencement half of Massachusetts comes to.",
  },
  {
    key: "indian",
    name: "The Indian College at Harvard",
    short: "the Indian College",
    town: "Cambridge, by Boston",
    prov: "Massachusetts Bay",
    from: 1655,
    to: 1698,
    powers: [],
    natives: true,
    nativeOnly: true,
    fee: 0,
    letters: 4,
    courses: ["arts", "divinity"],
    head: "the President and Fellows of Harvard College",
    text: "A brick house in Harvard Yard built with the New England Company's money for Native scholars, who live and study beside the English. Caleb Cheeshahteaumuck of the Wampanoag took his degree in 1665.",
  },
  {
    key: "wm",
    name: "The College of William & Mary",
    short: "William & Mary",
    town: "Williamsburg",
    prov: "Jamestown",
    from: 1693,
    powers: ["england"],
    faiths: ["anglican"],
    fee: 2.5,
    letters: 5,
    courses: ["arts", "divinity"],
    head: "the President and Masters of the College of William & Mary",
    text: "A royal charter and a Church of England college for Virginia: a grammar school, the college, and the Brafferton for Native boys. Planters' sons learn philosophy here, and some of them law.",
  },
  {
    key: "yale",
    name: "Yale College",
    short: "Yale",
    town: "Saybrook, then New Haven",
    prov: "Connecticut",
    from: 1701,
    powers: ["england"],
    faiths: PROTESTANT,
    fee: 2.2,
    letters: 5,
    courses: ["arts", "divinity"],
    head: "the Rector and Trustees of Yale College",
    text: "The Collegiate School of 1701, named for Elihu Yale's gift of books in 1718: founded by ministers who thought Harvard had grown loose, and strict Calvinist to the bone.",
  },
  {
    key: "nj",
    name: "The College of New Jersey",
    short: "the College of New Jersey",
    town: "Newark, then Princeton",
    prov: "Raritan",
    from: 1746,
    powers: ["england"],
    faiths: PROTESTANT,
    fee: 2.4,
    letters: 5,
    courses: ["arts", "divinity"],
    head: "the President and Trustees of the College of New Jersey",
    text: "A New Light college born of the Great Awakening, open by its charter to every Protestant persuasion. Nassau Hall at Princeton from 1756.",
  },
  {
    key: "kings",
    name: "King's College",
    short: "King's",
    town: "New York",
    prov: "New Amsterdam",
    from: 1754,
    powers: ["england"],
    faiths: PROTESTANT,
    fee: 2.8,
    letters: 5,
    courses: ["arts", "divinity", "physic"],
    physicFrom: 1767,
    head: "the Governors of King's College",
    text: "An Anglican college begun in the schoolhouse of Trinity Church: merchants' sons of New York, and from 1767 a school of physic.",
  },
  {
    key: "philadelphia",
    name: "The College of Philadelphia",
    short: "the College of Philadelphia",
    town: "Philadelphia",
    prov: "Fort Christina",
    from: 1755,
    powers: ["england"],
    fee: 2.6,
    letters: 5,
    courses: ["arts", "physic"],
    physicFrom: 1765,
    head: "the Trustees of the College, Academy and Charitable School of Philadelphia",
    text: "Franklin's academy grown into a college: no test of religion, mathematics and natural philosophy beside the classics, and from 1765 the first school of physic in America.",
  },
  {
    key: "ri",
    name: "Rhode Island College",
    short: "Rhode Island College",
    town: "Warren, then Providence",
    prov: "Narragansett",
    from: 1764,
    powers: ["england"],
    fee: 2.2,
    letters: 5,
    courses: ["arts", "divinity"],
    head: "the Trustees and Fellows of Rhode Island College",
    text: "A Baptist college whose charter bars every test of religion: Warren in 1764, Providence from 1770.",
  },
  {
    key: "queens",
    name: "Queen's College",
    short: "Queen's",
    town: "New Brunswick",
    prov: "Raritan",
    from: 1766,
    powers: ["england"],
    faiths: PROTESTANT,
    fee: 2.2,
    letters: 5,
    courses: ["arts", "divinity"],
    head: "the Trustees of Queen's College",
    text: "Chartered in 1766 for the Dutch Reformed churches of New York and New Jersey, to train their ministers here rather than in Holland.",
  },
  {
    key: "dartmouth",
    name: "Dartmouth College",
    short: "Dartmouth",
    town: "Hanover",
    prov: "Pennacook",
    from: 1769,
    powers: ["england"],
    natives: true,
    faiths: [...PROTESTANT, "native"],
    fee: 2,
    letters: 5,
    courses: ["arts", "divinity"],
    head: "the President and Trustees of Dartmouth College",
    text: "Eleazar Wheelock's college in the New Hampshire woods, chartered in 1769 for Native youth and English alike; its students cleared the land they studied on.",
  },
  {
    key: "quebec",
    name: "The Jesuit college at Quebec",
    short: "the college at Quebec",
    town: "Quebec",
    prov: "Quebec",
    from: 1655,
    to: 1768,
    powers: ["france"],
    faiths: ["catholic"],
    fee: 0.8,
    letters: 5,
    courses: ["arts", "divinity"],
    head: "the Rector of the College of Quebec",
    text: "The fathers' college in the upper town: philosophy, mathematics and hydrography for the river pilots, and for some the seminary and the priesthood.",
  },
  {
    key: "mexico",
    name: "The Royal and Pontifical University of Mexico",
    short: "the University of Mexico",
    town: "Mexico City",
    prov: "Tenochtitlan",
    from: 1551,
    powers: ["spain"],
    faiths: ["catholic"],
    fee: 2,
    letters: 5,
    courses: ["arts", "divinity", "law", "physic"],
    head: "the Rector and Cloister of the Royal and Pontifical University",
    text: "Founded by royal decree in 1551 beside the viceroy's palace: arts, theology, canon and civil law, and medicine, each faculty with its own colour of tassel.",
  },
  {
    key: "guatemala",
    name: "The Royal University of San Carlos",
    short: "San Carlos",
    town: "Santiago de Guatemala",
    prov: "Santiago de Guatemala",
    from: 1676,
    powers: ["spain"],
    faiths: ["catholic"],
    fee: 1.8,
    letters: 5,
    courses: ["arts", "divinity", "law", "physic"],
    physicFrom: 1681,
    head: "the Rector of the Royal University of San Carlos",
    text: "Chartered in 1676 for the creoles of the kingdom of Guatemala: theology and law, and from 1681 medicine.",
  },
  {
    key: "santodomingo",
    name: "The University of Santo Tomás de Aquino",
    short: "Santo Tomás",
    town: "Santo Domingo",
    prov: "Santo Domingo",
    from: 1538,
    powers: ["spain"],
    faiths: ["catholic"],
    fee: 1.8,
    letters: 5,
    courses: ["arts", "divinity", "law"],
    head: "the Rector of the University of Santo Tomás de Aquino",
    text: "The Dominicans' university in the old city of Santo Domingo, the first of the Indies.",
  },
  {
    key: "havana",
    name: "The Royal and Pontifical University of San Gerónimo",
    short: "San Gerónimo",
    town: "Havana",
    prov: "Havana",
    from: 1728,
    powers: ["spain"],
    faiths: ["catholic"],
    fee: 2,
    letters: 5,
    courses: ["arts", "divinity", "law", "physic"],
    head: "the Rector of the University of San Gerónimo",
    text: "Founded by the Dominicans in their convent at Havana in 1728.",
  },
  // ------------------------------------------------ over the sea
  {
    key: "oxford",
    name: "The University of Oxford",
    short: "Oxford",
    town: "Oxford, in England",
    prov: null,
    from: 1200,
    powers: ["england"],
    faiths: ["anglican"],
    fee: 6,
    letters: 6,
    courses: ["arts", "divinity", "law", "physic"],
    head: "the Vice-Chancellor of the University of Oxford",
    text: "The Church of England's own university: a man must subscribe the Thirty-nine Articles to matriculate. Planters' sons from Virginia and the islands learn Latin, wine and debt.",
  },
  {
    key: "cambridge",
    name: "The University of Cambridge",
    short: "Cambridge",
    town: "Cambridge, in England",
    prov: null,
    from: 1200,
    powers: ["england"],
    faiths: ["anglican", "puritan"],
    fee: 5.5,
    letters: 6,
    courses: ["arts", "divinity", "law", "physic"],
    head: "the Vice-Chancellor of the University of Cambridge",
    text: "Where John Harvard and many New England ministers studied before the Restoration. After 1662 no dissenter may take a degree.",
  },
  {
    key: "edinburgh",
    name: "The University of Edinburgh",
    short: "Edinburgh",
    town: "Edinburgh, in Scotland",
    prov: null,
    from: 1583,
    powers: ["england"],
    faiths: PROTESTANT,
    fee: 4,
    letters: 6,
    courses: ["arts", "divinity", "law", "physic"],
    physicFrom: 1726,
    head: "the Principal of the University of Edinburgh",
    text: "No test to keep a dissenter out; from 1726 the finest school of physic in the world, and colonial physicians come home with its MD.",
  },
  {
    key: "leiden",
    name: "The University of Leiden",
    short: "Leiden",
    town: "Leiden, in Holland",
    prov: null,
    from: 1575,
    powers: ["netherlands", "england", "sweden"],
    faiths: PROTESTANT,
    fee: 4.5,
    letters: 6,
    courses: ["arts", "divinity", "law", "physic"],
    head: "the Rector Magnificus of the University of Leiden",
    text: "The Dutch Republic's university: Boerhaave's physic, the law of nations, and a welcome for Protestants from everywhere, English dissenters among them.",
  },
  {
    key: "paris",
    name: "The University of Paris",
    short: "Paris",
    town: "Paris",
    prov: null,
    from: 1200,
    powers: ["france"],
    faiths: ["catholic"],
    fee: 4.5,
    letters: 6,
    courses: ["arts", "divinity", "law", "physic"],
    head: "the Rector of the University of Paris",
    text: "The Sorbonne for theology, the faculty of medicine, the colleges of the Latin Quarter: a Canadian seigneur's son comes home a gentleman, or a priest.",
  },
  {
    key: "lafleche",
    name: "The Jesuit college of La Flèche",
    short: "La Flèche",
    town: "La Flèche, in Anjou",
    prov: null,
    from: 1604,
    to: 1762,
    powers: ["france"],
    faiths: ["catholic"],
    fee: 3,
    letters: 5,
    courses: ["arts", "divinity"],
    head: "the Rector of the Royal College of La Flèche",
    text: "Henri IV's great Jesuit college, where Descartes studied and many priests of New France were trained, until the Jesuits were put out of France.",
  },
  {
    key: "stomer",
    name: "The English Jesuit college at St Omer",
    short: "St Omer",
    town: "St Omer, in Flanders",
    prov: null,
    from: 1593,
    to: 1762,
    powers: ["england"],
    faiths: ["catholic"],
    fee: 3,
    letters: 5,
    courses: ["arts", "divinity"],
    head: "the Rector of the English College at St Omer",
    text: "Across the Channel, beyond the reach of the penal laws: where Maryland's Catholic gentry, the Carrolls among them, sent their sons.",
  },
  {
    key: "salamanca",
    name: "The University of Salamanca",
    short: "Salamanca",
    town: "Salamanca, in Castile",
    prov: null,
    from: 1218,
    powers: ["spain"],
    faiths: ["catholic"],
    fee: 4,
    letters: 6,
    courses: ["arts", "divinity", "law", "physic"],
    head: "the Rector of the University of Salamanca",
    text: "The oldest university of Spain: canon and civil law, theology, and the school that argued over the rights of the peoples of the Indies.",
  },
  {
    key: "madrid",
    name: "The Colegio Imperial at Madrid",
    short: "the Colegio Imperial",
    town: "Madrid",
    prov: null,
    from: 1625,
    to: 1767,
    powers: ["spain"],
    faiths: ["catholic"],
    fee: 3,
    letters: 5,
    courses: ["arts", "divinity"],
    head: "the Rector of the Colegio Imperial",
    text: "The Jesuits' court college, where the sons of the great learned mathematics and the humanities until the Jesuits were expelled from Spain.",
  },
  {
    key: "lima",
    name: "The University of San Marcos",
    short: "San Marcos",
    town: "Lima, in Peru",
    prov: null,
    from: 1551,
    powers: ["spain"],
    faiths: ["catholic"],
    fee: 4.5,
    letters: 6,
    courses: ["arts", "divinity", "law", "physic"],
    head: "the Rector of the Royal and Pontifical University of San Marcos",
    text: "The university of the City of Kings, a long voyage south by way of Panama.",
  },
  {
    key: "uppsala",
    name: "The University of Uppsala",
    short: "Uppsala",
    town: "Uppsala, in Sweden",
    prov: null,
    from: 1477,
    powers: ["sweden"],
    faiths: ["lutheran"],
    fee: 3.5,
    letters: 6,
    courses: ["arts", "divinity", "law", "physic"],
    head: "the Rector of the University of Uppsala",
    text: "Sweden's university, where the pastors of New Sweden were trained; from 1741 Linnaeus taught botany there and sent his pupils to the Delaware for plants.",
  },
];

export const COLLEGE_BY_KEY = new Map(COLLEGES.map((d) => [d.key, d]));

/** College: ages admitted, years to the degree. */
export const COLLEGE_AGES: [number, number] = [14, 20];
export const COLLEGE_YEARS = 4;
/** Months of fees in hand before a college will admit them. */
export const COLLEGE_SURETY = 3;
/** The renown a degree brings the family (and the graduate). */
export const DEGREE_RENOWN = 2;
/** Cambridge shut its degrees to dissenters at the Restoration. */
export const CAMBRIDGE_TEST = 1662;

/** Trades a degree opens a door into (taken on a rung up). */
export const LEARNED: JobKind[] = [
  "preacher",
  "law",
  "physician",
  "official",
  "schoolmaster",
  "surveyor",
  "clerk",
];

/**
 * The rung someone is taken on at for what they learned: a journeyman (1)
 * in a trade they served, a rung up in the learned trades with a degree,
 * and two up through the door their course opens (a physician, a curate).
 */
export function eduStartRank(
  edu: { papers?: JobKind[]; degree?: string; course?: string } | undefined,
  kind: JobKind,
): number {
  if (!edu) return 0;
  let r = edu.papers?.includes(kind) ? 1 : 0;
  if (edu.degree) {
    if (LEARNED.includes(kind)) r = Math.max(r, 1);
    const c = COURSES[(edu.course as Course) ?? "arts"];
    if (c?.door === kind) r = Math.max(r, c.doorRank);
  }
  return r;
}

// ---------------------------------------------------------------- the peoples' own ways

export interface PathDef {
  key: string;
  name: string;
  text: string;
  ages: [number, number];
  years: number;
  sex: Sex;
  skills: Gains;
  /** Who teaches: a person of these roles in the village. */
  roles: RoleId[];
  /** The work it leads to (taken on a rung up). */
  job: JobKind | null;
}

export const PATHS: PathDef[] = [
  {
    key: "elders",
    name: "Learning from the elders",
    text: "Winter nights at the fire: the people's stories and history, the ceremonies, the clan's duties to its kin, and how to speak so that people listen.",
    ages: [6, 11],
    years: 5,
    sex: "both",
    skills: { persuasion: 1.5, faith: 1.5, woodcraft: 0.5 },
    roles: ["elder", "sachem"],
    job: null,
  },
  {
    key: "hunt",
    name: "Hunting and the warrior's training",
    text: "An uncle or a hunter takes the boy in hand: running, winter swimming, the bow and then the gun, tracking and fasting, and in time the war path.",
    ages: [9, 13],
    years: 4,
    sex: "boys",
    skills: { woodcraft: 3, fighting: 2.5, stealth: 1 },
    roles: ["hunter", "warleader"],
    job: "hunter",
  },
  {
    key: "maker",
    name: "A maker's craft",
    text: "At a maker's side: pots and baskets, quill and bead work, wampum, bows, paddles and the bark canoe.",
    ages: [8, 12],
    years: 4,
    sex: "both",
    skills: { craft: 3, trade: 1 },
    roles: ["maker"],
    job: "maker",
  },
  {
    key: "grower",
    name: "The fields and the three sisters",
    text: "The women's fields: seed corn kept from the best ears, beans and squash planted in the hills, the green-corn feast, and the stores that see the village through the winter.",
    ages: [8, 12],
    years: 4,
    sex: "girls",
    skills: { farming: 3, trade: 0.5, faith: 0.5 },
    roles: ["elder"],
    job: "grower",
  },
  {
    key: "healing",
    name: "The healer's path",
    text: "Plants and roots, the sweat lodge and the songs, setting bones and drawing out fevers, learned over years at a healer's side. Not everyone is called to it.",
    ages: [10, 14],
    years: 5,
    sex: "both",
    skills: { medicine: 3, faith: 1.5 },
    roles: ["healer"],
    job: "healer",
  },
];

export const PATH_BY_KEY = new Map(PATHS.map((d) => [d.key, d]));
