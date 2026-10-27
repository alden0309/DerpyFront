# Scenarios

Historical wars on maps DerpyFront already has. Each scenario is one data file
here, `<id>.json`, plus its line in `index.json` and a few keys in
`resources/lang/en.json`. The engine reads the data at the start of a game
(`packages/engine-lib/src/scenario/`, `packages/engine/src/scenario/`), the
Scenarios screen draws its picture from it, and the lobby seats players by it.

The data files are written by the border tools (the SCEN track's scratch
`r25-scen/tools/`, see its README): a recipe says which historical or modern
borders each nation takes, and the build writes the polygons, the snapped
capitals and structures, and `index.json`. You can also edit a file by hand;
`tests/scenario/ScenarioTerritory.test.ts` checks every file (the index,
every land tile owned, spot pixels, each nation's land holding together)
and `tests/scenario/ScenarioData.test.ts` its flags and en.json keys.

## What a scenario is

- **Nations** start on their historical land, every land tile owned. There is
  no spawn phase.
- **Sides** are teams: everyone on a side is permanently on the same team (no
  alliances to break, nothing expires, side-mates can't attack each other),
  and a side wins together. Any number of sides.
- **Neutrals** (`"side": null`) are on no team. Either side may attack them.
  A neutral that is invaded (a land attack, a landing from the sea, or a nuke
  or missile launched at its land) joins the invader's enemies for good: with
  two sides the other side; with three or more, the other side it shares the
  longest land border with, or if it borders none of them, the smallest. A
  neutral that attacks a side joins that side's enemies the same way. Either
  way it is a news line for everyone.
- **Victory:** a side wins when every other side is gone (a side holding
  under 0.2% of the land, a leftover fort or islet, counts as gone),
  when it holds all the starting land its `winByHolding` names, or when it
  holds more than its bar of the land: the side's own `winPercent`,
  else the scenario's (Overtime lowers every bar as in other games). Sides
  that start very unequal get unequal bars (1939: the Allies hold 60% at the
  start, the Axis 19%). At the lobby timer, or the 170-minute limit, the side
  nearest its bar (its land over its bar) wins.
- **Fronts hold** (every scenario, `packages/engine/src/scenario/ScenarioFronts.ts`):
  - _Homeland:_ attacking a nation on its own starting land costs more, and
    more again the more of its starting size it has lost (a last stand).
  - _Supply lines:_ an attack costs more the farther it is from the
    attacker's own starting land (over land or sea, so landings count).
  - The factors multiply, with a special rule's `attackFactor`, into one
    that multiplies both the attacker's troop loss per tile and the time a
    tile takes. Defaults below; a scenario may override them with `fronts`.
    Ordinary games never use them.
- Players pick a nation (solo, or a seat in a private lobby). They play it
  under its name and flag, with their own name added: "France (Alden)".
  Nations nobody picked are computer-run, at the game's difficulty.
- The game is a team game (`gameMode: Team`, `playerTeams` = the number of
  sides) with `scenario: { id, seats }` in its config. Random tribes are off.

## The file

```jsonc
{
  "id": "europe1939", // its id: [a-z0-9_]{1,32}, never reused
  "title": "Europe 1939", // English name (records, live games list)
  "map": "Europe", // GameMapType value (the map's name)
  "year": 1939,
  "winPercent": 60, // % of the land a side must hold to win
  "capitalFullTiles": 40000, // optional, see Capitals
  "fronts": { "supplyMax": 2.5 }, // optional, see Fronts
  "rule": "korea", // optional special rule (ScenarioRules.ts)
  "overtimeFrom": 40, // optional: Overtime from minute 40, whatever the host picked
  "sides": [
    { "id": "Axis", "name": "Axis", "color": "#7d7d7d", "winPercent": 40 },
  ],
  "nations": [
    {
      "key": "germany", // [a-z0-9_]{1,32}, unique in the scenario
      "name": "Germany", // English, its name in the game
      "flag": "de", // a file in resources/flags, without .svg
      "side": "Axis", // a side id, or null for a neutral
      "color": "#6f6f6f", // its territory colour
      "troopsPercent": 95, // starting troops, % of its troop cap
      "gold": 2000000, // starting gold
      "troopCapBonus": 700000, // optional: troops added to its cap
      "troopGrowth": 1.5, // optional: troops grow back 1.5 times as fast
      "goldIncome": 0.6, // optional: earns 60% of the usual gold
      "capital": [1572, 760], // map pixel of its capital
      "structures": [
        // optional, built and finished at the start
        { "type": "City", "at": [1413, 718], "level": 2 },
        { "type": "Port", "at": [1419, 690] },
      ],
      "warships": [[1437, 676]], // optional, water pixels near its ports
      "playable": true, // optional (default true): may players pick it
      "regions": ["1520,700,3,0,2,1"], // its territory, see below
    },
  ],
}
```

- **Coordinates** are pixels of the map's full-size `map.bin` (the Normal
  size). A Compact game halves them.
- **Sides:** `id` is the side's team name in the game, its key in en.json and
  the `Winner` the game records. `name` is the English name the server writes
  into the game's record. `color` marks the side wherever players are listed.
  `winPercent` (optional) is the side's own bar for a land win.
  `winByHolding` (optional), `{ "nations": ["south_korea"], "ignoreUnder":
200 }`: the side also wins as soon as it holds all the starting land of
  those nations. Pieces of that land (4-connected, of one nation) smaller
  than `ignoreUnder` full-size tiles don't count, so a few islets left
  don't hold the war up. Korea 1950: North Korea wins holding all of South
  Korea, whatever the UN still holds in Japan.
- **Nations:** listed in the order the Scenarios screen and the seat fallback
  use (the strongest first reads best). `name` must equal en.json's
  `scenario_nation.<key>`. Keys are global in en.json: reuse `germany` across
  scenarios if the name is the same, use another key ("german_empire") if not.
- **Troops** are a percent of the nation's troop cap once its capital and
  cities stand, so they hold on every difficulty and map size (computer-run
  nations' caps already scale with the difficulty).
- **troopCapBonus** (troops as players see them) raises a nation's troop cap
  for the whole game: an army the map can't show, like Britain's from
  overseas in 1776 (880K against the one United Colonies, 6.5M against the
  thirteen, who attack it from every side). Half as much in a Compact game.
  Tune it with the balance runs.
- **troopGrowth** (optional, default 1) multiplies how fast a nation's
  troops grow back: deep reserves. Troop growth is concave (it grows with
  troops to the power 0.73), so a coalition of many small nations regrows
  faster in all than one big nation with the same troops, and a lone great
  power facing many needs this (1776: Britain against thirteen colonies).
  Tune it with the balance runs, with `troopCapBonus`.
- **goldIncome** (optional, default 1) multiplies a nation's gold income:
  trade ships, trains and the steady income. A blockade's 0.6: Thirteen
  Colonies 1776's colonies, whose trade among thirteen friendly colonies
  otherwise pays for cities enough to outgrow Britain's army.
- **overtimeFrom** (optional) turns Overtime on from that minute, whatever
  the host picked: both sides' bars sink 2 points a minute from then on, so
  a side that is holding out wins if the other can't break through first
  (Thirteen Colonies 1776: from minute 40).
- **Structures:** `City`, `Port`, `Factory`, `Defense Post`, `Missile Silo`,
  `SAM Launcher`, with an optional `level`. Each stands at the nearest place
  its owner may build one (on its own land, a port on the coast, 15 tiles
  from the others); one that finds no place is skipped. The capital is a
  Capital, the fork's one-per-nation building.
- **Forts, bases and industry at the start** are structures too, and keep to
  the period (no silos or SAMs before the missile age):
  - a _fortified line_ is a row of `Defense Post`s, one every 16 tiles or
    more (a post guards the land 30 tiles round it), `level` 2 for the
    great forts (a stacked post defends half as hard again): Europe 1939's
    Westwall, Maginot Line, Mannerheim and Stalin Lines; 1776's Quebec,
    Ticonderoga, Niagara, Fort Pitt;
  - a _naval base_ is a `Port` (`level` 2 for the main ones) with
    `warships` off it;
  - an _industrial centre_ is a `Factory`.
- **Warships** start at their nation's nearest port on the same water and
  sail to their station (the pixel given), so a fleet needs a port on its
  water: a lake fleet a port on the lake (1776: Britain's on Lake Champlain
  sails from Saint-Jean, above the Richelieu's rapids).
- **Capitals** give a troop bonus (200K) whatever the nation's size, which
  would make every small state a fortress. With `capitalFullTiles`, a capital
  gives its full bonus only to a nation holding at least that many (full-size)
  tiles, and a share of it below that.
- **Fronts** (optional; any field left out takes its default):

  | Field             | Default | What it does                                                                |
  | ----------------- | ------- | --------------------------------------------------------------------------- |
  | `homeland`        | 0.5     | extra cost of attacking a nation on its own starting land (+50%)            |
  | `lastStand`       | 2.0     | further cost there: + this x the share of its starting size it has lost     |
  | `supplyFreeRange` | 40      | full-size tiles an attacker may push beyond its starting land without cost  |
  | `supplyPer100`    | 0.5     | extra cost per 100 full-size tiles beyond that (+50%)                       |
  | `supplyMax`       | 2.5     | the most the supply cost reaches (attacks at two and a half times the cost) |

  So a defender that has lost half its size, on its own soil, against an
  attacker 300 tiles from home, makes each tile cost 2.5 x 2.3 = 5.75 times
  the usual troops and time. (Round 1's first values, 0.3, 1.0, 40, 0.3 and
  2.0, let an early push snowball; these were tuned on the balance runs so
  a war turns more than once. A scenario that sets all five, as SCEN2's do,
  is unaffected by the defaults.)

- **Regions** are polygons in pixel corners: each ring is a string
  `"x0,y0,dx1,dy1,dx2,dy2,..."`, deltas after the first point. A tile is
  in a polygon when its centre is; a nation's rings fill even-odd (a ring
  inside another is a hole). Where two nations overlap, the first in the list
  keeps the tile, and land that no polygon covers goes to the nearest nation
  (in steps over land, then across water). So polygons may run out to sea:
  only land matters, and the tools draw them through the sea to keep them
  small. Keep a file to a few tens of KB.

## Adding or changing a scenario

**The edition.** A game records the scenarios' edition it was played under
(`SCENARIO_EDITION` in `packages/engine-api/src/game/Scenarios.ts`, set by
`applyScenarioRules`), and a replay of a game from another edition is
refused like one from another build (its war would not play the same).
Bump it when you change how the scenarios play (the front rules' defaults,
the engine's scenario rules). When only one scenario's play changes (its
data or its rule), give that scenario an edition of its own instead
(`SCENARIO_EDITION_OF` there): its older games are refused, the others'
still replay. Adding a new scenario needs no bump. Edition 2 (round 2)
moved the 1776 scenarios to American Revolution - Detailed and added the
fronts, the 1939 forts and the purges; Thirteen Colonies 1776's own
edition 3 added the blockade and Overtime from minute 40.

1. Write its recipe and build it with the border tools (projection fit for a
   new map, borders, capitals, structures), or write the JSON by hand.
2. Its file goes in `ScenarioData.ts`'s list (one import), its id in
   `index.json` (the tools add it; the order is the menu's).
3. en.json:
   - `scenarios.<id>.title`, `scenarios.<id>.date`,
     `scenarios.<id>.description` (two or three plain, historical lines),
     optional `scenarios.<id>.neutral` (the neutrals' heading, default
     "Neutral");
   - `scenario_nation.<key>` for each new nation key;
   - `team_colors.<side id in lower case>` (the side's name, shown as its
     team) and `scenarios.win.<side id in lower case>` ("The Allies win").
4. Run `npx vitest tests/scenario --run`.

A special rule (something data can't say, like a nation joining a side on a
condition) is a `ScenarioRule` in `SCENARIO_RULES`
(`packages/engine/src/scenario/ScenarioRules.ts`), named by the data's
`rule`. Its hooks:

- `start(game)`: once the board is laid out;
- `sideToJoin(game, neutral, against)`: choose (or refuse, with null) the
  side a neutral joins;
- `holdsFire(game, nation)`: a computer-run nation on a side starts no
  attacks for now (Europe 1939's pact and Phoney War);
- `attackFactor(game, attacker, defender)`: a further factor on the cost of
  an attacker's attacks (Europe 1939: the Soviet Union's purged officer
  corps, for the first minutes).

Add a hook there if a scenario needs another; it runs on every client, so
keep it deterministic (the game's ticks and state, integer or plain
arithmetic, DetMath for anything else; no clocks, no Math.random).

The `title` is the English name the server uses (the game's record, the live
games list); the menu shows `scenarios.<id>.title`.

<!-- DIPLO (r27) -->

## Courting the neutrals (DIPLO, round 27)

The sides may court the neutrals instead of invading them
(`packages/engine/src/scenario/ScenarioDiplomacy.ts`):

- **Gifts.** A nation on a side sends a neutral gold (its panel's "Send a
  gift", or the radial menu's handshake). The gold goes to the neutral, and
  raises its **goodwill** toward the giver's side by as much. Every side can
  give, so it can become a bidding war. Goodwill fades by about 4% a minute.
- **Invitations.** A side's nation invites a neutral to join. A computer-run
  neutral says yes when its goodwill toward that side has reached its price
  there and the war is old enough for a neutral of its size; otherwise it
  says no and why ("Spain is wary of the Axis: not ready to join"). A
  neutral played by a person gets a Join / Decline card for a minute. One
  invitation per side per neutral a minute.
- **Asking to join.** A neutral played by a person may ask a side to join it
  (its own panel, or a side's nation's). The side's people get an Accept /
  Refuse card and the first answer decides. If nobody answers in 30
  seconds, or nobody on the side is a person, the computer answers: yes,
  unless the side has no nation left in the war. One ask per side a minute.
- **Joining** is for good, as with an invasion: the neutral is on that side
  and at war with the others, and everyone sees "Spain joins the Axis".
  Invading a neutral still pushes it to the invader's enemies.
- **Computer-run sides** set 15% of their richest computer-run nation's
  income aside in a chest for gifts (taken from that nation; the richest,
  not all: thirteen colonies don't court thirteen times as hard as one
  Britain), up to five minutes of the going rate. They court the neutral
  leaning their way (eager or leans) that is nearest to joining, if they
  could win it within about ten minutes of setting aside: a down payment of
  a quarter of what it needs, which shows on its panel, then, once the
  chest holds it all and the war is old enough, the rest at once, a little
  over the price, and an invitation straight after. They invite any
  neutral that is ready (a person's at most every three minutes).

**The price** of a neutral for a side is its **size**, in minutes of a big
nation's income, times the **going rate**, times its **leaning** there:

- _size_: 40 times its troop cap over the mean cap of the three biggest
  nations on the sides, at the start, between 1.5 and 10 minutes;
- _going rate_: the mean income a minute so far of the three biggest
  earners on the sides (at least 1M), so prices rise as the war economy
  grows;
- _leaning_: the data's word for that side (below).

A neutral joins nobody before minute 4 + its size (at least 6, at most 14):
nobody buys a big neutral in the first minutes. The numbers are
`DIPLOMACY_TUNING` in ScenarioDiplomacy.ts.

**The data.** A neutral's `leaning` gives a word per side (a side left out
is "open"), and `leaningLate` changes some of them from a minute on:

```json
"leaning": { "Axis": "reluctant", "Allies": "reluctant" },
"leaningLate": { "minute": 45, "sides": { "Allies": "open" } }
```

| word        | price | meaning                                                   |
| ----------- | ----- | --------------------------------------------------------- |
| `eager`     | x0.6  | it joined this side in the real war, or allied with it    |
| `leans`     | x0.8  | sympathy, a treaty, trade or a dynasty pulled it this way |
| `open`      | x1    | no strong pull either way                                 |
| `reluctant` | x1.5  | distrust or old grievances                                |
| `opposed`   | x2.5  | it opposed this side's aims, or fought it                 |
| `aloof`     | x6    | it held to strict neutrality all war: close to impossible |
| `never`     | -     | history says it could not happen (used once, sparingly)   |

Every neutral in every scenario has a word for every side
(`tests/scenario/ScenarioDiplomacy.test.ts` checks it); a nation on a side
has none. They are the nations' own interests as history shows them, not
prizes: the 1776 native nations, for one, weighed which side threatened
their land more. The border tools' recipes don't know these fields, so a
scenario rebuilt from its recipe needs its leanings copied back.

Courting needs the scenario's edition 3 (Thirteen Colonies 1776: 4);
older games have none and their replays are refused, as with any edition.

<!-- DIPLO (r27) end -->

## Goals (DFX, round 26)

Every playable nation has one optional historical goal, in `goals.json`
(`goals.<scenario>.<nation>`), with its words in en.json
(`scenario_goal_text.<scenario>.<nation>`, "Hold Warsaw past minute
{minute}": the minute goes in as the map's, below).
It shows under the nation on the Scenarios screen, the solo screen's panel
and Random history's reveal, and in game as a line under the timer that is
ticked when it's met. It never affects winning.

```json
"poland": { "kind": "hold", "place": { "capitalOf": "poland" }, "minute": 20 },
"germany": { "kind": "take", "place": { "capitalOf": "soviet_union" } },
"italy": { "kind": "take", "place": { "name": "Alexandria", "at": [2221, 1627], "of": "united_kingdom" }, "minute": 35 },
"tennessee_gulf": { "kind": "keep", "place": { "capitalOf": "virginia_nc" }, "side": true },
"kentucky": { "kind": "hold", "place": { "capitalOf": "kentucky" }, "minute": 30, "onSide": "Union" }
```

| field    | meaning                                                                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`   | `hold`: hold the place at `minute` (met then, or when the war ends first with it held; missed after). `take`: hold it at any moment, before `minute` if given. `keep`: hold it when the war ends. |
| `place`  | a nation's capital (`capitalOf`), or a named spot (`name`; `at`: full-size map pixels, like the data's; `of`: the nation that holds it at the start).                                             |
| `minute` | minutes since the war began (the timer), on a Normal map. On a Compact map it's half, rounded up (`goalDueMinute`), in the check, the countdown and the words.                                    |
| `side`   | optional: your side holding the place counts, not only you ("Keep Washington in Union hands to the end", "Help take Moscow").                                                                     |
| `onSide` | optional: when it's checked you must be on this side (a side id), or on any side (`"any"`, for a neutral: at war). A neutral joins a side by attacking the other (or being invaded).              |

**The goal's tile.** A place is one tile in each map size: the tile nearest
the spot that its nation (`capitalOf`, or `of`) holds at the start. They are
worked out ahead into `goal-tiles.json` by `npx tsx scripts/scenario-goal-tiles.ts`
(run it after changing `goals.json` or a scenario's land): halving the
spot for a Compact game can land across a border river (Belgrade's pixel
is Austria-Hungary's bank of the Sava there), and a tiny place (Gibraltar,
the Faroes) can vanish from the Compact map altogether.

How it's checked: the engine checks each human player's goal once a second
(`WinCheckExecution`) and once more when the war ends (`GameImpl.setWinner`),
by `engine-lib/scenario/ScenarioGoals.ts`, and writes the tick it was met in
the player's stats (`goal`). Stats are bookkeeping, outside the game's hash,
so goals change nothing in play and need no rules edition. The saved game
carries the stats; the server pays **200 Derp Coins** (`GOAL_COINS`) for a
goal met, once per goal per account (`derpy_scenario_goals`), only in a game
on Hard or Impossible (`GOAL_DIFFICULTIES`, read from the saved config), under
the coin lines' own rules (a game long enough to pay, the player spawned, no
cheats, someone to play against). Losing the war doesn't stop a goal met
paying. The win screen shows "Goal met: +200" on its coin line (below Hard:
"goals pay on Hard and Impossible").

Writing one: keep it historical (a battle, a campaign's aim, a claim of the
time), reachable but a little difficult on Hard. Defensive goals ("Hold X
past minute M") for nations that were attacked; offensive ones ("Take Y
before minute M") for the attackers; neutrals, which nobody attacks while
the sides are at war, get a claim of the time to take, or to join a side
and hold their capital. A handful of small neutrals that could reach no one
join the war and hold their capital to the end (`onSide: "any"`: Iceland
1939, Mohican, Catawba, San Marino, Malta, the Choctaw and Chickasaw, Norway
1914); keeping out would be free.

Check that a goal doesn't happen by itself: `tests/scenario/ScenarioBalance.ts
--goals --difficulty Hard` prints the minute each computer-run nation met its
own goal. A place right on a border falls in the first minutes on Hard
(Slovakia's Zakopane, Russia's Kraków in 1914, Serbia's cities), and a side
that wins takes its neighbours' capitals mid-war, so those goals need a
farther place, a tight minute, or to be held ("Take Paris and hold it at
minute 20").
`tests/scenario/ScenarioGoals.test.ts` checks every goal: a playable
nation's, its place on land in both map sizes, a take goal's place not held
at the start, a hold goal's own place held, an `onSide` side that exists,
and its words in en.json. The named spots were placed from their longitude
and latitude with the border tools' fitted projections.

## Sources and credits

- Europe 1939: borders from aourednik/historical-basemaps `world_1938`
  (GPL-3.0), corrected to 1 September 1939; modern lines from Natural Earth
  (public domain) where they haven't moved.
- 1776 (map American Revolution - Detailed): colony lines from the US
  Census cartographic boundary files (public domain) and hand-drawn treaty
  lines; the map's own native nations. Britain's Quebec and Nova Scotia are
  exactly the land that is dark (impassable) on Thirteen Colonies -
  Detailed, today's Canada.

<!-- SCEN2 (r25): the six more scenarios -->

- World War I: aourednik/historical-basemaps `world_1914` (GPL-3.0) for the
  eastern frontiers and the partition lines of Poland, with Natural Earth
  admin-0 and admin-1 units (public domain) where a 1914 border is a border
  today, and hand-drawn corrections (the 1913 Balkan treaties, Alsace-Lorraine,
  North Schleswig, Kars and Batumi).
- Napoleon 1812, Italy 1859, the American Civil War, the Korean War: Natural
  Earth admin-0 and admin-1 units (public domain) with hand-drawn lines (the
  1810 Hanseatic line, the Rhine Confederation's kingdoms, the Duchy of
  Warsaw; the 1859 state lines; the 1861 territories and Indian Territory's
  nations; the 38th parallel).
- Three Kingdoms 219: hand-drawn from the commandery lines of standard
  historical atlases.
- Map projections: fitted from each map's land mask against Natural Earth.

<!-- DIPLO (r27): the neutrals' leanings -->

- The neutrals' leanings (`leaning`, `leaningLate`): Wikipedia, "Spain
  during World War II", "Portugal during World War II", "Anglo-Portuguese
  Alliance", "Irish neutrality during World War II", "Switzerland during the
  World Wars", "Sweden during World War II", "Turkey in World War II",
  "Denmark in World War II", "Occupation of the Baltic states", "Klaipėda
  Region", "Invasion of Iceland", "Anglo-Soviet invasion of Iran", "Saudi
  Arabia in World War II"; "Native Americans in the American Revolution",
  "Joseph Brant", "Stockbridge Militia", "Treaty of Fort Pitt", "Cornstalk",
  "Cherokee–American wars", "Catawba people", the Treaty of Watertown (1776)
  and historyofmassachusetts.org, "Native Americans in the Revolutionary
  War"; "Italy in World War I", "Treaty of London (1915)", "Ottoman–German
  alliance", "Bulgaria during World War I", "Romania in World War I",
  "Greece during World War I", "Portugal in World War I", "German
  occupation of Luxembourg during World War I", "Principality of Albania",
  "Persian campaign (World War I)"; "Leopold II, Grand Duke of Tuscany",
  "Francis V, Duke of Modena" (and his Estense brigade, which followed him
  into Austrian Venetia in June 1859, ilmondodeglischuetzen.eu), "Battle of
  Grahovac", "Second Italian War of Independence"; "Act of Mediation",
  "Treaty of Bucharest (1812)", "Russo-Persian War (1804–1813)", "First
  Serbian Uprising", "Montenegro (Bay of Kotor, 1806–1814)", "Slimane of
  Morocco" and yabiladi.com, "1805: Morocco supplied the British fleet";
  "Gongsun Kang", "Goguryeo–Wei War", "Battle of Mount Qi" (Kebineng's
  Xianbei with Shu, 231), "Zhuge Liang's Southern Campaign" (Yong Kai and
  Wu), "Lu Xun (Eastern Wu)" (Cao Cao's seal for Fei Zhan and the
  Shanyue), "Shanyue"; "Kentucky in the American Civil War", "Indian
  Territory in the American Civil War", "List of treaties of the
  Confederate States of America" (the Creek treaty of 10 July, the Choctaw
  and Chickasaw of 12 July and the Cherokee of 7 October 1861), "John Ross
  (Cherokee chief)", "Opothleyahola".
