/**
 * FxStage — the small standalone renderer behind the store's live preview of
 * a Nuke & Dome effect pack.
 *
 * It runs the game's own passes (terrain, trails and spiral ribbons, the
 * missiles, the explosion FX and the Dome shields) over a tiny procedural
 * map, fed tick by tick from a PreviewScene exactly as GameView and
 * WebGLFrameBuilder feed them in a match: TrailManager stamps the trails,
 * SpiralTrails grows the ribbons, and the pack's attributes resolve through
 * the same functions the game uses. So what the store shows is what the
 * game draws.
 *
 * Time is the stage's own (a scene clock in seconds, handed to every pass),
 * so a still frame can be rendered for any moment, and a capture can step it
 * frame by frame.
 */

import type { Config } from "@openfront/engine-lib/configuration/Config";
import { type DerpyFxTheme, domeStyleIndex } from "@openfront/shared/DerpyFx";
import { SpiralTrails } from "../frame/SpiralTrails";
import { TrailManager } from "../frame/TrailManager";
import { Camera } from "../gl/Camera";
import { DomeShieldPass } from "../gl/passes/DomeShieldPass";
import { FxPass } from "../gl/passes/fx-pass";
import { SpiralRibbonPass } from "../gl/passes/SpiralRibbonPass";
import { TerrainPass } from "../gl/passes/TerrainPass";
import { TrailPass } from "../gl/passes/TrailPass";
import { UnitPass } from "../gl/passes/UnitPass";
import { applyGraphicsOverrides } from "../gl/RenderOverrides";
import {
  createRenderSettings,
  type RenderSettings,
} from "../gl/RenderSettings";
import {
  EFFECT_PALETTE_BLOCKS,
  getPaletteSize,
  MAX_TRAIL_COLORS,
} from "../gl/utils/ColorUtils";
import { renderDpr } from "../gl/utils/Dpr";
import {
  EFFECT_ENTRY_FLOATS,
  packEffectEntry,
  parseEffectColors,
} from "../gl/utils/EffectPalette";
import {
  derpyDomeBurstParams,
  derpyExplosionParams,
  UNIT_TYPE_TO_NUKE_TYPE,
} from "../gl/utils/ExplosionParams";
import { createTexture2D } from "../gl/utils/GlUtils";
import type { DeadUnitFx, RendererConfig, UnitState } from "../types/Renderer";
import {
  UT_ATOM_BOMB,
  UT_HYDROGEN_BOMB,
  UT_MIRV,
  UT_MIRV_WARHEAD,
} from "../types/UnitType";
import {
  type PreviewScript,
  SCENE_TICK_MS,
  sceneDomes,
  sceneTick,
} from "./PreviewScene";
import { STAGE_ENEMY, STAGE_YOU, stageMap } from "./StageMap";
import { StageTerritoryPass } from "./StageTerritoryPass";

type RGB = readonly [number, number, number];

/** Territory colours: you in blue, the enemy in brick red (as a match might). */
const OWNER_COLORS: ReadonlyMap<number, RGB> = new Map([
  [STAGE_YOU, [0.27, 0.52, 0.94] as RGB],
  [STAGE_ENEMY, [0.86, 0.36, 0.3] as RGB],
]);

const NUKE_TYPES = [UT_ATOM_BOMB, UT_HYDROGEN_BOMB, UT_MIRV, UT_MIRV_WARHEAD];

/** The nuke-trail effect block in the effect palette (trail.frag.glsl). */
const NUKE_TRAIL_BLOCK = 1;

export interface FxStageOptions {
  /** Graphics overrides to honour (the light fallback, cosmetics toggles). */
  lite?: boolean;
}

export class FxStage {
  readonly settings: RenderSettings;
  private readonly camera: Camera;
  private readonly map = stageMap();

  private readonly paletteTex: WebGLTexture;
  private readonly paletteData: Float32Array;
  private readonly effectTex: WebGLTexture;
  private readonly effectData: Float32Array;
  private readonly trailTex: WebGLTexture;

  private readonly terrain: TerrainPass;
  private readonly territory: StageTerritoryPass;
  private readonly domes: DomeShieldPass;
  private readonly trails: TrailPass;
  private readonly ribbons: SpiralRibbonPass;
  private readonly units: UnitPass;
  private readonly fx: FxPass;

  private readonly trailManager: TrailManager;
  private readonly spiralTrails: SpiralTrails;

  private theme: DerpyFxTheme | null = null;
  private script: PreviewScript;

  /** Scene clock (ms) handed to every pass; only ever moves forward. */
  private clockMs = 0;
  /** Clock time of the current pass through the loop's start. */
  private epochMs = 0;
  /** Last simulated tick of the current pass (-1 = none yet). */
  private tick = -1;
  private sceneSec = 0;

