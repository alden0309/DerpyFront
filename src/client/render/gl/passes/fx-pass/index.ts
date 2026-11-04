/**
 * FxPass — orchestrates four independent GPU effect sub-passes:
 *   1. FxSpritePass    — animated sprite atlas (explosions, dust, conquest)
 *   2. FxShockwavePass — procedural rings for nuke/SAM events
 *   3. FxAttackRingPass — persistent rings at transport ship targets
 *   4. FxBurstPass     — FX (r28): the Derp Store packs' layered bursts
 *
 * Spawn events that produce both a sprite and a shockwave (nukes, SAM
 * interceptions) are coordinated here so each sub-pass stays self-contained.
 */

import type { Config } from "@openfront/engine-lib/configuration/Config";
import type { BurstKind } from "@openfront/shared/DerpyFx";
import type {
  AttackRingInput,
  ConquestFx,
  DeadUnitFx,
  RendererConfig,
} from "../../../types";
import type { RenderSettings } from "../../RenderSettings";
import { UNIT_TYPE_TO_NUKE_TYPE } from "../../utils/ExplosionParams";
import { FxAttackRingPass } from "./FxAttackRingPass";
import { FxBurstPass } from "./FxBurstPass";
import { nukeExplosionRadius } from "./FxSettings";
import {
  calculateExplosionDurationMs,
  FxShockwavePass,
} from "./FxShockwavePass";
import { FxSpritePass } from "./FxSpritePass";

export type { AttackRingInput } from "../../../types";
export { calculateExplosionDurationMs };

export class FxPass {
  private spritePass: FxSpritePass;
  private shockwavePass: FxShockwavePass;
  private attackRingPass: FxAttackRingPass;
  private burstPass: FxBurstPass;
  private mapW: number;
  private settings: RenderSettings;
  private timeFn: () => number = () => performance.now();

  constructor(
    gl: WebGL2RenderingContext,
    header: RendererConfig,
    settings: RenderSettings,
    private config: Config,
  ) {
    this.mapW = header.mapWidth;
    this.settings = settings;
    this.spritePass = new FxSpritePass(gl, header, settings, config);
    this.shockwavePass = new FxShockwavePass(gl, settings);
    this.attackRingPass = new FxAttackRingPass(gl, settings);
    this.burstPass = new FxBurstPass(gl, settings);
  }

  // -------------------------------------------------------------------------
  // Spawning — coordinated across sub-passes
  // -------------------------------------------------------------------------

  applyDeadUnits(deadUnits: DeadUnitFx[]): void {
    const now = this.timeFn();
    for (const unit of deadUnits) {
      const startMs = now - (unit.tickAge ?? 0) * this.config.msPerTick();
      this.spawnUnit(unit, startMs);
    }
  }

  private spawnUnit(unit: DeadUnitFx, now: number): void {
    const typeName = unit.unitType;
    const x = unit.pos % this.mapW;
    const y = (unit.pos - x) / this.mapW;

    const nukeRadius = nukeExplosionRadius(this.settings.fx, typeName);
    const look = unit.explosion?.look;
    if (nukeRadius !== undefined && look !== undefined && look > 0) {
      // FX (r28): a Derp Store pack's layered burst — flash, fireball, ring,
      // debris and residue — over the usual ground debris. A Dome's burst
      // over a nuke it stopped replaces the interception puff.
      const kind: BurstKind | undefined = unit.reachedTarget
        ? UNIT_TYPE_TO_NUKE_TYPE[typeName]
        : "domeStop";
      if (kind !== undefined) {
        if (unit.reachedTarget) this.spritePass.spawnFxForUnit(unit, now, true);
        this.burstPass.spawn(x, y, look, kind, now);
        return;
      }
    }
    if (nukeRadius !== undefined) {
      if (unit.reachedTarget) {
        this.spritePass.spawnFxForUnit(unit, now);
        this.shockwavePass.pushNukeShockwave(x, y, nukeRadius, unit.explosion);
      } else {
        // SAM interception: sprite pass handles the SAM explosion sprite
        this.spritePass.spawnFxForUnit(unit, now);
        this.shockwavePass.pushSAMShockwave(x, y);
        // DFSTORE (r21): stopped by a Dome whose owner wears a Derp Store
        // style: its burst plays too (WebGLFrameBuilder.resolveDomeBursts).
        if (unit.explosion) {
          this.shockwavePass.pushNukeShockwave(
            x,
            y,
            nukeRadius,
            unit.explosion,
          );
        }
      }
      return;
    }

    // All other units: sprite-only effects
    this.spritePass.spawnFxForUnit(unit, now);
  }

  applyRailroadDust(tileRefs: number[]): void {
    this.spritePass.applyRailroadDust(tileRefs);
  }

  applyConquestEvents(events: ConquestFx[]): void {
    this.spritePass.applyConquestEvents(events);
  }

  updateAttackRings(rings: AttackRingInput[]): void {
    this.attackRingPass.update(rings);
  }

  // -------------------------------------------------------------------------
  // Per-frame
  // -------------------------------------------------------------------------

  tick(): void {
    this.spritePass.tick();
    this.shockwavePass.tick();
    this.attackRingPass.tick();
  }

  draw(cameraMatrix: Float32Array, zoom: number): void {
    this.spritePass.draw(cameraMatrix);
    this.shockwavePass.draw(cameraMatrix);
    this.burstPass.draw(cameraMatrix, zoom);
    this.attackRingPass.draw(cameraMatrix, zoom);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  setTimeFn(fn: () => number): void {
    this.timeFn = fn;
    this.spritePass.setTimeFn(fn);
    this.shockwavePass.setTimeFn(fn);
    this.burstPass.setTimeFn(fn);
  }

  clear(): void {
    this.spritePass.clear();
    this.shockwavePass.clear();
    this.attackRingPass.clear();
    this.burstPass.clear();
  }

  dispose(): void {
    this.spritePass.dispose();
    this.shockwavePass.dispose();
    this.attackRingPass.dispose();
    this.burstPass.dispose();
  }
}
