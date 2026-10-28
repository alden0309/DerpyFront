// DIPLO (r27): courting the neutrals in a Scenario. Gifts raise a neutral's
// goodwill toward the giver's side and fade; its price follows its size and
// its historical leaning; invited, a computer-run neutral says yes past its
// price and no (with the reason) below it, once a minute at most; a person's
// neutral answers, asks to join, and the side's people (or the computer)
// answer; joining is for good; computer-run sides court within a budget; and
// older scenario games have none of it.

import { GameMapSize, PlayerType } from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { DIPLOMACY_MESSAGES as M } from "@openfront/engine-api/game/ScenarioDiplomacy";
import {
  scenarioEdition,
  scenarioReplayable,
} from "@openfront/engine-api/game/Scenarios";
import { Intent } from "@openfront/engine-api/Schemas";
import {
  allScenarioData,
  scenarioData,
  scenarioNation,
} from "@openfront/engine-lib/scenario/ScenarioData";
import {
  isLeaningWord,
  LEANING_PRICE_PERCENT,
  leaningOf,
} from "@openfront/engine-lib/scenario/ScenarioLeaning";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { createGameRunnerFromSnapshot } from "@openfront/engine/GameRunner";
import {
  DIPLOMACY_TUNING,
  diplomacyEnabled,
  ScenarioDiplomacy,
  scenarioDiplomacy,
} from "@openfront/engine/scenario/ScenarioDiplomacy";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScenarioGame, scenarioGame } from "./ScenarioTestUtil";

const SAVED = { ...DIPLOMACY_TUNING };
afterEach(() => {
  Object.assign(DIPLOMACY_TUNING, SAVED);
  vi.restoreAllMocks();
});

interface Seat {
  clientID: string;
  username: string;
  nation: string;
}

/** A scenario game at its current edition (so it has courting). */
async function courtGame(
  id: string,
  players: Seat[] = [],
  size?: GameMapSize,
  edition = scenarioEdition(id),
): Promise<ScenarioGame> {
  const seats: Record<string, string> = {};
  for (const p of players) seats[p.nation] = p.clientID;
  const g = await scenarioGame(id, {
    players,
    size,
    config: { scenario: { id, seats, edition } },
  });
  g.step(20); // sizes are fixed two seconds in
  return g;
}

function d(g: ScenarioGame): ScenarioDiplomacy {
  const dip = scenarioDiplomacy(g.game);
  if (dip === null) throw new Error("no courting in this game");
  return dip;
}

/** One tick with one player's intent. */
function send(g: ScenarioGame, clientID: string, intent: Intent): void {
  g.runner.addTurn({
    turnNumber: g.game.ticks(),
    intents: [{ ...intent, clientID }],
  });
  g.runner.executeNextTick();
}

function messages(g: ScenarioGame, key: string) {
  return g.updates
    .flatMap((u) => u.updates[GameUpdateType.DisplayEvent])
    .filter((e) => e.message === key);
}

function to(g: ScenarioGame, key: string, p: Player) {
  return messages(g, key).filter((e) => e.playerID === p.smallID());
}

const GERMANY: Seat = {
  clientID: "HUMAN001",
  username: "Alden",
  nation: "germany",
};

describe("gifts", () => {
  it("move the gold to the neutral and raise its goodwill toward the giver's side, which fades", async () => {
    DIPLOMACY_TUNING.aiCourts = false;
    const g = await courtGame("europe1939", [GERMANY]);
    const germany = g.nation("germany");
    const spain = g.nation("spain");
    // (Gold that isn't income: the going rate stays the game's own.)
    germany.setScenarioGold(germany.gold() + 5_000_000n);
    const before = germany.gold();
    const spainBefore = spain.gold();
    send(g, "HUMAN001", {
      type: "scenario_gift",
      neutral: spain.id(),
      gold: 2_000_000,
    });
    // Germany's own income comes in the same tick, a little.
    expect(Number(before - germany.gold())).toBeGreaterThan(1_900_000);
    expect(Number(spain.gold() - spainBefore)).toBeGreaterThanOrEqual(
      2_000_000,
    );
    expect(d(g).goodwillOf(spain, "Axis")).toBe(2_000_000);
    expect(d(g).goodwillOf(spain, "Allies")).toBe(0);
    expect(to(g, M.giftSent, germany)).toHaveLength(1);

    // It fades slowly: about 4% a minute.
    g.step(600);
    const left = d(g).goodwillOf(spain, "Axis");
    expect(left).toBeLessThan(1_940_000);
    expect(left).toBeGreaterThan(1_900_000);

    // Only to a neutral: a gift to a side's nation does nothing.
    const france = g.nation("france");
    const franceGold = france.gold();
    const gold = germany.gold();
    send(g, "HUMAN001", {
      type: "scenario_gift",
      neutral: france.id(),
      gold: 1_000_000,
    });
    expect(germany.gold()).toBeGreaterThanOrEqual(gold);
    expect(france.gold() - franceGold).toBeLessThan(100_000n);

    // A bad amount (not a number, endless) is ignored, not thrown mid-tick.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      d(g).gift(germany, spain, bad);
    }
    expect(germany.gold()).toBeGreaterThanOrEqual(gold);
  }, 120_000);
});

