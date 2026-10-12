// SEA (r15): the How to Play's chapter on going to sea in person: cruises
// (privateers and pirates, the hunting grounds and havens, the scenes, the
// shares, the prize court and the fence, the gallows and the pardon), your
// own boat on a cruise, the privateering company, the trades that travel,
// the hurricanes, and how fast the sea is. Its tables are made from the
// engine's own (CruiseData, Voyages, SeaSpeed, Storms), so they can't drift.

import { BOATS } from "../../engine/Boats";
import {
  CREW_PARTS,
  CRUISE,
  GROUNDS,
  HAVENS,
  PREY,
  ROLE_NAMES,
  ROLE_PARTS,
  WARSHIP,
} from "../../engine/CruiseData";
import { COMPANY } from "../../engine/Privateers";
import {
  CANOE_SPEED,
  OWN_BOAT_PORT_DAYS,
  PASSAGE_CALL_DAYS,
  PASSAGE_FIND_DAYS,
  SEA_KM_DAY,
  SHORT_CROSSING_KM,
} from "../../engine/SeaSpeed";
import { MAX_STORMS, STORM_KM, WARN_KM } from "../../engine/Storms";
import {
  FUR_LUCK,
  LAY,
  SEND_SHARE,
  SURVEY_FEE,
  VENTURE_LUCK,
  VOYAGE_DEFS,
  WHALE_CHANCE_DAYS,
  WHALE_TAKEN,
  WHALE_VALUE,
} from "../../engine/Voyages";
import { chanceWords } from "../../engine/Odds";
import type { Chapter } from "./Chapters";

const pct = (v: number) => `${Math.round(v * 100)} in a hundred`;
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

function groundsTable(): string {
  const rows = GROUNDS.map(
    (g) =>
      `| **${cap(g.name)}** | ${g.text} | ${[...new Set(g.flags)].map(cap).join(", ")}${g.galleons ? "; a treasure galleon now and then" : ""}${g.summer ? " (May to October only)" : ""} |`,
  );
  return `| The ground | What passes | Whose ships |
|---|---|---|
${rows.join("\n")}`;
}

function havensTable(): string {
  return HAVENS.map(
    (h) => `- **${h.name}** (${h.from} to ${h.to}): ${h.text}`,
  ).join("\n");
}

function preyTable(): string {
  const all = PREY.reduce((m, k) => m + k.w, 0);
  const plain = PREY.filter((k) => k.kind !== "galleon").reduce((m, k) => m + k.w, 0);
  const rows = PREY.map((k) => {
    const often =
      k.kind === "galleon"
        ? `${chanceWords(k.w / all)} of sails, on the galleons' grounds`
        : `${chanceWords(k.w / plain)} of sails`;
    return `| ${cap(k.kind)} | ${often} | ${k.guns[0]} to ${k.guns[1]} | ${k.speed} | ${k.value[0]} to ${k.value[1]} |`;
  });
  return `| A sail | How often | Guns | Her pace | She and her cargo fetch |
|---|---|---|---|---|
${rows.join("\n")}
| A man-of-war | ${chanceWords(CRUISE.warship)} of sails (${chanceWords(CRUISE.warshipWar)} in wartime) | ${WARSHIP.guns} | ${WARSHIP.speed} | run |`;
}

