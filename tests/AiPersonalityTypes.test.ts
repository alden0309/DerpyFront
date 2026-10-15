// AIP (r23): the four AI personalities of rules edition 6 (Mad Scientist,
// Trader, Aggressive, Protector): the ids, the deal, the config, and how
// each one tunes a nation. Their play over whole games is in
// AiPersonalityPlay.test.ts.

import {
  Cell,
  Difficulty,
  Nation,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import {
  DERPY_RULES,
  GameConfig,
  GameConfigSchema,
} from "@openfront/engine-api/Schemas";
import {
  AI_CHOICES,
  AI_TUNING,
  AI_TYPES,
  aiChoices,
  AIP_RULES,
  aiTypeItem,
  aiTypeOfItem,
  dealAiTypes,
  dealsPersonalities,
  isAiChoice,
  NORMAL_TUNING,
  tunedRate,
  tunedRatioPercents,
} from "@openfront/engine-lib/game/AiPersonalityTypes";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import { AllianceRequestExecution } from "@openfront/engine/execution/alliance/AllianceRequestExecution";
import { NationAllianceBehavior } from "@openfront/engine/execution/nation/NationAllianceBehavior";
import { NationEmojiBehavior } from "@openfront/engine/execution/nation/NationEmojiBehavior";
import { NationStructureBehavior } from "@openfront/engine/execution/nation/NationStructureBehavior";
import { NationExecution } from "@openfront/engine/execution/NationExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import {
  dealtAiTypes,
  nationAiType,
  playerAiType,
} from "@openfront/engine/game/NationAiTypes";
import { zb } from "@openfront/zbin";
import { setup } from "./util/Setup";

const IDS = ["n_alpha", "n_bravo", "n_charlie", "n_delta", "n_echo", "n_fox"];

function nations(ids: readonly string[] = IDS): Nation[] {
  return ids.map(
    (id, i) =>
      new Nation(
        new Cell(10 + i * 20, 10),
        new PlayerInfo(id, PlayerType.Nation, null, id),
      ),
  );
}

/** A big_plains game whose nations are dealt from `options`. */
async function aipGame(
  options: string[] | undefined,
  {
    rules = AIP_RULES,
    difficulty = Difficulty.Medium,
    ids = IDS,
    humans = [] as PlayerInfo[],
    config = {} as Partial<GameConfig>,
  } = {},
): Promise<Game> {
  return setup(
    "big_plains",
    {
      derpyRules: rules,
      difficulty,
      ...(options ? { aiPersonalities: options } : {}),
      ...config,
    },
    humans,
    undefined,
    undefined,
    true,
    nations(ids),
  );
}

describe("the four personalities", () => {
  test("Mad Scientist, Trader, Aggressive and Protector, plus the free Normal", () => {
    expect(AI_TYPES).toEqual([
      "mad_scientist",
      "trader",
      "aggressive",
      "protector",
    ]);
    expect(AI_CHOICES).toEqual(["normal", ...AI_TYPES]);
    expect(AIP_RULES).toBe(6);
    expect(DERPY_RULES).toBe(6);
  });

  test("each is sold as its own store item", () => {
    for (const t of AI_TYPES) {
      expect(aiTypeItem(t)).toBe(`ai_${t}`);
      expect(aiTypeOfItem(aiTypeItem(t))).toBe(t);
      expect(aiTypeItem(t)).toMatch(/^[a-z0-9_]{1,32}$/);
    }
    // The old packs and Normal aren't personality items
    expect(aiTypeOfItem("ai_pirates")).toBeUndefined();
    expect(aiTypeOfItem("ai_scientists")).toBeUndefined();
    expect(aiTypeOfItem("normal")).toBeUndefined();
    expect(aiTypeOfItem("trader")).toBeUndefined();
  });

  test("a config's options come out in a fixed order, unknown ones dropped", () => {
    expect(aiChoices(["protector", "normal", "trader", "trader"])).toEqual([
      "normal",
      "trader",
      "protector",
    ]);
    expect(aiChoices(["ai_pirates", "nope"])).toEqual([]);
    expect(aiChoices(undefined)).toEqual([]);
    expect(dealsPersonalities(["normal"])).toBe(false);
    expect(dealsPersonalities(["ai_pirates"])).toBe(false);
    expect(dealsPersonalities(["normal", "aggressive"])).toBe(true);
    expect(isAiChoice("normal")).toBe(true);
    expect(isAiChoice("ai_trader")).toBe(false);
  });
});

