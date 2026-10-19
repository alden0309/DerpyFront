// The kit Mr. Based's places are built from (r21). A place's data (sent by
// the server) lists pieces by kind: floors, walls with windows and doors,
// the bar, the back bar with its bottles and mirror, a television, lamps,
// Haussmann façades, shopfronts, posters, small things on the bar, and
// Kenney's CC0 furniture and vehicles restyled for the night. This file
// knows how to build each kind; it knows nothing of the story.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Item } from "../../engine/Place";
import { furnish, FURNISHINGS } from "./Furnish";
import { PALETTE, paletteMaterial, paletteName } from "./Palette";
import {
  facadeWindows,
  glowTexture,
  MorrisPoster,
  morrisTexture,
  posterTexture,
  streakTexture,
  SurfaceBook,
  SurfaceName,
  textTexture,
} from "./Textures";
import { lightCone, puddleMaterial, rainGlass } from "./Weather";

type V3 = [number, number, number];

/** A light a piece asks for (a lamp's bulb, a TV's glow). */
export interface PieceLight {
  light: THREE.PointLight | THREE.SpotLight;
  flicker?: "tv" | "neon" | "candle";
  base: number;
  area?: string;
  minor?: boolean;
  /**
   * r22: how much it matters when a place has more lights than the device
   * can afford (3 the most); the least go, their glow kept painted on.
   */
  prio?: number;
  /**
   * r22: one of many alike (street lamps): the world lends a few real
   * lights to whichever are nearest the camera.
   */
  pool?: boolean;
}

export interface Built {
  object: THREE.Object3D;
  lights: PieceLight[];
  /** Lamps the rain glints near. */
  lamps: THREE.Vector3[];
  /** Things to tick each frame (a TV's picture). */
  tick?: (time: number) => void;
  /** r22: edges rain drips from (an awning's front), in the piece's space. */
  drips?: [THREE.Vector3, THREE.Vector3][];
}

export interface KitContext {
  surfaces: SurfaceBook;
  models: Map<string, THREE.Object3D>;
  shadows: boolean;
  /** How many lights the device can afford. */
  lightBudget: "full" | "few";
  /** The news on the TV, read when its picture is drawn. */
  news: () => string | null;
}

const COLORS: Record<
  string,
  { color: string; roughness: number; metalness: number }
> = {
  oak: { color: "#5a3620", roughness: 0.38, metalness: 0 },
  oak_dark: { color: "#3a2214", roughness: 0.42, metalness: 0 },
  brass: { color: "#c08a3e", roughness: 0.28, metalness: 1 },
  chrome: { color: "#b8bcc2", roughness: 0.2, metalness: 1 },
  iron: { color: "#1c1e21", roughness: 0.55, metalness: 0.7 },
  leather: { color: "#4a1612", roughness: 0.55, metalness: 0 },
  leather_dark: { color: "#24130e", roughness: 0.55, metalness: 0 },
  cloth_green: { color: "#1f3a2a", roughness: 0.9, metalness: 0 },
  black: { color: "#0d0d0f", roughness: 0.6, metalness: 0 },
  white: { color: "#d8d2c4", roughness: 0.7, metalness: 0 },
  marble: { color: "#cfc8bb", roughness: 0.25, metalness: 0 },
  granite: { color: "#55565a", roughness: 0.8, metalness: 0 },
  zinc: { color: "#4c535b", roughness: 0.5, metalness: 0.6 },
  green_lamp: { color: "#0f4a2c", roughness: 0.3, metalness: 0.2 },
  navy: { color: "#16213a", roughness: 0.45, metalness: 0.3 },
};

const matCache = new Map<string, THREE.Material>();

/** A named material ("oak", "brass") or a CSS colour. */
export function mat(name: string): THREE.MeshStandardMaterial {
  let m = matCache.get(name) as THREE.MeshStandardMaterial | undefined;
  if (m) return m;
  const p = COLORS[name];
  m = new THREE.MeshStandardMaterial(
    p
      ? { color: p.color, roughness: p.roughness, metalness: p.metalness }
      : { color: name, roughness: 0.75 },
  );
  // r22: kept for every place; a place left behind doesn't dispose it.
  m.userData.shared = true;
  matCache.set(name, m);
  return m;
}

export function emissive(color: string, k = 1): THREE.MeshBasicMaterial {
  const key = `emissive:${color}:${k}`;
  let m = matCache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(k),
    });
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return m;
}

let glowTex: THREE.Texture | null = null;
let streakTex: THREE.Texture | null = null;

/** A camera-facing glow round a bulb. */
function sharedTex(t: THREE.Texture): THREE.Texture {
  t.userData.shared = true;
  return t;
}

export function halo(color: string, size: number, k = 1): THREE.Sprite {
  glowTex ??= sharedTex(glowTexture());
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: new THREE.Color(color).multiplyScalar(k),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  s.scale.setScalar(size);
  s.renderOrder = 6;
  return s;
}

/**
 * A light reflected in the wet street: a pivot on the ground under the
 * light, with a streak running from it towards the viewer (the world turns
 * the pivot to face the camera).
 */