describe("prices and leanings", () => {
  it("cost more for the wrong side, follow the neutral's size, and never means never", async () => {
    DIPLOMACY_TUNING.aiCourts = false;
    const g = await courtGame("europe1939");
    const dip = d(g);
    const spain = g.nation("spain");
    const axis = dip.price(spain, "Axis")!;
    const allies = dip.price(spain, "Allies")!;
    // Spain leans Axis (80%) and opposes the Allies (250%).
    expect(allies / axis).toBeGreaterThan(3.1);
    expect(allies / axis).toBeLessThan(3.15);
    // Bigger neutrals cost more: Spain against Luxembourg, both "reluctant"
    // or worse for the Allies.
    const lux = g.nation("luxembourg");
    expect(dip.sizeOf(spain)).toBeGreaterThan(dip.sizeOf(lux));
    // Switzerland and Sweden hold aloof from both: six times the price.
    const sweden = g.nation("sweden");
    expect(dip.leaningPercent(sweden, "Axis")).toBe(600);
    expect(dip.price(sweden, "Axis")).toBe(dip.price(sweden, "Allies"));
    // A big neutral can't be bought in the first minutes; a small one sooner.
    expect(dip.earliestTick(spain)).toBeGreaterThanOrEqual(12 * 600);
    expect(dip.earliestTick(lux)).toBeGreaterThanOrEqual(6 * 600);
    expect(dip.earliestTick(lux)).toBeLessThan(dip.earliestTick(spain));

    // Napoleon 1812: the House of Savoy, on its island, never joins France.
    const n = await courtGame("napoleon1812");
    const sardinia = n.nation("sardinia");
    expect(d(n).price(sardinia, "French")).toBeNull();
    expect(d(n).price(sardinia, "Coalition")).not.toBeNull();
    expect(d(n).refusal(sardinia, "French")).toBe(M.refusedNever);
  }, 180_000);

  it("can change late in the war (Turkey, 1945)", () => {
    const turkey = scenarioNation(scenarioData("europe1939")!, "turkey")!;
    expect(leaningOf(turkey, "Allies", 44)).toBe("reluctant");
    expect(leaningOf(turkey, "Allies", 45)).toBe("open");
    expect(leaningOf(turkey, "Axis", 60)).toBe("reluctant");
    // A side the data doesn't name is "open".
    expect(leaningOf({}, "Allies", 0)).toBe("open");
    expect(LEANING_PRICE_PERCENT.never).toBeNull();
  });

  it("are given for every neutral in every scenario, by side", () => {
    // Every scenario, so a neutral added later (with no leaning) shows here.
    let neutrals = 0;
    for (const data of allScenarioData()) {
      const sides = data.sides.map((s) => s.id);
      for (const n of data.nations.filter((x) => x.side === null)) {
        neutrals++;
        expect(
          Object.keys(n.leaning ?? {}).sort(),
          `${data.id} ${n.key}`,
        ).toEqual([...sides].sort());
        for (const w of Object.values(n.leaning ?? {})) {
          expect(isLeaningWord(w), `${data.id} ${n.key} ${w}`).toBe(true);
        }
        for (const [s, w] of Object.entries(n.leaningLate?.sides ?? {})) {
          expect(sides).toContain(s);
          expect(isLeaningWord(w)).toBe(true);
        }
      }
      // Only neutrals have a leaning.
      for (const n of data.nations.filter((x) => x.side !== null)) {
        expect(n.leaning, `${data.id} ${n.key}`).toBeUndefined();
      }
    }
    expect(neutrals).toBeGreaterThanOrEqual(82);
  });
});

