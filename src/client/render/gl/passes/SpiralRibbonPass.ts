/**
 * SpiralRibbonPass — draws spiral nukeTrail vortexes as helix ribbon
 * geometry, above the plain trails and below the missiles.
 *
 * Each live spiral nuke (from SpiralTrails) owns a triangle-strip VBO of its
 * centerline samples, expanded to two edge vertices per sample (aSide ±1);
 * the vertex shader swings each sample by the helix offset and handles the
 * head-cone convergence from uHeadDist, so vertex data is append-only —
 * per frame we only bufferSubData the samples added since the last upload.
 * One draw per strand (≤ MAX_TRAIL_STRANDS) reuses the same strip with a
 * different uPhase0.
 *
 * The glow look is a two-pass split: the soft halo renders into a
 * reduced-resolution offscreen buffer (spiralResolutionScale — cuts its
 * fragment cost by the scale factor squared, and the bilinear upsample keeps
 * it soft) composited ADDITIVELY over the scene like emitted light; the
 * sharp core ribbons then draw on top at full resolution, so the strands
 * stay crisp instead of inheriting the upsample blur. Everything is skipped
 * CPU-side while no spiral nuke is in flight.
 *
 * FX (r28): every nukeTrail cosmetic now grows a ribbon (gradient and
 * transition ones without the helix), and each gets, from the same vertex
 * buffer:
 *   - a comet glow along its path into the halo buffer, brightest at the
 *     head and tapering away behind it;
 *   - (helix-less trails) a smooth, tapered core line over the stamped
 *     trail, coloured exactly like it;
 *   - sparks shed near the head, drifting off the path and fading — one
 *     instanced draw reading every few samples straight from the buffer;
 * and the helix strands now thin and fade toward the tail.
 */

import type { SpiralRibbon } from "../../frame/SpiralTrails";
import { SAMPLE_FLOATS, SAMPLES_PER_TILE } from "../../frame/SpiralTrails";
import type { RenderSettings } from "../RenderSettings";
import { createProgram } from "../utils/GlUtils";

import spiralCompositeFragSrc from "../shaders/map-overlay/spiral-composite.frag.glsl?raw";
import spiralRibbonFragSrc from "../shaders/map-overlay/spiral-ribbon.frag.glsl?raw";
import spiralRibbonVertSrc from "../shaders/map-overlay/spiral-ribbon.vert.glsl?raw";
import trailGlowFragSrc from "../shaders/map-overlay/trail-glow.frag.glsl?raw";
import trailGlowVertSrc from "../shaders/map-overlay/trail-glow.vert.glsl?raw";
import trailShedFragSrc from "../shaders/map-overlay/trail-shed.frag.glsl?raw";
import trailShedVertSrc from "../shaders/map-overlay/trail-shed.vert.glsl?raw";
import fullscreenVertSrc from "../shaders/shared/fullscreen.vert.glsl?raw";

// Strip vertex: cx, cy, px, py, d, side.
const VERT_FLOATS = 6;
// Strip half-widths in tiles per pass — each must cover its profile in the
// fragment shader (core: RIB_OUT 1.0; halo: GLOW_OUT 3.0) with slack so the
// falloff reaches zero inside the strip.
const CORE_HALF_WIDTH = 1.2;
const GLOW_HALF_WIDTH = 3.2;
const TAU = 2 * Math.PI;

// FX (r28): the trails' glow, core line and sparks.
/** Tiles behind the head over which strands and core lines taper. */
const STRAND_TAIL = 80;
/** Tiles behind the head over which the comet glow fades. */
const GLOW_TAIL = 45;
/** The comet glow's half-width at the head, tiles (plus a helix's radius). */
const COMET_HALF_WIDTH = 5.5;
/** The smooth core line's half-width at the head, tiles; it keeps covering
 *  the one-tile stamped trail beneath it all the way back. */
const CORE_LINE_HALF_WIDTH = 1.15;
const CORE_LINE_MIN = 0.62;
/** Tiles behind the head a shed spark lives, and samples between sparks. */
const SHED_LEN = 34;
const SHED_STRIDE = 2;
const SHED_SIZE = 2.6;

interface RibbonBuffers {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  /** FX (r28): instanced spark VAO over the same buffer. */
  shedVao: WebGLVertexArrayObject;
  capacityVerts: number;
  uploadedSamples: number;
}

export class SpiralRibbonPass {
  private gl: WebGL2RenderingContext;
  private settings: RenderSettings;

