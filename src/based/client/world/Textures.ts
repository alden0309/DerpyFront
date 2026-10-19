// Painted textures for Mr. Based's places (r21), drawn on canvases when a
// place is built rather than downloaded: café tiles, oak panelling, wall-
// paper, limestone, wet asphalt, paving, posters and signs. Each surface also
// gets a bump-derived normal map and a roughness map, so the lamps catch the
// grout, the grain and the puddles. Nothing here is story text: words on
// signs and posters come from the place's data.

import * as THREE from "three";

type Ctx = CanvasRenderingContext2D;

/** A small seeded generator, so a texture looks the same every time. */
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

/** Speckle: many faint dots and smudges, for grime and grain. */
function speckle(
  g: Ctx,
  w: number,
  h: number,
  r: () => number,
  n: number,
  color: string,
  alpha: number,
  size = 2,
): void {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    g.globalAlpha = alpha * r();
    const s = size * (0.4 + r());
    g.fillRect(r() * w, r() * h, s, s);
  }
  g.globalAlpha = 1;
}

/** Soft blotches: rain stains, wear, puddles. */
function blotches(
  g: Ctx,
  w: number,
  h: number,
  r: () => number,
  n: number,
  color: string,
  alpha: number,
  size: number,
): void {
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = size * (0.3 + r());
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = alpha * (0.4 + 0.6 * r());
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.globalAlpha = 1;
}

/** A tangent-space normal map from a greyscale height canvas. */
function normalsFrom(height: HTMLCanvasElement, strength: number) {
  const w = height.width;
  const h = height.height;
  const src = height.getContext("2d")!.getImageData(0, 0, w, h).data;
  const [c, g] = canvas(w, h);
  const out = g.createImageData(w, h);
  const at = (x: number, y: number) =>
    src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      out.data[i + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255);
      out.data[i + 2] = Math.round((1 / len) * 0.5 * 255 + 127);
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  return c;
}

export interface Surface {
  map: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  /** Metres one copy of the texture covers. */
  tile: [number, number];
  roughness: number;
  metalness?: number;
  normalScale?: number;
}

function tex(
  c: HTMLCanvasElement,
  color: boolean,
  aniso: number,
): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

/** Builds a surface from a painter that draws colour, height and roughness. */
function surface(
  size: number,
  tile: [number, number],
  paint: (color: Ctx, height: Ctx, rough: Ctx, s: number) => void,
  opts: {
    roughness: number;
    normal: number;
    aniso: number;
    metalness?: number;
  },
): Surface {
  const [cc, cg] = canvas(size, size);
  const [hc, hg] = canvas(size, size);
  const [rc, rg] = canvas(size, size);
  hg.fillStyle = "#808080";
  hg.fillRect(0, 0, size, size);
  rg.fillStyle = "#ffffff";
  rg.fillRect(0, 0, size, size);
  paint(cg, hg, rg, size);
  return {
    map: tex(cc, true, opts.aniso),
    normalMap:
      opts.normal > 0
        ? tex(normalsFrom(hc, opts.normal), false, opts.aniso)
        : undefined,
    roughnessMap: tex(rc, false, opts.aniso),
    tile,
    roughness: opts.roughness,
    metalness: opts.metalness,
    normalScale: 1,
  };
}