export function streak(
  color: string,
  w: number,
  len: number,
  k = 1,
): THREE.Group {
  streakTex ??= sharedTex(streakTexture());
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, len),
    new THREE.MeshBasicMaterial({
      map: streakTex,
      color: new THREE.Color(color).multiplyScalar(k),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.z = len / 2 - 0.2;
  m.renderOrder = 3;
  const pivot = new THREE.Group();
  pivot.userData.streak = true;
  pivot.add(m);
  return pivot;
}

function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material | THREE.Material[],
  shadows = true,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

/**
 * Paris at night from a palace window: low cloud lit amber from the streets
 * underneath, the tower far off with its beacon, then zinc mansard roofs
 * with their chimney pots and a few windows still lit. `horizon` and
 * `tower` are where the rooftops and the tower's tip stand, as shares of
 * the height from the top; `towerAt` is how far across the tower stands.
 * Painted once, with a fixed seed.
 */
function skylineCanvas(
  horizon: number,
  tower: number,
  towerAt: number,
): HTMLCanvasElement {
  const W = 2048;
  const H = 736;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  let seed = 20_240_611;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const hy = horizon * H;
  // The sky: near black above, warming to the glow of the streets.
  const sky = g.createLinearGradient(0, 0, 0, hy + 30);
  sky.addColorStop(0, "#04050a");
  sky.addColorStop(0.35, "#0d101c");
  sky.addColorStop(0.62, "#4a2c20");
  sky.addColorStop(1, "#d8843f");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // Low cloud, lit from underneath: soft lobes, their bellies amber.
  for (let i = 0; i < 260; i++) {
    const x = r() * W;
    const y = hy * (0.28 + r() * 0.55);
    const rx = 60 + r() * 160;
    const ry = 14 + r() * 26;
    const lit = (y / hy - 0.28) / 0.55; // lower clouds catch more light
    const grad = g.createRadialGradient(x, y + ry * 0.5, 0, x, y, rx);
    const a = 0.07 + 0.13 * lit;
    grad.addColorStop(0, `rgba(${200 + 40 * lit},${110 + 40 * lit},60,${a})`);
    grad.addColorStop(1, "rgba(40,24,20,0)");
    g.fillStyle = grad;
    g.save();
    g.translate(x, y);
    g.scale(1, ry / rx);
    g.translate(-x, -y);
    g.beginPath();
    g.arc(x, y, rx, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // The far city: a hazy band of roofs.
  g.fillStyle = "#2b1a14";
  for (let x = 0; x < W; ) {
    const bw = 10 + r() * 26;
    const bh = 3 + r() * 8;
    g.fillRect(x, hy - 2 - bh, bw + 1, bh + 40);
    x += bw;
  }
  // The tower, far off to one side, and its beacon.
  const tx = W * towerAt;
  const top = tower * H;
  const base = hy - 4;
  const tH = base - top;
  g.fillStyle = "#1c120f";
  g.beginPath();
  g.moveTo(tx - 1, top);
  g.lineTo(tx + 1, top);
  g.quadraticCurveTo(tx + 3, top + tH * 0.6, tx + tH * 0.26, base);
  g.lineTo(tx + tH * 0.15, base);
  g.quadraticCurveTo(tx, base - tH * 0.18, tx - tH * 0.15, base);
  g.lineTo(tx - tH * 0.26, base);
  g.quadraticCurveTo(tx - 3, top + tH * 0.6, tx - 1, top);
  g.fill();
  // Its platforms catch the light.
  g.fillStyle = "rgba(230,150,80,0.55)";
  for (const f of [0.42, 0.7]) {
    const y = top + tH * f;
    const half = 1.5 + (tH * 0.26 - 1.5) * Math.pow(f, 2.2);
    g.fillRect(tx - half - 1, y, half * 2 + 2, 1);
  }
  const beacon = g.createRadialGradient(tx, top - 1, 0, tx, top - 1, 14);
  beacon.addColorStop(0, "rgba(255,236,200,0.95)");
  beacon.addColorStop(0.2, "rgba(255,200,140,0.35)");
  beacon.addColorStop(1, "rgba(255,180,120,0)");
  g.fillStyle = beacon;
  g.fillRect(tx - 16, top - 17, 32, 32);
  // A gold dome, far off.
  g.fillStyle = "#4a3418";
  g.beginPath();
  g.ellipse(W * 0.53, hy - 4, 9, 11, 0, Math.PI, 0);
  g.fill();
  g.fillRect(W * 0.53 - 1, hy - 21, 2, 7);
  // Near roofs: zinc mansards, chimney stacks with their pots, dormers.
  for (let x = -20; x < W; ) {
    const bw = 26 + r() * 40;
    const wall = hy + 5 + r() * 7;
    const roof = 4 + r() * 3;
    g.fillStyle = "#08090d";
    g.beginPath();
    g.moveTo(x, H);
    g.lineTo(x, wall);
    g.lineTo(x + 10, wall - roof);
    g.lineTo(x + bw - 10, wall - roof);
    g.lineTo(x + bw, wall);
    g.lineTo(x + bw, H);
    g.fill();
    // Chimney stacks and pots.
    const stacks = 1 + Math.floor(r() * 3);
    for (let s = 0; s < stacks; s++) {
      const sx = x + 4 + r() * (bw - 12);
      const sw = 3 + r() * 5;
      const sh = 2 + r() * 3;
      g.fillRect(sx, wall - roof - sh, sw, sh + 1);
      for (let p = 0; p < Math.floor(sw / 2); p++) {
        g.fillRect(sx + p * 2, wall - roof - sh - 2, 1, 2);
      }
    }
    // Dormer windows in the roof, a few lit.
    for (let d = x + 6; d < x + bw - 6; d += 7 + r() * 3) {
      const lit = r() < 0.22;
      g.fillStyle = lit ? (r() < 0.5 ? "#f0b060" : "#d98a48") : "#121318";
      g.fillRect(d, wall - roof * 0.7, 2, 2);
    }
    // Rows of tall windows below the roof, most dark at this hour.
    for (let row = 0; row < 14; row++) {
      for (let wx = x + 4; wx < x + bw - 4; wx += 6) {
        const lit = r() < 0.12;
        g.fillStyle = lit ? (r() < 0.6 ? "#e8a458" : "#c9d0e0") : "#0d0e13";
        g.fillRect(wx, wall + 4 + row * 9, 2, 4);
      }
    }
    x += bw + 2;
  }
  // The streets' glow, rising between the roofs.
  const haze = g.createLinearGradient(0, hy - 40, 0, H);
  haze.addColorStop(0, "rgba(200,110,50,0)");
  haze.addColorStop(0.5, "rgba(200,110,50,0.10)");
  haze.addColorStop(1, "rgba(200,110,50,0.22)");
  g.fillStyle = haze;
  g.fillRect(0, hy - 40, W, H - hy + 40);
  return c;
}

function num(v: unknown, d: number): number {
  return typeof v === "number" ? v : d;
}
function str(v: unknown, d: string): string {
  return typeof v === "string" ? v : d;
}
function vec(v: unknown, d: V3): V3 {
  return Array.isArray(v) && v.length === 3 ? (v as V3) : d;
}

function pointLight(
  color: string,
  intensity: number,
  distance: number,
  shadow: boolean,
): THREE.PointLight {
  const l = new THREE.PointLight(color, intensity, distance, 2);
  l.castShadow = shadow;
  if (shadow) {
    l.shadow.mapSize.set(512, 512);
    l.shadow.bias = -0.002;
    l.shadow.radius = 4;
  }
  return l;
}

function lightOf(
  item: Item,
  defaults: { color: string; intensity: number; distance: number },
): {
  color: string;
  intensity: number;
  distance: number;
  shadow: boolean;
} {
  const l = (item.light ?? {}) as Record<string, unknown>;
  return {
    color: str(l.color, defaults.color),
    intensity: num(l.intensity, defaults.intensity),
    distance: num(l.distance, defaults.distance),
    shadow: l.shadow === true,
  };
}

// --- the pieces ------------------------------------------------------------

function floor(item: Item, k: KitContext): Built {
  const [w, d] = (item.size as [number, number]) ?? [10, 10];
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    k.surfaces.material(str(item.surface, "plaster") as SurfaceName, w, d),
  );
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  // r22: darker and glossier when the street is wet.
  (m.material as THREE.Material).userData.wettable = true;
  return { object: m, lights: [], lamps: [] };
}

function solid(item: Item, k: KitContext): Built {
  const [w, h, d] = vec(item.size, [1, 1, 1]);
  const material = item.surface
    ? k.surfaces.material(item.surface as SurfaceName, Math.max(w, d), h)
    : mat(str(item.mat, "#333"));
  if (item.surface) material.userData.wettable = true;
  const m = box(w, h, d, material, item.shadow !== false);
  m.position.y = h / 2;
  return { object: m, lights: [], lamps: [] };
}

/**
 * A wall from one point to another, with windows and doors cut into it,
 * oak panelling to dado height inside, and a different face outside.
 */
function wall(item: Item, k: KitContext): Built {
  const from = item.from as [number, number];
  const to = item.to as [number, number];
  const h = num(item.h, 3.4);
  const t = num(item.t, 0.22);
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const g = new THREE.Group();
  const inner = k.surfaces.material(
    str(item.surface, "wallpaper") as SurfaceName,
    len,
    h,
  );
  const outer = item.outer
    ? k.surfaces.material(item.outer as SurfaceName, len, h)
    : inner;
  const dado = item.dado as { h: number; surface: string } | undefined;
  const dadoMat = dado
    ? k.surfaces.material(dado.surface as SurfaceName, len, dado.h)
    : null;
  // Materials per face: +x, -x, +y, -y, +z (inside), -z (outside).
  const faces = (m: THREE.Material, o: THREE.Material) => [m, m, m, m, m, o];
  const holes = ((item.holes as Record<string, unknown>[]) ?? [])
    .map((x) => ({
      at: num(x.at, 0),
      w: num(x.w, 1),
      h: num(x.h, 2),
      y: num(x.y, 0),
      kind: str(x.kind, "window"),
      glow: str(x.glow, "#ffb468"),
      strength: num(x.strength, 0.5),
      opacity: num(x.opacity, 0.82),
      leaf: x.leaf !== false,
      // A café's half curtain on a brass rail (not in a palace).
      cafe: x.cafe !== false,
    }))
    .sort((a, b) => a.at - b.at);

  const piece = (x0: number, x1: number, y0: number, y1: number) => {
    if (x1 - x0 < 0.001 || y1 - y0 < 0.001) return;
    const yd = dado ? Math.min(Math.max(dado.h, y0), y1) : y0;
    // Below the dado: panelling inside; above: the wall's own face.
    if (dadoMat && yd > y0) {
      const b = box(x1 - x0, yd - y0, t, faces(dadoMat, outer));
      b.position.set((x0 + x1) / 2, (y0 + yd) / 2, 0);
      g.add(b);
    }
    if (y1 > yd) {
      const b = box(x1 - x0, y1 - yd, t, faces(inner, outer));
      b.position.set((x0 + x1) / 2, (yd + y1) / 2, 0);
      g.add(b);
    }
  };

  let x = 0;
  for (const hole of holes) {
    const x0 = hole.at - hole.w / 2;
    const x1 = hole.at + hole.w / 2;
    piece(x, x0, 0, h);
    piece(x0, x1, 0, hole.y);
    piece(x0, x1, hole.y + hole.h, h);
    x = x1;
    // The frame.
    const frame = mat("oak_dark");
    const fw = 0.07;
    for (const [px, py, sw, sh] of [
      [x0 + fw / 2, hole.y + hole.h / 2, fw, hole.h],
      [x1 - fw / 2, hole.y + hole.h / 2, fw, hole.h],
      [hole.at, hole.y + hole.h - fw / 2, hole.w, fw],
      ...(hole.kind === "window"
        ? [[hole.at, hole.y + fw / 2, hole.w, fw]]
        : []),
    ] as [number, number, number, number][]) {
      const b = box(sw, sh, t + 0.04, frame);
      b.position.set(px, py, 0);
      g.add(b);
    }
    if (hole.kind === "window") {
      // Glazing bars and rain on the glass.
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(hole.w - fw * 2, hole.h - fw * 2),
        rainGlass({
          glow: hole.glow,
          strength: hole.strength,
          opacity: hole.opacity,
        }),
      );
      pane.position.set(hole.at, hole.y + hole.h / 2, 0);
      pane.renderOrder = 2;
      g.add(pane);
      const bar = box(0.03, hole.h - fw * 2, 0.05, frame, false);
      bar.position.set(hole.at, hole.y + hole.h / 2, 0);
      g.add(bar);
      if (!hole.cafe) continue;
      // A brass rail for a café curtain, and the curtain itself.
      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, hole.w - fw * 2, 6),
        mat("brass"),
      );
      rail.rotation.z = Math.PI / 2;
      rail.position.set(hole.at, hole.y + hole.h * 0.5, t / 2 + 0.03);
      g.add(rail);
      const curtain = box(
        hole.w - fw * 2,
        hole.h * 0.42,
        0.01,
        mat("#3c1d17"),
        false,
      );
      curtain.position.set(hole.at, hole.y + hole.h * 0.29, t / 2 + 0.03);
      g.add(curtain);
    } else if (hole.leaf) {
      // A door: dark wood below, glass above, a brass push plate.
      const leaf = new THREE.Group();
      const lw = hole.w - fw * 2;
      const lower = box(lw, hole.h * 0.4, 0.05, mat("oak_dark"));
      lower.position.y = hole.h * 0.2;
      leaf.add(lower);
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(lw - 0.1, hole.h * 0.5),
        rainGlass({ glow: hole.glow, strength: hole.strength, opacity: 0.7 }),
      );
      glass.position.y = hole.h * 0.66;
      leaf.add(glass);
      const top = box(lw, hole.h * 0.1, 0.05, mat("oak_dark"));
      top.position.y = hole.h * 0.95;
      leaf.add(top);
      const plate = box(0.08, 0.3, 0.06, mat("brass"), false);
      plate.position.set(lw * 0.35, hole.h * 0.5, 0);
      leaf.add(plate);
      leaf.position.set(hole.at, hole.y, 0);
      g.add(leaf);
    }
  }
  piece(x, len, 0, h);

  // Lay the wall along from -> to: local x along it, local +z inside.
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  g.position.set(from[0], 0, from[1]);
  g.rotation.y = -angle;
  const flip = item.flip === true;
  if (flip) g.scale.z = -1;
  const outerGroup = new THREE.Group();
  outerGroup.add(g);
  return { object: outerGroup, lights: [], lamps: [] };
}

