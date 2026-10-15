// CQ24 (r24): "1776: The Revolution" runs on from the peace to the end of
// 1800: the Treaty of Paris in force and the Loyalists gone, the
// Confederation's troubles and Shays' Rebellion, the Constitution and
// Washington's government, the Bill of Rights, the war in the Northwest
// (St. Clair's defeat, Fallen Timbers, Greenville), the Whiskey Rebellion,
// Jay's and Pinckney's treaties, the Haitian Revolution and what it meant
// for the Caribbean and the slave trade, Spain in Florida and Louisiana,
// Adams, the XYZ Affair, the Quasi-War and the Alien and Sedition Acts, and
// the election of 1800. Each is a beat like the war's (Campaign1776.ts):
// news for everyone on its day, and what it did to the map.
//
// What each needs from history is its plan (Campaign1776Course.ts): the
// republic's own beats wait for the peace (and the federal government's
// for the Constitution), so a war that ran long, or a Constitution voted
// down, shifts them rather than skipping them; and none of them comes if
// the rising was put down. Two are divisions in Congress (the Constitution
// and Jay's Treaty, as the Declaration was in the war), where players in the
// house vote for themselves.
//
// The two wars of these years are the course's to steer, as the King's war
// was: the war in the Northwest (the Ohio country's nations, 1790 to 1795)
// and the Quasi-War with France (at sea, 1798 to 1800). The computer's
// armies don't fight them for history (Campaign1776Core's campaignForbids
// and campaignHoldsArmy); players' armies can, and the course follows. No
// other war comes between the republic and a power unless players make it:
// an ally's call draws neither in (Campaign1776Core's campaignNoCall), and
// the powers' claim wars wait on history (Reclaim.ts).
//
// Dates are from the standard references: the Library of Congress's
// "Primary Documents in American History" and its Journals of the
// Continental Congress, the National Archives' Founders Online, the
// Office of the Historian (history.state.gov) for the treaties, and, for
// Saint-Domingue, Laurent Dubois, "Avengers of the New World" (2004).

import { dayOf } from "./Calendar";
import {
  type Beat,
  BEATS,
  congressTo,
  devastate,
  kingArmyGone,
  provNamed,
  usOf,
} from "./Campaign1776";
import { addPlans, course, type Plan } from "./Campaign1776Course";
import { cede } from "./Crown";
import type { ConquestGame } from "./Game";
import { atWar } from "./Queries";
import { REGIMENTS } from "./Rules";
import { GOV_FORMS } from "./SocietyRules";
import { endWar } from "./War";

const byKey = (g: ConquestGame, key: string) =>
  g.s.nations.findIndex((n) => n.key === key);

/** A province handed over by treaty, if it's still who the treaty says. */
function handOver(
  g: ConquestGame,
  at: string,
  from: string | null,
  to: number,
) {
  const s = g.s;
  const p = provNamed(g.map, at);
  const pr = s.provinces[p];
  if (to < 0 || pr.owner === to) return;
  if (from === null ? pr.owner >= 0 : pr.owner !== byKey(g, from)) return;
  const was = pr.owner;
  cede(g, p, to);
  g.event({ k: "ceded", day: s.day, n: to, p, from: was });
}

/** The Constitution in force: the Congress of the United States, a republic. */
function federal(g: ConquestGame): void {
  const s = g.s;
  const us = usOf(s);
  if (us < 0) return;
  const n = g.nation(us);
  n.gov = "republic";
  n.mods = n.mods.filter((m) => !m.key.startsWith("gov:"));
  n.mods.push({
    key: "gov:republic",
    label: "A federal republic",
    until: s.endDay + 1,
    fx: { ...GOV_FORMS.republic.fx },
  });
  const pol = s.polities[us];
  if (pol) {
    pol.name = "the Congress of the United States";
    g.politiesChanged(us);
  }
}

/**
 * A war of the course's, between two nations only: nobody's allies are
 * called in (the engine's startWar would bring British America in for its
 * native allies, and France in for the United States, and so on round the
 * map, which isn't how these wars went).
 */