/** Black and cream café tiles, a little worn, polished. */
function tiles(size: number, aniso: number): Surface {
  return surface(
    size,
    [1.2, 1.2],
    (c, h, r, s) => {
      const r0 = rng(7);
      const n = 4;
      const t = s / n;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const dark = (i + j) % 2 === 1;
          const v = (r0() - 0.5) * 10;
          c.fillStyle = dark
            ? `rgb(${24 + v},${23 + v},${22 + v})`
            : `rgb(${196 + v},${184 + v},${160 + v})`;
          c.fillRect(i * t, j * t, t, t);
          r.fillStyle = dark ? "#3a3a3a" : "#4a4a4a";
          r.fillRect(i * t, j * t, t, t);
        }
      }
      speckle(c, s, s, r0, 1400, "#000", 0.12, 3);
      blotches(c, s, s, r0, 14, "rgba(60,40,20,0.5)", 0.25, s * 0.12);
      // Grout.
      c.strokeStyle = "#5b544a";
      h.strokeStyle = "#202020";
      r.strokeStyle = "#e0e0e0";
      for (const g of [c, h, r]) {
        g.lineWidth = s * 0.008;
        for (let k = 0; k <= n; k++) {
          g.beginPath();
          g.moveTo(k * t, 0);
          g.lineTo(k * t, s);
          g.moveTo(0, k * t);
          g.lineTo(s, k * t);
          g.stroke();
        }
      }
      blotches(r, s, s, r0, 10, "rgba(255,255,255,0.6)", 0.4, s * 0.15);
    },
    { roughness: 1, normal: 4, aniso },
  );
}

/** Oak boards, upright, varnished; `tone` lightens or darkens. */
function oak(size: number, aniso: number, tone = 0): Surface {
  return surface(
    size,
    [1.4, 1.4],
    (c, h, r, s) => {
      const r0 = rng(11 + tone);
      const boards = 6;
      const bw = s / boards;
      for (let b = 0; b < boards; b++) {
        const base = 62 + tone + (r0() - 0.5) * 14;
        c.fillStyle = `rgb(${base + 26},${base - 4},${base - 30})`;
        c.fillRect(b * bw, 0, bw, s);
        // Grain: long wavy lines.
        for (let k = 0; k < 28; k++) {
          const x0 = b * bw + r0() * bw;
          c.strokeStyle = `rgba(${20 + r0() * 20},${10},${0},${0.15 + r0() * 0.25})`;
          c.lineWidth = 0.6 + r0() * 1.6;
          c.beginPath();
          c.moveTo(x0, 0);
          for (let y = 0; y <= s; y += s / 16) {
            c.lineTo(x0 + Math.sin(y * 0.02 + k) * (2 + r0() * 3), y);
          }
          c.stroke();
        }
        h.fillStyle = "#000";
        h.fillRect(b * bw, 0, 2, s);
        r.fillStyle = "#666";
        r.fillRect(b * bw + 2, 0, bw - 2, s);
      }
      speckle(c, s, s, r0, 600, "#1a0c04", 0.25, 2);
      blotches(r, s, s, r0, 8, "rgba(255,255,255,0.7)", 0.3, s * 0.2);
    },
    { roughness: 1, normal: 3, aniso },
  );
}

/** Dark green wallpaper with a faint stripe of damask. */
function wallpaper(size: number, aniso: number): Surface {
  return surface(
    size,
    [0.9, 0.9],
    (c, h, r, s) => {
      const r0 = rng(23);
      c.fillStyle = "#1d2a22";
      c.fillRect(0, 0, s, s);
      const stripes = 6;
      for (let k = 0; k < stripes; k++) {
        c.fillStyle = k % 2 ? "rgba(255,240,200,0.035)" : "rgba(0,0,0,0.12)";
        c.fillRect((k * s) / stripes, 0, s / stripes, s);
      }
      // Damask: small diamonds and curls, a third of the way along.
      c.strokeStyle = "rgba(190,170,110,0.13)";
      c.lineWidth = s * 0.006;
      for (let y = s / 8; y < s; y += s / 4) {
        for (let x = s / 12; x < s; x += s / 3) {
          c.beginPath();
          c.ellipse(x, y, s * 0.035, s * 0.06, 0, 0, Math.PI * 2);
          c.moveTo(x, y - s * 0.09);
          c.lineTo(x + s * 0.03, y);
          c.lineTo(x, y + s * 0.09);
          c.lineTo(x - s * 0.03, y);
          c.closePath();
          c.stroke();
        }
      }
      blotches(c, s, s, r0, 10, "rgba(0,0,0,0.6)", 0.3, s * 0.25);
      r.fillStyle = "#e8e8e8";
      r.fillRect(0, 0, s, s);
    },
    { roughness: 0.9, normal: 0, aniso },
  );
}