/** The oak bar: panelled front, brass to the knee, a foot rail, a thick top. */
function bar(item: Item): Built {
  const len = num(item.len, 8);
  const d = num(item.depth, 0.7);
  const h = num(item.h, 1.08);
  const g = new THREE.Group();
  const body = box(len, h - 0.06, d, mat("oak"));
  body.position.y = (h - 0.06) / 2;
  g.add(body);
  // The front's panels, a shade darker, raised.
  const panels = Math.max(1, Math.round(len / 0.9));
  for (let i = 0; i < panels; i++) {
    const p = box(len / panels - 0.12, h * 0.38, 0.03, mat("oak_dark"));
    p.position.set(
      -len / 2 + (i + 0.5) * (len / panels),
      h * 0.62,
      d / 2 + 0.01,
    );
    g.add(p);
  }
  // Brass to the knee.
  const kick = box(len, 0.42, 0.02, mat("brass"));
  kick.position.set(0, 0.21, d / 2 + 0.012);
  g.add(kick);
  // The top, overhanging, with a rounded edge.
  const top = box(len + 0.08, 0.06, d + 0.16, mat("oak_dark"));
  top.position.set(0, h - 0.03, 0.04);
  g.add(top);
  const edge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, len + 0.08, 10),
    mat("oak_dark"),
  );
  edge.rotation.z = Math.PI / 2;
  edge.position.set(0, h - 0.03, d / 2 + 0.12);
  g.add(edge);
  // The foot rail on its brackets.
  const rail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, len, 10),
    mat("brass"),
  );
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, 0.2, d / 2 + 0.2);
  rail.castShadow = true;
  g.add(rail);
  for (let x = -len / 2 + 0.3; x <= len / 2 - 0.3; x += 1.4) {
    const b = box(0.04, 0.04, 0.2, mat("brass"));
    b.position.set(x, 0.2, d / 2 + 0.1);
    g.add(b);
  }
  return { object: g, lights: [], lamps: [] };
}

let bottleGeo: THREE.BufferGeometry | null = null;
function bottleGeometry(): THREE.BufferGeometry {
  if (bottleGeo) return bottleGeo;
  const pts = [
    [0, 0],
    [0.038, 0],
    [0.04, 0.02],
    [0.04, 0.2],
    [0.03, 0.24],
    [0.014, 0.27],
    [0.013, 0.32],
    [0.016, 0.33],
    [0, 0.33],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  bottleGeo = new THREE.LatheGeometry(pts, 10);
  bottleGeo.userData.shared = true;
  return bottleGeo;
}

/**
 * The back bar: a cabinet, a counter, glass shelves of bottles lit from
 * below, and the mirror behind them (its own piece, so it can be a hotspot).
 */
function backbar(item: Item, k: KitContext): Built {
  const len = num(item.len, 8);
  const h = num(item.h, 3);
  const g = new THREE.Group();
  const cab = box(len, 0.95, 0.5, mat("oak"));
  cab.position.set(0, 0.475, 0.25);
  g.add(cab);
  const top = box(len + 0.04, 0.05, 0.56, mat("marble"));
  top.position.set(0, 0.975, 0.26);
  g.add(top);
  // Pilasters and a cornice framing the mirror.
  for (
    let x = -len / 2;
    x <= len / 2 + 0.01;
    x += len / Math.max(1, Math.round(len / 2.2))
  ) {
    const p = box(0.14, h - 1, 0.14, mat("oak"));
    p.position.set(x, 1 + (h - 1) / 2, 0.08);
    g.add(p);
  }
  const cornice = box(len + 0.3, 0.18, 0.3, mat("oak_dark"));
  cornice.position.set(0, h, 0.15);
  g.add(cornice);
  // Shelves of bottles.
  const shelves = [1.25, 1.62, 1.99];
  const palette = [
    "#7a3b0c",
    "#a8580e",
    "#2e4a1c",
    "#cfc9b8",
    "#5c0f12",
    "#8a6a1a",
    "#3a2a1a",
  ];
  const count = Math.floor((len - 0.4) / 0.11);
  const inst = new THREE.InstancedMesh(
    bottleGeometry(),
    new THREE.MeshStandardMaterial({
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.9,
      emissive: new THREE.Color("#3a1d06"),
      emissiveIntensity: 0.6,
    }),
    count * shelves.length,
  );
  const m4 = new THREE.Matrix4();
  const c = new THREE.Color();
  let n = 0;
  let seed = 3;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const y of shelves) {
    const shelf = box(len - 0.3, 0.02, 0.3, mat("#9fb3b8"), false);
    shelf.position.set(0, y - 0.01, 0.24);
    (shelf.material as THREE.MeshStandardMaterial).transparent = true;
    g.add(shelf);
    for (let i = 0; i < count; i++) {
      if (rand() < 0.12) continue;
      const s = 0.8 + rand() * 0.5;
      m4.makeScale(1, s, 1);
      m4.setPosition(
        -len / 2 + 0.25 + i * 0.11 + (rand() - 0.5) * 0.03,
        y,
        0.2 + rand() * 0.1,
      );
      inst.setMatrixAt(n, m4);
      inst.setColorAt(n, c.set(palette[Math.floor(rand() * palette.length)]));
      n++;
    }
  }
  inst.count = n;
  inst.castShadow = false;
  g.add(inst);
  // A warm strip of light along the counter, under the shelves.
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(len - 0.4, 0.04),
    emissive("#ffb060", 1.4),
  );
  strip.position.set(0, 1.12, 0.38);
  strip.rotation.x = -Math.PI / 3;
  g.add(strip);
  const lights: PieceLight[] = [];
  const glow = lightOf(item, { color: "#ffa04a", intensity: 3.2, distance: 6 });
  for (const x of k.lightBudget === "full" ? [-len / 3, len / 3] : [0]) {
    const l = pointLight(glow.color, glow.intensity, glow.distance, false);
    l.position.set(x, 1.3, 0.6);
    g.add(l);
    lights.push({ light: l, base: glow.intensity, minor: true, prio: 0 });
  }
  return { object: g, lights, lamps: [] };
}

/** A mirror: dark, gold-tinted glass that catches the room's lights. */
function mirror(item: Item): Built {
  const [w, h] = (item.size as [number, number]) ?? [4, 1.2];
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      color: "#8a7350",
      metalness: 1,
      roughness: 0.12,
      envMapIntensity: 1.6,
    }),
  );
  m.position.y = h / 2;
  return { object: m, lights: [], lamps: [] };
}