function narrowWar(g: ConquestGame, a: number, b: number, why: string): void {
  const s = g.s;
  if (a < 0 || b < 0 || atWar(s, a, b)) return;
  s.wars.push({
    a,
    b,
    by: a,
    start: s.day,
    why,
    won: [0, 0],
    lost: [0, 0],
    europe: false,
  });
  s.truces = s.truces.filter(
    (t) => !((t.a === a && t.b === b) || (t.a === b && t.b === a)),
  );
  const before = s.treaties.length;
  s.treaties = s.treaties.filter(
    (t) => !((t.a === a && t.b === b) || (t.a === b && t.b === a)),
  );
  if (s.treaties.length !== before) g.treatiesChanged();
  g.warsChanged();
  g.trucesChanged();
  g.event({ k: "war", day: s.day, n: a, on: b, why });
}

/** The war in the Northwest: the United States against the Ohio country's nations. */
function frontierWar(g: ConquestGame): void {
  const s = g.s;
  const us = usOf(s);
  const foes: number[] = [];
  for (const key of ["lenape", "wendat", "anishinaabe"]) {
    const n = byKey(g, key);
    if (n < 0 || !s.nations[n].alive) continue;
    narrowWar(g, us, n, "The Northwest Indian War");
    foes.push(n);
  }
  course(g).frontier = { on: true, foes };
  // The confederacy's warriors gather at Kekionga (the course holds them).
  const owner = byKey(g, "lenape");
  if (owner < 0) return;
  const p = provNamed(g.map, "Kekionga");
  const a = g.addArmy({
    id: g.nextId(),
    owner,
    prov: p,
    regs: Array.from({ length: 8 }, () => ({
      type: "warriors" as const,
      men: REGIMENTS.warriors.men,
      morale: 0.9,
      home: -1,
    })),
    path: [],
    depart: -1,
    arrive: -1,
    sea: false,
    retreating: false,
    arrived: s.day,
    from: -1,
    commander: -1,
    supply: 1,
  });
  const r = g.nation(us).r76!;
  r.armies = { ...(r.armies ?? {}), confed: a.id };
}

/** The peace on the frontier: the Treaty of Greenville. */
function greenville(g: ConquestGame): void {
  const s = g.s;
  const us = usOf(s);
  const c = course(g);
  for (const n of c.frontier?.foes ?? []) endWar(g, us, n);
  c.frontier = { on: false, foes: [] };
  kingArmyGone(g, "confed");
  handOver(g, "Scioto", "lenape", us);
  handOver(g, "Cuyahoga", "lenape", us);
}

/** The Quasi-War: at sea with France. */
function quasiWar(g: ConquestGame): void {
  const s = g.s;
  const us = usOf(s);
  const fr = byKey(g, "france");
  if (us < 0 || fr < 0) return;
  const before = s.treaties.length;
  s.treaties = s.treaties.filter(
    (t) =>
      !(
        t.kind === "alliance" &&
        ((t.a === us && t.b === fr) || (t.a === fr && t.b === us))
      ),
  );
  if (s.treaties.length !== before) g.treatiesChanged();
  narrowWar(g, fr, us, "The Quasi-War");
  course(g).quasi = true;
}

function quasiPeace(g: ConquestGame): void {
  const us = usOf(g.s);
  const fr = byKey(g, "france");
  if (fr >= 0) endWar(g, fr, us);
  course(g).quasi = false;
}

