// @vitest-environment jsdom
// FX (r28): the renderer side of the Derp Store packs — which trails grow
// ribbons, the burst params a pack's nuke carries, the low-graphics
// fallback, Dome stops, and the store preview's scene.
import { UnitType } from "@openfront/engine-api/game/GameTypes";
import {
  DERPY_FX_THEMES,
  domeStyleIndex,
  fxThemeIndex,
} from "@openfront/shared/DerpyFx";
import { describe, expect, it } from "vitest";
import { WebGLFrameBuilder } from "../src/client/WebGLFrameBuilder";
import { SpiralTrails } from "../src/client/render/frame/SpiralTrails";
import {
  STORE_SCENE,
  sceneDomes,
  sceneTick,
} from "../src/client/render/fxpreview/PreviewScene";
import {
  STAGE_ENEMY,
  STAGE_H,
  STAGE_W,
  STAGE_YOU,
  stageMap,
} from "../src/client/render/fxpreview/StageMap";
import { territoryTexels } from "../src/client/render/fxpreview/StageTerritoryPass";
import { applyGraphicsOverrides } from "../src/client/render/gl/RenderOverrides";
import { createRenderSettings } from "../src/client/render/gl/RenderSettings";
import { nukeTrailRibbon } from "../src/client/render/gl/utils/EffectPalette";
import {
  attributesToExplosionParams,
  derpyDomeBurstParams,
  derpyExplosionParams,
} from "../src/client/render/gl/utils/ExplosionParams";
import type { DeadUnitFx, UnitState } from "../src/client/render/types";
import {
  UT_ATOM_BOMB,
  UT_DOME,
  UT_HYDROGEN_BOMB,
} from "../src/client/render/types/UnitType";

const theme = (name: string) => DERPY_FX_THEMES.find((t) => t.name === name)!;

describe("nukeTrailRibbon", () => {
  it("grows a helix for a spiral trail", () => {
    const r = nukeTrailRibbon(theme("fx_cosmic").trail)!;
    expect(r.helix).toBe(true);
    expect(r.style).toBe(2);
    expect(r.strands).toBe(3);
    expect(r.colors).toHaveLength(3);
  });

  it("grows a helix-less ribbon for gradient and transition trails", () => {
    const g = nukeTrailRibbon(theme("fx_solar").trail)!;
    expect(g).toMatchObject({ helix: false, style: 0, scalar0: 3, scalar1: 6 });
    const t = nukeTrailRibbon(theme("fx_toxic").trail)!;
    expect(t).toMatchObject({ helix: false, style: 1, scalar0: 3 });
  });

  it("grows nothing without a usable effect", () => {
    expect(nukeTrailRibbon(undefined)).toBeNull();
    expect(
      nukeTrailRibbon({
        type: "gradient",
        colors: ["not a colour"],
        colorSize: 2,
        movementSpeed: 1,
      }),
    ).toBeNull();
  });

  it("is recorded by SpiralTrails like a spiral", () => {
    const st = new SpiralTrails(64);
    st.setParams(1, nukeTrailRibbon(theme("fx_solar").trail)!);
    const unit = { ...baseUnit(7, 1, UT_ATOM_BOMB), pos: 10, lastPos: 10 };
    const units = new Map([[7, unit]]);
    st.update(units, [7]);
    unit.lastPos = 20;
    unit.pos = 24;
    st.update(units, [7]);
    const [ribbon] = st.getRibbons();
    expect(ribbon.helix).toBe(false);
    expect(ribbon.style).toBe(0);
    expect(ribbon.sampleCount).toBeGreaterThan(2);
  });
});

describe("a pack's burst params", () => {
  it("carry the pack, on top of its catalog attributes", () => {
    for (const t of DERPY_FX_THEMES) {
      const p = derpyExplosionParams(t, "atom");
      expect(p.look).toBe(fxThemeIndex(t));
      expect(p.colors.length).toBeGreaterThan(0);
      expect(derpyDomeBurstParams(t).look).toBe(fxThemeIndex(t));
    }
  });

  it("leave other cosmetics on the flat styles", () => {
    const p = attributesToExplosionParams({
      type: "shockwave",
      nukeType: "atom",
      colors: ["#ff0000"],
      size: 100,
      speed: 50,
      thickness: 4,
      transitionSpeed: 0,
    });
    expect(p.look).toBeUndefined();
  });
});

describe("the low-graphics fallback", () => {
  it("is full detail by default", () => {
    const s = createRenderSettings();
    applyGraphicsOverrides(s, {});
    expect(s.fx.burstDetail).toBe("full");
  });

  it("goes light when fallout effects are turned off, and back", () => {
    const s = createRenderSettings();
    applyGraphicsOverrides(s, { passEnabled: { fallout: false } });
    expect(s.fx.burstDetail).toBe("light");
    applyGraphicsOverrides(s, { passEnabled: { fallout: true } });
    expect(s.fx.burstDetail).toBe("full");
  });
});