  private program: WebGLProgram;
  private uCamera: WebGLUniformLocation;
  private uHeadDist: WebGLUniformLocation;
  private uConeLen: WebGLUniformLocation;
  private uRadius: WebGLUniformLocation;
  private uTwist: WebGLUniformLocation;
  private uPhase0: WebGLUniformLocation;
  private uHalfWidth: WebGLUniformLocation;
  private uTime: WebGLUniformLocation;
  private uRotSpeed: WebGLUniformLocation;
  private uTrailAlpha: WebGLUniformLocation;
  private uColorCount: WebGLUniformLocation;
  private uColors: WebGLUniformLocation;
  private uCorePass: WebGLUniformLocation;
  private uTail: WebGLUniformLocation;

  // FX (r28): comet glow + core line, and shed sparks.
  private glowProgram: WebGLProgram;
  private uG: Record<string, WebGLUniformLocation>;
  private shedProgram: WebGLProgram;
  private uS: Record<string, WebGLUniformLocation>;
  private shedQuadVbo: WebGLBuffer;
  private pxPerTile = 1;

  private compositeProgram: WebGLProgram;
  private fsQuadVao: WebGLVertexArrayObject;
  private fbo: WebGLFramebuffer | null = null;
  private fboTex: WebGLTexture | null = null;
  private fboW = 0;
  private fboH = 0;

  private ribbons: readonly SpiralRibbon[] = [];
  private readonly buffers = new Map<number, RibbonBuffers>();
  // Scratch for expanding samples to strip vertices; grown on demand.
  private vertScratch = new Float32Array(512 * 2 * VERT_FLOATS);
  // Flat scratch for the uColors uniform (8 × vec3).
  private readonly colorScratch = new Float32Array(8 * 3);
  // Anchor animation time at construction (like TrailPass) so the value
  // stays small and sin()/fract() don't quantize over long sessions.
  private timeFn: () => number = () => performance.now();
  private startTime = this.timeFn();