  private readonly unitMap = new Map<number, UnitState>();
  private readonly trackedIds: number[] = [];
  private readonly domeMap = new Map<number, UnitState>();

  constructor(
    private readonly gl: WebGL2RenderingContext,
    script: PreviewScript,
    opts: FxStageOptions = {},
  ) {
    this.script = script;
    this.settings = createRenderSettings();
    applyGraphicsOverrides(
      this.settings,
      opts.lite ? { passEnabled: { fallout: false } } : {},
    );
    const map = this.map;
    this.camera = new Camera(map.w, map.h);
    const clock = () => this.clockMs;

    const palW = getPaletteSize();
    this.paletteData = new Float32Array(palW * 2 * 4);
    for (const [id, c] of OWNER_COLORS) {
      this.paletteData.set([c[0], c[1], c[2], 150 / 255], id * 4);
      this.paletteData.set(
        [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 1],
        (palW + id) * 4,
      );
    }
    this.paletteTex = createTexture2D(gl, {
      width: palW,
      height: 2,
      internalFormat: gl.RGBA32F,
      format: gl.RGBA,
      type: gl.FLOAT,
      data: this.paletteData,
    });
    this.effectData = new Float32Array(
      palW * MAX_TRAIL_COLORS * EFFECT_PALETTE_BLOCKS * 4,
    );
    this.effectTex = createTexture2D(gl, {
      width: palW,
      height: MAX_TRAIL_COLORS * EFFECT_PALETTE_BLOCKS,
      internalFormat: gl.RGBA32F,
      format: gl.RGBA,
      type: gl.FLOAT,
      data: this.effectData,
    });
    this.trailTex = createTexture2D(gl, {
      width: map.w,
      height: map.h,
      internalFormat: gl.R16UI,
      format: gl.RED_INTEGER,
      type: gl.UNSIGNED_SHORT,
      data: null,
    });

    this.terrain = new TerrainPass(
      gl,
      () => map.terrain,
      map.terrain,
      map.w,
      map.h,
    );
    this.territory = new StageTerritoryPass(gl, map, OWNER_COLORS);

    this.domes = new DomeShieldPass(gl, map.w, this.settings, script.domeRange);
    this.domes.setTimeFn(clock);
    this.domes.setLocalPlayer(STAGE_YOU);
    this.domes.setPaletteData(this.paletteData);

    this.trailManager = new TrailManager(map.w, map.h);
    this.spiralTrails = new SpiralTrails(map.w);
    this.trails = new TrailPass(
      gl,
      map.w,
      map.h,
      this.trailTex,
      this.paletteTex,
      this.effectTex,
      this.settings,
    );
    this.trails.setTimeFn(clock);
    this.trails.setLiveRef(this.trailManager.getTrailState());
    this.ribbons = new SpiralRibbonPass(gl, this.settings);
    this.ribbons.setTimeFn(clock);

    const header = {
      mapWidth: map.w,
      mapHeight: map.h,
      unitTypes: NUKE_TYPES,
      players: [],
    } as unknown as RendererConfig;
    const config = { msPerTick: () => SCENE_TICK_MS } as Config;
    this.units = new UnitPass(
      gl,
      header,
      this.paletteTex,
      this.effectTex,
      this.settings,
      config,
    );
    this.units.setTimeFn(clock);
    this.units.setLocalPlayer(STAGE_YOU);
    this.fx = new FxPass(gl, header, this.settings, config);
    this.fx.setTimeFn(clock);

    for (const d of sceneDomes(script, map.w)) this.domeMap.set(d.id, d);
    this.domes.updateStructures(this.domeMap);
  }

  /** The pack the stage shows (null: the game's usual look). */
  setTheme(theme: DerpyFxTheme | null): void {
    this.theme = theme;
    const palW = getPaletteSize();
    const rowBase = NUKE_TRAIL_BLOCK * MAX_TRAIL_COLORS;
    const entry = new Float32Array(EFFECT_ENTRY_FLOATS);
    if (theme) packEffectEntry(theme.trail, entry);
    for (let r = 0; r < MAX_TRAIL_COLORS; r++) {
      const off = ((rowBase + r) * palW + STAGE_YOU) * 4;
      this.effectData.set(entry.subarray(r * 4, r * 4 + 4), off);
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.effectTex);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      palW,
      MAX_TRAIL_COLORS * EFFECT_PALETTE_BLOCKS,
      gl.RGBA,
      gl.FLOAT,
      this.effectData,
    );