describe("Dome stops", () => {
  function frameBuilder(derpyDome: string | undefined) {
    const deadUnits: DeadUnitFx[] = [
      // Stopped inside the Dome (another player's nuke).
      {
        unitType: UT_ATOM_BOMB,
        pos: 10 * 100 + 12,
        reachedTarget: false,
        ownerSmallID: 2,
      },
      // Stopped far from any Dome (a SAM got it).
      {
        unitType: UT_ATOM_BOMB,
        pos: 90 * 100 + 90,
        reachedTarget: false,
        ownerSmallID: 2,
      },
    ];
    const keeper = { isPlayer: () => true, cosmetics: { derpyDome } };
    const dome = {
      isActive: () => true,
      isUnderConstruction: () => false,
      tile: () => 10 * 100 + 10,
      owner: () => ({ smallID: () => 1 }),
    };
    const gameView = {
      frameData: () => ({ events: { deadUnits } }),
      config: () => ({ domeRange: () => 20 }),
      units: (t: UnitType) => (t === UnitType.Dome ? [dome] : []),
      x: (ref: number) => ref % 100,
      y: (ref: number) => Math.floor(ref / 100),
      playerBySmallID: () => keeper,
    };
    const builder = new WebGLFrameBuilder({} as never) as unknown as {
      resolveDomeBursts(g: unknown, d: DeadUnitFx[]): void;
    };
    builder.resolveDomeBursts(gameView, deadUnits);
    return deadUnits;
  }

  it("ripple the shield, and play the keeper's pack burst", () => {
    const [stopped, elsewhere] = frameBuilder("fx_frost");
    expect(stopped.domeStop).toBe(true);
    expect(stopped.explosion?.look).toBe(domeStyleIndex("fx_frost"));
    expect(elsewhere.domeStop).toBeUndefined();
    expect(elsewhere.explosion).toBeUndefined();
  });

  it("ripple a plain shield too, with no pack burst", () => {
    const [stopped] = frameBuilder(undefined);
    expect(stopped.domeStop).toBe(true);
    expect(stopped.explosion).toBeUndefined();
  });
});

describe("the store preview's stage", () => {
  it("is the same map every time, with both players and the sea", () => {
    const map = stageMap();
    expect(map.terrain).toHaveLength(STAGE_W * STAGE_H);
    const owners = new Set(map.owner);
    expect(owners).toEqual(new Set([0, STAGE_YOU, STAGE_ENEMY]));
    const land = map.terrain.filter((b) => b & 0x80).length;
    expect(land / map.terrain.length).toBeGreaterThan(0.35);
    expect(land / map.terrain.length).toBeLessThan(0.85);
    // Water is nobody's; land is someone's.
    for (let i = 0; i < map.terrain.length; i += 97) {
      expect(map.owner[i] === 0).toBe((map.terrain[i] & 0x80) === 0);
    }
  });

  it("puts each scene point on its owner's land", () => {
    const map = stageMap();
    const at = (x: number, y: number) =>
      Math.floor(y) * STAGE_W + Math.floor(x);
    for (const n of STORE_SCENE.nukes) {
      expect(map.owner[at(n.from.x, n.from.y)], `nuke ${n.id} silo`).toBe(
        n.owner,
      );
    }
    for (const d of STORE_SCENE.domes) {
      expect(map.owner[at(d.x, d.y)]).toBe(d.owner);
    }
  });

  it("draws a border round each territory", () => {
    const map = stageMap();
    const texels = territoryTexels(
      map,
      new Map([
        [STAGE_YOU, [0, 0, 1] as const],
        [STAGE_ENEMY, [1, 0, 0] as const],
      ]),
    );
    const alphas = new Set<number>();
    for (let i = 3; i < texels.length; i += 4) alphas.add(texels[i]);
    expect(alphas).toEqual(new Set([0, 150, 255]));
  });

  it("flies each nuke, then ends it once, as the game reports", () => {
    const deaths: { tick: number; reached: boolean; owner: number }[] = [];
    let maxInFlight = 0;
    const ticks = (STORE_SCENE.loopSec * 1000) / 100;
    for (let k = 0; k <= ticks; k++) {
      const s = sceneTick(STORE_SCENE, k, STAGE_W);
      maxInFlight = Math.max(maxInFlight, s.units.length);
      for (const d of s.deaths) {
        deaths.push({ tick: k, reached: d.reachedTarget, owner: d.owner });
      }
    }
    expect(maxInFlight).toBeGreaterThanOrEqual(1);
    expect(deaths).toEqual([
      { tick: 26, reached: true, owner: STAGE_YOU },
      { tick: 52, reached: false, owner: STAGE_ENEMY },
    ]);
    // Ticks are pure: the same tick gives the same units.
    expect(sceneTick(STORE_SCENE, 12, STAGE_W)).toEqual(
      sceneTick(STORE_SCENE, 12, STAGE_W),
    );
    expect(sceneDomes(STORE_SCENE, STAGE_W)[0].unitType).toBe(UT_DOME);
  });

  it("stops the enemy nuke inside your Dome", () => {
    const stopped = STORE_SCENE.nukes.find((n) => n.stopped)!;
    const dome = STORE_SCENE.domes[0];
    expect(dome.owner).toBe(STAGE_YOU);
    expect(stopped.owner).not.toBe(dome.owner);
    expect(
      Math.hypot(stopped.to.x - dome.x, stopped.to.y - dome.y),
    ).toBeLessThan(STORE_SCENE.domeRange);
    // The bursting nuke is a bomb with a burst.
    expect([UT_ATOM_BOMB, UT_HYDROGEN_BOMB]).toContain(
      STORE_SCENE.nukes[0].unitType,
    );
  });
});

function baseUnit(id: number, ownerID: number, unitType: string): UnitState {
  return {
    id,
    unitType,
    ownerID,
    lastOwnerID: null,
    pos: 0,
    lastPos: 0,
    isActive: true,
    reachedTarget: false,
    retreating: false,
    targetable: true,
    waitTicks: 0,
    markedForDeletion: false,
    health: null,
    underConstruction: false,
    targetUnitId: null,
    targetTile: null,
    troops: 0,
    missileTimerQueue: [],
    level: 1,
    veterancy: 0,
    hasTrainStation: false,
    trainType: null,
    loaded: null,
    constructionStartTick: null,
    samUpgradeStartTick: null,
    samUpgradeStartRange: null,
    samUpgradeTargetLevel: null,
    samUpgradeDuration: null,
  };
}
