// DLC (r21): the map styles of the Derp Store (Antique Engraving, Hard
// Winter, By Candlelight, Pirate Chart, Woodcut). A style only changes how
// the chart is drawn, never what's on it, and only for the player who owns
// it and chose it (MapStylePref.ts). Everything here is painted into the
// map's cached chart when it's redrawn (MapView.renderBase), never every
// frame: a few full-chart blends, a pattern or two, and the night's lamps
// from one small glow drawn once. The edges (a burned chart, a vignette) are
// CSS on the map's frame, so they cost the canvas nothing.

import {
  MAP_STYLE_PALETTES,
  type MapStyleKey,
  type MapStylePalette,
} from "../DlcIds";
import { coffeeRing, compassRose } from "./MapArt";

type C = CanvasRenderingContext2D;

export interface MapLook {
  key: MapStyleKey;
  pal: MapStylePalette;
  seaTop: string;
  seaBottom: string;
  /** The usual swell's strength (0.16 on the usual chart). */
  swell: number;
  /** The paper's grain and the lie of the land, against the usual. */
  paper: number;
  terrain: number;
  /** Hard Winter: January's snow and ice, whatever the month. */
  winter: boolean;
  coastInk: string;
  coastWidth: number;
  borderInk: string;
  nationInk: string;
  nationWidth: number;
  riverInk: string;
  nameInk: string;
  nameItalic: boolean;
  landLabel: string;
  seaLabel: string;
}

const P = MAP_STYLE_PALETTES;

const LOOKS: Record<MapStyleKey, MapLook> = {
  antique: {
    key: "antique",
    pal: P.antique,
    seaTop: "#d6c49c",
    seaBottom: P.antique.sea,
    swell: 0,
    paper: 1.3,
    terrain: 0.9,
    winter: false,
    coastInk: "rgba(74,53,32,0.95)",
    coastWidth: 1.4,
    borderInk: "rgba(74,53,32,0.3)",
    nationInk: "rgba(168,87,58,0.85)",
    nationWidth: 2.2,
    riverInk: "rgba(74,53,32,0.55)",
    nameInk: "rgba(60,42,24,0.92)",
    nameItalic: true,
    landLabel: "rgba(74,53,32,0.6)",
    seaLabel: "rgba(74,53,32,0.5)",
  },
  winter: {
    key: "winter",
    pal: P.winter,
    seaTop: "#6e8798",
    seaBottom: "#4b6373",
    swell: 0.1,
    paper: 0.7,
    terrain: 0.6,
    winter: true,
    coastInk: "rgba(28,40,50,0.9)",
    coastWidth: 1.2,
    borderInk: "rgba(44,58,68,0.25)",
    nationInk: "rgba(44,58,68,0.75)",
    nationWidth: 1.9,
    riverInk: "rgba(232,242,248,0.95)",
    nameInk: "rgba(30,40,48,0.88)",
    nameItalic: false,
    landLabel: "rgba(44,58,68,0.55)",
    seaLabel: "rgba(235,242,246,0.55)",
  },
  night: {
    key: "night",
    pal: P.night,
    seaTop: "#14253c",
    seaBottom: "#08111d",
    swell: 0.07,
    paper: 0.4,
    terrain: 0.5,
    winter: false,
    coastInk: "rgba(231,198,106,0.6)",
    coastWidth: 1.1,
    borderInk: "rgba(231,198,106,0.16)",
    nationInk: "rgba(231,198,106,0.75)",
    nationWidth: 1.6,
    riverInk: "rgba(120,150,190,0.55)",
    nameInk: "rgba(240,210,130,0.95)",
    nameItalic: false,
    landLabel: "rgba(231,198,106,0.5)",
    seaLabel: "rgba(231,198,106,0.4)",
  },
  pirate: {
    key: "pirate",
    pal: P.pirate,
    seaTop: "#d5c18e",
    seaBottom: "#b99f63",
    swell: 0,
    paper: 1.5,
    terrain: 0.75,
    winter: false,
    coastInk: "rgba(90,46,20,0.95)",
    coastWidth: 1.5,
    borderInk: "rgba(90,46,20,0.25)",
    nationInk: "rgba(168,38,28,0.88)",
    nationWidth: 1.9,
    riverInk: "rgba(90,46,20,0.5)",
    nameInk: "rgba(80,40,16,0.92)",
    nameItalic: true,
    landLabel: "rgba(90,46,20,0.6)",
    seaLabel: "rgba(90,46,20,0.55)",
  },
  woodcut: {
    key: "woodcut",
    pal: P.woodcut,
    seaTop: "#efe8d6",
    seaBottom: "#ded3b6",
    swell: 0,
    paper: 0,
    terrain: 0,
    winter: false,
    coastInk: "#141210",
    coastWidth: 2.6,
    borderInk: "rgba(20,18,16,0.5)",
    nationInk: "#141210",
    nationWidth: 3,
    riverInk: "rgba(20,18,16,0.75)",
    nameInk: "#141210",
    nameItalic: false,
    landLabel: "rgba(20,18,16,0.7)",
    seaLabel: "rgba(20,18,16,0.6)",
  },
};

