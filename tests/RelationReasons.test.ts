import {
  Difficulty,
  PlayerType,
  Relation,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import type {
  OpinionReason,
  RelationReason,
} from "@openfront/engine-api/game/Opinion";
import { flattenedEmojiTable } from "@openfront/engine-api/Schemas";
import {
  attackRelationPenalty,
  EMBARGO_RELATION,
  goldPerRelationStep,
  RELATION_DECAY_PER_TICK,
  TARGETED_RELATION,
  troopGiftRelationRange,
} from "@openfront/engine-lib/execution/RelationRules";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import { AllianceRequestExecution } from "@openfront/engine/execution/alliance/AllianceRequestExecution";
import { BreakAllianceExecution } from "@openfront/engine/execution/alliance/BreakAllianceExecution";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import { DonateGoldExecution } from "@openfront/engine/execution/DonateGoldExecution";
import { DonateTroopsExecution } from "@openfront/engine/execution/DonateTroopExecution";
import { EmbargoExecution } from "@openfront/engine/execution/EmbargoExecution";
import { MirvExecution } from "@openfront/engine/execution/MIRVExecution";
import { respondToEmoji } from "@openfront/engine/execution/nation/NationEmojiBehavior";
import { NukeExecution } from "@openfront/engine/execution/NukeExecution";
import { TargetPlayerExecution } from "@openfront/engine/execution/TargetPlayerExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import {
  opinionReasons,
  recordRelationChange,
  RelationParts,
  shownRelationValue,
} from "@openfront/engine/game/RelationReasons";
import { playerInfo, setup } from "./util/Setup";
import { constructionExecution, executeTicks } from "./util/utils";

function total(reasons: OpinionReason[]): number {
  return reasons.reduce((s, r) => s + r.amount, 0);
}

function amounts(reasons: OpinionReason[]): Record<string, number> {
  return Object.fromEntries(reasons.map((r) => [r.reason, r.amount]));
}

/** Applies a change like PlayerImpl.updateRelation and returns the value. */
function change(
  parts: RelationParts,
  value: number,
  reason: RelationReason,
  delta: number,
): number {
  const after = Math.max(-100, Math.min(100, value + delta));
  recordRelationChange(parts, reason, value, delta, after);
  return after;
}

/** Fades like PlayerImpl.decayRelations, `ticks` times. */
function fade(value: number, ticks: number): number {
  for (let i = 0; i < ticks; i++) {
    value += -Math.sign(value) * RELATION_DECAY_PER_TICK;
    if (Math.abs(value) < RELATION_DECAY_PER_TICK * 2) value = 0;
  }
  return value;
}

