// Places where the life layer listens to the world engine without the world
// engine importing it: a character dying, a battle being fought, a ruler
// being chosen. The life modules register themselves when Game.ts loads.

import type { ConquestGame } from "./Game";
import type { Army, BattleReport, Character, Life, LifeCommand } from "./Types";

export const hooks = {
  /** After a character has died (the world's own bookkeeping is done). */
  death: [] as ((g: ConquestGame, c: Character, cause: string) => void)[],
  /** After a battle's report is filed. */
  battle: [] as ((
    g: ConquestGame,
    r: BattleReport,
    attackers: Army[],
    defenders: Army[],
  ) => void)[],
  /**
   * A colony needs a governor the crown chooses: a character to appoint, or
   * -1 to let the old rules pick from the council.
   */
  successor: [] as ((g: ConquestGame, n: number) => number)[],
  /** A baby born in the monthly round. */
  birth: [] as ((
    g: ConquestGame,
    kid: Character,
    mother: Character,
    father: Character,
  ) => void)[],
  /** Life commands answered by movements and politics: an error, null, or undefined (not mine). */
  command: [] as ((
    g: ConquestGame,
    life: Life,
    c: LifeCommand,
  ) => string | null | undefined)[],
  /** Characters the nations' own monthly round should leave alone (players). */
  skip: [] as ((g: ConquestGame, c: number) => boolean)[],
  // LIFE (r11)
  /** Each day of each living life, after the life's own round. */
  lifeDaily: [] as ((g: ConquestGame, life: Life) => void)[],
  /** Each month of each living life, after the life's own round. */
  lifeMonthly: [] as ((g: ConquestGame, life: Life) => void)[],
  /** Before any life command: why it can't be done now (in a cell...), or null. */
  gate: [] as ((
    g: ConquestGame,
    life: Life,
    c: LifeCommand,
  ) => string | null)[],
  // MAP (r12)
  /** After each life command (achievements earned by it show at once, even paused). */
  afterCommand: [] as ((g: ConquestGame, life: Life) => void)[],
  /** Puts an event to a life (LifeEvents.ts registers it), without importing it. */
  raise: [] as ((
    g: ConquestGame,
    life: Life,
    key: string,
    ctx: Record<string, number>,
  ) => void)[],
  // HOME (r12)
  /**
   * A duel was fought (Duels.ts): the law may take an interest (a trial, a
   * warrant). Called once per duel, after its outcome, with the life that
   * fought it. Duels.ts already adds the law's heat for a death.
   */
  duelAftermath: [] as ((
    g: ConquestGame,
    life: Life,
    d: import("./Types").DuelAftermath,
  ) => void)[],
  // EDU (r13)
  /** Lines of a life's month's budget kept elsewhere (school fees, college bills). */
  budget: [] as ((
    s: import("./Types").GameState,
    life: Life,
  ) => { label: string; value: number }[])[],
  /** An heir has just taken up the line (after the purse, skills and business passed). */
  heir: [] as ((g: ConquestGame, life: Life, heir: Character) => void)[],
  // PARTNERS (r13)
  /**
   * A player's letter reached its reader (Letters.ts): another module that
   * answers this kind of letter takes it (and returns true), or leaves it.
   */
  letterArrives: [] as ((
    g: ConquestGame,
    life: Life,
    l: import("./Types").Letter,
  ) => boolean)[],
  /**
   * Lines for the month's forecast only (Estate › Purse), from another module.
   * LEDGER (r15): a part may carry a `key` (the same as its flow's) and a
   * `chance` range; the world is passed for those that need the map.
   */
  forecast: [] as ((
    s: import("./Types").GameState,
    life: Life,
    w?: import("./Map").World,
  ) => import("./Types").Part[])[],
  // LEDGER (r15)
  /** At the very start of the world's month, before anything else is reckoned. */
  monthStart: [] as ((g: ConquestGame) => void)[],
  /** At the very end of the world's month, after everything else. */
  monthEnd: [] as ((g: ConquestGame) => void)[],
  /** Things of a player's out working, for the tracker (Estate › Ledger). */
  affairs: [] as ((
    s: import("./Types").GameState,
    w: import("./Map").World,
    life: Life,
  ) => import("./Types").AffairItem[])[],
  // EVENTS (r15)
  /**
   * The weight a drawn event (the daily draw, the road, the sea) has for a
   * life: its family's rest, fading with each showing, and never another
   * player's words. 0 holds it back.
   */
  eventWeight: [] as ((
    g: ConquestGame,
    life: Life,
    key: string,
    pool: import("./Types").EventPool,
    ctx: Record<string, number>,
    w: number,
  ) => number)[],
  /** An event has just been put to a life (drawn or raised). */
  eventFired: [] as ((
    g: ConquestGame,
    life: Life,
    key: string,
    pool: import("./Types").EventPool,
  ) => void)[],
  // SEA (r15)
  /** Each day of the world, after the lives' own (the hurricanes, ships at sea). */
  daily: [] as ((g: ConquestGame) => void)[],
  /**
   * A letter from afar (a computer character's) for a life: a module that
   * holds it back (at sea: it waits in port) takes it and returns true.
   */
  holdLetter: [] as ((
    g: ConquestGame,
    life: Life,
    key: string,
    ctx: Record<string, number>,
  ) => boolean)[],
  /**
   * A firm's month for a kind of firm kept elsewhere (a privateer): its
   * profit, or undefined if it isn't that module's.
   */
  firmMonth: [] as ((
    g: ConquestGame,
    f: import("./Types").Firm,
  ) => number | undefined)[],
  /** At your post or not, decided elsewhere (on a voyage of your own trade): undefined if not that module's. */
  atPost: [] as ((
    s: import("./Types").GameState,
    life: Life,
  ) => boolean | undefined)[],
  /** What a firm holds besides its chest, business, cargo and paper (a privateer's ship). */
  firmAssets: [] as ((
    s: import("./Types").GameState,
    f: import("./Types").Firm,
  ) => number)[],
  // INTRIGUE (r15)
  /**
   * A player's next turn at a gathering: a scene of its own (a wedding's
   * vows, a vignette of the evening), null for nothing more, or undefined to
   * leave it to the gathering. `here` is the computer's people who came.
   */
  gatherTurn: [] as ((
    g: ConquestGame,
    life: Life,
    gat: import("./Types").Gathering,
    here: Character[],
  ) => { key: string; c: number } | null | undefined)[],
  /**
   * A wedding's day has come: true to go ahead without marrying the couple
   * yet (they're married at the vows), false to call it off, "wait" to put it
   * off (the hook has set the new day), undefined if it isn't one of yours.
   */
  weddingBegins: [] as ((
    g: ConquestGame,
    gat: import("./Types").Gathering,
  ) => boolean | "wait" | undefined)[],
  /** A gathering is over (held). */
  gatherHeld: [] as ((
    g: ConquestGame,
    gat: import("./Types").Gathering,
  ) => void)[],
  /** A married woman's chance of a child this year, as it's reckoned. */
  birthChance: [] as ((
    s: import("./Types").GameState,
    c: Character,
    e: import("./Explain").Explain,
  ) => void)[],
  // CHAIR (r16)
  /**
   * A colony's capital has fallen to another (Crown.ts's cede): the old seat
   * of government and the new one (-1 if nothing is left).
   */
  capitalMoved: [] as ((
    g: ConquestGame,
    n: number,
    from: number,
    to: number,
  ) => void)[],
  /** A new game is made: every polity and life in place, before the first delta. */
  created: [] as ((g: ConquestGame) => void)[],
};

/** LIFE (r11): put an event to a life through the registered raiser. */
export function raiseEvent(
  g: ConquestGame,
  life: Life,
  key: string,
  ctx: Record<string, number> = {},
): void {
  for (const r of hooks.raise) r(g, life, key, ctx);
}

export function skipped(g: ConquestGame, c: number): boolean {
  return hooks.skip.some((f) => f(g, c));
}