describe("invitations to a computer-run neutral", () => {
  it("say no below the price, with the reason; yes past it; once a minute", async () => {
    DIPLOMACY_TUNING.aiCourts = false;
    const g = await courtGame("europe1939", [GERMANY]);
    const dip = d(g);
    const germany = g.nation("germany");
    const spain = g.nation("spain");
    const france = g.nation("france");
    // (Gold that isn't income: the going rate stays the game's own.)
    germany.setScenarioGold(germany.gold() + 500_000_000n);
    const invite = () =>
      send(g, "HUMAN001", { type: "scenario_invite", neutral: spain.id() });

    // Too early in the war for a neutral of Spain's size.
    invite();
    const early = to(g, M.refusedEarly, germany);
    expect(early).toHaveLength(1);
    expect(early[0].params?.side).toBe("Axis");
    expect(Number(early[0].params?.minute)).toBeGreaterThanOrEqual(12);
    // Again at once: the cooldown holds, no second answer.
    invite();
    expect(to(g, M.refusedEarly, germany)).toHaveLength(1);
    expect(dip.view(germany, spain)?.court?.canInvite).toBe(false);
    expect(dip.view(germany, spain)?.court?.inviteCooldown).toBeGreaterThan(0);

    // (Let the war be old enough, for the test.)
    DIPLOMACY_TUNING.earliestMax = 0;
    g.step(600);
    invite();
    expect(to(g, M.refusedCold, germany)).toHaveLength(1);

    // Gifts, each right before its check (the going rate moves with time).
    const gift = (gold: number) =>
      send(g, "HUMAN001", {
        type: "scenario_gift",
        neutral: spain.id(),
        gold: Math.ceil(gold),
      });
    const axisWord = () =>
      dip.standing(spain).find((s) => s.side === "Axis")?.word;
    g.step(600);
    gift(dip.price(spain, "Axis")! * 0.45);
    expect(axisWord()).toBe("wary");
    invite();
    expect(to(g, M.refusedWary, germany)).toHaveLength(1);
    expect(spain.team()).toBeNull();

    g.step(600);
    gift(dip.price(spain, "Axis")! * 1.1 - dip.goodwillOf(spain, "Axis"));
    expect(axisWord()).toBe("ready");
    expect(dip.view(germany, spain)?.court?.goldToGo).toBe(0);
    invite();
    expect(spain.team()).toBe("Axis");
    const joined = messages(g, M.joined);
    expect(joined).toHaveLength(1);
    expect(joined[0].playerID).toBeNull(); // everyone hears
    expect(joined[0].params?.side).toBe("Axis");
    // At war with the Allies, a friend of Germany's.
    expect(spain.isFriendly(germany)).toBe(true);
    expect(spain.isFriendly(france)).toBe(false);
  }, 180_000);
});