/** A television on the wall; its picture is the news while there is some. */
function tv(item: Item, k: KitContext): Built {
  const [w, h] = (item.size as [number, number]) ?? [0.9, 0.55];
  const g = new THREE.Group();
  const bezel = box(w + 0.05, h + 0.05, 0.06, mat("black"));
  g.add(bezel);
  const [cv, cg] = (() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 300;
    return [c, c.getContext("2d")!] as const;
  })();
  const texture = new THREE.CanvasTexture(cv);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshBasicMaterial({
    map: texture,
    toneMapped: false,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMat);
  screen.position.z = 0.032;
  g.add(screen);
  const glow = lightOf(item, { color: "#7fa6ff", intensity: 1.6, distance: 5 });
  const l = pointLight(glow.color, glow.intensity, glow.distance, false);
  l.position.set(0, -0.2, 0.8);
  g.add(l);
  const pl: PieceLight = {
    light: l,
    base: glow.intensity,
    flicker: "tv",
    prio: 3,
  };
  let last = "";
  const draw = (time: number) => {
    const news = k.news();
    // r22: twelve pictures a second is plenty for a crawl seen across a
    // bar, and each one is a texture sent to the graphics card.
    const key = news === null ? "off" : `${news}:${Math.floor(time * 12)}`;
    if (key === last) return;
    last = key;
    if (news === null) {
      cg.fillStyle = "#050607";
      cg.fillRect(0, 0, 512, 300);
      const grad = cg.createLinearGradient(0, 0, 512, 300);
      grad.addColorStop(0, "rgba(255,255,255,0.08)");
      grad.addColorStop(0.5, "rgba(255,255,255,0)");
      cg.fillStyle = grad;
      cg.fillRect(0, 0, 512, 300);
      pl.base = 0;
    } else {
      // A man at a lectern before a flag, applauded; the crawl beneath.
      const bg = cg.createLinearGradient(0, 0, 0, 300);
      bg.addColorStop(0, "#1c2c55");
      bg.addColorStop(1, "#0b1226");
      cg.fillStyle = bg;
      cg.fillRect(0, 0, 512, 300);
      const stripes = ["#1d3f8f", "#e8e4e0", "#b3202b"];
      stripes.forEach((s, i) => {
        cg.fillStyle = s;
        cg.globalAlpha = 0.8;
        cg.fillRect(330 + i * 34, 30, 34, 160);
      });
      cg.globalAlpha = 1;
      const bob = Math.sin(time * 2.1) * 2;
      cg.fillStyle = "#0a0b10";
      cg.beginPath();
      cg.ellipse(230, 92 + bob, 30, 38, 0, 0, Math.PI * 2);
      cg.fill();
      cg.beginPath();
      cg.moveTo(150, 240);
      cg.quadraticCurveTo(230, 120, 310, 240);
      cg.fill();
      cg.fillStyle = "#3a2a1c";
      cg.fillRect(180, 180, 100, 70);
      cg.fillStyle = "#c8a24a";
      cg.fillRect(220, 200, 20, 20);
      cg.fillStyle = "#b3202b";
      cg.fillRect(0, 252, 512, 48);
      cg.fillStyle = "#fff";
      cg.font = "600 26px Arial, sans-serif";
      const width = cg.measureText(news).width + 80;
      const x = 512 - ((time * 70) % (width + 512));
      cg.fillText(news, x, 285);
      cg.fillStyle = "#fff";
      cg.fillRect(0, 252, 70, 48);
      cg.fillStyle = "#b3202b";
      cg.font = "800 18px Arial, sans-serif";
      cg.fillText("DIRECT", 6, 282);
      pl.base = glow.intensity;
    }
    texture.needsUpdate = true;
  };
  draw(0);
  return { object: g, lights: [pl], lamps: [], tick: draw };
}

/** A pendant lamp over the bar: cord, brass shade, bulb, a pool of light. */
function pendant(item: Item, k: KitContext): Built {
  const cord = num(item.cord, 1.2);
  const g = new THREE.Group();
  const c = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, cord, 4),
    mat("black"),
  );
  c.position.y = cord / 2;
  g.add(c);
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.2, 16, 1, true),
    mat(str(item.shade, "brass")),
  );
  (shade.material as THREE.Material).side = THREE.DoubleSide;
  g.add(shade);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 8),
    emissive("#ffd9a0", 3),
  );
  bulb.position.y = -0.07;
  g.add(bulb);
  const hl = halo("#ffb873", 0.9, 0.5);
  hl.position.y = -0.08;
  g.add(hl);
  const l = lightOf(item, { color: "#ffb469", intensity: 9, distance: 7 });
  const s = new THREE.SpotLight(
    l.color,
    l.intensity,
    l.distance,
    Math.PI / 2.6,
    0.9,
    1.6,
  );
  s.position.set(0, -0.1, 0);
  s.target.position.set(0, -3, 0);
  g.add(s, s.target);
  s.castShadow = l.shadow && k.shadows;
  if (s.castShadow) {
    s.shadow.mapSize.set(1024, 1024);
    s.shadow.bias = -0.0015;
    s.shadow.radius = 5;
    s.shadow.camera.near = 0.2;
    s.shadow.camera.far = 8;
  }
  return {
    object: g,
    lights: [{ light: s, base: l.intensity, prio: 3 }],
    lamps: [],
  };
}

/** A wall light (or a lamp on a table): a small shade and a warm glow. */
function lamp(item: Item, k: KitContext): Built {
  const g = new THREE.Group();
  const kind = str(item.style, "sconce");
  const color = str(item.shade, kind === "banker" ? "green_lamp" : "#c9a36a");
  if (kind === "banker") {
    const base = box(0.14, 0.03, 0.1, mat("brass"));
    base.position.y = 0.015;
    g.add(base);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.3, 6),
      mat("brass"),
    );
    stem.position.y = 0.17;
    g.add(stem);
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.1, 0.09, 12, 1, true, 0, Math.PI),
      mat(color),
    );
    (shade.material as THREE.Material).side = THREE.DoubleSide;
    shade.rotation.z = Math.PI / 2;
    shade.position.y = 0.33;
    g.add(shade);
  } else {
    const plate = box(0.1, 0.16, 0.03, mat("brass"));
    g.add(plate);
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.1, 0.16, 12, 1, true),
      mat(color),
    );
    (shade.material as THREE.Material).side = THREE.DoubleSide;
    (shade.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(
      "#5a3712",
    );
    shade.position.set(0, 0.06, 0.12);
    g.add(shade);
  }
  const bulbY = kind === "banker" ? 0.3 : 0.06;
  const hl = halo("#ffc27e", kind === "banker" ? 0.6 : 0.8, 0.55);
  hl.position.set(0, bulbY, kind === "banker" ? 0 : 0.12);
  g.add(hl);
  const l = lightOf(item, { color: "#ffb36a", intensity: 2.2, distance: 4.5 });
  const pl = pointLight(
    l.color,
    l.intensity,
    l.distance,
    l.shadow && k.shadows,
  );
  pl.position.set(0, bulbY - 0.05, kind === "banker" ? 0 : 0.25);
  g.add(pl);
  return {
    object: g,
    lights: [
      {
        light: pl,
        base: l.intensity,
        flicker: item.flicker as PieceLight["flicker"],
        minor: item.minor === true,
        prio: item.minor === true ? 0 : kind === "banker" ? 1 : 2,
      },
    ],
    lamps: [],
  };
}

/**
 * A Paris street lamp: a green-black post, a lantern, a pool of sodium.
 * BFIX (r23): the post and lantern are the Fusion model (its panes and bulb
 * lit), the light, the halo, the cone in the rain and the reflection hung
 * at its lantern; without the model, the old procedural post at `h`.
 */
function lamppost(item: Item, k: KitContext): Built {
  let h = num(item.h, 4.2);
  const g = new THREE.Group();
  const src = k.models.get("lamppost");
  if (src) {
    const o = styled(src, item);
    g.add(o);
    // The lantern: where its lit panes are.
    o.updateMatrixWorld(true);
    const lantern = new THREE.Box3();
    o.traverse((x) => {
      const m = x as THREE.Mesh;
      const name = (m.material as THREE.Material | undefined)?.name;
      if (m.isMesh && (name === "glass_lamp" || name === "lamp_bulb")) {
        lantern.expandByObject(m);
      }
    });
    if (!lantern.isEmpty()) h = lantern.getCenter(new THREE.Vector3()).y;
  } else {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.09, h, 10),
      mat("#16201b"),
    );
    post.position.y = h / 2;
    post.castShadow = true;
    g.add(post);
    const foot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.17, 0.5, 10),
      mat("#16201b"),
    );
    foot.position.y = 0.25;
    g.add(foot);
    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.1, 0.4, 6),
      emissive("#ffcf8a", 2.4),
    );
    lantern.position.y = h + 0.12;
    g.add(lantern);
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.2, 6),
      mat("#16201b"),
    );
    cap.position.y = h + 0.42;
    g.add(cap);
    h += 0.1;
  }
  const hl = halo("#ffb35c", 2.6, 0.9);
  hl.position.y = h;
  g.add(hl);
  // A cone of light in the rain.
  const cone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 2.1, h, 20, 1, true),
    lightCone("#ffb35c", 0.9),
  );
  cone.position.y = h / 2;
  cone.renderOrder = 5;
  g.add(cone);
  const l = lightOf(item, { color: "#ffac57", intensity: 26, distance: 12 });
  const pl = pointLight(
    l.color,
    l.intensity,
    l.distance,
    l.shadow && k.shadows,
  );
  pl.position.y = h - 0.2;
  g.add(pl);
  const reflect = streak("#ffb35c", 0.9, 3.2, 0.55);
  reflect.position.set(0, 0.02, 0);
  g.add(reflect);
  return {
    object: g,
    lights: [{ light: pl, base: l.intensity, pool: true }],
    lamps: [new THREE.Vector3(0, h, 0)],
  };
}

