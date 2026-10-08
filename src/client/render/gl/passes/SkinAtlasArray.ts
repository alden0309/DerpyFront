/**
 * SkinAtlasArray — fixed-size TEXTURE_2D_ARRAY of territory skin PNGs.
 *
 * The player set is locked at game start, so the unique skin URL count is
 * known up front. The atlas allocates exactly that many `SKIN_DIM × SKIN_DIM`
 * layers once and never resizes. Each layer is filled in asynchronously as
 * its PNG decodes; `onLayerReady(url, layer)` fires per layer so callers can
 * patch their per-player layer table.
 *
 * If `urls` is empty the atlas binds a 1×1×1 placeholder so the shader's
 * `uSkinAtlas` sampler still has something to read from (the shader's
 * skinLayer table will be all zeros, so it never actually samples).
 *
 * Sampler wrap is REPEAT on both axes: the territory shader passes UVs that
 * run past [0,1] and the hardware tiles the image across the whole territory
 * (one copy every SKIN_DIM tiles, a copy centered on the anchor), so skins
 * cover the entire map however big it is. Each image fills its whole layer
 * (see uploadImage) so the copies meet without gaps.
 */

/**
 * Per-side dimension for every atlas layer, in texels — and so in map tiles,
 * since the shader maps one texel to one tile. Every image is scaled to it.
 */
export const SKIN_DIM = 1024;

export class SkinAtlasArray {
  private gl: WebGL2RenderingContext;
  private tex: WebGLTexture;
  /** url → layer index. Layers are assigned in iteration order at construction. */
  private layers = new Map<string, number>();
  private onLayerReady: (url: string, layer: number) => void;
  private disposed = false;

  /**
   * @param urls Unique skin URLs needed for this game. If empty, the atlas is
   *   a 1×1×1 placeholder. Order determines layer assignment.
   */
  constructor(
    gl: WebGL2RenderingContext,
    urls: readonly string[],
    onLayerReady: (url: string, layer: number) => void,
  ) {
    this.gl = gl;
    this.onLayerReady = onLayerReady;

    if (urls.length === 0) {
      this.tex = this.makeTex(1, 1, 1);
      return;
    }

    this.tex = this.makeTex(SKIN_DIM, SKIN_DIM, urls.length);
    urls.forEach((url, layer) => {
      this.layers.set(url, layer);
      this.load(url, layer);
    });
  }

  get texture(): WebGLTexture {
    return this.tex;
  }

  /** Layer index for a URL, or -1 if this URL wasn't registered at construction. */
  getLayer(url: string): number {
    return this.layers.get(url) ?? -1;
  }

  private load(url: string, layer: number): void {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (this.disposed) return;
      this.uploadImage(img, layer);
      this.onLayerReady(url, layer);
    };
    img.onerror = () => {
      console.warn("Skin image failed to load:", url);
    };
    img.src = url;
  }

  /**
   * Scale the image to cover the whole SKIN_DIM×SKIN_DIM cell (up or down),
   * cropping a non-square image to its centered square first. The layer
   * repeats edge to edge, so any padding would show as gaps between copies.
   * The shader puts the cell center (UV 0.5) on the spawn anchor, and the
   * crop is centered, so the image's center still lines up with the spawn.
   */
  private uploadImage(img: HTMLImageElement, layer: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = SKIN_DIM;
    canvas.height = SKIN_DIM;
    const ctx = canvas.getContext("2d", { willReadFrequently: false })!;
    ctx.imageSmoothingQuality = "high";
    // Cropping the source (rather than overdrawing a scaled image) lands the
    // destination exactly on the cell, with no rounding gap at the edges.
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (side > 0) {
      const srcX = (img.naturalWidth - side) / 2;
      const srcY = (img.naturalHeight - side) / 2;
      ctx.drawImage(img, srcX, srcY, side, side, 0, 0, SKIN_DIM, SKIN_DIM);
    }

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      0,
      0,
      layer,
      SKIN_DIM,
      SKIN_DIM,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      canvas,
    );
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  }

  private makeTex(w: number, h: number, layerCount: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(
      gl.TEXTURE_2D_ARRAY,
      mipLevels(w, h),
      gl.RGBA8,
      w,
      h,
      layerCount,
    );
    gl.texParameteri(
      gl.TEXTURE_2D_ARRAY,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // REPEAT tiles the skin across territory beyond one SKIN_DIM cell.
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return tex;
  }

  dispose(): void {
    this.disposed = true;
    this.gl.deleteTexture(this.tex);
    this.layers.clear();
  }
}

function mipLevels(w: number, h: number): number {
  return Math.floor(Math.log2(Math.max(w, h))) + 1;
}
