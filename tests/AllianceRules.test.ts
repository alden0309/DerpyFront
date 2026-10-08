import {
  Difficulty,
  GameMode,
  Relation,
} from "@openfront/engine-api/game/GameTypes";
import type { AllianceOutcome } from "@openfront/engine-api/game/Opinion";
import {
  acceptChance,
  AllianceDice,
  allianceDice,
  AllianceFacts,
  allianceOdds,
  AllianceStrength,
  decideAlliance,
} from "@openfront/engine-lib/execution/AllianceRules";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";

/**
 * The nations' alliance decision lives in engine-lib so the player panel
 * can replay it (allianceOdds). The golden games in
 * RelationOpinionDeterminism.test.ts show the nations decide exactly as
 * before; these check that the odds the panel shows are the odds the
 * decision really has.
 */

const EVEN: AllianceStrength = {
  ourTroops: 10_000,
  theirTroops: 10_000,
  ourMaxTroops: 100_000,
  theirMaxTroops: 100_000,
  ourTiles: 1_000,
  theirTiles: 1_000,
  ourAttackTroops: 0,
  theirAttackTroops: 0,
};

const SPAWN = 300;
const LATE = SPAWN + 20_000;

function facts(
  o: Partial<{
    difficulty: Difficulty;
    gameMode: GameMode;
    isResponse: boolean;
    ticks: number;
    traitor: boolean;
    theirAlliances: number;
    nonTribePlayers: number;
    runawayLeader: boolean;
    relation: Relation;
    ourAlliances: number;
    neighbours: { count: number; friendly: number; includesThem: boolean };
    strength: Partial<AllianceStrength>;
  }> = {},
): AllianceFacts {
  return {
    difficulty: o.difficulty ?? Difficulty.Medium,
    gameMode: o.gameMode ?? GameMode.FFA,
    isResponse: o.isResponse ?? true,
    ticks: o.ticks ?? LATE,
    numSpawnPhaseTurns: SPAWN,
    isTraitor: () => o.traitor ?? false,
    theirAlliances: () => o.theirAlliances ?? 0,
    nonTribePlayers: () => o.nonTribePlayers ?? 10,
    isRunawayLeader: () => o.runawayLeader ?? false,
    relation: () => o.relation ?? Relation.Neutral,
    ourAlliances: () => o.ourAlliances ?? 0,
    neighbours: () =>
      o.neighbours ?? { count: 0, friendly: 0, includesThem: false },
    strength: () => ({ ...EVEN, ...o.strength }),
  };
}

function chanceOf(
  outcomes: AllianceOutcome[],
  gate: string,
  accept: boolean,
): number {
  return (
    outcomes.find((o) => o.gate === gate && o.accept === accept)?.chance ?? 0
  );
}

const SCENARIOS: [string, AllianceFacts][] = [
  ["easy, neutral, late", facts({ difficulty: Difficulty.Easy })],
  [
    "easy, hostile",
    facts({
      difficulty: Difficulty.Easy,
      relation: Relation.Hostile,
    }),
  ],
  ["medium, traitor", facts({ traitor: true })],
  ["medium, friendly", facts({ relation: Relation.Friendly })],
  ["medium, early game", facts({ ticks: SPAWN + 100 })],
  [
    "medium, a few alliances, weaker",
    facts({
      ourAlliances: 4,
      strength: { theirTroops: 7_500, theirTiles: 850 },
    }),
  ],
  ["medium, team game", facts({ gameMode: GameMode.Team })],
  [
    "hard, friendly",
    facts({
      difficulty: Difficulty.Hard,
      relation: Relation.Friendly,
    }),
  ],
  [
    "hard, traitor, early",
    facts({
      difficulty: Difficulty.Hard,
      traitor: true,
      ticks: SPAWN + 100,
    }),
  ],
  [
    "hard, allied neighbours",
    facts({
      difficulty: Difficulty.Hard,
      neighbours: { count: 3, friendly: 2, includesThem: true },
    }),
  ],
  [
    "hard, borderline strength",
    facts({
      difficulty: Difficulty.Hard,
      ourAlliances: 3,
      strength: { theirTroops: 8_000, theirTiles: 900 },
    }),
  ],
  [
    "impossible, friendly",
    facts({
      difficulty: Difficulty.Impossible,
      relation: Relation.Friendly,
      ourAlliances: 2,
    }),
  ],
  [
    "impossible, early, weaker",
    facts({
      difficulty: Difficulty.Impossible,
      ticks: SPAWN + 100,
      strength: { theirTroops: 8_500, theirTiles: 950 },
    }),
  ],
];