describe("a neutral played by a person", () => {
  const SPAIN: Seat = {
    clientID: "HUMAN002",
    username: "Pat",
    nation: "spain",
  };
  const FRANCE: Seat = {
    clientID: "HUMAN003",
    username: "Kit",
    nation: "france",
  };
  const BRITAIN: Seat = {
    clientID: "HUMAN004",
    username: "Lee",
    nation: "united_kingdom",
  };

  it("answers an invitation, and asks a side to join: the first of its people to answer decides", async () => {
    DIPLOMACY_TUNING.aiCourts = false;
    const g = await courtGame("europe1939", [GERMANY, SPAIN, FRANCE, BRITAIN]);
    const dip = d(g);
    const germany = g.nation("germany");
    const spain = g.nation("spain");
    const france = g.nation("france");
    expect(spain.type()).toBe(PlayerType.Human);

    // Germany invites; Spain's player is asked, and says no.
    send(g, "HUMAN001", { type: "scenario_invite", neutral: spain.id() });
    const card = to(g, M.invited, spain);
    expect(card).toHaveLength(1);
    expect(card[0].params?.side).toBe("Axis");
    expect(card[0].focusPlayerID).toBe(germany.smallID());
    expect(to(g, M.inviteSent, germany)).toHaveLength(1);
    expect(dip.view(germany, spain)?.court?.personNeutral).toBe(true);
    send(g, "HUMAN002", {
      type: "scenario_join_reply",
      other: germany.id(),
      accept: false,
    });
    expect(spain.team()).toBeNull();
    expect(to(g, M.inviteDeclined, germany)).toHaveLength(1);

    // Spain's own view: it may ask either side.
    const own = dip.view(spain, spain)!;
    expect(own.ask?.map((a) => a.side)).toEqual(["Axis", "Allies"]);
    expect(own.ask?.every((a) => a.canAsk)).toBe(true);
    // Looking at France: it may ask the Allies.
    expect(dip.view(spain, france)?.ask?.map((a) => a.side)).toEqual([
      "Allies",
    ]);

    // Spain asks the Allies; both of their people are asked.
    send(g, "HUMAN002", { type: "scenario_ask_join", side: "Allies" });
    expect(to(g, M.asks, france)).toHaveLength(1);
    expect(to(g, M.asks, g.nation("united_kingdom"))).toHaveLength(1);
    expect(to(g, M.askSent, spain)).toHaveLength(1);
    expect(dip.view(spain, spain)?.ask?.[1].pending).toBe(true);
    send(g, "HUMAN003", {
      type: "scenario_join_reply",
      other: spain.id(),
      accept: true,
    });
    expect(spain.team()).toBe("Allies");
    // Britain's later "no" changes nothing.
    send(g, "HUMAN004", {
      type: "scenario_join_reply",
      other: spain.id(),
      accept: false,
    });
    expect(spain.team()).toBe("Allies");
    expect(to(g, M.askRefused, spain)).toHaveLength(0);
    expect(messages(g, M.joined)).toHaveLength(1);
  }, 180_000);

  it("asking a side nobody answers: the computer says yes after 30 seconds, or at once with no people on it", async () => {
    DIPLOMACY_TUNING.aiCourts = false;
    const PORTUGAL: Seat = {
      clientID: "HUMAN002",
      username: "Pat",
      nation: "portugal",
    };
    const IRELAND: Seat = {
      clientID: "HUMAN003",
      username: "Kit",
      nation: "ireland",
    };
    const g = await courtGame("europe1939", [GERMANY, PORTUGAL, IRELAND]);
    const portugal = g.nation("portugal");
    const ireland = g.nation("ireland");

    send(g, "HUMAN002", { type: "scenario_ask_join", side: "Axis" });
    expect(to(g, M.asks, g.nation("germany"))).toHaveLength(1);
    g.step(290);
    expect(portugal.team()).toBeNull();
    g.step(20);
    expect(portugal.team()).toBe("Axis");

    // Nobody on the Allies is a person: the computer answers at once.
    send(g, "HUMAN003", { type: "scenario_ask_join", side: "Allies" });
    expect(ireland.team()).toBe("Allies");
    expect(messages(g, M.joined)).toHaveLength(2);
  }, 180_000);
});

describe("joining", () => {
  it("is for good", async () => {
    DIPLOMACY_TUNING.aiCourts = false;
    const IRELAND: Seat = {
      clientID: "HUMAN002",
      username: "Pat",
      nation: "ireland",
    };
    const g = await courtGame("europe1939", [GERMANY, IRELAND]);
    const ireland = g.nation("ireland");
    const germany = g.nation("germany");
    const uk = g.nation("united_kingdom");
    send(g, "HUMAN002", { type: "scenario_ask_join", side: "Allies" });
    expect(ireland.team()).toBe("Allies");
    // It can't ask the other side, nor be invited away.
    send(g, "HUMAN002", { type: "scenario_ask_join", side: "Axis" });
    send(g, "HUMAN001", { type: "scenario_invite", neutral: ireland.id() });
    expect(ireland.team()).toBe("Allies");
    expect(d(g).view(germany, ireland)).toBeUndefined();
    // Invaded by the Axis, it stays Allied (and Britain is its friend).
    g.game.addExecution(
      new AttackExecution(germany.troops() / 10, germany, ireland.id()),
    );
    g.step(30);
    expect(ireland.team()).toBe("Allies");
    expect(ireland.isFriendly(uk)).toBe(true);
    expect(ireland.isFriendly(germany)).toBe(false);
  }, 120_000);
});

