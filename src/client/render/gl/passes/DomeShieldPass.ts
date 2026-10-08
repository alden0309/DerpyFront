/**
 * DomeShieldPass (Derpy Front) — draws the shield of every Dome of Alden,
 * for everyone, all the time, so attackers can see where nukes won't land.
 *
 * Each finished Dome is a soft translucent dome (faint in the middle, brighter
 * toward the rim) with a thin ring on its edge; a Dome still being built shows
 * only a faint dashed ring. Colors follow SAMRadiusPass: self / ally / enemy.
 * While the viewer aims a nuke, every shield but their own turns a stronger,
 * pulsing red: those are the places the strike will be stopped.
 *
 * Overlapping shields of the same kind merge into one shape: the CPU lists
 * each circle's nearby same-group circles (frame/derive/DomeShields.ts) and
 * the shader draws their union, each pixel once. One instanced draw call.
 */

import {
  buildDomeShieldCircles,
  DOME_MAX_NEIGHBORS,
  type DomeShieldCircle,
  type DomeShieldKind,
} from "../../frame/derive/DomeShields";
import type { UnitState } from "../../types";
import { DynamicInstanceBuffer } from "../DynamicBuffer";
import type { RenderSettings } from "../RenderSettings";
import { createProgram } from "../utils/GlUtils";

import fragSrc from "../shaders/dome-shield/dome-shield.frag.glsl?raw";
import vertSrc from "../shaders/dome-shield/dome-shield.vert.glsl?raw";

// Per instance: circle (3), color (4), params (4), neighbours (3 each).
const FLOATS_PER_INSTANCE = 3 + 4 + 4 + 3 * DOME_MAX_NEIGHBORS;

/**
 * The most the ring and its soft edge may reach past a circle, in world
 * units. Also the slack used when finding neighbours, so it caps the ring's
 * on-screen width when zoomed far out.
 */
const MAX_PAD = 12;

export class DomeShieldPass {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private quadBuf: WebGLBuffer;
  private instanceBuf: DynamicInstanceBuffer;
  private settings: RenderSettings;
  private mapW: number;
  private range: number;
  private instanceCount = 0;
  private hasBlocked = false;
  private readonly startTime = performance.now();

  private localPlayerID = 0;
  private allies: ReadonlySet<number> = new Set();
  private nukeAiming = false;
  private paletteData: Float32Array | null = null;
  private lastStructures: Map<number, UnitState> | null = null;

  private uCamera: WebGLUniformLocation;
  private uPad: WebGLUniformLocation;
  private uRingHalf: WebGLUniformLocation;
  private uAA: WebGLUniformLocation;
  private uFillAlpha: WebGLUniformLocation;
  private uRimAlpha: WebGLUniformLocation;
  private uRimWidth: WebGLUniformLocation;
  private uRingAlpha: WebGLUniformLocation;
  private uBuildingAlpha: WebGLUniformLocation;
  private uDashLen: WebGLUniformLocation;
  private uGapLen: WebGLUniformLocation;
  private uBlockedFill: WebGLUniformLocation;
  private uBlockedRing: WebGLUniformLocation;
  private uBlockedPulse: WebGLUniformLocation;
  private uTime: WebGLUniformLocation;

  /**
   * @param range config().domeRange(), in tiles.
   */
  constructor(
    gl: WebGL2RenderingContext,
    mapW: number,
    settings: RenderSettings,
    range: number,
  ) {
    this.gl = gl;
    this.mapW = mapW;
    this.settings = settings;
    this.range = range;
    this.program = createProgram(gl, vertSrc, fragSrc, "DomeShieldPass");

    const u = (name: string) => gl.getUniformLocation(this.program, name)!;
    this.uCamera = u("uCamera");
    this.uPad = u("uPad");
    this.uRingHalf = u("uRingHalf");
    this.uAA = u("uAA");
    this.uFillAlpha = u("uFillAlpha");
    this.uRimAlpha = u("uRimAlpha");
    this.uRimWidth = u("uRimWidth");
    this.uRingAlpha = u("uRingAlpha");
    this.uBuildingAlpha = u("uBuildingAlpha");
    this.uDashLen = u("uDashLen");
    this.uGapLen = u("uGapLen");
    this.uBlockedFill = u("uBlockedFill");
    this.uBlockedRing = u("uBlockedRing");
    this.uBlockedPulse = u("uBlockedPulse");
    this.uTime = u("uTime");

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    // Attribute 0: unit quad [0,1]
    this.quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const glBuf = gl.createBuffer()!;
    this.instanceBuf = new DynamicInstanceBuffer(
      gl,
      glBuf,
      16,
      FLOATS_PER_INSTANCE,
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, glBuf);
    const stride = FLOATS_PER_INSTANCE * 4;
    const attrib = (loc: number, size: number, offsetFloats: number) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(
        loc,
        size,
        gl.FLOAT,
        false,
        stride,
        offsetFloats * 4,
      );
      gl.vertexAttribDivisor(loc, 1);
    };
    attrib(1, 3, 0); // circle
    attrib(2, 4, 3); // color
    attrib(3, 4, 7); // params
    for (let n = 0; n < DOME_MAX_NEIGHBORS; n++) {
      attrib(4 + n, 3, 11 + n * 3);
    }