/** The years from the peace to the end of 1800. */
export const LATER_BEATS: Beat[] = [
  {
    key: "ratified",
    date: [1784, 1, 14],
    title: "The peace ratified",
    text: "At Annapolis, Congress ratifies the Treaty of Paris, with barely enough states present to do it.",
    at: "Severn",
  },
  {
    key: "empress",
    date: [1784, 2, 22],
    title: "The Empress of China",
    text: "The ship Empress of China sails from New York for Canton with ginseng and silver: the first American voyage to China. The King's ports are closed to American ships now, and the merchants look elsewhere.",
    at: "New Amsterdam",
  },
  {
    key: "treaty-in-force",
    date: [1784, 5, 12],
    title: "The peace in force",
    text: "At Paris the ratifications are exchanged, and the Treaty of Paris comes into force.",
  },
  {
    key: "loyalists",
    date: [1784, 6, 18],
    title: "New Brunswick",
    text: "Some thirty thousand Loyalists have come to Nova Scotia from New York since the peace. The land north of the Bay of Fundy is made a colony of its own for them: New Brunswick. Others have gone to Quebec, to England and to the islands.",
    at: "Saint-Jean",
  },
  {
    key: "mississippi",
    date: [1784, 6, 26],
    title: "The Mississippi closed",
    text: "Spain closes the lower Mississippi and New Orleans to American trade. The settlers of Kentucky, who have no other road for their crops, are furious with Spain and with a Congress that can do nothing about it.",
    at: "Bayogoula",
  },
  {
    key: "congress-ny",
    date: [1785, 1, 11],
    title: "Congress at New York",
    text: "Congress, wandering since the mutiny of 1783, settles at New York's City Hall. It has no money and no power to raise any: the states pay what they please, and many pay nothing.",
    at: "New Amsterdam",
    fx: (g) => congressTo(g, "New Amsterdam"),
  },
  {
    key: "land-ordinance",
    date: [1785, 5, 20],
    title: "The Land Ordinance",
    text: "Congress orders the western lands surveyed into townships six miles square, a lot in each set aside for schools, and sold to pay the nation's debts.",
  },
  {
    key: "religious-freedom",
    date: [1786, 1, 16],
    title: "Freedom of religion in Virginia",
    text: "Virginia's assembly passes Thomas Jefferson's statute for religious freedom: no one is to be made to attend or pay for any church.",
    at: "Jamestown",
  },
  {
    key: "shays",
    date: [1786, 8, 29],
    title: "The courts closed",
    text: "In western Massachusetts, farmers sued for debts and taxes they can't pay in coin march on the court at Northampton and shut it. Others follow in town after town; a veteran captain, Daniel Shays, is among their leaders.",
    at: "Pocumtuck",
  },
  {
    key: "annapolis",
    date: [1786, 9, 14],
    title: "The Annapolis Convention",
    text: "Delegates of five states, met at Annapolis about trade, ask every state to send men to Philadelphia in May to make the government of the union fit for its business.",
    at: "Severn",
  },
  {
    key: "springfield",
    date: [1787, 1, 25],
    title: "The arsenal at Springfield",
    text: "Shays's men march on the arsenal at Springfield. The state's militia fire on them, four of them are killed, and the rest scatter.",
    at: "Pocumtuck",
  },
  {
    key: "petersham",
    date: [1787, 2, 4],
    title: "Petersham",
    text: "General Lincoln's militia march through a snowy night and surprise the rebels at Petersham. Shays' Rebellion is over, but it has frightened men of property across the union.",
    at: "Pocumtuck",
  },
  {
    key: "convention",
    date: [1787, 5, 25],
    title: "The Federal Convention",
    text: "Delegates from the states meet at Philadelphia, behind closed doors, with General Washington in the chair. They are to amend the Articles; they begin by setting them aside.",
    at: "Fort Christina",
  },
  {
    key: "northwest-ordinance",
    date: [1787, 7, 13],
    title: "The Northwest Ordinance",
    text: "Congress makes the country north of the Ohio a territory, to become new states in time, and forbids slavery in it.",
  },
  {
    key: "constitution",
    date: [1787, 9, 17],
    title: "The Constitution",
    text: "The convention signs a Constitution: a Congress of two houses, a President, a supreme court, and a government with the power to tax. It goes to the states, nine of which must ratify it.",
    at: "Fort Christina",
  },
  {
    key: "federalist",
    date: [1787, 10, 27],
    title: "The Federalist",
    text: "The first of a series of essays signed Publius appears in New York's papers, arguing for the Constitution. Its opponents write back.",
    at: "New Amsterdam",
  },
  {
    key: "ratification",
    date: [1788, 6, 21],
    title: "The Constitution ratified",
    text: "New Hampshire, the ninth state, ratifies the Constitution: it will take effect. Virginia and New York follow within weeks, after long and close fights.",
  },
  {
    key: "first-congress",
    date: [1789, 3, 4],
    title: "The new government",
    text: "The Constitution takes effect. The new Congress of the United States is called to New York; the old Congress of the Confederation is gone.",
    at: "New Amsterdam",
    fx: (g) => federal(g),
  },
  {
    key: "inauguration",
    date: [1789, 4, 30],
    title: "The first President",
    text: "On the balcony of Federal Hall in New York, George Washington takes the oath as President of the United States. John Adams is Vice President.",
    at: "New Amsterdam",
  },
  {
    key: "bastille",
    date: [1789, 7, 14],
    title: "The Bastille",
    text: "In Paris a crowd takes the Bastille. By the autumn the news has crossed the ocean: France has a revolution of its own, and Americans toast it.",
  },
  {
    key: "amendments",
    date: [1789, 9, 25],
    title: "Amendments proposed",
    text: "Congress sends the states twelve amendments to the Constitution, guarding freedom of religion, speech and the press, the right to a jury, and more.",
  },
  {
    key: "residence",
    date: [1790, 7, 16],
    title: "A capital on the Potomac",
    text: "Congress settles where the capital is to be: on the Potomac, by 1800, and at Philadelphia until then.",
    at: "Piscataway",
  },
  {
    key: "census",
    date: [1790, 8, 2],
    title: "The first census",
    text: "The first census of the United States is taken: nearly four million people, about seven hundred thousand of them enslaved.",
  },
  {
    key: "harmar",
    date: [1790, 10, 22],
    title: "Harmar's defeat",
    text: "An American expedition against the Miami towns at Kekionga is beaten by the warriors of the Western Confederacy, the nations of the Ohio country who won't give up their land north of the river. It is war in the Northwest.",
    at: "Kekionga",
    fx: (g) => frontierWar(g),
  },
  {
    key: "capital-philadelphia",
    date: [1790, 12, 6],
    title: "Congress at Philadelphia",
    text: "Congress meets at Philadelphia, the capital for the next ten years.",
    at: "Fort Christina",
    fx: (g) => congressTo(g, "Fort Christina"),
  },
  {
    key: "bank",
    date: [1791, 2, 25],
    title: "The Bank of the United States",
    text: "President Washington signs Secretary Hamilton's bill for a Bank of the United States. Jefferson and Madison think it beyond the Constitution, and the quarrel will make two parties.",
    at: "Fort Christina",
  },
  {
    key: "vermont",
    date: [1791, 3, 4],
    title: "Vermont",
    text: "Vermont joins the union, the fourteenth state.",
  },
  {
    key: "haiti",
    date: [1791, 8, 22],
    title: "The rising in Saint-Domingue",
    text: "On the northern plain of Saint-Domingue, France's richest colony, the enslaved people of the sugar plantations rise in their thousands. The cane fields burn for weeks, and the news runs through every port of the Americas.",
    at: "Le Cap",
    fx: (g) => devastate(g, ["Le Cap"], -1),
  },
  {
    key: "st-clair",
    date: [1791, 11, 4],
    title: "St. Clair's defeat",
    text: "On the upper Wabash, the warriors of the Western Confederacy, led by Little Turtle and Blue Jacket, fall on General St. Clair's army at dawn and rout it: the worst defeat an American army will ever suffer at the hands of the native nations.",
    at: "Kekionga",
    battle: { us: "lost", king: "confed", at: "Kekionga" },
  },
  {
    key: "bill-of-rights",
    date: [1791, 12, 15],
    title: "The Bill of Rights",
    text: "Virginia ratifies, and ten of the amendments become part of the Constitution: the Bill of Rights.",
  },
  {
    key: "kentucky",
    date: [1792, 6, 1],
    title: "Kentucky",
    text: "Kentucky, cut off from Virginia, joins the union, the fifteenth state.",
    at: "Bluegrass",
  },
  {
    key: "re-elected",
    date: [1792, 12, 5],
    title: "Washington again",
    text: "The electors choose Washington again, unanimously. Under him the government is dividing: Federalists for Hamilton's bank and trade with Britain, Republicans for Jefferson and the friends of France.",
  },
  {
    key: "louis",
    date: [1793, 1, 21],
    title: "The King of France",
    text: "In Paris, the deposed King of France is put to death. France is a republic, and within days at war with Britain and the Dutch.",
  },
  {
    key: "genet",
    date: [1793, 4, 8],
    title: "Citizen Genêt",
    text: "The French Republic's minister lands at Charleston and begins to commission privateers from American ports, before he has even presented himself to the government.",
    at: "Charles Town",
  },
  {
    key: "neutrality",
    date: [1793, 4, 22],
    title: "Neutrality",
    text: "President Washington proclaims the United States neutral in the war between France and Britain. The alliance of 1778 is not mentioned.",
  },
  {
    key: "le-cap",
    date: [1793, 6, 20],
    title: "Le Cap burns",
    text: "Fighting between the Republic's commissioners and the colonists' governor burns most of Le Cap. Thousands of colonists flee, many to Norfolk, Baltimore, Philadelphia and Charleston.",
    at: "Le Cap",
    fx: (g) => devastate(g, ["Le Cap"], -1),
  },
  {
    key: "emancipation",
    date: [1793, 8, 29],
    title: "Freedom in Saint-Domingue",
    text: "To hold the colony for the Republic, its commissioner Sonthonax proclaims the end of slavery in the north of Saint-Domingue; the rest follows within weeks.",
    at: "Le Cap",
  },
  {
    key: "fever",
    date: [1793, 9, 1],
    title: "Fever in Philadelphia",
    text: "Yellow fever sweeps Philadelphia through the late summer and autumn. Thousands die; the government and everyone who can afford to leave the city until the frosts.",
    at: "Fort Christina",
  },
  {
    key: "jeremie",
    date: [1793, 9, 20],
    title: "The British in Saint-Domingue",
    text: "A British force lands at Jérémie, invited by planters who would rather have King George than freedom for their slaves. Britain will spend five years and many thousands of soldiers, most of them to fever, trying to hold the colony.",
    at: "Tiburon",
  },
  {
    key: "abolition",
    date: [1794, 2, 4],
    title: "France ends slavery",
    text: "The National Convention abolishes slavery in all France's colonies.",
  },
  {
    key: "slave-trade-act",
    date: [1794, 3, 22],
    title: "The Slave Trade Act",
    text: "Congress forbids Americans to fit out ships, or to build them, for carrying enslaved people to foreign countries. The trade into the states themselves goes on, by the states' own laws.",
  },
  {
    key: "toussaint",
    date: [1794, 5, 18],
    title: "Toussaint Louverture",
    text: "Toussaint Louverture, who has led the freed people's army in the north of Saint-Domingue, goes over to the French Republic that ended slavery, and turns on the Spanish and British.",
    at: "Le Cap",
  },
  {
    key: "whiskey",
    date: [1794, 7, 17],
    title: "The Whiskey Rebellion",
    text: "West of the mountains, farmers who distil their grain into whiskey and won't pay the federal tax on it burn the house of the tax's inspector near Pittsburgh. Thousands gather under arms.",
    at: "Forks of the Ohio",
  },
  {
    key: "fallen-timbers",
    date: [1794, 8, 20],
    title: "Fallen Timbers",
    text: "General Anthony Wayne's legion beats the warriors of the Western Confederacy among trees thrown down by a storm on the Maumee. The British at Fort Miamis shut their gates on the beaten warriors.",
    at: "Sandusky",
    battle: { us: "won", king: "confed", at: "Sandusky" },
    fx: (g) => kingArmyGone(g, "confed"),
  },
  {
    key: "whiskey-march",
    date: [1794, 10, 4],
    title: "The President marches",
    text: "President Washington reviews some thirteen thousand militia at Carlisle, on their way west. By the time they reach Pittsburgh the rebels have gone home.",
    at: "Upland",
  },
  {
    key: "fort-wayne",
    date: [1794, 10, 22],
    title: "Fort Wayne",
    text: "Wayne's legion builds a fort at Kekionga, where the Miami towns stood.",
    at: "Kekionga",
    fx: (g) => handOver(g, "Kekionga", null, usOf(g.s)),
  },
  {
    key: "jay-signed",
    date: [1794, 11, 19],
    title: "Jay's Treaty",
    text: "In London, John Jay signs a treaty with Britain: the British will leave their posts in the Northwest, and the trade with the British islands opens a little. It says nothing of the sailors Britain takes off American ships.",
  },
  {
    key: "jay-ratified",
    date: [1795, 6, 24],
    title: "Jay's Treaty approved",
    text: "The Senate approves Jay's Treaty by exactly the two-thirds it needs. In the towns, Jay is burned in effigy.",
    at: "Fort Christina",
  },
  {
    key: "basel",
    date: [1795, 7, 22],
    title: "The Peace of Basel",
    text: "Spain makes peace with France, and gives France its half of Hispaniola, Santo Domingo, on paper at least.",
    at: "Santo Domingo",
  },
  {
    key: "greenville",
    date: [1795, 8, 3],
    title: "The Treaty of Greenville",
    text: "At Greenville the nations of the Ohio country sign away the south and east of the land north of the Ohio, for goods and annuities. The war in the Northwest is over.",
    at: "Scioto",
    fx: (g) => greenville(g),
  },
  {
    key: "pinckney",
    date: [1795, 10, 27],
    title: "Pinckney's Treaty",
    text: "At San Lorenzo, Spain agrees the Florida border at the thirty-first parallel and opens the Mississippi and the port of New Orleans to American trade.",
    at: "Bayogoula",
  },
  {
    key: "tennessee",
    date: [1796, 6, 1],
    title: "Tennessee",
    text: "Tennessee joins the union, the sixteenth state.",
    at: "Cumberland",
  },
  {
    key: "posts",
    date: [1796, 7, 11],
    title: "Détroit handed over",
    text: "Under Jay's Treaty, the British garrison marches out of Détroit and the Americans march in. Niagara and Michilimackinac follow.",
    at: "Détroit",
    fx: (g) => handOver(g, "Détroit", "britain", usOf(g.s)),
  },
  {
    key: "farewell",
    date: [1796, 9, 19],
    title: "The Farewell Address",
    text: "President Washington's farewell to public life is printed in the papers: he will not serve a third term, and he warns against parties and against permanent alliances abroad.",
  },
  {
    key: "election-1796",
    date: [1796, 12, 7],
    title: "Adams elected",
    text: "The electors choose John Adams, a Federalist, as President, and his rival Thomas Jefferson, with the next most votes, as Vice President.",
  },
  {
    key: "trinidad",
    date: [1797, 2, 18],
    title: "Trinidad",
    text: "Spain, at war with Britain again since the autumn, loses Trinidad to a British fleet.",
    at: "Trinidad",
  },
  {
    key: "adams",
    date: [1797, 3, 4],
    title: "President Adams",
    text: "John Adams takes the oath as President at Philadelphia.",
    at: "Fort Christina",
  },
  {
    key: "natchez",
    date: [1798, 3, 30],
    title: "Natchez handed over",
    text: "Under Pinckney's Treaty, the Spanish garrison leaves Natchez at last. The Mississippi Territory is made of the country around it.",
    at: "Natchez",
    fx: (g) => handOver(g, "Natchez", "spain", usOf(g.s)),
  },
  {
    key: "xyz",
    date: [1798, 4, 3],
    title: "The XYZ Affair",
    text: 'President Adams lays before Congress the dispatches from Paris: French agents, called X, Y and Z, asked the American envoys for a bribe before France would talk. "Millions for defense, but not one cent for tribute" is the toast of the day.',
  },
  {
    key: "alien-sedition",
    date: [1798, 7, 14],
    title: "The Sedition Act",
    text: "With the Alien Acts of June, Congress passes the Sedition Act: to write or print anything false and malicious against the government is a crime. Republican editors are soon in court.",
  },
  {
    key: "quasi-war",
    date: [1798, 7, 7],
    title: "The treaties with France annulled",
    text: "Congress declares the treaties of 1778 with France void. American warships and privateers are sent against French ships: an undeclared war at sea.",
    fx: (g) => quasiWar(g),
  },
  {
    key: "maitland",
    date: [1798, 8, 31],
    title: "The British leave Saint-Domingue",
    text: "General Maitland agrees with Toussaint Louverture that the British will leave Saint-Domingue. They are gone by the autumn.",
    at: "Tiburon",
  },
  {
    key: "kentucky-resolutions",
    date: [1798, 11, 16],
    title: "The Kentucky Resolutions",
    text: "Kentucky's legislature resolves that the Alien and Sedition Acts are void; Virginia follows next month. Jefferson and Madison wrote them, in secret.",
    at: "Bluegrass",
  },
  {
    key: "insurgente",
    date: [1799, 2, 9],
    title: "Constellation and L'Insurgente",
    text: "Off Nevis, the American frigate Constellation takes the French frigate L'Insurgente after a hard fight.",
    at: "St. Kitts",
  },
  {
    key: "washington-dies",
    date: [1799, 12, 14],
    title: "Washington is dead",
    text: "George Washington dies at Mount Vernon, of a sudden illness of the throat. The nation goes into mourning.",
    at: "Piscataway",
  },
  {
    key: "toussaint-master",
    date: [1800, 8, 1],
    title: "Toussaint master of Saint-Domingue",
    text: "After a bitter war in the south, Toussaint Louverture's rival Rigaud leaves Saint-Domingue. The colony, still France's in name, is governed by a man born enslaved.",
    at: "Léogâne",
  },
  {
    key: "gabriel",
    date: [1800, 8, 30],
    title: "Gabriel",
    text: "Near Richmond, a plan by enslaved men led by a blacksmith called Gabriel to rise and take the town is betrayed, and a storm floods the roads on the night. Gabriel and many others are taken and hanged; Virginia makes its laws harsher.",
    at: "Jamestown",
  },
  {
    key: "mortefontaine",
    date: [1800, 9, 30],
    title: "Peace with France",
    text: "At Mortefontaine, the envoys of President Adams and of the First Consul, Napoleon Bonaparte, sign a convention ending the war at sea.",
    fx: (g) => quasiPeace(g),
  },
  {
    key: "san-ildefonso",
    date: [1800, 10, 1],
    title: "Louisiana",
    text: "In secret, at San Ildefonso, Spain promises Louisiana back to France. Nobody in America will know it for months.",
    at: "Bayogoula",
  },
  {
    key: "washington-city",
    date: [1800, 11, 17],
    title: "The city of Washington",
    text: "Congress meets for the first time in the unfinished Capitol in the new city of Washington, on the Potomac. President Adams has moved into the President's House, its plaster still wet.",
    at: "Piscataway",
    fx: (g) => congressTo(g, "Piscataway"),
  },
  {
    key: "election-1800",
    date: [1800, 12, 3],
    title: "The election of 1800",
    text: "The electors vote. The Republicans have beaten President Adams, but their two men, Thomas Jefferson and Aaron Burr, have the same number of votes: the House of Representatives will have to choose between them.",
  },
];

