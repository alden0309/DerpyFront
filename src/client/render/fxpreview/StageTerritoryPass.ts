/**
 * StageTerritoryPass — the effect preview's two territories: a flat fill per
 * owner with a darker border, like the game's territory at a distance. The
 * preview's own pass (the game's TerritoryPass needs skins, patterns and a
 * live tile stream); it draws no effect, so the effects stay the game's.
 */

import {
  createMapQuad,
  createProgram,
  createTexture2D,
} from "../gl/utils/GlUtils";

import territoryFragSrc from "../gl/shaders/fxpreview/stage-territory.frag.glsl?raw";
import overlayVertSrc from "../gl/shaders/map-overlay/overlay.vert.glsl?raw";
import type { StageMapData } from "./StageMap";

type RGB = readonly [number, number, number];

export class StageTerritoryPass {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly tex: WebGLTexture;
  private readonly uCamera: WebGLUniformLocation;
  private readonly uMapSize: WebGLUniformLocation;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly map: StageMapData,
    colors: ReadonlyMap<number, RGB>,
  ) {
    this.program = createProgram(
      gl,
      overlayVertSrc,
      territoryFragSrc,
      "StageTerritoryPass",
    );
    this.uCamera = gl.getUniformLocation(this.program, "uCamera")!;
    this.uMapSize = gl.getUniformLocation(this.program, "uMapSize")!;
    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, "uTerritory"), 0);
    this.vao = createMapQuad(gl, map.w, map.h);
    this.tex = createTexture2D(gl, {
      width: map.w,
      height: map.h,
      internalFormat: gl.RGBA8,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      data: territoryTexels(map, colors),
    });
  }

  draw(cameraMatrix: Float32Array): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uCamera, false, cameraMatrix);
    gl.uniform2f(this.uMapSize, this.map.w, this.map.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.tex);
  }
}

/** Fill (60% alpha) inside each territory, an opaque darker shade on its edge. */
export function territoryTexels(
  map: StageMapData,
  colors: ReadonlyMap<number, RGB>,
): Uint8Array {
  const { w, h, owner } = map;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = owner[i];
      const c = colors.get(o);
      if (o === 0 || c === undefined) continue;
      let edge = false;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (owner[ny * w + nx] !== o) edge = true;
      }
      const k = edge ? 0.6 : 1;
      out[i * 4] = Math.round(c[0] * k * 255);
      out[i * 4 + 1] = Math.round(c[1] * k * 255);
      out[i * 4 + 2] = Math.round(c[2] * k * 255);
      out[i * 4 + 3] = edge ? 255 : 150;
    }
  }
  return out;
}
