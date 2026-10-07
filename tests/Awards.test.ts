import { GameAwards } from "@openfront/engine-api/game/Awards";
import {
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { computeAwards, mvpScore } from "@openfront/engine/game/Awards";
import { Execution, Game, Player } from "@openfront/engine/game/Game";
import { setup } from "./util/Setup";
import { executeTicks } from "./util/utils";

let game: Game;
let alden: Player;
let michael: Player;
let nation: Player;
let bot: Player;

beforeEach(async () => {
  game = await setup("plains", { infiniteGold: true, instantBuild: true }, [
    new PlayerInfo("alden", PlayerType.Human, "client1", "alden_id"),
    new PlayerInfo("michael", PlayerType.Human, "client2", "michael_id"),
  ]);
  game.addPlayer(
    new PlayerInfo("Florida", PlayerType.Nation, null, "nation_id"),
  );
  game.addPlayer(new PlayerInfo("tribe", PlayerType.Bot, null, "bot_id"));
  alden = game.player("alden_id");
  michael = game.player("michael_id");
  nation = game.player("nation_id");
  bot = game.player("bot_id");
  alden.setSpawnTile(game.ref(20, 20));
  michael.setSpawnTile(game.ref(60, 60));
  michael.conquer(game.ref(60, 60));
});

function award(awards: GameAwards, kind: string) {
  return awards.find((a) => a.kind === kind);
}

/** Declares the winner inside a tick, the way WinCheckExecution does. */
function winUpdateAwards(winner: Player): GameAwards {
  const declare: Execution = {
    isActive: () => true,
    activeDuringSpawnPhase: () => false,
    init: () => {},
    tick: () => game.setWinner(winner, game.stats().stats()),
    snapshot: () => {
      throw new Error("not snapshotted in tests");
    },
  };
  game.addExecution(declare);
  for (let i = 0; i < 3; i++) {
    const wins = game.executeNextTick()[GameUpdateType.Win];
    if (wins.length > 0) return wins[0].awards;
  }
  throw new Error("no Win update");
}

describe("End-of-game awards", () => {
  test("nobody earned anything: no awards", () => {
    expect(computeAwards(game, null)).toEqual([]);
  });

  test("most betrayals goes to whoever broke the most alliances", () => {
    game.stats().betray(alden);
    game.stats().betray(nation);
    game.stats().betray(nation);
    const a = award(computeAwards(game, null), "betrayals");
    expect(a).toEqual({
      kind: "betrayals",
      name: nation.displayName(),
      clientID: null,
      value: 2,
    });
  });

  test("most money made counts work, trade and conquest gold but not donations", () => {
    game.stats().goldWork(alden, 300_000);
    game.stats().goldDonationReceived(michael, 5_000_000, 0);
    game.stats().goldWork(michael, 100_000);
    game.stats().boatArriveTrade(michael, alden, 150_000);
    const a = award(computeAwards(game, null), "gold");
    // alden: 300K work + 150K trade as the destination = 450K;
    // michael: 100K work + 150K trade = 250K (the 5M donation doesn't count).
    expect(a?.name).toBe(alden.displayName());
    expect(a?.value).toBe(450_000);
  });

  test("most ships counts transports, trade ships and warships", () => {
    game.stats().boatSendTroops(michael, alden, 100);
    game.stats().boatSendTrade(michael, alden);
    game.stats().unitBuild(alden, UnitType.Warship);
    game.stats().unitBuild(alden, UnitType.City); // not a ship
    const a = award(computeAwards(game, null), "ships");
    expect(a?.clientID).toBe("client2");
    expect(a?.value).toBe(2);
  });

  test("bots never win an award", () => {
    for (let i = 0; i < 5; i++) game.stats().betray(bot);
    game.stats().betray(michael);
    expect(award(computeAwards(game, null), "betrayals")?.clientID).toBe(
      "client2",
    );
  });

  test("ties go to the player who joined first", () => {
    game.stats().betray(michael);
    game.stats().betray(alden);
    expect(award(computeAwards(game, null), "betrayals")?.clientID).toBe(
      "client1",
    );
  });

  test("MVP weighs territory, conquests, gold and the win", () => {
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) alden.conquer(game.ref(x, y));
    }
    executeTicks(game, 1);
    const owned = alden.numTilesOwned();
    expect(owned).toBe(100);
    const tallies = game.stats().awardTallies();
    expect(tallies[alden.id()].peakTiles).toBe(owned);

    const land = game.map().numLandTiles();
    expect(mvpScore(tallies[alden.id()], land, false)).toBe(
      Math.floor((owned * 1000) / land),
    );

    // Michael conquers the nation (100), earns 1M gold (10) and wins (250),
    // on top of his own territory.
    game.stats().playerConquered(michael, nation);
    game.stats().goldWork(michael, 1_000_000);
    const michaelTerritory = Math.floor(
      (game.stats().awardTallies()[michael.id()].peakTiles * 1000) / land,
    );
    const michaelScore = mvpScore(
      game.stats().awardTallies()[michael.id()],
      land,
      true,
    );
    expect(michaelScore).toBe(michaelTerritory + 100 + 10 + 250);

    const awards = winUpdateAwards(michael);
    expect(award(awards, "mvp")).toEqual({
      kind: "mvp",
      name: michael.displayName(),
      clientID: "client2",
      value: michaelScore,
    });
  });

  test("conquering a player counts toward MVP; a bot counts a quarter", () => {
    game.stats().playerConquered(alden, bot);
    game.stats().playerConquered(michael, nation);
    const tallies = game.stats().awardTallies();
    expect(tallies[alden.id()].conquests).toBe(1);
    expect(tallies[michael.id()].conquests).toBe(4);
  });

  test("the Win update carries the awards", () => {
    game.stats().betray(michael);
    game.stats().goldWork(alden, 500_000);
    const awards = winUpdateAwards(alden);
    expect(award(awards, "betrayals")?.clientID).toBe("client2");
    expect(award(awards, "gold")?.clientID).toBe("client1");
    expect(award(awards, "mvp")?.clientID).toBe("client1");
  });

  test("award tallies survive a snapshot round trip", () => {
    game.stats().betray(nation);
    game.stats().goldWork(alden, 42);
    const stats = game.stats() as unknown as {
      snapshot(): { tallies?: Record<string, unknown> };
    };
    const snap = stats.snapshot();
    expect(snap.tallies?.[nation.id()]).toMatchObject({ betrayals: 1 });
    expect(snap.tallies?.[alden.id()]).toMatchObject({ gold: 42n });
  });
});