    gl.bindVertexArray(null);
  }

  setLocalPlayer(id: number): void {
    if (id === this.localPlayerID) return;
    this.localPlayerID = id;
    this.rebuild();
  }

  /** The viewer's allies and teammates (smallIDs). */
  setAllies(allies: ReadonlySet<number>): void {
    if (sameSet(allies, this.allies)) return;
    this.allies = new Set(allies);
    this.rebuild();
  }

  /** Whether the viewer is aiming a nuke (shields it would hit stand out). */
  setNukeAiming(aiming: boolean): void {
    if (aiming === this.nukeAiming) return;
    this.nukeAiming = aiming;
    this.rebuild();
  }

  /** Player palette, for spectator mode where shields take owner colors. */
  setPaletteData(data: Float32Array): void {
    this.paletteData = data;
    if (this.localPlayerID <= 0) this.rebuild();
  }

  updateStructures(structures: Map<number, UnitState>): void {
    this.lastStructures = structures;
    this.rebuild();
  }

  private rebuild(): void {
    if (!this.lastStructures) return;
    const circles = buildDomeShieldCircles(this.lastStructures.values(), {
      mapWidth: this.mapW,
      range: this.range,
      localPlayerID: this.localPlayerID,
      allies: this.allies,
      nukeAiming: this.nukeAiming,
      margin: MAX_PAD,
    });
    this.upload(circles);
  }

  private color(c: DomeShieldCircle): readonly number[] {
    const s = this.settings.domeShield;
    const byKind: Record<Exclude<DomeShieldKind, "owner">, number[]> = {
      self: s.selfColor,
      ally: s.allyColor,
      enemy: s.enemyColor,
      blocked: s.blockedColor,
    };
    if (c.kind !== "owner") return byKind[c.kind];
    const off = c.ownerID * 4;
    const p = this.paletteData;
    if (!p || off + 2 >= p.length) return s.enemyColor;
    // Lift the territory color toward white so the shield reads over it.
    return [0, 1, 2].map((i) => p[off + i] + (1 - p[off + i]) * 0.35);
  }

  private upload(circles: DomeShieldCircle[]): void {
    this.instanceBuf.ensureCapacity(Math.max(1, circles.length));
    const data = this.instanceBuf.float32;
    this.hasBlocked = false;
    for (let i = 0; i < circles.length; i++) {
      const c = circles[i];
      const off = i * FLOATS_PER_INSTANCE;
      const rgb = this.color(c);
      const blocked = c.kind === "blocked";
      if (blocked) this.hasBlocked = true;
      data[off + 0] = c.x;
      data[off + 1] = c.y;
      data[off + 2] = c.radius;
      data[off + 3] = rgb[0];
      data[off + 4] = rgb[1];
      data[off + 5] = rgb[2];
      data[off + 6] = 1;
      data[off + 7] = c.building ? 1 : 0;
      data[off + 8] = blocked ? 1 : 0;
      data[off + 9] = 0;
      data[off + 10] = 0;
      for (let n = 0; n < DOME_MAX_NEIGHBORS; n++) {
        const o = off + 11 + n * 3;
        const j = c.neighbors[n];
        if (j === undefined) {
          data[o] = 0;
          data[o + 1] = 0;
          data[o + 2] = 0;
          continue;
        }
        const nb = circles[j];
        data[o] = nb.x;
        data[o + 1] = nb.y;
        // Earlier circles own the pixels they reach (positive radius).
        data[o + 2] = j < i ? nb.radius : -nb.radius;
      }
    }
    this.instanceCount = circles.length;
    if (circles.length > 0) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf.buffer);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        data,
        0,
        circles.length * FLOATS_PER_INSTANCE,
      );
    }
  }

  draw(cameraMatrix: Float32Array, zoom: number): void {
    if (this.instanceCount === 0) return;
    const gl = this.gl;
    const s = this.settings.domeShield;
    // World units per screen pixel.
    const px = 1 / Math.max(zoom, 1e-3);
    const ringHalf = Math.min(
      MAX_PAD / 2,
      Math.max(s.ringWidth, s.ringMinPx * px) / 2,
    );
    const pad = Math.min(MAX_PAD, ringHalf + 2 * px);

    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uCamera, false, cameraMatrix);
    gl.uniform1f(this.uPad, pad);
    gl.uniform1f(this.uRingHalf, ringHalf);
    gl.uniform1f(this.uAA, Math.min(px, ringHalf));
    gl.uniform1f(this.uFillAlpha, s.fillAlpha);
    gl.uniform1f(this.uRimAlpha, s.rimAlpha);
    gl.uniform1f(this.uRimWidth, Math.max(0.01, s.rimWidth));
    gl.uniform1f(this.uRingAlpha, s.ringAlpha);
    gl.uniform1f(this.uBuildingAlpha, s.buildingRingAlpha);
    gl.uniform1f(this.uDashLen, s.dashLen);
    gl.uniform1f(this.uGapLen, s.gapLen);
    gl.uniform1f(this.uBlockedFill, s.blockedFill);
    gl.uniform1f(this.uBlockedRing, s.blockedRing);
    gl.uniform1f(this.uBlockedPulse, this.hasBlocked ? s.blockedPulse : 0);
    gl.uniform1f(this.uTime, (performance.now() - this.startTime) / 1000);

    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.instanceCount);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    this.instanceBuf.dispose();
    gl.deleteBuffer(this.quadBuf);
    gl.deleteVertexArray(this.vao);
  }
}

function sameSet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