/**
 * r25: a hotel's carpet: deep oxblood, a small gold medallion repeated, worn
 * paler where people walk. Soft (no shine), with a faint pile.
 */
function carpet(size: number, aniso: number): Surface {
  return surface(
    size,
    [1.2, 1.2],
    (c, h, r, s) => {
      const r0 = rng(67);
      c.fillStyle = "#3e1214";
      c.fillRect(0, 0, s, s);
      // The medallions: a lozenge in a ring, four to a tile.
      for (const [x, y] of [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ]) {
        const cx = x * s;
        const cy = y * s;
        c.strokeStyle = "rgba(196,150,74,0.22)";
        c.lineWidth = s * 0.012;
        c.beginPath();
        c.arc(cx, cy, s * 0.11, 0, Math.PI * 2);
        c.stroke();
        c.fillStyle = "rgba(196,150,74,0.16)";
        c.beginPath();
        c.moveTo(cx, cy - s * 0.07);
        c.lineTo(cx + s * 0.045, cy);
        c.lineTo(cx, cy + s * 0.07);
        c.lineTo(cx - s * 0.045, cy);
        c.closePath();
        c.fill();
        c.fillStyle = "rgba(20,4,4,0.35)";
        c.fillRect(cx - s * 0.25, cy + s * 0.2, s * 0.5, s * 0.01);
      }
      speckle(c, s, s, r0, 9000, "#000", 0.25, 2);
      speckle(c, s, s, r0, 4000, "#7a3a30", 0.12, 2);
      blotches(c, s, s, r0, 10, "rgba(120,70,50,0.5)", 0.18, s * 0.25);
      // A faint pile for the light to catch.
      speckle(h, s, s, r0, 12000, "#b0b0b0", 0.5, 2);
      r.fillStyle = "#f0f0f0";
      r.fillRect(0, 0, s, s);
    },
    { roughness: 1, normal: 0.8, aniso },
  );
}

/** Pale limestone in courses, streaked by rain. */
function stone(size: number, aniso: number): Surface {
  return surface(
    size,
    [2.4, 2.4],
    (c, h, r, s) => {
      const r0 = rng(31);
      c.fillStyle = "#a59a86";
      c.fillRect(0, 0, s, s);
      const rows = 6;
      const rh = s / rows;
      for (let j = 0; j < rows; j++) {
        const off = (j % 2) * (s / 6);
        for (let x = -off; x < s; x += s / 3) {
          const v = (r0() - 0.5) * 16;
          c.fillStyle = `rgb(${165 + v},${155 + v},${135 + v})`;
          c.fillRect(x + 2, j * rh + 2, s / 3 - 4, rh - 4);
        }
        h.fillStyle = "#303030";
        h.fillRect(0, j * rh, s, 3);
        c.fillStyle = "#6e6656";
        c.fillRect(0, j * rh, s, 2);
        for (let x = -off; x < s; x += s / 3) {
          h.fillRect(x, j * rh, 3, rh);
          c.fillRect(x, j * rh, 2, rh);
        }
      }
      speckle(c, s, s, r0, 2500, "#3c3428", 0.2, 2);
      // Rain stains, soft and uneven.
      blotches(c, s, s, r0, 18, "rgba(40,36,30,0.5)", 0.35, s * 0.18);
      r.fillStyle = "#c8c8c8";
      r.fillRect(0, 0, s, s);
      blotches(r, s, s, r0, 12, "rgba(80,80,80,0.6)", 0.5, s * 0.15);
    },
    { roughness: 1, normal: 2.5, aniso },
  );
}