function sharesTable(): string {
  const rows = (["captain", "officer", "crew"] as const).map(
    (r) =>
      `| ${ROLE_NAMES.privateer[r]} / ${ROLE_NAMES.pirate[r]} | ${ROLE_PARTS.privateer[r]} | ${ROLE_PARTS.pirate[r]} |`,
  );
  return `| Aboard as | A privateer's parts | A pirate's parts |
|---|---|---|
${rows.join("\n")}

The rest of her company share too: ${(["sloop", "schooner", "brig", "ship"] as const).map((k) => `a ${BOATS[k].name.toLowerCase()}'s ${CREW_PARTS[k]} parts`).join(", ")}, and the captain's parts are there whoever commands her.`;
}

function voyagesTable(): string {
  const lay = LAY.map((l) => `1/${Math.round(1 / l)}`).join(", ");
  return `| The trade | What comes to you | How often |
|---|---|---|
| **A merchant sailor** (deckhand to master) | ${VOYAGE_DEFS.merchant.name}: your wage as ever, and a venture of your own in her hold (${VOYAGE_DEFS.merchant.stakes.join(", ")} coins by rank): ${VENTURE_LUCK.map((l) => `${chanceWords(l.p)} ${l.label}, ×${l.x}`).join("; ")} | every ${VOYAGE_DEFS.merchant.every} days or so |
| **A whaler** | a season on the grounds (${VOYAGE_DEFS.whaling.stay[0]} to ${VOYAGE_DEFS.whaling.stay[1]} days): a chance at a whale every ${WHALE_CHANCE_DAYS} days (${chanceWords(WHALE_TAKEN)} one's taken, ${WHALE_VALUE[0]} to ${WHALE_VALUE[1]} of oil and bone); your lay of the catch by rank: ${lay} | every ${VOYAGE_DEFS.whaling.every} days or so |
| **A fur trader** (the brigade to the posts) | your trade goods (${VOYAGE_DEFS.furs.stakes.filter(Boolean).join(", ")} coins by rank): ${FUR_LUCK.map((l) => `${chanceWords(l.p)} ${l.label}, ×${l.x}`).join("; ")}. Sent with the brigade while you stay, its master keeps a cut: you get ${pct(SEND_SHARE)} | every ${VOYAGE_DEFS.furs.every} days or so |
| **A surveyor** | the fee for running a patent's lines (${SURVEY_FEE.join(", ")} by rank), renown and the woods' skill; or your deputy runs them for half | every ${VOYAGE_DEFS.survey.every} days or so |`;
}

export const SEA_CHAPTER: Chapter = {
  id: "sea",
  part: "living",
  title: "To sea in person",
  line: "Privateers and pirates, your own boat on a cruise, a privateering company, the trades that travel, and the hurricanes.",
  where:
    "Work › At sea. Ships fit out at a port's quay; the trades' voyages come to you as a scene; the hurricanes show on the map.",
  body: `## A cruise
A cruise takes you aboard a ship that sails on the map: from her port out to a hunting ground of the period, between its stations, and home. You're shown aboard her, with your figure, all the way. While you're at sea the things of the town wait (work, the market, the tavern, your property), and letters wait for you in port.

**Privateers** sail under a **letter of marque** from the governor of a colony at war, and take only the enemy's ships. They fit out at the colony's ports while the war lasts. **Pirates** take anyone's; they fit out in the pirate years (1650 to 1730) in the islands, Florida and the Carolinas, and best at a haven:
${havensTable()}

Sign at the quay (Work › At sea) as a **hand** (seamanship 2 or fighting 4), an **officer** (a lieutenant, or the pirates' quartermaster: seamanship 7 or fighting 8, or a mate's rank; for pirates a name, notoriety 25) or her **captain** (a ship's master's rank, or seamanship 10 and renown 8; the pirates elect theirs: a captain's rank, or notoriety 50 and seamanship 9). Be at the quay on the day she sails, or she sails without you. Before you sign, the odds are shown: each count of prizes with its chance and your share, what's expected, and the risks.

## The hunting grounds
${groundsTable()}

## On the ground
Every ${CRUISE.chanceDays} days on the ground a sail may be sighted (${chanceWords(CRUISE.sail)}). Each is a scene, with the odds on the buttons:
- **A sail**: give chase or let her go. The chase is seamanship against her pace.
- **Alongside**: call on her to strike (leadership, against her guns; the black flag frightens) or board her at once (fighting). If she won't strike, it's a boarding.
- **A prize**: send her in with a prize crew (her whole worth, but ${chanceWords(CRUISE.retake)} she's retaken on the way, ${chanceWords(CRUISE.retakeWar)} in wartime), carry off her plunder (about ${pct(CRUISE.plunder)} of her worth, sure), let her go, or burn her.
- **A man-of-war**: run (seamanship), fight (seldom wise), or strike your colours. Taken, a privateer's company are prisoners till they're exchanged; a pirate's go in irons to be tried for their lives.
- **Scurvy** after ${CRUISE.scurvyAfter} days at sea, and **the men's temper** when the prizes don't come: put in for limes, promise them the next prize, seize the ringleaders, or put about for home.

A hand isn't asked the captain's business: you hear of the chase and the prize, and in a boarding choose your own part (first over the rail, with the rest, or hanging back). The captain or the highest player aboard answers the rest, with the captain's odds. A matter left unanswered a few days is settled the captain's way.

${preyTable()}

## Coming home: the prize court, or the fence
A privateer's prizes go to the **prize court** at home: its fees and the Crown's part (${pct(CRUISE.court)}), then half to her owners and half to her company by their parts, about ${CRUISE.courtDays} days after she's in. A pirate's go to a fence in ${CRUISE.fenceDays} days: ${pct(CRUISE.fence.haven)} of their worth at a haven, ${pct(CRUISE.fence.den)} from the den of a town you know, ${pct(CRUISE.fence.quay)} from a smuggler on the quiet. A pirate captain may make for a haven to sell.

${sharesTable()}

## The law
- A privateer who takes a ship her commission doesn't cover (a neutral, or her own nation's) makes **pirates** of everyone aboard, from that day.
- The **peace** voids a commission: a privateer at sea puts about for home, and anything taken after it is given back.
- Every prize a pirate takes adds the law's **heat** and notoriety; taken, it's the gaol and a trial for piracy, and the rope.
- **The King's pardon**: James II's proclamation of 1688, and George I's of September 1717 (to the end of 1718), forgave any pirate who surrendered to a governor. Take it from Work › At sea at an English colony; taken and broken, the heat comes double.

## Your own boat on a cruise
A sloop or bigger, crewed and sound (hull 50 or more), at Work › At sea: take out a letter of marque at a port of a colony at war (the fees are on the button: 3 coins and half her guns), choose a ground, a short cruise (${CRUISE.hunt.short} days on the ground) or a long one (${CRUISE.hunt.long}), and fit her out: victuals and powder, ${CRUISE.outfit} a month for each of her company's parts. You command her. As her owner you take the owners' half of a privateer's prizes as well as your captain's parts; a pirate who brings his own ship takes ${pct(CRUISE.pirateShip)} first. Or stay ashore and send her privateering with a mate as skipper ([[boats|Boats]]).

## A privateering company
In wartime, at a port of a colony at war, **get up a company** (Work › At sea): choose her (a ${COMPANY.kinds.map((k) => BOATS[k].name.toLowerCase()).join(", ")} new from the yard, or a boat of your own put in at what she'd fetch) and put in your stake. **Ask** other players by letter (they can put in from wherever they are); the **town's merchants** will take up what's wanting for a silent share. When there's coin enough for the ship, her commission and a first cruise's victuals, **sign the owners' articles**: a partnership like any other ([[partners|Partnerships]]), each owner's share what they put in, with the chest, the books, votes, buying out and winding up (her worth counts in it).

The managing owner sends her cruising, under a hired captain or commanding her in person; other owners who are players may sign aboard as officers or hands. The owners' half of what the prize court condemns is paid out at once, by share. Her keep in port comes from the chest, called from the owners when it's bare. If she's taken or founders, the company keeps its chest and may buy another ship; the peace voids her commission till the next war.

## The trades that travel
Some trades now go in person, every month or two, as a scene: go with it, on the map, or stay ashore and send word.

${voyagesTable()}

Be aboard when she sails home from the far port, or she goes without you (your venture comes home at a discount). The soldier already marches with his army; a trapper's own trips and a guide's are their work as ever.

## The hurricanes
The season runs June to November, worst in August and September: about five storms a year, never more than ${MAX_STORMS} at once. They're born in the tropical Atlantic east of the islands, or early and late in the western Caribbean and the Gulf, and move ${STORM_KM[0]} to ${STORM_KM[1]} km a day: west and west-north-west through the islands, then most turn north and north-east; some run on into the Gulf, a few up the coast. Over warm water they build; over the big islands, the mainland and the cold north they blow themselves out. Each is named, as the Spanish islands named them, for the saint of its day.

On the map each turns slowly, with its track behind it and a faint cone of where it's heading. A day or two ahead (within ${WARN_KM} km and coming your way) come the **signs**: a long swell, a falling glass, a red sky. Ashore, batten down (and haul up your boats); at sea, run for a harbour, or stand on.

Where the eye passes:
- **Ships at sea**: a scene (run before it, or heave to), the hull battered, days lost, wounds; a ship can founder. The world's ships are blown off their course and delayed.
- **Towns**: roofs and crops, ships in the harbour driven ashore (yours too), some drowned, unrest, and food (and sugar, where the cane was flattened) dear for a month or two. The news and the gazette report it; a governor decides how it's rebuilt.

## How fast the sea is
- **A passage** on someone else's ship: ${PASSAGE_FIND_DAYS} days in port to find one going your way, then about ${SEA_KM_DAY} km a day, and ${PASSAGE_CALL_DAYS} day at each port of call when the voyage goes on. A short crossing (under ${SHORT_CROSSING_KM} km, a ferry over the James, across a bay) is a day or two.
- **Your own boat**: ${OWN_BOAT_PORT_DAYS} day to get away, then ${SEA_KM_DAY} km a day times her speed (${(["sloop", "schooner", "brig", "ship"] as const).map((k) => `${BOATS[k].name.toLowerCase()} ${BOATS[k].speed}`).join(", ")}).
- **A canoe** along the coast: a day to the water, then ${CANOE_SPEED} of a ship's pace.

So Boston to New York is about 6 days by passage and 4 in your own sloop (19 on foot); Jamestown to Charles Town 8 (6); New York to St. Augustine 13 (10). In a northern winter the frozen harbours shut.

> Tip: A privateer's best ground is where the enemy's ships pass: the page picks it for you, and shows the odds of each. A long cruise takes more prizes and brings scurvy; a schooner outsails nearly everything.`,
  glossary: [
    ["Articles", "The shares of a ship's company, signed before a cruise.", "sea"],
    ["Letter of marque", "A governor's commission to take the enemy's ships, in wartime.", "sea"],
    ["Prize court", "The court that condemns and sells a privateer's prizes.", "sea"],
    ["Privateering company", "Owners who fit out a privateer, by shares.", "sea"],
    ["Hurricane", "A great storm out of the tropical sea, June to November.", "sea"],
  ],
};
