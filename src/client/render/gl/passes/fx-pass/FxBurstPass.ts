/**
 * FxBurstPass (FX r28) — the Derp Store packs' layered nuke bursts.
 *
 * Each burst is two instanced draws' worth of data, written once when the
 * nuke goes off and never touched per frame:
 *   - one quad (burst.*.glsl) for the flash and fireball, and one more for
 *     the pack's lingering residue field where it leaves one (the same
 *     shaders built with RESIDUE_PASS); the vertex shader sizes each from
 *     the burst's age;
 *   - the shockwave ring as a thin annulus round its front
 *     (burst-ring.*.glsl), so a MIRV's 350 rings shade only their bands;
 *   - a handful of particles (burst-particle.*.glsl): debris thrown out with
 *     drag and gravity, and the pack's residue drifting after, moved in
 *     closed form on the GPU.
 * Both live in fixed ring buffers (BURST_CAP bursts, BURST_PARTICLE_CAP
 * particles), so a MIRV's 350 warheads can't grow memory: past the cap the
 * oldest give way. Spawning allocates nothing; drawing is skipped once the
 * last burst has faded.
 *
 * How big and busy a burst is comes from burstPlan (DerpyFx.ts), the colours
 * from the pack's burst look (burstLookTable) — the same data the store's
 * preview stage uses.
 */

import {
  BURST_CAP,
  BURST_DEBRIS,
  BURST_LOOK_COLORS,
  BURST_PARTICLE_CAP,
  BURST_RESIDUE,
  type BurstDetail,
  type BurstKind,
  burstLookTable,
  burstPlan,
  DERPY_FX_THEMES,
} from "@openfront/shared/DerpyFx";
import type { RenderSettings } from "../../RenderSettings";
import { createProgram, shaderSrc } from "../../utils/GlUtils";

import particleFragSrc from "../../shaders/fx/burst-particle.frag.glsl?raw";
import particleVertSrc from "../../shaders/fx/burst-particle.vert.glsl?raw";
import ringFragSrc from "../../shaders/fx/burst-ring.frag.glsl?raw";
import ringVertSrc from "../../shaders/fx/burst-ring.vert.glsl?raw";
import burstFragSrc from "../../shaders/fx/burst.frag.glsl?raw";
import burstVertSrc from "../../shaders/fx/burst.vert.glsl?raw";

const QUAD = new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]);
const BURST_FLOATS = 16;
const PARTICLE_FLOATS = 16;
const TAU = Math.PI * 2;
/** Segments round a shockwave ring's annulus. */
const RING_SEGMENTS = 72;

/** Particle kinds in the shaders: debris 0–5 (6 = a banana peel), residue 10–15. */
const PEEL_KIND = 6;
const RESIDUE_KIND_BASE = 10;

export const BURST_FLAG_DOME_STOP = 1;
export const BURST_FLAG_RESIDUE = 2;
export const BURST_FLAG_LIGHT = 4;

/** Small deterministic PRNG (mulberry32): the same burst looks the same on every client. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Ring {
  data: Float32Array;
  floats: number;
  capacity: number;
  head: number;
  count: number;
  dirtyLo: number;
  dirtyHi: number;
  wrapped: boolean;
}

function ring(capacity: number, floats: number): Ring {
  return {
    data: new Float32Array(capacity * floats),
    floats,
    capacity,
    head: 0,
    count: 0,
    dirtyLo: Infinity,
    dirtyHi: -1,
    wrapped: false,
  };
}

/**
 * Claim the next slot in a ring buffer of `cap` slots (at most its
 * capacity); returns its float offset.
 */
function claim(r: Ring, cap = r.capacity): number {
  if (r.head >= cap) {
    r.head = 0;
    r.wrapped = true;
  }
  const i = r.head;
  r.head = i + 1;
  r.count = Math.min(r.count + 1, cap);
  if (i < r.dirtyLo) r.dirtyLo = i;
  if (i > r.dirtyHi) r.dirtyHi = i;
  return i * r.floats;
}