/** Wet asphalt: near black, with shining puddles. */
function asphalt(size: number, aniso: number): Surface {
  return surface(
    size,
    [5, 5],
    (c, h, r, s) => {
      const r0 = rng(41);
      c.fillStyle = "#17181b";
      c.fillRect(0, 0, s, s);
      speckle(c, s, s, r0, 9000, "#3a3a3e", 0.5, 2);
      speckle(c, s, s, r0, 4000, "#000", 0.6, 2);
      speckle(h, s, s, r0, 8000, "#b0b0b0", 0.5, 2);
      // Mostly glossy where it's wet, puddles glossier still.
      r.fillStyle = "#6a6a6a";
      r.fillRect(0, 0, s, s);
      blotches(r, s, s, r0, 26, "rgba(0,0,0,0.95)", 0.9, s * 0.12);
      blotches(c, s, s, r0, 20, "rgba(0,0,0,0.7)", 0.5, s * 0.1);
    },
    { roughness: 1, normal: 1.2, aniso },
  );
}

/** Big grey paving slabs, wet. */
function paving(size: number, aniso: number): Surface {
  return surface(
    size,
    [2, 2],
    (c, h, r, s) => {
      const r0 = rng(53);
      const n = 4;
      const t = s / n;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const v = (r0() - 0.5) * 14;
          c.fillStyle = `rgb(${62 + v},${62 + v},${64 + v})`;
          c.fillRect(i * t, j * t, t, t);
          r.fillStyle = `rgb(${110 + v * 3},${110 + v * 3},${110 + v * 3})`;
          r.fillRect(i * t, j * t, t, t);
        }
      }
      speckle(c, s, s, r0, 5000, "#222", 0.35, 2);
      c.strokeStyle = "#202022";
      h.strokeStyle = "#000";
      r.strokeStyle = "#fff";
      for (const g of [c, h, r]) {
        g.lineWidth = s * 0.01;
        for (let k = 0; k <= n; k++) {
          g.beginPath();
          g.moveTo(k * t, 0);
          g.lineTo(k * t, s);
          g.moveTo(0, k * t);
          g.lineTo(s, k * t);
          g.stroke();
        }
      }
      blotches(r, s, s, r0, 14, "rgba(0,0,0,0.9)", 0.8, s * 0.12);
    },
    { roughness: 1, normal: 3, aniso },
  );
}

/** Polished brass. */
function plain(color: string, roughness: number, metalness = 0): Surface {
  const [c, g] = canvas(4, 4);
  g.fillStyle = color;
  g.fillRect(0, 0, 4, 4);
  return { map: tex(c, true, 1), tile: [1, 1], roughness, metalness };
}

export type SurfaceName =
  | "tiles"
  | "oak"
  | "oak_dark"
  | "wallpaper"
  | "stone"
  | "asphalt"
  | "paving"
  | "plaster"
  | "zinc"
  // r25: the hotel's carpet.
  | "carpet";

/** One of each surface, made once per page. */
export class SurfaceBook {
  private made = new Map<string, Surface>();

  constructor(
    private readonly size: number,
    private readonly aniso: number,
  ) {}

  get(name: SurfaceName): Surface {
    let s = this.made.get(name);
    if (s) return s;
    const z = this.size;
    switch (name) {
      case "tiles":
        s = tiles(z, this.aniso);
        break;
      case "oak":
        s = oak(z, this.aniso, 0);
        break;
      case "oak_dark":
        s = oak(z, this.aniso, -22);
        break;
      case "wallpaper":
        s = wallpaper(z, this.aniso);
        break;
      case "stone":
        s = stone(z, this.aniso);
        break;
      case "asphalt":
        s = asphalt(z, this.aniso);
        break;
      case "paving":
        s = paving(z, this.aniso);
        break;
      case "zinc":
        s = plain("#4b5157", 0.45, 0.6);
        break;
      case "carpet":
        s = carpet(z, this.aniso);
        break;
      default:
        s = plain("#2a2724", 0.95);
    }
    this.made.set(name, s);
    return s;
  }