/**
 * A Haussmann façade by night: limestone, rows of tall windows (some lit),
 * iron balconies, a zinc mansard roof. Faces local +z.
 */
function facade(item: Item, k: KitContext): Built {
  const w = num(item.w, 12);
  const floors = num(item.floors, 4);
  const fh = num(item.floorH, 3.1);
  const base = num(item.base, 4);
  const d = num(item.depth, 0.6);
  const g = new THREE.Group();
  const height = floors * fh;
  const stone = k.surfaces.material("stone", w, height);
  stone.userData.wettable = true;
  const front = box(w, height, d, stone);
  front.position.set(0, base + height / 2, -d / 2);
  g.add(front);
  // Windows.
  const cols = Math.max(1, Math.round(w / 2.2));
  const winTex = facadeWindows(
    cols,
    floors,
    num(item.lit, 0.25),
    num(item.seed, 3),
  );
  const dark = new THREE.Mesh(
    new THREE.PlaneGeometry(w, height),
    new THREE.MeshStandardMaterial({
      map: winTex,
      transparent: true,
      roughness: 0.2,
      metalness: 0.3,
      emissive: new THREE.Color("#ffffff"),
      emissiveMap: winTex,
      emissiveIntensity: 1.1,
    }),
  );
  // r22: in front of the dark glass behind it (whose face is at 0.012), not
  // level with it. Level, the two fought for every pixel as the camera
  // moved, and the lit windows flashed on and off.
  dark.position.set(0, base + height / 2, 0.03);
  g.add(dark);
  // Dark glass behind every window, lit or not, matching the texture's.
  const cellW = w / cols;
  for (let j = 0; j < floors; j++) {
    for (let i = 0; i < cols; i++) {
      const pane = box(
        cellW * (36 / 64),
        fh * (62 / 96),
        0.02,
        mat("#0c0f14"),
        false,
      );
      pane.position.set(
        -w / 2 + (i + 0.5) * cellW,
        base + j * fh + fh * (1 - 47 / 96),
        0.002,
      );
      g.add(pane);
    }
    // A balcony rail on the second and fifth floors, a sill on the others.
    const balcony = j === 0 || j === 3;
    const rail = box(
      balcony ? w : w * 0.98,
      balcony ? 0.5 : 0.08,
      balcony ? 0.35 : 0.14,
      mat("iron"),
    );
    rail.position.set(
      0,
      base + j * fh + (balcony ? 0.25 : 0.04),
      balcony ? 0.18 : 0.07,
    );
    g.add(rail);
    const cornice = box(
      w + 0.1,
      0.12,
      0.18,
      k.surfaces.material("stone", w, 0.12),
    );
    cornice.position.set(0, base + j * fh, 0.05);
    g.add(cornice);
  }
  // The mansard.
  const roof = box(w, 2.2, 1.4, mat("zinc"));
  roof.position.set(0, base + height + 1.0, -0.9);
  roof.rotation.x = -0.35;
  g.add(roof);
  for (let x = -w / 2 + 1.5; x < w / 2; x += 4.5) {
    const ch = box(0.6, 1.4, 0.5, mat("#6b5a4a"));
    ch.position.set(x, base + height + 2.1, -1.4);
    g.add(ch);
  }
  return { object: g, lights: [], lamps: [] };
}

/** A shop's ground floor: its name, a lit window, an awning, maybe a cross. */
function shopfront(item: Item, k: KitContext): Built {
  const w = num(item.w, 6);
  const h = num(item.h, 3.6);
  const g = new THREE.Group();
  const sign = item.sign as Record<string, unknown> | undefined;
  if (sign) {
    const tex = textTexture({
      text: str(sign.text, ""),
      w: w * 0.8,
      h: 0.5,
      bg: str(sign.bg, "#0e2a1d"),
      fg: str(sign.fg, "#e8dcb8"),
      font: str(sign.font, "Georgia, serif"),
    });
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.8, 0.5),
      new THREE.MeshStandardMaterial({
        map: tex,
        emissive: new THREE.Color("#ffffff"),
        emissiveMap: tex,
        emissiveIntensity: num(sign.glow, 0.5),
      }),
    );
    m.position.set(0, h - 0.4, 0.06);
    g.add(m);
  }
  const glowColor = str(item.glow, "#ffcf8a");
  const glass = rainGlass({
    glow: glowColor,
    strength: num(item.strength, 0.55),
  });
  // Seen only from the street it faces (from behind it would be a slab).
  glass.side = THREE.FrontSide;
  const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.55), glass);
  win.position.set(0, h * 0.42, 0.04);
  g.add(win);
  const lights: PieceLight[] = [];
  const drips: [THREE.Vector3, THREE.Vector3][] = [];
  if (item.awning) {
    const a = item.awning as Record<string, unknown>;
    const aw = box(w, 0.04, num(a.depth, 1.6), mat(str(a.color, "#1e3b2a")));
    aw.position.set(0, h - 0.95, num(a.depth, 1.6) / 2);
    aw.rotation.x = 0.28;
    g.add(aw);
    const valance = box(w, 0.25, 0.02, mat(str(a.color, "#1e3b2a")));
    valance.position.set(0, h - 1.27, num(a.depth, 1.6) - 0.02);
    g.add(valance);
    // r22: the rain runs off its front edge.
    const y = h - 1.4;
    const z = num(a.depth, 1.6) - 0.02;
    drips.push([
      new THREE.Vector3(-w / 2 + 0.1, y, z),
      new THREE.Vector3(w / 2 - 0.1, y, z),
    ]);
  }
  if (item.cross) {
    // A pharmacy's green cross on a bracket, standing out from the wall.
    const cross = new THREE.Group();
    const green = emissive("#22e07a", 1.6);
    const a = box(0.12, 0.5, 0.5, green, false);
    const b = box(0.12, 0.17, 0.5, green, false);
    const c = box(0.12, 0.5, 0.17, green, false);
    void a;
    cross.add(b, c);
    cross.position.set(w / 2 - 0.4, h + 0.2, 0.7);
    // Seen only from the street it faces: from behind there's no building
    // drawn for it to hang from, and it would float (the world hides it).
    const front = new THREE.Group();
    front.userData.frontOnly = true;
    front.add(cross);
    g.add(front);
    const hl = halo("#2bff8a", 2.2, 0.5);
    hl.position.copy(cross.position);
    front.add(hl);
    const pl = pointLight("#38ff92", 4, 7, false);
    pl.position.set(w / 2 - 0.4, h, 1.2);
    g.add(pl);
    lights.push({ light: pl, base: 4, flicker: "neon", prio: 2 });
    const s = streak("#2bff8a", 0.6, 2.2, 0.5);
    s.position.set(w / 2 - 0.4, 0.02, 0.7);
    front.add(s);
  }
  const l = lightOf(item, { color: glowColor, intensity: 3, distance: 6 });
  const pl = pointLight(l.color, l.intensity, l.distance, false);
  pl.position.set(0, 1.2, 1.2);
  g.add(pl);
  lights.push({ light: pl, base: l.intensity, minor: true, prio: 0 });
  return { object: g, lights, lamps: [], drips };
}

/** Words on a board or a wall: a hotel's name, a café's. */
function sign(item: Item): Built {
  const [w, h] = (item.size as [number, number]) ?? [2, 0.5];
  const tex = textTexture({
    text: str(item.text, ""),
    sub: typeof item.sub === "string" ? item.sub : undefined,
    w,
    h,
    bg: str(item.bg, "#1a1210"),
    fg: str(item.fg, "#e8c98a"),
    font: str(item.font, "Georgia, serif"),
    italic: item.italic === true,
    border: typeof item.border === "string" ? item.border : undefined,
  });
  const glow = num(item.glow, 0);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.5,
      emissive: new THREE.Color("#ffffff"),
      emissiveMap: tex,
      emissiveIntensity: glow,
      transparent: item.bg === "transparent",
    }),
  );
  return { object: m, lights: [], lamps: [] };
}

function poster(item: Item): Built {
  const [w, h] = (item.size as [number, number]) ?? [0.8, 1.15];
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: posterTexture(str(item.text, ""), num(item.seed, 1)),
      transparent: true,
      roughness: 0.6,
      alphaTest: 0.1,
    }),
  );
  m.position.y = h / 2;
  return { object: m, lights: [], lamps: [] };
}