describe("dealing them to the nations", () => {
  const ids = Array.from({ length: 12 }, (_, i) => `nation${i}`);

  test("the same game deals the same hand, in any order the nations come", () => {
    const opts = ["normal", "trader", "protector"];
    const a = dealAiTypes(ids, opts);
    const b = dealAiTypes([...ids].reverse(), [...opts].reverse());
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
    // Another game (other nation ids) deals another hand
    const other = dealAiTypes(
      ids.map((id) => `${id}x`),
      opts,
    );
    expect(ids.map((id) => a.get(id) ?? "normal")).not.toEqual(
      ids.map((id) => other.get(`${id}x`) ?? "normal"),
    );
  });

  test("only the ticked options are dealt, as evenly as the numbers allow", () => {
    const hand = dealAiTypes(ids, ["normal", "trader", "aggressive"]);
    const count = (t: string) => ids.filter((id) => hand.get(id) === t).length;
    expect(count("trader")).toBe(4);
    expect(count("aggressive")).toBe(4);
    expect(ids.filter((id) => !hand.has(id))).toHaveLength(4); // Normal
    for (const t of hand.values()) {
      expect(["trader", "aggressive"]).toContain(t);
    }
    // One option: every nation plays it
    const all = dealAiTypes(ids, ["mad_scientist"]);
    expect([...all.values()]).toEqual(Array(12).fill("mad_scientist"));
  });

  test("only Normal, nothing, or old pack ids: every nation plays as usual", () => {
    expect(dealAiTypes(ids, ["normal"]).size).toBe(0);
    expect(dealAiTypes(ids, []).size).toBe(0);
    expect(dealAiTypes(ids, undefined).size).toBe(0);
    expect(dealAiTypes(ids, ["ai_pirates"]).size).toBe(0);
    expect(dealAiTypes([], ["trader"]).size).toBe(0);
  });

  test("in a game: the named nations only, from rules 6, every client alike", async () => {
    const g = await aipGame(["trader", "protector"], {
      humans: [new PlayerInfo("Human", PlayerType.Human, null, "human")],
    });
    g.addPlayer(new PlayerInfo("Tribe", PlayerType.Bot, null, "tribe"));
    const dealt = dealtAiTypes(g);
    expect(dealt.size).toBe(IDS.length);
    expect([...dealt.entries()]).toEqual([
      ...dealAiTypes(IDS, ["protector", "trader"]).entries(),
    ]);
    expect(playerAiType(g, g.player("human"))).toBeNull();
    expect(playerAiType(g, g.player("tribe"))).toBeNull();
    for (const id of IDS) {
      expect(playerAiType(g, g.player(id))).toBe(dealt.get(id));
      // Nations keep their own names and flags
      expect(g.player(id).name()).toBe(id);
    }
    const old = await aipGame(["trader", "protector"], { rules: 5 });
    expect(dealtAiTypes(old).size).toBe(0);
    expect(nationAiType(old, IDS[0])).toBeNull();
  });

  test("each nation's personality reaches the client on its first update", async () => {
    const g = await aipGame(["normal", "aggressive"]);
    const dealt = dealtAiTypes(g);
    for (const id of IDS) {
      const pu = (
        g.player(id) as unknown as { toUpdate(): Record<string, unknown> }
      ).toUpdate();
      expect(pu.type).toBe(GameUpdateType.Player);
      expect(pu.aiPersonality).toBe(dealt.get(id));
      if (!dealt.has(id)) expect("aiPersonality" in pu).toBe(false);
    }
  });
});

describe("the config", () => {
  const base = {
    gameMap: "World",
    difficulty: "Medium",
    donateGold: false,
    donateTroops: false,
    gameType: "Private",
    gameMode: "Free For All",
    gameMapSize: "Normal",
    nations: "default",
    bots: 0,
    infiniteGold: false,
    infiniteTroops: false,
    instantBuild: false,
    randomSpawn: false,
  };
  const Root = zb.object(GameConfigSchema.shape);

  test("the options travel in the game config, on the binary wire too", () => {
    const cfg = GameConfigSchema.parse({
      ...base,
      aiPersonalities: ["normal", "mad_scientist", "protector"],
    });
    expect(Root.parseBytes(Root.serialize(cfg)).aiPersonalities).toEqual([
      "normal",
      "mad_scientist",
      "protector",
    ]);
  });

  test("old configs stay valid: none, and rules 5's packs", () => {
    expect(GameConfigSchema.safeParse(base).success).toBe(true);
    const packs = GameConfigSchema.parse({
      ...base,
      derpyRules: 5,
      aiPersonalities: ["ai_pirates", "ai_warlords"],
    });
    expect(Root.parseBytes(Root.serialize(packs)).aiPersonalities).toEqual([
      "ai_pirates",
      "ai_warlords",
    ]);
    expect(
      GameConfigSchema.safeParse({ ...base, aiPersonalities: ["Bad Id!"] })
        .success,
    ).toBe(false);
  });
});

