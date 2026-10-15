// DFSTORE (r21): AI personality packs. The packs a game uses travel in its
// config; every client deals the same personas to the same nations, and a
// persona's temperament leans the nation's play in rules 5 games only. AIP
// (r23) replaced them from rules 6 (AiPersonalityTypes.test.ts); these
// tests keep edition 5 playing as it did.

import {
  Cell,
  Nation,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import {
  DERPY_RULES,
  GameConfig,
  GameConfigSchema,
} from "@openfront/engine-api/Schemas";
import {
  AI_PERSONALITY_PACKS,
  findPersona,
  NO_TEMPERAMENT,
  personaFlag,
  personaFromFlag,
  personaPool,
  TEMPERAMENT_TUNING,
  TEMPERAMENTS,
  temperedAttackRate,
  temperedRatios,
} from "@openfront/engine-lib/game/AiPersonalities";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import { NationStructureBehavior } from "@openfront/engine/execution/nation/NationStructureBehavior";
import { NationExecution } from "@openfront/engine/execution/NationExecution";
import {
  applyNationPersonas,
  nationTemperament,
} from "@openfront/engine/game/NationPersonas";
import { zb } from "@openfront/zbin";
import { setup } from "./util/Setup";

function manifestNations(n: number): Nation[] {
  return Array.from(
    { length: n },
    (_, i) =>
      new Nation(
        new Cell(10 + i, 20),
        new PlayerInfo(
          `Nation ${i}`,
          PlayerType.Nation,
          null,
          `nation${i}`,
          false,
          null,
          [],
          null,
          "fr",
        ),
      ),
  );
}

const config = (packs?: string[]) =>
  ({ aiPersonalities: packs }) as unknown as GameConfig;

describe("the AI personality packs", () => {
  test("five packs of six personas, with unique ids and names", () => {
    expect(AI_PERSONALITY_PACKS.map((p) => p.id)).toEqual([
      "ai_pirates",
      "ai_empires",
      "ai_merchants",
      "ai_scientists",
      "ai_warlords",
    ]);
    const all = AI_PERSONALITY_PACKS.flatMap((p) => p.personas);
    expect(all).toHaveLength(30);
    expect(new Set(all.map((p) => p.id)).size).toBe(30);
    expect(new Set(all.map((p) => p.name)).size).toBe(30);
    for (const p of all) {
      expect(p.id).toMatch(/^[a-z0-9_]+$/);
      expect(personaFlag(p).length).toBeLessThanOrEqual(64);
      expect(personaFromFlag(personaFlag(p))).toBe(p);
      // Short enough to label the map.
      expect(p.name.length).toBeLessThanOrEqual(22);
    }
  });

  test("every temperament is played by someone, and leans its own way", () => {
    const used = new Set(
      AI_PERSONALITY_PACKS.flatMap((p) => p.personas.map((x) => x.temperament)),
    );
    expect([...used].sort()).toEqual([...TEMPERAMENTS].sort());
    const t = TEMPERAMENT_TUNING;
    expect(t.aggressive.attackRate).toBeLessThan(1);
    expect(t.turtle.attackRate).toBeGreaterThan(1);
    expect(t.trader.embargoes).toBe(false);
    expect(t.turtle.nukesOnlyAttackers).toBe(true);
    expect(t.nuker.maxSilos).toBeGreaterThan(NO_TEMPERAMENT.maxSilos);
    expect(t.turtle.structures[UnitType.SAMLauncher]).toBe(2);
    expect(t.trader.structures[UnitType.Port]).toBeGreaterThan(1);
  });

  test("tempered ratios keep the reserve below the trigger, inside bounds", () => {
    for (const temp of TEMPERAMENTS) {
      for (const trigger of [0.5, 0.55, 0.59]) {
        for (const reserve of [0.3, 0.35, 0.39]) {
          const r = temperedRatios(TEMPERAMENT_TUNING[temp], {
            trigger,
            reserve,
            expand: 0.15,
          });
          expect(r.reserve).toBeLessThan(r.trigger);
          expect(r.trigger).toBeGreaterThanOrEqual(0.3);
          expect(r.trigger).toBeLessThanOrEqual(0.85);
          expect(r.reserve).toBeGreaterThanOrEqual(0.15);
          expect(r.expand).toBeGreaterThanOrEqual(0.05);
        }
      }
    }
    expect(temperedAttackRate(TEMPERAMENT_TUNING.aggressive, 60)).toBe(48);
    expect(temperedAttackRate(TEMPERAMENT_TUNING.turtle, 60)).toBe(75);
    expect(temperedAttackRate(NO_TEMPERAMENT, 60)).toBe(60);
  });

  test("the pool follows catalog order, whatever order the host picked", () => {
    const a = personaPool(["ai_warlords", "ai_pirates"]).map((p) => p.id);
    const b = personaPool(["ai_pirates", "ai_warlords", "ai_pirates"]).map(
      (p) => p.id,
    );
    expect(a).toEqual(b);
    expect(a[0]).toBe("pirates_redbeard");
    expect(personaPool(["no_such_pack"])).toEqual([]);
    expect(personaPool(undefined)).toEqual([]);
  });
});

describe("dealing personas to nations", () => {
  test("the same config and game deal the same personas, every time", () => {
    const deal = () =>
      applyNationPersonas(
        manifestNations(8),
        config(["ai_pirates", "ai_merchants"]),
        5,
        "GAME0001",
      ).map((n) => [n.playerInfo.name, n.playerInfo.nationFlag]);
    expect(deal()).toEqual(deal());
    // The packs' order doesn't matter.
    const swapped = applyNationPersonas(
      manifestNations(8),
      config(["ai_merchants", "ai_pirates"]),
      5,
      "GAME0001",
    ).map((n) => [n.playerInfo.name, n.playerInfo.nationFlag]);
    expect(swapped).toEqual(deal());
    // Another game deals another hand.
    const other = applyNationPersonas(
      manifestNations(8),
      config(["ai_pirates", "ai_merchants"]),
      5,
      "GAME0002",
    ).map((n) => n.playerInfo.name);
    expect(other).not.toEqual(deal().map(([name]) => name));
  });

  test("nations keep their ids and spawn cells; names and flags are the persona's", () => {
    const before = manifestNations(4);
    const after = applyNationPersonas(
      before,
      config(["ai_scientists"]),
      5,
      "GAME0001",
    );
    for (let i = 0; i < 4; i++) {
      expect(after[i].playerInfo.id).toBe(before[i].playerInfo.id);
      expect(after[i].spawnCell).toBe(before[i].spawnCell);
      const persona = personaFromFlag(after[i].playerInfo.nationFlag)!;
      expect(persona.pack).toBe("ai_scientists");
      expect(after[i].playerInfo.name).toBe(persona.name);
    }
    expect(new Set(after.map((n) => n.playerInfo.name)).size).toBe(4);
  });

  test("more nations than personas: the deal goes round again with numbers", () => {
    const nations = applyNationPersonas(
      manifestNations(14),
      config(["ai_empires"]),
      5,
      "GAME0001",
    );
    const names = nations.map((n) => n.playerInfo.name);
    expect(new Set(names).size).toBe(14);
    expect(names.filter((n) => n.endsWith(" II"))).toHaveLength(6);
    expect(names.filter((n) => n.endsWith(" III"))).toHaveLength(2);
  });

  test("no packs, unknown packs, rules before 5 or from 6: nothing changes", () => {
    const nations = manifestNations(3);
    expect(applyNationPersonas(nations, config(), 5, "G")).toBe(nations);
    expect(applyNationPersonas(nations, config([]), 5, "G")).toBe(nations);
    expect(applyNationPersonas(nations, config(["nope"]), 5, "G")).toBe(
      nations,
    );
    expect(applyNationPersonas(nations, config(["ai_pirates"]), 4, "G")).toBe(
      nations,
    );
    // AIP (r23): from rules 6 nations keep their own names and flags
    expect(applyNationPersonas(nations, config(["ai_pirates"]), 6, "G")).toBe(
      nations,
    );
  });

  test("the packs travel in the game config, on the binary wire too", () => {
    // AIP (r23): the packs are rules 5's; edition 6 has personalities
    expect(DERPY_RULES).toBe(6);
    const cfg = GameConfigSchema.parse({
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
      aiPersonalities: ["ai_pirates", "ai_warlords"],
    });
    const Root = zb.object(GameConfigSchema.shape);
    const back = Root.parseBytes(Root.serialize(cfg));
    expect(back.aiPersonalities).toEqual(["ai_pirates", "ai_warlords"]);
    expect(
      GameConfigSchema.safeParse({ ...cfg, aiPersonalities: ["Bad Pack!"] })
        .success,
    ).toBe(false);
  });
});

describe("temperaments in the simulation", () => {
  const coinhook = findPersona("pirates_coinhook")!; // trader
  const powderkeg = findPersona("pirates_powderkeg")!; // nuker
  const barnacle = findPersona("pirates_barnacle")!; // turtle

  async function game(rules: number, packs: string[] = ["ai_pirates"]) {
    const nation = (id: string, flag: string | null) =>
      new PlayerInfo(
        id,
        PlayerType.Nation,
        null,
        id,
        false,
        null,
        [],
        null,
        flag,
      );
    const g = await setup(
      "big_plains",
      { derpyRules: rules, aiPersonalities: packs, instantBuild: true },
      [
        nation("trader", personaFlag(coinhook)),
        nation("nuker", personaFlag(powderkeg)),
        nation("turtle", personaFlag(barnacle)),
        nation("plain", "fr"),
        new PlayerInfo("Human", PlayerType.Human, null, "human"),
      ],
    );
    // Everyone holds a tile, so everyone counts as alive.
    ["trader", "nuker", "turtle", "plain", "human"].forEach((id, i) =>
      g.player(id).conquer(g.ref(190, 10 + i * 5)),
    );
    return g;
  }

  test("rules 5: each persona nation plays its temperament", async () => {
    const g = await game(5);
    expect(nationTemperament(g, g.player("trader"))).toBe(
      TEMPERAMENT_TUNING.trader,
    );
    expect(nationTemperament(g, g.player("nuker"))).toBe(
      TEMPERAMENT_TUNING.nuker,
    );
    expect(nationTemperament(g, g.player("plain"))).toBe(NO_TEMPERAMENT);
    expect(nationTemperament(g, g.player("human"))).toBe(NO_TEMPERAMENT);
  });

  test("rules 4 or 6, or a pack the config doesn't list: the usual play", async () => {
    const old = await game(4);
    expect(nationTemperament(old, old.player("trader"))).toBe(NO_TEMPERAMENT);
    const later = await game(6);
    expect(nationTemperament(later, later.player("trader"))).toBe(
      NO_TEMPERAMENT,
    );
    const unlisted = await game(5, ["ai_empires"]);
    expect(nationTemperament(unlisted, unlisted.player("trader"))).toBe(
      NO_TEMPERAMENT,
    );
  });

  /** A NationExecution's pace and ratios once it has joined `g`. */
  function tuned(g: Awaited<ReturnType<typeof game>>, id: string) {
    const p = g.player(id);
    const exec = new NationExecution(
      "GAME0001",
      new Nation(new Cell(5, 5), p.info()),
    );
    exec.init(g);
    const e = exec as unknown as Record<string, number>;
    return {
      attackRate: e.attackRate,
      trigger: e.triggerRatio,
      reserve: e.reserveRatio,
    };
  }

  test("a turtle waits longer and keeps more home; the same nation in rules 4 doesn't", async () => {
    const now = tuned(await game(5), "turtle");
    const before = tuned(await game(4), "turtle");
    // The same seed draws the same base numbers; the turtle leans them.
    expect(now.attackRate).toBe(Math.round(before.attackRate * 1.25));
    expect(now.trigger).toBeCloseTo(before.trigger + 0.15, 10);
    expect(now.reserve).toBeCloseTo(before.reserve + 0.12, 10);
  });

  test("the deal and the tuning are the same on every client", async () => {
    const a = tuned(await game(5), "nuker");
    const b = tuned(await game(5), "nuker");
    expect(a).toEqual(b);
  });

  test("a trader never starts an embargo; a plain nation does", async () => {
    const g = await game(5);
    const human = g.player("human");
    for (const id of ["trader", "plain"]) {
      const p = g.player(id);
      p.updateRelation(human, -1000, "other");
      const exec = new NationExecution(
        "GAME0001",
        new Nation(new Cell(5, 5), p.info()),
      );
      exec.init(g);
      (
        exec as unknown as { handleEmbargoesToHostileNations(): void }
      ).handleEmbargoesToHostileNations();
      expect(p.hasEmbargoAgainst(human)).toBe(id === "plain");
    }
  });

  test("a nuker keeps building silos past the usual three", async () => {
    const g = await game(5);
    const wants = (id: string) => {
      const p = g.player(id);
      for (let x = 1; x < 60; x++) {
        for (
          let y = id === "nuker" ? 1 : 100;
          y < (id === "nuker" ? 60 : 160);
          y++
        ) {
          p.conquer(g.ref(x, y));
        }
      }
      const y0 = id === "nuker" ? 10 : 110;
      for (let i = 0; i < 3; i++) {
        p.buildUnit(UnitType.MissileSilo, g.ref(10 + i * 10, y0), {});
      }
      const behavior = new NationStructureBehavior(new PseudoRandom(1), g, p);
      return (
        behavior as unknown as {
          shouldBuildStructure(
            t: UnitType,
            cities: number,
            coast: boolean,
          ): boolean;
        }
      ).shouldBuildStructure(UnitType.MissileSilo, 10, false);
    };
    expect(wants("nuker")).toBe(true);
    expect(wants("plain")).toBe(false);
  });
});