describe("computer-run sides", () => {
  it("court within their budget, and don't win every neutral in 20 minutes", async () => {
    const g = await courtGame("europe1939", [], GameMapSize.Compact);
    const dip = d(g);
    const game: Game = g.game;
    const startSide = new Map<Player, string | null>();
    for (const p of game.allPlayers()) startSide.set(p, p.team());
    const given = new Map<string, number>();
    const receive = vi.spyOn(
      dip as unknown as {
        receive(n: Player, side: string, gold: bigint): void;
      },
      "receive",
    );
    receive.mockImplementation(function (
      this: ScenarioDiplomacy,
      n: Player,
      side: string,
      gold: bigint,
    ) {
      given.set(side, (given.get(side) ?? 0) + Number(gold));
      n.addGold(gold);
      const k = `${n.smallID()}|${side}`;
      this.goodwill.set(k, (this.goodwill.get(k) ?? 0) + Number(gold));
    });
    g.step(20 * 600);
    const joined = messages(g, M.joined).map(
      (e) => `${e.params?.name} -> ${e.params?.side}`,
    );
    const neutrals = [...startSide].filter(([, s]) => s === null);
    // Not every neutral: most stay out (or are dragged in by invasion).
    expect(joined.length).toBeLessThan(neutrals.length / 2);
    // Nobody joins in the first minutes: the news is all after minute 5.
    for (const u of g.updates) {
      for (const e of u.updates[GameUpdateType.DisplayEvent]) {
        if (e.message === M.joined) expect(u.tick).toBeGreaterThan(5 * 600);
      }
    }
    // Each side gave at most its share of its computer-run nations' income.
    for (const side of ["Axis", "Allies"]) {
      const earned = [...startSide]
        .filter(([p, s]) => s === side && p.type() === PlayerType.Nation)
        .reduce((a, [p]) => a + Number(p.goldEarned()), 0);
      expect(given.get(side) ?? 0).toBeLessThanOrEqual(
        (earned * DIPLOMACY_TUNING.aiSharePerMille) / 1000,
      );
    }
    // Courting happened at all.
    expect([...given.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    console.info(`20 min, computer only: ${joined.join(", ") || "none"}`);
  }, 600_000);
});

describe("edition gating", () => {
  it("leaves older scenario games without courting, and refuses their replays", async () => {
    expect(
      diplomacyEnabled({ scenario: { id: "europe1939", edition: 2 } } as never),
    ).toBe(false);
    expect(
      diplomacyEnabled({ scenario: { id: "europe1939", edition: 3 } } as never),
    ).toBe(true);
    // Thirteen Colonies 1776's own edition was already 3 (the blockade).
    expect(
      diplomacyEnabled({
        scenario: { id: "colonies1776", edition: 3 },
      } as never),
    ).toBe(false);
    expect(
      diplomacyEnabled({
        scenario: { id: "colonies1776", edition: 4 },
      } as never),
    ).toBe(true);
    expect(diplomacyEnabled({} as never)).toBe(false);
    expect(
      scenarioReplayable({ scenario: { id: "europe1939", edition: 2 } }),
    ).toBe(false);
    expect(
      scenarioReplayable({ scenario: { id: "colonies1776", edition: 3 } }),
    ).toBe(false);
    expect(
      scenarioReplayable({
        scenario: { id: "europe1939", edition: scenarioEdition("europe1939") },
      }),
    ).toBe(true);

    // A game of edition 2 has no courting: a gift moves nothing.
    const g = await courtGame("europe1939", [GERMANY], undefined, 2);
    expect(scenarioDiplomacy(g.game)).toBeNull();
    const germany = g.nation("germany");
    const gold = germany.gold();
    send(g, "HUMAN001", {
      type: "scenario_gift",
      neutral: g.nation("spain").id(),
      gold: 1_000_000,
    });
    expect(germany.gold()).toBeGreaterThanOrEqual(gold);
  }, 120_000);
});

describe("a snapshot", () => {
  it("keeps the goodwill, and the restored game plays on the same", async () => {
    DIPLOMACY_TUNING.aiCourts = false;
    const g = await courtGame("europe1939", [GERMANY]);
    const spain = g.nation("spain");
    const ger = g.nation("germany");
    ger.setScenarioGold(ger.gold() + 10_000_000n);
    send(g, "HUMAN001", {
      type: "scenario_gift",
      neutral: spain.id(),
      gold: 3_000_000,
    });
    g.step(120);
    const restored = await createGameRunnerFromSnapshot(
      g.start,
      g.runner.snapshot(),
      undefined,
      g.files,
      () => {},
    );
    const r = restored.game;
    const rSpain = r.allPlayers().find((p) => p.name() === "Spain")!;
    const rd = scenarioDiplomacy(r)!;
    expect(rd).not.toBeNull();
    expect(rd.goodwillOf(rSpain, "Axis")).toBe(d(g).goodwillOf(spain, "Axis"));
    const hash = (x: Game) => (x as unknown as { hash(): number }).hash();
    expect(hash(r)).toBe(hash(g.game));
    for (let i = 0; i < 120; i++) {
      g.step(1);
      restored.addTurn({ turnNumber: r.ticks(), intents: [] });
      restored.executeNextTick();
    }
    expect(hash(r)).toBe(hash(g.game));
    expect(rd.goodwillOf(rSpain, "Axis")).toBe(d(g).goodwillOf(spain, "Axis"));
  }, 180_000);
});