/** What each of the later years' beats needs (Campaign1776Course.ts). */
const PEACE: Plan = { us: true, wait: true, after: ["@peace"] };
const FEDERAL: Plan = {
  us: true,
  wait: true,
  after: ["@peace", "ratification"],
};
const LATER_PLANS: Record<string, Plan> = {
  ratified: PEACE,
  empress: PEACE,
  "treaty-in-force": PEACE,
  loyalists: PEACE,
  mississippi: PEACE,
  "congress-ny": PEACE,
  "land-ordinance": PEACE,
  "religious-freedom": PEACE,
  shays: PEACE,
  annapolis: PEACE,
  springfield: { ...PEACE, after: ["@peace", "shays"] },
  petersham: { ...PEACE, after: ["@peace", "springfield"] },
  convention: PEACE,
  "northwest-ordinance": PEACE,
  constitution: { ...PEACE, after: ["@peace", "convention"] },
  federalist: { ...PEACE, after: ["@peace", "constitution"] },
  ratification: {
    us: true,
    wait: true,
    after: ["@peace", "constitution"],
    vote: {
      motion: "the Constitution",
      debate: [1787, 9, 28],
      dissent: 0.3,
      revote: 365,
      aye: "for the Constitution",
      no: "against it: the states should keep their own",
    },
  },
  "first-congress": FEDERAL,
  inauguration: { ...FEDERAL, after: ["@peace", "first-congress"] },
  amendments: { ...FEDERAL, after: ["@peace", "inauguration"] },
  residence: FEDERAL,
  census: FEDERAL,
  harmar: FEDERAL,
  "capital-philadelphia": { ...FEDERAL, after: ["@peace", "residence"] },
  bank: FEDERAL,
  vermont: FEDERAL,
  "st-clair": { us: true, wait: true, after: ["harmar"] },
  "bill-of-rights": { ...FEDERAL, after: ["@peace", "amendments"] },
  kentucky: FEDERAL,
  "re-elected": { ...FEDERAL, after: ["@peace", "inauguration"] },
  genet: PEACE,
  neutrality: FEDERAL,
  fever: PEACE,
  "slave-trade-act": FEDERAL,
  whiskey: FEDERAL,
  "fallen-timbers": { us: true, wait: true, after: ["harmar"] },
  "whiskey-march": { ...FEDERAL, after: ["@peace", "whiskey"] },
  "fort-wayne": { us: true, wait: true, after: ["fallen-timbers"] },
  "jay-signed": FEDERAL,
  "jay-ratified": {
    us: true,
    after: ["jay-signed"],
    vote: {
      motion: "Jay's Treaty",
      debate: [1795, 6, 8],
      dissent: 0.33,
      revote: 0,
      aye: "for the treaty: peace with Britain, and the western posts",
      no: "against it: it gives Britain too much",
    },
  },
  greenville: {
    us: true,
    after: ["fallen-timbers"],
    loud: "With no victory on the Maumee, the nations of the Ohio country sign nothing, and the war in the Northwest goes on",
  },
  pinckney: FEDERAL,
  tennessee: FEDERAL,
  posts: {
    us: true,
    after: ["jay-ratified"],
    loud: "With no treaty, the British keep Détroit and their other posts in the Northwest",
  },
  farewell: { ...FEDERAL, after: ["@peace", "inauguration"] },
  "election-1796": FEDERAL,
  adams: { ...FEDERAL, after: ["@peace", "election-1796"] },
  natchez: { us: true, wait: true, after: ["pinckney"] },
  xyz: { ...FEDERAL, after: ["@peace", "adams"] },
  "alien-sedition": FEDERAL,
  "quasi-war": { ...FEDERAL, after: ["@peace", "xyz"] },
  "kentucky-resolutions": { ...FEDERAL, after: ["@peace", "alien-sedition"] },
  insurgente: { us: true, wait: true, after: ["quasi-war"] },
  "washington-dies": PEACE,
  gabriel: PEACE,
  mortefontaine: { us: true, wait: true, after: ["quasi-war"] },
  "washington-city": { ...FEDERAL, after: ["@peace", "residence"] },
  "election-1800": FEDERAL,
};

// The war's beats ran to the end of 1783; these follow them, in order.
for (const b of LATER_BEATS)
  if (!BEATS.some((x) => x.key === b.key)) BEATS.push(b);
BEATS.sort((a, b) => beatOrder(a) - beatOrder(b));
addPlans(LATER_PLANS);

function beatOrder(b: Beat): number {
  return dayOf(b.date[0], b.date[1] - 1, b.date[2]);
}