/** The look of a style, or null for the usual chart. */
export function lookOf(key: MapStyleKey | null): MapLook | null {
  return key ? LOOKS[key] : null;
}

// ---------------------------------------------------------------- small tiles, made once

const tiles = new Map<string, HTMLCanvasElement>();

function tile(
  key: string,
  w: number,
  h: number,
  draw: (c: C) => void,
): HTMLCanvasElement {
  let t = tiles.get(key);
  if (!t) {
    t = document.createElement("canvas");
    t.width = w;
    t.height = h;
    const c = t.getContext("2d");
    if (c) draw(c);
    tiles.set(key, t);
  }
  return t;
}

/** The engraver's lines across the sea. */
function engraving(): HTMLCanvasElement {
  return tile("engrave", 8, 4, (c) => {
    c.fillStyle = "rgba(74,53,32,0.26)";
    c.fillRect(0, 0, 8, 0.8);
  });
}

/** A woodcutter's waves. */
function woodWaves(): HTMLCanvasElement {
  return tile("waves", 30, 16, (c) => {
    c.strokeStyle = "rgba(20,18,16,0.55)";
    c.lineWidth = 1.6;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(2, 6);
    c.quadraticCurveTo(7, 1, 12, 6);
    c.moveTo(17, 14);
    c.quadraticCurveTo(22, 9, 27, 14);
    c.stroke();
  });
}

/** A town's lamplight, as one soft glow to stamp. */
function glow(): HTMLCanvasElement {
  return tile("glow", 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,214,140,0.95)");
    g.addColorStop(0.25, "rgba(243,176,74,0.55)");
    g.addColorStop(1, "rgba(243,176,74,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
}

function fillPattern(
  c: C,
  img: HTMLCanvasElement,
  tx: number,
  ty: number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const pat = c.createPattern(img, "repeat");
  if (!pat) return;
  pat.setTransform(new DOMMatrix().translateSelf(tx, ty));
  c.fillStyle = pat;
  c.fillRect(x, y, w, h);
}

/** A steady scatter of points over the map (the same every time it's drawn). */
const scatters = new Map<string, Float32Array>();
function scatter(key: string, n: number, W: number, H: number): Float32Array {
  const k = `${key}:${n}:${W}:${H}`;
  let pts = scatters.get(k);
  if (!pts) {
    pts = new Float32Array(n * 3);
    let a = 0x9e3779b9 ^ n;
    const next = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < n; i++) {
      pts[i * 3] = next() * W;
      pts[i * 3 + 1] = next() * H;
      pts[i * 3 + 2] = next();
    }
    scatters.set(k, pts);
  }
  return pts;
}

export interface ChartView {
  tx: number;
  ty: number;
  scale: number;
}

/** The screen area the chart covers (css px, from its margin). */
export interface ChartRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------- the sea (screen units, before the land)

/**
 * What the style lays on the sea before the land is drawn over it: the
 * engraver's lines, a woodcut's waves, the stars, the rhumb lines and the
 * serpent. Called with the screen transform; `toMap` switches to map units.
 */
export function paintSea(
  c: C,
  look: MapLook,
  v: ChartView,
  r: ChartRect,
  W: number,
  H: number,
  toMap: () => void,
  toScreen: () => void,
): void {
  switch (look.key) {
    case "antique":
      fillPattern(c, engraving(), v.tx, v.ty, r.x, r.y, r.w, r.h);
      return;
    case "woodcut":
      fillPattern(c, woodWaves(), v.tx, v.ty, r.x, r.y, r.w, r.h);
      return;
    case "night": {
      const pts = scatter("stars", 900, W, H);
      c.fillStyle = "rgba(255,244,214,0.85)";
      c.beginPath();
      for (let i = 0; i < pts.length; i += 3) {
        const x = pts[i] * v.scale + v.tx;
        const y = pts[i + 1] * v.scale + v.ty;
        if (x < r.x || y < r.y || x > r.x + r.w || y > r.y + r.h) continue;
        const rad = 0.4 + pts[i + 2] * 0.9;
        c.moveTo(x + rad, y);
        c.arc(x, y, rad, 0, Math.PI * 2);
      }
      c.fill();
      return;
    }
    case "pirate": {
      toMap();
      const cx = W * 0.88;
      const cy = H * 0.68;
      const len = Math.max(W, H) * 1.6;
      c.strokeStyle = "rgba(90,46,20,0.22)";
      c.lineWidth = 0.9 / v.scale;
      c.beginPath();
      for (let i = 0; i < 32; i++) {
        const a = (i * Math.PI) / 16;
        c.moveTo(cx, cy);
        c.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      }
      c.stroke();
      serpent(c, W * 0.8, H * 0.43, W * 0.035, v.scale);
      serpent(c, W * 0.6, H * 0.93, W * 0.028, v.scale);
      toScreen();
      return;
    }
    case "winter":
      return;
  }
}