  /** A material for a surface, its textures repeated to fit `w` x `h` m. */
  material(
    name: SurfaceName,
    w: number,
    h: number,
  ): THREE.MeshStandardMaterial {
    const s = this.get(name);
    const rep = (t: THREE.Texture | undefined) => {
      if (!t) return undefined;
      const c = t.clone();
      c.repeat.set(w / s.tile[0], h / s.tile[1]);
      c.needsUpdate = true;
      return c;
    };
    const m = new THREE.MeshStandardMaterial({
      map: rep(s.map),
      roughness: s.roughness,
      metalness: s.metalness ?? 0,
    });
    if (s.normalMap) {
      m.normalMap = rep(s.normalMap)!;
      m.normalScale.set(0.8, 0.8);
    }
    if (s.roughnessMap) m.roughnessMap = rep(s.roughnessMap)!;
    return m;
  }
}

/** Text on a sign, a shop's name, a poster; drawn crisp at 2x. */
export function textTexture(opts: {
  text: string;
  sub?: string;
  w: number;
  h: number;
  bg: string;
  fg: string;
  font?: string;
  weight?: string;
  italic?: boolean;
  border?: string;
}): THREE.CanvasTexture {
  const px = 256;
  const [c, g] = canvas(
    Math.max(8, Math.round(opts.w * px)),
    Math.max(8, Math.round(opts.h * px)),
  );
  g.fillStyle = opts.bg;
  g.fillRect(0, 0, c.width, c.height);
  if (opts.border) {
    g.strokeStyle = opts.border;
    g.lineWidth = c.height * 0.06;
    g.strokeRect(
      c.height * 0.06,
      c.height * 0.06,
      c.width - c.height * 0.12,
      c.height - c.height * 0.12,
    );
  }
  g.fillStyle = opts.fg;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const family = opts.font ?? "Georgia, 'Times New Roman', serif";
  let size = c.height * (opts.sub ? 0.46 : 0.62);
  const style = `${opts.italic ? "italic " : ""}${opts.weight ?? "600"}`;
  g.font = `${style} ${size}px ${family}`;
  while (g.measureText(opts.text).width > c.width * 0.86 && size > 6) {
    size *= 0.92;
    g.font = `${style} ${size}px ${family}`;
  }
  g.fillText(opts.text, c.width / 2, c.height * (opts.sub ? 0.4 : 0.52));
  if (opts.sub) {
    g.font = `${style} ${size * 0.42}px ${family}`;
    g.fillText(opts.sub, c.width / 2, c.height * 0.76);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * An election poster coming away from the wall in wet strips: a face (an
 * anonymous silhouette), a small bronze oak leaf, and the slogan.
 */
export function posterTexture(
  slogan: string,
  seed: number,
): THREE.CanvasTexture {
  const [c, g] = canvas(256, 360);
  const r = rng(seed);
  g.clearRect(0, 0, 256, 360);
  // Paper.
  g.fillStyle = "#d9d1bf";
  g.fillRect(8, 8, 240, 344);
  const grad = g.createLinearGradient(0, 0, 0, 360);
  grad.addColorStop(0, "#1b2a48");
  grad.addColorStop(1, "#0d1424");
  g.fillStyle = grad;
  g.fillRect(14, 14, 228, 250);
  // The face: a head and shoulders in light, no features.
  g.fillStyle = "#c7b9a0";
  g.beginPath();
  g.ellipse(128, 120, 46, 58, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(40, 264);
  g.quadraticCurveTo(128, 160, 216, 264);
  g.fill();
  g.fillStyle = "#1b2a48";
  g.fillRect(118, 186, 20, 78);
  // The oak leaf, bronze, in the corner.
  g.fillStyle = "#a8743a";
  g.save();
  g.translate(212, 236);
  g.rotate(-0.5);
  g.beginPath();
  for (let k = 0; k <= 12; k++) {
    const a = (k / 12) * Math.PI;
    const rr = 14 + (k % 2) * 5;
    g.lineTo(Math.cos(a) * 6 + (k % 2 ? 6 : 3), -Math.sin(a) * rr + 2);
  }
  g.closePath();
  g.fill();
  g.restore();
  // The slogan.
  g.fillStyle = "#11182a";
  g.textAlign = "center";
  g.font = "900 40px Impact, 'Arial Black', sans-serif";
  let size = 40;
  while (g.measureText(slogan).width > 220 && size > 10) {
    size -= 2;
    g.font = `900 ${size}px Impact, 'Arial Black', sans-serif`;
  }
  g.fillText(slogan, 128, 316);
  // Torn away in long wet strips: cut transparent gaps.
  g.globalCompositeOperation = "destination-out";
  for (let k = 0; k < 5; k++) {
    const x = 10 + r() * 230;
    const top = 40 + r() * 200;
    g.beginPath();
    g.moveTo(x, top);
    g.lineTo(x + 12 + r() * 30, top + 10 + r() * 30);
    g.lineTo(x + 18 + r() * 30, 360);
    g.lineTo(x - 4, 360);
    g.closePath();
    g.fill();
  }
  g.globalCompositeOperation = "source-over";
  // Wet: dark stains.
  blotches(g, 256, 360, r, 10, "rgba(40,30,20,0.6)", 0.4, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** BFIX (r23): a poster on a Morris column, from the place's data. */
export interface MorrisPoster {
  text: string;
  /** "face": the party's poster (as on the walls); "bill": words alone. */
  style?: "face" | "bill";
  sub?: string;
  seed?: number;
  /** Paper and ink of a bill. */
  paper?: string;
  ink?: string;
}

/**
 * BFIX (r23): the band of a Morris column, all the way round (u round it,
 * v up it), pasted over and over: the posters in the order given, each
 * pasted where the last left off and a little over it, oldest first, so
 * where one is torn the one underneath shows. Old paste and grime between.
 */
export function morrisTexture(
  posters: MorrisPoster[],
  seed: number,
): THREE.CanvasTexture {
  const W = 1024;
  const H = 640;
  const [c, g] = canvas(W, H);
  const r = rng(seed * 7919 + 13);
  // The paste of years: a dun ground, scraps of old bills.
  g.fillStyle = "#8c7f69";
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = ["#a89c84", "#6f6555", "#b9ab8e", "#7a5d48"][i % 4];
    g.globalAlpha = 0.35 + r() * 0.4;
    g.fillRect(r() * W, r() * H, 40 + r() * 160, 30 + r() * 120);
  }
  g.globalAlpha = 1;
  // Posters round the band in two tiers, each the size of the ones on the
  // walls (0.8 by 1.15 m: the band is 4 m round and 2.5 m tall), pasted a
  // step round from the last and over its edge.
  const per = Math.max(1, Math.ceil(posters.length / 2));
  const step = W / per;
  posters.forEach((p, i) => {
    const tier = i % 2;
    const ph = H * 0.46 * (0.94 + r() * 0.1);
    const pw = ph * 0.7;
    const x =
      (Math.floor(i / 2) * step + tier * step * 0.5 + (r() - 0.5) * 24 + W) % W;
    const y = H * (tier === 0 ? 0.03 : 0.5) + (r() - 0.5) * 14;
    const tilt = (r() - 0.5) * 0.05;
    let art: HTMLCanvasElement;
    if (p.style === "bill") {
      const [bc, bg] = canvas(256, 360);
      bg.fillStyle = p.paper ?? "#d8cfb8";
      bg.fillRect(0, 0, 256, 360);
      bg.fillStyle = p.ink ?? "#1d1d1d";
      bg.textAlign = "center";
      const words = p.text.split(" ");
      // As few lines as fit, as large as fits.
      const lines: string[] = [];
      let size = 46;
      bg.font = `900 ${size}px Impact, 'Arial Black', sans-serif`;
      for (const w of words) {
        const last = lines[lines.length - 1];
        if (last && bg.measureText(`${last} ${w}`).width < 230)
          lines[lines.length - 1] = `${last} ${w}`;
        else lines.push(w);
      }
      while (size > 14 && lines.some((l) => bg.measureText(l).width > 236)) {
        size -= 2;
        bg.font = `900 ${size}px Impact, 'Arial Black', sans-serif`;
      }
      lines.forEach((l, k) => bg.fillText(l, 128, 70 + k * (size + 6)));
      if (p.sub) {
        bg.font = "italic 20px Georgia, serif";
        bg.fillText(p.sub, 128, 320);
      }
      // Torn at the edges, stained.
      bg.globalCompositeOperation = "destination-out";
      const rb = rng(p.seed ?? i + 1);
      for (let k = 0; k < 3; k++) {
        const tx = rb() * 256;
        bg.beginPath();
        bg.moveTo(tx, 360);
        bg.lineTo(tx + 10 + rb() * 40, 220 + rb() * 120);
        bg.lineTo(tx + 30 + rb() * 40, 360);
        bg.closePath();
        bg.fill();
      }
      bg.globalCompositeOperation = "source-over";
      blotches(bg, 256, 360, rb, 6, "rgba(60,45,30,0.5)", 0.35, 50);
      art = bc;
    } else {
      const t = posterTexture(p.text, p.seed ?? i + 1);
      art = t.image as HTMLCanvasElement;
      t.dispose();
    }
    // Pasted (and wrapped round the seam).
    for (const ox of [0, -W]) {
      g.save();
      g.translate(x + ox + pw / 2, y + ph / 2);
      g.rotate(tilt);
      g.drawImage(art, -pw / 2, -ph / 2, pw, ph);
      g.restore();
    }
  });
  // Rain and grime over everything.
  blotches(g, W, H, r, 18, "rgba(30,25,18,0.55)", 0.4, 90);
  speckle(g, W, H, r, 1600, "#1a140e", 0.3, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** A soft round glow, for lamp halos and their reflections. */
export function glowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A long soft streak, for lights reflected in the wet street. */
export function streakTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.15, "rgba(255,255,255,0.9)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = "destination-in";
  const side = g.createLinearGradient(0, 0, 64, 0);
  side.addColorStop(0, "rgba(0,0,0,0)");
  side.addColorStop(0.5, "rgba(0,0,0,1)");
  side.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = side;
  g.fillRect(0, 0, 64, 256);
  // Broken up by ripples.
  g.globalCompositeOperation = "destination-out";
  const r = rng(5);
  for (let y = 0; y < 256; y += 6) {
    g.globalAlpha = 0.2 + r() * 0.5;
    g.fillRect(0, y, 64, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Windows of a Haussmann façade by night: some lit, most dark. */
export function facadeWindows(
  cols: number,
  rows: number,
  lit: number,
  seed: number,
): THREE.CanvasTexture {
  const cw = 64;
  const ch = 96;
  const [c, g] = canvas(cols * cw, rows * ch);
  const r = rng(seed);
  g.clearRect(0, 0, c.width, c.height);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * cw + 14;
      const y = j * ch + 16;
      const on = r() < lit;
      if (on) {
        const grad = g.createLinearGradient(0, y, 0, y + 62);
        const warm = r() < 0.8;
        grad.addColorStop(0, warm ? "#ffcf86" : "#bcd4ff");
        grad.addColorStop(1, warm ? "#d88a3a" : "#5d7bb8");
        g.fillStyle = grad;
        g.fillRect(x, y, 36, 62);
        // A half-drawn curtain.
        g.fillStyle = "rgba(90,40,20,0.55)";
        g.fillRect(x, y, 10 + r() * 10, 62);
      } else {
        g.fillStyle = "rgba(0,0,0,0)";
      }
      // Mullions.
      g.fillStyle = on ? "rgba(40,25,10,0.8)" : "rgba(0,0,0,0)";
      g.fillRect(x + 17, y, 2, 62);
      g.fillRect(x, y + 28, 36, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
