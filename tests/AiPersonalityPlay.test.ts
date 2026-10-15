// AIP (r23): the personalities at play (rules 6): a Protector sits tight
// until it is attacked, then turns its army and its nukes on the attacker
// and later stands down; a Trader alone on an island fills it and takes the
// unclaimed islets across the sea rather than invading the continent; the
// deal and the play are deterministic, snapshots keep what the nations
// remember, and edition 5 games play exactly as before.

import {
  Cell,
  Difficulty,
  Nation,
  PlayerInfo,
  PlayerType,
  Relation,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { GameConfig } from "@openfront/engine-api/Schemas";
import { GRUDGE_TICKS } from "@openfront/engine-lib/game/AiPersonalityTypes";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import { readVersioned } from "@openfront/engine-lib/snapshot/SnapshotType";
import { simpleHash } from "@openfront/engine-lib/Util";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import { MirvExecution } from "@openfront/engine/execution/MIRVExecution";
import { NationMIRVBehavior } from "@openfront/engine/execution/nation/NationMIRVBehavior";
import { NationNukeBehavior } from "@openfront/engine/execution/nation/NationNukeBehavior";
import { NationStructureBehavior } from "@openfront/engine/execution/nation/NationStructureBehavior";
import { NationExecution } from "@openfront/engine/execution/NationExecution";
import { NukeExecution } from "@openfront/engine/execution/NukeExecution";
import { SpawnExecution } from "@openfront/engine/execution/SpawnExecution";
import {
  AiAttackBehavior,
  AiAttackBehaviorSnapshot,
} from "@openfront/engine/execution/utils/AiAttackBehavior";
import { Execution, Game, Player } from "@openfront/engine/game/Game";
import { GameImpl } from "@openfront/engine/game/GameImpl";
import { dealtAiTypes } from "@openfront/engine/game/NationAiTypes";
import { vi } from "vitest";
import {
  createScriptedRunner,
  scriptedGameStart,
  stepScripted,
} from "./util/ScriptedGame";
import { setup } from "./util/Setup";
import { expectSnapshotRoundTrip } from "./util/Snapshot";
import { TestConfig } from "./util/TestConfig";
import { executeTicks } from "./util/utils";

function conquerRect(
  g: Game,
  p: Player,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  for (let x = x0; x < x1; x++) {
    for (let y = y0; y < y1; y++) {
      if (g.isLand(g.ref(x, y))) p.conquer(g.ref(x, y));
    }
  }
}

/** A nation's execution with its behaviors running, as after its spawn. */
function nationAt(g: Game, id: string) {
  const exec = new NationExecution(
    "GAME0001",
    g.nations().find((n) => n.playerInfo.id === id)!,
  );
  exec.init(g);
  const e = exec as unknown as {
    initializeBehaviors(): void;
    attackBehavior: AiAttackBehavior;
    nukeBehavior: NationNukeBehavior;
    mirvBehavior: NationMIRVBehavior;
    structureBehavior: NationStructureBehavior;
  };
  e.initializeBehaviors();
  return {
    exec,
    attack: e.attackBehavior,
    nuke: e.nukeBehavior,
    mirv: e.mirvBehavior,
    structure: e.structureBehavior,
  };
}

/** Every execution the game holds, started or waiting to start. */
function executions(g: Game): Execution[] {
  return (g as GameImpl).executions();
}

function queued<T>(g: Game, cls: abstract new (...a: never[]) => T): T[] {
  return executions(g).filter((e): e is T & Execution => e instanceof cls);
}

/**
 * big_plains, all land: the nation holds the west half, a human raider
 * the land east of it (the far east is empty, beyond the raider), so the
 * nation has no empty land to take. It has a silo and gold, 65% of its
 * troop cap, and hates the raider.
 */
async function standoff(option: string) {
  const g = await setup(
    "big_plains",
    {
      derpyRules: 6,
      aiPersonalities: [option],
      difficulty: Difficulty.Medium,
      instantBuild: true,
    },
    [new PlayerInfo("raider", PlayerType.Human, null, "raider")],
    undefined,
    undefined,
    true,
    [
      new Nation(
        new Cell(50, 100),
        new PlayerInfo("guard", PlayerType.Nation, null, "guard"),
      ),
    ],
  );
  const guard = g.player("guard");
  const raider = g.player("raider");
  conquerRect(g, guard, 0, 0, 100, 200);
  conquerRect(g, raider, 100, 0, 170, 200);
  guard.setSpawnTile(g.ref(50, 100));
  raider.setSpawnTile(g.ref(150, 100));
  guard.buildUnit(UnitType.MissileSilo, g.ref(20, 100), {});
  guard.addGold(500_000_000n);
  const max = g.config().maxTroops(guard);
  guard.setTroops(Math.floor(max * 0.65));
  raider.setTroops(Math.floor(max * 0.3));
  guard.updateRelation(raider, -100, "attacked");
  expect(guard.relation(raider)).toBe(Relation.Hostile);
  return { g, guard, raider, max, ...nationAt(g, "guard") };
}

const attacksOn = (g: Game, target: Player) =>
  queued(g, AttackExecution).filter(
    (e) =>
      (e as unknown as { _targetID: string | null })._targetID === target.id(),
  );
const nukesAt = (g: Game, target: Player) =>
  queued(g, NukeExecution).filter(
    (e) => g.owner((e as unknown as { dst: number }).dst) === target,
  );
const mirvsAt = (g: Game, target: Player) =>
  queued(g, MirvExecution).filter(
    (e) => g.owner((e as unknown as { dst: number }).dst) === target,
  );

/** The raider gets a silo and money, and puts an atom bomb in the air at the nation's land. */
function raiderBombs(g: Game, raider: Player) {
  raider.buildUnit(UnitType.MissileSilo, g.ref(160, 100), {});
  raider.addGold(500_000_000n);
  g.addExecution(
    new NukeExecution(UnitType.AtomBomb, raider, g.ref(40, 100), null),
  );
  g.executeNextTick();
  g.executeNextTick();
  expect(raider.units(UnitType.AtomBomb)).toHaveLength(1);
}

/** Asks the nation to nuke up to ten times (Medium spares a human one time in four). */
function tryNukes(g: Game, nuke: NationNukeBehavior, target: Player) {
  for (let i = 0; i < 10 && nukesAt(g, target).length === 0; i++) {
    nuke.maybeSendNuke();
  }
  return nukesAt(g, target).length;
}

describe("a Protector", () => {
  test("left alone, it sits tight where a Normal nation attacks and nukes", async () => {
    const normal = await standoff("normal");
    for (let i = 0; i < 10; i++) normal.attack.maybeAttack();
    // (Medium spares a human one time in four)
    for (
      let i = 0;
      i < 10 && nukesAt(normal.g, normal.raider).length === 0;
      i++
    ) {
      normal.nuke.maybeSendNuke();
    }
    expect(attacksOn(normal.g, normal.raider).length).toBeGreaterThan(0);
    expect(nukesAt(normal.g, normal.raider).length).toBeGreaterThan(0);

    const p = await standoff("protector");
    expect(dealtAiTypes(p.g).get("guard")).toBe("protector");
    for (let i = 0; i < 10; i++) {
      p.attack.maybeAttack();
      p.nuke.maybeSendNuke();
    }
    expect(attacksOn(p.g, p.raider)).toHaveLength(0);
    expect(nukesAt(p.g, p.raider)).toHaveLength(0);
    expect(p.attack.grudgeTarget()).toBeNull();
  });

  test("attacked, it turns most of its army and its nukes on the attacker, remembers, then stands down", async () => {
    const { g, guard, raider, max, attack, nuke } = await standoff("protector");
    const raid = raider.createAttack(guard, 20_000, null, new Set());

    attack.maybeAttack();
    expect(attack.grudgeTarget()).toBe(raider);
    const counter = attacksOn(g, raider);
    expect(counter).toHaveLength(1);
    // All but a quarter of its troop cap: 65% - 25%
    const sent = (counter[0] as unknown as { startTroops: number }).startTroops;
    expect(sent).toBeGreaterThan(max * 0.39);
    expect(sent).toBeLessThanOrEqual(max * 0.41);

    nuke.maybeSendNuke();
    expect(nukesAt(g, raider)).toHaveLength(1);

    // The raid ends; the counter-attack and the bomb are called off
    raid.delete();
    g.executeNextTick();
    for (const a of guard.outgoingAttacks()) a.delete();
    for (const u of guard.units(UnitType.AtomBomb, UnitType.HydrogenBomb)) {
      u.delete(false);
    }
    for (const e of executions(g)) {
      if (e instanceof NukeExecution) {
        (e as unknown as { active: boolean }).active = false;
      }
    }

    // Some minutes later it still remembers, and goes again
    const start = g.ticks();
    while (g.ticks() < start + GRUDGE_TICKS - 600) g.executeNextTick();
    guard.setTroops(Math.floor(max * 0.65));
    attack.maybeAttack();
    expect(attack.grudgeTarget()).toBe(raider);
    expect(attacksOn(g, raider).length).toBeGreaterThan(0);
    for (const a of guard.outgoingAttacks()) a.delete();
    for (const e of attacksOn(g, raider)) {
      (e as unknown as { active: boolean }).active = false;
    }

    // Then it forgets, and sits tight again
    while (g.ticks() < start + GRUDGE_TICKS + 10) g.executeNextTick();
    guard.setTroops(Math.floor(max * 0.65));
    const before = attacksOn(g, raider).length;
    for (let i = 0; i < 10; i++) attack.maybeAttack();
    expect(attack.grudgeTarget()).toBeNull();
    expect(attacksOn(g, raider).length).toBe(before);
    expect(nuke.findBestNukeTarget()).toBeNull();
  }, 60_000);

  test("a bomb flying at it is answered with a bomb, even before it holds a grudge", async () => {
    // r24: it nukes whoever is hitting it now first, then whoever it
    // remembers (r23 nuked only its grudge, so nobody before its next
    // decision noted the bomber)
    const { g, raider, attack, nuke } = await standoff("protector");
    expect(tryNukes(g, nuke, raider)).toBe(0);
    raiderBombs(g, raider);
    expect(attack.grudgeTarget()).toBeNull();
    expect(nuke.findBestNukeTarget()).toBe(raider);
    expect(tryNukes(g, nuke, raider)).toBeGreaterThan(0);
  });

  test("a bomb at its land, noted as it flies, is a grudge too", async () => {
    const { g, raider, attack } = await standoff("protector");
    raiderBombs(g, raider);
    attack.noteBombers();
    expect(attack.grudgeTarget()).toBe(raider);
    expect(attack.recentBomber()).toBe(raider);
  });

  test("a nuke at its land counts as an attack", async () => {
    const { g, raider, attack } = await standoff("protector");
    raider.buildUnit(UnitType.MissileSilo, g.ref(180, 100), {});
    raider.addGold(500_000_000n);
    g.addExecution(
      new NukeExecution(UnitType.AtomBomb, raider, g.ref(40, 100), null),
    );
    g.executeNextTick();
    g.executeNextTick();
    expect(raider.units(UnitType.AtomBomb)).toHaveLength(1);
    attack.maybeAttack();
    expect(attack.grudgeTarget()).toBe(raider);
  });
});

describe("a Mad Scientist", () => {
  test("keeps nuking: each bomb raises the gold it waits for before the next less than Normal's", async () => {
    // Percent of the gold it waited for before: after an atom bomb, and
    // after a hydrogen bomb
    async function rises(option: string): Promise<number[]> {
      const { g, raider, nuke } = await standoff(option);
      const n = nuke as unknown as {
        sendNuke(tile: number, type: UnitType, target: Player): void;
        atomBombPerceivedCost: bigint;
        hydrogenBombPerceivedCost: bigint;
      };
      const atom = n.atomBombPerceivedCost;
      const hydro = n.hydrogenBombPerceivedCost;
      n.sendNuke(g.ref(150, 100), UnitType.AtomBomb, raider);
      n.sendNuke(g.ref(150, 100), UnitType.HydrogenBomb, raider);
      return [
        Number((n.atomBombPerceivedCost * 100n) / atom),
        Number((n.hydrogenBombPerceivedCost * 100n) / hydro),
      ];
    }
    expect(await rises("normal")).toEqual([150, 125]);
    // (r24: a tenth after an atom bomb, a twentieth after a hydrogen bomb)
    expect(await rises("mad_scientist")).toEqual([110, 105]);
  });
});

describe("a Mad Scientist's targets", () => {
  test("the ones a Normal nation picks first, then a strong enemy", async () => {
    // A neutral raider, no war: neither picks anyone to nuke (r24: nuking
    // strong neighbours at peace only made enemies of them)
    const neutral = async (option: string) => {
      const s = await standoff(option);
      s.guard.updateRelation(s.raider, 100, "gift_gold");
      expect(s.guard.relation(s.raider)).not.toBe(Relation.Hostile);
      return s;
    };
    expect((await neutral("normal")).nuke.findBestNukeTarget()).toBeNull();
    expect(
      (await neutral("mad_scientist")).nuke.findBestNukeTarget(),
    ).toBeNull();
    // The raider hates it (it doesn't hate the raider back): a Normal nation
    // still picks nobody, a Mad Scientist the raider
    const hated = async (option: string) => {
      const s = await neutral(option);
      s.raider.updateRelation(s.guard, -100, "attacked");
      return s;
    };
    expect((await hated("normal")).nuke.findBestNukeTarget()).toBeNull();
    const ms = await hated("mad_scientist");
    expect(ms.nuke.findBestNukeTarget()).toBe(ms.raider);
    // Hating the raider itself, both pick it
    const hostile = await standoff("mad_scientist");
    expect(hostile.nuke.findBestNukeTarget()).toBe(hostile.raider);
  });
});

describe("a Trader answers", () => {
  test("a bomb flying at it, with a bomb; and nukes nobody else", async () => {
    const { g, raider, nuke } = await standoff("trader");
    // It hates the raider, but the raider isn't hitting it
    expect(nuke.findBestNukeTarget()).toBeNull();
    expect(tryNukes(g, nuke, raider)).toBe(0);
    raiderBombs(g, raider);
    expect(nuke.findBestNukeTarget()).toBe(raider);
    expect(tryNukes(g, nuke, raider)).toBeGreaterThan(0);
  });

  test("a bomb that landed before its next decision, for a minute after", async () => {
    const { g, raider, attack, nuke } = await standoff("trader");
    raiderBombs(g, raider);
    // It notes the bomb while it flies (every tick, in its execution)...
    attack.noteBombers();
    while (raider.units(UnitType.AtomBomb).length > 0) g.executeNextTick();
    // ...and once it has landed, still knows whom to answer
    expect(nuke.findBestNukeTarget()).toBe(raider);
    expect(tryNukes(g, nuke, raider)).toBeGreaterThan(0);
    // A minute later it has let it go
    const start = g.ticks();
    while (g.ticks() < start + 600) g.executeNextTick();
    expect(attack.recentBomber()).toBeNull();
    expect(nuke.findBestNukeTarget()).toBeNull();
  }, 60_000);

  test("an attack, with a bomb", async () => {
    const { g, guard, raider, nuke } = await standoff("trader");
    raider.createAttack(guard, 20_000, null, new Set());
    expect(nuke.findBestNukeTarget()).toBe(raider);
    expect(tryNukes(g, nuke, raider)).toBeGreaterThan(0);
  });

  test("a rival hitting it, with a MIRV, as a Protector does; a Normal nation on Medium doesn't", async () => {
    const mirvs = async (option: string) => {
      const { g, guard, raider, mirv } = await standoff(option);
      raider.createAttack(guard, 20_000, null, new Set());
      // (Medium hesitates one time in four)
      for (let i = 0; i < 20 && mirvsAt(g, raider).length === 0; i++) {
        mirv.considerMIRV();
      }
      return mirvsAt(g, raider).length;
    };
    expect(await mirvs("normal")).toBe(0);
    expect(await mirvs("trader")).toBe(1);
    expect(await mirvs("protector")).toBe(1);
  });
});

describe("noting bombers", () => {
  test("every tick for a nation dealt a personality; never for a Normal nation", async () => {
    const notes = async (option: string) => {
      const { g, exec } = await standoff(option);
      const spy = vi.spyOn(AiAttackBehavior.prototype, "noteBombers");
      for (let i = 0; i < 20; i++) exec.tick(g.ticks() + i);
      const calls = spy.mock.calls.length;
      spy.mockRestore();
      return calls;
    };
    expect(await notes("normal")).toBe(0);
    expect(await notes("aggressive")).toBe(20);
  });
});

describe("Traders and Protectors keep a bomb in hand", () => {
  test("once they have a silo and three cities, their building leaves an atom bomb's price", async () => {
    // What a city costs it now, and whether it builds one with `spare`
    // gold over that
    const builds = async (
      option: string,
      spare: bigint,
      silo = true,
      cities = 3,
    ) => {
      const { g, guard, structure } = await standoff(option);
      if (!silo) {
        for (const s of guard.units(UnitType.MissileSilo)) s.delete(false);
      }
      for (let i = 0; i < cities; i++) {
        guard.buildUnit(UnitType.City, g.ref(20 + 20 * i, 40), {});
      }
      const b = structure as unknown as {
        getPerceivedCost(t: UnitType): bigint;
        maybeSpawnStructure(t: UnitType): boolean;
      };
      // (With little gold it saves up, so a city feels dearer than it is)
      guard.removeGold(guard.gold());
      guard.addGold(b.getPerceivedCost(UnitType.City) + spare);
      return b.maybeSpawnStructure(UnitType.City);
    };
    const bomb = 750_000n;
    expect(await builds("normal", 1n)).toBe(true);
    expect(await builds("mad_scientist", 1n)).toBe(true);
    for (const option of ["trader", "protector"]) {
      expect(await builds(option, bomb - 1n)).toBe(false);
      expect(await builds(option, bomb)).toBe(true);
      // Not before it has a silo, nor before its third city
      expect(await builds(option, 1n, false)).toBe(true);
      expect(await builds(option, 1n, true, 2)).toBe(true);
    }
  });
});

describe("Domes of Alden: Mad Scientists and Protectors raise more, sooner", () => {
  // Shields 40 tiles wide, so clusters 75 tiles apart need a Dome each
  class SmallDomes extends TestConfig {
    domeRange(): number {
      return 40;
    }
  }

  /**
   * big_plains: the nation holds rows 1-129, a human foe rows 170-198 with
   * a silo and the price of bombs (a foe that can nuke it, before any nuke
   * has come). The nation has $1B to start with.
   */
  async function domeGame(option: string, config = TestConfig) {
    const g = await setup(
      "big_plains",
      {
        derpyRules: 6,
        aiPersonalities: [option],
        difficulty: Difficulty.Medium,
        instantBuild: true,
      },
      [new PlayerInfo("foe", PlayerType.Human, null, "foe")],
      undefined,
      config,
      true,
      [
        new Nation(
          new Cell(100, 60),
          new PlayerInfo("me", PlayerType.Nation, null, "me"),
        ),
      ],
    );
    const me = g.player("me");
    const foe = g.player("foe");
    for (let x = 1; x < 199; x++) {
      for (let y = 1; y <= 129; y++) me.conquer(g.ref(x, y));
      for (let y = 170; y <= 198; y++) foe.conquer(g.ref(x, y));
    }
    me.addGold(1_000_000_000n);
    foe.addGold(1_000_000_000n);
    foe.buildUnit(UnitType.MissileSilo, g.ref(100, 185), {});
    executeTicks(g, 2);
    const behavior = new NationStructureBehavior(new PseudoRandom(7), g, me);
    const tryDome = () =>
      (
        behavior as unknown as { tryBuildSmartDome(): boolean }
      ).tryBuildSmartDome();
    return { g, me, behavior, tryDome };
  }

  /** Four cities in a diamond around (x, y): 20 points of buildings. */
  function cities(g: Game, me: Player, x: number, y: number) {
    for (const [dx, dy] of [
      [-15, 0],
      [15, 0],
      [0, -15],
      [0, 15],
    ]) {
      me.buildUnit(UnitType.City, g.ref(x + dx, y + dy), {});
    }
  }

  test("they build one at the bare price; Normal keeps a quarter more in hand", async () => {
    const domeAt = async (option: string, gold: bigint) => {
      const { g, me, tryDome } = await domeGame(option);
      me.buildUnit(UnitType.Capital, g.ref(40, 40), {});
      cities(g, me, 40, 40);
      me.removeGold(me.gold() - gold);
      return tryDome();
    };
    expect(dealtAiTypes((await domeGame("protector")).g).get("me")).toBe(
      "protector",
    );
    expect(await domeAt("normal", 52_000_000n)).toBe(false);
    expect(await domeAt("normal", 63_000_000n)).toBe(true);
    expect(await domeAt("protector", 52_000_000n)).toBe(true);
    expect(await domeAt("mad_scientist", 52_000_000n)).toBe(true);
    expect(await domeAt("trader", 52_000_000n)).toBe(false);
  });

  test("once armed, they save for a Dome their income will reach (r24), long before Normal starts saving", async () => {
    // A Capital and four cities, $15M in hand (under the 40% they'd save
    // from otherwise) and plenty of income
    const saves = async (option: string, armed: boolean) => {
      const { g, me, behavior, tryDome } = await domeGame(option);
      me.buildUnit(UnitType.Capital, g.ref(40, 40), {});
      cities(g, me, 40, 40);
      if (armed) {
        for (let i = 0; i < 3; i++) {
          me.buildUnit(UnitType.SAMLauncher, g.ref(80 + 10 * i, 80), {});
          me.buildUnit(UnitType.MissileSilo, g.ref(80 + 10 * i, 100), {});
        }
      }
      me.removeGold(me.gold() - 15_000_000n);
      expect(tryDome()).toBe(false);
      return behavior.savingForDome();
    };
    expect(await saves("normal", true)).toBeNull();
    expect(await saves("mad_scientist", true)).toBe(50_000_000n);
    expect(await saves("protector", true)).toBe(50_000_000n);
    // Not while it still wants SAMs and silos
    expect(await saves("mad_scientist", false)).toBeNull();
  });

  test("they find a smaller cluster worth shielding", async () => {
    // Four cities: worth a Dome to them, not yet to a Normal nation
    for (const [option, built] of [
      ["normal", false],
      ["aggressive", false],
      ["protector", true],
      ["mad_scientist", true],
    ] as const) {
      const { g, me, tryDome } = await domeGame(option);
      cities(g, me, 40, 40);
      expect(tryDome()).toBe(built);
    }
  });

  test("five before any nuke, half a minute apart (Normal: three, a minute apart)", async () => {
    const raised = async (option: string, ticks: number) => {
      const { g, me, behavior } = await domeGame(option, SmallDomes);
      // Six clusters of eight cities (40 points each), each worth a Dome
      for (const [x, y] of [
        [25, 25],
        [100, 25],
        [175, 25],
        [25, 105],
        [100, 105],
        [175, 105],
      ]) {
        cities(g, me, x, y);
        for (const [dx, dy] of [
          [-11, -11],
          [11, -11],
          [-11, 11],
          [11, 11],
        ]) {
          me.buildUnit(UnitType.City, g.ref(x + dx, y + dy), {});
        }
      }
      for (let t = 0; t < ticks; t += 30) {
        behavior.handleStructures();
        executeTicks(g, 30);
      }
      return me.units(UnitType.Dome).length;
    };
    expect(await raised("normal", 1200)).toBe(2);
    expect(await raised("protector", 1200)).toBe(4);
    expect(await raised("normal", 3000)).toBe(3);
    expect(await raised("protector", 3000)).toBe(5);
  }, 120_000);
});

describe("a Trader alone on an island", () => {
  // tests/testdata/maps/islands: a continent (x < 70), a sea, an island
  // (x 100-129, y 30-69) and two islets (x 145-154, y 5-16 and 83-94).
  const onIslet = (g: Game, t: number) => g.x(t) >= 145;
  const onContinent = (g: Game, t: number) => g.x(t) < 70;

  /**
   * The nation starts on the island; a weak human holds the whole
   * continent. Runs `ticks` and reports what the nation did.
   */
  async function islandGame(option: string, ticks: number) {
    const g = await setup(
      "islands",
      {
        derpyRules: 6,
        aiPersonalities: [option],
        difficulty: Difficulty.Medium,
      },
      [new PlayerInfo("mainland", PlayerType.Human, null, "mainland")],
      undefined,
      undefined,
      true,
      [
        new Nation(
          new Cell(115, 50),
          new PlayerInfo("isle", PlayerType.Nation, null, "isle"),
        ),
      ],
    );
    const isle = g.player("isle");
    const mainland = g.player("mainland");
    conquerRect(g, mainland, 0, 0, 70, 100);
    mainland.setSpawnTile(g.ref(35, 50));
    mainland.setTroops(1_000);
    conquerRect(g, isle, 114, 49, 117, 52);
    isle.setSpawnTile(g.ref(115, 50));
    const exec = new NationExecution("GAME0001", g.nations()[0]);
    g.addExecution(exec);
    let invaded = false;
    let filledAt: number | null = null;
    for (let i = 0; i < ticks; i++) {
      g.executeNextTick();
      mainland.setTroops(1_000);
      if (isle.outgoingAttacks().some((a) => a.target() === mainland)) {
        invaded = true;
      }
      for (const boat of isle.units(UnitType.TransportShip)) {
        const t = boat.targetTile();
        if (t !== undefined && onContinent(g, t)) invaded = true;
      }
      if (filledAt === null && isle.numTilesOwned() >= 1200) {
        filledAt = g.ticks();
      }
    }
    let islets = 0;
    let continent = 0;
    for (const t of isle.tiles()) {
      if (onIslet(g, t)) islets++;
      if (onContinent(g, t)) continent++;
    }
    const attack = (exec as unknown as { attackBehavior?: AiAttackBehavior })
      .attackBehavior;
    return {
      g,
      isle,
      invaded,
      islets,
      continent,
      filledAt,
      island: (attack as unknown as { island: boolean | null } | undefined)
        ?.island,
    };
  }

  test("fills the island, then takes the islets by sea, and never invades the continent", async () => {
    const trader = await islandGame("trader", 2500);
    expect(trader.island).toBe(true);
    expect(trader.filledAt).not.toBeNull();
    expect(trader.islets).toBeGreaterThan(100);
    expect(trader.continent).toBe(0);
    expect(trader.invaded).toBe(false);
  }, 120_000);

  test("a Normal nation in the same seat goes for the weak continent", async () => {
    const normal = await islandGame("normal", 2500);
    expect(normal.invaded).toBe(true);
  }, 120_000);

  test("a Trader that shares its land with another player isn't on an island", async () => {
    const g = await setup(
      "islands",
      {
        derpyRules: 6,
        aiPersonalities: ["trader"],
        difficulty: Difficulty.Medium,
      },
      [new PlayerInfo("mainland", PlayerType.Human, null, "mainland")],
      undefined,
      undefined,
      true,
      [
        new Nation(
          new Cell(60, 50),
          new PlayerInfo("coast", PlayerType.Nation, null, "coast"),
        ),
        new Nation(
          new Cell(115, 50),
          new PlayerInfo("isle", PlayerType.Nation, null, "isle"),
        ),
      ],
    );
    const mainland = g.player("mainland");
    conquerRect(g, mainland, 0, 0, 30, 100);
    conquerRect(g, g.player("coast"), 58, 48, 62, 52);
    g.player("coast").setSpawnTile(g.ref(60, 50));
    conquerRect(g, g.player("isle"), 114, 49, 117, 52);
    g.player("isle").setSpawnTile(g.ref(115, 50));
    const alone = (id: string) =>
      (
        nationAt(g, id).attack as unknown as { startsAlone(): boolean }
      ).startsAlone();
    expect(alone("coast")).toBe(false);
    expect(alone("isle")).toBe(true);
  });
});

describe("determinism and editions", () => {
  // The scripted World game of the snapshot tests (12 nations, 40 tribes,
  // three scripted humans), 1500 ticks: a hash every 100 ticks.
  async function play(overrides: Partial<GameConfig>) {
    const runner = await createScriptedRunner(
      "world",
      scriptedGameStart(overrides),
    );
    const game = runner.game;
    const hashes: number[] = [];
    while (game.ticks() < 1500) {
      stepScripted(runner);
      if (game.ticks() % 100 === 0) {
        hashes.push((game as unknown as { hash(): number }).hash());
      }
    }
    return {
      hashes: simpleHash(hashes.join(",")),
      lastHash: hashes[hashes.length - 1],
      dealt: [...dealtAiTypes(game).entries()],
    };
  }

  // Recorded on the commit before AIP (r23), with rules 5 the current
  // edition, and again on the merge with OpenFront's 2026-10-14 main (r24),
  // whose nation and attack changes play every game differently
  const EDITION5_PACKS = { hashes: 622165599, lastHash: 3680684990507938 };
  const EDITION5_PLAIN = { hashes: 227177588, lastHash: 8882424255780213 };

  test("edition 5 games, with AI personality packs or without, play exactly as before", async () => {
    const packs = await play({
      derpyRules: 5,
      aiPersonalities: ["ai_pirates", "ai_scientists"],
    });
    expect({ hashes: packs.hashes, lastHash: packs.lastHash }).toEqual(
      EDITION5_PACKS,
    );
    expect(packs.dealt).toEqual([]);
    const plain = await play({ derpyRules: 5 });
    expect({ hashes: plain.hashes, lastHash: plain.lastHash }).toEqual(
      EDITION5_PLAIN,
    );
  }, 300_000);

  test("rules 6 with only Normal ticked plays as edition 5 did", async () => {
    const normal = await play({ derpyRules: 6, aiPersonalities: ["normal"] });
    expect({ hashes: normal.hashes, lastHash: normal.lastHash }).toEqual(
      EDITION5_PLAIN,
    );
  }, 300_000);

  test("personalities: the same game deals and plays the same every time", async () => {
    const all = {
      derpyRules: 6,
      aiPersonalities: [
        "normal",
        "mad_scientist",
        "trader",
        "aggressive",
        "protector",
      ],
    };
    const a = await play(all);
    const b = await play(all);
    expect(a).toEqual(b);
    expect(a.dealt.length).toBeGreaterThanOrEqual(9);
    expect(new Set(a.dealt.map(([, t]) => t)).size).toBe(4);
    expect(a.hashes).not.toBe(EDITION5_PLAIN.hashes);
  }, 300_000);
});

describe("snapshots", () => {
  test("a nation's memories from before personalities read as nothing to remember", () => {
    const old = {
      v: 2,
      d: {
        botAttackTroopsSent: 0,
        followedLandings: [],
        triggerRatio: 0.55,
        reserveRatio: 0.35,
        expandRatio: 0.15,
      },
    };
    expect(readVersioned(AiAttackBehaviorSnapshot, old)).toEqual({
      ...old.d,
      island: null,
      grudge: null,
      grudgeUntil: 0,
      bomber: null,
      bomberUntil: 0,
    });
  });

  test("a personality nation's memories from round 23 read as no bomber to answer", () => {
    const r23 = {
      v: 3,
      d: {
        botAttackTroopsSent: 0,
        followedLandings: [],
        triggerRatio: 0.55,
        reserveRatio: 0.35,
        expandRatio: 0.15,
        island: true,
        grudge: null,
        grudgeUntil: 0,
      },
    };
    expect(readVersioned(AiAttackBehaviorSnapshot, r23)).toEqual({
      ...r23.d,
      bomber: null,
      bomberUntil: 0,
    });
  });

  test("a game of personalities round-trips and keeps playing the same", async () => {
    const SPOTS: [number, number][] = [
      [925, 186],
      [958, 220],
      [908, 264],
      [997, 205],
      [1004, 250],
      [1046, 193],
      [918, 342],
      [853, 373],
    ];
    const g = await setup(
      "world",
      {
        derpyRules: 6,
        aiPersonalities: [
          "normal",
          "mad_scientist",
          "trader",
          "aggressive",
          "protector",
        ],
        difficulty: Difficulty.Hard,
        instantBuild: true,
        startingGold: 30_000_000,
        goldMultiplier: 20,
      },
      [],
      undefined,
      undefined,
      false,
      SPOTS.map(
        ([x, y], i) =>
          new Nation(
            new Cell(x, y),
            new PlayerInfo(`nation${i}`, PlayerType.Nation, null, `n_${i}`),
          ),
      ),
    );
    for (const n of g.nations()) {
      g.addExecution(new NationExecution("snapshot_aip", n));
    }
    g.addExecution(
      new SpawnExecution(
        "snapshot_aip",
        new PlayerInfo("human", PlayerType.Human, "client_h", "human"),
        g.ref(1020, 180),
      ),
    );
    const run = (n: number) => {
      for (let i = 0; i < n; i++) g.executeNextTick();
    };
    run(15);
    g.endSpawnPhase();
    expect(new Set(dealtAiTypes(g).values()).size).toBe(4);
    for (const ticks of [200, 400, 400]) {
      run(ticks);
      await expectSnapshotRoundTrip(g, "world", 50);
    }
  }, 300_000);
});