describe("how each one tunes a nation", () => {
  const range = (lo: number, hi: number) =>
    Array.from({ length: hi - lo }, (_, i) => lo + i);

  test("Aggressive attacks at 38-47% of its troop cap and keeps 22-31% home (usually 50-59% and 30-39%)", () => {
    const triggers = new Set<number>();
    const reserves = new Set<number>();
    for (const trigger of range(50, 60)) {
      for (const reserve of range(30, 40)) {
        const r = tunedRatioPercents(AI_TUNING.aggressive, {
          trigger,
          reserve,
          expand: 15,
        });
        triggers.add(r.trigger);
        reserves.add(r.reserve);
        // Exactly 12 and 8 points under: nothing is clamped
        expect(r.trigger).toBe(trigger - 12);
        expect(r.reserve).toBe(reserve - 8);
        expect(r.reserve).toBeLessThan(r.trigger);
      }
    }
    expect([...triggers].sort((a, b) => a - b)).toEqual(range(38, 48));
    expect([...reserves].sort((a, b) => a - b)).toEqual(range(22, 32));
  });

  test("Traders and Protectors wait longer and keep more home; Normal is unchanged", () => {
    for (const trigger of range(50, 60)) {
      for (const reserve of range(30, 40)) {
        const base = { trigger, reserve, expand: 15 };
        expect(tunedRatioPercents(NORMAL_TUNING, base)).toEqual(base);
        const trader = tunedRatioPercents(AI_TUNING.trader, base);
        const protector = tunedRatioPercents(AI_TUNING.protector, base);
        expect(trader.trigger).toBe(trigger + 15);
        expect(trader.reserve).toBe(reserve + 15);
        expect(protector.trigger).toBe(trigger + 20);
        expect(protector.reserve).toBe(reserve + 18);
        expect(protector.reserve).toBeLessThan(protector.trigger);
      }
    }
  });

  test("decisions: Aggressive a fifth faster, Protector a little slower in the opening only", () => {
    expect(AI_TUNING.aggressive.ratePct).toBe(80);
    expect(tunedRate(60, 80)).toBe(48);
    expect(tunedRate(45, 80)).toBe(36);
    expect(AI_TUNING.protector.ratePct).toBe(100);
    expect(AI_TUNING.protector.openingRatePct).toBe(125);
    expect(tunedRate(60, 125)).toBe(75);
    for (const t of ["mad_scientist", "trader"] as const) {
      expect(AI_TUNING[t].ratePct).toBe(100);
      expect(AI_TUNING[t].openingRatePct).toBe(100);
    }
    expect(tunedRate(12, 50)).toBe(10); // never under 10 ticks
  });

  test("what they build, per city", () => {
    const pct = (t: keyof typeof AI_TUNING, u: UnitType) =>
      AI_TUNING[t].structuresPct[u] ?? 100;
    // Mad Scientist: more factories, a lot more SAMs, silos and Domes
    expect(pct("mad_scientist", UnitType.Factory)).toBeGreaterThan(100);
    expect(pct("mad_scientist", UnitType.SAMLauncher)).toBeGreaterThanOrEqual(
      200,
    );
    expect(pct("mad_scientist", UnitType.MissileSilo)).toBeGreaterThanOrEqual(
      200,
    );
    expect(AI_TUNING.mad_scientist.maxSilos).toBeGreaterThan(
      NORMAL_TUNING.maxSilos * 2,
    );
    expect(AI_TUNING.mad_scientist.preemptiveDomes).toBeGreaterThan(
      NORMAL_TUNING.preemptiveDomes,
    );
    // Trader: more factories and ports
    expect(pct("trader", UnitType.Factory)).toBeGreaterThan(100);
    expect(pct("trader", UnitType.Port)).toBeGreaterThan(100);
    // Protector: twice the SAMs, silos, defense posts and Domes; cities
    expect(pct("protector", UnitType.SAMLauncher)).toBe(200);
    expect(pct("protector", UnitType.MissileSilo)).toBe(200);
    expect(AI_TUNING.protector.maxSilos).toBe(NORMAL_TUNING.maxSilos * 2);
    expect(AI_TUNING.protector.defensePostsPct).toBe(200);
    expect(AI_TUNING.protector.domeBarPct).toBe(50);
    expect(AI_TUNING.protector.cityCostPct).toBeLessThan(100);
    // Aggressive: a bigger army from more cities
    expect(AI_TUNING.aggressive.cityCostPct).toBeLessThan(100);
  });

  test("fights, alliances, betrayal and nukes", () => {
    expect(NORMAL_TUNING.warPct).toBe(100);
    expect(AI_TUNING.trader.warPct).toBeLessThan(50);
    expect(AI_TUNING.protector.warPct).toBeLessThan(AI_TUNING.trader.warPct);
    expect(AI_TUNING.aggressive.warPct).toBe(100);
    expect(AI_TUNING.trader.answersAtOnce).toBe(true);
    expect(AI_TUNING.protector.answersAtOnce).toBe(true);
    expect(AI_TUNING.trader.allyAskOdds).toBeLessThan(
      NORMAL_TUNING.allyAskOdds,
    );
    expect(AI_TUNING.trader.betrayal).toBe("less");
    expect(AI_TUNING.protector.betrayal).toBe("rarely");
    expect(AI_TUNING.aggressive.betrayal).toBe("more");
    expect(AI_TUNING.mad_scientist.betrayal).toBe("usual");
    expect(AI_TUNING.mad_scientist.nukes).toBe("focused");
    expect(AI_TUNING.trader.nukes).toBe("answer");
    expect(AI_TUNING.protector.nukes).toBe("grudge");
    expect(AI_TUNING.trader.islander).toBe(true);
    expect(AI_TUNING.protector.avenger).toBe(true);
  });
});