  constructor(gl: WebGL2RenderingContext, settings: RenderSettings) {
    this.gl = gl;
    this.settings = settings;

    this.program = createProgram(
      gl,
      spiralRibbonVertSrc,
      spiralRibbonFragSrc,
      "SpiralRibbonPass.program",
    );
    const u = (name: string) => gl.getUniformLocation(this.program, name)!;
    this.uCamera = u("uCamera");
    this.uHeadDist = u("uHeadDist");
    this.uConeLen = u("uConeLen");
    this.uRadius = u("uRadius");
    this.uTwist = u("uTwist");
    this.uPhase0 = u("uPhase0");
    this.uHalfWidth = u("uHalfWidth");
    this.uTime = u("uTime");
    this.uRotSpeed = u("uRotSpeed");
    this.uTrailAlpha = u("uTrailAlpha");
    this.uColorCount = u("uColorCount");
    this.uColors = u("uColors");
    this.uCorePass = u("uCorePass");
    this.uTail = u("uTail");

    const uniforms = (prog: WebGLProgram, names: string[]) =>
      Object.fromEntries(
        names.map((n) => [n, gl.getUniformLocation(prog, n)!]),
      ) as Record<string, WebGLUniformLocation>;
    this.glowProgram = createProgram(
      gl,
      trailGlowVertSrc,
      trailGlowFragSrc,
      "SpiralRibbonPass.glowProgram",
    );
    this.uG = uniforms(this.glowProgram, [
      "uCamera",
      "uHeadDist",
      "uHalfWidth",
      "uTail",
      "uMinWidth",
      "uTime",
      "uTrailAlpha",
      "uColorCount",
      "uColors",
      "uStyle",
      "uScalar0",
      "uScalar1",
      "uMode",
    ]);
    this.shedProgram = createProgram(
      gl,
      trailShedVertSrc,
      trailShedFragSrc,
      "SpiralRibbonPass.shedProgram",
    );
    this.uS = uniforms(this.shedProgram, [
      "uCamera",
      "uHeadDist",
      "uShedLen",
      "uSpread",
      "uSize",
      "uMinSize",
      "uTime",
      "uColorCount",
      "uColors",
    ]);
    this.shedQuadVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shedQuadVbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]),
      gl.STATIC_DRAW,
    );

    // Composite: fullscreen quad sampling the ribbon buffer (unit 0).
    this.compositeProgram = createProgram(
      gl,
      fullscreenVertSrc,
      spiralCompositeFragSrc,
      "SpiralRibbonPass.compositeProgram",
    );
    gl.useProgram(this.compositeProgram);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, "uTex"), 0);
    this.fsQuadVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.fsQuadVao);
    const fsBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, fsBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /**
   * Clock for animation (ms). The store's effect preview (render/fxpreview)
   * runs these passes on its own scene clock; the game keeps the wall clock.
   */
  setTimeFn(fn: () => number): void {
    this.timeFn = fn;
    this.startTime = fn();
  }

  /**
   * Adopt this frame's ribbons (live refs from SpiralTrails) and stream any
   * newly appended samples into each ribbon's VBO.
   */
  updateRibbons(ribbons: readonly SpiralRibbon[]): void {
    this.ribbons = ribbons;
    const live = new Set<number>();
    for (const r of ribbons) {
      live.add(r.id);
      this.uploadRibbon(r);
    }
    for (const [id, buf] of this.buffers) {
      if (live.has(id)) continue;
      this.gl.deleteVertexArray(buf.vao);
      this.gl.deleteVertexArray(buf.shedVao);
      this.gl.deleteBuffer(buf.vbo);
      this.buffers.delete(id);
    }
  }

  private uploadRibbon(r: SpiralRibbon): void {
    const gl = this.gl;
    let buf = this.buffers.get(r.id);
    if (!buf) {
      const vbo = gl.createBuffer()!;
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      const stride = VERT_FLOATS * 4;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0); // aCenter
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8); // aPerp
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 16); // aDist
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 20); // aSide
      // FX (r28): sparks — a unit quad, instanced over every few samples
      // (pointers set per draw, as the window near the head moves).
      const shedVao = gl.createVertexArray()!;
      gl.bindVertexArray(shedVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.shedQuadVbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
      for (let loc = 1; loc <= 3; loc++) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribDivisor(loc, 1);
      }
      gl.bindVertexArray(null);
      buf = { vao, vbo, shedVao, capacityVerts: 0, uploadedSamples: 0 };
      this.buffers.set(r.id, buf);
    }
    if (r.sampleCount <= buf.uploadedSamples) return;

    const neededVerts = r.sampleCount * 2;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.vbo);
    if (neededVerts > buf.capacityVerts) {
      // Grow by doubling and re-upload everything (paths only append, so
      // this happens a handful of times per flight).
      let cap = Math.max(buf.capacityVerts, 512);
      while (cap < neededVerts) cap *= 2;
      gl.bufferData(gl.ARRAY_BUFFER, cap * VERT_FLOATS * 4, gl.DYNAMIC_DRAW);
      buf.capacityVerts = cap;
      buf.uploadedSamples = 0;
    }
    const first = buf.uploadedSamples;
    const count = r.sampleCount - first;
    const data = this.expandSamples(r.samples, first, count);
    gl.bufferSubData(gl.ARRAY_BUFFER, first * 2 * VERT_FLOATS * 4, data);
    buf.uploadedSamples = r.sampleCount;
  }

  /** Expand samples [first, first+count) to 2 strip vertices each. */
  private expandSamples(
    samples: Float32Array,
    first: number,
    count: number,
  ): Float32Array {
    const floats = count * 2 * VERT_FLOATS;
    if (this.vertScratch.length < floats) {
      let len = this.vertScratch.length;
      while (len < floats) len *= 2;
      this.vertScratch = new Float32Array(len);
    }
    const out = this.vertScratch;
    let w = 0;
    for (let s = 0; s < count; s++) {
      const off = (first + s) * SAMPLE_FLOATS;
      for (let side = -1; side <= 1; side += 2) {
        out[w++] = samples[off];
        out[w++] = samples[off + 1];
        out[w++] = samples[off + 2];
        out[w++] = samples[off + 3];
        out[w++] = samples[off + 4];
        out[w++] = side;
      }
    }
    return out.subarray(0, floats);
  }

  /**
   * Draw the vortexes: the soft halo (reduced-resolution buffer, composited
   * additively so it reads as emitted light), then the sharp full-resolution
   * core ribbons on top. No-op while no spiral nuke is in flight.
   */
  draw(cameraMatrix: Float32Array, pxPerTile = 1): void {
    this.pxPerTile = pxPerTile;
    let anyStrip = false;
    for (const r of this.ribbons) {
      if (r.sampleCount >= 2) {
        anyStrip = true;
        break;
      }
    }
    if (!anyStrip) return;
    this.renderBuffer(cameraMatrix);
    this.composite();
    this.drawCores(cameraMatrix);
    this.drawSheds(cameraMatrix);
  }

  /** (Re)create the render target at the current scaled canvas size. */
  private ensureTarget(w: number, h: number): void {
    if (this.fbo !== null && w === this.fboW && h === this.fboH) return;
    const gl = this.gl;
    if (this.fboTex === null) {
      this.fboTex = gl.createTexture();
      this.fbo = gl.createFramebuffer();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      w,
      h,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    // LINEAR — the bilinear upsample at composite is what softens the look.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.fboTex,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fboW = w;
    this.fboH = h;
  }

  private renderBuffer(cameraMatrix: Float32Array): void {
    const gl = this.gl;
    const scale = this.settings.mapOverlay.spiralResolutionScale;
    const w = Math.max(1, Math.round(gl.drawingBufferWidth * scale));
    const h = Math.max(1, Math.round(gl.drawingBufferHeight * scale));
    this.ensureTarget(w, h);

    // The surrounding pipeline may be rendering into its own target
    // (day-night scene FBO) — save and restore rather than assuming screen.
    const prevFbo = gl.getParameter(
      gl.FRAMEBUFFER_BINDING,
    ) as WebGLFramebuffer | null;
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Halo crossings accumulate premultiplied-over within the buffer (bounded
    // — the additive step to the scene happens once, at composite).
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.drawStrips(cameraMatrix, 0, GLOW_HALF_WIDTH);
    this.drawGlows(cameraMatrix, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    gl.viewport(
      prevViewport[0],
      prevViewport[1],
      prevViewport[2],
      prevViewport[3],
    );
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // restore overlay default
  }

  /** Draw every ribbon's strands once with the given pass mode + strip width. */
  private drawStrips(
    cameraMatrix: Float32Array,
    corePass: number,
    halfWidth: number,
  ): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uCamera, false, cameraMatrix);
    gl.uniform1i(this.uCorePass, corePass);
    gl.uniform1f(this.uHalfWidth, halfWidth);
    gl.uniform1f(this.uTime, (this.timeFn() - this.startTime) / 1000);
    gl.uniform1f(this.uTrailAlpha, this.settings.mapOverlay.trailAlpha);
    gl.uniform1f(this.uTail, STRAND_TAIL);

    for (const r of this.ribbons) {
      if (r.sampleCount < 2 || !r.helix) continue;
      const buf = this.buffers.get(r.id);
      if (!buf) continue;
      gl.uniform1f(this.uHeadDist, r.headDist);
      gl.uniform1f(this.uConeLen, TAU / r.twist);
      gl.uniform1f(this.uRadius, r.radius);
      gl.uniform1f(this.uTwist, r.twist);
      gl.uniform1f(this.uRotSpeed, r.rotationSpeed);
      gl.uniform1i(this.uColorCount, this.packColors(r));
      gl.uniform3fv(this.uColors, this.colorScratch);
      gl.bindVertexArray(buf.vao);
      const verts = Math.min(r.sampleCount, buf.uploadedSamples) * 2;
      for (let k = 0; k < r.strands; k++) {
        gl.uniform1f(this.uPhase0, (k * TAU) / r.strands);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, verts);
      }
    }
  }

  /**
   * Additively composite the halo buffer over the scene — light adds, so the
   * vortex brightens what's beneath instead of veiling it, and the bilinear
   * upsample keeps it soft.
   */
  private composite(): void {
    const gl = this.gl;
    gl.useProgram(this.compositeProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(this.fsQuadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // restore overlay default
  }

  /** The sharp cores, full resolution, straight-alpha over the halo. */
  private drawCores(cameraMatrix: Float32Array): void {
    this.drawStrips(cameraMatrix, 1, CORE_HALF_WIDTH);
    this.drawGlows(cameraMatrix, 1);
  }

  /** A ribbon's colours into colorScratch; returns how many. */
  private packColors(r: SpiralRibbon): number {
    const count = Math.min(r.colors.length, 8);
    for (let c = 0; c < count; c++) {
      this.colorScratch[c * 3] = r.colors[c][0];
      this.colorScratch[c * 3 + 1] = r.colors[c][1];
      this.colorScratch[c * 3 + 2] = r.colors[c][2];
    }
    return count;
  }

  /**
   * FX (r28): mode 0, every ribbon's comet glow (into the halo buffer);
   * mode 1, the smooth core line of each helix-less trail.
   */
  private drawGlows(cameraMatrix: Float32Array, mode: 0 | 1): void {
    const gl = this.gl;
    const u = this.uG;
    gl.useProgram(this.glowProgram);
    gl.uniformMatrix3fv(u.uCamera, false, cameraMatrix);
    gl.uniform1f(u.uTime, (this.timeFn() - this.startTime) / 1000);
    gl.uniform1f(u.uTrailAlpha, this.settings.mapOverlay.trailAlpha);
    gl.uniform1i(u.uMode, mode);
    for (const r of this.ribbons) {
      if (r.sampleCount < 2 || (mode === 1 && r.helix)) continue;
      const buf = this.buffers.get(r.id);
      if (!buf) continue;
      gl.uniform1f(u.uHeadDist, r.headDist);
      if (mode === 0) {
        gl.uniform1f(u.uHalfWidth, COMET_HALF_WIDTH + (r.helix ? r.radius : 0));
        gl.uniform1f(u.uTail, GLOW_TAIL);
        gl.uniform1f(u.uMinWidth, 0.3);
      } else {
        gl.uniform1f(u.uHalfWidth, CORE_LINE_HALF_WIDTH);
        gl.uniform1f(u.uTail, STRAND_TAIL);
        gl.uniform1f(u.uMinWidth, CORE_LINE_MIN);
      }
      gl.uniform1i(u.uStyle, r.style);
      gl.uniform1f(u.uScalar0, r.scalar0);
      gl.uniform1f(u.uScalar1, r.scalar1);
      gl.uniform1i(u.uColorCount, this.packColors(r));
      gl.uniform3fv(u.uColors, this.colorScratch);
      gl.bindVertexArray(buf.vao);
      gl.drawArrays(
        gl.TRIANGLE_STRIP,
        0,
        Math.min(r.sampleCount, buf.uploadedSamples) * 2,
      );
    }
  }

  /** FX (r28): sparks shed near each nuke's head, added like light. */
  private drawSheds(cameraMatrix: Float32Array): void {
    const gl = this.gl;
    const u = this.uS;
    gl.useProgram(this.shedProgram);
    gl.uniformMatrix3fv(u.uCamera, false, cameraMatrix);
    gl.uniform1f(u.uTime, (this.timeFn() - this.startTime) / 1000);
    gl.uniform1f(u.uShedLen, SHED_LEN);
    gl.uniform1f(u.uSize, SHED_SIZE);
    gl.uniform1f(u.uMinSize, 1.5 / Math.max(this.pxPerTile, 0.05));
    gl.blendFunc(gl.ONE, gl.ONE);
    const sampleBytes = 2 * VERT_FLOATS * 4;
    for (const r of this.ribbons) {
      const buf = this.buffers.get(r.id);
      if (!buf) continue;
      const samples = Math.min(r.sampleCount, buf.uploadedSamples);
      if (samples < 2) continue;
      const window = SHED_LEN * SAMPLES_PER_TILE;
      const first =
        Math.floor(Math.max(0, samples - window) / SHED_STRIDE) * SHED_STRIDE;
      const count = Math.ceil((samples - first) / SHED_STRIDE);
      gl.uniform1f(u.uHeadDist, r.headDist);
      gl.uniform1f(u.uSpread, 2.2 + (r.helix ? r.radius * 0.8 : 0));
      gl.uniform1i(u.uColorCount, this.packColors(r));
      gl.uniform3fv(u.uColors, this.colorScratch);
      gl.bindVertexArray(buf.shedVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.vbo);
      const stride = SHED_STRIDE * sampleBytes;
      const base = first * sampleBytes;
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, base); // aCenter
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, base + 8); // aPerp
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, base + 16); // aDist
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
    }
    gl.bindVertexArray(null);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteProgram(this.compositeProgram);
    gl.deleteProgram(this.glowProgram);
    gl.deleteProgram(this.shedProgram);
    gl.deleteBuffer(this.shedQuadVbo);
    gl.deleteVertexArray(this.fsQuadVao);
    for (const buf of this.buffers.values()) {
      gl.deleteVertexArray(buf.vao);
      gl.deleteVertexArray(buf.shedVao);
      gl.deleteBuffer(buf.vbo);
    }
    this.buffers.clear();
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    if (this.fboTex) gl.deleteTexture(this.fboTex);
  }
}