/** A sea serpent, its coils above the waves (map units). */
function serpent(c: C, x: number, y: number, r: number, scale: number): void {
  c.save();
  c.translate(x, y);
  c.strokeStyle = "rgba(90,46,20,0.75)";
  c.fillStyle = "rgba(168,38,28,0.35)";
  c.lineWidth = Math.max(0.6, 1.4 / scale);
  c.lineCap = "round";
  // Three coils.
  for (let i = 0; i < 3; i++) {
    const cx = -r * 1.4 + i * r * 1.1;
    c.beginPath();
    c.arc(cx, 0, r * 0.42, Math.PI, 0);
    c.fill();
    c.stroke();
  }
  // The head, with its fin, and the tail.
  c.beginPath();
  c.moveTo(r * 1.5, 0);
  c.quadraticCurveTo(r * 1.65, -r * 0.9, r * 2.05, -r * 0.65);
  c.lineTo(r * 2.35, -r * 0.5);
  c.lineTo(r * 2.0, -r * 0.4);
  c.stroke();
  c.beginPath();
  c.moveTo(-r * 1.85, 0);
  c.quadraticCurveTo(-r * 2.2, -r * 0.6, -r * 2.5, -r * 0.2);
  c.stroke();
  // The waves it breaks.
  c.beginPath();
  for (let i = -2; i <= 2; i++) {
    c.moveTo(i * r * 0.9 - r * 0.3, r * 0.1);
    c.quadraticCurveTo(i * r * 0.9, -r * 0.05, i * r * 0.9 + r * 0.3, r * 0.1);
  }
  c.stroke();
  c.restore();
}

// ---------------------------------------------------------------- over the land (map units)

/**
 * Marks over the land and sea once both are drawn: a pirate chart's stains
 * and its own compass rose, a hard winter's falling snow.
 */
export function paintMarks(
  c: C,
  look: MapLook,
  v: ChartView,
  W: number,
  H: number,
): void {
  if (look.key === "pirate") {
    coffeeRing(c, W * 0.42, H * 0.22, 55);
    coffeeRing(c, W * 0.7, H * 0.86, 38);
    for (const [x, y, rr] of [
      [0.3, 0.55, 90],
      [0.62, 0.3, 70],
      [0.18, 0.3, 60],
    ] as const) {
      const g = c.createRadialGradient(W * x, H * y, 0, W * x, H * y, rr);
      g.addColorStop(0, "rgba(120,78,38,0.16)");
      g.addColorStop(0.7, "rgba(120,78,38,0.08)");
      g.addColorStop(1, "rgba(120,78,38,0)");
      c.fillStyle = g;
      c.fillRect(W * x - rr, H * y - rr, rr * 2, rr * 2);
    }
    compassRose(c, W * 0.12, H * 0.12, 26);
  } else if (look.key === "winter") {
    const pts = scatter("snow", 2600, W, H);
    c.fillStyle = "rgba(255,255,255,0.8)";
    c.beginPath();
    const k = 1 / v.scale;
    for (let i = 0; i < pts.length; i += 3) {
      const rad = (0.5 + pts[i + 2] * 1.1) * k;
      c.moveTo(pts[i] + rad, pts[i + 1]);
      c.arc(pts[i], pts[i + 1], rad, 0, Math.PI * 2);
    }
    c.fill();
  }
}

// ---------------------------------------------------------------- the whole chart (device px)

/**
 * The style's colour over the finished chart (before the towns and names
 * are put on it): a few blends of the whole cached canvas.
 */
export function gradeChart(c: C, look: MapLook, w: number, h: number): void {
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  const blend = (
    op: GlobalCompositeOperation,
    color: string,
    alpha: number,
  ) => {
    c.globalCompositeOperation = op;
    c.globalAlpha = alpha;
    c.fillStyle = color;
    c.fillRect(0, 0, w, h);
  };
  switch (look.key) {
    case "antique":
      blend("saturation", "#808080", 0.5);
      blend("multiply", look.pal.land, 1);
      break;
    case "winter":
      blend("saturation", "#808080", 0.45);
      blend("screen", "#dfe8ee", 0.22);
      break;
    case "night":
      blend("multiply", "#4e5878", 1);
      blend("multiply", "#8890a8", 0.6);
      break;
    case "pirate":
      blend("saturation", "#808080", 0.3);
      blend("multiply", "#e8d199", 0.9);
      break;
    case "woodcut":
      blend("saturation", "#808080", 0.55);
      blend("multiply", look.pal.land, 0.7);
      break;
  }
  c.restore();
}

/** By Candlelight: lamplight at each town (screen px; bigger for a big town). */
export function paintLamps(
  c: C,
  look: MapLook,
  towns: { x: number; y: number; big: boolean }[],
): void {
  if (look.key !== "night" || !towns.length) return;
  const img = glow();
  c.save();
  c.globalCompositeOperation = "lighter";
  for (const t of towns) {
    const r = t.big ? 22 : 13;
    c.drawImage(img, t.x - r, t.y - r, r * 2, r * 2);
  }
  c.restore();
}