describe("a dealt nation in the simulation", () => {
  /** A NationExecution's pace and ratios once it has joined `g`. */
  function tuned(g: Game, id: string) {
    const exec = new NationExecution(
      "GAME0001",
      g.nations().find((n) => n.playerInfo.id === id)!,
    );
    exec.init(g);
    const e = exec as unknown as Record<string, number> & {
      decisionRate(ticks: number): number;
    };
    return {
      attackRate: e.attackRate,
      attackTick: e.attackTick,
      trigger: e.triggerRatio,
      reserve: e.reserveRatio,
      expand: e.expandRatio,
      decisionRate: (t: number) => e.decisionRate(t),
    };
  }

  test("an Aggressive nation decides a fifth faster and attacks sooner than the same nation in rules 5", async () => {
    const now = await aipGame(["aggressive"]);
    const before = await aipGame(["aggressive"], { rules: 5 });
    for (const id of IDS) {
      const a = tuned(now, id);
      const b = tuned(before, id);
      expect(a.attackRate).toBe(Math.round(b.attackRate * 0.8));
      expect(Math.round(a.trigger * 100)).toBe(
        Math.round(b.trigger * 100) - 12,
      );
      expect(Math.round(a.reserve * 100)).toBe(Math.round(b.reserve * 100) - 8);
      expect(a.trigger).toBeGreaterThanOrEqual(0.38);
      expect(a.trigger).toBeLessThanOrEqual(0.47);
      expect(a.reserve).toBeGreaterThanOrEqual(0.22);
      expect(a.reserve).toBeLessThanOrEqual(0.31);
      expect(a.decisionRate(10_000)).toBe(a.attackRate);
    }
  });

  test("a Normal nation in rules 6 is the same as in rules 5", async () => {
    const now = await aipGame(["normal"]);
    const before = await aipGame(undefined, { rules: 5 });
    for (const id of IDS) {
      const { decisionRate: _a, ...a } = tuned(now, id);
      const { decisionRate: _b, ...b } = tuned(before, id);
      expect(a).toEqual(b);
    }
  });

  test("a Protector is a little slower in the opening minutes, then decides as usual", async () => {
    const g = await aipGame(["protector"]);
    const p = tuned(g, IDS[0]);
    const start = g.config().numSpawnPhaseTurns();
    expect(p.decisionRate(start + 100)).toBe(Math.round(p.attackRate * 1.25));
    expect(p.decisionRate(start + 1799)).toBe(Math.round(p.attackRate * 1.25));
    expect(p.decisionRate(start + 1800)).toBe(p.attackRate);
    expect(p.trigger).toBeGreaterThanOrEqual(0.7);
    expect(p.reserve).toBeGreaterThanOrEqual(0.48);
  });

  /** Whether `id` wants another `type` with `cities` cities and `owned` of it. */
  function wants(
    g: Game,
    id: string,
    type: UnitType,
    cities: number,
    owned: number,
  ): boolean {
    const p = g.player(id);
    const x0 = IDS.indexOf(id) * 30;
    for (let x = x0; x < x0 + 30; x++) {
      for (let y = 0; y < 60; y++) p.conquer(g.ref(x, y));
    }
    for (let i = 0; i < owned; i++) {
      p.buildUnit(type, g.ref(x0 + 2 + i * 3, 50), {});
    }
    const behavior = new NationStructureBehavior(new PseudoRandom(1), g, p);
    return (
      behavior as unknown as {
        shouldBuildStructure(t: UnitType, c: number, coast: boolean): boolean;
      }
    ).shouldBuildStructure(type, cities, false);
  }

  test("Mad Scientists want more factories, SAMs and silos per city than Normal", async () => {
    const ms = await aipGame(["mad_scientist"]);
    const normal = await aipGame(["normal"]);
    // 4 cities: Normal wants 3 factories, 0 SAMs (Medium) and 1 silo
    expect(wants(normal, IDS[0], UnitType.Factory, 4, 3)).toBe(false);
    expect(wants(ms, IDS[0], UnitType.Factory, 4, 3)).toBe(true);
    expect(wants(normal, IDS[1], UnitType.SAMLauncher, 4, 0)).toBe(false);
    expect(wants(ms, IDS[1], UnitType.SAMLauncher, 4, 1)).toBe(true);
    expect(wants(normal, IDS[2], UnitType.MissileSilo, 10, 2)).toBe(false);
    expect(wants(ms, IDS[2], UnitType.MissileSilo, 10, 4)).toBe(true);
    // Past the usual three silos
    expect(wants(normal, IDS[3], UnitType.MissileSilo, 30, 3)).toBe(false);
    expect(wants(ms, IDS[3], UnitType.MissileSilo, 30, 6)).toBe(true);
    // The first silo comes sooner: at 2 cities, not 3
    expect(wants(normal, IDS[4], UnitType.MissileSilo, 2, 0)).toBe(false);
    expect(wants(ms, IDS[4], UnitType.MissileSilo, 2, 0)).toBe(true);
  });

  test("Traders want more ports and factories; Protectors twice the SAMs and silos", async () => {
    const trader = await aipGame(["trader"]);
    const protector = await aipGame(["protector"]);
    const normal = await aipGame(["normal"]);
    expect(wants(normal, IDS[0], UnitType.Port, 4, 3)).toBe(false);
    expect(wants(trader, IDS[0], UnitType.Port, 4, 3)).toBe(true);
    expect(wants(normal, IDS[1], UnitType.Factory, 4, 3)).toBe(false);
    expect(wants(trader, IDS[1], UnitType.Factory, 4, 3)).toBe(true);
    // 10 cities on Medium: Normal wants 2 SAMs, a Protector 4
    expect(wants(normal, IDS[2], UnitType.SAMLauncher, 10, 2)).toBe(false);
    expect(wants(protector, IDS[2], UnitType.SAMLauncher, 10, 3)).toBe(true);
    expect(wants(protector, IDS[3], UnitType.SAMLauncher, 10, 4)).toBe(false);
    // 15 cities: Normal wants 3 silos, a Protector 6
    expect(wants(normal, IDS[4], UnitType.MissileSilo, 15, 3)).toBe(false);
    expect(wants(protector, IDS[4], UnitType.MissileSilo, 15, 5)).toBe(true);
    expect(wants(protector, IDS[5], UnitType.MissileSilo, 30, 6)).toBe(false);
  });
});