export class FxBurstPass {
  private readonly burstProgram: WebGLProgram;
  /**
   * The residue pass, one program per pack residue (compiled the first time
   * that residue is seen), so each residue pixel runs only its own pack's
   * code; and when each kind's last residue fades (scene seconds).
   */
  private readonly residuePrograms: ({
    program: WebGLProgram;
    u: Record<string, WebGLUniformLocation>;
  } | null)[] = BURST_RESIDUE.map(() => null);
  private readonly residueUntil: number[] = BURST_RESIDUE.map(() => -1);
  private readonly defines: Record<string, number>;
  private readonly ringProgram: WebGLProgram;
  private readonly ringVao: WebGLVertexArrayObject;
  private readonly particleProgram: WebGLProgram;
  private readonly burstVao: WebGLVertexArrayObject;
  private readonly particleVao: WebGLVertexArrayObject;
  private readonly quadVbo: WebGLBuffer;
  private readonly burstVbo: WebGLBuffer;
  private readonly particleVbo: WebGLBuffer;
  private readonly bursts: Ring;
  private readonly particles: Ring;
  private readonly uB: Record<string, WebGLUniformLocation>;
  private readonly uP: Record<string, WebGLUniformLocation>;
  private readonly uR: Record<string, WebGLUniformLocation>;
  private readonly lookTable = burstLookTable();

