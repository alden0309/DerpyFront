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

  | Field             | Default | What it does                                                               |
  | ----------------- | ------- | -------------------------------------------------------------------------- |
  | `homeland`        | 0.3     | extra cost of attacking a nation on its own starting land (+30%)           |
  | `lastStand`       | 1.0     | further cost there: + this x the share of its starting size it has lost    |
  | `supplyFreeRange` | 40      | full-size tiles an attacker may push beyond its starting land without cost |
  | `supplyPer100`    | 0.3     | extra cost per 100 full-size tiles beyond that (+30%)                      |
  | `supplyMax`       | 2.0     | the most the supply cost reaches (attacks at double cost)                  |

  So a defender that has lost half its size, on its own soil, against an
  attacker 300 tiles from home, makes each tile cost 1.8 x 1.78 = 3.2 times
  the usual troops and time.

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
Bump it when you change how an existing scenario plays (its data, its
rule, the front rules' defaults). Adding a new scenario needs no bump.
Edition 2 (round 2) moved the 1776 scenarios to American Revolution -
Detailed and added the fronts, the 1939 forts and the purges.

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

## Sources and credits

- Europe 1939: borders from aourednik/historical-basemaps `world_1938`
  (GPL-3.0), corrected to 1 September 1939; modern lines from Natural Earth
  (public domain) where they haven't moved.
- 1776 (map American Revolution - Detailed): colony lines from the US
  Census cartographic boundary files (public domain) and hand-drawn treaty
  lines; the map's own native nations. Britain's Quebec and Nova Scotia are
  exactly the land that is dark (impassable) on Thirteen Colonies -
  Detailed, today's Canada.
- Map projections: fitted from each map's land mask against Natural Earth.