describe("relation reasons: the bookkeeping", () => {
  test("parts add up to the value through changes, clamping and fading", () => {
    const parts: RelationParts = new Map();
    let v = 0;
    const rng = new PseudoRandom(7);
    const reasons: RelationReason[] = [
      "attacked",
      "gift_gold",
      "gift_troops",
      "targeted",
      "nuked",
      "alliance",
      "embargo",
      "embargo_lifted",
    ];
    for (let step = 0; step < 400; step++) {
      const reason = reasons[rng.nextInt(0, reasons.length)];
      v = change(parts, v, reason, rng.nextInt(-100, 101));
      v = fade(v, rng.nextInt(0, 300));
      const shown = opinionReasons(parts, v);
      expect(total(shown)).toBe(shownRelationValue(v));
      expect(v).toBeGreaterThanOrEqual(-100);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  test("a change past the limit shares the room among that side's parts", () => {
    const parts: RelationParts = new Map();
    let v = change(parts, 0, "attacked", -70);
    v = change(parts, v, "targeted", -40);
    // -110 doesn't fit: both share -100 in proportion 70:40.
    expect(v).toBe(-100);
    expect(amounts(opinionReasons(parts, v))).toEqual({
      attacked: -64,
      targeted: -36,
    });
    // A gift on top keeps its full weight against them.
    v = change(parts, v, "gift_gold", 30);
    expect(amounts(opinionReasons(parts, v))).toEqual({
      attacked: -64,
      targeted: -36,
      gift_gold: 30,
    });
    expect(total(opinionReasons(parts, v))).toBe(-70);
  });

  test("fading shrinks every part alike and forgets them back at 0", () => {
    const parts: RelationParts = new Map();
    let v = change(parts, 0, "attacked", -60);
    v = change(parts, v, "gift_gold", 20);
    expect(v).toBe(-40);
    v = fade(v, 400); // 20 points
    expect(v).toBeCloseTo(-20, 9);
    // Both halve. (Float drift leaves v a hair below -20, which shows as -21
    // and gives one point more to the part that lost most to rounding.)
    const shown = amounts(opinionReasons(parts, v));
    expect(shown.gift_gold).toBe(10);
    expect(shown.attacked).toBe(shownRelationValue(v) - 10);
    expect([-30, -31]).toContain(shown.attacked);
    v = fade(v, 1000);
    expect(v).toBe(0);
    expect(opinionReasons(parts, v)).toEqual([]);
    // The next change starts from a clean slate.
    v = change(parts, v, "targeted", -40);
    expect(opinionReasons(parts, v)).toEqual([
      { reason: "targeted", amount: -40 },
    ]);
  });

  test("rounding hands leftover points to the parts that lost the most", () => {
    const parts: RelationParts = new Map();
    let v = change(parts, 0, "gift_gold", 45.5);
    v = change(parts, v, "gift_troops", 45.5);
    v = change(parts, v, "kind_emoji", 15);
    // 106 clamps to 100: 42.92, 42.92 and 14.15, which round down to 98.
    expect(v).toBe(100);
    const shown = opinionReasons(parts, v);
    expect(total(shown)).toBe(100);
    expect(amounts(shown)).toEqual({
      gift_gold: 43,
      gift_troops: 43,
      kind_emoji: 14,
    });
  });

  test("a value with no parts on record reads as other", () => {
    expect(opinionReasons(undefined, -12.5)).toEqual([
      { reason: "other", amount: -13 },
    ]);
    expect(opinionReasons(undefined, 0)).toEqual([]);
  });

  test("the shown value agrees with the relation band", () => {
    expect(shownRelationValue(-50.5)).toBe(-51); // Hostile is below -50
    expect(shownRelationValue(-0.2)).toBe(-1); // Distrustful is below 0
    expect(shownRelationValue(49.9)).toBe(49); // Neutral is below 50
    expect(shownRelationValue(-0)).toBe(0);
  });
});

describe("relation reasons: what the game records", () => {
  let game: Game;
  let me: Player;
  let nation: Player;
  let neighbour: Player;
  let tribe: Player;
  let other: Player;

  /** Gives `p` the 5x5 block of tiles at (x, y). */
  function land(p: Player, x: number, y: number) {
    for (let dx = 0; dx < 5; dx++) {
      for (let dy = 0; dy < 5; dy++) p.conquer(game.ref(x + dx, y + dy));
    }
  }

  function reasonsOf(subject: Player, viewer: Player) {
    return amounts(subject.relationReasons(viewer));
  }

  function expectConsistent(subject: Player, viewer: Player) {
    const reasons = subject.relationReasons(viewer);
    expect(total(reasons)).toBe(
      shownRelationValue(subject.relationValue(viewer)),
    );
  }

  function ally(a: Player, b: Player) {
    a.createAllianceRequest(b)!.accept();
  }

  beforeEach(async () => {
    game = await setup(
      "plains",
      {
        difficulty: Difficulty.Medium,
        infiniteGold: true,
        infiniteTroops: true,
        instantBuild: true,
        donateGold: true,
        donateTroops: true,
      },
      [
        playerInfo("me", PlayerType.Human),
        playerInfo("nation", PlayerType.Nation),
        playerInfo("neighbour", PlayerType.Nation),
        playerInfo("tribe", PlayerType.Bot),
        playerInfo("other", PlayerType.Human),
      ],
    );
    me = game.player("me");
    nation = game.player("nation");
    neighbour = game.player("neighbour");
    tribe = game.player("tribe");
    other = game.player("other");
    land(me, 0, 0);
    land(nation, 5, 0);
    land(neighbour, 0, 5);
    land(tribe, 5, 5);
    land(other, 50, 50);
  });

  test("an attack costs the difficulty's penalty, recorded as attacked", () => {
    game.addExecution(new AttackExecution(100, me, nation.id()));
    game.executeNextTick();
    const penalty = attackRelationPenalty(Difficulty.Medium);
    expect(nation.relationValue(me)).toBe(penalty);
    expect(reasonsOf(nation, me)).toEqual({ attacked: penalty });
  });

  test("tribes keep reasons too", () => {
    game.addExecution(new AttackExecution(100, me, tribe.id()));
    game.executeNextTick();
    expect(reasonsOf(tribe, me)).toEqual({
      attacked: attackRelationPenalty(Difficulty.Medium),
    });
  });

  test("gifts of gold and troops are recorded as gifts", () => {
    ally(me, nation);
    me.addGold(10_000_000n);
    me.addTroops(1_000_000);
    const step = goldPerRelationStep(
      Difficulty.Medium,
      game.ticks() + 1,
      game.config().numSpawnPhaseTurns(),
    );
    game.addExecution(
      new DonateGoldExecution(me, nation.id(), Number(step * 4n)),
    );
    executeTicks(game, 2);
    expect(reasonsOf(nation, me)).toEqual({ gift_gold: 20 });

    // Past the donation cooldown, a troop gift big enough always counts.
    executeTicks(game, game.config().donateCooldown());
    const [, max] = troopGiftRelationRange(
      Difficulty.Medium,
      game.config().maxTroops(nation),
    );
    game.addExecution(
      new DonateTroopsExecution(me, nation.id(), Math.floor(max)),
    );
    executeTicks(game, 2);
    expect(reasonsOf(nation, me)).toEqual({ gift_gold: 20, gift_troops: 50 });
    expectConsistent(nation, me);
  });

  test("an alliance and its betrayal are recorded; the neighbours saw it", () => {
    // They asked, I asked back: the alliance forms with +100 on both sides.
    game.addExecution(new AllianceRequestExecution(nation, me.id()));
    executeTicks(game, 2);
    game.addExecution(new AllianceRequestExecution(me, nation.id()));
    executeTicks(game, 2);
    expect(me.isAlliedWith(nation)).toBe(true);
    expect(reasonsOf(nation, me)).toEqual({ alliance: 100 });

    // Twenty seconds later the alliance's +100 has faded to +80.
    for (let t = 0; t < 400; t++) nation.decayRelations();
    game.addExecution(new BreakAllianceExecution(me, nation.id()));
    executeTicks(game, 2);
    expect(me.isAlliedWith(nation)).toBe(false);
    // +80 - 100 (the betrayal) - 40 (it borders me, so it saw it too).
    expect(nation.relationValue(me)).toBeCloseTo(-60, 9);
    expectConsistent(nation, me);
    const shown = reasonsOf(nation, me);
    expect(shown.broke_alliance).toBe(-100);
    expect(shown.saw_betrayal).toBe(-40);
    expect([79, 80]).toContain(shown.alliance);
    // A bystander next to me only saw it.
    expect(reasonsOf(neighbour, me)).toEqual({ saw_betrayal: -40 });
  });

  test("a nuke is recorded as nuked, a MIRV on both sides", () => {
    game.config().nukeAllianceBreakThreshold = () => 0;
    constructionExecution(game, me, 0, 0, UnitType.MissileSilo);
    game.addExecution(
      new NukeExecution(UnitType.AtomBomb, me, game.ref(7, 2), null),
    );
    executeTicks(game, 2);
    expect(reasonsOf(nation, me)).toEqual({ nuked: -100 });

    // A nation that MIRVs a human sours on them too.
    nation.addGold(1_000_000_000n);
    nation.buildUnit(UnitType.MissileSilo, game.ref(9, 4), {});
    game.addExecution(new MirvExecution(nation, game.ref(51, 51)));
    executeTicks(game, 2);
    expect(nation.units(UnitType.MIRV)).toHaveLength(1);
    expect(reasonsOf(nation, other)).toEqual({ mirv_at_you: -100 });
  });

  test("targeting, embargoes and emojis name their reasons", () => {
    game.addExecution(new TargetPlayerExecution(me, nation.id()));
    executeTicks(game, 2);
    expect(reasonsOf(nation, me)).toEqual({ targeted: TARGETED_RELATION });

    // A nation answers an embargo on its own turn (NationExecution); here
    // the change it makes is applied directly.
    game.addExecution(new EmbargoExecution(me, nation.id(), "start"));
    executeTicks(game, 2);
    nation.updateRelation(me, EMBARGO_RELATION, "embargo");
    expect(reasonsOf(nation, me)).toEqual({
      targeted: TARGETED_RELATION,
      embargo: EMBARGO_RELATION,
    });

    const rude = flattenedEmojiTable.indexOf("🤡");
    expect(rude).toBeGreaterThanOrEqual(0);
    respondToEmoji(game, new PseudoRandom(1), me, nation, "🤡");
    expect(reasonsOf(nation, me).rude_emoji).toBe(-10);
    expectConsistent(nation, me);
  });

  test("fading over time keeps the reasons adding up", () => {
    game.addExecution(new AttackExecution(100, me, nation.id()));
    game.executeNextTick();
    ally(me, nation);
    me.addGold(10_000_000n);
    const step = goldPerRelationStep(
      Difficulty.Medium,
      game.ticks() + 1,
      game.config().numSpawnPhaseTurns(),
    );
    game.addExecution(
      new DonateGoldExecution(me, nation.id(), Number(step * 6n)),
    );
    executeTicks(game, 2);
    // -70 + 30
    expect(nation.relationValue(me)).toBe(-40);
    for (let t = 0; t < 900; t++) {
      nation.decayRelations();
      if (t % 37 === 0) expectConsistent(nation, me);
    }
    expect(nation.relationValue(me)).toBe(0);
    expect(nation.relationReasons(me)).toEqual([]);
    expect(nation.relation(me)).toBe(Relation.Neutral);
  });

  test("only a nation's or tribe's opinion of a human keeps reasons", () => {
    // A human's opinion, and a nation's opinion of a nation, aren't shown
    // anywhere, so nothing is kept: the value reads as "other".
    me.updateRelation(nation, -30, "attacked");
    expect(me.relationReasons(nation)).toEqual([
      { reason: "other", amount: -30 },
    ]);
    nation.updateRelation(neighbour, -30, "attacked");
    expect(nation.relationReasons(neighbour)).toEqual([
      { reason: "other", amount: -30 },
    ]);
    const parts = (p: Player) =>
      (p as unknown as { relationParts: Map<Player, unknown> }).relationParts;
    expect(parts(me).size).toBe(0);
    expect(parts(nation).size).toBe(0);
    nation.updateRelation(me, -30, "attacked");
    expect(parts(nation).size).toBe(1);
  });
});