    const colors =
      theme?.trail.type === "spiral"
        ? parseEffectColors(theme.trail.colors)
        : [];
    if (theme?.trail.type === "spiral" && colors.length > 0) {
      this.spiralTrails.setParams(STAGE_YOU, {
        radius: theme.trail.radius,
        strands: theme.trail.strands,
        rotationSpeed: theme.trail.rotationSpeed,
        colors,
      });
    } else {
      this.spiralTrails.clearParams(STAGE_YOU);
    }
    this.domes.setPlayerStyle(STAGE_YOU, domeStyleIndex(theme?.name));
    this.restart();
  }

  /** Start the scene over (the clock keeps running forward). */
  restart(): void {
    this.epochMs = this.clockMs + 1000;
    this.clockMs = this.epochMs;
    this.tick = -1;
    this.sceneSec = 0;
    this.trailManager.reset();
    this.spiralTrails.reset();
    this.unitMap.clear();
    this.fx.clear();
    this.trails.setLiveRef(this.trailManager.getTrailState());
    this.ribbons.updateRibbons([]);
    this.units.updateUnits(this.unitMap, -1);
  }

  /**
   * Bring the scene to `sec` seconds into its loop, simulating each tick on
   * the way like a match would. Going back starts the loop over.
   */
  seek(sec: number): void {
    if (sec < this.sceneSec) this.restart();
    const target = Math.floor((sec * 1000) / SCENE_TICK_MS);
    while (this.tick < target) {
      this.tick++;
      this.clockMs = this.epochMs + this.tick * SCENE_TICK_MS;
      this.simulate(this.tick);
    }
    this.sceneSec = sec;
    this.clockMs = this.epochMs + sec * 1000;
  }

  private simulate(tick: number): void {
    const map = this.map;
    const { units, deaths } = sceneTick(this.script, tick, map.w);
    this.unitMap.clear();
    this.trackedIds.length = 0;
    for (const u of units) {
      this.unitMap.set(u.id, u);
      this.trackedIds.push(u.id);
    }
    this.trailManager.update(this.unitMap, this.trackedIds);
    this.trails.applyLiveDelta(
      this.trailManager.getTrailState(),
      this.trailManager.dirtyRowMin,
      this.trailManager.dirtyRowMax,
    );
    this.trailManager.clearDirtyRows();
    this.spiralTrails.update(this.unitMap, this.trackedIds);
    this.ribbons.updateRibbons(this.spiralTrails.getRibbons());
    this.units.setFrameTick(tick);
    this.units.updateUnits(this.unitMap, tick);

    if (deaths.length === 0) return;
    const dead: DeadUnitFx[] = deaths.map((d) => ({
      unitType: d.unitType,
      pos: d.y * map.w + d.x,
      reachedTarget: d.reachedTarget,
      ownerSmallID: d.owner,
      explosion: this.explosionFor(d.unitType, d.owner, d.reachedTarget),
      tickAge: 0,
    }));
    this.fx.applyDeadUnits(dead);
  }

  /** The burst a death shows, resolved as WebGLFrameBuilder resolves it. */
  private explosionFor(
    unitType: string,
    owner: number,
    reachedTarget: boolean,
  ): DeadUnitFx["explosion"] {
    const theme = this.theme;
    if (theme === null) return undefined;
    const nukeType = UNIT_TYPE_TO_NUKE_TYPE[unitType];
    if (nukeType === undefined) return undefined;
    if (reachedTarget) {
      return owner === STAGE_YOU
        ? derpyExplosionParams(theme, nukeType)
        : undefined;
    }
    // Stopped short: by your Dome, when it isn't your own nuke.
    return owner !== STAGE_YOU ? derpyDomeBurstParams(theme) : undefined;
  }

  /** Draw the current moment into the canvas, laid out `cssW`×`cssH`. */
  render(cssW: number, cssH: number): void {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    const dpr = renderDpr();
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    this.camera.resize(cssW, cssH);
    const v = this.script.view;
    // Camera zoom is device pixels per tile.
    this.camera.setCameraState(v.x, v.y, w / v.across);
    const cam = this.camera.getMatrix();
    const zoom = this.camera.zoom;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.08, 0.12, 0.18, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    this.terrain.draw(cam);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.territory.draw(cam);
    this.domes.draw(cam, zoom);
    if (this.settings.passEnabled.trail) this.trails.draw(cam);
    this.ribbons.draw(cam);
    this.units.drawGround(cam);
    this.units.drawMissiles(cam);
    if (this.settings.passEnabled.fx) {
      this.fx.tick();
      this.fx.draw(cam, zoom);
    }
    gl.disable(gl.BLEND);
  }

  dispose(): void {
    const gl = this.gl;
    this.terrain.dispose();
    this.territory.dispose();
    this.domes.dispose();
    this.trails.dispose();
    this.ribbons.dispose();
    this.units.dispose();
    this.fx.dispose();
    gl.deleteTexture(this.paletteTex);
    gl.deleteTexture(this.effectTex);
    gl.deleteTexture(this.trailTex);
  }
}