/** Small things on the bar and the tables. */
function small(item: Item): Built {
  const g = new THREE.Group();
  const kind = item.kind;
  const glassMat = new THREE.MeshStandardMaterial({
    color: "#cfe0e8",
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.35,
  });
  const liquid = (color: string, op = 0.85) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.1,
      transparent: true,
      opacity: op,
      emissive: new THREE.Color(color).multiplyScalar(0.12),
    });
  switch (kind) {
    case "tumbler": {
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.038, 0.034, 0.09, 14, 1, true),
        glassMat,
      );
      glass.position.y = 0.045;
      const whisky = new THREE.Mesh(
        new THREE.CylinderGeometry(0.034, 0.032, 0.03, 14),
        liquid("#d08a1c"),
      );
      whisky.position.y = 0.017;
      g.add(glass, whisky);
      break;
    }
    case "highball": {
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.032, 0.15, 14, 1, true),
        glassMat,
      );
      glass.position.y = 0.075;
      const gin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.031, 0.03, 0.11, 14),
        liquid("#e8f4f0", 0.45),
      );
      gin.position.y = 0.057;
      const lime = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.006, 10),
        mat("#7fae3a"),
      );
      lime.position.y = 0.1;
      lime.rotation.x = 1.2;
      g.add(glass, gin, lime);
      break;
    }
    case "water": {
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.032, 0.13, 14, 1, true),
        glassMat,
      );
      glass.position.y = 0.065;
      const water = new THREE.Mesh(
        new THREE.CylinderGeometry(0.031, 0.03, 0.1, 14),
        liquid("#dfeef5", 0.3),
      );
      water.position.y = 0.052;
      g.add(glass, water);
      break;
    }
    case "card":
    case "note":
    case "photo":
    case "coaster":
    case "newspaper": {
      const size: Record<string, [number, number, string]> = {
        card: [0.085, 0.055, "#f2efe6"],
        note: [0.14, 0.075, "#a8b8a0"],
        photo: [0.09, 0.13, "#e8e4da"],
        coaster: [0.09, 0.09, "#d8cfbf"],
        newspaper: [0.32, 0.22, "#cfc8b8"],
      };
      const [w, d, c0] = size[kind];
      const c = str(item.color, c0);
      const p =
        kind === "coaster"
          ? new THREE.Mesh(
              new THREE.CylinderGeometry(w / 2, w / 2, 0.004, 16),
              mat(c),
            )
          : box(w, 0.003, d, mat(c), false);
      p.position.y = kind === "coaster" ? 0.1 : 0.002;
      if (kind === "coaster") {
        // A coaster laid over the first glass.
        p.position.y = 0.093;
      }
      g.add(p);
      break;
    }
    case "umbrella": {
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.012, 0.85, 8),
        mat("#0c0c0e"),
      );
      shaft.position.y = 0.45;
      const hook = new THREE.Mesh(
        new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI),
        mat("#2a1a10"),
      );
      hook.position.y = 0.88;
      g.add(shaft, hook);
      break;
    }
    case "till": {
      const b = box(0.4, 0.25, 0.35, mat("brass"));
      b.position.y = 0.125;
      const top = box(0.36, 0.12, 0.2, mat("#2a2622"));
      top.position.set(0, 0.3, -0.05);
      g.add(b, top);
      break;
    }
    case "ashtray": {
      const a = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.05, 0.025, 12),
        mat("#2a2c30"),
      );
      a.position.y = 0.012;
      g.add(a);
      break;
    }
    case "footprints": {
      // Wet prints from one point to another, drying as they go: one mesh
      // (r22), each print fainter by its alpha.
      const from = item.from as [number, number];
      const to = item.to as [number, number];
      const n = num(item.count, 8);
      const ang = Math.atan2(to[0] - from[0], to[1] - from[1]);
      const prints: THREE.BufferGeometry[] = [];
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const side = i % 2 ? 0.08 : -0.08;
        const fp = new THREE.CircleGeometry(0.06, 8).toNonIndexed();
        fp.scale(0.6, 1.6, 1);
        fp.rotateZ(-ang);
        fp.rotateX(-Math.PI / 2);
        fp.translate(
          from[0] + (to[0] - from[0]) * t + Math.cos(ang) * side,
          0.004,
          from[1] + (to[1] - from[1]) * t - Math.sin(ang) * side,
        );
        const a = 0.35 * (1 - t * 0.6);
        const count = fp.getAttribute("position").count;
        const rgba = new Float32Array(count * 4);
        for (let v = 0; v < count; v++) rgba[v * 4 + 3] = a;
        fp.setAttribute("color", new THREE.BufferAttribute(rgba, 4));
        prints.push(fp);
      }
      const merged = mergeGeometries(prints, false);
      for (const fp of prints) fp.dispose();
      if (merged) {
        const m = new THREE.Mesh(
          merged,
          new THREE.MeshStandardMaterial({
            color: "#ffffff",
            vertexColors: true,
            transparent: true,
            roughness: 0.05,
            depthWrite: false,
          }),
        );
        g.add(m);
      }
      break;
    }
    case "coats": {
      // Coats hanging on a stand: soft shapes in their colours.
      const colors = (item.colors as string[]) ?? ["#333"];
      colors.forEach((c, i) => {
        const a = (i / colors.length) * Math.PI * 2;
        const coat = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.16, 0.75, 4, 10),
          mat(c),
        );
        coat.scale.set(1, 1, 0.55);
        coat.position.set(Math.cos(a) * 0.17, 1.15, Math.sin(a) * 0.17);
        coat.rotation.y = -a;
        coat.castShadow = true;
        g.add(coat);
      });
      break;
    }
    case "puddle": {
      // r22: it grows while it rains and shrinks after, and the rain rings
      // it (Weather.ts).
      const [w, d] = (item.size as [number, number]) ?? [1.5, 1];
      const p = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        puddleMaterial(num(item.seed, w * 7 + d * 3)),
      );
      p.scale.set(w * 1.15, d * 1.15, 1);
      p.rotation.x = -Math.PI / 2;
      p.position.y = 0.006;
      p.renderOrder = 1;
      p.userData.puddle = true;
      g.add(p);
      break;
    }
    case "glow": {
      // A soft patch of light (a window's spill on the floor).
      const [w, d] = (item.size as [number, number]) ?? [2, 1];
      glowTex ??= sharedTex(glowTexture());
      const p = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshBasicMaterial({
          map: glowTex,
          color: new THREE.Color(str(item.color, "#ffb060")).multiplyScalar(
            num(item.k, 0.4),
          ),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      p.rotation.x = -Math.PI / 2;
      p.position.y = 0.01;
      g.add(p);
      break;
    }
    case "streak": {
      const s = streak(
        str(item.color, "#ffb060"),
        num(item.w, 0.8),
        num(item.len, 3),
        num(item.k, 0.5),
      );
      s.position.y = 0.02;
      g.add(s);
      break;
    }
    case "skyline": {
      // A city at night, far off: rooftops against low cloud lit from
      // underneath. `horizon` is where the rooftops stand, as a share of
      // the height from the top.
      const [w, h] = (item.size as [number, number]) ?? [30, 8];
      const tex = new THREE.CanvasTexture(
        skylineCanvas(
          num(item.horizon, 0.6),
          num(item.tower, 0.3),
          num(item.towerAt, 0.42),
        ),
      );
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: tex, fog: false }),
      );
      m.position.y = h / 2;
      g.add(m);
      break;
    }
    case "curtain": {
      const [w, h] = (item.size as [number, number]) ?? [1, 3];
      const geo = new THREE.PlaneGeometry(w, h, 24, 1);
      const p = geo.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        p.setZ(i, Math.sin(p.getX(i) * 22) * 0.04);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: str(item.color, "#3a0f12"),
          roughness: 0.85,
          side: THREE.DoubleSide,
        }),
      );
      m.position.y = h / 2;
      m.castShadow = true;
      g.add(m);
      break;
    }
    default:
      bplaySmall(item, g);
      break;
  }
  return { object: g, lights: [], lamps: [] };
}

/**
 * BPLAY (r22): the small things' paint. A plain colour goes into the
 * shape's vertices and the shape takes one of two shared materials (matte
 * or metal), so every small thing in a place, whatever its colours, is
 * merged into a draw or two instead of one per colour.
 */
function propMaterial(metal: boolean): THREE.MeshStandardMaterial {
  const key = metal ? "props:metal" : "props:matte";
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial(
      metal
        ? { vertexColors: true, roughness: 0.3, metalness: 1 }
        : { vertexColors: true, roughness: 0.72, metalness: 0 },
    );
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return m;
}

/**
 * A mesh, placed. A plain shared colour (from `mat`) is painted into the
 * shape (see `propMaterial`) and the piece casts a shadow like the rest, so
 * they all merge; anything else (a texture, glass, a glow) keeps its own
 * material and `shadow`.
 */
