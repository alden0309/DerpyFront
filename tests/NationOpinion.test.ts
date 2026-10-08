import {
  Difficulty,
  GameMode,
  PlayerType,
  Relation,
} from "@openfront/engine-api/game/GameTypes";
import { GameConfig } from "@openfront/engine-api/Schemas";
import {
  attackRelationPenalty,
  goldPerRelationStep,
  troopGiftRelationRange,
} from "@openfront/engine-lib/execution/RelationRules";
import { AllianceRequestExecution } from "@openfront/engine/execution/alliance/AllianceRequestExecution";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import {
  allianceOutlook,
  opinionOfViewer,
} from "@openfront/engine/execution/nation/NationOpinion";
import { Game, Player } from "@openfront/engine/game/Game";
import { playerInfo, setup } from "./util/Setup";
import { executeTicks } from "./util/utils";

let game: Game;
let me: Player;
let nation: Player;
let tribe: Player;

async function start(
  config: Partial<GameConfig> = {},
  endSpawnPhase = true,
): Promise<void> {
  game = await setup(
    "plains",
    { difficulty: Difficulty.Hard, instantBuild: true, ...config },
    [
      playerInfo("me", PlayerType.Human),
      playerInfo("nation", PlayerType.Nation),
      playerInfo("tribe", PlayerType.Bot),
    ],
    undefined,
    undefined,
    endSpawnPhase,
  );
  me = game.player("me");
  nation = game.player("nation");
  tribe = game.player("tribe");
  for (let dx = 0; dx < 5; dx++) {
    for (let dy = 0; dy < 5; dy++) {
      me.conquer(game.ref(dx, dy));
      nation.conquer(game.ref(5 + dx, dy));
      tribe.conquer(game.ref(dx, 5 + dy));
    }
  }
  // Nations refuse requests made in the first spawn-phase's worth of ticks
  // (handleAllianceRequests), even in a test that ends it early.
  if (endSpawnPhase) {
    executeTicks(game, game.config().numSpawnPhaseTurns() + 1);
  }
}

describe("a nation's opinion of you, for the player panel", () => {
  beforeEach(() => start());

  test("only a nation's or tribe's opinion of a human", () => {
    expect(opinionOfViewer(game, nation, me)).toBeDefined();
    expect(opinionOfViewer(game, tribe, me)).toBeDefined();
    expect(opinionOfViewer(game, me, nation)).toBeUndefined();
    expect(opinionOfViewer(game, nation, nation)).toBeUndefined();
    expect(opinionOfViewer(game, nation, tribe)).toBeUndefined();
  });

  test("carries the value, its reasons and the rules the tips quote", () => {
    game.addExecution(new AttackExecution(100, me, nation.id()));
    game.executeNextTick();
    const o = opinionOfViewer(game, nation, me)!;
    const penalty = attackRelationPenalty(Difficulty.Hard);
    expect(o.value).toBe(penalty);
    expect(o.relation).toBe(Relation.Hostile);
    expect(o.reasons).toEqual([{ reason: "attacked", amount: penalty }]);
    expect(o.attackPenalty).toBe(penalty);
    expect(o.goldPerStep).toBe(
      Number(
        goldPerRelationStep(
          Difficulty.Hard,
          game.ticks(),
          game.config().numSpawnPhaseTurns(),
        ),
      ),
    );
    const [, max] = troopGiftRelationRange(
      Difficulty.Hard,
      game.config().maxTroops(nation),
    );
    expect(o.troopsForBonus).toBe(Math.floor(max));
    // Hostile: refused (bar the 1 in 40 coin flip on Hard).
    expect(o.alliance.situation).toBe("request");
    expect(o.alliance.chance).toBeCloseTo(1 / 80, 12);
    expect(o.alliance.outcomes[0]).toMatchObject({
      gate: "relation_low",
      accept: false,
    });
  });

  test("a request in flight, a cooldown, and a renewal", () => {
    game.addExecution(new AllianceRequestExecution(me, nation.id()));
    executeTicks(game, 2);
    expect(allianceOutlook(game, nation, me).situation).toBe("pending");

    // Turned down: you may ask again 30 seconds after you asked.
    nation.incomingAllianceRequests()[0].reject();
    const cooldown = allianceOutlook(game, nation, me);
    expect(cooldown.situation).toBe("cooldown");
    expect(cooldown.cooldownTicks).toBeGreaterThan(0);
    expect(cooldown.cooldownTicks).toBeLessThanOrEqual(
      game.config().allianceRequestCooldown(),
    );
    expect(cooldown.outcomes.length).toBeGreaterThan(0);

    executeTicks(game, game.config().allianceRequestCooldown());
    expect(allianceOutlook(game, nation, me).situation).toBe("request");

    me.createAllianceRequest(nation)!.accept();
    const renewal = allianceOutlook(game, nation, me);
    expect(renewal.situation).toBe("renewal");
    expect(renewal.outcomes.length).toBeGreaterThan(0);
  });

  test("when they asked you, saying yes forms the alliance", () => {
    game.addExecution(new AllianceRequestExecution(nation, me.id()));
    executeTicks(game, 2);
    expect(allianceOutlook(game, nation, me)).toEqual({
      situation: "they_asked",
      chance: 1,
      outcomes: [],
    });
  });

  test("tribes accept every request", () => {
    game.addExecution(new AttackExecution(100, me, tribe.id()));
    game.executeNextTick();
    const o = opinionOfViewer(game, tribe, me)!;
    expect(o.relation).toBe(Relation.Hostile);
    expect(o.alliance).toMatchObject({
      situation: "request",
      tribe: true,
      chance: 1,
      outcomes: [],
    });
  });

  test("Hard and Impossible name the alliance cap", () => {
    // Two players that aren't tribes: Hard refuses anyone allied with half.
    expect(allianceOutlook(game, nation, me).allianceCap).toBe(1);
    expect(allianceOutlook(game, tribe, me).allianceCap).toBeUndefined();
  });
});

describe("when no request is possible", () => {
  test("alliances are off", async () => {
    await start({ disableAlliances: true });
    expect(allianceOutlook(game, nation, me)).toEqual({
      situation: "blocked",
      blocker: "alliances_disabled",
      chance: 0,
      outcomes: [],
    });
  });

  test("before the game starts, nations refuse", async () => {
    await start({}, false);
    expect(allianceOutlook(game, nation, me).blocker).toBe("spawn_phase");
    // Tribes answer once the game starts, and still say yes.
    expect(allianceOutlook(game, tribe, me).chance).toBe(1);
  });

  test("teammates", async () => {
    game = await setup("plains", { gameMode: GameMode.Team, playerTeams: 2 }, [
      playerInfo("a", PlayerType.Human),
      playerInfo("b", PlayerType.Human),
      playerInfo("c", PlayerType.Nation),
    ]);
    const nation = game.player("c");
    const humans = [game.player("a"), game.player("b")];
    // Three players on two teams: the nation has a teammate.
    const mate = humans.find((h) => h.isOnSameTeam(nation));
    expect(mate).toBeDefined();
    expect(allianceOutlook(game, nation, mate!).blocker).toBe("same_team");
  });
});