describe("turning on allies", () => {
  /**
   * A dealt nation allied with a human it borders, and nobody else. Each
   * case decides about the ally with `ours` and `theirs` troops.
   */
  async function betrays(
    option: string,
    difficulty: Difficulty,
    ours: number,
    theirs: number,
    { traitor = false, onlyNeighbour = false } = {},
  ): Promise<boolean> {
    const g = await aipGame([option], {
      difficulty,
      ids: ["me"],
      humans: [
        new PlayerInfo("ally", PlayerType.Human, null, "ally"),
        new PlayerInfo("other", PlayerType.Human, null, "other"),
      ],
    });
    const me = g.player("me");
    const ally = g.player("ally");
    const other = g.player("other");
    for (let x = 0; x < 30; x++) {
      for (let y = 0; y < 30; y++) {
        me.conquer(g.ref(x, y));
        ally.conquer(g.ref(x + 30, y));
        other.conquer(g.ref(x, y + 30));
      }
    }
    g.addExecution(new AllianceRequestExecution(me, ally.id()));
    g.executeNextTick();
    g.addExecution(new AllianceRequestExecution(ally, me.id()));
    g.executeNextTick();
    expect(me.isAlliedWith(ally)).toBe(true);
    if (traitor) ally.markTraitor();
    me.setTroops(ours);
    ally.setTroops(theirs);
    other.setTroops(ours * 10); // a strong neighbour who isn't an ally
    const random = new PseudoRandom(42);
    const alliance = new NationAllianceBehavior(
      random,
      g,
      me,
      new NationEmojiBehavior(random, g, me),
    );
    const enemies = onlyNeighbour ? [] : [other];
    return alliance.maybeBetray(
      ally,
      alliance.findJuiciestAlly([ally]),
      [ally],
      enemies,
    );
  }

  test("Aggressive turns on an ally four times weaker on any difficulty; Normal waits for ten times (Easy, Medium)", async () => {
    expect(await betrays("aggressive", Difficulty.Hard, 50_000, 10_000)).toBe(
      true,
    );
    expect(await betrays("normal", Difficulty.Hard, 50_000, 10_000)).toBe(
      false,
    );
    expect(await betrays("aggressive", Difficulty.Medium, 50_000, 10_000)).toBe(
      true,
    );
    expect(await betrays("normal", Difficulty.Medium, 50_000, 10_000)).toBe(
      false,
    );
    expect(await betrays("aggressive", Difficulty.Medium, 30_000, 10_000)).toBe(
      false,
    );
  });

  test("Aggressive turns on its only neighbour once twice as strong (Normal: three times)", async () => {
    const opts = { onlyNeighbour: true };
    expect(
      await betrays("aggressive", Difficulty.Hard, 25_000, 10_000, opts),
    ).toBe(true);
    expect(await betrays("normal", Difficulty.Hard, 25_000, 10_000, opts)).toBe(
      false,
    );
  });

  test("a Trader turns on allies less often: not at ten times weaker, only at twenty", async () => {
    expect(await betrays("normal", Difficulty.Medium, 150_000, 10_000)).toBe(
      true,
    );
    expect(await betrays("trader", Difficulty.Medium, 150_000, 10_000)).toBe(
      false,
    );
    expect(await betrays("trader", Difficulty.Medium, 250_000, 10_000)).toBe(
      true,
    );
    // Nor its only neighbour, however weak, on Hard
    expect(
      await betrays("trader", Difficulty.Hard, 50_000, 10_000, {
        onlyNeighbour: true,
      }),
    ).toBe(false);
    // A traitor ally, though, as usual
    expect(
      await betrays("trader", Difficulty.Hard, 10_000, 10_000, {
        traitor: true,
      }),
    ).toBe(true);
  });

  test("a Protector rarely does: only a traitor ally with less than half its troops", async () => {
    expect(await betrays("protector", Difficulty.Medium, 500_000, 10_000)).toBe(
      false,
    );
    expect(
      await betrays("protector", Difficulty.Hard, 50_000, 10_000, {
        onlyNeighbour: true,
      }),
    ).toBe(false);
    expect(
      await betrays("protector", Difficulty.Hard, 15_000, 10_000, {
        traitor: true,
      }),
    ).toBe(false);
    expect(
      await betrays("protector", Difficulty.Hard, 25_000, 10_000, {
        traitor: true,
      }),
    ).toBe(true);
    // Normal would have turned on the traitor at 15k vs 10k
    expect(
      await betrays("normal", Difficulty.Hard, 15_000, 10_000, {
        traitor: true,
      }),
    ).toBe(true);
  });
});

/** Every nation has a player, so the helpers above can look them up. */
test("the test helper's nations are the game's nations", async () => {
  const g = await aipGame(["trader"]);
  expect(g.nations().map((n) => n.playerInfo.id)).toEqual(IDS);
  for (const id of IDS) expect(g.player(id)).toBeDefined();
  const players: Player[] = IDS.map((id) => g.player(id));
  expect(players.every((p) => p.type() === PlayerType.Nation)).toBe(true);
});