export function part(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  shadow = true,
): THREE.Mesh {
  const s = material as THREE.MeshStandardMaterial;
  let use: THREE.Material = material;
  let cast = shadow;
  if (
    s.isMeshStandardMaterial &&
    s.userData.shared &&
    !s.map &&
    !s.transparent &&
    !s.vertexColors
  ) {
    const n = geo.getAttribute("position").count;
    const rgb = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      rgb[i * 3] = s.color.r;
      rgb[i * 3 + 1] = s.color.g;
      rgb[i * 3 + 2] = s.color.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
    use = propMaterial(s.metalness >= 0.9);
    cast = true;
  }
  const m = new THREE.Mesh(geo, use);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

/**
 * BPLAY (r22): the small things worth a look in the street, the bar and the
 * lobby. Each is a few simple shapes in shared materials, so the place's
 * static merge draws them with what's already there. Words on them (a
 * chalkboard's, a sign's) come from the place's data.
 */
function bplaySmall(item: Item, g: THREE.Group): void {
  const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const C = (rt: number, rb: number, h: number, n = 12) =>
    new THREE.CylinderGeometry(rt, rb, h, n);
  switch (item.kind) {
    case "kiosk": {
      // A Paris newspaper kiosk, shuttered for the night.
      const green = mat(str(item.color, "#1d3328"));
      g.add(part(B(1.8, 2.1, 1.2), green, 0, 1.05, 0));
      g.add(part(B(2.1, 0.12, 1.5), green, 0, 2.16, 0));
      g.add(
        part(
          new THREE.SphereGeometry(0.42, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
          green,
          0,
          2.2,
          0,
        ),
      );
      g.add(part(B(1.5, 1.2, 0.04), mat("#3c4a40"), 0, 1.15, 0.62, false));
      g.add(part(B(1.6, 0.06, 0.06), mat("brass"), 0, 1.78, 0.62, false));
      break;
    }
    case "moped": {
      const body = mat(str(item.color, "#6f6a5e"));
      const tyre = mat("black");
      for (const x of [-0.58, 0.58]) {
        const w = part(
          new THREE.TorusGeometry(0.2, 0.06, 8, 16),
          tyre,
          x,
          0.26,
          0,
        );
        g.add(w);
      }
      g.add(part(B(0.9, 0.3, 0.34), body, 0.02, 0.5, 0));
      g.add(part(B(0.5, 0.1, 0.3), mat("leather_dark"), 0.18, 0.72, 0));
      g.add(part(B(0.12, 0.62, 0.14), body, -0.52, 0.66, 0));
      g.add(
        part(C(0.02, 0.02, 0.62, 6), mat("chrome"), -0.55, 1.0, 0).rotateX(
          Math.PI / 2,
        ),
      );
      g.add(part(B(0.22, 0.2, 0.3), body, 0.5, 0.62, 0));
      break;
    }
    case "aframe": {
      // A café's chalkboard on the pavement, the day's words in chalk.
      const [w, h] = (item.size as [number, number]) ?? [0.6, 0.9];
      const board = textTexture({
        text: str(item.text, ""),
        sub: typeof item.sub === "string" ? item.sub : undefined,
        w,
        h,
        bg: "#1b2022",
        fg: "#e6e2d6",
        font: "Georgia, serif",
        italic: true,
        border: "#6a4a2c",
      });
      const face = new THREE.MeshStandardMaterial({
        map: board,
        roughness: 0.9,
      });
      for (const s of [1, -1]) {
        const p = part(
          B(w, h, 0.03),
          [
            mat("oak_dark"),
            mat("oak_dark"),
            mat("oak_dark"),
            mat("oak_dark"),
            face,
            mat("oak_dark"),
          ] as unknown as THREE.Material,
          0,
          h / 2 - 0.02,
          s * 0.14,
        );
        p.rotation.x = s * 0.16;
        p.rotation.y = s > 0 ? 0 : Math.PI;
        g.add(p);
      }
      break;
    }
    case "bollard":
      g.add(part(C(0.07, 0.08, 0.9, 10), mat("iron"), 0, 0.45, 0));
      g.add(
        part(new THREE.SphereGeometry(0.075, 10, 6), mat("iron"), 0, 0.9, 0),
      );
      break;
    case "mitten": {
      const red = mat("#a3201b");
      const m = part(
        new THREE.CapsuleGeometry(0.035, 0.07, 4, 8),
        red,
        0,
        0,
        0,
      );
      m.rotation.z = 0.5;
      g.add(m, part(new THREE.SphereGeometry(0.02, 6, 4), red, 0.04, 0.03, 0));
      break;
    }
    case "grate": {
      g.add(part(B(0.7, 0.02, 0.4), mat("iron"), 0, 0.01, 0, false));
      for (let i = -3; i <= 3; i++) {
        g.add(
          part(B(0.04, 0.025, 0.36), mat("#08090a"), i * 0.09, 0.012, 0, false),
        );
      }
      break;
    }
    case "bowl":
      g.add(part(C(0.12, 0.09, 0.07, 14), mat("chrome"), 0, 0.035, 0));
      g.add(part(C(0.105, 0.105, 0.01, 14), mat("#2a3a44"), 0, 0.06, 0, false));
      break;
    case "postbox":
      g.add(part(C(0.04, 0.04, 0.8, 8), mat("iron"), 0, 0.4, 0));
      g.add(
        part(B(0.42, 0.5, 0.3), mat(str(item.color, "#c99a1e")), 0, 1.05, 0),
      );
      g.add(part(B(0.3, 0.03, 0.02), mat("black"), 0, 1.2, 0.16, false));
      break;
    case "litter":
      // Cigarette ends, ground out where a man stood.
      for (let i = 0; i < 9; i++) {
        const a = i * 2.39;
        const r = 0.05 + (i % 3) * 0.06;
        const m = part(
          C(0.006, 0.006, 0.035, 5),
          mat(i % 3 ? "#d8d2c4" : "#b28a52"),
          Math.cos(a) * r,
          0.006,
          Math.sin(a) * r,
          false,
        );
        m.rotation.set(Math.PI / 2, 0, a);
        g.add(m);
      }
      break;
    case "jar": {
      const glass = new THREE.MeshStandardMaterial({
        color: "#cfe0e8",
        roughness: 0.05,
        transparent: true,
        opacity: 0.32,
      });
      g.add(part(C(0.06, 0.055, 0.16, 14), glass, 0, 0.08, 0, false));
      g.add(part(C(0.05, 0.05, 0.03, 10), mat("brass"), 0, 0.02, 0, false));
      break;
    }
    case "matchbowl":
      g.add(part(C(0.08, 0.05, 0.04, 14), mat("brass"), 0, 0.02, 0));
      for (let i = 0; i < 4; i++) {
        const m = part(
          B(0.045, 0.008, 0.03),
          mat("#5b1b16"),
          (i - 1.5) * 0.025,
          0.045,
          (i % 2) * 0.012,
          false,
        );
        m.rotation.y = i * 0.7;
        g.add(m);
      }
      break;
    case "frame": {
      // A framed photograph on a wall: sepia, the bar as it was.
      const [w, h] = (item.size as [number, number]) ?? [0.5, 0.38];
      g.add(part(B(w + 0.08, h + 0.08, 0.03), mat("oak_dark"), 0, 0, 0, false));
      g.add(part(B(w, h, 0.01), mat("#8a7458"), 0, 0, 0.018, false));
      g.add(
        part(
          B(w * 0.8, h * 0.18, 0.012),
          mat("#4a3a2a"),
          0,
          -h * 0.2,
          0.02,
          false,
        ),
      );
      break;
    }
    case "standjar":
      g.add(part(C(0.13, 0.11, 0.55, 14), mat("brass"), 0, 0.275, 0));
      for (const [x, z, t] of [
        [0.04, 0.02, 0.1],
        [-0.04, -0.03, -0.12],
      ]) {
        const u = part(C(0.025, 0.01, 0.85, 8), mat("#0c0c0e"), x, 0.5, z);
        u.rotation.z = t;
        g.add(u);
      }
      break;
    case "keyboard": {
      // Pigeonholes and hooks behind a porter's desk.
      g.add(part(B(0.9, 0.7, 0.06), mat("oak_dark"), 0, 0, 0, false));
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 6; c++) {
          if (r === 1 && c === 4) continue; // the one that's missing
          g.add(
            part(
              B(0.03, 0.08, 0.02),
              mat("brass"),
              -0.36 + c * 0.145,
              0.25 - r * 0.16,
              0.04,
              false,
            ),
          );
        }
      }
      break;
    }
    case "machine": {
      g.add(
        part(B(0.62, 1.7, 0.5), mat(str(item.color, "#5a1e1a")), 0, 0.85, 0),
      );
      g.add(
        part(B(0.5, 0.5, 0.02), emissive("#e0b070", 0.55), 0, 1.3, 0.26, false),
      );
      for (let i = 0; i < 6; i++) {
        g.add(
          part(
            B(0.06, 0.04, 0.03),
            mat("chrome"),
            -0.18 + (i % 3) * 0.18,
            0.8 - Math.floor(i / 3) * 0.12,
            0.26,
            false,
          ),
        );
      }
      break;
    }
    case "liftdoor": {
      g.add(part(B(1.3, 2.3, 0.06), mat("brass"), 0, 1.15, 0, false));
      g.add(part(B(1.1, 2.1, 0.03), mat("#2b2a26"), 0, 1.05, 0.03, false));
      g.add(part(B(0.01, 2.1, 0.035), mat("brass"), 0, 1.05, 0.04, false));
      break;
    }
    case "vase": {
      g.add(part(C(0.06, 0.08, 0.3, 12), mat("#2d3b46"), 0, 0.15, 0));
      for (let i = 0; i < 5; i++) {
        const a = i * 1.25;
        const st = part(
          C(0.006, 0.006, 0.35, 4),
          mat("#3d5a2e"),
          Math.cos(a) * 0.04,
          0.45,
          Math.sin(a) * 0.04,
          false,
        );
        st.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
        g.add(st);
        g.add(
          part(
            new THREE.ConeGeometry(0.035, 0.07, 6),
            mat(i % 2 ? "#d8cfb2" : "#a8916a"),
            Math.cos(a) * 0.1,
            0.64,
            Math.sin(a) * 0.1,
            false,
          ),
        );
      }
      break;
    }
    case "clock": {
      const face = part(
        C(0.18, 0.18, 0.03, 20),
        mat("#e6dfcd"),
        0,
        0,
        0,
        false,
      );
      face.rotation.x = Math.PI / 2;
      const rim = part(
        new THREE.TorusGeometry(0.18, 0.015, 6, 20),
        mat("brass"),
        0,
        0,
        0.01,
        false,
      );
      const h1 = part(
        B(0.012, 0.1, 0.005),
        mat("black"),
        0.02,
        0.04,
        0.02,
        false,
      );
      h1.rotation.z = -0.5;
      const h2 = part(
        B(0.008, 0.14, 0.005),
        mat("black"),
        -0.03,
        0.05,
        0.022,
        false,
      );
      h2.rotation.z = 0.6;
      g.add(face, rim, h1, h2);
      break;
    }
    case "book":
      g.add(
        part(
          B(0.11, 0.025, 0.17),
          mat(str(item.color, "#7a2e22")),
          0,
          0.013,
          0,
          false,
        ),
      );
      break;
    case "bell":
      g.add(
        part(
          new THREE.SphereGeometry(
            0.045,
            12,
            6,
            0,
            Math.PI * 2,
            0,
            Math.PI / 2,
          ),
          mat("brass"),
          0,
          0.01,
          0,
          false,
        ),
      );
      g.add(part(C(0.055, 0.055, 0.012, 12), mat("black"), 0, 0.006, 0, false));
      break;
    case "tray": {
      // Something flat on the ground or a counter: a crate, a box of things.
      const [w, h, d] = (item.size as [number, number, number]) ?? [
        0.5, 0.3, 0.38,
      ];
      g.add(part(B(w, h, d), mat(str(item.color, "#6b5539")), 0, h / 2, 0));
      break;
    }
    case "radio": {
      // A wooden wireless on the back bar, a cloth grille and a dial.
      g.add(part(B(0.34, 0.2, 0.13), mat("#4a2c1a"), 0, 0.1, 0));
      g.add(part(B(0.17, 0.13, 0.01), mat("#3a3328"), -0.06, 0.1, 0.066));
      const dial = part(
        C(0.035, 0.035, 0.01, 14),
        mat("#d9c9a0"),
        0.1,
        0.12,
        0.066,
      );
      dial.rotation.x = Math.PI / 2;
      g.add(dial);
      for (const x of [0.07, 0.13]) {
        const k = part(C(0.012, 0.012, 0.02, 8), mat("black"), x, 0.045, 0.07);
        k.rotation.x = Math.PI / 2;
        g.add(k);
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Restyled materials, shared by every copy of a model with the same styling
 * (r22: eleven stools are one material, and the world draws them as one).
 */
const swapCache = new Map<string, THREE.Material>();

/**
 * A model's material, restyled for the night. BFIX (r23): the props modelled
 * in Fusion name their materials (leather, brass, glass...) and take the
 * palette's (Palette.ts), recoloured if the place says so (`mats`, or
 * `tint` for a car's paint); Kenney's few that are left are darkened as
 * before.
 */
function restyle(
  old: THREE.Material,
  recolor: Record<string, string>,
  tint: string | null,
): THREE.Material {
  const name = paletteName(old.name);
  if (name) {
    const want = recolor[name] ?? (name === "paint" ? tint : null);
    if (!want) return paletteMaterial(name);
    if (PALETTE[want]) return paletteMaterial(want);
    // A named colour ("oak_dark") or a CSS one, in this material's finish.
    return paletteMaterial(name, COLORS[want]?.color ?? want);
  }
  const want = recolor[old.name];
  if (want) return mat(want);
  const t = tint ? new THREE.Color(tint) : null;
  const key = `${old.uuid}|${t?.getHexString() ?? ""}`;
  const hit = swapCache.get(key);
  if (hit) return hit;
  const o2 = old as THREE.MeshStandardMaterial;
  let n: THREE.MeshStandardMaterial;
  if (o2.map) {
    n = new THREE.MeshStandardMaterial({
      map: o2.map,
      roughness: 0.45,
      metalness: 0.2,
      color: t ?? new THREE.Color("#ffffff"),
    });
  } else {
    // Kenney's flat colours, darkened and given a little gloss.
    const c = (o2.color ?? new THREE.Color("#888"))
      .clone()
      .multiplyScalar(0.55);
    n = new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
  }
  n.userData.shared = true;
  if (n.map) n.map.userData.shared = true;
  swapCache.set(key, n);
  return n;
}

/** A copy of a props model, every mesh restyled, casting shadows. */
function styled(src: THREE.Object3D, item: Item): THREE.Object3D {
  const o = src.clone(true);
  const recolor = (item.mats ?? {}) as Record<string, string>;
  const tint = typeof item.tint === "string" ? item.tint : null;
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = item.shadow !== false;
    m.receiveShadow = true;
    m.material = Array.isArray(m.material)
      ? m.material.map((y) => restyle(y, recolor, tint))
      : restyle(m.material, recolor, tint);
  });
  return o;
}

/**
 * A props model, stood on the floor and centred. BFIX (r23): the Fusion
 * props are made to size (metres), so they're drawn as they are unless the
 * place gives a `height` (or a `scale`); Kenney's are scaled to `height`.
 */
function model(item: Item, k: KitContext): Built {
  const src = k.models.get(str(item.model, ""));
  if (!src) return { object: new THREE.Group(), lights: [], lamps: [] };
  const o = styled(src, item);
  const bbox = new THREE.Box3().setFromObject(o);
  const size = bbox.getSize(new THREE.Vector3());
  const want = num(item.height, 0);
  const sc = want > 0 && size.y > 0 ? want / size.y : num(item.scale, 1);
  o.scale.multiplyScalar(sc);
  // Stand it on the floor, centred.
  const c2 = bbox.getCenter(new THREE.Vector3()).multiplyScalar(sc);
  o.position.set(-c2.x, -bbox.min.y * sc, -c2.z);
  const g = new THREE.Group();
  g.add(o);
  return { object: g, lights: [], lamps: [] };
}

/**
 * BFIX (r23): a Morris column (the Fusion model), its band pasted with the
 * place's posters, layer over layer (`posters`, oldest first: each a
 * `text`, a `seed`, and `style` "face" for the party's poster or "bill" for
 * words alone, with `sub`). Without the model, a plain drum.
 */
function morris(item: Item, k: KitContext): Built {
  const src = k.models.get("morrisColumn");
  const posters = Array.isArray(item.posters)
    ? (item.posters as MorrisPoster[])
    : [];
  const tex = morrisTexture(posters, num(item.seed, 1));
  const band = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.75,
    metalness: 0,
  });
  band.name = "poster";
  const g = new THREE.Group();
  if (!src) {
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 2.4, 24, 1, true),
      band,
    );
    drum.position.y = 1.5;
    g.add(drum);
    return { object: g, lights: [], lamps: [] };
  }
  const o = styled(src, item);
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.isMesh && (m.material as THREE.Material).name === "poster") {
      m.material = band;
    }
  });
  g.add(o);
  return { object: g, lights: [], lamps: [] };
}