describe("allianceOdds", () => {
  test.each(SCENARIOS)("matches the real decision's draws: %s", (_, f) => {
    const odds = allianceOdds(f);
    const random = new PseudoRandom(20251008);
    const dice = allianceDice(random);
    const n = 40_000;
    const seen = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const { gate, accept } = decideAlliance(f, dice);
      const key = `${gate}:${accept}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    // Every outcome that happened was predicted, at the predicted rate.
    for (const [key, count] of seen) {
      const [gate, accept] = key.split(":");
      const p = chanceOf(odds, gate, accept === "true");
      const sigma = Math.sqrt((p * (1 - p)) / n);
      expect(p, key).toBeGreaterThan(0);
      expect(Math.abs(count / n - p), key).toBeLessThan(4 * sigma + 0.002);
    }
    // And every predicted outcome happens.
    for (const o of odds) {
      if (o.chance > 0.001) {
        expect(seen.has(`${o.gate}:${o.accept}`), o.gate).toBe(true);
      }
    }
    const total = odds.reduce((s, o) => s + o.chance, 0);
    expect(total).toBeCloseTo(1, 12);
  });

  test("certain answers have one outcome", () => {
    const hostile = allianceOdds(
      facts({ difficulty: Difficulty.Impossible, relation: Relation.Hostile }),
    );
    expect(hostile).toEqual([
      { gate: "relation_low", accept: false, chance: 1 },
    ]);
    expect(acceptChance(hostile)).toBe(0);

    const team = allianceOdds(
      facts({ difficulty: Difficulty.Impossible, gameMode: GameMode.Team }),
    );
    expect(team).toEqual([{ gate: "team_game", accept: false, chance: 1 }]);

    // Much stronger on Impossible: they accept out of fear, whatever they
    // think of you.
    const feared = allianceOdds(
      facts({
        difficulty: Difficulty.Impossible,
        relation: Relation.Hostile,
        strength: { theirTroops: 20_000 },
      }),
    );
    expect(feared).toEqual([{ gate: "threat", accept: true, chance: 1 }]);
  });

  test("known odds", () => {
    // Easy, hostile: refused unless confused (1 in 10), then a coin flip.
    const easy = allianceOdds(
      facts({ difficulty: Difficulty.Easy, relation: Relation.Hostile }),
    );
    expect(acceptChance(easy)).toBeCloseTo(0.05, 12);
    expect(chanceOf(easy, "relation_low", false)).toBeCloseTo(0.9, 12);

    // Medium, friendly: yes unless confused (1 in 20) and the coin says no.
    expect(
      acceptChance(allianceOdds(facts({ relation: Relation.Friendly }))),
    ).toBeCloseTo(1 - 0.05 / 2, 12);

    // Impossible, friendly with no room for allies: 67 in 100.
    const imp = allianceOdds(
      facts({
        difficulty: Difficulty.Impossible,
        relation: Relation.Friendly,
        ourAlliances: 5,
        strength: { theirTroops: 1_000, theirTiles: 100 },
      }),
    );
    expect(chanceOf(imp, "friendly", true)).toBeCloseTo(0.67, 12);
    expect(chanceOf(imp, "enough_alliances", false)).toBeCloseTo(0.33, 12);

    // A traitor on Medium, otherwise welcome: 1 in 10 gets past the traitor
    // check, plus the coin flips.
    const traitor = allianceOdds(
      facts({ traitor: true, relation: Relation.Friendly }),
    );
    expect(acceptChance(traitor)).toBeCloseTo(0.05 / 2 + 0.95 * 0.1, 12);
    expect(chanceOf(traitor, "traitor", false)).toBeCloseTo(0.95 * 0.9, 12);
  });

  test("the decision draws in the order the nations always have", () => {
    // A dice that records each draw (and always says "no").
    const draws: string[] = [];
    const recording: AllianceDice = {
      chance: (odds) => (draws.push(`chance(${odds})`), false),
      roll: (min, max) => (draws.push(`nextInt(${min},${max})`), false),
      emojiChance: (odds) => (draws.push(`emoji chance(${odds})`), false),
    };
    decideAlliance(
      facts({
        difficulty: Difficulty.Hard,
        traitor: true,
        ourAlliances: 1,
        gameMode: GameMode.Team,
      }),
      recording,
    );
    expect(draws).toEqual([
      "chance(40)", // confused?
      "nextInt(0,100)", // refuse the traitor? ("no": let through)
      "nextInt(0,100)", // refuse in a team game?
      "nextInt(3,5)", // enough alliances already?
      // (no early-game draw: it's late)
      "nextInt(75,85)", // similar troops?
      "nextInt(85,95)", // similar land?
    ]);

    draws.length = 0;
    decideAlliance(
      facts({ difficulty: Difficulty.Medium, relation: Relation.Hostile }),
      recording,
    );
    expect(draws).toEqual(["chance(20)", "emoji chance(3)"]);
  });
});