  private timeFn: () => number = () => performance.now();
  private t0 = this.timeFn();
  /** Scene seconds when the last burst still on screen has faded. */
  private activeUntil = -1;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly settings: RenderSettings,
  ) {
    const defines = { LOOK_SIZE: DERPY_FX_THEMES.length * BURST_LOOK_COLORS };
    this.burstProgram = createProgram(
      gl,
      burstVertSrc,
      shaderSrc(burstFragSrc, defines),
      "FxBurstPass.burst",
    );
    this.defines = defines;
    this.particleProgram = createProgram(
      gl,
      shaderSrc(particleVertSrc, defines),
      particleFragSrc,
      "FxBurstPass.particle",
    );
    this.ringProgram = createProgram(
      gl,
      shaderSrc(ringVertSrc, { RING_SEGMENTS }),
      shaderSrc(ringFragSrc, defines),
      "FxBurstPass.ring",
    );
    const uniforms = (p: WebGLProgram, names: string[]) =>
      Object.fromEntries(
        names.map((n) => [n, gl.getUniformLocation(p, n)!]),
      ) as Record<string, WebGLUniformLocation>;
    this.uB = uniforms(this.burstProgram, [
      "uCamera",
      "uTime",
      "uLook",
      "uPxPerTile",
    ]);
    this.uP = uniforms(this.particleProgram, [
      "uCamera",
      "uTime",
      "uLook",
      "uPxPerTile",
    ]);
    this.uR = uniforms(this.ringProgram, [
      "uCamera",
      "uTime",
      "uLook",
      "uPxPerTile",
    ]);

    this.bursts = ring(BURST_CAP, BURST_FLOATS);
    // Sized for full detail; light detail simply uses less of it.
    this.particles = ring(BURST_PARTICLE_CAP.full, PARTICLE_FLOATS);

    this.quadVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);

    const instanced = (vbo: WebGLBuffer, r: Ring): WebGLVertexArrayObject => {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, r.data.byteLength, gl.DYNAMIC_DRAW);
      for (let k = 0; k < 4; k++) {
        gl.enableVertexAttribArray(1 + k);
        gl.vertexAttribPointer(1 + k, 4, gl.FLOAT, false, r.floats * 4, k * 16);
        gl.vertexAttribDivisor(1 + k, 1);
      }
      gl.bindVertexArray(null);
      return vao;
    };
    this.burstVbo = gl.createBuffer()!;
    this.particleVbo = gl.createBuffer()!;
    this.burstVao = instanced(this.burstVbo, this.bursts);
    this.particleVao = instanced(this.particleVbo, this.particles);
    // The rings read the bursts' instance data; their vertices come from
    // gl_VertexID, so no per-vertex attribute.
    this.ringVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.ringVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.burstVbo);
    for (let k = 0; k < 3; k++) {
      gl.enableVertexAttribArray(1 + k);
      gl.vertexAttribPointer(
        1 + k,
        4,
        gl.FLOAT,
        false,
        BURST_FLOATS * 4,
        k * 16,
      );
      gl.vertexAttribDivisor(1 + k, 1);
    }
    gl.bindVertexArray(null);
  }

  private get detail(): BurstDetail {
    return this.settings.fx.burstDetail === "light" ? "light" : "full";
  }

  private sec(): number {
    return (this.timeFn() - this.t0) / 1000;
  }

  /**
   * A pack's burst at tile (x, y). `look` is the pack's index (fxThemeIndex,
   * 1-based); `startMs` when it went off, on this pass's clock.
   */
  spawn(
    x: number,
    y: number,
    look: number,
    kind: BurstKind,
    startMs: number,
  ): void {
    const theme = DERPY_FX_THEMES[look - 1];
    if (theme === undefined) return;
    const detail = this.detail;
    const plan = burstPlan(theme, kind, detail);
    const start = (startMs - this.t0) / 1000;
    const rand = prng(
      Math.imul(x | 0, 73856093) ^
        Math.imul(y | 0, 19349663) ^
        (look * 83492791),
    );
    const debrisKind = BURST_DEBRIS.indexOf(theme.burst.debris.kind);
    const residueKind = BURST_RESIDUE.indexOf(theme.burst.residue.kind);
    const flags =
      (kind === "domeStop" ? BURST_FLAG_DOME_STOP : 0) |
      (plan.residueField ? BURST_FLAG_RESIDUE : 0) |
      (detail === "light" ? BURST_FLAG_LIGHT : 0);

    const b = this.bursts.data;
    const o = claim(this.bursts);
    b[o] = x;
    b[o + 1] = y;
    b[o + 2] = start;
    b[o + 3] = look;
    b[o + 4] = plan.ringRadius;
    b[o + 5] = plan.fireballRadius;
    b[o + 6] = plan.flashRadius;
    b[o + 7] = flags;
    b[o + 8] = plan.flashSec;
    b[o + 9] = plan.fireballSec;
    b[o + 10] = plan.ringSec;
    b[o + 11] = plan.residueField ? plan.residueSec : 0;
    b[o + 12] = rand() * 97;
    b[o + 13] = debrisKind;
    b[o + 14] = residueKind;
    b[o + 15] = 0;

    const cap =
      BURST_PARTICLE_CAP[detail] < this.particles.capacity
        ? BURST_PARTICLE_CAP[detail]
        : this.particles.capacity;
    const F = plan.fireballRadius;
    for (let i = 0; i < plan.debris; i++) {
      this.spawnDebris(x, y, start, look, debrisKind, F, rand, cap);
    }
    for (let i = 0; i < plan.residue; i++) {
      this.spawnResidue(
        x,
        y,
        start,
        look,
        residueKind,
        F,
        plan.residueSec,
        rand,
        cap,
      );
    }
    if (plan.residueField && residueKind >= 0) {
      this.residueProgram(residueKind);
      this.residueUntil[residueKind] = Math.max(
        this.residueUntil[residueKind],
        start + plan.residueSec,
      );
    }
    const end =
      start +
      Math.max(
        plan.flashSec,
        plan.fireballSec,
        plan.ringSec,
        plan.residueField ? plan.residueSec : 0,
        plan.residue > 0 ? plan.residueSec : 0,
        4, // the longest debris life
      );
    if (end > this.activeUntil) this.activeUntil = end;
  }

  /** The residue pass for one pack residue, compiled on first use. */
  private residueProgram(kind: number): void {
    if (this.residuePrograms[kind] !== null) return;
    const gl = this.gl;
    const defines = { ...this.defines, RESIDUE_PASS: 1, RESIDUE_KIND: kind };
    const program = createProgram(
      gl,
      shaderSrc(burstVertSrc, defines),
      shaderSrc(burstFragSrc, defines),
      `FxBurstPass.residue.${BURST_RESIDUE[kind]}`,
    );
    const u: Record<string, WebGLUniformLocation> = {};
    for (const n of ["uCamera", "uTime", "uLook", "uPxPerTile"]) {
      u[n] = gl.getUniformLocation(program, n)!;
    }
    this.residuePrograms[kind] = { program, u };
  }

  /** Claim a particle slot, keeping the light fallback inside its smaller cap. */
  private particleSlot(cap: number): number {
    return claim(this.particles, cap);
  }

  private spawnDebris(
    x: number,
    y: number,
    start: number,
    look: number,
    kind: number,
    F: number,
    rand: () => number,
    cap: number,
  ): void {
    const a = rand() * TAU;
    const reach = F * (0.5 + 1.9 * rand() * rand() + 0.4 * rand());
    let drag = 2.2;
    let g = F * 3.4;
    let vz = g * (0.22 + 0.38 * rand());
    let life = 1.4 + rand();
    let size = F * (0.1 + 0.06 * rand());
    let spin = (rand() - 0.5) * 8;
    let pkind = kind;
    switch (BURST_DEBRIS[kind]) {
      case "sparks":
        drag = 3;
        life = 0.7 + 0.8 * rand();
        size = F * (0.07 + 0.05 * rand());
        break;
      case "embers":
        life = 1.6 + 1.3 * rand();
        size = F * (0.09 + 0.08 * rand());
        break;
      case "shards":
        life = 1.4 + rand();
        size = F * (0.12 + 0.1 * rand());
        spin = (rand() < 0.5 ? -1 : 1) * (5 + 7 * rand());
        break;
      case "confetti":
        drag = 1.6;
        g *= 0.35;
        vz = g * (0.5 + 0.6 * rand());
        life = 2.2 + 1.4 * rand();
        size = F * (0.09 + 0.05 * rand());
        spin = (rand() < 0.5 ? -1 : 1) * (6 + 8 * rand());
        if (rand() < 0.22) {
          pkind = PEEL_KIND;
          size *= 1.9;
        }
        break;
      case "stars":
        life = 1.5 + 1.2 * rand();
        size = F * (0.17 + 0.12 * rand());
        spin = (rand() < 0.5 ? -1 : 1) * (0.9 + 0.8 * rand());
        break;
      case "coins":
        vz = g * (0.45 + 0.4 * rand());
        life = 1.9 + 1.2 * rand();
        size = F * (0.12 + 0.05 * rand());
        spin = (rand() < 0.5 ? -1 : 1) * (8 + 7 * rand());
        break;
    }
    const v = reach * drag;
    const d = this.particles.data;
    const o = this.particleSlot(cap);
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = start;
    d[o + 3] = look;
    d[o + 4] = Math.cos(a) * v;
    d[o + 5] = Math.sin(a) * v;
    d[o + 6] = vz;
    d[o + 7] = life;
    d[o + 8] = size;
    d[o + 9] = rand();
    d[o + 10] = pkind;
    d[o + 11] = pkind === PEEL_KIND ? 0 : Math.floor(rand() * 3);
    d[o + 12] = drag;
    d[o + 13] = g;
    d[o + 14] = spin;
    d[o + 15] = rand() * 0.08;
  }

  private spawnResidue(
    x: number,
    y: number,
    start: number,
    look: number,
    kind: number,
    F: number,
    residueSec: number,
    rand: () => number,
    cap: number,
  ): void {
    const a = rand() * TAU;
    const r = F * 1.5 * Math.sqrt(rand());
    let vz = 0;
    let life = 0.8 + 1.4 * rand();
    let size = F * (0.05 + 0.03 * rand());
    let spin = 0;
    let drift = F * 0.08;
    switch (BURST_RESIDUE[kind]) {
      case "flare":
        vz = F * (0.25 + 0.35 * rand());
        life = 1.2 + 1.2 * rand();
        break;
      case "haze":
        vz = F * 0.05 * rand();
        life = 0.6 + 0.6 * rand();
        size = F * (0.08 + 0.09 * rand());
        break;
      case "mist":
        life = 0.6 + 0.8 * rand();
        size = F * (0.12 + 0.1 * rand());
        drift = F * 0.03;
        break;
      case "sprinkles":
        life = 1.5 + 1.5 * rand();
        size = F * (0.08 + 0.03 * rand());
        spin = (rand() - 0.5) * 4;
        drift = F * 0.12;
        break;
      case "nebula":
        life = 1.5 + 1.5 * rand();
        size = F * (0.04 + 0.04 * rand());
        spin = 0.8 + 0.8 * rand();
        break;
      case "rays":
        life = 0.5 + 0.7 * rand();
        size = F * (0.12 + 0.1 * rand());
        drift = F * 0.02;
        break;
    }
    const d = this.particles.data;
    const o = this.particleSlot(cap);
    const da = rand() * TAU;
    d[o] = x + Math.cos(a) * r;
    d[o + 1] = y + Math.sin(a) * r;
    d[o + 2] = start;
    d[o + 3] = look;
    d[o + 4] = Math.cos(da) * drift;
    d[o + 5] = Math.sin(da) * drift;
    d[o + 6] = vz;
    d[o + 7] = life;
    d[o + 8] = size;
    d[o + 9] = rand();
    d[o + 10] = RESIDUE_KIND_BASE + kind;
    d[o + 11] = Math.floor(rand() * 3);
    d[o + 12] = 0.4;
    d[o + 13] = 0;
    d[o + 14] = spin;
    d[o + 15] = 0.3 + rand() * Math.max(0.1, residueSec * 0.6 - life * 0.5);
  }

  private upload(r: Ring, vbo: WebGLBuffer): void {
    if (r.dirtyHi < 0) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const lo = r.dirtyLo;
    const hi = r.dirtyHi + 1;
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      lo * r.floats * 4,
      r.data,
      lo * r.floats,
      (hi - lo) * r.floats,
    );
    r.dirtyLo = Infinity;
    r.dirtyHi = -1;
  }

  /** Whether any burst is still on screen. */
  get active(): boolean {
    return this.sec() <= this.activeUntil;
  }

  /**
   * Draw every live burst: the layered quads, then the particles over them.
   * `pxPerTile` is device pixels per tile (the camera zoom).
   */
  draw(cameraMatrix: Float32Array, pxPerTile: number): void {
    if (this.bursts.count === 0 || !this.active) return;
    const gl = this.gl;
    this.upload(this.bursts, this.burstVbo);
    this.upload(this.particles, this.particleVbo);
    const now = this.sec();
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindVertexArray(this.burstVao);
    // The residue first, under the fireballs (one draw per pack residue
    // still on screen); then the flashes and fireballs.
    const passes: [WebGLProgram, Record<string, WebGLUniformLocation>][] = [];
    this.residuePrograms.forEach((r, kind) => {
      if (r !== null && this.residueUntil[kind] >= now)
        passes.push([r.program, r.u]);
    });
    passes.push([this.burstProgram, this.uB]);
    for (const [program, u] of passes) {
      gl.useProgram(program);
      gl.uniformMatrix3fv(u.uCamera, false, cameraMatrix);
      gl.uniform1f(u.uTime, now);
      gl.uniform1f(u.uPxPerTile, pxPerTile);
      gl.uniform3fv(u.uLook, this.lookTable);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.bursts.count);
    }

    gl.useProgram(this.ringProgram);
    gl.uniformMatrix3fv(this.uR.uCamera, false, cameraMatrix);
    gl.uniform1f(this.uR.uTime, now);
    gl.uniform1f(this.uR.uPxPerTile, pxPerTile);
    gl.uniform3fv(this.uR.uLook, this.lookTable);
    gl.bindVertexArray(this.ringVao);
    gl.drawArraysInstanced(
      gl.TRIANGLE_STRIP,
      0,
      (RING_SEGMENTS + 1) * 2,
      this.bursts.count,
    );

    if (this.particles.count > 0) {
      gl.useProgram(this.particleProgram);
      gl.uniformMatrix3fv(this.uP.uCamera, false, cameraMatrix);
      gl.uniform1f(this.uP.uTime, now);
      gl.uniform1f(this.uP.uPxPerTile, pxPerTile);
      gl.uniform3fv(this.uP.uLook, this.lookTable);
      gl.bindVertexArray(this.particleVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.particles.count);
    }
    gl.bindVertexArray(null);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  setTimeFn(fn: () => number): void {
    this.timeFn = fn;
    this.t0 = fn();
    this.clear();
  }

  clear(): void {
    for (const r of [this.bursts, this.particles]) {
      r.head = 0;
      r.count = 0;
      r.wrapped = false;
      r.dirtyLo = Infinity;
      r.dirtyHi = -1;
    }
    this.activeUntil = -1;
    this.residueUntil.fill(-1);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.burstProgram);
    for (const r of this.residuePrograms) if (r) gl.deleteProgram(r.program);
    gl.deleteProgram(this.particleProgram);
    gl.deleteProgram(this.ringProgram);
    gl.deleteVertexArray(this.ringVao);
    gl.deleteVertexArray(this.burstVao);
    gl.deleteVertexArray(this.particleVao);
    gl.deleteBuffer(this.quadVbo);
    gl.deleteBuffer(this.burstVbo);
    gl.deleteBuffer(this.particleVbo);
  }
}