/** Builds one piece of a place. */
export function buildItem(item: Item, k: KitContext): Built {
  let b: Built;
  switch (item.kind) {
    case "floor":
      b = floor(item, k);
      break;
    case "box":
      b = solid(item, k);
      break;
    case "wall":
      b = wall(item, k);
      break;
    case "bar":
      b = bar(item);
      break;
    case "backbar":
      b = backbar(item, k);
      break;
    case "mirror":
      b = mirror(item);
      break;
    case "tv":
      b = tv(item, k);
      break;
    case "pendant":
      b = pendant(item, k);
      break;
    case "lamp":
      b = lamp(item, k);
      break;
    case "lamppost":
      b = lamppost(item, k);
      break;
    case "facade":
      b = facade(item, k);
      break;
    case "shopfront":
      b = shopfront(item, k);
      break;
    case "sign":
      b = sign(item);
      break;
    case "poster":
      b = poster(item);
      break;
    case "model":
      b = model(item, k);
      break;
    case "morris":
      b = morris(item, k);
      break;
    default:
      // r25: the hotel's lobby and his room (Furnish.ts).
      if (FURNISHINGS.has(item.kind)) {
        b = furnish(item, k);
        break;
      }
      b = small(item);
  }
  // Walls place themselves from their endpoints.
  if (item.kind !== "wall") {
    const [x, y, z] = item.at;
    b.object.position.set(x, y, z);
    b.object.rotation.y = THREE.MathUtils.degToRad(item.rot ?? 0);
  }
  if (item.id) {
    b.object.name = item.id;
    // r22: a prop the story shows and hides stays a piece of its own.
    b.object.userData.keep = true;
  }
  b.object.visible = item.hidden !== true;
  return b;
}
